using System.Collections.ObjectModel;
using Alfred.UI.Models;
using Alfred.UI.Services;
using Microsoft.UI;
using Microsoft.UI.Text;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Navigation;
using Windows.System;

namespace Alfred.UI.Pages;

public sealed partial class ChatPage : Page
{
    private AlfredApiClient? _api;
    private string? _conversationId;
    private bool _isSending;

    public ObservableCollection<string> Messages { get; } = [];

    // Lista interna con datos completos de cada mensaje
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

    private async Task SendMessage()
    {
        if (_api == null || _isSending) return;

        string question = InputBox.Text.Trim();
        if (string.IsNullOrEmpty(question)) return;

        _isSending = true;
        InputBox.Text = "";
        SendButton.IsEnabled = false;
        WelcomePanel.Visibility = Visibility.Collapsed;

        // Agregar burbuja del usuario
        AddBubble(question, "user");

        // Mostrar indicador de carga
        LoadingIndicator.Visibility = Visibility.Visible;

        try
        {
            bool searchDocs = DocSearchToggle.IsChecked == true;
            QueryResponse? response;

            if (_conversationId != null)
            {
                response = await _api.SendConversationQueryAsync(
                    _conversationId, question, useHistory: true, searchDocuments: searchDocs);
            }
            else
            {
                response = await _api.SendQueryAsync(
                    question, useHistory: true, searchDocuments: searchDocs);

                // Si la respuesta incluye conversation_id, guardarlo
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
            SendButton.IsEnabled = true;
            InputBox.Focus(FocusState.Programmatic);
        }
    }

    private void AddBubble(string text, string role, double timeMs = 0, bool fromCache = false)
    {
        _bubbles.Add(new ChatBubble { Text = text, Role = role, TimeMs = timeMs, FromCache = fromCache });

        // Crear el elemento visual
        var bubble = CreateBubbleElement(text, role, timeMs, fromCache);

        // Insertar directamente en el ScrollViewer
        if (ChatScroll.Content is ItemsRepeater)
        {
            // Reemplazar ItemsRepeater con StackPanel la primera vez
            var stack = new StackPanel { Spacing = 12 };
            foreach (var b in _bubbles)
            {
                stack.Children.Add(CreateBubbleElement(b.Text, b.Role, b.TimeMs, b.FromCache));
            }
            ChatScroll.Content = stack;
        }
        else if (ChatScroll.Content is StackPanel panel)
        {
            panel.Children.Add(bubble);
        }

        // Scroll al final
        ChatScroll.UpdateLayout();
        ChatScroll.ChangeView(null, ChatScroll.ScrollableHeight, null);
    }

    private static Border CreateBubbleElement(string text, string role, double timeMs, bool fromCache)
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

        // Metadata para respuestas del asistente
        if (!isUser && !isError && timeMs > 0)
        {
            string meta = $"{timeMs:F0}ms";
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
            bg = new SolidColorBrush(Windows.UI.Color.FromArgb(255, 239, 68, 68)); // Rojo
        else if (isUser)
            bg = new SolidColorBrush(Windows.UI.Color.FromArgb(255, 99, 102, 241)); // AlfredAccent
        else
            bg = new SolidColorBrush(Windows.UI.Color.FromArgb(255, 31, 41, 55)); // AssistantBubble

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

    /// <summary>
    /// Carga una conversacion existente.
    /// </summary>
    public async Task LoadConversationAsync(string conversationId)
    {
        if (_api == null) return;

        _conversationId = conversationId;
        _bubbles.Clear();
        WelcomePanel.Visibility = Visibility.Collapsed;

        var detail = await _api.GetConversationAsync(conversationId);
        if (detail == null) return;

        var stack = new StackPanel { Spacing = 12 };
        foreach (var msg in detail.Messages)
        {
            _bubbles.Add(new ChatBubble { Text = msg.Content, Role = msg.Role });
            stack.Children.Add(CreateBubbleElement(msg.Content, msg.Role, 0, false));
        }
        ChatScroll.Content = stack;
        ChatScroll.UpdateLayout();
        ChatScroll.ChangeView(null, ChatScroll.ScrollableHeight, null);
    }

    private sealed class ChatBubble
    {
        public string Text { get; init; } = "";
        public string Role { get; init; } = "";
        public double TimeMs { get; init; }
        public bool FromCache { get; init; }
    }
}
