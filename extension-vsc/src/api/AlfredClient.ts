// Cliente HTTP/SSE contra el backend de Alfred (REST :8000).
// Usa el fetch nativo de Node 18+/20+ que VSCode embebe.

import type { ModelInfo } from "../chat/messages";

export interface AlfredClientOptions {
  baseUrl: string;
  timeoutMs?: number;
}

export interface QueryResult {
  answer: string;
  from_cache: boolean;
  time_ms: number;
  conversation_id?: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ConversationDetail extends ConversationSummary {
  messages: Array<{ id: number | string; role: string; content: string; timestamp: string }>;
}

export interface ModelStatus {
  llm_loaded: boolean;
  llm_model: string;
  models_dir: string;
}

export type StreamEvent =
  | { type: "start"; request_id: number }
  | { type: "token"; text: string }
  | { type: "done"; payload: Record<string, unknown> }
  | { type: "error"; message: string }
  | { type: "raw"; event: string; data: string };

export class AlfredApiError extends Error {
  constructor(public readonly status: number, message: string, public readonly body?: string) {
    super(`Alfred API ${status}: ${message}`);
    this.name = "AlfredApiError";
  }
}

const DEFAULT_TIMEOUT = 120_000;

export class AlfredClient {
  baseUrl: string;
  timeoutMs: number;

  constructor(opts: AlfredClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT;
  }

  setBaseUrl(url: string): void {
    this.baseUrl = url.replace(/\/+$/, "");
  }

  // ---------------------------------------------------------------- Salud
  async health(signal?: AbortSignal): Promise<{ status: string }> {
    return this.requestJson("GET", "/health", undefined, signal);
  }

  // ---------------------------------------------------------------- Modelos
  async listModels(): Promise<ModelInfo[]> {
    return this.requestJson<ModelInfo[]>("GET", "/models");
  }

  async modelStatus(): Promise<ModelStatus> {
    return this.requestJson<ModelStatus>("GET", "/models/status");
  }

  async changeModel(opts: { model_path?: string; model_name?: string }): Promise<{ status: string; model: string }> {
    return this.requestJson("POST", "/models/change", opts);
  }

  // ---------------------------------------------------------------- Conversaciones
  async createConversation(title?: string): Promise<{ id: string; title: string }> {
    return this.requestJson("POST", "/conversations", title ? { title } : {});
  }

  async getConversation(id: string): Promise<ConversationDetail> {
    return this.requestJson<ConversationDetail>("GET", `/conversations/${encodeURIComponent(id)}`);
  }

  async deleteConversation(id: string): Promise<{ status: string }> {
    return this.requestJson("DELETE", `/conversations/${encodeURIComponent(id)}`);
  }

  // ---------------------------------------------------------------- Cancelacion
  async cancelQuery(requestId?: number): Promise<{ cancelled: boolean; request_id: number }> {
    return this.requestJson("POST", "/query/cancel", requestId ? { request_id: requestId } : {});
  }

  // ---------------------------------------------------------------- Query stream
  async *streamQuery(
    question: string,
    conversationId: string | null,
    signal: AbortSignal,
  ): AsyncGenerator<StreamEvent, void, void> {
    const path = conversationId
      ? `/conversations/${encodeURIComponent(conversationId)}/query/stream`
      : "/query/stream";
    yield* this.openSseStream(path, { question }, signal);
  }

  // ---------------------------------------------------------------- HTTP
  private async requestJson<T>(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    body?: unknown,
    externalSignal?: AbortSignal,
  ): Promise<T> {
    const url = `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    const ac = new AbortController();
    const onAbort = () => ac.abort();
    if (externalSignal) {
      if (externalSignal.aborted) ac.abort();
      else externalSignal.addEventListener("abort", onAbort, { once: true });
    }
    const timer = setTimeout(() => ac.abort(), this.timeoutMs);
    try {
      const res = await fetch(url, {
        method,
        headers: body !== undefined ? { "content-type": "application/json" } : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: ac.signal,
      });
      const text = await res.text();
      if (!res.ok) {
        let msg = text;
        try {
          const parsed = JSON.parse(text) as { error?: string };
          if (parsed?.error) msg = parsed.error;
        } catch {
          /* not json */
        }
        throw new AlfredApiError(res.status, msg, text);
      }
      if (!text) return undefined as unknown as T;
      return JSON.parse(text) as T;
    } finally {
      clearTimeout(timer);
      if (externalSignal) externalSignal.removeEventListener("abort", onAbort);
    }
  }

  // ---------------------------------------------------------------- SSE
  async *openSseStream(
    path: string,
    body: unknown,
    signal: AbortSignal,
  ): AsyncGenerator<StreamEvent, void, void> {
    const url = `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "text/event-stream",
      },
      body: JSON.stringify(body),
      signal,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new AlfredApiError(res.status, text, text);
    }
    if (!res.body) {
      throw new Error("Respuesta SSE sin body");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let sepIdx: number;
        while ((sepIdx = findEventBoundary(buffer)) !== -1) {
          const rawEvent = buffer.slice(0, sepIdx);
          buffer = buffer.slice(sepIdx).replace(/^(?:\r?\n)+/, "");
          const parsed = parseSseFrame(rawEvent);
          if (!parsed) continue;
          yield mapEvent(parsed.event, parsed.data);
        }
      }
      if (buffer.trim().length > 0) {
        const parsed = parseSseFrame(buffer);
        if (parsed) yield mapEvent(parsed.event, parsed.data);
      }
    } finally {
      try {
        reader.releaseLock();
      } catch {
        /* ignore */
      }
    }
  }
}

function findEventBoundary(buf: string): number {
  const lf = buf.indexOf("\n\n");
  const crlf = buf.indexOf("\r\n\r\n");
  if (lf === -1) return crlf;
  if (crlf === -1) return lf;
  return Math.min(lf, crlf);
}

function parseSseFrame(frame: string): { event: string; data: string } | null {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of frame.split(/\r?\n/)) {
    if (!line || line.startsWith(":")) continue;
    const idx = line.indexOf(":");
    const field = idx === -1 ? line : line.slice(0, idx);
    const value = idx === -1 ? "" : line.slice(idx + 1).replace(/^ /, "");
    if (field === "event") event = value;
    else if (field === "data") dataLines.push(value);
  }
  if (dataLines.length === 0) return null;
  return { event, data: dataLines.join("\n") };
}

function mapEvent(event: string, data: string): StreamEvent {
  if (event === "token") {
    try {
      const parsed = JSON.parse(data) as { text?: string };
      return { type: "token", text: parsed.text ?? "" };
    } catch {
      return { type: "raw", event, data };
    }
  }
  if (event === "start") {
    try {
      const parsed = JSON.parse(data) as { request_id?: number };
      return { type: "start", request_id: Number(parsed.request_id ?? 0) };
    } catch {
      return { type: "raw", event, data };
    }
  }
  if (event === "done") {
    try {
      return { type: "done", payload: JSON.parse(data) as Record<string, unknown> };
    } catch {
      return { type: "raw", event, data };
    }
  }
  if (event === "error") {
    return { type: "error", message: data };
  }
  return { type: "raw", event, data };
}
