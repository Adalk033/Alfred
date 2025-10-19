# ============================================
# SCRIPT: Instalacion de Paquetes Python Portable
# ============================================
# Proposito: Pre-instalar dependencias en python-portable para el build
# Uso: .\install-python-packages.ps1
# ============================================

$ErrorActionPreference = "Stop"

Write-Host "`n╔══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   Instalacion de Paquetes en Python Portable        ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

# Paths
$pythonPortableExe = Join-Path $PSScriptRoot "backend\python-portable\python.exe"
$requirementsFile = Join-Path $PSScriptRoot "backend\requirements.txt"
$markerFile = Join-Path $PSScriptRoot "backend\python-portable\.packages_installed"

# Verificar que existe Python portable
if (-not (Test-Path $pythonPortableExe)) {
    Write-Host "❌ ERROR: Python portable no encontrado" -ForegroundColor Red
    Write-Host "   Ruta esperada: $pythonPortableExe" -ForegroundColor Gray
    Write-Host "   Descarga Python 3.12.x portable y descomprime en backend/python-portable/" -ForegroundColor Yellow
    exit 1
}

# Verificar que existe requirements.txt
if (-not (Test-Path $requirementsFile)) {
    Write-Host "❌ ERROR: requirements.txt no encontrado" -ForegroundColor Red
    Write-Host "   Ruta esperada: $requirementsFile" -ForegroundColor Gray
    exit 1
}

# Verificar si ya se instalaron los paquetes
if (Test-Path $markerFile) {
    Write-Host "✅ Los paquetes ya estan instalados" -ForegroundColor Green
    Write-Host ""
    
    $markerContent = Get-Content $markerFile -Raw -ErrorAction SilentlyContinue
    if ($markerContent) {
        Write-Host $markerContent -ForegroundColor Gray
    }
    
    Write-Host ""
    $reinstall = Read-Host "Deseas reinstalar todos los paquetes? (s/n)"
    
    if ($reinstall -ne 's') {
        Write-Host "`n✅ Usando paquetes existentes" -ForegroundColor Green
        exit 0
    }
    
    Write-Host "`n⚙️  Reinstalando paquetes..." -ForegroundColor Yellow
}

Write-Host "🔍 Informacion del entorno:" -ForegroundColor Cyan
Write-Host "   Python: $pythonPortableExe" -ForegroundColor Gray
Write-Host "   Requirements: $requirementsFile" -ForegroundColor Gray
Write-Host ""

# Obtener version de Python
$pythonVersion = & $pythonPortableExe --version 2>&1
Write-Host "   Version: $pythonVersion" -ForegroundColor White
Write-Host ""

# Actualizar pip
Write-Host "📦 Actualizando pip..." -ForegroundColor Cyan
& $pythonPortableExe -m pip install --upgrade pip

if ($LASTEXITCODE -ne 0) {
    Write-Host "`n❌ Error al actualizar pip" -ForegroundColor Red
    exit 1
}

Write-Host "✅ pip actualizado" -ForegroundColor Green
Write-Host ""

# Instalar paquetes desde requirements.txt
Write-Host "📦 Instalando paquetes desde requirements.txt..." -ForegroundColor Cyan
Write-Host "   Esto puede tardar 10-15 minutos..." -ForegroundColor Gray
Write-Host "   Por favor espera..." -ForegroundColor Gray
Write-Host ""

$startTime = Get-Date

& $pythonPortableExe -m pip install -r $requirementsFile

$endTime = Get-Date
$duration = ($endTime - $startTime).TotalMinutes

if ($LASTEXITCODE -ne 0) {
    Write-Host "`n❌ Error al instalar paquetes" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "✅ Paquetes instalados exitosamente" -ForegroundColor Green
Write-Host ""

# Obtener informacion de paquetes instalados
Write-Host "📊 Recopilando informacion..." -ForegroundColor Cyan

$packagesCount = & $pythonPortableExe -m pip list --format=freeze | Measure-Object -Line | Select-Object -ExpandProperty Lines

$sitePackagesPath = Join-Path $PSScriptRoot "backend\python-portable\Lib\site-packages"
$sitePackagesSize = 0

if (Test-Path $sitePackagesPath) {
    $sitePackagesSize = (Get-ChildItem -Path $sitePackagesPath -Recurse -File -ErrorAction SilentlyContinue | 
                        Measure-Object -Property Length -Sum).Sum / 1MB
}

# Crear archivo marcador
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$markerContent = @"
Instalacion completada: $timestamp
Paquetes instalados: $packagesCount
Tamano total: $([math]::Round($sitePackagesSize, 2)) MB
Duracion: $([math]::Round($duration, 2)) minutos
Python version: $pythonVersion
"@

Set-Content -Path $markerFile -Value $markerContent -Force

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║        INSTALACION COMPLETADA EXITOSAMENTE           ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "📊 Resumen:" -ForegroundColor Cyan
Write-Host "   Paquetes instalados: $packagesCount" -ForegroundColor White
Write-Host "   Tamano total: $([math]::Round($sitePackagesSize, 2)) MB" -ForegroundColor White
Write-Host "   Duracion: $([math]::Round($duration, 2)) minutos" -ForegroundColor White
Write-Host ""
Write-Host "ℹ️  Notas importantes:" -ForegroundColor Cyan
Write-Host "   • Los paquetes estan en: backend/python-portable/Lib/site-packages/" -ForegroundColor Gray
Write-Host "   • .gitignore los excluye del repositorio (Git NO los commitea)" -ForegroundColor Gray
Write-Host "   • Electron Builder SI los empaquetara en el .exe final" -ForegroundColor Gray
Write-Host "   • El usuario recibira la app con TODO pre-instalado" -ForegroundColor Green
Write-Host ""

exit 0
