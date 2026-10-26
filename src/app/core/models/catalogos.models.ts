export interface RolCatalogo {
    clave: string;
    nombre: string;
    puedeCargar: boolean;
    puedeAdministrarUsuarios: boolean;
    nacionalObligatorio: boolean;
    predeterminado: boolean;
}
export interface MesCatalogo { idMes: number; nombre: string; }
export interface ReglasDdcp {
    anioMinimo: number;
    anioMaximo: number;
    maxArchivoBytes: number;
    maxDispositivos: string;
    maxPersonas: number;
    usuarioMaximo: number;
    nombreMaximo: number;
    passwordMinimo: number;
    passwordMaximoBytes: number;
    filasPagina: number;
}
export interface Catalogos {
    modulo: string;
    nombreModulo: string;
    roles: RolCatalogo[];
    meses: MesCatalogo[];
    reglas: ReglasDdcp;
    usuario: { puedeCargar: boolean; puedeAdministrarUsuarios: boolean; };
}
