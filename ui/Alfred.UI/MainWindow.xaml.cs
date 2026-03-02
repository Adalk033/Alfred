using Alfred.UI.Pages;
using Alfred.UI.Services;
using Microsoft.UI;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;

namespace Alfred.UI;

public sealed partial class MainWindow : Window
{
    private readonly BackendProcessManager _backend;
    private readonly AlfredApiClient _api;
    private readonly DispatcherTimer _healthTimer;

    public MainWindow()
    {
        InitializeComponent();
        Title = "Alfred - Asistente IA Local";
        ExtendsContentIntoTitleBar = true;

        _api = new AlfredApiClient();
        _backend = new BackendProcessManager();
        _backend.StatusChanged += OnBackendStatusChanged;

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

    private void OnNavigationChanged(NavigationView sender, NavigationViewSelectionChangedEventArgs args)
    {
        if (args.SelectedItem is NavigationViewItem item)
        {
            string tag = item.Tag?.ToString() ?? "chat";
            Type pageType = tag switch
            {
                "chat" => typeof(ChatPage),
                "conversations" => typeof(ConversationsPage),
                "history" => typeof(HistoryPage),
                "documents" => typeof(DocumentsPage),
                "models" => typeof(ModelsPage),
                "settings" => typeof(SettingsPage),
                _ => typeof(ChatPage)
            };
            ContentFrame.Navigate(pageType, _api);
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
        _backend.StopAsync().GetAwaiter().GetResult();
        _api.Dispose();
    }
}
