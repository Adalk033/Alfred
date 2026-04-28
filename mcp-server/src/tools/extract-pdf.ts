// Tool: extract_pdf
// Lee un PDF del filesystem local y delega la extraccion al backend.

import { readFile } from "node:fs/promises";
import { basename, isAbsolute, resolve } from "node:path";
import { z } from "zod";
import { errorResult, jsonResult, type ToolModule } from "./types.js";

const InputSchema = z.object({
  path: z.string().min(1, "path requerido"),
});

export const extractPdfTool: ToolModule = {
  definition: {
    name: "extract_pdf",
    description:
      "Extrae texto y chunks de un PDF local. Lee el archivo desde disco y lo envia al backend de Alfred via /files/extract-pdf. La ruta puede ser absoluta o relativa al cwd.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Ruta al PDF (absoluta o relativa al cwd).",
        },
      },
      required: ["path"],
    },
  },
  async handler(rawArgs, ctx) {
    const parsed = InputSchema.safeParse(rawArgs);
    if (!parsed.success) return errorResult(parsed.error.message);

    const path = isAbsolute(parsed.data.path)
      ? parsed.data.path
      : resolve(process.cwd(), parsed.data.path);

    try {
      const bytes = await readFile(path);
      if (bytes.length < 4 || bytes.subarray(0, 4).toString("ascii") !== "%PDF") {
        return errorResult(
          new Error(`El archivo '${path}' no parece ser un PDF (cabecera %PDF ausente).`),
        );
      }
      const dataBase64 = bytes.toString("base64");
      const result = await ctx.client.extractPdf(basename(path), dataBase64);
      return jsonResult({
        filename: result.filename,
        pages: result.pages,
        total_tokens: result.total_tokens,
        // Texto completo puede ser enorme; lo dejamos pero el cliente decidira
        // si lo recorta. Los chunks van como referencia.
        text: result.text,
        chunk_count: result.chunks.length,
      });
    } catch (err) {
      return errorResult(err);
    }
  },
};
