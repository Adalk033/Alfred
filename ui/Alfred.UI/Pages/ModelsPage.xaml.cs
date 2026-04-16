using Alfred.UI.Models;
using Alfred.UI.Services;
using Microsoft.UI;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Navigation;
using Windows.System;

namespace Alfred.UI.Pages;

public sealed partial class ModelsPage : Page
{
    private AlfredApiClient? _api;
    private readonly ModelDownloadService _downloader = new();
    private readonly HuggingFaceService _hf = new();
    private bool _isAutoTuned;          // true cuando los valores mostrados son del auto-tune
    private bool _suppressConfigChange; // evita que ValueChanged dispare durante auto-tune/reset

    public ModelsPage()
    {
        InitializeComponent();
        Unloaded += (_, _) =>
        {
            _downloader.Dispose();
            _hf.Dispose();
        };

        // Marcar config como "Custom" cuando el usuario toca cualquier NumberBox
        NCtxBox.ValueChanged += OnConfigValueChanged;
        NGpuLayersBox.ValueChanged += OnConfigValueChanged;
        NBatchBox.ValueChanged += OnConfigValueChanged;
        NThreadsBox.ValueChanged += OnConfigValueChanged;
        TemperatureBox.ValueChanged += OnConfigValueChanged;
        TopPBox.ValueChanged += OnConfigValueChanged;
        MaxTokensBox.ValueChanged += OnConfigValueChanged;
        SeedBox.ValueChanged += OnConfigValueChanged;
    }

    private void OnConfigValueChanged(NumberBox sender, NumberBoxValueChangedEventArgs args)
    {
        if (_suppressConfigChange) return;
        if (_isAutoTuned)
            SetConfigMode(isAutoTuned: false);
    }

    protected override async void OnNavigatedTo(NavigationEventArgs e)
    {
        base.OnNavigatedTo(e);
        if (e.Parameter is AlfredApiClient api)
            _api = api;

        ModelsDirText.Text = $"Directorio de modelos: {_downloader.ModelsDirectory}";
        await LoadData();
        await LoadConfig();
    }

    // ========================================================================
    // Busqueda de GGUF en HuggingFace
    // ========================================================================

    private async void OnSearchClick(object sender, RoutedEventArgs e)
    {
        await SearchGgufModels();
    }

    private async void OnSearchKeyDown(object sender, Microsoft.UI.Xaml.Input.KeyRoutedEventArgs e)
    {
        if (e.Key == VirtualKey.Enter)
        {
            e.Handled = true;
            await SearchGgufModels();
        }
    }

    private async Task SearchGgufModels()
    {
        string query = SearchBox.Text.Trim();
        if (string.IsNullOrEmpty(query)) return;

        // Reset UI
        SearchButton.IsEnabled = false;
        SearchProgress.Visibility = Visibility.Visible;
        SearchStatusText.Text = "Buscando versiones GGUF...";
        SearchStatusText.Visibility = Visibility.Visible;
        RepoResultsPanel.Visibility = Visibility.Collapsed;
        FileResultsPanel.Visibility = Visibility.Collapsed;

        try
        {
            var repos = await _hf.SearchGgufReposAsync(query);

            if (repos.Count == 0)
            {
                SearchStatusText.Text = "No se encontraron repositorios GGUF para este modelo.";
                SearchProgress.Visibility = Visibility.Collapsed;
                return;
            }

            if (repos.Count == 1)
            {
                // Si solo hay un repo, mostrar archivos directamente
                SearchStatusText.Text = $"Repositorio: {repos[0].Id}";
                await LoadGgufFiles(repos[0].Id);
            }
            else
            {
                // Mostrar lista de repos para elegir
                SearchStatusText.Text = $"{repos.Count} repositorios encontrados. Selecciona uno:";
                var items = repos.Select(r =>
                {
                    string label = r.Id;
                    if (r.Downloads > 0)
                        label += $"  ({FormatDownloads(r.Downloads)} descargas)";
                    return label;
                }).ToList();

                RepoListView.ItemsSource = items;
                RepoResultsPanel.Visibility = Visibility.Visible;

                // Guardar los IDs para referencia
                RepoListView.Tag = repos;
            }
        }
        catch (Exception ex)
        {
            SearchStatusText.Text = $"Error en la busqueda: {ex.Message}";
        }
        finally
        {
            SearchProgress.Visibility = Visibility.Collapsed;
            SearchButton.IsEnabled = true;
        }
    }

    private async void OnRepoSelected(object sender, SelectionChangedEventArgs e)
    {
        if (RepoListView.SelectedIndex < 0) return;
        if (RepoListView.Tag is not List<HfRepoResult> repos) return;

        var selected = repos[RepoListView.SelectedIndex];
        SearchStatusText.Text = $"Cargando archivos de {selected.Id}...";
        SearchProgress.Visibility = Visibility.Visible;

        await LoadGgufFiles(selected.Id);

        SearchProgress.Visibility = Visibility.Collapsed;
    }

    private async Task LoadGgufFiles(string repoId)
    {
        var files = await _hf.ListGgufFilesAsync(repoId);

        if (files.Count == 0)
        {
            SearchStatusText.Text = $"No se encontraron archivos .gguf en {repoId}";
            FileResultsPanel.Visibility = Visibility.Collapsed;
            return;
        }

        SearchStatusText.Text = $"{files.Count} archivos GGUF en {repoId}";
        FileResultsHeader.Text = $"Archivos en {repoId}:";
        FileListView.ItemsSource = files;
        FileResultsPanel.Visibility = Visibility.Visible;
    }

    // ========================================================================
    // Descarga de archivo GGUF
    // ========================================================================

    private async void OnDownloadGgufFile(object sender, RoutedEventArgs e)
    {
        if (sender is not Button btn || btn.Tag is not HfGgufFile file) return;

        btn.IsEnabled = false;
        btn.Content = "Descargando...";

        // Mostrar progreso
        DownloadProgressBar.Visibility = Visibility.Visible;
        DownloadProgressBar.Value = 0;
        DownloadProgressText.Visibility = Visibility.Visible;
        DownloadProgressText.Text = $"Iniciando descarga de {file.FileName}...";
        CancelDownloadButton.Visibility = Visibility.Visible;

        bool success = await _downloader.DownloadModelAsync(file.DownloadUrl, file.FileName, progress =>
        {
            DispatcherQueue.TryEnqueue(() =>
            {
                if (progress.Error != null)
                {
                    DownloadProgressText.Text = $"Error: {progress.Error}";
                    ResetDownloadUI(btn);
                    return;
                }

                if (progress.IsCancelled)
                {
                    DownloadProgressText.Text = "Descarga cancelada";
                    ResetDownloadUI(btn);
                    return;
                }

                if (progress.IsCompleted)
                {
                    DownloadProgressBar.Value = 100;
                    DownloadProgressText.Text = $"{file.FileName} descargado correctamente";
                    ResetDownloadUI(btn);
                    return;
                }

                DownloadProgressBar.Value = progress.Percentage;
                string downloaded = FormatBytes(progress.BytesDownloaded);
                string total = progress.TotalBytes > 0 ? FormatBytes(progress.TotalBytes) : "?";
                DownloadProgressText.Text = $"{file.FileName}: {downloaded} / {total} ({progress.Percentage:F1}%)";
            });
        });

        if (success)
        {
            await LoadData();
        }
    }

    private void OnCancelDownload(object sender, RoutedEventArgs e)
    {
        _downloader.CancelDownload();
    }

    private void ResetDownloadUI(Button? sourceBtn = null)
    {
        CancelDownloadButton.Visibility = Visibility.Collapsed;
        DownloadProgressBar.Visibility = Visibility.Collapsed;
        if (sourceBtn != null)
        {
            sourceBtn.IsEnabled = true;
            sourceBtn.Content = "Descargar";
        }
    }

    // ========================================================================
    // Estado y lista de modelos en disco
    // ========================================================================

    private async Task LoadData()
    {
        if (_api == null) return;

        var status = await _api.GetModelStatusAsync();
        if (status != null)
        {
            LlmStatus.Text = status.LlmLoaded
                ? (status.LlmModel ?? "Cargado")
                : "No cargado";

            if (!string.IsNullOrEmpty(status.ModelsDir))
                ModelsDirText.Text = $"Directorio de modelos: {status.ModelsDir}";
        }

        var models = await _api.ListModelsAsync();
        ModelListView.ItemsSource = models;
        EmptyText.Visibility = models.Count == 0 ? Visibility.Visible : Visibility.Collapsed;
    }

    private async void OnChangeModel(object sender, RoutedEventArgs e)
    {
        if (_api == null) return;
        if (sender is not Button btn || btn.Tag is not string modelPath) return;

        btn.IsEnabled = false;
        btn.Content = "Cargando...";

        try
        {
            var (success, error, warning) = await _api.ChangeModelAsync(modelPath);
            if (success)
            {
                await LoadData();
                if (!string.IsNullOrEmpty(warning))
                    await ShowWarning(warning);
            }
            else
            {
                await ShowError($"No se pudo cargar el modelo LLM.\n\n{error}");
            }
        }
        finally
        {
            btn.IsEnabled = true;
            btn.Content = "Usar como LLM";
        }
    }

    // ========================================================================
    // Eliminar modelo
    // ========================================================================

    private async void OnDeleteModel(object sender, RoutedEventArgs e)
    {
        if (_api == null) return;
        if (sender is not Button btn || btn.Tag is not string modelName) return;

        // Dialogo de confirmacion
        var dialog = new ContentDialog
        {
            Title = "Eliminar modelo",
            Content = $"¿Estas seguro de que deseas eliminar \"{modelName}\"?\n\nEsta accion no se puede deshacer.",
            PrimaryButtonText = "Eliminar",
            CloseButtonText = "Cancelar",
            DefaultButton = ContentDialogButton.Close,
            XamlRoot = this.XamlRoot
        };

        var result = await dialog.ShowAsync();
        if (result != ContentDialogResult.Primary) return;

        btn.IsEnabled = false;
        btn.Content = "Eliminando...";

        try
        {
            var (success, error) = await _api.DeleteModelAsync(modelName);
            if (success)
            {
                await LoadData();
            }
            else
            {
                await ShowError($"No se pudo eliminar el modelo.\n\n{error}");
            }
        }
        finally
        {
            btn.IsEnabled = true;
            btn.Content = "Eliminar";
        }
    }

    // ========================================================================
    // Configuracion del modelo LLM
    // ========================================================================

    private async Task LoadConfig()
    {
        if (_api == null) return;

        var config = await _api.GetModelConfigAsync();
        if (config == null) return;

        _suppressConfigChange = true;
        NCtxBox.Value = config.NCtx;
        NGpuLayersBox.Value = config.NGpuLayers;
        NBatchBox.Value = config.NBatch;
        NThreadsBox.Value = config.NThreads;
        TemperatureBox.Value = config.Temperature;
        TopPBox.Value = config.TopP;
        MaxTokensBox.Value = config.MaxTokens;
        SeedBox.Value = config.Seed;
        _suppressConfigChange = false;
    }

    private async void OnSaveConfig(object sender, RoutedEventArgs e)
    {
        if (_api == null) return;

        SaveConfigButton.IsEnabled = false;

        var config = new ModelConfig
        {
            NCtx = (int)NCtxBox.Value,
            NGpuLayers = (int)NGpuLayersBox.Value,
            NBatch = (int)NBatchBox.Value,
            NThreads = (int)NThreadsBox.Value,
            Temperature = (float)TemperatureBox.Value,
            TopP = (float)TopPBox.Value,
            MaxTokens = (int)MaxTokensBox.Value,
            Seed = (int)SeedBox.Value
        };

        var (success, needsReload) = await _api.SetModelConfigAsync(config);

        if (success)
        {
            if (needsReload)
            {
                ConfigInfoBar.Severity = Microsoft.UI.Xaml.Controls.InfoBarSeverity.Warning;
                ConfigInfoBar.Message = "Configuracion guardada. Los cambios de carga se aplicaran la proxima vez que se cargue el modelo. Detene el modelo y vuelve a cargarlo para aplicar los cambios.";
            }
            else
            {
                ConfigInfoBar.Severity = Microsoft.UI.Xaml.Controls.InfoBarSeverity.Success;
                ConfigInfoBar.Message = "Configuracion guardada correctamente.";
            }
            ConfigInfoBar.IsOpen = true;
        }
        else
        {
            ConfigInfoBar.Severity = Microsoft.UI.Xaml.Controls.InfoBarSeverity.Error;
            ConfigInfoBar.Message = "Error al guardar la configuracion.";
            ConfigInfoBar.IsOpen = true;
        }

        SaveConfigButton.IsEnabled = true;
    }

    private void OnResetConfig(object sender, RoutedEventArgs e)
    {
        _suppressConfigChange = true;
        NCtxBox.Value = 4096;
        NGpuLayersBox.Value = 99;
        NBatchBox.Value = 512;
        NThreadsBox.Value = 0;
        TemperatureBox.Value = 0.7;
        TopPBox.Value = 0.9;
        MaxTokensBox.Value = 2048;
        SeedBox.Value = -1;
        _suppressConfigChange = false;

        SetConfigMode(isAutoTuned: false);
        HardwareInfoText.Visibility = Visibility.Collapsed;

        ConfigInfoBar.Severity = Microsoft.UI.Xaml.Controls.InfoBarSeverity.Informational;
        ConfigInfoBar.Message = "Valores restablecidos a los predeterminados. Presiona 'Guardar' para aplicar.";
        ConfigInfoBar.IsOpen = true;
    }

    private async void OnAutoTune(object sender, RoutedEventArgs e)
    {
        if (_api == null) return;

        AutoTuneButton.IsEnabled = false;

        var result = await _api.GetAutoTuneAsync();
        if (result == null)
        {
            ConfigInfoBar.Severity = InfoBarSeverity.Error;
            ConfigInfoBar.Message = "No se pudo obtener la configuracion auto-tune del backend.";
            ConfigInfoBar.IsOpen = true;
            AutoTuneButton.IsEnabled = true;
            return;
        }

        // Aplicar valores sin disparar OnConfigValueChanged
        _suppressConfigChange = true;
        NCtxBox.Value = result.NCtx;
        NGpuLayersBox.Value = result.NGpuLayers;
        NBatchBox.Value = result.NBatch;
        NThreadsBox.Value = result.NThreads;
        MaxTokensBox.Value = result.MaxTokens;
        TemperatureBox.Value = 0.7;
        TopPBox.Value = 0.9;
        SeedBox.Value = -1;
        _suppressConfigChange = false;

        // Guardar automaticamente
        var config = new ModelConfig
        {
            NCtx = result.NCtx,
            NGpuLayers = result.NGpuLayers,
            NBatch = result.NBatch,
            NThreads = result.NThreads,
            Temperature = 0.7f,
            TopP = 0.9f,
            MaxTokens = result.MaxTokens,
            Seed = -1
        };

        var (success, needsReload) = await _api.SetModelConfigAsync(config);

        // Mostrar info de hardware
        if (result.Hardware != null)
        {
            var hw = result.Hardware;
            string gpuInfo = hw.GpuAvailable
                ? $"{hw.DeviceName} | VRAM: {hw.VramFreeMb:N0} MB libre de {hw.VramTotalMb:N0} MB"
                : "Sin GPU - modo CPU";
            string cpuInfo = $"CPU: {hw.CpuCores} cores fisicos";
            string modelInfo = hw.ModelSizeMb > 0 ? $" | Modelo: {hw.ModelSizeMb:N0} MB" : "";
            HardwareInfoText.Text = $"Hardware detectado: {gpuInfo} | {cpuInfo}{modelInfo}";
            HardwareInfoText.Visibility = Visibility.Visible;
        }

        SetConfigMode(isAutoTuned: true);

        if (success)
        {
            string reloadMsg = needsReload
                ? " Recarga el modelo para aplicar los cambios de carga."
                : "";
            ConfigInfoBar.Severity = InfoBarSeverity.Success;
            ConfigInfoBar.Message = $"Auto Tune aplicado y guardado.{reloadMsg}";
        }
        else
        {
            ConfigInfoBar.Severity = InfoBarSeverity.Warning;
            ConfigInfoBar.Message = "Auto Tune aplicado en la UI pero no se pudo guardar en el backend.";
        }
        ConfigInfoBar.IsOpen = true;

        AutoTuneButton.IsEnabled = true;
    }

    private void SetConfigMode(bool isAutoTuned)
    {
        _isAutoTuned = isAutoTuned;
        ConfigModeText.Text = isAutoTuned ? "Recommended" : "Custom";
        ConfigModeBadge.Background = isAutoTuned
            ? new SolidColorBrush(Windows.UI.Color.FromArgb(40, 0, 180, 80))
            : new SolidColorBrush(Windows.UI.Color.FromArgb(30, 128, 128, 128));
    }

    // ========================================================================
    // Helpers
    // ========================================================================

    private async Task ShowError(string message)
    {
        var dialog = new ContentDialog
        {
            Title = "Error",
            Content = message,
            CloseButtonText = "Aceptar",
            XamlRoot = this.XamlRoot
        };
        await dialog.ShowAsync();
    }

    private async Task ShowWarning(string message)
    {
        var dialog = new ContentDialog
        {
            Title = "Advertencia",
            Content = message,
            CloseButtonText = "Entendido",
            XamlRoot = this.XamlRoot
        };
        await dialog.ShowAsync();
    }

    private static string FormatBytes(long bytes)
    {
        return bytes switch
        {
            >= 1073741824L => $"{bytes / 1073741824.0:F2} GB",
            >= 1048576L => $"{bytes / 1048576.0:F1} MB",
            >= 1024L => $"{bytes / 1024.0:F0} KB",
            _ => $"{bytes} B"
        };
    }

    private static string FormatDownloads(int downloads)
    {
        return downloads switch
        {
            >= 1000000 => $"{downloads / 1000000.0:F1}M",
            >= 1000 => $"{downloads / 1000.0:F1}k",
            _ => downloads.ToString()
        };
    }
}
