# Alfred - Asistente Personal con IA Local# Alfred - Asistente Personal con IA Local# Alfred - Asistente Personal con IA Local



**Alfred** es un asistente de escritorio con inteligencia artificial que procesa tus documentos personales usando RAG (Retrieval-Augmented Generation). Toda la IA se ejecuta localmente en tu dispositivo - sin enviar datos a servicios externos.



![Version](https://img.shields.io/badge/version-0.0.1-blue)**Alfred** es un asistente de escritorio con inteligencia artificial que procesa tus documentos personales usando RAG (Retrieval-Augmented Generation). Toda la IA se ejecuta localmente en tu dispositivo - sin enviar datos a servicios externos.**Alfred** es un asistente de escritorio con inteligencia artificial que procesa tus documentos personales usando RAG (Retrieval-Augmented Generation). Toda la IA se ejecuta localmente en tu dispositivo - sin enviar datos a servicios externos.

![Electron](https://img.shields.io/badge/Electron-38.2.2-blue)

![Python](https://img.shields.io/badge/Python-3.12+-green)

![Node.js](https://img.shields.io/badge/Node.js-22.20.0+-green)

![License](https://img.shields.io/badge/License-MIT-yellow)![Version](https://img.shields.io/badge/version-0.0.1-blue)![Version](https://img.shields.io/badge/version-0.0.1-blue)



## Características![Electron](https://img.shields.io/badge/Electron-38.2.2-blue)![Electron](https://img.shields.io/badge/Electron-38.2.2-blue)



### Inteligencia Artificial Local![Python](https://img.shields.io/badge/Python-3.12+-green)![Python](https://img.shields.io/badge/Python-3.12+-green)

- **RAG (Retrieval-Augmented Generation)** con ChromaDB para búsqueda vectorial

- **LLM Local**: Ollama con `gemma3n:e4b` para generación de respuestas![Node.js](https://img.shields.io/badge/Node.js-22.20.0+-green)![Node.js](https://img.shields.io/badge/Node.js-22.20.0+-green)

- **Embeddings**: `nomic-embed-text:v1.5` para búsqueda semántica

- **Historial inteligente** con búsqueda por similitud y cache de respuestas![License](https://img.shields.io/badge/License-MIT-yellow)![License](https://img.shields.io/badge/License-MIT-yellow)

- **Aceleración GPU**: Soporte automático para NVIDIA CUDA, AMD ROCm y Apple Silicon MPS



### Privacidad y Seguridad

- **100% local**: Sin conexiones a APIs externas ni envío de datos## Características## Características

- **Encriptación AES-256-GCM** para datos sensibles en base de datos SQLite

- **Gestión segura** de claves y datos personales



### Interfaz de Usuario### Inteligencia Artificial Local### Inteligencia Artificial Local

- **Electron Desktop App** con interfaz moderna y responsive

- **Chat con typewriter effect** y renderizado completo de Markdown- **RAG (Retrieval-Augmented Generation)** con ChromaDB para búsqueda vectorial- **RAG (Retrieval-Augmented Generation)** con ChromaDB para búsqueda vectorial

- **Soporte para tablas** con estilos profesionales y formato automático

- **Sistema de notificaciones** visuales y estado en tiempo real- **LLM Local**: Ollama con `gemma3n:e4b` para generación de respuestas- **LLM Local**: Ollama con `gemma3n:e4b` para generación de respuestas

- **Gestión de conversaciones** con historial persistente

- **Embeddings**: `nomic-embed-text:v1.5` para búsqueda semántica- **Embeddings**: `nomic-embed-text:v1.5` para búsqueda semántica

### Arquitectura

- **Backend FastAPI** (Python) con API REST documentada- **Historial inteligente** con búsqueda por similitud y cache de respuestas- **Historial inteligente** con búsqueda por similitud y cache de respuestas

- **Frontend Electron** con gestión automática del ciclo de vida del backend

- **Modo desarrollo**: Usa Python del sistema con venv- **Aceleración GPU**: Soporte automático para NVIDIA CUDA, AMD ROCm y Apple Silicon MPS- **Aceleración GPU**: Soporte automático para NVIDIA CUDA, AMD ROCm y Apple Silicon MPS

- **Modo producción**: Python portable embebido en la aplicación empaquetada

- **Almacenamiento inteligente**: ChromaDB en AppData para evitar problemas de permisos



## Requisitos### Privacidad y Seguridad### Privacidad y Seguridad



### Software- **100% local**: Sin conexiones a APIs externas ni envío de datos- **100% local**: Sin conexiones a APIs externas ni envío de datos

- **Python**: 3.12+ (recomendado) o 3.8+

- **Node.js**: 22.20.0+ con npm/yarn- **Encriptación AES-256-GCM** para datos sensibles en base de datos SQLite- **Encriptación AES-256-GCM** para datos sensibles en base de datos SQLite

- **Ollama**: Para ejecutar modelos LLM localmente ([ollama.ai](https://ollama.ai))

- **Gestión segura** de claves y datos personales- **Gestión segura** de claves y datos personales

### Hardware

- **RAM**: 8 GB mínimo (16 GB recomendado para modelos grandes)

- **Almacenamiento**: 20 GB libres (modelos + documentos + ChromaDB)

- **GPU** (opcional): NVIDIA/AMD/Apple Silicon para aceleración### Interfaz de Usuario### Interfaz de Usuario



### Modelos Ollama- **Electron Desktop App** con interfaz moderna y responsive- **Electron Desktop App** con interfaz moderna y responsive

```bash

ollama pull gemma3n:e4b- **Chat con typewriter effect** y renderizado completo de Markdown- **Chat con typewriter effect** y renderizado completo de Markdown

ollama pull nomic-embed-text:v1.5

```- **Soporte para tablas** con estilos profesionales y formato automático- **Soporte para tablas** con estilos profesionales y formato automático



## Inicio Rápido- **Sistema de notificaciones** visuales y estado en tiempo real- **Sistema de notificaciones** visuales y estado en tiempo real



### 1. Clonar e Instalar Dependencias- **Gestión de conversaciones** con historial persistente- **Gestión de conversaciones** con historial persistente



```bash

# Clonar repositorio

git clone https://github.com/Adalk033/AlfredElectron.git### Arquitectura### Arquitectura

cd AlfredElectron

- **Backend FastAPI** (Python) con API REST documentada- **Backend FastAPI** (Python) con API REST documentada

# Instalar dependencias de Electron

npm install- **Frontend Electron** con gestión automática del ciclo de vida del backend- **Frontend Electron** con gestión automática del ciclo de vida del backend



# Configurar backend Python- **Modo desarrollo**: Usa Python del sistema con venv- **Modo desarrollo**: Usa Python del sistema con venv

cd backend

python -m venv venv- **Modo producción**: Python portable embebido en la aplicación empaquetada- **Modo producción**: Python portable embebido en la aplicación empaquetada



# Activar entorno virtual- **Almacenamiento inteligente**: ChromaDB en AppData para evitar problemas de permisos- **Almacenamiento inteligente**: ChromaDB en AppData para evitar problemas de permisos

# Windows PowerShell:

.\venv\Scripts\Activate.ps1

# Linux/macOS:

source venv/bin/activate## Requisitos## Requisitos



# Instalar dependencias Python

pip install -r requirements.txt

```### Software### Software



### 2. Descargar Modelos Ollama- **Python**: 3.12+ (recomendado) o 3.8+- **Python**: 3.12+ (recomendado) o 3.8+



```bash- **Node.js**: 22.20.0+ con npm/yarn- **Node.js**: 22.20.0+ con npm/yarn

ollama pull gemma3n:e4b

ollama pull nomic-embed-text:v1.5- **Ollama**: Para ejecutar modelos LLM localmente ([ollama.ai](https://ollama.ai))- **Ollama**: Para ejecutar modelos LLM localmente ([ollama.ai](https://ollama.ai))

```



### 3. Configurar Variables de Entorno (Opcional)

### Hardware### Hardware

El backend funciona sin configuración gracias a valores por defecto. Para personalizar:

- **RAM**: 8 GB mínimo (16 GB recomendado para modelos grandes)- **RAM**: 8 GB mínimo (16 GB recomendado para modelos grandes)

```bash

# En el directorio backend/- **Almacenamiento**: 20 GB libres (modelos + documentos + ChromaDB)- **Almacenamiento**: 20 GB libres (modelos + documentos + ChromaDB)

cp .env.example .env

# Editar .env si necesitas cambiar rutas o modelos- **GPU** (opcional): NVIDIA/AMD/Apple Silicon para aceleración- **GPU** (opcional): NVIDIA/AMD/Apple Silicon para aceleración

```



### 4. Ejecutar la Aplicación

### Modelos Ollama### Modelos Ollama

```bash

# Desde la raíz del proyecto```bash```bash

npm start

```ollama pull gemma3n:e4bollama pull gemma3n:e4b



La aplicación iniciará automáticamente el backend Python y abrirá la ventana de Electron.ollama pull nomic-embed-text:v1.5ollama pull nomic-embed-text:v1.5



### Modo Desarrollo``````



```bash

# Ejecutar con DevTools abierto

npm run dev## Inicio Rápido## Inicio Rápido



# Ejecutar solo el backend (para testing)

cd backend

python core/alfred_backend.py### 1. Clonar e Instalar Dependencias### 1. Clonar e Instalar Dependencias

# API disponible en http://127.0.0.1:8000/docs

```



## Tecnologías```bash```bash



### Backend# Clonar repositorio# Clonar repositorio

- **FastAPI**: Framework Python para API REST con documentación automática

- **LangChain**: Orquestación de LLMs y cadenas RAGgit clone https://github.com/Adalk033/AlfredElectron.gitgit clone https://github.com/Adalk033/AlfredElectron.git

- **ChromaDB**: Base de datos vectorial para embeddings

- **Ollama**: Servidor de LLMs locales con soporte GPUcd AlfredElectroncd AlfredElectron

- **SQLite + Cryptography**: Persistencia con encriptación AES-256-GCM

- **Python-dotenv**: Gestión de configuración



### Frontend# Instalar dependencias de Electron# Instalar dependencias de Electron

- **Electron 38.2.2**: Framework multiplataforma para apps de escritorio

- **Vanilla JavaScript**: Sin dependencias de frameworks pesadosnpm installnpm install

- **CSS Modular**: Arquitectura escalable por componentes



### DevOps & Tooling

- **electron-builder 26.0.12**: Empaquetado y distribución (NSIS, DMG, AppImage)# Configurar backend Python# Configurar backend Python

- **Python venv**: Aislamiento de dependencias en desarrollo

- **python-portable**: Python embebido para distribucióncd backendcd backend



## Estructura del Proyectopython -m venv venvpython -m venv venv



```

AlfredElectron/

├── main.js                    # Proceso principal Electron# Activar entorno virtual# Activar entorno virtual

├── preload.js                 # Preload script (IPC bridge)

├── package.json               # Dependencias Node.js y build config# Windows PowerShell:# Windows PowerShell:

│

├── backend/                   # Backend FastAPI (Python).\venv\Scripts\Activate.ps1.\venv\Scripts\Activate.ps1

│   ├── core/                  # Módulos principales

│   │   ├── alfred_backend.py  # API REST FastAPI# Linux/macOS:# Linux/macOS:

│   │   ├── alfred_core.py     # Lógica RAG principal

│   │   ├── vector_manager.py  # ChromaDB + embeddingssource venv/bin/activatesource venv/bin/activate

│   │   ├── document_loader.py # Carga de documentos

│   │   └── ...

│   ├── utils/                 # Utilidades

│   │   ├── paths.py          # Gestión de rutas con expandvars# Instalar dependencias Python# Instalar dependencias Python

│   │   ├── security.py       # Encriptación AES-256-GCM

│   │   └── logger.py         # Sistema de logspip install -r requirements.txtpip install -r requirements.txt

│   ├── gpu/                   # GPU management

│   │   └── gpu_manager.py    # Auto-detección NVIDIA/AMD/Apple``````

│   ├── python-portable/       # Python embebido (solo producción)

│   ├── venv/                  # Virtual env (solo desarrollo)

│   ├── .env                   # Configuración local (gitignored)

│   ├── .env.example           # Plantilla de configuración### 2. Descargar Modelos Ollama### 2. Descargar Modelos Ollama

│   └── requirements.txt       # Dependencias Python

│

├── renderer/                  # Frontend Electron

│   ├── index.html            # UI principal```bash```bash

│   ├── renderer.js           # Lógica principal de UI

│   ├── api/ollama pull gemma3n:e4bollama pull gemma3n:e4b

│   │   └── api.js           # Cliente API REST

│   ├── core/ollama pull nomic-embed-text:v1.5ollama pull nomic-embed-text:v1.5

│   │   ├── conversations.js  # Gestión de conversaciones

│   │   ├── dialogs.js       # Modales y diálogos``````

│   │   └── utils.js         # Utilidades generales

│   ├── dom/

│   │   ├── dom-utils.js     # Markdown parser con tablas

│   │   └── events.js        # Event handlers### 3. Configurar Variables de Entorno (Opcional)### 3. Configurar Variables de Entorno (Opcional)

│   └── styles/              # CSS modular

│

├── chroma_db/                 # ChromaDB (desarrollo, gitignored)

└── assets/                    # Iconos y recursosEl backend funciona sin configuración gracias a valores por defecto. Para personalizar:El backend funciona sin configuración gracias a valores por defecto. Para personalizar:



# Datos persistentes en producción:

# Windows: C:\Users\<User>\AppData\Roaming\Alfred\

# Linux: ~/.alfred/```bash```bash

# macOS: ~/Library/Application Support/Alfred/

```# En el directorio backend/# En el directorio backend/



## Build y Distribucióncp .env.example .envcp .env.example .env



### Empaquetar para Producción# Editar .env si necesitas cambiar rutas o modelos# Editar .env si necesitas cambiar rutas o modelos



```bash``````

# Windows (NSIS installer)

npm run build:win



# macOS (DMG)### 4. Ejecutar la Aplicación### 4. Ejecutar la Aplicación

npm run build:mac



# Linux (AppImage)

npm run build:linux```bash```bash

```

# Desde la raíz del proyecto# Desde la raíz del proyecto

Los instaladores se generan en `dist/`.

npm startnpm start

### Diferencias Desarrollo vs Producción

``````

| Aspecto | Desarrollo | Producción |

|---------|------------|------------|

| **Python** | Sistema + venv | python-portable embebido |

| **Backend** | Manual o npm start | Auto-spawn por Electron |La aplicación iniciará automáticamente el backend Python y abrirá la ventana de Electron.La aplicación iniciará automáticamente el backend Python y abrirá la ventana de Electron.

| **ChromaDB** | `./chroma_db` | `%AppData%\Alfred\data\chroma_store` |

| **Datos** | Rutas relativas | AppData (evita Program Files) |

| **Dependencias** | Instaladas en venv | Pre-instaladas en python-portable |

### Modo Desarrollo### Modo Desarrollo

## Configuración



### Variables de Entorno (Opcional)

```bash```bash

El backend funciona con valores por defecto. Para personalizar, crea `backend/.env`:

# Ejecutar con DevTools abierto# Ejecutar con DevTools abierto

```bash

# Backendnpm run devnpm run dev

cd backend

cp .env.example .env

```

# Ejecutar solo el backend (para testing)# Ejecutar solo el backend (para testing)

Principales configuraciones:

cd backendcd backend

```env

# Rutas de datos (se expanden automáticamente)python core/alfred_backend.pypython core/alfred_backend.py

ALFRED_DATA_PATH=%AppData%\Alfred\data         # Windows

ALFRED_DATA_PATH=$HOME/.alfred/data            # Linux/macOS# API disponible en http://127.0.0.1:8000/docs# API disponible en http://127.0.0.1:8000/docs



# Modelos``````

ALFRED_MODEL=gemma3n:e4b

ALFRED_EMBEDDING_MODEL=nomic-embed-text:v1.5



# Servidor## Tecnologías## Tecnologías

ALFRED_HOST=127.0.0.1

ALFRED_PORT=8000

```

### Backend### Backend

## Solución de Problemas

- **FastAPI**: Framework Python para API REST con documentación automática- **FastAPI**: Framework Python para API REST con documentación automática

### Backend no inicia

```bash- **LangChain**: Orquestación de LLMs y cadenas RAG- **LangChain**: Orquestación de LLMs y cadenas RAG

# Verificar Python y dependencias

python --version- **ChromaDB**: Base de datos vectorial para embeddings- **ChromaDB**: Base de datos vectorial para embeddings

cd backend

pip install -r requirements.txt- **Ollama**: Servidor de LLMs locales con soporte GPU- **Ollama**: Servidor de LLMs locales con soporte GPU

```

- **SQLite + Cryptography**: Persistencia con encriptación AES-256-GCM- **SQLite + Cryptography**: Persistencia con encriptación AES-256-GCM

### Ollama no responde

```bash- **Python-dotenv**: Gestión de configuración- **Python-dotenv**: Gestión de configuración

# Verificar servicio

ollama version

ollama list

```### Frontend### Frontend



### Puerto 8000 ocupado- **Electron 38.2.2**: Framework multiplataforma para apps de escritorio- **Electron 38.2.2**: Framework multiplataforma para apps de escritorio

```bash

# Windows- **Vanilla JavaScript**: Sin dependencias de frameworks pesados- **Vanilla JavaScript**: Sin dependencias de frameworks pesados

netstat -ano | findstr :8000

taskkill /PID <PID> /F- **CSS Modular**: Arquitectura escalable por componentes- **CSS Modular**: Arquitectura escalable por componentes



# Linux/macOS

lsof -i :8000

kill -9 <PID>### DevOps & Tooling### DevOps & Tooling

```

- **electron-builder 26.0.12**: Empaquetado y distribución (NSIS, DMG, AppImage)- **electron-builder 26.0.12**: Empaquetado y distribución (NSIS, DMG, AppImage)

### GPU no detectada

```bash- **Python venv**: Aislamiento de dependencias en desarrollo- **Python venv**: Aislamiento de dependencias en desarrollo

# Ejecutar diagnóstico

python backend/gpu/gpu_check.py- **python-portable**: Python embebido para distribución- **python-portable**: Python embebido para distribución

cat backend/gpu/gpu_info.json

```



## Documentación Adicional## Estructura del Proyecto## Estructura del Proyecto



- **[backend/README.md](backend/README.md)**: Documentación del backend

- **[backend/gpu/GPU_SETUP.md](backend/gpu/GPU_SETUP.md)**: Configuración GPU

- **[backend/docs/QUICKSTART.md](backend/docs/QUICKSTART.md)**: Guía rápida del backend``````



## LicenciaAlfredElectron/AlfredElectron/



MIT License - Ver [backend/docs/LICENSE](backend/docs/LICENSE)├── main.js                    # Proceso principal Electron├── main.js                    # Proceso principal Electron



## Autor├── preload.js                 # Preload script (IPC bridge)├── preload.js                 # Preload script (IPC bridge)



**Adalk033** - [GitHub](https://github.com/Adalk033)├── package.json               # Dependencias Node.js y build config├── package.json               # Dependencias Node.js y build config



## Enlaces Útiles││



- [Ollama](https://ollama.ai/) - Servidor LLM local├── backend/                   # Backend FastAPI (Python)├── backend/                   # Backend FastAPI (Python)

- [FastAPI](https://fastapi.tiangolo.com/) - Framework backend

- [Electron](https://www.electronjs.org/) - Framework desktop│   ├── core/                  # Módulos principales│   ├── core/                  # Módulos principales

- [LangChain](https://python.langchain.com/) - Framework LLM

- [ChromaDB](https://www.trychroma.com/) - Base de datos vectorial│   │   ├── alfred_backend.py  # API REST FastAPI│   │   ├── alfred_backend.py  # API REST FastAPI


│   │   ├── alfred_core.py     # Lógica RAG principal│   │   ├── alfred_core.py     # Lógica RAG principal

│   │   ├── vector_manager.py  # ChromaDB + embeddings│   │   ├── vector_manager.py  # ChromaDB + embeddings

│   │   ├── document_loader.py # Carga de documentos│   │   ├── document_loader.py # Carga de documentos

│   │   └── ...│   │   └── ...

│   ├── utils/                 # Utilidades│   ├── utils/                 # Utilidades

│   │   ├── paths.py          # Gestión de rutas con expandvars│   │   ├── paths.py          # Gestión de rutas con expandvars

│   │   ├── security.py       # Encriptación AES-256-GCM│   │   ├── security.py       # Encriptación AES-256-GCM

│   │   └── logger.py         # Sistema de logs│   │   └── logger.py         # Sistema de logs

│   ├── gpu/                   # GPU management│   ├── gpu/                   # GPU management

│   │   └── gpu_manager.py    # Auto-detección NVIDIA/AMD/Apple│   │   └── gpu_manager.py    # Auto-detección NVIDIA/AMD/Apple

│   ├── python-portable/       # Python embebido (solo producción)│   ├── python-portable/       # Python embebido (solo producción)

│   ├── venv/                  # Virtual env (solo desarrollo)│   ├── venv/                  # Virtual env (solo desarrollo)

│   ├── .env                   # Configuración local (gitignored)│   ├── .env                   # Configuración local (gitignored)

│   ├── .env.example           # Plantilla de configuración│   ├── .env.example           # Plantilla de configuración

│   └── requirements.txt       # Dependencias Python│   └── requirements.txt       # Dependencias Python

││

├── renderer/                  # Frontend Electron├── renderer/                  # Frontend Electron

│   ├── index.html            # UI principal│   ├── index.html            # UI principal

│   ├── renderer.js           # Lógica principal de UI│   ├── renderer.js           # Lógica principal de UI

│   ├── api/│   ├── api/

│   │   └── api.js           # Cliente API REST│   │   └── api.js           # Cliente API REST

│   ├── core/│   ├── core/

│   │   ├── conversations.js  # Gestión de conversaciones│   │   ├── conversations.js  # Gestión de conversaciones

│   │   ├── dialogs.js       # Modales y diálogos│   │   ├── dialogs.js       # Modales y diálogos

│   │   └── utils.js         # Utilidades generales│   │   └── utils.js         # Utilidades generales

│   ├── dom/│   ├── dom/

│   │   ├── dom-utils.js     # Markdown parser con tablas│   │   ├── dom-utils.js     # Markdown parser con tablas

│   │   └── events.js        # Event handlers│   │   └── events.js        # Event handlers

│   └── styles/              # CSS modular│   └── styles/              # CSS modular

││

├── chroma_db/                 # ChromaDB (desarrollo, gitignored)├── chroma_db/                 # ChromaDB (desarrollo, gitignored)

└── assets/                    # Iconos y recursos└── assets/                    # Iconos y recursos



# Datos persistentes en producción:# Datos persistentes en producción:

# Windows: C:\Users\<User>\AppData\Roaming\Alfred\# Windows: C:\Users\<User>\AppData\Roaming\Alfred\

# Linux: ~/.alfred/# Linux: ~/.alfred/

# macOS: ~/Library/Application Support/Alfred/# macOS: ~/Library/Application Support/Alfred/

``````



## Build y Distribución## Build y Distribución



### Empaquetar para Producción### Empaquetar para Producción



```bash```bash

# Windows (NSIS installer)# Windows (NSIS installer)

npm run build:winnpm run build:win



# macOS (DMG)# macOS (DMG)

npm run build:macnpm run build:mac



# Linux (AppImage)# Linux (AppImage)

npm run build:linuxnpm run build:linux

``````



Los instaladores se generan en `dist/`.Los instaladores se generan en `dist/`.



### Diferencias Desarrollo vs Producción### Diferencias Desarrollo vs Producción



| Aspecto | Desarrollo | Producción || Aspecto | Desarrollo | Producción |

|---------|------------|------------||---------|------------|------------|

| **Python** | Sistema + venv | python-portable embebido || **Python** | Sistema + venv | python-portable embebido |

| **Backend** | Manual o npm start | Auto-spawn por Electron || **Backend** | Manual o npm start | Auto-spawn por Electron |

| **ChromaDB** | `./chroma_db` | `%AppData%\Alfred\data\chroma_store` || **ChromaDB** | `./chroma_db` | `%AppData%\Alfred\data\chroma_store` |

| **Datos** | Rutas relativas | AppData (evita Program Files) || **Datos** | Rutas relativas | AppData (evita Program Files) |

| **Dependencias** | Instaladas en venv | Pre-instaladas en python-portable || **Dependencias** | Instaladas en venv | Pre-instaladas en python-portable |



## Configuración---



### Variables de Entorno (Opcional)## 🎨 Interfaz de Usuario



El backend funciona con valores por defecto. Para personalizar, crea `backend/.env`:### Pantalla Principal



```bash```

# Backend┌─────────────────────────────────────────────────────────────────┐

cd backend│ 🤖 Alfred              🟢 Conectado      🔄 ⚙️ 📊 📁 👤        │

cp .env.example .env├─────────────────────────────────────────────────────────────────┤

```│                                                                 │

│                          🤖                                     │

Principales configuraciones:│                   ¡Hola! Soy Alfred                             │

│              Tu asistente personal inteligente                  │

```env│                                                                 │

# Rutas de datos (se expanden automáticamente)│         Pregúntame sobre tus documentos personales              │

ALFRED_DATA_PATH=%AppData%\Alfred\data         # Windows│              o cualquier cosa que necesites                     │

ALFRED_DATA_PATH=$HOME/.alfred/data            # Linux/macOS│                                                                 │

├─────────────────────────────────────────────────────────────────┤

# Modelos│  👤  ¿Cuál es mi RFC y CURP?                                    │

ALFRED_MODEL=gemma3n:e4b│                                                                 │

ALFRED_EMBEDDING_MODEL=nomic-embed-text:v1.5│  🤖  Según tus documentos:                                      │

│      • RFC: XXXX999999XXX                                       │

# Servidor│      • CURP: XXXX999999XXXXXXXX                                 │

ALFRED_HOST=127.0.0.1│                                                                 │

ALFRED_PORT=8000│      📚 Fuentes consultadas:                                    │

```│      • identificacion_oficial.pdf                               │

│      • datos_personales.pdf                                     │

## Solución de Problemas│                                                                 │

│      ⏱️ Hace 2 minutos                                          │

### Backend no inicia│                                                                 │

```bash├─────────────────────────────────────────────────────────────────┤

# Verificar Python y dependencias│  📝 [Escribe tu mensaje aquí...]                          [▶]  │

python --version└─────────────────────────────────────────────────────────────────┘

cd backend```

pip install -r requirements.txt

```### Características de la Interfaz



### Ollama no responde#### 💬 **Chat Inteligente**

```bash- Efecto de escritura letra por letra

# Verificar servicio- Renderizado Markdown completo

ollama version- Soporte para tablas con estilos profesionales

ollama list- Resaltado de sintaxis para código

```- Emojis y formato enriquecido



### Puerto 8000 ocupado#### 📊 **Información Contextual**

```bash- Badge "Del historial" cuando usa respuestas cacheadas

# Windows- Contador de fragmentos de documentos analizados

netstat -ano | findstr :8000- Lista de archivos fuente utilizados

taskkill /PID <PID> /F- Extracción de datos personales (RFC, CURP, NSS)

- Timestamps automáticos

# Linux/macOS

lsof -i :8000#### 🎯 **Panel de Navegación**

kill -9 <PID>- **🕐 Historial**: Últimas 50 conversaciones guardadas

```- **📊 Estadísticas**: Métricas del sistema en tiempo real

- **📁 Documentos**: Explorador de documentos indexados

### GPU no detectada- **⚙️ Configuración**: Preferencias y ajustes

```bash- **👤 Perfil**: Información del usuario

# Ejecutar diagnóstico

python backend/gpu/gpu_check.py#### 🔔 **Sistema de Notificaciones**

cat backend/gpu/gpu_info.json- Notificaciones visuales no intrusivas

```- Estados: Éxito, Error, Advertencia, Info

- Auto-desaparecen después de 5 segundos

## Documentación Adicional- Animaciones suaves



- **[backend/README.md](backend/README.md)**: Documentación del backend---

- **[backend/gpu/GPU_SETUP.md](backend/gpu/GPU_SETUP.md)**: Configuración GPU

- **[backend/docs/QUICKSTART.md](backend/docs/QUICKSTART.md)**: Guía rápida del backend## 🏗️ Arquitectura del Proyecto



## Licencia```

AlfredElectron/                          # Raíz del proyecto

MIT License - Ver [backend/docs/LICENSE](backend/docs/LICENSE)│

├── 🔧 Configuración

## Autor│   ├── .env                             # Tu configuración local

│   ├── .env.template                    # Plantilla de configuración

**Adalk033** - [GitHub](https://github.com/Adalk033)│   ├── package.json                     # Dependencias Node.js

│   └── .gitignore                       # Archivos ignorados

## Enlaces Útiles│

├── 🚀 Scripts de Arranque

- [Ollama](https://ollama.ai/) - Servidor LLM local│   ├── stP.ps1                          # Script universal Windows

- [FastAPI](https://fastapi.tiangolo.com/) - Framework backend│   ├── stP.sh                           # Script universal Linux/macOS

- [Electron](https://www.electronjs.org/) - Framework desktop│   └── start.ps1                        # Script legacy

- [LangChain](https://python.langchain.com/) - Framework LLM│

- [ChromaDB](https://www.trychroma.com/) - Base de datos vectorial├── 🎨 Frontend (Electron)

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

