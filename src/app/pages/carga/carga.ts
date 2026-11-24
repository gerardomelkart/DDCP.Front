import { afterRenderEffect, Component, ElementRef, inject, OnDestroy, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DdcpCargaService } from '../../core/services/ddcp-carga.service';

@Component({ selector: 'app-carga', standalone: true, imports: [CommonModule, FormsModule], templateUrl: './carga.html', styleUrl: './carga.css' })
export class Carga implements OnDestroy
{
    readonly vm = inject(DdcpCargaService);
    readonly dialogo = viewChild<ElementRef<HTMLDialogElement>>('avisoCarga');

    constructor()
    {
        afterRenderEffect(() => {
            const aviso = this.vm.aviso();
            const dialogo = this.dialogo()?.nativeElement;
            if (!dialogo) return;
            if (aviso && !dialogo.open) dialogo.showModal();
            if (!aviso && dialogo.open) dialogo.close();
        });
    }
    cerrarAviso()
    {
        // Cerrar primero libera el foco del modal antes del scroll a la confirmación.
        this.dialogo()?.nativeElement.close();
        this.vm.cerrarAviso();
    }
    ngOnDestroy()
    {
        this.vm.aviso.set(null);
    }
}
