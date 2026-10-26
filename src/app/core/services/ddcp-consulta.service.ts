import { computed, Injectable, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Consulta } from '../models/consulta.models';
import { FiltrosConsulta } from '../models/filtros-consulta.models';
import { rutaConsulta } from '../utils/ruta-consulta';
import { descargarArchivo } from '../utils/descargar-archivo';
import { ColumnaConsulta, filtrosVacios, filtrarOrdenarConsulta } from '../utils/tabla-consulta';
import { PantallaBase } from './pantalla-base';

@Injectable({ providedIn: 'root' })
export class DdcpConsultaService extends PantallaBase
{
    readonly consulta = signal<Consulta | null>(null);
    readonly consultando = signal(false);
    readonly filtrosColumnas = signal(filtrosVacios());
    readonly orden = signal<ColumnaConsulta>('anio');
    readonly ascendente = signal(true);
    readonly columnas: { clave: ColumnaConsulta; nombre: string; numerica: boolean; }[] = [
        { clave: 'anio', nombre: 'Año', numerica: false },
        { clave: 'mes', nombre: 'Mes', numerica: false },
        { clave: 'entidad', nombre: 'Entidad', numerica: false },
        { clave: 'dispositivos', nombre: 'Dispositivos', numerica: true },
        { clave: 'personas', nombre: 'Personas', numerica: true }
    ];
    readonly filasVisibles = computed(() => filtrarOrdenarConsulta(this.consulta()?.filas ?? [], this.meses, this.filtrosColumnas(), this.orden(), this.ascendente()));
    readonly totalDispositivos = computed(() => this.filasVisibles().reduce((suma, fila) => suma + BigInt(fila.dispositivos), 0n).toString());
    readonly totalPersonas = computed(() => this.filasVisibles().reduce((suma, fila) => suma + fila.personas, 0));
    consultaAnio = new Date().getFullYear();
    consultaMes = 0;
    consultaEntidad = 0;
    private consultaAplicada: FiltrosConsulta | null = null;
    private solicitud = 0;
    private temporizador?: ReturnType<typeof setTimeout>;

    cambiarFiltros()
    {
        this.detener();
        this.consulta.set(null);
        this.consultaAplicada = null;
        if (!Number.isInteger(this.consultaAnio) || this.consultaAnio < this.reglas.anioMinimo || this.consultaAnio > this.reglas.anioMaximo) return;
        this.consultando.set(true);
        this.temporizador = setTimeout(() => void this.buscar(), 300);
    }
    async buscar()
    {
        clearTimeout(this.temporizador);
        const solicitud = ++this.solicitud;
        this.consulta.set(null);
        this.consultaAplicada = null;
        if (!Number.isInteger(this.consultaAnio) || this.consultaAnio < this.reglas.anioMinimo || this.consultaAnio > this.reglas.anioMaximo)
        {
            this.consultando.set(false);
            return;
        }
        const filtros = { anio: this.consultaAnio, mes: this.consultaMes, entidad: this.consultaEntidad };
        this.consultando.set(true);
        this.establecerError('');
        try
        {
            const token = this.token();
            const datos = await this.api.get<Consulta>(rutaConsulta('ddcp/datos', filtros), token);
            if (solicitud !== this.solicitud || this.sesion()?.token !== token) return;
            this.consultaAplicada = filtros;
            this.consulta.set(datos);
        }
        catch (error)
        {
            if (solicitud !== this.solicitud) return;
            if (error instanceof HttpErrorResponse && error.status === 401) this.session.salir();
            this.establecerError(error instanceof HttpErrorResponse ? error.error?.mensaje || 'No fue posible consultar la información.' : error instanceof Error ? error.message : 'No fue posible consultar la información.');
        }
        finally
        {
            if (solicitud === this.solicitud) this.consultando.set(false);
        }
    }
    detener()
    {
        clearTimeout(this.temporizador);
        this.solicitud++;
        this.consultando.set(false);
    }
    filtrarColumna(clave: ColumnaConsulta, texto: string)
    {
        this.filtrosColumnas.update(actual => ({ ...actual, [clave]: texto }));
    }
    ordenar(clave: ColumnaConsulta)
    {
        this.ascendente.set(this.orden() === clave ? !this.ascendente() : true);
        this.orden.set(clave);
    }
    limpiarColumnas() { this.filtrosColumnas.set(filtrosVacios()); }
    async exportar()
    {
        await this.ejecutar(async () => {
            const filtros = this.consultaAplicada;
            if (!filtros || this.consultando() || !this.filasVisibles().length) return;
            const parametros = new URLSearchParams();
            for (const [clave, valor] of Object.entries(this.filtrosColumnas())) parametros.set('filtro' + clave[0].toUpperCase() + clave.slice(1), valor);
            parametros.set('orden', this.orden());
            parametros.set('ascendente', String(this.ascendente()));
            const blob = await this.api.blob(rutaConsulta('ddcp/datos/excel', filtros) + '&' + parametros, this.token());
            const periodo = filtros.mes ? `${filtros.anio}_${String(filtros.mes).padStart(2, '0')}` : String(filtros.anio);
            const entidad = filtros.entidad || this.sesion()?.usuario.idEntidad;
            descargarArchivo(blob, `${this.claveModulo()}_${periodo}_${entidad ? `entidad_${entidad}` : 'nacional'}.xlsx`);
        });
    }
    constructor()
    {
        super();
        this.session.alSalir(() => {
            this.detener(); this.consulta.set(null); this.consultaAplicada = null;
            this.limpiarColumnas(); this.orden.set('anio'); this.ascendente.set(true);
            this.consultaAnio = new Date().getFullYear(); this.consultaMes = 0; this.consultaEntidad = 0;
        });
    }
}
