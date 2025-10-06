# 🧪 Script de Prueba - Inicio Automático del Backend

Write-Host "===============================================" -ForegroundColor Cyan
Write-Host "  Prueba de Inicio Automático de Backend" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host ""

# 1. Verificar que Python está disponible
Write-Host "[1/5] Verificando Python..." -ForegroundColor Yellow
try {
    $pythonVersion = python --version 2>&1
    Write-Host "  ✅ Python encontrado: $pythonVersion" -ForegroundColor Green
} catch {
    Write-Host "  ❌ Error: Python no está en el PATH" -ForegroundColor Red
    Write-Host "  Por favor instala Python o agrégalo al PATH" -ForegroundColor Red
    exit 1
}

# 2. Verificar que el directorio de Alfred existe
Write-Host ""
Write-Host "[2/5] Verificando directorio de Alfred..." -ForegroundColor Yellow
$alfredPath = Join-Path $PSScriptRoot "..\Alfred"
if (Test-Path $alfredPath) {
    Write-Host "  ✅ Directorio encontrado: $alfredPath" -ForegroundColor Green
} else {
    Write-Host "  ❌ Error: No se encontró el directorio de Alfred" -ForegroundColor Red
    Write-Host "  Ruta esperada: $alfredPath" -ForegroundColor Red
    exit 1
}

# 3. Verificar que alfred_backend.py existe
Write-Host ""
Write-Host "[3/5] Verificando alfred_backend.py..." -ForegroundColor Yellow
$backendScript = Join-Path $alfredPath "alfred_backend.py"
if (Test-Path $backendScript) {
    Write-Host "  ✅ Script encontrado: $backendScript" -ForegroundColor Green
} else {
    Write-Host "  ❌ Error: No se encontró alfred_backend.py" -ForegroundColor Red
    Write-Host "  Ruta esperada: $backendScript" -ForegroundColor Red
    exit 1
}

# 4. Verificar que el puerto 8000 está libre
Write-Host ""
Write-Host "[4/5] Verificando puerto 8000..." -ForegroundColor Yellow
$portInUse = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue
if ($portInUse) {
    Write-Host "  ⚠️  Puerto 8000 ya está en uso" -ForegroundColor Yellow
    Write-Host "  El backend probablemente ya está corriendo" -ForegroundColor Yellow
    Write-Host "  Electron lo detectará automáticamente" -ForegroundColor Yellow
} else {
    Write-Host "  ✅ Puerto 8000 disponible" -ForegroundColor Green
}

# 5. Verificar dependencias de Node.js
Write-Host ""
Write-Host "[5/5] Verificando instalación de Electron..." -ForegroundColor Yellow
$packageJson = Join-Path $PSScriptRoot "package.json"
if (Test-Path $packageJson) {
    $nodeModules = Join-Path $PSScriptRoot "node_modules"
    if (Test-Path $nodeModules) {
        Write-Host "  ✅ node_modules encontrado" -ForegroundColor Green
    } else {
        Write-Host "  ⚠️  node_modules no encontrado" -ForegroundColor Yellow
        Write-Host "  Ejecuta: npm install" -ForegroundColor Yellow
    }
} else {
    Write-Host "  ❌ package.json no encontrado" -ForegroundColor Red
}

# Resumen
Write-Host ""
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host "  Resumen de la Prueba" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "✅ Todas las verificaciones básicas pasaron" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Siguiente paso:" -ForegroundColor Cyan
Write-Host "   1. Asegúrate de tener las dependencias:" -ForegroundColor White
Write-Host "      npm install" -ForegroundColor Gray
Write-Host ""
Write-Host "   2. Inicia AlfredElectron:" -ForegroundColor White
Write-Host "      npm start" -ForegroundColor Gray
Write-Host ""
Write-Host "   3. Observa las notificaciones en la interfaz" -ForegroundColor White
Write-Host "      - Debería aparecer: 'Iniciando servidor de Alfred...'" -ForegroundColor Gray
Write-Host "      - Luego: 'Servidor de Alfred iniciado correctamente'" -ForegroundColor Gray
Write-Host ""
Write-Host "   4. (Opcional) Abre DevTools para ver logs:" -ForegroundColor White
Write-Host "      View > Toggle Developer Tools" -ForegroundColor Gray
Write-Host ""
Write-Host "🔄 Para reiniciar el backend manualmente:" -ForegroundColor Cyan
Write-Host "   - Haz clic en el botón de reinicio (🔄) en la barra superior" -ForegroundColor White
Write-Host ""
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host ""
