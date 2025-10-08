# install_dependencies.ps1
# Script simple para instalar dependencias de Alfred
# Maneja automáticamente el problema de rutas largas en Windows

Write-Host @"

╔═══════════════════════════════════════════╗
║  📦 Instalador de Dependencias Alfred 📦  ║
╚═══════════════════════════════════════════╝

"@ -ForegroundColor Cyan

# Verificar Python
Write-Host "Verificando Python..." -ForegroundColor Cyan
try {
    $pythonVersion = python --version 2>&1
    Write-Host "✅ $pythonVersion encontrado" -ForegroundColor Green
} catch {
    Write-Host "❌ Python no está instalado" -ForegroundColor Red
    exit 1
}

Write-Host "`n¿Qué dependencias deseas instalar?`n" -ForegroundColor Yellow

Write-Host "1. Solo esenciales (recomendado para Windows)" -ForegroundColor White
Write-Host "   - Rápido, sin problemas de rutas largas" -ForegroundColor Gray
Write-Host "   - Todo lo necesario para Alfred Backend" -ForegroundColor Gray
Write-Host ""

Write-Host "2. Completas (puede fallar en Windows)" -ForegroundColor White
Write-Host "   - Incluye paquetes opcionales" -ForegroundColor Gray
Write-Host "   - Puede dar error por rutas largas" -ForegroundColor Gray
Write-Host ""

$choice = Read-Host "Selecciona una opción (1 o 2) [1]"

if ([string]::IsNullOrWhiteSpace($choice) -or $choice -eq "1") {
    Write-Host "`n📦 Instalando dependencias esenciales..." -ForegroundColor Cyan
    
    if (-not (Test-Path "requirements_core.txt")) {
        Write-Host "❌ No se encontró requirements_core.txt" -ForegroundColor Red
        exit 1
    }
    
    pip install -r requirements_core.txt
    $exitCode = $LASTEXITCODE
} else {
    Write-Host "`n📦 Instalando todas las dependencias..." -ForegroundColor Cyan
    Write-Host "⚠️  Si falla por rutas largas, ejecuta nuevamente y selecciona opción 1" -ForegroundColor Yellow
    
    if (-not (Test-Path "requirements.txt")) {
        Write-Host "❌ No se encontró requirements.txt" -ForegroundColor Red
        exit 1
    }
    
    pip install -r requirements.txt
    $exitCode = $LASTEXITCODE
}

Write-Host ""

if ($exitCode -eq 0) {
    Write-Host "✅ ¡Dependencias instaladas correctamente!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Próximos pasos:" -ForegroundColor Cyan
    Write-Host "  1. Configura tu .env: Copy-Item .env.example .env" -ForegroundColor Gray
    Write-Host "  2. Inicia el servidor: .\start_alfred_server.ps1" -ForegroundColor Gray
    Write-Host "  3. Prueba: python test_backend.py" -ForegroundColor Gray
} else {
    Write-Host "❌ Error al instalar dependencias" -ForegroundColor Red
    Write-Host ""
    Write-Host "💡 Soluciones:" -ForegroundColor Yellow
    Write-Host "  1. Ejecuta nuevamente y selecciona opción 1 (esenciales)" -ForegroundColor Gray
    Write-Host "  2. Lee TROUBLESHOOTING_WINDOWS_PATH.md para más soluciones" -ForegroundColor Gray
    Write-Host "  3. Habilita rutas largas en Windows (requiere admin):" -ForegroundColor Gray
    Write-Host "     New-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem' -Name 'LongPathsEnabled' -Value 1 -PropertyType DWORD -Force" -ForegroundColor DarkGray
    Write-Host ""
    
    $retry = Read-Host "¿Deseas reintentar con dependencias esenciales? (s/n)"
    if ($retry -eq 's') {
        Write-Host "`n📦 Instalando dependencias esenciales..." -ForegroundColor Cyan
        pip install -r requirements_core.txt
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ ¡Dependencias esenciales instaladas!" -ForegroundColor Green
        } else {
            Write-Host "❌ Error persistente. Consulta TROUBLESHOOTING_WINDOWS_PATH.md" -ForegroundColor Red
            exit 1
        }
    } else {
        exit 1
    }
}

Write-Host "`n✨ Instalación completada ✨`n" -ForegroundColor Green
