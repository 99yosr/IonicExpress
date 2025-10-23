import { Component, inject } from '@angular/core';
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
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonText,
  IonTitle,
  IonToolbar,
  IonIcon
} from '@ionic/angular/standalone';
import { AuthService, UserRole } from '../../services/auth.service';
import { addIcons } from 'ionicons';
import { alertCircle, warning, logIn, person, medical } from 'ionicons/icons';

@Component({
  selector: 'app-register',
  standalone: true,
  templateUrl: './register.page.html',
  styleUrls:['./register.page.scss'],
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
    IonSelect,
    IonSelectOption,
    IonSpinner,
    IonIcon
  ],
})
/**
 * Registration form for both alert givers and responders.
 * Creates an account and signs the user in upon success.
 */
export class RegisterPage {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    confirmPassword: ['', [Validators.required]],
    role: ['user' as UserRole, [Validators.required]],
  });
  errorMessage?: string;
  loading = false;
  constructor() {
  addIcons({ alertCircle, warning, logIn, person, medical });
}

  /**
   * Template helper used to show the validation hint for the name field.
   */
  get nameInvalid(): boolean {
    const control = this.form.controls.name;
    return control.invalid && (control.dirty || control.touched);
  }

  /**
   * Template helper used to show the validation hint for the email field.
   */
  get emailInvalid(): boolean {
    const control = this.form.controls.email;
    return control.invalid && (control.dirty || control.touched);
  }

  /**
   * Template helper used to show the validation hint for the password field.
   */
  get passwordInvalid(): boolean {
    const control = this.form.controls.password;
    return control.invalid && (control.dirty || control.touched);
  }

  /**
   * Confirms that the second password matches the first.
   */
  get confirmInvalid(): boolean {
    const control = this.form.controls.confirmPassword;
    const password = this.form.controls.password.value;
    return (
      control.invalid ||
      (control.value !== password && (control.dirty || control.touched))
    );
  }

  /**
   * Submits the registration payload, shows errors and redirects on success.
   */
  async submit(): Promise<void> {
    if (this.form.invalid || this.loading) {
      this.form.markAllAsTouched();
      return;
    }

    const { password, confirmPassword, role, ...rest } = this.form.getRawValue();
    if (password !== confirmPassword) {
      this.errorMessage = 'Passwords do not match.';
      return;
    }

    this.loading = true;
    this.errorMessage = undefined;

    try {
      const response = await this.auth.register({ ...rest, password, role });
      this.redirect(response.role);
    } catch (error: any) {
      this.errorMessage =
        error?.error?.message || 'Could not create account. Please try again.';
    } finally {
      this.loading = false;
    }
  }

  /**
   * After successful registration, forward the user to the correct dashboard.
   */
  private redirect(role: UserRole): void {
    const target = role === 'responder' ? '/respond' : '/alerts';
    this.router.navigateByUrl(target, { replaceUrl: true });
  }
}
