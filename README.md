# DDCP Front

Interfaz Angular de **Dispositivos decomisados centros penitenciarios**.

## Organización, siguiendo SIIID

- `src/app/app.ts` y `app.html`: shell de la aplicación; muestran login o layout y el indicador de procesamiento.
- `src/app/core/models`: contratos de sesión, usuarios, entidades, carga, consulta y filtros.
- `src/app/core/services/api.service.ts`: transporte HTTP y resolución de la URL de la API.
- `src/app/core/services/session.service.ts`: sesión compartida, alcance, navegación, mensajes y manejo de errores.
- `src/app/core/services/auth.service.ts`: inicio de sesión.
- `src/app/core/services/ddcp-consulta.service.ts`: estado de filtros, consulta y Excel.
- `src/app/core/services/ddcp-carga.service.ts`: selección del archivo, validación, vista previa, confirmación y plantilla.
- `src/app/core/services/usuarios.service.ts`: administración, búsqueda, ordenamiento y exportación de usuarios.
- `src/app/core/constants` y `core/utils`: meses, filtros, tabla de usuarios y descarga de archivos.
- `src/app/layout/main-layout`, `sidebar` y `topbar`: estructura y navegación de la interfaz.
- `src/app/pages/login`, `consulta`, `carga` y `usuarios`: componentes y HTML separados de cada pantalla.
- `src/app/shared/icons`: símbolos de iconos compartidos.
- `src/assets`: imágenes e identidad institucional.
- `publicacion`: publicación e instalación de API y Front en conjunto.

Las pantallas comparten la sesión y el indicador de procesamiento. Sus servicios conservan el estado al cambiar de sección; al cerrar sesión se limpian archivos, vistas previas, resultados y datos de usuarios. La navegación conserva las URLs actuales de DDCP.

## Desarrollo y publicación

```powershell
npm ci
npm start
```

`npm run build` compila para desarrollo. `npm run build:ddcp` genera el Front para `/ddcp/`.

Desde `D:\CNI\Ingesta de datos`, la publicación habitual sigue siendo:

```powershell
powershell -ExecutionPolicy Bypass -File ".\DDCP.Front\publicacion\publicar-ddcp.ps1"
scp "D:\CNI\DDCPpublish\publish-ddcp.zip" siiid:/home/opc/
ssh siiid
```

En el servidor:

```bash
sudo bash /home/opc/install-ddcp-prod.sh /home/opc/publish-ddcp.zip
```

La API se resuelve desde la base del documento: `/api` en desarrollo y `/ddcp/api` en producción. Los scripts mantienen las rutas actuales de los proyectos y la configuración existente del servidor.

## Comportamiento conservado

- Excel de consulta según los filtros de la última búsqueda completada y el alcance del usuario.
- Meses con nombre, totales y precisión de cantidades grandes en la exportación.
- Lectura del archivo antes de enviarlo y mensaje ante fallos de acceso al Excel.
- Scroll a la vista previa y a los errores; limpieza del formulario al confirmar.
- Administración de usuarios con búsqueda, ordenamiento, paginación y estados.

La reorganización no requiere SQL ni modifica la instalación productiva. Hay que compilar y publicar para que el servidor use el código actualizado.
