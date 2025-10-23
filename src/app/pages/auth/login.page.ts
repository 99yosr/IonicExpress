import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  IonButton,
  IonContent,
  IonHeader,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonSpinner,
  IonText,
  IonTitle,
  IonToolbar,
  IonIcon
} from '@ionic/angular/standalone';

import { AuthService, UserRole } from '../../services/auth.service';
import { addIcons } from 'ionicons';
import { warning, alertCircle, personAdd } from 'ionicons/icons';

@Component({
  selector: 'app-login',
  standalone: true,
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButton,
    RouterLink,
    ReactiveFormsModule,
    IonList,
    IonItem,
    IonLabel,
    IonInput,
    IonText,
    IonSpinner,
    IonIcon
  ],
})
/**
 * Login screen that accepts credentials and redirects the user according to their role.
 */
export class LoginPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });
  errorMessage?: string;
  loading = false;

  constructor() {
  addIcons({ warning, alertCircle, personAdd});
}

  /**
   * If a profile is already cached, skip the form entirely.
   */
  ngOnInit(): void {
    const user = this.auth.currentUser();
    if (user) {
      this.redirect(user.role);
    }
  }

  /**
   * Helper for the template to show the validation warning.
   */
  get emailInvalid(): boolean {
    const control = this.form.controls.email;
    return control.invalid && (control.dirty || control.touched);
  }

  /**
   * Helper for the template to detect an invalid password field.
   */
  get passwordInvalid(): boolean {
    const control = this.form.controls.password;
    return control.invalid && (control.dirty || control.touched);
  }

  /**
   * Invoked when the form is submitted. Attempts authentication and handles errors.
   */
  async submit(): Promise<void> {
    if (this.form.invalid || this.loading) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading = true;
    this.errorMessage = undefined;

    try {
      const response = await this.auth.login(this.form.getRawValue());
      this.redirect(response.role);
    } catch (error: any) {
      this.errorMessage =
        error?.error?.message || 'Could not sign in. Please try again.';
    } finally {
      this.loading = false;
    }
  }

  /**
   * Routes the authenticated user to either the responder or giver map.
   */
  private redirect(role: UserRole): void {
    const target = role === 'responder' ? '/respond' : '/alerts';
    this.router.navigateByUrl(target, { replaceUrl: true });
  }
}
