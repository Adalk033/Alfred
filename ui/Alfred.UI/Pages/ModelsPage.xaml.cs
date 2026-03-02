using Alfred.UI.Services;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Navigation;

namespace Alfred.UI.Pages;

public sealed partial class ModelsPage : Page
{
    private AlfredApiClient? _api;

    public ModelsPage()
    {
        InitializeComponent();
    }

    protected override async void OnNavigatedTo(NavigationEventArgs e)
    {
        base.OnNavigatedTo(e);
        if (e.Parameter is AlfredApiClient api)
            _api = api;
        await LoadData();
    }

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
            btn.Content = "Usar";
        }
    }
}
