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

    public UiPreferences Prefs => UiPreferences.Instance;

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

        // Tuning avanzado: NumberBoxes
        NUbatchBox.ValueChanged += OnConfigValueChanged;
        NThreadsBatchBox.ValueChanged += OnConfigValueChanged;
        TopKBox.ValueChanged += OnConfigValueChanged;
        MinPBox.ValueChanged += OnConfigValueChanged;
        RepeatPenaltyBox.ValueChanged += OnConfigValueChanged;
        RepeatLastNBox.ValueChanged += OnConfigValueChanged;
    }

    private void OnAdvancedSelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (_suppressConfigChange) return;
        if (_isAutoTuned) SetConfigMode(isAutoTuned: false);
    }

    private void OnAdvancedToggled(object sender, RoutedEventArgs e)
    {
        if (_suppressConfigChange) return;
        if (_isAutoTuned) SetConfigMode(isAutoTuned: false);
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

        // Ya hay una descarga en curso: no deshabilitar este boton (quedaria
        // atascado porque DownloadModelAsync retorna sin invocar onProgress).
        if (_downloader.IsDownloading)
        {
            NotificationService.Instance.ShowWarning(
                "Ya hay una descarga en curso. Espera a que termine.", "Descarga");
            return;
        }

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

        // Reset defensivo: si la descarga fallo sin pasar por un callback que
        // rehabilite el boton, restaurarlo aqui.
        if (!success)
            ResetDownloadUI(btn);
        else
            await LoadData();
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

        var models = ModelListHelpers.Deduplicate(await _api.ListModelsAsync());
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
        if (config != null)
        {
            _suppressConfigChange = true;
            NCtxBox.Value = config.NCtx;
            NGpuLayersBox.Value = config.NGpuLayers;
            NBatchBox.Value = config.NBatch;
            NThreadsBox.Value = config.NThreads;
            TemperatureBox.Value = config.Temperature;
            TopPBox.Value = config.TopP;
            MaxTokensBox.Value = config.MaxTokens;
            SeedBox.Value = config.Seed;

            // Tuning avanzado
            NUbatchBox.Value = config.NUbatch;
            NThreadsBatchBox.Value = config.NThreadsBatch;
            TopKBox.Value = config.TopK;
            MinPBox.Value = config.MinP;
            RepeatPenaltyBox.Value = config.RepeatPenalty;
            RepeatLastNBox.Value = config.RepeatLastN;
            ThinkingEnabledToggle.IsOn = config.ThinkingEnabled;

            OffloadKqvToggle.IsOn = config.OffloadKqv;
            UseMmapToggle.IsOn = config.UseMmap;
            UseMlockToggle.IsOn = config.UseMlock;

            SelectComboByTag(FlashAttnCombo, config.FlashAttn.ToString());
            SelectComboByTag(CacheKCombo, config.CacheTypeK);
            SelectComboByTag(CacheVCombo, config.CacheTypeV);
            _suppressConfigChange = false;
        }

        // Cargar timeout de descarga del modelo (movido desde SettingsPage)
        var timeoutStr = await _api.GetAppSettingAsync("model_idle_timeout_sec");
        if (int.TryParse(timeoutStr, out int idleTimeout))
            IdleTimeoutBox.Value = idleTimeout;
        else
            IdleTimeoutBox.Value = 10;
        UpdateIdleTimeoutHint((int)IdleTimeoutBox.Value);
    }

    private static void SelectComboByTag(ComboBox combo, string tag)
    {
        for (int i = 0; i < combo.Items.Count; i++)
        {
            if (combo.Items[i] is ComboBoxItem item && item.Tag?.ToString() == tag)
            {
                combo.SelectedIndex = i;
                return;
            }
        }
        combo.SelectedIndex = 0;
    }

    private static int GetIntTag(ComboBox combo, int fallback)
    {
        if (combo.SelectedItem is ComboBoxItem item &&
            int.TryParse(item.Tag?.ToString(), out int v))
            return v;
        return fallback;
    }

    private static string GetStringTag(ComboBox combo, string fallback)
    {
        if (combo.SelectedItem is ComboBoxItem item)
            return item.Tag?.ToString() ?? fallback;
        return fallback;
    }

    private void UpdateIdleTimeoutHint(int secs)
    {
        IdleTimeoutHint.Text = secs == 0
            ? "El modelo permanecera cargado hasta que cierres la app"
            : $"El modelo se descargara tras {secs} segundos sin consultas";
    }

    private async void OnIdleTimeoutChanged(NumberBox sender, NumberBoxValueChangedEventArgs args)
    {
        if (_api == null || double.IsNaN(args.NewValue)) return;
        int secs = (int)args.NewValue;
        await _api.SetAppSettingAsync("model_idle_timeout_sec", secs.ToString());
        UpdateIdleTimeoutHint(secs);
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
            Seed = (int)SeedBox.Value,

            // Tuning avanzado
            NUbatch = (int)NUbatchBox.Value,
            NThreadsBatch = (int)NThreadsBatchBox.Value,
            FlashAttn = GetIntTag(FlashAttnCombo, -1),
            OffloadKqv = OffloadKqvToggle.IsOn,
            UseMmap = UseMmapToggle.IsOn,
            UseMlock = UseMlockToggle.IsOn,
            CacheTypeK = GetStringTag(CacheKCombo, "f16"),
            CacheTypeV = GetStringTag(CacheVCombo, "f16"),
            TopK = (int)TopKBox.Value,
            MinP = (float)MinPBox.Value,
            RepeatPenalty = (float)RepeatPenaltyBox.Value,
            RepeatLastN = (int)RepeatLastNBox.Value,
            ThinkingEnabled = ThinkingEnabledToggle.IsOn
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

        // Tuning avanzado: defaults
        NUbatchBox.Value = 0;
        NThreadsBatchBox.Value = 0;
        TopKBox.Value = 40;
        MinPBox.Value = 0.05;
        RepeatPenaltyBox.Value = 1.10;
        RepeatLastNBox.Value = 64;
        ThinkingEnabledToggle.IsOn = true;
        OffloadKqvToggle.IsOn = true;
        UseMmapToggle.IsOn = true;
        UseMlockToggle.IsOn = false;
        SelectComboByTag(FlashAttnCombo, "-1");
        SelectComboByTag(CacheKCombo, "f16");
        SelectComboByTag(CacheVCombo, "f16");
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

        // Tuning avanzado del auto-tune
        NUbatchBox.Value = result.NUbatch;
        OffloadKqvToggle.IsOn = result.OffloadKqv;
        SelectComboByTag(FlashAttnCombo, result.FlashAttn.ToString());
        SelectComboByTag(CacheKCombo, result.CacheTypeK);
        SelectComboByTag(CacheVCombo, result.CacheTypeV);
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
            Seed = -1,

            NUbatch = result.NUbatch,
            NThreadsBatch = (int)NThreadsBatchBox.Value,
            FlashAttn = result.FlashAttn,
            OffloadKqv = result.OffloadKqv,
            UseMmap = UseMmapToggle.IsOn,
            UseMlock = UseMlockToggle.IsOn,
            CacheTypeK = result.CacheTypeK,
            CacheTypeV = result.CacheTypeV,
            TopK = (int)TopKBox.Value,
            MinP = (float)MinPBox.Value,
            RepeatPenalty = (float)RepeatPenaltyBox.Value,
            RepeatLastN = (int)RepeatLastNBox.Value,
            ThinkingEnabled = ThinkingEnabledToggle.IsOn
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

    // ========================================================================
    // Presets rapidos (Velocidad / Balanceado / Calidad)
    // ========================================================================

    private void OnPresetSpeed(object sender, RoutedEventArgs e)
    {
        _suppressConfigChange = true;
        // Velocidad: contexto reducido, sampling barato, KV quant agresivo
        NCtxBox.Value = 2048;
        NBatchBox.Value = 512;
        NUbatchBox.Value = 512;
        MaxTokensBox.Value = 512;
        TopKBox.Value = 20;
        MinPBox.Value = 0.1;
        RepeatPenaltyBox.Value = 1.0;
        RepeatLastNBox.Value = 0;
        TemperatureBox.Value = 0.7;
        TopPBox.Value = 0.9;
        OffloadKqvToggle.IsOn = true;
        SelectComboByTag(FlashAttnCombo, "1");
        SelectComboByTag(CacheKCombo, "q4_0");
        SelectComboByTag(CacheVCombo, "q4_0");
        _suppressConfigChange = false;

        SetConfigMode(isAutoTuned: false);
        ConfigInfoBar.Severity = InfoBarSeverity.Informational;
        ConfigInfoBar.Message = "Preset 'Velocidad' aplicado. Pulsa 'Guardar' para confirmar.";
        ConfigInfoBar.IsOpen = true;
    }

    private void OnPresetBalanced(object sender, RoutedEventArgs e)
    {
        _suppressConfigChange = true;
        // Balanceado: defaults razonables
        NCtxBox.Value = 4096;
        NBatchBox.Value = 512;
        NUbatchBox.Value = 0;
        MaxTokensBox.Value = 2048;
        TopKBox.Value = 40;
        MinPBox.Value = 0.05;
        RepeatPenaltyBox.Value = 1.10;
        RepeatLastNBox.Value = 64;
        TemperatureBox.Value = 0.7;
        TopPBox.Value = 0.9;
        OffloadKqvToggle.IsOn = true;
        SelectComboByTag(FlashAttnCombo, "-1");
        SelectComboByTag(CacheKCombo, "f16");
        SelectComboByTag(CacheVCombo, "f16");
        _suppressConfigChange = false;

        SetConfigMode(isAutoTuned: false);
        ConfigInfoBar.Severity = InfoBarSeverity.Informational;
        ConfigInfoBar.Message = "Preset 'Balanceado' aplicado. Pulsa 'Guardar' para confirmar.";
        ConfigInfoBar.IsOpen = true;
    }

    private void OnPresetQuality(object sender, RoutedEventArgs e)
    {
        _suppressConfigChange = true;
        // Calidad: contexto amplio, KV f16, sampling mas estricto
        NCtxBox.Value = 8192;
        NBatchBox.Value = 1024;
        NUbatchBox.Value = 512;
        MaxTokensBox.Value = 4096;
        TopKBox.Value = 64;
        MinPBox.Value = 0.02;
        RepeatPenaltyBox.Value = 1.15;
        RepeatLastNBox.Value = 128;
        TemperatureBox.Value = 0.7;
        TopPBox.Value = 0.9;
        OffloadKqvToggle.IsOn = true;
        SelectComboByTag(FlashAttnCombo, "1");
        SelectComboByTag(CacheKCombo, "f16");
        SelectComboByTag(CacheVCombo, "f16");
        _suppressConfigChange = false;

        SetConfigMode(isAutoTuned: false);
        ConfigInfoBar.Severity = InfoBarSeverity.Informational;
        ConfigInfoBar.Message = "Preset 'Calidad' aplicado. Pulsa 'Guardar' para confirmar.";
        ConfigInfoBar.IsOpen = true;
    }

    private void SetConfigMode(bool isAutoTuned)
    {
        _isAutoTuned = isAutoTuned;
        ConfigModeText.Text = isAutoTuned ? "Recomendado" : "Personalizado";
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
