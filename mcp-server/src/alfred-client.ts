// Wrapper sobre el REST de Alfred (http://127.0.0.1:8000).
// Cubre todos los endpoints que necesitamos exponer como tools MCP.

import { request } from "undici";

export interface AlfredClientOptions {
  baseUrl?: string;
  timeoutMs?: number;
}

export interface QueryResult {
  answer: string;
  from_cache: boolean;
  time_ms: number;
  personal_data?: unknown;
  conversation_id?: string;
}

export interface ModelInfo {
  name: string;
  path: string;
  size_bytes: number;
  size_gb: number;
}

export interface ConversationSummary {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ConversationMessage {
  id: number | string;
  role: string;
  content: string;
  timestamp: string;
}

export interface ConversationDetail extends ConversationSummary {
  messages: ConversationMessage[];
}

export interface ModelStatus {
  llm_loaded: boolean;
  llm_model: string;
  models_dir: string;
}

export interface PdfExtractResult {
  filename: string;
  pages: number;
  total_tokens: number;
  text: string;
  chunks: Array<{
    page_start: number;
    page_end: number;
    tokens: number;
    text: string;
  }>;
}

export type StreamEvent =
  | { type: "start"; request_id: number }
  | { type: "token"; text: string }
  | { type: "done"; payload: Record<string, unknown> }
  | { type: "error"; message: string }
  | { type: "raw"; event: string; data: string };

const DEFAULT_BASE = "http://127.0.0.1:8000";
const DEFAULT_TIMEOUT = 120_000;

export class AlfredApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: string,
  ) {
    super(`Alfred API ${status}: ${message}`);
    this.name = "AlfredApiError";
  }
}

export class AlfredClient {
  readonly baseUrl: string;
  readonly timeoutMs: number;

  constructor(opts: AlfredClientOptions = {}) {
    const env = process.env.ALFRED_BASE_URL?.trim();
    this.baseUrl = (opts.baseUrl ?? env ?? DEFAULT_BASE).replace(/\/+$/, "");
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT;
  }

  // ------------------------------------------------------------------
  // Salud
  // ------------------------------------------------------------------
  async health(): Promise<{ status: string; stats: unknown }> {
    return this.getJson("/health");
  }

  // ------------------------------------------------------------------
  // Query (no streaming)
  // ------------------------------------------------------------------
  async query(question: string, conversationId?: string): Promise<QueryResult> {
    if (conversationId) {
      const r = await this.postJson<QueryResult>(
        `/conversations/${encodeURIComponent(conversationId)}/query`,
        { question },
      );
      return r;
    }
    return this.postJson<QueryResult>("/query", { question });
  }

  // ------------------------------------------------------------------
  // Query streaming (SSE). Devuelve answer completo y permite callback por token.
  // ------------------------------------------------------------------
  async queryStream(
    question: string,
    onToken: (text: string) => void,
    conversationId?: string,
    signal?: AbortSignal,
  ): Promise<QueryResult> {
    const path = conversationId
      ? `/conversations/${encodeURIComponent(conversationId)}/query/stream`
      : "/query/stream";

    let answer = "";
    let donePayload: Record<string, unknown> | undefined;

    for await (const evt of this.openSseStream(path, { question }, signal)) {
      if (evt.type === "token") {
        answer += evt.text;
        onToken(evt.text);
      } else if (evt.type === "done") {
        donePayload = evt.payload;
      } else if (evt.type === "error") {
        throw new Error(evt.message);
      }
    }

    return {
      answer: typeof donePayload?.answer === "string" ? (donePayload.answer as string) : answer,
      from_cache: Boolean(donePayload?.from_cache),
      time_ms: Number(donePayload?.time_ms ?? 0),
      conversation_id: conversationId,
    };
  }

  // ------------------------------------------------------------------
  // Cancelacion
  // ------------------------------------------------------------------
  async cancelQuery(requestId?: number): Promise<{ cancelled: boolean; request_id: number }> {
    return this.postJson("/query/cancel", requestId ? { request_id: requestId } : {});
  }

  // ------------------------------------------------------------------
  // Modelos
  // ------------------------------------------------------------------
  async listModels(): Promise<ModelInfo[]> {
    return this.getJson<ModelInfo[]>("/models");
  }

  async modelStatus(): Promise<ModelStatus> {
    return this.getJson<ModelStatus>("/models/status");
  }

  async changeModel(opts: { model_path?: string; model_name?: string }): Promise<{
    status: string;
    model: string;
    warning?: string;
  }> {
    return this.postJson("/models/change", opts);
  }

  // ------------------------------------------------------------------
  // Conversaciones
  // ------------------------------------------------------------------
  async createConversation(title?: string): Promise<{ id: string; title: string }> {
    return this.postJson("/conversations", title ? { title } : {});
  }

  async listConversations(limit = 50, offset = 0): Promise<ConversationSummary[]> {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    return this.getJson<ConversationSummary[]>(`/conversations?${params}`);
  }

  async getConversation(id: string): Promise<ConversationDetail> {
    return this.getJson<ConversationDetail>(`/conversations/${encodeURIComponent(id)}`);
  }

  async deleteConversation(id: string): Promise<{ status: string }> {
    return this.deleteJson(`/conversations/${encodeURIComponent(id)}`);
  }

  async updateConversationTitle(id: string, title: string): Promise<{ status: string }> {
    return this.requestJson("PUT", `/conversations/${encodeURIComponent(id)}/title`, { title });
  }

  // ------------------------------------------------------------------
  // PDF
  // ------------------------------------------------------------------
  async extractPdf(filename: string, dataBase64: string): Promise<PdfExtractResult> {
    return this.postJson<PdfExtractResult>("/files/extract-pdf", {
      filename,
      data_base64: dataBase64,
    });
  }

  // ------------------------------------------------------------------
  // HTTP helpers
  // ------------------------------------------------------------------
  private async getJson<T>(path: string): Promise<T> {
    return this.requestJson<T>("GET", path);
  }

  private async postJson<T>(path: string, body: unknown): Promise<T> {
    return this.requestJson<T>("POST", path, body);
  }

  private async deleteJson<T>(path: string): Promise<T> {
    return this.requestJson<T>("DELETE", path);
  }

  private async requestJson<T>(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.timeoutMs);
    try {
      const res = await request(url, {
        method,
        headers: body !== undefined ? { "content-type": "application/json" } : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: ac.signal,
      });
      const text = await res.body.text();
      if (res.statusCode >= 400) {
        let msg = text;
        try {
          const parsed = JSON.parse(text) as { error?: string };
          if (parsed?.error) msg = parsed.error;
        } catch {
          /* not json */
        }
        throw new AlfredApiError(res.statusCode, msg, text);
      }
      if (!text) return undefined as unknown as T;
      return JSON.parse(text) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  // SSE stream parser. Itera eventos con shape { type, ... }.
  async *openSseStream(
    path: string,
    body: unknown,
    signal?: AbortSignal,
  ): AsyncGenerator<StreamEvent, void, void> {
    const url = `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    const res = await request(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "text/event-stream",
      },
      body: JSON.stringify(body),
      signal,
      bodyTimeout: 0,
      headersTimeout: this.timeoutMs,
    });

    if (res.statusCode >= 400) {
      const text = await res.body.text();
      throw new AlfredApiError(res.statusCode, text, text);
    }

    let buffer = "";
    for await (const chunk of res.body) {
      buffer += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");

      let sepIdx: number;
      // SSE separa eventos por \n\n. Soportar tambien \r\n\r\n.
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
  }
}

// ----------------------------------------------------------------------------
// Helpers de parseo SSE
// ----------------------------------------------------------------------------

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
