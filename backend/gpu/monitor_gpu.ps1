#!/usr/bin/env pwsh
# Script para monitorear el uso de GPU en tiempo real

Write-Host "===========================================================" -ForegroundColor Cyan
Write-Host "  MONITOR DE GPU - NVIDIA" -ForegroundColor Cyan
Write-Host "===========================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Presiona Ctrl+C para detener el monitoreo" -ForegroundColor Yellow
Write-Host ""

# Verificar si nvidia-smi está disponible
try {
    $null = Get-Command nvidia-smi -ErrorAction Stop
    
    # Monitoreo continuo cada 2 segundos
    while ($true) {
        Clear-Host
        Write-Host "=== Monitor GPU - $(Get-Date -Format 'HH:mm:ss') ===" -ForegroundColor Green
        Write-Host ""
        
        # Mostrar información resumida
        nvidia-smi --query-gpu=name,temperature.gpu,utilization.gpu,utilization.memory,memory.used,memory.total,power.draw --format=csv
        
        Write-Host ""
        Write-Host "=== Procesos usando GPU ===" -ForegroundColor Yellow
        nvidia-smi --query-compute-apps=pid,process_name,used_memory --format=csv
        
        Write-Host ""
        Write-Host "Actualizando en 2 segundos... (Ctrl+C para salir)" -ForegroundColor Gray
        Start-Sleep -Seconds 2
    }
}
catch {
    Write-Host "❌ Error: nvidia-smi no está disponible" -ForegroundColor Red
    Write-Host "Asegúrate de tener los drivers de NVIDIA instalados" -ForegroundColor Yellow
}
