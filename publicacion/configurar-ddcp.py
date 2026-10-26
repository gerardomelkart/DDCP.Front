#!/usr/bin/env python3
"""Configura/verifica conexiones externas. No ejecuta migraciones ni cambios de datos."""
import argparse
import getpass
import json
import os
import secrets
import shutil
import subprocess
import sys
from pathlib import Path


def construir_conexion(access):
    quote = lambda value: '"' + value.replace('"', '""') + '"'
    return ("Server=" + quote(access["Server"]) + ";Database=" + quote(access["Database"])
            + ";User ID=" + quote(access["User"]) + ";Password=" + quote(access["Password"])
            + ";Encrypt=True;TrustServerCertificate=True;")


def partes_conexion(connection):
    """Admite ; y comillas escapadas en valores, sin imprimir credenciales."""
    parts, current, quote, index = [], [], None, 0
    while index < len(connection):
        char = connection[index]
        if char in ('"', "'"):
            if quote == char and index + 1 < len(connection) and connection[index + 1] == char:
                current.append(char)
                index += 2
                continue
            if quote is None:
                quote = char
            elif quote == char:
                quote = None
            else:
                current.append(char)
        elif char == ";" and quote is None:
            parts.append("".join(current))
            current = []
        else:
            current.append(char)
        index += 1
    if quote:
        raise SystemExit("Cadena de conexión con comillas sin cerrar.")
    parts.append("".join(current))
    result = {}
    aliases = {"data source": "server", "initial catalog": "database", "uid": "user id", "pwd": "password"}
    for part in parts:
        if not part.strip():
            continue
        key, value = part.split("=", 1)
        key = key.strip().lower()
        result[aliases.get(key, key)] = value
    return result


def verificar(data, database):
    access = dict(data["Despliegue"], Database=database)
    expected = {"server": access["Server"], "database": database, "user id": access["User"], "password": access["Password"]}
    for name in ("Autenticacion", data["Modulos"][os.environ["MODULO_CLAVE"]]["Conexion"]):
        parsed = partes_conexion(data["ConnectionStrings"][name])
        if any(parsed.get(key) != value for key, value in expected.items()):
            raise SystemExit("Las conexiones guardadas no coinciden con los datos de despliegue. No se modificó la publicación.")
    environment = os.environ.copy()
    environment["SQLCMDPASSWORD"] = access["Password"]
    executable = os.environ.get("SQLCMD_PATH") or shutil.which("sqlcmd")
    if not executable or not Path(executable).is_file():
        raise SystemExit("Configure SQLCMD_PATH en deploy.env. No se modificó la publicación.")
    literal = database.replace("'", "''")
    query = f"""
SET NOCOUNT ON;
IF DB_NAME() <> N'{literal}' THROW 50001, 'La conexión no apunta a la base configurada.', 1;
IF OBJECT_ID('dbo.ING_USUARIO', 'U') IS NULL OR OBJECT_ID('dbo.ING_USUARIO_MODULO', 'U') IS NULL
   OR OBJECT_ID('dbo.DDCP_CARGA', 'U') IS NULL OR OBJECT_ID('dbo.DDCP_HISTORICO', 'U') IS NULL
   OR COL_LENGTH('dbo.DISPOSITIVOS_DECOMISADOS', 'PERIODO') IS NULL
   THROW 50002, 'Faltan tablas o adaptación del módulo.', 1;
IF OBJECT_ID('dbo.CAT_ROL', 'U') IS NULL OR OBJECT_ID('dbo.CAT_MES', 'U') IS NULL
   THROW 50006, 'Falta aplicar estructura/03_catalogos.sql con el administrador de la base.', 1;
IF OBJECT_ID('dbo.SEQ_DECOMISO', 'SO') IS NULL
   OR ISNULL(HAS_PERMS_BY_NAME('dbo.SEQ_DECOMISO', 'OBJECT', 'UPDATE'), 0) <> 1
   THROW 50005, 'Falta la secuencia o el permiso UPDATE sobre dbo.SEQ_DECOMISO.', 1;
SELECT TOP (0) * FROM dbo.ING_USUARIO;
SELECT TOP (0) * FROM dbo.DISPOSITIVOS_DECOMISADOS;
SELECT TOP (0) * FROM dbo.CAT_ROL;
SELECT TOP (0) * FROM dbo.CAT_MES;
IF (SELECT COUNT(*) FROM dbo.CAT_MES) <> 12
   THROW 50007, 'CAT_MES debe contener los doce meses del calendario.', 1;
IF ISNULL(HAS_PERMS_BY_NAME('dbo.DDCP_CARGA', 'OBJECT', 'INSERT'), 0) <> 1
   OR ISNULL(HAS_PERMS_BY_NAME('dbo.DISPOSITIVOS_DECOMISADOS', 'OBJECT', 'UPDATE'), 0) <> 1
   THROW 50003, 'El login SQL no tiene los permisos de carga.', 1;
SELECT DB_NAME() AS base_actual, COUNT(*) AS registros FROM dbo.DISPOSITIVOS_DECOMISADOS;
"""
    subprocess.run([executable, "-S", access["Server"], "-U", access["User"], "-d", database,
                    "-C", "-b", "-l", os.environ["SQL_LOGIN_TIMEOUT_SECONDS"], "-Q", query], env=environment, check=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--database", required=True)
    parser.add_argument("--actualizar-conexion", action="store_true")
    args = parser.parse_args()
    if os.geteuid() != 0:
        raise SystemExit("Ejecute con sudo.")
    config = args.config
    previous = json.loads(config.read_text(encoding="utf-8-sig")) if config.exists() else None
    if previous and not args.actualizar_conexion:
        verificar(previous, args.database)
        print("Configuración existente y acceso a la base: OK.")
        return
    default_server = previous["Despliegue"]["Server"] if previous else ""
    server = input("Servidor SQL [" + default_server + "]: ").strip() or default_server
    user = input("Login SQL: ").strip()
    password = getpass.getpass("Contraseña SQL (no se muestra): ")
    if not server or not user or not password or any(c in server + user + password for c in "\r\n"):
        raise SystemExit("Faltan credenciales o contienen saltos de línea.")
    access = {"Server": server, "Database": args.database, "User": user, "Password": password}
    connection = construir_conexion(access)
    data = previous or {}
    data.setdefault("ConnectionStrings", {}).update({"Autenticacion": connection, "DDCP": connection})
    data.setdefault("Modulos", {}).setdefault(os.environ["MODULO_CLAVE"], {})["Conexion"] = "DDCP"
    data["Despliegue"] = access
    if not previous:
        data["Jwt"] = {"SecretKey": secrets.token_urlsafe(48), "Issuer": os.environ["JWT_ISSUER"],
                       "Audience": os.environ["JWT_AUDIENCE"], "MinutesToExpire": int(os.environ["JWT_MINUTES"])}
        data["Cors"] = {"Origins": [os.environ["PUBLIC_ORIGIN"]]}
        data["Logs"] = {"Directory": os.environ["LOG_DIR"]}
    verificar(data, args.database)
    config.parent.mkdir(mode=0o750, parents=True, exist_ok=True)
    shutil.chown(config.parent, user="root", group=os.environ["RUN_GROUP"])
    os.chmod(config.parent, 0o750)
    temporary = config.with_name(".config-" + secrets.token_hex(6))
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as output:
            json.dump(data, output, ensure_ascii=False, indent=4)
            output.write("\n")
        shutil.chown(temporary, user="root", group=os.environ["RUN_GROUP"])
        os.chmod(temporary, 0o640)
        os.replace(temporary, config)
    finally:
        temporary.unlink(missing_ok=True)
    print("Conexiones actualizadas y verificadas.")


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError:
        raise SystemExit("SQL Server rechazó la conexión o la verificación. No se modificó la configuración.")
