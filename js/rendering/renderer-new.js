// renderer-new.js - Punto de entrada principal de la aplicacion (arquitectura modular)

// Importaciones de modulos (rutas relativas desde js/rendering/ hacia js/)
import { scrollToBottom } from '../utils.js';
import { addMessage, clearMessages, showTypingIndicator, hideTypingIndicator } from '../messages.js';
import { 
    checkServerStatus, 
    sendMessage as apiSendMessage, 
    showHistory, 
    showStats, 
    loadCurrentModel, 
    changeModel, 
    restartBackend, 
    stopOllama 
} from '../api.js';
import { 
    createNewConversation, 
    loadConversations, 
    loadConversation, 
    deleteConversationById, 
    showConversations 
} from '../conversations.js';
import { 
    loadSettings, 
    saveSettingsHandler, 
    changeProfilePicture, 
    loadProfilePicture, 
    updateProfileHistory 
} from '../settings.js';
import { 
    showNotification, 
    updateConnectionStatus, 
    updateStatus, 
    hideSidebar, 
    showModal, 
    hideModal, 
    updateSearchModeUI, 
    clearInput, 
    showWelcomeMessage 
} from '../ui.js';
import { 
    getSettings, 
    setSearchMode, 
    getSearchMode, 
    getCurrentConversationId 
} from '../state.js';

// Referencias a elementos del DOM
let messagesContainer, messageInput, sendBtn, typingIndicator;
let statusElement, sidebar, sidebarTitle, sidebarContent;
let historyBtn, statsBtn, settingsBtn, closeSidebar, conversationsBtn;
let searchDocsBtn, promptOnlyBtn, modelSelect;
let settingsModal, closeSettings, cancelSettings, saveSettings;
let changeProfilePictureBtn;

// Inicializacion
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Inicializando Alfred...');
    
    // Inicializar referencias al DOM
    initializeDOMReferences();
    
    // Cargar configuracion
    loadSettings();
    loadProfilePicture();
    
    // Verificar conexion con el servidor
    await checkServerStatus();
    
    // Configurar event listeners
    setupEventListeners();
    
    // Cargar modelo actual
    await loadCurrentModel();
    
    // Cargar conversaciones
    await loadConversations();
    
    // Auto-ajustar altura del textarea (igual que el original)
    if (messageInput) {
        messageInput.addEventListener('input', () => {
            messageInput.style.height = 'auto';
            messageInput.style.height = messageInput.scrollHeight + 'px';
        });
    }
    
    console.log('Alfred inicializado correctamente');
});

// Inicializar referencias a elementos del DOM
function initializeDOMReferences() {
    messagesContainer = document.getElementById('messages');
    messageInput = document.getElementById('messageInput');
    sendBtn = document.getElementById('sendBtn');
    typingIndicator = document.getElementById('typingIndicator');
    statusElement = document.getElementById('status');
    sidebar = document.getElementById('sidebar');
    sidebarTitle = document.getElementById('sidebarTitle');
    sidebarContent = document.getElementById('sidebarContent');
    
    // Botones
    historyBtn = document.getElementById('historyBtn');
    statsBtn = document.getElementById('statsBtn');
    settingsBtn = document.getElementById('settingsBtn');
    closeSidebar = document.getElementById('closeSidebar');
    conversationsBtn = document.getElementById('conversationsBtn');
    
    // Botones de modo de busqueda
    searchDocsBtn = document.getElementById('searchDocsBtn');
    promptOnlyBtn = document.getElementById('promptOnlyBtn');
    
    // Selector de modelo
    modelSelect = document.getElementById('modelSelect');
    
    // Modal de configuracion
    settingsModal = document.getElementById('settingsModal');
    closeSettings = document.getElementById('closeSettings');
    cancelSettings = document.getElementById('cancelSettings');
    saveSettings = document.getElementById('saveSettings');
    
    // Foto de perfil
    changeProfilePictureBtn = document.getElementById('changeProfilePictureBtn');
}

// Configurar event listeners
function setupEventListeners() {
    // Enviar mensaje
    sendBtn.addEventListener('click', handleSendMessage);
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    });
    
    // Habilitar/deshabilitar boton de enviar segun el contenido
    messageInput.addEventListener('input', () => {
        sendBtn.disabled = !messageInput.value.trim();
    });
    
    // Sidebar
    if (historyBtn) historyBtn.addEventListener('click', showHistory);
    if (statsBtn) statsBtn.addEventListener('click', showStats);
    if (conversationsBtn) conversationsBtn.addEventListener('click', showConversations);
    if (closeSidebar) closeSidebar.addEventListener('click', hideSidebar);
    
    // Settings
    if (settingsBtn) settingsBtn.addEventListener('click', () => showModal('settingsModal'));
    if (closeSettings) closeSettings.addEventListener('click', () => hideModal('settingsModal'));
    if (cancelSettings) cancelSettings.addEventListener('click', () => hideModal('settingsModal'));
    if (saveSettings) saveSettings.addEventListener('click', saveSettingsHandler);
    
    // Modo de busqueda
    if (searchDocsBtn) {
        searchDocsBtn.addEventListener('click', () => {
            setSearchMode('documents');
            updateSearchModeUI('documents');
            showNotification('info', 'Modo: Buscar en documentos');
        });
    }
    
    if (promptOnlyBtn) {
        promptOnlyBtn.addEventListener('click', () => {
            setSearchMode('prompt');
            updateSearchModeUI('prompt');
            showNotification('info', 'Modo: Solo prompt');
        });
    }
    
    // Selector de modelo
    if (modelSelect) {
        modelSelect.addEventListener('change', async () => {
            const newModel = modelSelect.value;
            await changeModel(newModel);
        });
    }
    
    // Foto de perfil
    if (changeProfilePictureBtn) {
        changeProfilePictureBtn.addEventListener('click', changeProfilePicture);
    }
    
    // Escuchar notificaciones del backend
    window.alfredAPI.onBackendNotification((data) => {
        const { type, message } = data;
        showNotification(type, message);
        
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
}

// Manejar envio de mensaje
async function handleSendMessage() {
    const message = messageInput.value.trim();
    if (!message) return;
    
    // Limpiar mensaje de bienvenida si existe
    const welcomeMsg = messagesContainer.querySelector('.welcome-message');
    if (welcomeMsg) {
        welcomeMsg.remove();
    }
    
    // Crear conversacion si no existe
    let conversationId = getCurrentConversationId();
    if (!conversationId) {
        const result = await createNewConversation(null, false);
        conversationId = result?.id;
    }
    
    // Enviar mensaje
    const searchMode = getSearchMode();
    await apiSendMessage(message, searchMode, conversationId, async () => {
        // Callback de exito: actualizar lista de conversaciones
        await loadConversations();
    });
}

// Exportar funciones globales para ser usadas desde HTML (onclick, etc.)
window.createNewConversation = createNewConversation;
window.loadConversation = loadConversation;
window.deleteConversationById = deleteConversationById;
window.restartBackend = restartBackend;
window.stopOllama = stopOllama;

console.log('📦 Renderer.js cargado');
