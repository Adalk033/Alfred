# Alfred Backend - Configuración de deployment

## 📋 Requisitos
- Python 3.8+
- Ollama con modelos instalados:
  - `gemma2:9b` (o el modelo que prefieras)
  - `nomic-embed-text:v1.5`

## 🚀 Instalación

### 1. Instalar dependencias
```powershell
pip install -r requirements.txt
```

### 2. Instalar dependencias adicionales para el backend
```powershell
pip install fastapi uvicorn python-dotenv
```

### 3. Configurar variables de entorno

Crea un archivo `.env` en la raíz del proyecto:

```env
# Ruta a tus documentos personales
ALFRED_DOCS_PATH=C:\Users\TU_USUARIO\Documents

# Configuración del servidor
ALFRED_HOST=0.0.0.0
ALFRED_PORT=8000
ALFRED_RELOAD=false

# Configuración de Alfred
ALFRED_USER_NAME=Tu Nombre
ALFRED_MODEL=gemma2:9b
ALFRED_EMBEDDING_MODEL=nomic-embed-text:v1.5

# Rutas de almacenamiento
ALFRED_CHROMA_PATH=./chroma_db
ALFRED_HISTORY_FILE=./alfred_qa_history.json

# Opciones de debug
ALFRED_DEBUG=false
ALFRED_FORCE_RELOAD=false
```

## 🏃 Ejecutar el servidor

### Modo desarrollo (con auto-reload)
```powershell
$env:ALFRED_RELOAD='true'
python alfred_backend.py
```

### Modo producción
```powershell
python alfred_backend.py
```

### Con Uvicorn directamente
```powershell
uvicorn alfred_backend:app --host 0.0.0.0 --port 8000 --reload
```

## 📚 Documentación de la API

Una vez iniciado el servidor, accede a:

- **Swagger UI (interactivo)**: http://localhost:8000/docs
- **ReDoc (documentación)**: http://localhost:8000/redoc
- **OpenAPI JSON**: http://localhost:8000/openapi.json

## 🔌 Endpoints principales

### General
- `GET /` - Información del servicio
- `GET /health` - Estado de salud del servicio
- `GET /stats` - Estadísticas de la base de datos

### Consultas
- `POST /query` - Realizar una consulta a Alfred
  ```json
  {
    "question": "¿Cuál es mi RFC?",
    "use_history": true,
    "save_response": false
  }
  ```

### Historial
- `GET /history` - Obtener historial (paginado)
- `POST /history/search` - Buscar en el historial
- `POST /history/save` - Guardar manualmente en el historial

### Mantenimiento
- `POST /reload` - Recargar documentos (background task)
- `GET /documents/test` - Prueba de búsqueda directa

## 🔧 Consumir desde C#

### Ejemplo con HttpClient

```csharp
using System;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;

public class AlfredClient
{
    private readonly HttpClient _httpClient;
    private const string BaseUrl = "http://localhost:8000";

    public AlfredClient()
    {
        _httpClient = new HttpClient { BaseAddress = new Uri(BaseUrl) };
    }

    // Realizar consulta
    public async Task<QueryResponse> QueryAsync(string question, bool useHistory = true)
    {
        var request = new QueryRequest
        {
            Question = question,
            UseHistory = useHistory,
            SaveResponse = false
        };

        var json = JsonSerializer.Serialize(request);
        var content = new StringContent(json, Encoding.UTF8, "application/json");

        var response = await _httpClient.PostAsync("/query", content);
        response.EnsureSuccessStatusCode();

        var responseJson = await response.Content.ReadAsStringAsync();
        return JsonSerializer.Deserialize<QueryResponse>(responseJson);
    }

    // Verificar salud del servicio
    public async Task<HealthResponse> CheckHealthAsync()
    {
        var response = await _httpClient.GetAsync("/health");
        response.EnsureSuccessStatusCode();

        var json = await response.Content.ReadAsStringAsync();
        return JsonSerializer.Deserialize<HealthResponse>(json);
    }

    // Obtener estadísticas
    public async Task<DatabaseStats> GetStatsAsync()
    {
        var response = await _httpClient.GetAsync("/stats");
        response.EnsureSuccessStatusCode();

        var json = await response.Content.ReadAsStringAsync();
        return JsonSerializer.Deserialize<DatabaseStats>(json);
    }
}

// Modelos de datos
public class QueryRequest
{
    public string Question { get; set; }
    public bool UseHistory { get; set; } = true;
    public bool SaveResponse { get; set; } = false;
}

public class QueryResponse
{
    public string Answer { get; set; }
    public Dictionary<string, string> PersonalData { get; set; }
    public List<string> Sources { get; set; }
    public bool FromHistory { get; set; }
    public double? HistoryScore { get; set; }
    public string Timestamp { get; set; }
    public int ContextCount { get; set; }
}

public class HealthResponse
{
    public string Status { get; set; }
    public string Timestamp { get; set; }
    public bool AlfredCoreInitialized { get; set; }
    public bool VectorstoreLoaded { get; set; }
}

public class DatabaseStats
{
    public int TotalDocuments { get; set; }
    public int TotalQaHistory { get; set; }
    public string ChromaDbPath { get; set; }
    public string DocsPath { get; set; }
    public string UserName { get; set; }
    public string ModelName { get; set; }
    public string Status { get; set; }
}
```

### Ejemplo de uso

```csharp
class Program
{
    static async Task Main(string[] args)
    {
        var client = new AlfredClient();

        // Verificar salud
        var health = await client.CheckHealthAsync();
        Console.WriteLine($"Estado: {health.Status}");

        // Hacer consulta
        var response = await client.QueryAsync("¿Cuál es mi RFC?");
        Console.WriteLine($"Respuesta: {response.Answer}");

        if (response.PersonalData != null)
        {
            foreach (var data in response.PersonalData)
            {
                Console.WriteLine($"{data.Key}: {data.Value}");
            }
        }

        // Obtener estadísticas
        var stats = await client.GetStatsAsync();
        Console.WriteLine($"Documentos: {stats.TotalDocuments}");
        Console.WriteLine($"Historial: {stats.TotalQaHistory}");
    }
}
```

## 🐳 Docker (opcional)

### Dockerfile
```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN pip install fastapi uvicorn python-dotenv

COPY . .

EXPOSE 8000

CMD ["python", "alfred_backend.py"]
```

### docker-compose.yml
```yaml
version: '3.8'

services:
  alfred-api:
    build: .
    ports:
      - "8000:8000"
    environment:
      - ALFRED_DOCS_PATH=/data/documents
      - ALFRED_HOST=0.0.0.0
      - ALFRED_PORT=8000
      - ALFRED_USER_NAME=Usuario
    volumes:
      - ./chroma_db:/app/chroma_db
      - ./documents:/data/documents
      - ./alfred_qa_history.json:/app/alfred_qa_history.json
```

## 🔒 Seguridad

### Para producción:
1. **Configura CORS** apropiadamente en `alfred_backend.py`:
   ```python
   allow_origins=["https://tu-app.com"]  # Especifica tus dominios
   ```

2. **Agrega autenticación** (JWT, API Keys, etc.)

3. **Usa HTTPS** con certificados SSL

4. **Configura rate limiting** para evitar abuso

## 📝 Logs

Los logs se muestran en la consola. Para guardarlos en archivo:

```powershell
python alfred_backend.py > alfred.log 2>&1
```

## 🛠️ Troubleshooting

### El servidor no inicia
- Verifica que Ollama esté ejecutándose
- Verifica que los modelos estén descargados
- Verifica la ruta `ALFRED_DOCS_PATH`

### Error al cargar documentos
- Ejecuta con `ALFRED_FORCE_RELOAD=true`
- Verifica permisos de lectura en la carpeta de documentos

### Respuestas lentas
- Reduce `k` y `fetch_k` en la configuración del retriever
- Usa un modelo LLM más pequeño (ej: `llama3.2:3b`)

## 📞 Soporte

Para más información, consulta la documentación de FastAPI: https://fastapi.tiangolo.com/
