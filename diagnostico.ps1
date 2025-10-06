# Script de diagnóstico para verificar la conexión con Alfred

Write-Host "╔══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║     Alfred - Diagnóstico de Conexión                ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Verificar servidor de Alfred
Write-Host "🔍 Verificando servidor de Alfred..." -ForegroundColor Yellow
Write-Host ""

try {
    # Intentar conectar con curl
    Write-Host "Probando conexión HTTP..." -ForegroundColor Gray
    $response = Invoke-WebRequest -Uri "http://localhost:8000/health" -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
    
    Write-Host "✅ Servidor respondió correctamente" -ForegroundColor Green
    Write-Host "   Status Code: $($response.StatusCode)" -ForegroundColor Gray
    Write-Host ""
    
    # Parsear respuesta
    $health = $response.Content | ConvertFrom-Json
    
    Write-Host "📊 Información del servidor:" -ForegroundColor Cyan
    Write-Host "   Estado: $($health.status)" -ForegroundColor White
    Write-Host "   Timestamp: $($health.timestamp)" -ForegroundColor Gray
    Write-Host "   Core inicializado: $($health.alfred_core_initialized)" -ForegroundColor Gray
    Write-Host "   Base de datos cargada: $($health.vectorstore_loaded)" -ForegroundColor Gray
    Write-Host ""
    
    # Obtener estadísticas
    Write-Host "Obteniendo estadísticas..." -ForegroundColor Gray
    $statsResponse = Invoke-WebRequest -Uri "http://localhost:8000/stats" -TimeoutSec 5 -UseBasicParsing
    $stats = $statsResponse.Content | ConvertFrom-Json
    
    Write-Host "📈 Estadísticas:" -ForegroundColor Cyan
    Write-Host "   Documentos: $($stats.total_documents)" -ForegroundColor White
    Write-Host "   Consultas guardadas: $($stats.total_qa_history)" -ForegroundColor White
    Write-Host "   Usuario: $($stats.user_name)" -ForegroundColor White
    Write-Host "   Modelo: $($stats.model_name)" -ForegroundColor White
    Write-Host ""
    
    Write-Host "✅ El servidor de Alfred está funcionando correctamente" -ForegroundColor Green
    Write-Host "   Puedes ejecutar la aplicación Electron con: npm start" -ForegroundColor White
    
} catch {
    Write-Host "❌ No se pudo conectar con el servidor de Alfred" -ForegroundColor Red
    Write-Host ""
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "Posibles soluciones:" -ForegroundColor Yellow
    Write-Host "1. Inicia el servidor de Alfred:" -ForegroundColor White
    Write-Host "   cd ..\Alfred" -ForegroundColor Gray
    Write-Host "   .\start_alfred_server.ps1" -ForegroundColor Gray
    Write-Host ""
    Write-Host "2. Verifica que Python esté ejecutándose:" -ForegroundColor White
    Write-Host "   Get-Process python" -ForegroundColor Gray
    Write-Host ""
    Write-Host "3. Verifica que el puerto 8000 esté libre:" -ForegroundColor White
    Write-Host "   netstat -ano | findstr :8000" -ForegroundColor Gray
    Write-Host ""
}

Write-Host ""
Write-Host "Presiona cualquier tecla para continuar..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
