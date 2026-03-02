using Alfred.UI.Services;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Navigation;

namespace Alfred.UI.Pages;

public sealed partial class DocumentsPage : Page
{
    private AlfredApiClient? _api;

    public DocumentsPage()
    {
        InitializeComponent();
    }

    protected override async void OnNavigatedTo(NavigationEventArgs e)
    {
        base.OnNavigatedTo(e);
        if (e.Parameter is AlfredApiClient api)
            _api = api;
        await LoadPaths();
    }

    private async Task LoadPaths()
    {
        if (_api == null) return;

        var paths = await _api.ListDocumentPathsAsync();
        PathListView.ItemsSource = paths;
        EmptyText.Visibility = paths.Count == 0 ? Visibility.Visible : Visibility.Collapsed;

        var stats = await _api.GetDocumentStatsAsync();
        StatsText.Text = stats?.ToString() ?? "Sin estadisticas disponibles";
    }

    private async void OnAddPath(object sender, RoutedEventArgs e)
    {
        if (_api == null) return;

        var picker = new Windows.Storage.Pickers.FolderPicker();
        picker.SuggestedStartLocation = Windows.Storage.Pickers.PickerLocationId.DocumentsLibrary;
        picker.FileTypeFilter.Add("*");

        // Asociar picker a la ventana
        var hwnd = WinRT.Interop.WindowNative.GetWindowHandle(App.CurrentWindow);
        WinRT.Interop.InitializeWithWindow.Initialize(picker, hwnd);

        var folder = await picker.PickSingleFolderAsync();
        if (folder != null)
        {
            await _api.AddDocumentPathAsync(folder.Path);
            await LoadPaths();
        }
    }

    private async void OnTogglePath(object sender, RoutedEventArgs e)
    {
        if (_api == null) return;
        if (sender is ToggleSwitch toggle && toggle.Tag is long id)
        {
            await _api.UpdateDocumentPathAsync(id, toggle.IsOn);
        }
    }

    private async void OnDeletePath(object sender, RoutedEventArgs e)
    {
        if (_api == null) return;
        if (sender is not Button btn || btn.Tag is not long id) return;

        var dialog = new ContentDialog
        {
            Title = "Eliminar ruta",
            Content = "Se dejara de indexar esta ruta. Los documentos ya indexados se mantienen hasta la proxima re-indexacion.",
            PrimaryButtonText = "Eliminar",
            CloseButtonText = "Cancelar",
            XamlRoot = this.XamlRoot
        };

        if (await dialog.ShowAsync() == ContentDialogResult.Primary)
        {
            await _api.DeleteDocumentPathAsync(id);
            await LoadPaths();
        }
    }

    private async void OnReindex(object sender, RoutedEventArgs e)
    {
        if (_api == null) return;

        if (sender is Button btn)
            btn.IsEnabled = false;

        try
        {
            await _api.ReindexDocumentsAsync();
            await LoadPaths();
        }
        finally
        {
            if (sender is Button b)
                b.IsEnabled = true;
        }
    }
}
