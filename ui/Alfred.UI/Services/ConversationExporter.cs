using System;
using System.Text;
using Alfred.UI.Models;

namespace Alfred.UI.Services;

/// <summary>
/// Convierte una conversacion a Markdown para exportarla a un archivo.
/// </summary>
public static class ConversationExporter
{
    /// <summary>
    /// Genera el Markdown de una conversacion. Los roles se marcan con
    /// encabezados y el contenido se preserva tal cual (los bloques de codigo
    /// del modelo ya vienen en Markdown).
    /// </summary>
    public static string ToMarkdown(ConversationDetail detail)
    {
        var sb = new StringBuilder();
        string title = string.IsNullOrWhiteSpace(detail.Title) ? "Conversacion" : detail.Title;

        sb.Append("# ").AppendLine(title);
        if (!string.IsNullOrEmpty(detail.UpdatedAt))
            sb.Append("_Actualizada: ").Append(detail.UpdatedAt).AppendLine("_");
        sb.AppendLine();

        foreach (var msg in detail.Messages)
        {
            string who = msg.Role == "user" ? "Usuario" : "Alfred";
            sb.Append("## ").AppendLine(who);
            sb.AppendLine(msg.Content?.TrimEnd() ?? "");
            sb.AppendLine();
        }

        return sb.ToString();
    }

    /// <summary>
    /// Nombre de archivo seguro a partir del titulo de la conversacion.
    /// </summary>
    public static string SuggestFileName(string? title)
    {
        string baseName = string.IsNullOrWhiteSpace(title) ? "conversacion" : title;
        foreach (char c in System.IO.Path.GetInvalidFileNameChars())
            baseName = baseName.Replace(c, '_');
        if (baseName.Length > 60) baseName = baseName.Substring(0, 60);
        return baseName.Trim();
    }
}
