// main.js - Proceso principal de Electron
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const http = require('http');
const https = require('https');
const { execSync, spawn } = require('child_process');
const fs = require('fs');
const { contextIsolated } = require('process');

let mainWindow;
let backendProcess = null;
let isBackendStartedByElectron = false;
let isCheckingBackend = false; // Flag para evitar chequeos simultáneos

const BACKEND_PORT = 8000;
const HOST = '127.0.0.1';
const PATH_BACKEND = path.join(__dirname, '.', 'backend'); // Ruta al proyecto Alfred
const SCRIPT_BACKEND = 'alfred_backend.py';

// Configuración del backend
const BACKEND_CONFIG = {
    host: HOST,
    port: BACKEND_PORT,
    path: PATH_BACKEND,
    script: SCRIPT_BACKEND,
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

async function ensurePythonEnv(backendPath) {
    const venvPath = path.join(backendPath, "venv");
    const requirementsPath = path.join(backendPath, "requirements.txt");

    // Detectar rutas del binario Python
    const pythonCmd = process.platform === "win32"
        ? path.join(venvPath, "Scripts", "python.exe")
        : path.join(venvPath, "bin", "python");

    try {
        if (!fs.existsSync(venvPath)) {
            console.log("Creando entorno virtual...");
            execSync("python -m venv venv", { 
                cwd: backendPath, 
                encoding: 'utf8',
                stdio: 'pipe'
            });
        }

        console.log(`Usando Python en: ${pythonCmd}`);

        // Verificar pip
        try {
            const pipVersion = execSync(`"${pythonCmd}" -m pip --version`, { 
                encoding: 'utf8',
                stdio: 'pipe'
            });
            console.log(pipVersion.trim());
        } catch {
            console.log("Instalando pip...");
            execSync(`"${pythonCmd}" -m ensurepip --upgrade`, { 
                cwd: backendPath, 
                encoding: 'utf8',
                stdio: 'pipe'
            });
        }

        // Verificar dependencias instaladas
        console.log("Verificando dependencias...");
        const installedPkgs = execSync(`"${pythonCmd}" -m pip freeze`, { 
            encoding: "utf8",
            stdio: 'pipe'
        }).toLowerCase();
        
        const reqs = fs.readFileSync(requirementsPath, "utf8")
            .split("\n")
            .filter(line => line.trim() && !line.trim().startsWith('#'))
            .map(line => line.trim());

        // Extraer nombres de paquetes (antes de ==, >=, etc.)
        const reqPkgNames = reqs.map(r => {
            const match = r.match(/^([a-zA-Z0-9\-_]+)/);
            return match ? match[1].toLowerCase() : null;
        }).filter(Boolean);

        // Verificar si hay paquetes faltantes
        const missing = reqPkgNames.filter(pkg => {
            // Buscar el paquete en pip freeze (nombre==version)
            const pattern = new RegExp(`^${pkg}==`, 'm');
            return !pattern.test(installedPkgs);
        });

        if (missing.length > 0) {
            console.log(`Instalando ${missing.length} dependencias faltantes: ${missing.join(', ')}`);

            await new Promise((resolve, reject) => {
                const proc = spawn(pythonCmd, [
                    "-m", "pip", "install", 
                    "--no-color",  // Deshabilitar colores ANSI
                    "--progress-bar", "off",  // Deshabilitar barra de progreso
                    "-r", "requirements.txt"
                ], {
                    cwd: backendPath,
                    stdio: ["ignore", "pipe", "pipe"],
                    env: { 
                        ...process.env, 
                        PYTHONIOENCODING: 'utf-8',  // Forzar UTF-8
                        PYTHONUNBUFFERED: '1'  // Sin buffer
                    }
                });

                let installOutput = '';

                proc.stdout.on("data", (data) => {
                    const output = data.toString('utf8').trim();
                    installOutput += output + '\n';
                    if (output && !output.includes('Requirement already satisfied')) {
                        console.log(`[pip] ${output}`);
                    }
                });
                
                proc.stderr.on("data", (data) => {
                    const error = data.toString('utf8').trim();
                    if (error) console.error(`[pip error] ${error}`);
                });

                proc.on("close", (code) => {
                    if (code === 0) {
                        console.log("Dependencias instaladas correctamente.");
                        resolve();
                    } else {
                        console.error("Error durante la instalacion de dependencias:");
                        console.error(installOutput);
                        reject(new Error(`pip exited with code ${code}`));
                    }
                });

                proc.on("error", (err) => {
                    reject(err);
                });
            });
        } else {
            console.log("Todas las dependencias ya estan instaladas.");
        }

        // Verificar PyTorch con CUDA (si hay GPU NVIDIA)
        await checkPyTorchCuda(pythonCmd);

        // NOTA: Poppler ya no es necesario - usamos PyPDFLoader que es nativo de Python
        // await checkPoppler();

        return pythonCmd;
    } catch (err) {
        console.error("Error en ensurePythonEnv:", err);
        throw err;
    }
}

// Verificar si PyTorch tiene soporte CUDA
async function checkPyTorchCuda(pythonCmd) {
    try {
        console.log("Verificando soporte GPU de PyTorch...");
        
        // Verificar si hay GPU NVIDIA
        const hasNvidiaGpu = await checkNvidiaGpu();
        
        if (!hasNvidiaGpu) {
            console.log("No se detecto GPU NVIDIA, usando version CPU de PyTorch");
            return;
        }

        // Verificar si PyTorch tiene CUDA - usar comillas simples para evitar conflictos
        const checkScript = "import torch; print('CUDA' if torch.cuda.is_available() else 'CPU')";
        const result = execSync(`"${pythonCmd}" -c "${checkScript}"`, {
            encoding: 'utf8',
            stdio: 'pipe'
        }).trim();

        if (result === 'CUDA') {
            console.log("PyTorch con soporte CUDA detectado correctamente");
        } else {
            console.log("==== PyTorch instalado SIN soporte CUDA");
            console.log("Para habilitar aceleracion GPU, ejecuta: .\\install-pytorch-gpu.ps1");
            notifyUser('warning', 'PyTorch sin GPU - Alfred usara CPU (más lento). Ejecuta install-pytorch-gpu.ps1 para habilitar GPU.');
        }
    } catch (err) {
        console.log("No se pudo verificar PyTorch GPU:", err.message);
    }
}

// Verificar si hay GPU NVIDIA
async function checkNvidiaGpu() {
    try {
        if (process.platform === 'win32') {
            execSync('nvidia-smi', { stdio: 'pipe' });
            return true;
        }
        return false;
    } catch {
        return false;
    }
}

// Verificar si Poppler está instalado
async function checkPoppler() {
    try {
        console.log("Verificando Poppler para procesamiento de PDFs...");
        execSync('pdfinfo -v', { stdio: 'pipe' });
        console.log("Poppler instalado correctamente");
    } catch {
        console.log("==== Poppler no está instalado");
        console.log("Los archivos PDF no se podrán procesar hasta instalarlo");
        console.log("Para instalarlo, ejecuta: .\\install-poppler.ps1");
        notifyUser('warning', 'Poppler no instalado - Los PDFs no se procesarán. Ejecuta install-poppler.ps1 para instalarlo.');
    }
}

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

async function startBackend() {
    console.log('Verificando si el backend ya esta iniciado...');
    if (backendProcess) {
        console.log('El backend ya esta iniciado');
        return true;
    }

    console.log('Iniciando backend de Alfred...');

    // Verificar que el directorio y script existan antes de lanzar el proceso
    if (!fs.existsSync(BACKEND_CONFIG.path)) {
        console.error('No se encontro el directorio del backend:', BACKEND_CONFIG.path);
        notifyUser('error', 'No se encontro el directorio del backend de Alfred');
        return false;
    }

    const scriptPath = path.join(BACKEND_CONFIG.path, 'core', BACKEND_CONFIG.script);
    if (!fs.existsSync(scriptPath)) {
        console.error('No se encontro el script del backend:', scriptPath);
        notifyUser('error', 'No se encontro alfred_backend.py');
        return false;
    }

    try {
        // Preparar entorno Python
        const pythonPath = await ensurePythonEnv(BACKEND_CONFIG.path);
        
        // Pequena pausa para asegurar que pip libere recursos
        await new Promise(resolve => setTimeout(resolve, 500));
        
        console.log('Iniciando servidor FastAPI...');

        // Ejecutar backend en modo sin buffer (-u)
        backendProcess = spawn(pythonPath, ['-u', scriptPath], {
            cwd: BACKEND_CONFIG.path,
            env: { 
                ...process.env,
                PYTHONIOENCODING: 'utf-8',  // Forzar UTF-8
                PYTHONUNBUFFERED: '1'  // Sin buffer
            },
            stdio: ['ignore', 'pipe', 'pipe']
        });

        // Captura de salida estándar
        backendProcess.stdout.on('data', (data) => {
            const output = data.toString('utf8').trim();
            if (output) console.log(`[Backend] ${output}`);
        });

        // Captura de errores
        backendProcess.stderr.on('data', (data) => {
            const error = data.toString('utf8').trim();
            if (error) console.error(`[Backend Error] ${error}`);
        });

        backendProcess.on('close', (code) => {
            console.log(`[Backend] Proceso finalizado con codigo ${code}`);
            backendProcess = null;
            isBackendStartedByElectron = false;
        });

        backendProcess.on('error', (err) => {
            console.error(`[Backend Error] ${err.message}`);
            backendProcess = null;
            isBackendStartedByElectron = false;
        });

        // Marcar que nosotros iniciamos el backend
        isBackendStartedByElectron = true;

        // Esperar a que el backend esté disponible antes de continuar
        const ready = await waitForBackend();
        if (!ready) {
            console.error('El backend no respondio a tiempo.');
            stopBackend();
            return false;
        }

        console.log('Backend iniciado correctamente.');
        return true;
    } catch (error) {
        console.error('Error al iniciar el backend:', error);
        notifyUser('error', `Error al iniciar el backend: ${error.message}`);
        stopBackend();
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
                console.log('Forzando detencion del backend');
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
        console.log(`[MAIN] Servidor esta ${isRunning ? 'conectado' : 'no disponible'}`);
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
        return { success: true, data: result.data };
    } catch (error) {
        console.error('[MAIN] Error al detener Ollama:', error);
        notifyUser('error', 'Error al detener Ollama');
        return { success: false, error: error.message };
    }
});

// Handler para obtener keep_alive de Ollama
ipcMain.handle('get-ollama-keep-alive', async () => {
    try {
        console.log('[MAIN] Obteniendo keep_alive de Ollama...');
        const result = await makeRequest('http://127.0.0.1:8000/ollama/keep-alive');
        console.log('[MAIN] Keep alive actual:', result.data);
        return { success: true, data: result.data };
    } catch (error) {
        console.error('[MAIN] Error al obtener keep_alive:', error);
        return { success: false, error: error.message };
    }
});

// Handler para actualizar keep_alive de Ollama
ipcMain.handle('set-ollama-keep-alive', async (event, seconds) => {
    try {
        console.log('[MAIN] Actualizando keep_alive a', seconds, 'segundos...');
        const result = await makeRequest('http://127.0.0.1:8000/ollama/keep-alive', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ seconds: seconds })
        });
        console.log('[MAIN] Keep alive actualizado:', result.data);
        return { success: true, data: result.data };
    } catch (error) {
        console.error('[MAIN] Error al actualizar keep_alive:', error);
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

