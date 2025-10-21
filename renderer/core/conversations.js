import { showNotification } from './notifications.js';
import { showConfirm } from './dialogs.js';
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
                    <div class="welcome-header">
                        <div class="welcome-icon">🤖</div>
                        <div class="welcome-title">
                            <h2>Bienvenido a Alfred</h2>
                            <p class="welcome-subtitle">Tu asistente inteligente personal</p>
                        </div>
                    </div>
                    
                    <div class="welcome-features">
                        <div class="feature-card">
                            <div class="feature-icon">📚</div>
                            <h3>Buscar Documentos</h3>
                            <p>Acceso inmediato a la información en tus archivos personales</p>
                        </div>
                        <div class="feature-card">
                            <div class="feature-icon">💭</div>
                            <h3>Respuestas Inteligentes</h3>
                            <p>Respondo preguntas complejas con precisión y contexto</p>
                        </div>
                        <div class="feature-card">
                            <div class="feature-icon">🧠</div>
                            <h3>Memoria Conversacional</h3>
                            <p>Recuerdo el contexto de nuestras conversaciones anteriores</p>
                        </div>
                    </div>
                    
                    <div class="welcome-cta">
                        <p>¿En qué puedo ayudarte?</p>
                    </div>
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

            // Si no hay conversaciones, asegurar que el input este habilitado
            if (result.data.length === 0 && State.messageInput) {
                State.messageInput.disabled = false;
                State.messageInput.placeholder = 'Escribe tu mensaje aqui...';
                if (State.sendBtn) {
                    State.sendBtn.disabled = !State.messageInput.value.trim();
                }
            }
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
    const isSelectionMode = State.conversationSelectionMode || false;

    conversations.forEach(conv => {
        const convDiv = document.createElement('div');
        convDiv.className = 'conversation-item';
        convDiv.dataset.conversationId = conv.id;
        
        if (conv.id === currentConversationId && !isSelectionMode) {
            convDiv.classList.add('active');
        }

        convDiv.innerHTML = `
            ${isSelectionMode ? `
                <div class="conversation-checkbox">
                    <input type="checkbox" 
                           class="conv-checkbox" 
                           data-conv-id="${conv.id}"
                           onchange="window.conversationActions.toggleSelection('${conv.id}')">
                </div>
            ` : ''}
            <div class="conversation-info" onclick="${isSelectionMode ? `window.conversationActions.toggleCheckbox('${conv.id}')` : `window.conversationActions.load('${conv.id}')`}" style="${isSelectionMode ? 'cursor: pointer;' : ''}">
                <div class="conversation-title">${conv.title}</div>
                <div class="conversation-meta">
                    <span class="message-count">${conv.message_count} mensajes</span>
                    <span class="conversation-date">${formatDate(conv.updated_at)}</span>
                </div>
            </div>
            ${!isSelectionMode ? `
                <div class="conversation-actions">
                    <button class="icon-btn menu-btn" 
                            onclick="window.conversationActions.toggleMenu(event, '${conv.id}')" 
                            title="Opciones">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                            <circle cx="12" cy="5" r="2"/>
                            <circle cx="12" cy="12" r="2"/>
                            <circle cx="12" cy="19" r="2"/>
                        </svg>
                    </button>
                    <div class="conversation-menu" id="menu-${conv.id}" style="display: none;">
                        <button class="menu-item" onclick="window.conversationActions.load('${conv.id}')">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>
                            </svg>
                            Cargar
                        </button>
                        <button class="menu-item" onclick="window.conversationActions.rename('${conv.id}')">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                            Renombrar
                        </button>
                        <button class="menu-item danger" onclick="window.conversationActions.delete('${conv.id}')">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"/>
                                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                            </svg>
                            Eliminar
                        </button>
                    </div>
                </div>
            ` : ''}
        `;

        conversationsList.appendChild(convDiv);
    });
}

// Exportar funciones para uso global desde onclick
window.conversationActions = {
    load: (conversationId) => loadConversation(conversationId),
    delete: (conversationId) => deleteConversationById(conversationId),
    rename: (conversationId) => {
        const convItem = document.querySelector(`.conversation-item[data-conversation-id="${conversationId}"]`);
        if (convItem) {
            const titleElement = convItem.querySelector('.conversation-title');
            enableEditMode(conversationId, titleElement);
            // Cerrar el menú y quitar clase
            const menu = document.getElementById(`menu-${conversationId}`);
            if (menu) {
                menu.style.display = 'none';
                convItem.classList.remove('menu-open');
            }
        }
    },
    toggleMenu: (event, conversationId) => {
        event.stopPropagation();
        
        // Cerrar todos los menús abiertos y quitar clase menu-open
        document.querySelectorAll('.conversation-menu').forEach(menu => {
            if (menu.id !== `menu-${conversationId}`) {
                menu.style.display = 'none';
                const item = menu.closest('.conversation-item');
                if (item) item.classList.remove('menu-open');
            }
        });
        
        // Toggle del menú actual
        const menu = document.getElementById(`menu-${conversationId}`);
        if (menu) {
            const isVisible = menu.style.display === 'block';
            const conversationItem = menu.closest('.conversation-item');
            
            menu.style.display = isVisible ? 'none' : 'block';
            
            // Agregar/quitar clase menu-open al item
            if (conversationItem) {
                if (isVisible) {
                    conversationItem.classList.remove('menu-open');
                } else {
                    conversationItem.classList.add('menu-open');
                }
            }
            
            // Si se abrió, ajustar posición para que no salga del viewport
            if (!isVisible) {
                const sidebar = document.getElementById('leftSidebarContent');
                
                if (conversationItem && sidebar) {
                    const itemRect = conversationItem.getBoundingClientRect();
                    const sidebarRect = sidebar.getBoundingClientRect();
                    const menuHeight = 130; // Altura aproximada del menú
                    
                    // Si no hay espacio abajo, mostrar arriba
                    const spaceBelow = sidebarRect.bottom - itemRect.bottom;
                    if (spaceBelow < menuHeight) {
                        menu.classList.add('menu-up');
                    } else {
                        menu.classList.remove('menu-up');
                    }
                }
            }
        }
    },
    toggleSelection: (conversationId) => {
        const checkbox = document.querySelector(`input[data-conv-id="${conversationId}"]`);
        if (!checkbox) return;
        
        const selectedConvs = State.selectedConversations || new Set();
        
        if (checkbox.checked) {
            selectedConvs.add(conversationId);
        } else {
            selectedConvs.delete(conversationId);
        }
        
        State.setSelectedConversations(selectedConvs);
        updateDeleteButtonState();
    },
    toggleCheckbox: (conversationId) => {
        const checkbox = document.querySelector(`input[data-conv-id="${conversationId}"]`);
        if (!checkbox) return;
        
        // Cambiar el estado del checkbox
        checkbox.checked = !checkbox.checked;
        
        // Ejecutar la lógica de selección
        const selectedConvs = State.selectedConversations || new Set();
        
        if (checkbox.checked) {
            selectedConvs.add(conversationId);
        } else {
            selectedConvs.delete(conversationId);
        }
        
        State.setSelectedConversations(selectedConvs);
        updateDeleteButtonState();
    },
    toggleSelectionMode: () => toggleSelectionMode(),
    deleteSelected: () => deleteSelectedConversations()
};

// Cerrar menús al hacer clic fuera
document.addEventListener('click', (event) => {
    if (!event.target.closest('.conversation-actions')) {
        document.querySelectorAll('.conversation-menu').forEach(menu => {
            menu.style.display = 'none';
            const item = menu.closest('.conversation-item');
            if (item) item.classList.remove('menu-open');
        });
    }
});

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
    // Usar showConfirm personalizado
    const confirmed = await showConfirm(
        'Esta accion no se puede deshacer.',
        'Eliminar esta conversacion?',
        { type: 'danger', confirmText: 'Eliminar', cancelText: 'Cancelar' }
    );

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

                // Crear nueva conversacion ANTES de actualizar la lista
                try {
                    await createNewConversation(null, true);
                } catch (err) {
                    console.error('Error al crear nueva conversacion:', err);
                }

                // Restaurar enfoque al textarea después de crear la conversacion
                if (State.messageInput) {
                    setTimeout(() => State.messageInput.focus(), 100);
                }
            } else {
                // Restaurar enfoque al textarea si no era la conversacion actual
                if (State.messageInput) {
                    setTimeout(() => State.messageInput.focus(), 100);
                }
            }

            // Actualizar lista DESPUÉS de crear la nueva conversacion (si aplica)
            try {
                await loadConversations();
            } catch (err) {
                console.error('Error al cargar conversaciones:', err);
            }

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

// ====================================
// MODO DE SELECCION MULTIPLE
// ====================================

export function toggleSelectionMode() {
    const isCurrentlyInSelectionMode = State.conversationSelectionMode || false;
    State.setConversationSelectionMode(!isCurrentlyInSelectionMode);
    State.setSelectedConversations(new Set());
    
    updateConversationsList();
    updateSelectionModeUI();
}

export function updateSelectionModeUI() {
    const selectionModeBtn = document.getElementById('selectionModeBtn');
    const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
    const conversationsTitle = document.getElementById('conversationsTitle');
    
    if (State.conversationSelectionMode) {
        if (selectionModeBtn) {
            selectionModeBtn.classList.add('active');
            selectionModeBtn.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            `;
            selectionModeBtn.title = 'Cancelar seleccion';
        }
        if (deleteSelectedBtn) {
            deleteSelectedBtn.style.display = 'flex';
        }
        if (conversationsTitle) {
            conversationsTitle.textContent = 'Seleccionar conversaciones';
        }
    } else {
        if (selectionModeBtn) {
            selectionModeBtn.classList.remove('active');
            selectionModeBtn.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9 11l3 3L22 4"/>
                    <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
                </svg>
            `;
            selectionModeBtn.title = 'Seleccionar multiples';
        }
        if (deleteSelectedBtn) {
            deleteSelectedBtn.style.display = 'none';
        }
        if (conversationsTitle) {
            conversationsTitle.textContent = 'Conversaciones';
        }
    }
}

export function updateDeleteButtonState() {
    const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
    const selectedCount = State.selectedConversations ? State.selectedConversations.size : 0;
    
    if (deleteSelectedBtn) {
        deleteSelectedBtn.disabled = selectedCount === 0;
        const countSpan = deleteSelectedBtn.querySelector('.selected-count');
        if (countSpan && selectedCount > 0) {
            countSpan.textContent = `(${selectedCount})`;
            countSpan.style.display = 'inline';
        } else if (countSpan) {
            countSpan.style.display = 'none';
        }
    }
}

export async function deleteSelectedConversations() {
    const selectedConvs = State.selectedConversations;
    if (!selectedConvs || selectedConvs.size === 0) {
        showNotification('warning', 'No hay conversaciones seleccionadas');
        return;
    }
    
    const confirmed = await showConfirm(
        `Se eliminaran permanentemente ${selectedConvs.size} conversacion(es).`,
        'Eliminar conversaciones seleccionadas?',
        { type: 'danger', confirmText: 'Eliminar', cancelText: 'Cancelar' }
    );
    
    if (!confirmed) return;
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const convId of selectedConvs) {
        try {
            const result = await window.alfredAPI.deleteConversation(convId);
            if (result.success) {
                successCount++;
            } else {
                errorCount++;
            }
        } catch (error) {
            errorCount++;
            console.error('Error al eliminar conversacion:', error);
        }
    }
    
    // Salir del modo Seleccion
    State.setConversationSelectionMode(false);
    State.setSelectedConversations(new Set());
    
    // Recargar conversaciones
    await loadConversations();
    updateSelectionModeUI();
    
    if (successCount > 0) {
        showNotification('success', `${successCount} conversacion(es) eliminada(s)`);
    }
    if (errorCount > 0) {
        showNotification('error', `Error al eliminar ${errorCount} conversacion(es)`);
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

    // IMPORTANTE: Prevenir que los clicks en el input se propaguen
    input.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    // Prevenir que otros eventos se propaguen
    input.addEventListener('mousedown', (e) => {
        e.stopPropagation();
    });

    // Reemplazar el titulo con el input
    titleElement.style.display = 'none';
    titleElement.parentNode.insertBefore(input, titleElement);

    // Enfocar el input y seleccionar el texto
    setTimeout(() => {
        input.focus();
        input.select();
    }, 50);

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
            if (success) {
                // Éxito: la lista se recarga automáticamente en renameConversation
                return;
            }
        }
        // Si no hay cambios o falla, restaurar estado original
        input.remove();
        titleElement.style.display = '';
        actionsDiv.innerHTML = originalButtons;
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

// ====================================
// AUTO-RENOMBRAR CONVERSACION
// ====================================

/**
 * Detectar si una conversacion tiene el formato de fecha por defecto
 * Formato esperado: "Conversacion YYYY-MM-DD HH:MM"
 * @param {string} title - Titulo de la conversacion
 * @returns {boolean}
 */
export function hasDefaultConversationTitle(title) {
    // Regex para detectar el formato "Conversacion YYYY-MM-DD HH:MM"
    const dateFormatRegex = /^Conversacion \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;
    return dateFormatRegex.test(title);
}

/**
 * Generar un titulo corto basado en el primer mensaje del usuario
 * Toma las primeras palabras significativas del mensaje
 * @param {string} message - Primer mensaje del usuario
 * @returns {string} - Titulo sugerido (maximo 50 caracteres)
 */
export function generateTitleFromMessage(message) {
    if (!message || !message.trim()) {
        return 'Conversacion sin titulo';
    }

    // Limpiar espacios
    const cleaned = message.trim();
    
    // Tomar las primeras 50 caracteres o hasta el primer salto de linea
    let title = cleaned.split('\n')[0].substring(0, 50).trim();
    
    // Agregar puntos suspensivos si fue cortado
    if (cleaned.length > 50) {
        title += '...';
    }
    
    return title || 'Conversacion sin titulo';
}

/**
 * Auto-renombrar una conversacion si tiene el titulo por defecto
 * Se llama despues de enviar el primer mensaje
 * @param {string} conversationId - ID de la conversacion
 * @param {string} userMessage - Primer mensaje del usuario
 */
export async function autoRenameConversationIfDefault(conversationId, userMessage) {
    try {
        // Obtener lista de conversaciones actual para verificar titulo
        const conversations = State.conversations;
        const conversation = conversations.find(c => c.id === conversationId);
        
        if (!conversation) {
            console.log('Conversacion no encontrada en state');
            return;
        }

        // Verificar si tiene el formato de fecha por defecto
        if (!hasDefaultConversationTitle(conversation.title)) {
            console.log('Conversacion no tiene titulo por defecto, no se renombra');
            return;
        }

        // Generar nuevo titulo basado en el mensaje
        const newTitle = generateTitleFromMessage(userMessage);
        
        if (newTitle === 'Conversacion sin titulo') {
            console.log('No se puede generar titulo valido del mensaje');
            return;
        }

        console.log(`Auto-renombrando conversacion: "${conversation.title}" -> "${newTitle}"`);

        // Llamar a la API para actualizar el titulo
        const result = await window.alfredAPI.updateConversationTitle(conversationId, newTitle);

        if (result.success) {
            // Actualizar lista de conversaciones
            await loadConversations();
            console.log('Conversacion renombrada exitosamente');
        } else {
            console.error('Error al auto-renombrar conversacion:', result.error);
        }
    } catch (error) {
        console.error('Error en autoRenameConversationIfDefault:', error);
        // No mostrar error al usuario, es una operacion secundaria
    }
}