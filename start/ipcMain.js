// start/ipcMain.js - IPC Handlers para comunicacion con el renderer
const { ipcMain, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const fernet = require('fernet');

/**
 * Registrar todos los IPC handlers
 * @param {Object} dependencies - Dependencias necesarias
 * @param {BrowserWindow} dependencies.mainWindow - Ventana principal
 * @param {Function} dependencies.isBackendRunning - Funcion para verificar backend
 * @param {Function} dependencies.stopBackend - Funcion para detener backend
 * @param {Function} dependencies.startBackend - Funcion para iniciar backend
 * @param {Function} dependencies.notifyBackendStatus - Funcion para notificar estado
 * @param {Function} dependencies.makeRequest - Funcion para hacer peticiones HTTP
 */
function registerIPCHandlers(dependencies) {
    const {
        mainWindow,
        isBackendRunning,
        stopBackend,
        startBackend,
        notifyBackendStatus,
        makeRequest
    } = dependencies;

    // ============================================================================
    // HANDLERS DE BACKEND
    // ============================================================================

    ipcMain.handle('check-server', async () => {
        try {
            console.log('[MAIN] Verificando servidor Alfred en http://127.0.0.1:8000/health');
            const isRunning = await isBackendRunning();
            console.log(`[MAIN] Servidor esta ${isRunning ? 'conectado' : 'no disponible'}`);

            // Notificar estado al frontend
            notifyBackendStatus(isRunning);

            return {
                connected: isRunning,
                message: isRunning ? 'Servidor conectado' : 'Servidor no disponible'
            };
        } catch (error) {
            console.error('[MAIN] Error al verificar servidor:', error);
            return { connected: false, message: 'Error al verificar conexión' };
        }
    });

    ipcMain.handle('restart-backend', async () => {
        try {
            stopBackend();
            await new Promise(resolve => setTimeout(resolve, 2000));
            const started = await startBackend();
            return { success: started };
        } catch (error) {
            console.error('Error al reiniciar backend:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('get-stats', async () => {
        try {
            const result = await makeRequest('http://127.0.0.1:8000/stats');
            return { success: true, data: result.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    // ============================================================================
    // HANDLERS DE CONSULTAS
    // ============================================================================

    ipcMain.handle('send-query', async (event, question, searchDocuments = true) => {
        try {
            console.log('[MAIN] Enviando consulta al backend:', { question, searchDocuments });

            // Consultar estado de GPU
            try {
                const gpuStatus = await makeRequest('http://127.0.0.1:8000/gpu/status');
                if (gpuStatus.success && gpuStatus.data) {
                    const gpuType = gpuStatus.data.gpu_available
                        ? `${gpuStatus.data.device_type}`
                        : 'CPU';
                    console.log(`[MAIN] Procesando con: ${gpuType}`);
                }
            } catch (gpuError) {
                console.log('[MAIN] No se pudo obtener estado de GPU');
            }

            const result = await makeRequest('http://127.0.0.1:8000/query', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(JSON.stringify({
                        question: question,
                        use_history: true,
                        save_response: false,
                        search_documents: searchDocuments
                    }))
                },
                body: JSON.stringify({
                    question: question,
                    use_history: true,
                    save_response: false,
                    search_documents: searchDocuments
                })
            });

            console.log('[MAIN] Respuesta del backend recibida');

            // Si el backend devuelve un error 500, result.data puede contener el detalle
            if (result.statusCode >= 400) {
                const errorDetail = result.data?.detail || result.data?.message || 'Error del servidor';
                console.error('[MAIN] Error del servidor:', errorDetail);
                return { success: false, error: errorDetail };
            }

            return { success: true, data: result.data };
        } catch (error) {
            console.error('[MAIN] Error en send-query:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('send-query-with-conversation', async (event, question, conversationId, searchDocuments = true) => {
        try {
            console.log('[MAIN] Enviando consulta con conversacion:', { question, conversationId, searchDocuments });

            const result = await makeRequest('http://127.0.0.1:8000/query/conversation', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    question: question,
                    conversation_id: conversationId || null,
                    use_history: true,
                    save_response: false,
                    search_documents: searchDocuments,
                    max_context_messages: 10
                })
            });

            console.log('[MAIN] Respuesta del backend recibida');

            if (result.statusCode >= 400) {
                const errorDetail = result.data?.detail || result.data?.message || 'Error del servidor';
                console.error('[MAIN] Error del servidor:', errorDetail);
                return { success: false, error: errorDetail };
            }

            return { success: true, data: result.data };
        } catch (error) {
            console.error('[MAIN] Error en send-query-with-conversation:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('send-query-with-attachment', async (event, queryData) => {
        try {
            const { message, conversationId, searchDocuments, attachedFile } = queryData;

            console.log('[MAIN] Enviando consulta con archivo adjunto:', {
                message,
                conversationId,
                searchDocuments,
                hasAttachment: !!attachedFile
            });

            const result = await makeRequest('http://127.0.0.1:8000/query/conversation', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    question: message,
                    conversation_id: conversationId || null,
                    use_history: true,
                    save_response: false,
                    search_documents: searchDocuments,
                    max_context_messages: 10,
                    temp_document: attachedFile || null
                })
            });

            console.log('[MAIN] Respuesta del backend recibida');

            if (result.statusCode >= 400) {
                const errorDetail = result.data?.detail || result.data?.message || 'Error del servidor';
                console.error('[MAIN] Error del servidor:', errorDetail);
                return { success: false, error: errorDetail };
            }

            return { success: true, data: result.data };
        } catch (error) {
            console.error('[MAIN] Error en send-query-with-attachment:', error);
            return { success: false, error: error.message };
        }
    });

    // ============================================================================
    // HANDLERS DE HISTORIAL
    // ============================================================================

    ipcMain.handle('get-history', async (event, limit = 10) => {
        try {
            const result = await makeRequest(`http://127.0.0.1:8000/history?limit=${limit}`);
            return { success: true, data: result.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('save-to-history', async (event, data) => {
        try {
            const result = await makeRequest('http://127.0.0.1:8000/history/save', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(JSON.stringify(data))
                },
                body: JSON.stringify(data)
            });

            return { success: true, data: result.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('delete-history-item', async (event, timestamp) => {
        try {
            const result = await makeRequest(`http://127.0.0.1:8000/history/${encodeURIComponent(timestamp)}`, {
                method: 'DELETE'
            });

            return { success: true, data: result.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    // ============================================================================
    // HANDLERS DE MODELO
    // ============================================================================

    ipcMain.handle('get-model', async () => {
        try {
            console.log('[MAIN] Obteniendo modelo actual desde http://127.0.0.1:8000/model');
            const result = await makeRequest('http://127.0.0.1:8000/model');
            console.log('[MAIN] Modelo actual:', result.data);
            return { success: true, data: result.data };
        } catch (error) {
            console.error('[MAIN] Error al obtener modelo:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('change-model', async (event, modelName) => {
        try {
            console.log('[MAIN] Cambiando modelo a:', modelName);
            const result = await makeRequest('http://127.0.0.1:8000/model', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(JSON.stringify({ model_name: modelName }))
                },
                body: JSON.stringify({ model_name: modelName })
            });

            console.log('[MAIN] Resultado del cambio de modelo:', result.data);
            return { success: true, data: result.data };
        } catch (error) {
            console.error('[MAIN] Error al cambiar modelo:', error);
            return { success: false, error: error.message };
        }
    });

    // ============================================================================
    // HANDLERS DE OLLAMA
    // ============================================================================

    ipcMain.handle('stop-ollama', async () => {
        try {
            console.log('[MAIN] Deteniendo Ollama...');
            const result = await makeRequest('http://127.0.0.1:8000/ollama/stop', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            console.log('[MAIN] Resultado de detener Ollama:', result.data);
            return { success: true, data: result.data };
        } catch (error) {
            console.error('[MAIN] Error al detener Ollama:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('get-ollama-keep-alive', async () => {
        try {
            console.log('[MAIN] Obteniendo keep_alive de Ollama...');
            const result = await makeRequest('http://127.0.0.1:8000/user/ollama-keep-alive');
            console.log('[MAIN] Keep alive actual:', result.data);
            return { success: true, data: result.data };
        } catch (error) {
            console.error('[MAIN] Error al obtener keep_alive:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('set-ollama-keep-alive', async (event, seconds) => {
        try {
            console.log('[MAIN] Actualizando keep_alive a', seconds, 'segundos...');
            const result = await makeRequest(`http://127.0.0.1:8000/user/ollama-keep-alive?seconds=${seconds}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            console.log('[MAIN] Keep alive actualizado:', result.data);
            return { success: true, data: result.data };
        } catch (error) {
            console.error('[MAIN] Error al actualizar keep_alive:', error);
            return { success: false, error: error.message };
        }
    });

    // ============================================================================
    // HANDLERS DE CONFIGURACIONES DE USUARIO
    // ============================================================================

    ipcMain.handle('get-user-settings', async () => {
        try {
            console.log('[MAIN] Obteniendo configuraciones de usuario...');
            const result = await makeRequest('http://127.0.0.1:8000/user/settings', {
                method: 'GET'
            });
            return { success: true, data: result.data };
        } catch (error) {
            console.error('[MAIN] Error al obtener configuraciones:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('get-user-setting', async (event, key) => {
        try {
            console.log('[MAIN] Obteniendo configuracion:', key);
            const result = await makeRequest(`http://127.0.0.1:8000/user/setting/${key}`, {
                method: 'GET'
            });
            return { success: true, data: result.data };
        } catch (error) {
            console.error('[MAIN] Error al obtener configuracion:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('set-user-setting', async (event, key, value, type = 'string') => {
        try {
            console.log('[MAIN] Guardando configuracion:', key, '=', value, `(${type})`);
            const result = await makeRequest('http://127.0.0.1:8000/user/setting', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    key: key,
                    value: value,
                    setting_type: type
                })
            });
            return { success: true, data: result.data };
        } catch (error) {
            console.error('[MAIN] Error al guardar configuracion:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('delete-user-setting', async (event, key) => {
        try {
            console.log('[MAIN] Eliminando configuracion:', key);
            const result = await makeRequest(`http://127.0.0.1:8000/user/setting/${key}`, {
                method: 'DELETE'
            });
            return { success: true, data: result.data };
        } catch (error) {
            console.error('[MAIN] Error al eliminar configuracion:', error);
            return { success: false, error: error.message };
        }
    });

    // ============================================================================
    // HANDLERS DE FOTO DE PERFIL
    // ============================================================================

    ipcMain.handle('get-profile-picture', async () => {
        try {
            console.log('[MAIN] Obteniendo foto de perfil...');
            const result = await makeRequest('http://127.0.0.1:8000/user/profile-picture', {
                method: 'GET'
            });
            return { success: true, data: result.data };
        } catch (error) {
            console.error('[MAIN] Error al obtener foto de perfil:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('set-profile-picture', async (event, pictureData) => {
        try {
            console.log('[MAIN] Guardando foto de perfil...');
            const result = await makeRequest('http://127.0.0.1:8000/user/profile-picture', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ picture_data: pictureData })
            });
            return { success: true, data: result.data };
        } catch (error) {
            console.error('[MAIN] Error al guardar foto de perfil:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('delete-profile-picture', async () => {
        try {
            console.log('[MAIN] Eliminando foto de perfil...');
            const result = await makeRequest('http://127.0.0.1:8000/user/profile-picture', {
                method: 'DELETE'
            });
            return { success: true, data: result.data };
        } catch (error) {
            console.error('[MAIN] Error al eliminar foto de perfil:', error);
            return { success: false, error: error.message };
        }
    });

    // ============================================================================
    // SEGURIDAD Y CIFRADO
    // ============================================================================

    ipcMain.handle('get-encryption-key', async () => {
        try {
            console.log('[MAIN] Obteniendo clave de cifrado...');
            const result = await makeRequest('http://127.0.0.1:8000/security/encryption-key');
            
            // makeRequest puede devolver result.data o result directamente
            const data = result.data || result;
            
            return { 
                success: true, 
                data: {
                    key: data.encryption_key,
                    algorithm: data.algorithm,
                    enabled: true
                }
            };
        } catch (error) {
            console.error('[MAIN] Error al obtener clave de cifrado:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('get-sensitive-fields', async () => {
        try {
            console.log('[MAIN] Obteniendo campos sensibles...');
            const result = await makeRequest('http://127.0.0.1:8000/security/sensitive-fields');
            
            // makeRequest puede devolver result.data o result directamente
            const data = result.data || result;
            
            return { success: true, data: data.sensitive_fields };
        } catch (error) {
            console.error('[MAIN] Error al obtener campos sensibles:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('select-profile-picture', async () => {
        try {
            console.log('[MAIN] Abriendo selector de foto de perfil...');

            const result = await dialog.showOpenDialog(mainWindow, {
                title: 'Seleccionar foto de perfil',
                properties: ['openFile'],
                filters: [
                    { name: 'Imágenes', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }
                ]
            });

            if (result.canceled || result.filePaths.length === 0) {
                console.log('[MAIN] Seleccion cancelada');
                return { success: false, error: 'Seleccion cancelada' };
            }

            const filePath = result.filePaths[0];
            console.log('[MAIN] Archivo seleccionado:', filePath);

            // Verificar tamaño del archivo antes de leerlo
            const stats = fs.statSync(filePath);
            const fileSizeInBytes = stats.size;
            const fileSizeInMB = fileSizeInBytes / (1024 * 1024);

            console.log('[MAIN] Tamaño del archivo:', fileSizeInMB.toFixed(2), 'MB');

            // Rechazar archivos muy grandes (más de 2MB)
            if (fileSizeInMB > 2) {
                console.log('[MAIN] Archivo demasiado grande');
                return {
                    success: false,
                    error: `La imagen es demasiado grande (${fileSizeInMB.toFixed(2)} MB). Por favor, usa una imagen menor a 2MB.`
                };
            }

            // Leer el archivo y convertirlo a Base64
            const imageBuffer = fs.readFileSync(filePath);
            const base64Image = imageBuffer.toString('base64');

            // Detectar el tipo MIME basado en la extensión
            const ext = path.extname(filePath).toLowerCase();
            let mimeType = 'image/jpeg';

            switch (ext) {
                case '.png':
                    mimeType = 'image/png';
                    break;
                case '.gif':
                    mimeType = 'image/gif';
                    break;
                case '.webp':
                    mimeType = 'image/webp';
                    break;
                case '.jpg':
                case '.jpeg':
                    mimeType = 'image/jpeg';
                    break;
            }

            const dataUrl = `data:${mimeType};base64,${base64Image}`;

            console.log('[MAIN] Imagen convertida a Base64, tamaño:', dataUrl.length, 'caracteres');
            console.log('[MAIN] Imagen procesada correctamente');

            return { success: true, data: dataUrl };
        } catch (error) {
            console.error('[MAIN] Error al seleccionar foto de perfil:', error);
            return { success: false, error: error.message };
        }
    });

    // ============================================================================
    // HANDLERS DE SELECCION DE CARPETAS
    // ============================================================================

    ipcMain.handle('select-folder', async () => {
        try {
            console.log('[MAIN] Abriendo selector de carpeta...');

            const result = await dialog.showOpenDialog(mainWindow, {
                title: 'Seleccionar carpeta de documentos',
                properties: ['openDirectory']
            });

            if (result.canceled || result.filePaths.length === 0) {
                console.log('[MAIN] Seleccion cancelada');
                return { success: false, error: 'Seleccion cancelada' };
            }

            const folderPath = result.filePaths[0];
            console.log('[MAIN] Carpeta seleccionada:', folderPath);

            // Verificar que la carpeta existe y es accesible
            if (!fs.existsSync(folderPath)) {
                return { success: false, error: 'La carpeta no existe' };
            }

            const stats = fs.statSync(folderPath);
            if (!stats.isDirectory()) {
                return { success: false, error: 'La ruta seleccionada no es una carpeta' };
            }

            return { success: true, path: folderPath };
        } catch (error) {
            console.error('[MAIN] Error al seleccionar carpeta:', error);
            return { success: false, error: error.message };
        }
    });

    // ============================================================================
    // HANDLERS DE CONVERSACIONES
    // ============================================================================

    ipcMain.handle('create-conversation', async (event, title) => {
        try {
            const result = await makeRequest('http://127.0.0.1:8000/conversations', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ title: title || null })
            });
            return { success: true, data: result.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('list-conversations', async (event, limit, offset) => {
        try {
            const params = new URLSearchParams();
            if (limit) params.append('limit', limit);
            if (offset) params.append('offset', offset);

            const url = `http://127.0.0.1:8000/conversations${params.toString() ? '?' + params.toString() : ''}`;
            const result = await makeRequest(url);
            return { success: true, data: result.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('get-conversation', async (event, conversationId) => {
        try {
            const result = await makeRequest(`http://127.0.0.1:8000/conversations/${conversationId}`);
            return { success: true, data: result.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('delete-conversation', async (event, conversationId) => {
        try {
            const result = await makeRequest(`http://127.0.0.1:8000/conversations/${conversationId}`, {
                method: 'DELETE'
            });
            return { success: true, data: result.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('update-conversation-title', async (event, conversationId, newTitle) => {
        try {
            const result = await makeRequest(`http://127.0.0.1:8000/conversations/${conversationId}/title`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ title: newTitle })
            });
            return { success: true, data: result.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('clear-conversation', async (event, conversationId) => {
        try {
            const result = await makeRequest(`http://127.0.0.1:8000/conversations/${conversationId}/messages`, {
                method: 'DELETE'
            });
            return { success: true, data: result.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('search-conversations', async (event, query) => {
        try {
            const result = await makeRequest(`http://127.0.0.1:8000/conversations/search/${encodeURIComponent(query)}`);
            return { success: true, data: result.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    // Handler para descifrar datos con Fernet en el main process
    let fernetSecret = null;
    
    ipcMain.handle('decrypt-fernet', async (event, encryptedData) => {
        try {
            // Si no tenemos instancia de Fernet, obtener la clave primero
            if (!fernetSecret) {
                const keyResult = await makeRequest('http://127.0.0.1:8000/security/encryption-key');
                if (keyResult.statusCode < 400 && keyResult.data?.encryption_key) {
                    // Crear Secret de Fernet con la clave del backend
                    fernetSecret = new fernet.Secret(keyResult.data.encryption_key);
                    console.log('[MAIN] Fernet Secret inicializado');
                } else {
                    return { success: false, error: 'No se pudo obtener clave de cifrado' };
                }
            }

            // Crear Token de Fernet a partir de los datos cifrados
            const token = new fernet.Token({
                secret: fernetSecret,
                token: encryptedData,
                ttl: 0 // Sin TTL para tokens que ya existen
            });

            // Descifrar los datos
            const decrypted = token.decode();
            return { success: true, data: decrypted };
        } catch (error) {
            console.error('[MAIN] Error descifrando con Fernet:', error);
            return { success: false, error: error.message, original: encryptedData };
        }
    });

    console.log('[IPC] Todos los handlers registrados correctamente');
}

module.exports = {
    registerIPCHandlers
};
