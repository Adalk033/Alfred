# 🤖 Alfred Backend API

Backend RESTful para el asistente personal Alfred, diseñado para ser consumido por aplicaciones C# y otros clientes.

## 📋 Características

- ✅ **API REST completa** con FastAPI
- ✅ **Documentación automática** con Swagger/OpenAPI
- ✅ **Búsqueda inteligente** en documentos personales
- ✅ **Historial de conversaciones** con búsqueda semántica
- ✅ **Extracción automática** de datos personales (RFC, CURP, NSS)
- ✅ **Caché de respuestas** para optimización
- ✅ **CORS habilitado** para clientes web
- ✅ **Cliente C# incluido** para fácil integración

## 🚀 Inicio Rápido

### 1. Configuración

Crea un archivo `.env` en la raíz del proyecto:

```env
ALFRED_DOCS_PATH=C:\Users\TU_USUARIO\Documents
ALFRED_USER_NAME=Tu Nombre
ALFRED_HOST=0.0.0.0
ALFRED_PORT=8000
ALFRED_MODEL=gemma2:9b
```

### 2. Instalar dependencias

```powershell
pip install -r requirements.txt
```

### 3. Iniciar el servidor

**Opción 1: Con script de PowerShell (recomendado)**
```powershell
.\start_alfred_server.ps1
```

**Opción 2: Manualmente**
```powershell
python alfred_backend.py
```

**Opción 3: Con Uvicorn**
```powershell
uvicorn alfred_backend:app --host 0.0.0.0 --port 8000
```

### 4. Verificar que funciona

Abre tu navegador en: http://localhost:8000/docs

## 📚 Documentación de la API

### Endpoints Principales

#### 🏥 Salud y Estado
- `GET /` - Información del servicio
- `GET /health` - Estado de salud del servidor
- `GET /stats` - Estadísticas de la base de datos

#### 💬 Consultas
- `POST /query` - Realizar una consulta a Alfred
  ```json
  {
    "question": "¿Cuál es mi RFC?",
    "use_history": true,
    "save_response": false
  }
  ```

#### 📖 Historial
- `GET /history?limit=10&offset=0` - Obtener historial (paginado)
- `POST /history/search` - Buscar en el historial
- `POST /history/save` - Guardar manualmente en el historial

#### 🔧 Mantenimiento
- `POST /reload` - Recargar documentos (background task)
- `GET /documents/test?query=RFC&k=5` - Prueba de búsqueda directa

## 🔌 Integración con C#

### Instalación del cliente

Copia el archivo `AlfredClient.cs` a tu proyecto de C#.

### Uso básico

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

// Mostrar datos personales extraídos
if (response.PersonalData != null)
{
    foreach (var data in response.PersonalData)
    {
        Console.WriteLine($"{data.Key}: {data.Value}");
    }
}

// Buscar en historial
var history = await client.SearchHistoryAsync("RFC", threshold: 0.3);
Console.WriteLine($"Encontradas {history.Count} respuestas previas");

// Consultas en batch
var questions = new List<string> { "¿Mi nombre?", "¿Mi CURP?" };
var results = await client.QueryBatchAsync(questions);
```

### Ejemplo completo

Ver `AlfredClient.cs` para un ejemplo completo con todas las funcionalidades.

## 🏗️ Arquitectura

```
Alfred Backend
│
├── alfred_backend.py      # API FastAPI con endpoints
├── alfred_core.py         # Lógica de negocio principal
├── config.py              # Configuración y prompts
├── functionsToHistory.py  # Gestión de historial
│
├── chroma_db/             # Base de datos vectorial
├── alfred_qa_history.json # Historial de conversaciones
│
└── .env                   # Variables de entorno
```

### Flujo de una consulta

1. Cliente C# → `POST /query`
2. API verifica historial (opcional)
3. Alfred Core busca en documentos con ChromaDB
4. LLM (Ollama) genera respuesta
5. Extracción automática de datos personales
6. Respuesta JSON → Cliente C#

## 🔒 Seguridad

### Para desarrollo
- CORS está habilitado para todos los orígenes (`*`)
- No hay autenticación por defecto

### Para producción
1. **Configura CORS** apropiadamente:
   ```python
   allow_origins=["https://tu-aplicacion.com"]
   ```

2. **Agrega autenticación**:
   - JWT tokens
   - API Keys
   - OAuth2

3. **Usa HTTPS**:
   ```powershell
   uvicorn alfred_backend:app --ssl-keyfile key.pem --ssl-certfile cert.pem
   ```

4. **Rate limiting**:
   ```python
   from slowapi import Limiter
   limiter = Limiter(key_func=get_remote_address)
   ```

## 🐛 Troubleshooting

### Error: "Alfred Core no está inicializado"
- Verifica que Ollama esté ejecutándose
- Verifica que los modelos estén descargados:
  ```powershell
  ollama list
  ollama pull gemma2:9b
  ollama pull nomic-embed-text:v1.5
  ```

### Respuestas lentas
- Reduce los parámetros de búsqueda en `alfred_core.py`:
  ```python
  search_kwargs={"k": 10, "fetch_k": 50}  # En lugar de 20 y 100
  ```
- Usa un modelo más pequeño: `llama3.2:3b`

### Error al cargar documentos
- Ejecuta con recarga forzada:
  ```powershell
  $env:ALFRED_FORCE_RELOAD='true'
  python alfred_backend.py
  ```

### Error de conexión desde C#
- Verifica que el servidor esté ejecutándose
- Verifica que el firewall permita conexiones al puerto 8000
- Prueba primero con el navegador: http://localhost:8000/docs

## 📊 Monitoreo

### Logs
Los logs se muestran en la consola. Para guardarlos:
```powershell
python alfred_backend.py > alfred.log 2>&1
```

### Métricas
- Usa el endpoint `/stats` para obtener estadísticas
- Implementa tu propio sistema de telemetría con OpenTelemetry

## 🚢 Despliegue

### Docker
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["python", "alfred_backend.py"]
```

### Servicio de Windows
Usa `NSSM` o crea un servicio con `sc create`:
```powershell
nssm install Alfred "C:\Python311\python.exe" "C:\Alfred\alfred_backend.py"
nssm start Alfred
```

### IIS con FastCGI
Configura FastCGI para Python y apunta a `alfred_backend.py`

## 🔧 Configuración Avanzada

### Variables de entorno completas

```env
# Rutas
ALFRED_DOCS_PATH=C:\Users\Usuario\Documents
ALFRED_CHROMA_PATH=./chroma_db
ALFRED_HISTORY_FILE=./alfred_qa_history.json

# Servidor
ALFRED_HOST=0.0.0.0
ALFRED_PORT=8000
ALFRED_RELOAD=false

# Usuario
ALFRED_USER_NAME=Tu Nombre

# Modelos IA
ALFRED_MODEL=gemma2:9b
ALFRED_EMBEDDING_MODEL=nomic-embed-text:v1.5

# Opciones
ALFRED_DEBUG=false
ALFRED_FORCE_RELOAD=false
```

### Personalizar el retriever

En `alfred_core.py`:
```python
retriever = self.vectorstore.as_retriever(
    search_type="mmr",  # o "similarity"
    search_kwargs={
        "k": 20,          # Documentos a recuperar
        "fetch_k": 100    # Documentos a analizar
    }
)
```

### Personalizar el prompt

En `config.py`:
```python
PROMPT_TEMPLATE = """
Eres Alfred, un asistente personal...
[personaliza aquí]
"""
```

## 📝 Licencia

Ver archivo `LICENSE`

## 🤝 Contribuir

1. Fork el proyecto
2. Crea una rama para tu feature
3. Commit tus cambios
4. Push a la rama
5. Abre un Pull Request

## 📞 Soporte

Para problemas o preguntas:
- Revisa la documentación en `/docs`
- Consulta el archivo `DEPLOYMENT.md`
- Revisa los issues en GitHub

---

**¡Alfred está listo para ser tu asistente personal inteligente! 🤖✨**
