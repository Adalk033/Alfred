import { showNotification } from './core/notifications.js';
import { addMessage, scrollToBottom, markdownToHtml, updateStatus } from './dom/dom-utils.js';
import { createNewConversation, loadConversations, updateConversationsList, loadConversation, deleteConversationById, getCurrentConversationId, getConversationHistory } from './core/conversations.js';
import * as State from './state/state.js';

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
let menuToggle;
let leftSidebar;
let leftSidebarContent;
let newChatBtn;
let conversationsBtn;
let profilePictureTopbar;
let activeNavItem = null;

// Indicador de modo en topbar
let modeIndicator;
let modeIndicatorName;

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
let ollamaKeepAliveSlider;
let ollamaKeepAliveValue;
let ollamaKeepAlivePresets;

// Inicializacion
document.addEventListener('DOMContentLoaded', async () => {
    // Inicializar elementos del DOM en State
    State.setDOMElements({
        messagesContainer: document.getElementById('messages'),
        messageInput: document.getElementById('messageInput'),
        sendBtn: document.getElementById('sendBtn'),
        typingIndicator: document.getElementById('typingIndicator'),
        statusElement: document.getElementById('status'),
        sidebar: document.getElementById('leftSidebarContent'), // Ahora usamos el contenedor del sidebar izquierdo
        sidebarTitle: null, // Ya no necesitamos titulo separado
        sidebarContent: document.getElementById('leftSidebarContent')
    });

    // Inicializar elementos locales
    historyBtn = document.getElementById('historyBtn');
    statsBtn = document.getElementById('statsBtn');
    settingsBtn = document.getElementById('settingsBtn');
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
    ollamaKeepAliveSlider = document.getElementById('ollamaKeepAlive');
    ollamaKeepAliveValue = document.getElementById('ollamaKeepAliveValue');
    ollamaKeepAlivePresets = document.querySelectorAll('.preset-btn');
    
    // Elementos del sidebar izquierdo
    menuToggle = document.getElementById('menuToggle');
    leftSidebar = document.getElementById('leftSidebar');
    leftSidebarContent = document.getElementById('leftSidebarContent');
    newChatBtn = document.getElementById('newChatBtn');
    conversationsBtn = document.getElementById('conversationsBtn');
    profilePictureTopbar = document.getElementById('profilePictureTopbar');
    
    // Indicador de modo en topbar
    modeIndicator = document.getElementById('modeIndicator');
    modeIndicatorName = modeIndicator ? modeIndicator.querySelector('.mode-name') : null;

    // Esperar a que el backend este listo antes de habilitar el chat
    await waitForBackendReady();
    
    setupEventListeners();
    loadSettings();
    await loadCurrentModel();
    await loadOllamaKeepAlive(); // Cargar configuracion de keep_alive
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

    historyBtn.addEventListener('click', () => {
        showHistory();
        closeSidebarOnMobile();
    });
    statsBtn.addEventListener('click', () => {
        showStats();
        closeSidebarOnMobile();
    });
    settingsBtn.addEventListener('click', () => {
        settingsModal.classList.remove('none');
        closeSidebarOnMobile();
    });

    // Event listeners del sidebar izquierdo
    menuToggle.addEventListener('click', toggleLeftSidebar);
    newChatBtn.addEventListener('click', () => {
        window.createNewConversation();
        hideLeftSidebarContent();
        setActiveNavItem(null);
        closeSidebarOnMobile();
    });
    conversationsBtn.addEventListener('click', () => {
        showConversations();
        closeSidebarOnMobile();
    });
    
    // Event listener para foto de perfil en el topbar
    profilePictureTopbar.addEventListener('click', () => {
        settingsModal.classList.remove('none');
    });

    // Event listeners para botones de modo
    const modeButtons = document.querySelectorAll('.mode-btn');
    modeButtons.forEach(btn => {
        btn.addEventListener('click', async () => {
            const mode = btn.dataset.mode;
            
            // Cambiar clase active
            modeButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Cambiar modo en la aplicacion
            await window.setMode(mode);
        });
    });

    closeSettings.addEventListener('click', () => settingsModal.classList.add('none'));
    cancelSettings.addEventListener('click', () => settingsModal.classList.add('none'));
    saveSettings.addEventListener('click', saveSettingsHandler);

    // Event listener para cambio de modelo
    modelSelect.addEventListener('change', changeModel);

    // Event listener para cambiar foto de perfil
    changeProfilePictureBtn.addEventListener('click', changeProfilePicture);
    
    // Event listeners para Keep Alive de Ollama
    if (ollamaKeepAliveSlider) {
        ollamaKeepAliveSlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            updateKeepAliveDisplay(value);
        });
    }
    
    if (ollamaKeepAlivePresets) {
        ollamaKeepAlivePresets.forEach(btn => {
            btn.addEventListener('click', () => {
                const seconds = parseInt(btn.dataset.seconds);
                ollamaKeepAliveSlider.value = seconds;
                updateKeepAliveDisplay(seconds);
            });
        });
    }
}

// Esperar a que el backend este completamente listo
async function waitForBackendReady() {
    const API_BASE_URL = 'http://127.0.0.1:8000';
    const MAX_RETRIES = 60; // 2 minutos maximo (60 * 2 segundos)
    const RETRY_INTERVAL = 2000; // 2 segundos
    
    // Referencias al overlay
    const overlay = document.getElementById('backendLoadingOverlay');
    const statusText = document.getElementById('loadingStatusText');
    const progressBar = document.getElementById('loadingProgressBar');
    
    // Deshabilitar input mientras se espera
    if (State.messageInput) {
        State.messageInput.disabled = true;
        State.messageInput.placeholder = 'Iniciando Alfred...';
    }
    if (State.sendBtn) {
        State.sendBtn.disabled = true;
    }
    
    updateStatus('warning', 'Iniciando backend...', State.statusElement);
    
    let retries = 0;
    
    while (retries < MAX_RETRIES) {
        try {
            // Actualizar progreso visual
            const progress = (retries / MAX_RETRIES) * 100;
            if (progressBar) {
                progressBar.style.width = `${progress}%`;
            }
            
            // Intentar llamar al endpoint /health
            const response = await fetch(`${API_BASE_URL}/health`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                
                // Verificar que alfred_core este inicializado y vectorstore cargado
                // Aceptar tanto "healthy" como "degraded" (degraded = componentes opcionales fallan)
                const isReady = (data.status === 'healthy' || data.status === 'degraded') 
                    && data.alfred_core_initialized 
                    && data.vectorstore_loaded;
                
                if (isReady) {
                    // Backend esta listo!
                    if (progressBar) {
                        progressBar.style.width = '100%';
                    }
                    if (statusText) {
                        statusText.textContent = 'Alfred esta listo!';
                    }
                    
                    // Esperar un momento antes de ocultar el overlay
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                    // Ocultar overlay
                    if (overlay) {
                        overlay.classList.add('hidden');
                    }
                    
                    updateStatus('connected', 'Conectado', State.statusElement);
                    
                    // Habilitar input
                    if (State.messageInput) {
                        State.messageInput.disabled = false;
                        State.messageInput.placeholder = 'Escribe tu mensaje aqui...';
                    }
                    if (State.sendBtn) {
                        State.sendBtn.disabled = false;
                    }
                    
                    showNotification('success', 'Alfred esta listo para ayudarte');
                    await loadInitialStats();
                    return true;
                }
                
                // Backend responde pero no esta completamente listo
                if (statusText) {
                    if (!data.alfred_core_initialized) {
                        statusText.textContent = 'Inicializando sistema...';
                    } else if (!data.vectorstore_loaded) {
                        statusText.textContent = 'Cargando documentos...';
                    } else {
                        statusText.textContent = 'Preparando recursos...';
                    }
                }
                updateStatus('warning', 'Cargando...', State.statusElement);
            }
        } catch (error) {
            // Error de conexion - backend aun no responde
            console.log(`Esperando backend... intento ${retries + 1}/${MAX_RETRIES}`);
            
            if (statusText) {
                const dots = '.'.repeat((retries % 3) + 1);
                statusText.textContent = `Conectando con el backend${dots}`;
            }
        }
        
        // Esperar antes del siguiente intento
        await new Promise(resolve => setTimeout(resolve, RETRY_INTERVAL));
        retries++;
        
        // Actualizar mensaje de estado
        const dots = '.'.repeat((retries % 3) + 1);
        updateStatus('warning', `Iniciando backend${dots}`, State.statusElement);
    }
    
    // Si llegamos aqui, el backend no se inicio en el tiempo esperado
    if (overlay) {
        overlay.classList.add('hidden');
    }
    if (statusText) {
        statusText.textContent = 'Error al conectar con el backend';
    }
    
    updateStatus('error', 'Error al iniciar backend', State.statusElement);
    showNotification('error', 'No se pudo conectar con el backend despues de varios intentos. Intenta reiniciar la aplicacion.');
    
    return false;
}

// Verificar estado del servidor
async function checkServerStatus() {
    try {
        const result = await window.alfredAPI.checkServer();
        if (result.success || result.connected) {
            updateStatus('connected', 'Conectado', State.statusElement);
            await loadInitialStats();
        } else {
            updateStatus('error', 'Desconectado', State.statusElement);
            showNotification('No se pudo conectar con el servidor de Alfred. Asegúrate de que esté ejecutándose.', 'Hubo un error al conectar con el servidor de Alfred. Asegúrate de que esté ejecutándose.');
        }
    } catch (error) {
        updateStatus('error', 'Error de conexión', State.statusElement);
        showNotification('Error al verificar el servidor', 'Hubo un error al verificar el estado del servidor.');
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

    // Capturar tiempo de inicio
    const startTime = performance.now();

    try {
        // Enviar consulta a Alfred con el modo de busqueda seleccionado y el ID de conversacion
        const searchDocuments = State.searchMode === 'documents';
        console.log('📤 Enviando consulta:', { message, searchDocuments, conversationId: getCurrentConversationId() });

        const result = await window.alfredAPI.sendQueryWithConversation(message, getCurrentConversationId(), searchDocuments);

        // Capturar tiempo de fin y calcular duracion
        const endTime = performance.now();
        const responseTime = ((endTime - startTime) / 1000).toFixed(2); // Convertir a segundos

        console.log('📥 Respuesta recibida:', result);
        console.log('⏱️ Tiempo de respuesta:', responseTime + 's');

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

                    // Si hay más de 3, agregar contenedor para las fuentes ocultas y botón expandir
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
                        expandButton.textContent = `+${metadata.sources.length - 3} más...`;
                        expandButton.onclick = () => {
                            const isHidden = hiddenSourcesContainer.style.display === 'none';
                            hiddenSourcesContainer.style.display = isHidden ? 'block' : 'none';
                            expandButton.textContent = isHidden 
                                ? 'Ver menos' 
                                : `+${metadata.sources.length - 3} más...`;
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

// Toggle del sidebar izquierdo
function toggleLeftSidebar() {
    if (leftSidebar) {
        leftSidebar.classList.toggle('collapsed');
        
        // Rotar el icono del menu
        if (menuToggle) {
            menuToggle.classList.toggle('active');
        }
    }
}

// Cerrar sidebar en mobile cuando se hace clic en una opcion
function closeSidebarOnMobile() {
    if (window.innerWidth <= 768 && leftSidebar) {
        leftSidebar.classList.add('collapsed');
    }
}

// Mostrar contenido en el sidebar izquierdo
function showLeftSidebarContent() {
    if (leftSidebarContent) {
        leftSidebarContent.classList.add('active');
    }
}

// Ocultar contenido del sidebar izquierdo
function hideLeftSidebarContent() {
    if (leftSidebarContent) {
        leftSidebarContent.classList.remove('active');
    }
}

// Marcar item de navegacion como activo
function setActiveNavItem(button) {
    // Remover clase activa de todos los botones
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Agregar clase activa al boton actual
    if (button) {
        button.classList.add('active');
        activeNavItem = button;
    }
}

// Mostrar historial
async function showHistory() {
    // Si ya esta activo, ocultarlo
    if (activeNavItem === historyBtn && leftSidebarContent.classList.contains('active')) {
        hideLeftSidebarContent();
        setActiveNavItem(null);
        return;
    }

    try {
        const result = await window.alfredAPI.getHistory(20);

        if (result.success) {
            State.sidebarContent.innerHTML = '<h4 style="margin-bottom: 16px; color: var(--text-primary);">Historial Preguntas rapidas</h4>';

            if (result.data.length === 0) {
                State.sidebarContent.innerHTML += '<p style="color: var(--text-secondary); text-align: center; padding: 20px;">No hay conversaciones guardadas</p>';
            } else {
                result.data.forEach(item => {
                    const historyItem = document.createElement('div');
                    historyItem.className = 'history-item';
                    
                    const contentWrapper = document.createElement('div');
                    contentWrapper.className = 'history-item-content';
                    contentWrapper.onclick = () => loadHistoryItem(item);

                    const question = document.createElement('div');
                    question.className = 'history-question';
                    question.textContent = item.question;

                    const answer = document.createElement('div');
                    answer.className = 'history-answer';
                    answer.textContent = item.answer;

                    const time = document.createElement('div');
                    time.className = 'history-time';
                    time.textContent = new Date(item.timestamp).toLocaleString('es-ES');

                    contentWrapper.appendChild(question);
                    contentWrapper.appendChild(answer);
                    contentWrapper.appendChild(time);

                    const actionsDiv = document.createElement('div');
                    actionsDiv.className = 'history-item-actions';

                    const deleteBtn = document.createElement('button');
                    deleteBtn.className = 'delete-history-btn';
                    deleteBtn.textContent = 'x';
                    deleteBtn.title = 'Eliminar del historial';
                    deleteBtn.onclick = async (e) => {
                        e.stopPropagation();
                        await deleteHistoryItem(item.timestamp);
                    };

                    actionsDiv.appendChild(deleteBtn);
                    
                    historyItem.appendChild(contentWrapper);
                    historyItem.appendChild(actionsDiv);
                    State.sidebarContent.appendChild(historyItem);
                });
            }

            showLeftSidebarContent();
            setActiveNavItem(historyBtn);
        }
    } catch (error) {
        showNotification('Error al cargar el historial', 'error');
        console.error('Error:', error);
    }
}

// Eliminar item del historial
async function deleteHistoryItem(timestamp) {
    try {
        const result = await window.alfredAPI.deleteHistoryItem(timestamp);
        
        if (result.success) {
            showNotification('Pregunta eliminada del historial', 'success');
            // Recargar el historial
            await showHistory();
        } else {
            showNotification('Error al eliminar del historial', 'error');
        }
    } catch (error) {
        showNotification('Error al eliminar del historial', 'error');
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

    // Ocultar el contenido del sidebar al cargar un item
    hideLeftSidebarContent();
    setActiveNavItem(null);
}

// Mostrar estadísticas
async function showStats() {
    // Si ya esta activo, ocultarlo
    if (activeNavItem === statsBtn && leftSidebarContent.classList.contains('active')) {
        hideLeftSidebarContent();
        setActiveNavItem(null);
        return;
    }

    try {
        const result = await window.alfredAPI.getStats();

        if (result.success) {
            const stats = result.data;

            State.sidebarContent.innerHTML = `
                <h4 style="margin-bottom: 16px; color: var(--text-primary);">Estadisticas del sistema</h4>
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

            showLeftSidebarContent();
            setActiveNavItem(statsBtn);
        }
    } catch (error) {
        showNotification('Error al cargar las estadisticas', 'error');
        console.error('Error:', error);
    }
}

// Mostrar conversaciones
async function showConversations() {
    // Si ya esta activo, ocultarlo
    if (activeNavItem === conversationsBtn && leftSidebarContent.classList.contains('active')) {
        hideLeftSidebarContent();
        setActiveNavItem(null);
        return;
    }

    try {
        await loadConversations();

        State.sidebarContent.innerHTML = `
            <div class="conversations-header">
                <h4 id="conversationsTitle">Conversaciones</h4>
                <div class="conversations-actions">
                    <button id="selectionModeBtn" 
                            class="icon-btn-small" 
                            onclick="window.conversationActions.toggleSelectionMode()"
                            title="Seleccionar multiples">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M9 11l3 3L22 4"/>
                            <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
                        </svg>
                    </button>
                    <button id="deleteSelectedBtn" 
                            class="icon-btn-small danger" 
                            onclick="window.conversationActions.deleteSelected()"
                            title="Eliminar seleccionadas"
                            style="display: none;"
                            disabled>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                        </svg>
                        <span class="selected-count" style="display: none;"></span>
                    </button>
                </div>
            </div>
            <div id="conversationsList" class="conversations-list"></div>
        `;

        updateConversationsList();
        showLeftSidebarContent();
        setActiveNavItem(conversationsBtn);
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
    
    // Guardar keep_alive de Ollama
    saveOllamaKeepAlive();
    
    settingsModal.classList.add('none');

    showNotification('Configuracion guardada', 'success');
}

// ===============================================
// FUNCIONES DE OLLAMA KEEP ALIVE
// ===============================================

// Cargar configuracion actual de keep_alive
async function loadOllamaKeepAlive() {
    try {
        const result = await window.alfredAPI.getOllamaKeepAlive();
        
        if (result.success && result.data) {
            const seconds = result.data.keep_alive_seconds;
            if (ollamaKeepAliveSlider) {
                ollamaKeepAliveSlider.value = seconds;
                updateKeepAliveDisplay(seconds);
            }
            console.log('Keep alive cargado:', seconds, 'segundos');
        }
    } catch (error) {
        console.error('Error al cargar keep_alive:', error);
    }
}

// Actualizar el display del keep_alive
function updateKeepAliveDisplay(seconds) {
    if (ollamaKeepAliveValue) {
        ollamaKeepAliveValue.textContent = seconds;
    }
    
    // Actualizar botones de preset
    if (ollamaKeepAlivePresets) {
        ollamaKeepAlivePresets.forEach(btn => {
            const presetSeconds = parseInt(btn.dataset.seconds);
            if (presetSeconds === seconds) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }
}

// Guardar configuracion de keep_alive
async function saveOllamaKeepAlive() {
    try {
        const seconds = parseInt(ollamaKeepAliveSlider.value);
        const result = await window.alfredAPI.setOllamaKeepAlive(seconds);
        
        if (result.success) {
            console.log('Keep alive actualizado a', seconds, 'segundos');
            showNotification('Configuracion de Ollama actualizada', 'success');
        } else {
            console.error('Error al actualizar keep_alive:', result.error);
            showNotification('Error al actualizar configuracion de Ollama', 'error');
        }
    } catch (error) {
        console.error('Error al guardar keep_alive:', error);
        showNotification('Error al actualizar configuracion de Ollama', 'error');
    }
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
            // Actualizar estadisticas si estan activas
            if (activeNavItem === statsBtn && leftSidebarContent.classList.contains('active')) {
                showStats();
            }
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
                const systemMessages = State.messagesContainer.querySelectorAll('.message.system');
                const lastSystemMsg = systemMessages[systemMessages.length - 1];
                if (lastSystemMsg && lastSystemMsg.textContent.includes('Deteniendo Ollama')) {
                    lastSystemMsg.querySelector('.message-bubble').textContent = '🛑 Ollama detenido. Recursos liberados. Se recargará automáticamente en la próxima pregunta.';
                }
            } else {
                showNotification('error', result.error || 'Error al detener Ollama');
                // Actualizar el mensaje con error
                const systemMessages = State.messagesContainer.querySelectorAll('.message.system');
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

// Cargar foto de perfil desde backend y actualizar UI
async function loadProfilePicture() {
    try {
        console.log('🖼️ Cargando foto de perfil desde backend...');
        const result = await window.alfredAPI.getProfilePicture();
        
        if (result.success && result.data) {
            const { current, history } = result.data;
            
            // Actualizar estado local
            State.updateSettings({ 
                profilePicture: current,
                profilePictureHistory: history || []
            });
            
            // Actualizar UI
            if (current) {
                updateProfilePictureDisplay(current);
            }
            updateProfileHistory();
            
            console.log('✅ Foto de perfil cargada:', {
                hasCurrent: !!current,
                historyCount: history?.length || 0
            });
        } else {
            console.log('ℹ️ No hay foto de perfil guardada');
            // Inicializar historial vacio
            State.updateSettings({ 
                profilePicture: null,
                profilePictureHistory: []
            });
        }
    } catch (error) {
        console.error('❌ Error al cargar foto de perfil:', error);
        // Fallback a estado vacio
        State.updateSettings({ 
            profilePicture: null,
            profilePictureHistory: []
        });
    }
}

// Actualizar visualización de foto de perfil
function updateProfilePictureDisplay(imageDataUrl) {
    // Actualizar en modal de configuracion
    currentProfilePicture.innerHTML = '';
    const img = document.createElement('img');
    img.src = imageDataUrl;
    img.alt = 'Foto de perfil';
    currentProfilePicture.appendChild(img);
    
    // Actualizar en topbar
    if (profilePictureTopbar) {
        profilePictureTopbar.innerHTML = '';
        const imgTopbar = document.createElement('img');
        imgTopbar.src = imageDataUrl;
        imgTopbar.alt = 'Foto de perfil';
        profilePictureTopbar.appendChild(imgTopbar);
    }
}

// Cambiar foto de perfil
async function changeProfilePicture() {
    try {
        console.log('🖼️ Iniciando seleccion de foto de perfil...');

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

            // Validar tamaño de la imagen (max ~5MB en base64)
            const imageSizeKB = Math.round(newImageData.length / 1024);
            console.log(`📊 Tamaño de imagen: ${imageSizeKB} KB`);

            if (imageSizeKB > 5000) {
                showNotification('error', 'La imagen es demasiado grande (max 5MB). Por favor, usa una imagen mas pequeña.');
                return;
            }

            // Guardar en backend
            console.log('💾 Guardando foto en backend...');
            const saveResult = await window.alfredAPI.setProfilePicture(newImageData);
            
            if (!saveResult.success) {
                throw new Error(saveResult.error || 'Error al guardar foto');
            }

            // Actualizar estado local
            State.updateSettings({ profilePicture: newImageData });

            // Actualizar UI
            updateProfilePictureDisplay(newImageData);
            
            // Recargar historial desde backend
            await loadProfilePicture();

            console.log('✅ Foto de perfil guardada correctamente');
            showNotification('success', 'Foto de perfil actualizada correctamente');
        }
    } catch (error) {
        console.error('❌ Error al cambiar foto de perfil:', error);
        showNotification('error', `Error al guardar la foto: ${error.message}`);
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
async function restoreProfilePicture(imageData, index) {
    try {
        console.log('🔄 Restaurando foto del historial...');
        
        // Guardar directamente la foto seleccionada del historial
        const saveResult = await window.alfredAPI.setProfilePicture(imageData);
        
        if (!saveResult.success) {
            throw new Error(saveResult.error || 'Error al restaurar foto');
        }

        // Actualizar estado local
        State.updateSettings({ profilePicture: imageData });

        // Actualizar UI
        updateProfilePictureDisplay(imageData);
        
        // Recargar historial desde backend
        await loadProfilePicture();

        console.log('✅ Foto restaurada correctamente');
        showNotification('success', 'Foto de perfil restaurada');
    } catch (error) {
        console.error('❌ Error al restaurar foto:', error);
        showNotification('error', `Error al restaurar foto: ${error.message}`);
    }
}

// Eliminar foto del historial
async function deleteProfilePicture(index) {
    try {
        console.log('🗑️ Eliminando foto del historial...');
        
        const imageToDelete = State.settings.profilePictureHistory[index];

        // Si es la foto actual, eliminar desde backend
        if (imageToDelete === State.settings.profilePicture) {
            const deleteResult = await window.alfredAPI.deleteProfilePicture();
            
            if (!deleteResult.success) {
                throw new Error(deleteResult.error || 'Error al eliminar foto');
            }
            
            State.updateSettings({ profilePicture: null });
            currentProfilePicture.innerHTML = '<span class="default-avatar">👤</span>';
        }

        // Eliminar del historial local
        const newHistory = [...State.settings.profilePictureHistory];
        newHistory.splice(index, 1);
        
        // Guardar historial actualizado en backend
        await window.alfredAPI.setUserSetting('profile_picture_history', newHistory, 'json');
        
        // Actualizar estado local
        State.updateSettings({ profilePictureHistory: newHistory });

        // Actualizar UI
        updateProfileHistory();

        console.log('✅ Foto eliminada correctamente');
        showNotification('success', 'Foto eliminada del historial');
    } catch (error) {
        console.error('❌ Error al eliminar foto:', error);
        showNotification('error', `Error al eliminar foto: ${error.message}`);
    }
}

// ====================================
// SISTEMA DE MODOS
// ====================================

// Modos disponibles
const MODES = {
    WORK: 'work',
    FOCUS: 'focus',
    PERSONAL: 'personal',
    CREATIVE: 'creative'
};

// Nombres de modos para mostrar
const MODE_NAMES = {
    work: 'Work',
    focus: 'Focus',
    personal: 'Personal',
    creative: 'Creative'
};

// Estado actual del modo
let currentMode = MODES.WORK;

/**
 * Actualiza el indicador visual de modo en el topbar
 * @param {string} mode - Modo activo
 */
function updateModeIndicator(mode) {
    if (!modeIndicatorName) return;
    
    const modeName = MODE_NAMES[mode] || 'Work';
    modeIndicatorName.textContent = modeName;
}

/**
 * Cambia el modo de la aplicacion
 * @param {string} mode - Modo a activar (work, focus, personal, creative)
 */
async function setMode(mode) {
    if (!Object.values(MODES).includes(mode)) {
        console.error(`Modo invalido: ${mode}`);
        return;
    }

    // Actualizar modo actual
    currentMode = mode;

    // Aplicar el modo al body
    document.body.setAttribute('data-mode', mode);
    
    // Actualizar indicador de modo en topbar
    updateModeIndicator(mode);

    // Guardar en base de datos
    try {
        const response = await fetch('http://localhost:8000/settings/mode', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ mode })
        });

        if (!response.ok) {
            throw new Error('Error al guardar el modo');
        }

        showNotification('success', `Modo ${mode} activado`);
    } catch (error) {
        console.error('Error al guardar modo:', error);
        showNotification('error', 'Error al guardar el modo');
    }
}

/**
 * Obtiene el modo actual desde la base de datos
 */
async function loadMode() {
    try {
        const response = await fetch('http://localhost:8000/settings/mode');
        
        if (!response.ok) {
            throw new Error('Error al cargar el modo');
        }

        const data = await response.json();
        const savedMode = data.mode || MODES.WORK;

        // Aplicar el modo guardado
        currentMode = savedMode;
        document.body.setAttribute('data-mode', savedMode);
        
        // Actualizar indicador de modo en topbar
        updateModeIndicator(savedMode);

        // Marcar el boton activo en la UI
        const modeButtons = document.querySelectorAll('.mode-btn');
        modeButtons.forEach(btn => {
            if (btn.dataset.mode === savedMode) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        console.log(`Modo cargado: ${savedMode}`);
    } catch (error) {
        console.error('Error al cargar modo:', error);
        // Si falla, usar modo por defecto (work)
        document.body.setAttribute('data-mode', MODES.WORK);
        updateModeIndicator(MODES.WORK);
        
        // Marcar work como activo por defecto
        const modeButtons = document.querySelectorAll('.mode-btn');
        modeButtons.forEach(btn => {
            if (btn.dataset.mode === 'work') {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }
}

/**
 * Obtiene el modo actual
 */
function getCurrentMode() {
    return currentMode;
}

// Cargar el modo al iniciar la aplicacion
document.addEventListener('DOMContentLoaded', () => {
    loadMode();
});

// Exponer funciones globalmente para los botones HTML
window.loadConversation = loadConversation;
window.deleteConversationById = deleteConversationById;
window.createNewConversation = createNewConversation;
window.stopOllama = stopOllama;
window.restartBackend = restartBackend;
window.setMode = setMode;
window.getCurrentMode = getCurrentMode;
window.MODES = MODES;