# Script para instalar dependencias y ejecutar la app Electron de Alfred
# Este script prepara todo lo necesario para ejecutar la aplicación

Write-Host "╔══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║     Alfred Electron - Instalación y Ejecución        ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Verificar Node.js
Write-Host "🔍 Verificando Node.js..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version
    Write-Host "✅ Node.js $nodeVersion instalado" -ForegroundColor Green
} catch {
    Write-Host "❌ Node.js no está instalado" -ForegroundColor Red
    Write-Host "   Descárgalo desde: https://nodejs.org/" -ForegroundColor Yellow
    Write-Host "   Recomendado: Versión LTS" -ForegroundColor Yellow
    pause
    exit 1
}

# Verificar npm
Write-Host "🔍 Verificando npm..." -ForegroundColor Yellow
try {
    $npmVersion = npm --version
    Write-Host "✅ npm $npmVersion instalado" -ForegroundColor Green
} catch {
    Write-Host "❌ npm no está disponible" -ForegroundColor Red
    pause
    exit 1
}

Write-Host ""

# Verificar si node_modules existe
if (-not (Test-Path "node_modules")) {
    Write-Host "📦 Instalando dependencias..." -ForegroundColor Yellow
    Write-Host "   Esto puede tardar unos minutos la primera vez..." -ForegroundColor Gray
    Write-Host ""
    
    npm install
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "❌ Error al instalar dependencias" -ForegroundColor Red
        pause
        exit 1
    }
    
    Write-Host ""
    Write-Host "✅ Dependencias instaladas correctamente" -ForegroundColor Green
} else {
    Write-Host "✅ Dependencias ya instaladas" -ForegroundColor Green
}

Write-Host ""

# Verificar servidor de Alfred
Write-Host "🔍 Verificando servidor de Alfred..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:8000/health" -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
    Write-Host "✅ Servidor de Alfred está activo" -ForegroundColor Green
} catch {
    Write-Host "⚠️  Servidor no detectado" -ForegroundColor Yellow
    Write-Host "El servidor sera iniciado..." -ForegroundColor White
}

Write-Host ""
Write-Host "🚀 Iniciando Alfred Electron..." -ForegroundColor Cyan
Write-Host ""
Start-Sleep -Seconds 1

# Ejecutar la aplicación
npm start
