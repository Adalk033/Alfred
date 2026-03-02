using System.Net.Http.Headers;

namespace Alfred.UI.Services;

/// <summary>
/// Catalogo de modelos GGUF recomendados con URLs de descarga de HuggingFace.
/// </summary>
public sealed class RecommendedModel
{
    public required string Name { get; init; }
    public required string FileName { get; init; }
    public required string Url { get; init; }
    public required string Type { get; init; }     // "llm" o "embedder"
    public required string SizeLabel { get; init; } // ej. "~6.5 GB"
    public required string Description { get; init; }
}

/// <summary>
/// Progreso de descarga de un modelo.
/// </summary>
public sealed class DownloadProgress
{
    public long BytesDownloaded { get; set; }
    public long TotalBytes { get; set; }
    public double Percentage => TotalBytes > 0 ? (double)BytesDownloaded / TotalBytes * 100.0 : 0;
    public bool IsCompleted { get; set; }
    public bool IsCancelled { get; set; }
    public string? Error { get; set; }
}

/// <summary>
/// Servicio para descargar modelos GGUF desde HuggingFace.
/// Descarga directamente al directorio de modelos con reporte de progreso.
/// </summary>
public sealed class ModelDownloadService : IDisposable
{
    private readonly HttpClient _http;
    private readonly string _modelsDir;
    private CancellationTokenSource? _cts;
    private bool _disposed;

    public static readonly List<RecommendedModel> Catalog =
    [
        new()
        {
            Name = "Gemma 2 9B Instruct (Q5_K_M)",
            FileName = "gemma-2-9b-it-Q5_K_M.gguf",
            Url = "https://huggingface.co/bartowski/gemma-2-9b-it-GGUF/resolve/main/gemma-2-9b-it-Q5_K_M.gguf",
            Type = "llm",
            SizeLabel = "~6.5 GB",
            Description = "Modelo de lenguaje para generacion de respuestas"
        },
        new()
        {
            Name = "Nomic Embed Text v1.5 (Q5_K_M)",
            FileName = "nomic-embed-text-v1.5.Q5_K_M.gguf",
            Url = "https://huggingface.co/nomic-ai/nomic-embed-text-v1.5-GGUF/resolve/main/nomic-embed-text-v1.5.Q5_K_M.gguf",
            Type = "embedder",
            SizeLabel = "~97 MB",
            Description = "Modelo de embeddings para busqueda semantica"
        }
    ];

    public bool IsDownloading { get; private set; }

    public ModelDownloadService()
    {
        _http = new HttpClient();
        _http.DefaultRequestHeaders.UserAgent.Add(
            new ProductInfoHeaderValue("Alfred", "2.0.0"));

        // Resolver ruta de modelos igual que el backend C++
        string appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
        _modelsDir = Path.Combine(appData, "Alfred", "models");
    }

    public string ModelsDirectory => _modelsDir;

    /// <summary>
    /// Verifica si un modelo ya esta descargado.
    /// </summary>
    public bool IsModelDownloaded(string fileName)
    {
        string path = Path.Combine(_modelsDir, fileName);
        return File.Exists(path);
    }

    /// <summary>
    /// Descarga un modelo desde la URL especificada al directorio de modelos.
    /// Reporta progreso mediante el callback.
    /// </summary>
    public async Task<bool> DownloadModelAsync(
        string url,
        string fileName,
        Action<DownloadProgress> onProgress)
    {
        if (IsDownloading)
            return false;

        IsDownloading = true;
        _cts = new CancellationTokenSource();
        var progress = new DownloadProgress();

        try
        {
            // Crear directorio si no existe
            Directory.CreateDirectory(_modelsDir);

            string targetPath = Path.Combine(_modelsDir, fileName);
            string tempPath = targetPath + ".downloading";

            // Verificar si ya existe
            if (File.Exists(targetPath))
            {
                progress.IsCompleted = true;
                progress.Percentage.GetHashCode(); // trigger
                onProgress(progress);
                return true;
            }

            // Obtener tamano total con HEAD request
            using var headRequest = new HttpRequestMessage(HttpMethod.Head, url);
            using var headResponse = await _http.SendAsync(headRequest, _cts.Token);
            long totalBytes = headResponse.Content.Headers.ContentLength ?? 0;
            progress.TotalBytes = totalBytes;

            // Soporte de reanudacion: verificar descarga parcial
            long existingBytes = 0;
            if (File.Exists(tempPath))
            {
                existingBytes = new FileInfo(tempPath).Length;
            }

            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            if (existingBytes > 0)
            {
                request.Headers.Range = new RangeHeaderValue(existingBytes, null);
            }

            using var response = await _http.SendAsync(
                request, HttpCompletionOption.ResponseHeadersRead, _cts.Token);

            if (!response.IsSuccessStatusCode && response.StatusCode != System.Net.HttpStatusCode.PartialContent)
            {
                progress.Error = $"HTTP {(int)response.StatusCode}: {response.ReasonPhrase}";
                onProgress(progress);
                return false;
            }

            // Si el servidor no soporta rango, reiniciar descarga
            if (existingBytes > 0 && response.StatusCode != System.Net.HttpStatusCode.PartialContent)
            {
                existingBytes = 0;
            }

            progress.BytesDownloaded = existingBytes;
            onProgress(progress);

            await using var contentStream = await response.Content.ReadAsStreamAsync(_cts.Token);
            await using var fileStream = new FileStream(tempPath,
                existingBytes > 0 ? FileMode.Append : FileMode.Create,
                FileAccess.Write, FileShare.None, 81920);

            var buffer = new byte[81920]; // 80 KB buffer
            int bytesRead;
            var lastReport = DateTime.UtcNow;

            while ((bytesRead = await contentStream.ReadAsync(buffer, _cts.Token)) > 0)
            {
                await fileStream.WriteAsync(buffer.AsMemory(0, bytesRead), _cts.Token);
                progress.BytesDownloaded += bytesRead;

                // Reportar progreso cada 200ms para no saturar la UI
                if ((DateTime.UtcNow - lastReport).TotalMilliseconds >= 200)
                {
                    onProgress(progress);
                    lastReport = DateTime.UtcNow;
                }
            }

            // Mover archivo temporal a destino final
            fileStream.Close();
            if (File.Exists(targetPath))
                File.Delete(targetPath);
            File.Move(tempPath, targetPath);

            progress.IsCompleted = true;
            onProgress(progress);
            return true;
        }
        catch (OperationCanceledException)
        {
            progress.IsCancelled = true;
            onProgress(progress);
            return false;
        }
        catch (Exception ex)
        {
            progress.Error = ex.Message;
            onProgress(progress);
            return false;
        }
        finally
        {
            IsDownloading = false;
            _cts?.Dispose();
            _cts = null;
        }
    }

    /// <summary>
    /// Cancela la descarga en curso.
    /// </summary>
    public void CancelDownload()
    {
        _cts?.Cancel();
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        _cts?.Cancel();
        _cts?.Dispose();
        _http.Dispose();
    }
}
