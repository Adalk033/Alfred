import { showNotification } from './notifications.js';
import { addMessage, scrollToBottom, formatDate } from '../dom/dom-utils.js';
import * as State from '../state/state.js';

// ===============================================
// FUNCIONES DE CONVERSACIONES
// ===============================================

// Exportar getters para acceder al estado
export function getConversations() {
    return State.conversations;
}

export function getCurrentConversationId() {
    return State.currentConversationId;
}

export function getConversationHistory() {
    return State.conversationHistory;
}

// Crear una nueva conversacion
export async function createNewConversation(title = null, showWelcome = true) {
    try {
        const result = await window.alfredAPI.createConversation(title);

        if (result.success) {
            State.setCurrentConversationId(result.data.id);
            State.clearConversationHistory();

            // Limpiar chat
            if (State.messagesContainer) {
                State.messagesContainer.innerHTML = '';
            }

            // Solo mostrar mensaje de bienvenida si se solicita explicitamente
            if (showWelcome && State.messagesContainer) {
                const welcomeDiv = document.createElement('div');
                welcomeDiv.className = 'welcome-message';
                welcomeDiv.innerHTML = `
                    <h2>Hola! Soy Alfred</h2>
                    <p>Soy tu asistente personal inteligente. Puedo ayudarte con:</p>
                    <ul>
                        <li>Buscar informacion en tus documentos</li>
                        <li>Responder preguntas generales</li>
                        <li>Recordar informacion de conversaciones anteriores</li>
                    </ul>
                    <p>Como puedo ayudarte hoy?</p>
                `;
                State.messagesContainer.appendChild(welcomeDiv);
                showNotification('success', 'Nueva conversacion creada');
            }

            // Actualizar lista de conversaciones
            await loadConversations();

            return result.data;
        } else {
            showNotification('error', 'Error al crear conversacion');
            console.error('Error al crear conversacion:', result.error);
            return null;
        }
    } catch (error) {
        showNotification('error', 'Error al crear conversacion');
        console.error('Error al crear conversacion:', error);
        return null;
    }
}

// Cargar lista de conversaciones
export async function loadConversations() {
    try {
        const result = await window.alfredAPI.listConversations(50, 0);

        if (result.success) {
            State.setConversations(result.data);
            updateConversationsList();
        } else {
            console.error('Error al cargar conversaciones:', result.error);
        }
    } catch (error) {
        console.error('Error al cargar conversaciones:', error);
    }
}

// Actualizar la lista de conversaciones en la UI
export function updateConversationsList() {
    const conversationsList = document.getElementById('conversationsList');
    if (!conversationsList) return;

    conversationsList.innerHTML = '';

    const conversations = State.conversations;
    const currentConversationId = State.currentConversationId;

    conversations.forEach(conv => {
        const convDiv = document.createElement('div');
        convDiv.className = 'conversation-item';
        if (conv.id === currentConversationId) {
            convDiv.classList.add('active');
        }

        convDiv.innerHTML = `
            <div class="conversation-info">
                <div class="conversation-title">${conv.title}</div>
                <div class="conversation-meta">
                    <span class="message-count">${conv.message_count} mensajes</span>
                    <span class="conversation-date">${formatDate(conv.updated_at)}</span>
                </div>
            </div>
            <div class="conversation-actions">
                <button class="icon-btn" onclick="window.conversationActions.load('${conv.id}')" title="Cargar">📂</button>
                <button class="icon-btn" onclick="window.conversationActions.rename('${conv.id}')" title="Renombrar">✏️</button>
                <button class="icon-btn" onclick="window.conversationActions.delete('${conv.id}')" title="Eliminar">🗑️</button>
            </div>
        `;

        conversationsList.appendChild(convDiv);
    });
}

// Exportar funciones para uso global desde onclick
window.conversationActions = {
    load: (conversationId) => loadConversation(conversationId),
    delete: (conversationId) => deleteConversationById(conversationId),
    rename: (conversationId) => {
        const convItem = document.querySelector(`.conversation-item .conversation-actions button[onclick*="${conversationId}"]`)?.closest('.conversation-item');
        if (convItem) {
            const titleElement = convItem.querySelector('.conversation-title');
            enableEditMode(conversationId, titleElement);
        }
    }
};

// Cargar una conversacion especifica
export async function loadConversation(conversationId) {
    try {
        const result = await window.alfredAPI.getConversation(conversationId);

        if (result.success) {
            State.setCurrentConversationId(conversationId);
            State.setConversationHistory(result.data.messages.map(msg => ({
                role: msg.role,
                content: msg.content,
                metadata: msg.metadata
            })));

            // Limpiar y recargar mensajes
            if (State.messagesContainer) {
                State.messagesContainer.innerHTML = '';

                result.data.messages.forEach(msg => {
                    addMessage(msg.content, msg.role, msg.metadata);
                });

                scrollToBottom();
            }

            updateConversationsList();

            showNotification('success', 'Conversacion cargada');
        } else {
            showNotification('error', 'Error al cargar conversacion');
            console.error('Error al cargar conversacion:', result.error);
        }
    } catch (error) {
        showNotification('error', 'Error al cargar conversacion');
        console.error('Error al cargar conversacion:', error);
    }
}

// Eliminar una conversacion
export async function deleteConversationById(conversationId) {
    // Usar setTimeout para evitar bloqueo del thread principal
    const confirmed = await new Promise(resolve => {
        setTimeout(() => {
            resolve(confirm('Estas seguro de que deseas eliminar esta conversacion?'));
        }, 0);
    });

    if (!confirmed) {
        // Restaurar enfoque al textarea
        if (State.messageInput) {
            setTimeout(() => State.messageInput.focus(), 100);
        }
        return;
    }

    try {
        const wasCurrentConversation = conversationId === State.currentConversationId;

        // Eliminar la conversacion
        const result = await window.alfredAPI.deleteConversation(conversationId);

        if (result.success) {
            // Si es la conversacion actual, resetear inmediatamente
            if (wasCurrentConversation) {
                State.setCurrentConversationId(null);
                State.clearConversationHistory();

                if (State.messagesContainer) {
                    State.messagesContainer.innerHTML = '';
                }

                // Crear nueva conversacion en segundo plano sin bloquear
                createNewConversation(null, true).then(() => {
                    // Restaurar enfoque al textarea después de crear la conversacion
                    if (State.messageInput) {
                        setTimeout(() => State.messageInput.focus(), 100);
                    }
                }).catch(err => {
                    console.error('Error al crear nueva conversacion:', err);
                });
            } else {
                // Restaurar enfoque al textarea si no era la conversacion actual
                if (State.messageInput) {
                    setTimeout(() => State.messageInput.focus(), 100);
                }
            }

            // Actualizar lista en segundo plano sin bloquear
            loadConversations().catch(err => {
                console.error('Error al cargar conversaciones:', err);
            });

            showNotification('success', 'Conversacion eliminada');
        } else {
            showNotification('error', 'Error al eliminar conversacion');
            console.error('Error al eliminar conversacion:', result.error);
        }
    } catch (error) {
        showNotification('error', 'Error al eliminar conversacion');
        console.error('Error al eliminar conversacion:', error);
    }
}

// Renombrar una conversacion
export async function renameConversation(conversationId, newTitle) {
    if (!newTitle || newTitle.trim() === '') {
        showNotification('error', 'El titulo no puede estar vacio');
        return false;
    }

    try {
        const result = await window.alfredAPI.updateConversationTitle(conversationId, newTitle.trim());

        if (result.success) {
            // Actualizar lista de conversaciones
            await loadConversations();
            showNotification('success', 'Conversacion renombrada');
            return true;
        } else {
            showNotification('error', 'Error al renombrar conversacion');
            console.error('Error al renombrar conversacion:', result.error);
            return false;
        }
    } catch (error) {
        showNotification('error', 'Error al renombrar conversacion');
        console.error('Error al renombrar conversacion:', error);
        return false;
    }
}

// Activar modo de edicion para el titulo de una conversacion
export function enableEditMode(conversationId, titleElement) {
    const currentTitle = titleElement.textContent;
    const conversationItem = titleElement.closest('.conversation-item');

    // Crear input de edicion
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'conversation-title-edit';
    input.value = currentTitle;
    input.maxLength = 100;

    // Reemplazar el titulo con el input
    titleElement.style.display = 'none';
    titleElement.parentNode.insertBefore(input, titleElement);

    // Enfocar el input y seleccionar el texto
    input.focus();
    input.select();

    // Crear botones de accion
    const actionsDiv = conversationItem.querySelector('.conversation-actions');
    const originalButtons = actionsDiv.innerHTML;

    actionsDiv.innerHTML = `
        <button class="icon-btn edit-save" title="Guardar">✓</button>
        <button class="icon-btn edit-cancel" title="Cancelar">✗</button>
    `;

    // Funcion para guardar el cambio
    const saveEdit = async () => {
        const newTitle = input.value.trim();
        if (newTitle && newTitle !== currentTitle) {
            const success = await renameConversation(conversationId, newTitle);
            if (!success) {
                // Si falla, restaurar el estado original
                input.remove();
                titleElement.style.display = '';
                actionsDiv.innerHTML = originalButtons;
            }
        } else {
            // Cancelar si no hay cambios
            input.remove();
            titleElement.style.display = '';
            actionsDiv.innerHTML = originalButtons;
        }
    };

    // Funcion para cancelar
    const cancelEdit = () => {
        input.remove();
        titleElement.style.display = '';
        actionsDiv.innerHTML = originalButtons;
    };

    // Eventos para guardar
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveEdit();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            cancelEdit();
        }
    });

    // Eventos para los botones
    const saveBtn = actionsDiv.querySelector('.edit-save');
    const cancelBtn = actionsDiv.querySelector('.edit-cancel');

    saveBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        saveEdit();
    });

    cancelBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        cancelEdit();
    });
}

// Eliminar funcion formatDate ya que ahora esta en dom-utils.js