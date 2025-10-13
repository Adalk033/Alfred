# 📚 Índice de Documentación - Alfred

Bienvenido a la documentación completa de Alfred, tu asistente personal inteligente local y privado.

---

## 🚀 Inicio Rápido

**¿Primera vez con Alfred?** Comienza aquí:

### Para Usuarios Nuevos
1. **[QUICKSTART_V2.md](./QUICKSTART_V2.md)** - Guía de inicio rápido (5-10 minutos)
   - Requisitos del sistema
   - Instalación automática con scripts universales
   - Primera configuración
   - Tu primera consulta

### Para Instalación Manual
2. **[CHECKLIST_INSTALACION.md](./CHECKLIST_INSTALACION.md)** - Lista de verificación completa
   - Checklist paso a paso
   - Validación de instalación
   - Pruebas funcionales
   - Solución de problemas

---

## 🖥️ Entornos Específicos

### Máquinas Virtuales
3. **[GUIA_VM_WINDOWS.md](./GUIA_VM_WINDOWS.md)** - Guía completa para VMs Windows
   - Configuración de VM
   - GPU Passthrough
   - Optimización de rendimiento
   - Monitoreo de recursos
   - Solución de problemas en VM

### Diferentes Sistemas Operativos
- **Windows**: Usar `stP.ps1`
- **Linux**: Usar `stP.sh`
- **macOS**: Usar `stP.sh`

---

## 📖 Documentación Técnica

### Arquitectura y Estructura

4. **[ESTRUCTURA_ESTANDARIZADA.md](./ESTRUCTURA_ESTANDARIZADA.md)** - Estructura oficial del proyecto
   - Árbol completo de directorios
   - Convenciones de nombres
   - Gestión de rutas multiplataforma
   - Variables de entorno

5. **[RESUMEN_CAMBIOS.md](./RESUMEN_CAMBIOS.md)** - Cambios en versión 2.0
   - Nuevas características
   - Scripts de arranque universal
   - Archivos creados y modificados
   - Guía de migración

### Backend (Python + FastAPI)

6. **[backend/docs/README.md](./backend/docs/README.md)** - Documentación del backend
   - API REST con FastAPI
   - Sistema RAG (Retrieval-Augmented Generation)
   - ChromaDB para embeddings
   - Integración con Ollama

7. **[backend/docs/QUICKSTART.md](./backend/docs/QUICKSTART.md)** - Inicio rápido del backend
   - Ejecutar solo el backend
   - Endpoints disponibles
   - Ejemplos de uso

### GPU y Aceleración

8. **[backend/gpu/GPU_SETUP.md](./backend/gpu/GPU_SETUP.md)** - Configuración de GPU
   - NVIDIA CUDA
   - AMD ROCm
   - Apple Silicon (MPS)
   - Solución de problemas

9. **[backend/gpu/GPU_IMPLEMENTATION.md](./backend/gpu/GPU_IMPLEMENTATION.md)** - Detalles de implementación
   - Cómo funciona la detección
   - Integración con PyTorch
   - Configuración de Ollama

10. **[backend/gpu/GPU_MONITORING_GUIDE.md](./backend/gpu/GPU_MONITORING_GUIDE.md)** - Monitoreo de GPU
    - Scripts de monitoreo
    - Métricas importantes
    - Herramientas de diagnóstico

11. **[backend/gpu/OPTIMIZATION_GUIDE.md](./backend/gpu/OPTIMIZATION_GUIDE.md)** - Optimización
    - Mejores prácticas
    - Configuración avanzada
    - Troubleshooting de rendimiento

---

## 🔧 Configuración

### Archivos de Configuración

12. **[.env.template](./.env.template)** - Plantilla de configuración
    - Variables de entorno disponibles
    - Valores por defecto
    - Comentarios explicativos

### Scripts de Arranque

13. **[stP.ps1](./stP.ps1)** - Script universal Windows
    - Verificación automática
    - Instalación de dependencias
    - Detección de GPU
    - Inicio de servicios

14. **[stP.sh](./stP.sh)** - Script universal Linux/macOS
    - Mismas funcionalidades que Windows
    - Compatible con diferentes distros
    - Soporte para gestores de paquetes

---

## 🎨 Frontend (Electron)

### Interfaz de Usuario

15. **[README.md](./README.md)** - Documentación principal
    - Descripción del proyecto
    - Características principales
    - Arquitectura general
    - Licencia

### Desarrollo Frontend

- `renderer/` - Código del frontend
  - `index.html` - UI principal
  - `renderer.js` - Lógica principal
  - `styles/` - Estilos CSS
  - `api/` - Cliente API
  - `core/` - Lógica de negocio

---

## 📊 Casos de Uso

### Documentos Markdown Especiales

16. **Tablas en Markdown** - Renderizado de tablas
    - Sintaxis de tablas
    - Estilos personalizados
    - Ejemplos de uso

---

## 🛠️ Scripts Útiles

### PowerShell (Windows)

```powershell
# Instalación y arranque completo
.\stP.ps1

# Arranque sin verificaciones (más rápido)
.\stP.ps1 -SkipChecks

# Modo verbose para debugging
.\stP.ps1 -Verbose

# Scripts legacy
.\start.ps1                  # Script original (mantener para compatibilidad)
.\clean-install.ps1          # Limpieza e instalación
.\diagnostico.ps1            # Diagnóstico de sistema
.\install-pytorch-gpu.ps1    # Instalación manual de PyTorch con GPU
```

### Bash (Linux/macOS)

```bash
# Instalación y arranque completo
./stP.sh

# Scripts backend específicos
cd backend

# Detección de GPU
python gpu/gpu_check.py

# Test de GPU
python gpu/test_gpu.py

# Monitor de GPU
python gpu/monitor_gpu_usage.py

# Test de Ollama con GPU
python gpu/test_ollama_gpu.py
```

### NPM (Frontend)

```bash
# Iniciar aplicación Electron
npm start

# Modo desarrollo con DevTools
npm run dev

# Instalar dependencias
npm install

# Limpiar node_modules
rm -rf node_modules
npm install
```

---

## 🧪 Testing y Diagnóstico

### Scripts de Prueba

```powershell
# Backend
cd backend
python core/alfred_backend.py        # Iniciar backend manualmente
python -m pytest tests/              # Ejecutar tests unitarios

# GPU
python gpu/gpu_check.py              # Detección de GPU
python gpu/test_gpu.py               # Test de GPU
python gpu/test_ollama_gpu.py        # Test de Ollama con GPU

# Conexión
node test-connection.js              # Test de conexión frontend-backend
```

### Diagnóstico del Sistema

```powershell
# Windows
.\diagnostico.ps1                    # Diagnóstico completo del sistema

# Verificar servicios
ollama version                       # Verificar Ollama
python --version                     # Verificar Python
node --version                       # Verificar Node.js

# Verificar conectividad
curl http://127.0.0.1:8000/health    # Backend health check
curl http://localhost:11434/api/version  # Ollama health check
```

---

## 📝 Referencia Rápida

### Comandos Comunes

| Acción | Windows | Linux/macOS |
|--------|---------|-------------|
| Iniciar Alfred | `.\stP.ps1` | `./stP.sh` |
| Backend solo | `python backend/core/alfred_backend.py` | `python3 backend/core/alfred_backend.py` |
| Frontend solo | `npm start` | `npm start` |
| Verificar GPU | `python backend/gpu/gpu_check.py` | `python3 backend/gpu/gpu_check.py` |
| Verificar Ollama | `ollama list` | `ollama list` |
| Logs backend | `Get-Content backend/logs/alfred.log -Tail 50` | `tail -f backend/logs/alfred.log` |

### Puertos y URLs

| Servicio | Puerto | URL |
|----------|--------|-----|
| Backend FastAPI | 8000 | http://127.0.0.1:8000 |
| API Docs | 8000 | http://127.0.0.1:8000/docs |
| Ollama | 11434 | http://localhost:11434 |
| Health Check Backend | 8000 | http://127.0.0.1:8000/health |
| Health Check Ollama | 11434 | http://localhost:11434/api/version |

### Variables de Entorno Importantes

| Variable | Valor por Defecto | Descripción |
|----------|-------------------|-------------|
| `ALFRED_HOST` | 127.0.0.1 | Host del servidor |
| `ALFRED_PORT` | 8000 | Puerto del servidor |
| `ALFRED_DOCS_PATH` | (requerido) | Ruta a documentos |
| `ALFRED_MODEL` | gemma2:9b | Modelo LLM principal |
| `ALFRED_EMBEDDING_MODEL` | nomic-embed-text:v1.5 | Modelo de embeddings |
| `ALFRED_FORCE_CPU` | false | Forzar uso de CPU |
| `ALFRED_DEVICE` | auto | Dispositivo: auto/cpu/cuda/mps |

### Estructura de Carpetas Clave

```
AlfredElectron/
├── .env                      # Tu configuración local
├── stP.ps1 / stP.sh          # Scripts de arranque
├── backend/
│   ├── venv/                 # Entorno virtual Python
│   ├── core/                 # Backend principal
│   ├── gpu/                  # Gestión de GPU
│   └── utils/                # Utilidades
├── renderer/                 # Frontend Electron
└── chroma_db/                # Base de datos vectorial
```

---

## 🆘 Ayuda y Soporte

### Solución de Problemas

1. **[CHECKLIST_INSTALACION.md](./CHECKLIST_INSTALACION.md)** - Sección "Solución de problemas comunes"
2. **[GUIA_VM_WINDOWS.md](./GUIA_VM_WINDOWS.md)** - Sección "Solución de Problemas en VM"
3. **[backend/gpu/GPU_SETUP.md](./backend/gpu/GPU_SETUP.md)** - Troubleshooting de GPU

### Documentación en Línea

- **Ollama**: https://ollama.ai/
- **FastAPI**: https://fastapi.tiangolo.com/
- **Electron**: https://www.electronjs.org/
- **LangChain**: https://python.langchain.com/
- **ChromaDB**: https://www.trychroma.com/

### Logs y Debugging

```powershell
# Ver logs en tiempo real
# Windows
Get-Content backend/logs/alfred.log -Wait -Tail 50

# Linux/macOS
tail -f backend/logs/alfred.log

# Electron DevTools
# Presionar F12 en la aplicación
```

---

## 📌 Documentos por Categoría

### 🎯 Para Empezar (Nuevos Usuarios)
- [QUICKSTART_V2.md](./QUICKSTART_V2.md)
- [CHECKLIST_INSTALACION.md](./CHECKLIST_INSTALACION.md)

### 🖥️ Configuración de Entorno
- [GUIA_VM_WINDOWS.md](./GUIA_VM_WINDOWS.md)
- [.env.template](./.env.template)
- [ESTRUCTURA_ESTANDARIZADA.md](./ESTRUCTURA_ESTANDARIZADA.md)

### ⚙️ Desarrollo y Arquitectura
- [RESUMEN_CAMBIOS.md](./RESUMEN_CAMBIOS.md)
- [backend/docs/README.md](./backend/docs/README.md)
- [README.md](./README.md)

### 🎮 GPU y Rendimiento
- [backend/gpu/GPU_SETUP.md](./backend/gpu/GPU_SETUP.md)
- [backend/gpu/GPU_IMPLEMENTATION.md](./backend/gpu/GPU_IMPLEMENTATION.md)
- [backend/gpu/GPU_MONITORING_GUIDE.md](./backend/gpu/GPU_MONITORING_GUIDE.md)
- [backend/gpu/OPTIMIZATION_GUIDE.md](./backend/gpu/OPTIMIZATION_GUIDE.md)

### 🐛 Troubleshooting
- Ver secciones de "Solución de problemas" en:
  - CHECKLIST_INSTALACION.md
  - GUIA_VM_WINDOWS.md
  - GPU_SETUP.md

---

## 🔄 Actualizaciones y Cambios

- **Versión actual**: 2.0.0
- **Última actualización**: Octubre 2025
- **Cambios principales**: Ver [RESUMEN_CAMBIOS.md](./RESUMEN_CAMBIOS.md)

---

## 📄 Licencia

Este proyecto está bajo la misma licencia que Alfred. Ver [backend/docs/LICENSE](./backend/docs/LICENSE).

---

## 🤝 Contribuciones

Para contribuir al proyecto:
1. Fork el repositorio
2. Crea una rama para tu feature
3. Sigue las convenciones de código en [ESTRUCTURA_ESTANDARIZADA.md](./ESTRUCTURA_ESTANDARIZADA.md)
4. Envía un Pull Request

---

**¿Tienes preguntas?** Consulta primero la documentación relevante arriba o abre un issue en GitHub.

**¡Disfruta de Alfred!** 🚀
