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

    public async Task<QueryResponse?> SendQueryAsync(string question)
    {
        var request = new QueryRequest { Question = question };
        return await PostAsync<QueryResponse>("/query", request, 180);
    }

    public async Task<QueryResponse?> SendQueryWithAttachmentAsync(
        string question,
        List<AttachedFileData>? attachedFiles = null)
    {
        var request = new QueryWithAttachmentRequest
        {
            Question = question,
            AttachedFiles = attachedFiles
        };
        return await PostAsync<QueryResponse>("/query", request, 180);
    }

    public async Task<QueryResponse?> SendQueryStreamingAsync(
        string question,
        string? conversationId,
        List<AttachedFileData>? attachedFiles,
        Action<long> onStarted,
        Action<string> onToken,
        CancellationToken cancellationToken)
    {
        string endpoint = string.IsNullOrEmpty(conversationId)
            ? "/query/stream"
            : $"/conversations/{conversationId}/query/stream";

        object request = attachedFiles != null && attachedFiles.Count > 0
            ? new QueryWithAttachmentRequest
            {
                Question = question,
                AttachedFiles = attachedFiles
            }
            : (object)new QueryRequest { Question = question };

        using var httpReq = new HttpRequestMessage(HttpMethod.Post, endpoint)
        {
            Content = ToJsonContent(request)
        };
        httpReq.Headers.Accept.Add(new System.Net.Http.Headers.MediaTypeWithQualityHeaderValue("text/event-stream"));

        QueryResponse? finalResponse = null;
        try
        {
            using var response = await _http.SendAsync(httpReq,
                HttpCompletionOption.ResponseHeadersRead, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                var errBody = await response.Content.ReadAsStringAsync(cancellationToken);
                System.Diagnostics.Debug.WriteLine($"[AlfredAPI] Stream error {response.StatusCode}: {errBody}");
                return null;
            }

            using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
            using var reader = new System.IO.StreamReader(stream, Encoding.UTF8);

            string? currentEvent = null;
            var dataBuffer = new StringBuilder();

            while (!reader.EndOfStream)
            {
                cancellationToken.ThrowIfCancellationRequested();
                var line = await reader.ReadLineAsync(cancellationToken);
                if (line == null) break;

                if (line.Length == 0)
                {
                    // Fin de un evento SSE: despachar
                    if (currentEvent != null && dataBuffer.Length > 0)
                    {
                        var json = dataBuffer.ToString();
                        try
                        {
                            using var doc = JsonDocument.Parse(json);
                            switch (currentEvent)
                            {
                                case "start":
                                    if (doc.RootElement.TryGetProperty("request_id", out var idEl)
                                        && idEl.TryGetInt64(out var id))
                                    {
                                        onStarted?.Invoke(id);
                                    }
                                    break;
                                case "token":
                                    if (doc.RootElement.TryGetProperty("text", out var txtEl))
                                    {
                                        var tok = txtEl.GetString();
                                        if (!string.IsNullOrEmpty(tok))
                                            onToken?.Invoke(tok);
                                    }
                                    break;
                                case "done":
                                    finalResponse = JsonSerializer.Deserialize<QueryResponse>(json, JsonOptions);
                                    break;
                            }
                        }
                        catch (JsonException ex)
                        {
                            System.Diagnostics.Debug.WriteLine($"[AlfredAPI] SSE parse error: {ex.Message}");
                        }
                    }
                    currentEvent = null;
                    dataBuffer.Clear();
                    continue;
                }

                if (line.StartsWith("event:", StringComparison.Ordinal))
                {
                    currentEvent = line.Substring(6).Trim();
                }
                else if (line.StartsWith("data:", StringComparison.Ordinal))
                {
                    if (dataBuffer.Length > 0) dataBuffer.Append('\n');
                    dataBuffer.Append(line.AsSpan(5).TrimStart());
                }
                // Ignorar comentarios (":") y otros campos no usados
            }
        }
        catch (OperationCanceledException)
        {
            // Cancelacion por parte del usuario: propagada para que el caller
            // sepa que debe limpiar el estado.
            throw;
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"[AlfredAPI] Stream exception: {ex.Message}");
        }

        return finalResponse;
    }

    /// <summary>
    /// Solicita al backend cancelar el query streaming en curso.
    /// Si request_id es 0, cancela el activo sin importar id.
    /// </summary>
    public async Task<bool> CancelQueryAsync(long requestId = 0)
    {
        try
        {
            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
            var response = await _http.PostAsync("/query/cancel",
                ToJsonContent(new { request_id = requestId }), cts.Token);
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
    // Tokens
    // ========================================================================

    public async Task<PdfExtractResponse?> ExtractPdfAsync(string filename, byte[] bytes)
    {
        var payload = new
        {
            filename,
            data_base64 = Convert.ToBase64String(bytes),
        };
        return await PostAsync<PdfExtractResponse>("/files/extract-pdf", payload, 60);
    }

    public async Task<TokenBudget?> GetTokenBudgetAsync(string? conversationId = null, string? draft = null)
    {
        var qs = new List<string>();
        if (!string.IsNullOrEmpty(conversationId))
            qs.Add($"conversation_id={Uri.EscapeDataString(conversationId)}");
        if (!string.IsNullOrEmpty(draft))
            qs.Add($"draft={Uri.EscapeDataString(draft)}");
        var endpoint = "/tokens/budget" + (qs.Count > 0 ? "?" + string.Join("&", qs) : "");
        return await GetAsync<TokenBudget>(endpoint, 10);
    }

    // ========================================================================
    // Conversaciones
    // ========================================================================

    public async Task<ConversationThread?> CreateConversationAsync(string title = "")
    {
        return await PostAsync<ConversationThread>("/conversations", new { title });
    }

    public async Task<List<ConversationThread>> ListConversationsAsync(int limit = 50, int offset = 0)
    {
        return await GetAsync<List<ConversationThread>>($"/conversations?limit={limit}&offset={offset}") ?? [];
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

    /// <summary>
    /// Persistir un mensaje en una conversacion existente sin disparar inferencia.
    /// Usado para reconstruir la historia tras edit/regenerate o cambio de variante.
    /// </summary>
    public async Task<bool> AddMessageAsync(string id, string role, string content)
    {
        var response = await PostRawAsync($"/conversations/{id}/messages",
            new { role, content }, 15);
        return response?.IsSuccessStatusCode ?? false;
    }

    public async Task<List<ConversationThread>> SearchConversationsAsync(string query)
    {
        var all = await ListConversationsAsync(200, 0);
        if (string.IsNullOrWhiteSpace(query)) return all;
        return all.Where(c =>
            c.Title.Contains(query, StringComparison.OrdinalIgnoreCase)).ToList();
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
