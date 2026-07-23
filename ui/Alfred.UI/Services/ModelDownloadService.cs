using System.Net.Http.Headers;

namespace Alfred.UI.Services;

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
        return TryGetLocalModelPath(fileName, out string path) &&
               File.Exists(path);
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

            if (!TryGetLocalModelPath(fileName, out string targetPath))
            {
                progress.Error = "Nombre de archivo GGUF invalido.";
                onProgress(progress);
                return false;
            }
            string tempPath = targetPath + ".downloading";

            // Verificar si ya existe
            if (File.Exists(targetPath))
            {
                progress.IsCompleted = true;
                onProgress(progress);
                return true;
            }

            // Obtener tamano total con HEAD request
            using var headRequest = new HttpRequestMessage(HttpMethod.Head, url);
            using var headResponse = await _http.SendAsync(headRequest, _cts.Token);
            long totalBytes = headResponse.Content.Headers.ContentLength ?? 0;
            progress.TotalBytes = totalBytes;

            // Verificar espacio libre antes de empezar (los GGUF pesan varios GB).
            if (totalBytes > 0 && !HasEnoughFreeSpace(totalBytes))
            {
                progress.Error = "Espacio en disco insuficiente para descargar el modelo.";
                onProgress(progress);
                return false;
            }

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
    /// Comprueba que el volumen de destino tenga sitio para el archivo mas un
    /// margen del 5% (metadatos, archivo temporal .downloading, etc.).
    /// </summary>
    private bool HasEnoughFreeSpace(long requiredBytes)
    {
        try
        {
            string? root = Path.GetPathRoot(Path.GetFullPath(_modelsDir));
            if (string.IsNullOrEmpty(root)) return true;   // no verificable: no bloquear
            var drive = new DriveInfo(root);
            long needed = requiredBytes + requiredBytes / 20;   // +5%
            return drive.AvailableFreeSpace >= needed;
        }
        catch
        {
            return true;   // ante cualquier error, no bloquear la descarga
        }
    }

    /// <summary>
    /// Convierte la ruta remota del repositorio en un nombre local plano y
    /// comprueba que el destino permanezca dentro del directorio de modelos.
    /// </summary>
    private bool TryGetLocalModelPath(string fileName, out string targetPath)
    {
        targetPath = "";
        string normalized = fileName.Replace('\\', '/');
        string safeName = Path.GetFileName(normalized);
        if (string.IsNullOrWhiteSpace(safeName) ||
            !safeName.EndsWith(".gguf", StringComparison.OrdinalIgnoreCase) ||
            safeName.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0)
        {
            return false;
        }

        string modelsRoot = Path.GetFullPath(_modelsDir)
            .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar) +
            Path.DirectorySeparatorChar;
        string candidate = Path.GetFullPath(Path.Combine(modelsRoot, safeName));
        if (!candidate.StartsWith(modelsRoot, StringComparison.OrdinalIgnoreCase))
            return false;

        targetPath = candidate;
        return true;
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
