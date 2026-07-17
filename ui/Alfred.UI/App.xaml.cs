using Alfred.UI.Services;
using Microsoft.UI.Xaml;
using Microsoft.Windows.AppLifecycle;
using System;
using System.Diagnostics;
using System.IO;

namespace Alfred.UI;

public partial class App : Application
{
    private Window? _window;

    public App()
    {
        this.InitializeComponent();

        // Handler global: sin esto, cualquier excepcion no observada en un
        // handler async void mata el proceso en silencio. La registramos en
        // disco para poder diagnosticar cierres inesperados.
        this.UnhandledException += OnUnhandledException;
        AppDomain.CurrentDomain.UnhandledException += OnDomainUnhandledException;
        System.Threading.Tasks.TaskScheduler.UnobservedTaskException += OnUnobservedTaskException;
    }

    protected override void OnLaunched(LaunchActivatedEventArgs args)
    {
        // Instancia unica: si ya hay una instancia de Alfred corriendo,
        // redirigir la activacion a ella y salir. Evita dos backends
        // peleando por el puerto 8000.
        var keyInstance = AppInstance.FindOrRegisterForKey("Alfred-Main-Instance");
        if (!keyInstance.IsCurrent)
        {
            var activatedArgs = AppInstance.GetCurrent().GetActivatedEventArgs();
            keyInstance.RedirectActivationToAsync(activatedArgs).AsTask().Wait();
            Process.GetCurrentProcess().Kill();
            return;
        }

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

    // ------------------------------------------------------------------
    // Registro de excepciones no controladas
    // ------------------------------------------------------------------
    private static void LogCrash(string source, Exception? ex)
    {
        try
        {
            string dir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "Alfred", "logs");
            Directory.CreateDirectory(dir);
            string line = $"[{DateTimeOffset.Now:yyyy-MM-dd HH:mm:ss}] ({source}) " +
                          $"{ex?.GetType().Name}: {ex?.Message}\n{ex?.StackTrace}\n\n";
            File.AppendAllText(Path.Combine(dir, "ui-crash.log"), line);
        }
        catch { /* el logging de crash nunca debe lanzar */ }
    }

    private void OnUnhandledException(object sender,
        Microsoft.UI.Xaml.UnhandledExceptionEventArgs e)
    {
        LogCrash("UI", e.Exception);
        // Marcar como manejada para no derribar el proceso por un fallo
        // recuperable (p.ej. una excepcion en un handler de UI).
        e.Handled = true;
    }

    private void OnDomainUnhandledException(object sender, UnhandledExceptionEventArgs e)
        => LogCrash("AppDomain", e.ExceptionObject as Exception);

    private void OnUnobservedTaskException(object? sender,
        System.Threading.Tasks.UnobservedTaskExceptionEventArgs e)
    {
        LogCrash("Task", e.Exception);
        e.SetObserved();
    }
}
