// ====================================
// MESSAGE HANDLING MODULE
// ====================================
// Handles sending messages, displaying with typing effects,
// and saving conversations to history

import * as State from '../state/state.js';
import { showNotification } from './notifications.js';
import { getCryptoManager } from '../crypto/crypto.js';
import { getCurrentConversationId, createNewConversation, loadConversations, autoRenameConversationIfDefault } from './conversations.js';
import { scrollToBottom, addMessage, markdownToHtml } from '../dom/dom-utils.js';
import { getAttachedFiles, removeAttachedFiles } from '../features/attachments/file-handler.js';

/**
 * Send a message to the backend with optional file attachment
 * Handles encryption, conversation management, and response streaming
 */
export async function sendMessage() {
    const message = State.messageInput.value.trim();
    if (!message) return;

    // Limpiar mensaje de bienvenida si existe
    const welcomeMsg = State.messagesContainer.querySelector('.welcome-message');
    if (welcomeMsg) {
        welcomeMsg.remove();
    }

    // Crear conversacion si no existe (sin mostrar mensaje de bienvenida)
    const currentConversationId = getCurrentConversationId();
    if (!currentConversationId) {
        await createNewConversation(null, false);
    }

    // Obtener archivos adjuntos antes de agregar el mensaje
    const attachedFiles = getAttachedFiles();
    
    // Agregar mensaje del usuario con indicador de archivo adjunto si existe
    addMessage(message, 'user');
    
    // Si hay archivos adjuntos, agregar indicador visual
    if (attachedFiles && attachedFiles.length > 0) {
        const lastMessage = State.messagesContainer.lastElementChild;
        const contentDiv = lastMessage.querySelector('.message-content');
        if (contentDiv) {
            const attachmentIndicator = document.createElement('div');
            attachmentIndicator.className = 'message-attachment';
            
            // Mostrar lista de nombres de archivos
            const fileNames = attachedFiles.map(f => f.name);
            const filesHtml = fileNames.map(name => `<span class="attachment-file-name">${name}</span>`).join('');
            
            attachmentIndicator.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z"/>
                </svg>
                <div class="attachment-files-list">${filesHtml}</div>
            `;
            contentDiv.appendChild(attachmentIndicator);
        }
    }
    
    State.addToConversationHistory({ role: 'user', content: message });

    // Limpiar input
    State.messageInput.value = '';
    State.messageInput.style.height = 'auto';
    State.sendBtn.disabled = true;

    // Mostrar indicador de escritura
    State.typingIndicator.style.display = 'flex';
    scrollToBottom();

    // Capturar tiempo de inicio
    const startTime = performance.now();

    try {
        // Obtener gestor de cifrado
        const cryptoManager = getCryptoManager();
        
        // Cifrar el mensaje antes de enviarlo al backend
        let encryptedMessage = message;
        if (cryptoManager.isEncryptionEnabled()) {
            encryptedMessage = await cryptoManager.encrypt(message);
        }
        
        // Enviar consulta a Alfred con el modo de busqueda seleccionado y el ID de conversacion
        const searchDocuments = State.searchMode === 'documents';

        // Preparar datos con archivos adjuntos si existen
        const queryData = {
            message: encryptedMessage, // Enviar mensaje cifrado
            conversationId: getCurrentConversationId(),
            searchDocuments,
            attachedFiles: attachedFiles ? attachedFiles.map(f => ({
                name: f.name,
                content: f.content
            })) : null
        };

        console.log('Enviando consulta:', {
            conversationId: queryData.conversationId,
            searchDocuments: queryData.searchDocuments,
            attachmentCount: queryData.attachedFiles ? queryData.attachedFiles.length : 0,
            messageLength: queryData.message.length,
            isEncrypted: queryData.message.startsWith('gAAAAAB')
        });

        // Limpiar archivos adjuntos despues de enviar
        if (attachedFiles) { removeAttachedFiles(); }

        const result = await window.alfredAPI.sendQueryWithAttachment(queryData);

        // Capturar tiempo de fin y calcular duracion
        const endTime = performance.now();
        const responseTime = ((endTime - startTime) / 1000).toFixed(2); // Convertir a segundos

        if (result.success) {
            const response = result.data;

            // Agregar tiempo de respuesta al metadata
            response.response_time = responseTime;

            // Ocultar indicador de escritura
            State.typingIndicator.style.display = 'none';

            // Agregar respuesta de Alfred con efecto de escritura
            // Pasar la pregunta actual para que el boton de guardar tenga la referencia correcta
            await addMessageWithTyping(response.answer, 'assistant', response, message);

            State.addToConversationHistory({
                role: 'assistant',
                content: response.answer,
                metadata: response
            });

            // Auto-renombrar la conversacion si tiene el titulo por defecto
            const conversationId = getCurrentConversationId();
            await autoRenameConversationIfDefault(conversationId, message);

            // Actualizar lista de conversaciones
            await loadConversations();
            
            // Actualizar el estado de busqueda si estamos en vista de busqueda
            if (window.conversationsState) {
                window.conversationsState.allConversations = State.conversations;
                window.conversationsState.filteredConversations = State.conversations;
                window.conversationsState.totalItems = State.conversations.length;
                
                // Re-renderizar la vista de busqueda si existe
                if (window.renderConversationsResults && typeof window.renderConversationsResults === 'function') {
                    window.renderConversationsResults();
                }
            }
        } else {
            State.typingIndicator.style.display = 'none';
            const errorMsg = result.error || 'Error desconocido';
            console.error('Error del servidor:', errorMsg);
            showNotification('error', `Error: ${errorMsg}`);
            addMessage(`Error: ${errorMsg}`, 'system');
        }
    } catch (error) {
        State.typingIndicator.style.display = 'none';
        console.error('Error de conexion:', error);
        showNotification('error', 'Error de conexion con el servidor');
        addMessage('Error de conexion con el servidor', 'system');
    }
}

/**
 * Add a message with typewriter effect and markdown rendering
 * @param {string} content - The message content to display
 * @param {string} role - 'user' or 'assistant'
 * @param {object|null} metadata - Optional metadata (response time, sources, mode, model)
 * @param {string|null} userQuestion - The user's question (for save button)
 */
export async function addMessageWithTyping(content, role, metadata = null, userQuestion = null) {
    if (!State.messagesContainer) return;

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = role === 'user' ? '👤' : '🤖';

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';

    contentDiv.appendChild(bubble);
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(contentDiv);
    State.messagesContainer.appendChild(messageDiv);

    // Efecto de escritura mejorado con renderizado progresivo
    let index = 0;
    const speed = 10; // ms por caracter
    let lastRenderedText = '';

    function typeChar() {
        if (index < content.length) {
            index++;

            // Obtener texto acumulado hasta este punto
            const currentText = content.substring(0, index);

            // Si es asistente, renderizar Markdown solo si cambio significativamente
            // Esto evita re-renderizar en cada caracter individual
            if (role === 'assistant') {
                // Renderizar cada 5 caracteres o al final de palabra/linea
                const shouldRender =
                    index % 5 === 0 ||
                    content.charAt(index - 1) === ' ' ||
                    content.charAt(index - 1) === '\n' ||
                    content.charAt(index - 1) === '*' ||
                    content.charAt(index - 1) === '`';

                if (shouldRender || index === content.length) {
                    bubble.innerHTML = markdownToHtml(currentText);
                    lastRenderedText = currentText;
                }
            } else {
                bubble.textContent = currentText;
            }

            scrollToBottom();
            setTimeout(typeChar, speed);
        } else {
            // Al terminar de escribir, asegurar renderizado final
            if (role === 'assistant') {
                bubble.innerHTML = markdownToHtml(content);
            }

            // Agregar metadata despues de terminar de escribir
            if (metadata) {
                const meta = document.createElement('div');
                meta.className = 'message-meta';

                // Mostrar tiempo de respuesta
                if (metadata.response_time) {
                    const timeTag = document.createElement('span');
                    timeTag.className = 'message-tag time-tag';
                    timeTag.textContent = `⏱️ ${metadata.response_time}s`;
                    meta.appendChild(timeTag);
                }

                if (metadata.from_history) {
                    const tag = document.createElement('span');
                    tag.className = 'message-tag';
                    tag.textContent = `📚 Del historial (${Math.round(metadata.history_score * 100)}%)`;
                    meta.appendChild(tag);
                }

                if (metadata.context_count > 0) {
                    const tag = document.createElement('span');
                    tag.className = 'message-tag';
                    tag.textContent = `🔍 ${metadata.context_count} fragmentos`;
                    meta.appendChild(tag);
                }

                contentDiv.appendChild(meta);

                // Mostrar fuentes si existen
                if (metadata.sources && metadata.sources.length > 0) {
                    const sourcesDiv = document.createElement('div');
                    sourcesDiv.className = 'message-sources';

                    const title = document.createElement('div');
                    title.className = 'message-sources-title';
                    title.textContent = '📄 Fuentes:';

                    const list = document.createElement('ul');
                    list.className = 'message-sources-list';

                    // Mostrar primeras 3 fuentes
                    const visibleSources = metadata.sources.slice(0, 3);
                    visibleSources.forEach(source => {
                        const li = document.createElement('li');
                        const fileName = source.split(/[\\/]/).pop();
                        li.textContent = fileName;
                        list.appendChild(li);
                    });

                    // Si hay mas de 3, agregar contenedor para las fuentes ocultas y boton expandir
                    if (metadata.sources.length > 3) {
                        const hiddenSourcesContainer = document.createElement('div');
                        hiddenSourcesContainer.className = 'hidden-sources';
                        hiddenSourcesContainer.style.display = 'none';

                        const hiddenList = document.createElement('ul');
                        hiddenList.className = 'message-sources-list';

                        metadata.sources.slice(3).forEach(source => {
                            const li = document.createElement('li');
                            const fileName = source.split(/[\\/]/).pop();
                            li.textContent = fileName;
                            hiddenList.appendChild(li);
                        });

                        hiddenSourcesContainer.appendChild(hiddenList);

                        const expandButton = document.createElement('button');
                        expandButton.className = 'expand-sources-btn';
                        expandButton.textContent = `+${metadata.sources.length - 3} mas...`;
                        expandButton.onclick = () => {
                            const isHidden = hiddenSourcesContainer.style.display === 'none';
                            hiddenSourcesContainer.style.display = isHidden ? 'block' : 'none';
                            expandButton.textContent = isHidden
                                ? 'Ver menos'
                                : `+${metadata.sources.length - 3} mas...`;
                            expandButton.classList.toggle('expanded', isHidden);
                        };

                        list.appendChild(expandButton);
                        sourcesDiv.appendChild(title);
                        sourcesDiv.appendChild(list);
                        sourcesDiv.appendChild(hiddenSourcesContainer);
                    } else {
                        sourcesDiv.appendChild(title);
                        sourcesDiv.appendChild(list);
                    }

                    contentDiv.appendChild(sourcesDiv);
                }

                // Agregar boton de guardar si es mensaje del asistente
                if (role === 'assistant' && userQuestion) {
                    const actionsDiv = createSaveButton(userQuestion, content, metadata);
                    contentDiv.appendChild(actionsDiv);
                }
            }
        }
    }

    typeChar();
}

/**
 * Create a save button for assistant messages
 * @param {string} userQuestion - The user's original question
 * @param {string} answer - The assistant's answer
 * @param {object} metadata - Message metadata
 * @returns {HTMLElement} The save button element
 */
export function createSaveButton(userQuestion, answer, metadata) {
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
            await saveConversation(userQuestion, answer, metadata);
            saveBtn.classList.add('saved');
            saveBtn.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                </svg>
                <span>Guardado</span>
            `;
            showNotification('Conversacion guardada en el historial', 'success');
        } catch (error) {
            showNotification('Error al guardar la conversacion', 'error');
        }
    });

    actionsDiv.appendChild(saveBtn);
    return actionsDiv;
}

/**
 * Save a conversation to the history database
 * @param {string} question - The user's question
 * @param {string} answer - The assistant's answer
 * @param {object} metadata - Message metadata (sources, mode, model, etc.)
 * @returns {Promise<object>} Result object with success status
 */
export async function saveConversation(question, answer, metadata) {
    if (!question || !answer) {
        throw new Error('Faltan datos para guardar');
    }

    const result = await window.alfredAPI.saveToHistory({
        question: question,
        answer: answer,
        personal_data: metadata?.personal_data || null,
        sources: metadata?.sources || []
    });

    if (!result.success) {
        throw new Error(result.error || 'Error al guardar');
    }

    return result;
}
