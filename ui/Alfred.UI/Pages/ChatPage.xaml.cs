using System.Collections.ObjectModel;
using Alfred.UI.Models;
using Alfred.UI.Services;
using Microsoft.UI;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Documents;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Media.Animation;
using Microsoft.UI.Xaml.Navigation;
using Windows.ApplicationModel.DataTransfer;
using Windows.Storage;
using Windows.Storage.Pickers;
using Windows.System;

namespace Alfred.UI.Pages;

public sealed partial class ChatPage : Page
{
    private AlfredApiClient? _api;
    private bool _isSending;
    private string? _conversationId;

    private CancellationTokenSource? _streamCts;
    private long _activeRequestId;

    // Autoscroll inteligente: solo seguir al fondo si el usuario ya esta
    // cerca del final (no arrastrarlo si subio a leer).
    private bool _stickToBottom = true;
    private const double AutoScrollThreshold = 48;

    // Serializa los ContentDialog: abrir un segundo mientras otro esta activo
    // lanza COMException en WinUI. Un unico timer reutilizado para las
    // notificaciones evita fugas de DispatcherTimer.
    private readonly SemaphoreSlim _dialogGate = new(1, 1);
    private DispatcherTimer? _notificationTimer;

    /// <summary>
    /// Muestra un ContentDialog garantizando que solo haya uno a la vez.
    /// </summary>
    private async Task<ContentDialogResult> ShowDialogSerializedAsync(ContentDialog dialog)
    {
        await _dialogGate.WaitAsync();
        try
        {
            return await dialog.ShowAsync();
        }
        finally
        {
            _dialogGate.Release();
        }
    }

    private const int MaxAttachedFiles = 5;
    private readonly List<AttachedFileInfo> _attachedFiles = [];

    private static readonly string[] BinaryExtensions = [".pdf", ".docx", ".xlsx", ".pptx"];
    private static readonly string[] AllowedExtensions =
        [".txt", ".pdf", ".docx", ".xlsx", ".pptx", ".md", ".json", ".xml", ".csv", ".html", ".htm", ".log", ".yaml", ".yml", ".toml", ".ini", ".cfg", ".conf"];

    public ObservableCollection<string> Messages { get; } = [];

    // Arbol de conversacion. _root es el primer turno; cada variante apunta al
    // turno siguiente via NextTurn. El "active path" se obtiene siguiendo
    // turn.Active.NextTurn desde la raiz.
    private ChatTurn? _root;
    private LiveAssistantBubble? _liveBubble;

    private static readonly string[] LoadingTips =
    [
        "Procesando tu consulta…",
        "Cargando contexto local…",
        "Generando tokens…",
        "Refinando la respuesta…",
        "Casi listo…",
    ];
    private DispatcherTimer? _loadingTipsTimer;
    private DateTime _loadingStarted;
    private int _loadingTipIndex;

    private DispatcherTimer? _variantResyncTimer;
    private ChatTurn? _pendingVariantResyncTurn;

    // Estado de busqueda local (Ctrl+F)
    private readonly List<SearchHit> _searchHits = [];
    private int _searchHitIndex = -1;

    public UiPreferences Prefs => UiPreferences.Instance;

    public ChatPage()
    {
        InitializeComponent();
        ApplyAnimationPreferences();
        ActualThemeChanged += OnActualThemeChanged;
        Unloaded += (_, _) => ActualThemeChanged -= OnActualThemeChanged;
    }

    private void OnActualThemeChanged(FrameworkElement sender, object args)
    {
        DispatcherQueue.TryEnqueue(RebuildAllBubbles);
    }

    protected override void OnNavigatedTo(NavigationEventArgs e)
    {
        base.OnNavigatedTo(e);
        if (e.Parameter is AlfredApiClient api)
            _api = api;

        UiPreferences.Instance.Changed += OnUiPreferencesChanged;
    }

    protected override void OnNavigatedFrom(NavigationEventArgs e)
    {
        base.OnNavigatedFrom(e);
        UiPreferences.Instance.Changed -= OnUiPreferencesChanged;
    }

    private void OnUiPreferencesChanged()
    {
        DispatcherQueue.TryEnqueue(RebuildAllBubbles);
        ApplyAnimationPreferences();
    }

    private void ApplyAnimationPreferences()
    {
        if (UiPreferences.Instance.Animations)
        {
            if (MessagesPanel.ChildrenTransitions.Count == 0)
                MessagesPanel.ChildrenTransitions.Add(new EntranceThemeTransition { FromVerticalOffset = 12 });
        }
        else
        {
            MessagesPanel.ChildrenTransitions.Clear();
        }
    }

    // ========================================================================
    // Active path helpers
    // ========================================================================

    private List<ChatTurn> GetActivePath()
    {
        var path = new List<ChatTurn>();
        var cur = _root;
        while (cur != null && cur.Variants.Count > 0)
        {
            path.Add(cur);
            cur = cur.Active.NextTurn;
        }
        return path;
    }

    private ChatTurn AppendNewTurn(TurnVariant initial)
    {
        var newTurn = new ChatTurn();
        newTurn.Variants.Add(initial);
        newTurn.ActiveIndex = 0;

        if (_root == null)
        {
            _root = newTurn;
        }
        else
        {
            var path = GetActivePath();
            path[^1].Active.NextTurn = newTurn;
        }
        return newTurn;
    }

    // ========================================================================
    // Envio inicial
    // ========================================================================

    private async void OnSendClick(object sender, RoutedEventArgs e)
    {
        await SendNewMessage();
    }

    private async void OnInputKeyDown(object sender, KeyRoutedEventArgs e)
    {
        if (e.Key != VirtualKey.Enter) return;

        // Shift+Enter inserta un salto de linea (AcceptsReturn=True lo maneja);
        // Enter solo envia.
        var shift = Microsoft.UI.Input.InputKeyboardSource
            .GetKeyStateForCurrentThread(VirtualKey.Shift);
        bool shiftDown = shift.HasFlag(Windows.UI.Core.CoreVirtualKeyStates.Down);

        if (shiftDown) return;   // dejar que el TextBox inserte la nueva linea

        e.Handled = true;
        if (!_isSending)
            await SendNewMessage();
    }

    private void OnInputTextChanged(object sender, TextChangedEventArgs e)
    {
        SendButton.IsEnabled = !string.IsNullOrWhiteSpace(InputBox.Text) || _attachedFiles.Count > 0;
        ChatContext.Draft = InputBox.Text ?? "";
    }

    // Recalcula si el usuario esta pegado al fondo cada vez que cambia la
    // vista (scroll manual o programatico).
    private void OnChatScrollViewChanged(object? sender, ScrollViewerViewChangedEventArgs e)
    {
        double distanceToBottom =
            ChatScroll.ScrollableHeight - ChatScroll.VerticalOffset;
        _stickToBottom = distanceToBottom <= AutoScrollThreshold;
        JumpToBottomButton.Visibility =
            _stickToBottom ? Visibility.Collapsed : Visibility.Visible;
    }

    private void OnJumpToBottom(object sender, RoutedEventArgs e)
    {
        _stickToBottom = true;
        JumpToBottomButton.Visibility = Visibility.Collapsed;
        ChatScroll.ChangeView(null, ChatScroll.ScrollableHeight, null);
    }

    // Desplaza al fondo solo si procede seguir (o si se fuerza, p.ej. al
    // enviar un mensaje nuevo).
    private void ScrollToBottomIfSticky(bool force = false)
    {
        if (force) _stickToBottom = true;
        if (_stickToBottom)
            ChatScroll.ChangeView(null, ChatScroll.ScrollableHeight, null);
    }

    private async Task SendNewMessage()
    {
        if (_api == null || _isSending) return;

        await FlushPendingVariantResyncAsync();

        string question = InputBox.Text.Trim();
        if (string.IsNullOrEmpty(question) && _attachedFiles.Count == 0) return;

        InputBox.Text = "";
        ChatContext.Draft = "";

        List<AttachedFileData>? attachments = null;
        List<string>? attachmentNames = null;
        if (_attachedFiles.Count > 0)
        {
            attachments = _attachedFiles.Select(f => new AttachedFileData
            {
                Name = f.Name,
                Content = f.Content
            }).ToList();
            attachmentNames = _attachedFiles.Select(f => f.Name).ToList();
            ClearAttachments();
        }

        var variant = new TurnVariant
        {
            UserText = question,
            AttachmentNames = attachmentNames,
            Attachments = attachments,
            Pending = true,
        };
        AppendNewTurn(variant);

        await EnsureConversationCreated();
        _stickToBottom = true;   // al enviar, siempre seguir al fondo
        RebuildAllBubbles();
        await GenerateForActiveVariantAsync(variant, attachments);
    }

    private async Task EnsureConversationCreated()
    {
        if (_conversationId != null || _api == null) return;
        try
        {
            var conv = await _api.CreateConversationAsync();
            if (conv != null)
            {
                _conversationId = conv.Id;
                ChatContext.ConversationId = _conversationId;
            }
        }
        catch
        {
            // Sin conversacion seguimos sin persistencia
        }
    }

    // Genera la respuesta del asistente para una variante "Pending". El backend
    // ya debe estar sincronizado con el path activo hasta el turno previo.
    private async Task GenerateForActiveVariantAsync(TurnVariant variant,
        List<AttachedFileData>? attachments)
    {
        if (_api == null) return;

        _isSending = true;
        SendButton.IsEnabled = false;
        SendButton.Visibility = Visibility.Collapsed;
        StopButton.Visibility = Visibility.Visible;
        StopButton.IsEnabled = true;
        WelcomePanel.Visibility = Visibility.Collapsed;

        LoadingIndicator.Visibility = Visibility.Visible;
        LoadingText.Text = (attachments != null && attachments.Count > 0)
            ? "Procesando archivos y generando respuesta…"
            : "Alfred está pensando…";
        StartLoadingTips();

        _streamCts = new CancellationTokenSource();
        _activeRequestId = 0;
        bool firstToken = true;
        var sb = new System.Text.StringBuilder();

        try
        {
            QueryResponse? response = await _api.SendQueryStreamingAsync(
                variant.UserText,
                _conversationId,
                attachments,
                onStarted: id =>
                {
                    DispatcherQueue.TryEnqueue(() => _activeRequestId = id);
                },
                onToken: tok =>
                {
                    DispatcherQueue.TryEnqueue(() =>
                    {
                        if (firstToken)
                        {
                            firstToken = false;
                            StopLoadingTips();
                            LoadingIndicator.Visibility = Visibility.Collapsed;
                            // Limpiar el placeholder "Generando respuesta..."
                            _liveBubble?.Text.Inlines.Clear();
                        }
                        sb.Append(tok);
                        if (_liveBubble != null)
                        {
                            // Append incremental O(1): agregar un Run por token en
                            // vez de re-materializar todo el string (era O(n^2)).
                            _liveBubble.Text.Inlines.Add(
                                new Microsoft.UI.Xaml.Documents.Run { Text = tok });
                            ScrollToBottomIfSticky();
                        }
                    });
                },
                cancellationToken: _streamCts.Token);

            string finalText = response?.Answer ?? sb.ToString();
            variant.AssistantText = finalText;
            variant.TimeMs = response?.TimeMs ?? 0;
            variant.FromCache = response?.FromCache ?? false;
            variant.Cancelled = response?.Cancelled ?? false;
            variant.Pending = false;

            RebuildAllBubbles();

            if (response?.Cancelled == true)
                ShowNotification(InfoBarSeverity.Informational, "Generación detenida.");
            else if (response == null && string.IsNullOrEmpty(finalText))
                ShowNotification(InfoBarSeverity.Error, "No se recibio respuesta del backend.");
        }
        catch (OperationCanceledException)
        {
            string partial = sb.ToString();
            variant.AssistantText = partial;
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

    private async void OnStopClick(object sender, RoutedEventArgs e)
    {
        if (!_isSending || _api == null) return;
        StopButton.IsEnabled = false;

        try { await _api.CancelQueryAsync(_activeRequestId); }
        catch { /* fallback: cancelacion local */ }

        _streamCts?.Cancel();
    }

    // ========================================================================
    // Edicion / Regeneracion / Variantes
    // ========================================================================

    private async void OnEditUserBubble(ChatTurn turn, TurnVariant variant)
    {
        if (_isSending || _api == null) return;

        await FlushPendingVariantResyncAsync();

        // Inline edit: dialog con TextBox prellenado
        var textBox = new TextBox
        {
            Text = variant.UserText,
            AcceptsReturn = true,
            TextWrapping = TextWrapping.Wrap,
            MinWidth = 480,
            MinHeight = 100
        };
        var dialog = new ContentDialog
        {
            Title = "Editar mensaje",
            Content = textBox,
            PrimaryButtonText = "Guardar y regenerar",
            CloseButtonText = "Cancelar",
            DefaultButton = ContentDialogButton.Primary,
            XamlRoot = this.XamlRoot
        };
        var result = await ShowDialogSerializedAsync(dialog);
        if (result != ContentDialogResult.Primary) return;

        string newText = (textBox.Text ?? "").Trim();
        if (string.IsNullOrEmpty(newText) || newText == variant.UserText) return;

        // Nueva variante: mismo turno, nuevo texto de usuario, sin asistente
        var newVariant = new TurnVariant
        {
            UserText = newText,
            AttachmentNames = variant.AttachmentNames,
            Attachments = variant.Attachments,
            Pending = true,
        };
        turn.Variants.Add(newVariant);
        turn.ActiveIndex = turn.Variants.Count - 1;

        RebuildAllBubbles();
        bool ok = await TryResyncBackendUpToTurnAsync(turn);
        if (!ok)
        {
            ShowNotification(InfoBarSeverity.Warning,
                "No se pudo resincronizar todo el contexto. Se intentara regenerar igualmente.");
        }
        await GenerateForActiveVariantAsync(newVariant, newVariant.Attachments);
    }

    private async void OnRegenerateAssistant(ChatTurn turn, TurnVariant variant)
    {
        if (_isSending || _api == null) return;

        await FlushPendingVariantResyncAsync();

        var newVariant = new TurnVariant
        {
            UserText = variant.UserText,
            AttachmentNames = variant.AttachmentNames,
            Attachments = variant.Attachments,
            Pending = true,
        };
        turn.Variants.Add(newVariant);
        turn.ActiveIndex = turn.Variants.Count - 1;

        RebuildAllBubbles();
        bool ok = await TryResyncBackendUpToTurnAsync(turn);
        if (!ok)
        {
            ShowNotification(InfoBarSeverity.Warning,
                "No se pudo resincronizar todo el contexto. Se intentara regenerar igualmente.");
        }
        await GenerateForActiveVariantAsync(newVariant, newVariant.Attachments);
    }

    private void OnSwitchVariant(ChatTurn turn, int delta)
    {
        if (_isSending) return;
        int newIdx = turn.ActiveIndex + delta;
        if (newIdx < 0 || newIdx >= turn.Variants.Count) return;
        turn.ActiveIndex = newIdx;

        // Si la variante seleccionada esta pendiente (raro, no deberia ocurrir),
        // no hacer nada mas; si tiene texto, resincronizar backend hasta DESPUES
        // de este turno (para que tokens/budget reflejen el path activo).
        var variant = turn.Active;
        if (variant.Pending)
        {
            RebuildAllBubbles();
            return;
        }

        RebuildAllBubbles();
        QueueVariantResync(turn);
    }

    private void QueueVariantResync(ChatTurn turn)
    {
        _pendingVariantResyncTurn = turn;

        if (_variantResyncTimer == null)
        {
            _variantResyncTimer = new DispatcherTimer
            {
                Interval = TimeSpan.FromMilliseconds(220)
            };
            _variantResyncTimer.Tick += async (_, _) =>
            {
                _variantResyncTimer?.Stop();
                var target = _pendingVariantResyncTurn;
                _pendingVariantResyncTurn = null;
                if (target == null || _isSending) return;

                bool ok = await ResyncBackendIncludingTurnAsync(target);
                if (!ok)
                {
                    ShowNotification(InfoBarSeverity.Warning,
                        "No se pudo resincronizar el contexto de la variante seleccionada.");
                }
            };
        }

        _variantResyncTimer.Stop();
        _variantResyncTimer.Start();
    }

    private async Task FlushPendingVariantResyncAsync()
    {
        if (_pendingVariantResyncTurn == null) return;

        _variantResyncTimer?.Stop();
        var target = _pendingVariantResyncTurn;
        _pendingVariantResyncTurn = null;
        if (target == null) return;

        bool ok = await TryResyncBackendIncludingTurnAsync(target);
        if (!ok)
        {
            ShowNotification(InfoBarSeverity.Warning,
                "No se pudo sincronizar el contexto previo antes de generar.");
        }
    }

    private async Task<bool> TryResyncBackendUpToTurnAsync(ChatTurn target)
    {
        if (await ResyncBackendUpToTurnAsync(target))
            return true;

        await EnsureConversationCreated();
        if (await ResyncBackendUpToTurnAsync(target))
            return true;

        return false;
    }

    private async Task<bool> TryResyncBackendIncludingTurnAsync(ChatTurn target)
    {
        if (await ResyncBackendIncludingTurnAsync(target))
            return true;

        await EnsureConversationCreated();
        if (await ResyncBackendIncludingTurnAsync(target))
            return true;

        return false;
    }

    // Limpia el backend y reinyecta los mensajes del path activo HASTA (sin
    // incluir) el turno indicado. Tras esto, el backend esta listo para que el
    // streaming endpoint agregue el user+assistant del turno objetivo.
    private async Task<bool> ResyncBackendUpToTurnAsync(ChatTurn target)
    {
        if (_api == null) return false;
        if (string.IsNullOrEmpty(_conversationId)) return true;

        var path = GetActivePath();
        if (!await _api.ClearConversationAsync(_conversationId))
            return false;

        foreach (var turn in path)
        {
            if (turn == target) break;
            var v = turn.Active;
            string userMessage = BuildUserMessageForResync(v);
            if (string.IsNullOrEmpty(userMessage)) continue;

            if (!await _api.AddMessageAsync(_conversationId, "user", userMessage))
                return false;

            if (!string.IsNullOrEmpty(v.AssistantText) && !v.IsError)
            {
                if (!await _api.AddMessageAsync(_conversationId, "assistant", v.AssistantText))
                    return false;
            }
        }

        return true;
    }

    // Reinyecta TODOS los mensajes del path activo (incluyendo el turno dado).
    // Usado al cambiar de variante sin regenerar.
    private async Task<bool> ResyncBackendIncludingTurnAsync(ChatTurn _)
    {
        if (_api == null) return false;
        if (string.IsNullOrEmpty(_conversationId)) return true;

        var path = GetActivePath();
        if (!await _api.ClearConversationAsync(_conversationId))
            return false;

        foreach (var turn in path)
        {
            var v = turn.Active;
            string userMessage = BuildUserMessageForResync(v);
            if (string.IsNullOrEmpty(userMessage)) continue;

            if (!await _api.AddMessageAsync(_conversationId, "user", userMessage))
                return false;

            if (!string.IsNullOrEmpty(v.AssistantText) && !v.IsError && !v.Pending)
            {
                if (!await _api.AddMessageAsync(_conversationId, "assistant", v.AssistantText))
                    return false;
            }
        }

        return true;
    }

    private static string BuildUserMessageForResync(TurnVariant variant)
    {
        bool hasText = !string.IsNullOrWhiteSpace(variant.UserText);
        bool hasAttachments = variant.Attachments is { Count: > 0 };

        if (!hasText && !hasAttachments)
            return "";

        string question = hasText ? variant.UserText.Trim() : "[Mensaje con adjuntos sin texto]";
        if (!hasAttachments)
            return question;

        var sb = new System.Text.StringBuilder();
        sb.AppendLine("Contexto de archivos adjuntos:");

        foreach (var file in variant.Attachments!)
        {
            string name = file.Name ?? "archivo";
            string content = file.Content ?? "";
            if (content.Length == 0)
                continue;

            bool isBase64 = content.StartsWith("data:", StringComparison.Ordinal)
                && content.Contains(";base64,", StringComparison.Ordinal);
            if (isBase64)
            {
                sb.AppendLine($"[Archivo adjunto: {name} (formato binario, contenido no procesable directamente)]");
                continue;
            }

            string trimmed = content.Length > 50000
                ? content.Substring(0, 50000) + "\n... (contenido truncado)"
                : content;

            sb.AppendLine($"--- Contenido de {name} ---");
            sb.AppendLine(trimmed);
            sb.AppendLine($"--- Fin de {name} ---");
        }

        sb.AppendLine();
        sb.Append("Pregunta del usuario: ");
        sb.Append(question);
        return sb.ToString();
    }

    // ========================================================================
    // Renderizado de burbujas
    // ========================================================================

    private void RebuildAllBubbles()
    {
        MessagesPanel.Children.Clear();
        _liveBubble = null;

        var path = GetActivePath();
        if (path.Count == 0)
        {
            WelcomePanel.Visibility = Visibility.Visible;
            return;
        }
        WelcomePanel.Visibility = Visibility.Collapsed;

        foreach (var turn in path)
        {
            var variant = turn.Active;

            // Burbuja de usuario
            var userBubble = CreateUserBubble(turn, variant);
            MessagesPanel.Children.Add(userBubble);

            // Burbuja de asistente (final, parcial o pendiente)
            var assistantBubble = CreateAssistantBubble(turn, variant);
            MessagesPanel.Children.Add(assistantBubble);
        }

        ChatScroll.UpdateLayout();
        ScrollToBottomIfSticky();

        // Re-aplicar busqueda si esta abierta
        if (SearchBar.Visibility == Visibility.Visible &&
            !string.IsNullOrEmpty(SearchBox.Text))
        {
            ApplySearch(SearchBox.Text);
        }
    }

    private FrameworkElement CreateUserBubble(ChatTurn turn, TurnVariant variant)
    {
        bool compact = UiPreferences.Instance.Density == UiDensity.Compact;
        double baseSize = UiPreferences.Instance.FontSize;
        Brush userText = ThemedBrushes.Get("AlfredUserBubbleText", Colors.White);
        Brush userBg   = ThemedBrushes.Get("UserBubble", Windows.UI.Color.FromArgb(255, 99, 102, 241));
        Brush dimText  = ThemedBrushes.Get("AlfredTextSecondary", Colors.LightGray);

        var stack = new StackPanel { Spacing = compact ? 2 : 4 };

        string displayText = string.IsNullOrEmpty(variant.UserText) && variant.AttachmentNames != null
            ? "[Archivos adjuntos]"
            : variant.UserText;

        stack.Children.Add(new TextBlock
        {
            Text = displayText,
            TextWrapping = TextWrapping.Wrap,
            FontSize = baseSize,
            Foreground = userText,
            IsTextSelectionEnabled = true,
        });

        if (variant.AttachmentNames is { Count: > 0 })
            stack.Children.Add(BuildAttachmentLine(variant.AttachmentNames, dimText));

        var border = new Border
        {
            Background = userBg,
            CornerRadius = new CornerRadius(16, 16, 4, 16),
            Padding = compact ? new Thickness(12, 7, 12, 7) : new Thickness(16, 10, 16, 10),
            MaxWidth = 600,
            HorizontalAlignment = HorizontalAlignment.Right,
            Child = stack,
        };

        var toolbar = BuildBubbleToolbar(turn, variant, isUser: true,
            HorizontalAlignment.Right);

        var wrapper = new StackPanel
        {
            HorizontalAlignment = HorizontalAlignment.Right,
            Spacing = 2,
        };
        wrapper.Children.Add(border);
        if (toolbar != null) wrapper.Children.Add(toolbar);
        return wrapper;
    }

    private FrameworkElement CreateAssistantBubble(ChatTurn turn, TurnVariant variant)
    {
        bool compact = UiPreferences.Instance.Density == UiDensity.Compact;
        double baseSize = UiPreferences.Instance.FontSize;
        Brush assistantBg = ThemedBrushes.Get("AssistantBubbleBrush", Windows.UI.Color.FromArgb(255, 31, 41, 55));
        Brush errorBg     = ThemedBrushes.Get("AlfredError", Windows.UI.Color.FromArgb(255, 239, 68, 68));
        Brush dimText     = ThemedBrushes.Get("AlfredTextSecondary", Colors.LightGray);
        Brush textBrush   = ThemedBrushes.Get("AlfredTextPrimary", Windows.UI.Color.FromArgb(255, 230, 232, 238));
        Brush reasoningBg = ThemedBrushes.Get("AlfredReasoningBg", Windows.UI.Color.FromArgb(40, 255, 255, 255));

        var stack = new StackPanel { Spacing = compact ? 2 : 4 };

        if (variant.Pending)
        {
            // Burbuja viva: TextBlock plano que se va llenando con tokens
            var live = new TextBlock
            {
                Text = "Generando respuesta...",
                TextWrapping = TextWrapping.Wrap,
                FontSize = baseSize,
                Foreground = textBrush,
                IsTextSelectionEnabled = false,
            };
            stack.Children.Add(live);
            _liveBubble = new LiveAssistantBubble { Text = live };
        }
        else
        {
            string text = variant.AssistantText ?? "";
            string mainText = text;
            string? reasoningText = null;
            if (!variant.IsError)
            {
                var cleaned = ChatMessageCleaner.Clean(text);
                mainText = cleaned.Text;
                reasoningText = cleaned.Reasoning;
            }
            if (variant.Cancelled && !string.IsNullOrEmpty(mainText))
                mainText += "\n\n_(generación detenida)_";

            if (variant.IsError)
            {
                stack.Children.Add(new TextBlock
                {
                    Text = mainText,
                    TextWrapping = TextWrapping.Wrap,
                    FontSize = baseSize,
                    Foreground = new SolidColorBrush(Colors.White),
                    IsTextSelectionEnabled = true,
                });
            }
            else
            {
                var mdPanel = new StackPanel { Spacing = compact ? 4 : 6 };
                foreach (var element in MarkdownRenderer.Render(mainText))
                    mdPanel.Children.Add(element);
                stack.Children.Add(mdPanel);
            }

            if (reasoningText != null)
            {
                stack.Children.Add(new Expander
                {
                    Header = new TextBlock
                    {
                        Text = "Análisis interno",
                        FontSize = 11,
                        Foreground = dimText,
                    },
                    Content = new TextBlock
                    {
                        Text = reasoningText,
                        TextWrapping = TextWrapping.Wrap,
                        FontSize = Math.Max(11, baseSize - 2),
                        Foreground = dimText,
                        IsTextSelectionEnabled = true,
                    },
                    Margin = new Thickness(0, 6, 0, 0),
                    HorizontalContentAlignment = HorizontalAlignment.Stretch,
                    HorizontalAlignment = HorizontalAlignment.Stretch,
                    Background = reasoningBg,
                });
            }

            if (variant.TimeMs > 0)
            {
                string meta = variant.TimeMs >= 1000 ? $"{variant.TimeMs / 1000.0:F1}s" : $"{variant.TimeMs:F0}ms";
                if (variant.FromCache)
                    meta += " · cache";
                else if (variant.TimeMs > 200)
                {
                    int approxTokens = Math.Max(1, mainText.Length / 4);
                    double tps = approxTokens / (variant.TimeMs / 1000.0);
                    meta += $" · ~{tps:F1} tok/s";
                }
                stack.Children.Add(new TextBlock
                {
                    Text = meta,
                    FontSize = 10,
                    Foreground = dimText,
                    HorizontalAlignment = HorizontalAlignment.Right,
                });
            }
        }

        var border = new Border
        {
            Background = variant.IsError ? errorBg : assistantBg,
            CornerRadius = new CornerRadius(4, 16, 16, 16),
            Padding = compact ? new Thickness(12, 7, 12, 7) : new Thickness(16, 10, 16, 10),
            MaxWidth = 600,
            HorizontalAlignment = HorizontalAlignment.Left,
            Child = stack,
        };

        var toolbar = BuildBubbleToolbar(turn, variant, isUser: false,
            HorizontalAlignment.Left);

        var wrapper = new StackPanel
        {
            HorizontalAlignment = HorizontalAlignment.Left,
            Spacing = 2,
        };
        wrapper.Children.Add(border);
        if (toolbar != null) wrapper.Children.Add(toolbar);
        return wrapper;
    }

    // Toolbar bajo cada burbuja: variant nav + accion principal (editar/regenerar).
    private FrameworkElement? BuildBubbleToolbar(ChatTurn turn, TurnVariant variant,
        bool isUser, HorizontalAlignment align)
    {
        // Para asistente pendiente no mostramos toolbar
        if (!isUser && variant.Pending) return null;
        // Para usuario sin texto (solo adjuntos) tampoco editamos
        if (isUser && string.IsNullOrEmpty(variant.UserText)) return null;

        Brush dim = ThemedBrushes.Get("AlfredTextSecondary", Colors.LightGray);
        var panel = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            Spacing = 2,
            HorizontalAlignment = align,
            Margin = new Thickness(4, 0, 4, 0),
            Opacity = 0.65,
        };

        // Variant navigation: solo si hay mas de una variante
        if (turn.Variants.Count > 1)
        {
            var prev = MakeIconButton("", "Variante anterior",
                () => OnSwitchVariant(turn, -1));
            prev.IsEnabled = turn.ActiveIndex > 0;
            panel.Children.Add(prev);

            panel.Children.Add(new TextBlock
            {
                Text = $"{turn.ActiveIndex + 1}/{turn.Variants.Count}",
                FontSize = 10,
                Foreground = dim,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(2, 0, 2, 0),
            });

            var next = MakeIconButton("", "Variante siguiente",
                () => OnSwitchVariant(turn, +1));
            next.IsEnabled = turn.ActiveIndex < turn.Variants.Count - 1;
            panel.Children.Add(next);
        }

        if (isUser)
        {
            // Editar
            panel.Children.Add(MakeIconButton("", "Editar mensaje",
                () => OnEditUserBubble(turn, variant)));
        }
        else
        {
            // Regenerar
            panel.Children.Add(MakeIconButton("", "Regenerar respuesta",
                () => OnRegenerateAssistant(turn, variant)));
            // Copiar
            panel.Children.Add(MakeIconButton("", "Copiar al portapapeles",
                () => CopyToClipboard(variant.AssistantText ?? "")));
        }

        return panel;
    }

    private static Button MakeIconButton(string glyph, string tooltip, Action onClick)
    {
        var btn = new Button
        {
            Padding = new Thickness(4, 2, 4, 2),
            Background = new SolidColorBrush(Colors.Transparent),
            BorderThickness = new Thickness(0),
            Content = new FontIcon { Glyph = glyph, FontSize = 12 },
        };
        ToolTipService.SetToolTip(btn, tooltip);
        Microsoft.UI.Xaml.Automation.AutomationProperties.SetName(btn, tooltip);
        btn.Click += (_, _) => onClick();
        return btn;
    }

    private void CopyToClipboard(string text)
    {
        if (string.IsNullOrEmpty(text)) return;
        var dp = new DataPackage();
        dp.SetText(text);
        Clipboard.SetContent(dp);
        ShowNotification(InfoBarSeverity.Success, "Copiado al portapapeles.");
    }

    private static FrameworkElement BuildAttachmentLine(List<string> names, Brush dim)
    {
        var p = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            Spacing = 6,
            Margin = new Thickness(0, 4, 0, 0),
        };
        p.Children.Add(new FontIcon { Glyph = "", FontSize = 12, Foreground = dim });
        p.Children.Add(new TextBlock
        {
            Text = string.Join(", ", names),
            FontSize = 11,
            FontStyle = Windows.UI.Text.FontStyle.Italic,
            Foreground = dim,
            TextTrimming = TextTrimming.CharacterEllipsis,
            MaxWidth = 400,
        });
        return p;
    }

    // ========================================================================
    // Loading tips
    // ========================================================================

    private void StartLoadingTips()
    {
        _loadingStarted = DateTime.UtcNow;
        _loadingTipIndex = 0;
        LoadingHint.Text = LoadingTips[0];

        _loadingTipsTimer?.Stop();
        _loadingTipsTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(2200) };
        _loadingTipsTimer.Tick += (_, _) =>
        {
            _loadingTipIndex = (_loadingTipIndex + 1) % LoadingTips.Length;
            var elapsed = DateTime.UtcNow - _loadingStarted;
            LoadingHint.Text = $"{LoadingTips[_loadingTipIndex]}  ·  {elapsed.TotalSeconds:F0}s";
        };
        _loadingTipsTimer.Start();
    }

    private void StopLoadingTips()
    {
        _loadingTipsTimer?.Stop();
        _loadingTipsTimer = null;
        LoadingHint.Text = "";
    }

    // ========================================================================
    // Busqueda local (Ctrl+F)
    // ========================================================================

    private void OnFindAccelerator(KeyboardAccelerator sender, KeyboardAcceleratorInvokedEventArgs args)
    {
        args.Handled = true;
        OpenSearchBar();
    }

    private void OnEscapeAccelerator(KeyboardAccelerator sender, KeyboardAcceleratorInvokedEventArgs args)
    {
        if (SearchBar.Visibility == Visibility.Visible)
        {
            args.Handled = true;
            CloseSearchBar();
        }
        else if (_isSending)
        {
            // Esc tambien cancela una generacion en curso.
            args.Handled = true;
            OnStopClick(this, new RoutedEventArgs());
        }
    }

    // Construye y muestra el flyout de prompts rapidos desde las preferencias.
    private void OnQuickPromptsOpening(object sender, RoutedEventArgs e)
    {
        var flyout = new MenuFlyout();
        foreach (var prompt in Prefs.QuickPrompts)
        {
            var item = new MenuFlyoutItem { Text = prompt };
            string captured = prompt;
            item.Click += (_, _) =>
            {
                InputBox.Text = captured;
                InputBox.Focus(FocusState.Programmatic);
                InputBox.SelectionStart = InputBox.Text.Length;
            };
            flyout.Items.Add(item);
        }

        if (flyout.Items.Count == 0)
        {
            flyout.Items.Add(new MenuFlyoutItem
            {
                Text = "Sin prompts (configuralos en Ajustes)",
                IsEnabled = false,
            });
        }

        flyout.ShowAt(QuickPromptButton);
    }

    private void OnFocusInputAccelerator(KeyboardAccelerator sender, KeyboardAcceleratorInvokedEventArgs args)
    {
        args.Handled = true;
        InputBox.Focus(FocusState.Programmatic);
        InputBox.SelectAll();
    }

    private void OnNewConversationAccelerator(KeyboardAccelerator sender, KeyboardAcceleratorInvokedEventArgs args)
    {
        args.Handled = true;
        StartNewConversation();
    }

    // Reinicia el estado a una conversacion nueva (sin persistir todavia:
    // la conversacion se crea al enviar el primer mensaje).
    private void StartNewConversation()
    {
        if (_isSending) return;
        _conversationId = null;
        ChatContext.ConversationId = null;
        _root = null;
        MessagesPanel.Children.Clear();
        WelcomePanel.Visibility = Visibility.Visible;
        InputBox.Text = "";
        InputBox.Focus(FocusState.Programmatic);
    }

    private void OpenSearchBar()
    {
        SearchBar.Visibility = Visibility.Visible;
        SearchBox.Focus(FocusState.Programmatic);
        SearchBox.SelectAll();
        if (!string.IsNullOrEmpty(SearchBox.Text))
            ApplySearch(SearchBox.Text);
    }

    private void CloseSearchBar()
    {
        SearchBar.Visibility = Visibility.Collapsed;
        ClearSearchHighlights();
        _searchHits.Clear();
        _searchHitIndex = -1;
        SearchCount.Text = "";
    }

    private void OnSearchClose(object sender, RoutedEventArgs e) => CloseSearchBar();

    private void OnSearchTextChanged(object sender, TextChangedEventArgs e)
    {
        ApplySearch(SearchBox.Text);
    }

    private void OnSearchKeyDown(object sender, KeyRoutedEventArgs e)
    {
        if (e.Key == VirtualKey.Enter)
        {
            e.Handled = true;
            bool shift = (Microsoft.UI.Input.InputKeyboardSource.GetKeyStateForCurrentThread(VirtualKey.Shift)
                & Windows.UI.Core.CoreVirtualKeyStates.Down) == Windows.UI.Core.CoreVirtualKeyStates.Down;
            if (shift) GoToSearchHit(-1); else GoToSearchHit(+1);
        }
        else if (e.Key == VirtualKey.Escape)
        {
            e.Handled = true;
            CloseSearchBar();
        }
    }

    private void OnSearchPrev(object sender, RoutedEventArgs e) => GoToSearchHit(-1);
    private void OnSearchNext(object sender, RoutedEventArgs e) => GoToSearchHit(+1);

    // Implementacion no-destructiva: identificamos los TextBlocks cuyo texto
    // (plano o agregado de inlines) contiene el query, y los marcamos con un
    // Border decorado al hacer navegacion. No alteramos los Inlines del
    // TextBlock para no romper el formato Markdown ya renderizado.
    private void ApplySearch(string query)
    {
        ClearSearchHighlights();
        _searchHits.Clear();
        _searchHitIndex = -1;

        if (string.IsNullOrEmpty(query))
        {
            SearchCount.Text = "";
            return;
        }

        foreach (var child in MessagesPanel.Children)
            FindMatches(child, query);

        if (_searchHits.Count == 0)
        {
            SearchCount.Text = "0";
            return;
        }

        _searchHitIndex = 0;
        SearchCount.Text = $"1/{_searchHits.Count}";
        FocusHit(_searchHits[0]);
    }

    private void FindMatches(DependencyObject root, string query)
    {
        if (root is TextBlock tb)
        {
            string plain = GetPlainText(tb);
            if (!string.IsNullOrEmpty(plain) &&
                plain.IndexOf(query, StringComparison.OrdinalIgnoreCase) >= 0)
            {
                _searchHits.Add(new SearchHit { TextBlock = tb });
            }
            return;
        }

        int count = Microsoft.UI.Xaml.Media.VisualTreeHelper.GetChildrenCount(root);
        for (int i = 0; i < count; i++)
        {
            var child = Microsoft.UI.Xaml.Media.VisualTreeHelper.GetChild(root, i);
            FindMatches(child, query);
        }
    }

    private static string GetPlainText(TextBlock tb)
    {
        if (!string.IsNullOrEmpty(tb.Text)) return tb.Text;
        var sb = new System.Text.StringBuilder();
        foreach (var inl in tb.Inlines)
            AppendInlineText(inl, sb);
        return sb.ToString();
    }

    private static void AppendInlineText(Inline inl, System.Text.StringBuilder sb)
    {
        switch (inl)
        {
            case Run r: sb.Append(r.Text); break;
            case Span sp:
                foreach (var c in sp.Inlines) AppendInlineText(c, sb);
                break;
            case LineBreak: sb.Append('\n'); break;
        }
    }

    private void ClearSearchHighlights()
    {
        // Quitar el efecto visual del hit actual (si existe). Como no
        // modificamos inlines, no hay nada destructivo que restaurar.
        foreach (var hit in _searchHits)
        {
            if (hit.TextBlock?.FontWeight.Weight == Microsoft.UI.Text.FontWeights.Bold.Weight
                && hit.OriginalWeightSet)
            {
                hit.TextBlock.FontWeight = hit.OriginalWeight;
            }
        }
    }

    private void GoToSearchHit(int delta)
    {
        if (_searchHits.Count == 0) return;

        // Restaurar peso del hit actual antes de mover
        if (_searchHitIndex >= 0 && _searchHitIndex < _searchHits.Count)
        {
            var prev = _searchHits[_searchHitIndex];
            if (prev.OriginalWeightSet)
                prev.TextBlock.FontWeight = prev.OriginalWeight;
        }

        _searchHitIndex = (_searchHitIndex + delta + _searchHits.Count) % _searchHits.Count;
        SearchCount.Text = $"{_searchHitIndex + 1}/{_searchHits.Count}";
        FocusHit(_searchHits[_searchHitIndex]);
    }

    private void FocusHit(SearchHit hit)
    {
        try
        {
            // Marcar visualmente el hit actual con peso Bold (capturamos el
            // peso original para restaurarlo despues)
            if (!hit.OriginalWeightSet)
            {
                hit.OriginalWeight = hit.TextBlock.FontWeight;
                hit.OriginalWeightSet = true;
            }
            hit.TextBlock.FontWeight = Microsoft.UI.Text.FontWeights.Bold;

            hit.TextBlock.StartBringIntoView(new BringIntoViewOptions
            {
                AnimationDesired = true,
                VerticalAlignmentRatio = 0.3,
            });
        }
        catch { }
    }

    // ========================================================================
    // Adjuntos
    // ========================================================================

    private async void OnAttachFile(object sender, RoutedEventArgs e)
    {
        if (_attachedFiles.Count >= MaxAttachedFiles)
        {
            ShowNotification(InfoBarSeverity.Warning, $"Maximo {MaxAttachedFiles} archivos permitidos.");
            return;
        }

        var picker = new FileOpenPicker();
        picker.SuggestedStartLocation = PickerLocationId.DocumentsLibrary;
        foreach (var ext in AllowedExtensions)
            picker.FileTypeFilter.Add(ext);

        var hwnd = WinRT.Interop.WindowNative.GetWindowHandle(App.CurrentWindow);
        WinRT.Interop.InitializeWithWindow.Initialize(picker, hwnd);

        var files = await picker.PickMultipleFilesAsync();
        if (files == null || files.Count == 0) return;

        foreach (var file in files)
        {
            if (_attachedFiles.Count >= MaxAttachedFiles)
            {
                ShowNotification(InfoBarSeverity.Warning,
                    $"Maximo {MaxAttachedFiles} archivos. Algunos no se adjuntaron.");
                break;
            }

            if (_attachedFiles.Any(f => f.Name == file.Name))
            {
                ShowNotification(InfoBarSeverity.Warning, $"\"{file.Name}\" ya esta adjunto.");
                continue;
            }

            await AddAttachedFileAsync(file);
        }
    }

    // Cap de tamano por archivo: evita cargar en memoria un .txt/.log enorme.
    private const long MaxAttachedFileBytes = 25 * 1024 * 1024;   // 25 MB

    private async Task AddAttachedFileAsync(StorageFile file)
    {
        try
        {
            var props = await file.GetBasicPropertiesAsync();
            if ((long)props.Size > MaxAttachedFileBytes)
            {
                ShowNotification(InfoBarSeverity.Warning,
                    $"\"{file.Name}\" supera el limite de {MaxAttachedFileBytes / (1024 * 1024)} MB y no se adjunto.");
                return;
            }

            string content;
            bool isPdf = file.Name.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase);
            bool isBinary = BinaryExtensions.Any(ext =>
                file.Name.EndsWith(ext, StringComparison.OrdinalIgnoreCase));

            if (isPdf && _api != null)
            {
                var buffer = await FileIO.ReadBufferAsync(file);
                byte[] bytes = new byte[buffer.Length];
                using var reader = Windows.Storage.Streams.DataReader.FromBuffer(buffer);
                reader.ReadBytes(bytes);

                var extracted = await _api.ExtractPdfAsync(file.Name, bytes);
                if (extracted == null || string.IsNullOrWhiteSpace(extracted.Text))
                {
                    ShowNotification(InfoBarSeverity.Error,
                        $"No se pudo extraer texto de \"{file.Name}\". El PDF podria estar protegido o contener solo imagenes.");
                    return;
                }
                content = extracted.Text;
            }
            else if (isBinary)
            {
                var buffer = await FileIO.ReadBufferAsync(file);
                byte[] bytes = new byte[buffer.Length];
                using var reader = Windows.Storage.Streams.DataReader.FromBuffer(buffer);
                reader.ReadBytes(bytes);
                content = $"data:{file.ContentType};base64,{Convert.ToBase64String(bytes)}";
            }
            else
            {
                content = await FileIO.ReadTextAsync(file);
            }

            _attachedFiles.Add(new AttachedFileInfo
            {
                Name = file.Name,
                SizeBytes = (long)props.Size,
                Content = content
            });

            UpdateAttachmentPanel();
            SendButton.IsEnabled = true;

            string sizeStr = FormatFileSize((long)basicProps.Size);
            ShowNotification(InfoBarSeverity.Success, $"Adjunto: {file.Name} ({sizeStr})");
        }
        catch (Exception ex)
        {
            ShowNotification(InfoBarSeverity.Error, $"Error leyendo {file.Name}: {ex.Message}");
        }
    }

    private void UpdateAttachmentPanel()
    {
        if (AttachmentList.ItemsSource is List<UIElement> oldChips)
        {
            foreach (var elem in oldChips)
                if (elem is Border { Child: StackPanel sp })
                    foreach (var btn in sp.Children.OfType<Button>())
                        btn.Click -= OnRemoveSingleAttachment;
        }
        AttachmentList.ItemsSource = null;

        if (_attachedFiles.Count == 0)
        {
            AttachmentPanel.Visibility = Visibility.Collapsed;
            return;
        }

        AttachmentPanel.Visibility = Visibility.Visible;

        Brush chipBg   = ThemedBrushes.Get("AlfredChipBg",      Windows.UI.Color.FromArgb(48, 99, 102, 241));
        Brush chipName = ThemedBrushes.Get("AlfredTextPrimary", Windows.UI.Color.FromArgb(255, 230, 232, 238));
        Brush chipSize = ThemedBrushes.Get("AlfredChipDimText", Windows.UI.Color.FromArgb(180, 255, 255, 255));

        var chips = _attachedFiles.Select((f, i) =>
        {
            var chip = new Border
            {
                Background = chipBg,
                CornerRadius = new CornerRadius(4),
                Padding = new Thickness(8, 4, 8, 4)
            };

            var panel = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 6 };
            panel.Children.Add(new TextBlock
            {
                Text = f.Name,
                FontSize = 12,
                Foreground = chipName,
                VerticalAlignment = VerticalAlignment.Center,
                MaxWidth = 150,
                TextTrimming = TextTrimming.CharacterEllipsis
            });
            panel.Children.Add(new TextBlock
            {
                Text = FormatFileSize(f.SizeBytes),
                FontSize = 10,
                Foreground = chipSize,
                VerticalAlignment = VerticalAlignment.Center
            });

            var removeBtn = new Button
            {
                Content = new FontIcon { Glyph = "", FontSize = 10 },
                Padding = new Thickness(2),
                Tag = i
            };
            removeBtn.Click += OnRemoveSingleAttachment;
            panel.Children.Add(removeBtn);

            chip.Child = panel;
            return (UIElement)chip;
        }).ToList();

        AttachmentList.ItemsSource = chips;
    }

    private void OnRemoveSingleAttachment(object sender, RoutedEventArgs e)
    {
        if (sender is Button btn && btn.Tag is int index && index < _attachedFiles.Count)
        {
            _attachedFiles.RemoveAt(index);
            UpdateAttachmentPanel();
            SendButton.IsEnabled = !string.IsNullOrWhiteSpace(InputBox.Text) || _attachedFiles.Count > 0;
        }
    }

    private void OnRemoveAllAttachments(object sender, RoutedEventArgs e) => ClearAttachments();

    private void ClearAttachments()
    {
        _attachedFiles.Clear();
        UpdateAttachmentPanel();
    }

    // ========================================================================
    // Drag & Drop
    // ========================================================================

    private void OnDragOver(object sender, DragEventArgs e)
    {
        if (e.DataView.Contains(StandardDataFormats.StorageItems))
        {
            e.AcceptedOperation = DataPackageOperation.Copy;
            e.DragUIOverride.Caption = "Adjuntar archivo";
        }
    }

    private async void OnDrop(object sender, DragEventArgs e)
    {
        if (!e.DataView.Contains(StandardDataFormats.StorageItems)) return;

        var items = await e.DataView.GetStorageItemsAsync();
        foreach (var item in items)
        {
            if (item is StorageFile file)
            {
                string ext = System.IO.Path.GetExtension(file.Name).ToLowerInvariant();
                if (!AllowedExtensions.Contains(ext))
                {
                    ShowNotification(InfoBarSeverity.Warning,
                        $"Formato no soportado: {ext}. Usa: {string.Join(", ", AllowedExtensions)}");
                    continue;
                }

                if (_attachedFiles.Count >= MaxAttachedFiles)
                {
                    ShowNotification(InfoBarSeverity.Warning,
                        $"Maximo {MaxAttachedFiles} archivos.");
                    break;
                }

                await AddAttachedFileAsync(file);
            }
        }
    }

    // ========================================================================
    // Cargar conversacion existente
    // ========================================================================

    public async Task LoadConversationAsync(string conversationId)
    {
        if (_api == null) return;

        _conversationId = conversationId;
        ChatContext.ConversationId = conversationId;
        _root = null;
        MessagesPanel.Children.Clear();
        WelcomePanel.Visibility = Visibility.Collapsed;

        var detail = await _api.GetConversationAsync(conversationId);
        if (detail == null) return;

        // Reconstruir turnos a partir del historial plano (alternancia user/assistant).
        ChatTurn? lastTurn = null;
        foreach (var msg in detail.Messages)
        {
            if (msg.Role == "user")
            {
                var v = new TurnVariant
                {
                    UserText = msg.Content,
                    Pending = false,
                };
                var turn = new ChatTurn();
                turn.Variants.Add(v);
                turn.ActiveIndex = 0;

                if (_root == null) _root = turn;
                else if (lastTurn != null) lastTurn.Active.NextTurn = turn;
                lastTurn = turn;
            }
            else if (msg.Role == "assistant" && lastTurn != null)
            {
                lastTurn.Active.AssistantText = msg.Content;
                lastTurn.Active.Pending = false;
            }
        }

        RebuildAllBubbles();
    }

    // ========================================================================
    // Notificaciones
    // ========================================================================

    private void ShowNotification(InfoBarSeverity severity, string message)
    {
        NotificationBar.Severity = severity;
        NotificationBar.Message = message;
        NotificationBar.IsOpen = true;

        // Reutilizar un unico timer en vez de crear uno por notificacion
        // (evita DispatcherTimer huerfanos que nunca se disponen).
        _notificationTimer ??= new DispatcherTimer { Interval = TimeSpan.FromSeconds(4) };
        _notificationTimer.Stop();
        _notificationTimer.Tick -= OnNotificationTimerTick;
        _notificationTimer.Tick += OnNotificationTimerTick;
        _notificationTimer.Start();
    }

    private void OnNotificationTimerTick(object? sender, object e)
    {
        NotificationBar.IsOpen = false;
        _notificationTimer?.Stop();
    }

    private static string FormatFileSize(long bytes)
    {
        if (bytes < 1024) return $"{bytes} B";
        if (bytes < 1024 * 1024) return $"{bytes / 1024.0:F1} KB";
        if (bytes < 1024 * 1024 * 1024) return $"{bytes / (1024.0 * 1024.0):F1} MB";
        return $"{bytes / (1024.0 * 1024.0 * 1024.0):F2} GB";
    }

    // ========================================================================
    // Tipos internos
    // ========================================================================

    private sealed class ChatTurn
    {
        public List<TurnVariant> Variants { get; } = new();
        public int ActiveIndex { get; set; }
        public TurnVariant Active => Variants[ActiveIndex];
    }

    private sealed class TurnVariant
    {
        public string UserText { get; set; } = "";
        public List<string>? AttachmentNames { get; set; }
        public List<AttachedFileData>? Attachments { get; set; }
        public string AssistantText { get; set; } = "";
        public double TimeMs { get; set; }
        public bool FromCache { get; set; }
        public bool Cancelled { get; set; }
        public bool Pending { get; set; }
        public bool IsError { get; set; }
        public ChatTurn? NextTurn { get; set; }
    }

    private sealed class LiveAssistantBubble
    {
        public TextBlock Text { get; init; } = null!;
    }

    private sealed class AttachedFileInfo
    {
        public string Name { get; init; } = "";
        public long SizeBytes { get; init; }
        public string Content { get; init; } = "";
    }

    private sealed class SearchHit
    {
        public TextBlock TextBlock { get; init; } = null!;
        public Windows.UI.Text.FontWeight OriginalWeight { get; set; }
        public bool OriginalWeightSet { get; set; }
    }
}
