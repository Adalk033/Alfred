// main.js - Proceso principal de Electron
const { app, BrowserWindow, screen } = require('electron');
const path = require('path');
const http = require('http');
const https = require('https');

// Importar modulos de startup
const pythonModule = require('./start/ensurePython');
const ollamaModule = require('./start/ensureOllama');
const backendModule = require('./start/backend');
const { registerIPCHandlers } = require('./start/ipcMain');

const { ensurePython, ensurePythonEnv } = pythonModule;
const { checkOllama, ensureOllama, ensureOllamaModels, DEFAULT_REQUIRED_MODELS } = ollamaModule;
const {
    isBackendRunning,
    startBackend,
    stopBackend,
    startBackendAndWait
} = backendModule;

let mainWindow;
let backendProcess = null;
let isBackendStartedByElectron = false;
let isCheckingBackend = false; // Flag para evitar chequeos simultáneos
let isInitializing = false; // Flag para prevenir inicio del backend durante inicializacion

const BACKEND_PORT = 8000;
const HOST = '127.0.0.1';
const isPackaged = app.isPackaged;

// Determinar la ruta correcta del backend segun el modo
const PATH_BACKEND = isPackaged
    ? path.join(process.resourcesPath, 'backend')
    : path.join(__dirname, 'backend');

const SCRIPT_BACKEND = 'alfred_backend.py';

// Configuración del backend
const BACKEND_CONFIG = {
    host: HOST,
    port: BACKEND_PORT,
    path: PATH_BACKEND,
    script: SCRIPT_BACKEND,
    maxRetries: 3,
    retryDelay: 10000, // 10 segundos
    startupTimeout: 1200000  // 20 minutos para instalaciones grandes (modelos de 2GB)
};

// Modelos de Ollama requeridos (usar DEFAULT de modulo)
const REQUIRED_OLLAMA_MODELS = DEFAULT_REQUIRED_MODELS;

// Funciones de notificación al renderer
function createWindow() {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.size;

    mainWindow = new BrowserWindow({
        width: width,
        height: height,
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
        titleBarStyle: 'default',
        maximized: true // Abrir siempre maximizado
    });

    mainWindow.loadFile('./renderer/index.html');

    // Mostrar cuando esté listo
    mainWindow.once('ready-to-show', async () => {
        mainWindow.show();
        // Marcar que estamos en proceso de inicialización
        isInitializing = true;
        console.log('[INIT] Flag isInitializing = true - Bloqueando inicio automatico del backend');

        try {
            await initializeAppWithProgress();
        } catch (error) {
            console.error('Error en inicializacion:', error);
        } finally {
            isInitializing = false;
            console.log('[INIT] Flag isInitializing = false - Inicializacion completada');
        }
        // Iniciar monitoreo del estado del backend DESPUES de la inicializacion
    });

    // Manejar recarga de la página (Ctrl+R)
    mainWindow.webContents.on('did-finish-load', () => {
        //No iniciar backend durante la inicialización inicial
        if (isInitializing) { return; }

        // Solo verificar conexión si ya pasó el ready-to-show inicial
        if (mainWindow.isVisible()) { setTimeout(() => { checkAndStartBackend_wrapper(); }, 500); }
    });

    // Abrir DevTools en desarrollo
    if (process.argv.includes('--inspect')) {
        mainWindow.webContents.openDevTools();
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// Prevenir múltiples instancias de la aplicación
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    console.log('[APP] Ya hay una instancia de Alfred corriendo. Cerrando esta instancia...');
    app.quit();
}
else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        // Si alguien intenta abrir otra instancia, enfocar la ventana existente
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });

    // Crear ventana cuando la app esté lista
    app.whenReady().then(() => {
        createWindow();

        // Registrar todos los IPC handlers
        registerIPCHandlers({
            mainWindow: () => mainWindow,
            isBackendRunning: isBackendRunning_wrapper,
            stopBackend: stopBackend_wrapper,
            startBackend: startBackend_wrapper,
            notifyBackendStatus,
            makeRequest
        });

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                createWindow();
            }
        });
    });
}

// Cerrar cuando todas las ventanas estén cerradas
app.on('window-all-closed', () => {
    // Detener monitoreo y backend
    stopStatusMonitoring();
    stopBackend_wrapper();

    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Asegurar que el backend se detenga al cerrar la app
app.on('before-quit', () => {
    stopStatusMonitoring();
    stopBackend_wrapper();
});

// === SISTEMA DE INSTALACIÓN AUTOMÁTICA ===

// Wrapper para notifyProgress que fuerza progresion ordenada sin conflictos
function createProgressNotifier() {
    let lastNotifiedPercent = 0;
    const minNotificationGap = 8;  // Minimo incremento para notificar
    
    return (eventId, message, percent) => {
        // Si es error (0%), notificar siempre
        if (percent === 0) {
            lastNotifiedPercent = 0;
            notifyInstallationProgress(eventId, message, percent);
            return;
        }
        
        // Si baja, silenciar (no notificar)
        if (percent <= lastNotifiedPercent) {
            return;
        }
        
        // Si el incremento es pequeño (<8%), silenciar
        if (percent - lastNotifiedPercent < minNotificationGap) {
            return;
        }
        
        // Notificar solo cuando hay incremento significativo
        lastNotifiedPercent = percent;
        notifyInstallationProgress(eventId, message, percent);
    };
}

// Función principal de inicialización con progreso
async function initializeAppWithProgress() {
    try {
        // Crear notificador de progreso ordenado
        const progressNotifier = createProgressNotifier();
        
        // PASO 1: Verificar/Instalar Python (0-15%)
        progressNotifier('python-check', 'Verificando Python...', 5);
        const devMode = !isPackaged;
        if (devMode) {
            const pythonReady = await ensurePython(mainWindow, progressNotifier);
            if (!pythonReady) {
                await new Promise(resolve => setTimeout(resolve, 3000));
                app.exit(1);
                return false;
            }
        }
        else {
            console.log('[INIT] Modo produccion detectado, se asume que Python ya esta instalado.');
        }
        progressNotifier('python-ready', 'Python listo', 15);

        // PASO 2: Verificar/Instalar Ollama (15-35%)
        progressNotifier('ollama-check', 'Verificando Ollama...', 20);
        const ollamaReady = await ensureOllama(progressNotifier);
        if (!ollamaReady) {
            await new Promise(resolve => setTimeout(resolve, 5000));
            progressNotifier('error', 'Error: Ollama no disponible', 0);
            return false;
        }
        progressNotifier('ollama-ready', 'Ollama listo', 35);

        // PASO 2.1: Verificacion adicional de Ollama (35-45%)
        console.log('[INIT] Verificando que Ollama este completamente funcional...');
        progressNotifier('ollama-verify', 'Verificando Ollama...', 38);

        let ollamaFunctional = false;
        for (let i = 0; i < 5; i++) {
            if (await checkOllama()) {
                console.log(`[INIT] Ollama verificado correctamente (intento ${i + 1})`);
                ollamaFunctional = true;
                break;
            }
            console.log(`[INIT] Esperando confirmacion de Ollama... (${i + 1}/5)`);
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        if (!ollamaFunctional) {
            progressNotifier('error', 'Error: Ollama no responde', 0);
            return false;
        }

        console.log('[INIT] Ollama confirmado y funcional');
        progressNotifier('ollama-verify-complete', 'Ollama verificado', 45);

        // PASO 3: Verificar/Descargar modelos de Ollama (45-65%)
        progressNotifier('models-check', 'Verificando modelos...', 50);
        await ensureOllamaModels(REQUIRED_OLLAMA_MODELS, progressNotifier);
        progressNotifier('models-ready', 'Modelos listos', 65);

        // PASO 4: Configurar entorno Python y dependencias (65-75%)
        progressNotifier('python-env', 'Configurando Python...', 70);
        try {
            await ensurePythonEnv(BACKEND_CONFIG.path, isPackaged, progressNotifier);
        }
        catch (error) {
            progressNotifier('python-env-error', `Error configurando Python, ${error.message}`, 0);
        }
        progressNotifier('python-env-ready', 'Python configurado', 75);

        // PASO 5: Iniciar backend y ESPERAR a que responda (75-95%)
        progressNotifier('backend-start', 'Iniciando backend...', 80);

        const backendReady = await startBackendAndWait_wrapper();

        if (!backendReady) {
            return false;
        }
        progressNotifier('backend-ready', 'Backend listo', 95);

        // PASO 6: Backend confirmado - ocultar loader y mostrar UI (95-100%)
        progressNotifier('complete', 'Inicializacion completa', 100);

        // Esperar un momento antes de ocultar el loader
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Notificar al renderer que puede ocultar el loader
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('backend-ready');
        }

        // AHORA iniciar monitoreo continuo
        startStatusMonitoring();

        return true;

    } catch (error) {
        console.error('Error durante la inicializacion:', error);
        return false;
    }
}

/**
 * Wrapper simplificado para startBackendAndWait del modulo
 */
async function startBackendAndWait_wrapper() {
    // Temporalmente deshabilitar flag de inicializacion
    const wasInitializing = isInitializing;
    if (wasInitializing) {
        console.log('[INIT] Temporalmente deshabilitando flag isInitializing para permitir inicio controlado');
        isInitializing = false;
    }

    try {
        // Preparar estado del proceso
        const processState = {
            process: backendProcess,
            isStartedByElectron: isBackendStartedByElectron
        };

        // Obtener python path
        const pythonPath = await ensurePythonEnv(BACKEND_CONFIG.path, isPackaged, notifyInstallationProgress);

        // Llamar a la funcion del modulo con getter que devuelve el estado actualizado
        const result = await startBackendAndWait(
            BACKEND_CONFIG,
            pythonPath,
            app.getPath('userData'),
            notifyInstallationProgress,
            notifyBackendStatus,
            processState,
            () => processState.process  // Usar processState.process en lugar de backendProcess global
        );

        // Actualizar referencias globales
        backendProcess = processState.process;
        isBackendStartedByElectron = processState.isStartedByElectron;

        return result;
    } finally {
        if (wasInitializing) {
            console.log('[INIT] Restaurando flag isInitializing a true');
            isInitializing = true;
        }
    }
}

/**
 * Wrapper simplificado para isBackendRunning del modulo
 */
async function isBackendRunning_wrapper() {
    return await isBackendRunning(BACKEND_CONFIG);
}

/**
 * Wrapper simplificado para startBackend del modulo
 */
async function startBackend_wrapper() {
    if (isInitializing) {
        console.log('[BACKEND] ABORTADO: isInitializing=true, no se puede iniciar backend ahora');
        notifyInstallationProgress('backend-error', 'Error: Inicializacion en progreso', 0);
        return false;
    }

    const processState = {
        process: backendProcess,
        isStartedByElectron: isBackendStartedByElectron
    };

    const pythonPath = await ensurePythonEnv(BACKEND_CONFIG.path, isPackaged, notifyInstallationProgress);
    const result = await startBackend(
        BACKEND_CONFIG,
        pythonPath,
        app.getPath('userData'),
        notifyInstallationProgress,
        processState
    );

    backendProcess = processState.process;
    isBackendStartedByElectron = processState.isStartedByElectron;

    return result;
}

/**
 * Wrapper simplificado para stopBackend del modulo
 */
function stopBackend_wrapper() {
    const processState = {
        process: backendProcess,
        isStartedByElectron: isBackendStartedByElectron
    };

    stopBackend(processState);
    notifyBackendStatus(false);

    backendProcess = processState.process;
    isBackendStartedByElectron = processState.isStartedByElectron;
}

/**
 * Wrapper simplificado para checkAndStartBackend del modulo
 */
async function checkAndStartBackend_wrapper() {
    if (isInitializing) {
        console.log('[CHECK-BACKEND] Inicializacion en progreso, ABORTANDO checkAndStartBackend');
        return false;
    }

    if (isCheckingBackend) {
        console.log('Ya hay un chequeo en progreso...');
        return;
    }

    isCheckingBackend = true;

    try {
        const isRunning = await isBackendRunning_wrapper();

        if (isRunning) {
            console.log('El backend ya esta corriendo');
            notifyBackendStatus(true);

            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('backend-ready');
            }

            return true;
        }

        console.log('El backend no esta corriendo. Intentando iniciar...');
        return await startBackend_wrapper();
    } finally {
        isCheckingBackend = false;
    }
}

// Notificar progreso de instalación
function notifyInstallationProgress(stage, message, progress) {
    console.log(`[INSTALLATION] ${stage}: ${message} (${progress}%)`);
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('installation-progress', {
            stage,
            message,
            progress,
            timestamp: Date.now()
        });
    }
}

// Notificar estado del backend
function notifyBackendStatus(connected) {
    console.log(`[STATUS] Backend: ${connected ? 'connected' : 'disconnected'}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('backend-status', {
            status: connected ? 'connected' : 'disconnected',
            timestamp: Date.now()
        });
    }
}

// Chequeo periodico del estado del backend
let statusCheckInterval = null;

function startStatusMonitoring() {
    // Limpiar cualquier intervalo previo
    if (statusCheckInterval) {
        clearInterval(statusCheckInterval);
    }

    // Chequear cada 30 segundos
    statusCheckInterval = setInterval(async () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            const isRunning = await isBackendRunning_wrapper();
            notifyBackendStatus(isRunning);

            // Si el backend esta caido, intentar reiniciarlo
            if (!isRunning && isBackendStartedByElectron) {
                console.log('[MONITOR] Backend caido, intentando reiniciar...');
                await checkAndStartBackend_wrapper();
            }
        }
    }, 30000);  // 30 segundos
}

function stopStatusMonitoring() {
    if (statusCheckInterval) {
        clearInterval(statusCheckInterval);
        statusCheckInterval = null;
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