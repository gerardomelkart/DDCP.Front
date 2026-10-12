import { FiltrosConsulta } from '../models/filtros-consulta.models';

export function rutaConsulta(path: string, filtros: FiltrosConsulta)
{
    const params = new URLSearchParams({ anio: String(filtros.anio) });
    if (filtros.mes)
    {
        params.set('mes', String(filtros.mes));
    }
    if (filtros.entidad)
    {
        params.set('idEntidad', String(filtros.entidad));
    }
    return `${path}?${params}`;
}
