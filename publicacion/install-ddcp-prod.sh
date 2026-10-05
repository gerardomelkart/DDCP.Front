#!/bin/bash
set -Eeuo pipefail
umask 027

readonly ZIP_FILE="${1:-/home/opc/publish-ddcp.zip}"
readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly API_DIR="/var/www/ingesta-api"
readonly FRONT_DIR="/var/www/front-ddcp"
readonly SERVICE="ingesta-api.service"
readonly UNIT="/etc/systemd/system/ingesta-api.service"
readonly HTTPD="/opt/lampp/bin/httpd"
readonly HTTP_CONF="/opt/lampp/etc/httpd.conf"
readonly DDCP_CONF="/opt/lampp/etc/extra/ddcp.conf"
readonly STAMP="$(date +%Y%m%d_%H%M%S)_$$"
readonly BACKUP="/var/backups/ingesta-api/$STAMP"
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
[[ "$(uname -m)" == "x86_64" ]] || fail "El paquete requiere x86_64."
[[ -f "$ZIP_FILE" ]] || fail "No existe $ZIP_FILE."
[[ -f "$SCRIPT_DIR/configurar-ddcp.py" ]] || fail "Falta configurar-ddcp.py junto al instalador."
for command in python3 curl systemctl flock; do command -v "$command" >/dev/null || fail "Falta $command."; done
exec 9>/run/lock/ingesta-api-deploy.lock
flock -n 9 || fail "Otra publicación de DDCP está en curso."
id opc >/dev/null
"$HTTPD" -t
MODULES="$("$HTTPD" -M 2>&1)"
for module in proxy_module proxy_http_module rewrite_module alias_module; do
    [[ "$MODULES" == *"$module"* ]] || fail "Apache no tiene $module."
done

if systemctl is-active --quiet "$SERVICE"; then WAS_ACTIVE=1; fi
if systemctl is-enabled --quiet "$SERVICE" 2>/dev/null; then WAS_ENABLED=1; fi
if (( WAS_ACTIVE == 0 )) && ss -ltnH 'sport = :5002' | grep -q .; then
    fail "El puerto 5002 está ocupado por otro proceso."
fi
[[ ! -L "$API_DIR" && ! -L "$FRONT_DIR" ]] || fail "Las rutas de DDCP no deben ser enlaces simbólicos."
[[ ! -L "$HTTP_CONF" && ! -L "$DDCP_CONF" && ! -L "$UNIT" ]] || fail "No se reemplazan configuraciones enlazadas."

STAGE="$(mktemp -d /var/www/.ingesta-stage.XXXXXX)"
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
    required = {"publishAPI/IngestaDeDatos.Api", "publishAPI/IngestaDeDatos.Api.dll", "publishAPI/libhostfxr.so", "publishFRONT/index.html"}
    if not required.issubset(names):
        raise SystemExit("Faltan archivos. Publique para Linux x64 autocontenido con el script incluido.")
    if sum(entry.file_size for entry in entries) > 1024 * 1024 * 1024:
        raise SystemExit("El ZIP expandido supera 1 GB.")
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
api = Path(os.environ["STAGE"]) / "publishAPI" / "IngestaDeDatos.Api"
if api.read_bytes()[:4] != b"\x7fELF":
    raise SystemExit("La API no es un ejecutable Linux.")
front = Path(os.environ["STAGE"]) / "publishFRONT"
if '<base href="/ddcp/">' not in (front / "index.html").read_text():
    raise SystemExit("El Front no fue compilado para /ddcp/.")
print("Paquete Linux y Front /ddcp/: OK.")
PY

# La verificación SQL solo consulta. Las credenciales se piden sin mostrarlas.
python3 "$SCRIPT_DIR/configurar-ddcp.py"
install -d -m 750 -o opc -g opc /var/log/ingesta-api
rm -f -- "$STAGE/publishAPI/appsettings.Production.json"
ln -s /etc/ingesta-api/appsettings.Production.json "$STAGE/publishAPI/appsettings.Production.json"
chown -R root:opc "$STAGE/publishAPI" "$STAGE/publishFRONT"
find "$STAGE/publishAPI" "$STAGE/publishFRONT" -type d -exec chmod 755 {} +
find "$STAGE/publishAPI" "$STAGE/publishFRONT" -type f -exec chmod 644 {} +
chmod 755 "$STAGE/publishAPI/IngestaDeDatos.Api"

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

cat > "$UNIT" <<'UNIT'
[Unit]
Description=API de sistemas de reporte - DDCP
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=opc
Group=opc
WorkingDirectory=/var/www/ingesta-api
ExecStart=/var/www/ingesta-api/IngestaDeDatos.Api
Environment=ASPNETCORE_ENVIRONMENT=Production
Environment=ASPNETCORE_URLS=http://127.0.0.1:5002
Restart=on-failure
RestartSec=5
UMask=0027
SyslogIdentifier=ingesta-api

[Install]
WantedBy=multi-user.target
UNIT
chmod 644 "$UNIT"

cat > "$DDCP_CONF" <<'APACHE'
# Configuración exclusiva de DDCP. Se incluye desde el contexto principal.
ProxyPass "/ddcp/api/" "http://127.0.0.1:5002/api/" timeout=600
ProxyPassReverse "/ddcp/api/" "http://127.0.0.1:5002/api/"
RedirectMatch 302 "^/ddcp$" "/ddcp/"
Alias "/ddcp/" "/var/www/front-ddcp/"
<Directory "/var/www/front-ddcp/">
    Options -Indexes +FollowSymLinks
    AllowOverride None
    Require all granted
    DirectoryIndex index.html
    RewriteEngine On
    RewriteBase /ddcp/
    RewriteCond %{REQUEST_FILENAME} !-f
    RewriteCond %{REQUEST_FILENAME} !-d
    RewriteRule ^ index.html [END]
</Directory>
APACHE
chmod 644 "$DDCP_CONF"
if ! grep -Fqx 'Include "/opt/lampp/etc/extra/ddcp.conf"' "$HTTP_CONF"; then
    printf '\n# Publicación DDCP\nInclude "/opt/lampp/etc/extra/ddcp.conf"\n' >> "$HTTP_CONF"
fi

if command -v getenforce >/dev/null && [[ "$(getenforce)" != "Disabled" ]]; then
    command -v semanage >/dev/null || fail "Falta semanage para asignar contextos SELinux."
    semanage fcontext -a -t bin_t '/var/www/ingesta-api(/.*)?' 2>/dev/null || semanage fcontext -m -t bin_t '/var/www/ingesta-api(/.*)?'
    semanage fcontext -a -t httpd_sys_content_t '/var/www/front-ddcp(/.*)?' 2>/dev/null || semanage fcontext -m -t httpd_sys_content_t '/var/www/front-ddcp(/.*)?'
    restorecon -R "$API_DIR" "$FRONT_DIR" /etc/ingesta-api /var/log/ingesta-api
fi

"$HTTPD" -t
systemctl daemon-reload
systemctl start "$SERVICE"
READY=0
for attempt in {1..30}; do
    if curl --noproxy '*' --max-time 2 -fsS http://127.0.0.1:5002/ >/dev/null; then READY=1; break; fi
    sleep 1
done
[[ "$READY" == "1" ]] || fail "La API no arrancó; consulte journalctl -u ingesta-api."
systemctl is-active --quiet "$SERVICE" || fail "El servicio no permanece activo."
"$HTTPD" -k graceful
sleep 2
curl --noproxy '*' --resolve cni03.sspc.gob.mx:443:127.0.0.1 --max-time 15 -fsS https://cni03.sspc.gob.mx/ddcp/ -o "$STAGE/front-respuesta.html"
grep -Fq '<base href="/ddcp/">' "$STAGE/front-respuesta.html" || fail "Apache no entrega el Front DDCP."
STATUS="$(curl --noproxy '*' --resolve cni03.sspc.gob.mx:443:127.0.0.1 --max-time 15 -sS -o /dev/null -w '%{http_code}' -H 'Content-Type: application/json' -d '{"usuario":"","password":""}' https://cni03.sspc.gob.mx/ddcp/api/auth/login)"
[[ "$STATUS" == "401" ]] || fail "El proxy de DDCP respondió $STATUS; se esperaba 401 para credenciales vacías."
systemctl enable "$SERVICE" >/dev/null
MUTATED=0
echo "DDCP publicado: https://cni03.sspc.gob.mx/ddcp/"
echo "Servicio: $SERVICE"
echo "Logs: /var/log/ingesta-api"
echo "Respaldo: $BACKUP"
