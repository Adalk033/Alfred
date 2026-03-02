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

    public HistoryPage()
    {
        InitializeComponent();
    }

    protected override async void OnNavigatedTo(NavigationEventArgs e)
    {
        base.OnNavigatedTo(e);
        if (e.Parameter is AlfredApiClient api)
            _api = api;
        await LoadHistory();
    }

    private async Task LoadHistory()
    {
        if (_api == null) return;

        var entries = await _api.GetHistoryAsync();
        HistoryListView.ItemsSource = entries;
        EmptyText.Visibility = entries.Count == 0 ? Visibility.Visible : Visibility.Collapsed;
    }

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
            await LoadHistory();
            return;
        }

        var results = await _api.SearchHistoryAsync(query);
        HistoryListView.ItemsSource = results;
        EmptyText.Visibility = results.Count == 0 ? Visibility.Visible : Visibility.Collapsed;
    }
}
