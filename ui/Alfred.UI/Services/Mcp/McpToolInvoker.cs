using Alfred.UI.Models;

namespace Alfred.UI.Services.Mcp;

/// <summary>
/// Envoltorio fino sobre <see cref="McpClientService.CallToolAsync"/> que aniade
/// timeout, logging y normalizacion de errores. Aislado para que <see cref="AgentLoop"/>
/// no tenga que conocer el SDK MCP.
/// </summary>
public sealed class McpToolInvoker
{
    private readonly McpClientService _mcp;
    private readonly TimeSpan _defaultTimeout;

    public McpToolInvoker(McpClientService mcp, TimeSpan? defaultTimeout = null)
    {
        _mcp = mcp;
        _defaultTimeout = defaultTimeout ?? TimeSpan.FromSeconds(30);
    }

    /// <summary>
    /// Invoca una tool y devuelve un <see cref="ToolResult"/> listo para
    /// inyectar en la siguiente llamada a /query/agent/stream. Garantiza que
    /// nunca se lance: cualquier excepcion se serializa como error en el
    /// resultado.
    /// </summary>
    public async Task<ToolResult> InvokeAsync(
        ToolCall call,
        TimeSpan? timeout,
        CancellationToken cancellationToken)
    {
        using var timeoutCts = new CancellationTokenSource(timeout ?? _defaultTimeout);
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(
            cancellationToken, timeoutCts.Token);

        try
        {
            var args = JsonElementHelpers.ToDictionary(call.Arguments);
            var (content, isError) = await _mcp.CallToolAsync(call.Name, args, linked.Token)
                .ConfigureAwait(false);

            System.Diagnostics.Debug.WriteLine(
                $"[McpInvoker] {call.Name} -> {(isError ? "ERROR" : "OK")} " +
                $"({content.Length} chars)");

            return new ToolResult
            {
                Id = call.Id,
                Content = content,
                IsError = isError,
            };
        }
        catch (OperationCanceledException) when (timeoutCts.IsCancellationRequested)
        {
            return ErrorResult(call, $"Timeout tras {(timeout ?? _defaultTimeout).TotalSeconds:0.#}s.");
        }
        catch (OperationCanceledException)
        {
            // Cancelacion por el usuario: propagar
            throw;
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"[McpInvoker] {call.Name} EXC: {ex.Message}");
            return ErrorResult(call, ex.Message);
        }
    }

    private static ToolResult ErrorResult(ToolCall call, string msg) => new()
    {
        Id = call.Id,
        Content = msg,
        IsError = true,
    };
}
