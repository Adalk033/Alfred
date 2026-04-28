using System.Text.Json;

namespace Alfred.UI.Services.Mcp;

/// <summary>
/// Lectura/escritura del listado de MCP servers en
/// <c>%APPDATA%/Alfred/mcp_servers.json</c>.
///
/// Formato:
/// <code>
/// { "servers": [ McpServerConfig, ... ] }
/// </code>
/// </summary>
public sealed class McpServerRegistry
{
    private static readonly Lazy<McpServerRegistry> _instance =
        new(() => new McpServerRegistry());

    public static McpServerRegistry Instance => _instance.Value;

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        WriteIndented = true,
        PropertyNameCaseInsensitive = true,
    };

    private readonly object _gate = new();
    private readonly string _path;

    private McpServerRegistry()
    {
        var dir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "Alfred");
        Directory.CreateDirectory(dir);
        _path = Path.Combine(dir, "mcp_servers.json");
    }

    public string FilePath => _path;

    /// <summary>
    /// Devuelve la lista actual. Si el archivo no existe o esta corrupto,
    /// devuelve una lista vacia (no lanza).
    /// </summary>
    public List<McpServerConfig> Load()
    {
        lock (_gate)
        {
            if (!File.Exists(_path)) return new();
            try
            {
                var json = File.ReadAllText(_path);
                var doc  = JsonSerializer.Deserialize<RegistryFile>(json, JsonOpts);
                return doc?.Servers ?? new();
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[McpRegistry] Load error: {ex.Message}");
                return new();
            }
        }
    }

    /// <summary>
    /// Persiste la lista entera. Atomico: escribe a un .tmp y renombra.
    /// </summary>
    public void Save(IEnumerable<McpServerConfig> servers)
    {
        lock (_gate)
        {
            try
            {
                var doc  = new RegistryFile { Servers = servers.ToList() };
                var json = JsonSerializer.Serialize(doc, JsonOpts);
                var tmp  = _path + ".tmp";
                File.WriteAllText(tmp, json);
                if (File.Exists(_path)) File.Delete(_path);
                File.Move(tmp, _path);
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[McpRegistry] Save error: {ex.Message}");
            }
        }
    }

    /// <summary>
    /// Si el archivo no existe, escribe una primera version con sugerencias
    /// (filesystem y git oficiales). El usuario puede editarlo despues.
    /// </summary>
    public List<McpServerConfig> LoadOrSeed()
    {
        var existing = Load();
        if (existing.Count > 0 || File.Exists(_path)) return existing;

        var seed = DefaultSuggestions();
        Save(seed);
        return seed;
    }

    /// <summary>
    /// Sugerencias para primer arranque. Estan deshabilitados por defecto: el
    /// usuario los activa manualmente cuando esta listo.
    /// </summary>
    public static List<McpServerConfig> DefaultSuggestions() => new()
    {
        new McpServerConfig
        {
            Name = "filesystem",
            Command = "npx",
            Args = new() { "-y", "@modelcontextprotocol/server-filesystem", "%USERPROFILE%" },
            Enabled = false,
        },
        new McpServerConfig
        {
            Name = "git",
            Command = "uvx",
            Args = new() { "mcp-server-git" },
            Enabled = false,
        },
    };

    private sealed class RegistryFile
    {
        public List<McpServerConfig> Servers { get; set; } = new();
    }
}
