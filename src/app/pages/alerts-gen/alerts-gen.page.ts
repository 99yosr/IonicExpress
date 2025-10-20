import { Component, OnInit, signal } from '@angular/core';
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
  ActionSheetController
} from '@ionic/angular/standalone';
import { AlertsService } from '../../services/alerts.service';
import { Geolocation } from '@capacitor/geolocation';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Photos } from '../../services/photo.service';

@Component({
  selector: 'app-alerts-gen',
  templateUrl: './alerts-gen.page.html',
  styleUrls: ['./alerts-gen.page.scss'],
  standalone: true,
  imports: [
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
    IonText
  ]
})
export class AlertsGenPage implements OnInit {
  form = signal({
    description: '',
    type: '',
    numInjured: null as number | null,
    file: null as File | null,
    lat: null as number | null,
    lng: null as number | null
  });

  loading = false;
  successMsg = '';
  errorMsg = '';
  temporaryPhotos: string[] = [];

  constructor(
    private alertsService: AlertsService,
    private photos: Photos,
    private actionSheetCtrl: ActionSheetController // ✅ FIX: Injected properly
  ) {}

  ngOnInit() {
    this.getCurrentLocation();
  }

  onDescriptionInput(event: CustomEvent) {
    const value = (event.detail as { value: string | null }).value ?? '';
    this.form.update(prev => ({ ...prev, description: value }));
  }

  onTypeChange(event: CustomEvent) {
    const value = (event.detail as { value: string | undefined }).value ?? '';
    this.form.update(prev => ({ ...prev, type: value }));
  }

  onNumInjuredInput(event: CustomEvent) {
    const raw = (event.detail as { value: string | null }).value;
    const parsed = raw === null || raw.trim() === '' ? null : Number(raw);
    this.form.update(prev => ({ ...prev, numInjured: Number.isNaN(parsed) ? null : parsed }));
  }



async getCurrentLocation() {
  this.errorMsg = '';

  // secure origin check (Chrome requires https or localhost)
  const secure =
    location.protocol === 'https:' ||
    location.hostname === 'localhost' ||
    location.hostname === '127.0.0.1';
  if (!secure) {
    this.errorMsg = 'Run on https or localhost.';
    return;
  }

  // if browser already blocked, don’t hang
  try {
    const perm = (navigator as any).permissions
      ? await (navigator as any).permissions.query({ name: 'geolocation' as PermissionName })
      : { state: 'prompt' };
    if (perm.state === 'denied') {
      this.errorMsg = 'Chrome blocked location. Click the lock icon → Site settings → Location → Allow.';
      return;
    }
  } catch {}

  // primary: single shot with timeout
  try {
    const pos = await Geolocation.getCurrentPosition({
      enableHighAccuracy: false,
      timeout: 8000,
      maximumAge: 60000,
    });
    this.setCoords(pos.coords.latitude, pos.coords.longitude);
    return;
  } catch {}

  // fallback: short watch (more reliable on desktop)
  if ('geolocation' in navigator) {
    await new Promise<void>((resolve, reject) => {
      const id = navigator.geolocation.watchPosition(
        p => { navigator.geolocation.clearWatch(id); this.setCoords(p.coords.latitude, p.coords.longitude); resolve(); },
        e => { navigator.geolocation.clearWatch(id); reject(e); },
        { enableHighAccuracy: false, maximumAge: 0 }
      );
      setTimeout(() => { navigator.geolocation.clearWatch(id); reject(new Error('timeout')); }, 10000);
    }).catch(() => {
      this.errorMsg = 'Enable Location for localhost:<port> in Chrome, then reload.';
    });
  }
}

  onFileChange(event: any) {
    const file = event.target.files[0];
    this.form.update(f => ({ ...f, file }));
  }

  async pickPhoto() {
    try {
      const result = await Camera.getPhoto({
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Prompt,
        quality: 70
      });
      if (!result.dataUrl) {
        return;
      }
      const file = await this.dataUrlToFile(result.dataUrl, result.format || 'jpeg');
      this.form.update(f => ({ ...f, file }));
    } catch (err) {
      console.error('Camera error:', err);
      this.errorMsg = 'Could not access camera or gallery';
    }
  }

  private setCoords(lat: number, lng: number) {
    this.form.update(f => ({
      ...f,
      lat,
      lng
    }));
  }

  private async dataUrlToFile(dataUrl: string, format: string): Promise<File> {
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    return new File([blob], `alert-${Date.now()}.${format}`, { type: blob.type });
  }

  async submitAlert() {
    this.loading = true;
    this.errorMsg = '';
    this.successMsg = '';

    try {
      const { description, type, numInjured, file, lat, lng } = this.form();
      if (!lat || !lng) throw new Error('Location missing');

      const response = await this.alertsService.create({
        description,
        type,
        numInjured: numInjured ?? undefined,
        file: file ?? undefined,
        lat,
        lng
      });

      this.successMsg = `Alert sent successfully. Nearby responders: ${response.nearbyRespondersCount}`;
      this.form.set({
        description: '',
        type: '',
        numInjured: null,
        file: null,
        lat,
        lng
      });
    } catch (err: any) {
      this.errorMsg = err.error?.message || 'Failed to send alert';
    } finally {
      this.loading = false;
    }
  }

  async presentActionSheet() {
    const actionSheet = await this.actionSheetCtrl.create({
      header: 'Ajouter une photo',
      buttons: [
        {
          text: 'Prendre une photo',
          icon: 'camera',
          handler: () => {
            this.photos.takePicture(); // ✅ added `this.`
          },
        },
        {
          text: 'Choisir depuis la galerie',
          icon: 'image',
          handler: async () => {
            const result = await this.photos.selectionnerPhotos(); // ✅ added `this.`
            const tab = result.photos.map((photo) => photo.webPath);
            this.temporaryPhotos = [...tab];
          },
        },
      ],
    });

    await actionSheet.present();
  }
}
