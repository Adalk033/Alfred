using Alfred.UI.Services;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Navigation;

namespace Alfred.UI.Pages;

public sealed partial class SettingsPage : Page
{
    private AlfredApiClient? _api;

    public SettingsPage()
    {
        InitializeComponent();
    }

    protected override async void OnNavigatedTo(NavigationEventArgs e)
    {
        base.OnNavigatedTo(e);
        if (e.Parameter is AlfredApiClient api)
            _api = api;
        await LoadSettings();
    }

    private async Task LoadSettings()
    {
        if (_api == null) return;

        // Cargar perfil de usuario
        var settings = await _api.GetUserSettingsAsync();
        UserNameBox.Text = settings.GetValueOrDefault("user_name", "");
        UserAgeBox.Text = settings.GetValueOrDefault("user_age", "");
        UserOccupationBox.Text = settings.GetValueOrDefault("user_occupation", "");
        AboutUserBox.Text = settings.GetValueOrDefault("about_user", "");

        // Cargar info GPU
        var gpu = await _api.GetGpuReportAsync();
        if (gpu != null)
        {
            GpuStatusText.Text = gpu.HasCuda
                ? $"CUDA disponible\n{gpu.Report}"
                : $"Sin CUDA\n{gpu.Report}";
        }
        else
        {
            GpuStatusText.Text = "No se pudo obtener info de GPU";
        }
    }

    private async void OnSaveProfile(object sender, RoutedEventArgs e)
    {
        if (_api == null) return;

        if (sender is Button btn)
            btn.IsEnabled = false;

        try
        {
            string name = UserNameBox.Text.Trim();
            string age = UserAgeBox.Text.Trim();
            string occupation = UserOccupationBox.Text.Trim();
            string about = AboutUserBox.Text.Trim();

            if (!string.IsNullOrEmpty(name))
                await _api.SetUserSettingAsync("user_name", name);
            if (!string.IsNullOrEmpty(age))
                await _api.SetUserSettingAsync("user_age", age);
            if (!string.IsNullOrEmpty(occupation))
                await _api.SetUserSettingAsync("user_occupation", occupation);
            if (!string.IsNullOrEmpty(about))
                await _api.SetUserSettingAsync("about_user", about);

            var dialog = new ContentDialog
            {
                Title = "Perfil guardado",
                Content = "Los cambios se aplicaron correctamente.",
                CloseButtonText = "Aceptar",
                XamlRoot = this.XamlRoot
            };
            await dialog.ShowAsync();
        }
        catch (Exception ex)
        {
            var dialog = new ContentDialog
            {
                Title = "Error",
                Content = $"No se pudo guardar: {ex.Message}",
                CloseButtonText = "Aceptar",
                XamlRoot = this.XamlRoot
            };
            await dialog.ShowAsync();
        }
        finally
        {
            if (sender is Button b)
                b.IsEnabled = true;
        }
    }
}
