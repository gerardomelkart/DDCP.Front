# DDCP Front

Interfaz Angular de **Dispositivos decomisados centros penitenciarios**.

## Organización

- `src/app/app.ts` y `app.html`: pantalla principal y coordinación de login, carga, consulta y usuarios.
- `src/app/core/http`: transporte HTTP y resolución de la URL de la API.
- `src/app/core/models`: sesión y usuario autenticado.
- `src/app/features/ddcp/models`: contratos de entidades, vista previa, consulta y filtros.
- `src/app/features/ddcp/utils`: construcción de los filtros de consulta y descarga.
- `src/app/features/usuarios/utils`: búsqueda y ordenamiento de la tabla de usuarios.
- `src/app/shared`: nombres de meses y descarga de archivos, compartidos por las pantallas.
- `src/assets`: imágenes e identidad institucional.
- `publicacion`: publicación e instalación de API y Front en conjunto.

El estado de los formularios se mantiene en el componente principal. Los modelos y las funciones independientes de Angular se separan para evitar mezclar transporte, filtros y presentación.

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
