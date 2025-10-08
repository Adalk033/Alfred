# 📊 Guía: Cómo Verificar el Uso de GPU en Alfred

Esta guía te muestra **todas las formas** de verificar si Alfred está usando tu GPU correctamente.

## ✅ Estado Actual

**GPU Detectada:** NVIDIA GeForce RTX 4060 (8.59 GB)  
**Estado:** ✓ Funcionando correctamente  
**CUDA Version:** 11.8

---

## 🔍 Métodos de Verificación

### **Método 1: Demo de GPU (Más Rápido)**

Este script realiza una verificación completa y rápida:

```powershell
python demo_gpu.py
```

**Qué muestra:**
- ✓ Detección de hardware
- ✓ Información de la GPU
- ✓ Configuración de Ollama
- ✓ Prueba de operación en GPU
- ✓ Uso de memoria

**Resultado esperado:** Deberías ver "GPU detectada: SÍ" y operaciones exitosas en CUDA.

---

### **Método 2: Monitor en Tiempo Real (Python)**

Para ver el uso de GPU mientras Alfred está corriendo:

```powershell
# En una terminal separada
python monitor_gpu_usage.py
```

**Características:**
- Actualización cada 2 segundos
- Muestra memoria asignada y reservada
- Porcentaje de uso
- Presiona Ctrl+C para detener

**Uso personalizado:**
```powershell
# Actualizar cada 5 segundos
python monitor_gpu_usage.py 5
```

---

### **Método 3: NVIDIA System Management Interface (nvidia-smi)**

La herramienta oficial de NVIDIA para monitorear GPU:

#### **Comando Único:**
```powershell
nvidia-smi
```

**Muestra:**
- Uso de GPU (%)
- Memoria usada vs total
- Temperatura
- Procesos activos usando GPU
- Consumo de energía

#### **Monitor Continuo:**
```powershell
# Actualizar cada 2 segundos
nvidia-smi -l 2
```

#### **Monitor Automático (Script PowerShell):**
```powershell
.\monitor_gpu.ps1
```

Este script formatea mejor la información y actualiza automáticamente.

---

### **Método 4: Verificar Procesos Usando GPU**

Para ver qué procesos específicamente están usando la GPU:

```powershell
nvidia-smi --query-compute-apps=pid,process_name,used_memory --format=csv
```

**Buscar procesos de Alfred/Ollama:**
```powershell
nvidia-smi | Select-String -Pattern "ollama|python|alfred"
```

---

### **Método 5: Administrador de Tareas de Windows**

1. Abre el **Administrador de Tareas** (Ctrl+Shift+Esc)
2. Ve a la pestaña **Rendimiento**
3. Selecciona **GPU** en el panel izquierdo

**Qué ver:**
- **GPU 0 - 3D:** Procesamiento general
- **GPU 0 - Compute:** Computación (esto es lo que usa Alfred)
- **Memoria GPU dedicada:** Cuánta memoria está siendo utilizada

Cuando Alfred/Ollama estén procesando, verás:
- 📈 Aumento en "Compute"
- 💾 Aumento en "Memoria GPU dedicada"

---

### **Método 6: Dentro de Alfred (Programático)**

Si quieres verificar desde código Python:

```python
from gpu_manager import get_gpu_manager

# Obtener gestor
gpu = get_gpu_manager()

# Verificar si está usando GPU
print(f"GPU disponible: {gpu.has_gpu}")
print(f"Dispositivo: {gpu.device}")
print(f"Tipo: {gpu.device_type}")

# Ver uso de memoria en tiempo real
if gpu.has_gpu:
    mem = gpu.get_memory_usage()
    print(f"Memoria usada: {mem['allocated']:.2f} GB")
    print(f"Memoria reservada: {mem['reserved']:.2f} GB")
```

---

## 🎯 Señales de que la GPU SÍ se está Usando

### **En Ollama:**
- ✓ Al iniciar Ollama, verás: `"GPU available: true"`
- ✓ Los modelos se cargan en GPU: `"loaded model into GPU"`
- ✓ nvidia-smi muestra proceso "ollama" activo

### **En Alfred:**
- ✓ `demo_gpu.py` muestra "GPU detectada: SÍ"
- ✓ PyTorch device es "cuda", no "cpu"
- ✓ Las operaciones se ejecutan más rápido
- ✓ nvidia-smi muestra uso de memoria GPU cuando procesas consultas

### **Diferencia de Rendimiento:**
| Operación | Con GPU (RTX 4060) | Sin GPU (CPU) |
|-----------|-------------------|---------------|
| Cargar modelo | 2-5 seg | 10-30 seg |
| Consulta simple | 0.5-2 seg | 5-15 seg |
| Documentos grandes | 3-8 seg | 20-60 seg |

---

## 🔧 Troubleshooting

### **Si no detecta la GPU:**

1. **Verificar drivers NVIDIA:**
   ```powershell
   nvidia-smi
   ```
   Si no funciona, actualiza drivers desde: https://www.nvidia.com/Download/index.aspx

2. **Verificar PyTorch con CUDA:**
   ```powershell
   python -c "import torch; print(f'CUDA disponible: {torch.cuda.is_available()}')"
   ```

3. **Reinstalar PyTorch con CUDA:**
   ```powershell
   pip uninstall torch torchvision torchaudio
   pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118
   ```

4. **Verificar variables de entorno de Ollama:**
   ```powershell
   $env:OLLAMA_GPU
   ```
   Debería ser "1"

---

## 📈 Comandos Útiles Rápidos

```powershell
# Verificación rápida
python demo_gpu.py

# Monitor mientras usas Alfred
python monitor_gpu_usage.py

# Ver uso actual
nvidia-smi

# Ver procesos específicos
nvidia-smi pmon

# Ver solo memoria
nvidia-smi --query-gpu=memory.used,memory.total --format=csv

# Temperatura
nvidia-smi --query-gpu=temperature.gpu --format=csv,noheader

# Monitor continuo cada 1 segundo
nvidia-smi -l 1
```

---

## 💡 Recomendaciones para Tu RTX 4060

Con 8.59 GB de VRAM, puedes usar cómodamente:

### **Modelos Recomendados:**
- ✓ **qwen2.5:7b** (actual) - Óptimo
- ✓ **gemma2:9b** - Excelente rendimiento
- ✓ **llama3:8b** - Muy bueno
- ✓ **mixtral:8x7b** (cuantizado) - Si quieres más poder

### **Configuraciones Óptimas:**
```python
# En config.py
OLLAMA_MODEL = "qwen2.5:7b"  # o gemma2:9b
CHUNK_SIZE = 1000
K_RETRIEVER = 5  # Puedes aumentar a 7-10 con tu GPU
```

### **Para Aprovechar al Máximo:**
- Procesar documentos más grandes
- Usar más contexto (k=7 o k=10)
- Modelos de embedding más potentes

---

## 🎬 Flujo de Trabajo Recomendado

1. **Antes de iniciar Alfred:**
   ```powershell
   python demo_gpu.py
   ```
   → Verifica que GPU está disponible

2. **Iniciar monitor (terminal 1):**
   ```powershell
   python monitor_gpu_usage.py
   ```

3. **Iniciar Alfred (terminal 2):**
   ```powershell
   python alfred.py
   ```

4. **Observar el uso de GPU en el monitor** mientras haces consultas

---

## 📞 Soporte

Si la GPU no se detecta:
1. Ejecuta: `python demo_gpu.py` y guarda la salida
2. Ejecuta: `nvidia-smi` y guarda la salida
3. Verifica que Ollama esté configurado: `ollama show qwen2.5:7b`

**Tu configuración actual está funcionando correctamente** ✓
