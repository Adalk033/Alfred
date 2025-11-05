# ============================================
# SCRIPT: Validador de Builds Multiplataforma
# ============================================
# Proposito: Verificar que los builds para todas las plataformas funcionen
# Uso: .\test-builds.ps1
# ============================================

param(
    [switch]$Quick = $false  # Solo verificar configuracion sin construir
)

$ErrorActionPreference = "Continue"

Write-Host "`n╔══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║     Alfred - Validador de Builds Multiplataforma    ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

# ============================================
# FASE 1: VERIFICACION DE CONFIGURACION
# ============================================
Write-Host "╔══════════════════════════════════════════════════════╗" -ForegroundColor Yellow
Write-Host "║  FASE 1: Verificacion de Configuracion              ║" -ForegroundColor Yellow
Write-Host "╚══════════════════════════════════════════════════════╝`n" -ForegroundColor Yellow

# Verificar package.json
$packageJson = Join-Path $PSScriptRoot "package.json"
if (-not (Test-Path $packageJson)) {
    Write-Host "❌ Error: No se encontro package.json" -ForegroundColor Red
    exit 1
}

$package = Get-Content $packageJson | ConvertFrom-Json
Write-Host "✅ package.json encontrado" -ForegroundColor Green
Write-Host "   Nombre:   $($package.name)" -ForegroundColor White
Write-Host "   Version:  $($package.version)" -ForegroundColor White
Write-Host ""

# Verificar configuracion de build
$buildConfig = $package.build
if (-not $buildConfig) {
    Write-Host "❌ Error: No hay configuracion de build en package.json" -ForegroundColor Red
    exit 1
}

Write-Host "📋 Configuracion de Build:" -ForegroundColor Cyan
Write-Host ""

# Windows
if ($buildConfig.win) {
    Write-Host "✅ Windows configurado:" -ForegroundColor Green
    Write-Host "   Target: $($buildConfig.win.target)" -ForegroundColor White
    Write-Host "   Icon:   $($buildConfig.win.icon)" -ForegroundColor White
    
    # Verificar icono
    $iconPath = Join-Path $PSScriptRoot $buildConfig.win.icon
    if (Test-Path $iconPath) {
        $iconSize = [math]::Round((Get-Item $iconPath).Length / 1KB, 2)
        Write-Host "   ✅ Icono existe ($iconSize KB)" -ForegroundColor Green
    } else {
        Write-Host "   ❌ Icono NO existe: $iconPath" -ForegroundColor Red
    }
} else {
    Write-Host "⚠️  Windows NO configurado" -ForegroundColor Yellow
}
Write-Host ""

# macOS
if ($buildConfig.mac) {
    Write-Host "✅ macOS configurado:" -ForegroundColor Green
    Write-Host "   Target: $($buildConfig.mac.target)" -ForegroundColor White
    Write-Host "   Icon:   $($buildConfig.mac.icon)" -ForegroundColor White
    
    # Verificar icono
    $iconPath = Join-Path $PSScriptRoot $buildConfig.mac.icon
    if (Test-Path $iconPath) {
        $iconSize = [math]::Round((Get-Item $iconPath).Length / 1KB, 2)
        Write-Host "   ✅ Icono existe ($iconSize KB)" -ForegroundColor Green
    } else {
        Write-Host "   ❌ Icono NO existe: $iconPath" -ForegroundColor Red
    }
} else {
    Write-Host "⚠️  macOS NO configurado" -ForegroundColor Yellow
}
Write-Host ""

# Linux
if ($buildConfig.linux) {
    Write-Host "✅ Linux configurado:" -ForegroundColor Green
    Write-Host "   Target: $($buildConfig.linux.target)" -ForegroundColor White
    Write-Host "   Icon:   $($buildConfig.linux.icon)" -ForegroundColor White
    
    # Verificar icono
    $iconPath = Join-Path $PSScriptRoot $buildConfig.linux.icon
    if (Test-Path $iconPath) {
        $iconSize = [math]::Round((Get-Item $iconPath).Length / 1KB, 2)
        Write-Host "   ✅ Icono existe ($iconSize KB)" -ForegroundColor Green
    } else {
        Write-Host "   ❌ Icono NO existe: $iconPath" -ForegroundColor Red
    }
} else {
    Write-Host "⚠️  Linux NO configurado" -ForegroundColor Yellow
}
Write-Host ""

# Verificar archivos críticos
Write-Host "📄 Archivos criticos:" -ForegroundColor Cyan
$criticalFiles = @("main.js", "preload.js", "renderer/index.html")
$allFilesExist = $true

foreach ($file in $criticalFiles) {
    $filePath = Join-Path $PSScriptRoot $file
    if (Test-Path $filePath) {
        Write-Host "   ✅ $file" -ForegroundColor Green
    } else {
        Write-Host "   ❌ $file - NO EXISTE" -ForegroundColor Red
        $allFilesExist = $false
    }
}
Write-Host ""

if (-not $allFilesExist) {
    Write-Host "❌ Faltan archivos criticos. No se puede continuar." -ForegroundColor Red
    exit 1
}

# ============================================
# FASE 2: TEST DE BUILDS (OPCIONAL)
# ============================================
if ($Quick) {
    Write-Host "╔══════════════════════════════════════════════════════╗" -ForegroundColor Green
    Write-Host "║      VALIDACION RAPIDA COMPLETADA EXITOSAMENTE       ║" -ForegroundColor Green
    Write-Host "╚══════════════════════════════════════════════════════╝" -ForegroundColor Green
    Write-Host ""
    Write-Host "✅ Configuracion valida para:" -ForegroundColor Green
    if ($buildConfig.win) { Write-Host "   • Windows" -ForegroundColor White }
    if ($buildConfig.mac) { Write-Host "   • macOS" -ForegroundColor White }
    if ($buildConfig.linux) { Write-Host "   • Linux" -ForegroundColor White }
    Write-Host ""
    Write-Host "Para construir los instaladores ejecuta:" -ForegroundColor Cyan
    Write-Host "   .\builtWin.ps1     - Build para Windows" -ForegroundColor White
    Write-Host "   .\buildMac.ps1     - Build para macOS" -ForegroundColor White
    Write-Host "   .\buildLinux.ps1   - Build para Linux" -ForegroundColor White
    Write-Host ""
    exit 0
}

Write-Host "╔══════════════════════════════════════════════════════╗" -ForegroundColor Yellow
Write-Host "║  FASE 2: Test de Builds                              ║" -ForegroundColor Yellow
Write-Host "╚══════════════════════════════════════════════════════╝`n" -ForegroundColor Yellow

Write-Host "⚠️  ADVERTENCIA: Esto construira instaladores para todas las plataformas" -ForegroundColor Yellow
Write-Host "   Tiempo estimado: 15-30 minutos" -ForegroundColor Gray
Write-Host "   Espacio en disco: ~1-2 GB" -ForegroundColor Gray
Write-Host ""

$confirmation = Read-Host "Deseas continuar con los test builds? (s/n)"
if ($confirmation -ne 's') {
    Write-Host "`n✅ Validacion de configuracion completada." -ForegroundColor Green
    Write-Host "   Los builds NO se ejecutaron." -ForegroundColor Gray
    exit 0
}

# Limpiar builds anteriores
Write-Host "`n🧹 Limpiando builds anteriores..." -ForegroundColor Cyan
$distPath = Join-Path $PSScriptRoot "dist"
if (Test-Path $distPath) {
    Remove-Item $distPath -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "   ✅ Carpeta dist limpiada" -ForegroundColor Green
}
Write-Host ""

# Test Windows Build
Write-Host "🔨 Construyendo para Windows..." -ForegroundColor Cyan
$winStartTime = Get-Date
yarn run build:win
$winEndTime = Get-Date
$winDuration = ($winEndTime - $winStartTime).TotalMinutes

if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✅ Build Windows exitoso ($([math]::Round($winDuration, 2)) min)" -ForegroundColor Green
} else {
    Write-Host "   ❌ Build Windows fallo" -ForegroundColor Red
}
Write-Host ""

# Test macOS Build
Write-Host "🔨 Construyendo para macOS..." -ForegroundColor Cyan
$macStartTime = Get-Date
yarn run build:mac
$macEndTime = Get-Date
$macDuration = ($macEndTime - $macStartTime).TotalMinutes

if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✅ Build macOS exitoso ($([math]::Round($macDuration, 2)) min)" -ForegroundColor Green
} else {
    Write-Host "   ❌ Build macOS fallo" -ForegroundColor Red
}
Write-Host ""

# Test Linux Build
Write-Host "🔨 Construyendo para Linux..." -ForegroundColor Cyan
$linuxStartTime = Get-Date
yarn run build:linux
$linuxEndTime = Get-Date
$linuxDuration = ($linuxEndTime - $linuxStartTime).TotalMinutes

if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✅ Build Linux exitoso ($([math]::Round($linuxDuration, 2)) min)" -ForegroundColor Green
} else {
    Write-Host "   ❌ Build Linux fallo" -ForegroundColor Red
}
Write-Host ""

# ============================================
# RESUMEN FINAL
# ============================================
Write-Host "╔══════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║           RESUMEN DE BUILDS COMPLETADO               ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════════════════════╝`n" -ForegroundColor Green

# Verificar archivos generados
$winExe = Get-ChildItem -Path $distPath -Filter "*.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
$macDmg = Get-ChildItem -Path $distPath -Filter "*.dmg" -ErrorAction SilentlyContinue | Select-Object -First 1
$linuxAppImage = Get-ChildItem -Path $distPath -Filter "*.AppImage" -ErrorAction SilentlyContinue | Select-Object -First 1

Write-Host "📦 Archivos generados:" -ForegroundColor Cyan
Write-Host ""

if ($winExe) {
    $winSize = [math]::Round(($winExe.Length / 1MB), 2)
    Write-Host "   ✅ Windows: $($winExe.Name) ($winSize MB)" -ForegroundColor Green
} else {
    Write-Host "   ❌ Windows: No se genero el instalador" -ForegroundColor Red
}

if ($macDmg) {
    $macSize = [math]::Round(($macDmg.Length / 1MB), 2)
    Write-Host "   ✅ macOS: $($macDmg.Name) ($macSize MB)" -ForegroundColor Green
} else {
    Write-Host "   ❌ macOS: No se genero el instalador" -ForegroundColor Red
}

if ($linuxAppImage) {
    $linuxSize = [math]::Round(($linuxAppImage.Length / 1MB), 2)
    Write-Host "   ✅ Linux: $($linuxAppImage.Name) ($linuxSize MB)" -ForegroundColor Green
} else {
    Write-Host "   ❌ Linux: No se genero el instalador" -ForegroundColor Red
}

Write-Host ""
Write-Host "⏱️  Tiempo total: $([math]::Round(($winDuration + $macDuration + $linuxDuration), 2)) minutos" -ForegroundColor Cyan
Write-Host ""

# Abrir carpeta dist
$openDist = Read-Host "Deseas abrir la carpeta dist? (s/n)"
if ($openDist -eq 's') {
    Start-Process explorer.exe $distPath
}
