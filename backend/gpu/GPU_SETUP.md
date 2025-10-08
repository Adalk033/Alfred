# Configuración de GPU en Alfred

Alfred ahora detecta y utiliza automáticamente la GPU si está disponible, mejorando significativamente el rendimiento de los modelos de IA.

## 🚀 Características

### Detección Automática
- **NVIDIA CUDA**: Detecta y utiliza GPUs NVIDIA automáticamente
- **AMD ROCm**: Compatible con GPUs AMD (requiere ROCm instalado)
- **Apple Silicon**: Detecta y usa Metal Performance Shaders (MPS) en Macs con Apple Silicon
- **Fallback CPU**: Si no hay GPU disponible, usa CPU automáticamente

### Optimizaciones
- Configuración automática de Ollama para usar GPU
- Optimizaciones de inferencia según el hardware disponible
- Gestión de memoria de GPU
- Limpieza automática de caché

## 📋 Requisitos

### Para NVIDIA (Windows/Linux)
1. **Driver NVIDIA** actualizado
2. **CUDA Toolkit** (ya incluido con PyTorch)
3. PyTorch ya está en `requirements.txt`

Para verificar CUDA:
```powershell
nvidia-smi
```

### Para AMD (Linux principalmente)
1. **Driver AMD** actualizado
2. **ROCm** instalado
3. PyTorch compilado con soporte ROCm

### Para Apple Silicon (Mac)
- macOS 12.3 o superior
- PyTorch con soporte MPS (incluido en versiones recientes)

## 🔧 Instalación

### Windows con GPU NVIDIA

1. **Verificar driver NVIDIA**:
```powershell
nvidia-smi
```

2. **Instalar/Actualizar PyTorch con CUDA** (opcional, ya está en requirements):
```powershell
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121
```

3. **Las dependencias ya están instaladas** en `requirements.txt`

### Verificar instalación
```powershell
python test_gpu.py
```

## 📊 Uso

### Uso Automático
Alfred detecta y configura la GPU automáticamente al iniciar. No requiere configuración manual.

```python
from alfred_core import AlfredCore

# Alfred detectará y usará GPU automáticamente
alfred = AlfredCore()

# Ver estado de GPU
print(alfred.get_gpu_status())
```

### Verificar Estado de GPU
```python
from gpu_manager import get_gpu_manager

manager = get_gpu_manager()

# Verificar si hay GPU
if manager.has_gpu:
    print(f"GPU disponible: {manager.device_type}")
    print(f"Dispositivo: {manager.device}")
else:
    print("Usando CPU")

# Ver reporte completo
print(manager.get_status_report())
```

### Obtener Información de GPU desde Alfred
```python
alfred = AlfredCore()

# Ver estado completo
print(alfred.get_gpu_status())

# Ver información en get_info()
info = alfred.get_info()
print(f"Usando GPU: {info['using_gpu']}")
print(f"Dispositivo: {info['device']}")
print(f"GPU Info: {info['gpu_info']}")
```

### Gestión de Memoria
```python
alfred = AlfredCore()

# Ver uso de memoria
memory = alfred.get_gpu_memory_usage()
if memory:
    print(f"Memoria asignada: {memory['allocated']:.2f} GB")
    print(f"Memoria reservada: {memory['reserved']:.2f} GB")

# Limpiar caché de GPU
alfred.clear_gpu_cache()
```

## 🔍 Solución de Problemas

### GPU no detectada

1. **Verificar driver**:
```powershell
# NVIDIA
nvidia-smi

# AMD (Linux)
rocm-smi
```

2. **Verificar PyTorch**:
```python
import torch
print(f"CUDA disponible: {torch.cuda.is_available()}")
print(f"Versión CUDA: {torch.version.cuda}")
```

3. **Reinstalar PyTorch con CUDA**:
```powershell
pip uninstall torch torchvision
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121
```

### Ollama no usa GPU

1. **Verificar variables de entorno**:
```python
import os
print(os.environ.get('OLLAMA_GPU'))  # Debe ser '1'
```

2. **Reiniciar servicio Ollama**:
```powershell
# Detener Ollama
taskkill /F /IM ollama.exe

# Iniciar Alfred (iniciará Ollama automáticamente)
python alfred.py
```

3. **Verificar logs de Ollama**:
Los logs mostrarán si está usando GPU o CPU

### Errores de Memoria

Si obtienes errores de "out of memory":

1. **Usar modelo más pequeño**:
```bash
# En .env
ALFRED_MODEL=gemma2:2b  # En lugar de gemma2:9b
```

2. **Limpiar caché**:
```python
alfred.clear_gpu_cache()
```

3. **Limitar contexto**:
Ajustar `k` en el retriever (alfred_core.py):
```python
search_kwargs={"k": 10}  # Reducir de 20 a 10
```

## 📈 Rendimiento Esperado

### Con GPU NVIDIA (ejemplo RTX 3060)
- **Velocidad**: 3-5x más rápido que CPU
- **Modelos grandes**: gemma2:9b corre sin problemas
- **Embeddings**: Significativamente más rápidos

### Con CPU (fallback)
- **Velocidad**: Normal, dependiendo del procesador
- **Modelos recomendados**: gemma2:2b, llama3.2:3b
- **Limitaciones**: Modelos grandes pueden ser lentos

## 🧪 Pruebas

### Prueba rápida
```powershell
python test_gpu.py
```

### Prueba con Alfred completo
```powershell
python alfred.py
```

Al iniciar, verás:
```
✓ GPU NVIDIA detectada: NVIDIA GeForce RTX 3060
  - Memoria: 12.00 GB
  - CUDA Version: 12.1
✓ Ollama configurado para usar GPU NVIDIA CUDA
✓ Optimizaciones CUDA aplicadas
```

## 📝 Configuración Avanzada

### Variables de entorno opcionales

Crear/editar archivo `.env`:

```bash
# Forzar CPU (desactivar GPU)
OLLAMA_GPU=0

# Limitar número de GPUs
OLLAMA_NUM_GPU=1

# Limitar VRAM (en MB)
OLLAMA_MAX_VRAM=8192
```

### Configuración programática

```python
from gpu_manager import get_gpu_manager
import os

manager = get_gpu_manager()

# Forzar CPU
os.environ['OLLAMA_GPU'] = '0'

# O usar GPU específica
if manager.has_gpu:
    os.environ['CUDA_VISIBLE_DEVICES'] = '0'  # Usar solo GPU 0
```

## 🎯 Recomendaciones

### Para mejor rendimiento con GPU:
1. Usar modelos más grandes (gemma2:9b, llama3:8b)
2. Aumentar `k` en retriever para más contexto
3. Procesar documentos en lotes más grandes

### Para uso con CPU:
1. Usar modelos más pequeños (gemma2:2b)
2. Reducir `k` en retriever
3. Considerar menos documentos simultáneos

## 🆘 Soporte

Si tienes problemas:

1. Ejecuta `python test_gpu.py` y comparte el output
2. Verifica logs de Ollama
3. Revisa `TROUBLESHOOTING_WINDOWS_PATH.md` para otros problemas

## 📚 Referencias

- [PyTorch CUDA](https://pytorch.org/get-started/locally/)
- [Ollama GPU Support](https://github.com/ollama/ollama/blob/main/docs/gpu.md)
- [NVIDIA CUDA](https://developer.nvidia.com/cuda-downloads)
- [AMD ROCm](https://rocm.docs.amd.com/)
