import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DdcpConsultaService } from '../../core/services/ddcp-consulta.service';

@Component({ selector: 'app-consulta', standalone: true, imports: [CommonModule, FormsModule], templateUrl: './consulta.html', styles: [':host { display: contents; }'] })
export class Consulta
{
    readonly vm = inject(DdcpConsultaService);
}
