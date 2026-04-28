using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Alfred.UI.Models;

namespace Alfred.UI.Services;

// ============================================================================
// Endpoint /query/agent/stream (Fase 0 -> consumido por Fase 3 plan VSC+MCP)
// ============================================================================
// Mismo SSE que /query/stream pero con un evento adicional `tool_call`.
// El caller controla el bucle agentico llamando varias veces con `tool_results`
// hasta que `finish_reason` sea "stop" o "cancelled" (ver AgentLoop).
// ============================================================================

public sealed partial class AlfredApiClient
{
    private static readonly JsonSerializerOptions AgentJsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull,
    };

    /// <summary>
    /// Manda una request agentica al backend. Eventos del SSE se entregan via
    /// callback. Devuelve el payload `done` final (o null si hubo error/cancel).
    ///
    /// El caller marshalls los callbacks al hilo de UI si es necesario; aqui no
    /// se asume contexto de sincronizacion para no bloquear el loop SSE.
    /// </summary>
    public async Task<AgentDonePayload?> SendAgentStreamingAsync(
        AgentQueryRequest request,
        Action<AgentStreamEvent> onEvent,
        CancellationToken cancellationToken)
    {
        const string endpoint = "/query/agent/stream";

        using var httpReq = new HttpRequestMessage(HttpMethod.Post, endpoint)
        {
            Content = new StringContent(
                JsonSerializer.Serialize(request, AgentJsonOptions),
                Encoding.UTF8, "application/json"),
        };
        httpReq.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("text/event-stream"));

        AgentDonePayload? donePayload = null;

        try
        {
            using var response = await _http.SendAsync(
                httpReq, HttpCompletionOption.ResponseHeadersRead, cancellationToken)
                .ConfigureAwait(false);

            if (!response.IsSuccessStatusCode)
            {
                var err = await response.Content.ReadAsStringAsync(cancellationToken)
                    .ConfigureAwait(false);
                System.Diagnostics.Debug.WriteLine($"[AlfredAPI] Agent stream error {response.StatusCode}: {err}");
                onEvent?.Invoke(new AgentStreamEvent.Error(
                    $"HTTP {(int)response.StatusCode}: {Truncate(err, 200)}"));
                return null;
            }

            using var stream = await response.Content.ReadAsStreamAsync(cancellationToken)
                .ConfigureAwait(false);
            using var reader = new System.IO.StreamReader(stream, Encoding.UTF8);

            string? currentEvent = null;
            var dataBuffer = new StringBuilder();

            while (true)
            {
                cancellationToken.ThrowIfCancellationRequested();
                var line = await reader.ReadLineAsync(cancellationToken).ConfigureAwait(false);
                if (line == null) break;

                if (line.Length == 0)
                {
                    if (currentEvent != null && dataBuffer.Length > 0)
                    {
                        var json = dataBuffer.ToString();
                        DispatchAgentEvent(currentEvent, json, onEvent, ref donePayload);
                    }
                    currentEvent = null;
                    dataBuffer.Clear();
                    continue;
                }

                if (line.StartsWith("event:", StringComparison.Ordinal))
                {
                    currentEvent = line.Substring(6).Trim();
                }
                else if (line.StartsWith("data:", StringComparison.Ordinal))
                {
                    if (dataBuffer.Length > 0) dataBuffer.Append('\n');
                    dataBuffer.Append(line.AsSpan(5).TrimStart());
                }
            }
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"[AlfredAPI] Agent stream exception: {ex.Message}");
            onEvent?.Invoke(new AgentStreamEvent.Error(ex.Message));
        }

        return donePayload;
    }

    private static void DispatchAgentEvent(
        string eventName, string json,
        Action<AgentStreamEvent> onEvent,
        ref AgentDonePayload? donePayload)
    {
        try
        {
            switch (eventName)
            {
                case "start":
                {
                    using var doc = JsonDocument.Parse(json);
                    long id = 0;
                    if (doc.RootElement.TryGetProperty("request_id", out var idEl))
                        idEl.TryGetInt64(out id);
                    onEvent?.Invoke(new AgentStreamEvent.Started(id));
                    break;
                }
                case "token":
                {
                    using var doc = JsonDocument.Parse(json);
                    if (doc.RootElement.TryGetProperty("text", out var t))
                    {
                        var s = t.GetString();
                        if (!string.IsNullOrEmpty(s))
                            onEvent?.Invoke(new AgentStreamEvent.Token(s));
                    }
                    break;
                }
                case "tool_call":
                {
                    var call = JsonSerializer.Deserialize<ToolCall>(json, AgentJsonOptions);
                    if (call != null)
                        onEvent?.Invoke(new AgentStreamEvent.ToolCallEmitted(call));
                    break;
                }
                case "done":
                {
                    var done = JsonSerializer.Deserialize<AgentDonePayload>(json, AgentJsonOptions);
                    if (done != null)
                    {
                        donePayload = done;
                        onEvent?.Invoke(new AgentStreamEvent.Done(done));
                    }
                    break;
                }
                case "error":
                {
                    onEvent?.Invoke(new AgentStreamEvent.Error(json));
                    break;
                }
            }
        }
        catch (JsonException ex)
        {
            System.Diagnostics.Debug.WriteLine($"[AlfredAPI] Agent SSE parse error ({eventName}): {ex.Message}");
        }
    }

    private static string Truncate(string s, int max) =>
        s.Length <= max ? s : s.Substring(0, max) + "...";
}
