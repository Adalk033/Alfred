// api.js - Modulo para comunicacion con el backend

import { getSettings, getCurrentConversationId, addToConversationHistory } from '../state/state.js';
import { addMessage, addMessageWithTyping, showTypingIndicator, hideTypingIndicator, clearMessages } from './messages.js';
import { showNotification, updateStatus, disableInput, clearInput, showSidebar, checkSidebar, hideSidebar } from './ui.js';
import { getCryptoManager } from '../crypto/crypto.js';

// Verificar estado del servidor
export async function checkServerStatus() {
    try {
        const result = await window.alfredAPI.checkServer();

        if (result.success) {
            updateStatus('connected', 'Conectado');
            await loadInitialStats();
        } else {
            updateStatus('error', 'Desconectado');
            showNotification('error', 'No se pudo conectar con el servidor de Alfred');
        }
    } catch (error) {
        updateStatus('error', 'Error de conexion');
        showNotification('error', 'Error al verificar el servidor');
    }
}

// Cargar estadisticas iniciales
async function loadInitialStats() {
    try {
        const result = await window.alfredAPI.getStats();
        if (result.success) {
            const stats = result.data;
            console.log('Estadisticas cargadas:', stats);
        }
    } catch (error) {
        console.error('Error al cargar estadisticas:', error);
    }
}

/**
 * Descifra respuesta del backend si es necesario
 * Utiliza el gestor de cifrado para descifrar datos en transito
 */
async function decryptResponseIfNeeded(response) {
    try {
        const cryptoManager = getCryptoManager();
        if (!cryptoManager.isEncryptionEnabled()) {
            return response;
        }

        console.log('[API] Descifrando respuesta del backend...');
        const decryptedResponse = await cryptoManager.decryptObject(response);
        console.log('[API] Respuesta descifrada correctamente');
        return decryptedResponse;
    } catch (error) {
        console.error('[API] Error al descifrar respuesta:', error);
        // Continuar con respuesta sin descifrar
        return response;
    }
}

// Enviar mensaje al backend
export async function sendMessage(message, searchMode, conversationId, onSuccess) {
    if (!message?.trim()) return;

    try {
        // Agregar mensaje del usuario
        addMessage(message, 'user');
        addToConversationHistory({ role: 'user', content: message });

        // Limpiar input y deshabilitar
        clearInput();
        disableInput(true);

        // Mostrar indicador de escritura
        showTypingIndicator();

        // Enviar consulta a Alfred
        const searchDocuments = searchMode === 'documents';
        console.log('📤 Enviando consulta:', { message, searchDocuments, conversationId });

        const result = await window.alfredAPI.sendQueryWithConversation(message, conversationId, searchDocuments);

        console.log('📥 Respuesta recibida:', result);

        // Ocultar indicador de escritura
        hideTypingIndicator();

        if (result.success) {
            const response = result.data;

            // DESCIFRAR RESPUESTA SI ES NECESARIO
            const decryptedResponse = await decryptResponseIfNeeded(response);

            // Agregar respuesta de Alfred con efecto de escritura
            await addMessageWithTyping(decryptedResponse.answer, 'assistant', decryptedResponse, message);

            addToConversationHistory({
                role: 'assistant',
                content: decryptedResponse.answer,
                metadata: decryptedResponse
            });

            // Callback de exito
            if (onSuccess) {
                onSuccess(decryptedResponse);
            }
        } else {
            const errorMsg = result.error || 'Error desconocido';
            console.error('❌ Error del servidor:', errorMsg);
            showNotification('error', `Error: ${errorMsg}`);
            addMessage(`❌ Error: ${errorMsg}`, 'system');
        }
    } catch (error) {
        hideTypingIndicator();
        console.error('❌ Error de conexion:', error);
        showNotification('error', 'Error de conexion con el servidor');
        addMessage('❌ Error de conexion con el servidor', 'system');
    } finally {
        disableInput(false);
    }
}

// Guardar conversacion en el historial
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

// Mostrar historial
export async function showHistory() {
    if (checkSidebar()) {
        hideSidebar();
        return;
    }
    
    try {
        const result = await window.alfredAPI.getHistory(20);

        if (result.success) {
            // DESCIFRAR HISTORIAL SI ES NECESARIO
            const decryptedData = await Promise.all(result.data.map(item => decryptResponseIfNeeded(item)));
            
            const content = renderHistoryContent(decryptedData);
            showSidebar('Historial Preguntas rapidas', content);
            
            // Agregar event listeners despues de insertar el HTML
            attachHistoryListeners(decryptedData);
        }
    } catch (error) {
        showNotification('error', 'Error al cargar el historial');
        console.error('Error:', error);
    }
}

// Agregar event listeners a los items del historial
function attachHistoryListeners(historyData) {
    const historyItems = document.querySelectorAll('.history-item');
    historyItems.forEach((element, index) => {
        element.onclick = () => {
            loadHistoryItem(historyData[index]);
            hideSidebar();
        };
    });
}

// Renderizar contenido del historial
function renderHistoryContent(historyData) {
    if (historyData.length === 0) {
        return '<p style="color: var(--text-secondary); text-align: center; padding: 20px;">No hay conversaciones guardadas</p>';
    }

    let html = '';
    historyData.forEach(item => {
        html += `
            <div class="history-item">
                <div class="history-question">${escapeHtml(item.question)}</div>
                <div class="history-answer">${escapeHtml(item.answer)}</div>
                <div class="history-time">${new Date(item.timestamp).toLocaleString('es-ES')}</div>
            </div>
        `;
    });

    return html;
}

// Cargar item del historial
export function loadHistoryItem(item) {
    // Limpiar mensaje de bienvenida
    const welcomeMsg = document.querySelector('.welcome-message');
    if (welcomeMsg) {
        welcomeMsg.remove();
    }

    addMessage(item.question, 'user');
    addMessage(item.answer, 'assistant', {
        from_history: true,
        sources: item.sources || []
    });
}

// Cargar modelo actual
export async function loadCurrentModel() {
    try {
        const result = await window.alfredAPI.getModel();
        if (result.success) {
            const modelSelect = document.getElementById('modelSelect');
            if (modelSelect) {
                modelSelect.value = result.data.model;
            }
        }
    } catch (error) {
        console.error('Error al cargar el modelo actual:', error);
    }
}

// Cambiar modelo
export async function changeModel(newModel) {
    try {
        showNotification('info', `Cambiando modelo a ${newModel}...`);
        
        const result = await window.alfredAPI.changeModel(newModel);
        
        if (result.success) {
            showNotification('success', `Modelo cambiado a ${newModel}`);
            addMessage(`🔄 Modelo cambiado a ${newModel}`, 'system');
        } else {
            showNotification('error', 'Error al cambiar el modelo');
            await loadCurrentModel();
        }
    } catch (error) {
        console.error('Error:', error);
        showNotification('error', 'Error al cambiar el modelo');
        await loadCurrentModel();
    }
}

// Reiniciar backend
export async function restartBackend() {
    try {
        showNotification('info', 'Reiniciando Alfred...');
        const result = await window.alfredAPI.restartBackend();
        
        if (result.success) {
            showNotification('success', 'Alfred se reiniciara en breve');
            setTimeout(() => {
                window.location.reload();
            }, 3000);
        } else {
            showNotification('error', 'Error al reiniciar Alfred');
        }
    } catch (error) {
        showNotification('error', 'Error al reiniciar Alfred');
    }
}

// Detener Ollama
export async function stopOllama() {
    try {
        addMessage('🛑 Deteniendo Ollama para liberar recursos...', 'system');
        showNotification('info', 'Deteniendo Ollama...');
        
        const result = await window.alfredAPI.stopOllama();
        
        if (result.success) {
            addMessage('✅ Ollama detenido correctamente', 'system');
            showNotification('success', 'Ollama detenido correctamente');
        } else {
            addMessage('❌ Error al detener Ollama', 'system');
            showNotification('error', 'Error al detener Ollama');
        }
    } catch (error) {
        addMessage('❌ Error al detener Ollama', 'system');
        showNotification('error', 'Error al detener Ollama');
    }
}

// Utilidad para escapar HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
