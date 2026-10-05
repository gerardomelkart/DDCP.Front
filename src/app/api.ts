import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export interface Usuario { idUsuario: number; usuario: string; nombre: string; rol: string; esNacional: boolean; idEntidad: number | null; habilitado?: boolean; }
export interface Sesion { token: string; expira: string; usuario: Usuario; }
export interface Entidad { idEntidad: number; nombreEntidad: string; nombreCorto: string | null; }
export interface Fila { idEntidad: number; nombreEntidad: string; dispositivos: string; personas: number; dispositivosAntes: string | null; personasAntes: number | null; revisionAntes: number | null; habilitadoAntes: boolean | null; }
export interface Previa { idCarga: string; anio: number; mes: number; filas: Fila[]; advertencias: string[]; }
export interface Registro { idEntidad: number; nombreEntidad: string; anio: number; mes: number; dispositivos: string; personas: number; revision: number; }
export interface Consulta { filas: Registro[]; totalDispositivos: string; totalPersonas: number; }

@Injectable({ providedIn: 'root' })
export class Api {
    // La base del sitio resuelve /api en desarrollo y /ddcp/api en producción.
    private readonly base = new URL('api/', document.baseURI).pathname.replace(/\/$/, '');
    constructor(private http: HttpClient) {}
    headers(token: string) { return new HttpHeaders({ Authorization: `Bearer ${token}` }); }
    login(usuario: string, password: string) { return firstValueFrom(this.http.post<Sesion>(`${this.base}/auth/login`, { usuario, password })); }
    get<T>(path: string, token: string) { return firstValueFrom(this.http.get<T>(`${this.base}/${path}`, { headers: this.headers(token) })); }
    post<T>(path: string, body: unknown, token: string) { return firstValueFrom(this.http.post<T>(`${this.base}/${path}`, body, { headers: this.headers(token) })); }
    put<T>(path: string, body: unknown, token: string)
    {
        return firstValueFrom(this.http.put<T>(`${this.base}/${path}`, body, { headers: this.headers(token) }));
    }
    blob(path: string, token: string) { return firstValueFrom(this.http.get(`${this.base}/${path}`, { headers: this.headers(token), responseType: 'blob' })); }
}


