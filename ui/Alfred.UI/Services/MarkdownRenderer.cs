using System.Text;
using System.Text.RegularExpressions;
using Microsoft.UI;
using Microsoft.UI.Text;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Documents;
using Microsoft.UI.Xaml.Media;
using Windows.UI;
using Windows.UI.Text;

namespace Alfred.UI.Services;

/// <summary>
/// Convierte Markdown a un arbol de UIElements nativos de WinUI 3.
/// Soporta: headings (#,##,###), negrita (**), cursiva (*), codigo inline (`),
/// bloques de codigo (```), listas ordenadas/no ordenadas, enlaces, blockquotes,
/// tablas y reglas horizontales.
/// </summary>
public static class MarkdownRenderer
{
    private const string MonoFont = "Consolas";
    private const double BaseFontSize = 14;

    private static readonly SolidColorBrush TextBrush = new(Colors.White);
    private static readonly SolidColorBrush DimBrush = new(Color.FromArgb(220, 200, 200, 210));
    private static readonly SolidColorBrush CodeInlineBrush = new(Color.FromArgb(255, 255, 215, 150));
    private static readonly SolidColorBrush CodeBlockBg = new(Color.FromArgb(255, 17, 22, 34));
    private static readonly SolidColorBrush CodeHeaderBg = new(Color.FromArgb(255, 26, 32, 48));
    private static readonly SolidColorBrush AccentBrush = new(Color.FromArgb(255, 129, 140, 248));
    private static readonly SolidColorBrush RuleBrush = new(Color.FromArgb(80, 255, 255, 255));
    private static readonly SolidColorBrush TableBorderBrush = new(Color.FromArgb(70, 255, 255, 255));
    private static readonly SolidColorBrush TableHeaderBg = new(Color.FromArgb(50, 129, 140, 248));
    private static readonly SolidColorBrush BlockquoteBg = new(Color.FromArgb(30, 129, 140, 248));

    private static readonly Regex FenceOpenRegex = new(@"^\s*```([\w+.\-]*)\s*$", RegexOptions.Compiled);
    private static readonly Regex FenceCloseRegex = new(@"^\s*```\s*$", RegexOptions.Compiled);
    private static readonly Regex HeadingRegex = new(@"^\s*(#{1,6})\s+(.+?)\s*#*\s*$", RegexOptions.Compiled);
    private static readonly Regex HrRegex = new(@"^\s*(?:-\s*){3,}$|^\s*(?:\*\s*){3,}$|^\s*(?:_\s*){3,}$", RegexOptions.Compiled);
    private static readonly Regex BlockquoteRegex = new(@"^\s*>\s?(.*)$", RegexOptions.Compiled);
    private static readonly Regex UnorderedItemRegex = new(@"^\s*[-*+]\s+(.+)$", RegexOptions.Compiled);
    private static readonly Regex OrderedItemRegex = new(@"^\s*(\d+)[.\)]\s+(.+)$", RegexOptions.Compiled);
    private static readonly Regex TableSeparatorRegex = new(@"^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$", RegexOptions.Compiled);

    public static IReadOnlyList<UIElement> Render(string? markdown)
    {
        var result = new List<UIElement>();
        if (string.IsNullOrEmpty(markdown))
        {
            result.Add(new TextBlock { Text = "", Foreground = TextBrush, FontSize = BaseFontSize });
            return result;
        }

        var lines = markdown.Replace("\r\n", "\n").Split('\n');
        int i = 0;

        while (i < lines.Length)
        {
            string line = lines[i];

            // Bloque de codigo cercado ```lang
            var fence = FenceOpenRegex.Match(line);
            if (fence.Success)
            {
                string lang = fence.Groups[1].Value;
                var code = new StringBuilder();
                i++;
                while (i < lines.Length && !FenceCloseRegex.IsMatch(lines[i]))
                {
                    if (code.Length > 0) code.Append('\n');
                    code.Append(lines[i]);
                    i++;
                }
                if (i < lines.Length) i++; // consumir cierre
                result.Add(CreateCodeBlock(code.ToString(), lang));
                continue;
            }

            // Regla horizontal
            if (HrRegex.IsMatch(line))
            {
                result.Add(new Border
                {
                    Height = 1,
                    Background = RuleBrush,
                    Margin = new Thickness(0, 6, 0, 6)
                });
                i++;
                continue;
            }

            // Heading
            var heading = HeadingRegex.Match(line);
            if (heading.Success)
            {
                int level = heading.Groups[1].Value.Length;
                result.Add(CreateHeading(heading.Groups[2].Value, level));
                i++;
                continue;
            }

            // Blockquote (agrupa lineas consecutivas)
            if (BlockquoteRegex.IsMatch(line))
            {
                var qb = new StringBuilder();
                while (i < lines.Length && BlockquoteRegex.IsMatch(lines[i]))
                {
                    if (qb.Length > 0) qb.Append('\n');
                    qb.Append(BlockquoteRegex.Match(lines[i]).Groups[1].Value);
                    i++;
                }
                result.Add(CreateBlockquote(qb.ToString()));
                continue;
            }

            // Tabla: linea con '|' seguida de linea separadora
            if (line.Contains('|') && i + 1 < lines.Length && TableSeparatorRegex.IsMatch(lines[i + 1]))
            {
                var tableLines = new List<string> { line };
                i += 2; // header + separator
                while (i < lines.Length && lines[i].Contains('|') && !string.IsNullOrWhiteSpace(lines[i]))
                {
                    tableLines.Add(lines[i]);
                    i++;
                }
                result.Add(CreateTable(tableLines));
                continue;
            }

            // Lista no ordenada
            if (UnorderedItemRegex.IsMatch(line))
            {
                var items = new List<string>();
                while (i < lines.Length && UnorderedItemRegex.IsMatch(lines[i]))
                {
                    items.Add(UnorderedItemRegex.Match(lines[i]).Groups[1].Value);
                    i++;
                }
                result.Add(CreateList(items, ordered: false, start: 1));
                continue;
            }

            // Lista ordenada
            if (OrderedItemRegex.IsMatch(line))
            {
                var items = new List<string>();
                int start = 1;
                bool first = true;
                while (i < lines.Length && OrderedItemRegex.IsMatch(lines[i]))
                {
                    var m = OrderedItemRegex.Match(lines[i]);
                    if (first && int.TryParse(m.Groups[1].Value, out int parsed))
                    {
                        start = parsed;
                        first = false;
                    }
                    items.Add(m.Groups[2].Value);
                    i++;
                }
                result.Add(CreateList(items, ordered: true, start: start));
                continue;
            }

            // Linea vacia -> separador
            if (string.IsNullOrWhiteSpace(line))
            {
                i++;
                continue;
            }

            // Parrafo: une lineas consecutivas hasta blanco u otro bloque
            var para = new StringBuilder(line);
            i++;
            while (i < lines.Length && !string.IsNullOrWhiteSpace(lines[i]) && !IsBlockStart(lines[i]))
            {
                para.Append(' ').Append(lines[i].TrimStart());
                i++;
            }
            result.Add(CreateParagraph(para.ToString()));
        }

        return result;
    }

    private static bool IsBlockStart(string line) =>
        FenceOpenRegex.IsMatch(line)
        || HeadingRegex.IsMatch(line)
        || HrRegex.IsMatch(line)
        || BlockquoteRegex.IsMatch(line)
        || UnorderedItemRegex.IsMatch(line)
        || OrderedItemRegex.IsMatch(line);

    // ====================================================================
    // Bloques
    // ====================================================================

    private static TextBlock CreateParagraph(string text)
    {
        var tb = NewTextBlock();
        AddInlines(tb.Inlines, text);
        return tb;
    }

    private static TextBlock CreateHeading(string text, int level)
    {
        double size = level switch
        {
            1 => 20,
            2 => 18,
            3 => 16,
            _ => 14
        };
        var tb = new TextBlock
        {
            TextWrapping = TextWrapping.Wrap,
            FontSize = size,
            FontWeight = FontWeights.SemiBold,
            Foreground = TextBrush,
            IsTextSelectionEnabled = true,
            Margin = new Thickness(0, level <= 2 ? 6 : 4, 0, 2)
        };
        AddInlines(tb.Inlines, text);
        return tb;
    }

    private static Border CreateCodeBlock(string code, string language)
    {
        var outer = new Border
        {
            Background = CodeBlockBg,
            CornerRadius = new CornerRadius(6),
            Margin = new Thickness(0, 4, 0, 4)
        };

        var stack = new StackPanel();

        var header = new Border
        {
            Background = CodeHeaderBg,
            Padding = new Thickness(10, 4, 10, 4),
            CornerRadius = new CornerRadius(6, 6, 0, 0),
            Child = new TextBlock
            {
                Text = string.IsNullOrWhiteSpace(language) ? "code" : language.ToLowerInvariant(),
                FontSize = 11,
                Foreground = DimBrush
            }
        };
        stack.Children.Add(header);

        var codeText = new TextBlock
        {
            Text = code,
            FontFamily = new FontFamily(MonoFont),
            FontSize = 13,
            Foreground = TextBrush,
            IsTextSelectionEnabled = true,
            TextWrapping = TextWrapping.NoWrap
        };

        var sv = new ScrollViewer
        {
            Content = codeText,
            HorizontalScrollBarVisibility = ScrollBarVisibility.Auto,
            VerticalScrollBarVisibility = ScrollBarVisibility.Disabled,
            HorizontalScrollMode = ScrollMode.Auto,
            Padding = new Thickness(12, 10, 12, 10)
        };
        stack.Children.Add(sv);

        outer.Child = stack;
        return outer;
    }

    private static Border CreateBlockquote(string text)
    {
        var border = new Border
        {
            BorderBrush = AccentBrush,
            BorderThickness = new Thickness(3, 0, 0, 0),
            Background = BlockquoteBg,
            Padding = new Thickness(10, 6, 8, 6),
            Margin = new Thickness(0, 2, 0, 2)
        };

        var stack = new StackPanel { Spacing = 2 };
        foreach (var part in text.Split('\n'))
        {
            if (string.IsNullOrWhiteSpace(part)) continue;
            stack.Children.Add(CreateParagraph(part));
        }
        border.Child = stack;
        return border;
    }

    private static StackPanel CreateList(List<string> items, bool ordered, int start)
    {
        var stack = new StackPanel
        {
            Margin = new Thickness(6, 2, 0, 2),
            Spacing = 3
        };

        for (int idx = 0; idx < items.Count; idx++)
        {
            var grid = new Grid();
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });

            var marker = new TextBlock
            {
                Text = ordered ? $"{start + idx}." : "•",
                FontSize = BaseFontSize,
                Foreground = TextBrush,
                Margin = new Thickness(0, 0, 8, 0),
                MinWidth = 18
            };
            Grid.SetColumn(marker, 0);
            grid.Children.Add(marker);

            var content = NewTextBlock();
            AddInlines(content.Inlines, items[idx]);
            Grid.SetColumn(content, 1);
            grid.Children.Add(content);

            stack.Children.Add(grid);
        }
        return stack;
    }

    private static Grid CreateTable(List<string> rows)
    {
        var grid = new Grid { Margin = new Thickness(0, 4, 0, 4) };
        if (rows.Count == 0) return grid;

        var headerCells = SplitRow(rows[0]);
        int cols = Math.Max(headerCells.Count, 1);

        for (int c = 0; c < cols; c++)
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        for (int r = 0; r < rows.Count; r++)
            grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });

        AddTableRow(grid, headerCells, row: 0, cols, isHeader: true);
        for (int r = 1; r < rows.Count; r++)
            AddTableRow(grid, SplitRow(rows[r]), row: r, cols, isHeader: false);

        return grid;
    }

    private static void AddTableRow(Grid grid, List<string> cells, int row, int cols, bool isHeader)
    {
        for (int c = 0; c < cols; c++)
        {
            var border = new Border
            {
                Background = isHeader ? TableHeaderBg : null,
                BorderBrush = TableBorderBrush,
                BorderThickness = new Thickness(1),
                Padding = new Thickness(8, 5, 8, 5)
            };
            var tb = new TextBlock
            {
                TextWrapping = TextWrapping.Wrap,
                FontSize = 13,
                FontWeight = isHeader ? FontWeights.SemiBold : FontWeights.Normal,
                Foreground = TextBrush,
                IsTextSelectionEnabled = true
            };
            AddInlines(tb.Inlines, c < cells.Count ? cells[c] : "");
            border.Child = tb;
            Grid.SetRow(border, row);
            Grid.SetColumn(border, c);
            grid.Children.Add(border);
        }
    }

    private static List<string> SplitRow(string line)
    {
        string trimmed = line.Trim();
        if (trimmed.StartsWith('|')) trimmed = trimmed[1..];
        if (trimmed.EndsWith('|')) trimmed = trimmed[..^1];
        return trimmed.Split('|').Select(s => s.Trim()).ToList();
    }

    private static TextBlock NewTextBlock() => new()
    {
        TextWrapping = TextWrapping.Wrap,
        FontSize = BaseFontSize,
        Foreground = TextBrush,
        IsTextSelectionEnabled = true
    };

    // ====================================================================
    // Inline parsing: `code`, **bold**, *italic*, [text](url)
    // ====================================================================

    private static void AddInlines(InlineCollection inlines, string text)
    {
        if (string.IsNullOrEmpty(text)) return;

        int pos = 0;
        var buffer = new StringBuilder();

        void FlushBuffer()
        {
            if (buffer.Length > 0)
            {
                inlines.Add(new Run { Text = buffer.ToString() });
                buffer.Clear();
            }
        }

        while (pos < text.Length)
        {
            char c = text[pos];

            // Codigo inline `...`
            if (c == '`')
            {
                int end = text.IndexOf('`', pos + 1);
                if (end > pos)
                {
                    FlushBuffer();
                    string code = text.Substring(pos + 1, end - pos - 1);
                    inlines.Add(new Run
                    {
                        Text = code,
                        FontFamily = new FontFamily(MonoFont),
                        Foreground = CodeInlineBrush
                    });
                    pos = end + 1;
                    continue;
                }
            }

            // Negrita **...**
            if (c == '*' && pos + 1 < text.Length && text[pos + 1] == '*')
            {
                int end = text.IndexOf("**", pos + 2, StringComparison.Ordinal);
                if (end > pos + 1)
                {
                    FlushBuffer();
                    var span = new Span { FontWeight = FontWeights.Bold };
                    AddInlines(span.Inlines, text.Substring(pos + 2, end - pos - 2));
                    inlines.Add(span);
                    pos = end + 2;
                    continue;
                }
            }

            // Cursiva *...*  (un solo asterisco, no seguido ni precedido de otro)
            if (c == '*'
                && (pos == 0 || text[pos - 1] != '*')
                && pos + 1 < text.Length && text[pos + 1] != '*')
            {
                int end = FindSingleAsteriskClose(text, pos + 1);
                if (end > pos)
                {
                    FlushBuffer();
                    var span = new Span { FontStyle = FontStyle.Italic };
                    AddInlines(span.Inlines, text.Substring(pos + 1, end - pos - 1));
                    inlines.Add(span);
                    pos = end + 1;
                    continue;
                }
            }

            // Enlace [text](url)
            if (c == '[')
            {
                int closeBracket = text.IndexOf(']', pos + 1);
                if (closeBracket > pos && closeBracket + 1 < text.Length && text[closeBracket + 1] == '(')
                {
                    int closeParen = text.IndexOf(')', closeBracket + 2);
                    if (closeParen > closeBracket + 1)
                    {
                        FlushBuffer();
                        string linkText = text.Substring(pos + 1, closeBracket - pos - 1);
                        string url = text.Substring(closeBracket + 2, closeParen - closeBracket - 2).Trim();
                        var hyperlink = new Hyperlink { Foreground = AccentBrush };
                        if (Uri.TryCreate(url, UriKind.Absolute, out var uri))
                            hyperlink.NavigateUri = uri;
                        AddInlines(hyperlink.Inlines, linkText);
                        inlines.Add(hyperlink);
                        pos = closeParen + 1;
                        continue;
                    }
                }
            }

            buffer.Append(c);
            pos++;
        }

        FlushBuffer();
    }

    private static int FindSingleAsteriskClose(string text, int from)
    {
        for (int j = from; j < text.Length; j++)
        {
            if (text[j] != '*') continue;
            bool prevIsStar = j > 0 && text[j - 1] == '*';
            bool nextIsStar = j + 1 < text.Length && text[j + 1] == '*';
            if (!prevIsStar && !nextIsStar) return j;
        }
        return -1;
    }
}
