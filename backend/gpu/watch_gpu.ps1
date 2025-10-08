#!/usr/bin/env pwsh
# Monitor simple de GPU que muestra cambios en tiempo real

Write-Host "=== MONITOR SIMPLE DE GPU ===" -ForegroundColor Cyan
Write-Host "Ejecuta consultas en Alfred en otra terminal y observa los cambios" -ForegroundColor Yellow
Write-Host "Presiona Ctrl+C para detener`n" -ForegroundColor Gray

while ($true) {
    Clear-Host
    $time = Get-Date -Format "HH:mm:ss"
    Write-Host "=== $time ===" -ForegroundColor Green
    
    # Mostrar uso resumido
    nvidia-smi --query-gpu=utilization.gpu,utilization.memory,memory.used,memory.total,temperature.gpu --format=csv,noheader | 
        ForEach-Object {
            $data = $_ -split ', '
            Write-Host "💻 GPU Utilization: " -NoNewline -ForegroundColor White
            Write-Host "$($data[0])" -ForegroundColor Cyan
            
            Write-Host "💾 Memory Usage:    " -NoNewline -ForegroundColor White
            Write-Host "$($data[1]) ($($data[2]) MB / $($data[3]) MB)" -ForegroundColor Yellow
            
            Write-Host "🌡️  Temperature:     " -NoNewline -ForegroundColor White
            Write-Host "$($data[4])" -ForegroundColor Magenta
        }
    
    Write-Host "`n--- Procesos GPU (Ollama) ---" -ForegroundColor Yellow
    nvidia-smi pmon -c 1 -s u | Select-String "ollama" | ForEach-Object {
        Write-Host $_ -ForegroundColor Green
    }
    
    Write-Host "`nActualizando cada 1 segundo..." -ForegroundColor Gray
    Start-Sleep -Seconds 1
}
