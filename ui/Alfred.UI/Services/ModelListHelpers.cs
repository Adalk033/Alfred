using Alfred.UI.Models;

namespace Alfred.UI.Services;

/// <summary>
/// Helpers para normalizar y deduplicar listas de modelos. Los modelos pueden
/// aparecer duplicados cuando un mismo path llega desde distintas fuentes
/// (recientes persistidos + escaneo en disco) o con variaciones de casing /
/// separadores en Windows.
/// </summary>
public static class ModelListHelpers
{
    /// <summary>
    /// Normaliza un path para comparar unicidad: convierte separadores,
    /// recorta espacios y pasa a lowercase (filesystem de Windows es
    /// case-insensitive). Si el input esta vacio, devuelve el nombre como
    /// fallback para evitar que paths vacios colapsen en un solo entry.
    /// </summary>
    public static string NormalizePath(string? path, string? fallbackName = null)
    {
        if (string.IsNullOrWhiteSpace(path))
            return $"__name__:{(fallbackName ?? "").Trim().ToLowerInvariant()}";

        string normalized = path.Trim().Replace('/', '\\');
        while (normalized.Contains(@"\\"))
            normalized = normalized.Replace(@"\\", @"\");
        return normalized.ToLowerInvariant();
    }

    /// <summary>
    /// Devuelve la lista sin duplicados conservando el primer elemento para
    /// cada path normalizado. Si dos modelos tienen el mismo path pero
    /// nombres distintos, gana el primero en aparecer.
    /// </summary>
    public static List<ModelInfo> Deduplicate(IEnumerable<ModelInfo>? models)
    {
        if (models == null) return [];

        var seen = new HashSet<string>(StringComparer.Ordinal);
        var result = new List<ModelInfo>();
        foreach (var m in models)
        {
            if (m == null) continue;
            string key = NormalizePath(m.Path, m.Name);
            if (seen.Add(key))
                result.Add(m);
        }
        return result;
    }
}
