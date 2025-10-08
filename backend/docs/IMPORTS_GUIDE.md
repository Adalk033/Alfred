# Guia de Imports - Estructura del Proyecto

## Estructura de Directorios

```
backend/
├── __init__.py
├── .env
├── requirements.txt
├── alfred_qa_history.json
├── core/                      # Logica principal
│   ├── __init__.py
│   ├── alfred_backend.py      # FastAPI server (punto de entrada)
│   ├── alfred_core.py         # Logica de negocio RAG
│   ├── alfred.py              # Script CLI legacy
│   ├── config.py              # Configuracion y prompts
│   ├── conversation_manager.py # Gestion de conversaciones
│   └── functionsToHistory.py  # Historial Q&A
├── gpu/                       # Gestion de GPU
│   ├── __init__.py
│   ├── gpu_manager.py         # Singleton de GPU
│   ├── demo_gpu.py
│   ├── test_gpu.py
│   └── test_ollama_gpu.py
├── scripts/                   # Scripts de deployment
│   ├── __init__.py
│   ├── setup_alfred.ps1
│   └── start_alfred_server.ps1
├── tests/                     # Pruebas
│   ├── __init__.py
│   └── test_backend.py
└── conversations/             # Datos de conversaciones
    └── *.json
```

## Sistema de Imports

### Problema Original

Con la reorganizacion del codigo en subdirectorios (`core/`, `gpu/`, `scripts/`), Python no podia encontrar modulos entre carpetas:

```python
# En core/alfred_core.py (NO FUNCIONA)
from gpu_manager import get_gpu_manager  # ModuleNotFoundError
```

### Solucion Implementada

Cada archivo en `core/` agrega los directorios necesarios al `sys.path` al inicio:

```python
import sys
from pathlib import Path

# Agregar directorios al path de Python para imports
backend_root = Path(__file__).parent.parent  # Subir a backend/
sys.path.insert(0, str(backend_root))        # Agregar backend/
sys.path.insert(0, str(backend_root / "core"))  # Agregar backend/core/
sys.path.insert(0, str(backend_root / "gpu"))   # Agregar backend/gpu/
```

**Luego** se pueden hacer los imports:

```python
# Ahora Python puede encontrar estos modulos
import config                    # backend/core/config.py
import functionsToHistory        # backend/core/functionsToHistory.py
from gpu_manager import get_gpu_manager  # backend/gpu/gpu_manager.py
```

## Archivos que Necesitan sys.path

### ✅ Archivos Corregidos

- `backend/core/alfred_backend.py` - Punto de entrada FastAPI
- `backend/core/alfred_core.py` - Logica RAG
- `backend/core/alfred.py` - Script CLI

### ✅ Archivos que NO Necesitan sys.path

- `backend/core/config.py` - Solo define constantes
- `backend/core/functionsToHistory.py` - Solo funciones utilitarias
- `backend/core/conversation_manager.py` - Solo usa stdlib
- `backend/gpu/gpu_manager.py` - No importa modulos custom

## Patrones de Import

### Desde alfred_backend.py (Entrada)

```python
# Configurar paths PRIMERO
import sys
from pathlib import Path
backend_root = Path(__file__).parent.parent
sys.path.insert(0, str(backend_root))
sys.path.insert(0, str(backend_root / "core"))
sys.path.insert(0, str(backend_root / "gpu"))

# Luego imports externos
from fastapi import FastAPI
from langchain_ollama import OllamaLLM

# Finalmente imports locales
import config
import functionsToHistory
from alfred_core import AlfredCore
from gpu_manager import get_gpu_manager
```

### Desde alfred_core.py (Logica)

```python
# Mismo patron: paths primero
import sys
from pathlib import Path
backend_root = Path(__file__).parent.parent
sys.path.insert(0, str(backend_root))
sys.path.insert(0, str(backend_root / "core"))
sys.path.insert(0, str(backend_root / "gpu"))

# Imports externos
from langchain_ollama import OllamaLLM

# Imports locales
import config
from gpu_manager import get_gpu_manager
```

## Alternativas Consideradas

### ❌ Opcion 1: Imports Relativos
```python
from ..gpu.gpu_manager import get_gpu_manager
```
**Problema**: Solo funciona con `python -m`, no con ejecucion directa

### ❌ Opcion 2: Instalar como Paquete
```python
# pyproject.toml con estructura de paquete
```
**Problema**: Demasiado complejo para desarrollo local

### ✅ Opcion 3: Modificar sys.path (Elegida)
```python
sys.path.insert(0, str(backend_root / "gpu"))
```
**Ventajas**:
- Funciona con ejecucion directa
- No requiere instalacion
- Facil de entender
- Compatible con Electron spawn

## Ejecutar el Backend

### Desde Electron (Recomendado)
```bash
npm start  # Electron spawn Python automaticamente
```

### Desde Terminal (Desarrollo)
```bash
cd backend
python core/alfred_backend.py
```

### Desde Backend Root
```bash
cd backend
python -m core.alfred_backend  # Tambien funciona
```

## Troubleshooting

### Error: ModuleNotFoundError: No module named 'X'

**Causa**: Falta agregar directorio al sys.path

**Solucion**: Verifica que el archivo tiene:
```python
import sys
from pathlib import Path
backend_root = Path(__file__).parent.parent
sys.path.insert(0, str(backend_root / "CARPETA_DEL_MODULO"))
```

### Error: ImportError: attempted relative import with no known parent package

**Causa**: Intentando usar imports relativos (`from ..gpu import`)

**Solucion**: Usa imports absolutos con sys.path como se muestra arriba

### Error: No module named 'fastapi'

**Causa**: Dependencias no instaladas

**Solucion**:
```bash
cd backend
.\venv\Scripts\python.exe -m pip install -r requirements.txt
```

O usa el script de limpieza:
```bash
cd ..  # Volver a AlfredElectron/
.\clean-install.ps1 -FullClean
```

## Mejores Practicas

1. **Siempre configura sys.path ANTES de imports**
   ```python
   # MAL
   import config  # Falla
   sys.path.insert(...)
   
   # BIEN
   sys.path.insert(...)
   import config  # Funciona
   ```

2. **Usa Path de pathlib, no strings**
   ```python
   # MAL
   sys.path.insert(0, "../gpu")  # No portable
   
   # BIEN
   from pathlib import Path
   sys.path.insert(0, str(Path(__file__).parent.parent / "gpu"))
   ```

3. **Documenta dependencias entre modulos**
   ```python
   # alfred_core.py necesita:
   # - config.py (mismo directorio)
   # - functionsToHistory.py (mismo directorio)
   # - gpu_manager.py (directorio gpu/)
   ```

4. **Mantén __init__.py en cada carpeta**
   - Marca carpetas como paquetes Python
   - Pueden estar vacios pero deben existir

## Referencias

- [Python Import System](https://docs.python.org/3/reference/import.html)
- [sys.path Documentation](https://docs.python.org/3/library/sys.html#sys.path)
- [Pathlib Guide](https://docs.python.org/3/library/pathlib.html)
