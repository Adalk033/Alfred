using System.Text.Json.Serialization;

namespace Alfred.UI.Models;

// ============================================================================
// Respuestas del backend REST API (localhost:8000)
// ============================================================================

public sealed class HealthResponse
{
    [JsonPropertyName("status")]
    public string Status { get; set; } = "";

    [JsonPropertyName("stats")]
    public object? Stats { get; set; }
}

public sealed class QueryRequest
{
    [JsonPropertyName("question")]
    public string Question { get; set; } = "";

    [JsonPropertyName("use_history")]
    public bool UseHistory { get; set; } = true;

    [JsonPropertyName("search_documents")]
    public bool SearchDocuments { get; set; } = true;
}

public sealed class QueryResponse
{
    [JsonPropertyName("answer")]
    public string Answer { get; set; } = "";

    [JsonPropertyName("sources")]
    public object? Sources { get; set; }

    [JsonPropertyName("personal_data")]
    public object? PersonalData { get; set; }

    [JsonPropertyName("from_cache")]
    public bool FromCache { get; set; }

    [JsonPropertyName("from_history")]
    public bool FromHistory { get; set; }

    [JsonPropertyName("time_ms")]
    public double TimeMs { get; set; }

    [JsonPropertyName("conversation_id")]
    public string? ConversationId { get; set; }
}

public sealed class ConversationThread
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = "";

    [JsonPropertyName("title")]
    public string Title { get; set; } = "";

    [JsonPropertyName("created_at")]
    public string CreatedAt { get; set; } = "";

    [JsonPropertyName("updated_at")]
    public string UpdatedAt { get; set; } = "";
}

public sealed class ConversationMessage
{
    [JsonPropertyName("id")]
    public long Id { get; set; }

    [JsonPropertyName("role")]
    public string Role { get; set; } = "";

    [JsonPropertyName("content")]
    public string Content { get; set; } = "";

    [JsonPropertyName("timestamp")]
    public string Timestamp { get; set; } = "";
}

public sealed class ConversationDetail
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = "";

    [JsonPropertyName("title")]
    public string Title { get; set; } = "";

    [JsonPropertyName("created_at")]
    public string CreatedAt { get; set; } = "";

    [JsonPropertyName("updated_at")]
    public string UpdatedAt { get; set; } = "";

    [JsonPropertyName("messages")]
    public List<ConversationMessage> Messages { get; set; } = [];
}

public sealed class ConversationQueryRequest
{
    [JsonPropertyName("question")]
    public string Question { get; set; } = "";

    [JsonPropertyName("use_history")]
    public bool UseHistory { get; set; } = true;

    [JsonPropertyName("search_documents")]
    public bool SearchDocuments { get; set; } = true;
}

public sealed class DocumentPathInfo
{
    [JsonPropertyName("id")]
    public long Id { get; set; }

    [JsonPropertyName("path")]
    public string Path { get; set; } = "";

    [JsonPropertyName("enabled")]
    public bool Enabled { get; set; } = true;

    [JsonPropertyName("documents_count")]
    public int DocumentsCount { get; set; }

    [JsonPropertyName("added_at")]
    public string AddedAt { get; set; } = "";
}

public sealed class HistoryEntry
{
    [JsonPropertyName("id")]
    public long Id { get; set; }

    [JsonPropertyName("question")]
    public string Question { get; set; } = "";

    [JsonPropertyName("answer")]
    public string Answer { get; set; } = "";

    [JsonPropertyName("timestamp")]
    public string Timestamp { get; set; } = "";

    [JsonPropertyName("score")]
    public double? Score { get; set; }

    [JsonPropertyName("personal_data")]
    public object? PersonalData { get; set; }

    [JsonPropertyName("sources")]
    public object? Sources { get; set; }
}

public sealed class ModelInfo
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = "";

    [JsonPropertyName("path")]
    public string Path { get; set; } = "";

    [JsonPropertyName("size_bytes")]
    public long SizeBytes { get; set; }

    [JsonPropertyName("size_gb")]
    public double SizeGb { get; set; }
}

public sealed class ModelStatus
{
    [JsonPropertyName("llm_loaded")]
    public bool LlmLoaded { get; set; }

    [JsonPropertyName("llm_model")]
    public string? LlmModel { get; set; }

    [JsonPropertyName("embedder_loaded")]
    public bool EmbedderLoaded { get; set; }

    [JsonPropertyName("embedder_model")]
    public string? EmbedderModel { get; set; }

    [JsonPropertyName("embedder_dim")]
    public int EmbedderDim { get; set; }

    [JsonPropertyName("models_dir")]
    public string? ModelsDir { get; set; }
}

public sealed class GpuStatus
{
    [JsonPropertyName("has_cuda")]
    public bool HasCuda { get; set; }

    [JsonPropertyName("device_name")]
    public string? DeviceName { get; set; }

    [JsonPropertyName("vram_total_mb")]
    public double VramTotalMb { get; set; }

    [JsonPropertyName("vram_used_mb")]
    public double VramUsedMb { get; set; }
}

public sealed class GpuReport
{
    [JsonPropertyName("report")]
    public string Report { get; set; } = "";

    [JsonPropertyName("has_cuda")]
    public bool HasCuda { get; set; }
}

public sealed class SettingItem
{
    [JsonPropertyName("key")]
    public string Key { get; set; } = "";

    [JsonPropertyName("value")]
    public string Value { get; set; } = "";
}

public sealed class ErrorResponse
{
    [JsonPropertyName("error")]
    public string Error { get; set; } = "";
}
