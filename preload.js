// preload.js - Script de precarga para exponer API segura al renderer
const { contextBridge, ipcRenderer } = require('electron');

// Exponer API segura al proceso renderer
contextBridge.exposeInMainWorld('alfredAPI', {
  checkServer: () => ipcRenderer.invoke('check-server'),
  restartBackend: () => ipcRenderer.invoke('restart-backend'),
  getStats: () => ipcRenderer.invoke('get-stats'),
  sendQuery: (question, searchDocuments) => ipcRenderer.invoke('send-query', question, searchDocuments),
  getHistory: (limit) => ipcRenderer.invoke('get-history', limit),
  saveToHistory: (data) => ipcRenderer.invoke('save-to-history', data),
  deleteHistoryItem: (timestamp) => ipcRenderer.invoke('delete-history-item', timestamp),
  getModel: () => ipcRenderer.invoke('get-model'),
  changeModel: (modelName) => ipcRenderer.invoke('change-model', modelName),
  stopOllama: () => ipcRenderer.invoke('stop-ollama'),
  getOllamaKeepAlive: () => ipcRenderer.invoke('get-ollama-keep-alive'),
  setOllamaKeepAlive: (seconds) => ipcRenderer.invoke('set-ollama-keep-alive', seconds),
  selectProfilePicture: () => ipcRenderer.invoke('select-profile-picture'),
  
  // API de Conversaciones
  createConversation: (title) => ipcRenderer.invoke('create-conversation', title),
  listConversations: (limit, offset) => ipcRenderer.invoke('list-conversations', limit, offset),
  getConversation: (conversationId) => ipcRenderer.invoke('get-conversation', conversationId),
  deleteConversation: (conversationId) => ipcRenderer.invoke('delete-conversation', conversationId),
  updateConversationTitle: (conversationId, newTitle) => ipcRenderer.invoke('update-conversation-title', conversationId, newTitle),
  clearConversation: (conversationId) => ipcRenderer.invoke('clear-conversation', conversationId),
  searchConversations: (query) => ipcRenderer.invoke('search-conversations', query),
  sendQueryWithConversation: (question, conversationId, searchDocuments) => ipcRenderer.invoke('send-query-with-conversation', question, conversationId, searchDocuments),
  
  // Escuchar notificaciones del backend
  onBackendNotification: (callback) => {
    ipcRenderer.on('backend-notification', (event, data) => callback(data));
  },
  onBackendStatus: (callback) => {
    ipcRenderer.on('backend-status', (event, data) => callback(data));
  }
});

