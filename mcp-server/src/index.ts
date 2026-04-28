#!/usr/bin/env node
// Entry point del MCP server de Alfred.
// Transport: stdio (lo que esperan Claude Code y Cursor).
// Variable de entorno: ALFRED_BASE_URL (default http://127.0.0.1:8000).

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { AlfredClient } from "./alfred-client.js";
import { askTool } from "./tools/ask.js";
import {
  askInConversationTool,
  createConversationTool,
  deleteConversationTool,
  getConversationTool,
  listConversationsTool,
} from "./tools/conversations.js";
import { extractPdfTool } from "./tools/extract-pdf.js";
import { changeModelTool, listModelsTool, modelStatusTool } from "./tools/models.js";
import { makeStreamTool } from "./tools/stream.js";
import type { ToolModule } from "./tools/types.js";
import {
  listConversationResources,
  listConversationTemplates,
  readConversationResource,
} from "./resources/conversations.js";

const SERVER_NAME = "alfred-mcp";
const SERVER_VERSION = "0.1.0";

async function main(): Promise<void> {
  const client = new AlfredClient();

  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      capabilities: {
        tools: {},
        resources: {},
        logging: {},
      },
    },
  );

  const tools: ToolModule[] = [
    askTool,
    makeStreamTool(server),
    listModelsTool,
    modelStatusTool,
    changeModelTool,
    createConversationTool,
    listConversationsTool,
    getConversationTool,
    deleteConversationTool,
    askInConversationTool,
    extractPdfTool,
  ];

  const toolsByName = new Map(tools.map((t) => [t.definition.name, t] as const));

  // -------------------- tools/list --------------------
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => t.definition),
  }));

  // -------------------- tools/call --------------------
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = toolsByName.get(req.params.name);
    if (!tool) {
      return {
        content: [{ type: "text", text: `Tool no encontrada: ${req.params.name}` }],
        isError: true,
      };
    }
    return tool.handler(req.params.arguments ?? {}, { client });
  });

  // -------------------- resources/list --------------------
  server.setRequestHandler(ListResourcesRequestSchema, async () =>
    listConversationResources(client),
  );

  // -------------------- resources/templates/list --------------------
  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () =>
    listConversationTemplates(),
  );

  // -------------------- resources/read --------------------
  server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
    return readConversationResource(req.params.uri, client);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Aviso de arranque a stderr (stdout esta reservado para el protocolo MCP).
  process.stderr.write(
    `[${SERVER_NAME}] listening on stdio. backend=${client.baseUrl}\n`,
  );
}

main().catch((err) => {
  process.stderr.write(
    `[${SERVER_NAME}] fatal: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`,
  );
  process.exit(1);
});
