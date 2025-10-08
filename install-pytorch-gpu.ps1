# Script para instalar PyTorch con soporte CUDA/GPU
# Este script detecta tu GPU y instala la version correcta de PyTorch

param(
    [switch]$CPU = $false,  # Forzar instalacion solo CPU
    [switch]$Help = $false
)

if ($Help) {
    Write-Host @"
=== Instalador de PyTorch con GPU ===

Uso:
    .\install-pytorch-gpu.ps1          # Auto-detectar y instalar
    .\install-pytorch-gpu.ps1 -CPU     # Instalar version CPU solamente

Este script:
1. Detecta tu GPU (NVIDIA, AMD, Apple Silicon)
2. Desinstala PyTorch existente si es necesario
3. Instala la version correcta con soporte GPU

Requisitos:
- GPU NVIDIA: Requiere CUDA Toolkit instalado
- GPU AMD: Requiere ROCm instalado (Linux/WSL)
- Apple Silicon: Funciona nativamente con Metal

"@
    exit 0
}

Write-Host "=== Instalador de PyTorch con GPU ===" -ForegroundColor Cyan
Write-Host ""

# Ruta del Python en venv
$venvPath = ".\backend\venv"
$pythonExe = Join-Path $venvPath "Scripts\python.exe"

if (-not (Test-Path $pythonExe)) {
    Write-Host "Error: No se encontro el entorno virtual" -ForegroundColor Red
    Write-Host "Ejecuta primero: .\clean-install.ps1 -FullClean" -ForegroundColor Yellow
    exit 1
}

Write-Host "Usando Python: $pythonExe" -ForegroundColor Green
Write-Host ""

# Detectar tipo de GPU
Write-Host "Detectando hardware..." -ForegroundColor Yellow

$gpuType = "none"
$installCommand = ""

# Verificar NVIDIA GPU (Windows)
try {
    $nvidiaGPU = Get-WmiObject Win32_VideoController | Where-Object { $_.Name -like "*NVIDIA*" }
    if ($nvidiaGPU) {
        $gpuType = "nvidia"
        Write-Host "  [OK] GPU NVIDIA detectada: $($nvidiaGPU.Name)" -ForegroundColor Green
    }
} catch {
    Write-Host "  No se pudo verificar GPU NVIDIA" -ForegroundColor Gray
}

# Verificar AMD GPU
try {
    $amdGPU = Get-WmiObject Win32_VideoController | Where-Object { $_.Name -like "*AMD*" -or $_.Name -like "*Radeon*" }
    if ($amdGPU -and $gpuType -eq "none") {
        $gpuType = "amd"
        Write-Host "  [OK] GPU AMD detectada: $($amdGPU.Name)" -ForegroundColor Green
        Write-Host "  [NOTA] ROCm solo esta disponible en Linux/WSL" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  No se pudo verificar GPU AMD" -ForegroundColor Gray
}

if ($CPU) {
    $gpuType = "cpu"
    Write-Host "  [INFO] Instalacion CPU forzada por parametro -CPU" -ForegroundColor Yellow
}

if ($gpuType -eq "none") {
    Write-Host "  [INFO] No se detecto GPU, instalando version CPU" -ForegroundColor Yellow
    $gpuType = "cpu"
}

Write-Host ""
Write-Host "Configurando instalacion..." -ForegroundColor Yellow

# Determinar comando de instalacion
switch ($gpuType) {
    "nvidia" {
        Write-Host "  Tipo: PyTorch con CUDA (NVIDIA)" -ForegroundColor Cyan
        Write-Host "  Verificando version de CUDA..." -ForegroundColor Gray
        
        # Intentar detectar version CUDA
        $cudaVersion = "cu118"  # Default CUDA 11.8
        
        try {
            $nvidiaSmi = nvidia-smi 2>$null
            if ($nvidiaSmi -match "CUDA Version: (\d+\.\d+)") {
                $detectedCuda = [version]$matches[1]
                if ($detectedCuda.Major -ge 12) {
                    $cudaVersion = "cu121"
                    Write-Host "  CUDA 12.x detectado, usando cu121" -ForegroundColor Green
                } elseif ($detectedCuda.Major -eq 11) {
                    $cudaVersion = "cu118"
                    Write-Host "  CUDA 11.x detectado, usando cu118" -ForegroundColor Green
                }
            }
        } catch {
            Write-Host "  No se pudo detectar CUDA, usando cu118 por defecto" -ForegroundColor Yellow
            Write-Host "  Instala CUDA Toolkit desde: https://developer.nvidia.com/cuda-downloads" -ForegroundColor Yellow
        }
        
        $installCommand = "torch torchvision --index-url https://download.pytorch.org/whl/$cudaVersion"
    }
    "amd" {
        Write-Host "  Tipo: PyTorch CPU (ROCm solo en Linux)" -ForegroundColor Cyan
        Write-Host "  Para GPU AMD en Windows, usa WSL2 con ROCm" -ForegroundColor Yellow
        $installCommand = "torch torchvision"
    }
    "cpu" {
        Write-Host "  Tipo: PyTorch CPU" -ForegroundColor Cyan
        $installCommand = "torch torchvision"
    }
}

Write-Host ""
Write-Host "Desinstalando PyTorch existente..." -ForegroundColor Yellow
& $pythonExe -m pip uninstall -y torch torchvision 2>$null

Write-Host "Instalando PyTorch con soporte de GPU..." -ForegroundColor Yellow
Write-Host "  Comando: pip install $installCommand" -ForegroundColor Gray
Write-Host ""

$installArgs = $installCommand -split ' '
& $pythonExe -m pip install @installArgs --no-color

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "=== Error durante la instalacion ===" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Verificando instalacion..." -ForegroundColor Yellow

# Verificar que PyTorch se instalo correctamente
$verifyScript = @"
import torch
print('PyTorch Version:', torch.__version__)
print('CUDA Available:', torch.cuda.is_available())
if torch.cuda.is_available():
    print('CUDA Version:', torch.version.cuda)
    print('GPU Count:', torch.cuda.device_count())
    print('GPU Name:', torch.cuda.get_device_name(0))
elif hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
    print('MPS (Metal) Available: True')
else:
    print('Using: CPU')
"@

Write-Host ""
$output = & $pythonExe -c $verifyScript 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "=== Instalacion Exitosa ===" -ForegroundColor Green
    Write-Host ""
    $output | ForEach-Object { Write-Host "  $_" -ForegroundColor Cyan }
    Write-Host ""
    Write-Host "PyTorch instalado correctamente" -ForegroundColor Green
    Write-Host "Ahora puedes iniciar Alfred: npm start" -ForegroundColor Cyan
} else {
    Write-Host "=== Error al verificar PyTorch ===" -ForegroundColor Red
    Write-Host $output
    exit 1
}
