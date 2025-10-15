# Script para instalar dependencias y ejecutar la app Electron de Alfred
# Este script prepara todo lo necesario para ejecutar la aplicación

Write-Host "╔══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║     Alfred Electron - Construccion para windows      ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Verificar que el usuario quiera continuar
$confirmation = Read-Host "⚠️  Este script eliminará y reconstruirá la aplicación. ¿Deseas continuar? (s/n)"
if ($confirmation -ne 's') {
    Write-Host "❌ Operación cancelada por el usuario." -ForegroundColor Red
    exit 0
}

# Paths importantes
$node_modulesPath = Join-Path $PSScriptRoot "node_modules"
$chroma_dbPath = Join-Path $PSScriptRoot "chroma_db"
$venvPath = Join-Path $PSScriptRoot "backend\venv"

# Path de las carpetas de datos
$secretKeyPath = Join-Path $PSScriptRoot "backend\%AppData%\Alfred\data\secret.key"
$alfred_dbPath = Join-Path $PSScriptRoot "backend\%AppData%\Alfred\db\alfred.db"
$logsPath = Join-Path $PSScriptRoot "backend\%AppData%\Alfred\logs"


#Validar Paths
Write-Host "🔍 Verificando paths importantes..." -ForegroundColor Yellow
$pathsToCheck = @($node_modulesPath, $chroma_dbPath, $venvPath, $secretKeyPath, $alfred_dbPath, $logsPath)
foreach ($path in $pathsToCheck) {
    if (-not (Test-Path $path)) {
        Write-Host "❌ Path no encontrado: $path" -ForegroundColor Red
    } else {
        Write-Host "✅ Path verificado: $path" -ForegroundColor Green
        Remove-Item $path -Recurse -Force
        Write-Host "🗑️  Path eliminado: $path" -ForegroundColor Green
    }
}
Write-Host ""
# Construir la aplicación con electron-builder
Write-Host "🏗️  Construyendo la aplicación para Windows..." -ForegroundColor Cyan
Write-Host "   Esto puede tardar varios minutos..." -ForegroundColor Gray
Write-Host ""

# Eliminar build anterior si existe
$buildPath = Join-Path $PSScriptRoot "dist"
if (Test-Path $buildPath) {
    Remove-Item $buildPath -Recurse -Force
    Write-Host "🗑️  Build anterior eliminado" -ForegroundColor Green
}

# Construir la aplicación
yarn install
yarn app:dist

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "❌ Error al construir la aplicación" -ForegroundColor Red
    pause
    exit 1
}
Write-Host ""
Write-Host "✅ Aplicación construida correctamente" -ForegroundColor Green
Write-Host ""
exit 0