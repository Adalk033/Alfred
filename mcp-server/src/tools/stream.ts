// Tool: ask_alfred_stream
// Pregunta a Alfred consumiendo el SSE de /query/stream. Emite progress
// notifications con los tokens parciales (cuando el cliente pasa _meta.progressToken)
// y devuelve la respuesta completa al final.

import { z } from "zod";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { errorResult, textResult, type ToolModule } from "./types.js";

const InputSchema = z.object({
  question: z.string().min(1, "question no puede estar vacio"),
  conversation_id: z.string().optional(),
});

export function makeStreamTool(server: Server): ToolModule {
  return {
    definition: {
      name: "ask_alfred_stream",
      description:
        "Igual que ask_alfred pero usa streaming SSE del backend. Emite progress notifications con tokens parciales si el cliente pasa _meta.progressToken; devuelve el texto completo al final.",
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
              "(Opcional) ID de una conversacion existente para mantener contexto.",
          },
        },
        required: ["question"],
      },
    },
    async handler(rawArgs, ctx) {
      const parsed = InputSchema.safeParse(rawArgs);
      if (!parsed.success) return errorResult(parsed.error.message);

      const meta = (rawArgs as { _meta?: { progressToken?: string | number } } | undefined)?._meta;
      const progressToken = meta?.progressToken;

      let progress = 0;
      try {
        const result = await ctx.client.queryStream(
          parsed.data.question,
          (chunk) => {
            progress += chunk.length;
            if (progressToken !== undefined) {
              // Best-effort. No bloquear el loop si la notificacion falla.
              void server
                .notification({
                  method: "notifications/progress",
                  params: {
                    progressToken,
                    progress,
                    message: chunk,
                  },
                })
                .catch(() => undefined);
            }
          },
          parsed.data.conversation_id,
        );
        return textResult(result.answer);
      } catch (err) {
        return errorResult(err);
      }
    },
  };
}
