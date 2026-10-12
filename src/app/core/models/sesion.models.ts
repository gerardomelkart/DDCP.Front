import { Usuario } from './usuario.models';

export interface Sesion { token: string; expira: string; usuario: Usuario; }
