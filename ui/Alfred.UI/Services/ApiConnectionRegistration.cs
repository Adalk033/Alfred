using System.Text.Json;
using System.Text.Json.Serialization;

namespace Alfred.UI.Services;

/// <summary>
/// Publica los datos efimeros que necesitan clientes locales de confianza,
/// como la extension de VS Code, para conectarse al backend protegido.
/// El archivo solo es accesible desde el perfil local del usuario y se elimina
/// al cerrar Alfred.
/// </summary>
public sealed class ApiConnectionRegistration : IDisposable
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
    };

    private readonly string _token;
    private readonly string _filePath;
    private bool _disposed;

    public ApiConnectionRegistration(string token, string baseUrl)
    {
        _token = token;
        _filePath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Alfred",
            "api-connection.json");

        TryPublish(baseUrl);
    }

    private void TryPublish(string baseUrl)
    {
        try
        {
            string? directory = Path.GetDirectoryName(_filePath);
            if (!string.IsNullOrEmpty(directory))
                Directory.CreateDirectory(directory);

            var registration = new ApiConnectionInfo
            {
                BaseUrl = baseUrl.TrimEnd('/'),
                Token = _token,
                ProcessId = Environment.ProcessId,
                CreatedAt = DateTimeOffset.UtcNow,
            };

            // Escribir primero un temporal evita que otro proceso lea JSON
            // incompleto mientras Alfred inicia o reemplaza una sesion previa.
            string tempPath = _filePath + $".{Environment.ProcessId}.tmp";
            File.WriteAllText(tempPath, JsonSerializer.Serialize(registration, JsonOptions));
            File.Move(tempPath, _filePath, overwrite: true);
        }
        catch
        {
            // La UI y su backend siguen funcionando aunque la integracion con
            // clientes externos no pueda publicarse.
        }
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;

        try
        {
            if (!File.Exists(_filePath)) return;

            var current = JsonSerializer.Deserialize<ApiConnectionInfo>(
                File.ReadAllText(_filePath));

            // No borrar el registro si otra instancia ya lo reemplazo.
            if (current?.Token == _token)
                File.Delete(_filePath);
        }
        catch
        {
            // Un registro obsoleto es inocuo: el token cambia en cada sesion.
        }
    }

    private sealed class ApiConnectionInfo
    {
        [JsonPropertyName("base_url")]
        public string BaseUrl { get; init; } = "";

        [JsonPropertyName("token")]
        public string Token { get; init; } = "";

        [JsonPropertyName("process_id")]
        public int ProcessId { get; init; }

        [JsonPropertyName("created_at")]
        public DateTimeOffset CreatedAt { get; init; }
    }
}
