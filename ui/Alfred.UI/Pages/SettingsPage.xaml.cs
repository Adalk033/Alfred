using Alfred.UI.Services;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media.Imaging;
using Microsoft.UI.Xaml.Navigation;
using System.Runtime.InteropServices.WindowsRuntime;
using Windows.Storage;
using Windows.Storage.Pickers;

namespace Alfred.UI.Pages;

public sealed partial class SettingsPage : Page
{
    private AlfredApiClient? _api;
    private bool _isLoadingEncryption;

    public SettingsPage()
    {
        InitializeComponent();
    }

    protected override async void OnNavigatedTo(NavigationEventArgs e)
    {
        base.OnNavigatedTo(e);
        if (e.Parameter is AlfredApiClient api)
            _api = api;
        await LoadAllSettings();
    }

    // ========================================================================
    // Carga de configuracion
    // ========================================================================

    private async Task LoadAllSettings()
    {
        if (_api == null) return;

        // Cargar perfil de usuario
        var settings = await _api.GetUserSettingsAsync();
        UserNameBox.Text = settings.GetValueOrDefault("user_name", "");
        UserAgeBox.Text = settings.GetValueOrDefault("user_age", "");
        UserOccupationBox.Text = settings.GetValueOrDefault("user_occupation", "");
        AboutUserBox.Text = settings.GetValueOrDefault("about_user", "");

        // Cargar foto de perfil
        string profilePic = settings.GetValueOrDefault("profile_picture", "");
        await LoadProfilePicture(profilePic);
        if (!string.IsNullOrEmpty(settings.GetValueOrDefault("user_name", "")))
            ProfilePicture.DisplayName = settings.GetValueOrDefault("user_name", "?");

        // Cargar personalizacion
        AssistantNameBox.Text = settings.GetValueOrDefault("assistant_name", "Alfred");
        CustomInstructionsBox.Text = settings.GetValueOrDefault("custom_instructions", "");

        // Tono de respuesta
        string tone = settings.GetValueOrDefault("response_tone", "professional");
        for (int i = 0; i < ToneCombo.Items.Count; i++)
        {
            if (ToneCombo.Items[i] is ComboBoxItem item && item.Tag?.ToString() == tone)
            {
                ToneCombo.SelectedIndex = i;
                break;
            }
        }

        // Limite de contexto
        if (int.TryParse(settings.GetValueOrDefault("context_limit", "10"), out int contextLimit))
        {
            ContextLimitBox.Value = contextLimit;
        }

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

        // Cargar timeout de descarga del modelo
        var timeoutStr = await _api.GetAppSettingAsync("model_idle_timeout_sec");
        if (int.TryParse(timeoutStr, out int idleTimeout))
            IdleTimeoutBox.Value = idleTimeout;
        else
            IdleTimeoutBox.Value = 10;

        // Cargar estado de cifrado
        await LoadEncryptionStatus();
    }

    private async Task LoadEncryptionStatus()
    {
        if (_api == null) return;

        _isLoadingEncryption = true;
        try
        {
            var status = await _api.GetEncryptionStatusAsync();
            if (status != null)
            {
                EncryptionToggle.IsOn = status.Enabled;
                EncryptionStatusText.Text = status.Enabled ? "Habilitado" : "Deshabilitado";
                EncryptionKeyText.Text = status.HasKey ? "Configurada" : "No configurada";
            }
            else
            {
                EncryptionStatusText.Text = "No disponible";
                EncryptionKeyText.Text = "";
            }
        }
        catch
        {
            EncryptionStatusText.Text = "Error al verificar";
        }
        finally
        {
            _isLoadingEncryption = false;
        }
    }

    // ========================================================================
    // Guardar perfil
    // ========================================================================

    private async void OnSaveProfile(object sender, RoutedEventArgs e)
    {
        if (_api == null) return;

        if (sender is Button btn)
            btn.IsEnabled = false;

        try
        {
            await SaveSettingIfNotEmpty("user_name", UserNameBox.Text);
            await SaveSettingIfNotEmpty("user_age", UserAgeBox.Text);
            await SaveSettingIfNotEmpty("user_occupation", UserOccupationBox.Text);
            await SaveSettingIfNotEmpty("about_user", AboutUserBox.Text);

            await ShowDialog("Perfil guardado", "Los cambios se aplicaron correctamente.");
        }
        catch (Exception ex)
        {
            await ShowDialog("Error", $"No se pudo guardar: {ex.Message}");
        }
        finally
        {
            if (sender is Button b)
                b.IsEnabled = true;
        }
    }

    // ========================================================================
    // Foto de perfil
    // ========================================================================

    private async void OnChangeProfilePicture(object sender, RoutedEventArgs e)
    {
        if (_api == null) return;

        var picker = new FileOpenPicker();
        picker.SuggestedStartLocation = PickerLocationId.PicturesLibrary;
        picker.FileTypeFilter.Add(".jpg");
        picker.FileTypeFilter.Add(".jpeg");
        picker.FileTypeFilter.Add(".png");
        picker.FileTypeFilter.Add(".bmp");

        // WinUI 3 requiere HWND
        var hwnd = WinRT.Interop.WindowNative.GetWindowHandle(App.CurrentWindow);
        WinRT.Interop.InitializeWithWindow.Initialize(picker, hwnd);

        StorageFile? file = await picker.PickSingleFileAsync();
        if (file == null) return;

        try
        {
            var props = await file.GetBasicPropertiesAsync();
            if (props.Size > 5 * 1024 * 1024) // 5 MB
            {
                NotificationService.Instance.ShowWarning("La imagen no debe superar 5 MB.");
                return;
            }

            byte[] bytes = await ReadFileBytes(file);
            string base64 = Convert.ToBase64String(bytes);

            await _api.SetUserSettingAsync("profile_picture", base64);
            await LoadProfilePicture(base64);

            NotificationService.Instance.ShowSuccess("Foto de perfil actualizada.");
        }
        catch (Exception ex)
        {
            NotificationService.Instance.ShowError($"Error al cambiar foto: {ex.Message}");
        }
    }

    private async void OnRemoveProfilePicture(object sender, RoutedEventArgs e)
    {
        if (_api == null) return;

        try
        {
            await _api.DeleteUserSettingAsync("profile_picture");
            ProfilePicture.ProfilePicture = null;
            RemovePictureButton.Visibility = Visibility.Collapsed;

            NotificationService.Instance.ShowInfo("Foto de perfil eliminada.");
        }
        catch (Exception ex)
        {
            NotificationService.Instance.ShowError($"Error al quitar foto: {ex.Message}");
        }
    }

    private async Task LoadProfilePicture(string base64)
    {
        if (string.IsNullOrEmpty(base64))
        {
            ProfilePicture.ProfilePicture = null;
            RemovePictureButton.Visibility = Visibility.Collapsed;
            return;
        }

        try
        {
            byte[] bytes = Convert.FromBase64String(base64);
            var stream = new Windows.Storage.Streams.InMemoryRandomAccessStream();
            await stream.WriteAsync(bytes.AsBuffer());
            stream.Seek(0);

            var bitmapImage = new BitmapImage();
            await bitmapImage.SetSourceAsync(stream);
            ProfilePicture.ProfilePicture = bitmapImage;
            RemovePictureButton.Visibility = Visibility.Visible;
        }
        catch
        {
            ProfilePicture.ProfilePicture = null;
            RemovePictureButton.Visibility = Visibility.Collapsed;
        }
    }

    private static async Task<byte[]> ReadFileBytes(StorageFile file)
    {
        using var stream = await file.OpenStreamForReadAsync();
        using var ms = new MemoryStream();
        await stream.CopyToAsync(ms);
        return ms.ToArray();
    }

    // ========================================================================
    // Guardar personalizacion
    // ========================================================================

    private async void OnSavePersonalization(object sender, RoutedEventArgs e)
    {
        if (_api == null) return;

        if (sender is Button btn)
            btn.IsEnabled = false;

        try
        {
            string assistantName = AssistantNameBox.Text.Trim();
            if (string.IsNullOrEmpty(assistantName)) assistantName = "Alfred";
            await _api.SetUserSettingAsync("assistant_name", assistantName);

            // Tono
            if (ToneCombo.SelectedItem is ComboBoxItem toneItem)
            {
                string tone = toneItem.Tag?.ToString() ?? "professional";
                await _api.SetUserSettingAsync("response_tone", tone);
            }

            // Limite de contexto
            int contextLimit = (int)ContextLimitBox.Value;
            await _api.SetUserSettingAsync("context_limit", contextLimit.ToString());

            // Instrucciones personalizadas
            string instructions = CustomInstructionsBox.Text.Trim();
            if (!string.IsNullOrEmpty(instructions))
                await _api.SetUserSettingAsync("custom_instructions", instructions);
            else
                await _api.DeleteUserSettingAsync("custom_instructions");

            await ShowDialog("Personalizacion guardada", "La configuracion del asistente se actualizo correctamente.");
        }
        catch (Exception ex)
        {
            await ShowDialog("Error", $"No se pudo guardar: {ex.Message}");
        }
        finally
        {
            if (sender is Button b)
                b.IsEnabled = true;
        }
    }

    // ========================================================================
    // Modelo LLM
    // ========================================================================

    private async void OnIdleTimeoutChanged(NumberBox sender, NumberBoxValueChangedEventArgs args)
    {
        if (_api == null || double.IsNaN(args.NewValue)) return;
        int secs = (int)args.NewValue;
        await _api.SetAppSettingAsync("model_idle_timeout_sec", secs.ToString());
        IdleTimeoutHint.Text = secs == 0
            ? "El modelo permanecera cargado hasta que cierres la app"
            : $"El modelo se descargara tras {secs} segundos sin consultas";
    }

    // ========================================================================
    // Cifrado
    // ========================================================================

    private async void OnEncryptionToggled(object sender, RoutedEventArgs e)
    {
        if (_api == null || _isLoadingEncryption) return;

        bool enabled = EncryptionToggle.IsOn;

        try
        {
            bool success = await _api.SetupEncryptionAsync(enabled);
            if (success)
            {
                await LoadEncryptionStatus();
            }
            else
            {
                _isLoadingEncryption = true;
                EncryptionToggle.IsOn = !enabled;
                _isLoadingEncryption = false;
                await ShowDialog("Error", "No se pudo cambiar el estado del cifrado.");
            }
        }
        catch (Exception ex)
        {
            _isLoadingEncryption = true;
            EncryptionToggle.IsOn = !enabled;
            _isLoadingEncryption = false;
            await ShowDialog("Error", $"Error al configurar cifrado: {ex.Message}");
        }
    }

    // ========================================================================
    // Helpers
    // ========================================================================

    private async Task SaveSettingIfNotEmpty(string key, string value)
    {
        if (_api == null) return;

        string trimmed = value.Trim();
        if (!string.IsNullOrEmpty(trimmed))
            await _api.SetUserSettingAsync(key, trimmed);
    }

    private async Task ShowDialog(string title, string content)
    {
        var dialog = new ContentDialog
        {
            Title = title,
            Content = content,
            CloseButtonText = "Aceptar",
            XamlRoot = this.XamlRoot
        };
        await dialog.ShowAsync();
    }
}
