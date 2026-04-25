using System.ComponentModel;
using System.Runtime.CompilerServices;
using Microsoft.UI;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Media;
using System.Text.Json;
using System.Text.Json.Serialization;
using Windows.UI;

namespace Alfred.UI.Services;

public enum AppTheme { System, Light, Dark }
public enum UiDensity { Comfortable, Compact }

/// <summary>
/// Preferencias de UI persistidas en un archivo JSON en %LOCALAPPDATA%\Alfred\.
/// Compatible con apps sin paquete (WindowsPackageType=None).
/// </summary>
public sealed class UiPreferences : INotifyPropertyChanged
{
    public static UiPreferences Instance { get; } = new();

    private static readonly string _filePath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "Alfred", "preferences.json");

    public static readonly (string Name, string Hex)[] AccentPalette =
    [
        ("Indigo",    "#6366F1"),
        ("Violet",    "#8B5CF6"),
        ("Cyan",      "#06B6D4"),
        ("Emerald",   "#10B981"),
        ("Amber",     "#F59E0B"),
        ("Rose",      "#F43F5E"),
        ("Slate",     "#64748B"),
    ];

    public AppTheme Theme       { get; private set; } = AppTheme.System;
    public string   AccentHex   { get; private set; } = "#6366F1";
    public UiDensity Density    { get; private set; } = UiDensity.Comfortable;
    /// <summary>Tamaño base del texto (px). Rango razonable: 11–22.</summary>
    public double   FontSize    { get; private set; } = 14.0;
    public bool     Animations  { get; private set; } = true;

    // ====================================================================
    // Propiedades derivadas para data binding (x:Bind ... Mode=OneWay)
    // ====================================================================

    public double BodyFontSize          => FontSize;
    public double CaptionFontSize       => Math.Max(10, FontSize - 2);
    public double SmallFontSize         => Math.Max(10, FontSize - 3);
    public double TinyFontSize          => Math.Max(9,  FontSize - 4);
    public double SubheaderFontSize     => FontSize + 2;
    public double SectionHeaderFontSize => FontSize + 4;
    public double PageTitleFontSize     => FontSize + 10;

    /// <summary>Padding general de páginas: contenido principal.</summary>
    public Thickness PagePadding =>
        Density == UiDensity.Compact
            ? new Thickness(14, 12, 14, 12)
            : new Thickness(24, 20, 24, 20);

    /// <summary>Padding interior de tarjetas / items de listas.</summary>
    public Thickness CardPadding =>
        Density == UiDensity.Compact
            ? new Thickness(10, 7, 10, 7)
            : new Thickness(16, 12, 16, 12);

    /// <summary>Espaciado vertical entre secciones.</summary>
    public double SectionSpacing => Density == UiDensity.Compact ? 6 : 12;

    /// <summary>Espaciado horizontal entre items inline.</summary>
    public double InlineSpacing  => Density == UiDensity.Compact ? 6 : 10;

    public event PropertyChangedEventHandler? PropertyChanged;
    public event Action? Changed;

    private void RaiseAll()
    {
        // Notifica todas las propiedades con un PropertyName vacío para que
        // los enlaces x:Bind y {Binding} se reevalúen completos. Mantenemos
        // también el evento Changed legado.
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(string.Empty));
        Changed?.Invoke();
    }

    private UiPreferences() => Load();

    private void Load()
    {
        try
        {
            if (!File.Exists(_filePath)) return;
            var json = File.ReadAllText(_filePath);
            var data = JsonSerializer.Deserialize<PrefsData>(json);
            if (data == null) return;

            if (Enum.TryParse<AppTheme>(data.Theme, out var theme)) Theme = theme;
            if (!string.IsNullOrWhiteSpace(data.AccentHex)) AccentHex = data.AccentHex;
            if (Enum.TryParse<UiDensity>(data.Density, out var den)) Density = den;
            FontSize = Math.Clamp(data.FontSize > 0 ? data.FontSize : 14.0, 11, 22);
            Animations = data.Animations;
        }
        catch { /* preferencias corruptas: usar defaults */ }
    }

    private void Save()
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(_filePath)!);
            var data = new PrefsData
            {
                Theme     = Theme.ToString(),
                AccentHex = AccentHex,
                Density   = Density.ToString(),
                FontSize  = FontSize,
                Animations = Animations,
            };
            File.WriteAllText(_filePath, JsonSerializer.Serialize(data, new JsonSerializerOptions { WriteIndented = true }));
        }
        catch { /* best effort */ }
    }

    public void SetTheme(AppTheme theme)
    {
        if (Theme == theme) return;
        Theme = theme;
        Save();
        ApplyTheme();
        RaiseAll();
    }

    public void SetAccent(string hex)
    {
        if (string.Equals(AccentHex, hex, StringComparison.OrdinalIgnoreCase)) return;
        AccentHex = hex;
        Save();
        ApplyAccent();
        RaiseAll();
    }

    public void SetDensity(UiDensity density)
    {
        if (Density == density) return;
        Density = density;
        Save();
        RaiseAll();
    }

    public void SetFontSize(double size)
    {
        size = Math.Clamp(size, 11, 22);
        if (Math.Abs(FontSize - size) < 0.01) return;
        FontSize = size;
        Save();
        RaiseAll();
    }

    public void SetAnimations(bool on)
    {
        if (Animations == on) return;
        Animations = on;
        Save();
        RaiseAll();
    }

    /// <summary>
    /// Aplica el tema actual a la ventana principal.
    /// </summary>
    public void ApplyTheme()
    {
        if (App.CurrentWindow?.Content is FrameworkElement root)
        {
            root.RequestedTheme = Theme switch
            {
                AppTheme.Light => ElementTheme.Light,
                AppTheme.Dark  => ElementTheme.Dark,
                _              => ElementTheme.Default
            };
        }
    }

    /// <summary>
    /// Muta el color de los brushes globales AlfredAccent y UserBubble.
    /// </summary>
    public void ApplyAccent()
    {
        var color = TryParseHex(AccentHex) ?? Color.FromArgb(255, 99, 102, 241);
        var resources = Application.Current.Resources;

        if (resources["AlfredAccent"] is SolidColorBrush accent) accent.Color = color;
        if (resources["UserBubble"]  is SolidColorBrush bubble) bubble.Color = color;
    }

    public static Color? TryParseHex(string hex)
    {
        if (string.IsNullOrWhiteSpace(hex)) return null;
        hex = hex.Trim();
        if (hex.StartsWith('#')) hex = hex[1..];
        if (hex.Length == 6) hex = "FF" + hex;
        if (hex.Length != 8) return null;
        try
        {
            byte a = Convert.ToByte(hex[..2], 16);
            byte r = Convert.ToByte(hex.Substring(2, 2), 16);
            byte g = Convert.ToByte(hex.Substring(4, 2), 16);
            byte b = Convert.ToByte(hex.Substring(6, 2), 16);
            return Color.FromArgb(a, r, g, b);
        }
        catch { return null; }
    }

    private sealed class PrefsData
    {
        [JsonPropertyName("theme")]     public string Theme     { get; set; } = "System";
        [JsonPropertyName("accentHex")] public string AccentHex { get; set; } = "#6366F1";
        [JsonPropertyName("density")]   public string Density   { get; set; } = "Comfortable";
        [JsonPropertyName("fontSize")]  public double FontSize  { get; set; } = 14.0;
        [JsonPropertyName("animations")]public bool   Animations { get; set; } = true;
    }
}
