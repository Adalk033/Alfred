# ============================================================================
# Alfred - Script de Arranque Universal (Windows)
# ============================================================================
# Este script verifica, instala dependencias e inicia Alfred automáticamente

param(
    [switch]$SkipChecks,
    [switch]$Verbose
)

$ErrorActionPreference = "Stop"

# === Colores y formato ===
function Write-Header {
    param([string]$Text)
    Write-Host ""
    Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "  $Text" -ForegroundColor Cyan
    Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host ""
}

function Write-Step {
    param([string]$Text)
    Write-Host "▶ $Text" -ForegroundColor Yellow
}

function Write-Success {
    param([string]$Text)
    Write-Host "✅ $Text" -ForegroundColor Green
}

function Write-Warning {
    param([string]$Text)
    Write-Host "⚠️  $Text" -ForegroundColor Yellow
}

function Write-Error {
    param([string]$Text)
    Write-Host "❌ $Text" -ForegroundColor Red
}

function Write-Info {
    param([string]$Text)
    Write-Host "   $Text" -ForegroundColor Gray
}

# === Variables globales ===
$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$PROJECT_ROOT = $SCRIPT_DIR
$BACKEND_DIR = Join-Path $PROJECT_ROOT "backend"
$VENV_DIR = Join-Path $BACKEND_DIR "venv"
$ENV_FILE = Join-Path $PROJECT_ROOT ".env"
$ENV_TEMPLATE = Join-Path $PROJECT_ROOT ".env.template"
$GPU_CHECK_SCRIPT = Join-Path $BACKEND_DIR "gpu" "gpu_check.py"
$GPU_INFO_FILE = Join-Path $BACKEND_DIR "gpu" "gpu_info.json"

# === Banner ===
Clear-Host
Write-Host ""
Write-Host "   █████╗ ██╗     ███████╗██████╗ ███████╗██████╗ " -ForegroundColor Cyan
Write-Host "  ██╔══██╗██║     ██╔════╝██╔══██╗██╔════╝██╔══██╗" -ForegroundColor Cyan
Write-Host "  ███████║██║     █████╗  ██████╔╝█████╗  ██║  ██║" -ForegroundColor Cyan
Write-Host "  ██╔══██║██║     ██╔══╝  ██╔══██╗██╔══╝  ██║  ██║" -ForegroundColor Cyan
Write-Host "  ██║  ██║███████╗██║     ██║  ██║███████╗██████╔╝" -ForegroundColor Cyan
Write-Host "  ╚═╝  ╚═╝╚══════╝╚═╝     ╚═╝  ╚═╝╚══════╝╚═════╝ " -ForegroundColor Cyan
Write-Host ""
Write-Host "  Asistente Personal Inteligente - Local & Privado" -ForegroundColor White
Write-Host ""

# === Función: Verificar Python ===
function Test-Python {
    Write-Step "Verificando Python..."
    
    try {
        $pythonVersion = python --version 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Success "Python instalado: $pythonVersion"
            return $true
        }
    } catch {}
    
    Write-Error "Python no está instalado o no está en PATH"
    Write-Info "Descarga Python desde: https://www.python.org/downloads/"
    Write-Info "Asegúrate de marcar 'Add Python to PATH' durante la instalación"
    return $false
}

# === Función: Crear entorno virtual ===
function Initialize-VirtualEnvironment {
    Write-Step "Verificando entorno virtual..."
    
    if (Test-Path $VENV_DIR) {
        Write-Success "Entorno virtual existente encontrado"
        return $true
    }
    
    Write-Warning "Creando entorno virtual..."
    Write-Info "Ubicación: $VENV_DIR"
    
    try {
        python -m venv $VENV_DIR
        Write-Success "Entorno virtual creado exitosamente"
        return $true
    } catch {
        Write-Error "Error al crear entorno virtual: $_"
        return $false
    }
}

# === Función: Instalar dependencias ===
function Install-Dependencies {
    Write-Step "Verificando dependencias de Python..."
    
    $activateScript = Join-Path $VENV_DIR "Scripts\Activate.ps1"
    $requirementsFile = Join-Path $BACKEND_DIR "requirements.txt"
    
    if (-not (Test-Path $requirementsFile)) {
        Write-Error "Archivo requirements.txt no encontrado"
        return $false
    }
    
    Write-Info "Activando entorno virtual..."
    & $activateScript
    
    Write-Info "Instalando dependencias..."
    Write-Info "Esto puede tardar varios minutos en la primera ejecución..."
    
    try {
        python -m pip install --upgrade pip
        pip install -r $requirementsFile
        Write-Success "Dependencias instaladas correctamente"
        return $true
    } catch {
        Write-Error "Error al instalar dependencias: $_"
        return $false
    }
}

# === Función: Verificar Ollama ===
function Test-Ollama {
    Write-Step "Verificando Ollama..."
    
    try {
        $ollamaVersion = ollama list 2>&1 | Out-String
        Write-Info $ollamaVersion
        Write-Info "Ollama CLI encontrado"
        if ($LASTEXITCODE -eq 0) {
            Write-Success "Ollama instalado: $ollamaVersion"
            
            # Verificar si el servicio está corriendo
            try {
                $ollamaList = ollama list 2>&1
                if ($LASTEXITCODE -eq 0) {
                    Write-Success "Servicio Ollama activo"
                    return $true
                }
            } catch {}
            
            Write-Warning "Servicio Ollama no está corriendo"
            Write-Info "Iniciando Ollama en segundo plano..."
            Start-Process "ollama" -ArgumentList "serve" -WindowStyle Hidden
            Start-Sleep -Seconds 3
            return $true
        }
    } catch {}
    
    Write-Error "Ollama no está instalado"
    Write-Info "Descarga desde: https://ollama.ai/"
    Write-Info "Alfred requiere Ollama para funcionar"
    return $false
}

# === Función: Verificar modelos de Ollama ===
function Test-OllamaModels {
    Write-Step "Verificando modelos de Ollama..."
    
    $requiredModels = @("nomic-embed-text:v1.5")
    $missingModels = @()
    
    try {
        $installedModels = ollama list 2>&1 | Out-String
        
        foreach ($model in $requiredModels) {
            if ($installedModels -notmatch $model) {
                $missingModels += $model
            } else {
                Write-Success "Modelo $model encontrado"
            }
        }
        
        if ($missingModels.Count -gt 0) {
            Write-Warning "Modelos faltantes: $($missingModels -join ', ')"
            Write-Info "Descarga con: ollama pull <modelo>"
            Write-Info "Esto puede tardar varios minutos según tu conexión"
            
            foreach ($model in $missingModels) {
                Write-Info "Descargando $model..."
                ollama pull $model
            }
        }
        
        return $true
    } catch {
        Write-Error "Error al verificar modelos: $_"
        return $false
    }
}

# === Función: Detectar GPU ===
function Test-GPU {
    Write-Step "Detectando GPU..."
    
    if (Test-Path $GPU_CHECK_SCRIPT) {
        $activateScript = Join-Path $VENV_DIR "Scripts\Activate.ps1"
        & $activateScript
        
        try {
            python $GPU_CHECK_SCRIPT
            
            if (Test-Path $GPU_INFO_FILE) {
                $gpuInfo = Get-Content $GPU_INFO_FILE | ConvertFrom-Json
                if ($gpuInfo.gpu_available) {
                    Write-Success "GPU detectada: $($gpuInfo.gpu_type)"
                } else {
                    Write-Warning "No se detectó GPU compatible, usando CPU"
                }
            }
            return $true
        } catch {
            Write-Warning "Error al detectar GPU: $_"
            return $true  # No es crítico
        }
    } else {
        Write-Warning "Script de detección GPU no encontrado"
        return $true  # No es crítico
    }
}

# === Función: Configurar .env ===
function Initialize-Environment {
    Write-Step "Verificando archivo .env..."
    
    if (Test-Path $ENV_FILE) {
        Write-Success "Archivo .env encontrado"
        return $true
    }
    
    if (-not (Test-Path $ENV_TEMPLATE)) {
        Write-Error "Plantilla .env.template no encontrada"
        return $false
    }
    
    Write-Warning "Creando archivo .env desde plantilla..."
    Copy-Item $ENV_TEMPLATE $ENV_FILE
    
    # Configurar valores por defecto
    $envContent = Get-Content $ENV_FILE
    $envContent = $envContent -replace "ALFRED_HOST=127.0.0.1", "ALFRED_HOST=127.0.0.1"
    $envContent = $envContent -replace "ALFRED_PORT=8000", "ALFRED_PORT=8000"
    
    Set-Content $ENV_FILE $envContent
    Write-Success "Archivo .env creado"
    return $true
}

# === Función: Verificar Node.js ===
function Test-NodeJS {
    Write-Step "Verificando Node.js..."
    
    try {
        $nodeVersion = node --version 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Success "Node.js instalado: $nodeVersion"
            return $true
        }
    } catch {}
    
    Write-Error "Node.js no está instalado"
    Write-Info "Descarga desde: https://nodejs.org/"
    Write-Info "Recomendado: Versión LTS"
    return $false
}

# === Función: Instalar dependencias Node.js ===
function Install-NodeDependencies {
    Write-Step "Verificando dependencias de Node.js..."
    
    $nodeModulesDir = Join-Path $PROJECT_ROOT "node_modules"
    
    if (Test-Path $nodeModulesDir) {
        Write-Success "Dependencias Node.js ya instaladas"
        return $true
    }
    
    Write-Info "Instalando dependencias..."
    Write-Info "Esto puede tardar unos minutos..."
    
    try {
        npm install
        Write-Success "Dependencias instaladas correctamente"
        return $true
    } catch {
        Write-Error "Error al instalar dependencias: $_"
        return $false
    }
}

# === Función: Iniciar backend ===
function Start-Backend {
    Write-Step "Iniciando backend de Alfred..."
    
    $activateScript = Join-Path $VENV_DIR "Scripts\Activate.ps1"
    $backendScript = Join-Path $BACKEND_DIR "core\alfred_backend.py"
    
    if (-not (Test-Path $backendScript)) {
        Write-Error "Script del backend no encontrado: $backendScript"
        return $false
    }
    
    # El backend será iniciado por Electron
    Write-Success "Backend listo para iniciar"
    return $true
}

# === Función: Verificar backend en ejecución ===
function Test-BackendRunning {
    try {
        $response = Invoke-WebRequest -Uri "http://127.0.0.1:8000/health" -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
        return $true
    } catch {
        return $false
    }
}

# === Función: Iniciar aplicación ===
function Start-Application {
    Write-Header "INICIANDO ALFRED"
    
    # Verificar si el backend ya está corriendo
    if (Test-BackendRunning) {
        Write-Success "Backend ya está en ejecución"
    } else {
        Write-Info "El backend será iniciado por Electron automáticamente"
    }
    
    Write-Step "Iniciando aplicación Electron..."
    Write-Info "Abriendo Alfred..."
    
    npm start
}

# ============================================================================
# SCRIPT PRINCIPAL
# ============================================================================

Write-Header "VERIFICACIÓN DE REQUISITOS"

# 1. Verificar Python
if (-not (Test-Python)) { exit 1 }

# 2. Crear/verificar entorno virtual
if (-not (Initialize-VirtualEnvironment)) { exit 1 }

# 3. Instalar dependencias Python
if (-not (Install-Dependencies)) { exit 1 }

# 4. Verificar Ollama
if (-not (Test-Ollama)) { exit 1 }

# 5. Verificar modelos de Ollama
if (-not $SkipChecks) {
    Test-OllamaModels | Out-Null
}

# 6. Detectar GPU
if (-not $SkipChecks) {
    Test-GPU | Out-Null
}

# 7. Configurar .env
if (-not (Initialize-Environment)) { exit 1 }

Write-Header "VERIFICACIÓN DE FRONTEND"

# 8. Verificar Node.js
if (-not (Test-NodeJS)) { exit 1 }

# 9. Instalar dependencias Node.js
if (-not (Install-NodeDependencies)) { exit 1 }

# 10. Preparar backend
if (-not (Start-Backend)) { exit 1 }

# 11. Iniciar aplicación
Start-Application

Write-Host ""
Write-Success "Alfred finalizado"
Write-Host ""
