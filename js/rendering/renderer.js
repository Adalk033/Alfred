import { showNotification } from '../notifications.js';
import { addMessage, scrollToBottom, markdownToHtml, updateStatus } from '../dom-utils.js';
import { createNewConversation, loadConversations, updateConversationsList, loadConversation, deleteConversationById, getCurrentConversationId, getConversationHistory } from '../conversations.js';
import * as State from '../state.js';

// Escuchar notificaciones del backend
window.alfredAPI.onBackendNotification((data) => {
    const { type, message } = data;

    // Mostrar notificación visual
    showNotification(type, message);

    // Actualizar estado de conexión
    if (type === 'success') {
        updateConnectionStatus(true);
    } else if (type === 'error') {
        updateConnectionStatus(false);
    }
});

// Escuchar cambios de estado del backend
window.alfredAPI.onBackendStatus((data) => {
    const { status } = data;
    updateConnectionStatus(status === 'connected');
});

// Elementos del DOM (locales a renderer.js)
let historyBtn;
let statsBtn;
let settingsBtn;
let closeSidebar;

// Botones de modo de busqueda
let searchDocsBtn;
let promptOnlyBtn;

// Selector de modelo
let modelSelect;

// Modal de configuracion
let settingsModal;
let closeSettings;
let cancelSettings;
let saveSettings;

// Elementos de foto de perfil
let changeProfilePictureBtn;
let currentProfilePicture;
let profileHistoryGallery;
let profileHistoryCount;

// Inicializacion
document.addEventListener('DOMContentLoaded', async () => {
    // Inicializar elementos del DOM en State
    State.setDOMElements({
        messagesContainer: document.getElementById('messages'),
        messageInput: document.getElementById('messageInput'),
        sendBtn: document.getElementById('sendBtn'),
        typingIndicator: document.getElementById('typingIndicator'),
        statusElement: document.getElementById('status'),
        sidebar: document.getElementById('sidebar'),
        sidebarTitle: document.getElementById('sidebarTitle'),
        sidebarContent: document.getElementById('sidebarContent')
    });

    // Inicializar elementos locales
    historyBtn = document.getElementById('historyBtn');
    statsBtn = document.getElementById('statsBtn');
    settingsBtn = document.getElementById('settingsBtn');
    closeSidebar = document.getElementById('closeSidebar');
    searchDocsBtn = document.getElementById('searchDocsBtn');
    promptOnlyBtn = document.getElementById('promptOnlyBtn');
    modelSelect = document.getElementById('modelSelect');
    settingsModal = document.getElementById('settingsModal');
    closeSettings = document.getElementById('closeSettings');
    cancelSettings = document.getElementById('cancelSettings');
    saveSettings = document.getElementById('saveSettings');
    changeProfilePictureBtn = document.getElementById('changeProfilePictureBtn');
    currentProfilePicture = document.getElementById('currentProfilePicture');
    profileHistoryGallery = document.getElementById('profileHistoryGallery');
    profileHistoryCount = document.getElementById('profileHistoryCount');

    await checkServerStatus();
    setupEventListeners();
    loadSettings();
    await loadCurrentModel();
    loadProfilePicture();
    await loadConversations(); // Cargar conversaciones al inicio

    // Auto-ajustar altura del textarea
    State.messageInput.addEventListener('input', () => {
        State.messageInput.style.height = 'auto';
        State.messageInput.style.height = State.messageInput.scrollHeight + 'px';
    });
});

// Configurar event listeners
function setupEventListeners() {
    State.sendBtn.addEventListener('click', sendMessage);
    State.messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    State.messageInput.addEventListener('input', () => {
        State.sendBtn.disabled = !State.messageInput.value.trim();
    });

    // Event listeners para botones de modo
    searchDocsBtn.addEventListener('click', () => {
        State.setSearchMode('documents');
        searchDocsBtn.classList.add('active');
        promptOnlyBtn.classList.remove('active');
    });

    promptOnlyBtn.addEventListener('click', () => {
        State.setSearchMode('prompt');
        promptOnlyBtn.classList.add('active');
        searchDocsBtn.classList.remove('active');
    });

    historyBtn.addEventListener('click', showHistory);
    statsBtn.addEventListener('click', showStats);
    settingsBtn.addEventListener('click', () => settingsModal.classList.remove('none'));
    closeSidebar.addEventListener('click', () => State.sidebar.classList.add('none'));

    // Event listener para conversaciones
    const conversationsBtn = document.getElementById('conversationsBtn');
    if (conversationsBtn) {
        conversationsBtn.addEventListener('click', showConversations);
    }

    closeSettings.addEventListener('click', () => settingsModal.classList.add('none'));
    cancelSettings.addEventListener('click', () => settingsModal.classList.add('none'));
    saveSettings.addEventListener('click', saveSettingsHandler);

    // Event listener para cambio de modelo
    modelSelect.addEventListener('change', changeModel);

    // Event listener para cambiar foto de perfil
    changeProfilePictureBtn.addEventListener('click', changeProfilePicture);
}

// Verificar estado del servidor
async function checkServerStatus() {
    try {
        const result = await window.alfredAPI.checkServer();

        if (result.success) {
            updateStatus('connected', 'Conectado', State.statusElement);
            await loadInitialStats();
        } else {
            updateStatus('error', 'Desconectado', State.statusElement);
            showNotification('No se pudo conectar con el servidor de Alfred. Asegúrate de que esté ejecutándose.', 'error');
        }
    } catch (error) {
        updateStatus('error', 'Error de conexión', State.statusElement);
        showNotification('Error al verificar el servidor', 'error');
    }
}

// Cargar estadísticas iniciales
async function loadInitialStats() {
    try {
        const result = await window.alfredAPI.getStats();
        if (result.success) {
            const stats = result.data;
        }
    } catch (error) {
        console.error('Error al cargar estadísticas:', error);
    }
}

// Enviar mensaje
async function sendMessage() {
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

    // Agregar mensaje del usuario
    addMessage(message, 'user');
    State.addToConversationHistory({ role: 'user', content: message });

    // Limpiar input
    State.messageInput.value = '';
    State.messageInput.style.height = 'auto';
    State.sendBtn.disabled = true;

    // Mostrar indicador de escritura
    State.typingIndicator.style.display = 'flex';
    scrollToBottom();

    try {
        // Enviar consulta a Alfred con el modo de busqueda seleccionado y el ID de conversacion
        const searchDocuments = State.searchMode === 'documents';
        console.log('📤 Enviando consulta:', { message, searchDocuments, conversationId: getCurrentConversationId() });

        const result = await window.alfredAPI.sendQueryWithConversation(message, getCurrentConversationId(), searchDocuments);

        console.log('📥 Respuesta recibida:', result);

        if (result.success) {
            const response = result.data;

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

            // Actualizar lista de conversaciones
            await loadConversations();
        } else {
            State.typingIndicator.style.display = 'none';
            const errorMsg = result.error || 'Error desconocido';
            console.error('❌ Error del servidor:', errorMsg);
            showNotification('error', `Error: ${errorMsg}`);
            addMessage(`❌ Error: ${errorMsg}`, 'system');
        }
    } catch (error) {
        State.typingIndicator.style.display = 'none';
        console.error('❌ Error de conexion:', error);
        showNotification('error', 'Error de conexion con el servidor');
        addMessage('❌ Error de conexion con el servidor', 'system');
    }
}

// Agregar mensaje con efecto de escritura
async function addMessageWithTyping(content, role, metadata = null, userQuestion = null) {
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

    // Efecto de escritura
    let index = 0;
    const speed = 10; // ms por caracter

    function typeChar() {
        const newContent = markdownToHtml(content);
        if (index < content.length) {
            bubble.textContent += content.charAt(index);
            index++;
            scrollToBottom();
            setTimeout(typeChar, speed);
        } else {
            // Al terminar de escribir, renderizar Markdown si es asistente
            if (role === 'assistant') {
                bubble.innerHTML = newContent;
            }

            // Agregar metadata después de terminar de escribir
            if (metadata) {
                const meta = document.createElement('div');
                meta.className = 'message-meta';

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

                    metadata.sources.slice(0, 3).forEach(source => {
                        const li = document.createElement('li');
                        const fileName = source.split(/[\\/]/).pop();
                        li.textContent = fileName;
                        list.appendChild(li);
                    });

                    if (metadata.sources.length > 3) {
                        const li = document.createElement('li');
                        li.textContent = `+${metadata.sources.length - 3} más...`;
                        list.appendChild(li);
                    }

                    sourcesDiv.appendChild(title);
                    sourcesDiv.appendChild(list);
                    contentDiv.appendChild(sourcesDiv);
                }

                // Agregar botón de guardar si es mensaje del asistente
                if (role === 'assistant' && userQuestion) {
                    const actionsDiv = createSaveButton(userQuestion, content, metadata);
                    contentDiv.appendChild(actionsDiv);
                }
            }
        }
    }

    typeChar();
}

// Crear botón de guardar para mensajes del asistente
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
            await saveConversation(userQuestion, answer, metadata);
            saveBtn.classList.add('saved');
            saveBtn.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                </svg>
                <span>Guardado</span>
            `;
            showNotification('Conversación guardada en el historial', 'success');
        } catch (error) {
            showNotification('Error al guardar la conversación', 'error');
        }
    });

    actionsDiv.appendChild(saveBtn);
    return actionsDiv;
}

// Guardar conversacion en el historial
async function saveConversation(question, answer, metadata) {
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
async function showHistory() {

    if (checkSidebar()) {
        State.sidebar.classList.add('none');
        return;
    }
    try {
        const result = await window.alfredAPI.getHistory(20);

        if (result.success) {
            State.sidebarTitle.textContent = 'Historial Preguntas rapidas';
            State.sidebarContent.innerHTML = '';

            if (result.data.length === 0) {
                State.sidebarContent.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 20px;">No hay conversaciones guardadas</p>';
            } else {
                result.data.forEach(item => {
                    const historyItem = document.createElement('div');
                    historyItem.className = 'history-item';
                    historyItem.onclick = () => loadHistoryItem(item);

                    const question = document.createElement('div');
                    question.className = 'history-question';
                    question.textContent = item.question;

                    const answer = document.createElement('div');
                    answer.className = 'history-answer';
                    answer.textContent = item.answer;

                    const time = document.createElement('div');
                    time.className = 'history-time';
                    time.textContent = new Date(item.timestamp).toLocaleString('es-ES');

                    historyItem.appendChild(question);
                    historyItem.appendChild(answer);
                    historyItem.appendChild(time);
                    State.sidebarContent.appendChild(historyItem);
                });
            }

            State.sidebar.classList.remove('none');
        }
    } catch (error) {
        showNotification('Error al cargar el historial', 'error');
        console.error('Error:', error);
    }
}

// Cargar item del historial
function loadHistoryItem(item) {
    // Limpiar mensaje de bienvenida si existe
    const welcomeMsg = State.messagesContainer.querySelector('.welcome-message');
    if (welcomeMsg) {
        welcomeMsg.remove();
    }

    addMessage(item.question, 'user');
    addMessage(item.answer, 'assistant', {
        from_history: true,
        sources: item.sources || []
    });

    State.sidebar.style.display = 'none';
}

function checkSidebar() {
    if (State.sidebar.classList.contains('none')) { return false; }
    return true;
}

// Mostrar estadísticas
async function showStats(changeVisibility = true) {
    if (checkSidebar() && changeVisibility) {
        sidebar.classList.add('none');
        return;
    }

    try {
        const result = await window.alfredAPI.getStats();

        if (result.success) {
            const stats = result.data;

            State.sidebarTitle.textContent = 'Estadisticas del sistema';
            State.sidebarContent.innerHTML = `
                <div class="stat-card">
                    <div class="stat-label">👤 Usuario</div>
                    <div class="stat-value">${stats.user_name || 'N/A'}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">📄 Documentos indexados</div>
                    <div class="stat-value">${stats.total_documents}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">💬 Consultas guardadas</div>
                    <div class="stat-value">${stats.total_qa_history}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">🤖 Modelo</div>
                    <div class="stat-value" style="font-size: 14px;">${stats.model_name}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">📁 Ruta de documentos</div>
                    <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px; word-break: break-all;">${stats.docs_path}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">✅ Estado</div>
                    <div class="stat-value" style="font-size: 16px; color: var(--success-color);">${stats.status}</div>
                </div>
            `;

            State.sidebar.classList.remove('none');
        }
    } catch (error) {
        showNotification('Error al cargar las estadisticas', 'error');
        console.error('Error:', error);
    }
}

// Mostrar conversaciones
async function showConversations() {
    if (checkSidebar()) {
        State.sidebar.classList.add('none');
        return;
    }

    try {
        await loadConversations();

        State.sidebarTitle.textContent = 'Conversaciones';
        State.sidebarContent.innerHTML = '<div id="conversationsList" class="conversations-list"></div>';

        updateConversationsList();
        State.sidebar.classList.remove('none');
    } catch (error) {
        showNotification('error', 'Error al cargar conversaciones');
        console.error('Error:', error);
    }
}

// Cargar configuracion
function loadSettings() {
    const saved = localStorage.getItem('alfred-settings');
    if (saved) {
        const loadedSettings = JSON.parse(saved);
        State.updateSettings(loadedSettings);
    }

    // Asegurar que las propiedades de foto de perfil existan
    const currentSettings = State.settings;
    if (!currentSettings.profilePicture) {
        State.updateSettings({ profilePicture: null });
    }
    if (!currentSettings.profilePictureHistory) {
        State.updateSettings({ profilePictureHistory: [] });
    }

    document.getElementById('serverUrl').value = State.settings.serverUrl;
    document.getElementById('autoSave').checked = State.settings.autoSave;
    document.getElementById('useHistory').checked = State.settings.useHistory;
    document.getElementById('soundEnabled').checked = State.settings.soundEnabled;
}

// Guardar configuracion
function saveSettingsHandler() {
    State.updateSettings({
        serverUrl: document.getElementById('serverUrl').value,
        autoSave: document.getElementById('autoSave').checked,
        useHistory: document.getElementById('useHistory').checked,
        soundEnabled: document.getElementById('soundEnabled').checked
    });

    localStorage.setItem('alfred-settings', JSON.stringify(State.settings));
    settingsModal.classList.add('none');

    showNotification('Configuracion guardada', 'success');
}

// Cargar el modelo actual
async function loadCurrentModel() {
    try {
        console.log('Cargando modelo actual...');
        const result = await window.alfredAPI.getModel();

        console.log('Respuesta de getModel:', result);

        if (result.success && result.data) {
            const currentModel = result.data.model_name;
            console.log('Modelo actual:', currentModel);

            if (modelSelect) {
                modelSelect.value = currentModel;
                console.log('Modelo cargado y seleccionado:', currentModel);
            } else {
                console.error('ERROR: modelSelect es null');
            }
        } else {
            console.error('Error en respuesta:', result);
        }
    } catch (error) {
        console.error('Error al cargar el modelo actual:', error);
    }
}

// Cambiar modelo
async function changeModel() {
    const newModel = modelSelect.value;
    const previousModel = modelSelect.options[modelSelect.selectedIndex === 0 ? 1 : 0].value;

    try {
        // Mostrar indicador de cambio
        modelSelect.disabled = true;
        updateStatus('warning', 'Cambiando modelo...', State.statusElement);

        const result = await window.alfredAPI.changeModel(newModel);

        if (result.success) {
            showNotification(`Modelo cambiado exitosamente a ${newModel}`, 'success');
            updateStatus('connected', 'Conectado', State.statusElement);

            // Agregar mensaje informativo en el chat
            addMessage(`🔄 Modelo cambiado a ${newModel}`, 'system');
            if (checkSidebar()) { showStats(false); }
        } else {
            showNotification('Error al cambiar el modelo', 'error');
            // Revertir al modelo anterior
            modelSelect.value = previousModel;
            updateStatus('connected', 'Conectado', State.statusElement);
        }
    } catch (error) {
        console.error('Error al cambiar modelo:', error);
        showNotification('Error al cambiar el modelo', 'error');
        // Revertir al modelo anterior
        modelSelect.value = previousModel;
        updateStatus('connected', 'Conectado', State.statusElement);
    } finally {
        modelSelect.disabled = false;
    }
}

// Función para reiniciar backend manualmente
async function restartBackend() {
    try {
        showNotification('info', 'Reiniciando servidor...');
        const result = await window.alfredAPI.restartBackend();

        if (result.success) {
            showNotification('success', 'Servidor reiniciado correctamente');
            await checkServerStatus();
        } else {
            showNotification('error', 'Error al reiniciar el servidor');
        }
    } catch (error) {
        console.error('Error al reiniciar backend:', error);
        showNotification('error', 'Error al reiniciar el servidor');
    }
}

// Función para detener Ollama y liberar recursos
function stopOllama() {
    // Mostrar mensaje inmediatamente sin confirmación bloqueante
    showNotification('info', 'Deteniendo Ollama en segundo plano...');
    addMessage('🛑 Deteniendo Ollama para liberar recursos...', 'system');

    // Ejecutar en segundo plano sin await
    window.alfredAPI.stopOllama()
        .then(result => {
            if (result.success) {
                showNotification('success', result.data.message || 'Ollama detenido exitosamente');
                // Actualizar el mensaje del sistema
                const systemMessages = messagesContainer.querySelectorAll('.message.system');
                const lastSystemMsg = systemMessages[systemMessages.length - 1];
                if (lastSystemMsg && lastSystemMsg.textContent.includes('Deteniendo Ollama')) {
                    lastSystemMsg.querySelector('.message-bubble').textContent = '🛑 Ollama detenido. Recursos liberados. Se recargará automáticamente en la próxima pregunta.';
                }
            } else {
                showNotification('error', result.error || 'Error al detener Ollama');
                // Actualizar el mensaje con error
                const systemMessages = messagesContainer.querySelectorAll('.message.system');
                const lastSystemMsg = systemMessages[systemMessages.length - 1];
                if (lastSystemMsg && lastSystemMsg.textContent.includes('Deteniendo Ollama')) {
                    lastSystemMsg.querySelector('.message-bubble').textContent = '❌ Error al detener Ollama.';
                }
            }
        })
        .catch(error => {
            console.error('Error al detener Ollama:', error);
            showNotification('error', 'Error al detener Ollama');
            if (State.messagesContainer) {
                const systemMessages = State.messagesContainer.querySelectorAll('.message.system');
                const lastSystemMsg = systemMessages[systemMessages.length - 1];
                if (lastSystemMsg && lastSystemMsg.textContent.includes('Deteniendo Ollama')) {
                    lastSystemMsg.querySelector('.message-bubble').textContent = '❌ Error al detener Ollama.';
                }
            }
        });

    // Retornar inmediatamente para no bloquear la UI
}

// Función auxiliar para actualizar estado de conexión
function updateConnectionStatus(connected) {
    if (connected) {
        updateStatus('connected', 'Conectado', State.statusElement, State.statusElement);
    } else {
        updateStatus('error', 'Desconectado', State.statusElement);
    }
}

// ==================== FUNCIONES DE FOTO DE PERFIL ====================

// Cargar foto de perfil y actualizar UI
function loadProfilePicture() {
    if (State.settings.profilePicture) {
        updateProfilePictureDisplay(State.settings.profilePicture);
    }
    updateProfileHistory();
}

// Actualizar visualización de foto de perfil
function updateProfilePictureDisplay(imageDataUrl) {
    currentProfilePicture.innerHTML = '';
    const img = document.createElement('img');
    img.src = imageDataUrl;
    img.alt = 'Foto de perfil';
    currentProfilePicture.appendChild(img);
}

// Cambiar foto de perfil
async function changeProfilePicture() {
    try {
        console.log('🖼️ Iniciando seleccion de foto de perfil...');

        // Asegurar que el historial existe
        if (!State.settings.profilePictureHistory) {
            State.updateSettings({ profilePictureHistory: [] });
        }

        const result = await window.alfredAPI.selectProfilePicture();

        console.log('📥 Resultado de seleccion:', {
            success: result.success,
            hasData: !!result.data,
            dataLength: result.data?.length,
            error: result.error
        });

        if (!result.success) {
            if (result.error !== 'Seleccion cancelada') {
                showNotification('error', `Error: ${result.error}`);
            }
            return;
        }

        if (result.success && result.data) {
            const newImageData = result.data;

            // Validar tamaño de la imagen (localStorage tiene limite ~5-10MB)
            const imageSizeKB = Math.round(newImageData.length / 1024);
            console.log(`📊 Tamaño de imagen: ${imageSizeKB} KB`);

            if (imageSizeKB > 5000) {
                showNotification('error', 'La imagen es demasiado grande (max 5MB). Por favor, usa una imagen mas pequeña.');
                return;
            }

            // Guardar la foto actual al historial antes de cambiarla
            const currentPicture = State.settings.profilePicture;
            const currentHistory = State.settings.profilePictureHistory;
            if (currentPicture && !currentHistory.includes(currentPicture)) {
                const newHistory = [currentPicture, ...currentHistory];
                // Limitar el historial a 20 fotos
                if (newHistory.length > 20) {
                    newHistory.pop();
                }
                State.updateSettings({ profilePictureHistory: newHistory });
            }

            // Establecer nueva foto de perfil
            State.updateSettings({ profilePicture: newImageData });

            // Actualizar UI
            updateProfilePictureDisplay(newImageData);
            updateProfileHistory();

            // Guardar en localStorage con manejo de errores
            try {
                localStorage.setItem('alfred-settings', JSON.stringify(State.settings));
                console.log('✅ Configuracion guardada correctamente');
                showNotification('success', 'Foto de perfil actualizada correctamente');
            } catch (storageError) {
                console.error('❌ Error al guardar en localStorage:', storageError);
                // Revertir cambios
                const currentHistory = State.settings.profilePictureHistory;
                State.updateSettings({
                    profilePicture: currentHistory[0] || null,
                    profilePictureHistory: currentHistory.slice(1)
                });
                showNotification('error', 'La imagen es demasiado grande para guardar. Por favor, usa una imagen mas pequeña.');
            }
        }
    } catch (error) {
        console.error('❌ Error al cambiar foto de perfil:', error);
        showNotification('error', `Error al seleccionar la foto: ${error.message}`);
    }
}

// Actualizar galeria de historial
function updateProfileHistory() {
    profileHistoryGallery.innerHTML = '';

    // Asegurar que el historial existe
    if (!State.settings.profilePictureHistory) {
        State.updateSettings({ profilePictureHistory: [] });
    }

    const history = State.settings.profilePictureHistory;

    if (history.length === 0) {
        profileHistoryGallery.innerHTML = '<div class="no-history-message">No hay fotos en el historial</div>';
        profileHistoryCount.textContent = '0 fotos';
        return;
    }

    profileHistoryCount.textContent = `${history.length} foto${history.length !== 1 ? 's' : ''}`;

    history.forEach((imageData, index) => {
        const item = document.createElement('div');
        item.className = 'profile-history-item';

        // Marcar como activa si es la foto actual
        if (imageData === State.settings.profilePicture) {
            item.classList.add('active');
        }

        const img = document.createElement('img');
        img.src = imageData;
        img.alt = `Foto historica ${index + 1}`;

        // Click para restaurar foto
        img.addEventListener('click', () => restoreProfilePicture(imageData, index));

        // Boton de eliminar
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.innerHTML = '×';
        deleteBtn.title = 'Eliminar esta foto';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteProfilePicture(index);
        });

        item.appendChild(img);
        item.appendChild(deleteBtn);
        profileHistoryGallery.appendChild(item);
    });
}

// Restaurar foto de perfil del historial
function restoreProfilePicture(imageData, index) {
    const currentPicture = State.settings.profilePicture;
    const currentHistory = [...State.settings.profilePictureHistory];

    // Guardar la foto actual al historial si no esta ya
    if (currentPicture && currentPicture !== imageData) {
        // Remover la imagen que vamos a restaurar del historial
        currentHistory.splice(index, 1);

        // Agregar la foto actual al principio del historial
        currentHistory.unshift(currentPicture);
    } else {
        // Solo remover la imagen del historial si ya es la actual
        currentHistory.splice(index, 1);
    }

    // Establecer como foto actual
    State.updateSettings({
        profilePicture: imageData,
        profilePictureHistory: currentHistory
    });

    // Actualizar UI
    updateProfilePictureDisplay(imageData);
    updateProfileHistory();

    // Guardar
    localStorage.setItem('alfred-settings', JSON.stringify(State.settings));

    showNotification('success', 'Foto de perfil restaurada');
}

// Eliminar foto del historial
function deleteProfilePicture(index) {
    const imageToDelete = State.settings.profilePictureHistory[index];

    // Si es la foto actual, resetear a default
    if (imageToDelete === State.settings.profilePicture) {
        State.updateSettings({ profilePicture: null });
        currentProfilePicture.innerHTML = '<span class="default-avatar">👤</span>';
    }

    // Eliminar del historial
    const newHistory = [...State.settings.profilePictureHistory];
    newHistory.splice(index, 1);
    State.updateSettings({ profilePictureHistory: newHistory });

    // Actualizar UI
    updateProfileHistory();

    // Guardar
    localStorage.setItem('alfred-settings', JSON.stringify(State.settings));

    showNotification('success', 'Foto eliminada del historial');
}

// Exponer funciones globalmente para los botones HTML
window.loadConversation = loadConversation;
window.deleteConversationById = deleteConversationById;
window.createNewConversation = createNewConversation;
window.stopOllama = stopOllama;
window.restartBackend = restartBackend;