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
  selectFolder: () => ipcRenderer.invoke('select-folder'),

  // API de configuraciones de usuario
  getUserSettings: () => ipcRenderer.invoke('get-user-settings'),
  getUserSetting: (key) => ipcRenderer.invoke('get-user-setting', key),
  setUserSetting: (key, value, type) => ipcRenderer.invoke('set-user-setting', key, value, type),
  deleteUserSetting: (key) => ipcRenderer.invoke('delete-user-setting', key),

  // API de foto de perfil
  getProfilePicture: () => ipcRenderer.invoke('get-profile-picture'),
  setProfilePicture: (pictureData) => ipcRenderer.invoke('set-profile-picture', pictureData),
  deleteProfilePicture: () => ipcRenderer.invoke('delete-profile-picture'),

  // API de Conversaciones
  createConversation: (title) => ipcRenderer.invoke('create-conversation', title),
  listConversations: (limit, offset) => ipcRenderer.invoke('list-conversations', limit, offset),
  getConversation: (conversationId) => ipcRenderer.invoke('get-conversation', conversationId),
  deleteConversation: (conversationId) => ipcRenderer.invoke('delete-conversation', conversationId),
  updateConversationTitle: (conversationId, newTitle) => ipcRenderer.invoke('update-conversation-title', conversationId, newTitle),
  clearConversation: (conversationId) => ipcRenderer.invoke('clear-conversation', conversationId),
  searchConversations: (query) => ipcRenderer.invoke('search-conversations', query),
  sendQueryWithConversation: (question, conversationId, searchDocuments) => ipcRenderer.invoke('send-query-with-conversation', question, conversationId, searchDocuments),
  sendQueryWithAttachment: (queryData) => ipcRenderer.invoke('send-query-with-attachment', queryData),

  // Escuchar notificaciones del backend
  onBackendNotification: (callback) => {
    ipcRenderer.on('backend-notification', (event, data) => callback(data));
  },
  onBackendStatus: (callback) => {
    ipcRenderer.on('backend-status', (event, data) => callback(data));
  },
  onInstallationProgress: (callback) => {
    ipcRenderer.on('installation-progress', (event, data) => callback(data));
  },
  onBackendReady: (callback) => {
    ipcRenderer.on('backend-ready', (event) => callback());
  },

  // API de cifrado
  getEncryptionKey: () => ipcRenderer.invoke('get-encryption-key'),
  getSensitiveFields: () => ipcRenderer.invoke('get-sensitive-fields'),
  decryptFernet: (encryptedData) => ipcRenderer.invoke('decrypt-fernet', encryptedData)
});

