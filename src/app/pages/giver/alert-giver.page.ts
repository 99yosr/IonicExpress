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
} from '@ionic/angular/standalone';
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
    ReactiveFormsModule,
    CommonModule,
    DatePipe,
  ],
})
/**
 * Dashboard for alert givers. Shows existing alerts on a Leaflet map and exposes a modal
 * to create new alerts with optional photos and geolocation metadata.
 */
export class AlertGiverPage implements AfterViewInit, OnDestroy {
  @ViewChild('mapRef', { static: false }) mapContainer?: ElementRef<HTMLDivElement>;

  alerts: Alert[] = [];
  loadingAlerts = false;

  createModalOpen = false;
  createLoading = false;
  createError?: string;
  photoPreview?: string;
  photoFile?: File;

  private readonly fb = inject(FormBuilder);
  private readonly alertsApi = inject(AlertsService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toastCtrl = inject(ToastController);

  readonly createForm = this.fb.nonNullable.group({
    type: ['medical', Validators.required],
    description: ['', [Validators.required, Validators.minLength(6)]],
    numInjured: [''],
  });

  private map?: any;
  private markers: any[] = [];

  /**
   * Once the view is ready we can initialize Leaflet and fetch alerts.
   */
  async ngAfterViewInit(): Promise<void> {
    await this.initMap();
    await this.loadAlerts();
    await this.maybeShowAlertCreationToast();
  }

  /**
   * Clean up map state when the component is destroyed.
   */
  ngOnDestroy(): void {
    this.clearMarkers();
    this.map?.remove();
  }

  /**
   * Handles the pull-to-refresh gesture by reloading alerts from the API.
   */
  async refresh(event: RefresherCustomEvent): Promise<void> {
    await this.loadAlerts();
    event.detail.complete();
  }

  /**
   * Navigates to the standalone alert creation page.
   */
  launchAlert(): void {
    this.router.navigateByUrl('/alerts/new');
  }

  /**
   * Opens the modal used to submit a new alert.
   */
  openCreateModal(): void {
    this.resetCreateForm();
    this.clearPhoto();
    this.createModalOpen = true;
    this.createError = undefined;
  }

  /**
   * Closes the modal, skipping closure during submission to avoid accidental dismissal.
   */
  closeCreateModal(): void {
    if (this.createLoading) {
      return;
    }
    this.createModalOpen = false;
    this.resetCreateForm();
    this.clearPhoto();
  }

  /**
   * Ionic emits this when the modal is dismissed via backdrop or close button.
   */
  onModalDismiss(): void {
    this.createModalOpen = false;
    this.clearPhoto();
    this.resetCreateForm();
    if (this.createLoading) {
      this.createLoading = false;
    }
    this.createError = undefined;
  }

  /**
   * Validates the form, captures the device location, posts the alert and updates the UI.
   */
  async submitAlert(): Promise<void> {
    if (this.createForm.invalid || this.createLoading) {
      this.createForm.markAllAsTouched();
      return;
    }

    this.createLoading = true;
    this.createError = undefined;

    try {
      const position = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
      });

      const { longitude, latitude } = position.coords;
      const { description, type, numInjured } = this.createForm.getRawValue();
      const injured =
        numInjured !== null && numInjured !== undefined && numInjured !== ''
          ? Number(numInjured)
          : undefined;

      const response = await this.alertsApi.create({
        description,
        type,
        numInjured: injured,
        lng: longitude,
        lat: latitude,
        file: this.photoFile,
      });

      this.alerts = [response.alert, ...this.alerts];
      this.renderMarkers();
      this.closeCreateModal();
      const toast = await this.toastCtrl.create({
        message: 'Alert sent successfully.',
        duration: 2500,
        color: 'success',
      });
      toast.present();
    } catch (error: any) {
      this.createError =
        error?.error?.message ||
        'Unable to send the alert. Please grant location permission and retry.';
    } finally {
      this.createLoading = false;
    }
  }

  /**
   * Opens the device camera/gallery. Stores a preview and converts the image to a File object.
   */
  async selectPhoto(): Promise<void> {
    try {
      const image = await Camera.getPhoto({
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Prompt,
        quality: 70,
      });
      if (!image?.dataUrl) {
        return;
      }
      this.photoFile = await this.dataUrlToFile(image.dataUrl, image.format || 'jpeg');
      this.photoPreview = image.dataUrl;
    } catch (error: any) {
      if (typeof error?.message === 'string' && error.message.includes('User cancelled')) {
        return;
      }
      this.createError = 'Could not access camera or gallery.';
    }
  }

  /**
   * Clears the cached image to reset the file input.
   */
  clearPhoto(): void {
    this.photoFile = undefined;
    this.photoPreview = undefined;
  }

  /**
   * Logs out and navigates back to the login page.
   */
  logout(): void {
    this.auth.logout();
    this.router.navigateByUrl('/auth/login', { replaceUrl: true });
  }

  /**
   * Builds the Leaflet map component, using current location when available.
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

    try {
      const position = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 8000,
      });
      this.map.setView([position.coords.latitude, position.coords.longitude], 13);
    } catch {
      this.map.setView([36.8065, 10.1815], 12);
    }

    setTimeout(() => this.map?.invalidateSize(), 200);
  }

  /**
   * Loads alerts from the backend and renders the map markers.
   */
  private async loadAlerts(): Promise<void> {
    this.loadingAlerts = true;
    try {
      this.alerts = await this.alertsApi.list({ status: 'active' });
      this.renderMarkers();
    } catch {
      this.alerts = [];
    } finally {
      this.loadingAlerts = false;
    }
  }

  /**
   * Synchronizes Leaflet markers with the in-memory list of alerts.
   */
  private renderMarkers(): void {
    if (!this.map) {
      return;
    }
    this.clearMarkers();
    this.alerts.forEach((alert) => {
      const marker = this.createMarker(alert);
      if (marker) {
        this.markers.push(marker);
      }
    });
    this.fitToAlerts();
    setTimeout(() => this.map?.invalidateSize(), 200);
  }

  /**
   * Creates or skips creation of a marker for a specific alert.
   */
  private createMarker(alert: Alert): any | undefined {
    if (!this.map || !alert.location?.coordinates) {
      return undefined;
    }
    const [lng, lat] = alert.location.coordinates;
    if (lat == null || lng == null) {
      return undefined;
    }
    const icon = this.buildMarkerIcon(alert.status);
    const marker = L.marker([lat, lng], icon ? { icon } : undefined).addTo(this.map);
    marker.bindPopup(this.markerPopupContent(alert));
    return marker;
  }

  /**
   * HTML content for the Leaflet popup associated with each alert marker.
   */
  private markerPopupContent(alert: Alert): string {
    const injured =
      alert.numInjured != null ? `<br/>Injured: ${alert.numInjured}` : '';
    const statusLabel = this.formatStatus(alert.status);
    return `<strong>${alert.type}</strong><br/>${alert.description}${injured}<br/>Status: ${statusLabel}`;
  }

  /**
   * Adjusts the map viewport so all alerts are visible.
   */
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

  /**
   * Removes all markers from the map and clears the local cache.
   */
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

  /**
   * Resets the modal form to a clean state before each use.
   */
  private resetCreateForm(): void {
    this.createForm.setValue({
      type: 'medical',
      description: '',
      numInjured: '',
    });
    this.createForm.markAsPristine();
    this.createForm.markAsUntouched();
  }

  /**
   * Builds a colored Leaflet icon so alerts are visible on the map.
   */
  private buildMarkerIcon(status: AlertStatus): any | undefined {
    if (typeof L === 'undefined' || !L?.divIcon) {
      return undefined;
    }
    const color = this.statusColor(status);
    return L.divIcon({
      className: 'alert-marker',
      html: `<span class="alert-marker__pin" style="background:${color}"></span><span class="alert-marker__dot"></span>`,
      iconSize: [26, 36],
      iconAnchor: [13, 34],
      popupAnchor: [0, -32],
    });
  }

  /**
   * Converts backend status codes into UI-friendly labels.
   */
  private formatStatus(status: AlertStatus): string {
    if (status === 'accepted') {
      return 'Help on the way';
    }
    if (status === 'resolved') {
      return 'Resolved';
    }
    return 'Pending';
  }

  /**
   * Maps alert statuses to brand colors for markers.
   */
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
  /**
   * Utility for converting a base64 data URL into a File for form submission.
   */
  private async dataUrlToFile(dataUrl: string, format: string): Promise<File> {
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const extension = format.toLowerCase();
    return new File([blob], `alert-${Date.now()}.${extension}`, { type: blob.type });
  }
}
