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

    // Referencias a elementos del catalogo para actualizar estado
    private readonly Dictionary<string, CatalogCardControls> _catalogCards = [];

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

        BuildCatalogCards();
        await LoadData();
    }

    // ========================================================================
    // Catalogo de modelos recomendados
    // ========================================================================

    private void BuildCatalogCards()
    {
        CatalogPanel.Children.Clear();
        _catalogCards.Clear();

        foreach (var model in ModelDownloadService.Catalog)
        {
            bool isDownloaded = _downloader.IsModelDownloaded(model.FileName);

            // Card container
            var card = new Border
            {
                Background = (Brush)Application.Current.Resources["CardBackgroundFillColorDefaultBrush"],
                CornerRadius = new CornerRadius(8),
                Padding = new Thickness(16, 12, 16, 12)
            };

            var grid = new Grid { ColumnSpacing = 12 };
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

            // Info column
            var info = new StackPanel { Spacing = 2, VerticalAlignment = VerticalAlignment.Center };

            var nameBlock = new TextBlock
            {
                Text = model.Name,
                FontWeight = Microsoft.UI.Text.FontWeights.SemiBold,
                FontSize = 14
            };
            info.Children.Add(nameBlock);

            var descBlock = new TextBlock
            {
                Text = $"{model.Description} - {model.SizeLabel}",
                FontSize = 12,
                Foreground = (Brush)Application.Current.Resources["TextFillColorSecondaryBrush"]
            };
            info.Children.Add(descBlock);

            var typeBlock = new TextBlock
            {
                Text = model.Type == "llm" ? "Tipo: LLM (generacion)" : "Tipo: Embedder (busqueda)",
                FontSize = 11,
                Foreground = (Brush)Application.Current.Resources["TextFillColorSecondaryBrush"]
            };
            info.Children.Add(typeBlock);

            // Progress bar (hidden by default)
            var progressBar = new ProgressBar
            {
                Minimum = 0,
                Maximum = 100,
                Height = 4,
                Margin = new Thickness(0, 6, 0, 0),
                Visibility = Visibility.Collapsed
            };
            info.Children.Add(progressBar);

            // Progress text (hidden by default)
            var progressText = new TextBlock
            {
                FontSize = 11,
                Foreground = (Brush)Application.Current.Resources["TextFillColorSecondaryBrush"],
                Visibility = Visibility.Collapsed
            };
            info.Children.Add(progressText);

            Grid.SetColumn(info, 0);
            grid.Children.Add(info);

            // Action column
            var actionPanel = new StackPanel
            {
                Spacing = 4,
                VerticalAlignment = VerticalAlignment.Center,
                HorizontalAlignment = HorizontalAlignment.Right
            };

            var downloadBtn = new Button
            {
                Content = isDownloaded ? "Descargado" : "Descargar",
                IsEnabled = !isDownloaded,
                Padding = new Thickness(12, 6, 12, 6),
                Tag = model.FileName
            };
            if (isDownloaded)
            {
                downloadBtn.Background = new SolidColorBrush(Colors.Green);
                downloadBtn.Foreground = new SolidColorBrush(Colors.White);
            }
            downloadBtn.Click += OnDownloadClick;
            actionPanel.Children.Add(downloadBtn);

            var cancelBtn = new Button
            {
                Content = "Cancelar",
                Padding = new Thickness(12, 4, 12, 4),
                Visibility = Visibility.Collapsed,
                Tag = model.FileName
            };
            cancelBtn.Click += OnCancelClick;
            actionPanel.Children.Add(cancelBtn);

            Grid.SetColumn(actionPanel, 1);
            grid.Children.Add(actionPanel);

            card.Child = grid;
            CatalogPanel.Children.Add(card);

            _catalogCards[model.FileName] = new CatalogCardControls
            {
                DownloadButton = downloadBtn,
                CancelButton = cancelBtn,
                ProgressBar = progressBar,
                ProgressText = progressText
            };
        }
    }

    private async void OnDownloadClick(object sender, RoutedEventArgs e)
    {
        if (sender is not Button btn || btn.Tag is not string fileName) return;

        var model = ModelDownloadService.Catalog.Find(m => m.FileName == fileName);
        if (model == null) return;

        if (!_catalogCards.TryGetValue(fileName, out var controls)) return;

        // Actualizar UI a estado de descarga
        controls.DownloadButton.IsEnabled = false;
        controls.DownloadButton.Content = "Descargando...";
        controls.CancelButton.Visibility = Visibility.Visible;
        controls.ProgressBar.Visibility = Visibility.Visible;
        controls.ProgressBar.Value = 0;
        controls.ProgressText.Visibility = Visibility.Visible;
        controls.ProgressText.Text = "Iniciando descarga...";

        bool success = await _downloader.DownloadModelAsync(model.Url, model.FileName, progress =>
        {
            DispatcherQueue.TryEnqueue(() =>
            {
                if (progress.Error != null)
                {
                    controls.ProgressText.Text = $"Error: {progress.Error}";
                    controls.ProgressBar.Visibility = Visibility.Collapsed;
                    controls.DownloadButton.Content = "Reintentar";
                    controls.DownloadButton.IsEnabled = true;
                    controls.CancelButton.Visibility = Visibility.Collapsed;
                    return;
                }

                if (progress.IsCancelled)
                {
                    controls.ProgressText.Text = "Descarga cancelada";
                    controls.ProgressBar.Visibility = Visibility.Collapsed;
                    controls.DownloadButton.Content = "Reintentar";
                    controls.DownloadButton.IsEnabled = true;
                    controls.CancelButton.Visibility = Visibility.Collapsed;
                    return;
                }

                if (progress.IsCompleted)
                {
                    controls.ProgressBar.Value = 100;
                    controls.ProgressText.Text = "Descarga completada";
                    controls.DownloadButton.Content = "Descargado";
                    controls.DownloadButton.IsEnabled = false;
                    controls.DownloadButton.Background = new SolidColorBrush(Colors.Green);
                    controls.DownloadButton.Foreground = new SolidColorBrush(Colors.White);
                    controls.CancelButton.Visibility = Visibility.Collapsed;
                    controls.ProgressBar.Visibility = Visibility.Collapsed;
                    controls.ProgressText.Visibility = Visibility.Collapsed;
                    return;
                }

                // Progreso normal
                controls.ProgressBar.Value = progress.Percentage;
                string downloaded = FormatBytes(progress.BytesDownloaded);
                string total = progress.TotalBytes > 0 ? FormatBytes(progress.TotalBytes) : "?";
                controls.ProgressText.Text = $"{downloaded} / {total} ({progress.Percentage:F1}%)";
            });
        });

        if (success)
        {
            // Recargar lista de modelos disponibles
            await LoadData();
        }
    }

    private void OnCancelClick(object sender, RoutedEventArgs e)
    {
        _downloader.CancelDownload();
    }

    // ========================================================================
    // Estado y lista de modelos
    // ========================================================================

    private async Task LoadData()
    {
        if (_api == null) return;

        // Estado de modelos cargados
        var status = await _api.GetModelStatusAsync();
        if (status != null)
        {
            LlmStatus.Text = status.LlmLoaded
                ? (status.LlmModel ?? "Cargado")
                : "No cargado";

            EmbedderStatus.Text = status.EmbedderLoaded
                ? $"{status.EmbedderModel ?? "Cargado"} (dim={status.EmbedderDim})"
                : "No cargado";
        }

        // Lista de archivos GGUF disponibles
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
            {
                await LoadData();
            }
            else
            {
                var dialog = new ContentDialog
                {
                    Title = "Error",
                    Content = "No se pudo cambiar el modelo.",
                    CloseButtonText = "Aceptar",
                    XamlRoot = this.XamlRoot
                };
                await dialog.ShowAsync();
            }
        }
        finally
        {
            btn.IsEnabled = true;
            btn.Content = "Usar como LLM";
        }
    }

    // ========================================================================
    // Helpers
    // ========================================================================

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

    private sealed class CatalogCardControls
    {
        public required Button DownloadButton { get; init; }
        public required Button CancelButton { get; init; }
        public required ProgressBar ProgressBar { get; init; }
        public required TextBlock ProgressText { get; init; }
    }
}
