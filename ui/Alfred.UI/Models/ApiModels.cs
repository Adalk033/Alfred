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
}

/// <summary>
/// Request que incluye archivos adjuntos (PDF, DOCX, etc.) como contenido inline.
/// </summary>
public sealed class QueryWithAttachmentRequest
{
    [JsonPropertyName("question")]
    public string Question { get; set; } = "";

    [JsonPropertyName("use_history")]
    public bool UseHistory { get; set; } = true;

    [JsonPropertyName("attached_files")]
    public List<AttachedFileData>? AttachedFiles { get; set; }
}

/// <summary>
/// Archivo adjunto con nombre y contenido (texto plano o base64 para binarios).
/// </summary>
public sealed class AttachedFileData
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = "";

    [JsonPropertyName("content")]
    public string Content { get; set; } = "";
}

public sealed class QueryResponse
{
    [JsonPropertyName("answer")]
    public string Answer { get; set; } = "";

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

    [JsonPropertyName("attached_files")]
    public List<AttachedFileData>? AttachedFiles { get; set; }
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

public sealed class EncryptionStatus
{
    [JsonPropertyName("enabled")]
    public bool Enabled { get; set; }

    [JsonPropertyName("has_key")]
    public bool HasKey { get; set; }
}

public sealed class ModelConfig
{
    [JsonPropertyName("n_ctx")]
    public int NCtx { get; set; } = 4096;

    [JsonPropertyName("n_gpu_layers")]
    public int NGpuLayers { get; set; } = 99;

    [JsonPropertyName("n_batch")]
    public int NBatch { get; set; } = 512;

    [JsonPropertyName("n_threads")]
    public int NThreads { get; set; }

    [JsonPropertyName("temperature")]
    public float Temperature { get; set; } = 0.7f;

    [JsonPropertyName("top_p")]
    public float TopP { get; set; } = 0.9f;

    [JsonPropertyName("max_tokens")]
    public int MaxTokens { get; set; } = 2048;

    [JsonPropertyName("seed")]
    public int Seed { get; set; } = -1;
}

public sealed class ModelConfigSaveResponse
{
    [JsonPropertyName("status")]
    public string Status { get; set; } = "";

    [JsonPropertyName("needs_reload")]
    public bool NeedsReload { get; set; }
}

public sealed class AutoTuneHardwareInfo
{
    [JsonPropertyName("gpu_available")]
    public bool GpuAvailable { get; set; }

    [JsonPropertyName("vram_total_mb")]
    public long VramTotalMb { get; set; }

    [JsonPropertyName("vram_free_mb")]
    public long VramFreeMb { get; set; }

    [JsonPropertyName("cpu_cores")]
    public int CpuCores { get; set; }

    [JsonPropertyName("device_name")]
    public string DeviceName { get; set; } = "";

    [JsonPropertyName("model_size_mb")]
    public long ModelSizeMb { get; set; }
}

public sealed class AutoTuneResult
{
    [JsonPropertyName("n_ctx")]
    public int NCtx { get; set; }

    [JsonPropertyName("n_gpu_layers")]
    public int NGpuLayers { get; set; }

    [JsonPropertyName("n_batch")]
    public int NBatch { get; set; }

    [JsonPropertyName("n_threads")]
    public int NThreads { get; set; }

    [JsonPropertyName("max_tokens")]
    public int MaxTokens { get; set; }

    [JsonPropertyName("hardware")]
    public AutoTuneHardwareInfo? Hardware { get; set; }
}

public sealed class ErrorResponse
{
    [JsonPropertyName("error")]
    public string Error { get; set; } = "";
}
