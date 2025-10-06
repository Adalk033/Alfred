// renderer.js - Lógica del cliente para la interfaz

let conversationHistory = [];
let settings = {
    serverUrl: 'http://localhost:8000',
    autoSave: true,
    useHistory: true,
    soundEnabled: false
};

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

// Modal de configuración
const settingsModal = document.getElementById('settingsModal');
const closeSettings = document.getElementById('closeSettings');
const cancelSettings = document.getElementById('cancelSettings');
const saveSettings = document.getElementById('saveSettings');

// Inicialización
document.addEventListener('DOMContentLoaded', async () => {
    await checkServerStatus();
    setupEventListeners();
    loadSettings();
    
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

    historyBtn.addEventListener('click', showHistory);
    statsBtn.addEventListener('click', showStats);
    settingsBtn.addEventListener('click', () => settingsModal.style.display = 'flex');
    closeSidebar.addEventListener('click', () => sidebar.style.display = 'none');
    
    closeSettings.addEventListener('click', () => settingsModal.style.display = 'none');
    cancelSettings.addEventListener('click', () => settingsModal.style.display = 'none');
    saveSettings.addEventListener('click', saveSettingsHandler);
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
            showNotification('No se pudo conectar con el servidor de Alfred', 'error');
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
            console.log('Estadísticas:', stats);
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
        // Enviar consulta a Alfred
        const result = await window.alfredAPI.sendQuery(message);
        
        if (result.success) {
            const response = result.data;
            
            // Ocultar indicador de escritura
            typingIndicator.style.display = 'none';
            
            // Agregar respuesta de Alfred con efecto de escritura
            await addMessageWithTyping(response.answer, 'assistant', response);
            
            conversationHistory.push({ 
                role: 'assistant', 
                content: response.answer,
                metadata: response
            });
        } else {
            typingIndicator.style.display = 'none';
            showNotification('Error al procesar la consulta', 'error');
        }
    } catch (error) {
        typingIndicator.style.display = 'none';
        showNotification('Error de conexión', 'error');
        console.error('Error:', error);
    }
}

// Agregar mensaje al chat
function addMessage(content, role, metadata = null) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    
    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = role === 'user' ? '👤' : '🤖';
    
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
    
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(contentDiv);
    messagesContainer.appendChild(messageDiv);
    
    scrollToBottom();
}

// Agregar mensaje con efecto de escritura
async function addMessageWithTyping(content, role, metadata = null) {
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
    const speed = 20; // ms por carácter
    
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
            }
        }
    }
    
    typeChar();
}

// Scroll al final
function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Mostrar historial
async function showHistory() {
    try {
        const result = await window.alfredAPI.getHistory(20);
        
        if (result.success) {
            sidebarTitle.textContent = 'Historial de conversaciones';
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
            
            sidebar.style.display = 'flex';
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

// Mostrar estadísticas
async function showStats() {
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
            
            sidebar.style.display = 'flex';
        }
    } catch (error) {
        showNotification('Error al cargar las estadísticas', 'error');
        console.error('Error:', error);
    }
}

// Cargar configuración
function loadSettings() {
    const saved = localStorage.getItem('alfred-settings');
    if (saved) {
        settings = JSON.parse(saved);
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
    settingsModal.style.display = 'none';
    
    showNotification('Configuración guardada', 'success');
}

// Mostrar notificación
function showNotification(message, type = 'info') {
    // Crear notificación toast (puede mejorarse con una librería)
    console.log(`[${type.toUpperCase()}] ${message}`);
    
    // Actualizar status si es error de conexión
    if (type === 'error' && message.includes('conexión')) {
        updateStatus('error', 'Error de conexión');
    }
}
