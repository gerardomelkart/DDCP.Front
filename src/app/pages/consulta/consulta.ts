import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DdcpConsultaService } from '../../core/services/ddcp-consulta.service';

@Component({ selector: 'app-consulta', standalone: true, imports: [CommonModule, FormsModule], templateUrl: './consulta.html', styles: [':host { display: contents; }'] })
export class Consulta implements OnInit, OnDestroy
{
    readonly vm = inject(DdcpConsultaService);
    ngOnInit() { void this.vm.buscar(); }
    ngOnDestroy() { this.vm.detener(); }
}

