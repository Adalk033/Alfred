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
        "Analysis", "Analisis", "Análisis", "Analisi",
        "Execution", "Ejecucion", "Ejecución",
        "Reasoning", "Razonamiento",
        "Thinking", "Pensamiento",
        "Internal", "Interno",
        "Internal Monologue", "Monologo Interno", "Monólogo Interno",
        "Response Strategy", "Estrategia de Respuesta",
        "Self-Correction", "Self Correction", "Autocorreccion", "Autocorrección",
        "Language Check", "Verificacion de Idioma", "Verificación de Idioma",
    ];

    // Labels que marcan el inicio del bloque "respuesta final".
    private static readonly string[] ResponseLabels =
    [
        "Final Output Generation", "Generacion de Respuesta Final", "Generación de Respuesta Final",
        "Final response", "Respuesta final",
        "Final Output", "Salida Final",
        "Output Generation", "Generacion de Salida", "Generación de Salida",
        "Response", "Respuesta",
        "Answer", "Resultado", "Output",
    ];

    // Patrones unificados que aceptan dos formas para cualquier label:
    //   1) "Label:" o "**Label:**"  (forma con dos puntos, opcionalmente en negrita)
    //   2) "(Label)" o "(Label texto extra):"  (forma entre parentesis con colon opcional)
    // Se ordena por longitud descendente para que labels mas largos ganen sobre
    // los cortos (p.ej. "Final Output Generation" antes que "Output").
    private static readonly Regex ResponseTriggerPattern = BuildLabelTriggerPattern(ResponseLabels);
    private static readonly Regex ReasoningTriggerPattern = BuildLabelTriggerPattern(ReasoningLabels);

    private static Regex BuildLabelTriggerPattern(string[] labels)
    {
        string alt = string.Join("|",
            labels.OrderByDescending(s => s.Length).Select(Regex.Escape));
        string pattern =
            @"(?:^|\r?\n)[ \t]*(?:\*\*|__)?[ \t]*" +
            $@"(?:\((?:{alt})[^)\n]*\)[ \t]*:?|(?:{alt})[ \t]*:)" +
            @"[ \t]*(?:\*\*|__)?\s*";
        return new Regex(pattern, RegexOptions.Compiled | RegexOptions.IgnoreCase);
    }

    public static Cleaned Clean(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
            return new Cleaned { Text = raw ?? "" };

        string text = raw;

        text = ChannelTagPattern.Replace(text, "");
        text = InternalParenPattern.Replace(text, "");

        // Modelos como Gemma 3 4B-IT a veces emiten su monologo interno DESPUES
        // de la respuesta, separado por una linea "---". Si detectamos marcadores
        // meta-reflexivos en ese trailing, lo extraemos como reasoning.
        var (trailingReasoning, withoutTrailing) = TryExtractTrailingReasoning(text);

        var (reasoning, body) = SplitReasoningAndResponse(withoutTrailing);

        // Combinar ambos bloques de razonamiento si los hay.
        if (trailingReasoning != null)
            reasoning = string.IsNullOrWhiteSpace(reasoning)
                ? trailingReasoning
                : reasoning + "\n\n---\n\n" + trailingReasoning;

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

    // Linea separadora horizontal independiente (---, ***, ___).
    private static readonly Regex TrailingSeparatorPattern = new(
        @"(?:^|\r?\n)[ \t]*(?:-{3,}|\*{3,}|_{3,})[ \t]*(?=\r?\n|$)",
        RegexOptions.Compiled);

    // Marcadores fuertes de monologo interno tipico de Gemma/Phi/etc.
    private static readonly Regex TrailingReasoningMarkerPattern = new(
        @"\*\*\s*(?:Decisión|Decision|Análisis|Analisis|Analysis|Actualización de contexto|Actualizacion de contexto|Context update|Respuesta a generar|Response to generate|Razonamiento|Reasoning|Pensamiento|Thinking|Plan|Estado|State)\b[^*]*\*\*"
        + @"|\bsoy una IA\b|\bI am an AI\b|\bdebo asumir\b|\bI should assume\b"
        + @"|\bmi última respuesta\b|\bmi ultima respuesta\b|\bmy last response\b",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    // Comienzo con parentesis de auto-referencia: "(El usuario...", "(The user...".
    private static readonly Regex SelfReferenceParenStartPattern = new(
        @"^\s*\(\s*(?:El usuario|La usuaria|The user|I |Yo |Como (?:soy|asistente))",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static (string? trailingReasoning, string body) TryExtractTrailingReasoning(string text)
    {
        var matches = TrailingSeparatorPattern.Matches(text);
        if (matches.Count == 0) return (null, text);

        // Probar separadores empezando desde el ultimo: lo que aparezca despues
        // del separador final es lo mas probable que sea monologo trasero.
        for (int i = matches.Count - 1; i >= 0; i--)
        {
            var m = matches[i];
            int afterStart = m.Index + m.Length;
            if (afterStart >= text.Length) continue;

            string after = text[afterStart..].TrimStart('\r', '\n', ' ', '\t');
            if (string.IsNullOrWhiteSpace(after)) continue;

            if (LooksLikeTrailingReasoning(after))
            {
                string before = text[..m.Index].TrimEnd();
                return (after, before);
            }
        }

        return (null, text);
    }

    private static bool LooksLikeTrailingReasoning(string after)
    {
        if (SelfReferenceParenStartPattern.IsMatch(after)) return true;
        return TrailingReasoningMarkerPattern.IsMatch(after);
    }

    private static (string? reasoning, string body) SplitReasoningAndResponse(string text)
    {
        // Busca el primer marcador de respuesta final. Todo lo anterior, si
        // contiene un label de reasoning o tiene contenido sustancial, se
        // considera monologo interno.
        var match = ResponseTriggerPattern.Match(text);
        if (!match.Success) return (null, text);

        string before = text[..match.Index];
        string after = text[(match.Index + match.Length)..];

        if (ContainsReasoningLabel(before))
            return (StripLeadingReasoningLabel(before), after);

        if (!string.IsNullOrWhiteSpace(before))
            return (before, after);

        return (null, after);
    }

    private static bool ContainsReasoningLabel(string text)
        => ReasoningTriggerPattern.IsMatch(text);

    private static string StripLeadingReasoningLabel(string text)
    {
        var match = ReasoningTriggerPattern.Match(text);
        // Solo strip si el label aparece al principio (modulo whitespace).
        if (match.Success && string.IsNullOrWhiteSpace(text[..match.Index]))
            return text[(match.Index + match.Length)..];
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
