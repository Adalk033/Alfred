// Tipos compartidos por todas las tools.

import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import type { AlfredClient } from "../alfred-client.js";

export interface ToolContext {
  client: AlfredClient;
}

export interface ToolModule {
  definition: Tool;
  handler: (args: unknown, ctx: ToolContext) => Promise<CallToolResult>;
}

// Helpers para construir resultados MCP de manera consistente.
export function textResult(text: string, isError = false): CallToolResult {
  return {
    content: [{ type: "text", text }],
    isError,
  };
}

export function jsonResult(data: unknown, isError = false): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    isError,
  };
}

export function errorResult(err: unknown): CallToolResult {
  const msg = err instanceof Error ? err.message : String(err);
  return textResult(`Error: ${msg}`, true);
}
