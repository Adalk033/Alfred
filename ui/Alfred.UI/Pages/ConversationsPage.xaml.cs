using Alfred.UI.Models;
using Alfred.UI.Services;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Navigation;
using Windows.System;

namespace Alfred.UI.Pages;

public sealed partial class ConversationsPage : Page
{
    private AlfredApiClient? _api;
    private List<ConversationThread> _allConversations = [];

    public ConversationsPage()
    {
        InitializeComponent();
    }

    protected override async void OnNavigatedTo(NavigationEventArgs e)
    {
        base.OnNavigatedTo(e);
        if (e.Parameter is AlfredApiClient api)
            _api = api;
        await LoadConversations();
    }

    // ========================================================================
    // Carga de datos
    // ========================================================================

    private async Task LoadConversations()
    {
        if (_api == null) return;

        _allConversations = await _api.ListConversationsAsync();
        ApplyFilter();
    }

    private void ApplyFilter()
    {
        string query = SearchBox.Text.Trim();
        List<ConversationThread> filtered;

        if (string.IsNullOrEmpty(query))
        {
            filtered = _allConversations;
        }
        else
        {
            filtered = _allConversations
                .Where(c => c.Title.Contains(query, StringComparison.OrdinalIgnoreCase))
                .ToList();
        }

        ConversationListView.ItemsSource = filtered;
        EmptyPanel.Visibility = filtered.Count == 0 ? Visibility.Visible : Visibility.Collapsed;
        CountText.Text = filtered.Count == _allConversations.Count
            ? $"{filtered.Count} total"
            : $"{filtered.Count} de {_allConversations.Count}";
    }

    // ========================================================================
    // Busqueda
    // ========================================================================

    private void OnSearchTextChanged(object sender, TextChangedEventArgs e)
    {
        ClearSearchButton.Visibility = string.IsNullOrEmpty(SearchBox.Text)
            ? Visibility.Collapsed : Visibility.Visible;
        ApplyFilter();
    }

    private void OnSearchKeyDown(object sender, KeyRoutedEventArgs e)
    {
        if (e.Key == VirtualKey.Escape)
        {
            SearchBox.Text = "";
            e.Handled = true;
        }
    }

    private void OnClearSearch(object sender, RoutedEventArgs e)
    {
        SearchBox.Text = "";
    }

    // ========================================================================
    // Acciones
    // ========================================================================

    private void OnOpenConversation(object sender, RoutedEventArgs e)
    {
        if (sender is Button btn && btn.Tag is string id)
        {
            Frame.Navigate(typeof(ChatPage), _api);
            if (Frame.Content is ChatPage chatPage)
            {
                _ = chatPage.LoadConversationAsync(id);
            }
        }
    }

    private async void OnRenameConversation(object sender, RoutedEventArgs e)
    {
        if (_api == null) return;
        if (sender is not Button btn || btn.Tag is not ConversationThread conv) return;

        var input = new TextBox
        {
            Text = conv.Title,
            PlaceholderText = "Nuevo titulo"
        };

        var dialog = new ContentDialog
        {
            Title = "Renombrar conversacion",
            Content = input,
            PrimaryButtonText = "Guardar",
            CloseButtonText = "Cancelar",
            XamlRoot = this.XamlRoot
        };

        var result = await dialog.ShowAsync();
        if (result == ContentDialogResult.Primary)
        {
            string newTitle = input.Text.Trim();
            if (!string.IsNullOrEmpty(newTitle) && newTitle != conv.Title)
            {
                await _api.UpdateConversationTitleAsync(conv.Id, newTitle);
                await LoadConversations();
            }
        }
    }

    private async void OnDeleteConversation(object sender, RoutedEventArgs e)
    {
        if (_api == null) return;
        if (sender is not Button btn || btn.Tag is not string id) return;

        var conv = _allConversations.FirstOrDefault(c => c.Id == id);
        string title = conv?.Title ?? "esta conversacion";

        var dialog = new ContentDialog
        {
            Title = "Eliminar conversacion",
            Content = $"Se eliminara \"{title}\" y todos sus mensajes.\nEsta accion no se puede deshacer.",
            PrimaryButtonText = "Eliminar",
            CloseButtonText = "Cancelar",
            XamlRoot = this.XamlRoot
        };

        var result = await dialog.ShowAsync();
        if (result == ContentDialogResult.Primary)
        {
            await _api.DeleteConversationAsync(id);
            await LoadConversations();
        }
    }

    // ========================================================================
    // Seleccion multiple + eliminacion en lote
    // ========================================================================

    private void OnEnterSelectMode(object sender, RoutedEventArgs e)
    {
        ConversationListView.SelectionMode = ListViewSelectionMode.Multiple;
        ConversationListView.SelectionChanged += OnSelectionCountChanged;
        DeleteSelectedButton.Visibility = Visibility.Visible;
        DeleteSelectedButton.IsEnabled  = false;
        DeleteSelectedLabel.Text        = "Eliminar seleccionadas";
    }

    private void OnExitSelectMode(object sender, RoutedEventArgs e)
    {
        ConversationListView.SelectionChanged -= OnSelectionCountChanged;
        ConversationListView.SelectedItems.Clear();
        ConversationListView.SelectionMode = ListViewSelectionMode.None;
        DeleteSelectedButton.Visibility = Visibility.Collapsed;
        DeleteSelectedButton.IsEnabled  = false;
    }

    private void OnSelectionCountChanged(object sender, SelectionChangedEventArgs e)
    {
        int n = ConversationListView.SelectedItems.Count;
        DeleteSelectedLabel.Text  = n > 0 ? $"Eliminar seleccionadas ({n})" : "Eliminar seleccionadas";
        DeleteSelectedButton.IsEnabled = n > 0;
    }

    private async void OnDeleteSelected(object sender, RoutedEventArgs e)
    {
        if (_api == null) return;

        var selected = ConversationListView.SelectedItems
            .OfType<ConversationThread>()
            .ToList();
        if (selected.Count == 0) return;

        string preview = selected.Count <= 3
            ? string.Join("\n", selected.Select(c => $"• {c.Title}"))
            : string.Join("\n", selected.Take(3).Select(c => $"• {c.Title}"))
              + $"\n• ... y {selected.Count - 3} mas";

        var dialog = new ContentDialog
        {
            Title             = $"Eliminar {selected.Count} conversaciones",
            Content           = $"Se eliminaran las siguientes conversaciones y todos sus mensajes. "
                              + "Esta accion no se puede deshacer.\n\n" + preview,
            PrimaryButtonText = "Eliminar",
            CloseButtonText   = "Cancelar",
            DefaultButton     = ContentDialogButton.Close,
            XamlRoot          = this.XamlRoot
        };

        var result = await dialog.ShowAsync();
        if (result != ContentDialogResult.Primary) return;

        DeleteSelectedButton.IsEnabled = false;

        // Borrado en paralelo; contamos exitos/fallos para reportar con precision.
        var tasks   = selected.Select(c => _api.DeleteConversationAsync(c.Id)).ToArray();
        var results = await Task.WhenAll(tasks);
        int ok   = results.Count(r => r);
        int fail = results.Length - ok;

        SelectModeToggle.IsChecked = false;   // dispara OnExitSelectMode -> limpia estado
        await LoadConversations();

        if (fail == 0)
            NotificationService.Instance.ShowSuccess(
                $"{ok} conversaciones eliminadas correctamente.");
        else
            NotificationService.Instance.ShowWarning(
                $"{ok} eliminadas, {fail} con error. Reintenta en unos segundos.");
    }
}
