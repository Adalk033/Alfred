# Estructura de Carpetas Estandarizada - Alfred

Este documento define la estructura de carpetas estandarizada para el proyecto Alfred, garantizando consistencia en todos los entornos (Windows, Linux, macOS).

## Estructura Completa

```
AlfredElectron/                          # Raíz del proyecto
│
├── .env                                 # Configuración local (gitignored)
├── .env.template                        # Plantilla de configuración
├── .gitignore                           # Archivos ignorados por Git
├── package.json                         # Dependencias Node.js
├── package-lock.json                    # Lockfile de npm
│
├── main.js                              # Proceso principal Electron
├── preload.js                           # Script de preload Electron
│
├── stP.ps1                              # Script arranque Windows
├── stP.sh                               # Script arranque Linux/macOS
├── start.ps1                            # Script legacy (mantener)
│
├── README.md                            # Documentación principal
├── QUICKSTART_V2.md                     # Guía de inicio rápido
├── QUICK.md                             # Guía rápida legacy
│
├── assets/                              # Recursos estáticos
│   ├── icon.png                         # Icono de la aplicación
│   ├── logo.svg                         # Logo vectorial
│   └── images/                          # Imágenes adicionales
│
├── fonts/                               # Fuentes tipográficas
│   └── Inter-4.1/                       # Fuente Inter
│       ├── Inter.ttc
│       └── ...
│
├── renderer/                            # Frontend Electron
│   ├── index.html                       # HTML principal
│   ├── renderer.js                      # Script principal del renderer
│   │
│   ├── api/                             # Comunicación con backend
│   │   └── api.js                       # Cliente API
│   │
│   ├── core/                            # Lógica de negocio del frontend
│   │   ├── conversations.js             # Gestión de conversaciones
│   │   ├── notifications.js             # Sistema de notificaciones
│   │   └── utils.js                     # Utilidades generales
│   │
│   ├── dom/                             # Manipulación del DOM
│   │   ├── dom-utils.js                 # Utilidades DOM
│   │   └── events.js                    # Gestión de eventos
│   │
│   ├── state/                           # Gestión de estado
│   │   └── state.js                     # Estado global
│   │
│   └── styles/                          # Estilos CSS
│       ├── main.css                     # Estilos principales
│       │
│       ├── components/                  # Estilos de componentes
│       │   ├── bottom.css
│       │   ├── documents.css
│       │   ├── left-sidebar.css
│       │   ├── loading.css
│       │   ├── messages.css
│       │   ├── notifications.css
│       │   ├── profile.css
│       │   ├── progress.css
│       │   ├── sidebar.css
│       │   ├── support.css
│       │   └── topbar.css
│       │
│       ├── themes/                      # Temas visuales
│       │   ├── base.css
│       │   ├── dark.css
│       │   └── ligth.css
│       │
│       └── utils/                       # Utilidades CSS
│           └── variables.css
│
└── backend/                             # Backend Python (FastAPI + RAG)
    │
    ├── __init__.py                      # Módulo Python
    ├── requirements.txt                 # Dependencias Python
    ├── venv/                            # Entorno virtual (gitignored)
    │
    ├── core/                            # Núcleo del backend
    │   ├── __init__.py
    │   ├── alfred_backend.py            # API FastAPI (puerto 8000)
    │   ├── alfred_core.py               # Lógica RAG principal
    │   ├── alfred.py                    # Interfaz legacy
    │   ├── api_backend.py               # API alternativa
    │   │
    │   ├── config.py                    # Configuración y prompts
    │   ├── conversation_manager.py      # Gestión de conversaciones
    │   ├── db_manager.py                # Gestor de base de datos SQLite
    │   │
    │   ├── document_loader.py           # Carga de documentos
    │   ├── chunking_manager.py          # División de documentos
    │   │
    │   ├── embedding_manager.py         # Gestión de embeddings
    │   ├── embedding_cache.py           # Cache de embeddings
    │   │
    │   ├── vector_manager.py            # ChromaDB manager
    │   ├── retriever.py                 # Búsqueda vectorial
    │   ├── retrieval_cache.py           # Cache de búsquedas
    │   │
    │   └── functionsToHistory.py        # Historial Q&A
    │
    ├── gpu/                             # Gestión de GPU
    │   ├── __init__.py
    │   ├── gpu_manager.py               # Gestor principal GPU
    │   ├── gpu_check.py                 # Detección automática
    │   ├── gpu_info.json                # Info GPU (generado)
    │   │
    │   ├── demo_gpu.py                  # Demo de uso
    │   ├── test_gpu.py                  # Tests GPU
    │   ├── test_ollama_gpu.py           # Tests Ollama+GPU
    │   ├── monitor_gpu_usage.py         # Monitor Python
    │   ├── monitor_gpu.ps1              # Monitor PowerShell
    │   ├── watch_gpu.ps1                # Watch en tiempo real
    │   │
    │   ├── GPU_IMPLEMENTATION.md        # Documentación implementación
    │   ├── GPU_MONITORING_GUIDE.md      # Guía de monitoreo
    │   ├── GPU_SETUP.md                 # Guía de configuración
    │   └── OPTIMIZATION_GUIDE.md        # Guía de optimización
    │
    ├── utils/                           # Utilidades backend
    │   ├── __init__.py
    │   ├── logger.py                    # Sistema de logs
    │   ├── paths.py                     # Gestión de rutas
    │   ├── process_utils.py             # Utilidades de procesos
    │   └── security.py                  # Encriptación AES-256-GCM
    │
    ├── docs/                            # Documentación backend
    │   ├── LICENSE                      # Licencia del proyecto
    │   ├── QUICKSTART.md                # Inicio rápido
    │   └── README.md                    # Documentación completa
    │
    └── %AppData%/Alfred/                # Datos de usuario (Windows)
        │                                # ~/.alfred/ (Linux/macOS)
        │
        ├── data/                        # Datos persistentes
        │   └── secret.key               # Clave de encriptación
        │
        ├── db/                          # Bases de datos
        │   └── alfred.db                # SQLite principal
        │
        └── logs/                        # Archivos de log
            ├── alfred.log
            └── error.log

chroma_db/                               # ChromaDB (gitignored)
    ├── chroma.sqlite3                   # Base de datos vectorial
    └── [collections]/                   # Colecciones de embeddings

node_modules/                            # Módulos Node.js (gitignored)
```

## Convenciones de Nombres

### Archivos Python
- `snake_case.py` - Módulos y scripts
- `__init__.py` - Inicializadores de paquetes
- `test_*.py` - Tests unitarios

### Archivos JavaScript
- `camelCase.js` - Módulos JavaScript
- `kebab-case.js` - Scripts standalone (opcional)

### Archivos PowerShell/Bash
- `kebab-case.ps1` - Scripts PowerShell
- `kebab-case.sh` - Scripts Bash

### Documentación
- `SCREAMING_SNAKE_CASE.md` - Documentos importantes
- `PascalCase.md` - Guías específicas (opcional)
- `lowercase.md` - Documentos generales

### Estilos CSS
- `kebab-case.css` - Archivos de estilos
- Prefijo por tipo:
  - `components/` - Componentes UI
  - `themes/` - Temas visuales
  - `utils/` - Utilidades

## Rutas de Configuración por Sistema Operativo

### Windows
```
Datos de usuario:  %APPDATA%\Alfred\
Configuración:     %APPDATA%\Alfred\data\
Base de datos:     %APPDATA%\Alfred\db\alfred.db
Logs:              %APPDATA%\Alfred\logs\
Temp:              %TEMP%\alfred\
```

### Linux
```
Datos de usuario:  ~/.alfred/
Configuración:     ~/.alfred/data/
Base de datos:     ~/.alfred/db/alfred.db
Logs:              ~/.alfred/logs/
Temp:              /tmp/alfred/
```

### macOS
```
Datos de usuario:  ~/.alfred/
Configuración:     ~/.alfred/data/
Base de datos:     ~/.alfred/db/alfred.db
Logs:              ~/.alfred/logs/
Temp:              /tmp/alfred/
```

## Archivos Ignorados (.gitignore)

```gitignore
# Configuración local
.env

# Entornos virtuales
backend/venv/
venv/
env/

# Dependencias
node_modules/
__pycache__/
*.pyc
*.pyo

# Bases de datos
chroma_db/
*.db
*.sqlite3

# Logs
*.log
backend/logs/

# Archivos generados
backend/gpu/gpu_info.json
dist/
build/

# Sistema operativo
.DS_Store
Thumbs.db
desktop.ini

# IDEs
.vscode/
.idea/
*.swp
*.swo
```

## Variables de Entorno (`.env`)

Todas las rutas en `.env` deben usar:
- **Rutas absolutas** cuando sea posible
- **Separadores multiplataforma**: `/` funciona en todos los sistemas
- **Sin comillas** alrededor de valores

```env
# Correcto
ALFRED_DOCS_PATH=/home/user/documents
ALFRED_LOG_DIR=/home/user/.alfred/logs

# También correcto (Windows)
ALFRED_DOCS_PATH=C:/Users/User/Documents
```

## Gestión de Rutas en Código

### Python
```python
from pathlib import Path
import os

# Usar Path para rutas multiplataforma
docs_path = Path(os.getenv('ALFRED_DOCS_PATH'))
db_path = Path.home() / '.alfred' / 'db' / 'alfred.db'

# Siempre usar / o Path.joinpath()
config_file = docs_path / 'config' / 'settings.json'
```

### JavaScript
```javascript
const path = require('path');
const os = require('os');

// Usar path.join() para rutas multiplataforma
const docsPath = process.env.ALFRED_DOCS_PATH;
const dbPath = path.join(os.homedir(), '.alfred', 'db', 'alfred.db');

// Nunca concatenar con + o template literals
const configFile = path.join(docsPath, 'config', 'settings.json');
```

## Migración de Estructura Legacy

Si tienes una instalación antigua, migra así:

```bash
# Mover datos de usuario
# Windows
move "%USERPROFILE%\.alfred" "%APPDATA%\Alfred"

# Linux/macOS
mv ~/.alfred_old ~/.alfred

# Actualizar .env con nuevas rutas
# Editar manualmente o ejecutar script de migración
```

## Checklist de Validación

Para verificar que tu estructura es correcta:

```powershell
# Windows
.\stP.ps1

# Linux/macOS
./stP.sh
```

El script verificará:
- ✅ Existencia de archivos requeridos
- ✅ Permisos de carpetas
- ✅ Estructura de `backend/`
- ✅ Archivo `.env` configurado
- ✅ Entorno virtual de Python
- ✅ Dependencias instaladas

---

**Última actualización**: Octubre 2025
**Versión**: 2.0
