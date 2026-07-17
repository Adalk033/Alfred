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
}

/// <summary>
/// Request que incluye archivos adjuntos (PDF, DOCX, etc.) como contenido inline.
/// </summary>
public sealed class QueryWithAttachmentRequest
{
    [JsonPropertyName("question")]
    public string Question { get; set; } = "";

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

    [JsonPropertyName("from_cache")]
    public bool FromCache { get; set; }

    [JsonPropertyName("cancelled")]
    public bool Cancelled { get; set; }

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

    [JsonPropertyName("attached_files")]
    public List<AttachedFileData>? AttachedFiles { get; set; }
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

    // Recomendacion segun VRAM detectada (calculada en el cliente). No viene
    // del backend; se rellena en ModelsPage tras consultar el estado de GPU.
    [JsonIgnore]
    public string VramFit { get; set; } = "";

    [JsonIgnore]
    public bool HasVramFit => !string.IsNullOrEmpty(VramFit);
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

    // ---- Tuning avanzado ----
    [JsonPropertyName("n_ubatch")]
    public int NUbatch { get; set; }

    [JsonPropertyName("n_threads_batch")]
    public int NThreadsBatch { get; set; }

    [JsonPropertyName("flash_attn")]
    public int FlashAttn { get; set; } = -1;

    [JsonPropertyName("offload_kqv")]
    public bool OffloadKqv { get; set; } = true;

    [JsonPropertyName("use_mmap")]
    public bool UseMmap { get; set; } = true;

    [JsonPropertyName("use_mlock")]
    public bool UseMlock { get; set; } = false;

    [JsonPropertyName("cache_type_k")]
    public string CacheTypeK { get; set; } = "f16";

    [JsonPropertyName("cache_type_v")]
    public string CacheTypeV { get; set; } = "f16";

    [JsonPropertyName("top_k")]
    public int TopK { get; set; } = 40;

    [JsonPropertyName("min_p")]
    public float MinP { get; set; } = 0.05f;

    [JsonPropertyName("repeat_penalty")]
    public float RepeatPenalty { get; set; } = 1.10f;

    [JsonPropertyName("repeat_last_n")]
    public int RepeatLastN { get; set; } = 64;

    [JsonPropertyName("thinking_enabled")]
    public bool ThinkingEnabled { get; set; } = true;
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

    [JsonPropertyName("n_ubatch")]
    public int NUbatch { get; set; }

    [JsonPropertyName("flash_attn")]
    public int FlashAttn { get; set; } = -1;

    [JsonPropertyName("offload_kqv")]
    public bool OffloadKqv { get; set; } = true;

    [JsonPropertyName("cache_type_k")]
    public string CacheTypeK { get; set; } = "f16";

    [JsonPropertyName("cache_type_v")]
    public string CacheTypeV { get; set; } = "f16";

    [JsonPropertyName("hardware")]
    public AutoTuneHardwareInfo? Hardware { get; set; }
}

public sealed class ErrorResponse
{
    [JsonPropertyName("error")]
    public string Error { get; set; } = "";
}

// ============================================================================
// Tokens
// ============================================================================
public sealed class TokenBreakdown
{
    [JsonPropertyName("system")]
    public int System { get; set; }

    [JsonPropertyName("user_messages")]
    public int UserMessages { get; set; }

    [JsonPropertyName("assistant_messages")]
    public int AssistantMessages { get; set; }

    [JsonPropertyName("tools")]
    public int Tools { get; set; }

    [JsonPropertyName("files")]
    public int Files { get; set; }
}

public sealed class TokenBudget
{
    [JsonPropertyName("total_tokens_usados")]
    public int TotalTokensUsados { get; set; }

    [JsonPropertyName("max_tokens_contexto")]
    public int MaxTokensContexto { get; set; }

    [JsonPropertyName("tokens_reservados_para_respuesta")]
    public int TokensReservadosParaRespuesta { get; set; }

    [JsonPropertyName("porcentaje_usado")]
    public double PorcentajeUsado { get; set; }

    [JsonPropertyName("breakdown")]
    public TokenBreakdown Breakdown { get; set; } = new();
}

// ============================================================================
// PDF extraction
// ============================================================================
public sealed class PdfExtractResponse
{
    [JsonPropertyName("filename")]
    public string Filename { get; set; } = "";

    [JsonPropertyName("pages")]
    public int Pages { get; set; }

    [JsonPropertyName("total_tokens")]
    public int TotalTokens { get; set; }

    [JsonPropertyName("text")]
    public string Text { get; set; } = "";
}
