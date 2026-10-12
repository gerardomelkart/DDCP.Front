import { Component, inject } from '@angular/core';
import { SessionService } from '../../core/services/session.service';
import { UsuariosService } from '../../core/services/usuarios.service';

@Component({ selector: 'app-sidebar', standalone: true, templateUrl: './sidebar.html', styles: [':host { display: contents; }'] })
export class Sidebar
{
    readonly vm = inject(SessionService);
    private readonly usuarios = inject(UsuariosService);
    verUsuarios() { return this.usuarios.verUsuarios(); }
}
