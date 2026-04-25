using Alfred.UI.Models;
using Alfred.UI.Services;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Navigation;
using Windows.System;

namespace Alfred.UI.Pages;

public sealed partial class HistoryPage : Page
{
    private AlfredApiClient? _api;

    // Paginacion
    private const int PageSize = 10;
    private int _currentPage;
    private int _totalItems;
    private bool _isSearching;

    public UiPreferences Prefs => UiPreferences.Instance;

    public HistoryPage()
    {
        InitializeComponent();
    }

    protected override async void OnNavigatedTo(NavigationEventArgs e)
    {
        base.OnNavigatedTo(e);
        if (e.Parameter is AlfredApiClient api)
            _api = api;
        _currentPage = 0;
        _isSearching = false;
        await LoadHistory();
    }

    // ========================================================================
    // Carga de datos con paginacion
    // ========================================================================

    private async Task LoadHistory()
    {
        if (_api == null) return;

        int offset = _currentPage * PageSize;
        var entries = await _api.GetHistoryAsync(limit: PageSize + 1, offset: offset);

        bool hasMore = entries.Count > PageSize;
        if (hasMore) entries = entries.Take(PageSize).ToList();

        HistoryListView.ItemsSource = entries;
        EmptyText.Visibility = entries.Count == 0 ? Visibility.Visible : Visibility.Collapsed;

        // Obtener total para el contador
        if (!_isSearching)
        {
            var all = await _api.GetHistoryAsync(limit: 10000, offset: 0);
            _totalItems = all.Count;
        }

        UpdatePaginationUI(entries.Count, hasMore);
    }

    private void UpdatePaginationUI(int count, bool hasMore)
    {
        PrevPageButton.IsEnabled = _currentPage > 0;
        NextPageButton.IsEnabled = hasMore;

        if (count == 0 && _currentPage == 0)
        {
            PageInfoText.Text = "";
            CountText.Text = "";
        }
        else
        {
            int start = _currentPage * PageSize + 1;
            int end = start + count - 1;
            PageInfoText.Text = $"Mostrando {start}-{end}";
            CountText.Text = _isSearching ? $"{count} resultados" : $"{_totalItems} registros";
        }
    }

    // ========================================================================
    // Busqueda
    // ========================================================================

    private async void OnSearch(object sender, RoutedEventArgs e)
    {
        await DoSearch();
    }

    private async void OnSearchKeyDown(object sender, KeyRoutedEventArgs e)
    {
        if (e.Key == VirtualKey.Enter)
        {
            e.Handled = true;
            await DoSearch();
        }
    }

    private async Task DoSearch()
    {
        if (_api == null) return;

        string query = SearchBox.Text.Trim();
        if (string.IsNullOrEmpty(query))
        {
            await OnClearSearchAsync();
            return;
        }

        _isSearching = true;
        ClearSearchButton.Visibility = Visibility.Visible;

        var results = await _api.SearchHistoryAsync(query);
        HistoryListView.ItemsSource = results;
        EmptyText.Visibility = results.Count == 0 ? Visibility.Visible : Visibility.Collapsed;

        // Desactivar paginacion en modo busqueda
        PrevPageButton.IsEnabled = false;
        NextPageButton.IsEnabled = false;
        PageInfoText.Text = $"{results.Count} resultados";
        CountText.Text = $"{results.Count} resultados";
    }

    private async void OnClearSearch(object sender, RoutedEventArgs e)
    {
        await OnClearSearchAsync();
    }

    private async Task OnClearSearchAsync()
    {
        SearchBox.Text = "";
        _isSearching = false;
        _currentPage = 0;
        ClearSearchButton.Visibility = Visibility.Collapsed;
        await LoadHistory();
    }

    // ========================================================================
    // Paginacion
    // ========================================================================

    private async void OnPrevPage(object sender, RoutedEventArgs e)
    {
        if (_currentPage > 0)
        {
            _currentPage--;
            await LoadHistory();
        }
    }

    private async void OnNextPage(object sender, RoutedEventArgs e)
    {
        _currentPage++;
        await LoadHistory();
    }

    // ========================================================================
    // Acciones por item
    // ========================================================================

    private void OnLoadInChat(object sender, RoutedEventArgs e)
    {
        if (sender is not Button btn || btn.Tag is not HistoryEntry entry) return;

        // Navegar al chat y cargar la Q&A como contexto
        Frame.Navigate(typeof(ChatPage), _api);
        if (Frame.Content is ChatPage chatPage)
        {
            chatPage.LoadHistoryEntry(entry.Question, entry.Answer);
        }
    }

    private async void OnDeleteEntry(object sender, RoutedEventArgs e)
    {
        if (_api == null) return;
        if (sender is not Button btn || btn.Tag is not HistoryEntry entry) return;

        var dialog = new ContentDialog
        {
            Title = "Eliminar registro",
            Content = $"Se eliminara:\n\"{TruncateText(entry.Question, 80)}\"",
            PrimaryButtonText = "Eliminar",
            CloseButtonText = "Cancelar",
            XamlRoot = this.XamlRoot
        };

        var result = await dialog.ShowAsync();
        if (result == ContentDialogResult.Primary)
        {
            bool deleted = await _api.DeleteHistoryAsync(entry.Timestamp);
            if (deleted)
            {
                if (_isSearching)
                    await DoSearch();
                else
                    await LoadHistory();
            }
        }
    }

    // ========================================================================
    // Helpers
    // ========================================================================

    private static string TruncateText(string text, int maxLen)
    {
        if (text.Length <= maxLen) return text;
        return text[..maxLen] + "...";
    }
}
