# Script para monitorear la instalación de paquetes Python en Alfred
# Uso: .\monitor-instalacion.ps1

Write-Host "=== MONITOR DE INSTALACION DE ALFRED ===" -ForegroundColor Cyan
Write-Host "Presiona Ctrl+C para detener el monitoreo`n" -ForegroundColor Yellow

$lastCPU = 0
$lastMemory = 0
$iteration = 0

while($true) {
    $iteration++
    Clear-Host
    
    Write-Host "=== MONITOR DE INSTALACION - Iteracion $iteration ===" -ForegroundColor Cyan
    Write-Host "Hora: $(Get-Date -Format 'HH:mm:ss')`n" -ForegroundColor Gray
    
    # 1. Procesos Python activos
    Write-Host "1. PROCESOS PYTHON:" -ForegroundColor Yellow
    $pythonProcs = Get-Process python* -ErrorAction SilentlyContinue
    
    if ($pythonProcs) {
        $pythonProcs | ForEach-Object {
            $cpuChange = if ($lastCPU -ne 0) { $_.CPU - $lastCPU } else { 0 }
            $memMB = [math]::Round($_.WorkingSet64/1MB,2)
            $memChange = if ($lastMemory -ne 0) { $memMB - $lastMemory } else { 0 }
            
            Write-Host "  PID: $($_.Id)" -ForegroundColor Green
            Write-Host "  CPU: $($_.CPU)s " -NoNewline
            if ($cpuChange -gt 0) {
                Write-Host "(+$([math]::Round($cpuChange,2))s) ACTIVO" -ForegroundColor Green
            } else {
                Write-Host "(sin cambio) POSIBLE COLGADO" -ForegroundColor Red
            }
            Write-Host "  RAM: $memMB MB " -NoNewline
            if ($memChange -ne 0) {
                Write-Host "($([math]::Round($memChange,2)) MB)" -ForegroundColor Cyan
            } else {
                Write-Host "" 
            }
            
            $lastCPU = $_.CPU
            $lastMemory = $memMB
        }
    } else {
        Write-Host "  No hay procesos Python activos" -ForegroundColor Red
    }
    
    # 2. Archivos temporales de pip (indica actividad)
    Write-Host "`n2. ACTIVIDAD DE PIP (archivos temp):" -ForegroundColor Yellow
    $tempFiles = Get-ChildItem "C:\Users\*\AppData\Roaming\Alfred\backend\temp" -Recurse -File -ErrorAction SilentlyContinue |
        Where-Object { $_.LastWriteTime -gt (Get-Date).AddSeconds(-10) }
    
    if ($tempFiles) {
        Write-Host "  ACTIVO - Archivos modificados en ultimos 10 segundos:" -ForegroundColor Green
        $tempFiles | Select-Object -First 3 | ForEach-Object {
            $age = [math]::Round(((Get-Date) - $_.LastWriteTime).TotalSeconds, 1)
            Write-Host "    $($_.Name) (hace ${age}s)" -ForegroundColor Cyan
        }
    } else {
        Write-Host "  Sin actividad reciente en archivos temp" -ForegroundColor Yellow
    }
    
    # 3. Últimos paquetes instalados en site-packages
    Write-Host "`n3. ULTIMOS PAQUETES INSTALADOS:" -ForegroundColor Yellow
    $sitePackages = Get-ChildItem "C:\Users\*\AppData\Roaming\Alfred\backend\venv\Lib\site-packages" -Directory -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 5
    
    if ($sitePackages) {
        $sitePackages | ForEach-Object {
            $age = [math]::Round(((Get-Date) - $_.LastWriteTime).TotalMinutes, 1)
            $ageText = if ($age -lt 1) { "$([math]::Round($age * 60))s" } else { "${age}m" }
            $color = if ($age -lt 0.5) { "Green" } elseif ($age -lt 2) { "Yellow" } else { "Gray" }
            Write-Host "  $($_.Name) " -NoNewline -ForegroundColor $color
            Write-Host "(hace $ageText)" -ForegroundColor Gray
        }
    } else {
        Write-Host "  No se encontro site-packages (venv no creado aun)" -ForegroundColor Red
    }
    
    # 4. Verificar si antlr4 está instalado
    Write-Host "`n4. PAQUETE ACTUAL (antlr4-python3-runtime):" -ForegroundColor Yellow
    $pythonExe = Get-ChildItem "C:\Users\*\AppData\Roaming\Alfred\backend\venv\Scripts\python.exe" -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
    
    if ($pythonExe) {
        $antlrInstalled = & $pythonExe -m pip show antlr4-python3-runtime 2>$null
        if ($antlrInstalled) {
            Write-Host "  INSTALADO!" -ForegroundColor Green
            $version = ($antlrInstalled | Select-String "Version:").ToString().Split(":")[1].Trim()
            Write-Host "  Version: $version" -ForegroundColor Cyan
        } else {
            Write-Host "  AUN NO INSTALADO (en proceso...)" -ForegroundColor Yellow
        }
    }
    
    Write-Host "`n---" -ForegroundColor Gray
    Write-Host "Actualizando en 3 segundos... (Ctrl+C para detener)" -ForegroundColor Gray
    Start-Sleep -Seconds 3
}
