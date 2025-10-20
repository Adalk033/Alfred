# ============================================
# SCRIPT: Build para Linux (desde Windows)
# ============================================
# Proposito: Construir ejecutable AppImage para Linux desde Windows
# Uso: .\buildLinux.ps1
# Nota: Electron Builder puede construir para Linux desde Windows
# ============================================

param(
    [switch]$Force = $false,
    [switch]$SkipClean = $false
)

$ErrorActionPreference = "Continue"

Write-Host "`n╔══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   Alfred Electron - Build para Linux (desde Win)    ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

# Verificar que el usuario quiera continuar
if (-not $Force) {
    Write-Host "Este script construira Alfred para Linux (AppImage)" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Requisitos:" -ForegroundColor Cyan
    Write-Host "  ✓ Node.js y Yarn/npm instalados" -ForegroundColor White
    Write-Host "  ✓ Dependencias de Electron Builder" -ForegroundColor White
    Write-Host "  ✓ Espacio en disco: ~500 MB" -ForegroundColor White
    Write-Host ""
    Write-Host "Se generara:" -ForegroundColor Cyan
    Write-Host "  → dist/Alfred-x.x.x.AppImage" -ForegroundColor Green
    Write-Host ""
    
    $confirmation = Read-Host "Deseas continuar? (s/n)"
    if ($confirmation -ne 's') {
        Write-Host "`n❌ Operacion cancelada por el usuario." -ForegroundColor Red
        exit 0
    }
}

# ============================================
# FASE 1: LIMPIEZA (OPCIONAL)
# ============================================
if (-not $SkipClean) {
    Write-Host "`n╔══════════════════════════════════════════════════════╗" -ForegroundColor Yellow
    Write-Host "║  FASE 1: Limpieza de Build Anterior                 ║" -ForegroundColor Yellow
    Write-Host "╚══════════════════════════════════════════════════════╝`n" -ForegroundColor Yellow

    $distPath = Join-Path $PSScriptRoot "dist"
    
    if (Test-Path $distPath) {
        Write-Host "🧹 Limpiando build anterior..." -ForegroundColor Cyan
        Remove-Item $distPath -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "   ✅ Carpeta dist eliminada" -ForegroundColor Green
    } else {
        Write-Host "   ✅ Sin builds anteriores" -ForegroundColor Green
    }
}

# ============================================
# FASE 2: VERIFICACION DE DEPENDENCIAS
# ============================================
Write-Host "`n╔══════════════════════════════════════════════════════╗" -ForegroundColor Yellow
Write-Host "║  FASE 2: Verificacion de Dependencias               ║" -ForegroundColor Yellow
Write-Host "╚══════════════════════════════════════════════════════╝`n" -ForegroundColor Yellow

# Verificar node_modules
$nodeModulesPath = Join-Path $PSScriptRoot "node_modules"

if (-not (Test-Path $nodeModulesPath)) {
    Write-Host "📦 Instalando dependencias de Node.js..." -ForegroundColor Cyan
    yarn install
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "`n❌ Error al instalar dependencias NPM" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "   ✅ Dependencias instaladas" -ForegroundColor Green
} else {
    Write-Host "✅ Dependencias ya instaladas" -ForegroundColor Green
}

# ============================================
# FASE 3: BUILD PARA LINUX
# ============================================
Write-Host "`n╔══════════════════════════════════════════════════════╗" -ForegroundColor Yellow
Write-Host "║  FASE 3: Construccion para Linux                    ║" -ForegroundColor Yellow
Write-Host "╚══════════════════════════════════════════════════════╝`n" -ForegroundColor Yellow

Write-Host "🔨 Construyendo AppImage para Linux..." -ForegroundColor Cyan
Write-Host ""
Write-Host "   Plataforma objetivo: Linux (x64)" -ForegroundColor White
Write-Host "   Formato: AppImage" -ForegroundColor White
Write-Host "   Tiempo estimado: 5-10 minutos" -ForegroundColor Gray
Write-Host "   Por favor espera..." -ForegroundColor Gray
Write-Host ""

$buildStartTime = Get-Date

yarn run build:linux

$buildEndTime = Get-Date
$buildDuration = ($buildEndTime - $buildStartTime).TotalMinutes

if ($LASTEXITCODE -ne 0) {
    Write-Host "`n❌ Error al construir para Linux" -ForegroundColor Red
    Write-Host ""
    Write-Host "Posibles causas:" -ForegroundColor Yellow
    Write-Host "  • Falta configuracion en package.json" -ForegroundColor White
    Write-Host "  • Dependencias de Electron Builder incompletas" -ForegroundColor White
    Write-Host "  • Problemas con iconos (assets/icon.png)" -ForegroundColor White
    Write-Host ""
    exit 1
}

# ============================================
# FASE 4: VERIFICACION DEL BUILD
# ============================================
Write-Host "`n╔══════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║  FASE 4: Verificacion del Build                     ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════════════════════╝`n" -ForegroundColor Green

$distPath = Join-Path $PSScriptRoot "dist"
$appImage = Get-ChildItem -Path $distPath -Filter "*.AppImage" -ErrorAction SilentlyContinue | Select-Object -First 1

if ($appImage) {
    $appImageSize = [math]::Round(($appImage.Length / 1MB), 2)
    
    Write-Host "✅ Build para Linux completado exitosamente" -ForegroundColor Green
    Write-Host ""
    Write-Host "📊 Informacion del Build:" -ForegroundColor Cyan
    Write-Host "   Archivo:     $($appImage.Name)" -ForegroundColor White
    Write-Host "   Tamano:      $appImageSize MB" -ForegroundColor White
    Write-Host "   Duracion:    $([math]::Round($buildDuration, 2)) minutos" -ForegroundColor White
    Write-Host "   Plataforma:  Linux x64" -ForegroundColor White
    Write-Host "   Formato:     AppImage" -ForegroundColor White
    Write-Host "   Ruta:        $($appImage.FullName)" -ForegroundColor Gray
    Write-Host ""
    
    Write-Host "📝 INSTRUCCIONES DE USO EN LINUX:" -ForegroundColor Cyan
    Write-Host "   1. Transferir el archivo a una maquina Linux" -ForegroundColor White
    Write-Host "   2. Dar permisos de ejecucion:" -ForegroundColor White
    Write-Host "      chmod +x $($appImage.Name)" -ForegroundColor Yellow
    Write-Host "   3. Ejecutar:" -ForegroundColor White
    Write-Host "      ./$($appImage.Name)" -ForegroundColor Yellow
    Write-Host ""
    
    Write-Host "ℹ️  COMPATIBILIDAD:" -ForegroundColor Cyan
    Write-Host "   • Ubuntu 18.04+" -ForegroundColor White
    Write-Host "   • Debian 10+" -ForegroundColor White
    Write-Host "   • Fedora 30+" -ForegroundColor White
    Write-Host "   • Arch Linux" -ForegroundColor White
    Write-Host "   • Otras distribuciones modernas" -ForegroundColor White
    Write-Host ""
    
    Write-Host "╔══════════════════════════════════════════════════════╗" -ForegroundColor Green
    Write-Host "║      BUILD PARA LINUX COMPLETADO EXITOSAMENTE        ║" -ForegroundColor Green
    Write-Host "╚══════════════════════════════════════════════════════╝" -ForegroundColor Green
    Write-Host ""
    
    # Preguntar si desea abrir la carpeta dist
    $openDist = Read-Host "Deseas abrir la carpeta dist? (s/n)"
    if ($openDist -eq 's') {
        Start-Process explorer.exe $distPath
    }
    
    exit 0
} else {
    Write-Host "⚠️  Build completo pero no se encontro el archivo AppImage" -ForegroundColor Yellow
    Write-Host "   Verifica manualmente la carpeta dist/" -ForegroundColor Gray
    Write-Host ""
    
    # Mostrar contenido de dist
    if (Test-Path $distPath) {
        Write-Host "Contenido de dist/:" -ForegroundColor Cyan
        Get-ChildItem $distPath | ForEach-Object {
            Write-Host "   - $($_.Name)" -ForegroundColor White
        }
    }
    
    exit 0
}
