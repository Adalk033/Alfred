using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Media;
using Windows.UI;

namespace Alfred.UI.Services;

/// <summary>
/// Resolución de brushes que respeta el tema *real* del elemento (ActualTheme),
/// no sólo el RequestedTheme global de la aplicación. Esto evita que los
/// componentes creados en code-behind usen los colores del tema del sistema
/// cuando el usuario forzó otro tema desde Configuración.
/// </summary>
public static class ThemedBrushes
{
    /// <summary>
    /// Resuelve un brush por clave. Si <paramref name="hint"/> está rooteado
    /// en el visual tree, se usa su ActualTheme; si no, se cae al RequestedTheme
    /// del root de la ventana, y por último al RequestedTheme de la aplicación.
    /// </summary>
    public static Brush Get(string key, Color fallback, FrameworkElement? hint = null)
    {
        var theme = ResolveTheme(hint);
        string themeName = theme == ElementTheme.Light ? "Light" : "Dark";

        // 1) ThemeDictionaries directos en Application.Resources (los nuestros)
        if (Application.Current.Resources.ThemeDictionaries.TryGetValue(themeName, out var rdObj)
            && rdObj is ResourceDictionary rd
            && rd.TryGetValue(key, out var v1) && v1 is Brush b1)
            return b1;

        // 2) ThemeDictionaries dentro de los MergedDictionaries (XamlControlsResources)
        foreach (var md in Application.Current.Resources.MergedDictionaries)
        {
            if (md.ThemeDictionaries.TryGetValue(themeName, out var sysRdObj)
                && sysRdObj is ResourceDictionary sysRd
                && sysRd.TryGetValue(key, out var v2) && v2 is Brush b2)
                return b2;
        }

        // 3) Lookup top-level (recursos no-themed: AlfredAccent, UserBubble, etc.)
        if (Application.Current.Resources.TryGetValue(key, out var v3) && v3 is Brush b3)
            return b3;

        return new SolidColorBrush(fallback);
    }

    public static ElementTheme ResolveTheme(FrameworkElement? hint = null)
    {
        if (hint != null)
        {
            var actual = hint.ActualTheme;
            if (actual != ElementTheme.Default)
                return actual;
        }

        if (App.CurrentWindow?.Content is FrameworkElement root)
        {
            var actual = root.ActualTheme;
            if (actual != ElementTheme.Default)
                return actual;

            var requested = root.RequestedTheme;
            if (requested != ElementTheme.Default)
                return requested;
        }

        return Application.Current.RequestedTheme == ApplicationTheme.Light
            ? ElementTheme.Light
            : ElementTheme.Dark;
    }
}
