import { Injectable } from '@angular/core';
import {
  Camera,
  CameraResultType,
  CameraSource,
  GalleryPhoto,
} from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';

@Injectable({
  providedIn: 'root',
})
export class Photos {
  async takePicture(): Promise<{ file: File; preview: string }> {
    const capturedPhoto = await Camera.getPhoto({
      source: CameraSource.Camera,
      quality: 80,
      resultType: CameraResultType.DataUrl,
      webUseInput: false,
    });

    if (!capturedPhoto.dataUrl) {
      throw new Error('Camera returned no data');
    }

    const file = await this.dataUrlToFile(
      capturedPhoto.dataUrl,
      capturedPhoto.format || 'jpeg'
    );

    return { file, preview: capturedPhoto.dataUrl };
  }

  async pickImages(limit = 5): Promise<{ files: File[]; previews: string[] }> {
    const selection = await Camera.pickImages({ quality: 80, limit });
    const previews = selection.photos
      .map((photo) => photo.webPath ?? (photo.path ? Capacitor.convertFileSrc(photo.path) : undefined))
      .filter((value): value is string => !!value);

    const files = (
      await Promise.all(
        selection.photos.map((photo, index) => this.photoToFile(photo, index))
      )
    ).filter((file): file is File => !!file);

    return { files, previews };
  }

  private async photoToFile(photo: GalleryPhoto, index: number): Promise<File | null> {
    const source = photo.webPath ?? (photo.path ? Capacitor.convertFileSrc(photo.path) : undefined);
    if (!source) {
      return null;
    }
    return this.urlToFile(source, photo.format, index);
  }

  private async urlToFile(
    url: string,
    format?: string,
    index?: number
  ): Promise<File> {
    const response = await fetch(url);
    const blob = await response.blob();
    const extension = (format || blob.type.split('/')[1] || 'jpeg').toLowerCase();
    return new File([blob], this.buildFilename(extension, index), { type: blob.type });
  }

  private async dataUrlToFile(
    dataUrl: string,
    format?: string,
    index?: number
  ): Promise<File> {
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const extension = (format || blob.type.split('/')[1] || 'jpeg').toLowerCase();
    return new File([blob], this.buildFilename(extension, index), { type: blob.type });
  }

  private buildFilename(extension: string, index = 0): string {
    const suffix = index ? `-${index}` : '';
    return `alert-${Date.now()}${suffix}.${extension}`;
  }
}
