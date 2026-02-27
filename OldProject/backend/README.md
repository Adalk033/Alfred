# Alfred Backend

Backend FastAPI con RAG (Retrieval-Augmented Generation) para Alfred AI Assistant.

## Requisitos Previos

1. **Ollama**: Instala [Ollama](https://ollama.ai) y descarga los modelos:
   ```bash
   ollama pull gemma3n:e4b
   ollama pull nomic-embed-text:v1.5
   ```

2. **Python 3.12+**: El proyecto usa python-portable en producción, pero para desarrollo necesitas Python instalado.

## Configuración Rápida

### 1. Configurar variables de entorno

```bash
# Copiar archivo de ejemplo
cp .env.example .env

# Editar si necesitas cambiar rutas (opcional)
# Las rutas por defecto funcionan bien en Windows/Linux/Mac
```

### 2. Instalar dependencias (modo desarrollo)

```bash
# Crear entorno virtual
python -m venv venv

# Activar entorno
# Windows:
.\venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

# Instalar dependencias
pip install -r requirements.txt
```

### 3. Ejecutar el backend

```bash
python core/alfred_backend.py
```

El servidor estará disponible en: http://127.0.0.1:8000

- **API Docs**: http://127.0.0.1:8000/docs
- **Health Check**: http://127.0.0.1:8000/health

## Ubicación de Datos

### Desarrollo
Cuando ejecutas el backend manualmente, usa rutas relativas:
- **ChromaDB**: `./chroma_db/`
- **Datos**: Configurado en `.env` (por defecto en AppData)

### Producción (App Empaquetada)
Cuando la app Electron está empaquetada, usa AppData:
- **Windows**: `C:\Users\<User>\AppData\Roaming\Alfred\`
- **Linux**: `~/.alfred/`
- **Mac**: `~/Library/Application Support/Alfred/`

```
Alfred/
├── data/
│   ├── documents/       # Documentos procesados
│   └── chroma_store/    # Base de datos vectorial
├── logs/                # Logs del backend
└── db/
    └── alfred.db       # Base de datos SQLite
```

## Estructura del Proyecto

```
backend/
├── core/                      # Módulos principales
│   ├── alfred_backend.py      # FastAPI server
│   ├── alfred_core.py         # Lógica RAG principal
│   ├── vector_manager.py      # Gestión de ChromaDB
│   ├── document_loader.py     # Carga de documentos
│   └── ...
├── utils/                     # Utilidades
│   ├── paths.py              # Gestión de rutas
│   ├── logger.py             # Sistema de logs
│   └── security.py           # Encriptación
├── gpu/                       # Gestión GPU
│   └── gpu_manager.py        # Auto-detección NVIDIA/AMD/Apple
└── python-portable/          # Python embebido (producción)
```

## Desarrollo

### Variables de Entorno Importantes

```bash
# Rutas (se expanden automáticamente)
ALFRED_DATA_PATH=%AppData%\Alfred\data    # Windows
ALFRED_DATA_PATH=$HOME/.alfred/data       # Linux/Mac

# Modelos
ALFRED_MODEL=gemma3n:e4b
ALFRED_EMBEDDING_MODEL=nomic-embed-text:v1.5

# Debug
ALFRED_DEBUG=true
ALFRED_FORCE_RELOAD=false
```

### Logs

Los logs se guardan en:
- **Desarrollo**: `%AppData%\Alfred\logs\` o `~/.alfred/logs/`
- **Consola**: Output con colores y formato

### Base de Datos

SQLite con encriptación AES-256-GCM:
- Conversaciones
- Historial Q&A
- Metadata de documentos

## Troubleshooting

### Error: "Access is denied"
- **Causa**: Intentando escribir en `Program Files` sin permisos
- **Solución**: El backend automáticamente usa AppData en producción

### Error: "Ollama not found"
- **Causa**: Ollama no está instalado o no está en PATH
- **Solución**: Instala Ollama desde https://ollama.ai

### Error: "Model not found"
- **Causa**: Modelos no descargados
- **Solución**: 
  ```bash
  ollama pull gemma3n:e4b
  ollama pull nomic-embed-text:v1.5
  ```

### ChromaDB no encuentra documentos
- **Causa**: Base de datos vacía o en ubicación incorrecta
- **Solución**: 
  1. Verifica que `ALFRED_DATA_PATH` apunte al directorio correcto
  2. Procesa documentos desde la interfaz de Electron
  3. O usa `ALFRED_FORCE_RELOAD=true` para reindexar

## Más Información

- **Documentación completa**: Ver `docs/README.md`
- **Configuración GPU**: Ver `gpu/GPU_SETUP.md`
- **Guía rápida**: Ver `docs/QUICKSTART.md`
