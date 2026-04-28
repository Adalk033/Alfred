# alfred-mcp

Servidor [Model Context Protocol](https://modelcontextprotocol.io) que expone
**Alfred** (LLM local con backend en C++) como proveedor para clientes MCP
como Claude Code, Cursor, Zed, etc.

Es un proxy delgado sobre la API REST de Alfred (`http://127.0.0.1:8000` por
defecto). No tiene estado propio: todas las conversaciones, modelos y
configuracion los maneja el backend.

## Requisitos

- Node.js 18+
- Backend de Alfred corriendo (la app de WinUI 3 lo arranca automaticamente).

## Instalacion (desarrollo)

```bash
cd mcp-server
npm install
npm run build
```

El build deja el ejecutable en `dist/index.js`. Tambien queda registrado el bin
`alfred-mcp` (ver `package.json`), de modo que tras `npm install` funciona
`npx alfred-mcp` desde cualquier carpeta.

Para desarrollo iterativo:

```bash
npm run dev   # tsc --watch
```

## Configuracion

Variable de entorno:

| Nombre | Default | Descripcion |
|---|---|---|
| `ALFRED_BASE_URL` | `http://127.0.0.1:8000` | URL base del REST de Alfred. |

## Uso desde Claude Code

Agrega esto a `~/.claude.json` (o `~/.config/claude-code/config.json`):

```json
{
  "mcpServers": {
    "alfred": {
      "command": "npx",
      "args": ["-y", "alfred-mcp"]
    }
  }
}
```

Tambien puedes apuntar directamente al build local mientras desarrollas:

```json
{
  "mcpServers": {
    "alfred": {
      "command": "node",
      "args": ["F:/Projects/Alfred/mcp-server/dist/index.js"],
      "env": { "ALFRED_BASE_URL": "http://127.0.0.1:8000" }
    }
  }
}
```

## Uso desde Cursor

`mcp.json`:

```json
{
  "alfred": {
    "command": "npx",
    "args": ["-y", "alfred-mcp"]
  }
}
```

## Tools expuestas

| Tool | Descripcion |
|---|---|
| `ask_alfred` | Query simple (no streaming). Acepta `conversation_id` opcional. |
| `ask_alfred_stream` | Query con streaming SSE. Emite progress notifications con tokens parciales. |
| `list_models` | Lista los modelos GGUF disponibles en disco. |
| `get_model_status` | Estado del modelo cargado actualmente. |
| `change_model` | Cambia el modelo activo (por nombre o ruta). |
| `create_conversation` | Crea una nueva conversacion. |
| `list_conversations` | Lista conversaciones (paginado con `limit`/`offset`). |
| `get_conversation` | Devuelve metadatos + mensajes de una conversacion. |
| `delete_conversation` | Elimina una conversacion. |
| `ask_in_conversation` | Pregunta dentro de una conversacion existente (guarda historial). |
| `extract_pdf` | Lee un PDF local y devuelve texto + chunks (delega a `/files/extract-pdf`). |

## Resources expuestos

- `alfred://conversations` — indice de conversaciones (JSON).
- `alfred://conversations/{id}` — conversacion completa con mensajes (JSON).

Estan tambien listados como template (`resources/templates/list`) para que el
cliente pueda construir URIs de conversaciones que aun no esten en el indice.

## Logging

El servidor escribe trazas en `stderr` (stdout esta reservado para el
protocolo MCP). En Claude Code se ven con `claude mcp logs alfred`.

## Estado

Fase 1 del [plan VSC + MCP](../plans/plan_vsc_mcp.md). El tool-calling
agentico (`/query/agent/stream`) **ya existe** en el backend y se usara desde
Fase 3/4; este servidor solo expone chat + utilidades por ahora.
