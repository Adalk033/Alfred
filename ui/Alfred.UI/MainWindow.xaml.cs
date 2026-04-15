using Alfred.UI.Pages;
using Alfred.UI.Services;
using Microsoft.UI;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Navigation;

namespace Alfred.UI;

public sealed partial class MainWindow : Window
{
    private readonly BackendProcessManager _backend;
    private readonly AlfredApiClient _api;
    private readonly DispatcherTimer _healthTimer;
    private bool _suppressNavigation;

    public MainWindow()
    {
        InitializeComponent();
        Title = "Alfred - Asistente IA Local";
        ExtendsContentIntoTitleBar = true;

        // Establecer icono de la ventana
        var iconPath = System.IO.Path.Combine(AppContext.BaseDirectory, "Assets", "icon.ico");
        if (System.IO.File.Exists(iconPath))
            AppWindow.SetIcon(iconPath);

        _api = new AlfredApiClient();
        _backend = new BackendProcessManager();
        _backend.StatusChanged += OnBackendStatusChanged;

        // Suscribir al servicio global de notificaciones
        NotificationService.Instance.NotificationRequested += OnNotificationRequested;

        _healthTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(15) };
        _healthTimer.Tick += async (_, _) => await CheckHealth();

        Closed += OnWindowClosed;
        _ = StartBackendAsync();

        // Navegar al chat por defecto
        NavView.SelectedItem = NavView.MenuItems[0];
        ContentFrame.Navigate(typeof(ChatPage), _api);
    }

    private async Task StartBackendAsync()
    {
        UpdateStatus("Iniciando backend...", Colors.Orange);

        bool started = await _backend.StartAsync();
        if (started)
        {
            UpdateStatus("Conectado", Colors.LimeGreen);
            _healthTimer.Start();
            await LoadModelInfo();
        }
        else
        {
            UpdateStatus("Error al iniciar", Colors.Red);
        }
    }

    private async Task LoadModelInfo()
    {
        try
        {
            var status = await _api.GetModelStatusAsync();
            if (status != null)
            {
                DispatcherQueue.TryEnqueue(() =>
                {
                    ModelName.Text = status.LlmModel ?? "Sin modelo";
                });
            }
        }
        catch { /* ignorar */ }
    }

    private async Task CheckHealth()
    {
        bool healthy = await _api.IsHealthyAsync();
        DispatcherQueue.TryEnqueue(() =>
        {
            if (healthy)
                UpdateStatus("Conectado", Colors.LimeGreen);
            else
                UpdateStatus("Desconectado", Colors.Red);
        });
    }

    private void UpdateStatus(string text, Windows.UI.Color color)
    {
        StatusText.Text = text;
        StatusDot.Background = new SolidColorBrush(color);
    }

    private void OnBackendStatusChanged(object? sender, string status)
    {
        DispatcherQueue.TryEnqueue(() =>
        {
            if (status == "running")
                UpdateStatus("Conectado", Colors.LimeGreen);
            else if (status == "stopped")
                UpdateStatus("Detenido", Colors.Red);
            else
                UpdateStatus(status, Colors.Orange);
        });
    }

    /// <summary>
    /// Maneja las notificaciones globales del NotificationService.
    /// </summary>
    private void OnNotificationRequested(InfoBarSeverity severity, string message, string? title, int durationMs)
    {
        DispatcherQueue.TryEnqueue(() =>
        {
            GlobalNotificationBar.Severity = severity;
            GlobalNotificationBar.Message = message;
            GlobalNotificationBar.Title = title ?? "";
            GlobalNotificationBar.IsOpen = true;

            if (durationMs > 0)
            {
                var timer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(durationMs) };
                timer.Tick += (_, _) =>
                {
                    GlobalNotificationBar.IsOpen = false;
                    timer.Stop();
                };
                timer.Start();
            }
        });
    }

    private void OnNavigationChanged(NavigationView sender, NavigationViewSelectionChangedEventArgs args)
    {
        if (_suppressNavigation) return;

        if (args.SelectedItem is NavigationViewItem item)
        {
            string tag = item.Tag?.ToString() ?? "chat";
            Type pageType = tag switch
            {
                "chat" => typeof(ChatPage),
                "conversations" => typeof(ConversationsPage),
                "history" => typeof(HistoryPage),
                "models" => typeof(ModelsPage),
                "settings" => typeof(SettingsPage),
                _ => typeof(ChatPage)
            };
            ContentFrame.Navigate(pageType, _api);
        }
    }

    /// <summary>
    /// Sincroniza la seleccion del NavigationView cuando una pagina navega internamente
    /// (por ejemplo, ConversationsPage o HistoryPage navegan a ChatPage).
    /// </summary>
    private void OnContentFrameNavigated(object sender, NavigationEventArgs e)
    {
        string? tag = e.SourcePageType switch
        {
            Type t when t == typeof(ChatPage) => "chat",
            Type t when t == typeof(ConversationsPage) => "conversations",
            Type t when t == typeof(HistoryPage) => "history",
            Type t when t == typeof(ModelsPage) => "models",
            Type t when t == typeof(SettingsPage) => "settings",
            _ => null
        };

        if (tag == null) return;

        // Buscar el item en MenuItems y FooterMenuItems
        NavigationViewItem? targetItem = null;

        foreach (var item in NavView.MenuItems.OfType<NavigationViewItem>())
        {
            if (item.Tag?.ToString() == tag) { targetItem = item; break; }
        }
        if (targetItem == null)
        {
            foreach (var item in NavView.FooterMenuItems.OfType<NavigationViewItem>())
            {
                if (item.Tag?.ToString() == tag) { targetItem = item; break; }
            }
        }

        if (targetItem != null && NavView.SelectedItem != targetItem)
        {
            _suppressNavigation = true;
            NavView.SelectedItem = targetItem;
            _suppressNavigation = false;
        }
    }

    private async void OnRestartBackend(object sender, RoutedEventArgs e)
    {
        UpdateStatus("Reiniciando...", Colors.Orange);
        _healthTimer.Stop();
        await _backend.StopAsync();
        await Task.Delay(1000);
        await StartBackendAsync();
    }

    private void OnWindowClosed(object sender, WindowEventArgs args)
    {
        _healthTimer.Stop();
        _backend.StatusChanged -= OnBackendStatusChanged;
        NotificationService.Instance.NotificationRequested -= OnNotificationRequested;
        _backend.StopAsync().GetAwaiter().GetResult();
        _backend.Dispose();
        _api.Dispose();
    }
}
