# ============================================
# SCRIPT: Build Optimizado para Windows
# ============================================
# Proposito: Preparar, limpiar y compilar Alfred con Electron Builder
# Uso: .\builtWin.ps1
# ============================================

param(
    [switch]$Force = $false,            # Omite confirmacion inicial
    [switch]$SkipValidation = $false    # Omite validacion de estructura
)

$ErrorActionPreference = "Continue"

Write-Host "`n╔══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║     Alfred Electron - Build Optimizado Windows      ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

# Verificar que el usuario quiera continuar
if (-not $Force) {
    Write-Host "Este script realizara:" -ForegroundColor Yellow
    Write-Host "  1. Limpieza de archivos temporales" -ForegroundColor White
    Write-Host "  2. Validacion de estructura" -ForegroundColor White
    Write-Host "  3. Verificacion de Python portable" -ForegroundColor White
    Write-Host "  4. Instalacion de dependencias npm" -ForegroundColor White
    Write-Host "  5. Build con Electron Builder" -ForegroundColor White
    Write-Host ""
    
    $confirmation = Read-Host "Deseas continuar? (s/n)"
    if ($confirmation -ne 's') {
        Write-Host "`n❌ Operacion cancelada por el usuario." -ForegroundColor Red
        exit 0
    }
}

# ============================================
# FASE 1: LIMPIEZA COMPLETA
# ============================================
Write-Host "`n╔══════════════════════════════════════════════════════╗" -ForegroundColor Yellow
Write-Host "║  FASE 1: Limpieza de Archivos Temporales            ║" -ForegroundColor Yellow
Write-Host "╚══════════════════════════════════════════════════════╝`n" -ForegroundColor Yellow

# Paths importantes
$node_modulesPath = Join-Path $PSScriptRoot "node_modules"
$venvPath = Join-Path $PSScriptRoot "backend\venv"
$venvTestPath = Join-Path $PSScriptRoot "backend\venv_test_clone"
$buildPath = Join-Path $PSScriptRoot "dist"
$appDataPath = Join-Path $PSScriptRoot "backend\%AppData%"
$tempPath = Join-Path $PSScriptRoot "backend\temp"
$envPath = Join-Path $PSScriptRoot "backend\.env"

# 1. Limpiar __pycache__ (Advertencia detectada)
Write-Host "🧹 Limpiando carpetas __pycache__..." -ForegroundColor Cyan
$pycachePaths = Get-ChildItem -Path (Join-Path $PSScriptRoot "backend") -Filter "__pycache__" -Recurse -Directory -ErrorAction SilentlyContinue

if ($pycachePaths.Count -gt 0) {
    foreach ($pycache in $pycachePaths) {
        Remove-Item $pycache.FullName -Recurse -Force -ErrorAction SilentlyContinue
    }
    Write-Host "   ✅ Eliminadas $($pycachePaths.Count) carpetas __pycache__" -ForegroundColor Green
} else {
    Write-Host "   ✅ Sin carpetas __pycache__" -ForegroundColor Green
}

# 2. Limpiar archivos .pyc
Write-Host "🧹 Limpiando archivos .pyc..." -ForegroundColor Cyan
$pycFiles = Get-ChildItem -Path (Join-Path $PSScriptRoot "backend") -Filter "*.pyc" -Recurse -File -ErrorAction SilentlyContinue

if ($pycFiles.Count -gt 0) {
    foreach ($pyc in $pycFiles) {
        Remove-Item $pyc.FullName -Force -ErrorAction SilentlyContinue
    }
    Write-Host "   ✅ Eliminados $($pycFiles.Count) archivos .pyc" -ForegroundColor Green
} else {
    Write-Host "   ✅ Sin archivos .pyc" -ForegroundColor Green
}

# 3. Limpiar get-pip.py temporal
$getPipPath = Join-Path $PSScriptRoot "backend\python-portable\get-pip.py"
if (Test-Path $getPipPath) {
    Remove-Item $getPipPath -Force -ErrorAction SilentlyContinue
    Write-Host "   ✅ Eliminado get-pip.py temporal" -ForegroundColor Green
}

# 4. Limpiar venv de desarrollo (Advertencia detectada)
Write-Host "🧹 Limpiando venv de desarrollo..." -ForegroundColor Cyan
if (Test-Path $venvPath) {
    Write-Host "   ⚠️  venv de desarrollo existe - No se eliminara automaticamente" -ForegroundColor Yellow
} else {
    Write-Host "   ✅ venv de desarrollo no existe" -ForegroundColor Green
}

# 5. Limpiar venv_test_clone
if (Test-Path $venvTestPath) {
    Remove-Item $venvTestPath -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "   ✅ Eliminado venv_test_clone" -ForegroundColor Green
}

# 6. Verificar .env (Advertencia detectada)
Write-Host "🔒 Verificando archivo .env..." -ForegroundColor Cyan
if (Test-Path $envPath) {
    Write-Host "   ⚠️  .env existe (sera excluido del build automaticamente)" -ForegroundColor Yellow
    Write-Host "   💡 Asegurate de tener respaldo si contiene datos importantes" -ForegroundColor DarkGray
} else {
    Write-Host "   ✅ .env no existe (correcto)" -ForegroundColor Green
}

# 7. Limpiar directorios de datos del usuario
$pathsToClean = @(
    @{Path = $appDataPath; Name = "%AppData% runtime"},
    @{Path = $tempPath; Name = "temp"},
    @{Path = $buildPath; Name = "dist (build anterior)"}
)

foreach ($item in $pathsToClean) {
    if (Test-Path $item.Path) {
        Remove-Item $item.Path -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "   ✅ Eliminado: $($item.Name)" -ForegroundColor Green
    }
}

# 8. Limpiar node_modules (se reinstalará)
Write-Host "🧹 Limpiando node_modules..." -ForegroundColor Cyan
if (Test-Path $node_modulesPath) {
    Remove-Item $node_modulesPath -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "   ✅ Eliminado node_modules" -ForegroundColor Green
} else {
    Write-Host "   ✅ node_modules no existe" -ForegroundColor Green
}

Write-Host "`n✅ Limpieza completada" -ForegroundColor Green

# ============================================
# FASE 2: VALIDACION DE ESTRUCTURA
# ============================================
if (-not $SkipValidation) {
    Write-Host "`n╔══════════════════════════════════════════════════════╗" -ForegroundColor Yellow
    Write-Host "║  FASE 2: Validacion de Estructura                   ║" -ForegroundColor Yellow
    Write-Host "╚══════════════════════════════════════════════════════╝`n" -ForegroundColor Yellow

    if (Test-Path ".\validate-build-structure.ps1") {
        Write-Host "🔍 Ejecutando validacion de estructura..." -ForegroundColor Cyan
        
        # Ejecutar validación (ya no usa parametro IncludeVenvBase)
        $validationResult = & ".\validate-build-structure.ps1"
        
        if ($LASTEXITCODE -ne 0) {
            Write-Host "`n❌ Validacion fallo - Se encontraron errores criticos" -ForegroundColor Red
            Write-Host "   Revisa los errores anteriores y corrige antes de continuar" -ForegroundColor Yellow
            pause
            exit 1
        }
        
        Write-Host "`n✅ Validacion completada exitosamente" -ForegroundColor Green
    } else {
        Write-Host "⚠️  Script de validacion no encontrado, continuando..." -ForegroundColor Yellow
    }
}

# ============================================
# FASE 3: Instalacion de Paquetes Python Portable
# ============================================
Write-Host "`n╔══════════════════════════════════════════════════════╗" -ForegroundColor Yellow
Write-Host "║  FASE 3: Instalacion de Paquetes Python Portable    ║" -ForegroundColor Yellow
Write-Host "╚══════════════════════════════════════════════════════╝`n" -ForegroundColor Yellow

$pythonPortablePath = Join-Path $PSScriptRoot "backend\python-portable\python.exe"
$markerFile = Join-Path $PSScriptRoot "backend\python-portable\.packages_installed"

# Verificar que existe Python portable
if (-not (Test-Path $pythonPortablePath)) {
    Write-Host "❌ ERROR: Python portable no encontrado" -ForegroundColor Red
    Write-Host "   Ruta esperada: $pythonPortablePath" -ForegroundColor Gray
    Write-Host "   Descarga Python 3.12.x portable y descomprime en backend/python-portable/" -ForegroundColor Yellow
    pause
    exit 1
}

Write-Host "✅ Python portable encontrado" -ForegroundColor Green
Write-Host ""

# Verificar si necesita instalar paquetes
if (-not (Test-Path $markerFile)) {
    Write-Host "⚙️  INSTALACION DE PAQUETES REQUERIDA" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "   ℹ️  ESTRATEGIA:" -ForegroundColor Cyan
    Write-Host "   ✓ Git ignora: site-packages/ y Scripts/ (no se commitean)" -ForegroundColor Yellow
    Write-Host "   ✓ Build empaqueta: Python base + todos los paquetes instalados" -ForegroundColor Green
    Write-Host "   ✓ Usuario recibe: App completa lista para usar (~500 MB)" -ForegroundColor Green
    Write-Host ""
    Write-Host "   Instalando 167 paquetes (~414 MB)..." -ForegroundColor White
    Write-Host "   Tiempo estimado: 10-15 minutos" -ForegroundColor Gray
    Write-Host ""
    
    if (Test-Path ".\install-python-packages.ps1") {
        & ".\install-python-packages.ps1"
        
        if ($LASTEXITCODE -ne 0) {
            Write-Host "`n❌ ERROR: Fallo la instalacion de paquetes Python" -ForegroundColor Red
            pause
            exit 1
        }
    } else {
        Write-Host "❌ ERROR: install-python-packages.ps1 no encontrado" -ForegroundColor Red
        pause
        exit 1
    }
} else {
    Write-Host "✅ Paquetes Python ya instalados" -ForegroundColor Green
    
    $markerContent = Get-Content $markerFile -Raw -ErrorAction SilentlyContinue
    if ($markerContent) {
        Write-Host ""
        Write-Host $markerContent -ForegroundColor Gray
    }
    
    Write-Host ""
    Write-Host "   ℹ️  ESTRATEGIA BUILD:" -ForegroundColor Cyan
    Write-Host "   ✓ Git ignora: site-packages/ (no crece el repositorio)" -ForegroundColor Yellow
    Write-Host "   ✓ Build empaqueta: Todos los paquetes instalados" -ForegroundColor Green
    Write-Host "   ✓ Usuario recibe: App lista, sin instalaciones adicionales" -ForegroundColor Green
}

# ============================================
# FASE 4: INSTALACION DE DEPENDENCIAS NPM
# ============================================
Write-Host "`n╔══════════════════════════════════════════════════════╗" -ForegroundColor Yellow
Write-Host "║  FASE 4: Instalacion de Dependencias NPM            ║" -ForegroundColor Yellow
Write-Host "╚══════════════════════════════════════════════════════╝`n" -ForegroundColor Yellow

Write-Host "📦 Instalando dependencias de Node.js..." -ForegroundColor Cyan
Write-Host "   Esto puede tardar 2-3 minutos..." -ForegroundColor Gray
Write-Host ""

yarn install

if ($LASTEXITCODE -ne 0) {
    Write-Host "`n❌ Error al instalar dependencias NPM" -ForegroundColor Red
    pause
    exit 1
}

Write-Host "`n✅ Dependencias NPM instaladas" -ForegroundColor Green

# ============================================
# FASE 5: BUILD CON ELECTRON BUILDER
# ============================================
Write-Host "`n╔══════════════════════════════════════════════════════╗" -ForegroundColor Yellow
Write-Host "║  FASE 5: Build con Electron Builder                 ║" -ForegroundColor Yellow
Write-Host "╚══════════════════════════════════════════════════════╝`n" -ForegroundColor Yellow

Write-Host "🔨 Empaquetando aplicacion..." -ForegroundColor Cyan
Write-Host ""
Write-Host "   Tiempo estimado: 10-15 minutos" -ForegroundColor Gray
Write-Host "   Tamano final: ~500 MB (Python + 167 paquetes pre-instalados)" -ForegroundColor Gray
Write-Host "   Por favor espera..." -ForegroundColor Gray
Write-Host ""

$buildStartTime = Get-Date

yarn app:dist

$buildEndTime = Get-Date
$buildDuration = ($buildEndTime - $buildStartTime).TotalMinutes

if ($LASTEXITCODE -ne 0) {
    Write-Host "`n❌ Error al construir la aplicacion" -ForegroundColor Red
    pause
    exit 1
}

# ============================================
# FASE 6: VERIFICACION DEL BUILD
# ============================================
Write-Host "`n╔══════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║  FASE 6: Verificacion del Build                      ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════════════════════╝`n" -ForegroundColor Green

$distPath = Join-Path $PSScriptRoot "dist"
$setupExe = Get-ChildItem -Path $distPath -Filter "*.exe" -ErrorAction SilentlyContinue | Select-Object -First 1

if ($setupExe) {
    $setupSize = [math]::Round(($setupExe.Length / 1MB), 2)
    
    Write-Host "✅ Build completado exitosamente" -ForegroundColor Green
    Write-Host ""
    Write-Host "📊 Informacion del Build:" -ForegroundColor Cyan
    Write-Host "   Archivo:  $($setupExe.Name)" -ForegroundColor White
    Write-Host "   Tamano:   $setupSize MB" -ForegroundColor White
    Write-Host "   Duracion: $([math]::Round($buildDuration, 2)) minutos" -ForegroundColor White
    Write-Host "   Ruta:     $($setupExe.FullName)" -ForegroundColor Gray
    Write-Host ""
    
    Write-Host "🚀 Build COMPLETO con dependencias pre-instaladas" -ForegroundColor Green
    Write-Host "   - Python base: ~25 MB" -ForegroundColor White
    Write-Host "   - Paquetes incluidos: 167 (~414 MB)" -ForegroundColor Green
    Write-Host "   - Usuario final: App lista para usar, SIN instalaciones adicionales" -ForegroundColor Green
    Write-Host "   - Repositorio Git: Solo Python base (paquetes ignorados)" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "╔══════════════════════════════════════════════════════╗" -ForegroundColor Green
    Write-Host "║           BUILD COMPLETADO EXITOSAMENTE              ║" -ForegroundColor Green
    Write-Host "╚══════════════════════════════════════════════════════╝" -ForegroundColor Green
    Write-Host ""
    
    # Preguntar si desea abrir la carpeta dist
    $openDist = Read-Host "Deseas abrir la carpeta dist? (s/n)"
    if ($openDist -eq 's') {
        Start-Process explorer.exe $distPath
    }
    
    exit 0
} else {
    Write-Host "⚠️  Build completo pero no se encontro el instalador .exe" -ForegroundColor Yellow
    Write-Host "   Verifica manualmente la carpeta dist/" -ForegroundColor Gray
    exit 0
}