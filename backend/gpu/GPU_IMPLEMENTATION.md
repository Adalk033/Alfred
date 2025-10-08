# Implementación de Soporte GPU en Alfred

## 📌 Resumen de Cambios

Se ha implementado un sistema completo de detección y uso automático de GPU para acelerar los modelos de IA en Alfred.

## 🆕 Archivos Nuevos

### 1. `gpu_manager.py`
**Gestor principal de GPU** que:
- ✅ Detecta automáticamente GPU NVIDIA (CUDA)
- ✅ Detecta GPU AMD (ROCm)
- ✅ Detecta Apple Silicon (Metal/MPS)
- ✅ Configura Ollama para usar GPU
- ✅ Aplica optimizaciones de inferencia
- ✅ Gestiona memoria de GPU
- ✅ Provee fallback automático a CPU

**Características principales:**
```python
from gpu_manager import get_gpu_manager

gpu = get_gpu_manager()

# Verificar si hay GPU
if gpu.has_gpu:
    print(f"GPU: {gpu.device_type}")
    
# Configurar Ollama
gpu.configure_ollama_for_gpu()

# Ver estado
print(gpu.get_status_report())

# Limpiar memoria
gpu.clear_cache()
```

### 2. `test_gpu.py`
Script completo de pruebas que:
- Detecta hardware disponible
- Configura Ollama
- Prueba operaciones en GPU
- Muestra uso de memoria
- Valida funcionamiento

**Uso:**
```powershell
python test_gpu.py
```

### 3. `demo_gpu.py`
Demostración interactiva y amigable que:
- Muestra detección paso a paso
- Da recomendaciones según hardware
- Guía al usuario en configuración

**Uso:**
```powershell
python demo_gpu.py
```

### 4. `GPU_SETUP.md`
Documentación completa con:
- Instrucciones de instalación
- Configuración por plataforma (Windows/Linux/Mac)
- Solución de problemas
- Optimizaciones de rendimiento
- Ejemplos de uso

## 🔧 Archivos Modificados

### 1. `alfred_core.py`
**Cambios:**
- ✅ Importa `gpu_manager`
- ✅ Inicializa GPU al crear instancia
- ✅ Configura Ollama para GPU automáticamente
- ✅ Agrega métodos para consultar estado de GPU:
  - `get_gpu_status()` - Reporte completo
  - `get_gpu_memory_usage()` - Uso de memoria
  - `clear_gpu_cache()` - Limpiar caché
- ✅ Incluye info de GPU en `get_info()`

**Ejemplo de uso:**
```python
from alfred_core import AlfredCore

alfred = AlfredCore()  # GPU se detecta y configura automáticamente

# Ver estado
print(alfred.get_gpu_status())

# Ver memoria
memory = alfred.get_gpu_memory_usage()
if memory:
    print(f"Memoria: {memory['allocated']:.2f} GB")

# Limpiar si es necesario
alfred.clear_gpu_cache()
```

### 2. `alfred.py`
**Cambios:**
- ✅ Importa y inicializa `gpu_manager` al inicio
- ✅ Configura GPU antes de cargar modelos
- ✅ Agrega comando `gpu` para ver estado interactivo
- ✅ Permite limpiar caché desde CLI

**Nuevo comando:**
```
Tu pregunta: gpu

[Muestra estado de GPU y uso de memoria]
¿Limpiar caché de GPU? (s/n):
```

### 3. `README.md`
**Cambios:**
- ✅ Menciona soporte GPU en características
- ✅ Agrega paso de verificación GPU en instalación
- ✅ Agrega comando `gpu` en lista de comandos especiales
- ✅ Link a `GPU_SETUP.md`

## 🚀 Características Implementadas

### Detección Automática
```
✓ GPU NVIDIA detectada: NVIDIA GeForce RTX 3060
  - Memoria: 12.00 GB
  - CUDA Version: 12.1
✓ Ollama configurado para usar GPU NVIDIA CUDA
✓ Optimizaciones CUDA aplicadas
```

### Fallback Transparente
Si no hay GPU:
```
ℹ No se detectó GPU dedicada, usando CPU
ℹ Ollama configurado para usar CPU
```

### Gestión de Memoria
```python
# Ver uso actual
memory = gpu.get_memory_usage()
# {'allocated': 0.25, 'reserved': 0.5, 'max_allocated': 1.2}

# Limpiar caché
gpu.clear_cache()
```

### Variables de Entorno
Configuración automática de Ollama:
- `OLLAMA_GPU=1` (si hay GPU)
- `OLLAMA_NUM_GPU=1` (número de GPUs)
- `OLLAMA_GPU=0` (si solo CPU)

## 📊 Rendimiento Esperado

### Con GPU NVIDIA (ej. RTX 3060)
- 🚀 **3-5x más rápido** que CPU
- ✅ Modelos grandes (gemma2:9b) sin problemas
- ✅ Embeddings significativamente más rápidos
- ✅ Menor latencia en respuestas

### Con CPU (fallback)
- ⚙️ Velocidad normal
- 📝 Recomendado: modelos pequeños (gemma2:2b)
- ⏱️ Mayor latencia en respuestas

## 🧪 Cómo Probar

### 1. Verificación Rápida
```powershell
python demo_gpu.py
```

### 2. Pruebas Completas
```powershell
python test_gpu.py
```

### 3. Usar con Alfred
```powershell
python alfred.py
```

Al iniciar verás:
```
✓ GPU NVIDIA detectada: [Tu GPU]
✓ Ollama configurado para usar GPU
✓ Optimizaciones aplicadas
```

### 4. Verificar Estado Durante Uso
```
Tu pregunta: gpu
```

## 🔍 Solución de Problemas

### GPU no detectada

**1. Verificar driver (Windows):**
```powershell
nvidia-smi
```

**2. Verificar PyTorch:**
```python
python -c "import torch; print(f'CUDA: {torch.cuda.is_available()}')"
```

**3. Reinstalar PyTorch con CUDA:**
```powershell
pip uninstall torch torchvision
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121
```

### Ollama no usa GPU

**1. Verificar variables:**
```python
python -c "import os; print(os.environ.get('OLLAMA_GPU'))"
```

**2. Reiniciar Ollama:**
```powershell
taskkill /F /IM ollama.exe
python alfred.py  # Inicia automáticamente
```

### Errores de memoria

**1. Usar modelo más pequeño:**
```bash
# En .env
ALFRED_MODEL=gemma2:2b
```

**2. Limpiar caché:**
```
Tu pregunta: gpu
¿Limpiar caché de GPU? s
```

## 📖 Documentación Adicional

- **`GPU_SETUP.md`** - Guía completa de configuración
- **`README.md`** - Documentación principal actualizada
- **Código inline** - Todos los módulos tienen docstrings detallados

## ✅ Compatibilidad

### Plataformas Soportadas
- ✅ **Windows** con GPU NVIDIA
- ✅ **Linux** con GPU NVIDIA
- ✅ **Linux** con GPU AMD (ROCm)
- ✅ **macOS** con Apple Silicon (M1/M2/M3)
- ✅ **Cualquier plataforma** con CPU (fallback)

### Modelos Soportados
- ✅ Ollama LLM (gemma2, llama3, etc.)
- ✅ Ollama Embeddings (nomic-embed-text, etc.)
- ✅ Cualquier modelo que use PyTorch

## 🎯 Próximos Pasos

Para el usuario:

1. **Probar detección:**
   ```powershell
   python demo_gpu.py
   ```

2. **Verificar funcionamiento:**
   ```powershell
   python test_gpu.py
   ```

3. **Usar Alfred normalmente:**
   ```powershell
   python alfred.py
   ```
   
4. **Si tienes problemas:**
   - Revisa `GPU_SETUP.md`
   - Ejecuta `nvidia-smi` (NVIDIA)
   - Verifica instalación de PyTorch

## 📝 Notas Importantes

1. **No requiere configuración manual** - Todo es automático
2. **Fallback seguro a CPU** - Siempre funcionará
3. **Sin cambios en API** - Compatibilidad total con código existente
4. **Optimizaciones transparentes** - El usuario no necesita hacer nada

## 💡 Ejemplo Completo

```python
# Alfred detecta y usa GPU automáticamente
from alfred_core import AlfredCore

# Iniciar (GPU se configura aquí)
alfred = AlfredCore()
# ✓ GPU NVIDIA detectada...
# ✓ Ollama configurado para usar GPU...

# Usar normalmente
response = alfred.ask("¿Cuál es mi RFC?")
print(response['answer'])

# Ver estado de GPU
print(alfred.get_gpu_status())

# Limpiar memoria si es necesario
alfred.clear_gpu_cache()
```

---

**Implementado con éxito** ✅

Todo está listo para usar. El sistema detectará automáticamente la GPU y la usará si está disponible, o usará CPU de forma transparente.
