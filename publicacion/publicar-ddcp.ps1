param([string]$Proyecto = "D:\CNI\Ingesta de datos", [string]$Salida = "D:\CNI\DDCPpublish")

$ErrorActionPreference = "Stop"
$front = Join-Path $Proyecto "DDCP.Front"
$csproj = Join-Path $Proyecto "IngestaDeDatos.Api\IngestaDeDatos.Api\IngestaDeDatos.Api.csproj"
$apiSalida = Join-Path $Salida "publishAPI"
$frontSalida = Join-Path $Salida "publishFRONT"

if (!(Test-Path $csproj) -or !(Test-Path (Join-Path $front "package.json")))
{
    throw "No se encuentran los proyectos en $Proyecto."
}
$apiTexto = Get-Content (Join-Path $front "src\app\api.ts") -Raw
if (!$apiTexto.Contains("document.baseURI"))
{
    throw "Primero copia el ajuste DDCP.Front/src/app/api.ts incluido en este paquete."
}

New-Item -ItemType Directory -Path $Salida -Force | Out-Null
# Estos dos directorios contienen exclusivamente la salida de publicación.
foreach ($directorio in @($apiSalida, $frontSalida))
{
    if (Test-Path $directorio)
    {
        Remove-Item $directorio -Recurse -Force
    }
    New-Item -ItemType Directory -Path $directorio | Out-Null
}

dotnet publish $csproj -c Release -r linux-x64 --self-contained true -p:UseAppHost=true -p:PublishSingleFile=false -p:PublishTrimmed=false -o $apiSalida
if ($LASTEXITCODE -ne 0)
{
    throw "Falló la publicación de la API."
}

# La configuración y credenciales productivas quedan exclusivamente en el servidor.
Get-ChildItem $apiSalida -Filter "appsettings*.json" | Remove-Item -Force
$configuracion = @{
    Modulos = @{ DDCP = @{ Conexion = "DDCP" } }
    Jwt = @{ SecretKey = ""; Issuer = "IngestaDeDatos.Api"; Audience = "IngestaDeDatos.Front"; MinutesToExpire = 120 }
    Logging = @{ LogLevel = @{ Default = "Information"; "Microsoft.AspNetCore" = "Warning" } }
    AllowedHosts = "*"
}
$utf8 = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Join-Path $apiSalida "appsettings.json"), ($configuracion | ConvertTo-Json -Depth 6), $utf8)

Push-Location $front
try
{
    npm run build:ddcp
    if ($LASTEXITCODE -ne 0)
    {
        throw "Falló la compilación del Front."
    }
    $browser = Join-Path $front "dist\DDCP.Front\browser"
    if (!(Test-Path (Join-Path $browser "index.html")))
    {
        throw "No se encontró dist/DDCP.Front/browser/index.html."
    }
    Copy-Item (Join-Path $browser "*") $frontSalida -Recurse -Force
}
finally
{
    Pop-Location
}

$zip = Join-Path $Salida "publish-ddcp.zip"
if (Test-Path $zip)
{
    Remove-Item $zip -Force
}
Compress-Archive -Path $apiSalida, $frontSalida -DestinationPath $zip
Copy-Item -Path (Join-Path $PSScriptRoot "*.sh"), (Join-Path $PSScriptRoot "*.py") -Destination $Salida -Force
Write-Host "Paquete listo: $zip"
Write-Host "API linux-x64 autocontenida y Front para /ddcp/."
