// preload.js - Script de precarga para exponer API segura al renderer
const { contextBridge, ipcRenderer } = require('electron');

// Exponer API segura al proceso renderer
contextBridge.exposeInMainWorld('alfredAPI', {
  checkServer: () => ipcRenderer.invoke('check-server'),
  getStats: () => ipcRenderer.invoke('get-stats'),
  sendQuery: (question) => ipcRenderer.invoke('send-query', question),
  getHistory: (limit) => ipcRenderer.invoke('get-history', limit)
});
