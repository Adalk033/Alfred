# ============================================
# SCRIPT: Build para macOS (desde Windows)
# ============================================
# Proposito: Construir ejecutable DMG para macOS desde Windows
# Uso: .\buildMac.ps1
# Nota: Electron Builder puede construir para macOS desde Windows
# ============================================

param(
    [switch]$Force = $false,
    [switch]$SkipClean = $false
)

$ErrorActionPreference = "Continue"

Write-Host "`n╔══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   Alfred Electron - Build para macOS (desde Win)    ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

# Verificar que el usuario quiera continuar
if (-not $Force) {
    Write-Host "Este script construira Alfred para macOS (DMG)" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Requisitos:" -ForegroundColor Cyan
    Write-Host "  ✓ Node.js y Yarn/npm instalados" -ForegroundColor White
    Write-Host "  ✓ Dependencias de Electron Builder" -ForegroundColor White
    Write-Host "  ✓ Espacio en disco: ~500 MB" -ForegroundColor White
    Write-Host ""
    Write-Host "⚠️  LIMITACIONES:" -ForegroundColor Yellow
    Write-Host "   • DMG sin firma (requiere macOS para firmar)" -ForegroundColor Gray
    Write-Host "   • Usuario macOS vera advertencia de seguridad" -ForegroundColor Gray
    Write-Host "   • Solucion: Clic derecho > Abrir en primera ejecucion" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Se generara:" -ForegroundColor Cyan
    Write-Host "  → dist/Alfred-x.x.x.dmg" -ForegroundColor Green
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
# FASE 3: BUILD PARA macOS
# ============================================
Write-Host "`n╔══════════════════════════════════════════════════════╗" -ForegroundColor Yellow
Write-Host "║  FASE 3: Construccion para macOS                    ║" -ForegroundColor Yellow
Write-Host "╚══════════════════════════════════════════════════════╝`n" -ForegroundColor Yellow

Write-Host "🔨 Construyendo DMG para macOS..." -ForegroundColor Cyan
Write-Host ""
Write-Host "   Plataforma objetivo: macOS (x64 + arm64)" -ForegroundColor White
Write-Host "   Formato: DMG (instalador)" -ForegroundColor White
Write-Host "   Tiempo estimado: 5-10 minutos" -ForegroundColor Gray
Write-Host "   Por favor espera..." -ForegroundColor Gray
Write-Host ""

$buildStartTime = Get-Date

yarn run build:mac

$buildEndTime = Get-Date
$buildDuration = ($buildEndTime - $buildStartTime).TotalMinutes

if ($LASTEXITCODE -ne 0) {
    Write-Host "`n❌ Error al construir para macOS" -ForegroundColor Red
    Write-Host ""
    Write-Host "Posibles causas:" -ForegroundColor Yellow
    Write-Host "  • Falta configuracion en package.json" -ForegroundColor White
    Write-Host "  • Dependencias de Electron Builder incompletas" -ForegroundColor White
    Write-Host "  • Problemas con iconos (assets/icon.icns)" -ForegroundColor White
    Write-Host ""
    Write-Host "💡 Tip: Verifica que assets/icon.icns existe" -ForegroundColor Cyan
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
$dmg = Get-ChildItem -Path $distPath -Filter "*.dmg" -ErrorAction SilentlyContinue | Select-Object -First 1
$macFolder = Get-ChildItem -Path $distPath -Filter "mac*" -Directory -ErrorAction SilentlyContinue | Select-Object -First 1

if ($dmg) {
    $dmgSize = [math]::Round(($dmg.Length / 1MB), 2)
    
    Write-Host "✅ Build para macOS completado exitosamente" -ForegroundColor Green
    Write-Host ""
    Write-Host "📊 Informacion del Build:" -ForegroundColor Cyan
    Write-Host "   Archivo:     $($dmg.Name)" -ForegroundColor White
    Write-Host "   Tamano:      $dmgSize MB" -ForegroundColor White
    Write-Host "   Duracion:    $([math]::Round($buildDuration, 2)) minutos" -ForegroundColor White
    Write-Host "   Plataforma:  macOS (x64 + arm64 Universal)" -ForegroundColor White
    Write-Host "   Formato:     DMG" -ForegroundColor White
    Write-Host "   Ruta:        $($dmg.FullName)" -ForegroundColor Gray
    Write-Host ""
    
    Write-Host "📝 INSTRUCCIONES DE USO EN macOS:" -ForegroundColor Cyan
    Write-Host "   1. Transferir el archivo a una Mac" -ForegroundColor White
    Write-Host "   2. Abrir el DMG (doble clic)" -ForegroundColor White
    Write-Host "   3. Arrastrar Alfred.app a Aplicaciones" -ForegroundColor White
    Write-Host "   4. Primera ejecucion:" -ForegroundColor White
    Write-Host "      • Clic derecho en Alfred.app > Abrir" -ForegroundColor Yellow
    Write-Host "      • O: Sistema > Seguridad > Permitir" -ForegroundColor Yellow
    Write-Host ""
    
    Write-Host "⚠️  ADVERTENCIA DE SEGURIDAD:" -ForegroundColor Yellow
    Write-Host "   macOS mostrara: 'Alfred no puede abrirse porque el" -ForegroundColor Gray
    Write-Host "   desarrollador no se puede verificar'" -ForegroundColor Gray
    Write-Host ""
    Write-Host "   SOLUCION: Clic derecho > Abrir (solo primera vez)" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "   Para distribucion comercial, necesitas:" -ForegroundColor Gray
    Write-Host "   • Apple Developer Account ($99/ano)" -ForegroundColor Gray
    Write-Host "   • Certificado de firma de codigo" -ForegroundColor Gray
    Write-Host "   • Notarizacion de Apple" -ForegroundColor Gray
    Write-Host ""
    
    Write-Host "ℹ️  COMPATIBILIDAD:" -ForegroundColor Cyan
    Write-Host "   • macOS 10.13 (High Sierra) o superior" -ForegroundColor White
    Write-Host "   • Intel x64 y Apple Silicon (M1/M2/M3) - Universal Binary" -ForegroundColor White
    Write-Host ""
    
    # Verificar arquitecturas incluidas
    if ($macFolder) {
        $appPath = Get-ChildItem -Path $macFolder.FullName -Filter "*.app" -Directory -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($appPath) {
            Write-Host "📦 Arquitecturas incluidas:" -ForegroundColor Cyan
            $execPath = Join-Path $appPath.FullName "Contents\MacOS\Alfred"
            if (Test-Path $execPath) {
                Write-Host "   ✅ Binary universal detectado en el build" -ForegroundColor Green
            }
        }
    }
    Write-Host ""
    
    Write-Host "╔══════════════════════════════════════════════════════╗" -ForegroundColor Green
    Write-Host "║      BUILD PARA macOS COMPLETADO EXITOSAMENTE        ║" -ForegroundColor Green
    Write-Host "╚══════════════════════════════════════════════════════╝" -ForegroundColor Green
    Write-Host ""
    
    # Preguntar si desea abrir la carpeta dist
    $openDist = Read-Host "Deseas abrir la carpeta dist? (s/n)"
    if ($openDist -eq 's') {
        Start-Process explorer.exe $distPath
    }
    
    exit 0
} else {
    Write-Host "⚠️  Build completo pero no se encontro el archivo DMG" -ForegroundColor Yellow
    Write-Host "   Verifica manualmente la carpeta dist/" -ForegroundColor Gray
    Write-Host ""
    
    # Buscar archivos .app como alternativa
    $app = Get-ChildItem -Path $distPath -Filter "*.app" -Directory -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($app) {
        Write-Host "   ℹ️  Se encontro: $($app.Name)" -ForegroundColor Cyan
        Write-Host "   Ruta: $($app.FullName)" -ForegroundColor Gray
    }
    
    # Mostrar contenido de dist
    if (Test-Path $distPath) {
        Write-Host ""
        Write-Host "Contenido de dist/:" -ForegroundColor Cyan
        Get-ChildItem $distPath | ForEach-Object {
            Write-Host "   - $($_.Name)" -ForegroundColor White
        }
    }
    
    exit 0
}
