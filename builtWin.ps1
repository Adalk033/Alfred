# ============================================
# SCRIPT: Build Optimizado para Windows
# ============================================
# Proposito: Preparar, limpiar y compilar Alfred con Electron Builder
# Uso: .\builtWin.ps1
# ============================================

param(
    [switch]$SkipPreInstall = $false,  # SOLO para desarrollo rapido - NO recomendado para builds de produccion
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
    Write-Host "  3. Pre-instalacion opcional en Python portable" -ForegroundColor White
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
$chroma_dbPath = Join-Path $PSScriptRoot "backend\chroma_db"
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
    @{Path = $chroma_dbPath; Name = "chroma_db"},
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
# FASE 3: Pre-instalacion en Python Portable (Opcional)
# ============================================
$markerFile = Join-Path $PSScriptRoot "backend\python-portable\.packages_installed"

# ============================================
# FASE 3: Pre-instalacion en Python Portable (OBLIGATORIA)
# ============================================
$markerFile = Join-Path $PSScriptRoot "backend\python-portable\.packages_installed"

Write-Host "`n╔══════════════════════════════════════════════════════╗" -ForegroundColor Yellow
Write-Host "║  FASE 3: Pre-instalacion en Python Portable         ║" -ForegroundColor Yellow
Write-Host "╚══════════════════════════════════════════════════════╝`n" -ForegroundColor Yellow

if (-not $SkipPreInstall -and -not (Test-Path $markerFile)) {
    Write-Host "⚙️  INSTALACION OBLIGATORIA DE PAQUETES" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "   Estrategia:" -ForegroundColor White
    Write-Host "   - 167 paquetes base (NO GPU-dependientes)" -ForegroundColor Gray
    Write-Host "   - PyTorch se instalara en 1ra ejecucion segun GPU del usuario" -ForegroundColor Gray
    Write-Host "   - Tiempo estimado: 5-10 minutos" -ForegroundColor Gray
    Write-Host ""
    Write-Host "   Beneficios:" -ForegroundColor White
    Write-Host "   • Instalador: ~400-500 MB (vs ~50 MB sin paquetes)" -ForegroundColor Gray
    Write-Host "   • Primera instalacion usuario: ~3 min (vs 15-20 min)" -ForegroundColor Green
    Write-Host "   • PyTorch optimizado segun hardware (CUDA/ROCm/CPU)" -ForegroundColor Green
    Write-Host ""
    
    if (Test-Path ".\create-venv-base.ps1") {
        Write-Host "🔨 Instalando dependencias..." -ForegroundColor Cyan
        
        & ".\create-venv-base.ps1"
        
        if ($LASTEXITCODE -ne 0) {
            Write-Host "`n❌ ERROR CRITICO: No se pudieron instalar las dependencias" -ForegroundColor Red
            Write-Host "   El build no puede continuar sin los paquetes Python." -ForegroundColor Yellow
            pause
            exit 1
        } else {
            Write-Host "`n✅ Dependencias pre-instaladas exitosamente" -ForegroundColor Green
        }
    } else {
        Write-Host "`n❌ ERROR CRITICO: create-venv-base.ps1 no encontrado" -ForegroundColor Red
        pause
        exit 1
    }
} elseif (Test-Path $markerFile) {
    Write-Host "`n✅ Python portable tiene dependencias pre-instaladas" -ForegroundColor Green
    
    $markerContent = Get-Content $markerFile -Raw
    $packagesMatch = $markerContent -match "Paquetes instalados: (\d+)"
    $packagesCount = if ($packagesMatch) { $Matches[1] } else { "?" }
    
    $sizeMatch = $markerContent -match "Tamano total: ([\d.]+) MB"
    $pythonSize = if ($sizeMatch) { $Matches[1] } else { "?" }
    
    Write-Host "   Paquetes: $packagesCount" -ForegroundColor Gray
    Write-Host "   Tamano: $pythonSize MB" -ForegroundColor Gray
    Write-Host ""
    Write-Host "   ℹ️  ESTRATEGIA GPU-AWARE:" -ForegroundColor Cyan
    Write-Host "   ✓ Pre-instalados: 167 paquetes NO GPU-dependientes (414 MB)" -ForegroundColor Green
    Write-Host "   ✓ Dinamicos: PyTorch, scipy, grpcio (instalan en 1ra ejecucion)" -ForegroundColor Yellow
    Write-Host "   ✓ Usuario obtiene version correcta segun SU hardware" -ForegroundColor Green
    Write-Host ""
    Write-Host "   ℹ️  MODOS DE EJECUCION:" -ForegroundColor Cyan
    Write-Host "   • Desarrollo (npm start): Usa Python SISTEMA + venv tradicional" -ForegroundColor White
    Write-Host "   • Produccion (app.exe): Usa Python portable pre-instalado" -ForegroundColor White
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

# Determinar tiempo estimado basado en pre-instalacion
if (Test-Path $markerFile) {
    Write-Host "   Tiempo estimado: 10-15 minutos (con 167 paquetes pre-instalados)" -ForegroundColor Gray
    Write-Host "   Tamano final: ~400-500 MB (incluye Python portable optimizado)" -ForegroundColor Gray
} else {
    Write-Host "   Tiempo estimado: 5-10 minutos (instalador ligero)" -ForegroundColor Gray
    Write-Host "   Tamano final: ~50 MB (sin dependencias pre-instaladas)" -ForegroundColor Gray
}

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
Write-Host "║  FASE 6: Verificacion del Build                     ║" -ForegroundColor Green
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
    
    # Determinar tipo de build basado en pre-instalacion
    if (Test-Path $markerFile) {
        $markerContent = Get-Content $markerFile -Raw
        $packagesMatch = $markerContent -match "Paquetes instalados: (\d+)"
        $packagesCount = if ($packagesMatch) { $Matches[1] } else { "?" }
        
        Write-Host "🚀 Build OPTIMIZADO (con pre-instalacion)" -ForegroundColor Green
        Write-Host "   - Paquetes pre-instalados: $packagesCount (414 MB)" -ForegroundColor White
        Write-Host "   - Primera instalacion usuario: ~3 min (solo PyTorch)" -ForegroundColor White
        Write-Host "   - PyTorch: Se instala segun GPU detectada (CUDA/ROCm/CPU)" -ForegroundColor Green
        Write-Host "   - Requiere internet: Solo para PyTorch en 1ra ejecucion" -ForegroundColor White
    } else {
        Write-Host "⚡ Build BASICO (sin pre-instalacion)" -ForegroundColor Yellow
        Write-Host "   - Primera instalacion usuario: 15-20 min (todas las deps)" -ForegroundColor White
        Write-Host "   - Requiere internet para todas las dependencias" -ForegroundColor White
    }
    
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