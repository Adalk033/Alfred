using System.Collections.ObjectModel;
using Alfred.UI.Models;
using Alfred.UI.Services;
using Microsoft.UI;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Navigation;
using Windows.ApplicationModel.DataTransfer;
using Windows.Storage;
using Windows.Storage.Pickers;
using Windows.System;

namespace Alfred.UI.Pages;

public sealed partial class ChatPage : Page
{
    private AlfredApiClient? _api;
    private string? _conversationId;
    private bool _isSending;

    // Archivos adjuntos (maximo 5)
    private const int MaxAttachedFiles = 5;
    private readonly List<AttachedFileInfo> _attachedFiles = [];

    // Extensiones binarias que requieren base64
    private static readonly string[] BinaryExtensions = [".pdf", ".docx", ".xlsx", ".pptx"];
    private static readonly string[] AllowedExtensions =
        [".txt", ".pdf", ".docx", ".xlsx", ".pptx", ".md", ".json", ".xml", ".csv", ".html", ".htm", ".log", ".yaml", ".yml", ".toml", ".ini", ".cfg", ".conf"];

    public ObservableCollection<string> Messages { get; } = [];
    private readonly List<ChatBubble> _bubbles = [];

    public ChatPage()
    {
        InitializeComponent();
    }

    protected override void OnNavigatedTo(NavigationEventArgs e)
    {
        base.OnNavigatedTo(e);
        if (e.Parameter is AlfredApiClient api)
            _api = api;
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
    }

    private async Task SendMessage()
    {
        if (_api == null || _isSending) return;

        string question = InputBox.Text.Trim();
        if (string.IsNullOrEmpty(question) && _attachedFiles.Count == 0) return;

        _isSending = true;
        InputBox.Text = "";
        SendButton.IsEnabled = false;
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

        // Mostrar indicador de carga
        LoadingIndicator.Visibility = Visibility.Visible;
        LoadingText.Text = attachments != null
            ? "Procesando archivos y generando respuesta..."
            : "Alfred esta pensando...";

        try
        {
            QueryResponse? response;

            if (_conversationId != null)
            {
                response = await _api.SendConversationQueryAsync(
                    _conversationId, question, attachments, useHistory: true);
            }
            else
            {
                if (attachments != null)
                {
                    response = await _api.SendQueryWithAttachmentAsync(
                        question, attachments, useHistory: true);
                }
                else
                {
                    response = await _api.SendQueryAsync(
                        question, useHistory: true);
                }

                if (response?.ConversationId != null)
                    _conversationId = response.ConversationId;
            }

            if (response != null)
            {
                AddBubble(response.Answer, "assistant", response.TimeMs, response.FromCache);
            }
            else
            {
                AddBubble("Error: no se recibio respuesta del backend.", "error");
            }
        }
        catch (Exception ex)
        {
            AddBubble($"Error: {ex.Message}", "error");
        }
        finally
        {
            LoadingIndicator.Visibility = Visibility.Collapsed;
            _isSending = false;
            SendButton.IsEnabled = !string.IsNullOrWhiteSpace(InputBox.Text);
            InputBox.Focus(FocusState.Programmatic);
        }
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

        var contentBlock = new TextBlock
        {
            Text = text,
            TextWrapping = TextWrapping.Wrap,
            FontSize = 14,
            Foreground = new SolidColorBrush(Colors.White),
            IsTextSelectionEnabled = true
        };

        var stack = new StackPanel { Spacing = 4 };
        stack.Children.Add(contentBlock);

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
                Foreground = new SolidColorBrush(Colors.LightGray)
            };
            attachPanel.Children.Add(icon);

            var names = string.Join(", ", attachmentNames);
            attachPanel.Children.Add(new TextBlock
            {
                Text = names,
                FontSize = 11,
                FontStyle = Windows.UI.Text.FontStyle.Italic,
                Foreground = new SolidColorBrush(Colors.LightGray),
                TextTrimming = TextTrimming.CharacterEllipsis,
                MaxWidth = 400
            });

            stack.Children.Add(attachPanel);
        }

        // Metadata para respuestas del asistente
        if (!isUser && !isError && timeMs > 0)
        {
            string meta = timeMs >= 1000 ? $"{timeMs / 1000.0:F1}s" : $"{timeMs:F0}ms";
            if (fromCache) meta += " (cache)";

            stack.Children.Add(new TextBlock
            {
                Text = meta,
                FontSize = 10,
                Foreground = new SolidColorBrush(Colors.LightGray),
                HorizontalAlignment = HorizontalAlignment.Right
            });
        }

        SolidColorBrush bg;
        if (isError)
            bg = new SolidColorBrush(Windows.UI.Color.FromArgb(255, 239, 68, 68));
        else if (isUser)
            bg = new SolidColorBrush(Windows.UI.Color.FromArgb(255, 99, 102, 241));
        else
            bg = new SolidColorBrush(Windows.UI.Color.FromArgb(255, 31, 41, 55));

        return new Border
        {
            Background = bg,
            CornerRadius = new CornerRadius(isUser ? 16 : 4, 16, isUser ? 4 : 16, 16),
            Padding = new Thickness(16, 10, 16, 10),
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
            bool isBinary = BinaryExtensions.Any(ext =>
                file.Name.EndsWith(ext, StringComparison.OrdinalIgnoreCase));

            if (isBinary)
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

        var chips = _attachedFiles.Select((f, i) =>
        {
            var chip = new Border
            {
                Background = new SolidColorBrush(Windows.UI.Color.FromArgb(30, 99, 102, 241)),
                CornerRadius = new CornerRadius(4),
                Padding = new Thickness(8, 4, 8, 4)
            };

            var panel = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 6 };
            panel.Children.Add(new TextBlock
            {
                Text = f.Name,
                FontSize = 12,
                VerticalAlignment = VerticalAlignment.Center,
                MaxWidth = 150,
                TextTrimming = TextTrimming.CharacterEllipsis
            });
            panel.Children.Add(new TextBlock
            {
                Text = FormatFileSize(f.SizeBytes),
                FontSize = 10,
                Foreground = new SolidColorBrush(Windows.UI.Color.FromArgb(180, 255, 255, 255)),
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

    /// <summary>
    /// Carga un par Q&amp;A del historial como contexto visual en el chat.
    /// </summary>
    public void LoadHistoryEntry(string question, string answer)
    {
        _conversationId = null;
        _bubbles.Clear();
        MessagesPanel.Children.Clear();
        WelcomePanel.Visibility = Visibility.Collapsed;

        AddBubble(question, "user");
        AddBubble(answer, "assistant");
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
