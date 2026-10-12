import { afterNextRender, Injectable, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Previa } from '../models/previa.models';
import { descargarArchivo } from '../utils/descargar-archivo';
import { PantallaBase } from './pantalla-base';
import { DdcpConsultaService } from './ddcp-consulta.service';

@Injectable({ providedIn: 'root' })
export class DdcpCargaService extends PantallaBase
{
    readonly previa = signal<Previa | null>(null);
    readonly arrastrando = signal(false);
    anio = new Date().getFullYear();
    mes = new Date().getMonth() + 1;
    archivo: File | null = null;
    seleccionarArchivo(event: Event) { const input = event.target as HTMLInputElement; if (input.files?.length) this.recibirArchivo(Array.from(input.files)); input.value = ''; }
    private recibirArchivo(files: File[]) {
        if (this.ocupado() || this.previa()) return;
        this.establecerError(''); this.mensaje.set('');
        if (files.length !== 1) { this.establecerError('Seleccione un solo archivo Excel para la carga.'); return; }
        const file = files[0];
        if (!file.name.toLowerCase().endsWith('.xlsx')) { this.establecerError('El archivo debe tener formato .xlsx.'); return; }
        if (!file.size || file.size > 10 * 1024 * 1024) { this.establecerError('El archivo debe tener contenido y pesar como máximo 10 MB.'); return; }
        this.archivo = file;
    }
    arrastrarArchivo(event: DragEvent) { event.preventDefault(); event.stopPropagation(); if (this.ocupado() || this.previa()) return; this.arrastrando.set(true); if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'; }
    salirArrastre(event: DragEvent) { event.preventDefault(); if (event.relatedTarget instanceof Node && (event.currentTarget as HTMLElement).contains(event.relatedTarget)) return; this.arrastrando.set(false); }
    soltarArchivo(event: DragEvent) { event.preventDefault(); event.stopPropagation(); this.arrastrando.set(false); this.recibirArchivo(Array.from(event.dataTransfer?.files || [])); }
    quitarArchivo() { if (!this.ocupado() && !this.previa()) { this.archivo = null; this.establecerError(''); } }
    tamanoArchivo() { return this.archivo ? (this.archivo.size / 1024 / 1024 < 1 ? `${Math.ceil(this.archivo.size / 1024)} KB` : `${(this.archivo.size / 1024 / 1024).toFixed(1)} MB`) : ''; }
    async validar() {
        await this.ejecutar(async () => {
            if (!this.archivo)
            {
                throw new Error('Seleccione el archivo Excel.');
            }
            const archivo = this.archivo;
            let contenido: ArrayBuffer;
            try
            {
                contenido = await archivo.arrayBuffer();
            }
            catch
            {
                throw new Error('No se pudo leer el archivo Excel. Si está abierto, ciérrelo; después vuelva a seleccionarlo y pulse Validar.');
            }
            // Enviar una copia en memoria evita volver a leer el archivo durante la subida.
            const copia = new Blob([contenido], { type: archivo.type });
            const data = new FormData();
            data.append('anio', String(this.anio));
            data.append('mes', String(this.mes));
            data.append('archivo', copia, archivo.name);
            try
            {
                this.previa.set(await this.api.post<Previa>('ddcp/cargas/validar', data, this.token()));
            }
            catch (error)
            {
                if (error instanceof HttpErrorResponse && error.status === 0)
                {
                    throw new Error('No se pudo enviar el archivo. Revise la conexión y, si el Excel está abierto, ciérrelo y vuelva a seleccionarlo antes de validar.');
                }
                throw error;
            }
            this.mostrarVistaPrevia();
        });
    }
    private mostrarVistaPrevia()
    {
        const idCarga = this.previa()?.idCarga;
        afterNextRender(() => {
            if (this.pagina !== 'carga' || this.previa()?.idCarga !== idCarga)
            {
                return;
            }
            const panel = document.querySelector<HTMLElement>('.preview');
            if (!panel)
            {
                return;
            }
            const encabezado = document.querySelector<HTMLElement>('.topbar');
            const alturaEncabezado = encabezado?.getBoundingClientRect().height ?? 0;
            const top = Math.max(0, window.scrollY + panel.getBoundingClientRect().top - alturaEncabezado - 16);
            const reducirMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            window.scrollTo({ top, behavior: reducirMovimiento ? 'auto' : 'smooth' });
        }, { injector: this.injector });
    }
    async confirmar()
    {
        await this.ejecutar(async () => {
            const previa = this.previa();
            if (!previa)
            {
                return;
            }
            const response = await this.api.post<{ mensaje: string }>(`ddcp/cargas/${previa.idCarga}/confirmar`, {}, this.token());
            this.archivo = null;
            this.arrastrando.set(false);
            this.previa.set(null);
            this.consultaService.consulta.set(null);
            this.mensaje.set(response.mensaje);
        });
    }
    async cancelar() {
        await this.ejecutar(async () => {
            const previa = this.previa(); if (!previa) return;
            await this.api.post(`ddcp/cargas/${previa.idCarga}/cancelar`, {}, this.token()); this.previa.set(null); this.mensaje.set('Carga cancelada.');
        });
    }
    async plantilla() {
        await this.ejecutar(async () => {
            const blob = await this.api.blob(`ddcp/plantilla?anio=${this.anio}&mes=${this.mes}`, this.token());
            descargarArchivo(blob, `DDCP_${this.anio}_${String(this.mes).padStart(2, '0')}.xlsx`);
        });
    }
    totalPreviaDispositivos() { return (this.previa()?.filas || []).reduce((sum, fila) => sum + BigInt(fila.dispositivos), 0n).toString(); }
    totalPreviaPersonas() { return (this.previa()?.filas || []).reduce((sum, fila) => sum + fila.personas, 0); }
    private readonly consultaService = inject(DdcpConsultaService);
    constructor()
    {
        super();
        this.session.alSalir(() => { this.previa.set(null); this.archivo = null; this.arrastrando.set(false); });
    }
}
