# 🤖 Alfred - Asistente Personal Inteligente

**Alfred** es un asistente personal 100% local y privado con capacidades de Recuperación Aumentada de Generación (RAG). Toda la inteligencia artificial se ejecuta en tu dispositivo - sin enviar datos a la nube.

![Version](https://img.shields.io/badge/version-2.0.0-blue)
![Electron](https://img.shields.io/badge/Electron-v38.2.2-blue)
![Python](https://img.shields.io/badge/Python-3.8+-green)
![Node.js](https://img.shields.io/badge/Node.js-22.20.0+-green)
![License](https://img.shields.io/badge/License-MIT-yellow)

---

## 🌟 Características Principales

### 🔒 **100% Local y Privado**
- ✅ Todos los datos permanecen en tu dispositivo
- ✅ Sin envío de información a servidores externos
- ✅ Encriptación AES-256-GCM para datos sensibles
- ✅ Control total sobre tus documentos personales

### 🧠 **Inteligencia Artificial Avanzada**
- ✅ RAG (Retrieval-Augmented Generation) con ChromaDB
- ✅ Modelos LLM locales vía Ollama (gemma2:9b)
- ✅ Embeddings semánticos (nomic-embed-text:v1.5)
- ✅ Búsqueda inteligente en tus documentos
- ✅ Historial con búsqueda optimizada

### 🎨 **Interfaz Moderna y Elegante**
- ✅ Aplicación de escritorio con Electron
- ✅ Chat en tiempo real con efecto de escritura
- ✅ Renderizado de Markdown con tablas
- ✅ Temas visuales personalizables
- ✅ Notificaciones visuales inteligentes

### 🚀 **Instalacion Automatica Completa**
- ✅ Deteccion y instalacion automatica de Python 3.10+
- ✅ Descarga e instalacion de Ollama en primer arranque
- ✅ Descarga automatica de modelos de IA (gemma2:9b + embeddings)
- ✅ Configuracion de entorno virtual Python
- ✅ Instalacion de dependencias desde requirements.txt
- ✅ Funciona en VM limpia sin configuracion previa
- ✅ Notificaciones de progreso en tiempo real

### 🎮 **Aceleración por GPU**
- ✅ Soporte NVIDIA CUDA
- ✅ Soporte AMD ROCm
- ✅ Soporte Apple Silicon (MPS)
- ✅ Fallback automático a CPU
- ✅ Detección y configuración automática

### 🖥️ **Multiplataforma**
- ✅ Windows 10/11
- ✅ Linux (Ubuntu, Debian, Fedora, Arch)
- ✅ macOS (Intel y Apple Silicon)
- ✅ Compatible con máquinas virtuales
- ✅ Compatible con WSL2

---

## � Requisitos del Sistema

### Software Obligatorio

| Software | Versión Mínima | Descargar |
|----------|----------------|-----------|
| **Python** | 3.8+ | [python.org](https://www.python.org/downloads/) |
| **Node.js** | 22.20.0+ | [nodejs.org](https://nodejs.org/) |
| **Ollama** | Última | [ollama.ai](https://ollama.ai/) |

### Hardware Recomendado

| Componente | Mínimo | Recomendado |
|------------|--------|-------------|
| **RAM** | 8 GB | 16 GB+ |
| **CPU** | 4 núcleos | 8 núcleos+ |
| **Almacenamiento** | 50 GB libres | 100 GB+ SSD |
| **GPU** | Ninguna (usa CPU) | NVIDIA/AMD/Apple Silicon |

### Modelos de IA Requeridos

```bash
ollama pull gemma2:9b
ollama pull nomic-embed-text:v1.5
```

---

## 🚀 Instalación Rápida (5 Minutos)

### Método 1: Script Universal (Recomendado) ⭐

El script `stP` (start Project) hace **todo automáticamente**:

#### Windows

```powershell
# Clonar repositorio
git clone https://github.com/Adalk033/AlfredElectron.git
cd AlfredElectron

# Ejecutar instalador universal
.\stP.ps1
```

#### Linux/macOS

```bash
# Clonar repositorio
git clone https://github.com/Adalk033/AlfredElectron.git
cd AlfredElectron

# Dar permisos y ejecutar
chmod +x stP.sh
./stP.sh
```

**El script automáticamente:**
1. ✅ Verifica Python, Node.js y Ollama
2. ✅ Crea entorno virtual de Python
3. ✅ Instala todas las dependencias (Python + Node.js)
4. ✅ Descarga modelos de IA si faltan
5. ✅ Detecta tu GPU (NVIDIA/AMD/Apple Silicon)
6. ✅ Configura archivo `.env` interactivamente
7. ✅ Inicia el backend y frontend

**¡Listo para usar en 5-10 minutos!** ☕

### Método 2: Instalación Manual

<details>
<summary>Click para ver pasos detallados</summary>

#### 1. Instalar Software Base

```bash
# Verificar Python
python --version  # Debe ser 3.8+

# Verificar Node.js
node --version    # Debe ser 22.20.0+

# Verificar Ollama
ollama version
```

#### 2. Clonar y Configurar

```bash
git clone https://github.com/Adalk033/AlfredElectron.git
cd AlfredElectron

# Copiar plantilla de configuración
cp .env.template .env
```

#### 3. Editar `.env`

```env
ALFRED_HOST=127.0.0.1
ALFRED_PORT=8000
ALFRED_DOCS_PATH=/ruta/a/tus/documentos  # ⬅️ REQUERIDO
```

#### 4. Crear Entorno Virtual Python

```bash
cd backend
python -m venv venv

# Activar entorno virtual
# Windows:
.\venv\Scripts\Activate.ps1
# Linux/macOS:
source venv/bin/activate

# Instalar dependencias
pip install -r requirements.txt
```

#### 5. Descargar Modelos de IA

```bash
ollama pull gemma2:9b
ollama pull nomic-embed-text:v1.5
```

#### 6. Instalar Dependencias Node.js

```bash
cd ..
npm install
```

#### 7. Iniciar Alfred

```bash
npm start
```

</details>

---

## 📖 Documentación Completa

### 📘 Guías de Inicio

| Documento | Descripción | Para Quién |
|-----------|-------------|------------|
| **[QUICKSTART_V2.md](./QUICKSTART_V2.md)** | Guía de inicio rápido | Todos los usuarios |
| **[CHECKLIST_INSTALACION.md](./CHECKLIST_INSTALACION.md)** | Lista de verificación completa | Solución de problemas |
| **[GUIA_VM_WINDOWS.md](./GUIA_VM_WINDOWS.md)** | Instalación en máquinas virtuales | Usuarios de VMs |
| **[INDICE_DOCUMENTACION.md](./INDICE_DOCUMENTACION.md)** | Índice maestro de docs | Referencia rápida |

### 🔧 Documentación Técnica

| Documento | Descripción |
|-----------|-------------|
| **[ESTRUCTURA_ESTANDARIZADA.md](./ESTRUCTURA_ESTANDARIZADA.md)** | Estructura del proyecto |
| **[RESUMEN_CAMBIOS.md](./RESUMEN_CAMBIOS.md)** | Changelog v2.0 |
| **[backend/docs/README.md](./backend/docs/README.md)** | API Backend |
| **[backend/gpu/GPU_SETUP.md](./backend/gpu/GPU_SETUP.md)** | Configuración GPU |

---

## 🎨 Interfaz de Usuario

### Pantalla Principal

```
┌─────────────────────────────────────────────────────────────────┐
│ 🤖 Alfred              🟢 Conectado      🔄 ⚙️ 📊 📁 👤        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                          🤖                                     │
│                   ¡Hola! Soy Alfred                             │
│              Tu asistente personal inteligente                  │
│                                                                 │
│         Pregúntame sobre tus documentos personales              │
│              o cualquier cosa que necesites                     │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  👤  ¿Cuál es mi RFC y CURP?                                    │
│                                                                 │
│  🤖  Según tus documentos:                                      │
│      • RFC: XXXX999999XXX                                       │
│      • CURP: XXXX999999XXXXXXXX                                 │
│                                                                 │
│      📚 Fuentes consultadas:                                    │
│      • identificacion_oficial.pdf                               │
│      • datos_personales.pdf                                     │
│                                                                 │
│      ⏱️ Hace 2 minutos                                          │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  📝 [Escribe tu mensaje aquí...]                          [▶]  │
└─────────────────────────────────────────────────────────────────┘
```

### Características de la Interfaz

#### 💬 **Chat Inteligente**
- Efecto de escritura letra por letra
- Renderizado Markdown completo
- Soporte para tablas con estilos profesionales
- Resaltado de sintaxis para código
- Emojis y formato enriquecido

#### 📊 **Información Contextual**
- Badge "Del historial" cuando usa respuestas cacheadas
- Contador de fragmentos de documentos analizados
- Lista de archivos fuente utilizados
- Extracción de datos personales (RFC, CURP, NSS)
- Timestamps automáticos

#### 🎯 **Panel de Navegación**
- **🕐 Historial**: Últimas 50 conversaciones guardadas
- **📊 Estadísticas**: Métricas del sistema en tiempo real
- **📁 Documentos**: Explorador de documentos indexados
- **⚙️ Configuración**: Preferencias y ajustes
- **👤 Perfil**: Información del usuario

#### 🔔 **Sistema de Notificaciones**
- Notificaciones visuales no intrusivas
- Estados: Éxito, Error, Advertencia, Info
- Auto-desaparecen después de 5 segundos
- Animaciones suaves

---

## 🏗️ Arquitectura del Proyecto

```
AlfredElectron/                          # Raíz del proyecto
│
├── 🔧 Configuración
│   ├── .env                             # Tu configuración local
│   ├── .env.template                    # Plantilla de configuración
│   ├── package.json                     # Dependencias Node.js
│   └── .gitignore                       # Archivos ignorados
│
├── 🚀 Scripts de Arranque
│   ├── stP.ps1                          # Script universal Windows
│   ├── stP.sh                           # Script universal Linux/macOS
│   └── start.ps1                        # Script legacy
│
├── 🎨 Frontend (Electron)
│   ├── main.js                          # Proceso principal Electron
│   ├── preload.js                       # Script de precarga
│   │
│   └── renderer/                        # Interfaz de usuario
│       ├── index.html                   # HTML principal
│       ├── renderer.js                  # Lógica del renderer
│       ├── api/                         # Cliente API
│       ├── core/                        # Lógica de negocio
│       ├── dom/                         # Manipulación DOM
│       ├── state/                       # Gestión de estado
│       └── styles/                      # Estilos CSS
│
├── 🐍 Backend (Python + FastAPI)
│   └── backend/
│       ├── venv/                        # Entorno virtual
│       ├── requirements.txt             # Dependencias Python
│       │
│       ├── core/                        # Núcleo del backend
│       │   ├── alfred_backend.py        # API FastAPI (puerto 8000)
│       │   ├── alfred_core.py           # Lógica RAG
│       │   ├── config.py                # Configuración y prompts
│       │   ├── db_manager.py            # Base de datos SQLite
│       │   ├── conversation_manager.py  # Gestión de conversaciones
│       │   └── functionsToHistory.py    # Historial Q&A
│       │
│       ├── gpu/                         # Gestión de GPU
│       │   ├── gpu_manager.py           # Manager principal
│       │   ├── gpu_check.py             # Detección automática
│       │   └── GPU_SETUP.md             # Documentación
│       │
│       └── utils/                       # Utilidades
│           ├── logger.py                # Sistema de logs
│           ├── security.py              # Encriptación
│           └── paths.py                 # Gestión de rutas
│
├── 💾 Datos
│   ├── chroma_db/                       # Base de datos vectorial
│   └── %AppData%\Alfred\                # Datos de usuario
│       ├── db/                          # SQLite database
│       ├── data/                        # Archivos de datos
│       └── logs/                        # Archivos de log
│
└── 📚 Documentación
    ├── README.md                        # Este archivo
    ├── QUICKSTART_V2.md                 # Guía rápida
    ├── ESTRUCTURA_ESTANDARIZADA.md      # Estructura del proyecto
    └── INDICE_DOCUMENTACION.md          # Índice maestro
```

---

## ⚙️ Configuración

### Archivo `.env`

Todas las configuraciones se gestionan desde `.env`:

```env
# === Servidor ===
ALFRED_HOST=127.0.0.1                    # Host del servidor (no cambiar)
ALFRED_PORT=8000                         # Puerto del backend

# === Documentos ===
ALFRED_DOCS_PATH=/ruta/a/documentos      # ⬅️ REQUERIDO: Tu carpeta de docs

# === Modelos de IA ===
ALFRED_MODEL=gemma2:9b                   # Modelo LLM principal
ALFRED_EMBEDDING_MODEL=nomic-embed-text:v1.5  # Modelo de embeddings

# === GPU ===
ALFRED_FORCE_CPU=false                   # true = forzar CPU, false = usar GPU
ALFRED_DEVICE=auto                       # auto/cpu/cuda/mps

# === Rendimiento ===
ALFRED_CHUNK_SIZE=1000                   # Tamaño de chunks de documento
ALFRED_CHUNK_OVERLAP=200                 # Superposición entre chunks
ALFRED_TOP_K=5                           # Documentos a recuperar por consulta

# === Base de Datos ===
ALFRED_FORCE_RELOAD=false                # true = recargar docs en próximo inicio

# === Logs ===
ALFRED_LOG_LEVEL=INFO                    # DEBUG/INFO/WARNING/ERROR
ALFRED_LOG_DIR=                          # Directorio de logs (opcional)
```

### Configuración de GPU

Alfred detecta automáticamente tu hardware:

| GPU | Detección Automática | Configuración Manual |
|-----|---------------------|---------------------|
| **NVIDIA CUDA** | ✅ Automática | `ALFRED_DEVICE=cuda` |
| **AMD ROCm** | ✅ Automática | `ALFRED_DEVICE=cuda` |
| **Apple Silicon** | ✅ Automática | `ALFRED_DEVICE=mps` |
| **CPU Fallback** | ✅ Automática | `ALFRED_FORCE_CPU=true` |

**Verificar GPU detectada:**
```bash
python backend/gpu/gpu_check.py
cat backend/gpu/gpu_info.json
```

---

## 💻 Uso de la Aplicación

### Enviar Mensajes

```
1. Escribe tu pregunta en el campo de texto
2. Presiona Enter o haz clic en el botón ▶
3. Alfred procesará tu consulta y responderá
```

**Atajos de teclado:**
- `Enter` - Enviar mensaje
- `Shift + Enter` - Nueva línea en el mensaje
- `Ctrl + R` - Recargar aplicación
- `Ctrl + Shift + I` - Abrir DevTools (desarrollo)
- `F12` - Abrir DevTools (desarrollo)

### Funciones Principales

#### 🕐 **Ver Historial**
1. Clic en icono 🕐 en barra superior
2. Panel lateral muestra últimas 50 conversaciones
3. Clic en cualquier conversación para verla
4. Búsqueda rápida por palabras clave

#### 📊 **Ver Estadísticas**
1. Clic en icono 📊 en barra superior
2. Información del sistema:
   - Usuario actual
   - Documentos indexados
   - Consultas guardadas
   - Modelo de IA utilizado
   - Rutas de configuración
   - Estado de GPU

#### 📁 **Explorar Documentos**
1. Clic en icono 📁 en barra superior
2. Lista de documentos indexados
3. Filtrar por tipo de archivo
4. Ver metadatos de documentos

#### ⚙️ **Configuración**
1. Clic en icono ⚙️ en barra superior
2. Ajustar opciones:
   - URL del servidor
   - Puerto del backend
   - Guardado automático
   - Historial de búsquedas
   - Tema visual (próximamente)

#### 🔄 **Reiniciar Backend**
1. Clic en icono 🔄 en barra superior
2. Backend se reinicia automáticamente
3. Notificaciones muestran progreso

**Útil cuando:**
- Backend deja de responder
- Has actualizado código del backend
- Cambios en `.env` requieren reinicio

### Renderizado de Contenido

#### Markdown
Alfred soporta Markdown completo:

```markdown
# Encabezados
## Nivel 2
### Nivel 3

**Negrita** y *cursiva*

- Listas
- Con viñetas

1. Listas
2. Numeradas

[Enlaces](https://example.com)

`código inline`

```python
# Bloques de código
def hola():
    print("Hola Alfred!")
```
```

#### Tablas

Alfred renderiza tablas profesionales:

```markdown
| Producto | Precio | Stock |
|----------|--------|-------|
| Laptop   | $999   | 15    |
| Mouse    | $25    | 50    |
| Teclado  | $75    | 30    |
```

**Características:**
- ✅ Headers con gradiente
- ✅ Hover effects
- ✅ Auto-alineación de números
- ✅ Bordes profesionales

---
│                                                                 │
│      ⏱️ Hace 2 minutos                                          │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  📝 [Escribe tu mensaje aquí...]                          [▶]  │
└─────────────────────────────────────────────────────────────────┘
```

### Características de la Interfaz

#### 💬 **Chat Inteligente**
- Efecto de escritura letra por letra
- Renderizado Markdown completo
- Soporte para tablas con estilos profesionales
- Resaltado de sintaxis para código
- Emojis y formato enriquecido

#### 📊 **Información Contextual**
- Badge "Del historial" cuando usa respuestas cacheadas
- Contador de fragmentos de documentos analizados
- Lista de archivos fuente utilizados
- Extracción de datos personales (RFC, CURP, NSS)
- Timestamps automáticos

#### 🎯 **Panel de Navegación**
- **🕐 Historial**: Últimas 50 conversaciones guardadas
- **📊 Estadísticas**: Métricas del sistema en tiempo real
- **📁 Documentos**: Explorador de documentos indexados
- **⚙️ Configuración**: Preferencias y ajustes
- **👤 Perfil**: Información del usuario

#### 🔔 **Sistema de Notificaciones**
- Notificaciones visuales no intrusivas
- Estados: Éxito, Error, Advertencia, Info
- Auto-desaparecen después de 5 segundos
- Animaciones suaves

---

## 🏗️ Arquitectura del Proyecto

```
AlfredElectron/                          # Raíz del proyecto
│
├── 🔧 Configuración
│   ├── .env                             # Tu configuración local
│   ├── .env.template                    # Plantilla de configuración
│   ├── package.json                     # Dependencias Node.js
│   └── .gitignore                       # Archivos ignorados
│
├── � Scripts de Arranque
│   ├── stP.ps1                          # Script universal Windows
│   ├── stP.sh                           # Script universal Linux/macOS
│   └── start.ps1                        # Script legacy
│
├── 🎨 Frontend (Electron)
│   ├── main.js                          # Proceso principal Electron
│   ├── preload.js                       # Script de precarga
│   │
│   └── renderer/                        # Interfaz de usuario
│       ├── index.html                   # HTML principal
│       ├── renderer.js                  # Lógica del renderer
│       ├── api/                         # Cliente API
│       ├── core/                        # Lógica de negocio
│       ├── dom/                         # Manipulación DOM
│       ├── state/                       # Gestión de estado
│       └── styles/                      # Estilos CSS
│
├── 🐍 Backend (Python + FastAPI)
│   └── backend/
│       ├── venv/                        # Entorno virtual
│       ├── requirements.txt             # Dependencias Python
│       │
│       ├── core/                        # Núcleo del backend
│       │   ├── alfred_backend.py        # API FastAPI (puerto 8000)
│       │   ├── alfred_core.py           # Lógica RAG
│       │   ├── config.py                # Configuración y prompts
│       │   ├── db_manager.py            # Base de datos SQLite
│       │   ├── conversation_manager.py  # Gestión de conversaciones
│       │   └── functionsToHistory.py    # Historial Q&A
│       │
│       ├── gpu/                         # Gestión de GPU
│       │   ├── gpu_manager.py           # Manager principal
│       │   ├── gpu_check.py             # Detección automática
│       │   └── GPU_SETUP.md             # Documentación
│       │
│       └── utils/                       # Utilidades
│           ├── logger.py                # Sistema de logs
│           ├── security.py              # Encriptación
│           └── paths.py                 # Gestión de rutas
│
├── 💾 Datos
│   ├── chroma_db/                       # Base de datos vectorial
│   └── %AppData%\Alfred\                # Datos de usuario
│       ├── db/                          # SQLite database
│       ├── data/                        # Archivos de datos
│       └── logs/                        # Archivos de log
│
└── 📚 Documentación
    ├── README.md                        # Este archivo
    ├── QUICKSTART_V2.md                 # Guía rápida
    ├── ESTRUCTURA_ESTANDARIZADA.md      # Estructura del proyecto
    └── INDICE_DOCUMENTACION.md          # Índice maestro
```

---

## ⚙️ Configuración

### Archivo `.env`

Todas las configuraciones se gestionan desde `.env`:

```env
# === Servidor ===
ALFRED_HOST=127.0.0.1                    # Host del servidor (no cambiar)
ALFRED_PORT=8000                         # Puerto del backend

# === Documentos ===
ALFRED_DOCS_PATH=/ruta/a/documentos      # ⬅️ REQUERIDO: Tu carpeta de docs

# === Modelos de IA ===
ALFRED_MODEL=gemma2:9b                   # Modelo LLM principal
ALFRED_EMBEDDING_MODEL=nomic-embed-text:v1.5  # Modelo de embeddings

# === GPU ===
ALFRED_FORCE_CPU=false                   # true = forzar CPU, false = usar GPU
ALFRED_DEVICE=auto                       # auto/cpu/cuda/mps

# === Rendimiento ===
ALFRED_CHUNK_SIZE=1000                   # Tamaño de chunks de documento
ALFRED_CHUNK_OVERLAP=200                 # Superposición entre chunks
ALFRED_TOP_K=5                           # Documentos a recuperar por consulta

# === Base de Datos ===
ALFRED_FORCE_RELOAD=false                # true = recargar docs en próximo inicio

# === Logs ===
ALFRED_LOG_LEVEL=INFO                    # DEBUG/INFO/WARNING/ERROR
ALFRED_LOG_DIR=                          # Directorio de logs (opcional)
```

### Configuración de GPU

Alfred detecta automáticamente tu hardware:

| GPU | Detección Automática | Configuración Manual |
|-----|---------------------|---------------------|
| **NVIDIA CUDA** | ✅ Automática | `ALFRED_DEVICE=cuda` |
| **AMD ROCm** | ✅ Automática | `ALFRED_DEVICE=cuda` |
| **Apple Silicon** | ✅ Automática | `ALFRED_DEVICE=mps` |
| **CPU Fallback** | ✅ Automática | `ALFRED_FORCE_CPU=true` |

**Verificar GPU detectada:**
```bash
python backend/gpu/gpu_check.py
cat backend/gpu/gpu_info.json
```

---

## 🛠️ Desarrollo y Personalización

### Scripts Disponibles

```bash
# Iniciar aplicación
npm start

# Iniciar con DevTools
npm run dev

# Compilar para producción
npm run build              # Todas las plataformas
npm run build:win          # Solo Windows
npm run build:mac          # Solo macOS
npm run build:linux        # Solo Linux

# Limpiar instalación
npm run clean

# Tests
npm test
```

### Personalización de la Interfaz

#### Cambiar Colores del Tema

Edita `renderer/styles/utils/variables.css`:

```css
:root {
    /* Colores principales */
    --primary-color: #4a9eff;
    --secondary-color: #6c5ce7;
    
    /* Backgrounds */
    --bg-primary: #1e1e1e;
    --bg-secondary: #2d2d2d;
    --bg-tertiary: #3a3a3a;
    
    /* Texto */
    --text-primary: #ffffff;
    --text-secondary: #b0b0b0;
    
    /* Estados */
    --success-color: #2ecc71;
    --error-color: #e74c3c;
    --warning-color: #f39c12;
}
```

#### Modificar Velocidad de Escritura

Edita `renderer/renderer.js`:

```javascript
async function typeWriter(element, text, speed = 20) {
    // Cambiar 'speed' (ms por carácter)
    // 10 = muy rápido, 50 = lento
}
```

#### Cambiar Tamaño de Ventana

Edita `main.js`:

```javascript
mainWindow = new BrowserWindow({
    width: 1400,      // Ancho (default: 1200)
    height: 900,      // Alto (default: 800)
    minWidth: 1000,   // Ancho mínimo
    minHeight: 700    // Alto mínimo
});
```

---

## 🐛 Solución de Problemas

### Problemas Comunes

#### ❌ Backend no inicia

```powershell
# Verificar Python
python --version

# Verificar entorno virtual
cd backend
.\venv\Scripts\Activate.ps1  # Windows
source venv/bin/activate      # Linux/macOS

# Reinstalar dependencias
pip install -r requirements.txt
```

#### ❌ Ollama no responde

```powershell
# Verificar servicio
ollama version
ollama list

# Reiniciar Ollama
# Windows
ollama serve

# Linux/macOS
systemctl --user restart ollama
```

#### ❌ GPU no detectada

```powershell
# Ejecutar diagnóstico
python backend/gpu/gpu_check.py

# Ver información
cat backend/gpu/gpu_info.json

# Forzar CPU si es necesario
# En .env:
ALFRED_FORCE_CPU=true
```

#### ❌ Puerto 8000 ocupado

```powershell
# Windows - Encontrar proceso
netstat -ano | findstr :8000
taskkill /PID <PID> /F

# Linux/macOS - Encontrar proceso
lsof -i :8000
kill -9 <PID>

# O cambiar puerto en .env
ALFRED_PORT=8001
```

#### ❌ Node.js no está instalado

**Solución:**
1. Descarga Node.js LTS desde [nodejs.org](https://nodejs.org/)
2. Instala marcando "Add to PATH"
3. Reinicia terminal
4. Verifica con `node --version`

#### ❌ Dependencias no se instalan

```powershell
# Limpiar e reinstalar
rm -rf node_modules package-lock.json
npm cache clean --force
npm install

# Python
rm -rf backend/venv
python -m venv backend/venv
# Activar y reinstalar
pip install -r backend/requirements.txt
```

#### ❌ Aplicación no carga

```powershell
# Recargar con Ctrl+R
# O reiniciar completamente

# Ver logs
# Abrir DevTools (F12)
# Buscar errores en Console
```

### Ver Logs

```powershell
# Logs del backend
# Windows
Get-Content backend\logs\alfred.log -Tail 50

# Linux/macOS
tail -f backend/logs/alfred.log

# Logs de Electron
# Presionar F12 en la aplicación
# Ver pestaña Console
```

### Diagnóstico Completo

```powershell
# Ejecutar script de diagnóstico
.\diagnostico.ps1  # Windows

# O verificar manualmente
python --version
node --version
ollama version
python backend/gpu/gpu_check.py
curl http://127.0.0.1:8000/health
```

---

## 📦 Dependencias

### Backend (Python)

| Paquete | Versión | Uso |
|---------|---------|-----|
| **fastapi** | 0.115+ | API REST |
| **uvicorn** | Latest | Servidor ASGI |
| **langchain** | Latest | Framework LLM |
| **chromadb** | 1.1+ | Base de datos vectorial |
| **ollama-python** | Latest | Cliente Ollama |
| **torch** | 2.0+ | PyTorch para GPU |
| **cryptography** | Latest | Encriptación AES-256 |

### Frontend (Node.js)

| Paquete | Versión | Uso |
|---------|---------|-----|
| **electron** | 38.2.2+ | Framework desktop |
| **electron-builder** | Latest | Compilación de ejecutables |

---

## 🔐 Seguridad y Privacidad

Alfred está diseñado con seguridad y privacidad como prioridades:

### 🔒 **Seguridad Local**
- ✅ **100% local**: Sin envío de datos a servidores externos
- ✅ **Encriptación AES-256-GCM**: Datos sensibles encriptados
- ✅ **Context Isolation**: Electron con aislamiento de contexto
- ✅ **No Node Integration**: Sin acceso directo al sistema desde renderer
- ✅ **Host fijo**: `127.0.0.1` (solo acceso local)

### 🛡️ **Protección de Datos**
- ✅ **Datos personales encriptados**: RFC, CURP, NSS, etc.
- ✅ **Base de datos local**: SQLite con encriptación
- ✅ **Historial privado**: Guardado solo en tu dispositivo
- ✅ **Sin telemetría**: No se recopila información de uso

### 📁 **Gestión de Archivos**
- ✅ **Permisos de lectura**: Solo acceso a `ALFRED_DOCS_PATH`
- ✅ **Sin modificación**: Documentos nunca se modifican
- ✅ **Sandboxing**: Electron ejecuta en sandbox

---

## 🚀 Características Futuras

### En Desarrollo
- [ ] **Temas visuales**: Claro, oscuro y personalizado
- [ ] **Exportar conversaciones**: PDF, TXT, Markdown
- [ ] **Búsqueda avanzada**: Filtros y operadores
- [ ] **Adjuntar archivos**: Subir docs en tiempo real
- [ ] **Voice-to-text**: Comandos por voz

### Planeadas
- [ ] **Plugins**: Sistema de extensiones
- [ ] **Multi-idioma**: Inglés, Francés, etc.
- [ ] **Sincronización** (opcional): Entre dispositivos locales
- [ ] **Modo portátil**: USB ejecutable
- [ ] **API pública**: Para integraciones

---

## 🤝 Contribuir

¿Quieres mejorar Alfred? ¡Las contribuciones son bienvenidas!

### Cómo Contribuir

1. **Fork** el repositorio
2. **Crea** una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. **Commit** tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. **Push** a la rama (`git push origin feature/AmazingFeature`)
5. **Abre** un Pull Request

### Guías de Estilo

- **Python**: PEP 8, type hints, docstrings
- **JavaScript**: ES6+, JSDoc comments
- **CSS**: BEM methodology
- **Commits**: Conventional Commits

Ver [ESTRUCTURA_ESTANDARIZADA.md](./ESTRUCTURA_ESTANDARIZADA.md) para más detalles.

---

## � Licencia

Este proyecto está bajo la licencia MIT. Puedes usar, modificar y distribuir libremente.

Ver [backend/docs/LICENSE](./backend/docs/LICENSE) para más información.

---

## 📞 Soporte y Comunidad

### Obtener Ayuda

1. **Documentación**: Revisa el [Índice de Documentación](./INDICE_DOCUMENTACION.md)
2. **Troubleshooting**: Ver sección "Solución de Problemas" arriba
3. **Issues**: Abre un issue en GitHub
4. **Discussions**: Únete a las discusiones del repositorio

### Recursos Útiles

| Recurso | Enlace |
|---------|--------|
| **Documentación Ollama** | [ollama.ai](https://ollama.ai/) |
| **Documentación FastAPI** | [fastapi.tiangolo.com](https://fastapi.tiangolo.com/) |
| **Documentación Electron** | [electronjs.org](https://www.electronjs.org/) |
| **LangChain Docs** | [python.langchain.com](https://python.langchain.com/) |
| **ChromaDB Docs** | [trychroma.com](https://www.trychroma.com/) |

