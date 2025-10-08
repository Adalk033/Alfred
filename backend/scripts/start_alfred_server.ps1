# start_alfred_server.ps1
# Script de PowerShell para iniciar el servidor de Alfred

Write-Host @"
╔══════════════════════════════════════════════════════════╗
║          🤖 Alfred Backend API Server 🤖                ║
║              Iniciando servidor...                      ║
╚══════════════════════════════════════════════════════════╝
"@ -ForegroundColor Cyan

# Verificar que Python esté instalado
try {
    $pythonVersion = python --version 2>&1
    Write-Host "✓ Python encontrado: $pythonVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Error: Python no está instalado o no está en el PATH" -ForegroundColor Red
    Write-Host "   Descarga Python desde: https://www.python.org/downloads/" -ForegroundColor Yellow
    exit 1
}

# Verificar que el archivo .env existe
if (-not (Test-Path ".env")) {
    Write-Host "⚠️ Advertencia: No se encontró el archivo .env" -ForegroundColor Yellow
    Write-Host "   Creando archivo .env de ejemplo..." -ForegroundColor Yellow
    
    $envTemplate = @"
# Ruta a tus documentos personales
ALFRED_DOCS_PATH=C:\Users\$env:USERNAME\Documents

# Configuración del servidor
ALFRED_HOST=0.0.0.0
ALFRED_PORT=8000
ALFRED_RELOAD=false

# Configuración de Alfred
ALFRED_USER_NAME=$env:USERNAME
ALFRED_MODEL=gemma2:9b
ALFRED_EMBEDDING_MODEL=nomic-embed-text:v1.5

# Rutas de almacenamiento
ALFRED_CHROMA_PATH=./chroma_db
ALFRED_HISTORY_FILE=./alfred_qa_history.json

# Opciones de debug
ALFRED_DEBUG=false
ALFRED_FORCE_RELOAD=false
"@
    
    $envTemplate | Out-File -FilePath ".env" -Encoding UTF8
    Write-Host "✓ Archivo .env creado. Por favor, revisa y ajusta la configuración." -ForegroundColor Green
    Write-Host "   Especialmente verifica ALFRED_DOCS_PATH" -ForegroundColor Yellow
    Write-Host ""
    
    $continue = Read-Host "¿Deseas continuar con la configuración actual? (s/n)"
    if ($continue -ne 's' -and $continue -ne 'S') {
        Write-Host "Abortado. Edita el archivo .env y ejecuta este script nuevamente." -ForegroundColor Yellow
        exit 0
    }
}

# Cargar variables de entorno desde .env
Write-Host "📋 Cargando configuración desde .env..." -ForegroundColor Cyan
Get-Content .env | ForEach-Object {
    if ($_ -match '^([^#][^=]+)=(.*)$') {
        $key = $matches[1].Trim()
        $value = $matches[2].Trim()
        [System.Environment]::SetEnvironmentVariable($key, $value, [System.EnvironmentVariableTarget]::Process)
        Write-Host "   $key = $value" -ForegroundColor Gray
    }
}

# Verificar que ALFRED_DOCS_PATH esté configurado
$docsPath = [System.Environment]::GetEnvironmentVariable('ALFRED_DOCS_PATH', [System.EnvironmentVariableTarget]::Process)
if (-not $docsPath) {
    Write-Host "❌ Error: ALFRED_DOCS_PATH no está configurado en .env" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $docsPath)) {
    Write-Host "⚠️ Advertencia: La ruta ALFRED_DOCS_PATH no existe: $docsPath" -ForegroundColor Yellow
    $createDir = Read-Host "¿Deseas crear este directorio? (s/n)"
    if ($createDir -eq 's' -or $createDir -eq 'S') {
        New-Item -ItemType Directory -Path $docsPath -Force | Out-Null
        Write-Host "✓ Directorio creado" -ForegroundColor Green
    }
}

# Verificar dependencias
Write-Host "`n📦 Verificando dependencias..." -ForegroundColor Cyan
$requiredPackages = @('fastapi', 'uvicorn', 'langchain', 'chromadb')
$missingPackages = @()

foreach ($package in $requiredPackages) {
    $installed = pip show $package 2>$null
    if ($installed) {
        Write-Host "   ✓ $package" -ForegroundColor Green
    } else {
        Write-Host "   ✗ $package (no instalado)" -ForegroundColor Red
        $missingPackages += $package
    }
}

if ($missingPackages.Count -gt 0) {
    Write-Host "`n❌ Faltan dependencias. Instalando..." -ForegroundColor Yellow
    pip install -r requirements.txt
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Error al instalar dependencias" -ForegroundColor Red
        exit 1
    }
}

# Verificar que Ollama esté corriendo
Write-Host "`n🔍 Verificando Ollama..." -ForegroundColor Cyan
try {
    $ollamaResponse = Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -Method Get -TimeoutSec 5
    Write-Host "✓ Ollama está ejecutándose" -ForegroundColor Green
    
    # Verificar modelos instalados
    $modelName = [System.Environment]::GetEnvironmentVariable('ALFRED_MODEL', [System.EnvironmentVariableTarget]::Process)
    $modelFound = $false
    foreach ($model in $ollamaResponse.models) {
        if ($model.name -like "$modelName*") {
            $modelFound = $true
            Write-Host "   ✓ Modelo $modelName encontrado" -ForegroundColor Green
            break
        }
    }
    
    if (-not $modelFound) {
        Write-Host "   ⚠️ Modelo $modelName no encontrado" -ForegroundColor Yellow
        Write-Host "   Descárgalo con: ollama pull $modelName" -ForegroundColor Yellow
        $continue = Read-Host "¿Deseas continuar de todos modos? (s/n)"
        if ($continue -ne 's' -and $continue -ne 'S') {
            exit 0
        }
    }
} catch {
    Write-Host "⚠️ No se pudo conectar a Ollama (http://localhost:11434)" -ForegroundColor Yellow
    Write-Host "   Asegúrate de que Ollama esté ejecutándose" -ForegroundColor Yellow
    Write-Host "   Descarga desde: https://ollama.ai/" -ForegroundColor Yellow
    $continue = Read-Host "¿Deseas continuar de todos modos? (s/n)"
    if ($continue -ne 's' -and $continue -ne 'S') {
        exit 0
    }
}

# Obtener configuración del servidor
$host_addr = [System.Environment]::GetEnvironmentVariable('ALFRED_HOST', [System.EnvironmentVariableTarget]::Process)
if (-not $host_addr) { $host_addr = "0.0.0.0" }

$port = [System.Environment]::GetEnvironmentVariable('ALFRED_PORT', [System.EnvironmentVariableTarget]::Process)
if (-not $port) { $port = "8000" }

# Mostrar información de inicio
Write-Host @"

╔══════════════════════════════════════════════════════════╗
║              🚀 Iniciando servidor 🚀                   ║
╠══════════════════════════════════════════════════════════╣
║  URL Local: http://localhost:$port                     ║
║  Docs: http://localhost:$port/docs                     ║
║  Health: http://localhost:$port/health                 ║
╚══════════════════════════════════════════════════════════╝

"@ -ForegroundColor Green

Write-Host "Presiona Ctrl+C para detener el servidor`n" -ForegroundColor Yellow

# Iniciar el servidor
try {
    python alfred_backend.py
} catch {
    Write-Host "`n❌ Error al iniciar el servidor: $_" -ForegroundColor Red
    exit 1
}
