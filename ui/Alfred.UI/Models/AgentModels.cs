using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;

namespace Alfred.UI.Models;

// ============================================================================
// Modelos del bucle agentico (Fase 3 plan VSC+MCP)
// ============================================================================
// Mapean 1:1 con los structs en C++ (`include/alfred/tool_protocol.h`) y con
// los tools que expone un MCP server. Mismo nombre de campos JSON para que
// se serialicen identicos a lo que espera /query/agent/stream.
// ============================================================================

/// <summary>
/// Especificacion de una herramienta disponible para el modelo. Se manda al
/// backend en cada call de /query/agent/stream para que el LLM la tenga en
/// el system prompt.
/// </summary>
public sealed class ToolSpec
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = "";

    [JsonPropertyName("description")]
    public string Description { get; set; } = "";

    /// <summary>JSONSchema (draft-07) de los argumentos.</summary>
    [JsonPropertyName("input_schema")]
    public JsonElement InputSchema { get; set; }

    /// <summary>
    /// Para uso interno de la UI: nombre del MCP server al que pertenece esta
    /// tool. NO se serializa al backend.
    /// </summary>
    [JsonIgnore]
    public string ServerName { get; set; } = "";
}

/// <summary>
/// Tool-call emitida por el modelo durante la generacion. Llega via SSE en el
/// evento `tool_call`.
/// </summary>
public sealed class ToolCall
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = "";

    [JsonPropertyName("name")]
    public string Name { get; set; } = "";

    /// <summary>Argumentos serializados por el modelo. Cualquier shape JSON.</summary>
    [JsonPropertyName("arguments")]
    public JsonElement Arguments { get; set; }
}

/// <summary>
/// Resultado de ejecutar una tool, que se devuelve al backend en la siguiente
/// llamada para continuar el bucle agentico.
/// </summary>
public sealed class ToolResult
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = "";

    /// <summary>
    /// Texto plano (puede ser JSON serializado). Tambien acepta objeto, pero
    /// por simplicidad la UI siempre envia string.
    /// </summary>
    [JsonPropertyName("content")]
    public string Content { get; set; } = "";

    [JsonPropertyName("is_error")]
    public bool IsError { get; set; }
}

/// <summary>
/// Body de POST /query/agent/stream.
/// </summary>
public sealed class AgentQueryRequest
{
    [JsonPropertyName("question")]
    public string Question { get; set; } = "";

    [JsonPropertyName("conversation_id")]
    public string? ConversationId { get; set; }

    [JsonPropertyName("tools")]
    public List<ToolSpec>? Tools { get; set; }

    [JsonPropertyName("tool_results")]
    public List<ToolResult>? ToolResults { get; set; }

    [JsonPropertyName("attached_files")]
    public List<AttachedFileData>? AttachedFiles { get; set; }
}

/// <summary>
/// Payload del evento SSE `done` del endpoint agentico.
/// </summary>
public sealed class AgentDonePayload
{
    [JsonPropertyName("answer")]
    public string Answer { get; set; } = "";

    [JsonPropertyName("cancelled")]
    public bool Cancelled { get; set; }

    [JsonPropertyName("time_ms")]
    public double TimeMs { get; set; }

    [JsonPropertyName("tool_calls")]
    public List<ToolCall> ToolCalls { get; set; } = new();

    [JsonPropertyName("finish_reason")]
    public string FinishReason { get; set; } = "";

    [JsonPropertyName("conversation_id")]
    public string? ConversationId { get; set; }
}

/// <summary>
/// Eventos que el endpoint agentico empuja al cliente, normalizados para que
/// la capa de UI no dependa del transporte SSE.
/// </summary>
public abstract record AgentStreamEvent
{
    public sealed record Started(long RequestId) : AgentStreamEvent;
    public sealed record Token(string Text)      : AgentStreamEvent;
    public sealed record ToolCallEmitted(ToolCall Call) : AgentStreamEvent;
    public sealed record Done(AgentDonePayload Payload) : AgentStreamEvent;
    public sealed record Error(string Message)   : AgentStreamEvent;
}

/// <summary>
/// Helpers para convertir entre string<->JsonElement de forma robusta.
/// </summary>
public static class JsonElementHelpers
{
    private static readonly JsonElement EmptyObject = JsonDocument.Parse("{}").RootElement.Clone();

    public static JsonElement EmptyObjectClone() => EmptyObject;

    public static JsonElement FromString(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return EmptyObject;
        try
        {
            using var doc = JsonDocument.Parse(raw);
            return doc.RootElement.Clone();
        }
        catch
        {
            return EmptyObject;
        }
    }

    public static Dictionary<string, object?> ToDictionary(JsonElement element)
    {
        var node = JsonNode.Parse(element.GetRawText());
        if (node is JsonObject obj)
        {
            var dict = new Dictionary<string, object?>();
            foreach (var kv in obj)
                dict[kv.Key] = JsonNodeToObject(kv.Value);
            return dict;
        }
        return new Dictionary<string, object?>();
    }

    private static object? JsonNodeToObject(JsonNode? n) => n switch
    {
        null => null,
        JsonValue v when v.TryGetValue<string>(out var s) => s,
        JsonValue v when v.TryGetValue<bool>(out var b)   => b,
        JsonValue v when v.TryGetValue<long>(out var l)   => l,
        JsonValue v when v.TryGetValue<double>(out var d) => d,
        _ => n.ToJsonString(),
    };
}
