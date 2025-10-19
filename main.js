// main.js - Proceso principal de Electron
const { app, BrowserWindow, ipcMain, dialog, screen } = require('electron');
const path = require('path');
const http = require('http');
const https = require('https');
const { execSync, spawn } = require('child_process');
const fs = require('fs');

// Importar modulos de startup
const pythonModule = require('./start/ensurePython');
const ollamaModule = require('./start/ensureOllama');
const { downloadFile } = require('./start/downloadUtils');
const backendModule = require('./start/backend');
const packagesModule = require('./start/installPackages');

const { checkPython, ensurePython, findPythonExecutable } = pythonModule;
const { checkOllama, ensureOllama, ensureOllamaModels, DEFAULT_REQUIRED_MODELS } = ollamaModule;
const {
    isBackendRunning,
    waitForBackend,
    startBackend,
    stopBackend,
    checkAndStartBackend,
    startBackendAndWait
} = backendModule;
const {
    loadProblematicPackages,
    loadGPUPackages,
    detectGPUType,
    installGPUPackages,
    installProblematicPackages,
    installPackagesInBulk,
    retryFailedPackages,
    killPythonProcesses
} = packagesModule;

let mainWindow;
let backendProcess = null;
let isBackendStartedByElectron = false;
let isCheckingBackend = false; // Flag para evitar chequeos simultáneos
let isInitializing = false; // Flag para prevenir inicio del backend durante inicializacion

const BACKEND_PORT = 8000;
const HOST = '127.0.0.1';
const isPackaged = app.isPackaged;

// Determinar la ruta correcta del backend segun el modo
// En desarrollo: __dirname/backend
// En produccion (empaquetado): process.resourcesPath/backend
const PATH_BACKEND = isPackaged
    ? path.join(process.resourcesPath, 'backend')
    : path.join(__dirname, 'backend');

const SCRIPT_BACKEND = 'alfred_backend.py';

// Log de diagnostico de rutas
console.log('========================================================');
console.log('  CONFIGURACION DE RUTAS - ALFRED');
console.log('========================================================');
console.log(`App empaquetada: ${isPackaged}`);
console.log(`__dirname: ${__dirname}`);
console.log(`process.resourcesPath: ${process.resourcesPath}`);
console.log(`PATH_BACKEND: ${PATH_BACKEND}`);
console.log(`Backend existe: ${fs.existsSync(PATH_BACKEND)}`);
if (fs.existsSync(PATH_BACKEND)) {
    const pythonPortablePath = path.join(PATH_BACKEND, 'python-portable', 'python.exe');
    console.log(`Python portable path: ${pythonPortablePath}`);
    console.log(`Python portable existe: ${fs.existsSync(pythonPortablePath)}`);
}
console.log('========================================================\n');

// Funcion para obtener directorio temporal seguro (con permisos de escritura)
function getSafeTempDir() {
    // En produccion (empaquetada), usar AppData del usuario
    // En desarrollo, usar carpeta temp en backend
    if (isPackaged) {
        const userDataPath = app.getPath('userData'); // C:\Users\<user>\AppData\Roaming\alfred-electron
        const tempDir = path.join(userDataPath, 'temp');

        // Crear si no existe
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        return tempDir;
    } else {
        // Modo desarrollo: usar temp en backend
        const tempDir = path.join(PATH_BACKEND, 'temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        return tempDir;
    }
}

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
        titleBarStyle: 'default'
    });

    mainWindow.loadFile('./renderer/index.html');

    // Mostrar cuando esté listo
    mainWindow.once('ready-to-show', async () => {
        mainWindow.show();
        // Marcar que estamos en proceso de inicialización
        isInitializing = true;
        console.log('[INIT] Flag isInitializing = true - Bloqueando inicio automático del backend');

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
} else {
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

// Función principal de inicialización con progreso
async function initializeAppWithProgress() {
    try {
        // 1. Verificar/Instalar Python (primero porque es rapido) solo si es modo desarrollador
        notifyInstallationProgress('python-check', 'Verificando Python...', 10);
        const devMode = !isPackaged;
        if (devMode) {
            const pythonReady = await ensurePython(mainWindow, notifyInstallationProgress);
            if (!pythonReady) {
                await new Promise(resolve => setTimeout(resolve, 3000));
                app.exit(1);
                return false;
            }
        }
        else {
            console.log('[INIT] Modo produccion detectado, se asume que Python ya esta instalado.');
            notifyInstallationProgress('python-ready', 'Python de sistema asumido listo', 20);
        }

        // 2. Verificar/Instalar Ollama (puede tardar - descarga grande)
        notifyInstallationProgress('ollama-check', 'Verificando Ollama...', 20);
        const ollamaReady = await ensureOllama(notifyInstallationProgress);
        if (!ollamaReady) {
            await new Promise(resolve => setTimeout(resolve, 5000));
            notifyInstallationProgress('error', 'Error: Ollama no disponible', 0);
            return false;
        }

        // 2.1 Verificacion adicional: Confirmar que Ollama responde correctamente
        console.log('[INIT] Verificando que Ollama este completamente funcional...');
        notifyInstallationProgress('ollama-verify', 'Verificando Ollama...', 55);

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
            notifyInstallationProgress('error', 'Error: Ollama no responde', 0);
            return false;
        }

        console.log('[INIT] Ollama confirmado y funcional');

        // 3. Verificar/Descargar modelos de Ollama (necesita Ollama funcionando)
        notifyInstallationProgress('models-check', 'Verificando modelos...', 60);
        await ensureOllamaModels(REQUIRED_OLLAMA_MODELS, notifyInstallationProgress);

        // 4. Configurar entorno Python y dependencias
        notifyInstallationProgress('python-env', 'Configurando Python...', 70);
        try {
            await ensurePythonEnv(BACKEND_CONFIG.path);
        }
        catch (error) {
            notifyInstallationProgress('python-env-error', `Error configurando Python, ${error.message}`, 0);
        }

        // 5. Iniciar backend y ESPERAR a que responda (solo despues de que todo este listo)
        notifyInstallationProgress('backend-start', 'Iniciando backend...', 80);

        const backendReady = await startBackendAndWait_wrapper();

        if (!backendReady) {
            return false;
        }

        // 6. Backend confirmado - ocultar loader y mostrar UI
        notifyInstallationProgress('complete', 'Inicializacion completa', 100);

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

// ============================================================================
// FUNCIONES DE PYTHON Y OLLAMA - MOVIDAS A MODULOS
// ============================================================================
// Las siguientes funciones fueron modularizadas:
// - checkPython() -> startUp/ensurePython.js
// - ensurePython() -> startUp/ensurePython.js
// - downloadAndInstallPythonWindows() -> startUp/ensurePython.js
// - findPythonExecutable() -> startUp/ensurePython.js
// - checkOllama() -> startUp/ensureOllama.js
// - ensureOllama() -> startUp/ensureOllama.js
// - downloadAndInstallOllamaWindows() -> startUp/ensureOllama.js
// - ensureOllamaModels() -> startUp/ensureOllama.js
// - downloadFile() -> start/downloadUtils.js
// - Backend functions -> start/backend.js
// - Package installation -> start/installPackages.js
// ============================================================================

// ===============================================================================
// NOTA: Las funciones de instalacion de paquetes han sido movidas a:
// - start/installPackages.js (loadProblematicPackages, installProblematicPackages, 
//   installPackagesInBulk, retryFailedPackages, killPythonProcesses, etc.)
// ===============================================================================

// ===============================================================================
// WRAPPERS para funciones del modulo backend
// Estas funciones adaptan las llamadas a las funciones modulares que tienen
// firmas diferentes (requieren objetos de configuracion y estado)
// ===============================================================================

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
        const pythonPath = await ensurePythonEnv(BACKEND_CONFIG.path);

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

    const pythonPath = await ensurePythonEnv(BACKEND_CONFIG.path);
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

// Asegurar que el entorno virtual de Python esté creado y configurado
async function ensurePythonEnv(backendPath, retryCount = 0) {
    const venvPath = path.join(backendPath, "venv");
    const requirementsPath = path.join(backendPath, "requirements.txt");
    const portablePythonPath = path.join(backendPath, "python-portable", "python.exe");
    const MAX_RETRIES = 2;

    // Detectar modo: Si app esta empaquetada -> PRODUCCION (usa python-portable)
    //                Si NO esta empaquetada -> DESARROLLO (usa Python del sistema)
    const isDevelopment = !isPackaged;
    notifyInstallationProgress('[env-start]', `MODO ${isDevelopment ? 'DESARROLLO' : 'PRODUCCION'} detectado`, 20 + retryCount * 5);
    console.log('========================================================');
    console.log(`  DETECCION DE MODO PYTHON - ${isDevelopment ? 'DESARROLLO (venv)' : 'PRODUCCION (portable)'} `);
    console.log('========================================================');

    try {
        // MODO PRODUCCION: Usar Python portable con paquetes pre-instalados
        if (!isDevelopment) {
            console.log('\n[PRODUCCION] Verificando Python portable...');

            // Si existe python-portable/, usar directamente
            if (fs.existsSync(portablePythonPath)) {
                console.log('========================================================');
                console.log('  Python portable detectado');
                console.log('========================================================');

                notifyInstallationProgress('portable-ready', 'Usando Python portable optimizado...', 45);

                // Verificar que funciona
                try {
                    const version = execSync(`"${portablePythonPath}" --version`, {
                        encoding: 'utf8',
                        stdio: 'pipe'
                    });
                    console.log('Python portable version:', version.trim());
                    notifyInstallationProgress('deps-ready', 'Entorno Python listo (portable)', 48);
                } catch (error) {
                    notifyInstallationProgress('portable-error', 'Error con Python portable, reintentando...', 20 + (retryCount + 1) * 5);
                    throw new Error(`Python portable no funciona: ${error.message}`);
                }

                // Verificar pip en Python portable
                console.log('\n[PRODUCCION] Verificando pip...');
                try {
                    const pipVersion = execSync(`"${portablePythonPath}" -m pip --version`, {
                        encoding: 'utf8',
                        stdio: 'pipe'
                    });
                    console.log('pip version:', pipVersion.trim());
                } catch (pipError) {
                    console.warn('pip no encontrado, instalando...');
                    execSync(`"${portablePythonPath}" -m ensurepip --upgrade`, {
                        encoding: 'utf8',
                        stdio: 'inherit'
                    });
                }

                // Verificar dependencias instaladas en Python portable
                console.log('\n[PRODUCCION] Verificando dependencias...');
                notifyInstallationProgress('deps-check', 'Verificando dependencias de Python...', 35);

                let installedPkgs = '';
                try {
                    installedPkgs = execSync(`"${portablePythonPath}" -m pip freeze`, {
                        encoding: "utf8",
                        stdio: 'pipe'
                    }).toLowerCase();
                }
                catch (err) {
                    notifyInstallationProgress('deps-error', `Error al listar dependencias, error: ${err.message}`, 20 + (retryCount + 1) * 5);
                }

                const reqs = fs.readFileSync(requirementsPath, "utf8")
                    .split("\n")
                    .filter(line => line.trim() && !line.trim().startsWith('#'))
                    .map(line => line.trim());

                // Extraer nombres de paquetes
                const reqPkgNames = reqs.map(r => {
                    const match = r.match(/^([a-zA-Z0-9\-_.]+)/);
                    return match ? match[1].toLowerCase() : null;
                }).filter(Boolean);

                // Verificar paquetes faltantes
                const missing = reqPkgNames.filter(pkg => {
                    const searchName = pkg.toLowerCase()
                        .replace(/-/g, '[-_]')
                        .replace(/\./g, '\\.');
                    const pattern = new RegExp(`^${searchName}==`, 'm');
                    const found = pattern.test(installedPkgs);
                    if (!found) {
                        notifyInstallationProgress('deps-missing-item', `Dependencia faltante: ${pkg}`, 33);
                    }
                    return !found;
                });

                notifyInstallationProgress('deps-missing', `Dependencias faltantes: ${missing.length}`, 34);
                notifyInstallationProgress('deps-install-start', 'Iniciando instalacion de dependencias...', 35);

                if (missing.length > 0) {
                    notifyInstallationProgress('deps-install', `Instalando ${missing.length} dependencias...`, 36);

                    // Separar paquetes estables de problematicos
                    const problematicConfig = loadProblematicPackages(backendPath);
                    const problematicSet = new Set(problematicConfig.problematic_packages.map(p => p.toLowerCase()));

                    const stablePackages = missing.filter(pkg => !problematicSet.has(pkg.toLowerCase()));
                    const problematicPackages = missing.filter(pkg => problematicSet.has(pkg.toLowerCase()));

                    // FASE 1: Instalar paquetes estables en bloque
                    let failedStable = [];
                    if (stablePackages.length > 0) {
                        notifyInstallationProgress('deps-stable', `Instalando ${stablePackages.length} paquetes estables...`, 36);
                        try {
                            const tempDir = getSafeTempDir();
                            failedStable = await installPackagesInBulk(portablePythonPath, backendPath, requirementsPath, stablePackages, tempDir);
                        }
                        catch (bulkError) {
                            notifyInstallationProgress('deps-error', `Error en instalacion en bloque: ${bulkError.message}`, 20 + (retryCount + 1) * 5);
                            throw new Error(`Error en instalacion en bloque: ${bulkError.message}`);
                        }
                    }

                    // FASE 2: Instalar paquetes problematicos uno por uno
                    let failedProblematic = [];
                    if (problematicPackages.length > 0) {
                        notifyInstallationProgress('deps-problematic', `Instalando paquetes problematicos...`, 38);
                        try {
                            const tempDir = getSafeTempDir();
                            failedProblematic = await installProblematicPackages(
                                portablePythonPath,
                                backendPath,
                                problematicPackages,
                                problematicConfig.install_config,
                                tempDir,
                                notifyInstallationProgress
                            );
                        }
                        catch (problematicError) {
                            notifyInstallationProgress('deps-error', `Error en instalacion de paquetes problematicos: ${problematicError.message}`, 40);
                        }
                    }

                    // FASE 3: Instalar PyTorch (GPU/CPU) segun hardware
                    const gpuConfig = loadGPUPackages(backendPath);
                    let failedGPU = [];
                    try {
                        const tempDir = getSafeTempDir();
                        failedGPU = await installGPUPackages(portablePythonPath, backendPath, gpuConfig, tempDir, notifyInstallationProgress);
                    }
                    catch (gpuError) {
                        notifyInstallationProgress('deps-error', `Error en instalacion de paquetes GPU: ${gpuError.message}`, 42);
                    }

                    // FASE 4: Reintentar fallidos
                    const allFailed = [...failedStable, ...failedProblematic, ...failedGPU];
                    try {
                        if (allFailed.length > 0) {
                            notifyInstallationProgress('deps-retry', `Reintentando ${allFailed.length} paquetes...`, 46);
                            const tempDir = getSafeTempDir();
                            await retryFailedPackages(portablePythonPath, backendPath, allFailed, tempDir, notifyInstallationProgress);
                        }
                    }
                    catch (killError) {
                        notifyInstallationProgress('deps-error', `Error al reintentar paquetes fallidos: ${killError.message}`, 48);
                    }
                    notifyInstallationProgress('deps-complete', 'Instalacion de dependencias completada', 48);
                }
                else {
                    console.log(`\n========================================================`);
                    console.log(`  TODAS LAS DEPENDENCIAS YA ESTAN INSTALADAS`);
                    console.log(`========================================================`);
                    notifyInstallationProgress('deps-ready', 'Todas las dependencias ya estaban instaladas', 48);

                    // Verificar PyTorch aunque las demas esten instaladas
                    console.log('Verificando instalacion de PyTorch...');
                    const installedPackages = installedPkgs.split('\n')
                        .map(line => {
                            const match = line.match(/^([a-zA-Z0-9\-_.]+)==/);
                            return match ? match[1].toLowerCase() : null;
                        })
                        .filter(Boolean);

                    const hasTorch = installedPackages.some(pkg => pkg === 'torch');
                    try {
                        if (!hasTorch) {
                            console.log('PyTorch no detectado, instalando...');
                            const gpuConfig = loadGPUPackages(backendPath);
                            const tempDir = getSafeTempDir();
                            await installGPUPackages(portablePythonPath, backendPath, gpuConfig, tempDir, notifyInstallationProgress);
                        }
                    }
                    catch (error) {
                        console.error('Error al verificar/instalar PyTorch:', error.message);
                        notifyInstallationProgress('deps-error', `Error al verificar/instalar PyTorch: ${error.message}`, 50);
                    }
                }
                notifyInstallationProgress('deps-ready', 'Entorno Python listo (portable) todo listo', 49);
                return portablePythonPath;
            }
            else {
                // Fallback: Si no hay Python portable en produccion, error critico
                console.error('\n========================================================');
                console.error('  ERROR: Python portable no encontrado');
                console.error('========================================================');
                console.error(`Ruta esperada: ${portablePythonPath}`);
                console.error(`Backend path: ${backendPath}`);
                console.error(`Backend existe: ${fs.existsSync(backendPath)}`);

                // Listar contenido del backend para diagnostico
                if (fs.existsSync(backendPath)) {
                    console.error('\nContenido del directorio backend:');
                    try {
                        const files = fs.readdirSync(backendPath);
                        files.forEach(file => console.error(`  - ${file}`));
                    } catch (e) {
                        console.error('  (No se pudo listar el contenido)');
                    }
                }
                console.error('========================================================\n');

                throw new Error(`Python portable no encontrado en modo produccion.\nRuta esperada: ${portablePythonPath}\nBackend path: ${backendPath}\nVerifique que el build incluyo la carpeta python-portable.`);
            }
        } else {
            // --- MODO DESARROLLO: Crear venv tradicional ---
            console.log('========================================================');
            console.log('  MODO DESARROLLO: Usando venv tradicional');
            console.log('========================================================');

            // Detectar rutas del binario Python para venv
            const pythonCmd = process.platform === "win32"
                ? path.join(venvPath, "Scripts", "python.exe")
                : path.join(venvPath, "bin", "python");

            // Encontrar Python base instalado DEL SISTEMA (portable no tiene venv)
            const basePython = findPythonExecutable(backendPath, isDevelopment);
            notifyInstallationProgress('venv-check', 'Configurando entorno de desarrollo...', 25);

            // Verificar si el venv existe y está corrupto
            if (fs.existsSync(venvPath)) {
                notifyInstallationProgress('venv-verify', 'Verificando entorno virtual...', 27);

                // Intentar ejecutar python del venv para verificar si funciona
                try {
                    execSync(`"${basePython}" --version`, {
                        encoding: 'utf8',
                        stdio: 'pipe',
                        timeout: 5000
                    });
                    console.log("Entorno virtual existente funciona correctamente");
                } catch (venvError) {
                    console.log("Entorno virtual corrupto detectado. Eliminando...");
                    notifyInstallationProgress('venv-cleanup', 'Reparando entorno virtual...', 28);
                    // Eliminar venv corrupto recursivamente
                    try {
                        if (process.platform === 'win32') {
                            execSync(`rmdir /s /q "${venvPath}"`, {
                                encoding: 'utf8',
                                stdio: 'pipe'
                            });
                        } else {
                            execSync(`rm -rf "${venvPath}"`, {
                                encoding: 'utf8',
                                stdio: 'pipe'
                            });
                        }
                        console.log("Entorno virtual corrupto eliminado");
                    } catch (deleteError) {
                        console.error("Error al eliminar venv corrupto:", deleteError);
                        // Intentar con fs.rmSync si el comando falla
                        try {
                            fs.rmSync(venvPath, { recursive: true, force: true });
                            console.log("Entorno virtual eliminado con fs.rmSync");
                        } catch (fsError) {
                            throw new Error(`No se pudo eliminar el entorno virtual corrupto: ${fsError.message}`);
                        }
                    }
                }
            }

            // Crear el entorno virtual si no existe
            if (!fs.existsSync(venvPath)) {
                console.log("Creando entorno virtual...");
                notifyInstallationProgress('venv-create', 'Creando entorno virtual...', 30);

                // Usar la ruta completa de Python para crear el venv
                const createVenvCmd = `"${basePython}" -m venv venv`;
                console.log('Ejecutando:', createVenvCmd);

                execSync(createVenvCmd, {
                    cwd: backendPath,
                    encoding: 'utf8',
                    stdio: 'pipe'
                });
                console.log("Entorno virtual creado correctamente");
            }

            console.log(`Usando Python en: ${pythonCmd}`);

            // Verificar y actualizar pip
            try {
                const pipVersion = execSync(`"${pythonCmd}" -m pip --version`, {
                    encoding: 'utf8',
                    stdio: 'pipe'
                });
                console.log('pip actual:', pipVersion.trim());
                // Validar si pip es version 23.2.1 o superior
                const versionMatch = pipVersion.match(/pip (\d+)\.(\d+)\.(\d+)/);
                if (versionMatch) {
                    const major = parseInt(versionMatch[1], 10);
                    const minor = parseInt(versionMatch[2], 10);
                    const patch = parseInt(versionMatch[3], 10);
                    if (major < 23 || (major === 23 && minor < 2) || (major === 23 && minor === 2 && patch < 1)) {
                        console.log("pip es muy antiguo, se actualizara");
                        notifyInstallationProgress('pip-upgrade', 'Actualizando gestor de paquetes (pip)...', 32);
                        execSync(`"${pythonCmd}" -m pip install --upgrade pip`, {
                            cwd: backendPath,
                            encoding: 'utf8',
                            stdio: 'pipe',
                            timeout: 80000  // 80 segundos timeout
                        });
                    }
                    else { console.log("pip está actualizado"); }
                }
            } catch (pipError) {
                console.log("Error al verificar/actualizar pip:", pipError.message);
                console.log("Instalando pip...");
                notifyInstallationProgress('pip-install', 'Instalando pip...', 32);
                try {
                    execSync(`"${pythonCmd}" -m ensurepip --upgrade`, {
                        cwd: backendPath,
                        encoding: 'utf8',
                        stdio: 'pipe'
                    });
                } catch (ensurePipError) {
                    console.error("Error al instalar pip:", ensurePipError.message);
                    throw new Error("No se pudo instalar pip");
                }
            }

            // Verificar que el venv funciona correctamente
            try {
                const venvCheck = execSync(`"${pythonCmd}" -m pip --version`, {
                    cwd: backendPath,
                    encoding: 'utf8',
                    stdio: 'pipe'
                });
                console.log("Entorno virtual verificado:", venvCheck.trim());
            } catch (error) {
                console.error("Error al verificar el entorno virtual:", error.message);
                throw new Error("No se pudo verificar el entorno virtual");
            }

            // Verificar dependencias instaladas
            notifyInstallationProgress('deps-check', 'Verificando dependencias de Python...', 35);
            const installedPkgs = execSync(`"${pythonCmd}" -m pip freeze`, {
                encoding: "utf8",
                stdio: 'pipe'
            }).toLowerCase();

            const reqs = fs.readFileSync(requirementsPath, "utf8")
                .split("\n")
                .filter(line => line.trim() && !line.trim().startsWith('#'))
                .map(line => line.trim());

            // Extraer nombres de paquetes (antes de ==, >=, etc.)
            // Importante: incluir puntos en el nombre (ej: pdfminer.six, unstructured.pytesseract)
            const reqPkgNames = reqs.map(r => {
                const match = r.match(/^([a-zA-Z0-9\-_.]+)/);
                return match ? match[1].toLowerCase() : null;
            }).filter(Boolean);

            console.log(`Dependencias requeridas: ${reqPkgNames.length} paquetes`);
            console.log(`Dependencias instaladas: ${installedPkgs.split('\n').filter(l => l.trim()).length} paquetes`);

            // Verificar si hay paquetes faltantes
            const missing = reqPkgNames.filter(pkg => {
                // Normalizar el nombre: guiones pueden ser guiones bajos en pip freeze
                // Los puntos se mantienen como puntos
                const searchName = pkg.toLowerCase()
                    .replace(/-/g, '[-_]')  // Guion puede ser guion o guion bajo
                    .replace(/\./g, '\\.');  // Escapar puntos para regex

                const pattern = new RegExp(`^${searchName}==`, 'm');
                const found = pattern.test(installedPkgs);

                if (!found) {
                    console.log(`[deps-check] Falta: ${pkg}`);
                }

                return !found;
            });

            console.log(`Dependencias faltantes: ${missing.length}`);

            if (missing.length > 0) {
                console.log(`\n========================================================`);
                console.log(`  INSTALANDO ${missing.length} DEPENDENCIAS FALTANTES`);
                console.log(`========================================================`);
                console.log(`Paquetes a instalar: ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? '...' : ''}`);
                notifyInstallationProgress('deps-install', `Instalando ${missing.length} dependencias de Python...`, 36);

                // Cerrar cualquier proceso de Python que pueda estar bloqueando archivos
                await killPythonProcesses(venvPath);

                // Pequeña pausa para asegurar que no hay procesos bloqueantes
                await new Promise(resolve => setTimeout(resolve, 2000));

                //Separar paquetes estables de problemáticos
                const problematicConfig = loadProblematicPackages(backendPath);
                const problematicSet = new Set(problematicConfig.problematic_packages.map(p => p.toLowerCase()));

                //Separar paquetes
                const stablePackages = missing.filter(pkg => !problematicSet.has(pkg.toLowerCase()));
                const problematicPackages = missing.filter(pkg => problematicSet.has(pkg.toLowerCase()));

                // FASE 1: Instalar paquetes estables en bloque (rápido)
                let failedStable = [];
                if (stablePackages.length > 0) {
                    console.log('\n=== FASE 1: Instalando paquetes estables en bloque ===');
                    notifyInstallationProgress('deps-stable', `Instalando ${stablePackages.length} paquetes estables...`, 36);
                    const tempDir = getSafeTempDir();
                    failedStable = await installPackagesInBulk(pythonCmd, backendPath, requirementsPath, stablePackages, tempDir);
                }

                // FASE 2: Instalar paquetes problematicos UNO POR UNO con delays largos
                let failedProblematic = [];
                if (problematicPackages.length > 0) {
                    console.log('\n=== FASE 2: Instalando paquetes problematicos uno por uno ===');
                    notifyInstallationProgress('deps-problematic', `Instalando paquetes problematicos...`, 38);
                    const tempDir = getSafeTempDir();
                    failedProblematic = await installProblematicPackages(
                        pythonCmd,
                        backendPath,
                        problematicPackages,
                        problematicConfig.install_config,
                        tempDir,
                        notifyInstallationProgress
                    );
                }

                // FASE 3: Instalar paquetes GPU/CPU según hardware
                console.log('\n=== FASE 3: Instalando PyTorch (GPU/CPU) ===');
                const gpuConfig = loadGPUPackages(backendPath);
                const tempDir = getSafeTempDir();
                const failedGPU = await installGPUPackages(pythonCmd, backendPath, gpuConfig, tempDir, notifyInstallationProgress);

                // FASE 4: Reintentar todos los fallidos
                const allFailed = [...failedStable, ...failedProblematic, ...failedGPU];
                if (allFailed.length > 0) {
                    console.log(`\n=== FASE 4: Reintentando ${allFailed.length} paquetes fallidos ===`);
                    notifyInstallationProgress('deps-retry', `Reintentando ${allFailed.length} paquetes...`, 46);
                    const tempDir = getSafeTempDir();
                    await retryFailedPackages(pythonCmd, backendPath, allFailed, tempDir, notifyInstallationProgress);
                } else {
                    notifyInstallationProgress('deps-ready', 'Dependencias instaladas', 48);
                }

                // Limpiar directorio temporal DESPUÉS de todos los reintentos
                console.log('Limpiando directorio temporal...');
                await new Promise(resolve => setTimeout(resolve, 3000)); // Esperar que pip libere archivos

                try {
                    const tempDir = getSafeTempDir();
                    if (fs.existsSync(tempDir)) {
                        fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 1000 });
                        console.log('Directorio temporal limpiado');
                    }
                } catch (cleanupErr) {
                    console.log('No se pudo limpiar directorio temporal (no es critico):', cleanupErr.message);
                }

            }
            else {
                console.log(`\n========================================================`);
                console.log(`  TODAS LAS DEPENDENCIAS YA ESTAN INSTALADAS`);
                console.log(`========================================================`);
                // SIEMPRE verificar si PyTorch esta instalado, si no, instalarlo
                console.log('Verificando instalacion de PyTorch...');
                // Convertir installedPkgs (string) a array de nombres de paquetes
                const installedPackages = installedPkgs.split('\n')
                    .map(line => {
                        const match = line.match(/^([a-zA-Z0-9\-_.]+)==/);
                        return match ? match[1].toLowerCase() : null;
                    })
                    .filter(Boolean);
                const hasTorch = installedPackages.some(pkg => pkg === 'torch');
                if (!hasTorch) {
                    console.log('PyTorch no detectado, instalando...');
                    const gpuConfig = loadGPUPackages(backendPath);
                    const tempDir = getSafeTempDir();
                    await installGPUPackages(pythonCmd, backendPath, gpuConfig, tempDir, notifyInstallationProgress);
                }
                notifyInstallationProgress('deps-ready', 'Dependencias verificadas', 48);
            }

            // Verificacion final: Asegurar que dependencias criticas estan instaladas
            console.log('\n=== Verificacion Final ===');
            try {
                // Verificar multiples paquetes criticos (con sus imports reales)
                const checks = [
                    { module: 'dotenv', package: 'python-dotenv' },
                    { module: 'fastapi', package: 'fastapi' },
                    { module: 'langchain', package: 'langchain' },
                    { module: 'chromadb', package: 'chromadb' },
                    { module: 'numpy', package: 'numpy' },
                    { module: 'dateutil', package: 'python-dateutil' }
                ];

                const failedChecks = [];
                for (const check of checks) {
                    try {
                        execSync(`"${pythonCmd}" -c "import ${check.module}"`, {
                            encoding: 'utf8',
                            stdio: 'pipe',
                            cwd: backendPath
                        });
                        console.log(`✓ ${check.package} OK`);
                    } catch (importError) {
                        console.error(`✗ ERROR: ${check.package} no se puede importar como '${check.module}'`);
                        failedChecks.push(check);
                    }
                }

                // Si hay paquetes que fallan, intentar reinstalarlos
                if (failedChecks.length > 0) {
                    console.log(`\n⚠️  Detectadas ${failedChecks.length} instalaciones corruptas. Reparando...`);
                    notifyInstallationProgress('deps-repair', `Reparando ${failedChecks.length} paquetes corruptos...`, 49);

                    for (const check of failedChecks) {
                        console.log(`Reinstalando ${check.package}...`);
                        try {
                            // Desinstalar y reinstalar
                            execSync(`"${pythonCmd}" -m pip uninstall -y ${check.package}`, {
                                encoding: 'utf8',
                                stdio: 'pipe',
                                cwd: backendPath
                            });
                            execSync(`"${pythonCmd}" -m pip install ${check.package}`, {
                                encoding: 'utf8',
                                stdio: 'inherit', // Mostrar progreso
                                cwd: backendPath,
                                timeout: 120000 // 2 minutos
                            });
                            console.log(`✓ ${check.package} reparado exitosamente`);
                        } catch (repairError) {
                            console.error(`✗ Error al reparar ${check.package}:`, repairError.message);
                            throw new Error(`No se pudo reparar ${check.package}`);
                        }
                    }

                    // Verificar nuevamente despues de reparar
                    console.log('\nVerificando reparaciones...');
                    for (const check of failedChecks) {
                        execSync(`"${pythonCmd}" -c "import ${check.module}"`, {
                            encoding: 'utf8',
                            stdio: 'pipe',
                            cwd: backendPath
                        });
                        console.log(`✓ ${check.package} verificado OK`);
                    }
                }
            } catch (verifyError) {
                console.error('ERROR CRITICO: Dependencias no instaladas correctamente');
                throw verifyError;
            }

            console.log(`Entorno Python listo en: ${pythonCmd}`);
            return pythonCmd;
        } // Fin del bloque else (MODO DESARROLLO)
    }
    catch (err) {
        console.error("Error en ensurePythonEnv:", err);

        // Si el error es por archivos bloqueados y no hemos alcanzado el límite de reintentos
        if (err.message === 'VENV_LOCKED' && retryCount < MAX_RETRIES) {
            console.log(`Intento ${retryCount + 1}/${MAX_RETRIES}: Limpiando entorno virtual bloqueado...`);
            notifyInstallationProgress('venv-cleanup', 'Limpiando entorno virtual bloqueado...', 20);

            // Cerrar procesos de Python que puedan estar bloqueando archivos
            await killPythonProcesses(venvPath);

            // Esperar un momento adicional para que los procesos liberen archivos
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Forzar eliminación del venv
            try {
                console.log('Eliminando entorno virtual bloqueado...');
                if (fs.existsSync(venvPath)) {
                    // Intentar eliminar con PowerShell (más robusto en Windows)
                    if (process.platform === 'win32') {
                        try {
                            execSync(`powershell -Command "Remove-Item -Path '${venvPath}' -Recurse -Force -ErrorAction SilentlyContinue"`, {
                                encoding: 'utf8',
                                stdio: 'pipe',
                                timeout: 30000
                            });
                            console.log('Entorno virtual eliminado con PowerShell');
                        } catch (psError) {
                            console.log('PowerShell fallo, intentando con rmdir...');
                            try {
                                execSync(`rmdir /s /q "${venvPath}"`, {
                                    encoding: 'utf8',
                                    stdio: 'pipe',
                                    timeout: 30000
                                });
                            } catch (rmdirError) {
                                // Último recurso: fs.rmSync
                                fs.rmSync(venvPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 1000 });
                            }
                        }
                    } else {
                        execSync(`rm -rf "${venvPath}"`, {
                            encoding: 'utf8',
                            stdio: 'pipe'
                        });
                    }
                    console.log('Entorno virtual eliminado exitosamente');
                }

                // Esperar otro momento antes de reintentar
                await new Promise(resolve => setTimeout(resolve, 1000));

                // Reintentar la instalación
                return await ensurePythonEnv(backendPath, retryCount + 1);

            } catch (cleanupError) {
                console.error('Error al limpiar entorno virtual:', cleanupError);
                throw new Error(`No se pudo limpiar el entorno virtual: ${cleanupError.message}`);
            }
        }

        throw err;
    }
}

// ===============================================================================
// NOTA: Las funciones de gestion del backend han sido movidas a:
// - start/backend.js (isBackendRunning, waitForBackend, startBackend, 
//   stopBackend, checkAndStartBackend, setupBackendLogging, etc.)
// ===============================================================================

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

// IPC handlers para comunicación con el renderer
ipcMain.handle('check-server', async () => {
    try {
        console.log('[MAIN] Verificando servidor Alfred en http://127.0.0.1:8000/health');
        const isRunning = await isBackendRunning_wrapper();
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
        stopBackend_wrapper();
        await new Promise(resolve => setTimeout(resolve, 2000));
        const started = await startBackend_wrapper();
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
        return { success: false, error: error.message };
    }
});

// Handler para obtener keep_alive de Ollama
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

// ============================================================================
// HANDLERS DE CONFIGURACIONES DE USUARIO
// ============================================================================

// Obtener todas las configuraciones
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

// Obtener una configuracion especifica
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

// Guardar configuracion de usuario
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

// Eliminar configuracion de usuario
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

// Obtener foto de perfil
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

// Guardar foto de perfil
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

// Eliminar foto de perfil
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

// Handler para actualizar keep_alive de Ollama
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

// Handler para seleccionar carpeta
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

// Handler para enviar consulta con archivo adjunto temporal
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