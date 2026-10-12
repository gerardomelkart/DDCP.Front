import { Usuario } from '../models/usuario.models';

export function filtrarOrdenarUsuarios(usuarios: Usuario[], busqueda: string, filtroEstado: string, ordenUsuarios: string, ordenAscendente: boolean, rolNombre: (rol: string) => string, nombreEntidad: (id: number | null) => string)
{
    const texto = busqueda.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const lista = usuarios.filter(u => {
        const estado = u.habilitado !== false;
        const valor = `${u.nombre} ${u.usuario} ${rolNombre(u.rol)} ${u.esNacional ? 'Nacional' : nombreEntidad(u.idEntidad)}`;
        const coincide = valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(texto);
        return coincide && (filtroEstado === 'todos' || (filtroEstado === 'activos' ? estado : !estado));
    });
    const valorOrden = (u: Usuario) => {
        switch (ordenUsuarios)
        {
            case 'usuario': return u.usuario;
            case 'rol': return rolNombre(u.rol);
            case 'entidad': return u.esNacional ? 'Nacional' : nombreEntidad(u.idEntidad);
            case 'estado': return u.habilitado !== false ? 'Activo' : 'Inactivo';
            default: return u.nombre;
        }
    };
    return lista.sort((a, b) => valorOrden(a).localeCompare(valorOrden(b), 'es', { sensitivity: 'base' }) * (ordenAscendente ? 1 : -1));
}
