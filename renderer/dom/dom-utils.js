// ===============================================
// UTILIDADES DOM Y UI
// ===============================================

import { messagesContainer } from '../state/state.js';
import { showNotification } from '../core/notifications.js';

// Scroll al final del contenedor de mensajes
export function scrollToBottom() {
    if (messagesContainer) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
}

// Procesar tablas Markdown
function processMarkdownTables(text) {
    const lines = text.split('\n');
    const result = [];
    let i = 0;

    while (i < lines.length) {
        const currentLine = lines[i];
        
        // Detectar inicio de tabla (linea con pipes)
        if (currentLine.includes('|') && i + 1 < lines.length) {
            const nextLine = lines[i + 1];
            
            // Verificar que la siguiente linea sea el separador (---|---|---)
            if (nextLine.match(/^\s*\|?\s*[-:]+\s*\|/)) {
                // Eliminar lineas vacias previas en el resultado
                while (result.length > 0 && result[result.length - 1].trim() === '') {
                    result.pop();
                }
                
                // Es una tabla
                const tableLines = [currentLine, nextLine];
                let j = i + 2;
                
                // Recolectar todas las filas de la tabla
                while (j < lines.length && lines[j].includes('|')) {
                    tableLines.push(lines[j]);
                    j++;
                }
                
                // Convertir a HTML
                result.push(convertTableToHtml(tableLines));
                i = j;
                continue;
            }
        }
        
        result.push(currentLine);
        i++;
    }
    
    return result.join('\n');
}

// Convertir array de lineas de tabla a HTML
function convertTableToHtml(tableLines) {
    if (tableLines.length < 2) return tableLines.join('\n');
    
    const headerLine = tableLines[0];
    const dataLines = tableLines.slice(2); // Saltar header y separador
    
    // Procesar header
    const headers = headerLine.split('|')
        .map(h => h.trim())
        .filter(h => h.length > 0);
    
    let html = '<table class="markdown-table">\n<thead>\n<tr>\n';
    headers.forEach(header => {
        html += `<th>${header}</th>\n`;
    });
    html += '</tr>\n</thead>\n<tbody>\n';
    
    // Procesar filas de datos
    dataLines.forEach(line => {
        const cells = line.split('|')
            .map(c => c.trim())
            .filter(c => c.length > 0);
        
        if (cells.length > 0) {
            html += '<tr>\n';
            cells.forEach(cell => {
                html += `<td>${cell}</td>\n`;
            });
            html += '</tr>\n';
        }
    });
    
    html += '</tbody>\n</table>';
    return html;
}

// Convertir Markdown a HTML (mejorado)
export function markdownToHtml(text) {
    let html = text;

    // Codigo en bloque (debe procesarse primero)
    html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
        return `<pre><code class="language-${lang || 'plaintext'}">${escapeHtml(code.trim())}</code></pre>`;
    });

    // Tablas (procesarse antes de codigo inline para evitar conflictos con |)
    html = processMarkdownTables(html);

    // Codigo inline
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Negrita (debe procesarse antes que cursiva)
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // Cursiva (solo asteriscos que no sean parte de listas)
    html = html.replace(/(?<!\*)\*(?!\*)([^*\n]+?)\*(?!\*)/g, '<em>$1</em>');

    // Enlaces
    html = html.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank">$1</a>');

    // Titulos (h1-h6)
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    // Blockquotes (citas en bloque con >)
    html = html.replace(/^>\s*(.+)$/gm, '<blockquote>$1</blockquote>');
    // Unir blockquotes consecutivos
    html = html.replace(/<\/blockquote>\n<blockquote>/g, '\n');

    // Separadores horizontales (---, ***, ___)
    html = html.replace(/^[-*_]{3,}$/gm, '<hr>');

    // Separar contenido en lineas para procesamiento de listas
    let lines = html.split('\n');
    let inUnorderedList = false;
    let inOrderedList = false;
    let processedLines = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const isUnorderedItem = /^[\*\-\+] (.+)$/.test(line);
        const isOrderedItem = /^\d+\. (.+)$/.test(line);
        const isEmpty = line === '';
        const isHtmlTag = /^<(table|\/table|thead|\/thead|tbody|\/tbody|tr|\/tr|th|td|h1|h2|h3|pre|\/pre)/.test(line);

        // Si es una etiqueta HTML (tabla, heading, etc), agregarla sin modificar
        if (isHtmlTag) {
            if (inUnorderedList) {
                processedLines.push('</ul>');
                inUnorderedList = false;
            }
            if (inOrderedList) {
                processedLines.push('</ol>');
                inOrderedList = false;
            }
            processedLines.push(line);
            continue;
        }

        // Lista no ordenada
        if (isUnorderedItem) {
            if (!inUnorderedList) {
                processedLines.push('<ul>');
                inUnorderedList = true;
            }
            if (inOrderedList) {
                processedLines.push('</ol>');
                inOrderedList = false;
                processedLines.push('<ul>');
                inUnorderedList = true;
            }
            processedLines.push(line.replace(/^[\*\-\+] (.+)$/, '<li>$1</li>'));
        }
        // Lista ordenada
        else if (isOrderedItem) {
            if (!inOrderedList) {
                processedLines.push('<ol>');
                inOrderedList = true;
            }
            if (inUnorderedList) {
                processedLines.push('</ul>');
                inUnorderedList = false;
                processedLines.push('<ol>');
                inOrderedList = true;
            }
            processedLines.push(line.replace(/^\d+\. (.+)$/, '<li>$1</li>'));
        }
        // Linea vacia
        else if (isEmpty) {
            // Cerrar listas si hay linea vacia
            if (inUnorderedList) {
                processedLines.push('</ul>');
                inUnorderedList = false;
                processedLines.push('<br>'); // Solo un <br> para parrafo
            } else if (inOrderedList) {
                processedLines.push('</ol>');
                inOrderedList = false;
                processedLines.push('<br>');
            } else {
                // Linea vacia fuera de lista = salto de parrafo
                processedLines.push('<br>');
            }
        }
        // Linea normal
        else {
            if (inUnorderedList) {
                processedLines.push('</ul>');
                inUnorderedList = false;
            }
            if (inOrderedList) {
                processedLines.push('</ol>');
                inOrderedList = false;
            }
            processedLines.push(line + '<br>');
        }
    }

    // Cerrar listas abiertas al final
    if (inUnorderedList) processedLines.push('</ul>');
    if (inOrderedList) processedLines.push('</ol>');

    html = processedLines.join('');

    // Limpiar <br> excesivos (mas de 2 consecutivos)
    html = html.replace(/(<br>){3,}/g, '<br><br>');
    
    // Eliminar <br> justo antes/despues de tags de bloque (incluyendo tablas)
    html = html.replace(/<br>(<ul>|<ol>|<\/ul>|<\/ol>|<h1>|<h2>|<h3>|<pre>|<table)/g, '$1');
    html = html.replace(/(<\/ul>|<\/ol>|<\/h1>|<\/h2>|<\/h3>|<\/pre>|<\/table>)<br>/g, '$1');
    
    // Eliminar multiples <br> antes de tablas
    html = html.replace(/(<br>\s*){2,}<table/g, '<table');

    return html;
}

// Escapar HTML para prevenir XSS
export function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Actualizar estado de conexion
export function updateStatus(status, text, statusElement) {
    if (statusElement) {
        statusElement.className = `status ${status}`;
        const statusText = statusElement.querySelector('.status-text');
        if (statusText) {
            statusText.textContent = text;
        }
    }
}

// Formatear fecha para mostrar
export function formatDate(isoString) {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Ahora';
    if (diffMins < 60) return `Hace ${diffMins}m`;
    if (diffHours < 24) return `Hace ${diffHours}h`;
    if (diffDays < 7) return `Hace ${diffDays}d`;

    return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
}

// Agregar mensaje al chat
export function addMessage(content, role, metadata = null, userQuestion = null) {
    if (!messagesContainer) return;

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';

    // Asignar avatar segun el rol
    if (role === 'system') {
        avatar.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>';
    } else if (role === 'user') {
        // Intentar usar foto de perfil del usuario
        const settings = JSON.parse(localStorage.getItem('alfred-settings') || '{}');
        if (settings.profilePicture) {
            const img = document.createElement('img');
            img.src = settings.profilePicture;
            img.alt = 'Usuario';
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.objectFit = 'cover';
            img.style.borderRadius = '50%';
            avatar.appendChild(img);
        } else {
            avatar.textContent = '👤';
        }
    } else {
        avatar.textContent = '🤖';
    }

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';

    // Renderizar Markdown solo para mensajes del asistente
    if (role === 'assistant') {
        bubble.innerHTML = markdownToHtml(content);
    } else {
        bubble.textContent = content;
    }

    contentDiv.appendChild(bubble);

    // Agregar metadata si existe
    if (metadata) {
        const meta = document.createElement('div');
        meta.className = 'message-meta';

        if (metadata.from_history) {
            const historyBadge = document.createElement('span');
            historyBadge.className = 'meta-badge';
            historyBadge.textContent = '📚 Del historial';
            meta.appendChild(historyBadge);
        }

        if (metadata.context_count > 0) {
            const contextBadge = document.createElement('span');
            contextBadge.className = 'meta-badge';
            contextBadge.textContent = `📄 ${metadata.context_count} documentos`;
            meta.appendChild(contextBadge);
        }

        contentDiv.appendChild(meta);

        // Mostrar fuentes si existen
        if (metadata.sources && metadata.sources.length > 0) {
            const sourcesDiv = document.createElement('div');
            sourcesDiv.className = 'message-sources';
            sourcesDiv.innerHTML = '<strong>Fuentes:</strong>';

            const sourcesList = document.createElement('ul');
            metadata.sources.forEach(source => {
                const sourceItem = document.createElement('li');
                sourceItem.textContent = source;
                sourcesList.appendChild(sourceItem);
            });

            sourcesDiv.appendChild(sourcesList);
            contentDiv.appendChild(sourcesDiv);
        }
    }

    // Agregar boton de guardar si es mensaje del asistente
    if (role === 'assistant' && userQuestion) {
        const actionsDiv = createSaveButton(userQuestion, content, metadata);
        contentDiv.appendChild(actionsDiv);
    }

    messageDiv.appendChild(avatar);
    messageDiv.appendChild(contentDiv);
    messagesContainer.appendChild(messageDiv);

    scrollToBottom();
}

// Crear boton de guardar para mensajes del asistente
function createSaveButton(userQuestion, answer, metadata) {
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'message-actions';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'save-btn';
    saveBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/>
        </svg>
        <span>Guardar</span>
    `;

    saveBtn.addEventListener('click', async () => {
        if (saveBtn.classList.contains('saved')) return;

        try {
            const result = await window.alfredAPI.saveToHistory({
                question: userQuestion,
                answer: answer,
                personal_data: metadata?.personal_data || null,
                sources: metadata?.sources || []
            });

            if (result.success) {
                saveBtn.classList.add('saved');
                saveBtn.innerHTML = `
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                    </svg>
                    <span>Guardado</span>
                `;
                showNotification('success', 'Conversacion guardada en el historial');
            } else {
                showNotification('error', 'Error al guardar');
            }
        } catch (error) {
            showNotification('error', 'Error al guardar');
            console.error('Error:', error);
        }
    });

    actionsDiv.appendChild(saveBtn);
    return actionsDiv;
}
