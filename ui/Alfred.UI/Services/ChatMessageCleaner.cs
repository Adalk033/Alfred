using System.Text.RegularExpressions;

namespace Alfred.UI.Services;

/// <summary>
/// Limpia respuestas del LLM eliminando marcadores internos de razonamiento
/// (channel tags, Execution:, Analysis:, separadores) y extrae el bloque de
/// analisis interno en un campo separado para mostrarlo en un Expander.
/// </summary>
public static class ChatMessageCleaner
{
    public sealed class Cleaned
    {
        public string Text { get; init; } = "";
        public string? Reasoning { get; init; }
    }

    // Tokens tipo <channel|>, <|analysis|>, </channel>, <start_of_turn>, etc.
    private static readonly Regex ChannelTagPattern = new(
        @"<\/?\|?[a-zA-Z][a-zA-Z0-9_\-]*(?:\|[^>]*)?>",
        RegexOptions.Compiled);

    // Parentesis explicando el proceso interno.
    private static readonly Regex InternalParenPattern = new(
        @"\(\s*(?:Response generation based on the analysis|Analysis of the user's question|Based on (?:the|this) analysis|Internal reasoning|Generating response)[^)]*\)",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    // Separadores horizontales aislados.
    private static readonly Regex HorizontalRulePattern = new(
        @"^\s*(?:-{3,}|\*{3,}|_{3,})\s*$",
        RegexOptions.Compiled | RegexOptions.Multiline);

    // Tres o mas saltos de linea consecutivos -> dos.
    private static readonly Regex ExcessiveBlankLinesPattern = new(
        @"(?:\r?\n){3,}",
        RegexOptions.Compiled);

    // Labels que marcan el inicio del bloque "reasoning".
    private static readonly string[] ReasoningLabels =
    [
        "Analysis", "Analisis", "Analisi",
        "Execution", "Ejecucion",
        "Reasoning", "Razonamiento",
        "Thinking", "Pensamiento",
        "Internal", "Interno"
    ];

    // Labels que marcan el inicio del bloque "respuesta final".
    private static readonly string[] ResponseLabels =
    [
        "Response", "Respuesta",
        "Final response", "Respuesta final",
        "Answer", "Resultado", "Output"
    ];

    public static Cleaned Clean(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
            return new Cleaned { Text = raw ?? "" };

        string text = raw;

        text = ChannelTagPattern.Replace(text, "");
        text = InternalParenPattern.Replace(text, "");

        var (reasoning, body) = SplitReasoningAndResponse(text);

        body = Normalize(body);
        string? cleanedReasoning = reasoning != null ? Normalize(reasoning) : null;

        // Si tras normalizar el cuerpo quedo vacio pero hay reasoning,
        // usamos el reasoning como cuerpo (mejor algo que nada).
        if (string.IsNullOrWhiteSpace(body) && !string.IsNullOrWhiteSpace(cleanedReasoning))
        {
            body = cleanedReasoning;
            cleanedReasoning = null;
        }

        return new Cleaned
        {
            Text = body,
            Reasoning = string.IsNullOrWhiteSpace(cleanedReasoning) ? null : cleanedReasoning
        };
    }

    private static (string? reasoning, string body) SplitReasoningAndResponse(string text)
    {
        // Busca un marcador de respuesta final. Todo lo anterior (si contiene
        // un label de reasoning) se considera analisis interno.
        foreach (var label in ResponseLabels)
        {
            var pattern = new Regex(
                $@"(^|\n)\s*(?:\*\*|__)?\s*{Regex.Escape(label)}\s*:\s*(?:\*\*|__)?\s*(\r?\n|\s*)",
                RegexOptions.IgnoreCase);

            var match = pattern.Match(text);
            if (!match.Success) continue;

            string before = text[..match.Index];
            string after = text[(match.Index + match.Length)..];

            if (ContainsReasoningLabel(before))
                return (StripLeadingReasoningLabel(before), after);

            // Aunque no haya label explicito, si hay contenido antes
            // de "Response:", tratarlo como razonamiento.
            if (!string.IsNullOrWhiteSpace(before))
                return (before, after);

            return (null, after);
        }

        return (null, text);
    }

    private static bool ContainsReasoningLabel(string text)
    {
        foreach (var label in ReasoningLabels)
        {
            var pattern = new Regex(
                $@"(^|\n)\s*(?:\*\*|__)?\s*{Regex.Escape(label)}\s*:",
                RegexOptions.IgnoreCase);
            if (pattern.IsMatch(text)) return true;
        }
        return false;
    }

    private static string StripLeadingReasoningLabel(string text)
    {
        foreach (var label in ReasoningLabels)
        {
            var pattern = new Regex(
                $@"^\s*(?:\*\*|__)?\s*{Regex.Escape(label)}\s*:\s*(?:\*\*|__)?\s*",
                RegexOptions.IgnoreCase);
            var match = pattern.Match(text);
            if (match.Success)
                return text[match.Length..];
        }
        return text;
    }

    private static string Normalize(string text)
    {
        text = HorizontalRulePattern.Replace(text, "");

        var lines = text.Replace("\r\n", "\n").Split('\n');
        var output = new List<string>(lines.Length);
        string? previousNonBlank = null;

        foreach (var rawLine in lines)
        {
            string line = NormalizeLine(rawLine);

            // Deduplicacion de lineas no vacias consecutivas identicas.
            string trimmed = line.Trim();
            if (trimmed.Length > 0 && trimmed.Equals(previousNonBlank, StringComparison.OrdinalIgnoreCase))
                continue;

            output.Add(line);
            if (trimmed.Length > 0) previousNonBlank = trimmed;
        }

        string result = string.Join("\n", output);
        result = ExcessiveBlankLinesPattern.Replace(result, "\n\n");
        return result.Trim();
    }

    private static string NormalizeLine(string line)
    {
        string trimmed = line.TrimEnd();

        // Titulos Markdown con exceso de # -> maximo ##
        if (Regex.IsMatch(trimmed, @"^#{3,}\s"))
            trimmed = Regex.Replace(trimmed, @"^#{3,}", "##");

        // Linea que solo contiene "**Label:**" -> "Label:"
        var labelOnly = Regex.Match(trimmed, @"^\s*(?:\*\*|__)\s*([^*_\n:]{1,60})\s*:\s*(?:\*\*|__)\s*$");
        if (labelOnly.Success)
            trimmed = labelOnly.Groups[1].Value.Trim() + ":";

        return trimmed;
    }
}
