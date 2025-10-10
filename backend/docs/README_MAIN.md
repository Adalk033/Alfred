# 🤖 Alfred - Asistente Personal Inteligente

[![Python](https://img.shields.io/badge/Python-3.8%2B-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100%2B-green.svg)](https://fastapi.tiangolo.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Alfred** es un asistente personal inteligente que procesa tus documentos locales y responde preguntas usando IA local (Ollama). Ahora disponible como **backend API REST** para integración con aplicaciones C# y otros clientes.

## ✨ Características Principales

- 🧠 **IA Completamente Local** - Procesamiento 100% privado usando Ollama
- 📚 **Búsqueda Inteligente** - Indexación y búsqueda semántica con ChromaDB
- 🔍 **Extracción Automática** - Detecta RFC, CURP, NSS y otros datos
- 💾 **Historial Inteligente** - Caché de respuestas con búsqueda semántica
- 🌐 **API REST Completa** - Backend FastAPI con documentación automática
- 🔌 **Cliente C# Incluido** - Integración lista para aplicaciones .NET
- 📖 **Documentación Automática** - Swagger/OpenAPI incluido
- 🚀 **Fácil Despliegue** - Scripts de instalación y configuración

## 🚀 Inicio Rápido

### Instalación Automática (Recomendado)

```powershell
# Clona el repositorio
git clone https://github.com/tu-usuario/Alfred.git
cd Alfred

# Ejecuta el asistente de configuración
.\setup_alfred.ps1
```

El script te guiará paso a paso en la configuración.

### Instalación Manual

1. **Configurar entorno**
   ```powershell
   Copy-Item .env.example .env
   notepad .env  # Edita ALFRED_DOCS_PATH
   ```

2. **Instalar dependencias**
   ```powershell
   pip install -r requirements.txt
   ```

3. **Verificar Ollama**
   ```powershell
   ollama pull gemma2:9b
   ollama pull nomic-embed-text:v1.5
   ```

4. **Iniciar servidor**
   ```powershell
   .\start_alfred_server.ps1
   # o
   python alfred_backend.py
   ```

5. **Verificar instalación**
   ```powershell
   python test_backend.py
   ```

## 📚 Documentación

| Documento | Descripción |
|-----------|-------------|
| **[QUICKSTART.md](QUICKSTART.md)** | ⚡ Guía de inicio rápido (empieza aquí) |
| **[SUMMARY.md](SUMMARY.md)** | 📋 Resumen ejecutivo de cambios |
| **[README_BACKEND.md](README_BACKEND.md)** | 📖 Documentación completa del backend |
| **[DEPLOYMENT.md](DEPLOYMENT.md)** | 🚢 Guía de deployment y producción |
| **[PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md)** | 🗂️ Estructura del proyecto |

### Documentación Interactiva

Con el servidor corriendo:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

## 💻 Uso desde C#

### Instalación del Cliente

1. Copia `AlfredClient.cs` a tu proyecto C#
2. Agrega el paquete NuGet: `System.Net.Http.Json`

### Ejemplo Básico

```csharp
using AlfredApiClient;

// Crear cliente
var client = new AlfredClient("http://localhost:8000");

// Verificar estado
var health = await client.CheckHealthAsync();
Console.WriteLine($"Estado: {health.Status}");

// Hacer consulta
var response = await client.QueryAsync("¿Cuál es mi RFC?");
Console.WriteLine($"Respuesta: {response.Answer}");

// Mostrar datos extraídos
if (response.PersonalData != null)
{
    foreach (var data in response.PersonalData)
        Console.WriteLine($"{data.Key}: {data.Value}");
}

// Buscar en historial
var history = await client.SearchHistoryAsync("RFC", threshold: 0.3);
Console.WriteLine($"Encontradas {history.Count} respuestas previas");
```

Ver `AlfredClient.cs` para más ejemplos.

## 🔌 API Endpoints

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/` | Información del servicio |
| GET | `/health` | Estado de salud |
| GET | `/stats` | Estadísticas de la base de datos |
| **POST** | **`/query`** | **Consultar a Alfred** ⭐ |
| GET | `/history` | Obtener historial (paginado) |
| POST | `/history/search` | Buscar en historial |
| POST | `/history/save` | Guardar en historial |
| POST | `/reload` | Recargar documentos |
| GET | `/documents/test` | Prueba de búsqueda directa |

### Ejemplo de Consulta

```bash
curl -X POST http://localhost:8000/query \
  -H "Content-Type: application/json" \
  -d '{
    "question": "¿Cuál es mi RFC?",
    "use_history": true,
    "save_response": false
  }'
```

## 🏗️ Arquitectura

```
┌─────────────────────────────────┐
│      Aplicación C#              │
│  (WinForms/WPF/Blazor/etc.)     │
└────────────┬────────────────────┘
             │ HTTP REST
             ↓
┌─────────────────────────────────┐
│    alfred_backend.py            │
│      (FastAPI Server)           │
└────────────┬────────────────────┘
             │
             ↓
┌─────────────────────────────────┐
│     alfred_core.py              │
│    (Business Logic)             │
└─────┬──────────────────┬────────┘
      │                  │
      ↓                  ↓
┌──────────┐      ┌─────────────┐
│ ChromaDB │      │   Ollama    │
│(Vectors) │      │   (LLM)     │
└──────────┘      └─────────────┘
```

## 📋 Requisitos

### Software
- **Python** 3.8 o superior
- **Ollama** con modelos instalados:
  - `gemma2:9b` (o `llama3.2:3b` para más velocidad)
  - `nomic-embed-text:v1.5`

### Dependencias Python
Instaladas automáticamente con `pip install -r requirements.txt`:
- fastapi
- uvicorn
- langchain
- chromadb
- ollama
- python-dotenv
- (ver requirements.txt para lista completa)

## ⚙️ Configuración

### Variables de Entorno (.env)

```env
# Esencial
ALFRED_DOCS_PATH=C:\Users\TU_USUARIO\Documents  # Ruta a tus documentos
ALFRED_USER_NAME=Tu Nombre                       # Tu nombre

# Servidor
ALFRED_HOST=127.0.0.1                              # Host (127.0.0.1 = todas las interfaces)
ALFRED_PORT=8000                                 # Puerto

# Modelos IA
ALFRED_MODEL=gemma2:9b                           # Modelo LLM
ALFRED_EMBEDDING_MODEL=nomic-embed-text:v1.5     # Modelo embeddings

# Opcional
ALFRED_DEBUG=false                               # Modo debug
ALFRED_FORCE_RELOAD=false                        # Forzar recarga de documentos
```

## 🧪 Testing

```powershell
# Suite completa de pruebas
python test_backend.py

# Pruebas manuales
curl http://localhost:8000/health
curl http://localhost:8000/stats
```

## 🐛 Troubleshooting

| Problema | Solución |
|----------|----------|
| **"Connection refused"** | Verifica que el servidor esté corriendo: `python alfred_backend.py` |
| **"Alfred Core no inicializado"** | Verifica Ollama: `ollama list` y `ollama serve` |
| **"Base de datos vacía"** | Configura `ALFRED_DOCS_PATH` correctamente en `.env` |
| **Respuestas lentas** | Usa modelo más rápido: `ALFRED_MODEL=llama3.2:3b` |

Ver [QUICKSTART.md](QUICKSTART.md) para más soluciones.

## 🚀 Deployment

### Desarrollo
```powershell
$env:ALFRED_RELOAD='true'
python alfred_backend.py
```

### Producción
```powershell
python alfred_backend.py
```

### Docker
```dockerfile
docker build -t alfred-backend .
docker run -p 8000:8000 -v ./documents:/data/documents alfred-backend
```

Ver [DEPLOYMENT.md](DEPLOYMENT.md) para opciones avanzadas.

## 🔒 Seguridad

⚠️ **Configuración actual**: Modo desarrollo

Para producción:
- Configura CORS apropiadamente
- Agrega autenticación (JWT, API Keys)
- Usa HTTPS
- Implementa rate limiting

Ver [DEPLOYMENT.md](DEPLOYMENT.md) sección de seguridad.

## 📊 Características Técnicas

- **Framework**: FastAPI (Python)
- **LLM**: Ollama (gemma2:9b, llama3.2, etc.)
- **Embeddings**: nomic-embed-text:v1.5
- **Base de Datos Vectorial**: ChromaDB
- **Historial**: JSON (con búsqueda semántica)
- **Documentación**: Swagger/OpenAPI automática
- **CORS**: Habilitado para desarrollo
- **Background Tasks**: Soportado

## 🎯 Casos de Uso

- ✅ Búsqueda en documentos personales
- ✅ Extracción de datos fiscales (RFC, CURP, NSS)
- ✅ Asistente personal inteligente
- ✅ Base de conocimiento privada
- ✅ Integración con aplicaciones empresariales
- ✅ Chatbot local con contexto

## 🤝 Contribuir

1. Fork el proyecto
2. Crea tu rama de feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📝 Licencia

Este proyecto está bajo la Licencia MIT - ver el archivo [LICENSE](LICENSE) para más detalles.

## 👨‍💻 Autor

**Tu Nombre** - [@tu-usuario](https://github.com/tu-usuario)

## 🙏 Agradecimientos

- [FastAPI](https://fastapi.tiangolo.com/)
- [LangChain](https://www.langchain.com/)
- [Ollama](https://ollama.ai/)
- [ChromaDB](https://www.trychroma.com/)

## 📞 Soporte

- 📖 Documentación: [README_BACKEND.md](README_BACKEND.md)
- 🐛 Issues: [GitHub Issues](https://github.com/tu-usuario/alfred/issues)
- 💬 Discusiones: [GitHub Discussions](https://github.com/tu-usuario/alfred/discussions)

---

**¡Hecho con ❤️ y IA local!**

Para empezar, lee [QUICKSTART.md](QUICKSTART.md) o ejecuta `.\setup_alfred.ps1`
