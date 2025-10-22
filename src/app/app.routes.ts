import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { responderGuard } from './guards/responder.guard';

/**
 * Top-level routing configuration.
 * Routes are lazy-loaded so the associated page code is downloaded only when needed.
 */
export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/landing/landing.page').then((m) => m.LandingPage),
  },
  {
    path: 'auth',
    // Authentication flow: login/register presented inside standalone pages.
    children: [
      {
        path: 'login',
        loadComponent: () => import('./pages/auth/login.page').then((m) => m.LoginPage),
      },
      {
        path: 'register',
        loadComponent: () => import('./pages/auth/register.page').then((m) => m.RegisterPage),
      },
      {
        path: '',
        redirectTo: 'login',
        pathMatch: 'full',
      },
    ],
  },
  {
    path: 'alerts',
    // Alert creation map for standard users.
    canActivate: [authGuard],
    loadComponent: () => import('./pages/giver/alert-giver.page').then((m) => m.AlertGiverPage),
  },
  {
    path: 'MakeAlert',
    redirectTo: 'alerts/new',
    pathMatch: 'full',
  },
  {
    path: 'alerts/new',
    // Standalone flow to submit a new alert.
    canActivate: [authGuard],
    loadComponent: () => import('./pages/alerts-gen/alerts-gen.page').then((m) => m.AlertsGenPage),
  },
  {
    path: 'respond',
    // Responder map dashboard; requires both authentication and responder permissions.
    canActivate: [authGuard, responderGuard],
    loadComponent: () => import('./pages/responder/responder.page').then((m) => m.ResponderPage),
  },
  {
    path: '**',
    redirectTo: '',
  },
];
