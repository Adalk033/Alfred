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

// Convertir Markdown a HTML (simplificado)
export function markdownToHtml(text) {
    let html = text;

    // Codigo en bloque
    html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
        return `<pre><code class="language-${lang || 'plaintext'}">${escapeHtml(code.trim())}</code></pre>`;
    });

    // Codigo inline
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Negrita
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // Cursiva
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // Enlaces
    html = html.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank">$1</a>');

    // Saltos de linea
    html = html.replace(/\n/g, '<br>');

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
        avatar.textContent = '⚙️';
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
