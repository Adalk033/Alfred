// Tools relacionadas con la gestion de modelos:
//   list_models, get_model_status, change_model.

import { z } from "zod";
import { errorResult, jsonResult, type ToolModule } from "./types.js";

export const listModelsTool: ToolModule = {
  definition: {
    name: "list_models",
    description:
      "Lista los modelos GGUF disponibles en el directorio configurado de Alfred (nombre, ruta y tamano).",
    inputSchema: { type: "object", properties: {} },
  },
  async handler(_args, ctx) {
    try {
      const models = await ctx.client.listModels();
      return jsonResult(models);
    } catch (err) {
      return errorResult(err);
    }
  },
};

export const modelStatusTool: ToolModule = {
  definition: {
    name: "get_model_status",
    description:
      "Devuelve el estado del modelo activo en Alfred: si esta cargado, su nombre y el directorio de modelos.",
    inputSchema: { type: "object", properties: {} },
  },
  async handler(_args, ctx) {
    try {
      const status = await ctx.client.modelStatus();
      return jsonResult(status);
    } catch (err) {
      return errorResult(err);
    }
  },
};

const ChangeModelSchema = z
  .object({
    model_name: z.string().optional(),
    model_path: z.string().optional(),
  })
  .refine(
    (v) => Boolean(v.model_name || v.model_path),
    "Debes pasar model_name o model_path",
  );

export const changeModelTool: ToolModule = {
  definition: {
    name: "change_model",
    description:
      "Cambia el modelo LLM activo de Alfred. Acepta model_name (relativo al directorio de modelos) o model_path (ruta absoluta a un .gguf).",
    inputSchema: {
      type: "object",
      properties: {
        model_name: {
          type: "string",
          description:
            "Nombre del archivo .gguf dentro del directorio configurado de modelos.",
        },
        model_path: {
          type: "string",
          description: "Ruta absoluta a un archivo .gguf.",
        },
      },
    },
  },
  async handler(rawArgs, ctx) {
    const parsed = ChangeModelSchema.safeParse(rawArgs);
    if (!parsed.success) return errorResult(parsed.error.message);
    try {
      const result = await ctx.client.changeModel(parsed.data);
      return jsonResult(result);
    } catch (err) {
      return errorResult(err);
    }
  },
};
