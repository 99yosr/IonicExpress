import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
  IonButton,
  IonInput,
  IonItem,
  IonLabel,
  IonSelect,
  IonSelectOption,
  IonTextarea,
  IonText,
  ActionSheetController,
  IonIcon, // Add this import
  IonSpinner, // Add this import
  IonBackButton, // Add this import
  IonButtons // Add this import
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { 
  camera,
  images,
  locationOutline, // Use locationOutline instead of location
  checkmarkCircle,
  alertCircle,
  documentTextOutline,
  warningOutline,
  carOutline,
  flameOutline,
  medkitOutline,
  shieldOutline,
  personOutline,
  cameraOutline,
  imageOutline,
  timeOutline,
  sendOutline,
  
} from 'ionicons/icons';

import { AlertsService } from '../../services/alerts.service';
import { Geolocation } from '@capacitor/geolocation';
import { Photos } from '../../services/photo.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-alerts-gen',
  templateUrl: './alerts-gen.page.html',
  styleUrls: ['./alerts-gen.page.scss'],
  standalone: true,
  imports: [
    IonBackButton, // Add this import
    IonButtons, // Add this import
    IonIcon, 
    IonSpinner, 
    CommonModule,
    FormsModule,
    IonContent,
    IonHeader,
    IonTitle,
    IonToolbar,
    IonButton,
    IonInput,
    IonItem,
    IonLabel,
    IonSelect,
    IonSelectOption,
    IonTextarea,
    IonText,
  ],
})
export class AlertsGenPage implements OnInit {
  form = signal({
    description: '',
    type: '',
    numInjured: null as number | null,
    file: null as File | null,
    lat: null as number | null,
    lng: null as number | null,
  });

  loading = false;
  successMsg = '';
  errorMsg = '';
  temporaryPhotos: string[] = [];

  private readonly router = inject(Router);


  constructor(
    private readonly alertsService: AlertsService,
    private readonly photos: Photos,
    private readonly actionSheetCtrl: ActionSheetController
  ) {
    // Add all icons with full names to avoid conflicts
    addIcons({
      camera,
      images,
      locationOutline, // Use the full name
      checkmarkCircle,
      alertCircle,
      documentTextOutline,
      warningOutline,
      carOutline,
      flameOutline,
      medkitOutline,
      shieldOutline,
      personOutline,
      cameraOutline,
      imageOutline,
      timeOutline,
      sendOutline
    });
  }

  ngOnInit(): void {
    void this.getCurrentLocation();
  }

  onDescriptionInput(event: CustomEvent): void {
    const value = (event.detail as { value: string | null }).value ?? '';
    this.form.update((prev) => ({ ...prev, description: value }));
  }

  onTypeChange(event: CustomEvent): void {
    const value = (event.detail as { value: string | undefined }).value ?? '';
    this.form.update((prev) => ({ ...prev, type: value }));
  }

  onNumInjuredInput(event: CustomEvent): void {
    const raw = (event.detail as { value: string | null }).value;
    const parsed = raw === null || raw.trim() === '' ? null : Number(raw);
    this.form.update((prev) => ({
      ...prev,
      numInjured: Number.isNaN(parsed) ? null : parsed,
    }));
  }

  private async getCurrentLocation(): Promise<void> {
  this.errorMsg = '';

  try {
    // Request permission if not already granted
    const perm = await Geolocation.requestPermissions();
    if (perm.location !== 'granted') {
      this.errorMsg = 'Location permission not granted. Please enable GPS.';
      return;
    }

    // Get the position
    const pos = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 10000,
    });

    this.setCoords(pos.coords.latitude, pos.coords.longitude);
    console.log('📍 Got location:', pos.coords);
  } catch (err: any) {
    console.error('Geolocation error:', err);
    this.errorMsg = 'Could not get current location. Check GPS and permissions.';
  }
}

  private setCoords(lat: number, lng: number): void {
    this.form.update((prev) => ({ ...prev, lat, lng }));
  }

 async submitAlert(): Promise<void> {
  this.loading = true;
  this.errorMsg = '';
  this.successMsg = '';

  try {
    const { description, type, numInjured, file, lat, lng } = this.form();
    if (!lat || !lng) {
      throw new Error('Location missing');
    }

    const response = await this.alertsService.create({
      description,
      type,
      numInjured: numInjured ?? undefined,
      file: file ?? undefined,
      lat,
      lng,
    });

    this.successMsg = `Alert sent successfully. Nearby responders notified: ${response.nearbyRespondersCount}`;
    this.form.set({
      description: '',
      type: '',
      numInjured: null,
      file: null,
      lat,
      lng,
    });
    this.temporaryPhotos = [];

    // Navigate back to alert giver page with the new alert data
    await this.router.navigateByUrl('/alerts', {
      replaceUrl: false,
      state: { 
        alertCreated: { 
          nearby: response.nearbyRespondersCount,
          newAlert: response.alert // Your API needs to return this
        } 
      },
    });
  } catch (err: any) {
    this.errorMsg = err?.error?.message || 'Failed to send alert';
  } finally {
    this.loading = false;
  }
}

  async presentActionSheet(): Promise<void> {
    const actionSheet = await this.actionSheetCtrl.create({
      header: 'Ajouter une photo',
      buttons: [
        {
          text: 'Prendre une photo',
          icon: 'camera',
          handler: () => {
            void this.handleTakePhoto();
          },
        },
        {
          text: 'Choisir depuis la galerie',
          icon: 'image',
          handler: () => {
            void this.handlePickImages();
          },
        },
      ],
    });

    await actionSheet.present();
  }

  private async handleTakePhoto(): Promise<void> {
    this.errorMsg = '';
    try {
      const result = await this.photos.takePicture();
      this.form.update((prev) => ({ ...prev, file: result.file }));
      this.temporaryPhotos = [result.preview];
    } catch (error) {
      console.error('Camera error:', error);
      this.errorMsg = 'Could not access camera or gallery';
    }
  }

  private async handlePickImages(): Promise<void> {
    this.errorMsg = '';
    try {
      const result = await this.photos.pickImages();
      if (result.files[0]) {
        this.form.update((prev) => ({ ...prev, file: result.files[0] }));
      }
      this.temporaryPhotos = result.previews;
    } catch (error) {
      console.error('Photo selection error:', error);
      this.errorMsg = 'Could not access camera or gallery';
    }
  }
}