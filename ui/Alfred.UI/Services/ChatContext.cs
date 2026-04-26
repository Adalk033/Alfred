namespace Alfred.UI.Services;

/// <summary>
/// Estado compartido entre ChatPage y MainWindow para el indicador de tokens.
/// </summary>
public static class ChatContext
{
    private static readonly object _lock = new();
    private static string _draft = "";
    private static string? _conversationId;

    public static string Draft
    {
        get { lock (_lock) return _draft; }
        set { lock (_lock) _draft = value ?? ""; Changed?.Invoke(); }
    }

    public static string? ConversationId
    {
        get { lock (_lock) return _conversationId; }
        set { lock (_lock) _conversationId = value; Changed?.Invoke(); }
    }

    public static event Action? Changed;
}
