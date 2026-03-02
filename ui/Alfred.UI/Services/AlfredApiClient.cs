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
            Timeout = TimeSpan.FromSeconds(300)
        };
    }

    // ========================================================================
    // Salud
    // ========================================================================

    public async Task<bool> IsHealthyAsync()
    {
        try
        {
            var response = await _http.GetAsync("/health");
            return response.IsSuccessStatusCode;
        }
        catch
        {
            return false;
        }
    }

    public async Task<HealthResponse?> GetHealthAsync()
    {
        return await GetAsync<HealthResponse>("/health");
    }

    // ========================================================================
    // Query
    // ========================================================================

    public async Task<QueryResponse?> SendQueryAsync(string question, bool useHistory = true, bool searchDocuments = true)
    {
        var request = new QueryRequest
        {
            Question = question,
            UseHistory = useHistory,
            SearchDocuments = searchDocuments
        };
        return await PostAsync<QueryResponse>("/query", request);
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
        var response = await PutAsync($"/conversations/{id}/title", new { title });
        return response;
    }

    public async Task<bool> DeleteConversationAsync(string id)
    {
        return await DeleteAsync($"/conversations/{id}");
    }

    public async Task<QueryResponse?> SendConversationQueryAsync(string conversationId, string question,
        bool useHistory = true, bool searchDocuments = true)
    {
        var request = new ConversationQueryRequest
        {
            Question = question,
            UseHistory = useHistory,
            SearchDocuments = searchDocuments
        };
        return await PostAsync<QueryResponse>($"/conversations/{conversationId}/query", request);
    }

    // ========================================================================
    // Documentos
    // ========================================================================

    public async Task<List<DocumentPathInfo>> ListDocumentPathsAsync()
    {
        return await GetAsync<List<DocumentPathInfo>>("/documents/paths") ?? [];
    }

    public async Task<DocumentPathInfo?> AddDocumentPathAsync(string path)
    {
        return await PostAsync<DocumentPathInfo>("/documents/paths", new { path });
    }

    public async Task<bool> UpdateDocumentPathAsync(long id, bool enabled)
    {
        return await PutAsync($"/documents/paths/{id}", new { enabled });
    }

    public async Task<bool> DeleteDocumentPathAsync(long id)
    {
        return await DeleteAsync($"/documents/paths/{id}");
    }

    public async Task<object?> ReindexDocumentsAsync()
    {
        return await PostAsync<object>("/documents/reindex", new { });
    }

    public async Task<object?> GetDocumentStatsAsync()
    {
        return await GetAsync<object>("/documents/stats");
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
        var content = ToJsonContent(new { timestamp });
        var request = new HttpRequestMessage(HttpMethod.Delete, "/history") { Content = content };
        var response = await _http.SendAsync(request);
        return response.IsSuccessStatusCode;
    }

    // ========================================================================
    // Modelos
    // ========================================================================

    public async Task<List<ModelInfo>> ListModelsAsync()
    {
        return await GetAsync<List<ModelInfo>>("/models") ?? [];
    }

    public async Task<ModelStatus?> GetModelStatusAsync()
    {
        return await GetAsync<ModelStatus>("/models/status");
    }

    public async Task<bool> ChangeModelAsync(string modelPath)
    {
        var response = await PostRawAsync("/models/change", new { model_path = modelPath });
        return response?.IsSuccessStatusCode ?? false;
    }

    // ========================================================================
    // GPU
    // ========================================================================

    public async Task<GpuStatus?> GetGpuStatusAsync()
    {
        return await GetAsync<GpuStatus>("/gpu/status");
    }

    public async Task<GpuReport?> GetGpuReportAsync()
    {
        return await GetAsync<GpuReport>("/gpu/report");
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
    // Helpers HTTP internos
    // ========================================================================

    private async Task<T?> GetAsync<T>(string endpoint)
    {
        try
        {
            var response = await _http.GetAsync(endpoint);
            if (!response.IsSuccessStatusCode) return default;
            var json = await response.Content.ReadAsStringAsync();
            return JsonSerializer.Deserialize<T>(json, JsonOptions);
        }
        catch
        {
            return default;
        }
    }

    private async Task<T?> PostAsync<T>(string endpoint, object body)
    {
        try
        {
            var response = await _http.PostAsync(endpoint, ToJsonContent(body));
            if (!response.IsSuccessStatusCode) return default;
            var json = await response.Content.ReadAsStringAsync();
            return JsonSerializer.Deserialize<T>(json, JsonOptions);
        }
        catch
        {
            return default;
        }
    }

    private async Task<HttpResponseMessage?> PostRawAsync(string endpoint, object body)
    {
        try
        {
            return await _http.PostAsync(endpoint, ToJsonContent(body));
        }
        catch
        {
            return null;
        }
    }

    private async Task<bool> PutAsync(string endpoint, object body)
    {
        try
        {
            var response = await _http.PutAsync(endpoint, ToJsonContent(body));
            return response.IsSuccessStatusCode;
        }
        catch
        {
            return false;
        }
    }

    private async Task<bool> DeleteAsync(string endpoint)
    {
        try
        {
            var response = await _http.DeleteAsync(endpoint);
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
