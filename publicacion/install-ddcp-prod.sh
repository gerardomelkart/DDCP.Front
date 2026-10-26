#!/bin/bash
set -Eeuo pipefail
umask 027

readonly ZIP_FILE="${1:?Indique el ZIP de publicación.}"
readonly DEPLOY_CONFIG="${2:?Indique el archivo externo deploy.env.}"
[[ -f "$DEPLOY_CONFIG" ]] || { echo "No existe $DEPLOY_CONFIG" >&2; exit 1; }
set -a
source "$DEPLOY_CONFIG"
set +a
for name in API_DIR FRONT_DIR SERVICE HTTPD HTTP_CONF DDCP_CONF CONFIG_FILE LOG_DIR BACKUP_ROOT RUN_USER RUN_GROUP LISTEN_HOST API_PORT DOMAIN BASE_PATH API_EXECUTABLE DATABASE_NAME READY_ATTEMPTS READY_INTERVAL_SECONDS REQUEST_TIMEOUT_SECONDS PROXY_TIMEOUT_SECONDS MAX_UNPACK_BYTES MACHINE_ARCH APP_ENVIRONMENT PUBLIC_TIMEOUT_SECONDS SQL_LOGIN_TIMEOUT_SECONDS SQLCMD_PATH MODULO_CLAVE; do
    [[ -n "${!name:-}" ]] || { echo "Falta $name en deploy.env" >&2; exit 1; }
done
[[ "$BASE_PATH" =~ ^/[a-zA-Z0-9/_-]+/$ && "$API_PORT" =~ ^[0-9]+$ && "$DOMAIN" =~ ^[a-zA-Z0-9.-]+$ ]] || { echo "Dominio, puerto o ruta base inválidos" >&2; exit 1; }
for path in "$API_DIR" "$FRONT_DIR" "$CONFIG_FILE" "$LOG_DIR"; do
    [[ "$path" =~ ^/[a-zA-Z0-9/_.-]+$ && "$path" != / ]] || { echo "Ruta de despliegue inválida" >&2; exit 1; }
done
[[ "$API_DIR" != "$FRONT_DIR" && "$FRONT_DIR" != "$API_DIR/"* && "$API_DIR" != "$FRONT_DIR/"* ]] || { echo "Directorios de aplicación incompatibles" >&2; exit 1; }
python3 - <<'PATHS'
import os
from pathlib import Path
api, front = (Path(os.environ[key]) for key in ("API_DIR", "FRONT_DIR"))
for path in (api, front):
    if str(path) != str(path.resolve()) or str(path) in {"/", "/var", "/var/www", "/etc", "/usr", "/opt", "/home"}:
        raise SystemExit("Use directorios dedicados y rutas canónicas para API y Front.")
for key in ("CONFIG_FILE", "LOG_DIR", "BACKUP_ROOT", "DDCP_CONF", "HTTP_CONF"):
    path = Path(os.environ[key]).resolve()
    if path == api or path == front or api in path.parents or front in path.parents:
        raise SystemExit("Configuración, logs y respaldos deben quedar fuera de los directorios reemplazables.")
PATHS
readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly UNIT="/etc/systemd/system/$SERVICE"
readonly STAMP="$(date +%Y%m%d_%H%M%S)_$$"
readonly BACKUP="$BACKUP_ROOT/$STAMP"
STAGE=""
MUTATED=0
HAD_API=0
HAD_FRONT=0
HAD_UNIT=0
HAD_CONF=0
WAS_ACTIVE=0
WAS_ENABLED=0

fail()
{
    echo "ERROR: $*" >&2
    exit 1
}

rollback()
{
    local code=$?
    trap - EXIT
    if (( code != 0 && MUTATED == 1 )); then
        echo "Falló la instalación. Restaurando DDCP desde $BACKUP..." >&2
        set +e
        systemctl stop "$SERVICE"
        rm -rf -- "$API_DIR" "$FRONT_DIR"
        if (( HAD_API == 1 )); then cp -a -- "$BACKUP/api" "$API_DIR"; fi
        if (( HAD_FRONT == 1 )); then cp -a -- "$BACKUP/front" "$FRONT_DIR"; fi
        cp -a -- "$BACKUP/httpd.conf" "$HTTP_CONF"
        if (( HAD_CONF == 1 )); then cp -a -- "$BACKUP/ddcp.conf" "$DDCP_CONF"; else rm -f -- "$DDCP_CONF"; fi
        if (( HAD_UNIT == 1 )); then
            cp -a -- "$BACKUP/service" "$UNIT"
        else
            systemctl disable "$SERVICE" >/dev/null 2>&1
            rm -f -- "$UNIT"
        fi
        systemctl daemon-reload
        if (( WAS_ENABLED == 1 )); then systemctl enable "$SERVICE" >/dev/null; fi
        if (( WAS_ACTIVE == 1 )); then systemctl start "$SERVICE"; fi
        "$HTTPD" -t && "$HTTPD" -k graceful
        echo "Revisa el servicio y Apache; el respaldo se conserva en $BACKUP." >&2
    fi
    if [[ -n "$STAGE" && -d "$STAGE" ]]; then rm -rf -- "$STAGE"; fi
    exit "$code"
}
trap rollback EXIT

[[ "$EUID" -eq 0 ]] || fail "Ejecute con sudo."
[[ "$(uname -m)" == "$MACHINE_ARCH" ]] || fail "La arquitectura del servidor no coincide con el perfil."
[[ -f "$ZIP_FILE" ]] || fail "No existe $ZIP_FILE."
[[ -f "$SCRIPT_DIR/configurar-ddcp.py" ]] || fail "Falta configurar-ddcp.py junto al instalador."
for command in python3 curl systemctl flock; do command -v "$command" >/dev/null || fail "Falta $command."; done
exec 9>"/run/lock/${SERVICE}.deploy.lock"
flock -n 9 || fail "Otra publicación de DDCP está en curso."
id "$RUN_USER" >/dev/null
"$HTTPD" -t
MODULES="$("$HTTPD" -M 2>&1)"
for module in proxy_module proxy_http_module rewrite_module alias_module; do
    [[ "$MODULES" == *"$module"* ]] || fail "Apache no tiene $module."
done

if systemctl is-active --quiet "$SERVICE"; then WAS_ACTIVE=1; fi
if systemctl is-enabled --quiet "$SERVICE" 2>/dev/null; then WAS_ENABLED=1; fi
if (( WAS_ACTIVE == 0 )) && ss -ltnH "sport = :$API_PORT" | grep -q .; then
    fail "El puerto $API_PORT está ocupado por otro proceso."
fi
[[ ! -L "$API_DIR" && ! -L "$FRONT_DIR" ]] || fail "Las rutas de DDCP no deben ser enlaces simbólicos."
[[ ! -L "$HTTP_CONF" && ! -L "$DDCP_CONF" && ! -L "$UNIT" ]] || fail "No se reemplazan configuraciones enlazadas."

STAGE="$(mktemp -d "${API_DIR%/*}/.ingesta-stage.XXXXXX")"
env ZIP_FILE="$ZIP_FILE" STAGE="$STAGE" python3 - <<'PY'
import os, stat, zipfile
from pathlib import Path, PurePosixPath
with zipfile.ZipFile(os.environ["ZIP_FILE"]) as package:
    entries = package.infolist()
    normalized = []
    for entry in entries:
        filename = entry.filename.replace("\\", "/")
        name = PurePosixPath(filename)
        if (not name.parts or name.is_absolute() or ".." in name.parts
                or name.parts[0] not in {"publishAPI", "publishFRONT"}):
            raise SystemExit("El ZIP contiene una ruta no permitida.")
        if stat.S_ISLNK(entry.external_attr >> 16):
            raise SystemExit("El ZIP contiene enlaces simbólicos.")
        normalized.append((entry, name.as_posix()))
    names = [name for _, name in normalized]
    if len(names) != len(set(names)):
        raise SystemExit("El ZIP tiene entradas duplicadas tras normalizar las rutas.")
    required = {"publishAPI/" + os.environ["API_EXECUTABLE"], "publishAPI/" + os.environ["API_EXECUTABLE"] + ".dll", "publishAPI/libhostfxr.so", "publishFRONT/index.html"}
    if not required.issubset(names):
        raise SystemExit("Faltan archivos. Publique para Linux x64 autocontenido con el script incluido.")
    if sum(entry.file_size for entry in entries) > int(os.environ["MAX_UNPACK_BYTES"]):
        raise SystemExit("El ZIP expandido supera el máximo configurado.")
    destination = Path(os.environ["STAGE"])
    for entry, filename in normalized:
        target = destination / filename
        if entry.is_dir() or entry.filename.endswith("\\"):
            target.mkdir(parents=True, exist_ok=True)
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            with package.open(entry) as source, target.open("wb") as output:
                import shutil
                shutil.copyfileobj(source, output)
api = Path(os.environ["STAGE"]) / "publishAPI" / os.environ["API_EXECUTABLE"]
if api.read_bytes()[:4] != b"\x7fELF":
    raise SystemExit("La API no es un ejecutable Linux.")
front = Path(os.environ["STAGE"]) / "publishFRONT"
if ('<base href="' + os.environ['BASE_PATH'] + '">') not in (front / "index.html").read_text():
    raise SystemExit("El Front no fue compilado para la ruta base configurada.")
print("Paquete Linux y ruta base del Front: OK.")
PY

# La verificación SQL solo consulta. Las credenciales se piden sin mostrarlas.
python3 "$SCRIPT_DIR/configurar-ddcp.py" --config "$CONFIG_FILE" --database "$DATABASE_NAME"
install -d -m 750 -o "$RUN_USER" -g "$RUN_GROUP" "$LOG_DIR"
rm -f -- "$STAGE/publishAPI/appsettings.$APP_ENVIRONMENT.json"
ln -s "$CONFIG_FILE" "$STAGE/publishAPI/appsettings.$APP_ENVIRONMENT.json"
chown -R root:"$RUN_GROUP" "$STAGE/publishAPI" "$STAGE/publishFRONT"
find "$STAGE/publishAPI" "$STAGE/publishFRONT" -type d -exec chmod 755 {} +
find "$STAGE/publishAPI" "$STAGE/publishFRONT" -type f -exec chmod 644 {} +
chmod 755 "$STAGE/publishAPI/$API_EXECUTABLE"

install -d -m 700 "$BACKUP"
cp -a -- "$HTTP_CONF" "$BACKUP/httpd.conf"
if [[ -f "$UNIT" ]]; then HAD_UNIT=1; cp -a -- "$UNIT" "$BACKUP/service"; fi
if [[ -f "$DDCP_CONF" ]]; then HAD_CONF=1; cp -a -- "$DDCP_CONF" "$BACKUP/ddcp.conf"; fi
if [[ -d "$API_DIR" ]]; then cp -a -- "$API_DIR" "$BACKUP/api"; HAD_API=1; fi
if [[ -d "$FRONT_DIR" ]]; then cp -a -- "$FRONT_DIR" "$BACKUP/front"; HAD_FRONT=1; fi

MUTATED=1
if (( WAS_ACTIVE == 1 )); then systemctl stop "$SERVICE"; fi
rm -rf -- "$API_DIR" "$FRONT_DIR"
mv -- "$STAGE/publishAPI" "$API_DIR"
mv -- "$STAGE/publishFRONT" "$FRONT_DIR"

cat > "$UNIT" <<UNIT
[Unit]
Description=API de sistemas de reporte - DDCP
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$RUN_USER
Group=$RUN_GROUP
WorkingDirectory=$API_DIR
ExecStart=$API_DIR/$API_EXECUTABLE
Environment=ASPNETCORE_ENVIRONMENT=$APP_ENVIRONMENT
Environment=ASPNETCORE_URLS=http://$LISTEN_HOST:$API_PORT
Restart=on-failure
RestartSec=5
UMask=0027
SyslogIdentifier=${SERVICE%.service}

[Install]
WantedBy=multi-user.target
UNIT
chmod 644 "$UNIT"

cat > "$DDCP_CONF" <<APACHE
# Configuración exclusiva de DDCP. Se incluye desde el contexto principal.
ProxyPass "${BASE_PATH}api/" "http://$LISTEN_HOST:$API_PORT/api/" timeout=$PROXY_TIMEOUT_SECONDS
ProxyPassReverse "${BASE_PATH}api/" "http://$LISTEN_HOST:$API_PORT/api/"
RedirectMatch 302 "^${BASE_PATH%/}$" "${BASE_PATH}"
Alias "${BASE_PATH}" "${FRONT_DIR}/"
<Directory "${FRONT_DIR}/">
    Options -Indexes +FollowSymLinks
    AllowOverride None
    Require all granted
    DirectoryIndex index.html
    RewriteEngine On
    RewriteBase ${BASE_PATH}
    RewriteCond %{REQUEST_FILENAME} !-f
    RewriteCond %{REQUEST_FILENAME} !-d
    RewriteRule ^ index.html [END]
</Directory>
APACHE
chmod 644 "$DDCP_CONF"
if ! grep -Fqx "Include \"$DDCP_CONF\"" "$HTTP_CONF"; then
    printf '\n# Publicación DDCP\nInclude "%s"\n' "$DDCP_CONF" >> "$HTTP_CONF"
fi

if command -v getenforce >/dev/null && [[ "$(getenforce)" != "Disabled" ]]; then
    command -v semanage >/dev/null || fail "Falta semanage para asignar contextos SELinux."
    semanage fcontext -a -t bin_t "${API_DIR}(/.*)?" 2>/dev/null || semanage fcontext -m -t bin_t "${API_DIR}(/.*)?"
    semanage fcontext -a -t httpd_sys_content_t "${FRONT_DIR}(/.*)?" 2>/dev/null || semanage fcontext -m -t httpd_sys_content_t "${FRONT_DIR}(/.*)?"
    restorecon -R "$API_DIR" "$FRONT_DIR" "${CONFIG_FILE%/*}" "$LOG_DIR"
fi

"$HTTPD" -t
systemctl daemon-reload
systemctl start "$SERVICE"
READY=0
for attempt in $(seq 1 "$READY_ATTEMPTS"); do
    if curl --noproxy '*' --max-time "$REQUEST_TIMEOUT_SECONDS" -fsS "http://$LISTEN_HOST:$API_PORT/" >/dev/null; then READY=1; break; fi
    sleep "$READY_INTERVAL_SECONDS"
done
[[ "$READY" == "1" ]] || fail "La API no arrancó; consulte journalctl -u $SERVICE."
systemctl is-active --quiet "$SERVICE" || fail "El servicio no permanece activo."
"$HTTPD" -k graceful
sleep "$READY_INTERVAL_SECONDS"
curl --noproxy '*' --resolve "$DOMAIN:443:$LISTEN_HOST" --max-time "$PUBLIC_TIMEOUT_SECONDS" -fsS "https://$DOMAIN${BASE_PATH}" -o "$STAGE/front-respuesta.html"
grep -Fq "<base href=\"${BASE_PATH}\">" "$STAGE/front-respuesta.html" || fail "Apache no entrega el Front DDCP."
STATUS="$(curl --noproxy '*' --resolve "$DOMAIN:443:$LISTEN_HOST" --max-time "$PUBLIC_TIMEOUT_SECONDS" -sS -o /dev/null -w '%{http_code}' -H 'Content-Type: application/json' -d '{"usuario":"","password":""}' "https://$DOMAIN${BASE_PATH}api/auth/login")"
[[ "$STATUS" == "401" ]] || fail "El proxy de DDCP respondió $STATUS; se esperaba 401 para credenciales vacías."
systemctl enable "$SERVICE" >/dev/null
MUTATED=0
echo "DDCP publicado: https://$DOMAIN${BASE_PATH}"
echo "Servicio: $SERVICE"
echo "Logs: $LOG_DIR"
echo "Respaldo: $BACKUP"

