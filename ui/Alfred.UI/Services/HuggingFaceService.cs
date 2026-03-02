using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;

namespace Alfred.UI.Services;

/// <summary>
/// Resultado de busqueda de repositorios GGUF en HuggingFace.
/// </summary>
public sealed class HfRepoResult
{
    public string Id { get; set; } = "";
    public int Downloads { get; set; }
    public int Likes { get; set; }
}

/// <summary>
/// Archivo GGUF disponible en un repositorio de HuggingFace.
/// </summary>
public sealed class HfGgufFile
{
    public string RepoId { get; set; } = "";
    public string FileName { get; set; } = "";
    public long SizeBytes { get; set; }
    public double SizeGb => Math.Round(SizeBytes / (1024.0 * 1024.0 * 1024.0), 2);
    public string DownloadUrl => $"https://huggingface.co/{RepoId}/resolve/main/{FileName}";
    public string Quantization { get; set; } = "";
}

/// <summary>
/// Servicio para interactuar con la API de HuggingFace Hub.
/// Busca repositorios GGUF y lista archivos disponibles.
/// </summary>
public sealed partial class HuggingFaceService : IDisposable
{
    private readonly HttpClient _http;
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    public HuggingFaceService()
    {
        _http = new HttpClient
        {
            BaseAddress = new Uri("https://huggingface.co/"),
            Timeout = TimeSpan.FromSeconds(30)
        };
        _http.DefaultRequestHeaders.UserAgent.Add(
            new ProductInfoHeaderValue("Alfred", "2.0.0"));
    }

    /// <summary>
    /// Extrae el model ID de una URL de HuggingFace o lo devuelve tal cual si ya es un ID.
    /// Acepta:
    ///   - "openai/gpt-oss-20b"
    ///   - "https://huggingface.co/openai/gpt-oss-20b"
    ///   - "https://huggingface.co/openai/gpt-oss-20b/tree/main"
    /// </summary>
    public static string ParseModelId(string input)
    {
        input = input.Trim().TrimEnd('/');

        // URL de HuggingFace
        var match = HfUrlRegex().Match(input);
        if (match.Success)
            return match.Groups[1].Value;

        // Ya es un ID tipo "owner/model"
        if (input.Contains('/') && !input.Contains(' ') && !input.Contains(':'))
            return input;

        // Nombre simple (buscar directamente)
        return input;
    }

    /// <summary>
    /// Busca repositorios GGUF relacionados con un modelo.
    /// Si el input ya es un repo GGUF, lo devuelve directamente.
    /// Si no, busca "{modelName} GGUF" en HuggingFace.
    /// </summary>
    public async Task<List<HfRepoResult>> SearchGgufReposAsync(string modelInput, CancellationToken ct = default)
    {
        string modelId = ParseModelId(modelInput);
        var results = new List<HfRepoResult>();

        // 1. Si el input ya termina en -GGUF, verificar directamente
        if (modelId.EndsWith("-GGUF", StringComparison.OrdinalIgnoreCase) ||
            modelId.EndsWith("-gguf", StringComparison.OrdinalIgnoreCase))
        {
            if (await RepoExistsAsync(modelId, ct))
            {
                results.Add(new HfRepoResult { Id = modelId });
                return results;
            }
        }

        // 2. Intentar la convencion comun: same-owner/model-GGUF
        string directGguf = modelId + "-GGUF";
        if (await RepoExistsAsync(directGguf, ct))
        {
            results.Add(new HfRepoResult { Id = directGguf });
        }

        // 3. Buscar en la API de HuggingFace
        string modelName = modelId.Contains('/') ? modelId.Split('/')[1] : modelId;
        string searchUrl = $"api/models?search={Uri.EscapeDataString(modelName + " GGUF")}&sort=downloads&limit=8";

        try
        {
            var response = await _http.GetAsync(searchUrl, ct);
            if (response.IsSuccessStatusCode)
            {
                var json = await response.Content.ReadAsStringAsync(ct);
                var models = JsonSerializer.Deserialize<List<HfApiModel>>(json, JsonOptions) ?? [];

                foreach (var m in models)
                {
                    if (string.IsNullOrEmpty(m.ModelId)) continue;

                    // Filtrar solo repos que contengan el nombre del modelo y tengan tag gguf
                    bool hasGguf = m.Tags?.Any(t =>
                        t.Equals("gguf", StringComparison.OrdinalIgnoreCase)) == true;
                    bool nameMatch = m.ModelId.Contains(modelName, StringComparison.OrdinalIgnoreCase);

                    if (hasGguf && nameMatch && results.All(r => r.Id != m.ModelId))
                    {
                        results.Add(new HfRepoResult
                        {
                            Id = m.ModelId,
                            Downloads = m.Downloads,
                            Likes = m.Likes
                        });
                    }
                }
            }
        }
        catch
        {
            // Si falla la busqueda, devolver lo que tengamos
        }

        return results;
    }

    /// <summary>
    /// Lista los archivos .gguf disponibles en un repositorio.
    /// </summary>
    public async Task<List<HfGgufFile>> ListGgufFilesAsync(string repoId, CancellationToken ct = default)
    {
        var files = new List<HfGgufFile>();

        try
        {
            string url = $"api/models/{repoId}/tree/main";
            var response = await _http.GetAsync(url, ct);
            if (!response.IsSuccessStatusCode)
                return files;

            var json = await response.Content.ReadAsStringAsync(ct);
            var entries = JsonSerializer.Deserialize<List<HfTreeEntry>>(json, JsonOptions) ?? [];

            foreach (var entry in entries)
            {
                if (string.IsNullOrEmpty(entry.Path)) continue;
                if (!entry.Path.EndsWith(".gguf", StringComparison.OrdinalIgnoreCase)) continue;

                // Extraer cuantizacion del nombre (ej. Q4_K_M de "model-Q4_K_M.gguf")
                string quant = ExtractQuantization(entry.Path);

                files.Add(new HfGgufFile
                {
                    RepoId = repoId,
                    FileName = entry.Path,
                    SizeBytes = entry.Size,
                    Quantization = quant
                });
            }
        }
        catch
        {
            // Error de red
        }

        return files;
    }

    private async Task<bool> RepoExistsAsync(string repoId, CancellationToken ct)
    {
        try
        {
            var response = await _http.GetAsync($"api/models/{repoId}", ct);
            return response.IsSuccessStatusCode;
        }
        catch
        {
            return false;
        }
    }

    private static string ExtractQuantization(string fileName)
    {
        // Buscar patrones comunes: Q4_K_M, Q5_K_S, Q8_0, F16, etc.
        var match = QuantRegex().Match(fileName);
        return match.Success ? match.Value : "";
    }

    public void Dispose()
    {
        _http.Dispose();
    }

    // --- DTOs internos para la API de HuggingFace ---

    private sealed class HfApiModel
    {
        [JsonPropertyName("id")]
        public string? ModelId { get; set; }

        [JsonPropertyName("downloads")]
        public int Downloads { get; set; }

        [JsonPropertyName("likes")]
        public int Likes { get; set; }

        [JsonPropertyName("tags")]
        public List<string>? Tags { get; set; }
    }

    private sealed class HfTreeEntry
    {
        [JsonPropertyName("path")]
        public string? Path { get; set; }

        [JsonPropertyName("size")]
        public long Size { get; set; }

        [JsonPropertyName("type")]
        public string? Type { get; set; }
    }

    [GeneratedRegex(@"https?://huggingface\.co/([^/]+/[^/]+)")]
    private static partial Regex HfUrlRegex();

    [GeneratedRegex(@"(?:UD-)?(?:Q[0-9]+(?:_[A-Z0-9]+)*|F(?:16|32)|BF16|mxfp4)", RegexOptions.IgnoreCase)]
    private static partial Regex QuantRegex();
}
