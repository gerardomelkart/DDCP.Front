import { Component, inject } from '@angular/core';
import { SessionService } from './core/services/session.service';
import { MainLayout } from './layout/main-layout/main-layout';
import { Login } from './pages/login/login';
import { Icons } from './shared/icons/icons';

@Component({ selector: 'app-root', standalone: true, imports: [MainLayout, Login, Icons], templateUrl: './app.html' })
export class App { readonly session = inject(SessionService); }
