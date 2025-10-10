# setup_alfred.ps1
# Script de configuración inicial para Alfred Backend

Write-Host @"

    ╔═══════════════════════════════════════════════════╗
    ║                                                   ║
    ║        🤖 Alfred Backend - Setup Wizard 🤖       ║
    ║             Desarrollado por Adalk033             ║
    ║                                                   ║
    ╚═══════════════════════════════════════════════════╝

"@ -ForegroundColor Cyan

Write-Host "Este asistente te ayudará a configurar Alfred Backend paso a paso.`n" -ForegroundColor Yellow

# Función para verificar comandos
function Test-Command {
    param([string]$Command)
    try {
        Get-Command $Command -ErrorAction Stop | Out-Null
        return $true
    } catch {
        return $false
    }
}

# Función para leer entrada con valor por defecto
function Read-HostWithDefault {
    param(
        [string]$Prompt,
        [string]$Default
    )
    $input = Read-Host "$Prompt [$Default]"
    if ([string]::IsNullOrWhiteSpace($input)) {
        return $Default
    }
    return $input
}

# Paso 1: Verificar Python
Write-Host "═══ Paso 1: Verificar Python ═══" -ForegroundColor Green
if (Test-Command "python") {
    $pythonVersion = python --version 2>&1
    Write-Host "✅ Python encontrado: $pythonVersion" -ForegroundColor Green
} else {
    Write-Host "❌ Python no está instalado" -ForegroundColor Red
    Write-Host "   Descarga desde: https://www.python.org/downloads/" -ForegroundColor Yellow
    exit 1
}

# Paso 2: Verificar Ollama
Write-Host "`n═══ Paso 2: Verificar Ollama ═══" -ForegroundColor Green
if (Test-Command "ollama") {
    Write-Host "✅ Ollama encontrado" -ForegroundColor Green
    
    # Verificar si Ollama está corriendo
    try {
        $ollamaResponse = Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -Method Get -TimeoutSec 5
        Write-Host "✅ Ollama está ejecutándose" -ForegroundColor Green
        
        # Mostrar modelos instalados
        $modelCount = $ollamaResponse.models.Count
        Write-Host "   Modelos instalados: $modelCount" -ForegroundColor Gray
        
        # Verificar modelos necesarios
        $hasLLM = $false
        $hasEmbed = $false
        
        foreach ($model in $ollamaResponse.models) {
            if ($model.name -like "gemma*" -or $model.name -like "llama*") {
                $hasLLM = $true
            }
            if ($model.name -like "nomic-embed*") {
                $hasEmbed = $true
            }
        }
        
        if (-not $hasLLM) {
            Write-Host "⚠️  No se encontró modelo LLM (gemma2:9b o llama3.2:3b)" -ForegroundColor Yellow
            $download = Read-Host "¿Descargar gemma2:9b ahora? (s/n)"
            if ($download -eq 's') {
                Write-Host "Descargando gemma2:9b (esto puede tardar)..." -ForegroundColor Cyan
                ollama pull gemma2:9b
            }
        } else {
            Write-Host "✅ Modelo LLM encontrado" -ForegroundColor Green
        }
        
        if (-not $hasEmbed) {
            Write-Host "⚠️  No se encontró modelo de embeddings (nomic-embed-text:v1.5)" -ForegroundColor Yellow
            $download = Read-Host "¿Descargar nomic-embed-text:v1.5 ahora? (s/n)"
            if ($download -eq 's') {
                Write-Host "Descargando nomic-embed-text:v1.5..." -ForegroundColor Cyan
                ollama pull nomic-embed-text:v1.5
            }
        } else {
            Write-Host "✅ Modelo de embeddings encontrado" -ForegroundColor Green
        }
    } catch {
        Write-Host "⚠️  Ollama no está ejecutándose" -ForegroundColor Yellow
        Write-Host "   Inicia Ollama antes de continuar" -ForegroundColor Gray
        exit 0
    }
} else {
    Write-Host "❌ Ollama no está instalado" -ForegroundColor Red
    Write-Host "   Descarga desde: https://ollama.ai/" -ForegroundColor Yellow
    Write-Host "   Instala Ollama y asegúrate de que esté ejecutándose antes de usar Alfred" -ForegroundColor Gray
    exit 0
}

# Paso 3: Instalar dependencias
Write-Host "`n═══ Paso 3: Instalar Dependencias ═══" -ForegroundColor Green

# Verificar si la política de rutas largas está habilitada
Write-Host "Verificando configuración de rutas largas de Windows..." -ForegroundColor Cyan
try {
    $longPathsEnabled = Get-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name "LongPathsEnabled" -ErrorAction SilentlyContinue
    if ($longPathsEnabled.LongPathsEnabled -ne 1) {
        Write-Host "⚠️  Las rutas largas de Windows no están habilitadas" -ForegroundColor Yellow
        Write-Host "   Esto puede causar errores con algunos paquetes (como onnx)" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "   Para habilitarlas (requiere permisos de administrador):" -ForegroundColor Gray
        Write-Host "   1. Ejecuta PowerShell como administrador" -ForegroundColor Gray
        Write-Host "   2. Ejecuta: New-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem' -Name 'LongPathsEnabled' -Value 1 -PropertyType DWORD -Force" -ForegroundColor Gray
        Write-Host "   3. Reinicia tu computadora" -ForegroundColor Gray
        Write-Host ""
        Write-Host "   O sigue esta guía: https://learn.microsoft.com/en-us/windows/win32/fileio/maximum-file-path-limitation" -ForegroundColor Gray
        Write-Host ""
        Write-Host "   Continuaremos con una instalación optimizada..." -ForegroundColor Yellow
        Start-Sleep -Seconds 3
    } else {
        Write-Host "✅ Rutas largas habilitadas" -ForegroundColor Green
    }
} catch {
    Write-Host "⚠️  No se pudo verificar la configuración de rutas largas" -ForegroundColor Yellow
}

if (Test-Path "requirements.txt") {
    Write-Host "`nInstalando dependencias críticas primero..." -ForegroundColor Cyan
    
    # Instalar dependencias críticas sin onnx y sus dependientes problemáticos
    $criticalPackages = @(
        "fastapi",
        "uvicorn",
        "python-dotenv",
        "langchain",
        "langchain-community",
        "langchain-core",
        "langchain-ollama",
        "langchain-text-splitters",
        "chromadb",
        "ollama",
        "pydantic",
        "requests"
    )
    
    Write-Host "Instalando paquetes críticos para el backend..." -ForegroundColor Cyan
    foreach ($package in $criticalPackages) {
        Write-Host "  Instalando $package..." -ForegroundColor Gray
        pip install $package --quiet --disable-pip-version-check 2>$null
    }
    
    Write-Host "`nInstalando dependencias adicionales..." -ForegroundColor Cyan
    # Instalar el resto, ignorando errores de onnx y paquetes opcionales
    pip install -r requirements.txt --no-deps 2>$null
    pip install -r requirements.txt 2>&1 | Out-Null
    
    # Verificar que los paquetes críticos están instalados
    Write-Host "`nVerificando instalación..." -ForegroundColor Cyan
    $allInstalled = $true
    foreach ($package in $criticalPackages) {
        $installed = pip show $package 2>$null
        if ($installed) {
            Write-Host "  ✅ $package" -ForegroundColor Green
        } else {
            Write-Host "  ❌ $package (faltante)" -ForegroundColor Red
            $allInstalled = $false
        }
    }
    
    if ($allInstalled) {
        Write-Host "`n✅ Dependencias críticas instaladas correctamente" -ForegroundColor Green
        Write-Host "   (Nota: Algunos paquetes opcionales pueden no estar instalados debido a rutas largas)" -ForegroundColor Gray
        Write-Host "   Alfred funcionará correctamente con las dependencias instaladas" -ForegroundColor Gray
    } else {
        Write-Host "`n❌ Error: Faltan dependencias críticas" -ForegroundColor Red
        Write-Host "   Intenta ejecutar: pip install fastapi uvicorn langchain chromadb ollama" -ForegroundColor Yellow
        $continue = Read-Host "`n¿Deseas continuar de todos modos? (s/n)"
        if ($continue -ne 's') {
            exit 1
        }
    }
} else {
    Write-Host "❌ No se encontró requirements.txt" -ForegroundColor Red
    exit 1
}

# Paso 4: Configurar .env
Write-Host "`n═══ Paso 4: Configuración (.env) ═══" -ForegroundColor Green

if (Test-Path ".env") {
    Write-Host "⚠️  El archivo .env ya existe" -ForegroundColor Yellow
    $overwrite = Read-Host "¿Deseas reconfigurarlo? (s/n)"
    if ($overwrite -ne 's') {
        Write-Host "Usando configuración existente" -ForegroundColor Gray
        $skipConfig = $true
    }
}

if (-not $skipConfig) {
    Write-Host "`nConfiguración de Alfred:" -ForegroundColor Cyan
    Write-Host "(Presiona Enter para usar el valor por defecto)`n" -ForegroundColor Gray
    
    # Preguntar configuración
    $docsPath = Read-HostWithDefault "Ruta a tus documentos" "C:\Users\$env:USERNAME\Documents"
    $userName = Read-HostWithDefault "Tu nombre" $env:USERNAME
    $host_addr = Read-HostWithDefault "Host del servidor" "127.0.0.1"
    $port = Read-HostWithDefault "Puerto del servidor" "8000"
    $model = Read-HostWithDefault "Modelo LLM" "gemma2:9b"
    $embedModel = Read-HostWithDefault "Modelo de embeddings" "nomic-embed-text:v1.5"
    
    # Verificar que la ruta de documentos existe
    if (-not (Test-Path $docsPath)) {
        Write-Host "⚠️  La ruta $docsPath no existe" -ForegroundColor Yellow
        $createDir = Read-Host "¿Deseas crearla? (s/n)"
        if ($createDir -eq 's') {
            New-Item -ItemType Directory -Path $docsPath -Force | Out-Null
            Write-Host "✅ Directorio creado" -ForegroundColor Green
        }
    }
    
    # Crear archivo .env
    $envContent = @"
# ====================================
# Alfred Backend API - Configuración
# ====================================

# Rutas
ALFRED_DOCS_PATH=$docsPath
ALFRED_CHROMA_PATH=./chroma_db
ALFRED_HISTORY_FILE=./alfred_qa_history.json

# Servidor
ALFRED_HOST=$host_addr
ALFRED_PORT=$port
ALFRED_RELOAD=false

# Usuario
ALFRED_USER_NAME=$userName

# Modelos de IA
ALFRED_MODEL=$model
ALFRED_EMBEDDING_MODEL=$embedModel

# Opciones
ALFRED_DEBUG=false
ALFRED_FORCE_RELOAD=false
"@
    
    $envContent | Out-File -FilePath ".env" -Encoding UTF8
    Write-Host "✅ Archivo .env creado correctamente" -ForegroundColor Green
}

# Paso 5: Crear directorio para ChromaDB si no existe
Write-Host "`n═══ Paso 5: Preparar Directorios ═══" -ForegroundColor Green
if (-not (Test-Path "chroma_db")) {
    New-Item -ItemType Directory -Path "chroma_db" -Force | Out-Null
    Write-Host "✅ Directorio chroma_db creado" -ForegroundColor Green
} else {
    Write-Host "✅ Directorio chroma_db ya existe" -ForegroundColor Green
}

# Paso 6: Verificar archivos necesarios
Write-Host "`n═══ Paso 6: Verificar Archivos ═══" -ForegroundColor Green
$requiredFiles = @(
    "alfred_backend.py",
    "alfred_core.py",
    "config.py",
    "functionsToHistory.py"
)

$allFilesExist = $true
foreach ($file in $requiredFiles) {
    if (Test-Path $file) {
        Write-Host "✅ $file" -ForegroundColor Green
    } else {
        Write-Host "❌ $file (no encontrado)" -ForegroundColor Red
        $allFilesExist = $false
    }
}

if (-not $allFilesExist) {
    Write-Host "`n❌ Faltan archivos necesarios. Verifica tu instalación." -ForegroundColor Red
    exit 1
}

# Paso 7: Ejecutar pruebas básicas
Write-Host "`n═══ Paso 7: Pruebas Básicas ═══" -ForegroundColor Green
$runTests = Read-Host "¿Deseas ejecutar las pruebas ahora? (s/n)"

if ($runTests -eq 's') {
    Write-Host "`nIniciando servidor en segundo plano..." -ForegroundColor Cyan
    $job = Start-Job -ScriptBlock {
        Set-Location $using:PWD
        python alfred_backend.py
    }
    
    Write-Host "Esperando a que el servidor inicie..." -ForegroundColor Gray
    Start-Sleep -Seconds 10
    
    Write-Host "Ejecutando pruebas..." -ForegroundColor Cyan
    python test_backend.py
    
    Write-Host "`nDeteniendo servidor de prueba..." -ForegroundColor Gray
    Stop-Job -Job $job
    Remove-Job -Job $job
}

# Resumen final
Write-Host @"

╔═══════════════════════════════════════════════════════╗
║                                                       ║
║           ✅ ¡Configuración Completada! ✅            ║
║                                                       ║
╚═══════════════════════════════════════════════════════╝

"@ -ForegroundColor Green

Write-Host "📚 Próximos pasos:" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Iniciar el servidor:" -ForegroundColor White
Write-Host "   .\start_alfred_server.ps1" -ForegroundColor Gray
Write-Host "   o" -ForegroundColor Gray
Write-Host "   python alfred_backend.py" -ForegroundColor Gray
Write-Host ""
Write-Host "2. Verificar funcionamiento:" -ForegroundColor White
Write-Host "   python test_backend.py" -ForegroundColor Gray
Write-Host ""
Write-Host "3. Abrir documentación:" -ForegroundColor White
Write-Host "   http://localhost:8000/docs" -ForegroundColor Gray
Write-Host ""
Write-Host "4. Integrar con C#:" -ForegroundColor White
Write-Host "   Copia AlfredClient.cs a tu proyecto" -ForegroundColor Gray
Write-Host ""
Write-Host "📖 Documentación:" -ForegroundColor Cyan
Write-Host "   - QUICKSTART.md      : Guía de inicio rápido" -ForegroundColor Gray
Write-Host "   - README_BACKEND.md  : Documentación completa" -ForegroundColor Gray
Write-Host "   - DEPLOYMENT.md      : Guía de deployment" -ForegroundColor Gray
Write-Host "   - SUMMARY.md         : Resumen ejecutivo" -ForegroundColor Gray
Write-Host ""

$startNow = Read-Host "¿Deseas iniciar el servidor ahora? (s/n)"
if ($startNow -eq 's') {
    Write-Host "`n🚀 Iniciando Alfred Backend..." -ForegroundColor Cyan
    python alfred_backend.py
}

Write-Host "`n✨ ¡Alfred está listo para usarse! ✨`n" -ForegroundColor Green
