import { Component, inject } from '@angular/core';
import { SessionService } from '../../core/services/session.service';
import { UsuariosService } from '../../core/services/usuarios.service';

@Component({ selector: 'app-inicio', standalone: true, templateUrl: './inicio.html', styleUrl: './inicio.css' })
export class Inicio
{
    readonly vm = inject(SessionService);
    private readonly usuarios = inject(UsuariosService);
    verUsuarios() { return this.usuarios.verUsuarios(); }
}
