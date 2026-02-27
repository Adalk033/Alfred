// Funcion para convertir Markdown basico a HTML
export function markdownToHtml(text) {
    if (!text) { return ''; }

    let html = text;

    // Escapar HTML existente para seguridad
    html = html.replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    // Separar en lineas para procesar listas
    let lines = html.split('\n');
    let inList = false;
    let processedLines = [];

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        let trimmed = line.trim();

        // Detectar items de lista
        if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
            if (!inList) {
                processedLines.push('<ul>');
                inList = true;
            }
            let content = trimmed.substring(2);
            processedLines.push('<li>' + content + '</li>');
        } else {
            if (inList) {
                processedLines.push('</ul>');
                inList = false;
            }
            processedLines.push(line);
        }
    }

    // Cerrar lista si quedo abierta
    if (inList) { processedLines.push('</ul>'); }

    html = processedLines.join('\n');

    // Encabezados (###, ##, #)
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

    // Negrita (**texto** o __texto__)
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');

    // Cursiva (*texto* o _texto_) - cuidado con no afectar los * de listas
    html = html.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
    html = html.replace(/_([^_\n]+)_/g, '<em>$1</em>');

    // Codigo en linea (`codigo`)
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Bloques de codigo (```codigo```)
    html = html.replace(/```([^`]+)```/gs, '<pre><code>$1</code></pre>');

    // Enlaces [texto](url)
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

    // Saltos de linea simples
    html = html.replace(/\n/g, '<br>');

    return html;
}