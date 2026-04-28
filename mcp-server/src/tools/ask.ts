// Tool: ask_alfred
// Pregunta directa a Alfred. Sin streaming. Devuelve la respuesta completa.

import { z } from "zod";
import { errorResult, textResult, type ToolModule } from "./types.js";

const InputSchema = z.object({
  question: z.string().min(1, "question no puede estar vacio"),
  conversation_id: z.string().optional(),
});

export const askTool: ToolModule = {
  definition: {
    name: "ask_alfred",
    description:
      "Hace una pregunta a Alfred (LLM local) y devuelve la respuesta completa. Si pasas conversation_id, la pregunta se guarda en el historial de esa conversacion.",
    inputSchema: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description: "Pregunta o instruccion para Alfred.",
        },
        conversation_id: {
          type: "string",
          description:
            "(Opcional) ID de una conversacion existente. Si se pasa, el query se ejecuta en ese contexto.",
        },
      },
      required: ["question"],
    },
  },
  async handler(rawArgs, ctx) {
    const parsed = InputSchema.safeParse(rawArgs);
    if (!parsed.success) return errorResult(parsed.error.message);

    try {
      const result = await ctx.client.query(parsed.data.question, parsed.data.conversation_id);
      return textResult(result.answer);
    } catch (err) {
      return errorResult(err);
    }
  },
};
