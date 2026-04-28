// Tools de conversaciones: crear, listar, obtener, borrar y preguntar dentro
// de una conversacion existente.

import { z } from "zod";
import { errorResult, jsonResult, textResult, type ToolModule } from "./types.js";

const CreateSchema = z.object({
  title: z.string().optional(),
});

export const createConversationTool: ToolModule = {
  definition: {
    name: "create_conversation",
    description:
      "Crea una nueva conversacion en Alfred. Devuelve el id y titulo de la conversacion creada.",
    inputSchema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description:
            "(Opcional) Titulo de la conversacion. Si se omite, Alfred usa 'Nueva conversacion'.",
        },
      },
    },
  },
  async handler(rawArgs, ctx) {
    const parsed = CreateSchema.safeParse(rawArgs);
    if (!parsed.success) return errorResult(parsed.error.message);
    try {
      const result = await ctx.client.createConversation(parsed.data.title);
      return jsonResult(result);
    } catch (err) {
      return errorResult(err);
    }
  },
};

const ListSchema = z.object({
  limit: z.number().int().min(1).max(500).optional(),
  offset: z.number().int().min(0).optional(),
});

export const listConversationsTool: ToolModule = {
  definition: {
    name: "list_conversations",
    description:
      "Lista las conversaciones almacenadas en Alfred (id, titulo, fechas). Soporta paginado con limit/offset.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          description: "Maximo de conversaciones a devolver (1-500). Default 50.",
        },
        offset: {
          type: "integer",
          description: "Offset para paginar. Default 0.",
        },
      },
    },
  },
  async handler(rawArgs, ctx) {
    const parsed = ListSchema.safeParse(rawArgs);
    if (!parsed.success) return errorResult(parsed.error.message);
    try {
      const result = await ctx.client.listConversations(
        parsed.data.limit ?? 50,
        parsed.data.offset ?? 0,
      );
      return jsonResult(result);
    } catch (err) {
      return errorResult(err);
    }
  },
};

const IdSchema = z.object({
  id: z.string().min(1, "id requerido"),
});

export const getConversationTool: ToolModule = {
  definition: {
    name: "get_conversation",
    description:
      "Devuelve los metadatos y mensajes de una conversacion (rol, contenido, timestamp).",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "ID de la conversacion." },
      },
      required: ["id"],
    },
  },
  async handler(rawArgs, ctx) {
    const parsed = IdSchema.safeParse(rawArgs);
    if (!parsed.success) return errorResult(parsed.error.message);
    try {
      const result = await ctx.client.getConversation(parsed.data.id);
      return jsonResult(result);
    } catch (err) {
      return errorResult(err);
    }
  },
};

export const deleteConversationTool: ToolModule = {
  definition: {
    name: "delete_conversation",
    description: "Elimina una conversacion por id (incluye sus mensajes).",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "ID de la conversacion a eliminar." },
      },
      required: ["id"],
    },
  },
  async handler(rawArgs, ctx) {
    const parsed = IdSchema.safeParse(rawArgs);
    if (!parsed.success) return errorResult(parsed.error.message);
    try {
      const result = await ctx.client.deleteConversation(parsed.data.id);
      return jsonResult(result);
    } catch (err) {
      return errorResult(err);
    }
  },
};

const AskInConvSchema = z.object({
  conversation_id: z.string().min(1),
  question: z.string().min(1),
});

export const askInConversationTool: ToolModule = {
  definition: {
    name: "ask_in_conversation",
    description:
      "Hace una pregunta dentro de una conversacion existente. La pregunta y la respuesta se guardan en el historial.",
    inputSchema: {
      type: "object",
      properties: {
        conversation_id: { type: "string" },
        question: { type: "string" },
      },
      required: ["conversation_id", "question"],
    },
  },
  async handler(rawArgs, ctx) {
    const parsed = AskInConvSchema.safeParse(rawArgs);
    if (!parsed.success) return errorResult(parsed.error.message);
    try {
      const result = await ctx.client.query(parsed.data.question, parsed.data.conversation_id);
      return textResult(result.answer);
    } catch (err) {
      return errorResult(err);
    }
  },
};
