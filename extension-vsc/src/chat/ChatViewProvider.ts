// Provider de la vista lateral de chat. Inicializa el webview, sirve el HTML y
// hace de puente entre el webview y el AlfredClient.

import * as vscode from "vscode";
import { randomUUID } from "node:crypto";
import { AlfredClient, AlfredApiError } from "../api/AlfredClient";
import { HealthMonitor } from "../api/health";
import { ConversationStore } from "../conversations/ConversationStore";
import type {
  ChatMessage,
  FromWebviewMessage,
  ModelInfo,
  ToWebviewMessage,
} from "./messages";

export class ChatViewProvider implements vscode.WebviewViewProvider {
  static readonly viewType = "alfred.chatView";

  private view: vscode.WebviewView | null = null;
  private currentStream: AbortController | null = null;
  private currentRequestId: number | null = null;
  private currentAssistantMsgId: string | null = null;

  private models: ModelInfo[] = [];
  private activeModel: string | null = null;
  private messages: ChatMessage[] = [];
  private conversationId: string | null = null;
  private webviewReady = false;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly client: AlfredClient,
    private readonly health: HealthMonitor,
    private readonly store: ConversationStore,
  ) {
    this.conversationId = store.getActiveId();
    if (this.conversationId) {
      this.messages = store.getMessages(this.conversationId);
    }

    health.onChange((ok, reason) => {
      this.post({ type: "backend-status", ok, reason });
      if (ok && this.models.length === 0) {
        void this.refreshModels();
      }
    });
  }

  resolveWebviewView(view: vscode.WebviewView): void | Thenable<void> {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "media")],
    };
    view.webview.html = this.renderHtml(view.webview);

    view.webview.onDidReceiveMessage(
      (msg: FromWebviewMessage) => void this.onWebviewMessage(msg),
      undefined,
      this.context.subscriptions,
    );

    view.onDidDispose(() => {
      this.view = null;
      this.webviewReady = false;
    });
  }

  // ----------------------------------------------------- API publica
  async focus(): Promise<void> {
    await vscode.commands.executeCommand("alfred.chatView.focus");
  }

  async sendUserPrompt(text: string): Promise<void> {
    if (!text.trim()) return;
    if (!this.view) {
      await this.focus();
      // Esperar al ready
      await this.waitForReady(2000);
    }
    await this.handleSend(text);
  }

  async newConversation(): Promise<void> {
    await this.cancelCurrent();
    if (this.conversationId) {
      await this.store.clearMessages(this.conversationId);
    }
    this.conversationId = null;
    this.messages = [];
    await this.store.setActiveId(null);
    this.post({ type: "history-cleared" });
  }

  async cancelCurrent(): Promise<void> {
    if (!this.currentStream) return;
    try {
      this.currentStream.abort();
    } catch {
      /* ignore */
    }
    if (this.currentRequestId != null) {
      try {
        await this.client.cancelQuery(this.currentRequestId);
      } catch {
        /* ignore */
      }
    }
    this.currentStream = null;
    this.currentRequestId = null;
  }

  // ----------------------------------------------------- Init data
  private async waitForReady(timeoutMs: number): Promise<void> {
    if (this.webviewReady) return;
    await new Promise<void>((resolve) => {
      const start = Date.now();
      const tick = () => {
        if (this.webviewReady || Date.now() - start > timeoutMs) {
          resolve();
        } else {
          setTimeout(tick, 50);
        }
      };
      tick();
    });
  }

  private async sendInit(): Promise<void> {
    const ok = await this.health.checkOnce();
    let models: ModelInfo[] = [];
    let active: string | null = null;
    if (ok) {
      try {
        models = await this.client.listModels();
        const status = await this.client.modelStatus();
        active = status.llm_model || null;
      } catch {
        /* el health pasa de OK a KO si esto fallo */
      }
    }
    this.models = models;
    this.activeModel = active;

    this.post({
      type: "init",
      conversationId: this.conversationId,
      messages: this.messages,
      models,
      activeModel: active,
      backendOk: ok,
    });
  }

  private async refreshModels(): Promise<void> {
    try {
      const models = await this.client.listModels();
      const status = await this.client.modelStatus();
      this.models = models;
      this.activeModel = status.llm_model || null;
      this.post({ type: "models", models, activeModel: this.activeModel });
    } catch {
      /* silencioso */
    }
  }

  // ----------------------------------------------------- Mensajes desde webview
  private async onWebviewMessage(msg: FromWebviewMessage): Promise<void> {
    switch (msg.type) {
      case "ready":
        this.webviewReady = true;
        await this.sendInit();
        break;
      case "send":
        await this.handleSend(msg.text);
        break;
      case "cancel":
        await this.cancelCurrent();
        break;
      case "new-conversation":
        await this.newConversation();
        break;
      case "change-model":
        await this.handleChangeModel(msg.modelName);
        break;
      case "refresh-models":
        await this.refreshModels();
        break;
      case "open-settings":
        await vscode.commands.executeCommand(
          "workbench.action.openSettings",
          "@ext:alfred.alfred-vsc",
        );
        break;
    }
  }

  private async handleChangeModel(modelName: string): Promise<void> {
    try {
      await this.client.changeModel({ model_name: modelName });
      this.activeModel = modelName;
      this.post({ type: "models", models: this.models, activeModel: this.activeModel });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      void vscode.window.showErrorMessage(`No se pudo cambiar el modelo: ${msg}`);
    }
  }

  private async handleSend(text: string): Promise<void> {
    if (!text.trim()) return;
    if (this.currentStream) {
      void vscode.window.showWarningMessage("Hay una generacion en curso. Cancelala primero.");
      return;
    }

    // Asegurar conversacion
    if (!this.conversationId) {
      try {
        const created = await this.client.createConversation();
        this.conversationId = created.id;
        await this.store.setActiveId(created.id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        void vscode.window.showErrorMessage(`No se pudo crear la conversacion: ${msg}`);
        return;
      }
    }

    const userMsg: ChatMessage = {
      id: randomUUID(),
      role: "user",
      content: text,
      timestamp: Date.now(),
    };
    const assistantMsg: ChatMessage = {
      id: randomUUID(),
      role: "assistant",
      content: "",
      timestamp: Date.now(),
      pending: true,
    };
    this.messages.push(userMsg, assistantMsg);
    await this.persistMessages();

    this.post({ type: "message-append", message: userMsg });
    this.post({ type: "message-append", message: assistantMsg });
    this.post({ type: "stream-start", messageId: assistantMsg.id });

    const ac = new AbortController();
    this.currentStream = ac;
    this.currentAssistantMsgId = assistantMsg.id;

    try {
      let answer = "";
      for await (const evt of this.client.streamQuery(text, this.conversationId, ac.signal)) {
        if (evt.type === "start") {
          this.currentRequestId = evt.request_id;
        } else if (evt.type === "token") {
          answer += evt.text;
          this.post({ type: "stream-token", messageId: assistantMsg.id, text: evt.text });
        } else if (evt.type === "error") {
          throw new Error(evt.message);
        } else if (evt.type === "done") {
          const finalAnswer =
            typeof evt.payload?.answer === "string" ? (evt.payload.answer as string) : answer;
          assistantMsg.content = finalAnswer;
        }
      }
      if (!assistantMsg.content) assistantMsg.content = answer;
      assistantMsg.pending = false;
      await this.persistMessages();
      this.post({ type: "stream-done", messageId: assistantMsg.id });
    } catch (err) {
      const aborted =
        ac.signal.aborted ||
        (err instanceof Error && (err.name === "AbortError" || /aborted/i.test(err.message)));
      const message = aborted
        ? "Generacion cancelada."
        : err instanceof AlfredApiError
        ? err.message
        : err instanceof Error
        ? err.message
        : String(err);
      assistantMsg.content = assistantMsg.content || `*${message}*`;
      assistantMsg.pending = false;
      await this.persistMessages();
      this.post({ type: "stream-error", messageId: assistantMsg.id, message });
    } finally {
      if (this.currentStream === ac) {
        this.currentStream = null;
        this.currentRequestId = null;
        this.currentAssistantMsgId = null;
      }
    }
  }

  private async persistMessages(): Promise<void> {
    if (!this.conversationId) return;
    await this.store.setMessages(this.conversationId, this.messages);
  }

  // ----------------------------------------------------- HTML
  private post(msg: ToWebviewMessage): void {
    this.view?.webview.postMessage(msg);
  }

  private renderHtml(webview: vscode.Webview): string {
    const mediaUri = (...p: string[]) =>
      webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "media", ...p));

    const scriptUri = mediaUri("webview", "main.js");
    const styleUri = mediaUri("webview", "styles.css");
    const nonce = randomNonce();

    const csp = [
      `default-src 'none'`,
      `img-src ${webview.cspSource} data:`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${nonce}'`,
      `font-src ${webview.cspSource}`,
    ].join("; ");

    return /* html */ `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="${styleUri}" />
  <title>Alfred</title>
</head>
<body>
  <header class="topbar">
    <div class="status" id="status">
      <span class="dot dot-unknown" id="status-dot"></span>
      <span id="status-text">Comprobando backend...</span>
    </div>
    <div class="controls">
      <select id="model-select" title="Modelo activo"></select>
      <button id="new-btn" title="Nueva conversacion">+</button>
    </div>
  </header>
  <main id="messages" class="messages" aria-live="polite"></main>
  <footer class="composer">
    <textarea id="input" rows="2" placeholder="Pregunta a Alfred (Enter para enviar, Shift+Enter para nueva linea)"></textarea>
    <div class="composer-actions">
      <button id="cancel-btn" disabled>Cancelar</button>
      <button id="send-btn">Enviar</button>
    </div>
  </footer>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function randomNonce(): string {
  const buf = new Uint8Array(16);
  for (let i = 0; i < buf.length; i++) buf[i] = Math.floor(Math.random() * 256);
  return Buffer.from(buf).toString("hex");
}
