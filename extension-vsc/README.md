# Alfred — Extensión VSCode (Fase 2)

Chat lateral conectado al backend local de Alfred (`REST :8000` + SSE).
Sin modo agente todavía: ese es el alcance de la Fase 4.

## Qué incluye

- Vista lateral en la activity bar (icono Alfred) con chat en streaming.
- Selector de modelo (consume `/models` y `/models/status`, cambia con `/models/change`).
- Botón "+" para nueva conversación, botón "Cancelar" (`POST /query/cancel`).
- Status bar con estado del backend y poll automático de `/health`.
- Comandos en command palette y context menu del editor:
  - `Alfred: Explain selection`
  - `Alfred: Refactor selection`
  - `Alfred: Generate tests for selection`
- Persistencia del `conversation_id` activo y de los mensajes en `globalState`.

## Estructura

```
extension-vsc/
├── package.json                 contributes (view, commands, settings)
├── tsconfig.json
├── src/
│   ├── extension.ts             activate() / deactivate()
│   ├── api/
│   │   ├── AlfredClient.ts      fetch + SSE contra :8000
│   │   └── health.ts            poll de /health + status bar
│   ├── chat/
│   │   ├── ChatViewProvider.ts  WebviewViewProvider, puente webview <-> backend
│   │   └── messages.ts          tipos compartidos webview <-> host
│   ├── conversations/
│   │   └── ConversationStore.ts persistencia ligera (globalState)
│   └── commands/
│       └── editorCommands.ts    explain / refactor / generate-tests
└── media/
    ├── alfred.svg               icono activity bar
    └── webview/
        ├── styles.css           estilos del chat
        └── main.js              UI del webview (sin frameworks)
```

## Requisitos

- VSCode `>= 1.90`.
- Node `>= 18` para compilar.
- App de Alfred corriendo (la extensión NO arranca el backend; solo se conecta).
  Verifica con `curl http://127.0.0.1:8000/health`.

## Cómo correrla en desarrollo

> El usuario compilará manualmente. Pasos para depurar localmente:

```bash
cd extension-vsc
npm install
npm run build       # tsc -> dist/
```

Después abre la carpeta `extension-vsc/` en VSCode y pulsa `F5` (lanza
"Run Extension" definido en `.vscode/launch.json`). Se abre una segunda ventana
con la extensión cargada.

Para empaquetar `.vsix` (cuando interese):

```bash
npx @vscode/vsce package
```

## Configuración

| Setting | Default | Para qué |
|---|---|---|
| `alfred.backendUrl` | `http://127.0.0.1:8000` | URL base del backend. |
| `alfred.requestTimeoutMs` | `120000` | Timeout de llamadas no-streaming. |
| `alfred.healthCheckIntervalMs` | `15000` | Intervalo del poll de salud. `0` desactiva. |

## Notas técnicas

- El webview usa **postMessage** con tipos compartidos en
  [`src/chat/messages.ts`](src/chat/messages.ts). No hay framework: HTML + JS
  plano + un renderer markdown mínimo (subset seguro con HTML escapado).
- El SSE se parsea sobre el `ReadableStream` del `fetch` nativo de Node 20 que
  embebe VSCode — sin dependencias adicionales.
- El `retainContextWhenHidden: true` evita perder el chat al cambiar de tab.
- Si el backend no responde, el status bar pasa a rojo y muestra
  *"Alfred no responde — abre la app de Alfred"*. El chat sigue siendo usable
  (mostrará error en la respuesta del modelo si se intenta enviar).
- El cliente solicita la cancelación llamando a `/query/cancel` con el
  `request_id` recibido en el evento SSE `start`.

## Pendiente para fases siguientes

- Fase 4: modo agente que consume `mcp-server` + tools de filesystem para editar
  archivos del workspace, con aprobación humana por write/edit/delete.
- Listado/cambio de conversaciones (hoy solo se persiste la activa).
- Comando `Edit with Alfred` (Ctrl+I, estilo Cursor).
