using System.Collections.Concurrent;
using System.Text.Json;
using Alfred.UI.Models;
using Microsoft.Extensions.Logging.Abstractions;
using ModelContextProtocol.Client;
using ModelContextProtocol.Protocol;

namespace Alfred.UI.Services.Mcp;

/// <summary>
/// Singleton que gestiona conexiones a N MCP servers (uno por entrada en
/// <see cref="McpServerRegistry"/>). Cada server arranca como proceso hijo
/// con stdio, expone sus tools y permite invocarlas.
///
/// Esta capa NO conoce el LLM ni el bucle agentico: solo "habla MCP". El
/// pegamento con el modelo esta en <see cref="AgentLoop"/>.
/// </summary>
public sealed class McpClientService : IAsyncDisposable
{
    private static readonly Lazy<McpClientService> _instance =
        new(() => new McpClientService());

    public static McpClientService Instance => _instance.Value;

    private readonly ConcurrentDictionary<string, ServerHandle> _servers = new(StringComparer.Ordinal);
    private readonly SemaphoreSlim _connectGate = new(1, 1);

    /// <summary>Notifica cambios de estado para que la UI refresque.</summary>
    public event EventHandler<string>? ServerStateChanged;

    private McpClientService() { }

    // ------------------------------------------------------------------------
    // Estado consultable
    // ------------------------------------------------------------------------

    public IReadOnlyList<string> ConnectedServerNames =>
        _servers.Where(kv => kv.Value.IsConnected).Select(kv => kv.Key).ToList();

    public bool IsConnected(string serverName) =>
        _servers.TryGetValue(serverName, out var h) && h.IsConnected;

    public string? GetLastError(string serverName) =>
        _servers.TryGetValue(serverName, out var h) ? h.LastError : null;

    /// <summary>
    /// Devuelve todas las tools de los servers conectados, agrupadas por
    /// server. Los nombres se prefijan con <c>{serverName}__{toolName}</c>
    /// para evitar colisiones entre servers.
    /// </summary>
    public IReadOnlyList<ToolSpec> GetAllTools()
    {
        var list = new List<ToolSpec>();
        foreach (var kv in _servers)
        {
            if (!kv.Value.IsConnected) continue;
            foreach (var t in kv.Value.Tools)
            {
                list.Add(new ToolSpec
                {
                    Name = MakePrefixedName(kv.Key, t.Name),
                    Description = string.IsNullOrEmpty(t.Description) ? t.Name : t.Description!,
                    InputSchema = t.JsonSchema,
                    ServerName = kv.Key,
                });
            }
        }
        return list;
    }

    /// <summary>
    /// Resuelve un nombre prefijado en (server, toolName). Devuelve null si
    /// no existe.
    /// </summary>
    public (string Server, string Tool)? ResolvePrefixedName(string prefixedName)
    {
        var idx = prefixedName.IndexOf("__", StringComparison.Ordinal);
        if (idx <= 0) return null;
        return (prefixedName[..idx], prefixedName[(idx + 2)..]);
    }

    public static string MakePrefixedName(string server, string tool) => $"{server}__{tool}";

    // ------------------------------------------------------------------------
    // Sincronizacion con el registro: aplica los cambios en disco al runtime.
    // ------------------------------------------------------------------------

    /// <summary>
    /// Conecta los servers `enabled=true` que aun no esten conectados y
    /// desconecta los que ya no esten en la lista o se hayan deshabilitado.
    /// </summary>
    public async Task SyncWithRegistryAsync(
        IReadOnlyList<McpServerConfig> configs,
        CancellationToken cancellationToken = default)
    {
        await _connectGate.WaitAsync(cancellationToken);
        try
        {
            var byName = configs.ToDictionary(c => c.Name, StringComparer.Ordinal);

            // Desconectar los que ya no aplican
            foreach (var name in _servers.Keys.ToList())
            {
                bool keep = byName.TryGetValue(name, out var cfg) && cfg!.Enabled;
                if (!keep)
                {
                    if (_servers.TryRemove(name, out var handle))
                    {
                        await handle.DisposeAsync().ConfigureAwait(false);
                        ServerStateChanged?.Invoke(this, name);
                    }
                }
            }

            // Conectar / reconectar
            foreach (var cfg in configs.Where(c => c.Enabled))
            {
                if (_servers.TryGetValue(cfg.Name, out var existing) && existing.IsConnected)
                    continue;

                var handle = new ServerHandle(cfg);
                _servers[cfg.Name] = handle;
                ServerStateChanged?.Invoke(this, cfg.Name);

                try
                {
                    await handle.ConnectAsync(cancellationToken).ConfigureAwait(false);
                }
                catch (Exception ex)
                {
                    handle.LastError = ex.Message;
                    System.Diagnostics.Debug.WriteLine(
                        $"[Mcp] Error conectando '{cfg.Name}': {ex.Message}");
                }
                finally
                {
                    ServerStateChanged?.Invoke(this, cfg.Name);
                }
            }
        }
        finally
        {
            _connectGate.Release();
        }
    }

    /// <summary>
    /// Conecta puntualmente un solo server (test desde la UI). No persiste
    /// nada y no afecta a los demas.
    /// </summary>
    public async Task<(bool Ok, string? Error, IReadOnlyList<string> ToolNames)> TestConnectAsync(
        McpServerConfig cfg, CancellationToken cancellationToken = default)
    {
        var handle = new ServerHandle(cfg);
        try
        {
            await handle.ConnectAsync(cancellationToken).ConfigureAwait(false);
            var names = handle.Tools.Select(t => t.Name).ToList();
            return (true, null, names);
        }
        catch (Exception ex)
        {
            return (false, ex.Message, Array.Empty<string>());
        }
        finally
        {
            await handle.DisposeAsync().ConfigureAwait(false);
        }
    }

    // ------------------------------------------------------------------------
    // Invocacion de tools
    // ------------------------------------------------------------------------

    /// <summary>
    /// Invoca una tool por su nombre prefijado. Devuelve el contenido como
    /// texto plano (concatenando los bloques Content del MCP) y un flag de
    /// error si el server marco la respuesta como tal.
    /// </summary>
    public async Task<(string Content, bool IsError)> CallToolAsync(
        string prefixedName,
        IReadOnlyDictionary<string, object?>? arguments,
        CancellationToken cancellationToken)
    {
        var resolved = ResolvePrefixedName(prefixedName)
            ?? throw new ArgumentException(
                $"Nombre de tool invalido (esperado server__tool): {prefixedName}");

        if (!_servers.TryGetValue(resolved.Server, out var handle) || !handle.IsConnected)
            throw new InvalidOperationException(
                $"MCP server '{resolved.Server}' no esta conectado.");

        return await handle.CallToolAsync(resolved.Tool, arguments, cancellationToken)
            .ConfigureAwait(false);
    }

    public async ValueTask DisposeAsync()
    {
        foreach (var kv in _servers)
        {
            try { await kv.Value.DisposeAsync().ConfigureAwait(false); }
            catch { /* best effort */ }
        }
        _servers.Clear();
        _connectGate.Dispose();
    }

    // ========================================================================
    // Handle interno por server
    // ========================================================================

    private sealed class ServerHandle : IAsyncDisposable
    {
        public McpServerConfig Config { get; }
        public string? LastError { get; set; }
        public IList<McpClientTool> Tools { get; private set; } = Array.Empty<McpClientTool>();
        public bool IsConnected => _client != null;

        private IMcpClient? _client;
        private readonly SemaphoreSlim _gate = new(1, 1);

        public ServerHandle(McpServerConfig cfg)
        {
            Config = cfg;
        }

        public async Task ConnectAsync(CancellationToken cancellationToken)
        {
            await _gate.WaitAsync(cancellationToken);
            try
            {
                if (_client != null) return;

                var transport = new StdioClientTransport(new StdioClientTransportOptions
                {
                    Name = Config.Name,
                    Command = ExpandEnv(Config.Command),
                    Arguments = Config.Args.Select(ExpandEnv).ToList(),
                    EnvironmentVariables = Config.Env.Count == 0
                        ? null
                        : Config.Env.ToDictionary(
                            kv => kv.Key,
                            kv => (string?)ExpandEnv(kv.Value)),
                    WorkingDirectory = string.IsNullOrEmpty(Config.WorkingDirectory)
                        ? null : ExpandEnv(Config.WorkingDirectory),
                });

                _client = await McpClientFactory.CreateAsync(
                    transport,
                    clientOptions: null,
                    loggerFactory: NullLoggerFactory.Instance,
                    cancellationToken: cancellationToken).ConfigureAwait(false);

                Tools = await _client.ListToolsAsync(
                    cancellationToken: cancellationToken).ConfigureAwait(false);
                LastError = null;
            }
            finally
            {
                _gate.Release();
            }
        }

        public async Task<(string Content, bool IsError)> CallToolAsync(
            string toolName,
            IReadOnlyDictionary<string, object?>? arguments,
            CancellationToken cancellationToken)
        {
            if (_client == null)
                throw new InvalidOperationException($"Server '{Config.Name}' no conectado.");

            var response = await _client.CallToolAsync(
                toolName, arguments,
                cancellationToken: cancellationToken).ConfigureAwait(false);

            var text = ContentToText(response);
            return (text, response.IsError ?? false);
        }

        public async ValueTask DisposeAsync()
        {
            await _gate.WaitAsync().ConfigureAwait(false);
            try
            {
                if (_client is IAsyncDisposable ad)
                    await ad.DisposeAsync().ConfigureAwait(false);
                else if (_client is IDisposable d)
                    d.Dispose();
                _client = null;
                Tools = Array.Empty<McpClientTool>();
            }
            catch { /* ignore */ }
            finally
            {
                _gate.Release();
                _gate.Dispose();
            }
        }

        private static string ContentToText(CallToolResult response)
        {
            if (response?.Content == null || response.Content.Count == 0) return "";
            // Concatenar bloques de tipo "text". Otros tipos los serializamos
            // con json.dump para no perder informacion.
            var sb = new System.Text.StringBuilder();
            foreach (var c in response.Content)
            {
                if (c is TextContentBlock txt)
                {
                    if (sb.Length > 0) sb.Append('\n');
                    sb.Append(txt.Text);
                }
                else
                {
                    if (sb.Length > 0) sb.Append('\n');
                    try { sb.Append(JsonSerializer.Serialize(c)); }
                    catch { sb.Append(c?.ToString() ?? ""); }
                }
            }
            return sb.ToString();
        }

        private static string ExpandEnv(string value) =>
            string.IsNullOrEmpty(value) ? value : Environment.ExpandEnvironmentVariables(value);
    }
}
