import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

export type AlertStatus = 'pending' | 'accepted' | 'resolved';

export interface MissionRecord {
  _id: string;
  alert: string;
  responder: string;
  outcome: 'active' | 'resolved' | 'not_found' | 'false_alarm' | 'other';
  notes?: string;
  numInjured?: number;
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string;
}

export interface AcceptAlertResponse {
  alert: Alert;
  activeMission: MissionRecord;
}

export interface CompleteMissionResponse {
  message: string;
  completedMission: MissionRecord;
  alert: Alert;
}

export interface CompleteMissionDto {
  outcome: 'resolved' | 'not_found' | 'false_alarm' | 'other';
  notes?: string;
  numInjured?: number;
}

export interface Alert {
  _id: string;
  description: string;
  type: string;
  numInjured?: number;
  photoUrl?: string | null;
  status: AlertStatus;
  acceptedBy?: string;
  location: {
    type: 'Point';
    coordinates: [number, number];
  };
  createdAt: string;
  updatedAt?: string;
}

@Injectable({ providedIn: 'root' })
/**
 * Wraps the alert REST API so components can focus on presentation logic.
 */
export class AlertsService {
  private readonly http = inject(HttpClient);

  /**
   * Fetches alerts from the backend, optionally filtered by status or ownership.
   */
  async list(filters?: {
    status?: 'pending' | 'accepted' | 'active' | 'all';
    mine?: boolean;
  }): Promise<Alert[]> {
    let params = new HttpParams();
    if (filters?.status) {
      params = params.set('status', filters.status);
    }
    if (filters?.mine) {
      params = params.set('mine', 'true');
    }
    return firstValueFrom(
      this.http.get<Alert[]>(`${environment.api}/api/alerts`, { params })
    );
  }

  /**
   * Creates a new alert, including optional photo upload and geolocation payload.
   */
  async create(payload: {
    description: string;
    type: string;
    numInjured?: number;
    lng: number;
    lat: number;
    file?: File;
  }): Promise<{ alert: Alert; nearbyRespondersCount: number }> {
    const form = new FormData();
    form.append('description', payload.description);
    form.append('type', payload.type);
    form.append(
      'location',
      JSON.stringify({ type: 'Point', coordinates: [payload.lng, payload.lat] })
    );
    if (payload.numInjured != null) {
      form.append('numInjured', String(payload.numInjured));
    }
    if (payload.file) {
      form.append('photo', payload.file);
    }
    return firstValueFrom(
      this.http.post<{ alert: Alert; nearbyRespondersCount: number }>(
        `${environment.api}/api/alerts`,
        form
      )
    );
  }

  /**
   * Marks an alert as accepted by the current responder.
   */
  async accept(id: string): Promise<AcceptAlertResponse> {
    return firstValueFrom(
      this.http.patch<AcceptAlertResponse>(
        `${environment.api}/api/alerts/${id}/accept`,
        {}
      )
    );
  }

  /**
   * Cancel the current mission for this alert.
   * Backend should set the alert back to 'pending' and free assignment.
   * Uses the /mission endpoint as requested.
   */
  async reopen(id: string): Promise<void> {
    await firstValueFrom(
      this.http.put<void>(`${environment.api}/api/mission/${id}/cancel`, {})
    );
  }

  /**
   * Complete the mission and persist the mission report.
   * Backend should set the alert to 'resolved'.
   * Uses the /mission endpoint as requested.
   */
  async complete(id: string, body: CompleteMissionDto): Promise<CompleteMissionResponse> {
    return firstValueFrom(
      this.http.post<CompleteMissionResponse>(
        `${environment.api}/api/mission/${id}/complete`,
        body
      )
    );
  }

  /**
   * (Optional) Get my active mission if the app needs to restore state on reload.
   * Returns the alert tied to the current mission (shape aligned with Alert).
   */
  async getActiveMission(): Promise<Alert | null> {
    return firstValueFrom(
      this.http.get<Alert | null>(`${environment.api}/api/mission/active`)
    );
  }
}