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
    Write-Host "Opciones:" -ForegroundColor Cyan
    Write-Host "  1. Verificar y actualizar paquetes desactualizados (recomendado)" -ForegroundColor White
    Write-Host "  2. Reinstalar todos los paquetes desde cero" -ForegroundColor White
    Write-Host "  3. Salir (usar paquetes existentes)" -ForegroundColor White
    Write-Host ""
    $option = Read-Host "Selecciona una opcion (1/2/3)"
    
    if ($option -eq '3') {
        Write-Host "`n✅ Usando paquetes existentes" -ForegroundColor Green
        exit 0
    }
    
    if ($option -eq '1') {
        Write-Host "`n⚙️  Verificando y actualizando paquetes..." -ForegroundColor Yellow
        # Continua con la verificacion normal
    }
    elseif ($option -eq '2') {
        Write-Host "`n⚙️  Reinstalando todos los paquetes..." -ForegroundColor Yellow
        # Borrar el marcador para forzar instalacion completa
        Remove-Item $markerFile -Force -ErrorAction SilentlyContinue
    }
    else {
        Write-Host "`n❌ Opcion invalida" -ForegroundColor Red
        exit 1
    }
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

# Verificar paquetes instalados vs requirements.txt
Write-Host "🔍 Verificando paquetes instalados..." -ForegroundColor Cyan

$installedPackages = @{}
try {
    $pipFreezeOutput = & $pythonPortableExe -m pip freeze 2>&1
    foreach ($line in $pipFreezeOutput) {
        if ($line -match '^([a-zA-Z0-9_.-]+)==(.+)$') {
            $pkgName = $matches[1].ToLower().Replace('-', '_').Replace('.', '_')
            $pkgVersion = $matches[2]
            $installedPackages[$pkgName] = $pkgVersion
        }
    }
    Write-Host "   Paquetes instalados actualmente: $($installedPackages.Count)" -ForegroundColor Gray
} catch {
    Write-Host "   No hay paquetes instalados todavia" -ForegroundColor Gray
}

# Leer requirements.txt y extraer paquetes requeridos
$requiredPackages = @{}
$requirementsContent = Get-Content $requirementsFile | Where-Object { 
    $_.Trim() -and -not $_.Trim().StartsWith('#') 
}

foreach ($line in $requirementsContent) {
    if ($line -match '^([a-zA-Z0-9_.-]+)==([0-9a-zA-Z._-]+)') {
        $pkgName = $matches[1].ToLower().Replace('-', '_').Replace('.', '_')
        $pkgVersion = $matches[2]
        $requiredPackages[$pkgName] = @{
            spec = $line.Trim()
            version = $pkgVersion
        }
    }
}

Write-Host "   Paquetes requeridos en requirements.txt: $($requiredPackages.Count)" -ForegroundColor Gray
Write-Host ""

# Comparar versiones y determinar que instalar/actualizar
$toInstall = @()
$toUpdate = @()
$upToDate = 0

foreach ($pkg in $requiredPackages.Keys) {
    $requiredVersion = $requiredPackages[$pkg].version
    $requiredSpec = $requiredPackages[$pkg].spec
    
    if ($installedPackages.ContainsKey($pkg)) {
        $installedVersion = $installedPackages[$pkg]
        if ($installedVersion -eq $requiredVersion) {
            $upToDate++
        } else {
            Write-Host "   ⚠️  $pkg : $installedVersion → $requiredVersion (desactualizado)" -ForegroundColor Yellow
            $toUpdate += $requiredSpec
        }
    } else {
        Write-Host "   ➕ $pkg : $requiredVersion (faltante)" -ForegroundColor Cyan
        $toInstall += $requiredSpec
    }
}

Write-Host ""
Write-Host "� Resumen de verificacion:" -ForegroundColor Cyan
Write-Host "   ✅ Actualizados: $upToDate paquetes" -ForegroundColor Green
Write-Host "   ⚠️  Desactualizados: $($toUpdate.Count) paquetes" -ForegroundColor Yellow
Write-Host "   ➕ Faltantes: $($toInstall.Count) paquetes" -ForegroundColor Cyan
Write-Host ""

# Combinar todos los paquetes que necesitan instalacion/actualizacion
$packagesToProcess = $toInstall + $toUpdate

if ($packagesToProcess.Count -eq 0) {
    Write-Host "✅ Todos los paquetes estan instalados con las versiones correctas" -ForegroundColor Green
    # Actualizar archivo marcador de todas formas
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $markerContent = @"
Verificacion completada: $timestamp
Paquetes verificados: $($requiredPackages.Count)
Estado: Todos actualizados
Python version: $pythonVersion
"@
    Set-Content -Path $markerFile -Value $markerContent -Force
    Write-Host ""
    exit 0
}

# Instalar/Actualizar paquetes
Write-Host "📦 Instalando/actualizando $($packagesToProcess.Count) paquetes..." -ForegroundColor Cyan
Write-Host "   Esto puede tardar 10-15 minutos..." -ForegroundColor Gray
Write-Host "   Por favor espera..." -ForegroundColor Gray
Write-Host ""

$startTime = Get-Date

# Instalar con --force-reinstall para asegurar versiones correctas
& $pythonPortableExe -m pip install --force-reinstall --no-cache-dir -r $requirementsFile

$endTime = Get-Date
$duration = ($endTime - $startTime).TotalMinutes

if ($LASTEXITCODE -ne 0) {
    Write-Host "`n❌ Error al instalar/actualizar paquetes" -ForegroundColor Red
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
