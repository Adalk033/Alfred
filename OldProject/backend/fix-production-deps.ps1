# ============================================
# SCRIPT: Reparar Dependencias de Produccion
# ============================================
# Proposito: Corregir error de jsonschema/referencing en ChromaDB
# Error: 'http://json-schema.org/draft-03/schema#'
# ============================================

param(
    [string]$PythonPath = "",
    [switch]$Force = $false
)

$ErrorActionPreference = "Stop"

Write-Host "`n╔══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   Reparacion de Dependencias - Alfred Backend       ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

# Determinar la ruta de Python
if ([string]::IsNullOrEmpty($PythonPath)) {
    # Intentar detectar Python portable en produccion
    $productionPaths = @(
        "C:\Program Files\Alfred\resources\backend\python-portable\Scripts\python.exe",
        "C:\Program Files (x86)\Alfred\resources\backend\python-portable\Scripts\python.exe",
        "$PSScriptRoot\python-portable\Scripts\python.exe"
    )
    
    foreach ($path in $productionPaths) {
        if (Test-Path $path) {
            $PythonPath = $path
            Write-Host "✅ Python detectado: $PythonPath" -ForegroundColor Green
            break
        }
    }
    
    if ([string]::IsNullOrEmpty($PythonPath)) {
        Write-Host "❌ No se encontro Python portable" -ForegroundColor Red
        Write-Host ""
        Write-Host "Uso manual:" -ForegroundColor Yellow
        Write-Host "  .\fix-production-deps.ps1 -PythonPath 'C:\ruta\a\python.exe'" -ForegroundColor White
        exit 1
    }
}

# Verificar que Python existe
if (-not (Test-Path $PythonPath)) {
    Write-Host "❌ Python no existe en: $PythonPath" -ForegroundColor Red
    exit 1
}

Write-Host "🔧 Usando Python: $PythonPath" -ForegroundColor Cyan
Write-Host ""

# Verificar pip
$pipPath = $PythonPath -replace 'python\.exe$', 'pip.exe'
if (-not (Test-Path $pipPath)) {
    Write-Host "❌ pip no encontrado en: $pipPath" -ForegroundColor Red
    exit 1
}

Write-Host "📦 Verificando pip..." -ForegroundColor Cyan
& $PythonPath -m pip --version
Write-Host ""

# ============================================
# FASE 1: DIAGNOSTICO
# ============================================
Write-Host "╔══════════════════════════════════════════════════════╗" -ForegroundColor Yellow
Write-Host "║  FASE 1: Diagnostico de Dependencias                ║" -ForegroundColor Yellow
Write-Host "╚══════════════════════════════════════════════════════╝`n" -ForegroundColor Yellow

Write-Host "Verificando versiones actuales..." -ForegroundColor Cyan
Write-Host ""

$packages = @("jsonschema", "referencing", "chromadb", "langchain-chroma")

foreach ($pkg in $packages) {
    Write-Host "Verificando $pkg..." -ForegroundColor White
    $result = & $PythonPath -m pip show $pkg 2>&1
    if ($LASTEXITCODE -eq 0) {
        $version = ($result | Select-String "Version:").ToString() -replace "Version:\s*", ""
        Write-Host "  ✅ Instalado: $version" -ForegroundColor Green
    } else {
        Write-Host "  ❌ NO instalado" -ForegroundColor Red
    }
}
Write-Host ""

# ============================================
# FASE 2: REPARACION
# ============================================
Write-Host "╔══════════════════════════════════════════════════════╗" -ForegroundColor Yellow
Write-Host "║  FASE 2: Reparacion de Dependencias                 ║" -ForegroundColor Yellow
Write-Host "╚══════════════════════════════════════════════════════╝`n" -ForegroundColor Yellow

if (-not $Force) {
    $confirmation = Read-Host "Deseas reparar las dependencias? (s/n)"
    if ($confirmation -ne 's') {
        Write-Host "`n❌ Operacion cancelada" -ForegroundColor Red
        exit 0
    }
}

Write-Host "`n🔧 Iniciando reparacion..." -ForegroundColor Cyan
Write-Host ""

# Paso 1: Actualizar pip
Write-Host "1️⃣  Actualizando pip..." -ForegroundColor Cyan
& $PythonPath -m pip install --upgrade pip
if ($LASTEXITCODE -ne 0) {
    Write-Host "   ⚠️  Error actualizando pip (continuando...)" -ForegroundColor Yellow
}
Write-Host ""

# Paso 2: Desinstalar paquetes problematicos
Write-Host "2️⃣  Desinstalando paquetes problematicos..." -ForegroundColor Cyan
$toUninstall = @("jsonschema", "referencing", "jsonschema-specifications")
foreach ($pkg in $toUninstall) {
    Write-Host "   Desinstalando $pkg..." -ForegroundColor White
    & $PythonPath -m pip uninstall -y $pkg 2>&1 | Out-Null
}
Write-Host "   ✅ Desinstalacion completada" -ForegroundColor Green
Write-Host ""

# Paso 3: Instalar versiones compatibles
Write-Host "3️⃣  Instalando versiones compatibles..." -ForegroundColor Cyan
Write-Host ""

# jsonschema-specifications (primero)
Write-Host "   Instalando jsonschema-specifications..." -ForegroundColor White
& $PythonPath -m pip install "jsonschema-specifications>=2023.12.1"
if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✅ jsonschema-specifications instalado" -ForegroundColor Green
} else {
    Write-Host "   ❌ Error instalando jsonschema-specifications" -ForegroundColor Red
}
Write-Host ""

# referencing
Write-Host "   Instalando referencing..." -ForegroundColor White
& $PythonPath -m pip install "referencing>=0.31.0"
if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✅ referencing instalado" -ForegroundColor Green
} else {
    Write-Host "   ❌ Error instalando referencing" -ForegroundColor Red
}
Write-Host ""

# jsonschema
Write-Host "   Instalando jsonschema..." -ForegroundColor White
& $PythonPath -m pip install "jsonschema>=4.20.0"
if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✅ jsonschema instalado" -ForegroundColor Green
} else {
    Write-Host "   ❌ Error instalando jsonschema" -ForegroundColor Red
}
Write-Host ""

# Paso 4: Reinstalar ChromaDB y langchain-chroma
Write-Host "4️⃣  Reinstalando ChromaDB..." -ForegroundColor Cyan
& $PythonPath -m pip install --force-reinstall --no-deps chromadb
if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✅ ChromaDB reinstalado" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  Error reinstalando ChromaDB" -ForegroundColor Yellow
}
Write-Host ""

Write-Host "5️⃣  Instalando langchain-chroma..." -ForegroundColor Cyan
& $PythonPath -m pip install "langchain-chroma>=0.1.0"
if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✅ langchain-chroma instalado" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  Error instalando langchain-chroma" -ForegroundColor Yellow
}
Write-Host ""

# Paso 5: Reparar todas las dependencias
Write-Host "6️⃣  Reparando dependencias de ChromaDB..." -ForegroundColor Cyan
& $PythonPath -m pip install --upgrade chromadb[all]
Write-Host ""

# ============================================
# FASE 3: VERIFICACION
# ============================================
Write-Host "╔══════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║  FASE 3: Verificacion de Reparacion                 ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════════════════════╝`n" -ForegroundColor Green

Write-Host "Verificando versiones finales..." -ForegroundColor Cyan
Write-Host ""

$allOk = $true

foreach ($pkg in $packages) {
    Write-Host "Verificando $pkg..." -ForegroundColor White
    $result = & $PythonPath -m pip show $pkg 2>&1
    if ($LASTEXITCODE -eq 0) {
        $version = ($result | Select-String "Version:").ToString() -replace "Version:\s*", ""
        Write-Host "  ✅ Instalado: $version" -ForegroundColor Green
    } else {
        Write-Host "  ❌ NO instalado" -ForegroundColor Red
        $allOk = $false
    }
}
Write-Host ""

# Test de importacion
Write-Host "🧪 Testeando importacion de ChromaDB..." -ForegroundColor Cyan
$testScript = @"
import sys
try:
    import chromadb
    print('✅ ChromaDB importado correctamente')
    print(f'   Version: {chromadb.__version__}')
    
    import jsonschema
    print('✅ jsonschema importado correctamente')
    print(f'   Version: {jsonschema.__version__}')
    
    import referencing
    print('✅ referencing importado correctamente')
    
    sys.exit(0)
except Exception as e:
    print(f'❌ Error: {e}')
    import traceback
    traceback.print_exc()
    sys.exit(1)
"@

$testFile = [System.IO.Path]::GetTempFileName() + ".py"
Set-Content -Path $testFile -Value $testScript -Encoding UTF8

& $PythonPath $testFile
$testResult = $LASTEXITCODE

Remove-Item $testFile -ErrorAction SilentlyContinue

Write-Host ""

if ($testResult -eq 0 -and $allOk) {
    Write-Host "╔══════════════════════════════════════════════════════╗" -ForegroundColor Green
    Write-Host "║     REPARACION COMPLETADA EXITOSAMENTE ✅            ║" -ForegroundColor Green
    Write-Host "╚══════════════════════════════════════════════════════╝" -ForegroundColor Green
    Write-Host ""
    Write-Host "✅ Todas las dependencias estan correctas" -ForegroundColor Green
    Write-Host "✅ ChromaDB funciona correctamente" -ForegroundColor Green
    Write-Host ""
    Write-Host "💡 Ahora puedes reiniciar Alfred" -ForegroundColor Cyan
    Write-Host ""
    exit 0
} else {
    Write-Host "╔══════════════════════════════════════════════════════╗" -ForegroundColor Red
    Write-Host "║     REPARACION INCOMPLETA ⚠️                         ║" -ForegroundColor Red
    Write-Host "╚══════════════════════════════════════════════════════╝" -ForegroundColor Red
    Write-Host ""
    Write-Host "⚠️  Algunos paquetes no se instalaron correctamente" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Intenta ejecutar manualmente:" -ForegroundColor Cyan
    Write-Host "  $PythonPath -m pip install --force-reinstall chromadb jsonschema referencing" -ForegroundColor White
    Write-Host ""
    exit 1
}
