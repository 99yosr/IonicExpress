import { CommonModule, DatePipe } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  inject,
} from '@angular/core';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonSpinner,
  IonTitle,
  IonToggle,
  IonToolbar,
} from '@ionic/angular/standalone';
import type { ToggleCustomEvent } from '@ionic/angular';
import { Geolocation } from '@capacitor/geolocation';
import { ToastController } from '@ionic/angular';
import { Router } from '@angular/router';
import { AlertsService, Alert } from '../../services/alerts.service';
import { AuthService } from '../../services/auth.service';
import { SocketService } from '../../services/socket.service';

declare const L: any;

@Component({
  selector: 'app-responder',
  standalone: true,
  templateUrl: './responder.page.html',
  styleUrls: ['./responder.page.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonToggle,
    IonSpinner,
    IonIcon,
    CommonModule,
    DatePipe,
  ],
})
/**
 * Real-time dashboard for responders. Displays pending alerts on a Leaflet map,
 * allows responders to come online/offline, and keep their location synchronized.
 */
export class ResponderPage implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('mapRef', { static: false }) mapContainer?: ElementRef<HTMLDivElement>;

  alerts: Alert[] = [];
  loadingAlerts = false;
  acceptingId?: string;
  online = false;

  private readonly alertsApi = inject(AlertsService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toastCtrl = inject(ToastController);
  private readonly socket = inject(SocketService);
  private map?: any;
  private alertMarkers = new Map<string, any>();
  private responderMarker?: any;
  private locationWatchId?: string;

  /**
   * Socket listeners convert raw payloads into typed alerts.
   */
  private readonly handleNewAlert = (data: unknown) => this.handleIncomingAlert(data, true);
  private readonly handleBroadcastAlert = (data: unknown) => this.handleIncomingAlert(data, false);
  private readonly handleUpdatedAlert = (data: unknown) => {
    const alert = this.toAlert(data);
    if (alert) {
      this.processAlertUpdate(alert);
    }
  };

  /**
   * Establishes socket listeners when the component is created.
   */
  ngOnInit(): void {
    this.socket.connect();
    this.socket.on('newAlert', this.handleNewAlert);
    this.socket.on('alerts:new', this.handleBroadcastAlert);
    this.socket.on('alerts:updated', this.handleUpdatedAlert);
  }

  /**
   * After Ionic renders the view we can render the map, load alerts, and try to go online.
   */
  async ngAfterViewInit(): Promise<void> {
    await this.initMap();
    await this.loadAlerts();
    await this.goOnline();
  }

  /**
   * Removes listeners, stops geolocation and tears down Leaflet when leaving the page.
   */
  ngOnDestroy(): void {
    this.socket.off('newAlert', this.handleNewAlert);
    this.socket.off('alerts:new', this.handleBroadcastAlert);
    this.socket.off('alerts:updated', this.handleUpdatedAlert);
    if (this.online) {
      this.emitOffline();
    }
    this.stopLocationWatch();
    this.socket.disconnect();
    this.clearAlertMarkers();
    this.responderMarker?.remove();
    this.map?.remove();
  }

  /**
   * Called when the online toggle changes. It avoids duplicate transitions.
   */
  async toggleOnline(event: ToggleCustomEvent): Promise<void> {
    const { checked } = event.detail;
    if (checked === this.online) {
      return;
    }
    if (checked) {
      await this.goOnline();
    } else {
      await this.goOffline();
    }
  }

  /**
   * Attempts to accept an alert and updates the list accordingly.
   */
  async acceptAlert(alert: Alert): Promise<void> {
    if (!this.online) {
      this.presentToast('Go online before responding to alerts.', 'warning');
      return;
    }

    this.acceptingId = alert._id;
    try {
      const updated = await this.alertsApi.accept(alert._id);
      this.processAlertUpdate(updated);
      this.presentToast('Alert accepted. Let the reporter know you are coming!', 'success');
    } catch (error: any) {
      const message =
        error?.error?.message || 'Could not accept this alert. It may already be taken.';
      this.presentToast(message, 'danger');
    } finally {
      this.acceptingId = undefined;
    }
  }

  /**
   * Logs the responder out after notifying the backend that they are offline.
   */
  async logout(): Promise<void> {
    await this.goOffline(false);
    this.auth.logout();
    this.router.navigateByUrl('/auth/login', { replaceUrl: true });
  }

  /**
   * Gets the current position, registers the responder on the socket and starts tracking.
   */
  private async goOnline(): Promise<void> {
    if (this.online) {
      return;
    }

    const user = this.auth.currentUser();
    if (!user) {
      this.auth.logout();
      this.router.navigateByUrl('/auth/login', { replaceUrl: true });
      return;
    }

    try {
      const position = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 8000,
      });
      this.updateResponderLocation(position.coords.latitude, position.coords.longitude);
      this.socket.emit('registerResponder', {
        userId: user._id,
        coordinates: [position.coords.longitude, position.coords.latitude],
      });
      this.startLocationWatch(user._id);
      this.online = true;
      this.presentToast('You are now online and visible to nearby alerts.', 'success');
    } catch {
      this.presentToast('Location permission is required to go online.', 'danger');
      this.online = false;
    }
  }

  /**
   * Stops location tracking, removes the local marker and optionally shows a toast.
   */
  private async goOffline(showToast = true): Promise<void> {
    if (!this.online) {
      return;
    }
    this.emitOffline();
    await this.stopLocationWatch();
    this.responderMarker?.remove();
    this.responderMarker = undefined;
    this.online = false;
    if (showToast) {
      this.presentToast('You are offline. Toggle back on when ready.', 'medium');
    }
  }

  /**
   * Signals to the backend that the responder should be considered offline.
   */
  private emitOffline(): void {
    this.socket.emit('responderOffline', {});
  }

  /**
   * Starts a high-accuracy location watch so the responder icon follows the device.
   */
  private startLocationWatch(userId: string): void {
    if (this.locationWatchId) {
      return;
    }
    this.locationWatchId = Geolocation.watchPosition(
      { enableHighAccuracy: true },
      (position) => {
        if (!position?.coords) {
          return;
        }
        const { latitude, longitude } = position.coords;
        this.updateResponderLocation(latitude, longitude);
        this.socket.emit('updateLocation', {
          coordinates: [longitude, latitude],
          userId,
        });
      }
    ) as unknown as string;
  }

  /**
   * Stops the geolocation watch when the responder goes offline or leaves the page.
   */
  private async stopLocationWatch(): Promise<void> {
    if (this.locationWatchId) {
      await Geolocation.clearWatch({ id: this.locationWatchId });
      this.locationWatchId = undefined;
    }
  }

  /**
   * Initializes the Leaflet map once the view has rendered.
   */
  private async initMap(): Promise<void> {
    if (this.map || !this.mapContainer) {
      return;
    }
    if (typeof L === 'undefined') {
      return;
    }

    this.map = L.map(this.mapContainer.nativeElement, {
      zoomControl: true,
      attributionControl: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors',
    }).addTo(this.map);

    this.map.setView([36.8065, 10.1815], 12);
    setTimeout(() => this.map?.invalidateSize(), 200);
  }

  /**
   * Loads pending alerts for responders and draws the markers.
   */
  private async loadAlerts(): Promise<void> {
    this.loadingAlerts = true;
    try {
      this.alerts = await this.alertsApi.list({ status: 'pending' });
      this.refreshMarkers();
      this.fitMapToAlerts();
    } catch {
      this.alerts = [];
    } finally {
      this.loadingAlerts = false;
    }
  }

  /**
   * Clears existing markers and redraws them based on the latest alert array.
   */
  private refreshMarkers(): void {
    if (!this.map) {
      return;
    }
    this.alertMarkers.forEach((marker) => marker.remove());
    this.alertMarkers.clear();
    this.alerts.forEach((alert) => this.addOrUpdateMarker(alert));
  }

  /**
   * Ensures that each alert has an associated marker positioned at its coordinates.
   */
  private addOrUpdateMarker(alert: Alert): void {
    if (!this.map || !alert.location?.coordinates) {
      return;
    }
    const [lng, lat] = alert.location.coordinates;
    if (lat == null || lng == null) {
      return;
    }

    const existing = this.alertMarkers.get(alert._id);
    if (existing) {
      existing.setLatLng([lat, lng]);
      existing.setPopupContent(this.markerPopupContent(alert));
      return;
    }

    const marker = L.marker([lat, lng], {
      icon: L.icon({
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [0, -32],
      }),
    }).addTo(this.map);
    marker.bindPopup(this.markerPopupContent(alert));
    this.alertMarkers.set(alert._id, marker);
  }

  /**
   * Generates the message shown inside a marker popup.
   */
  private markerPopupContent(alert: Alert): string {
    const injured =
      alert.numInjured != null ? `<br/>Injured: ${alert.numInjured}` : '';
    return `<strong>${alert.type}</strong><br/>${alert.description}${injured}`;
  }

  /**
   * Creates or updates the green circle that represents the responder.
   */
  private updateResponderLocation(lat: number, lng: number): void {
    if (!this.map || Number.isNaN(lat) || Number.isNaN(lng)) {
      return;
    }
    if (!this.responderMarker) {
      this.responderMarker = L.circleMarker([lat, lng], {
        radius: 8,
        color: '#2dd36f',
        fillColor: '#2dd36f',
        fillOpacity: 0.9,
      }).addTo(this.map);
      this.responderMarker.bindPopup('You are here');
    } else {
      this.responderMarker.setLatLng([lat, lng]);
    }
    this.map.setView([lat, lng], Math.max(this.map.getZoom(), 13));
  }

  /**
   * Zooms the map so the responder can see the full cluster of pending alerts.
   */
  private fitMapToAlerts(): void {
    if (!this.map || !this.alerts.length || typeof L === 'undefined') {
      return;
    }
    const positions = this.alerts
      .filter((alert) => alert.location?.coordinates)
      .map((alert) => [alert.location.coordinates[1], alert.location.coordinates[0]]);

    if (positions.length) {
      const bounds = L.latLngBounds(positions);
      this.map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }
  }

  /**
   * Parses incoming socket payloads and updates the collection of alerts.
   */
  private handleIncomingAlert(data: unknown, notify: boolean): void {
    const alert = this.toAlert(data);
    if (alert) {
      this.upsertAlert(alert, notify);
    }
  }

  /**
   * Inserts or replaces alerts in the local array and keeps markers in sync.
   */
  private upsertAlert(alert: Alert, notify: boolean): void {
    if (alert.status !== 'pending') {
      this.removeAlert(alert._id);
      return;
    }
    const index = this.alerts.findIndex((item) => item._id === alert._id);
    if (index >= 0) {
      this.alerts[index] = alert;
    } else {
      this.alerts = [alert, ...this.alerts];
      if (notify) {
        this.presentToast('New alert nearby!', 'tertiary');
      }
    }
    this.addOrUpdateMarker(alert);
  }

  /**
   * Handles socket updates for accepted/resolved alerts.
   */
  private processAlertUpdate(alert: Alert): void {
    if (alert.status === 'pending') {
      this.upsertAlert(alert, false);
    } else {
      this.removeAlert(alert._id);
    }
  }

  /**
   * Removes an alert and its marker from the local state.
   */
  private removeAlert(id: string): void {
    const before = this.alerts.length;
    this.alerts = this.alerts.filter((alert) => alert._id !== id);
    const marker = this.alertMarkers.get(id);
    if (marker) {
      marker.remove();
      this.alertMarkers.delete(id);
    }
    if (before !== this.alerts.length) {
      this.fitMapToAlerts();
    }
  }

  /**
   * Clears every pending marker from the map.
   */
  private clearAlertMarkers(): void {
    this.alertMarkers.forEach((marker) => marker.remove());
    this.alertMarkers.clear();
  }

  /**
   * Convenience wrapper for presenting toasts with consistent config.
   */
  private async presentToast(
    message: string,
    color: 'success' | 'warning' | 'danger' | 'tertiary' | 'medium'
  ): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2500,
      color,
    });
    toast.present();
  }

  /**
   * Type guard that validates socket payloads before the rest of the code consumes them.
   */
  private toAlert(data: unknown): Alert | null {
    if (!data || typeof data !== 'object') {
      return null;
    }
    const candidate = data as Partial<Alert>;
    if (
      typeof candidate._id === 'string' &&
      typeof candidate.type === 'string' &&
      typeof candidate.description === 'string' &&
      candidate.location?.coordinates instanceof Array
    ) {
      return candidate as Alert;
    }
    return null;
  }
}
