import { Inicio } from '../../pages/inicio/inicio';
import { Component, inject } from '@angular/core';
import { SessionService } from '../../core/services/session.service';
import { Topbar } from '../topbar/topbar';
import { Sidebar } from '../sidebar/sidebar';
import { Consulta } from '../../pages/consulta/consulta';
import { Carga } from '../../pages/carga/carga';
import { Usuarios } from '../../pages/usuarios/usuarios';

@Component({ selector: 'app-main-layout', standalone: true, imports: [Topbar, Sidebar, Inicio, Consulta, Carga, Usuarios], templateUrl: './main-layout.html', styles: [':host { display: contents; }'] })
export class MainLayout { readonly vm = inject(SessionService); }

