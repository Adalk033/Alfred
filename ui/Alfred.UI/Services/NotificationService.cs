using Microsoft.UI.Xaml.Controls;

namespace Alfred.UI.Services;

/// <summary>
/// Servicio global de notificaciones toast/banner usando InfoBar de WinUI 3.
/// Patron singleton - las paginas publican notificaciones y MainWindow las muestra.
/// </summary>
public sealed class NotificationService
{
    private static readonly NotificationService _instance = new();
    public static NotificationService Instance => _instance;

    /// <summary>
    /// Evento que MainWindow escucha para mostrar la notificacion.
    /// </summary>
    public event Action<InfoBarSeverity, string, string?, int>? NotificationRequested;

    private NotificationService() { }

    /// <summary>
    /// Muestra una notificacion informativa.
    /// </summary>
    public void ShowInfo(string message, string? title = null, int durationMs = 4000)
    {
        NotificationRequested?.Invoke(InfoBarSeverity.Informational, message, title, durationMs);
    }

    /// <summary>
    /// Muestra una notificacion de exito.
    /// </summary>
    public void ShowSuccess(string message, string? title = null, int durationMs = 4000)
    {
        NotificationRequested?.Invoke(InfoBarSeverity.Success, message, title, durationMs);
    }

    /// <summary>
    /// Muestra una notificacion de advertencia.
    /// </summary>
    public void ShowWarning(string message, string? title = null, int durationMs = 5000)
    {
        NotificationRequested?.Invoke(InfoBarSeverity.Warning, message, title, durationMs);
    }

    /// <summary>
    /// Muestra una notificacion de error.
    /// </summary>
    public void ShowError(string message, string? title = null, int durationMs = 6000)
    {
        NotificationRequested?.Invoke(InfoBarSeverity.Error, message, title, durationMs);
    }
}
