# Script para limpiar y reinstalar dependencias
# Usa este script cuando las dependencias esten corruptas o desactualizadas

param(
    [switch]$FullClean = $false,
    [switch]$WithGPU = $false
)

Write-Host "=== Limpieza y Reinstalacion de Dependencias ===" -ForegroundColor Cyan
Write-Host ""

$backendPath = ".\backend"
$venvPath = Join-Path $backendPath "venv"

if ($FullClean) {
    Write-Host "Modo limpieza completa activado" -ForegroundColor Yellow
    
    if (Test-Path $venvPath) {
        Write-Host "Eliminando entorno virtual existente..." -ForegroundColor Yellow
        Remove-Item -Path $venvPath -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "Entorno virtual eliminado" -ForegroundColor Green
    } else {
        Write-Host "No hay entorno virtual para eliminar" -ForegroundColor Gray
    }
    
    Write-Host ""
    Write-Host "Creando nuevo entorno virtual..." -ForegroundColor Yellow
    python -m venv $venvPath
    Write-Host "Entorno virtual creado" -ForegroundColor Green
} else {
    Write-Host "Modo reinstalacion rapida (usa -FullClean para limpiar todo)" -ForegroundColor Gray
}

Write-Host ""
Write-Host "Activando entorno virtual..." -ForegroundColor Yellow

# Detectar Python en venv
$pythonExe = Join-Path $venvPath "Scripts\python.exe"

if (-not (Test-Path $pythonExe)) {
    Write-Host "Error: No se encontro Python en el venv" -ForegroundColor Red
    Write-Host "Ejecuta: .\clean-install.ps1 -FullClean" -ForegroundColor Yellow
    exit 1
}

Write-Host "Usando: $pythonExe" -ForegroundColor Green
Write-Host ""

# Actualizar pip
Write-Host "Actualizando pip..." -ForegroundColor Yellow
& $pythonExe -m pip install --upgrade pip --quiet
Write-Host "pip actualizado" -ForegroundColor Green
Write-Host ""

# Instalar dependencias
Write-Host "Instalando dependencias desde requirements.txt..." -ForegroundColor Yellow
Write-Host "(Esto puede tomar varios minutos)" -ForegroundColor Gray
Write-Host ""

$requirementsPath = Join-Path $backendPath "requirements.txt"

& $pythonExe -m pip install -r $requirementsPath --no-color --progress-bar off

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "=== Instalacion completada exitosamente ===" -ForegroundColor Green
    Write-Host ""
    
    # Si se pidio GPU, instalar PyTorch con CUDA
    if ($WithGPU) {
        Write-Host "Instalando PyTorch con soporte GPU..." -ForegroundColor Yellow
        & .\install-pytorch-gpu.ps1
        Write-Host ""
    }
    
    Write-Host "Verificando paquetes criticos..." -ForegroundColor Yellow
    
    # Verificar paquetes críticos
    $critical = @("fastapi", "uvicorn", "langchain", "chromadb", "pydantic", "torch")
    $allInstalled = $true
    
    foreach ($pkg in $critical) {
        $installed = & $pythonExe -m pip show $pkg 2>$null
        if ($installed) {
            Write-Host "  [OK] $pkg" -ForegroundColor Green
        } else {
            Write-Host "  [FALTA] $pkg" -ForegroundColor Red
            $allInstalled = $false
        }
    }
    
    Write-Host ""
    if ($allInstalled) {
        Write-Host "Todas las dependencias criticas estan instaladas" -ForegroundColor Green
        
        if (-not $WithGPU) {
            Write-Host ""
            Write-Host "TIP: Si tienes GPU NVIDIA, reinstala con:" -ForegroundColor Cyan
            Write-Host "  .\clean-install.ps1 -FullClean -WithGPU" -ForegroundColor Cyan
        }
        
        Write-Host ""
        Write-Host "IMPORTANTE: Para procesar PDFs, necesitas Poppler" -ForegroundColor Yellow
        Write-Host "Ejecuta: .\install-poppler.ps1" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "Puedes iniciar la aplicacion con: npm start" -ForegroundColor Cyan
    } else {
        Write-Host "ADVERTENCIA: Faltan dependencias criticas" -ForegroundColor Red
        Write-Host "Ejecuta: .\clean-install.ps1 -FullClean" -ForegroundColor Yellow
    }
} else {
    Write-Host ""
    Write-Host "=== Error durante la instalacion ===" -ForegroundColor Red
    Write-Host "Codigo de salida: $LASTEXITCODE" -ForegroundColor Red
    Write-Host ""
    Write-Host "Intenta:" -ForegroundColor Yellow
    Write-Host "  1. Ejecutar: .\clean-install.ps1 -FullClean" -ForegroundColor Yellow
    Write-Host "  2. Verificar tu conexion a internet" -ForegroundColor Yellow
    Write-Host "  3. Verificar que Python este correctamente instalado" -ForegroundColor Yellow
    exit 1
}
