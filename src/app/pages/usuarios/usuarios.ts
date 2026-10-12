import { Component, HostListener, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UsuariosService } from '../../core/services/usuarios.service';

@Component({ selector: 'app-usuarios', standalone: true, imports: [CommonModule, FormsModule], templateUrl: './usuarios.html', styles: [':host { display: contents; }'] })
export class Usuarios
{
    readonly vm = inject(UsuariosService);
    @HostListener('document:keydown', ['$event'])
    tecladoDialogo(event: KeyboardEvent) { this.vm.tecladoDialogo(event); }
}
