# Sistema de Conversaciones de Alfred

## Descripcion General

El sistema de conversaciones permite a Alfred mantener contexto entre multiples mensajes, creando una experiencia conversacional mas natural y coherente. Este sistema es diferente al **Historial Q&A** que optimiza respuestas mediante busqueda de similitud.

## Diferencias Clave

### Historial Q&A (functionsToHistory.py)
- **Proposito**: Optimizar respuestas evitando procesamiento redundante
- **Funcionamiento**: Busca preguntas similares previamente respondidas
- **Almacenamiento**: `alfred_qa_history.json`
- **Uso**: Automatico cuando `use_history=True` en queries

### Sistema de Conversaciones (conversation_manager.py)
- **Proposito**: Mantener contexto conversacional entre mensajes
- **Funcionamiento**: Envia historial de mensajes al LLM como contexto
- **Almacenamiento**: `conversations/` directorio con archivos JSON individuales
- **Uso**: Cada conversacion tiene un ID unico y persiste entre sesiones

## Arquitectura

```
Alfred/
├── conversation_manager.py      # Gestor de conversaciones
├── conversations/               # Directorio de conversaciones
│   ├── conversations_index.json # Indice rapido
│   ├── {uuid}.json             # Archivos de conversaciones
│   └── ...
├── alfred_core.py              # Actualizado para soportar contexto
└── alfred_backend.py           # Endpoints de conversaciones
```

## Componentes Backend

### 1. ConversationManager (conversation_manager.py)

Clase singleton que maneja todas las operaciones con conversaciones:

```python
from conversation_manager import get_conversation_manager

conv_mgr = get_conversation_manager()

# Crear nueva conversacion
conversation = conv_mgr.create_conversation(title="Mi conversacion")

# Agregar mensajes
conv_mgr.add_message(
    conversation_id="uuid",
    role="user",
    content="Hola Alfred",
    metadata={}
)

# Obtener historial
messages = conv_mgr.get_conversation_history(conversation_id, max_messages=10)
```

**Metodos principales**:
- `create_conversation(title)`: Crear nueva conversacion
- `get_conversation(id)`: Obtener conversacion completa
- `list_conversations(limit, offset)`: Listar conversaciones
- `add_message(id, role, content, metadata)`: Agregar mensaje
- `delete_conversation(id)`: Eliminar conversacion
- `update_conversation_title(id, title)`: Actualizar titulo
- `clear_conversation(id)`: Limpiar mensajes
- `search_conversations(query)`: Buscar conversaciones

### 2. AlfredCore Actualizado (alfred_core.py)

El metodo `query()` ahora acepta `conversation_history`:

```python
result = alfred_core.query(
    question="Que me dijiste antes?",
    conversation_history=[
        {"role": "user", "content": "Hola"},
        {"role": "assistant", "content": "Hola! Como puedo ayudarte?"}
    ],
    search_documents=True
)
```

**Como funciona**:
- Si `search_documents=False`: Envia historial directamente al LLM
- Si `search_documents=True`: Combina historial + documentos recuperados + pregunta actual

### 3. Endpoints API (alfred_backend.py)

#### Crear Conversacion
```
POST /conversations
Body: { "title": "Titulo opcional" }
Response: ConversationDetail
```

#### Listar Conversaciones
```
GET /conversations?limit=50&offset=0
Response: List[ConversationSummary]
```

#### Obtener Conversacion
```
GET /conversations/{id}
Response: ConversationDetail
```

#### Agregar Mensaje (Manual)
```
POST /conversations/{id}/messages
Body: {
    "role": "user|assistant",
    "content": "texto",
    "metadata": {}
}
```

#### Eliminar Conversacion
```
DELETE /conversations/{id}
```

#### Actualizar Titulo
```
PUT /conversations/{id}/title
Body: { "title": "Nuevo titulo" }
```

#### Query con Conversacion
```
POST /query/conversation
Body: {
    "question": "Tu pregunta",
    "conversation_id": "uuid-opcional",
    "search_documents": true,
    "max_context_messages": 10
}
```

Este endpoint automaticamente:
1. Obtiene historial de la conversacion
2. Envia contexto al LLM
3. Agrega pregunta y respuesta a la conversacion

## Componentes Frontend

### 1. Electron Main (main.js)

Handlers IPC agregados:
- `create-conversation`
- `list-conversations`
- `get-conversation`
- `delete-conversation`
- `update-conversation-title`
- `clear-conversation`
- `search-conversations`
- `send-query-with-conversation`

### 2. Preload (preload.js)

API expuesta a renderer:
```javascript
window.alfredAPI.createConversation(title)
window.alfredAPI.listConversations(limit, offset)
window.alfredAPI.getConversation(id)
window.alfredAPI.deleteConversation(id)
window.alfredAPI.sendQueryWithConversation(question, conversationId, searchDocuments)
// ... otros metodos
```

### 3. Renderer (renderer.js)

Variables globales:
```javascript
let currentConversationId = null;  // ID de conversacion activa
let conversations = [];            // Lista de conversaciones
```

Funciones principales:
- `createNewConversation()`: Crea nueva conversacion y limpia chat
- `loadConversations()`: Carga lista de conversaciones
- `loadConversation(id)`: Carga conversacion especifica en el chat
- `deleteConversationById(id)`: Elimina conversacion
- `sendMessage()`: Modificada para usar conversaciones

### 4. UI (index.html + styles.css)

**Botones agregados**:
- Boton "Nueva Conversacion" (+) en topbar
- Boton "Conversaciones" (icono de chat) en topbar

**Panel lateral**:
- Lista de conversaciones con titulo, contador de mensajes y fecha
- Botones para cargar/eliminar cada conversacion
- Indicador visual de conversacion activa

## Flujo de Uso

### Escenario 1: Nueva Conversacion

1. Usuario abre Alfred
2. Usuario escribe primer mensaje
3. Sistema crea conversacion automaticamente
4. Mensaje se envia con `conversation_id`
5. Backend agrega pregunta y respuesta a la conversacion
6. Lista de conversaciones se actualiza

### Escenario 2: Continuar Conversacion

1. Usuario hace clic en "Conversaciones"
2. Selecciona una conversacion de la lista
3. Sistema carga todos los mensajes en el chat
4. Usuario escribe nuevo mensaje
5. Backend recupera ultimos N mensajes como contexto
6. LLM genera respuesta usando el contexto completo

### Escenario 3: Multiples Conversaciones

1. Usuario crea nueva conversacion con boton "+"
2. Chat se limpia, nueva conversacion se activa
3. Usuario puede cambiar entre conversaciones
4. Cada conversacion mantiene su propio contexto

## Formato de Archivos

### Archivo de Conversacion Individual
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "title": "Consulta sobre RFC",
  "created_at": "2025-10-06T10:30:00",
  "updated_at": "2025-10-06T10:45:00",
  "messages": [
    {
      "role": "user",
      "content": "Cual es mi RFC?",
      "timestamp": "2025-10-06T10:30:00",
      "metadata": {}
    },
    {
      "role": "assistant",
      "content": "Tu RFC es XAXX010101000",
      "timestamp": "2025-10-06T10:30:15",
      "metadata": {
        "sources": ["documento1.pdf"],
        "personal_data": {"RFC": "XAXX010101000"}
      }
    }
  ]
}
```

### Indice de Conversaciones
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "title": "Consulta sobre RFC",
    "created_at": "2025-10-06T10:30:00",
    "updated_at": "2025-10-06T10:45:00",
    "message_count": 4
  }
]
```

## Configuracion

### Variables de Entorno (.env)
No requiere configuracion adicional. Las conversaciones se guardan en:
```
conversations_dir = "./conversations"  # Por defecto
```

### Limites Configurables

En `QueryWithConversationRequest`:
```python
max_context_messages: int = 10  # Maximo de mensajes de contexto
```

En renderer.js:
```javascript
const result = await window.alfredAPI.listConversations(50, 0);  // Limite de lista
```

## Consideraciones de Rendimiento

### Contexto del LLM
- **Problema**: Enviar muchos mensajes aumenta tokens y tiempo de procesamiento
- **Solucion**: `max_context_messages` limita mensajes enviados al LLM
- **Recomendacion**: 5-10 mensajes para contexto optimo

### Busqueda en Documentos
- **Con contexto**: Solo ultimos 5 mensajes se incluyen en la busqueda
- **Sin contexto**: Busqueda normal en vectorstore

### Persistencia
- **Archivos JSON**: Cada conversacion es un archivo separado
- **Indice**: Archivo de metadatos para listado rapido
- **Sin base de datos**: No requiere setup adicional

## Integracion con Historial Q&A

Ambos sistemas coexisten:

1. **Query con conversacion**:
   - Primero busca en Historial Q&A (si `use_history=True`)
   - Si no encuentra match (score < 0.6), procesa con contexto de conversacion
   - Opcionalmente guarda en Historial Q&A (si `save_response=True`)

2. **Ventajas**:
   - Respuestas rapidas para preguntas comunes (Historial Q&A)
   - Contexto conversacional para dialogos complejos (Conversaciones)

## Migracion y Retrocompatibilidad

### Codigo Existente
El endpoint original `/query` sigue funcionando sin cambios:
```
POST /query
```

### Nuevo Codigo
Para usar conversaciones, usar el nuevo endpoint:
```
POST /query/conversation
```

### Cliente C# (AlfredClient.cs)
Agregar nuevos metodos:
```csharp
public async Task<ConversationDetail> CreateConversation(string title = null)
public async Task<QueryResponse> QueryWithConversation(
    string question, 
    string conversationId = null
)
```

## Testing

### Pruebas Manuales

1. **Crear conversacion**:
```bash
curl -X POST http://localhost:8000/conversations \
  -H "Content-Type: application/json" \
  -d '{"title": "Test"}'
```

2. **Query con contexto**:
```bash
curl -X POST http://localhost:8000/query/conversation \
  -H "Content-Type: application/json" \
  -d '{
    "question": "Hola",
    "conversation_id": "uuid-aqui"
  }'
```

3. **Listar conversaciones**:
```bash
curl http://localhost:8000/conversations
```

### Pruebas en Electron

1. Abrir DevTools (F12)
2. Consola muestra logs detallados
3. Probar flujo completo:
   - Crear conversacion
   - Enviar varios mensajes
   - Cambiar entre conversaciones
   - Verificar contexto se mantiene

## Troubleshooting

### Error: "Conversacion no encontrada"
- **Causa**: ID invalido o conversacion eliminada
- **Solucion**: Verificar que el ID existe con `GET /conversations`

### Contexto no se mantiene
- **Causa**: `conversation_id` no se esta enviando
- **Solucion**: Verificar que `currentConversationId` no es null en renderer.js

### Conversaciones no se cargan
- **Causa**: Directorio `conversations/` no existe o sin permisos
- **Solucion**: ConversationManager crea el directorio automaticamente

### Respuestas lentas con contexto
- **Causa**: Demasiados mensajes de contexto
- **Solucion**: Reducir `max_context_messages` a 5 o menos

## Mejoras Futuras

1. **Busqueda semantica en conversaciones**: Usar embeddings para buscar contenido
2. **Exportar conversaciones**: Formato Markdown o PDF
3. **Etiquetas y categorias**: Organizar conversaciones
4. **Compartir conversaciones**: Entre usuarios o dispositivos
5. **Auto-resumen**: Generar resumen de conversaciones largas
6. **Compresion de contexto**: Resumir mensajes antiguos para ahorrar tokens

## Referencias

- Backend API: `Alfred/alfred_backend.py` (lineas 100-250)
- Gestor: `Alfred/conversation_manager.py`
- Core actualizado: `Alfred/alfred_core.py` (metodo `query()`)
- Frontend: `AlfredElectron/js/rendering/renderer.js` (funciones de conversaciones)
- Documentacion API: http://localhost:8000/docs (cuando el servidor este corriendo)
