# DDCP · Interfaz web

DDCP es una aplicación web para recibir, validar y consultar reportes mensuales de **dispositivos decomisados en centros penitenciarios** y personas puestas a disposición. Permite trabajar con alcance nacional o por entidad, según los permisos de la cuenta.

## Repositorios del proyecto

La solución se mantiene en tres repositorios complementarios:

| Repositorio | Responsabilidad | Tecnologías |
| --- | --- | --- |
| [DDCP.Front](https://github.com/gerardomelkart/DDCP.Front) | Interfaz, navegación, consulta y carga de archivos. | Angular, TypeScript, HTML y CSS |
| [IngestaDeDatos.Api](https://github.com/gerardomelkart/IngestaDeDatos.Api) | Autenticación, autorización, validación, confirmación de cargas y exportación. | ASP.NET Core, C#, Dapper y ClosedXML |
| [DDCP.BD](https://github.com/gerardomelkart/DDCP.BD) | Estructura SQL, catálogos, historial y scripts de mantenimiento. | SQL Server y T-SQL |

## Cómo se conectan

El navegador ejecuta el Front, que consume la API mediante HTTP y JSON. La API valida la sesión y el alcance del usuario antes de leer o modificar SQL Server. **El Front no se conecta directamente a la base de datos.**

Los catálogos de entidades, roles, permisos y meses se consultan desde la base a través de la API. Las conexiones y claves se configuran por ambiente, fuera del código versionado.

## Flujo de trabajo

1. El usuario inicia sesión y recibe las opciones disponibles para su rol y entidad.
2. Selecciona el periodo y carga un archivo Excel; el nombre de la hoja no determina su validez.
3. La API valida estructura, entidades y cantidades y devuelve una vista previa.
4. El usuario revisa y confirma. Si el periodo ya tenía información, se reemplazan las cantidades afectadas y se conserva su histórico.
5. Los datos confirmados se consultan por periodo y entidad y se pueden exportar a Excel.

## Desarrollo

Proyecto desarrollado por **[Gerardo Melkart Noeller Álvarez](https://github.com/gerardomelkart)**. Integra desarrollo de interfaz, servicios de backend, modelado de datos, procesamiento de Excel y automatización de publicación en Linux.

## Qué contiene este repositorio

- Inicio con bienvenida, permisos de la cuenta y accesos a las funciones disponibles.
- Consulta automática al abrir la vista y modificar los filtros de periodo o entidad.
- Búsqueda por columna, orden ascendente y descendente y totales de las filas visibles.
- Carga mensual con arrastrar y soltar, validación, vista previa y confirmación.
- Administración de usuarios, roles y alcance territorial.
- Descarga de plantillas y exportación de consultas con los filtros y el orden seleccionados.
- Scripts y perfiles de publicación de la solución.

## Ejecutar la solución

Se necesita Node.js compatible con Angular 21, la API .NET 10 en ejecución y una base SQL Server preparada. Configurar primero [la BD](https://github.com/gerardomelkart/DDCP.BD#readme) y [la API](https://github.com/gerardomelkart/IngestaDeDatos.Api#readme). Después seguir las instrucciones de desarrollo de este README y apuntar el proxy local a la API.

## Documentación técnica

Interfaz Angular con estructura `core`, `layout`, `pages` y `shared`, como SIIID.

## Catálogos y configuración

Los catálogos se obtienen de la API y de la base: entidades (`CAT_ENTIDAD`), roles y permisos (`CAT_ROL`), meses (`CAT_MES`) e identificación del módulo (`ING_MODULO`). No hay listas locales de roles o meses ni permisos determinados por comparar el texto del rol. Si falla la carga de los catálogos, no se habilitan las pantallas con datos inventados.

La API comunica también años permitidos, tamaño máximo de archivo, longitudes de usuarios/contraseñas y tamaño de página. Los mismos valores se usan en las validaciones del Front y de la API. Los nombres de tablas, rutas de endpoints, formatos de archivo y códigos de protocolo forman parte del contrato técnico de la aplicación.

## Desarrollo

Una sola vez:

```powershell
npm ci
Copy-Item .\proxy.example.json .\proxy.local.json
```

Ajustar `target` en `proxy.local.json` al puerto de la API de desarrollo y ejecutar `npm start`. El archivo local está excluido de Git.

## Publicación

Antes de esta versión, aplicar `DDCP.BD/estructura/03_catalogos.sql` en la base seleccionada. No hace falta volver a ejecutar los scripts 01/02 en una base que ya funciona. La cuenta SQL de la API necesita SELECT sobre los nuevos catálogos, además de los permisos existentes.

Una sola vez en la computadora, desde la carpeta de este repo:

```powershell
Copy-Item .\publicacion\publicar-ddcp.example.json .\publicacion\publicar-ddcp.local.json
```

El perfil local define `Salida`, `BaseHref` y `Runtime`. El ejemplo conserva la salida relativa habitual a `DDCPpublish`, la ruta `/ddcp/` y Linux x64; puede ajustarse sin editar el script. Está excluido de Git. El directorio de los proyectos se deduce de la ubicación del script.

Publicar desde la carpeta de este repo:

```powershell
powershell -ExecutionPolicy Bypass -File .\publicacion\publicar-ddcp.ps1
```

Transferir el ZIP, ambos scripts y `deploy.env.example` generados al servidor. El paquete contiene configuración no secreta; las conexiones y la clave JWT productivas quedan fuera del ZIP.

Una sola vez en el servidor, copiar el perfil al directorio de configuración existente:

```bash
sudo install -m 600 -o root -g root /home/opc/deploy.env.example /etc/ingesta-api/deploy.env
```

El ejemplo mantiene las rutas, usuario, dominio y puerto de la instalación actual. Revisar el perfil si se usa otro ambiente. No contiene credenciales SQL.

Instalar indicando el perfil externo:

```bash
sudo bash /home/opc/install-ddcp-prod.sh /home/opc/publish-ddcp.zip /etc/ingesta-api/deploy.env
```

Las próximas publicaciones usan el mismo comando y conservan la conexión productiva y la clave JWT. El instalador consulta la BD para comprobar estructura y permisos; no aplica migraciones ni carga catálogos automáticamente. Si faltan los catálogos, se detiene antes de reemplazar la aplicación.

## Estructura

- `core/models`: contratos recibidos de API.
- `core/services`: sesión, autenticación, consulta, carga y usuarios.
- `core/utils`: filtros de consulta, ordenamiento y descarga.
- `layout`: barra superior, navegación y estructura de pantalla.
- `pages`: login, carga, consulta y usuarios.
- `shared/icons`: símbolos gráficos.
- `publicacion`: scripts y perfiles de ejemplo, sin credenciales.

Se conservan la descarga del Excel según la última consulta, los meses con nombre de BD, los totales y precisión de cantidades grandes, el aviso de archivo abierto, el scroll a errores/vista previa y la limpieza al confirmar o cerrar sesión.

## Versión 1.0

El inicio muestra bienvenida, permisos de la cuenta y accesos a las funciones disponibles, con el diseño de SIIID. La tarjeta de cuenta permite regresar al inicio. Los permisos y catálogos siguen viniendo de la API y la base.

Consulta de información carga automáticamente al abrir la vista y al modificar año, mes o entidad. Los cambios rápidos se agrupan; las respuestas anteriores se descartan. Cada columna permite búsqueda parcial sin distinguir acentos y orden ascendente/descendente. Los meses se ordenan cronológicamente y los dispositivos conservan precisión de hasta 18 dígitos. Los totales reflejan las filas visibles.

La descarga vuelve a consultar los datos autorizados y aplica los filtros de columnas y el orden actual. Puede reflejar actualizaciones confirmadas después de abrir la tabla. Esta versión requiere publicar también la API actualizada para exportar los filtros de columnas. No requiere cambios SQL.
