// ===============================================
// ESTADO GLOBAL DE LA APLICACION
// ===============================================

// Referencias DOM - Se inicializan en renderer.js
export let messagesContainer;
export let messageInput;
export let sendBtn;
export let typingIndicator;
export let statusElement;
export let sidebar;
export let sidebarTitle;
export let sidebarContent;

// Funciones para actualizar referencias DOM
export function setDOMElements(elements) {
    messagesContainer = elements.messagesContainer;
    messageInput = elements.messageInput;
    sendBtn = elements.sendBtn;
    typingIndicator = elements.typingIndicator;
    statusElement = elements.statusElement;
    sidebar = elements.sidebar;
    sidebarTitle = elements.sidebarTitle;
    sidebarContent = elements.sidebarContent;
}

// Estado de conversaciones
export let conversations = [];
export let conversationHistory = [];
export let currentConversationId = null;
export let conversationSelectionMode = false;
export let selectedConversations = new Set();

export function setConversations(newConversations) {
    conversations = newConversations;
}

export function setConversationHistory(history) {
    conversationHistory = history;
}

export function setCurrentConversationId(id) {
    currentConversationId = id;
}

export function setConversationSelectionMode(mode) {
    conversationSelectionMode = mode;
}

export function setSelectedConversations(selected) {
    selectedConversations = selected;
}

export function addToConversationHistory(message) {
    conversationHistory.push(message);
}

export function clearConversationHistory() {
    conversationHistory = [];
}

// Estado de configuracion
export let settings = {
    serverUrl: 'http://127.0.0.1:8000',
    autoSave: true,
    useHistory: true,
    soundEnabled: false,
    profilePicture: null,
    profilePictureHistory: []
};

export function setSettings(newSettings) {
    settings = newSettings;
}

export function updateSettings(updates) {
    settings = { ...settings, ...updates };
}

// Estado del modo de busqueda
export let searchMode = 'prompt'; // 'documents' o 'prompt'

export function setSearchMode(mode) {
    searchMode = mode;
}
