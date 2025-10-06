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
  getModel: () => ipcRenderer.invoke('get-model'),
  changeModel: (modelName) => ipcRenderer.invoke('change-model', modelName),
  stopOllama: () => ipcRenderer.invoke('stop-ollama'),
  
  // Escuchar notificaciones del backend
  onBackendNotification: (callback) => {
    ipcRenderer.on('backend-notification', (event, data) => callback(data));
  },
  onBackendStatus: (callback) => {
    ipcRenderer.on('backend-status', (event, data) => callback(data));
  }
});
