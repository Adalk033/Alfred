# Alfred - Checklist de Instalación y Configuración

Este documento proporciona una lista de verificación completa para asegurar que Alfred esté correctamente instalado y configurado.

## ✅ Requisitos de Sistema

### Software Base
- [ ] **Python 3.8+** instalado y en PATH
  ```bash
  python --version
  # o en Linux/macOS: python3 --version
  ```

- [ ] **Node.js (LTS)** instalado y en PATH
  ```bash
  node --version
  npm --version
  ```

- [ ] **Ollama** instalado y en PATH
  ```bash
  ollama version
  ```

### Modelos de IA
- [ ] **gemma2:9b** descargado
  ```bash
  ollama list | grep gemma2:9b
  ```

- [ ] **nomic-embed-text:v1.5** descargado
  ```bash
  ollama list | grep nomic-embed-text
  ```

### GPU (Opcional)
- [ ] **PyTorch con soporte GPU** (si tienes GPU)
  ```bash
  python backend/gpu/gpu_check.py
  ```
  Verifica que `gpu_available: true` en `backend/gpu/gpu_info.json`

---

## ✅ Estructura de Archivos

### Archivos Raíz
- [ ] `.env.template` existe
- [ ] `.env` creado y configurado
- [ ] `stP.ps1` existe (Windows)
- [ ] `stP.sh` existe y tiene permisos de ejecución (Linux/macOS)
- [ ] `main.js` existe
- [ ] `preload.js` existe
- [ ] `package.json` existe

### Directorio Backend
- [ ] `backend/` existe
- [ ] `backend/requirements.txt` existe
- [ ] `backend/core/alfred_backend.py` existe
- [ ] `backend/core/alfred_core.py` existe
- [ ] `backend/gpu/gpu_manager.py` existe
- [ ] `backend/gpu/gpu_check.py` existe
- [ ] `backend/utils/logger.py` existe

### Directorio Frontend
- [ ] `renderer/` existe
- [ ] `renderer/index.html` existe
- [ ] `renderer/renderer.js` existe
- [ ] `renderer/styles/main.css` existe

---

## ✅ Configuración de Entorno

### Archivo .env
- [ ] Archivo `.env` existe en la raíz
- [ ] `ALFRED_HOST=127.0.0.1` configurado
- [ ] `ALFRED_PORT=8000` configurado
- [ ] `ALFRED_DOCS_PATH` apunta a carpeta válida
- [ ] `ALFRED_MODEL=gemma2:9b` configurado
- [ ] `ALFRED_EMBEDDING_MODEL=nomic-embed-text:v1.5` configurado

#### Ejemplo de .env Válido
```env
ALFRED_HOST=127.0.0.1
ALFRED_PORT=8000
ALFRED_DOCS_PATH=/home/user/Documents  # Tu ruta
ALFRED_MODEL=gemma2:9b
ALFRED_EMBEDDING_MODEL=nomic-embed-text:v1.5
ALFRED_FORCE_CPU=false
ALFRED_DEVICE=auto
```

### Variables de Entorno del Sistema (Opcional)
- [ ] `OLLAMA_HOST` configurado si Ollama está en otro puerto
- [ ] `CUDA_VISIBLE_DEVICES` configurado si tienes múltiples GPUs

---

## ✅ Entorno Virtual de Python

### Creación
- [ ] Entorno virtual creado en `backend/venv/`
  ```bash
  # Verificar existencia
  ls backend/venv/Scripts/activate  # Windows
  ls backend/venv/bin/activate      # Linux/macOS
  ```

### Activación
- [ ] Entorno virtual se puede activar
  ```powershell
  # Windows
  backend\venv\Scripts\Activate.ps1
  
  # Linux/macOS
  source backend/venv/bin/activate
  ```

### Dependencias
- [ ] Todas las dependencias instaladas
  ```bash
  pip list | grep fastapi
  pip list | grep langchain
  pip list | grep chromadb
  pip list | grep torch
  ```

---

## ✅ Dependencias Node.js

- [ ] `node_modules/` existe
- [ ] Electron instalado
  ```bash
  npm list electron
  ```
- [ ] Todas las dependencias instaladas
  ```bash
  npm list --depth=0
  ```

---

## ✅ Servicios en Ejecución

### Ollama
- [ ] Servicio Ollama corriendo
  ```bash
  ollama list
  ```

- [ ] Ollama responde en `http://localhost:11434`
  ```bash
  curl http://localhost:11434/api/version
  ```

### Backend de Alfred (Durante Ejecución)
- [ ] Backend responde en `http://127.0.0.1:8000`
  ```bash
  curl http://127.0.0.1:8000/health
  ```

- [ ] Endpoint `/docs` accesible
  ```
  http://127.0.0.1:8000/docs
  ```

---

## ✅ Pruebas Funcionales

### Test de GPU
```bash
python backend/gpu/gpu_check.py
```
- [ ] Script ejecuta sin errores
- [ ] Archivo `backend/gpu/gpu_info.json` se crea
- [ ] GPU detectada correctamente (o CPU fallback)

### Test de Backend Manual
```bash
# Activar entorno virtual
source backend/venv/bin/activate  # Linux/macOS
backend\venv\Scripts\Activate.ps1 # Windows

# Iniciar backend manualmente
python backend/core/alfred_backend.py
```
- [ ] Backend inicia sin errores
- [ ] Ve mensaje "Uvicorn running on http://127.0.0.1:8000"
- [ ] No hay errores de importación

### Test de Frontend
```bash
npm start
```
- [ ] Electron abre ventana
- [ ] Backend se inicia automáticamente
- [ ] Interfaz de chat se carga
- [ ] No hay errores en consola (F12)

### Test de Consulta
- [ ] Puedes hacer una pregunta en el chat
- [ ] Alfred responde en español
- [ ] La respuesta es coherente
- [ ] No hay errores en los logs

---

## ✅ Verificación de Permisos

### Windows
- [ ] Política de ejecución permite scripts PowerShell
  ```powershell
  Get-ExecutionPolicy
  # Debe ser: RemoteSigned o Unrestricted
  ```

- [ ] Usuario tiene permisos de lectura/escritura en:
  - [ ] `%APPDATA%\Alfred\`
  - [ ] Carpeta del proyecto

### Linux/macOS
- [ ] Script `stP.sh` tiene permisos de ejecución
  ```bash
  chmod +x stP.sh
  ```

- [ ] Usuario tiene permisos de lectura/escritura en:
  - [ ] `~/.alfred/`
  - [ ] Carpeta del proyecto

---

## ✅ Verificación de Logs

### Logs del Backend
- [ ] Archivo de log se crea en `backend/logs/alfred.log`
- [ ] No hay errores críticos en el log
- [ ] Nivel de log es INFO o DEBUG

### Logs de Electron
- [ ] Consola de DevTools (F12) sin errores JavaScript
- [ ] Terminal muestra logs de inicio sin errores

---

## ✅ Verificación de Red

### Firewall
- [ ] Puerto 8000 no está bloqueado
- [ ] Puerto 11434 no está bloqueado (Ollama)

### Conexiones Locales
- [ ] `127.0.0.1` resuelve correctamente
  ```bash
  ping 127.0.0.1
  ```

---

## ✅ Verificación de Datos

### Base de Datos
- [ ] Archivo SQLite creado en ubicación correcta
  - Windows: `%APPDATA%\Alfred\db\alfred.db`
  - Linux/macOS: `~/.alfred/db/alfred.db`

### ChromaDB
- [ ] Directorio `chroma_db/` creado
- [ ] Archivo `chroma_db/chroma.sqlite3` existe

### Documentos
- [ ] Ruta en `ALFRED_DOCS_PATH` existe
- [ ] Contiene documentos para procesar
- [ ] Usuario tiene permisos de lectura

---

## ✅ Características Avanzadas

### Encriptación
- [ ] Archivo `secret.key` generado en:
  - Windows: `%APPDATA%\Alfred\data\secret.key`
  - Linux/macOS: `~/.alfred/data/secret.key`

### Historial Q&A
- [ ] Historial se guarda en base de datos
- [ ] Búsquedas en historial funcionan
- [ ] Datos personales se encriptan

### Markdown y Tablas
- [ ] Respuestas con formato Markdown se renderizan
- [ ] Tablas se muestran correctamente
- [ ] Código se resalta con sintaxis

---

## 🐛 Solución de Problemas Comunes

### Python no encontrado
```powershell
# Windows - Agregar a PATH
$env:Path += ";C:\Python311\"

# Linux/macOS - Usar python3
alias python=python3
```

### Ollama no responde
```bash
# Reiniciar servicio
# Windows
ollama serve

# Linux
systemctl --user restart ollama

# macOS
brew services restart ollama
```

### GPU no detectada
```bash
# Verificar instalación de PyTorch
pip show torch

# Reinstalar con soporte CUDA (NVIDIA)
pip install torch --index-url https://download.pytorch.org/whl/cu118

# O forzar CPU en .env
ALFRED_FORCE_CPU=true
```

### Puerto 8000 ocupado
```bash
# Windows - Encontrar proceso
netstat -ano | findstr :8000
taskkill /PID <PID> /F

# Linux/macOS - Encontrar proceso
lsof -i :8000
kill -9 <PID>
```

### Errores de dependencias
```bash
# Limpiar e reinstalar
rm -rf backend/venv
python -m venv backend/venv
source backend/venv/bin/activate
pip install -r backend/requirements.txt
```

---

## 📋 Checklist Rápido de Inicio

Antes de cada uso:

1. [ ] Ollama está corriendo (`ollama list`)
2. [ ] Puerto 8000 está libre
3. [ ] `.env` está configurado
4. [ ] Documentos están accesibles

Luego ejecuta:
```powershell
# Windows
.\stP.ps1

# Linux/macOS
./stP.sh
```

---

## ✅ Validación Completa con Script

Para validar todo automáticamente, ejecuta el script de inicio:

```powershell
# Windows con verificación completa
.\stP.ps1

# Linux/macOS
./stP.sh
```

El script verificará automáticamente:
- ✅ Python instalado
- ✅ Node.js instalado
- ✅ Ollama instalado y corriendo
- ✅ Modelos descargados
- ✅ Entorno virtual creado
- ✅ Dependencias instaladas
- ✅ GPU detectada
- ✅ `.env` configurado
- ✅ Backend y frontend listos

Si todos los checks pasan, Alfred iniciará automáticamente.

---

**Última actualización**: Octubre 2025
