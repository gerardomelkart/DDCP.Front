param([string]$Configuracion = (Join-Path $PSScriptRoot "publicar-ddcp.local.json"))

$ErrorActionPreference = "Stop"
if (!(Test-Path $Configuracion)) { throw "Copie publicar-ddcp.example.json a publicar-ddcp.local.json y ajuste los valores." }
$perfil = Get-Content $Configuracion -Raw | ConvertFrom-Json
$Proyecto = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$Salida = if ([System.IO.Path]::IsPathRooted($perfil.Salida)) { $perfil.Salida } else { [System.IO.Path]::GetFullPath((Join-Path (Split-Path $Configuracion -Parent) $perfil.Salida)) }
if (!$perfil.BaseHref -or !$perfil.Runtime) { throw "Faltan BaseHref o Runtime en la configuraciÃƒÂ³n de publicaciÃƒÂ³n." }

$front = Join-Path $Proyecto "DDCP.Front"
$csproj = Join-Path $Proyecto "IngestaDeDatos.Api\IngestaDeDatos.Api\IngestaDeDatos.Api.csproj"
$apiSalida = Join-Path $Salida "publishAPI"
$frontSalida = Join-Path $Salida "publishFRONT"

if (!(Test-Path $csproj) -or !(Test-Path (Join-Path $front "package.json")))
{
    throw "No se encuentran los proyectos en $Proyecto."
}
$apiTexto = Get-Content (Join-Path $front "src\app\core\services\api.service.ts") -Raw
if (!$apiTexto.Contains("document.baseURI"))
{
    throw "Primero copia el ajuste DDCP.Front/src/app/core/services/api.service.ts incluido en este paquete."
}

New-Item -ItemType Directory -Path $Salida -Force | Out-Null
# Estos dos directorios contienen exclusivamente la salida de publicaciÃƒÂ³n.
foreach ($directorio in @($apiSalida, $frontSalida))
{
    if (Test-Path $directorio)
    {
        Remove-Item $directorio -Recurse -Force
    }
    New-Item -ItemType Directory -Path $directorio | Out-Null
}

dotnet publish $csproj -c Release -r $perfil.Runtime --self-contained true -p:UseAppHost=true -p:PublishSingleFile=false -p:PublishTrimmed=false -o $apiSalida
if ($LASTEXITCODE -ne 0)
{
    throw "FallÃƒÂ³ la publicaciÃƒÂ³n de la API."
}

# La configuraciÃƒÂ³n y credenciales productivas quedan exclusivamente en el servidor.
Get-ChildItem $apiSalida -Filter "appsettings*.json" | Remove-Item -Force
# Publicar la configuraciÃƒÂ³n de reglas del proyecto, sin conexiones ni secretos.
$ajustesApi = Get-Content (Join-Path (Split-Path $csproj -Parent) "appsettings.json") -Raw | ConvertFrom-Json

if ($null -eq $ajustesApi) {
    throw "appsettings.json está vacío."
}

# Excluir conexiones y la clave JWT del paquete.
$ajustesApi.PSObject.Properties.Remove("ConnectionStrings")

if ($null -ne $ajustesApi.Jwt) {
    $ajustesApi.Jwt.PSObject.Properties.Remove("SecretKey")
}

$utf8 = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Join-Path $apiSalida "appsettings.json"), ($ajustesApi | ConvertTo-Json -Depth 12), $utf8)

Push-Location $front
try
{
    npm run build -- --configuration production --base-href $perfil.BaseHref
    if ($LASTEXITCODE -ne 0)
    {
        throw "FallÃƒÂ³ la compilaciÃƒÂ³n del Front."
    }
    $browser = Join-Path $front "dist\DDCP.Front\browser"
    if (!(Test-Path (Join-Path $browser "index.html")))
    {
        throw "No se encontrÃƒÂ³ dist/DDCP.Front/browser/index.html."
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
Copy-Item -Path (Join-Path $PSScriptRoot "*.sh"), (Join-Path $PSScriptRoot "*.py"), (Join-Path $PSScriptRoot "deploy.env.example") -Destination $Salida -Force
Write-Host "Paquete listo: $zip"
Write-Host "API $($perfil.Runtime) autocontenida y Front para $($perfil.BaseHref)."

