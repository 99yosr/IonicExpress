import { CommonModule } from '@angular/common';
import { Component, Input, inject } from '@angular/core';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonContent,
  IonList,
  IonItem,
  IonLabel,
  IonSelect,
  IonSelectOption,
  IonInput,
  IonTextarea,
} from '@ionic/angular/standalone';
import { FormsModule } from '@angular/forms';
import { ModalController } from '@ionic/angular';

type Outcome = 'resolved' | 'not_found' | 'false_alarm' | 'other';
export interface MissionReport {
  outcome: Outcome;
  notes?: string;
  numInjured?: number | null;
}

@Component({
  selector: 'app-complete-report-modal',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonSelect,
    IonSelectOption,
    IonInput,
    IonTextarea,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Mission report</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="cancel()">Close</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-list>
        <ion-item>
          <ion-label position="stacked">Outcome</ion-label>
          <ion-select [(ngModel)]="report.outcome">
            <ion-select-option value="resolved">Resolved</ion-select-option>
            <ion-select-option value="not_found">Not found / could not reach</ion-select-option>
            <ion-select-option value="false_alarm">False alarm</ion-select-option>
            <ion-select-option value="other">Other</ion-select-option>
          </ion-select>
        </ion-item>

        <ion-item>
          <ion-label position="stacked">Number injured (optional)</ion-label>
          <ion-input
            type="number"
            inputmode="numeric"
            [(ngModel)]="report.numInjured"
            min="0"
            step="1">
          </ion-input>
        </ion-item>

        <ion-item>
          <ion-label position="stacked">Notes</ion-label>
          <ion-textarea
            rows="6"
            autoGrow="true"
            [(ngModel)]="report.notes">
          </ion-textarea>
        </ion-item>
      </ion-list>

      <div class="p-4">
        <ion-button expand="block" color="success" (click)="save()">Save report</ion-button>
      </div>
    </ion-content>
  `,
})
export class CompleteReportModal {
  @Input() initial?: MissionReport;

  report: MissionReport = {
    outcome: 'resolved',
    notes: '',
    numInjured: null,
  };

  constructor(private modalCtrl: ModalController) {}

  ngOnInit(): void {
    if (this.initial) {
      this.report = {
        outcome: this.initial.outcome ?? 'resolved',
        notes: this.initial.notes ?? '',
        numInjured: this.initial.numInjured === undefined ? null : this.initial.numInjured,
      };
    }
  }

  cancel(): void {
    this.modalCtrl.dismiss(null, 'cancel');
  }

  async save(): Promise<void> {
    const cleaned: MissionReport = {
      outcome: this.report.outcome,
      notes: this.report.notes?.trim() || undefined,
      numInjured: this.report.numInjured === null || this.report.numInjured === undefined
        ? undefined
        : Number(this.report.numInjured),
    };
    
    if (Number.isNaN(cleaned.numInjured as number)) {
      cleaned.numInjured = undefined;
    }

    // Just return the data - PDF export happens in responder page
    this.modalCtrl.dismiss(cleaned, 'save');
  }
}