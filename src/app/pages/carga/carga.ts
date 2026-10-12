import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DdcpCargaService } from '../../core/services/ddcp-carga.service';

@Component({ selector: 'app-carga', standalone: true, imports: [CommonModule, FormsModule], templateUrl: './carga.html', styles: [':host { display: contents; }'] })
export class Carga
{
    readonly vm = inject(DdcpCargaService);
}
