using Alfred.UI.Models;

namespace Alfred.UI.Services.Mcp;

/// <summary>
/// Orquesta el bucle agentico:
///
///   1. POST /query/agent/stream con la pregunta + tools disponibles
///   2. Si el modelo emite tool_calls -> ejecutarlas via MCP -> reenviar
///      con tool_results
///   3. Repetir hasta que el modelo responda sin tool_calls o se alcance
///      el limite de iteraciones
///
/// La capa de UI consume este loop via <see cref="AgentLoopEvent"/>: para
/// cada token, tool_call, tool_result o final, recibe un evento concreto y
/// puede renderizarlo donde quiera (incluyendo bloques colapsables en el chat).
/// </summary>
public sealed class AgentLoop
{
    private readonly AlfredApiClient _api;
    private readonly McpToolInvoker _invoker;
    private readonly McpClientService _mcp;

    public int MaxIterations { get; set; } = 10;
    public TimeSpan ToolTimeout { get; set; } = TimeSpan.FromSeconds(30);

    public AgentLoop(AlfredApiClient api, McpClientService mcp, McpToolInvoker invoker)
    {
        _api = api;
        _mcp = mcp;
        _invoker = invoker;
    }

    /// <summary>
    /// Ejecuta el bucle. Devuelve la respuesta final (o vacia si se cancelo)
    /// y la lista completa de tool calls/results para auditoria/UI.
    /// </summary>
    public async Task<AgentLoopResult> RunAsync(
        string question,
        string? conversationId,
        List<AttachedFileData>? attachedFiles,
        Action<AgentLoopEvent> onEvent,
        CancellationToken cancellationToken)
    {
        var allCalls = new List<ToolCall>();
        var allResults = new List<ToolResult>();
        var availableTools = _mcp.GetAllTools().ToList();

        string finalAnswer = "";
        string finishReason = "stop";
        long lastRequestId = 0;

        // El backend mantiene la conversacion. Los tool_results los pasamos
        // SOLO en la siguiente iteracion (no acumulados desde el principio):
        // el endpoint los inyecta como contexto del proximo turn.
        List<ToolResult>? toolResultsForNext = null;
        string nextQuestion = question;

        for (int iter = 0; iter < MaxIterations; iter++)
        {
            cancellationToken.ThrowIfCancellationRequested();

            onEvent?.Invoke(new AgentLoopEvent.IterationStarted(iter));

            var pendingCalls = new List<ToolCall>();

            var request = new AgentQueryRequest
            {
                Question = nextQuestion,
                ConversationId = conversationId,
                Tools = availableTools.Count > 0 ? availableTools : null,
                ToolResults = toolResultsForNext,
                AttachedFiles = iter == 0 ? attachedFiles : null,
            };

            AgentDonePayload? done = null;
            try
            {
                done = await _api.SendAgentStreamingAsync(
                    request,
                    evt =>
                    {
                        switch (evt)
                        {
                            case AgentStreamEvent.Started s:
                                lastRequestId = s.RequestId;
                                onEvent?.Invoke(new AgentLoopEvent.RequestStarted(iter, s.RequestId));
                                break;
                            case AgentStreamEvent.Token t:
                                onEvent?.Invoke(new AgentLoopEvent.Token(iter, t.Text));
                                break;
                            case AgentStreamEvent.ToolCallEmitted tc:
                                pendingCalls.Add(tc.Call);
                                onEvent?.Invoke(new AgentLoopEvent.ToolCallReceived(iter, tc.Call));
                                break;
                            case AgentStreamEvent.Error e:
                                onEvent?.Invoke(new AgentLoopEvent.BackendError(iter, e.Message));
                                break;
                        }
                    },
                    cancellationToken)
                    .ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                onEvent?.Invoke(new AgentLoopEvent.Cancelled(iter));
                throw;
            }

            if (done == null)
            {
                // Error de transporte; salimos con lo que tengamos
                finishReason = "error";
                break;
            }

            finalAnswer = done.Answer ?? finalAnswer;
            finishReason = done.FinishReason ?? "stop";
            allCalls.AddRange(pendingCalls);

            if (done.Cancelled)
            {
                finishReason = "cancelled";
                onEvent?.Invoke(new AgentLoopEvent.Cancelled(iter));
                break;
            }

            // Si no hay tool calls pendientes -> terminamos
            if (pendingCalls.Count == 0)
            {
                onEvent?.Invoke(new AgentLoopEvent.IterationFinished(iter, finishReason, finalAnswer));
                break;
            }

            // Ejecutar todas las tool_calls de este turno y preparar la siguiente
            var nextResults = new List<ToolResult>(pendingCalls.Count);
            foreach (var call in pendingCalls)
            {
                cancellationToken.ThrowIfCancellationRequested();
                var toolResult = await _invoker
                    .InvokeAsync(call, ToolTimeout, cancellationToken)
                    .ConfigureAwait(false);
                nextResults.Add(toolResult);
                allResults.Add(toolResult);
                onEvent?.Invoke(new AgentLoopEvent.ToolResultReady(iter, call, toolResult));
            }

            toolResultsForNext = nextResults;
            // En continuaciones la "pregunta" puede ir vacia: el contexto lo
            // arman los tool_results. Mantenemos el question original por si
            // el modelo lo necesita reflejado.
            nextQuestion = "";
            onEvent?.Invoke(new AgentLoopEvent.IterationFinished(iter, "tool_calls", finalAnswer));

            if (iter == MaxIterations - 1)
            {
                finishReason = "max_iterations";
                onEvent?.Invoke(new AgentLoopEvent.MaxIterationsReached(iter));
            }
        }

        var loopResult = new AgentLoopResult(
            finalAnswer ?? "",
            finishReason,
            allCalls,
            allResults,
            lastRequestId);
        onEvent?.Invoke(new AgentLoopEvent.LoopFinished(loopResult));
        return loopResult;
    }
}

public sealed record AgentLoopResult(
    string Answer,
    string FinishReason,
    IReadOnlyList<ToolCall> ToolCalls,
    IReadOnlyList<ToolResult> ToolResults,
    long LastRequestId);

/// <summary>Eventos del bucle agentico para que la UI los renderice.</summary>
public abstract record AgentLoopEvent
{
    public sealed record IterationStarted(int Iteration)                     : AgentLoopEvent;
    public sealed record RequestStarted(int Iteration, long RequestId)       : AgentLoopEvent;
    public sealed record Token(int Iteration, string Text)                   : AgentLoopEvent;
    public sealed record ToolCallReceived(int Iteration, ToolCall Call)      : AgentLoopEvent;
    public sealed record ToolResultReady(int Iteration, ToolCall Call, ToolResult Result) : AgentLoopEvent;
    public sealed record IterationFinished(int Iteration, string FinishReason, string Answer) : AgentLoopEvent;
    public sealed record MaxIterationsReached(int Iteration)                 : AgentLoopEvent;
    public sealed record BackendError(int Iteration, string Message)         : AgentLoopEvent;
    public sealed record Cancelled(int Iteration)                            : AgentLoopEvent;
    public sealed record LoopFinished(AgentLoopResult Result)                : AgentLoopEvent;
}
