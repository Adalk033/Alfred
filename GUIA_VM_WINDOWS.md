# Alfred en Máquina Virtual Windows - Guía Completa

Esta guía está diseñada específicamente para ejecutar Alfred en una máquina virtual (VM) Windows, optimizando el rendimiento y la configuración.

---

## 🖥️ Requisitos de la VM

### Configuración Mínima
- **RAM**: 8 GB (16 GB recomendado)
- **CPU**: 4 núcleos (6-8 recomendado)
- **Almacenamiento**: 50 GB libres
- **Red**: Conexión NAT o Bridge
- **Sistema**: Windows 10/11 (64-bit)

### Configuración Óptima
- **RAM**: 16-32 GB
- **CPU**: 8+ núcleos
- **GPU**: Passthrough si está disponible
- **Almacenamiento**: SSD con 100+ GB
- **Red**: Bridge para mejor rendimiento

---

## 🎮 Configuración de GPU en VM

### Opción 1: GPU Passthrough (Mejor Rendimiento)

#### VMware Workstation/ESXi
```
1. VM Settings → Display
2. Habilitar "Accelerate 3D graphics"
3. Asignar 4+ GB de memoria de video
4. Agregar dispositivo PCI: GPU física
```

#### Hyper-V
```powershell
# Habilitar RemoteFX vGPU (Windows Server)
Add-VMRemoteFx3dVideoAdapter -VMName "Alfred-VM"
Set-VMRemoteFx3dVideoAdapter -VMName "Alfred-VM" -MaximumResolution 1920x1080
```

#### VirtualBox
```
1. VM Settings → Display
2. Habilitar "Enable 3D Acceleration"
3. Asignar 256 MB+ memoria de video
4. Controlador gráfico: VMSVGA o VBoxVGA
```

### Opción 2: Sin GPU (Modo CPU)

Si no tienes acceso a GPU, configura `.env`:

```env
ALFRED_FORCE_CPU=true
ALFRED_DEVICE=cpu
```

**Ventajas:**
- ✅ Funciona en cualquier VM
- ✅ Sin configuración especial
- ✅ Estable y confiable

**Desventajas:**
- ⏱️ Inferencia más lenta (10-30 segundos por respuesta)
- 🔥 Mayor uso de CPU

---

## 📦 Instalación en VM Windows

### Paso 1: Preparar la VM

```powershell
# Verificar versión de Windows
winver

# Verificar RAM disponible
systeminfo | findstr /C:"Total Physical Memory"

# Verificar espacio en disco
Get-PSDrive C | Select-Object Used,Free
```

### Paso 2: Instalar Software Base

#### Python 3.11
```powershell
# Descargar desde: https://www.python.org/downloads/
# Durante instalación:
# ✅ Add Python to PATH
# ✅ Install pip
# ✅ Install for all users (opcional)

# Verificar instalación
python --version
pip --version
```

#### Node.js LTS
```powershell
# Descargar desde: https://nodejs.org/
# Instalar versión LTS (20.x o superior)

# Verificar instalación
node --version
npm --version
```

#### Ollama
```powershell
# Descargar desde: https://ollama.ai/download/windows
# Ejecutar instalador

# Verificar instalación
ollama version

# Iniciar servicio
ollama serve
```

### Paso 3: Clonar Proyecto

```powershell
# Navegar a ubicación deseada
cd C:\Projects

# Clonar repositorio
git clone https://github.com/tu-usuario/AlfredElectron.git
cd AlfredElectron
```

### Paso 4: Configuración Inicial

```powershell
# Copiar plantilla de configuración
Copy-Item .env.template .env

# Editar .env con Notepad
notepad .env
```

**Configuración recomendada para VM:**

```env
# Host y Puerto
ALFRED_HOST=127.0.0.1
ALFRED_PORT=8000

# Documentos (ajustar a tu ruta)
ALFRED_DOCS_PATH=C:/Users/Usuario/Documents

# Modelos (más ligero para VM)
ALFRED_MODEL=gemma2:9b
ALFRED_EMBEDDING_MODEL=nomic-embed-text:v1.5

# GPU - Ajustar según tu VM
ALFRED_FORCE_CPU=true          # Cambiar a false si tienes GPU
ALFRED_DEVICE=cpu              # Cambiar a cuda si tienes GPU

# Performance para VM
ALFRED_CHUNK_SIZE=800          # Reducido para VM
ALFRED_CHUNK_OVERLAP=150       # Reducido para VM
ALFRED_TOP_K=3                 # Menos documentos para VM

# Logs
ALFRED_LOG_LEVEL=INFO
```

### Paso 5: Ejecutar Script de Instalación

```powershell
# Permitir ejecución de scripts
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Ejecutar instalador universal
.\stP.ps1
```

El script hará automáticamente:
- ✅ Verificar Python y crear entorno virtual
- ✅ Instalar dependencias Python
- ✅ Verificar Ollama
- ✅ Descargar modelos necesarios
- ✅ Detectar GPU (o configurar CPU)
- ✅ Instalar dependencias Node.js
- ✅ Iniciar Alfred

---

## ⚡ Optimización de Rendimiento

### 1. Ajustar Prioridad de Proceso

```powershell
# Establecer alta prioridad para Ollama
Get-Process ollama | ForEach-Object { $_.PriorityClass = 'High' }

# Establecer alta prioridad para Python (backend)
Get-Process python | Where-Object {$_.MainWindowTitle -like '*alfred*'} | ForEach-Object { $_.PriorityClass = 'High' }
```

### 2. Configurar Plan de Energía

```powershell
# Cambiar a plan de alto rendimiento
powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c
```

### 3. Deshabilitar Servicios Innecesarios

```powershell
# Lista de servicios seguros para deshabilitar en VM:
Stop-Service -Name "SysMain" -Force  # Superfetch
Set-Service -Name "SysMain" -StartupType Disabled
```

### 4. Optimizar Ollama

Edita variables de entorno de Windows:

```
OLLAMA_NUM_PARALLEL=2       # Reducir para VM
OLLAMA_MAX_LOADED_MODELS=1  # Solo un modelo en memoria
OLLAMA_FLASH_ATTENTION=1    # Activar atención flash
```

### 5. Configurar Swap (Paginación)

```powershell
# Aumentar archivo de paginación si tienes RAM limitada
# Sistema → Configuración avanzada → Rendimiento → Avanzado → Memoria virtual
# Recomendado: 1.5x RAM física
```

---

## 🔧 Configuración de Red

### Opción 1: NAT (Recomendado para Desarrollo)

```
VM Settings → Network → NAT
```

**Ventajas:**
- ✅ Acceso a internet automático
- ✅ Aislamiento de red host
- ✅ No requiere configuración adicional

**Limitaciones:**
- ❌ No accesible desde host (solo desde VM)

### Opción 2: Bridge (Para Acceso desde Host)

```
VM Settings → Network → Bridged Adapter
```

**Ventajas:**
- ✅ VM tiene IP en red local
- ✅ Accesible desde host y otros dispositivos
- ✅ Útil para desarrollo multiplataforma

**Configuración adicional:**

```env
# En .env, cambiar a IP de la VM
ALFRED_HOST=0.0.0.0  # Escuchar en todas las interfaces
ALFRED_PORT=8000
```

```powershell
# Abrir puerto en firewall
New-NetFirewallRule -DisplayName "Alfred Backend" -Direction Inbound -LocalPort 8000 -Protocol TCP -Action Allow
```

---

## 📊 Monitoreo de Recursos

### Script de Monitoreo Continuo

Crea `monitor-vm.ps1`:

```powershell
# Monitor de recursos para VM
while ($true) {
    Clear-Host
    Write-Host "=== MONITOR DE RECURSOS - ALFRED VM ===" -ForegroundColor Cyan
    Write-Host ""
    
    # CPU
    $cpu = Get-Counter '\Processor(_Total)\% Processor Time' | Select-Object -ExpandProperty CounterSamples | Select-Object -ExpandProperty CookedValue
    Write-Host "CPU: $([math]::Round($cpu, 2))%" -ForegroundColor Yellow
    
    # RAM
    $os = Get-CimInstance Win32_OperatingSystem
    $ramUsed = ($os.TotalVisibleMemorySize - $os.FreePhysicalMemory) / 1MB
    $ramTotal = $os.TotalVisibleMemorySize / 1MB
    $ramPercent = ($ramUsed / $ramTotal) * 100
    Write-Host "RAM: $([math]::Round($ramUsed, 2)) GB / $([math]::Round($ramTotal, 2)) GB ($([math]::Round($ramPercent, 2))%)" -ForegroundColor Yellow
    
    # Disco
    $disk = Get-PSDrive C
    $diskUsed = $disk.Used / 1GB
    $diskFree = $disk.Free / 1GB
    $diskTotal = $diskUsed + $diskFree
    $diskPercent = ($diskUsed / $diskTotal) * 100
    Write-Host "Disco C: $([math]::Round($diskUsed, 2)) GB / $([math]::Round($diskTotal, 2)) GB ($([math]::Round($diskPercent, 2))%)" -ForegroundColor Yellow
    
    Write-Host ""
    
    # Procesos Alfred
    $ollamaProc = Get-Process ollama -ErrorAction SilentlyContinue
    if ($ollamaProc) {
        Write-Host "Ollama: CPU $([math]::Round($ollamaProc.CPU, 2))s | RAM $([math]::Round($ollamaProc.WorkingSet64 / 1MB, 2)) MB" -ForegroundColor Green
    } else {
        Write-Host "Ollama: No ejecutándose" -ForegroundColor Red
    }
    
    $pythonProc = Get-Process python -ErrorAction SilentlyContinue | Where-Object {$_.Path -like "*Alfred*"}
    if ($pythonProc) {
        Write-Host "Backend: CPU $([math]::Round($pythonProc.CPU, 2))s | RAM $([math]::Round($pythonProc.WorkingSet64 / 1MB, 2)) MB" -ForegroundColor Green
    } else {
        Write-Host "Backend: No ejecutándose" -ForegroundColor Red
    }
    
    Write-Host ""
    Write-Host "Presiona Ctrl+C para salir" -ForegroundColor Gray
    
    Start-Sleep -Seconds 2
}
```

Ejecutar:
```powershell
.\monitor-vm.ps1
```

---

## 🐛 Solución de Problemas en VM

### Problema 1: Rendimiento Lento

**Síntomas:**
- Respuestas tardan >30 segundos
- CPU al 100% constantemente

**Soluciones:**

```powershell
# 1. Reducir carga de modelos
# En .env:
ALFRED_CHUNK_SIZE=500
ALFRED_TOP_K=2

# 2. Usar modelo más ligero (si disponible)
ollama pull tinyllama
# Cambiar en .env: ALFRED_MODEL=tinyllama

# 3. Aumentar RAM de VM
# Reiniciar VM con más RAM asignada
```

### Problema 2: Ollama No Inicia

**Síntomas:**
- Error "connection refused" al backend
- Ollama no responde

**Soluciones:**

```powershell
# 1. Verificar servicio
Get-Process ollama

# 2. Reiniciar Ollama
Stop-Process -Name ollama -Force
Start-Sleep -Seconds 2
ollama serve

# 3. Verificar puerto
netstat -ano | findstr :11434
```

### Problema 3: Memoria Insuficiente

**Síntomas:**
- Error "Out of memory"
- VM se congela

**Soluciones:**

```powershell
# 1. Limpiar memoria
Stop-Service -Name "SysMain" -Force
Clear-RecycleBin -Force
[System.GC]::Collect()

# 2. Configurar .env para bajo uso de memoria
ALFRED_CHUNK_SIZE=300
ALFRED_TOP_K=1
ALFRED_FORCE_CPU=true

# 3. Cerrar aplicaciones innecesarias
Get-Process | Where-Object {$_.MainWindowTitle} | Select-Object Name,CPU,WS
```

### Problema 4: GPU No Detectada

**Síntomas:**
- `gpu_check.py` muestra "no GPU detected"

**Soluciones:**

```powershell
# 1. Verificar controladores
Get-WmiObject Win32_VideoController | Select-Object Name,DriverVersion

# 2. Verificar PyTorch detecta GPU
python -c "import torch; print(torch.cuda.is_available())"

# 3. Si falla, forzar CPU
# En .env:
ALFRED_FORCE_CPU=true
```

---

## 💾 Snapshots y Backups

### Crear Snapshot antes de Iniciar

```powershell
# VMware
# VM → Snapshot → Take Snapshot

# Hyper-V
Checkpoint-VM -Name "Alfred-VM" -SnapshotName "Pre-Alfred-Install"

# VirtualBox
VBoxManage snapshot "Alfred-VM" take "Pre-Alfred-Install"
```

### Backup de Configuración

```powershell
# Crear carpeta de backup
New-Item -Path "C:\Alfred-Backup" -ItemType Directory -Force

# Copiar archivos importantes
Copy-Item .env "C:\Alfred-Backup\.env" -Force
Copy-Item backend\gpu\gpu_info.json "C:\Alfred-Backup\gpu_info.json" -Force -ErrorAction SilentlyContinue
Copy-Item "%APPDATA%\Alfred\db\alfred.db" "C:\Alfred-Backup\alfred.db" -Force -ErrorAction SilentlyContinue
```

---

## 🚀 Script de Inicio Automático para VM

Crea `start-alfred-vm.ps1`:

```powershell
# Script de inicio automático para VM
$ErrorActionPreference = "Stop"

Write-Host "Iniciando Alfred en VM..." -ForegroundColor Cyan

# 1. Verificar servicios
Write-Host "Verificando Ollama..." -ForegroundColor Yellow
if (!(Get-Process ollama -ErrorAction SilentlyContinue)) {
    Start-Process "ollama" -ArgumentList "serve" -WindowStyle Hidden
    Start-Sleep -Seconds 5
}

# 2. Optimizar rendimiento
Write-Host "Optimizando rendimiento..." -ForegroundColor Yellow
powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c
Get-Process ollama | ForEach-Object { $_.PriorityClass = 'High' }

# 3. Limpiar memoria
Write-Host "Limpiando memoria..." -ForegroundColor Yellow
[System.GC]::Collect()

# 4. Iniciar Alfred
Write-Host "Iniciando Alfred..." -ForegroundColor Green
cd "C:\Projects\AlfredElectron"
.\stP.ps1
```

Agregar al inicio automático de Windows:
```powershell
# Crear acceso directo en carpeta de inicio
$WshShell = New-Object -comObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\Alfred.lnk")
$Shortcut.TargetPath = "powershell.exe"
$Shortcut.Arguments = "-ExecutionPolicy Bypass -File C:\Projects\AlfredElectron\start-alfred-vm.ps1"
$Shortcut.WorkingDirectory = "C:\Projects\AlfredElectron"
$Shortcut.WindowStyle = 7  # Minimizado
$Shortcut.Save()
```

---

## 📈 Métricas de Rendimiento Esperadas

### Con GPU (Passthrough)
- **Tiempo de respuesta**: 2-5 segundos
- **Uso de RAM**: 4-8 GB
- **Uso de CPU**: 20-40%
- **Uso de GPU**: 60-90%

### Sin GPU (Solo CPU)
- **Tiempo de respuesta**: 10-30 segundos
- **Uso de RAM**: 6-12 GB
- **Uso de CPU**: 80-100%
- **Uso de GPU**: 0%

### Modelo Ligero (TinyLlama)
- **Tiempo de respuesta**: 1-3 segundos (CPU)
- **Uso de RAM**: 2-4 GB
- **Uso de CPU**: 40-60%

---

## ✅ Checklist Final para VM

Antes de usar Alfred en producción en tu VM:

- [ ] RAM asignada ≥ 8 GB
- [ ] CPU asignada ≥ 4 núcleos
- [ ] Espacio en disco ≥ 50 GB libres
- [ ] Python 3.8+ instalado
- [ ] Node.js LTS instalado
- [ ] Ollama instalado y funcionando
- [ ] Modelos descargados (gemma2:9b, nomic-embed-text)
- [ ] Archivo `.env` configurado
- [ ] GPU detectada o `ALFRED_FORCE_CPU=true`
- [ ] Puerto 8000 accesible
- [ ] Snapshot creado (para rollback)
- [ ] Script `stP.ps1` ejecutado exitosamente

---

**¡Tu VM está lista para usar Alfred!** 🎉

Para iniciar:
```powershell
cd C:\Projects\AlfredElectron
.\stP.ps1
```
