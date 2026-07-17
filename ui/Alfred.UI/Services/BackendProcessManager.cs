using System.Diagnostics;
using System.Net.NetworkInformation;

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
    private readonly JobObject _jobObject = new();
    private bool _disposed;
    private bool _stopRequested;             // true durante un stop/dispose intencional
    private int _restartAttempts;
    private const int MaxRestartAttempts = 3;

    public event EventHandler<string>? StatusChanged;
    public event EventHandler<string>? OutputReceived;

    public bool IsRunning => _process is { HasExited: false };

    public BackendProcessManager(string host = "127.0.0.1", int port = 8000)
    {
        _host = host;
        _port = port;
    }

    /// <summary>
    /// True si el puerto ya esta ocupado por otro proceso (p.ej. un backend
    /// huerfano de una sesion anterior).
    /// </summary>
    private bool IsPortInUse()
    {
        try
        {
            var listeners = IPGlobalProperties.GetIPGlobalProperties()
                .GetActiveTcpListeners();
            foreach (var ep in listeners)
            {
                if (ep.Port == _port) return true;
            }
        }
        catch { /* si no se puede consultar, asumir libre */ }
        return false;
    }

    /// <summary>
    /// Inicia alfred.exe y espera a que el endpoint /health responda.
    /// </summary>
    public async Task<bool> StartAsync()
    {
        if (IsRunning) return true;

        _stopRequested = false;

        string exePath = FindAlfredExe();
        if (string.IsNullOrEmpty(exePath))
        {
            StatusChanged?.Invoke(this, "error: alfred.exe no encontrado. Reinstala la aplicacion.");
            return false;
        }

        // Si el puerto ya esta ocupado, un /health exitoso podria venir de un
        // backend ajeno u orfano: sondear antes de lanzar un hijo condenado.
        if (IsPortInUse())
        {
            if (await WaitForHealthAsync(TimeSpan.FromSeconds(2)))
            {
                StatusChanged?.Invoke(this,
                    $"error: el puerto {_port} ya esta en uso por otro proceso. " +
                    "Cierra la instancia previa de Alfred y reintenta.");
                return false;
            }
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
            _process.OutputDataReceived += OnOutputData;
            _process.ErrorDataReceived  += OnErrorData;
            _process.Exited             += OnExited;

            _process.Start();
            // Asignar al Job Object kill-on-close: si la UI muere de forma
            // abrupta (crash, kill), Windows termina alfred.exe con ella.
            _jobObject.Assign(_process);
            _process.BeginOutputReadLine();
            _process.BeginErrorReadLine();

            StatusChanged?.Invoke(this, "starting");

            // Esperar a que el backend responda al health check
            bool ready = await WaitForHealthAsync(TimeSpan.FromSeconds(120));
            if (ready)
            {
                _restartAttempts = 0;   // arranque sano: resetear el contador
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
        _stopRequested = true;
        if (_process == null || _process.HasExited) return;

        try
        {
            _process.Kill(entireProcessTree: true);
            // Esperar maximo 3 segundos a que termine
            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(3));
            try { await _process.WaitForExitAsync(cts.Token); } catch (OperationCanceledException) { }
        }
        catch
        {
            // Proceso ya termino o no se pudo matar
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
        string cwd = Environment.CurrentDirectory;
        string[] searchPaths =
        [
            // Produccion: junto al ejecutable de la UI
            Path.Combine(appDir, "alfred.exe"),
            // Estructura de instalador: backend/ junto a la UI
            Path.Combine(appDir, "backend", "alfred.exe"),
            // Desarrollo: cwd del proceso (tarea de VS Code)
            Path.Combine(cwd, "build_mingw", "alfred.exe"),
            Path.Combine(cwd, "build_mingw", "Debug", "alfred.exe"),
            Path.Combine(cwd, "build_mingw", "Release", "alfred.exe"),
            Path.Combine(cwd, "build", "alfred.exe"),
            Path.Combine(cwd, "build", "Debug", "alfred.exe"),
            Path.Combine(cwd, "build", "Release", "alfred.exe"),
            // Desarrollo: build_mingw en raiz del repo
            Path.Combine(appDir, "..", "..", "..", "..", "build_mingw", "alfred.exe"),
            Path.Combine(appDir, "..", "..", "..", "..", "build_mingw", "Debug", "alfred.exe"),
            Path.Combine(appDir, "..", "..", "..", "..", "build_mingw", "Release", "alfred.exe"),
            // Desarrollo: build en raiz del repo (Ninja/Make)
            Path.Combine(appDir, "..", "..", "..", "..", "build", "alfred.exe"),
            // Desarrollo: build Visual Studio Debug
            Path.Combine(appDir, "..", "..", "..", "..", "build", "Debug", "alfred.exe"),
            // Desarrollo: build Visual Studio Release
            Path.Combine(appDir, "..", "..", "..", "..", "build", "Release", "alfred.exe"),
            // Desarrollo: rutas cuando BaseDirectory agrega subcarpetas x64/Debug/net*
            Path.Combine(appDir, "..", "..", "..", "..", "..", "..", "build_mingw", "alfred.exe"),
            Path.Combine(appDir, "..", "..", "..", "..", "..", "..", "build_mingw", "Debug", "alfred.exe"),
            Path.Combine(appDir, "..", "..", "..", "..", "..", "..", "build_mingw", "Release", "alfred.exe"),
            Path.Combine(appDir, "..", "..", "..", "..", "..", "..", "build", "alfred.exe"),
            Path.Combine(appDir, "..", "..", "..", "..", "..", "..", "build", "Debug", "alfred.exe"),
            Path.Combine(appDir, "..", "..", "..", "..", "..", "..", "build", "Release", "alfred.exe"),
        ];

        foreach (string path in searchPaths)
        {
            string fullPath = Path.GetFullPath(path);
            if (File.Exists(fullPath))
                return fullPath;
        }

        return "";
    }

    private void OnOutputData(object sender, DataReceivedEventArgs e)
    {
        if (!string.IsNullOrEmpty(e.Data))
            OutputReceived?.Invoke(this, e.Data);
    }

    private void OnErrorData(object sender, DataReceivedEventArgs e)
    {
        if (!string.IsNullOrEmpty(e.Data))
            OutputReceived?.Invoke(this, e.Data);
    }

    private void OnExited(object? sender, EventArgs e)
    {
        StatusChanged?.Invoke(this, "stopped");

        // Salida inesperada (no un stop/dispose intencional): intentar
        // reiniciar con backoff, hasta un maximo de intentos.
        if (_stopRequested || _disposed) return;
        if (_restartAttempts >= MaxRestartAttempts)
        {
            StatusChanged?.Invoke(this,
                "error: el backend se detuvo repetidamente. Revisa los logs.");
            return;
        }

        _restartAttempts++;
        int attempt = _restartAttempts;
        _ = Task.Run(async () =>
        {
            StatusChanged?.Invoke(this,
                $"reiniciando backend (intento {attempt}/{MaxRestartAttempts})...");
            await Task.Delay(TimeSpan.FromSeconds(attempt * 2));   // backoff lineal
            if (_stopRequested || _disposed) return;
            await StartAsync();
        });
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        _stopRequested = true;

        if (_process != null)
        {
            // Desuscribir para evitar fires post-dispose
            _process.OutputDataReceived -= OnOutputData;
            _process.ErrorDataReceived  -= OnErrorData;
            _process.Exited             -= OnExited;

            if (!_process.HasExited)
                try { _process.Kill(entireProcessTree: true); } catch { }

            _process.Dispose();
            _process = null;
        }

        // Cerrar el job termina cualquier proceso asignado que aun viva.
        _jobObject.Dispose();
    }
}
