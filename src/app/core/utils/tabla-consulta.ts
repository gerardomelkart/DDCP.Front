import { Registro } from '../models/registro.models';

export type ColumnaConsulta = 'anio' | 'mes' | 'entidad' | 'dispositivos' | 'personas';
export type FiltrosColumnas = Record<ColumnaConsulta, string>;
export const filtrosVacios = (): FiltrosColumnas => ({ anio: '', mes: '', entidad: '', dispositivos: '', personas: '' });
const normalizar = (valor: string) => valor.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function filtrarOrdenarConsulta(filas: Registro[], meses: string[], filtros: FiltrosColumnas, orden: ColumnaConsulta, ascendente: boolean): Registro[]
{
    const textos = Object.fromEntries(Object.entries(filtros).map(([clave, valor]) => [clave, normalizar(valor)])) as FiltrosColumnas;
    const lista = filas.filter(fila => {
        const valores: FiltrosColumnas = {
            anio: String(fila.anio), mes: meses[fila.mes - 1] ?? '', entidad: fila.nombreEntidad,
            dispositivos: fila.dispositivos, personas: String(fila.personas)
        };
        return (Object.keys(textos) as ColumnaConsulta[]).every(clave => normalizar(valores[clave]).includes(textos[clave]));
    });
    const comparar = (a: Registro, b: Registro) => {
        switch (orden)
        {
            case 'entidad': return a.nombreEntidad.localeCompare(b.nombreEntidad, 'es', { sensitivity: 'base' });
            case 'dispositivos': return BigInt(a.dispositivos) < BigInt(b.dispositivos) ? -1 : BigInt(a.dispositivos) > BigInt(b.dispositivos) ? 1 : 0;
            case 'personas': return a.personas - b.personas;
            case 'mes': return a.mes - b.mes;
            default: return a.anio - b.anio;
        }
    };
    return lista.sort((a, b) => comparar(a, b) * (ascendente ? 1 : -1) || a.anio - b.anio || a.mes - b.mes || a.idEntidad - b.idEntidad);
}
