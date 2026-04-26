using System.Collections.ObjectModel;
using Alfred.UI.Models;
using Alfred.UI.Services;
using Microsoft.UI;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
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

    // Streaming en curso: token de cancelacion (usuario aborta) y request_id
    // asignado por el backend (necesario para cancelar inferencia activa).
    private CancellationTokenSource? _streamCts;
    private long _activeRequestId;

    // Archivos adjuntos (maximo 5)
    private const int MaxAttachedFiles = 5;
    private readonly List<AttachedFileInfo> _attachedFiles = [];

    // Extensiones binarias que requieren base64
    private static readonly string[] BinaryExtensions = [".pdf", ".docx", ".xlsx", ".pptx"];
    private static readonly string[] AllowedExtensions =
        [".txt", ".pdf", ".docx", ".xlsx", ".pptx", ".md", ".json", ".xml", ".csv", ".html", ".htm", ".log", ".yaml", ".yml", ".toml", ".ini", ".cfg", ".conf"];

    public ObservableCollection<string> Messages { get; } = [];
    private readonly List<ChatBubble> _bubbles = [];

    // Tips rotativos mientras Alfred genera la respuesta. Se eligen
    // tomando rotaciones cortas para que el usuario sepa que sigue trabajando.
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

    /// <summary>Accesor para que XAML pueda hacer x:Bind a las preferencias.</summary>
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
        // Cuando el tema efectivo cambia (ya sea por cambio del usuario o del sistema),
        // los brushes capturados en burbujas previas quedaron del tema anterior. Las
        // reconstruimos para que adopten los nuevos colores.
        DispatcherQueue.TryEnqueue(RebuildAllBubbles);
    }

    protected override void OnNavigatedTo(NavigationEventArgs e)
    {
        base.OnNavigatedTo(e);
        if (e.Parameter is AlfredApiClient api)
            _api = api;

        // Suscripción aquí (no en el ctor) para que sobreviva a los Unloaded
        // de las navegaciones cuando la página está cacheada.
        UiPreferences.Instance.Changed += OnUiPreferencesChanged;
    }

    protected override void OnNavigatedFrom(NavigationEventArgs e)
    {
        base.OnNavigatedFrom(e);
        UiPreferences.Instance.Changed -= OnUiPreferencesChanged;
    }

    private void OnUiPreferencesChanged()
    {
        // Repinta burbujas usando los nuevos brushes / fontSize / densidad.
        DispatcherQueue.TryEnqueue(RebuildAllBubbles);
        ApplyAnimationPreferences();
    }

    private void RebuildAllBubbles()
    {
        MessagesPanel.Children.Clear();
        foreach (var b in _bubbles)
        {
            if (b.Role == "__live__") continue;   // burbuja en streaming, se reconstruye sola
            MessagesPanel.Children.Add(
                CreateBubbleElement(b.Text, b.Role, b.TimeMs, b.FromCache, b.AttachmentNames));
        }
    }

    private void ApplyAnimationPreferences()
    {
        // Activa o desactiva la transicion de entrada para nuevas burbujas.
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
    // Envio de mensajes
    // ========================================================================

    private async void OnSendClick(object sender, RoutedEventArgs e)
    {
        await SendMessage();
    }

    private async void OnInputKeyDown(object sender, KeyRoutedEventArgs e)
    {
        if (e.Key == VirtualKey.Enter && !_isSending)
        {
            e.Handled = true;
            await SendMessage();
        }
    }

    private void OnInputTextChanged(object sender, TextChangedEventArgs e)
    {
        SendButton.IsEnabled = !string.IsNullOrWhiteSpace(InputBox.Text) || _attachedFiles.Count > 0;
        ChatContext.Draft = InputBox.Text ?? "";
    }

    private async Task SendMessage()
    {
        if (_api == null || _isSending) return;

        string question = InputBox.Text.Trim();
        if (string.IsNullOrEmpty(question) && _attachedFiles.Count == 0) return;

        _isSending = true;
        InputBox.Text = "";
        ChatContext.Draft = "";
        SendButton.IsEnabled = false;
        SendButton.Visibility = Visibility.Collapsed;
        StopButton.Visibility = Visibility.Visible;
        StopButton.IsEnabled = true;
        WelcomePanel.Visibility = Visibility.Collapsed;

        // Preparar adjuntos antes de limpiarlos
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

        // Agregar burbuja del usuario con indicadores de adjuntos
        string displayQuestion = question;
        if (string.IsNullOrEmpty(displayQuestion) && attachmentNames != null)
        {
            displayQuestion = "[Archivos adjuntos]";
        }
        AddBubble(displayQuestion, "user", attachmentNames: attachmentNames);

        // Mostrar indicador de carga con tips rotativos hasta que llegue el primer token
        LoadingIndicator.Visibility = Visibility.Visible;
        LoadingText.Text = attachments != null
            ? "Procesando archivos y generando respuesta…"
            : "Alfred está pensando…";
        StartLoadingTips();

        // Crear conversacion si todavia no existe para que el streaming use
        // el endpoint con contexto y el backend persista los mensajes.
        if (_conversationId == null)
        {
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
                // Sin conversacion seguimos con /query/stream (sin persistencia)
            }
        }

        // Burbuja viva del asistente que se va llenando con tokens.
        var liveBubble = CreateLiveAssistantBubble();

        _streamCts = new CancellationTokenSource();
        _activeRequestId = 0;
        bool firstToken = true;
        var sb = new System.Text.StringBuilder();

        try
        {
            QueryResponse? response = await _api.SendQueryStreamingAsync(
                question,
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
                        }
                        sb.Append(tok);
                        liveBubble.Text.Text = sb.ToString();
                        ChatScroll.ChangeView(null, ChatScroll.ScrollableHeight, null);
                    });
                },
                cancellationToken: _streamCts.Token);

            // Reemplazar la burbuja viva por la versión final (con metadata,
            // markdown formateado y panel de razonamiento si aplica).
            string finalText = response?.Answer ?? sb.ToString();
            ReplaceLiveBubbleWithFinal(liveBubble, finalText, response);

            if (response?.Cancelled == true)
            {
                ShowNotification(InfoBarSeverity.Informational, "Generación detenida.");
            }
            else if (response == null)
            {
                if (sb.Length == 0)
                {
                    AddBubble("Error: no se recibio respuesta del backend.", "error");
                }
            }
        }
        catch (OperationCanceledException)
        {
            // Cancelacion local: ya pedimos al backend cancelar via OnStopClick.
            string partial = sb.ToString();
            if (string.IsNullOrEmpty(partial))
            {
                MessagesPanel.Children.Remove(liveBubble.Border);
                _bubbles.RemoveAll(b => b.Role == "__live__");
            }
            else
            {
                ReplaceLiveBubbleWithFinal(liveBubble, partial, null, cancelled: true);
            }
            ShowNotification(InfoBarSeverity.Informational, "Generación detenida.");
        }
        catch (Exception ex)
        {
            MessagesPanel.Children.Remove(liveBubble.Border);
            _bubbles.RemoveAll(b => b.Role == "__live__");
            AddBubble($"Error: {ex.Message}", "error");
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
        }
    }

    private async void OnStopClick(object sender, RoutedEventArgs e)
    {
        if (!_isSending || _api == null) return;
        StopButton.IsEnabled = false;   // evita doble-click

        // Pedir al backend que detenga la inferencia. La conexion SSE va a
        // emitir 'done' con cancelled=true y el bucle de lectura saldra.
        try
        {
            await _api.CancelQueryAsync(_activeRequestId);
        }
        catch
        {
            // Si fallo el cancel remoto, abortamos al menos el lado cliente.
        }

        // Cancelacion local como respaldo: cierra la conexion HTTP si el
        // backend no responde a tiempo (ej: red rota).
        _streamCts?.Cancel();
    }

    // ========================================================================
    // Burbuja viva (streaming)
    // ========================================================================

    private sealed class LiveAssistantBubble
    {
        public Border Border { get; init; } = null!;
        public TextBlock Text { get; init; } = null!;
    }

    private LiveAssistantBubble CreateLiveAssistantBubble()
    {
        bool compact = UiPreferences.Instance.Density == UiDensity.Compact;
        double baseSize = UiPreferences.Instance.FontSize;
        Brush bg = ThemedBrushes.Get("AssistantBubbleBrush",
            Windows.UI.Color.FromArgb(255, 31, 41, 55));
        Brush textBrush = ThemedBrushes.Get("AlfredTextPrimary",
            Windows.UI.Color.FromArgb(255, 230, 232, 238));

        var text = new TextBlock
        {
            Text = "",
            TextWrapping = TextWrapping.Wrap,
            FontSize = baseSize,
            Foreground = textBrush,
            IsTextSelectionEnabled = false
        };

        var border = new Border
        {
            Background = bg,
            CornerRadius = new CornerRadius(4, 16, 16, 16),
            Padding = compact
                ? new Thickness(12, 7, 12, 7)
                : new Thickness(16, 10, 16, 10),
            MaxWidth = 600,
            HorizontalAlignment = HorizontalAlignment.Left,
            Child = text
        };

        // Marcador interno para que rebuilds y removes la encuentren.
        _bubbles.Add(new ChatBubble { Text = "", Role = "__live__" });
        MessagesPanel.Children.Add(border);
        ChatScroll.UpdateLayout();
        ChatScroll.ChangeView(null, ChatScroll.ScrollableHeight, null);

        return new LiveAssistantBubble { Border = border, Text = text };
    }

    private void ReplaceLiveBubbleWithFinal(LiveAssistantBubble live,
        string answer, QueryResponse? response, bool cancelled = false)
    {
        // Quitar burbuja en vivo y su entrada de marcador
        int idx = MessagesPanel.Children.IndexOf(live.Border);
        MessagesPanel.Children.Remove(live.Border);
        _bubbles.RemoveAll(b => b.Role == "__live__");

        bool from_cache = response?.FromCache ?? false;
        double timeMs   = response?.TimeMs ?? 0;
        bool wasCancelled = cancelled || (response?.Cancelled ?? false);

        // Si fue cancelado mostramos la respuesta parcial con un sufijo discreto.
        string displayed = wasCancelled && !string.IsNullOrEmpty(answer)
            ? answer + "\n\n_(generación detenida)_"
            : answer;

        _bubbles.Add(new ChatBubble
        {
            Text = displayed,
            Role = "assistant",
            TimeMs = timeMs,
            FromCache = from_cache
        });

        var final = CreateBubbleElement(displayed, "assistant", timeMs, from_cache);
        if (idx >= 0 && idx <= MessagesPanel.Children.Count)
            MessagesPanel.Children.Insert(idx, final);
        else
            MessagesPanel.Children.Add(final);

        ChatScroll.UpdateLayout();
        ChatScroll.ChangeView(null, ChatScroll.ScrollableHeight, null);
    }

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
    // Burbujas de chat
    // ========================================================================

    private void AddBubble(string text, string role, double timeMs = 0, bool fromCache = false,
        List<string>? attachmentNames = null)
    {
        _bubbles.Add(new ChatBubble
        {
            Text = text, Role = role, TimeMs = timeMs,
            FromCache = fromCache, AttachmentNames = attachmentNames
        });

        var bubble = CreateBubbleElement(text, role, timeMs, fromCache, attachmentNames);
        MessagesPanel.Children.Add(bubble);

        // Scroll al final
        ChatScroll.UpdateLayout();
        ChatScroll.ChangeView(null, ChatScroll.ScrollableHeight, null);
    }

    private static Border CreateBubbleElement(string text, string role, double timeMs, bool fromCache,
        List<string>? attachmentNames = null)
    {
        bool isUser = role == "user";
        bool isError = role == "error";

        // Solo limpiamos respuestas del asistente: mensajes del usuario y errores
        // se muestran tal cual para no alterar lo que el usuario escribio.
        string mainText = text;
        string? reasoningText = null;
        if (!isUser && !isError)
        {
            var cleaned = ChatMessageCleaner.Clean(text);
            mainText = cleaned.Text;
            reasoningText = cleaned.Reasoning;
        }

        double baseSize = UiPreferences.Instance.FontSize;
        bool compact = UiPreferences.Instance.Density == UiDensity.Compact;
        Brush userText      = ThemedBrushes.Get("AlfredUserBubbleText", Colors.White);
        Brush dimText       = ThemedBrushes.Get("AlfredTextSecondary", Colors.LightGray);
        Brush assistantBg   = ThemedBrushes.Get("AssistantBubbleBrush", Windows.UI.Color.FromArgb(255, 31, 41, 55));
        Brush userBg        = ThemedBrushes.Get("UserBubble",          Windows.UI.Color.FromArgb(255, 99, 102, 241));
        Brush errorBg       = ThemedBrushes.Get("AlfredError",         Windows.UI.Color.FromArgb(255, 239, 68, 68));
        Brush reasoningBg   = ThemedBrushes.Get("AlfredReasoningBg",   Windows.UI.Color.FromArgb(40, 255, 255, 255));

        var stack = new StackPanel { Spacing = compact ? 2 : 4 };

        if (isUser || isError)
        {
            stack.Children.Add(new TextBlock
            {
                Text = mainText,
                TextWrapping = TextWrapping.Wrap,
                FontSize = baseSize,
                Foreground = userText,
                IsTextSelectionEnabled = true
            });
        }
        else
        {
            // Respuestas del asistente: renderizamos Markdown a UIElements nativos
            var mdPanel = new StackPanel { Spacing = compact ? 4 : 6 };
            foreach (var element in MarkdownRenderer.Render(mainText))
                mdPanel.Children.Add(element);
            stack.Children.Add(mdPanel);
        }

        if (reasoningText != null)
        {
            var reasoningExpander = new Expander
            {
                Header = new TextBlock
                {
                    Text = "Análisis interno",
                    FontSize = 11,
                    Foreground = dimText
                },
                Content = new TextBlock
                {
                    Text = reasoningText,
                    TextWrapping = TextWrapping.Wrap,
                    FontSize = Math.Max(11, baseSize - 2),
                    Foreground = dimText,
                    IsTextSelectionEnabled = true
                },
                Margin = new Thickness(0, 6, 0, 0),
                HorizontalContentAlignment = HorizontalAlignment.Stretch,
                HorizontalAlignment = HorizontalAlignment.Stretch,
                Background = reasoningBg
            };
            stack.Children.Add(reasoningExpander);
        }

        // Indicador de archivos adjuntos en el mensaje
        if (attachmentNames != null && attachmentNames.Count > 0)
        {
            var attachPanel = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                Spacing = 6,
                Margin = new Thickness(0, 4, 0, 0)
            };

            var icon = new FontIcon
            {
                Glyph = "\uE723",
                FontSize = 12,
                Foreground = dimText
            };
            attachPanel.Children.Add(icon);

            var names = string.Join(", ", attachmentNames);
            attachPanel.Children.Add(new TextBlock
            {
                Text = names,
                FontSize = 11,
                FontStyle = Windows.UI.Text.FontStyle.Italic,
                Foreground = dimText,
                TextTrimming = TextTrimming.CharacterEllipsis,
                MaxWidth = 400
            });

            stack.Children.Add(attachPanel);
        }

        // Metadata para respuestas del asistente
        if (!isUser && !isError && timeMs > 0)
        {
            string meta = timeMs >= 1000 ? $"{timeMs / 1000.0:F1}s" : $"{timeMs:F0}ms";
            if (fromCache)
            {
                meta += " · cache";
            }
            else if (timeMs > 200)
            {
                // Estimacion ~1 token cada 4 chars (sin streaming real desde el backend).
                int approxTokens = Math.Max(1, mainText.Length / 4);
                double tps = approxTokens / (timeMs / 1000.0);
                meta += $" · ~{tps:F1} tok/s";
            }

            stack.Children.Add(new TextBlock
            {
                Text = meta,
                FontSize = 10,
                Foreground = dimText,
                HorizontalAlignment = HorizontalAlignment.Right
            });
        }

        Brush bg = isError ? errorBg : isUser ? userBg : assistantBg;
        var bubblePadding = compact
            ? new Thickness(12, 7, 12, 7)
            : new Thickness(16, 10, 16, 10);

        return new Border
        {
            Background = bg,
            CornerRadius = new CornerRadius(isUser ? 16 : 4, 16, isUser ? 4 : 16, 16),
            Padding = bubblePadding,
            MaxWidth = 600,
            HorizontalAlignment = isUser ? HorizontalAlignment.Right : HorizontalAlignment.Left,
            Child = stack
        };
    }

    // ========================================================================
    // Archivos adjuntos
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

    private async Task AddAttachedFileAsync(StorageFile file)
    {
        try
        {
            string content;
            bool isPdf = file.Name.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase);
            bool isBinary = BinaryExtensions.Any(ext =>
                file.Name.EndsWith(ext, StringComparison.OrdinalIgnoreCase));

            if (isPdf && _api != null)
            {
                // Los PDFs se extraen en el backend (PDFium) y viajan al modelo
                // como texto plano. Nunca los enviamos como base64 crudo al LLM.
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

            var basicProps = await file.GetBasicPropertiesAsync();
            _attachedFiles.Add(new AttachedFileInfo
            {
                Name = file.Name,
                SizeBytes = (long)basicProps.Size,
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
        // Desuscribir handlers de chips anteriores para evitar leaks
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

        Brush chipBg     = ThemedBrushes.Get("AlfredChipBg",      Windows.UI.Color.FromArgb(48, 99, 102, 241));
        Brush chipName   = ThemedBrushes.Get("AlfredTextPrimary", Windows.UI.Color.FromArgb(255, 230, 232, 238));
        Brush chipSize   = ThemedBrushes.Get("AlfredChipDimText", Windows.UI.Color.FromArgb(180, 255, 255, 255));

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
                Content = new FontIcon { Glyph = "\uE711", FontSize = 10 },
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

    private void OnRemoveAllAttachments(object sender, RoutedEventArgs e)
    {
        ClearAttachments();
    }

    private void ClearAttachments()
    {
        _attachedFiles.Clear();
        UpdateAttachmentPanel();
    }

    // ========================================================================
    // Drag and Drop
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
        _bubbles.Clear();
        MessagesPanel.Children.Clear();
        WelcomePanel.Visibility = Visibility.Collapsed;

        var detail = await _api.GetConversationAsync(conversationId);
        if (detail == null) return;

        foreach (var msg in detail.Messages)
        {
            _bubbles.Add(new ChatBubble { Text = msg.Content, Role = msg.Role });
            MessagesPanel.Children.Add(CreateBubbleElement(msg.Content, msg.Role, 0, false));
        }

        ChatScroll.UpdateLayout();
        ChatScroll.ChangeView(null, ChatScroll.ScrollableHeight, null);
    }

    // ========================================================================
    // Notificaciones
    // ========================================================================

    private void ShowNotification(InfoBarSeverity severity, string message)
    {
        NotificationBar.Severity = severity;
        NotificationBar.Message = message;
        NotificationBar.IsOpen = true;

        // Auto-cerrar despues de 4 segundos
        var timer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(4) };
        timer.Tick += (_, _) =>
        {
            NotificationBar.IsOpen = false;
            timer.Stop();
        };
        timer.Start();
    }

    // ========================================================================
    // Helpers
    // ========================================================================

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

    private sealed class ChatBubble
    {
        public string Text { get; init; } = "";
        public string Role { get; init; } = "";
        public double TimeMs { get; init; }
        public bool FromCache { get; init; }
        public List<string>? AttachmentNames { get; init; }
    }

    private sealed class AttachedFileInfo
    {
        public string Name { get; init; } = "";
        public long SizeBytes { get; init; }
        public string Content { get; init; } = "";
    }
}
