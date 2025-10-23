import { CommonModule, DatePipe } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  inject,
} from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonFab,
  IonFabButton,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonRefresher,
  IonRefresherContent,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonText,
  IonTextarea,
  IonTitle,
  IonToolbar,
  IonBadge,
  IonChip,
  IonNote,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardContent,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  time,
  medkitOutline,
  chevronForward,
  notificationsOffOutline,
  refresh,
  warning,
  close,
  alertCircleOutline,
  camera,
  trashOutline,
  sendOutline,
  flameOutline,
  carOutline,
  warningOutline,
  logOutOutline,
} from 'ionicons/icons';
import { Geolocation } from '@capacitor/geolocation';
import type { RefresherCustomEvent } from '@ionic/angular';
import { ToastController } from '@ionic/angular';
import { AlertsService, Alert, AlertStatus } from '../../services/alerts.service';
import { AuthService } from '../../services/auth.service';

declare const L: any;

@Component({
  selector: 'app-alert-giver',
  standalone: true,
  templateUrl: './alert-giver.page.html',
  styleUrls: ['./alert-giver.page.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonContent,
    IonRefresher,
    IonRefresherContent,
    IonFab,
    IonFabButton,
    IonIcon,
    IonModal,
    IonList,
    IonItem,
    IonLabel,
    IonSelect,
    IonSelectOption,
    IonTextarea,
    IonText,
    IonInput,
    IonSpinner,
    IonBadge,
    IonChip,
    IonNote,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    ReactiveFormsModule,
    CommonModule,
    DatePipe,
  ],
})
export class AlertGiverPage implements AfterViewInit, OnDestroy {
  @ViewChild('mapRef', { static: false }) mapContainer?: ElementRef<HTMLDivElement>;

  alerts: Alert[] = [];
  loadingAlerts = false;

  private readonly alertsApi = inject(AlertsService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toastCtrl = inject(ToastController);

  private currentPositionMarker: any;
  private currentPosition: { lat: number; lng: number } | null = null;

  private newAlertToFocus: Alert | null = null;

  private map?: any;
  private markers: any[] = [];
  private markersById: Record<string, any> = {};

  constructor() {
    addIcons({
      time,
      medkitOutline,
      chevronForward,
      notificationsOffOutline,
      refresh,
      warning,
      close,
      alertCircleOutline,
      camera,
      trashOutline,
      sendOutline,
      flameOutline,
      carOutline,
      warningOutline,
      logOutOutline,
    });
  }

  // refresh when page becomes active again
  async ionViewWillEnter(): Promise<void> {
    await this.checkForNewAlertInRouterState();
    await this.loadAlertsAndFocus();
    await this.maybeShowAlertCreationToast();
  }

  getStatusColor(status: AlertStatus): string {
    switch (status) {
      case 'accepted':
        return 'success';
      case 'pending':
        return 'warning';
      case 'resolved':
        return 'primary';
      default:
        return 'medium';
    }
  }

  viewAlertDetails(alert: Alert): void {
    console.log('View alert details:', alert);
  }

  async ngAfterViewInit(): Promise<void> {
    await this.initMap();
    await this.checkForNewAlertInRouterState();
    await this.loadAlertsAndFocus();
    await this.maybeShowAlertCreationToast();
  }

  private async checkForNewAlertInRouterState(): Promise<void> {
    const state = (window.history.state ?? {}) as {
      alertCreated?: { nearby: number; newAlert?: Alert };
    };
    if (state.alertCreated?.newAlert) {
      this.newAlertToFocus = state.alertCreated.newAlert;
    }
  }

  private async loadAlertsAndFocus(): Promise<void> {
    this.loading = true;
    try {
      const fetched = await this.alertsApi.list({}); // fetch latest
      if (this.newAlertToFocus && !fetched.some(a => a._id === this.newAlertToFocus!._id)) {
        this.alerts = [this.newAlertToFocus, ...fetched];
      } else {
        this.alerts = fetched;
      }
      this.renderMarkers();
      if (this.newAlertToFocus) {
        this.focusOnAlert(this.newAlertToFocus);
        this.newAlertToFocus = null;
      }
    } catch (e) {
      console.error(e);
      this.alerts = [];
      this.clearMarkers();
    } finally {
      this.loading = false;
    }
  }

  private coordsToLatLng(coords?: number[]): { lat: number; lng: number } | null {
    if (!coords || coords.length !== 2) return null;
    const [a, b] = coords;
    if (Math.abs(a) >= 7 && Math.abs(a) <= 12 && Math.abs(b) >= 30 && Math.abs(b) <= 38) {
      return { lat: b, lng: a }; // [lng,lat]
    }
    if (Math.abs(a) >= 30 && Math.abs(a) <= 38 && Math.abs(b) >= 7 && Math.abs(b) <= 12) {
      return { lat: a, lng: b }; // [lat,lng]
    }
    return { lat: b, lng: a }; // default assume [lng,lat]
  }

  private focusOnAlert(alert: Alert): void {
    if (!this.map || !alert.location?.coordinates) return;
    const ll = this.coordsToLatLng(alert.location.coordinates);
    if (!ll) return;
    this.map.setView([ll.lat, ll.lng], 16);
    this.highlightMarkerById(alert._id);
  }

  private highlightMarkerById(id: string): void {
    const mk = this.markersById[id];
    if (mk) mk.openPopup();
  }

  private async initMap(): Promise<void> {
    if (this.map || !this.mapContainer) return;
    if (typeof L === 'undefined') {
      console.error('Leaflet not loaded');
      return;
    }
    const el = this.mapContainer.nativeElement;
    el.style.visibility = 'hidden';

    this.map = L.map(el, { zoomControl: true, attributionControl: true, preferCanvas: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors',
    }).addTo(this.map);
    this.map.setView([36.8065, 10.1815], 10);

    try {
      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 5000 });
      this.currentPosition = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      this.map.setView([this.currentPosition.lat, this.currentPosition.lng], 13);
      this.addCurrentPositionMarker();
    } catch {
      // keep default
    }

    setTimeout(() => {
      el.style.visibility = 'visible';
      this.map?.invalidateSize(true);
    }, 200);
  }

  private addCurrentPositionMarker(): void {
    if (!this.map || !this.currentPosition) return;
    if (this.currentPositionMarker) this.currentPositionMarker.remove();

    this.currentPositionMarker = L.circleMarker(
      [this.currentPosition.lat, this.currentPosition.lng],
      {
        radius: 8,
        fillColor: '#ff0000',
        color: '#ffffff',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.8,
        className: 'current-position-circle',
      }
    ).addTo(this.map);

    this.currentPositionMarker.setStyle({ className: 'current-position-circle pulse' });
    this.currentPositionMarker.bindPopup(`
      <div style="padding:8px;text-align:center">
        <strong>Your Current Position</strong><br/>
        <small>Lat: ${this.currentPosition.lat.toFixed(6)}<br/>
        Lng: ${this.currentPosition.lng.toFixed(6)}</small>
      </div>
    `);
  }

  ngOnDestroy(): void {
    this.clearMarkers();
    this.map?.remove();
  }

  async refresh(event?: RefresherCustomEvent): Promise<void> {
    await this.checkForNewAlertInRouterState();
    await this.loadAlertsAndFocus();
    if (event) event.detail.complete();
  }

  launchAlert(): void {
    this.router.navigateByUrl('/alerts/new');
  }

  logout(): void {
    this.auth.logout();
    this.router.navigateByUrl('/auth/login', { replaceUrl: true });
  }

  private renderMarkers(): void {
    if (!this.map) return;
    this.clearMarkers();

    const pts: [number, number][] = [];
    for (const a of this.alerts) {
      const ll = this.coordsToLatLng(a.location?.coordinates);
      if (!ll) continue;
      const icon = this.buildMarkerIcon(a.status);
      const mk = L.marker([ll.lat, ll.lng], icon ? { icon } : undefined).addTo(this.map);
      mk.bindPopup(this.markerPopupContent(a));
      this.markers.push(mk);
      this.markersById[a._id] = mk;
      pts.push([ll.lat, ll.lng]);
    }

    if (pts.length) {
      const b = L.latLngBounds(pts);
      this.map.fitBounds(b, { padding: [40, 40], maxZoom: 15 });
      setTimeout(() => this.map?.invalidateSize(true), 100);
    }
  }

  private clearMarkers(): void {
    this.markers.forEach(m => m.remove());
    this.markers = [];
    this.markersById = {};
  }

  private markerPopupContent(a: Alert): string {
    const injured = a.numInjured != null ? `<br/>Injured: ${a.numInjured}` : '';
    const status = this.formatStatus(a.status);
    return `
      <strong>${a.type}</strong><br/>
      ${a.description}${injured}<br/>
      Status: ${status}
      <span style="display:none">#${a._id}</span>
    `;
  }

  private buildMarkerIcon(status: AlertStatus): any | undefined {
    if (typeof L === 'undefined' || !L?.Icon) return undefined;
    const color = this.statusColor(status);
    return L.icon({
      iconUrl: this.getMarkerIconUrl(color),
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
      shadowSize: [41, 41],
    });
  }

  private getMarkerIconUrl(color: string): string {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" width="25" height="41">
        <path fill="${color}" d="M172.268 501.67C26.97 291.031 0 269.413 0 192 0 85.961 85.961 0 192 0s192 85.961 192 192c0 77.413-26.97 99.031-172.268 309.67-9.535 13.774-29.93 13.773-39.464 0z"/>
      </svg>
    `;
    return 'data:image/svg+xml;base64,' + btoa(svg);
  }

  private formatStatus(status: AlertStatus): string {
    if (status === 'accepted') return 'Help on the way';
    if (status === 'resolved') return 'Resolved';
    return 'Pending';
  }

  private statusColor(status: AlertStatus): string {
    switch (status) {
      case 'accepted':
        return '#16a34a';
      case 'resolved':
        return '#2563eb';
      default:
        return '#ea580c';
    }
  }

  // MISSING METHOD (now added)
  private async maybeShowAlertCreationToast(): Promise<void> {
    const state = (window.history.state ?? {}) as {
      alertCreated?: { nearby: number; newAlert?: Alert };
    };
    const info = state.alertCreated;
    if (!info) return;

    const toast = await this.toastCtrl.create({
      message: `Alert sent successfully. Nearby responders: ${info.nearby}`,
      duration: 2500,
      color: 'success',
    });
    await toast.present();

    const { alertCreated, ...rest } =
      (state as Record<string, unknown> & { alertCreated?: { nearby: number; newAlert?: Alert } });
    window.history.replaceState(rest, '', window.location.href);
  }

  // simple loading flag to keep spinner logic consistent
  private set loading(v: boolean) { this._loading = v; }
  private get loading(): boolean { return this._loading; }
  private _loading = false;
}
