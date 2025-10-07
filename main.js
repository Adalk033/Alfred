// main.js - Proceso principal de Electron
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const http = require('http');
const https = require('https');
const { spawn } = require('child_process');
const fs = require('fs');

let mainWindow;
let backendProcess = null;
let isBackendStartedByElectron = false;
let isCheckingBackend = false; // Flag para evitar chequeos simultáneos

// Configuración del backend
const BACKEND_CONFIG = {
    host: '127.0.0.1',
    port: 8000,
    path: path.join(__dirname, '..', 'Alfred'), // Ruta al proyecto Alfred
    script: 'alfred_backend.py',
    maxRetries: 3,
    retryDelay: 2000,
    startupTimeout: 30000
};

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        backgroundColor: '#1e1e1e',
        icon: path.join(__dirname, 'assets', 'icon.png'),
        show: false, // No mostrar hasta que esté listo
        frame: true,
        titleBarStyle: 'default'
    });

    mainWindow.loadFile('./renderer/index.html');

    // Mostrar cuando esté listo
    mainWindow.once('ready-to-show', () => {
        console.log('Ventana principal lista');
        mainWindow.show();
        // Verificar/iniciar backend después de mostrar la ventana
        checkAndStartBackend();
    });

    // Manejar recarga de la página (Ctrl+R)
    mainWindow.webContents.on('did-finish-load', () => {
        console.log('Pagina cargada/recargada');
        // Solo verificar conexión si ya pasó el ready-to-show inicial
        if (mainWindow.isVisible()) {
            // Dar tiempo a que el renderer se inicialice
            setTimeout(() => {
                checkAndStartBackend();
            }, 500);
        }
    });

    // Abrir DevTools en desarrollo
    if (process.argv.includes('--inspect')) {
        mainWindow.webContents.openDevTools();
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// Crear ventana cuando la app esté lista
app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

// Cerrar cuando todas las ventanas estén cerradas
app.on('window-all-closed', () => {
    // Detener el backend si lo iniciamos nosotros
    stopBackend();

    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Asegurar que el backend se detenga al cerrar la app
app.on('before-quit', () => {
    stopBackend();
});

// Verificar si el backend está corriendo
async function isBackendRunning() {
    return new Promise((resolve) => {
        const req = http.request({
            hostname: BACKEND_CONFIG.host,
            port: BACKEND_CONFIG.port,
            path: '/health',
            method: 'GET',
            timeout: 3000
        }, (res) => {
            resolve(res.statusCode === 200);
        });

        req.on('error', () => resolve(false));
        req.on('timeout', () => {
            req.destroy();
            resolve(false);
        });

        req.end();
    });
}

// Esperar a que el backend esté disponible
async function waitForBackend(timeout = BACKEND_CONFIG.startupTimeout) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
        if (await isBackendRunning()) {
            console.log('Backend esta disponible');
            return true;
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
        console.log('Esperando al backend...');
    }

    return false;
}

// Iniciar el proceso del backend
async function startBackend() {
    console.log('Verificando si el backend ya esta iniciado...');
    if (backendProcess) {
        console.log('El backend ya esta iniciado');
        return true;
    }

    console.log('Iniciando backend de Alfred...');

    // Verificar que el directorio existe
    if (!fs.existsSync(BACKEND_CONFIG.path)) {
        console.error('No se encontró el directorio del backend:', BACKEND_CONFIG.path);
        notifyUser('error', 'No se encontró el directorio del backend de Alfred');
        return false;
    }

    // Verificar que el script existe
    const scriptPath = path.join(BACKEND_CONFIG.path, BACKEND_CONFIG.script);
    if (!fs.existsSync(scriptPath)) {
        console.error('No se encontró el script del backend:', scriptPath);
        notifyUser('error', 'No se encontró alfred_backend.py');
        return false;
    }

    try {
        // Iniciar el proceso de Python
        backendProcess = spawn('python', [BACKEND_CONFIG.script], {
            cwd: BACKEND_CONFIG.path,
            env: { ...process.env },
            stdio: ['ignore', 'pipe', 'pipe']
        });

        isBackendStartedByElectron = true;

        // Capturar salida estándar
        backendProcess.stdout.on('data', (data) => {
            console.log(`[Backend] ${data.toString().trim()}`);
        });

        // Capturar errores
        backendProcess.stderr.on('data', (data) => {
            console.error(`[Backend Error] ${data.toString().trim()}`);
        });

        // Manejar cierre del proceso
        backendProcess.on('close', (code) => {
            console.log(`[Backend] Proceso terminado con codigo ${code}`);
            backendProcess = null;
            isBackendStartedByElectron = false;

            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('backend-status', { status: 'disconnected' });
            }
        });

        // Manejar errores del proceso
        backendProcess.on('error', (error) => {
            console.error('Error al iniciar el backend:', error);
            backendProcess = null;
            isBackendStartedByElectron = false;
            notifyUser('error', `Error al iniciar el backend: ${error.message}`);
        });

        // Esperar a que el backend esté listo
        notifyUser('info', 'Iniciando servidor de Alfred...');
        const isReady = await waitForBackend();

        if (isReady) {
            console.log('Backend iniciado correctamente');

            // Verificar y mostrar estado de GPU
            try {
                const gpuStatus = await makeRequest('http://127.0.0.1:8000/gpu/status');
                if (gpuStatus.success && gpuStatus.data) {
                    console.log('\n' + '='.repeat(60));
                    console.log('ESTADO DE GPU');
                    console.log('='.repeat(60));

                    if (gpuStatus.data.gpu_available) {
                        console.log('---GPU DETECTADA Y ACTIVA');
                        console.log(`   Tipo: ${gpuStatus.data.device_type}`);
                        console.log(`   Dispositivo: ${gpuStatus.data.device}`);

                        if (gpuStatus.data.gpu_info) {
                            const info = gpuStatus.data.gpu_info;
                            if (info.device_name) {
                                console.log(`   Nombre: ${info.device_name}`);
                            }
                            if (info.memory_total) {
                                console.log(`   Memoria: ${info.memory_total.toFixed(2)} GB`);
                            }
                            if (info.cuda_version) {
                                console.log(`   CUDA: ${info.cuda_version}`);
                            }
                        }
                        notifyUser('success', `Servidor iniciado con GPU ${gpuStatus.data.device_type}`);
                    } else {
                        console.log('---MODO CPU ACTIVO');
                        console.log(`   Dispositivo: ${gpuStatus.data.device_type}`);
                        console.log('   ---No se detectó GPU dedicada');
                        notifyUser('success', 'Servidor iniciado en modo CPU');
                    }
                    console.log('='.repeat(60) + '\n');
                } else {
                    notifyUser('success', 'Servidor de Alfred iniciado correctamente');
                }
            } catch (error) {
                console.log('No se pudo obtener el estado de GPU:', error.message);
                notifyUser('success', 'Servidor de Alfred iniciado correctamente');
            }

            return true;
        } else {
            console.error('El backend no respondio a tiempo');
            stopBackend();
            notifyUser('error', 'El servidor no respondio. Verifica los logs.');
            return false;
        }

    } catch (error) {
        console.error('Error al iniciar el backend:', error);
        notifyUser('error', `Error al iniciar el backend: ${error.message}`);
        return false;
    }
}

// Detener el proceso del backend
function stopBackend() {
    if (backendProcess && isBackendStartedByElectron) {
        console.log('Deteniendo backend...');

        // Intentar detener gracefully
        backendProcess.kill('SIGTERM');

        // Si no se detiene en 5 segundos, forzar
        setTimeout(() => {
            if (backendProcess) {
                console.log('Forzando detención del backend');
                backendProcess.kill('SIGKILL');
            }
        }, 5000);

        backendProcess = null;
        isBackendStartedByElectron = false;
    }
}

// Verificar y, si es necesario, iniciar el backend
async function checkAndStartBackend() {
    // Evitar chequeos simultáneos
    if (isCheckingBackend) {
        console.log('Ya hay un chequeo en progreso...');
        return;
    }

    isCheckingBackend = true;

    try {
        console.log('Verificando estado del backend...');

        const isRunning = await isBackendRunning();

        if (isRunning) {
            console.log('El backend ya esta corriendo');
            notifyUser('success', 'Conectado al servidor de Alfred');
            return true;
        }

        console.log('El backend no esta corriendo. Intentando iniciar...');
        return await startBackend();
    } finally {
        isCheckingBackend = false;
    }
}

// Notificar al usuario
function notifyUser(type, message) {
    console.log(`[NOTIFY] (${type}): ${message}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('backend-notification', { type, message });
    }
}

// Helper function para hacer requests HTTP
function makeRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const protocol = urlObj.protocol === 'https:' ? https : http;

        const requestOptions = {
            hostname: urlObj.hostname,
            port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
            path: urlObj.pathname + urlObj.search,
            method: options.method || 'GET',
            headers: options.headers || {}
        };

        const req = protocol.request(requestOptions, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const jsonData = JSON.parse(data);
                    resolve({ success: true, data: jsonData, statusCode: res.statusCode });
                } catch (error) {
                    resolve({ success: true, data: data, statusCode: res.statusCode });
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        if (options.body) {
            req.write(options.body);
        }

        req.end();
    });
}

// IPC handlers para comunicación con el renderer
ipcMain.handle('check-server', async () => {
    try {
        console.log('[MAIN] Verificando servidor Alfred en http://127.0.0.1:8000/health');
        const isRunning = await isBackendRunning();
        console.log(`[MAIN] Servidor está ${isRunning ? 'conectado' : 'no disponible'}`);
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
        notifyUser('info', 'Reiniciando servidor...');
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
        notifyUser('success', result.data.message || 'Ollama detenido exitosamente');
        return { success: true, data: result.data };
    } catch (error) {
        console.error('[MAIN] Error al detener Ollama:', error);
        notifyUser('error', 'Error al detener Ollama');
        return { success: false, error: error.message };
    }
});

// Handler para seleccionar foto de perfil
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
            console.log('[MAIN] Selección cancelada');
            return { success: false, error: 'Selección cancelada' };
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

// --- IPC Handlers para Conversaciones ---

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

