// renderer.js - Lógica del cliente para la interfaz

let conversationHistory = [];
let currentConversationId = null; // ID de la conversacion activa
let conversations = []; // Lista de conversaciones

let settings = {
    serverUrl: 'http://127.0.0.1:8000',
    autoSave: true,
    useHistory: true,
    soundEnabled: false,
    profilePicture: null, // URL de la foto de perfil actual
    profilePictureHistory: [] // Array de fotos anteriores
};

// Estado del modo de búsqueda
let searchMode = 'prompt'; // 'documents' o 'prompt'

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

// Elementos del DOM
const messagesContainer = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const typingIndicator = document.getElementById('typingIndicator');
const statusElement = document.getElementById('status');
const sidebar = document.getElementById('sidebar');
const sidebarTitle = document.getElementById('sidebarTitle');
const sidebarContent = document.getElementById('sidebarContent');

// Botones
const historyBtn = document.getElementById('historyBtn');
const statsBtn = document.getElementById('statsBtn');
const settingsBtn = document.getElementById('settingsBtn');
const closeSidebar = document.getElementById('closeSidebar');

// Botones de modo de búsqueda
const searchDocsBtn = document.getElementById('searchDocsBtn');
const promptOnlyBtn = document.getElementById('promptOnlyBtn');

// Selector de modelo
const modelSelect = document.getElementById('modelSelect');

// Modal de configuración
const settingsModal = document.getElementById('settingsModal');
const closeSettings = document.getElementById('closeSettings');
const cancelSettings = document.getElementById('cancelSettings');
const saveSettings = document.getElementById('saveSettings');

// Elementos de foto de perfil
const changeProfilePictureBtn = document.getElementById('changeProfilePictureBtn');
const currentProfilePicture = document.getElementById('currentProfilePicture');
const profileHistoryGallery = document.getElementById('profileHistoryGallery');
const profileHistoryCount = document.getElementById('profileHistoryCount');

// Inicialización
document.addEventListener('DOMContentLoaded', async () => {
    await checkServerStatus();
    setupEventListeners();
    loadSettings();
    await loadCurrentModel();
    loadProfilePicture();
    await loadConversations(); // Cargar conversaciones al inicio

    // Auto-ajustar altura del textarea
    messageInput.addEventListener('input', () => {
        messageInput.style.height = 'auto';
        messageInput.style.height = messageInput.scrollHeight + 'px';
    });
});

// Configurar event listeners
function setupEventListeners() {
    sendBtn.addEventListener('click', sendMessage);
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    messageInput.addEventListener('input', () => {
        sendBtn.disabled = !messageInput.value.trim();
    });

    // Event listeners para botones de modo
    searchDocsBtn.addEventListener('click', () => {
        searchMode = 'documents';
        searchDocsBtn.classList.add('active');
        promptOnlyBtn.classList.remove('active');
    });

    promptOnlyBtn.addEventListener('click', () => {
        searchMode = 'prompt';
        promptOnlyBtn.classList.add('active');
        searchDocsBtn.classList.remove('active');
    });

    historyBtn.addEventListener('click', showHistory);
    statsBtn.addEventListener('click', showStats);
    settingsBtn.addEventListener('click', () => settingsModal.classList.remove('none'));
    closeSidebar.addEventListener('click', () => sidebar.classList.add('none'));

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
            updateStatus('connected', 'Conectado');
            await loadInitialStats();
        } else {
            updateStatus('error', 'Desconectado');
            showNotification('No se pudo conectar con el servidor de Alfred. Asegúrate de que esté ejecutándose.', 'error');
        }
    } catch (error) {
        updateStatus('error', 'Error de conexión');
        showNotification('Error al verificar el servidor', 'error');
    }
}

// Actualizar estado de conexión
function updateStatus(status, text) {
    statusElement.className = `status ${status}`;
    statusElement.querySelector('.status-text').textContent = text;
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
    const message = messageInput.value.trim();
    if (!message) return;

    // Limpiar mensaje de bienvenida si existe
    const welcomeMsg = messagesContainer.querySelector('.welcome-message');
    if (welcomeMsg) {
        welcomeMsg.remove();
    }

    // Crear conversacion si no existe (sin mostrar mensaje de bienvenida)
    if (!currentConversationId) {
        await createNewConversation(null, false);
    }

    // Agregar mensaje del usuario
    addMessage(message, 'user');
    conversationHistory.push({ role: 'user', content: message });

    // Limpiar input
    messageInput.value = '';
    messageInput.style.height = 'auto';
    sendBtn.disabled = true;

    // Mostrar indicador de escritura
    typingIndicator.style.display = 'flex';
    scrollToBottom();

    try {
        // Enviar consulta a Alfred con el modo de búsqueda seleccionado y el ID de conversacion
        const searchDocuments = searchMode === 'documents';
        console.log('📤 Enviando consulta:', { message, searchDocuments, conversationId: currentConversationId });

        const result = await window.alfredAPI.sendQueryWithConversation(message, currentConversationId, searchDocuments);

        console.log('📥 Respuesta recibida:', result);

        if (result.success) {
            const response = result.data;

            // Ocultar indicador de escritura
            typingIndicator.style.display = 'none';

            // Agregar respuesta de Alfred con efecto de escritura
            // Pasar la pregunta actual para que el botón de guardar tenga la referencia correcta
            await addMessageWithTyping(response.answer, 'assistant', response, message);

            conversationHistory.push({
                role: 'assistant',
                content: response.answer,
                metadata: response
            });

            // Actualizar lista de conversaciones
            await loadConversations();
        } else {
            typingIndicator.style.display = 'none';
            const errorMsg = result.error || 'Error desconocido';
            console.error('❌ Error del servidor:', errorMsg);
            showNotification('error', `Error: ${errorMsg}`);
            addMessage(`❌ Error: ${errorMsg}`, 'system');
        }
    } catch (error) {
        typingIndicator.style.display = 'none';
        console.error('❌ Error de conexión:', error);
        showNotification('error', 'Error de conexión con el servidor');
        addMessage('❌ Error de conexión con el servidor', 'system');
    }
}

// Agregar mensaje al chat
function addMessage(content, role, metadata = null, userQuestion = null) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';

    // Asignar avatar según el rol
    if (role === 'system') {
        avatar.textContent = '⚙️';
    } else if (role === 'user') {
        // Usar foto de perfil si existe, sino usar emoji por defecto
        if (settings.profilePicture) {
            const img = document.createElement('img');
            img.src = settings.profilePicture;
            img.alt = 'Avatar de usuario';
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
    bubble.textContent = content;

    contentDiv.appendChild(bubble);

    // Agregar metadata si existe
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
    }

    // Agregar botón de guardar si es mensaje del asistente
    if (role === 'assistant' && userQuestion) {
        const actionsDiv = createSaveButton(userQuestion, content, metadata);
        contentDiv.appendChild(actionsDiv);
    }

    messageDiv.appendChild(avatar);
    messageDiv.appendChild(contentDiv);
    messagesContainer.appendChild(messageDiv);

    scrollToBottom();
}

// Agregar mensaje con efecto de escritura
async function addMessageWithTyping(content, role, metadata = null, userQuestion = null) {
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
    messagesContainer.appendChild(messageDiv);

    // Efecto de escritura
    let index = 0;
    const speed = 10; // ms por carácter

    function typeChar() {
        if (index < content.length) {
            bubble.textContent += content.charAt(index);
            index++;
            scrollToBottom();
            setTimeout(typeChar, speed);
        } else {
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

// Guardar conversación en el historial
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

// Scroll al final
function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Mostrar historial
async function showHistory() {

    if (checkSidebar()) {
        sidebar.classList.add('none');
        return;
    }
    try {
        const result = await window.alfredAPI.getHistory(20);

        if (result.success) {
            sidebarTitle.textContent = 'Historial Preguntas rapidas';
            sidebarContent.innerHTML = '';

            if (result.data.length === 0) {
                sidebarContent.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 20px;">No hay conversaciones guardadas</p>';
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
                    sidebarContent.appendChild(historyItem);
                });
            }

            sidebar.classList.remove('none');
        }
    } catch (error) {
        showNotification('Error al cargar el historial', 'error');
        console.error('Error:', error);
    }
}

// Cargar item del historial
function loadHistoryItem(item) {
    // Limpiar mensaje de bienvenida si existe
    const welcomeMsg = messagesContainer.querySelector('.welcome-message');
    if (welcomeMsg) {
        welcomeMsg.remove();
    }

    addMessage(item.question, 'user');
    addMessage(item.answer, 'assistant', {
        from_history: true,
        sources: item.sources || []
    });

    sidebar.style.display = 'none';
}

function checkSidebar() {
    if (sidebar.classList.contains('none')) { return false; }
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

            sidebarTitle.textContent = 'Estadísticas del sistema';
            sidebarContent.innerHTML = `
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

            sidebar.classList.remove('none');
        }
    } catch (error) {
        showNotification('Error al cargar las estadísticas', 'error');
        console.error('Error:', error);
    }
}

// Mostrar conversaciones
async function showConversations() {
    if (checkSidebar()) {
        sidebar.classList.add('none');
        return;
    }

    try {
        await loadConversations();

        sidebarTitle.textContent = 'Conversaciones';
        sidebarContent.innerHTML = '<div id="conversationsList" class="conversations-list"></div>';

        updateConversationsList();
        sidebar.classList.remove('none');
    } catch (error) {
        showNotification('error', 'Error al cargar conversaciones');
        console.error('Error:', error);
    }
}

// Cargar configuración
function loadSettings() {
    const saved = localStorage.getItem('alfred-settings');
    if (saved) {
        settings = JSON.parse(saved);
    }

    // Asegurar que las propiedades de foto de perfil existan
    if (!settings.profilePicture) {
        settings.profilePicture = null;
    }
    if (!settings.profilePictureHistory) {
        settings.profilePictureHistory = [];
    }

    document.getElementById('serverUrl').value = settings.serverUrl;
    document.getElementById('autoSave').checked = settings.autoSave;
    document.getElementById('useHistory').checked = settings.useHistory;
    document.getElementById('soundEnabled').checked = settings.soundEnabled;
}

// Guardar configuración
function saveSettingsHandler() {
    settings.serverUrl = document.getElementById('serverUrl').value;
    settings.autoSave = document.getElementById('autoSave').checked;
    settings.useHistory = document.getElementById('useHistory').checked;
    settings.soundEnabled = document.getElementById('soundEnabled').checked;

    localStorage.setItem('alfred-settings', JSON.stringify(settings));
    settingsModal.classList.add('none');

    showNotification('Configuración guardada', 'success');
}

// Mostrar notificación
function showNotification(type, message) {
    // Crear contenedor de notificaciones si no existe
    let notificationContainer = document.getElementById('notification-container');
    if (!notificationContainer) {
        notificationContainer = document.createElement('div');
        notificationContainer.id = 'notification-container';
        document.body.appendChild(notificationContainer);
    }

    // Crear elemento de notificación
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;

    // Crear contenedor de mensaje
    const messageSpan = document.createElement('span');
    messageSpan.className = 'notification-message';
    messageSpan.textContent = message;

    // Crear botón de cerrar
    const closeButton = document.createElement('button');
    closeButton.className = 'notification-close';
    closeButton.innerHTML = '×';
    closeButton.setAttribute('aria-label', 'Cerrar notificación');

    // Función para cerrar la notificación
    const closeNotification = () => {
        notification.classList.remove('show');
        setTimeout(() => {
            notification.remove();
            // Si no hay más notificaciones, remover el contenedor
            if (notificationContainer.children.length === 0) {
                notificationContainer.remove();
            }
        }, 300);
    };

    // Agregar evento al botón de cerrar
    closeButton.addEventListener('click', closeNotification);

    // Agregar elementos a la notificación
    notification.appendChild(messageSpan);
    notification.appendChild(closeButton);

    // Agregar al contenedor
    notificationContainer.appendChild(notification);

    // Animar entrada
    setTimeout(() => notification.classList.add('show'), 12);

    // Remover después de 10 segundos
    const autoCloseTimeout = setTimeout(() => {
        closeNotification();
    }, 10000);

    // Cancelar el cierre automático si el usuario cierra manualmente
    closeButton.addEventListener('click', () => {
        clearTimeout(autoCloseTimeout);
    }, { once: true });

    // Actualizar status si es error de conexión
    if (type === 'error' && message.includes('conexión')) {
        updateStatus('error', 'Error de conexión');
    }
}

// Cargar el modelo actual
async function loadCurrentModel() {
    try {
        const result = await window.alfredAPI.getModel();

        if (result.success && result.data) {
            const currentModel = result.data.model_name;
            modelSelect.value = currentModel;
            console.log('Modelo actual cargado:', currentModel);
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
        updateStatus('warning', 'Cambiando modelo...');

        const result = await window.alfredAPI.changeModel(newModel);

        if (result.success) {
            showNotification(`Modelo cambiado exitosamente a ${newModel}`, 'success');
            updateStatus('connected', 'Conectado');

            // Agregar mensaje informativo en el chat
            addMessage(`🔄 Modelo cambiado a ${newModel}`, 'system');
            if (checkSidebar()) { showStats(false); }
        } else {
            showNotification('Error al cambiar el modelo', 'error');
            // Revertir al modelo anterior
            modelSelect.value = previousModel;
            updateStatus('connected', 'Conectado');
        }
    } catch (error) {
        console.error('Error al cambiar modelo:', error);
        showNotification('Error al cambiar el modelo', 'error');
        // Revertir al modelo anterior
        modelSelect.value = previousModel;
        updateStatus('connected', 'Conectado');
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
            const systemMessages = messagesContainer.querySelectorAll('.message.system');
            const lastSystemMsg = systemMessages[systemMessages.length - 1];
            if (lastSystemMsg && lastSystemMsg.textContent.includes('Deteniendo Ollama')) {
                lastSystemMsg.querySelector('.message-bubble').textContent = '❌ Error al detener Ollama.';
            }
        });

    // Retornar inmediatamente para no bloquear la UI
}

// Función auxiliar para actualizar estado de conexión
function updateConnectionStatus(connected) {
    if (connected) {
        updateStatus('connected', 'Conectado');
    } else {
        updateStatus('error', 'Desconectado');
    }
}

// ==================== FUNCIONES DE FOTO DE PERFIL ====================

// Cargar foto de perfil y actualizar UI
function loadProfilePicture() {
    if (settings.profilePicture) {
        updateProfilePictureDisplay(settings.profilePicture);
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
        console.log('🖼️ Iniciando selección de foto de perfil...');
        
        // Asegurar que el historial existe
        if (!settings.profilePictureHistory) {
            settings.profilePictureHistory = [];
        }
        
        const result = await window.alfredAPI.selectProfilePicture();
        
        console.log('📥 Resultado de selección:', { 
            success: result.success, 
            hasData: !!result.data,
            dataLength: result.data?.length,
            error: result.error 
        });
        
        if (!result.success) {
            if (result.error !== 'Selección cancelada') {
                showNotification('error', `Error: ${result.error}`);
            }
            return;
        }
        
        if (result.success && result.data) {
            const newImageData = result.data;
            
            // Validar tamaño de la imagen (localStorage tiene límite ~5-10MB)
            const imageSizeKB = Math.round(newImageData.length / 1024);
            console.log(`📊 Tamaño de imagen: ${imageSizeKB} KB`);
            
            if (imageSizeKB > 5000) {
                showNotification('error', 'La imagen es demasiado grande (máx 5MB). Por favor, usa una imagen más pequeña.');
                return;
            }
            
            // Guardar la foto actual al historial antes de cambiarla
            if (settings.profilePicture && !settings.profilePictureHistory.includes(settings.profilePicture)) {
                settings.profilePictureHistory.unshift(settings.profilePicture);
                // Limitar el historial a 20 fotos
                if (settings.profilePictureHistory.length > 20) {
                    settings.profilePictureHistory.pop();
                }
            }
            
            // Establecer nueva foto de perfil
            settings.profilePicture = newImageData;
            
            // Actualizar UI
            updateProfilePictureDisplay(newImageData);
            updateProfileHistory();
            
            // Guardar en localStorage con manejo de errores
            try {
                localStorage.setItem('alfred-settings', JSON.stringify(settings));
                console.log('✅ Configuración guardada correctamente');
                showNotification('success', 'Foto de perfil actualizada correctamente');
            } catch (storageError) {
                console.error('❌ Error al guardar en localStorage:', storageError);
                // Revertir cambios
                settings.profilePicture = settings.profilePictureHistory[0] || null;
                if (settings.profilePictureHistory.length > 0) {
                    settings.profilePictureHistory.shift();
                }
                showNotification('error', 'La imagen es demasiado grande para guardar. Por favor, usa una imagen más pequeña.');
            }
        }
    } catch (error) {
        console.error('❌ Error al cambiar foto de perfil:', error);
        showNotification('error', `Error al seleccionar la foto: ${error.message}`);
    }
}

// Actualizar galería de historial
function updateProfileHistory() {
    profileHistoryGallery.innerHTML = '';
    
    // Asegurar que el historial existe
    if (!settings.profilePictureHistory) {
        settings.profilePictureHistory = [];
    }
    
    if (settings.profilePictureHistory.length === 0) {
        profileHistoryGallery.innerHTML = '<div class="no-history-message">No hay fotos en el historial</div>';
        profileHistoryCount.textContent = '0 fotos';
        return;
    }
    
    profileHistoryCount.textContent = `${settings.profilePictureHistory.length} foto${settings.profilePictureHistory.length !== 1 ? 's' : ''}`;
    
    settings.profilePictureHistory.forEach((imageData, index) => {
        const item = document.createElement('div');
        item.className = 'profile-history-item';
        
        // Marcar como activa si es la foto actual
        if (imageData === settings.profilePicture) {
            item.classList.add('active');
        }
        
        const img = document.createElement('img');
        img.src = imageData;
        img.alt = `Foto histórica ${index + 1}`;
        
        // Click para restaurar foto
        img.addEventListener('click', () => restoreProfilePicture(imageData, index));
        
        // Botón de eliminar
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
    // Guardar la foto actual al historial si no está ya
    if (settings.profilePicture && settings.profilePicture !== imageData) {
        // Remover la imagen que vamos a restaurar del historial
        settings.profilePictureHistory.splice(index, 1);
        
        // Agregar la foto actual al principio del historial
        settings.profilePictureHistory.unshift(settings.profilePicture);
    } else {
        // Solo remover la imagen del historial si ya es la actual
        settings.profilePictureHistory.splice(index, 1);
    }
    
    // Establecer como foto actual
    settings.profilePicture = imageData;
    
    // Actualizar UI
    updateProfilePictureDisplay(imageData);
    updateProfileHistory();
    
    // Guardar
    localStorage.setItem('alfred-settings', JSON.stringify(settings));
    
    showNotification('success', 'Foto de perfil restaurada');
}

// Eliminar foto del historial
function deleteProfilePicture(index) {
    const imageToDelete = settings.profilePictureHistory[index];
    
    // Si es la foto actual, resetear a default
    if (imageToDelete === settings.profilePicture) {
        settings.profilePicture = null;
        currentProfilePicture.innerHTML = '<span class="default-avatar">👤</span>';
    }
    
    // Eliminar del historial
    settings.profilePictureHistory.splice(index, 1);
    
    // Actualizar UI
    updateProfileHistory();
    
    // Guardar
    localStorage.setItem('alfred-settings', JSON.stringify(settings));
    
    showNotification('success', 'Foto eliminada del historial');
}

// ===============================================
// FUNCIONES DE CONVERSACIONES
// ===============================================

// Crear una nueva conversacion
async function createNewConversation(title = null, showWelcome = true) {
    try {
        const result = await window.alfredAPI.createConversation(title);
        
        if (result.success) {
            currentConversationId = result.data.id;
            conversationHistory = [];
            
            // Limpiar chat
            messagesContainer.innerHTML = '';
            
            // Solo mostrar mensaje de bienvenida si se solicita explicitamente
            if (showWelcome) {
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
                messagesContainer.appendChild(welcomeDiv);
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
async function loadConversations() {
    try {
        const result = await window.alfredAPI.listConversations(50, 0);
        
        if (result.success) {
            conversations = result.data;
            updateConversationsList();
        } else {
            console.error('Error al cargar conversaciones:', result.error);
        }
    } catch (error) {
        console.error('Error al cargar conversaciones:', error);
    }
}

// Actualizar la lista de conversaciones en la UI
function updateConversationsList() {
    const conversationsList = document.getElementById('conversationsList');
    if (!conversationsList) return;
    
    conversationsList.innerHTML = '';
    
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
async function loadConversation(conversationId) {
    try {
        const result = await window.alfredAPI.getConversation(conversationId);
        
        if (result.success) {
            currentConversationId = conversationId;
            conversationHistory = result.data.messages.map(msg => ({
                role: msg.role,
                content: msg.content,
                metadata: msg.metadata
            }));
            
            // Limpiar y recargar mensajes
            messagesContainer.innerHTML = '';
            
            result.data.messages.forEach(msg => {
                addMessage(msg.content, msg.role, msg.metadata);
            });
            
            scrollToBottom();
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
async function deleteConversationById(conversationId) {
    if (!confirm('Estas seguro de que deseas eliminar esta conversacion?')) {
        return;
    }
    
    try {
        const result = await window.alfredAPI.deleteConversation(conversationId);
        
        if (result.success) {
            // Si es la conversacion actual, resetear
            if (conversationId === currentConversationId) {
                currentConversationId = null;
                conversationHistory = [];
                messagesContainer.innerHTML = '';
                
                const welcomeDiv = document.createElement('div');
                welcomeDiv.className = 'welcome-message';
                welcomeDiv.innerHTML = `
                    <h2>Hola! Soy Alfred</h2>
                    <p>Conversacion eliminada. Puedes crear una nueva o cargar una existente.</p>
                `;
                messagesContainer.appendChild(welcomeDiv);
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

// Formatear fecha para mostrar
function formatDate(isoString) {
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

// Exponer funciones globalmente para los botones HTML
window.loadConversation = loadConversation;
window.deleteConversationById = deleteConversationById;
window.createNewConversation = createNewConversation;


