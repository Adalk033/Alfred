// Resources MCP de conversaciones.
// - alfred://conversations              → listado de conversaciones (json)
// - alfred://conversations/{id}         → conversacion completa con mensajes (json)
//
// Usamos `resources/list` para enumerar y `resources/read` para resolver la URI
// dinamica. La forma con plantilla la exponemos via `resources/templates/list`.

import type {
  ListResourcesResult,
  ListResourceTemplatesResult,
  ReadResourceResult,
  Resource,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/types.js";
import type { AlfredClient } from "../alfred-client.js";

const SCHEME = "alfred";
const HOST = "conversations";

export const conversationsTemplate: ResourceTemplate = {
  uriTemplate: `${SCHEME}://${HOST}/{id}`,
  name: "Alfred conversation",
  description:
    "Una conversacion concreta de Alfred (metadatos + historial de mensajes) en formato JSON.",
  mimeType: "application/json",
};

export const conversationsListResource: Resource = {
  uri: `${SCHEME}://${HOST}`,
  name: "Alfred conversations (index)",
  description:
    "Indice de todas las conversaciones de Alfred (id, titulo, fechas) en formato JSON.",
  mimeType: "application/json",
};

export async function listConversationResources(
  client: AlfredClient,
): Promise<ListResourcesResult> {
  const resources: Resource[] = [conversationsListResource];
  try {
    const items = await client.listConversations(50, 0);
    for (const c of items) {
      resources.push({
        uri: `${SCHEME}://${HOST}/${encodeURIComponent(c.id)}`,
        name: c.title || c.id,
        description: `Conversacion '${c.title || c.id}' (actualizada ${c.updated_at}).`,
        mimeType: "application/json",
      });
    }
  } catch {
    // Si el backend esta caido devolvemos solo el indice raiz.
  }
  return { resources };
}

export function listConversationTemplates(): ListResourceTemplatesResult {
  return { resourceTemplates: [conversationsTemplate] };
}

export async function readConversationResource(
  uri: string,
  client: AlfredClient,
): Promise<ReadResourceResult> {
  const parsed = parseUri(uri);
  if (!parsed) {
    throw new Error(`URI no soportada: ${uri}`);
  }

  if (parsed.kind === "list") {
    const items = await client.listConversations(200, 0);
    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify(items, null, 2),
        },
      ],
    };
  }

  const detail = await client.getConversation(parsed.id);
  return {
    contents: [
      {
        uri,
        mimeType: "application/json",
        text: JSON.stringify(detail, null, 2),
      },
    ],
  };
}

export function isConversationUri(uri: string): boolean {
  return parseUri(uri) !== null;
}

function parseUri(uri: string): { kind: "list" } | { kind: "detail"; id: string } | null {
  try {
    const url = new URL(uri);
    if (url.protocol !== `${SCHEME}:`) return null;
    if (url.host !== HOST) return null;
    const path = url.pathname.replace(/^\/+/, "");
    if (!path) return { kind: "list" };
    return { kind: "detail", id: decodeURIComponent(path) };
  } catch {
    return null;
  }
}
