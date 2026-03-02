# Alfred - Asistente Personal con IA Local

**Alfred** es un asistente de escritorio con inteligencia artificial que procesa tus documentos personales usando RAG (Retrieval-Augmented Generation). Toda la IA se ejecuta localmente en tu dispositivo - sin enviar datos a servicios externos.

![Version](https://img.shields.io/badge/version-0.0.25-blue)
![Electron](https://img.shields.io/badge/Electron-39.2.5-blue)
![Python](https://img.shields.io/badge/Python-3.12+-green)
![Node.js](https://img.shields.io/badge/Node.js-24.12.0+-green)
![License](https://img.shields.io/badge/License-Apache%202.0-blue)

---

## Características

### Inteligencia Artificial Local
- **RAG (Retrieval-Augmented Generation)** con ChromaDB para búsqueda vectorial
- **LLM Local**: Ollama con `gemma3n:e4b` para generación de respuestas
- **Embeddings**: `nomic-embed-text:v1.5` para búsqueda semántica
- **Historial inteligente** con búsqueda por similitud y cache de respuestas
- **Aceleración GPU**: Soporte automático para NVIDIA CUDA, AMD ROCm y Apple Silicon MPS

### Privacidad y Seguridad
- **100% local**: Sin conexiones a APIs externas ni envío de datos
- **Encriptación AES-256-GCM** para datos sensibles en base de datos SQLite
- **Gestión segura** de claves y datos personales

### Interfaz de Usuario
- **Electron Desktop App** con interfaz moderna y responsive
- **Chat con typewriter effect** y renderizado completo de Markdown
- **Soporte para tablas** con estilos profesionales y formato automático
- **Sistema de notificaciones** visuales y estado en tiempo real
- **Gestión de conversaciones** con historial persistente

### Arquitectura
- **Backend FastAPI** (Python) con API REST documentada
- **Frontend Electron** con gestión automática del ciclo de vida del backend
- **Modo desarrollo**: Usa Python del sistema con venv
- **Modo producción**: Python portable embebido en la aplicación empaquetada
- **Almacenamiento inteligente**: ChromaDB en AppData para evitar problemas de permisos

---

## Requisitos

### Software
- **Python**: 3.12+ (recomendado) o 3.8+
- **Node.js**: 22.20.0+ con npm/yarn
- **Ollama**: Para ejecutar modelos LLM localmente ([ollama.ai](https://ollama.ai))

### Hardware
- **RAM**: 8 GB mínimo (16 GB recomendado para modelos grandes)
- **Almacenamiento**: 20 GB libres (modelos + documentos + ChromaDB)
- **GPU** (opcional): NVIDIA/AMD/Apple Silicon para aceleración

### Modelos Ollama
```bash
ollama pull gemma3n:e4b
ollama pull nomic-embed-text:v1.5
```

---

## Inicio Rápido

### 1. Clonar e Instalar Dependencias

```bash
# Clonar repositorio
git clone https://github.com/Adalk033/Alfred.git
cd Alfred

# Instalar dependencias de Electron
npm install

# Configurar backend Python
cd backend
python -m venv venv

# Activar entorno virtual
# Windows PowerShell:
.\venv\Scripts\Activate.ps1
# Linux/macOS:
source venv/bin/activate

# Instalar dependencias Python
pip install -r requirements.txt
```

### 2. Descargar Modelos Ollama

```bash
ollama pull gemma3n:e4b
ollama pull nomic-embed-text:v1.5
```

### 3. Configurar Variables de Entorno (Opcional)

El backend funciona sin configuración gracias a valores por defecto. Para personalizar:

```bash
# En el directorio backend/
cp .env.example .env
# Editar .env si necesitas cambiar rutas o modelos
```

### 4. Ejecutar la Aplicación

```bash
# Desde la raíz del proyecto
npm start
```

La aplicación iniciará automáticamente el backend Python y abrirá la ventana de Electron.

### Modo Desarrollo

```bash
# Ejecutar con DevTools abierto
npm run dev

# Ejecutar solo el backend (para testing)
cd backend
python core/alfred_backend.py
# API disponible en http://127.0.0.1:8000/docs
```

---

## Tecnologías

### Backend
- **FastAPI**: Framework Python para API REST con documentación automática
- **LangChain**: Orquestación de LLMs y cadenas RAG
- **ChromaDB**: Base de datos vectorial para embeddings
- **Ollama**: Servidor de LLMs locales con soporte GPU
- **SQLite + Cryptography**: Persistencia con encriptación AES-256-GCM
- **Python-dotenv**: Gestión de configuración

### Frontend
- **Electron 38.2.2**: Framework multiplataforma para apps de escritorio
- **Vanilla JavaScript**: Sin dependencias de frameworks pesados
- **CSS Modular**: Arquitectura escalable por componentes

### DevOps & Tooling
- **electron-builder 26.0.12**: Empaquetado y distribución (NSIS, DMG, AppImage)
- **Python venv**: Aislamiento de dependencias en desarrollo
- **python-portable**: Python embebido para distribución

---

## Estructura del Proyecto

```
Alfred/
├── main.js                    # Proceso principal Electron
├── preload.js                 # Preload script (IPC bridge)
├── package.json               # Dependencias Node.js y build config
│
├── backend/                   # Backend FastAPI (Python)
│   ├── core/                  # Módulos principales
│   │   ├── alfred_backend.py  # API REST FastAPI
│   │   ├── alfred_core.py     # Lógica RAG principal
│   │   ├── vector_manager.py  # ChromaDB + embeddings
│   │   ├── document_loader.py # Carga de documentos
│   │   └── ...
│   ├── utils/                 # Utilidades
│   │   ├── paths.py          # Gestión de rutas con expandvars
│   │   ├── security.py       # Encriptación AES-256-GCM
│   │   └── logger.py         # Sistema de logs
│   ├── gpu/                   # GPU management
│   │   └── gpu_manager.py    # Auto-detección NVIDIA/AMD/Apple
│   ├── python-portable/       # Python embebido (solo producción)
│   ├── venv/                  # Virtual env (solo desarrollo)
│   ├── .env                   # Configuración local (gitignored)
│   ├── .env.example           # Plantilla de configuración
│   └── requirements.txt       # Dependencias Python
│
├── renderer/                  # Frontend Electron
│   ├── index.html            # UI principal
│   ├── renderer.js           # Lógica principal de UI
│   ├── api/
│   │   └── api.js           # Cliente API REST
│   ├── core/
│   │   ├── conversations.js  # Gestión de conversaciones
│   │   ├── dialogs.js       # Modales y diálogos
│   │   └── utils.js         # Utilidades generales
│   ├── dom/
│   │   ├── dom-utils.js     # Markdown parser con tablas
│   │   └── events.js        # Event handlers
│   └── styles/              # CSS modular
│
├── chroma_db/                 # ChromaDB (desarrollo, gitignored)
└── assets/                    # Iconos y recursos

# Datos persistentes en producción:
# Windows: C:\Users\<User>\AppData\Roaming\Alfred\
# Linux: ~/.alfred/
# macOS: ~/Library/Application Support/Alfred/
```

---

## Build y Distribución

### Empaquetar para Producción

```bash
# Windows (NSIS installer)
npm run build:win

# macOS (DMG)
npm run build:mac

# Linux (AppImage)
npm run build:linux
```

Los instaladores se generan en `dist/`.

### Diferencias Desarrollo vs Producción

| Aspecto | Desarrollo | Producción |
|---------|------------|------------|
| **Python** | Sistema + venv | python-portable embebido |
| **Backend** | Manual o npm start | Auto-spawn por Electron |
| **ChromaDB** | `./chroma_db` | `%AppData%\Alfred\data\chroma_store` |
| **Datos** | Rutas relativas | AppData (evita Program Files) |
| **Dependencias** | Instaladas en venv | Pre-instaladas en python-portable |

---

## Configuración

### Variables de Entorno (Opcional)

El backend funciona con valores por defecto. Para personalizar, crea `backend/.env`:

```bash
# Backend
cd backend
cp .env.example .env
```

Principales configuraciones:

```env
# Rutas de datos (se expanden automáticamente)
ALFRED_DATA_PATH=%AppData%\Alfred\data         # Windows
ALFRED_DATA_PATH=$HOME/.alfred/data            # Linux/macOS

# Modelos
ALFRED_MODEL=gemma3n:e4b
ALFRED_EMBEDDING_MODEL=nomic-embed-text:v1.5

# Servidor
ALFRED_HOST=127.0.0.1
ALFRED_PORT=8000

# GPU
ALFRED_FORCE_CPU=false                   # true = forzar CPU, false = usar GPU
ALFRED_DEVICE=auto                       # auto/cpu/cuda/mps

# Rendimiento
ALFRED_CHUNK_SIZE=1000                   # Tamaño de chunks de documento
ALFRED_CHUNK_OVERLAP=200                 # Superposición entre chunks
ALFRED_TOP_K=5                           # Documentos a recuperar por consulta

# Base de Datos
ALFRED_FORCE_RELOAD=false                # true = recargar docs en próximo inicio

# Logs
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

## Interfaz de Usuario

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

## Uso de la Aplicación

### Enviar Mensajes

1. Escribe tu pregunta en el campo de texto
2. Presiona Enter o haz clic en el botón ▶
3. Alfred procesará tu consulta y responderá

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

## Solución de Problemas

### Backend no inicia

```bash
# Verificar Python y dependencias
python --version
cd backend
pip install -r requirements.txt
```

### Ollama no responde

```bash
# Verificar servicio
ollama version
ollama list
```

### Puerto 8000 ocupado

```bash
# Windows
netstat -ano | findstr :8000
taskkill /PID <PID> /F

# Linux/macOS
lsof -i :8000
kill -9 <PID>
```

### GPU no detectada

```bash
# Ejecutar diagnóstico
python backend/gpu/gpu_check.py
cat backend/gpu/gpu_info.json
```

### Node.js no está instalado

**Solución:**
1. Descarga Node.js LTS desde [nodejs.org](https://nodejs.org/)
2. Instala marcando "Add to PATH"
3. Reinicia terminal
4. Verifica con `node --version`

### Dependencias no se instalan

```powershell
# Limpiar e reinstalar Node.js
rm -rf node_modules package-lock.json
npm cache clean --force
npm install

# Python
rm -rf backend/venv
python -m venv backend/venv
# Activar y reinstalar
pip install -r backend/requirements.txt
```

### Aplicación no carga

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

---

## Desarrollo y Personalización

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

## Dependencias

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

## Seguridad y Privacidad

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

## Características Futuras

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

## Contribuir

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

## Documentación Adicional

- **[backend/README.md](backend/README.md)**: Documentación del backend
- **[backend/gpu/GPU_SETUP.md](backend/gpu/GPU_SETUP.md)**: Configuración GPU
- **[backend/docs/QUICKSTART.md](backend/docs/QUICKSTART.md)**: Guía rápida del backend

---

## Licencia

Apache License 2.0 - Ver [LICENSE.txt](LICENSE.txt)

---

## Autor

**Adalk033** - [GitHub](https://github.com/Adalk033)

---

## Enlaces Útiles

- [Ollama](https://ollama.ai/) - Servidor LLM local
- [FastAPI](https://fastapi.tiangolo.com/) - Framework backend
- [Electron](https://www.electronjs.org/) - Framework desktop
- [LangChain](https://python.langchain.com/) - Framework LLM
- [ChromaDB](https://www.trychroma.com/) - Base de datos vectorial
