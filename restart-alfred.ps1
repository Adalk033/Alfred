#!/usr/bin/env pwsh
# restart-alfred.ps1 - Reiniciar Alfred Electron limpiamente

Write-Host "╔══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║     Alfred Electron - Reinicio Limpio               ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Cambiar al directorio del proyecto
Set-Location -Path "f:\Projects\AlfredElectron"

# Matar procesos de Electron existentes
Write-Host "🔄 Cerrando procesos de Electron existentes..." -ForegroundColor Yellow
Get-Process | Where-Object { $_.ProcessName -like "*electron*" } | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

# Verificar servidor de Alfred
Write-Host ""
Write-Host "🔍 Verificando servidor de Alfred..." -ForegroundColor Cyan
try {
    $response = Invoke-WebRequest -Uri "http://localhost:8000/health" -UseBasicParsing -ErrorAction Stop
    $health = $response.Content | ConvertFrom-Json
    Write-Host "✅ Servidor de Alfred está activo" -ForegroundColor Green
    Write-Host "   Status: $($health.status)" -ForegroundColor Gray
    Write-Host "   Core inicializado: $($health.alfred_core_initialized)" -ForegroundColor Gray
    Write-Host ""
} catch {
    Write-Host "❌ Servidor de Alfred no está ejecutándose" -ForegroundColor Red
    Write-Host "   Por favor, inicia el servidor primero:" -ForegroundColor Yellow
    Write-Host "   cd f:\Projects\Alfred" -ForegroundColor White
    Write-Host "   .\start_alfred_server.ps1" -ForegroundColor White
    Write-Host ""
    Read-Host "Presiona Enter para salir"
    exit 1
}

# Limpiar cache de Electron (opcional)
Write-Host "🧹 Limpiando cache..." -ForegroundColor Cyan
$electronCache = "$env:APPDATA\alfred-electron"
if (Test-Path $electronCache) {
    Remove-Item -Path $electronCache -Recurse -Force -ErrorAction SilentlyContinue
}

# Iniciar Electron
Write-Host "🚀 Iniciando Alfred Electron con DevTools..." -ForegroundColor Green
Write-Host ""
Write-Host "📝 Observa los logs en:" -ForegroundColor Yellow
Write-Host "   - Terminal (logs del proceso principal)" -ForegroundColor Gray
Write-Host "   - DevTools Console (logs del renderer)" -ForegroundColor Gray
Write-Host ""

npm start
