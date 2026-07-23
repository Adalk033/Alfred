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
    private int _healthFailuresConsecutive = 0;

    public UiPreferences Prefs => UiPreferences.Instance;

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

        // Token de sesion aleatorio compartido: se pasa al backend por CLI y
        // viaja en cada peticion como X-Alfred-Token. Sin esto, cualquier
        // pagina web local podria invocar la API (CSRF).
        string authToken = Convert.ToHexString(
            System.Security.Cryptography.RandomNumberGenerator.GetBytes(32));
        _api = new AlfredApiClient(authToken: authToken);
        _backend = new BackendProcessManager(authToken: authToken);
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

                    // Backoff: el medidor de tokens solo tiene sentido con un
                    // modelo cargado. Pausar su timer (600ms) cuando no lo hay.
                    if (loaded && !_tokenTimer.IsEnabled) _tokenTimer.Start();
                    else if (!loaded && _tokenTimer.IsEnabled) _tokenTimer.Stop();
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

        // Cargar primero los modelos locales reales para filtrar recientes obsoletos.
        var localModels = ModelListHelpers.Deduplicate(await _api.ListModelsAsync());
        var localPaths = new HashSet<string>(
            localModels.Select(m => ModelListHelpers.NormalizePath(m.Path, m.Name)),
            StringComparer.Ordinal);

        // Paths ya renderizados (normalizados) para evitar duplicados entre
        // "Recientes" y "Locales" o dentro de una misma seccion.
        var seenPaths = new HashSet<string>(StringComparer.Ordinal);

        // Recientes (persistidos en user_settings). Una sola lectura: filtrar
        // los que ya no existen en disco y, si cambio, re-persistir.
        var persistedRecents = ModelListHelpers.Deduplicate(await LoadRecentModelsAsync());
        var recents = persistedRecents
            .Where(r => localPaths.Contains(ModelListHelpers.NormalizePath(r.Path, r.Name)))
            .ToList();

        if (recents.Count != persistedRecents.Count)
            await SaveRecentModelsAsync(recents);

        var recentsToShow = recents
            .Where(r => seenPaths.Add(ModelListHelpers.NormalizePath(r.Path, r.Name)))
            .Take(RECENT_MODELS_MAX)
            .ToList();

        if (recentsToShow.Count > 0)
        {
            var recentHeader = new MenuFlyoutItem
            {
                Text = "Recientes",
                IsEnabled = false,
                FontSize = 10,
            };
            ModelFlyout.Items.Add(recentHeader);
            foreach (var r in recentsToShow)
            {
                ModelFlyout.Items.Add(CreateModelMenuItem(r.Name, r.Path));
            }
            ModelFlyout.Items.Add(new MenuFlyoutSeparator());
        }

        // Modelos locales (dedup por path y excluyendo los ya mostrados en recientes)
        var models = localModels
            .Where(m => seenPaths.Add(ModelListHelpers.NormalizePath(m.Path, m.Name)))
            .ToList();

        if (models.Count == 0 && recentsToShow.Count == 0)
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
            return ModelListHelpers.Deduplicate(list);
        }
        catch { return new(); }
    }

    private async Task SaveRecentModelAsync(string name, string path)
    {
        var list = await LoadRecentModelsAsync();
        string key = ModelListHelpers.NormalizePath(path, name);
        list.RemoveAll(m => ModelListHelpers.NormalizePath(m.Path, m.Name) == key);
        list.Insert(0, new ModelInfo { Name = name, Path = path });
        if (list.Count > RECENT_MODELS_MAX) list = list.Take(RECENT_MODELS_MAX).ToList();
        await SaveRecentModelsAsync(list);
    }

    private async Task SaveRecentModelsAsync(List<ModelInfo> list)
    {
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
            {
                _healthFailuresConsecutive = 0;
                UpdateStatus("Conectado", Colors.LimeGreen);
            }
            else
            {
                _healthFailuresConsecutive++;
                // Debounce: un timeout aislado no debe marcar desconexion visual.
                if (_healthFailuresConsecutive >= 2)
                    UpdateStatus("Desconectado", Colors.Red);
            }
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

    // Ctrl+, abre Configuracion (Key=Number188 es la tecla de la coma).
    private void OnSettingsAccelerator(Microsoft.UI.Xaml.Input.KeyboardAccelerator sender,
        Microsoft.UI.Xaml.Input.KeyboardAcceleratorInvokedEventArgs args)
    {
        args.Handled = true;
        foreach (var item in NavView.FooterMenuItems.OfType<NavigationViewItem>())
        {
            if ((item.Tag?.ToString() ?? "") == "settings")
            {
                NavView.SelectedItem = item;
                break;
            }
        }
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
                "models" => typeof(ModelsPage),
                "settings" => typeof(SettingsPage),
                _ => typeof(ChatPage)
            };
            ContentFrame.Navigate(pageType, _api);
        }
    }

    /// <summary>
    /// Sincroniza la seleccion del NavigationView cuando una pagina navega internamente.
    /// </summary>
    private void OnContentFrameNavigated(object sender, NavigationEventArgs e)
    {
        string? tag = e.SourcePageType switch
        {
            Type t when t == typeof(ChatPage) => "chat",
            Type t when t == typeof(ConversationsPage) => "conversations",
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
            var result = await _api.UnloadModelAsync();
            if (result.Success)
            {
                await LoadModelInfo();
                NotificationService.Instance.ShowSuccess(
                    result.Message,
                    "Modelo detenido");
            }
            else if (result.Busy)
            {
                NotificationService.Instance.ShowWarning(
                    result.Message,
                    "Modelo en uso");
            }
            else
            {
                NotificationService.Instance.ShowError(
                    result.Message);
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

    private async void OnNewConversationFromSidebar(object sender, RoutedEventArgs e)
    {
        NewConversationButton.IsEnabled = false;
        try
        {
            var created = await _api.CreateConversationAsync("");
            if (created == null)
            {
                NotificationService.Instance.ShowError(
                    "No se pudo crear la conversacion. Verifica que el backend este activo.");
                return;
            }

            foreach (var item in NavView.MenuItems.OfType<NavigationViewItem>())
            {
                if ((item.Tag?.ToString() ?? "") == "chat")
                {
                    _suppressNavigation = true;
                    NavView.SelectedItem = item;
                    _suppressNavigation = false;
                    break;
                }
            }

            ContentFrame.Navigate(typeof(ChatPage), _api);
            if (ContentFrame.Content is ChatPage chatPage)
            {
                await chatPage.LoadConversationAsync(created.Id);
            }
        }
        finally
        {
            NewConversationButton.IsEnabled = true;
        }
    }

    private async void OnWindowClosed(object sender, WindowEventArgs args)
    {
        _healthTimer.Stop();
        _tokenTimer.Stop();
        _backend.StatusChanged -= OnBackendStatusChanged;
        NotificationService.Instance.NotificationRequested -= OnNotificationRequested;
        _backend.Dispose();
        _api.Dispose();
    }
}
