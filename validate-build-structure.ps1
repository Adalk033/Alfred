# ============================================
# SCRIPT: Validar y Corregir Estructura Pre-Build
# ============================================
# Proposito: Verificar que todo esté listo para electron-builder
#            y corregir advertencias automáticamente
# Uso: .\validate-build-structure.ps1
# ============================================

param(
    [switch]$IncludeVenvBase = $true,
    [switch]$Verbose = $false,
    [switch]$AutoFix = $true,
    [switch]$Force = $false
)

$ErrorActionPreference = "Stop"

# Configuracion
$BACKEND_DIR = Join-Path $PSScriptRoot "backend"
$ASSETS_DIR = Join-Path $PSScriptRoot "assets"
$PYTHON_PORTABLE = Join-Path $BACKEND_DIR "python-portable\python.exe"
$VENV_BASE = Join-Path $BACKEND_DIR "venv_base"
$VENV_DEV = Join-Path $BACKEND_DIR "venv"
$CHROMA_DB = Join-Path $BACKEND_DIR "chroma_db"
$TEMP_DIR = Join-Path $BACKEND_DIR "temp"
$ENV_FILE = Join-Path $BACKEND_DIR ".env"

# Contadores
$totalChecks = 0
$passedChecks = 0
$failedChecks = 0
$warnings = 0
$fixedIssues = 0

# Colores
function Write-Check-Pass { param($msg) Write-Host "[✓] $msg" -ForegroundColor Green; $script:passedChecks++ }
function Write-Check-Fail { param($msg) Write-Host "[✗] $msg" -ForegroundColor Red; $script:failedChecks++ }
function Write-Check-Warn { param($msg) Write-Host "[!] $msg" -ForegroundColor Yellow; $script:warnings++ }
function Write-Check-Info { param($msg) Write-Host "[i] $msg" -ForegroundColor Cyan }
function Write-Check-Fixed { param($msg) Write-Host "[✓] $msg" -ForegroundColor Magenta; $script:fixedIssues++ }

Write-Host "`n========================================" -ForegroundColor Magenta
Write-Host "   VALIDACION Y CORRECCION PRE-BUILD" -ForegroundColor Magenta
Write-Host "========================================`n" -ForegroundColor Magenta

if ($AutoFix) {
    Write-Host "🔧 Modo AutoFix ACTIVADO - Se corregiràn advertencias automàticamente`n" -ForegroundColor Cyan
}

# ====================
# SECCION 1: Archivos Principales
# ====================
Write-Host "SECCION 1: Archivos Principales" -ForegroundColor Cyan
Write-Host "--------------------------------" -ForegroundColor DarkGray

$totalChecks++
if (Test-Path "package.json") {
    Write-Check-Pass "package.json existe"
} else {
    Write-Check-Fail "package.json NO encontrado"
}

$totalChecks++
if (Test-Path "main.js") {
    Write-Check-Pass "main.js existe"
} else {
    Write-Check-Fail "main.js NO encontrado"
}

$totalChecks++
if (Test-Path "preload.js") {
    Write-Check-Pass "preload.js existe"
} else {
    Write-Check-Fail "preload.js NO encontrado"
}

$totalChecks++
if (Test-Path "renderer") {
    $rendererFiles = Get-ChildItem "renderer" -Recurse | Measure-Object
    Write-Check-Pass "renderer/ existe ($($rendererFiles.Count) archivos)"
} else {
    Write-Check-Fail "renderer/ NO encontrado"
}

# ====================
# SECCION 2: Iconos
# ====================
Write-Host "`nSECCION 2: Iconos" -ForegroundColor Cyan
Write-Host "--------------------------------" -ForegroundColor DarkGray

$icons = @("icon.ico", "icon.icns", "icon.png")
foreach ($icon in $icons) {
    $totalChecks++
    $iconPath = Join-Path $ASSETS_DIR $icon
    if (Test-Path $iconPath) {
        $size = (Get-Item $iconPath).Length / 1KB
        Write-Check-Pass "$icon existe ($([math]::Round($size, 2)) KB)"
    } else {
        Write-Check-Fail "$icon NO encontrado en assets/"
    }
}

# ====================
# SECCION 3: Backend Python
# ====================
Write-Host "`nSECCION 3: Backend Python" -ForegroundColor Cyan
Write-Host "--------------------------------" -ForegroundColor DarkGray

$totalChecks++
if (Test-Path $PYTHON_PORTABLE) {
    try {
        $pythonVersion = & $PYTHON_PORTABLE --version 2>&1
        Write-Check-Pass "Python portable: $pythonVersion"
    } catch {
        Write-Check-Fail "Python portable no ejecutable"
    }
} else {
    Write-Check-Fail "Python portable NO encontrado"
}

$totalChecks++
$backendCore = Join-Path $BACKEND_DIR "core"
if (Test-Path $backendCore) {
    $coreFiles = @("alfred_backend.py", "alfred_core.py", "config.py")
    $missingCore = @()
    foreach ($file in $coreFiles) {
        if (-not (Test-Path (Join-Path $backendCore $file))) {
            $missingCore += $file
        }
    }
    if ($missingCore.Count -eq 0) {
        Write-Check-Pass "backend/core/ completo (3 archivos criticos)"
    } else {
        Write-Check-Fail "backend/core/ falta: $($missingCore -join ', ')"
    }
} else {
    Write-Check-Fail "backend/core/ NO encontrado"
}

$totalChecks++
$requirementsTxt = Join-Path $BACKEND_DIR "requirements.txt"
if (Test-Path $requirementsTxt) {
    $reqContent = Get-Content $requirementsTxt -Raw
    if ($reqContent -match "langdetect==1\.0\.9") {
        Write-Check-Fail "requirements.txt tiene version INCORRECTA de langdetect (1.0.9)"
        Write-Host "  Ejecuta: .\fix-requirements-versions.ps1" -ForegroundColor Yellow
    } elseif ($reqContent -match "langdetect==1\.0\.7") {
        Write-Check-Pass "requirements.txt corregido (langdetect==1.0.7)"
    } else {
        Write-Check-Warn "requirements.txt sin langdetect (verificar manualmente)"
    }
} else {
    Write-Check-Fail "requirements.txt NO encontrado"
}

# ====================
# SECCION 4: Dependencias Pre-instaladas (Optimizacion)
# ====================
Write-Host "`nSECCION 4: Dependencias Pre-instaladas (Optimizacion)" -ForegroundColor Cyan
Write-Host "--------------------------------" -ForegroundColor DarkGray

$totalChecks++
$MARKER_FILE = Join-Path $BACKEND_DIR "python-portable\.packages_installed"

if (Test-Path $MARKER_FILE) {
    # Leer información del marcador
    $markerContent = Get-Content $MARKER_FILE -Raw
    $packagesMatch = $markerContent -match "Paquetes instalados: (\d+)"
    $packagesCount = if ($packagesMatch) { $Matches[1] } else { "?" }
    
    $sizeMatch = $markerContent -match "Tamano total: ([\d.]+) MB"
    $pythonSize = if ($sizeMatch) { $Matches[1] } else { "?" }
    
    if ([int]$packagesCount -ge 140) {
        Write-Check-Pass "Python portable tiene dependencias pre-instaladas ✨"
        Write-Check-Pass "$packagesCount paquetes ($pythonSize MB) - Instalacion rapida"
        Write-Check-Info "PyTorch y paquetes GPU se instalan en primera ejecucion segun hardware"
    } else {
        Write-Check-Warn "Python portable tiene pocas dependencias ($packagesCount paquetes, esperado: ~165)"
        Write-Host "  💡 Recomendacion: .\create-venv-base.ps1 -Force" -ForegroundColor Yellow
    }
} else {
    Write-Check-Warn "Python portable SIN dependencias pre-instaladas"
    Write-Host "  ⚠️  La primera instalacion del usuario sera mas lenta (15-20 min)" -ForegroundColor Yellow
    Write-Host "  💡 Recomendacion para acelerar: .\create-venv-base.ps1" -ForegroundColor Yellow
    Write-Host "  ℹ️  Esto agregara ~400 MB al instalador pero reducira tiempo de instalacion" -ForegroundColor DarkGray
    Write-Host "  ℹ️  PyTorch (~2-3 GB) se instalara en primera ejecucion segun GPU" -ForegroundColor DarkGray
}

# Advertir si existe venv_base antiguo (de versiones anteriores)
$totalChecks++
if (Test-Path $VENV_BASE) {
    Write-Check-Warn "Carpeta 'venv_base' detectada (de version antigua del sistema)"
    Write-Host "  ℹ️  El sistema actual usa Python portable pre-instalado en vez de venv_base" -ForegroundColor DarkGray
    
    if ($AutoFix) {
        try {
            Write-Host "  🔧 Eliminando venv_base antiguo..." -ForegroundColor Yellow
            Remove-Item $VENV_BASE -Recurse -Force -ErrorAction Stop
            $fixedIssues++
            Write-Check-Fixed "venv_base antiguo eliminado (ahora usa Python portable pre-instalado)"
        } catch {
            Write-Host "  ⚠️  No se pudo eliminar automáticamente: $_" -ForegroundColor Yellow
            Write-Host "  💡 Ejecuta: Remove-Item backend\venv_base -Recurse -Force" -ForegroundColor DarkGray
        }
    } else {
        Write-Host "  💡 Para eliminar manualmente: Remove-Item backend\venv_base -Recurse -Force" -ForegroundColor DarkGray
        Write-Host "  ℹ️  Sistema nuevo: Python portable con dependencias incluidas" -ForegroundColor DarkGray
    }
} else {
    Write-Check-Info "Sin carpeta venv_base antigua (correcto para sistema nuevo)"
}

# ====================
# SECCION 5: Limpieza (Archivos a Excluir)
# ====================
Write-Host "`nSECCION 5: Limpieza (Archivos a Excluir)" -ForegroundColor Cyan
Write-Host "--------------------------------" -ForegroundColor DarkGray

# 1. Verificar y limpiar venv de desarrollo
$totalChecks++

# 2. Verificar y limpiar chroma_db
$totalChecks++
if (Test-Path $CHROMA_DB) {
    Write-Check-Warn "chroma_db/ existe (sera excluido, contiene datos del usuario)"
    
    if ($AutoFix) {
        try {
            Remove-Item $CHROMA_DB -Recurse -Force -ErrorAction Stop
            Write-Check-Fixed "chroma_db/ eliminado automáticamente"
        } catch {
            Write-Host "  ⚠️  No se pudo eliminar automáticamente: $_" -ForegroundColor Yellow
            Write-Host "  💡 Ejecuta: Remove-Item backend\chroma_db -Recurse -Force" -ForegroundColor DarkGray
        }
    } else {
        Write-Host "  💡 Ejecuta: Remove-Item backend\chroma_db -Recurse -Force" -ForegroundColor DarkGray
    }
} else {
    Write-Check-Pass "chroma_db/ NO existe (correcto)"
}

# 3. Verificar y limpiar temp
$totalChecks++
if (Test-Path $TEMP_DIR) {
    Write-Check-Warn "temp/ existe (sera excluido)"
    
    if ($AutoFix) {
        try {
            Remove-Item $TEMP_DIR -Recurse -Force -ErrorAction Stop
            Write-Check-Fixed "temp/ eliminado automáticamente"
        } catch {
            Write-Host "  ⚠️  No se pudo eliminar automáticamente: $_" -ForegroundColor Yellow
        }
    }
} else {
    Write-Check-Pass "temp/ NO existe (correcto)"
}

# 4. Verificar y limpiar __pycache__
$totalChecks++
$pycacheFiles = Get-ChildItem $BACKEND_DIR -Recurse -Filter "__pycache__" -ErrorAction SilentlyContinue

if ($pycacheFiles.Count -gt 0) {
    Write-Check-Warn "$($pycacheFiles.Count) carpetas __pycache__ encontradas"
    
    if ($AutoFix) {
        try {
            foreach ($pycache in $pycacheFiles) {
                Remove-Item $pycache.FullName -Recurse -Force -ErrorAction SilentlyContinue
            }
            Write-Check-Fixed "$($pycacheFiles.Count) carpetas __pycache__ eliminadas"
        } catch {
            Write-Host "  ⚠️  Error al eliminar __pycache__: $_" -ForegroundColor Yellow
            Write-Host "  💡 Ejecuta: Get-ChildItem backend -Recurse -Filter '__pycache__' | Remove-Item -Recurse -Force" -ForegroundColor DarkGray
        }
    } else {
        Write-Host "  💡 Ejecuta: Get-ChildItem backend -Recurse -Filter '__pycache__' | Remove-Item -Recurse -Force" -ForegroundColor DarkGray
    }
} else {
    Write-Check-Pass "Sin carpetas __pycache__"
}

# 5. Verificar archivos .pyc
$totalChecks++
$pycFiles = Get-ChildItem $BACKEND_DIR -Recurse -Filter "*.pyc" -ErrorAction SilentlyContinue

if ($pycFiles.Count -gt 0) {
    Write-Check-Warn "$($pycFiles.Count) archivos .pyc encontrados"
    
    if ($AutoFix) {
        try {
            foreach ($pyc in $pycFiles) {
                Remove-Item $pyc.FullName -Force -ErrorAction SilentlyContinue
            }
            Write-Check-Fixed "$($pycFiles.Count) archivos .pyc eliminados"
        } catch {
            Write-Host "  ⚠️  Error al eliminar .pyc: $_" -ForegroundColor Yellow
        }
    }
} else {
    Write-Check-Pass "Sin archivos .pyc"
}

# 6. Verificar .env
$totalChecks++
if (Test-Path $ENV_FILE) {
    Write-Check-Warn ".env existe en backend/ (sera excluido, pero verifica que no tenga datos críticos)"
    
    # Ofrecer crear backup
    if ($AutoFix -and -not $Force) {
        $envBackup = Join-Path $BACKEND_DIR ".env.backup"
        
        if (-not (Test-Path $envBackup)) {
            try {
                Copy-Item $ENV_FILE $envBackup -Force
                Write-Check-Fixed "Backup creado: .env.backup"
            } catch {
                Write-Host "  ⚠️  No se pudo crear backup de .env" -ForegroundColor Yellow
            }
        }
    }
} else {
    Write-Check-Pass ".env NO existe en backend/ (correcto)"
}

# ====================
# SECCION 6: package.json Build Config
# ====================
Write-Host "`nSECCION 6: Configuracion de Build" -ForegroundColor Cyan
Write-Host "--------------------------------" -ForegroundColor DarkGray

$totalChecks++
$packageJson = Get-Content "package.json" -Raw | ConvertFrom-Json
if ($packageJson.build) {
    Write-Check-Pass "package.json tiene configuracion 'build'"
    
    if ($packageJson.build.extraResources) {
        Write-Check-Pass "extraResources configurado"
        
        # Verificar filtros
        $backendResource = $packageJson.build.extraResources | Where-Object { $_.from -eq "backend" }
        if ($backendResource) {
            if ($backendResource.filter -contains "!venv/**/*") {
                Write-Check-Pass "Filtro !venv/**/* presente (correcto)"
            } else {
                Write-Check-Warn "Falta filtro !venv/**/* en extraResources"
            }
            
            if ($IncludeVenvBase) {
                if ($backendResource.filter -contains "!venv_base/**/*") {
                    Write-Check-Warn "Filtro !venv_base/**/* excluye venv_base (no se incluira)"
                } else {
                    Write-Check-Pass "venv_base NO esta excluido (se incluira)"
                }
            }
        }
    } else {
        Write-Check-Fail "extraResources NO configurado"
    }
    
    if ($packageJson.build.win) {
        Write-Check-Pass "Configuracion Windows presente"
    } else {
        Write-Check-Warn "Sin configuracion Windows"
    }
} else {
    Write-Check-Fail "package.json SIN configuracion 'build'"
}

# ====================
# SECCION 7: Dependencias NPM
# ====================
Write-Host "`nSECCION 7: Dependencias NPM" -ForegroundColor Cyan
Write-Host "--------------------------------" -ForegroundColor DarkGray

$totalChecks++
if (Test-Path "node_modules") {
    Write-Check-Pass "node_modules/ existe"
} else {
    Write-Check-Warn "node_modules/ NO existe"
    Write-Host "  Ejecutar: npm install" -ForegroundColor Yellow
}

$totalChecks++
if ($packageJson.devDependencies.'electron-builder') {
    $ebVersion = $packageJson.devDependencies.'electron-builder'
    Write-Check-Pass "electron-builder instalado (v$ebVersion)"
} else {
    Write-Check-Fail "electron-builder NO en devDependencies"
}

# ====================
# RESUMEN FINAL
# ====================
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "   RESUMEN" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Total verificaciones: $totalChecks" -ForegroundColor White
Write-Host "Pasadas:              $passedChecks" -ForegroundColor Green
Write-Host "Fallidas:             $failedChecks" -ForegroundColor Red
Write-Host "Advertencias:         $warnings" -ForegroundColor Yellow

if ($AutoFix -and $fixedIssues -gt 0) {
    Write-Host "Correcciones:         $fixedIssues" -ForegroundColor Magenta
}

Write-Host "`n----------------------------------------" -ForegroundColor DarkGray

if ($failedChecks -eq 0 -and $warnings -eq 0) {
    Write-Host "✓ TODO LISTO PARA BUILD" -ForegroundColor Green
    Write-Host "`nEjecutar: npm run build:win" -ForegroundColor Cyan
    exit 0
} elseif ($failedChecks -eq 0 -and $fixedIssues -gt 0) {
    Write-Host "✓ ADVERTENCIAS CORREGIDAS AUTOMATICAMENTE" -ForegroundColor Magenta
    Write-Host "`nTodo listo, ejecutar: npm run build:win" -ForegroundColor Cyan
    exit 0
} elseif ($failedChecks -eq 0) {
    # Hay advertencias pero no se corrigieron (AutoFix desactivado)
    if (-not $AutoFix) {
        Write-Host "⚠ LISTO CON ADVERTENCIAS" -ForegroundColor Yellow
        Write-Host "`nPara corregir advertencias automáticamente:" -ForegroundColor Cyan
        Write-Host ".\validate-build-structure.ps1 -AutoFix" -ForegroundColor White
        Write-Host "`nO puedes continuar con: npm run build:win" -ForegroundColor Cyan
        Write-Host "Las advertencias no afectan el build" -ForegroundColor DarkGray
    } else {
        Write-Host "⚠ LISTO CON ADVERTENCIAS MENORES" -ForegroundColor Yellow
        Write-Host "`nPuedes continuar con: npm run build:win" -ForegroundColor Cyan
    }
    exit 0
} else {
    Write-Host "✗ REQUIERE CORRECCIONES" -ForegroundColor Red
    Write-Host "`nResuelve los errores antes de continuar" -ForegroundColor Yellow
    
    if (-not $AutoFix) {
        Write-Host "`nIntenta ejecutar con AutoFix:" -ForegroundColor Cyan
        Write-Host ".\validate-build-structure.ps1 -AutoFix" -ForegroundColor White
    }
    
    exit 1
}
