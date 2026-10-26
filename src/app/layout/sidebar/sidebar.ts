import { VERSION } from '../../core/version';
import { Component, inject } from '@angular/core';
import { SessionService } from '../../core/services/session.service';
import { UsuariosService } from '../../core/services/usuarios.service';

@Component({ selector: 'app-sidebar', standalone: true, templateUrl: './sidebar.html', styleUrl: './sidebar.css' })
export class Sidebar
{
    readonly vm = inject(SessionService);
    readonly version = VERSION;
    private readonly usuarios = inject(UsuariosService);
    verUsuarios() { return this.usuarios.verUsuarios(); }
}

