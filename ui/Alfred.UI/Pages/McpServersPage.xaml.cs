using Alfred.UI.Services;
using Alfred.UI.Services.Mcp;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;

namespace Alfred.UI.Pages;

/// <summary>
/// Listado y edicion de MCP servers configurados. Persiste en
/// <c>%APPDATA%\Alfred\mcp_servers.json</c> via <see cref="McpServerRegistry"/>.
/// El boton "Sincronizar" arranca/detiene los procesos via <see cref="McpClientService"/>.
/// </summary>
public sealed partial class McpServersPage : Page
{
    public UiPreferences Prefs => UiPreferences.Instance;

    public McpServersPage()
    {
        InitializeComponent();
        RegistryPathText.Text = McpServerRegistry.Instance.FilePath;
        McpClientService.Instance.ServerStateChanged += OnServerStateChanged;
        Unloaded += (_, _) => McpClientService.Instance.ServerStateChanged -= OnServerStateChanged;
        Reload();
    }

    private void OnServerStateChanged(object? sender, string serverName)
    {
        DispatcherQueue.TryEnqueue(Reload);
    }

    private void Reload()
    {
        var list = McpServerRegistry.Instance.LoadOrSeed();
        ServerList.Children.Clear();
        foreach (var cfg in list)
        {
            ServerList.Children.Add(BuildServerRow(cfg));
        }
        EmptyPanel.Visibility = list.Count == 0 ? Visibility.Visible : Visibility.Collapsed;
    }

    private FrameworkElement BuildServerRow(McpServerConfig cfg)
    {
        var card = new Border
        {
            Background = (Brush)Application.Current.Resources["CardBackgroundFillColorDefaultBrush"],
            BorderBrush = (Brush)Application.Current.Resources["CardStrokeColorDefaultBrush"],
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(8),
            Padding = new Thickness(14, 10, 14, 12),
        };

        var grid = new Grid();
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

        // Estado conectado/desconectado
        var connected = McpClientService.Instance.IsConnected(cfg.Name);
        var lastErr = McpClientService.Instance.GetLastError(cfg.Name);
        var dot = new Border
        {
            Width = 10, Height = 10, CornerRadius = new CornerRadius(5),
            VerticalAlignment = VerticalAlignment.Center,
            Margin = new Thickness(0, 0, 10, 0),
            Background = new SolidColorBrush(
                connected ? Microsoft.UI.Colors.LimeGreen
                : (lastErr != null ? Microsoft.UI.Colors.OrangeRed : Microsoft.UI.Colors.Gray)),
        };
        Grid.SetColumn(dot, 0);
        grid.Children.Add(dot);

        var infoStack = new StackPanel { Spacing = 2 };
        var nameRow = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8 };
        nameRow.Children.Add(new TextBlock
        {
            Text = cfg.Name,
            FontWeight = Microsoft.UI.Text.FontWeights.SemiBold,
        });
        if (!cfg.Enabled)
        {
            nameRow.Children.Add(new TextBlock
            {
                Text = "(deshabilitado)",
                Foreground = (Brush)Application.Current.Resources["TextFillColorSecondaryBrush"],
                FontSize = 11,
                VerticalAlignment = VerticalAlignment.Center,
            });
        }
        infoStack.Children.Add(nameRow);
        infoStack.Children.Add(new TextBlock
        {
            Text = $"{cfg.Command} {string.Join(' ', cfg.Args)}",
            Foreground = (Brush)Application.Current.Resources["TextFillColorSecondaryBrush"],
            FontSize = 11,
            TextTrimming = TextTrimming.CharacterEllipsis,
        });

        var statusText = new TextBlock
        {
            Foreground = (Brush)Application.Current.Resources["TextFillColorSecondaryBrush"],
            FontSize = 11,
        };
        if (connected)
        {
            var prefix = $"{cfg.Name}__";
            int toolCount = McpClientService.Instance.GetAllTools()
                .Count(t => t.Name.StartsWith(prefix, StringComparison.Ordinal));
            statusText.Text = $"Conectado · {toolCount} tools";
        }
        else if (!string.IsNullOrEmpty(lastErr))
        {
            statusText.Text = $"Error: {lastErr}";
        }
        infoStack.Children.Add(statusText);
        Grid.SetColumn(infoStack, 1);
        grid.Children.Add(infoStack);

        // Botones
        var actions = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 6 };
        var enabledToggle = new ToggleSwitch
        {
            IsOn = cfg.Enabled,
            OffContent = "",
            OnContent = "",
            MinWidth = 0,
            Margin = new Thickness(0, 0, 6, 0),
        };
        enabledToggle.Toggled += (_, _) => ToggleEnabled(cfg, enabledToggle.IsOn);
        actions.Children.Add(enabledToggle);

        actions.Children.Add(MakeIconButton("", "Editar", (_, _) => EditServer(cfg)));
        actions.Children.Add(MakeIconButton("", "Probar conexion", (_, _) => TestServer(cfg, statusText)));
        actions.Children.Add(MakeIconButton("", "Borrar", async (_, _) =>
        {
            var confirm = new ContentDialog
            {
                Title = $"Borrar '{cfg.Name}'?",
                Content = "Se quitara del registro. Si esta conectado, se desconectara en la proxima sincronizacion.",
                PrimaryButtonText = "Borrar",
                CloseButtonText = "Cancelar",
                DefaultButton = ContentDialogButton.Close,
                XamlRoot = this.XamlRoot,
            };
            if (await confirm.ShowAsync() == ContentDialogResult.Primary)
                DeleteServer(cfg);
        }));
        Grid.SetColumn(actions, 2);
        grid.Children.Add(actions);

        card.Child = grid;
        return card;
    }

    private static Button MakeIconButton(string glyph, string tooltip, RoutedEventHandler onClick)
    {
        var btn = new Button
        {
            Padding = new Thickness(6, 4, 6, 4),
            Content = new FontIcon { Glyph = glyph, FontSize = 14 },
        };
        ToolTipService.SetToolTip(btn, tooltip);
        btn.Click += onClick;
        return btn;
    }

    // ------------------------------------------------------------------ Toolbar
    private void OnReloadClick(object sender, RoutedEventArgs e) => Reload();

    private async void OnSyncClick(object sender, RoutedEventArgs e)
    {
        var list = McpServerRegistry.Instance.Load();
        try
        {
            await McpClientService.Instance.SyncWithRegistryAsync(list);
            NotificationService.Instance.ShowSuccess(
                $"Sincronizado. Servers conectados: {McpClientService.Instance.ConnectedServerNames.Count}.",
                "MCP");
        }
        catch (Exception ex)
        {
            NotificationService.Instance.ShowError(
                $"Error sincronizando: {ex.Message}", "MCP");
        }
        Reload();
    }

    private async void OnAddClick(object sender, RoutedEventArgs e)
    {
        var cfg = new McpServerConfig
        {
            Name = "nuevo-server",
            Command = "npx",
            Args = new() { "-y", "@modelcontextprotocol/server-..." },
            Enabled = false,
        };
        var dialog = BuildEditorDialog(cfg, isNew: true);
        var result = await dialog.ShowAsync();
        if (result == ContentDialogResult.Primary)
        {
            var current = McpServerRegistry.Instance.Load();
            if (current.Any(c => string.Equals(c.Name, cfg.Name, StringComparison.OrdinalIgnoreCase)))
            {
                NotificationService.Instance.ShowError(
                    $"Ya existe un server con nombre '{cfg.Name}'.", "MCP");
                return;
            }
            current.Add(cfg);
            McpServerRegistry.Instance.Save(current);
            Reload();
        }
    }

    // ------------------------------------------------------------------ Acciones por fila
    internal async void EditServer(McpServerConfig original)
    {
        var copy = original.Clone();
        var dialog = BuildEditorDialog(copy, isNew: false);
        var result = await dialog.ShowAsync();
        if (result == ContentDialogResult.Primary)
        {
            var current = McpServerRegistry.Instance.Load();
            int idx = current.FindIndex(c =>
                string.Equals(c.Name, original.Name, StringComparison.Ordinal));
            if (idx < 0) current.Add(copy);
            else current[idx] = copy;
            McpServerRegistry.Instance.Save(current);
            Reload();
        }
    }

    internal void DeleteServer(McpServerConfig cfg)
    {
        var current = McpServerRegistry.Instance.Load();
        current.RemoveAll(c => string.Equals(c.Name, cfg.Name, StringComparison.Ordinal));
        McpServerRegistry.Instance.Save(current);
        Reload();
    }

    internal void ToggleEnabled(McpServerConfig cfg, bool enabled)
    {
        var current = McpServerRegistry.Instance.Load();
        var match = current.FirstOrDefault(c =>
            string.Equals(c.Name, cfg.Name, StringComparison.Ordinal));
        if (match == null) return;
        match.Enabled = enabled;
        McpServerRegistry.Instance.Save(current);
    }

    internal async void TestServer(McpServerConfig cfg, TextBlock? statusText)
    {
        if (statusText != null) statusText.Text = "Conectando…";
        var (ok, err, tools) = await McpClientService.Instance.TestConnectAsync(cfg);
        if (ok)
        {
            var list = string.Join(", ", tools.Take(8));
            var more = tools.Count > 8 ? $" (+{tools.Count - 8} mas)" : "";
            NotificationService.Instance.ShowSuccess(
                tools.Count > 0
                    ? $"OK. {tools.Count} tools: {list}{more}"
                    : "OK. Server respondio sin tools.",
                $"Test '{cfg.Name}'");
            if (statusText != null) statusText.Text = $"OK · {tools.Count} tools";
        }
        else
        {
            NotificationService.Instance.ShowError(
                err ?? "Error desconocido", $"Test '{cfg.Name}'");
            if (statusText != null) statusText.Text = $"Error: {err}";
        }
    }

    // ------------------------------------------------------------------ Editor
    private ContentDialog BuildEditorDialog(McpServerConfig cfg, bool isNew)
    {
        var nameBox = new TextBox { Header = "Nombre", Text = cfg.Name, IsReadOnly = !isNew };
        var cmdBox  = new TextBox { Header = "Comando (ej. npx, uvx, node)", Text = cfg.Command };
        var argsBox = new TextBox
        {
            Header = "Argumentos (uno por linea)",
            Text = string.Join('\n', cfg.Args),
            AcceptsReturn = true,
            TextWrapping = Microsoft.UI.Xaml.TextWrapping.Wrap,
            MinHeight = 90,
        };
        var envBox = new TextBox
        {
            Header = "Variables de entorno (KEY=VALUE por linea, opcional)",
            Text = string.Join('\n', cfg.Env.Select(kv => $"{kv.Key}={kv.Value}")),
            AcceptsReturn = true,
            MinHeight = 70,
        };
        var cwdBox  = new TextBox { Header = "Working directory (opcional)", Text = cfg.WorkingDirectory ?? "" };
        var enabledToggle = new ToggleSwitch
        {
            Header = "Habilitado",
            IsOn = cfg.Enabled,
            OffContent = "No conectar",
            OnContent  = "Conectar al sincronizar",
        };

        var stack = new StackPanel { Spacing = 8, MinWidth = 420 };
        stack.Children.Add(nameBox);
        stack.Children.Add(cmdBox);
        stack.Children.Add(argsBox);
        stack.Children.Add(envBox);
        stack.Children.Add(cwdBox);
        stack.Children.Add(enabledToggle);

        var dialog = new ContentDialog
        {
            Title = isNew ? "Anadir MCP server" : $"Editar '{cfg.Name}'",
            PrimaryButtonText = "Guardar",
            CloseButtonText = "Cancelar",
            DefaultButton = ContentDialogButton.Primary,
            Content = stack,
            XamlRoot = this.XamlRoot,
        };

        dialog.PrimaryButtonClick += (_, _) =>
        {
            cfg.Name = (nameBox.Text ?? "").Trim();
            cfg.Command = (cmdBox.Text ?? "").Trim();
            cfg.Args = (argsBox.Text ?? "").Split('\n', StringSplitOptions.RemoveEmptyEntries)
                .Select(s => s.Trim()).Where(s => s.Length > 0).ToList();
            cfg.Env = ParseEnv(envBox.Text);
            cfg.WorkingDirectory = string.IsNullOrWhiteSpace(cwdBox.Text) ? null : cwdBox.Text.Trim();
            cfg.Enabled = enabledToggle.IsOn;
        };
        return dialog;
    }

    private static Dictionary<string, string> ParseEnv(string text)
    {
        var dict = new Dictionary<string, string>(StringComparer.Ordinal);
        if (string.IsNullOrWhiteSpace(text)) return dict;
        foreach (var raw in text.Split('\n'))
        {
            var line = raw.Trim();
            if (line.Length == 0) continue;
            int eq = line.IndexOf('=');
            if (eq <= 0) continue;
            dict[line[..eq].Trim()] = line[(eq + 1)..].Trim();
        }
        return dict;
    }
}

/// <summary>
/// View-model de fila renderizable. La ItemsRepeater no usa ItemTemplate XAML
/// para mantener este archivo autocontenido; en su lugar generamos el control
/// programaticamente desde aqui.
/// </summary>
internal sealed class ServerRowVm
{
    public McpServerConfig Config { get; }
    public ServerRowVm(McpServerConfig config) { Config = config; }

    public override string ToString() => Config.Name;
}
