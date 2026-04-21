using Alfred.UI.Models;
using Alfred.UI.Pages;
using Alfred.UI.Services;
using Microsoft.UI;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Controls.Primitives;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Navigation;
using System.Text.Json;

namespace Alfred.UI;

public sealed partial class MainWindow : Window
{
    private const string RECENT_MODELS_KEY = "recent_models";
    private const int RECENT_MODELS_MAX = 5;

    private readonly BackendProcessManager _backend;
    private readonly AlfredApiClient _api;
    private readonly DispatcherTimer _healthTimer;
    private readonly DispatcherTimer _tokenTimer;
    private bool _suppressNavigation;
    private string? _currentModelPath;
    private string _modelState = "idle";   // idle|loading|processing
    private DateTime _lastTokenFetch = DateTime.MinValue;

    public MainWindow()
    {
        InitializeComponent();
        Title = "Alfred - Asistente IA Local";
        ExtendsContentIntoTitleBar = true;
        SetTitleBar(AppTitleBar);

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

        // Token meter: actualiza cada 600ms si hay cambios en el chat.
        _tokenTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(600) };
        _tokenTimer.Tick += async (_, _) => await RefreshTokenMeter();
        ChatContext.Changed += () => _lastTokenFetch = DateTime.MinValue;   // forzar proximo tick

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
            _tokenTimer.Start();
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
            var health = await _api.GetHealthAsync();
            // El estado PROCESSING / LOADING lo expone get_stats() dentro de HealthResponse.
            string state = "idle";
            if (health?.Stats is JsonElement stats && stats.TryGetProperty("model_state", out var st))
                state = st.GetString() ?? "idle";

            if (status != null)
            {
                DispatcherQueue.TryEnqueue(() =>
                {
                    bool loaded = status.LlmLoaded;
                    ModelName.Text = loaded
                        ? (status.LlmModel ?? "Cargar modelo")
                        : "Cargar modelo";
                    UnloadModelButton.Visibility = loaded ? Visibility.Visible : Visibility.Collapsed;
                    TokenMeterPanel.Visibility  = loaded ? Visibility.Visible : Visibility.Collapsed;
                    _modelState = state;
                    UpdateModelStateDot(loaded, state);
                });
            }
        }
        catch { /* ignorar */ }
    }

    private void UpdateModelStateDot(bool loaded, string state)
    {
        Windows.UI.Color color = (loaded, state) switch
        {
            (false, _)          => Colors.Gray,
            (true, "loading")   => Colors.Orange,
            (true, "processing")=> Colors.DodgerBlue,
            _                   => Colors.LimeGreen,   // idle + loaded
        };
        ModelStateDot.Background = new SolidColorBrush(color);
    }

    // ========================================================================
    // Selector de modelo en la barra superior
    // ========================================================================
    private async void OnModelPickerOpening(object sender, RoutedEventArgs e)
    {
        ModelFlyout.Items.Clear();

        // Recientes (persistidos en user_settings)
        var recents = await LoadRecentModelsAsync();
        if (recents.Count > 0)
        {
            var recentHeader = new MenuFlyoutItem
            {
                Text = "Recientes",
                IsEnabled = false,
                FontSize = 10,
            };
            ModelFlyout.Items.Add(recentHeader);
            foreach (var r in recents.Take(RECENT_MODELS_MAX))
            {
                ModelFlyout.Items.Add(CreateModelMenuItem(r.Name, r.Path));
            }
            ModelFlyout.Items.Add(new MenuFlyoutSeparator());
        }

        // Modelos locales
        var models = await _api.ListModelsAsync();
        if (models.Count == 0)
        {
            var empty = new MenuFlyoutItem { Text = "Sin modelos locales", IsEnabled = false };
            ModelFlyout.Items.Add(empty);
        }
        else
        {
            foreach (var m in models)
            {
                ModelFlyout.Items.Add(CreateModelMenuItem(m.Name, m.Path));
            }
        }

        ModelFlyout.Items.Add(new MenuFlyoutSeparator());
        var manage = new MenuFlyoutItem { Text = "Administrar modelos…" };
        manage.Click += (_, _) =>
        {
            foreach (var item in NavView.MenuItems.OfType<NavigationViewItem>())
            {
                if ((item.Tag?.ToString() ?? "") == "models")
                {
                    NavView.SelectedItem = item;
                    break;
                }
            }
        };
        ModelFlyout.Items.Add(manage);

        (sender as DropDownButton)?.Flyout?.ShowAt(sender as FrameworkElement);
    }

    private MenuFlyoutItem CreateModelMenuItem(string name, string path)
    {
        var item = new MenuFlyoutItem
        {
            Text = name,
            Icon = new FontIcon { Glyph = path == _currentModelPath ? "" : "" },
        };
        item.Click += async (_, _) => await SwitchModelAsync(name, path);
        return item;
    }

    private async Task SwitchModelAsync(string name, string path)
    {
        // UX optimista: estado LOADING inmediato.
        DispatcherQueue.TryEnqueue(() =>
        {
            ModelName.Text = "Cargando…";
            _modelState = "loading";
            UpdateModelStateDot(loaded: true, "loading");
        });

        var (ok, err, warning) = await _api.ChangeModelAsync(path);
        if (ok)
        {
            _currentModelPath = path;
            await SaveRecentModelAsync(name, path);
            if (!string.IsNullOrEmpty(warning))
                NotificationService.Instance.ShowWarning(warning, "Modelo cargado");
            else
                NotificationService.Instance.ShowSuccess($"Modelo '{name}' listo.", "Listo");
        }
        else
        {
            NotificationService.Instance.ShowError(err, "Error cambiando modelo");
        }
        await LoadModelInfo();
    }

    private async Task<List<ModelInfo>> LoadRecentModelsAsync()
    {
        try
        {
            var raw = await _api.GetUserSettingAsync(RECENT_MODELS_KEY);
            if (string.IsNullOrEmpty(raw)) return new();
            var list = JsonSerializer.Deserialize<List<ModelInfo>>(raw);
            return list ?? new();
        }
        catch { return new(); }
    }

    private async Task SaveRecentModelAsync(string name, string path)
    {
        var list = await LoadRecentModelsAsync();
        list.RemoveAll(m => m.Path == path);
        list.Insert(0, new ModelInfo { Name = name, Path = path });
        if (list.Count > RECENT_MODELS_MAX) list = list.Take(RECENT_MODELS_MAX).ToList();
        try
        {
            var serialized = JsonSerializer.Serialize(list);
            await _api.SetUserSettingAsync(RECENT_MODELS_KEY, serialized);
        }
        catch { /* best effort */ }
    }

    // ========================================================================
    // Token meter
    // ========================================================================
    private async Task RefreshTokenMeter()
    {
        // Throttle: no pegar al endpoint mas rapido que cada 400ms salvo que
        // el usuario haya cambiado algo (ChatContext.Changed resetea la marca).
        if ((DateTime.UtcNow - _lastTokenFetch).TotalMilliseconds < 400)
            return;
        _lastTokenFetch = DateTime.UtcNow;

        if (TokenMeterPanel.Visibility != Visibility.Visible) return;

        var budget = await _api.GetTokenBudgetAsync(ChatContext.ConversationId, ChatContext.Draft);
        if (budget == null) return;

        DispatcherQueue.TryEnqueue(() =>
        {
            TokenMeterBar.Value = budget.PorcentajeUsado;
            TokenMeterText.Text = $"{budget.TotalTokensUsados} / {budget.MaxTokensContexto}";

            // Color por umbrales
            var color = budget.PorcentajeUsado switch
            {
                >= 90 => Colors.OrangeRed,
                >= 70 => Colors.Goldenrod,
                _     => Colors.MediumSeaGreen,
            };
            TokenMeterBar.Foreground = new SolidColorBrush(color);
        });
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

        if (healthy)
            await LoadModelInfo();
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

        if (targetItem != null && !ReferenceEquals(NavView.SelectedItem, targetItem))
        {
            _suppressNavigation = true;
            NavView.SelectedItem = targetItem;
            _suppressNavigation = false;
        }
    }

    private async void OnUnloadModel(object sender, RoutedEventArgs e)
    {
        UnloadModelButton.IsEnabled = false;
        try
        {
            bool success = await _api.UnloadModelAsync();
            if (success)
            {
                await LoadModelInfo();
                NotificationService.Instance.ShowSuccess(
                    "Modelo descargado. GPU/RAM liberados.",
                    "Modelo detenido");
            }
            else
            {
                NotificationService.Instance.ShowError(
                    "No se pudo detener el modelo.");
            }
        }
        finally
        {
            UnloadModelButton.IsEnabled = true;
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
        _tokenTimer.Stop();
        _backend.StatusChanged -= OnBackendStatusChanged;
        NotificationService.Instance.NotificationRequested -= OnNotificationRequested;
        _backend.Dispose();
        _api.Dispose();
    }
}
