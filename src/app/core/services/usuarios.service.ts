import { Injectable, signal } from '@angular/core';
import { Usuario } from '../models/usuario.models';
import { descargarArchivo } from '../utils/descargar-archivo';
import { filtrarOrdenarUsuarios } from '../utils/tabla-usuarios';
import { PantallaBase } from './pantalla-base';

@Injectable({ providedIn: 'root' })
export class UsuariosService extends PantallaBase
{
    readonly usuarios = signal<Usuario[]>([]);
    nuevo = { usuario: '', nombre: '', password: '', rol: '', esNacional: false, idEntidad: 0 };
    async verUsuarios() { this.ir('usuarios'); await this.ejecutar(async () => this.usuarios.set(await this.api.get<Usuario[]>('usuarios', this.token()))); }
    modalUsuario = false;
    usuarioEditar: number | null = null;
    estadoPendiente: Usuario | null = null;
    busquedaUsuarios = '';
    filtroEstado = 'activos';
    paginaUsuarios = 1;
    ordenUsuarios = 'nombre';
    ordenAscendente = true;
    private focoAnterior: HTMLElement | null = null;
    usuariosActivos()
    {
        return this.usuarios().filter(u => u.habilitado !== false).length;
    }
    usuariosFiltrados()
    {
        return filtrarOrdenarUsuarios(this.usuarios(), this.busquedaUsuarios, this.filtroEstado, this.ordenUsuarios, this.ordenAscendente,
            rol => this.rolNombre(rol), id => this.nombreEntidad(id));
    }
    totalPaginasUsuarios()
    {
        return Math.max(1, Math.ceil(this.usuariosFiltrados().length / this.reglas.filasPagina));
    }
    usuariosPaginados()
    {
        const pagina = Math.min(this.paginaUsuarios, this.totalPaginasUsuarios());
        return this.usuariosFiltrados().slice((pagina - 1) * this.reglas.filasPagina, pagina * this.reglas.filasPagina);
    }
    ordenarUsuarios(campo: string)
    {
        this.ordenAscendente = this.ordenUsuarios === campo ? !this.ordenAscendente : true;
        this.ordenUsuarios = campo;
        this.paginaUsuarios = 1;
    }
    marcaOrden(campo: string)
    {
        return this.ordenUsuarios === campo ? (this.ordenAscendente ? ' ↑' : ' ↓') : '';
    }
    abrirUsuario(usuario?: Usuario)
    {
        if (this.ocupado() || usuario?.habilitado === false)
        {
            return;
        }
        this.establecerError('');
        this.mensaje.set('');
        this.usuarioEditar = usuario?.idUsuario ?? null;
        this.nuevo = usuario ? { usuario: usuario.usuario, nombre: usuario.nombre, password: '', rol: usuario.rol, esNacional: usuario.esNacional, idEntidad: usuario.idEntidad ?? 0 } : { usuario: '', nombre: '', password: '', rol: '', esNacional: false, idEntidad: 0 };
        if (!usuario)
        {
            this.nuevo.rol = this.roles.find(x => x.predeterminado)?.clave ?? '';
            this.cambiarRol();
        }
        this.focoAnterior = document.activeElement as HTMLElement;
        this.modalUsuario = true;
        setTimeout(() => document.querySelector<HTMLInputElement>('#usuario-nombre')?.focus());
    }
    cerrarUsuario()
    {
        if (this.ocupado())
        {
            return;
        }
        this.modalUsuario = false;
        this.estadoPendiente = null;
        this.nuevo.password = '';
        this.focoAnterior?.focus();
    }
    tecladoDialogo(event: KeyboardEvent)
    {
        if (!this.modalUsuario && !this.estadoPendiente)
        {
            return;
        }
        if (event.key === 'Escape')
        {
            this.cerrarUsuario();
        }
        if (event.key === 'Tab')
        {
            const dialogo = document.querySelector(this.modalUsuario ? '.usuario-drawer' : '.estado-dialog');
            const campos = Array.from(dialogo?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled)') || []);
            const primero = campos[0];
            const ultimo = campos[campos.length - 1];
            if (primero && ((event.shiftKey && document.activeElement === primero) || (!event.shiftKey && document.activeElement === ultimo)))
            {
                event.preventDefault();
                (event.shiftKey ? ultimo : primero).focus();
            }
        }
    }
    formularioUsuarioValido()
    {
        return !!this.rolSeleccionado() && !!this.nuevo.usuario.trim() && !!this.nuevo.nombre.trim() && (!!this.usuarioEditar || this.nuevo.password.length >= this.reglas.passwordMinimo) && (!this.nuevo.password || this.nuevo.password.length >= this.reglas.passwordMinimo) && new TextEncoder().encode(this.nuevo.password).length <= this.reglas.passwordMaximoBytes && this.nuevo.usuario.trim().length <= this.reglas.usuarioMaximo && this.nuevo.nombre.trim().length <= this.reglas.nombreMaximo && (this.nuevo.esNacional || this.nuevo.idEntidad > 0);
    }
    async guardarUsuario()
    {
        await this.ejecutar(async () => {
            const body = { ...this.nuevo, idEntidad: this.nuevo.esNacional ? null : Number(this.nuevo.idEntidad) || null };
            if (this.usuarioEditar)
            {
                await this.api.put(`usuarios/${this.usuarioEditar}`, body, this.token());
            }
            else
            {
                await this.api.post('usuarios', body, this.token());
            }
            const lista = await this.api.get<Usuario[]>('usuarios', this.token());
            this.usuarios.set(lista);
            const sesion = this.sesion();
            const actual = lista.find(u => u.idUsuario === sesion?.usuario.idUsuario);
            if (sesion && actual)
            {
                const actualizada = { ...sesion, usuario: actual };
                this.sesion.set(actualizada);
                sessionStorage.setItem('ddcp.sesion', JSON.stringify(actualizada));
            }
            this.modalUsuario = false;
            this.nuevo.password = '';
            this.mensaje.set(this.usuarioEditar ? 'Usuario actualizado.' : 'Usuario creado con acceso a DDCP.');
            this.focoAnterior?.focus();
        });
    }
    rolSeleccionado() { return this.roles.find(x => x.clave === this.nuevo.rol); }
    descripcionPermisos()
    {
        const rol = this.rolSeleccionado();
        if (!rol) return 'Seleccione un rol del catálogo.';
        return [rol.puedeAdministrarUsuarios ? 'Administración de usuarios' : '', rol.puedeCargar ? 'Carga de archivos' : '', 'Consulta de información'].filter(Boolean).join(' · ');
    }
    cambiarRol()
    {
        if (this.rolSeleccionado()?.nacionalObligatorio)
        {
            this.nuevo.esNacional = true;
        }
    }
    pedirEstado(usuario: Usuario)
    {
        if (this.ocupado() || usuario.idUsuario === this.sesion()?.usuario.idUsuario)
        {
            return;
        }
        this.establecerError('');
        this.focoAnterior = document.activeElement as HTMLElement;
        this.estadoPendiente = usuario;
        setTimeout(() => document.querySelector<HTMLButtonElement>('.estado-dialog button')?.focus());
    }
    async confirmarEstado()
    {
        const usuario = this.estadoPendiente;
        if (!usuario)
        {
            return;
        }
        await this.ejecutar(async () => {
            const habilitado = usuario.habilitado === false;
            await this.api.put(`usuarios/${usuario.idUsuario}/estado`, { habilitado }, this.token());
            this.usuarios.set(await this.api.get<Usuario[]>('usuarios', this.token()));
            this.estadoPendiente = null;
            this.paginaUsuarios = 1;
            this.mensaje.set(habilitado ? 'Usuario activado.' : 'Usuario deshabilitado.');
            this.focoAnterior?.focus();
        });
    }
    async exportarUsuarios()
    {
        await this.ejecutar(async () => {
            const blob = await this.api.blob('usuarios/exportar', this.token());
            descargarArchivo(blob, `${this.claveModulo()}_usuarios.xlsx`);
        });
    }
    constructor()
    {
        super();
        this.session.alSalir(() => { this.usuarios.set([]); this.modalUsuario = false; this.estadoPendiente = null; this.nuevo.password = ''; });
    }
}

