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

    public ModelsPage()
    {
        InitializeComponent();
        Unloaded += (_, _) =>
        {
            _downloader.Dispose();
            _hf.Dispose();
        };
    }

    protected override async void OnNavigatedTo(NavigationEventArgs e)
    {
        base.OnNavigatedTo(e);
        if (e.Parameter is AlfredApiClient api)
            _api = api;

        ModelsDirText.Text = $"Directorio de modelos: {_downloader.ModelsDirectory}";
        await LoadData();
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

            EmbedderStatus.Text = status.EmbedderLoaded
                ? $"{status.EmbedderModel ?? "Cargado"} (dim={status.EmbedderDim})"
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
            bool success = await _api.ChangeModelAsync(modelPath);
            if (success)
                await LoadData();
            else
                await ShowError("No se pudo cambiar el modelo LLM.");
        }
        finally
        {
            btn.IsEnabled = true;
            btn.Content = "Usar como LLM";
        }
    }

    private async void OnChangeEmbedder(object sender, RoutedEventArgs e)
    {
        if (_api == null) return;
        if (sender is not Button btn || btn.Tag is not string modelPath) return;

        btn.IsEnabled = false;
        btn.Content = "Cargando...";

        try
        {
            bool success = await _api.ChangeEmbedderAsync(modelPath);
            if (success)
                await LoadData();
            else
                await ShowError("No se pudo cambiar el modelo de embeddings.");
        }
        finally
        {
            btn.IsEnabled = true;
            btn.Content = "Usar como Embedder";
        }
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
