# Alfred - Guía de Inicio Rápido

## Requisitos Previos

Antes de ejecutar Alfred, asegúrate de tener instalado:

### Software Obligatorio

1. **Python 3.8+**
   - Windows: [python.org/downloads](https://www.python.org/downloads/)
   - Linux: `sudo apt install python3 python3-venv python3-pip`
   - macOS: `brew install python3`

2. **Node.js (LTS)**
   - Todas las plataformas: [nodejs.org](https://nodejs.org/)
   - macOS: `brew install node`
   - Linux: `sudo apt install nodejs npm`

3. **Ollama**
   - Todas las plataformas: [ollama.ai](https://ollama.ai/)
   - Linux: `curl -fsSL https://ollama.ai/install.sh | sh`
   - macOS: `brew install ollama`

### Modelos de Ollama Requeridos

```bash
ollama pull gemma2:9b
ollama pull nomic-embed-text:v1.5
```

---

## Instalación y Arranque

### Método 1: Script Universal de Arranque (Recomendado)

El script `stP` (start Project) automáticamente:
- ✅ Verifica instalación de Python y crea entorno virtual
- ✅ Instala todas las dependencias de Python
- ✅ Verifica que Ollama esté instalado y ejecutando
- ✅ Descarga modelos de Ollama si faltan
- ✅ Detecta GPU disponible (NVIDIA/AMD/Apple Silicon)
- ✅ Configura archivo `.env` en primer arranque
- ✅ Instala dependencias de Node.js
- ✅ Inicia backend y frontend automáticamente

#### Windows

```powershell
.\stP.ps1
```

#### Linux/macOS

```bash
chmod +x stP.sh
./stP.sh
```

### Método 2: Arranque Manual

Si prefieres control total del proceso:

#### 1. Configurar Entorno Virtual de Python

```bash
# Windows
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt

# Linux/macOS
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

#### 2. Configurar Variables de Entorno

Copia `.env.template` a `.env` y edita:

```bash
cp .env.template .env
# Edita .env con tu editor favorito
```

**Variables importantes:**
- `ALFRED_DOCS_PATH`: Ruta a tus documentos personales
- `ALFRED_HOST`: 127.0.0.1 (no cambiar)
- `ALFRED_PORT`: 8000 (puerto del backend)

#### 3. Verificar GPU (Opcional)

```bash
python backend/gpu/gpu_check.py
```

Esto creará `backend/gpu/gpu_info.json` con información de tu hardware.

#### 4. Iniciar Ollama

```bash
ollama serve
```

#### 5. Instalar Dependencias de Electron

```bash
npm install
```

#### 6. Iniciar Alfred

```bash
npm start
```

El script de Electron iniciará automáticamente el backend de FastAPI.

---

## Configuración Detallada

### Archivo `.env`

```env
# Servidor
ALFRED_HOST=127.0.0.1
ALFRED_PORT=8000

# Documentos
ALFRED_DOCS_PATH=/ruta/a/tus/documentos

# Modelos
ALFRED_MODEL=gemma2:9b
ALFRED_EMBEDDING_MODEL=nomic-embed-text:v1.5

# GPU
ALFRED_FORCE_CPU=false        # Forzar CPU en vez de GPU
ALFRED_DEVICE=auto            # auto/cpu/cuda/mps

# Base de datos
ALFRED_FORCE_RELOAD=false     # Recargar documentos en próximo inicio

# Logs
ALFRED_LOG_LEVEL=INFO         # DEBUG/INFO/WARNING/ERROR
```

### Configuración de GPU

Alfred detecta automáticamente:
- **NVIDIA CUDA**: GPUs NVIDIA con soporte CUDA
- **AMD ROCm**: GPUs AMD con soporte ROCm
- **Apple MPS**: Apple Silicon (M1/M2/M3)

Para forzar CPU:
```env
ALFRED_FORCE_CPU=true
```

---

## Estructura del Proyecto

```
AlfredElectron/
├── stP.ps1                    # Script de arranque Windows
├── stP.sh                     # Script de arranque Linux/macOS
├── .env.template              # Plantilla de configuración
├── .env                       # Tu configuración (gitignored)
├── main.js                    # Proceso principal Electron
├── package.json               # Dependencias Node.js
│
├── backend/
│   ├── requirements.txt       # Dependencias Python
│   ├── venv/                  # Entorno virtual Python
│   │
│   ├── core/
│   │   ├── alfred_backend.py  # API FastAPI
│   │   ├── alfred_core.py     # Lógica RAG
│   │   ├── config.py          # Configuración y prompts
│   │   └── ...
│   │
│   ├── gpu/
│   │   ├── gpu_check.py       # Detección de GPU
│   │   ├── gpu_manager.py     # Gestión de GPU
│   │   └── gpu_info.json      # Info de GPU (generado)
│   │
│   └── utils/
│       ├── logger.py          # Sistema de logs
│       └── security.py        # Encriptación
│
└── renderer/
    ├── index.html             # UI principal
    ├── renderer.js            # Lógica del frontend
    └── styles/                # Estilos CSS
```

---

## Solución de Problemas

### Backend no inicia

```powershell
# Verificar Python y entorno virtual
python --version
backend\venv\Scripts\Activate.ps1
python backend/core/alfred_backend.py
```

### Ollama no responde

```bash
# Verificar servicio
ollama list

# Reiniciar Ollama
# Windows: Cerrar desde bandeja del sistema y ejecutar
ollama serve

# Linux/macOS
systemctl --user restart ollama
# o
ollama serve
```

### GPU no detectada

```bash
# Ejecutar diagnóstico
python backend/gpu/gpu_check.py

# Ver información
cat backend/gpu/gpu_info.json
```

### Problemas con rutas largas (Windows)

Si ves errores de "ruta demasiado larga":

```powershell
# Habilitar rutas largas en Windows
New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name "LongPathsEnabled" -Value 1 -PropertyType DWORD -Force
```

### Puerto 8000 ya en uso

Edita `.env`:
```env
ALFRED_PORT=8001
```

---

## Scripts Disponibles

### Scripts de PowerShell (Windows)

```powershell
.\stP.ps1                      # Arranque completo
.\stP.ps1 -SkipChecks          # Saltar verificación de modelos/GPU
.\stP.ps1 -Verbose             # Modo detallado
```

### Scripts de Bash (Linux/macOS)

```bash
./stP.sh                       # Arranque completo
```

### Scripts NPM

```bash
npm start                      # Iniciar Electron
npm run dev                    # Iniciar con DevTools
```

---

## Uso de la VM de Windows

Si estás ejecutando Alfred en una VM de Windows:

### Configuración Recomendada

1. **Asignar suficiente RAM**: Mínimo 8GB, recomendado 16GB
2. **Habilitar GPU Passthrough** (si es posible):
   - Hyper-V: RemoteFX vGPU
   - VMware: Gráficos 3D acelerados
   - VirtualBox: Aceleración 3D

3. **Networking**: Bridge o NAT con port forwarding del puerto 8000

### Sin GPU en VM

Si la VM no tiene acceso a GPU, edita `.env`:

```env
ALFRED_FORCE_CPU=true
```

El rendimiento será más lento pero funcional.

---

## Verificación de Instalación

Para verificar que todo esté correctamente instalado:

```bash
# 1. Verificar Python
python --version

# 2. Verificar Node.js
node --version

# 3. Verificar Ollama
ollama version
ollama list

# 4. Verificar GPU
python backend/gpu/gpu_check.py

# 5. Verificar backend
curl http://127.0.0.1:8000/health
```

---

## Próximos Pasos

1. **Configura tus documentos**: Edita `ALFRED_DOCS_PATH` en `.env`
2. **Ejecuta Alfred**: `.\stP.ps1` o `./stP.sh`
3. **Haz tu primera pregunta**: Abre la aplicación y comienza a interactuar

---

## Soporte

Para más información, consulta:
- [Documentación completa](./README.md)
- [Guía de GPU](./backend/gpu/GPU_SETUP.md)
- [API Backend](./backend/docs/README.md)
- [Solución de problemas](./TROUBLESHOOTING.md)

---

**¡Disfruta de tu asistente personal privado!** 🚀
