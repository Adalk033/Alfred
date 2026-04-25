using Alfred.UI.Services;
using Microsoft.UI.Xaml;

namespace Alfred.UI;

public partial class App : Application
{
    private Window? _window;

    public App()
    {
        this.InitializeComponent();
    }

    protected override void OnLaunched(LaunchActivatedEventArgs args)
    {
        // Registrar el singleton de preferencias como recurso global ANTES de
        // crear la ventana para que los DataTemplates puedan enlazar
        // tipografía/densidad vía {Binding ..., Source={StaticResource Prefs}}.
        // Hacerlo con Add y try/catch evita matar el arranque si por algún
        // motivo el recurso ya estuviera registrado o el dictionary lo rechaza.
        try
        {
            if (!this.Resources.ContainsKey("Prefs"))
                this.Resources.Add("Prefs", UiPreferences.Instance);
        }
        catch { /* best effort: las páginas seguirán funcionando con tamaños fijos en items */ }

        UiPreferences.Instance.ApplyAccent();
        _window = new MainWindow();
        // Aplicar tema ANTES de Activate para que el chrome (NavigationView,
        // Frame, titlebar Mica) se pinte con el tema correcto desde el primer
        // frame. Aplicarlo despues deja partes de la UI con el tema del sistema.
        UiPreferences.Instance.ApplyTheme();
        _window.Activate();
    }

    public static Window? CurrentWindow => ((App)Current)._window;
}
