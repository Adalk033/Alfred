using System.Text.Json.Serialization;

namespace Alfred.UI.Services.Mcp;

/// <summary>
/// Configuracion persistible de un MCP server local. Equivalente al item en
/// `mcp.json` de Claude Code / Cursor:
///
///   {
///     "filesystem": {
///       "command": "npx",
///       "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path"]
///     }
///   }
///
/// Nuestro JSON usa una lista (no un dict) para permitir orden estable en la UI.
/// </summary>
public sealed class McpServerConfig
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = "";

    [JsonPropertyName("command")]
    public string Command { get; set; } = "";

    [JsonPropertyName("args")]
    public List<string> Args { get; set; } = new();

    [JsonPropertyName("env")]
    public Dictionary<string, string> Env { get; set; } = new();

    /// <summary>
    /// Working directory opcional para el proceso del server (util para que
    /// `filesystem` resuelva paths relativos).
    /// </summary>
    [JsonPropertyName("cwd")]
    public string? WorkingDirectory { get; set; }

    /// <summary>
    /// Si false, el server se conserva en la lista pero no se conecta ni sus
    /// tools se ofrecen al modelo.
    /// </summary>
    [JsonPropertyName("enabled")]
    public bool Enabled { get; set; } = true;

    public McpServerConfig Clone() => new()
    {
        Name = Name,
        Command = Command,
        Args = new List<string>(Args),
        Env = new Dictionary<string, string>(Env),
        WorkingDirectory = WorkingDirectory,
        Enabled = Enabled,
    };

    public override string ToString() =>
        $"{Name} [{Command} {string.Join(' ', Args)}]";
}
