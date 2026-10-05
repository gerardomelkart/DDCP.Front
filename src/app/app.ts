import { afterNextRender, Component, HostListener, Injector, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Api, Consulta, Entidad, Previa, Sesion, Usuario } from './api';

@Component({ selector: 'app-root', standalone: true, imports: [CommonModule, FormsModule], templateUrl: './app.html' })
export class App {
    readonly sesion = signal<Sesion | null>(this.recuperar());
    readonly ocupado = signal(false);
    readonly mensaje = signal('');
    readonly error = signal('');
    readonly entidades = signal<Entidad[]>([]);
    readonly previa = signal<Previa | null>(null);
    readonly consulta = signal<Consulta | null>(null);
    readonly usuarios = signal<Usuario[]>([]);
    readonly arrastrando = signal(false);
    readonly menuAbierto = signal(false);
    readonly meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    pagina: 'consulta' | 'carga' | 'usuarios' = 'consulta';
    loginUsuario = '';
    loginPassword = '';
    anio = new Date().getFullYear();
    mes = new Date().getMonth() + 1;
    consultaAnio = this.anio;
    consultaMes = 0;
    consultaEntidad = 0;
    archivo: File | null = null;
    private consultaAplicada: { anio: number; mes: number; entidad: number } | null = null;
    nuevo = { usuario: '', nombre: '', password: '', rol: 'ENLACE_ESTATAL', esNacional: false, idEntidad: 0 };
    constructor(private api: Api, private injector: Injector) { if (this.sesion()) void this.inicializar(); }
    private recuperar(): Sesion | null {
        try { const data = JSON.parse(sessionStorage.getItem('ddcp.sesion') || 'null') as Sesion | null; return data?.token && Date.parse(data.expira) > Date.now() ? data : null; }
        catch { return null; }
    }
    private token(): string {
        const actual = this.sesion();
        if (!actual || Date.parse(actual.expira) <= Date.now()) { this.salir(); throw new Error('Su sesión terminó. Inicie sesión nuevamente.'); }
        return actual.token;
    }
    private async ejecutar(action: () => Promise<void>) {
        if (this.ocupado()) return;
        this.ocupado.set(true); this.error.set(''); this.mensaje.set('');
        try { await action(); }
        catch (error) {
            if (error instanceof HttpErrorResponse) { this.error.set(error.error?.mensaje || (error.status === 0 ? 'No fue posible conectar con el sistema. Intente nuevamente en unos momentos.' : 'No fue posible completar la operación.')); if (error.status === 401) this.salir(); }
            else this.error.set(error instanceof Error ? error.message : 'Error de operación.');
        }
        finally { this.ocupado.set(false); }
    }
    async entrar() {
        await this.ejecutar(async () => {
            const sesion = await this.api.login(this.loginUsuario, this.loginPassword);
            this.loginPassword = ''; this.sesion.set(sesion); sessionStorage.setItem('ddcp.sesion', JSON.stringify(sesion));
            this.entidades.set(await this.api.get<Entidad[]>('ddcp/entidades', this.token()));
        });
    }
    async inicializar() { await this.ejecutar(async () => this.entidades.set(await this.api.get<Entidad[]>('ddcp/entidades', this.token()))); }
    salir() { sessionStorage.removeItem('ddcp.sesion'); this.sesion.set(null); this.previa.set(null); this.consulta.set(null); this.entidades.set([]); this.usuarios.set([]); this.archivo = null; this.pagina = 'consulta'; this.menuAbierto.set(false); this.arrastrando.set(false); this.modalUsuario = false; this.estadoPendiente = null; this.nuevo.password = ''; }
    puedeCargar() { return this.sesion()?.usuario.rol !== 'CONSULTA'; }
    seleccionarArchivo(event: Event) { const input = event.target as HTMLInputElement; if (input.files?.length) this.recibirArchivo(Array.from(input.files)); input.value = ''; }
    private recibirArchivo(files: File[]) {
        if (this.ocupado() || this.previa()) return;
        this.error.set(''); this.mensaje.set('');
        if (files.length !== 1) { this.error.set('Seleccione un solo archivo Excel para la carga.'); return; }
        const file = files[0];
        if (!file.name.toLowerCase().endsWith('.xlsx')) { this.error.set('El archivo debe tener formato .xlsx.'); return; }
        if (!file.size || file.size > 10 * 1024 * 1024) { this.error.set('El archivo debe tener contenido y pesar como máximo 10 MB.'); return; }
        this.archivo = file;
    }
    arrastrarArchivo(event: DragEvent) { event.preventDefault(); event.stopPropagation(); if (this.ocupado() || this.previa()) return; this.arrastrando.set(true); if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'; }
    salirArrastre(event: DragEvent) { event.preventDefault(); if (event.relatedTarget instanceof Node && (event.currentTarget as HTMLElement).contains(event.relatedTarget)) return; this.arrastrando.set(false); }
    soltarArchivo(event: DragEvent) { event.preventDefault(); event.stopPropagation(); this.arrastrando.set(false); this.recibirArchivo(Array.from(event.dataTransfer?.files || [])); }
    quitarArchivo() { if (!this.ocupado() && !this.previa()) { this.archivo = null; this.error.set(''); } }
    tamanoArchivo() { return this.archivo ? (this.archivo.size / 1024 / 1024 < 1 ? `${Math.ceil(this.archivo.size / 1024)} KB` : `${(this.archivo.size / 1024 / 1024).toFixed(1)} MB`) : ''; }
    rolNombre(rol: string) { return rol === 'SUPER_USUARIO' ? 'Super usuario' : rol === 'ENLACE_ESTATAL' ? 'Enlace' : 'Consulta'; }
    nombreEntidad(id: number | null) { return this.entidades().find(x => x.idEntidad === id)?.nombreEntidad || 'Entidad asignada'; }
    ir(pagina: 'consulta' | 'carga' | 'usuarios') { this.pagina = pagina; this.menuAbierto.set(false); }
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
            this.consulta.set(null);
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
            this.descargar(blob, `DDCP_${this.anio}_${String(this.mes).padStart(2, '0')}.xlsx`);
        });
    }
    async buscar()
    {
        await this.ejecutar(async () => {
            const filtros = { anio: this.consultaAnio, mes: this.consultaMes, entidad: this.consultaEntidad };
            const path = this.rutaConsulta('ddcp/datos', filtros);
            const datos = await this.api.get<Consulta>(path, this.token());
            this.consultaAplicada = filtros;
            this.consulta.set(datos);
        });
    }
    private rutaConsulta(path: string, filtros: { anio: number; mes: number; entidad: number })
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
    async exportar()
    {
        await this.ejecutar(async () => {
            const filtros = this.consultaAplicada;
            if (!filtros || !this.consulta()?.filas.length)
            {
                return;
            }
            const blob = await this.api.blob(this.rutaConsulta('ddcp/datos/excel', filtros), this.token());
            const periodo = filtros.mes ? `${filtros.anio}_${String(filtros.mes).padStart(2, '0')}` : String(filtros.anio);
            const entidad = filtros.entidad || this.sesion()?.usuario.idEntidad;
            const alcance = entidad ? `entidad_${entidad}` : 'nacional';
            this.descargar(blob, `DDCP_${periodo}_${alcance}.xlsx`);
        });
    }
    private descargar(blob: Blob, nombre: string) { const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = nombre; link.click(); URL.revokeObjectURL(url); }
    totalPreviaDispositivos() { return (this.previa()?.filas || []).reduce((sum, fila) => sum + BigInt(fila.dispositivos), 0n).toString(); }
    totalPreviaPersonas() { return (this.previa()?.filas || []).reduce((sum, fila) => sum + fila.personas, 0); }
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
        const texto = this.busquedaUsuarios.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        const lista = this.usuarios().filter(u => {
            const estado = u.habilitado !== false;
            const valor = `${u.nombre} ${u.usuario} ${this.rolNombre(u.rol)} ${u.esNacional ? 'Nacional' : this.nombreEntidad(u.idEntidad)}`;
            const coincide = valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(texto);
            return coincide && (this.filtroEstado === 'todos' || (this.filtroEstado === 'activos' ? estado : !estado));
        });
        const valorOrden = (u: Usuario) => {
            switch (this.ordenUsuarios)
            {
                case 'usuario': return u.usuario;
                case 'rol': return this.rolNombre(u.rol);
                case 'entidad': return u.esNacional ? 'Nacional' : this.nombreEntidad(u.idEntidad);
                case 'estado': return u.habilitado !== false ? 'Activo' : 'Inactivo';
                default: return u.nombre;
            }
        };
        return lista.sort((a, b) => valorOrden(a).localeCompare(valorOrden(b), 'es', { sensitivity: 'base' }) * (this.ordenAscendente ? 1 : -1));
    }
    totalPaginasUsuarios()
    {
        return Math.max(1, Math.ceil(this.usuariosFiltrados().length / 10));
    }
    usuariosPaginados()
    {
        const pagina = Math.min(this.paginaUsuarios, this.totalPaginasUsuarios());
        return this.usuariosFiltrados().slice((pagina - 1) * 10, pagina * 10);
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
        this.error.set('');
        this.mensaje.set('');
        this.usuarioEditar = usuario?.idUsuario ?? null;
        this.nuevo = usuario ? { usuario: usuario.usuario, nombre: usuario.nombre, password: '', rol: usuario.rol, esNacional: usuario.esNacional, idEntidad: usuario.idEntidad ?? 0 } : { usuario: '', nombre: '', password: '', rol: 'ENLACE_ESTATAL', esNacional: false, idEntidad: 0 };
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
    @HostListener('document:keydown', ['$event'])
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
        return !!this.nuevo.usuario.trim() && !!this.nuevo.nombre.trim() && (!!this.usuarioEditar || this.nuevo.password.length >= 8) && (!this.nuevo.password || this.nuevo.password.length >= 8) && (this.nuevo.esNacional || this.nuevo.idEntidad > 0);
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
    cambiarRol()
    {
        if (this.nuevo.rol === 'SUPER_USUARIO')
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
        this.error.set('');
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
            this.descargar(blob, 'DDCP_usuarios.xlsx');
        });
    }
}
