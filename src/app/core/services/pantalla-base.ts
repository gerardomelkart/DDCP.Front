import { inject, Injector } from '@angular/core';
import { Api } from './api.service';
import { Pagina, SessionService } from './session.service';

/** Estado de sesión y operaciones comunes de las pantallas de DDCP. */
export abstract class PantallaBase
{
    protected readonly session = inject(SessionService);
    protected readonly api = inject(Api);
    protected readonly injector = inject(Injector);
    readonly sesion = this.session.sesion;
    readonly ocupado = this.session.ocupado;
    readonly mensaje = this.session.mensaje;
    readonly error = this.session.error;
    readonly entidades = this.session.entidades;
    get meses() { return this.session.meses; }
    get roles() { return this.session.roles; }
    get reglas() { return this.session.reglas; }
    nombreModulo() { return this.session.nombreModulo(); }
    claveModulo() { return this.session.claveModulo(); }
    get pagina() { return this.session.pagina(); }
    protected token() { return this.session.token(); }
    protected ejecutar(action: () => Promise<void>) { return this.session.ejecutar(action); }
    protected establecerError(mensaje: string) { this.session.establecerError(mensaje); }
    protected ir(pagina: Pagina) { this.session.ir(pagina); }
    nombreEntidad(id: number | null) { return this.session.nombreEntidad(id); }
    rolNombre(rol: string) { return this.session.rolNombre(rol); }
}

