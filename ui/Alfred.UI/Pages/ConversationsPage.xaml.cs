using Alfred.UI.Models;
using Alfred.UI.Services;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Navigation;

namespace Alfred.UI.Pages;

public sealed partial class ConversationsPage : Page
{
    private AlfredApiClient? _api;

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

    private async Task LoadConversations()
    {
        if (_api == null) return;

        var conversations = await _api.ListConversationsAsync();
        ConversationListView.ItemsSource = conversations;
        EmptyText.Visibility = conversations.Count == 0 ? Visibility.Visible : Visibility.Collapsed;
    }

    private async void OnNewConversation(object sender, RoutedEventArgs e)
    {
        if (_api == null) return;

        var dialog = new ContentDialog
        {
            Title = "Nueva conversacion",
            PrimaryButtonText = "Crear",
            CloseButtonText = "Cancelar",
            XamlRoot = this.XamlRoot
        };

        var input = new TextBox { PlaceholderText = "Titulo (opcional)" };
        dialog.Content = input;

        var result = await dialog.ShowAsync();
        if (result == ContentDialogResult.Primary)
        {
            await _api.CreateConversationAsync(input.Text.Trim());
            await LoadConversations();
        }
    }

    private void OnOpenConversation(object sender, RoutedEventArgs e)
    {
        if (sender is Button btn && btn.Tag is string id)
        {
            // Navegar al chat con esta conversacion
            Frame.Navigate(typeof(ChatPage), _api);
            if (Frame.Content is ChatPage chatPage)
            {
                _ = chatPage.LoadConversationAsync(id);
            }
        }
    }

    private async void OnDeleteConversation(object sender, RoutedEventArgs e)
    {
        if (_api == null) return;
        if (sender is not Button btn || btn.Tag is not string id) return;

        var dialog = new ContentDialog
        {
            Title = "Eliminar conversacion",
            Content = "Esta accion no se puede deshacer.",
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
}
