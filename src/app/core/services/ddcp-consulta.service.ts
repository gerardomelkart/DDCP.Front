import { Injectable, signal } from '@angular/core';
import { Consulta } from '../models/consulta.models';
import { FiltrosConsulta } from '../models/filtros-consulta.models';
import { rutaConsulta } from '../utils/ruta-consulta';
import { descargarArchivo } from '../utils/descargar-archivo';
import { PantallaBase } from './pantalla-base';

@Injectable({ providedIn: 'root' })
export class DdcpConsultaService extends PantallaBase
{
    readonly consulta = signal<Consulta | null>(null);
    consultaAnio = new Date().getFullYear();
    consultaMes = 0;
    consultaEntidad = 0;
    private consultaAplicada: FiltrosConsulta | null = null;
    async buscar()
    {
        await this.ejecutar(async () => {
            const filtros = { anio: this.consultaAnio, mes: this.consultaMes, entidad: this.consultaEntidad };
            const path = rutaConsulta('ddcp/datos', filtros);
            const datos = await this.api.get<Consulta>(path, this.token());
            this.consultaAplicada = filtros;
            this.consulta.set(datos);
        });
    }
    async exportar()
    {
        await this.ejecutar(async () => {
            const filtros = this.consultaAplicada;
            if (!filtros || !this.consulta()?.filas.length)
            {
                return;
            }
            const blob = await this.api.blob(rutaConsulta('ddcp/datos/excel', filtros), this.token());
            const periodo = filtros.mes ? `${filtros.anio}_${String(filtros.mes).padStart(2, '0')}` : String(filtros.anio);
            const entidad = filtros.entidad || this.sesion()?.usuario.idEntidad;
            const alcance = entidad ? `entidad_${entidad}` : 'nacional';
            descargarArchivo(blob, `DDCP_${periodo}_${alcance}.xlsx`);
        });
    }
    constructor()
    {
        super();
        this.session.alSalir(() => this.consulta.set(null));
    }
}
