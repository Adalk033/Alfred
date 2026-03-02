using Alfred.UI.Services;
using Microsoft.UI;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Navigation;

namespace Alfred.UI.Pages;

public sealed partial class ModelsPage : Page
{
    private AlfredApiClient? _api;
    private readonly ModelDownloadService _downloader = new();

    public ModelsPage()
    {
        InitializeComponent();
        Unloaded += (_, _) => _downloader.Dispose();
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
    // Descarga por URL
    // ========================================================================

    private async void OnDownloadFromUrl(object sender, RoutedEventArgs e)
    {
        string url = DownloadUrlBox.Text.Trim();
        if (string.IsNullOrEmpty(url))
            return;

        // Extraer nombre de archivo de la URL
        string fileName;
        try
        {
            var uri = new Uri(url);
            fileName = System.IO.Path.GetFileName(uri.LocalPath);
            if (string.IsNullOrEmpty(fileName) || !fileName.EndsWith(".gguf", StringComparison.OrdinalIgnoreCase))
            {
                await ShowError("La URL debe apuntar a un archivo .gguf");
                return;
            }
        }
        catch
        {
            await ShowError("URL no valida");
            return;
        }

        // Actualizar UI a estado de descarga
        DownloadButton.IsEnabled = false;
        DownloadButton.Content = "Descargando...";
        DownloadUrlBox.IsEnabled = false;
        CancelDownloadButton.Visibility = Visibility.Visible;
        DownloadProgressBar.Visibility = Visibility.Visible;
        DownloadProgressBar.Value = 0;
        DownloadProgressText.Visibility = Visibility.Visible;
        DownloadProgressText.Text = "Iniciando descarga...";

        bool success = await _downloader.DownloadModelAsync(url, fileName, progress =>
        {
            DispatcherQueue.TryEnqueue(() =>
            {
                if (progress.Error != null)
                {
                    DownloadProgressText.Text = $"Error: {progress.Error}";
                    ResetDownloadUI();
                    return;
                }

                if (progress.IsCancelled)
                {
                    DownloadProgressText.Text = "Descarga cancelada";
                    ResetDownloadUI();
                    return;
                }

                if (progress.IsCompleted)
                {
                    DownloadProgressBar.Value = 100;
                    DownloadProgressText.Text = $"{fileName} descargado correctamente";
                    ResetDownloadUI();
                    return;
                }

                // Progreso normal
                DownloadProgressBar.Value = progress.Percentage;
                string downloaded = FormatBytes(progress.BytesDownloaded);
                string total = progress.TotalBytes > 0 ? FormatBytes(progress.TotalBytes) : "?";
                DownloadProgressText.Text = $"{fileName}: {downloaded} / {total} ({progress.Percentage:F1}%)";
            });
        });

        if (success)
        {
            DownloadUrlBox.Text = "";
            await LoadData();
        }
    }

    private void OnCancelDownload(object sender, RoutedEventArgs e)
    {
        _downloader.CancelDownload();
    }

    private void ResetDownloadUI()
    {
        DownloadButton.IsEnabled = true;
        DownloadButton.Content = "Descargar";
        DownloadUrlBox.IsEnabled = true;
        CancelDownloadButton.Visibility = Visibility.Collapsed;
        DownloadProgressBar.Visibility = Visibility.Collapsed;
    }

    // ========================================================================
    // Estado y lista de modelos
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
}
