import { Injectable } from '@angular/core';
import { Entidad } from '../models/entidad.models';
import { PantallaBase } from './pantalla-base';

@Injectable({ providedIn: 'root' })
export class AuthService extends PantallaBase
{
    loginUsuario = '';
    loginPassword = '';
    async entrar() {
        await this.ejecutar(async () => {
            const sesion = await this.api.login(this.loginUsuario, this.loginPassword);
            this.loginPassword = ''; this.sesion.set(sesion); sessionStorage.setItem('ddcp.sesion', JSON.stringify(sesion));
            try { await this.session.cargarCatalogos(); }
            catch (error) { this.session.salir(); throw error; }
        });
    }

}

