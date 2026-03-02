using System.Diagnostics;

namespace Alfred.UI.Services;

/// <summary>
/// Gestiona el ciclo de vida del proceso alfred.exe (backend C++).
/// Inicia, monitoriza y detiene el backend automaticamente.
/// </summary>
public sealed class BackendProcessManager : IDisposable
{
    private Process? _process;
    private readonly string _host;
    private readonly int _port;
    private bool _disposed;

    public event EventHandler<string>? StatusChanged;
    public event EventHandler<string>? OutputReceived;

    public bool IsRunning => _process is { HasExited: false };

    public BackendProcessManager(string host = "127.0.0.1", int port = 8000)
    {
        _host = host;
        _port = port;
    }

    /// <summary>
    /// Inicia alfred.exe y espera a que el endpoint /health responda.
    /// </summary>
    public async Task<bool> StartAsync()
    {
        if (IsRunning) return true;

        string exePath = FindAlfredExe();
        if (string.IsNullOrEmpty(exePath))
        {
            StatusChanged?.Invoke(this, "error: alfred.exe no encontrado");
            return false;
        }

        try
        {
            var startInfo = new ProcessStartInfo
            {
                FileName = exePath,
                Arguments = $"--host {_host} --port {_port}",
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                WorkingDirectory = Path.GetDirectoryName(exePath) ?? ""
            };

            _process = new Process { StartInfo = startInfo, EnableRaisingEvents = true };
            _process.OutputDataReceived += (_, e) =>
            {
                if (!string.IsNullOrEmpty(e.Data))
                    OutputReceived?.Invoke(this, e.Data);
            };
            _process.ErrorDataReceived += (_, e) =>
            {
                if (!string.IsNullOrEmpty(e.Data))
                    OutputReceived?.Invoke(this, e.Data);
            };
            _process.Exited += (_, _) =>
            {
                StatusChanged?.Invoke(this, "stopped");
            };

            _process.Start();
            _process.BeginOutputReadLine();
            _process.BeginErrorReadLine();

            StatusChanged?.Invoke(this, "starting");

            // Esperar a que el backend responda al health check
            bool ready = await WaitForHealthAsync(TimeSpan.FromSeconds(120));
            if (ready)
            {
                StatusChanged?.Invoke(this, "running");
                return true;
            }

            StatusChanged?.Invoke(this, "error: timeout esperando backend");
            return false;
        }
        catch (Exception ex)
        {
            StatusChanged?.Invoke(this, $"error: {ex.Message}");
            return false;
        }
    }

    /// <summary>
    /// Detiene el proceso del backend.
    /// </summary>
    public async Task StopAsync()
    {
        if (_process == null || _process.HasExited) return;

        try
        {
            // Intentar terminacion limpia primero
            _process.CloseMainWindow();
            if (!_process.WaitForExit(3000))
            {
                _process.Kill(entireProcessTree: true);
                await _process.WaitForExitAsync();
            }
        }
        catch
        {
            try { _process.Kill(entireProcessTree: true); } catch { /* Proceso ya termino */ }
        }
        finally
        {
            _process.Dispose();
            _process = null;
            StatusChanged?.Invoke(this, "stopped");
        }
    }

    private async Task<bool> WaitForHealthAsync(TimeSpan timeout)
    {
        using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(3) };
        var deadline = DateTime.UtcNow + timeout;

        while (DateTime.UtcNow < deadline)
        {
            if (_process == null || _process.HasExited)
                return false;

            try
            {
                var response = await http.GetAsync($"http://{_host}:{_port}/health");
                if (response.IsSuccessStatusCode)
                    return true;
            }
            catch
            {
                // Backend aun no esta listo
            }

            await Task.Delay(1000);
        }

        return false;
    }

    /// <summary>
    /// Busca alfred.exe en ubicaciones conocidas.
    /// </summary>
    private static string FindAlfredExe()
    {
        // Rutas relativas al directorio de la app
        string appDir = AppContext.BaseDirectory;
        string[] searchPaths =
        [
            // Junto al ejecutable de la UI
            Path.Combine(appDir, "alfred.exe"),
            // En el directorio build del proyecto
            Path.Combine(appDir, "..", "..", "..", "..", "build", "alfred.exe"),
            // Ruta absoluta comun de desarrollo
            @"F:\Projects\Alfred\build\alfred.exe",
        ];

        foreach (string path in searchPaths)
        {
            string fullPath = Path.GetFullPath(path);
            if (File.Exists(fullPath))
                return fullPath;
        }

        return "";
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;

        if (_process is { HasExited: false })
        {
            try { _process.Kill(entireProcessTree: true); } catch { /* Ignorar */ }
        }
        _process?.Dispose();
    }
}
