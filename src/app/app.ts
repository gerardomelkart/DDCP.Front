import { Component, signal } from '@angular/core';
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
    nuevo = { usuario: '', nombre: '', password: '', rol: 'ENLACE_ESTATAL', esNacional: false, idEntidad: 0 };
    constructor(private api: Api) { if (this.sesion()) void this.inicializar(); }
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
    salir() { sessionStorage.removeItem('ddcp.sesion'); this.sesion.set(null); this.previa.set(null); this.consulta.set(null); this.entidades.set([]); this.usuarios.set([]); this.archivo = null; this.pagina = 'consulta'; this.menuAbierto.set(false); this.arrastrando.set(false); }
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
            const data = new FormData();
            data.append('anio', String(this.anio));
            data.append('mes', String(this.mes));
            data.append('archivo', this.archivo);
            this.previa.set(await this.api.post<Previa>('ddcp/cargas/validar', data, this.token()));
        });
    }
    async confirmar() {
        await this.ejecutar(async () => {
            const previa = this.previa(); if (!previa) return;
            const response = await this.api.post<{ mensaje: string }>(`ddcp/cargas/${previa.idCarga}/confirmar`, {}, this.token());
            this.previa.set(null); this.consulta.set(null); this.mensaje.set(response.mensaje);
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
    async buscar() {
        await this.ejecutar(async () => {
            let path = `ddcp/datos?anio=${this.consultaAnio}`;
            if (this.consultaMes) path += `&mes=${this.consultaMes}`;
            if (this.consultaEntidad) path += `&idEntidad=${this.consultaEntidad}`;
            this.consulta.set(await this.api.get<Consulta>(path, this.token()));
        });
    }
    exportar() {
        const datos = this.consulta(); if (!datos) return;
        const filas = [['Año', 'Mes', 'Entidad', 'Dispositivos', 'Personas'], ...datos.filas.map(x => [x.anio, x.mes, x.nombreEntidad, x.dispositivos, x.personas])];
        const csv = '\uFEFF' + filas.map(row => row.map(x => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\r\n');
        this.descargar(new Blob([csv], { type: 'text/csv;charset=utf-8' }), 'DDCP_consulta.csv');
    }
    private descargar(blob: Blob, nombre: string) { const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = nombre; link.click(); URL.revokeObjectURL(url); }
    totalPreviaDispositivos() { return (this.previa()?.filas || []).reduce((sum, fila) => sum + BigInt(fila.dispositivos), 0n).toString(); }
    totalPreviaPersonas() { return (this.previa()?.filas || []).reduce((sum, fila) => sum + fila.personas, 0); }
    async verUsuarios() { this.ir('usuarios'); await this.ejecutar(async () => this.usuarios.set(await this.api.get<Usuario[]>('usuarios', this.token()))); }
    async crearUsuario() {
        await this.ejecutar(async () => {
            const body = { ...this.nuevo, idEntidad: this.nuevo.esNacional ? null : Number(this.nuevo.idEntidad) || null };
            await this.api.post('usuarios', body, this.token());
            this.nuevo = { usuario: '', nombre: '', password: '', rol: 'ENLACE_ESTATAL', esNacional: false, idEntidad: 0 };
            this.usuarios.set(await this.api.get<Usuario[]>('usuarios', this.token())); this.mensaje.set('Usuario creado con acceso a DDCP.');
        });
    }
    cambiarRol() { if (this.nuevo.rol === 'SUPER_USUARIO') this.nuevo.esNacional = true; }
}

