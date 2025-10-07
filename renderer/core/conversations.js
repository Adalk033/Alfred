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
                <button class="icon-btn" onclick="loadConversation('${conv.id}')" title="Cargar">📂</button>
                <button class="icon-btn" onclick="deleteConversationById('${conv.id}')" title="Eliminar">🗑️</button>
            </div>
        `;

        conversationsList.appendChild(convDiv);
    });
}

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
    if (!confirm('Estas seguro de que deseas eliminar esta conversacion?')) {
        return;
    }

    try {
        const result = await window.alfredAPI.deleteConversation(conversationId);

        if (result.success) {
            // Si es la conversacion actual, resetear
            if (conversationId === State.currentConversationId) {
                State.setCurrentConversationId(null);
                State.clearConversationHistory();
                
                if (State.messagesContainer) {
                    State.messagesContainer.innerHTML = '';

                    const welcomeDiv = document.createElement('div');
                    welcomeDiv.className = 'welcome-message';
                    welcomeDiv.innerHTML = `
                        <h2>Hola! Soy Alfred</h2>
                        <p>Conversacion eliminada. Puedes crear una nueva o cargar una existente.</p>
                    `;
                    State.messagesContainer.appendChild(welcomeDiv);
                }
            }

            // Actualizar lista
            await loadConversations();

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

// Eliminar funcion formatDate ya que ahora esta en dom-utils.js