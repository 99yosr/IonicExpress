import { CommonModule, DatePipe } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  inject,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
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
  warningOutline ,
  logOutOutline
} from 'ionicons/icons';
import { Geolocation } from '@capacitor/geolocation';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
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
  private newAlertToFocus: Alert | null = null; // ADD THIS MISSING PROPERTY

  private map?: any;
  private markers: any[] = [];

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
      warningOutline ,
      logOutOutline
    });
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
    setTimeout(async () => {
      await this.initMap();
      setTimeout(async () => {
        await this.loadAlertsAndFocus(); // CHANGE THIS LINE
        await this.maybeShowAlertCreationToast();
        await this.checkForNewAlertToFocus(); // ADD THIS LINE
      }, 500);
    }, 100);
  }

  private async checkForNewAlertToFocus(): Promise<void> {
    const state = (window.history.state ?? {}) as { 
      alertCreated?: { 
        nearby: number; 
        newAlert?: Alert 
      } 
    };
    
    if (state.alertCreated?.newAlert) {
      this.newAlertToFocus = state.alertCreated.newAlert;
      await this.loadAlertsAndFocus();
    }
  }

  private async loadAlertsAndFocus(): Promise<void> {
    this.loadingAlerts = true;
    try {
      this.alerts = await this.alertsApi.list({ status: 'active' });
      this.validateAlertData();
      this.renderMarkers();
      
      if (this.newAlertToFocus) {
        setTimeout(() => {
          this.focusOnAlert(this.newAlertToFocus!);
          this.newAlertToFocus = null;
        }, 1000);
      }
    } catch (error) {
      console.error('Error loading alerts:', error);
      this.alerts = [];
    } finally {
      this.loadingAlerts = false;
    }
  }

  // ADD THIS MISSING METHOD
  private focusOnAlert(alert: Alert): void {
    if (!this.map || !alert.location?.coordinates) {
      return;
    }

    let lat, lng;
    
    if (alert.location.coordinates.length === 2) {
      const [coord1, coord2] = alert.location.coordinates;
      
      if (Math.abs(coord1) >= 7 && Math.abs(coord1) <= 12 && 
          Math.abs(coord2) >= 30 && Math.abs(coord2) <= 38) {
        lng = coord1;
        lat = coord2;
      } else if (Math.abs(coord1) >= 30 && Math.abs(coord1) <= 38 && 
                 Math.abs(coord2) >= 7 && Math.abs(coord2) <= 12) {
        lat = coord1;
        lng = coord2;
      } else {
        [lng, lat] = alert.location.coordinates;
      }
    }

    if (lat != null && lng != null && !isNaN(lat) && !isNaN(lng)) {
      // Zoom in on the alert location
      this.map.setView([lat, lng], 16);
      
      // Highlight the new alert
      this.highlightNewAlertMarker(alert._id);
      
      console.log('Focused on new alert at:', lat, lng);
    }
  }

  // ADD THIS MISSING METHOD
  private highlightNewAlertMarker(alertId: string): void {
    if (!this.map) return;

    // Find the marker for the new alert
    const newAlertMarker = this.markers.find(marker => {
      const popup = marker.getPopup();
      if (popup && popup.getContent) {
        const content = popup.getContent();
        return content && content.includes(alertId);
      }
      return false;
    });

    if (newAlertMarker) {
      // Open the popup for the new alert
      newAlertMarker.openPopup();
    }
  }

  private async initMap(): Promise<void> {
    if (this.map || !this.mapContainer) {
      return;
    }
    
    if (typeof L === 'undefined') {
      console.error('Leaflet library not loaded');
      return;
    }

    try {
      const mapElement = this.mapContainer.nativeElement;
      mapElement.style.visibility = 'hidden';
      
      this.map = L.map(mapElement, {
        zoomControl: true,
        attributionControl: true,
        preferCanvas: true
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors'
      }).addTo(this.map);

      this.map.setView([36.8065, 10.1815], 10);

      try {
        const position = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 5000,
        });
        
        this.currentPosition = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
        
        this.map.setView([this.currentPosition.lat, this.currentPosition.lng], 13);
        console.log('Map centered on user location:', this.currentPosition.lat, this.currentPosition.lng);
        
        this.addCurrentPositionMarker();
        
      } catch (locationError) {
        console.log('Using default map location');
      }

      setTimeout(() => {
        mapElement.style.visibility = 'visible';
        this.map?.invalidateSize(true);
        console.log('Map initialized and should be visible now');
      }, 300);
      
    } catch (error) {
      console.error('Error initializing map:', error);
    }
  }

  private addCurrentPositionMarker(): void {
    console.log('=== addCurrentPositionMarker called ===');
    
    if (!this.map || !this.currentPosition) {
      return;
    }

    if (this.currentPositionMarker) {
      this.currentPositionMarker.remove();
    }

    this.currentPositionMarker = L.circleMarker([this.currentPosition.lat, this.currentPosition.lng], {
      radius: 8,
      fillColor: '#ff0000',
      color: '#ffffff',
      weight: 2,
      opacity: 1,
      fillOpacity: 0.8,
      className: 'current-position-circle'
    }).addTo(this.map);

    this.currentPositionMarker.setStyle({
      className: 'current-position-circle pulse'
    });

    this.currentPositionMarker.bindPopup(`
      <div style="padding: 8px; text-align: center;">
        <strong>Your Current Position</strong><br/>
        <small>Lat: ${this.currentPosition.lat.toFixed(6)}<br/>
        Lng: ${this.currentPosition.lng.toFixed(6)}</small>
      </div>
    `);

    console.log('✅ Circle marker created successfully');
  }

  ngOnDestroy(): void {
    this.clearMarkers();
    this.map?.remove();
  }

  async refresh(event?: RefresherCustomEvent): Promise<void> {
    await this.loadAlertsAndFocus(); // CHANGE THIS LINE
    if (event) {
      event.detail.complete();
    }
  }

  launchAlert(): void {
    this.router.navigateByUrl('/alerts/new');
  }

  logout(): void {
    this.auth.logout();
    this.router.navigateByUrl('/auth/login', { replaceUrl: true });
  }

  // KEEP THIS ORIGINAL METHOD FOR BACKWARDS COMPATIBILITY
  private async loadAlerts(): Promise<void> {
    this.loadingAlerts = true;
    try {
      this.alerts = await this.alertsApi.list({ status: 'active' });
      this.validateAlertData();
      this.renderMarkers();
    } catch (error) {
      console.error('Error loading alerts:', error);
      this.alerts = [];
    } finally {
      this.loadingAlerts = false;
    }
  }

  private renderMarkers(): void {
    if (!this.map) {
      console.warn('Map not available for rendering markers');
      return;
    }
    
    console.log('Rendering markers for alerts:', this.alerts.length);
    console.log('Alerts with coordinates:', this.alerts.filter(a => a.location?.coordinates).map(a => ({
      id: a._id,
      coords: a.location?.coordinates,
      type: a.type
    })));

    this.clearMarkers();
    
    const validMarkers = this.alerts.filter((alert) => {
      const hasCoords = !!alert.location?.coordinates;
      if (!hasCoords) {
        console.warn('Alert missing coordinates:', alert._id);
      }
      return hasCoords;
    });

    console.log('Valid alerts with coordinates:', validMarkers.length);

    validMarkers.forEach((alert) => {
      const marker = this.createMarker(alert);
      if (marker) {
        this.markers.push(marker);
      }
    });
    
    console.log('Markers created:', this.markers.length);
    
    this.fitToAlerts();
    
    setTimeout(() => {
      this.map?.invalidateSize(true);
    }, 100);
  }

  private validateAlertData(): void {
    console.log('=== ALERT DATA VALIDATION ===');
    this.alerts.forEach((alert, index) => {
      console.log(`Alert ${index + 1}:`, {
        id: alert._id,
        type: alert.type,
        hasLocation: !!alert.location,
        coordinates: alert.location?.coordinates,
        coordinatesLength: alert.location?.coordinates?.length,
        status: alert.status
      });
    });
    console.log('=== END VALIDATION ===');
  }

  private createMarker(alert: Alert): any | undefined {
    if (!this.map || !alert.location?.coordinates) {
      return undefined;
    }
    
    console.log('Alert coordinates:', alert.location.coordinates);
    
    let lat, lng;
    
    if (alert.location.coordinates.length === 2) {
      const [coord1, coord2] = alert.location.coordinates;
      
      if (Math.abs(coord1) >= 7 && Math.abs(coord1) <= 12 && 
          Math.abs(coord2) >= 30 && Math.abs(coord2) <= 38) {
        lng = coord1;
        lat = coord2;
      } else if (Math.abs(coord1) >= 30 && Math.abs(coord1) <= 38 && 
                 Math.abs(coord2) >= 7 && Math.abs(coord2) <= 12) {
        lat = coord1;
        lng = coord2;
      } else {
        [lng, lat] = alert.location.coordinates;
      }
    }
    
    console.log('Parsed coordinates - lat:', lat, 'lng:', lng);

    if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) {
      console.warn('Invalid coordinates for alert:', alert._id, alert.location.coordinates);
      return undefined;
    }

    const icon = this.buildMarkerIcon(alert.status);
    const marker = L.marker([lat, lng], icon ? { icon } : undefined).addTo(this.map);
    marker.bindPopup(this.markerPopupContent(alert));
    
    return marker;
  }

  private markerPopupContent(alert: Alert): string {
    const injured = alert.numInjured != null ? `<br/>Injured: ${alert.numInjured}` : '';
    const statusLabel = this.formatStatus(alert.status);
    return `<strong>${alert.type}</strong><br/>${alert.description}${injured}<br/>Status: ${statusLabel}`;
  }

  private fitToAlerts(): void {
    if (!this.map || !this.alerts.length || typeof L === 'undefined') {
      return;
    }
    const points = this.alerts
      .filter((alert) => alert.location?.coordinates)
      .map((alert) => [alert.location.coordinates[1], alert.location.coordinates[0]]);

    if (points.length) {
      const bounds = L.latLngBounds(points);
      this.map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    }
  }

  private clearMarkers(): void {
    this.markers.forEach((marker) => marker.remove());
    this.markers = [];
  }

  private async maybeShowAlertCreationToast(): Promise<void> {
    const state = (window.history.state ?? {}) as { alertCreated?: { nearby: number } };
    const info = state.alertCreated;
    if (!info) {
      return;
    }
    const toast = await this.toastCtrl.create({
      message: `Alert sent successfully. Nearby responders: ${info.nearby}`,
      duration: 2500,
      color: 'success',
    });
    toast.present();
    const { alertCreated, ...rest } = state as Record<string, unknown> & { alertCreated?: { nearby: number } };
    window.history.replaceState(rest, '', window.location.href);
  }

  private buildMarkerIcon(status: AlertStatus): any | undefined {
    if (typeof L === 'undefined' || !L?.Icon) {
      return undefined;
    }

    const color = this.statusColor(status);
    
    return L.icon({
      iconUrl: this.getMarkerIconUrl(color),
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
      shadowSize: [41, 41]
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
    if (status === 'accepted') {
      return 'Help on the way';
    }
    if (status === 'resolved') {
      return 'Resolved';
    }
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

  private async dataUrlToFile(dataUrl: string, format: string): Promise<File> {
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const extension = format.toLowerCase();
    return new File([blob], `alert-${Date.now()}.${extension}`, { type: blob.type });
  }
}