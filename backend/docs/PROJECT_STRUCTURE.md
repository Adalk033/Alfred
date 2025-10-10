# 📁 Estructura del Proyecto Alfred Backend

## 🎯 Resumen

Alfred ahora funciona como un **backend API REST** completo, diseñado específicamente para ser consumido desde aplicaciones C# u otros clientes.

## 📂 Archivos Principales

### Backend API (Nuevo)

| Archivo | Descripción |
|---------|-------------|
| **`alfred_backend.py`** | 🚀 **Servidor FastAPI principal** - Contiene todos los endpoints REST |
| **`alfred_core.py`** | 🧠 **Lógica de negocio** - Procesamiento de documentos, búsquedas, LLM |
| **`config.py`** | ⚙️ Configuración y prompts del sistema |
| **`functionsToHistory.py`** | 📝 Gestión del historial de conversaciones |

### Configuración y Scripts

| Archivo | Descripción |
|---------|-------------|
| **`.env.example`** | 📋 Plantilla de configuración (cópiala como `.env`) |
| **`start_alfred_server.ps1`** | 🎬 Script PowerShell para iniciar el servidor fácilmente |
| **`test_backend.py`** | ✅ Suite de pruebas para validar el backend |

### Cliente C#

| Archivo | Descripción |
|---------|-------------|
| **`AlfredClient.cs`** | 🔌 Cliente completo en C# para consumir el API |

### Documentación

| Archivo | Descripción |
|---------|-------------|
| **`QUICKSTART.md`** | ⚡ Guía de inicio rápido (empieza aquí) |
| **`README_BACKEND.md`** | 📖 Documentación completa del backend |
| **`DEPLOYMENT.md`** | 🚢 Guía de deployment y configuración avanzada |
| **`README.md`** | 📄 README original del proyecto |

### Legacy (Modo CLI)

| Archivo | Descripción |
|---------|-------------|
| **`alfred.py`** | 💻 Versión CLI original (ahora redirige al backend) |
| **`api_backend.py`** | 🗑️ Versión antigua (reemplazada por `alfred_backend.py`) |

## 🗺️ Flujo de Trabajo

```
┌─────────────────────────────────────────────────────────┐
│                  Aplicación C#                          │
│              (WinForms/WPF/Blazor/etc.)                 │
└───────────────────┬─────────────────────────────────────┘
                    │ HTTP/REST
                    ↓
┌─────────────────────────────────────────────────────────┐
│            alfred_backend.py (FastAPI)                  │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Endpoints: /query, /history, /stats, etc.       │  │
│  └───────────────────────────────────────────────────┘  │
└───────────────────┬─────────────────────────────────────┘
                    │
                    ↓
┌─────────────────────────────────────────────────────────┐
│              alfred_core.py (Lógica)                    │
│  ┌───────────────────────────────────────────────────┐  │
│  │  • Carga de documentos                            │  │
│  │  • Embeddings (ChromaDB)                          │  │
│  │  • Búsqueda semántica                             │  │
│  │  • Generación de respuestas (LLM)                 │  │
│  │  • Extracción de datos personales                 │  │
│  └───────────────────────────────────────────────────┘  │
└───────────────────┬─────────────────────────────────────┘
                    │
                    ↓
          ┌─────────┴──────────┐
          ↓                    ↓
┌──────────────────┐  ┌─────────────────┐
│   ChromaDB       │  │  Ollama (LLM)   │
│ (Base vectorial) │  │  • gemma2:9b    │
│  • Embeddings    │  │  • nomic-embed  │
│  • Búsqueda      │  └─────────────────┘
└──────────────────┘
```

## 🚀 Guía de Uso Rápida

### Paso 1: Configurar

```powershell
# Copia el archivo de configuración
Copy-Item .env.example .env

# Edita y configura ALFRED_DOCS_PATH
notepad .env
```

### Paso 2: Iniciar el Servidor

```powershell
# Opción A: Con script (recomendado)
.\start_alfred_server.ps1

# Opción B: Manualmente
python alfred_backend.py
```

### Paso 3: Probar

```powershell
# Ejecutar pruebas automáticas
python test_backend.py

# O abrir en el navegador
Start-Process "http://localhost:8000/docs"
```

### Paso 4: Integrar con C#

```csharp
using AlfredApiClient;

var client = new AlfredClient("http://localhost:8000");
var response = await client.QueryAsync("¿Cuál es mi RFC?");
Console.WriteLine(response.Answer);
```

## 📊 Arquitectura del Backend

### Componentes

1. **FastAPI** (`alfred_backend.py`)
   - Servidor web asíncrono
   - Endpoints REST
   - Documentación automática (Swagger/OpenAPI)
   - CORS habilitado

2. **Alfred Core** (`alfred_core.py`)
   - Gestión del LLM (Ollama)
   - Vectorstore (ChromaDB)
   - Procesamiento de documentos
   - Búsqueda semántica

3. **Base de Datos**
   - ChromaDB (vectores para búsqueda semántica)
   - JSON (historial de conversaciones)

4. **Ollama** (Externo)
   - LLM para generación de respuestas
   - Embeddings para búsqueda

## 🔌 Endpoints del API

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/` | Información del servicio |
| GET | `/health` | Estado de salud |
| GET | `/stats` | Estadísticas de la BD |
| POST | `/query` | **Consultar a Alfred** |
| GET | `/history` | Obtener historial |
| POST | `/history/search` | Buscar en historial |
| POST | `/history/save` | Guardar en historial |
| POST | `/reload` | Recargar documentos |
| GET | `/documents/test` | Prueba de búsqueda |

### Endpoint Más Importante: `/query`

```json
POST /query
{
  "question": "¿Cuál es mi RFC?",
  "use_history": true,
  "save_response": false
}

Response:
{
  "answer": "Tu RFC es: ABCD123456XYZ",
  "personal_data": {
    "RFC": "ABCD123456XYZ"
  },
  "sources": ["documento1.pdf", "documento2.txt"],
  "from_history": false,
  "context_count": 5
}
```

## 🔧 Variables de Entorno

```env
# Esenciales
ALFRED_DOCS_PATH=C:\Users\Usuario\Documents  # Ruta a documentos
ALFRED_USER_NAME=Tu Nombre                   # Tu nombre

# Servidor
ALFRED_HOST=127.0.0.1                          # Host del servidor
ALFRED_PORT=8000                             # Puerto

# Modelos
ALFRED_MODEL=gemma2:9b                       # Modelo LLM
ALFRED_EMBEDDING_MODEL=nomic-embed-text:v1.5 # Modelo embeddings

# Opciones
ALFRED_DEBUG=false                           # Modo debug
ALFRED_FORCE_RELOAD=false                    # Forzar recarga docs
```

## 📚 Documentación

### Para Comenzar
1. **`QUICKSTART.md`** ← **Empieza aquí**
2. `README_BACKEND.md` - Documentación detallada
3. `DEPLOYMENT.md` - Deployment y configuración avanzada

### Documentación Interactiva
Con el servidor corriendo:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

## 🧪 Testing

```powershell
# Suite completa de pruebas
python test_backend.py

# Prueba manual
curl http://localhost:8000/health
```

## 🎯 Próximos Pasos

### Para Desarrolladores C#
1. ✅ Lee `QUICKSTART.md`
2. ✅ Inicia el servidor con `start_alfred_server.ps1`
3. ✅ Copia `AlfredClient.cs` a tu proyecto
4. ✅ Integra con tu aplicación

### Para Desarrollo del Backend
1. ✅ Lee `README_BACKEND.md`
2. ✅ Revisa `alfred_core.py` para entender la lógica
3. ✅ Personaliza `config.py` (prompts)
4. ✅ Agrega nuevos endpoints en `alfred_backend.py`

## 🛡️ Seguridad

⚠️ **Configuración actual**: Desarrollo (sin autenticación, CORS abierto)

Para producción, consulta la sección de seguridad en `DEPLOYMENT.md`:
- Configurar CORS apropiadamente
- Agregar autenticación (JWT, API Keys)
- Usar HTTPS
- Implementar rate limiting

## 🐛 Troubleshooting

| Problema | Solución |
|----------|----------|
| Servidor no inicia | Verifica Ollama, modelos, y `.env` |
| Base de datos vacía | Configura `ALFRED_DOCS_PATH` correctamente |
| Respuestas lentas | Reduce `k` y `fetch_k` en `alfred_core.py` |
| Error desde C# | Verifica firewall, puerto, y que el servidor esté corriendo |

Ver más en `QUICKSTART.md` sección de problemas comunes.

## 📦 Dependencias Principales

```
fastapi           # Framework web
uvicorn           # Servidor ASGI
langchain         # Framework LLM
chromadb          # Base de datos vectorial
ollama            # Cliente Ollama
python-dotenv     # Variables de entorno
```

## 🎉 ¡Listo!

Alfred ahora es un backend profesional listo para:
- ✅ Consumir desde C#
- ✅ Consumir desde cualquier cliente HTTP
- ✅ Escalar horizontalmente
- ✅ Integrar con sistemas existentes
- ✅ Desplegar en producción

**¿Necesitas ayuda?** Consulta la documentación o ejecuta:
```powershell
python test_backend.py
```

---

*Última actualización: Octubre 2025*
