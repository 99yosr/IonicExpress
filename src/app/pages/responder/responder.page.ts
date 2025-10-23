import { CommonModule, DatePipe } from '@angular/common';
import { ModalController } from '@ionic/angular';
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
  IonModal,
  IonSpinner,
  IonTitle,
  IonToggle,
  IonToolbar,
  IonSelect,
  IonSelectOption,
  IonInput,
  IonTextarea
} from '@ionic/angular/standalone';
import type { ToggleCustomEvent } from '@ionic/angular';
import { Geolocation } from '@capacitor/geolocation';
import { FormsModule } from '@angular/forms';
import { ToastController } from '@ionic/angular';
import { Router } from '@angular/router';
import { AlertsService, Alert, MissionRecord } from '../../services/alerts.service';
import { AuthService } from '../../services/auth.service';
import { SocketService } from '../../services/socket.service';
import 'leaflet-routing-machine';
import { CompleteReportModal } from '../../modals/complete-report.modal';

import jsPDF from 'jspdf';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

import { addIcons } from 'ionicons';
import { logOutOutline, location, navigate, checkmark, close, notificationsOffOutline } from 'ionicons/icons';
import { NotificationType, Haptics } from '@capacitor/haptics';
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
    IonModal,
    IonSelect,
    IonSelectOption,
    IonInput,
    IonTextarea,
    CommonModule,
    DatePipe,
    FormsModule,
  ],
  providers: [ModalController]
})
export class ResponderPage implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('mapRef', { static: false }) mapContainer?: ElementRef<HTMLDivElement>;

  alerts: Alert[] = [];
  loadingAlerts = false;
  acceptingId?: string;
  online = false;

  // Mission state
  currentMission: Alert | null = null;
  activeMission: MissionRecord | null = null;
  missionBusy = false;
  completeOpen = false;
  missionReport: {
    outcome: 'resolved' | 'not_found' | 'false_alarm' | 'other';
    notes: string;
    numInjured: number | null;
  } = { outcome: 'resolved', notes: '', numInjured: null };

  private readonly alertsApi = inject(AlertsService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toastCtrl = inject(ToastController);
  private readonly socket = inject(SocketService);
  private readonly modalCtrl = inject(ModalController)

  private map?: any;
  private alertMarkers = new Map<string, any>();
  private responderMarker?: any;
  private locationWatchId?: string;

  // Routing
  private routingControl?: any;
  private destinationMarker?: any;
  private destLatLng?: { lat: number; lng: number };

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

  constructor() {
    addIcons({ 
      logOutOutline, 
      location, 
      navigate, 
      checkmark, 
      close, 
      notificationsOffOutline 
    });
  }

  ngOnInit(): void {
    this.socket.connect();
    this.socket.on('newAlert', this.handleNewAlert);
    this.socket.on('alerts:new', this.handleBroadcastAlert);
    this.socket.on('alerts:updated', this.handleUpdatedAlert);
  }

  private fixMapPosition(): void {
    setTimeout(() => {
      if (this.map) {
        this.map.invalidateSize();
        const currentCenter = this.map.getCenter();
        this.map.setView(currentCenter, this.map.getZoom());
      }
    }, 500);
  }

  async ngAfterViewInit(): Promise<void> {
    await this.initMap();
    await this.loadAlerts();
    await this.goOnline();
    this.fixMapPosition();
  }

  ngOnDestroy(): void {
    this.socket.off('newAlert', this.handleNewAlert);
    this.socket.off('alerts:new', this.handleBroadcastAlert);
    this.socket.off('alerts:updated', this.handleUpdatedAlert);
    if (this.online) {
      this.emitOffline();
    }
    this.stopLocationWatch();
    this.clearRoute();
    this.socket.disconnect();
    this.clearAlertMarkers();
    this.responderMarker?.remove();
    this.map?.remove();
  }

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

  async acceptAlert(alert: Alert): Promise<void> {
    if (!this.online) {
      this.presentToast('Go online before responding to alerts.', 'warning');
      return;
    }

    this.acceptingId = alert._id;
    try {
      const { alert: acceptedAlert, activeMission } = await this.alertsApi.accept(alert._id);
      this.currentMission = acceptedAlert;
      this.activeMission = activeMission ?? null;

      this.alerts = [acceptedAlert];
      this.alertMarkers.forEach((marker, id) => {
        if (id !== acceptedAlert._id) {
          marker.remove();
          this.alertMarkers.delete(id);
        }
      });

      this.addOrUpdateMarker(acceptedAlert);

      setTimeout(() => this.drawRouteToAlert(acceptedAlert), 500);

      this.presentToast('Alert accepted. Navigate to the location!', 'success');
    } catch (error: any) {
      const message =
        error?.error?.message || 'Could not accept this alert. It may already be taken.';
      this.presentToast(message, 'danger');
    } finally {
      this.acceptingId = undefined;
    }
  }

  
    logout(): void {
    this.auth.logout();
    this.router.navigateByUrl('/auth/login', { replaceUrl: true });
  }

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

  private async goOffline(showToast = true): Promise<void> {
    if (!this.online) {
      return;
    }
    this.emitOffline();
    await this.stopLocationWatch();
    this.clearRoute();
    this.responderMarker?.remove();
    this.responderMarker = undefined;
    this.online = false;
    if (showToast) {
      this.presentToast('You are offline. Toggle back on when ready.', 'medium');
    }
  }

  private emitOffline(): void {
    this.socket.emit('responderOffline', {});
  }

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
          if (this.currentMission && this.routingControl && this.destLatLng) {
          this.routingControl.setWaypoints([
            L.latLng(latitude, longitude),
            L.latLng(this.destLatLng.lat, this.destLatLng.lng),
          ]);
        }
      }
    ) as unknown as string;
  }

  private async stopLocationWatch(): Promise<void> {
    if (this.locationWatchId) {
      await Geolocation.clearWatch({ id: this.locationWatchId });
      this.locationWatchId = undefined;
    }
  }

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

  private refreshMarkers(): void {
    if (!this.map) {
      return;
    }
    this.alertMarkers.forEach((marker) => marker.remove());
    this.alertMarkers.clear();
    this.alerts.forEach((alert) => this.addOrUpdateMarker(alert));
  }

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

  private markerPopupContent(alert: Alert): string {
    const injured =
      alert.numInjured != null ? `<br/>Injured: ${alert.numInjured}` : '';
    return `<strong>${alert.type}</strong><br/>${alert.description}${injured}`;
  }

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

  // Mission helpers
  private drawRouteToAlert(alert: Alert): void {
  if (!this.map || !alert.location?.coordinates) return;
  const [lng, lat] = alert.location.coordinates;
  this.destLatLng = { lat, lng };

  // Destination marker
  this.destinationMarker?.remove();
  this.destinationMarker = L.marker([lat, lng]).addTo(this.map);

  // Build routing from current position to destination
  const origin = this.responderMarker?.getLatLng();
  if (!origin) {
    console.warn('Responder marker not ready yet.');
    return;
  }

  // Remove previous routing control if any
  this.clearRoute();

  this.routingControl = L.Routing.control({
    waypoints: [L.latLng(origin.lat, origin.lng), L.latLng(lat, lng)],
    addWaypoints: false,
    draggableWaypoints: false,
    fitSelectedRoutes: true,
    routeWhileDragging: false,
    show: false,
    router: L.Routing.osrmv1({
      serviceUrl: 'https://router.project-osrm.org/route/v1'
    }),
    lineOptions: { addWaypoints: false },
    createMarker: () => null,
  }).addTo(this.map);
}

  private clearRoute(): void {
    if (this.routingControl) {
      try { this.routingControl.remove(); } catch {}
      this.routingControl = undefined;
    }
    if (this.destinationMarker) {
      this.destinationMarker.remove();
      this.destinationMarker = undefined;
    }
  }

  // Mission actions
  async cancelMission(): Promise<void> {
    if (!this.currentMission) return;
    this.missionBusy = true;
    try {
      await this.alertsApi.reopen(this.currentMission._id);
      this.presentToast('Mission cancelled. Alert reopened.', 'medium');
      this.currentMission = null;
      this.activeMission = null;
      this.clearRoute();
      await this.loadAlerts();
    } catch {
      this.presentToast('Could not cancel mission.', 'danger');
    } finally {
      this.missionBusy = false;
    }
  }

  closeComplete(): void {
    this.completeOpen = false;
  }

  async submitComplete(): Promise<void> {
    if (!this.currentMission) return;
    this.missionBusy = true;
    const mission = this.currentMission;
    try {
      const payload = {
        outcome: this.missionReport.outcome,
        notes: this.missionReport.notes?.trim() || undefined,
        numInjured: this.missionReport.numInjured ?? undefined,
      };
      const result = await this.alertsApi.complete(this.currentMission._id, payload);
      this.presentToast(result?.message ?? 'Mission completed.', 'success');
      
      // Export PDF after successful completion
      await this.exportMissionPdf(mission, payload);
      
      this.completeOpen = false;
      this.currentMission = null;
      this.activeMission = null;
      this.clearRoute();
      await this.loadAlerts();
    } catch (error: any) {
      console.error('Completion error:', error);
      this.presentToast(error?.message || 'Could not save report.', 'danger');
    } finally {
      this.missionBusy = false;
    }
  }

  openInMaps(): void {
    if (!this.destLatLng) return;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${this.destLatLng.lat},${this.destLatLng.lng}`;
    window.open(url, '_blank');
  }

  // PDF Export Logic - MOVED TO RESPONDER PAGE
  private async exportMissionPdf(
    mission: Alert,
    report: {
      outcome: string;
      notes?: string;
      numInjured?: number | null;
    }
  ): Promise<void> {
    try {
      console.log('Starting PDF export for mission:', mission._id);
      
      const doc = new jsPDF();
      
      // Set document properties
      doc.setProperties({
        title: `Mission Report - ${mission._id}`,
        subject: `Mission Report for ${mission.type}`,
        creator: 'Emergency Response App',
      });

      // Add content
      const lines = [
        'MISSION REPORT',
        '',
        `Alert ID: ${mission._id}`,
        `Alert Type: ${mission.type.toUpperCase()}`,
        `Description: ${mission.description}`,
        `Date Created: ${new Date(mission.createdAt).toLocaleString()}`,
        mission.numInjured != null ? `Reported Injuries: ${mission.numInjured}` : '',
        '',
        'RESPONSE OUTCOME',
        `Status: ${this.formatOutcome(report.outcome)}`,
        report.numInjured != null ? `Confirmed Injuries: ${report.numInjured}` : '',
        `Responder Notes: ${report.notes ?? 'No additional notes'}`,
        '',
        `Report Generated: ${new Date().toLocaleString()}`,
      ].filter(Boolean);

      // Title
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('MISSION REPORT', 14, 22);
      
      // Content
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      let y = 35;
      
      lines.forEach((line, index) => {
        if (index === 8) { // Before "RESPONSE OUTCOME"
          y += 8;
          doc.setFont('helvetica', 'bold');
        } else if (index > 0 && index !== 8) {
          doc.setFont('helvetica', 'normal');
        }
        
        // Handle long text by splitting into multiple lines
        const splitLines = doc.splitTextToSize(line, 180);
        splitLines.forEach((textLine: string) => {
          if (y > 270) { // Add new page if needed
            doc.addPage();
            y = 20;
          }
          doc.text(textLine, 14, y);
          y += 6;
        });
      });

      // Add a border
      doc.setDrawColor(200, 200, 200);
      doc.rect(10, 10, 190, 277);

      // Handle platform-specific saving
      if (this.isWeb()) {
        doc.save(`mission_report_${mission._id}.pdf`);
        this.presentToast('PDF downloaded successfully', 'success');
        console.log('PDF downloaded successfully');
      } else {
        // For mobile devices
        const pdfOutput = doc.output('datauristring');
        const base64 = pdfOutput.split(',')[1];
        const filename = `mission_report_${mission._id}_${Date.now()}.pdf`;

        console.log('Writing PDF to filesystem...');
        
        // Write to filesystem
        await Filesystem.writeFile({
          path: filename,
          data: base64,
          directory: Directory.Documents,
          recursive: true
        });

        // Get the file URI
        const { uri } = await Filesystem.getUri({
          path: filename,
          directory: Directory.Documents,
        });

        console.log('PDF saved to:', uri);

        // Share the file
        await Share.share({
          title: 'Mission Report',
          text: `Mission report for ${mission.type} alert`,
          url: uri,
          dialogTitle: 'Share Mission Report',
        });

        this.presentToast('PDF saved and ready to share', 'success');
        console.log('PDF shared successfully');
      }
    } catch (error) {
      console.error('PDF export error:', error);
      this.presentToast('PDF export failed, but report was saved', 'warning');
    }
  }

  // Helper to format outcome for display
  private formatOutcome(outcome: string): string {
    const outcomes: Record<string, string> = {
      resolved: 'Resolved',
      not_found: 'Not Found / Could Not Reach',
      false_alarm: 'False Alarm',
      other: 'Other'
    };
    return outcomes[outcome] || outcome;
  }

  private isWeb(): boolean {
    return !(window as any).Capacitor?.isNativePlatform;
  }

  async openComplete() {
    const modal = await this.modalCtrl.create({
      component: CompleteReportModal, 
      componentProps: { 
        initial: this.missionReport
        // Note: We're NOT passing mission to modal anymore
      },
      canDismiss: true,
    });
    
    const { data, role } = await (await modal.present(), modal.onWillDismiss());
    if (role === 'save') {
      this.missionReport = data;
      // PDF export will happen in submitComplete after API call
      this.submitComplete();
    }
  }

  // Rest of your existing methods...
  private handleIncomingAlert(data: unknown, notify: boolean): void {
    const alert = this.toAlert(data);
    if (alert) {
      this.upsertAlert(alert, notify);
    }
  }

  private upsertAlert(alert: Alert, notify: boolean): void {
    if (alert.status !== 'pending') {
      if (this.currentMission && this.currentMission._id === alert._id) {
        this.currentMission = alert;
        return;
      }
      this.removeAlert(alert._id);
      return;
    }
    if (this.currentMission) {
      return;
    }
    const index = this.alerts.findIndex((a) => a._id === alert._id);
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

  private processAlertUpdate(alert: Alert): void {
    if (this.currentMission && this.currentMission._id === alert._id) {
      if (alert.status === 'resolved') {
        this.currentMission = null;
        this.activeMission = null;
        this.clearRoute();
        this.presentToast('Mission completed elsewhere.', 'medium');
        void this.loadAlerts();
      } else {
        this.currentMission = alert;
      }
    }

    if (alert.status === 'pending') {
      this.upsertAlert(alert, false);
      return;
    }

    if (!this.currentMission || this.currentMission._id !== alert._id) {
      this.removeAlert(alert._id);
    }
  }

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

  private clearAlertMarkers(): void {
    this.alertMarkers.forEach((marker) => marker.remove());
    this.alertMarkers.clear();
  }

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
    Haptics.notification({ type: NotificationType.Warning });
  }

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