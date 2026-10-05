#!/usr/bin/env python3
import getpass
import json
import os
import secrets
import shutil
import subprocess
import sys
from pathlib import Path

CONFIG = Path("/etc/ingesta-api/appsettings.Production.json")

def verificar(data):
    connection = data["ConnectionStrings"]["DDCP"]
    # SQLCMD recibe credenciales por el entorno, nunca como argumento visible.
    # Para revalidar una configuración existente usamos los valores guardados aparte.
    access = data["Despliegue"]
    environment = os.environ.copy()
    environment["SQLCMDPASSWORD"] = access["Password"]
    executable = next((p for p in ["/opt/mssql-tools18/bin/sqlcmd", "/opt/mssql-tools/bin/sqlcmd"] if Path(p).is_file()), None)
    executable = executable or shutil.which("sqlcmd")
    if not executable:
        raise SystemExit("No se encontró sqlcmd. No se modificó la publicación.")
    query = """
SET NOCOUNT ON;
IF DB_NAME() <> 'DDCP' THROW 50001, 'La conexión no apunta a DDCP.', 1;
IF OBJECT_ID('dbo.ING_USUARIO', 'U') IS NULL OR OBJECT_ID('dbo.ING_USUARIO_MODULO', 'U') IS NULL
   OR OBJECT_ID('dbo.DDCP_CARGA', 'U') IS NULL OR OBJECT_ID('dbo.DDCP_HISTORICO', 'U') IS NULL
   OR COL_LENGTH('dbo.DISPOSITIVOS_DECOMISADOS', 'PERIODO') IS NULL
   THROW 50002, 'Faltan tablas o adaptación de DDCP.', 1;
IF OBJECT_ID('dbo.SEQ_DECOMISO', 'SO') IS NULL
   THROW 50004, 'Falta dbo.SEQ_DECOMISO o el login no puede verla. Revise el script de estructura 01 o mantenimiento/crear-secuencia-ddcp-prod.sql con el administrador.', 1;
IF ISNULL(HAS_PERMS_BY_NAME('dbo.SEQ_DECOMISO', 'OBJECT', 'UPDATE'), 0) <> 1
   THROW 50005, 'El login SQL requiere UPDATE sobre dbo.SEQ_DECOMISO para generar IDs.', 1;
SELECT TOP (0) * FROM dbo.ING_USUARIO;
SELECT TOP (0) * FROM dbo.DISPOSITIVOS_DECOMISADOS;
IF ISNULL(HAS_PERMS_BY_NAME('dbo.DDCP_CARGA', 'OBJECT', 'INSERT'), 0) <> 1
   OR ISNULL(HAS_PERMS_BY_NAME('dbo.DISPOSITIVOS_DECOMISADOS', 'OBJECT', 'UPDATE'), 0) <> 1
   THROW 50003, 'El login SQL no tiene los permisos de carga.', 1;
SELECT DB_NAME() AS base_actual, COUNT(*) AS registros FROM dbo.DISPOSITIVOS_DECOMISADOS;
"""
    subprocess.run([executable, "-S", access["Server"], "-U", access["User"], "-d", "DDCP", "-C", "-b", "-l", "15", "-Q", query], env=environment, check=True)
    # ConnectionStrings es lo que utilizará la aplicación; se comprueba consistencia.
    if connection != construir_conexion(access) or data["ConnectionStrings"]["Autenticacion"] != connection:
        raise SystemExit("Las conexiones no coinciden con la configuración verificada.")

def construir_conexion(access):
    quote = lambda value: '"' + value.replace('"', '""') + '"'
    return "Server=" + quote(access["Server"]) + ";Database=DDCP;User ID=" + quote(access["User"]) + ";Password=" + quote(access["Password"]) + ";Encrypt=True;TrustServerCertificate=True;"

def main():
    if os.geteuid() != 0:
        raise SystemExit("Ejecute con sudo.")
    previous = json.loads(CONFIG.read_text(encoding="utf-8")) if CONFIG.exists() else None
    if previous and "--actualizar-conexion" not in sys.argv:
        data = previous
        verificar(data)
        print("Configuración existente y acceso a DDCP: OK.")
        return
    default_server = previous["Despliegue"]["Server"] if previous else "127.0.0.1,1433"
    server = input("Servidor SQL [" + default_server + "]: ").strip() or default_server
    user = input("Login SQL de DDCP: ").strip()
    password = getpass.getpass("Contraseña SQL (no se muestra): ")
    if not user or not password or any(c in server + user + password for c in "\r\n"):
        raise SystemExit("Faltan credenciales o contienen saltos de línea.")
    access = {"Server": server, "User": user, "Password": password}
    connection = construir_conexion(access)
    data = {
        "ConnectionStrings": {"Autenticacion": connection, "DDCP": connection},
        "Modulos": {"DDCP": {"Conexion": "DDCP"}},
        "Jwt": previous["Jwt"] if previous else {"SecretKey": secrets.token_urlsafe(48), "Issuer": "IngestaDeDatos.Api", "Audience": "IngestaDeDatos.Front", "MinutesToExpire": 120},
        "Cors": {"Origins": ["https://cni03.sspc.gob.mx"]},
        "Logs": {"Directory": "/var/log/ingesta-api", "MaxFileSizeMB": 10, "RetentionDays": 30},
        "Despliegue": access
    }
    verificar(data)
    CONFIG.parent.mkdir(mode=0o750, parents=True, exist_ok=True)
    shutil.chown(CONFIG.parent, user="root", group="opc")
    os.chmod(CONFIG.parent, 0o750)
    temporary = CONFIG.with_name(".config-" + secrets.token_hex(6))
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as output:
            json.dump(data, output, ensure_ascii=False, indent=4)
            output.write("\n")
        shutil.chown(temporary, user="root", group="opc")
        os.chmod(temporary, 0o640)
        os.replace(temporary, CONFIG)
    finally:
        if temporary.exists():
            temporary.unlink()
    print("Configuración creada y conexión DDCP verificada.")

if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError:
        raise SystemExit("SQL Server rechazó la conexión o la verificación. No se modificaron los datos.")
