import { afterNextRender, Injectable, Injector, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Api } from './api.service';
import { Sesion } from '../models/sesion.models';
import { Entidad } from '../models/entidad.models';
import { Consulta } from '../models/consulta.models';
import { Catalogos } from '../models/catalogos.models';

export type Pagina = 'inicio' | 'consulta' | 'carga' | 'usuarios';

@Injectable({ providedIn: 'root' })
export class SessionService
{
    readonly sesion = signal<Sesion | null>(this.recuperar());
    readonly ocupado = signal(false);
    readonly mensaje = signal('');
    readonly error = signal('');
    readonly entidades = signal<Entidad[]>([]);
    readonly menuAbierto = signal(false);
    readonly identidad = signal<{ modulo: string; nombreModulo: string; } | null>(null);
    readonly catalogos = signal<Catalogos | null>(null);
    get meses() { return this.catalogos()?.meses.map(x => x.nombre) ?? []; }
    get roles() { return this.catalogos()?.roles ?? []; }
    get reglas()
    {
        const catalogos = this.catalogos();
        if (!catalogos) throw new Error('No se cargaron los catálogos y la configuración del sistema.');
        return catalogos.reglas;
    }
    nombreModulo() { return this.catalogos()?.nombreModulo ?? this.identidad()?.nombreModulo ?? ''; }
    claveModulo() { return this.catalogos()?.modulo ?? this.identidad()?.modulo ?? ''; }
    async cargarCatalogos()
    {
        const token = this.token();
        const catalogos = await this.api.get<Catalogos>('catalogos', token);
        const entidades = await this.api.get<Entidad[]>('ddcp/entidades', token);
        const actual = this.sesion();
        if (!actual || this.token() !== token) return;
        const sesion = { ...actual, usuario: { ...actual.usuario, ...catalogos.usuario } };
        this.sesion.set(sesion);
        sessionStorage.setItem('ddcp.sesion', JSON.stringify(sesion));
        this.entidades.set(entidades);
        this.catalogos.set(catalogos);
        document.title = `${catalogos.modulo} · ${catalogos.nombreModulo}`;
    }
    recuperar(): Sesion | null {
        try { const data = JSON.parse(sessionStorage.getItem('ddcp.sesion') || 'null') as Sesion | null; return data?.token && Date.parse(data.expira) > Date.now() ? data : null; }
        catch { return null; }
    }
    token(): string {
        const actual = this.sesion();
        if (!actual || Date.parse(actual.expira) <= Date.now()) { this.salir(); throw new Error('Su sesión terminó. Inicie sesión nuevamente.'); }
        return actual.token;
    }
    establecerError(mensaje: string)
    {
        this.error.set(mensaje);
        if (!mensaje)
        {
            return;
        }
        afterNextRender(() => {
            if (this.error() !== mensaje)
            {
                return;
            }
            const alerta = document.querySelector<HTMLElement>('.usuario-drawer [role="alert"], .estado-dialog [role="alert"]')
                ?? document.querySelector<HTMLElement>('[role="alert"]');
            const reducirMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            alerta?.scrollIntoView({ block: 'center', behavior: reducirMovimiento ? 'auto' : 'smooth' });
        }, { injector: this.injector });
    }
    async ejecutar(action: () => Promise<void>) {
        if (this.ocupado()) return;
        this.ocupado.set(true); this.establecerError(''); this.mensaje.set('');
        try { await action(); }
        catch (error) {
            if (error instanceof HttpErrorResponse) { this.establecerError(error.error?.mensaje || (error.status === 0 ? 'No fue posible conectar con el sistema. Intente nuevamente en unos momentos.' : 'No fue posible completar la operación.')); if (error.status === 401) this.salir(); }
            else this.establecerError(error instanceof Error ? error.message : 'Error de operación.');
        }
        finally { this.ocupado.set(false); }
    }
    async inicializar()
    {
        await this.ejecutar(async () => {
            try { await this.cargarCatalogos(); }
            catch (error) { this.salir(); throw error; }
        });
    }
    puedeCargar() { return this.sesion()?.usuario.puedeCargar === true; }
    puedeAdministrarUsuarios() { return this.sesion()?.usuario.puedeAdministrarUsuarios === true; }
    rolNombre(rol: string) { return this.roles.find(x => x.clave === rol)?.nombre ?? rol; }
    nombreEntidad(id: number | null) { return this.entidades().find(x => x.idEntidad === id)?.nombreEntidad || 'Entidad asignada'; }
    readonly pagina = signal<Pagina>('inicio');
    private readonly limpieza: Array<() => void> = [];

    constructor(private api: Api, private injector: Injector)
    {
        void this.api.publico<{ modulo: string; nombreModulo: string; }>('sistema').then(x => {
            this.identidad.set(x);
            document.title = `${x.modulo} · ${x.nombreModulo}`;
        }).catch(() => {});
        if (this.sesion()) void this.inicializar();
    }
    alSalir(limpiar: () => void) { this.limpieza.push(limpiar); }
    salir()
    {
        sessionStorage.removeItem('ddcp.sesion');
        this.sesion.set(null);
        this.entidades.set([]);
        this.catalogos.set(null);
        this.pagina.set('inicio');
        this.menuAbierto.set(false);
        for (const limpiar of this.limpieza) limpiar();
    }
    ir(pagina: Pagina)
    {
        this.pagina.set(pagina);
        this.menuAbierto.set(false);
    }
}

