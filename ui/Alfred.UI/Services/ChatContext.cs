namespace Alfred.UI.Services;

/// <summary>
/// Estado compartido entre ChatPage y MainWindow para poder mostrar el
/// indicador de tokens en la barra superior sin acoplar ambas clases.
/// ChatPage actualiza estas propiedades; MainWindow las lee periodicamente.
/// </summary>
public static class ChatContext
{
    private static readonly object _lock = new();
    private static string? _conversationId;
    private static string _draft = "";

    public static string? ConversationId
    {
        get { lock (_lock) return _conversationId; }
        set { lock (_lock) _conversationId = value; Changed?.Invoke(); }
    }

    public static string Draft
    {
        get { lock (_lock) return _draft; }
        set { lock (_lock) _draft = value ?? ""; Changed?.Invoke(); }
    }

    /// <summary>Disparado cuando ConversationId o Draft cambian.</summary>
    public static event Action? Changed;
}
