using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Alfred.UI.Models;

namespace Alfred.UI.Services;

/// <summary>
/// Cliente HTTP para comunicarse con el backend REST de Alfred (localhost:8000).
/// </summary>
public sealed class AlfredApiClient : IDisposable
{
    private readonly HttpClient _http;
    private readonly string _baseUrl;
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    public AlfredApiClient(string host = "127.0.0.1", int port = 8000)
    {
        _baseUrl = $"http://{host}:{port}";
        _http = new HttpClient
        {
            BaseAddress = new Uri(_baseUrl),
            Timeout = Timeout.InfiniteTimeSpan   // cada metodo controla su propio timeout via CTS
        };
    }

    // ========================================================================
    // Salud
    // ========================================================================

    public async Task<bool> IsHealthyAsync()
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        try
        {
            var response = await _http.GetAsync("/health", cts.Token);
            return response.IsSuccessStatusCode;
        }
        catch (OperationCanceledException)
        {
            return false;
        }
        catch
        {
            return false;
        }
    }

    public async Task<HealthResponse?> GetHealthAsync()
    {
        return await GetAsync<HealthResponse>("/health", 5);
    }

    // ========================================================================
    // Query
    // ========================================================================

    public async Task<QueryResponse?> SendQueryAsync(string question, bool useHistory = true)
    {
        var request = new QueryRequest
        {
            Question = question,
            UseHistory = useHistory
        };
        return await PostAsync<QueryResponse>("/query", request, 180);
    }

    /// <summary>
    /// Envia una consulta con archivos adjuntos (PDF, DOCX, etc.).
    /// Los archivos se envian como contenido inline en JSON.
    /// </summary>
    public async Task<QueryResponse?> SendQueryWithAttachmentAsync(
        string question,
        List<AttachedFileData>? attachedFiles = null,
        bool useHistory = true)
    {
        var request = new QueryWithAttachmentRequest
        {
            Question = question,
            UseHistory = useHistory,
            AttachedFiles = attachedFiles
        };
        return await PostAsync<QueryResponse>("/query", request, 180);
    }

    /// <summary>
    /// Envia una consulta dentro de una conversacion, con archivos adjuntos opcionales.
    /// </summary>
    public async Task<QueryResponse?> SendConversationQueryAsync(
        string conversationId,
        string question,
        List<AttachedFileData>? attachedFiles = null,
        bool useHistory = true)
    {
        var request = new ConversationQueryRequest
        {
            Question = question,
            UseHistory = useHistory,
            AttachedFiles = attachedFiles
        };
        return await PostAsync<QueryResponse>($"/conversations/{conversationId}/query", request, 180);
    }

    // ========================================================================
    // Conversaciones
    // ========================================================================

    public async Task<List<ConversationThread>> ListConversationsAsync(int limit = 50, int offset = 0)
    {
        return await GetAsync<List<ConversationThread>>($"/conversations?limit={limit}&offset={offset}") ?? [];
    }

    public async Task<ConversationThread?> CreateConversationAsync(string title = "")
    {
        var body = string.IsNullOrEmpty(title)
            ? new { }
            : (object)new { title };
        return await PostAsync<ConversationThread>("/conversations", body);
    }

    public async Task<ConversationDetail?> GetConversationAsync(string id)
    {
        return await GetAsync<ConversationDetail>($"/conversations/{id}");
    }

    public async Task<bool> UpdateConversationTitleAsync(string id, string title)
    {
        return await PutAsync($"/conversations/{id}/title", new { title });
    }

    public async Task<bool> DeleteConversationAsync(string id)
    {
        return await DeleteAsync($"/conversations/{id}");
    }

    public async Task<bool> ClearConversationAsync(string id)
    {
        return await DeleteAsync($"/conversations/{id}/messages");
    }

    public async Task<List<ConversationThread>> SearchConversationsAsync(string query)
    {
        var all = await ListConversationsAsync(200, 0);
        if (string.IsNullOrWhiteSpace(query)) return all;

        return all.Where(c =>
            c.Title.Contains(query, StringComparison.OrdinalIgnoreCase))
            .ToList();
    }

    // ========================================================================
    // Historial
    // ========================================================================

    public async Task<List<HistoryEntry>> GetHistoryAsync(int limit = 100, int offset = 0)
    {
        return await GetAsync<List<HistoryEntry>>($"/history?limit={limit}&offset={offset}") ?? [];
    }

    public async Task<List<HistoryEntry>> SearchHistoryAsync(string query, float threshold = 0.3f, int topK = 10)
    {
        return await GetAsync<List<HistoryEntry>>(
            $"/history/search?q={Uri.EscapeDataString(query)}&threshold={threshold}&top_k={topK}") ?? [];
    }

    public async Task<bool> DeleteHistoryAsync(string timestamp)
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        try
        {
            var content = ToJsonContent(new { timestamp });
            var request = new HttpRequestMessage(HttpMethod.Delete, "/history") { Content = content };
            var response = await _http.SendAsync(request, cts.Token);
            return response.IsSuccessStatusCode;
        }
        catch
        {
            return false;
        }
    }

    // ========================================================================
    // Modelos
    // ========================================================================

    public async Task<List<ModelInfo>> ListModelsAsync()
    {
        return await GetAsync<List<ModelInfo>>("/models", 10) ?? [];
    }

    public async Task<ModelStatus?> GetModelStatusAsync()
    {
        return await GetAsync<ModelStatus>("/models/status", 10);
    }

    public async Task<(bool Success, string Error)> DeleteModelAsync(string modelName)
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(30));
        try
        {
            var response = await _http.DeleteAsync($"/models/{Uri.EscapeDataString(modelName)}", cts.Token);
            if (response.IsSuccessStatusCode)
                return (true, "");

            var body = await response.Content.ReadAsStringAsync(cts.Token);
            try
            {
                using var doc = JsonDocument.Parse(body);
                if (doc.RootElement.TryGetProperty("error", out var err))
                    return (false, err.GetString() ?? "Error desconocido");
            }
            catch { }

            return (false, $"Error del servidor (HTTP {(int)response.StatusCode})");
        }
        catch (Exception ex)
        {
            return (false, ex.Message);
        }
    }

    public async Task<(bool Success, string Error, string Warning)> ChangeModelAsync(string modelPath)
    {
        var response = await PostRawAsync("/models/change", new { model_path = modelPath }, 300);
        if (response == null)
            return (false, "No se pudo conectar con el backend", "");

        var body = "";
        try { body = await response.Content.ReadAsStringAsync(); } catch { }

        if (response.IsSuccessStatusCode)
        {
            // Extraer warning si existe
            try
            {
                using var doc = JsonDocument.Parse(body);
                if (doc.RootElement.TryGetProperty("warning", out var warn))
                    return (true, "", warn.GetString() ?? "");
            }
            catch { }
            return (true, "", "");
        }

        // Leer detalle del error del backend
        try
        {
            using var doc = JsonDocument.Parse(body);
            if (doc.RootElement.TryGetProperty("error", out var err))
                return (false, err.GetString() ?? "Error desconocido", "");
        }
        catch { /* JSON invalido */ }

        return (false, $"Error del servidor (HTTP {(int)response.StatusCode})", "");
    }

    /// <summary>
    /// Descargar el modelo actual para liberar GPU/RAM.
    /// </summary>
    public async Task<bool> UnloadModelAsync()
    {
        var response = await PostRawAsync("/models/unload", new { }, 30);
        return response?.IsSuccessStatusCode ?? false;
    }

    /// <summary>
    /// Obtener la configuracion actual del modelo LLM.
    /// </summary>
    public async Task<ModelConfig?> GetModelConfigAsync()
    {
        return await GetAsync<ModelConfig>("/models/config", 10);
    }

    /// <summary>
    /// Guardar configuracion del modelo LLM. Retorna si requiere recargar el modelo.
    /// </summary>
    public async Task<(bool Success, bool NeedsReload)> SetModelConfigAsync(ModelConfig config)
    {
        var response = await PostRawAsync("/models/config", config, 15);
        if (response == null || !response.IsSuccessStatusCode)
            return (false, false);

        try
        {
            var body = await response.Content.ReadAsStringAsync();
            var result = System.Text.Json.JsonSerializer.Deserialize<ModelConfigSaveResponse>(body, JsonOptions);
            return (true, result?.NeedsReload ?? false);
        }
        catch
        {
            return (true, false);
        }
    }

    /// <summary>
    /// Obtener parametros de inferencia auto-tuneados segun hardware detectado.
    /// Opcionalmente recibe model_path para ajustar al modelo especifico.
    /// </summary>
    public async Task<AutoTuneResult?> GetAutoTuneAsync(string? modelPath = null)
    {
        string endpoint = "/models/autotune";
        if (!string.IsNullOrEmpty(modelPath))
            endpoint += $"?model_path={Uri.EscapeDataString(modelPath)}";
        return await GetAsync<AutoTuneResult>(endpoint, 15);
    }

    // ========================================================================
    // GPU
    // ========================================================================

    public async Task<GpuStatus?> GetGpuStatusAsync()
    {
        return await GetAsync<GpuStatus>("/gpu/status", 10);
    }

    public async Task<GpuReport?> GetGpuReportAsync()
    {
        return await GetAsync<GpuReport>("/gpu/report", 10);
    }

    // ========================================================================
    // Settings de usuario
    // ========================================================================

    public async Task<Dictionary<string, string>> GetUserSettingsAsync()
    {
        return await GetAsync<Dictionary<string, string>>("/user/settings") ?? [];
    }

    public async Task<string?> GetUserSettingAsync(string key)
    {
        var item = await GetAsync<SettingItem>($"/user/settings/{key}");
        return item?.Value;
    }

    public async Task<bool> SetUserSettingAsync(string key, string value)
    {
        var response = await PostRawAsync("/user/settings", new { key, value });
        return response?.IsSuccessStatusCode ?? false;
    }

    public async Task<bool> DeleteUserSettingAsync(string key)
    {
        return await DeleteAsync($"/user/settings/{key}");
    }

    // ========================================================================
    // Seguridad y cifrado
    // ========================================================================

    public async Task<EncryptionStatus?> GetEncryptionStatusAsync()
    {
        return await GetAsync<EncryptionStatus>("/encryption/status", 10);
    }

    public async Task<bool> SetupEncryptionAsync(bool enabled, string key = "")
    {
        var response = await PostRawAsync("/encryption/setup", new { enabled, key });
        return response?.IsSuccessStatusCode ?? false;
    }

    // ========================================================================
    // App Settings
    // ========================================================================

    public async Task<string?> GetAppSettingAsync(string key)
    {
        var item = await GetAsync<SettingItem>($"/settings/{key}");
        return item?.Value;
    }

    public async Task<bool> SetAppSettingAsync(string key, string value)
    {
        var response = await PostRawAsync("/settings", new { key, value });
        return response?.IsSuccessStatusCode ?? false;
    }

    // ========================================================================
    // Helpers HTTP internos
    // ========================================================================

    private async Task<T?> GetAsync<T>(string endpoint, int timeoutSec = 15)
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(timeoutSec));
        try
        {
            var response = await _http.GetAsync(endpoint, cts.Token);
            if (!response.IsSuccessStatusCode) return default;
            var json = await response.Content.ReadAsStringAsync(cts.Token);
            return JsonSerializer.Deserialize<T>(json, JsonOptions);
        }
        catch (OperationCanceledException)
        {
            System.Diagnostics.Debug.WriteLine($"[AlfredAPI] Timeout GET {endpoint}");
            return default;
        }
        catch (HttpRequestException ex)
        {
            System.Diagnostics.Debug.WriteLine($"[AlfredAPI] Conexion GET {endpoint}: {ex.Message}");
            return default;
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"[AlfredAPI] Error GET {endpoint}: {ex.Message}");
            return default;
        }
    }

    private async Task<T?> PostAsync<T>(string endpoint, object body, int timeoutSec = 15)
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(timeoutSec));
        try
        {
            var response = await _http.PostAsync(endpoint, ToJsonContent(body), cts.Token);
            if (!response.IsSuccessStatusCode) return default;
            var json = await response.Content.ReadAsStringAsync(cts.Token);
            return JsonSerializer.Deserialize<T>(json, JsonOptions);
        }
        catch (OperationCanceledException)
        {
            System.Diagnostics.Debug.WriteLine($"[AlfredAPI] Timeout POST {endpoint}");
            return default;
        }
        catch (HttpRequestException ex)
        {
            System.Diagnostics.Debug.WriteLine($"[AlfredAPI] Conexion POST {endpoint}: {ex.Message}");
            return default;
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"[AlfredAPI] Error POST {endpoint}: {ex.Message}");
            return default;
        }
    }

    private async Task<HttpResponseMessage?> PostRawAsync(string endpoint, object body, int timeoutSec = 15)
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(timeoutSec));
        try
        {
            return await _http.PostAsync(endpoint, ToJsonContent(body), cts.Token);
        }
        catch (OperationCanceledException)
        {
            System.Diagnostics.Debug.WriteLine($"[AlfredAPI] Timeout POST {endpoint}");
            return null;
        }
        catch
        {
            return null;
        }
    }

    private async Task<bool> PutAsync(string endpoint, object body, int timeoutSec = 15)
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(timeoutSec));
        try
        {
            var response = await _http.PutAsync(endpoint, ToJsonContent(body), cts.Token);
            return response.IsSuccessStatusCode;
        }
        catch
        {
            return false;
        }
    }

    private async Task<bool> DeleteAsync(string endpoint, int timeoutSec = 15)
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(timeoutSec));
        try
        {
            var response = await _http.DeleteAsync(endpoint, cts.Token);
            return response.IsSuccessStatusCode;
        }
        catch
        {
            return false;
        }
    }

    private static StringContent ToJsonContent(object obj)
    {
        var json = JsonSerializer.Serialize(obj, JsonOptions);
        return new StringContent(json, Encoding.UTF8, "application/json");
    }

    public void Dispose()
    {
        _http.Dispose();
    }
}
