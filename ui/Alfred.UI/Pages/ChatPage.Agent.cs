using System.Text.Json;
using Alfred.UI.Models;
using Alfred.UI.Services;
using Alfred.UI.Services.Mcp;
using Microsoft.UI;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;

namespace Alfred.UI.Pages;

// ============================================================================
// ChatPage — modo agente (Fase 3 plan VSC+MCP)
// ============================================================================
// Toggle "Modo agente" + ejecucion del bucle agentico via AgentLoop, con render
// de bloques tool_call/tool_result en linea con la respuesta del asistente.
// ============================================================================

public sealed partial class ChatPage
{
    private void OnAgentToggleChanged(object sender, RoutedEventArgs e)
    {
        _agentMode = AgentToggle.IsChecked == true;

        if (_agentMode)
        {
            int connected = McpClientService.Instance.ConnectedServerNames.Count;
            int tools = McpClientService.Instance.GetAllTools().Count;
            if (connected == 0)
            {
                ShowNotification(InfoBarSeverity.Warning,
                    "Modo agente activado, pero no hay MCP servers conectados. " +
                    "Configuralos en 'Servidores MCP'.");
            }
            else
            {
                ShowNotification(InfoBarSeverity.Informational,
                    $"Modo agente activo · {connected} servers, {tools} tools disponibles.");
            }
        }
    }

    /// <summary>
    /// Variante agentica de <c>GenerateForActiveVariantAsync</c>. Usa
    /// <see cref="AgentLoop"/> para encadenar tool_calls hasta que el modelo
    /// responda sin pedir mas herramientas.
    /// </summary>
    private async Task GenerateAgentForActiveVariantAsync(
        TurnVariant variant, List<AttachedFileData>? attachments)
    {
        if (_api == null) return;

        _isSending = true;
        SendButton.IsEnabled = false;
        SendButton.Visibility = Visibility.Collapsed;
        StopButton.Visibility = Visibility.Visible;
        StopButton.IsEnabled = true;
        WelcomePanel.Visibility = Visibility.Collapsed;

        LoadingIndicator.Visibility = Visibility.Visible;
        LoadingText.Text = "Alfred está usando herramientas…";
        StartLoadingTips();

        _streamCts = new CancellationTokenSource();
        _activeRequestId = 0;

        var ctx = new AgentRenderContext
        {
            Sb = new System.Text.StringBuilder(),
            FirstToken = true,
            PendingByCallId = new Dictionary<string, AgentToolEvent>(StringComparer.Ordinal),
        };

        var loop = new AgentLoop(_api, McpClientService.Instance,
            new McpToolInvoker(McpClientService.Instance));

        try
        {
            await loop.RunAsync(
                variant.UserText,
                _conversationId,
                attachments,
                onEvent: evt =>
                {
                    DispatcherQueue.TryEnqueue(() => HandleAgentEvent(evt, variant, ctx));
                },
                cancellationToken: _streamCts.Token);

            string finalText = ctx.Sb.ToString();
            // Si el modelo termino con tool_calls sin respuesta de texto, dejar
            // un placeholder para que la burbuja no quede vacia.
            if (string.IsNullOrWhiteSpace(finalText))
                finalText = "_(respuesta sin texto: revisa los tool calls arriba)_";

            variant.AssistantText = finalText;
            variant.Pending = false;
            RebuildAllBubbles();
        }
        catch (OperationCanceledException)
        {
            variant.AssistantText = ctx.Sb.ToString();
            variant.Pending = false;
            variant.Cancelled = true;
            RebuildAllBubbles();
            ShowNotification(InfoBarSeverity.Informational, "Generación detenida.");
        }
        catch (Exception ex)
        {
            variant.AssistantText = $"Error: {ex.Message}";
            variant.Pending = false;
            variant.IsError = true;
            RebuildAllBubbles();
        }
        finally
        {
            StopLoadingTips();
            LoadingIndicator.Visibility = Visibility.Collapsed;
            _streamCts?.Dispose();
            _streamCts = null;
            _activeRequestId = 0;
            _isSending = false;
            StopButton.Visibility = Visibility.Collapsed;
            SendButton.Visibility = Visibility.Visible;
            SendButton.IsEnabled = !string.IsNullOrWhiteSpace(InputBox.Text);
            InputBox.Focus(FocusState.Programmatic);
            _liveBubble = null;
        }
    }

    /// <summary>
    /// Despacha un evento del bucle agentico al estado de la UI. Debe
    /// llamarse en el dispatcher thread.
    /// </summary>
    private void HandleAgentEvent(
        AgentLoopEvent evt,
        TurnVariant variant,
        AgentRenderContext ctx)
    {
        switch (evt)
        {
            case AgentLoopEvent.RequestStarted s:
                _activeRequestId = s.RequestId;
                break;

            case AgentLoopEvent.Token t:
                if (ctx.FirstToken)
                {
                    ctx.FirstToken = false;
                    StopLoadingTips();
                    LoadingIndicator.Visibility = Visibility.Collapsed;
                }
                ctx.Sb.Append(t.Text);
                if (_liveBubble != null)
                {
                    _liveBubble.Text.Text = ctx.Sb.ToString();
                    ChatScroll.ChangeView(null, ChatScroll.ScrollableHeight, null);
                }
                break;

            case AgentLoopEvent.ToolCallReceived tc:
            {
                var ev = new AgentToolEvent { Call = tc.Call, Iteration = tc.Iteration };
                variant.ToolEvents.Add(ev);
                if (!string.IsNullOrEmpty(tc.Call.Id))
                    ctx.PendingByCallId[tc.Call.Id] = ev;
                // Re-render para mostrar la tarjeta del tool_call (todavia sin resultado)
                RebuildAllBubbles();
                LoadingText.Text = $"Ejecutando '{tc.Call.Name}'…";
                LoadingIndicator.Visibility = Visibility.Visible;
                break;
            }

            case AgentLoopEvent.ToolResultReady tr:
            {
                if (tr.Call.Id != null && ctx.PendingByCallId.TryGetValue(tr.Call.Id, out var ev))
                {
                    ev.Result = tr.Result;
                }
                else
                {
                    // Caso sin id: enlazamos al ultimo registrado con el mismo nombre.
                    var ev2 = variant.ToolEvents.LastOrDefault(x =>
                        x.Result == null && x.Call.Name == tr.Call.Name);
                    if (ev2 != null) ev2.Result = tr.Result;
                }
                RebuildAllBubbles();
                LoadingText.Text = "Procesando resultado…";
                break;
            }

            case AgentLoopEvent.IterationFinished:
                LoadingText.Text = "Alfred está pensando…";
                break;

            case AgentLoopEvent.MaxIterationsReached:
                ShowNotification(InfoBarSeverity.Warning,
                    "Se alcanzo el limite de iteraciones del agente.");
                break;

            case AgentLoopEvent.BackendError be:
                ShowNotification(InfoBarSeverity.Error, be.Message);
                break;
        }
    }

    /// <summary>
    /// Render colapsable de un par tool_call/tool_result. Pendiente -> spinner;
    /// completado -> contenido (texto plano, recortado).
    /// </summary>
    private FrameworkElement BuildToolEventExpander(AgentToolEvent ev)
    {
        Brush dim = ThemedBrushes.Get("AlfredTextSecondary", Colors.LightGray);
        Brush badgeBg = ev.Result == null
            ? new SolidColorBrush(Windows.UI.Color.FromArgb(80, 100, 149, 237))
            : (ev.Result.IsError
                ? new SolidColorBrush(Windows.UI.Color.FromArgb(80, 220, 60, 60))
                : new SolidColorBrush(Windows.UI.Color.FromArgb(80, 60, 180, 100)));

        // Header: glyph + nombre + estado
        var header = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8 };
        header.Children.Add(new FontIcon
        {
            Glyph = "", // lightning / tool
            FontSize = 12,
            Foreground = dim,
            VerticalAlignment = VerticalAlignment.Center,
        });
        header.Children.Add(new TextBlock
        {
            Text = ev.Call.Name,
            FontWeight = Microsoft.UI.Text.FontWeights.SemiBold,
            FontSize = 12,
            VerticalAlignment = VerticalAlignment.Center,
        });

        var badge = new Border
        {
            Background = badgeBg,
            CornerRadius = new CornerRadius(8),
            Padding = new Thickness(6, 1, 6, 1),
            VerticalAlignment = VerticalAlignment.Center,
        };
        badge.Child = new TextBlock
        {
            Text = ev.Result == null
                ? "ejecutando…"
                : (ev.Result.IsError ? "error" : $"{TruncForBadge(ev.Result.Content)}"),
            FontSize = 10,
            Foreground = dim,
        };
        header.Children.Add(badge);

        // Contenido: argumentos + resultado
        var content = new StackPanel { Spacing = 6 };

        content.Children.Add(new TextBlock
        {
            Text = "Argumentos",
            FontSize = 10,
            Foreground = dim,
        });
        content.Children.Add(new Border
        {
            Background = (Brush)Application.Current.Resources["TextControlBackground"],
            CornerRadius = new CornerRadius(4),
            Padding = new Thickness(8),
            Child = new TextBlock
            {
                Text = SafeJson(ev.Call.Arguments),
                FontFamily = new FontFamily("Consolas"),
                FontSize = 11,
                TextWrapping = TextWrapping.Wrap,
                IsTextSelectionEnabled = true,
            },
        });

        content.Children.Add(new TextBlock
        {
            Text = ev.Result == null
                ? "Resultado (pendiente)"
                : (ev.Result.IsError ? "Resultado (error)" : "Resultado"),
            FontSize = 10,
            Foreground = dim,
            Margin = new Thickness(0, 4, 0, 0),
        });
        content.Children.Add(new Border
        {
            Background = (Brush)Application.Current.Resources["TextControlBackground"],
            CornerRadius = new CornerRadius(4),
            Padding = new Thickness(8),
            Child = new TextBlock
            {
                Text = ev.Result?.Content ?? "(esperando…)",
                FontFamily = new FontFamily("Consolas"),
                FontSize = 11,
                TextWrapping = TextWrapping.Wrap,
                IsTextSelectionEnabled = true,
            },
        });

        return new Expander
        {
            Header = header,
            Content = content,
            HorizontalAlignment = HorizontalAlignment.Stretch,
            HorizontalContentAlignment = HorizontalAlignment.Stretch,
            Margin = new Thickness(0, 4, 0, 4),
            IsExpanded = ev.Result == null, // expandido mientras esta en curso
        };
    }

    private static string SafeJson(JsonElement el)
    {
        try { return JsonSerializer.Serialize(el, new JsonSerializerOptions { WriteIndented = true }); }
        catch { return el.ToString(); }
    }

    private static string TruncForBadge(string s)
    {
        s = s.Replace('\n', ' ').Replace('\r', ' ');
        return s.Length <= 24 ? s : s[..24] + "…";
    }

    /// <summary>
    /// Estado mutable del render del bucle agentico (sustituye a varios
    /// locals capturados por ref que no se permiten en lambdas).
    /// </summary>
    private sealed class AgentRenderContext
    {
        public System.Text.StringBuilder Sb { get; init; } = new();
        public bool FirstToken { get; set; } = true;
        public Dictionary<string, AgentToolEvent> PendingByCallId { get; init; } = new();
    }
}
