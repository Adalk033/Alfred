// main.js - Proceso principal de Electron
const { app, BrowserWindow, ipcMain, dialog, screen } = require('electron');
const path = require('path');
const http = require('http');
const https = require('https');
const { execSync, spawn } = require('child_process');
const fs = require('fs');

let mainWindow;
let backendProcess = null;
let isBackendStartedByElectron = false;
let isCheckingBackend = false; // Flag para evitar chequeos simultáneos
let isDownloadingOllama = false; // Flag para evitar descargas simultáneas
let isInitializing = false; // Flag para prevenir inicio del backend durante inicializacion

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
    retryDelay: 10000, // 10 segundos
    startupTimeout: 1200000  // 20 minutos para instalaciones grandes (modelos de 2GB)
};

// Modelos de Ollama requeridos
const REQUIRED_OLLAMA_MODELS = ['gemma3n:e4b', 'nomic-embed-text:v1.5'];

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
        // El loader se mostrara y esperara a que initializeAppWithProgress termine
        // Marcar que estamos en proceso de inicialización
        isInitializing = true;
        console.log('[INIT] Flag isInitializing = true - Bloqueando inicio automático del backend');

        try {
            await initializeAppWithProgress();
        } catch (error) {
            console.error('Error en inicializacion:', error);
        } finally {
            isInitializing = false;
            console.log('[INIT] Flag isInitializing = false - Inicialización completada');
        }
        // Iniciar monitoreo del estado del backend DESPUES de la inicializacion
    });

    // Manejar recarga de la página (Ctrl+R)
    mainWindow.webContents.on('did-finish-load', () => {
        console.log('Pagina cargada/recargada');

        // CRÍTICO: No iniciar backend durante la inicialización inicial
        if (isInitializing) {
            console.log('[DID-FINISH-LOAD] Inicializacion en progreso, IGNORANDO checkAndStartBackend');
            return;
        }

        // Solo verificar conexión si ya pasó el ready-to-show inicial
        if (mainWindow.isVisible()) {
            console.log('[DID-FINISH-LOAD] Ventana visible y fuera de inicializacion, ejecutando checkAndStartBackend');
            setTimeout(() => { checkAndStartBackend(); }, 500);
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
    stopBackend();

    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Asegurar que el backend se detenga al cerrar la app
app.on('before-quit', () => {
    stopStatusMonitoring();
    stopBackend();
});

// === SISTEMA DE INSTALACIÓN AUTOMÁTICA ===

// Función principal de inicialización con progreso
async function initializeAppWithProgress() {
    try {
        notifyUser('info', 'Iniciando Alfred...');

        // 1. Verificar/Instalar Python (primero porque es rapido)
        notifyUser('info', 'Verificando Python...');
        notifyInstallationProgress('python-check', 'Verificando Python...', 10);
        const pythonReady = await ensurePython();
        if (!pythonReady) {
            notifyUser('error', 'No se pudo instalar Python. La aplicacion se cerrara.');
            // Dar tiempo para que el usuario vea el mensaje
            await new Promise(resolve => setTimeout(resolve, 3000));
            app.exit(1);
            return false;
        }

        // 2. Verificar/Instalar Ollama (puede tardar - descarga grande)
        notifyUser('info', 'Verificando Ollama...');
        notifyInstallationProgress('ollama-check', 'Verificando Ollama...', 20);
        const ollamaReady = await ensureOllama();
        if (!ollamaReady) {
            notifyUser('error', 'No se pudo instalar Ollama. Por favor instala manualmente desde ollama.ai');
            // Dar tiempo para que el usuario vea el mensaje y los logs
            await new Promise(resolve => setTimeout(resolve, 5000));
            // Mantener la app abierta pero mostrar estado de error
            notifyInstallationProgress('error', 'Error: Ollama no disponible', 0);
            return false;
        }

        // 2.1 Verificacion adicional: Confirmar que Ollama responde correctamente
        console.log('[INIT] Verificando que Ollama este completamente funcional...');
        notifyUser('info', 'Confirmando que Ollama esta listo...');
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
            notifyUser('error', 'Ollama instalado pero no responde. Reinicia la aplicacion.');
            notifyInstallationProgress('error', 'Error: Ollama no responde', 0);
            return false;
        }

        console.log('[INIT] Ollama confirmado y funcional');
        notifyUser('success', 'Ollama listo y funcional');

        // 3. Verificar/Descargar modelos de Ollama (necesita Ollama funcionando)
        notifyUser('info', 'Verificando modelos de IA...');
        notifyInstallationProgress('models-check', 'Verificando modelos...', 60);
        await ensureOllamaModels();

        // 4. Configurar entorno Python y dependencias
        notifyUser('info', 'Configurando entorno Python...');
        notifyInstallationProgress('python-env', 'Configurando Python...', 70);
        await ensurePythonEnv(BACKEND_CONFIG.path);

        // 5. Iniciar backend y ESPERAR a que responda (solo despues de que todo este listo)
        notifyUser('info', 'Iniciando servidor de Alfred...');
        notifyInstallationProgress('backend-start', 'Iniciando backend...', 80);

        const backendReady = await startBackendAndWait();

        if (!backendReady) {
            notifyUser('error', 'El backend no responde. Revisa los logs.');
            return false;
        }

        // 6. Backend confirmado - ocultar loader y mostrar UI
        notifyUser('success', 'Alfred esta listo para usar');
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
        notifyUser('error', `Error de inicializacion: ${error.message}`);
        return false;
    }
}

// Verificar si Python está instalado
async function checkPython() {
    try {
        const version = execSync('python --version', {
            encoding: 'utf8',
            stdio: 'pipe'
        }).trim();
        console.log('Python detectado:', version);

        // Verificar version >= 3.10
        const match = version.match(/Python (\d+)\.(\d+)/);
        if (match) {
            const major = parseInt(match[1]);
            const minor = parseInt(match[2]);
            if (major >= 3 && minor >= 10) {
                return true;
            } else {
                console.error('Version de Python muy antigua:', version);
                return false;
            }
        }
        return true;
    } catch (error) {
        console.error('Python no esta instalado o no esta en PATH');
        return false;
    }
}

// Asegurar que Python esté instalado
async function ensurePython() {
    console.log('Verificando instalacion de Python...');
    notifyInstallationProgress('python-check', 'Verificando Python...', 0);

    // Verificar PRIMERO si Python ya está disponible (puede estar instalado aunque no esté en PATH del comando)
    const pythonInstalledMarker = path.join(app.getPath('userData'), '.python_installed');

    // Si existe la marca, intentar encontrar Python instalado
    if (fs.existsSync(pythonInstalledMarker)) {
        console.log('Detectada marca de instalacion previa de Python.');
        notifyUser('info', 'Verificando Python instalado previamente...');
        notifyInstallationProgress('python-verify', 'Verificando Python instalado...', 2);

        // Intentar encontrar Python usando findPythonExecutable (busca en rutas comunes)
        try {
            const pythonPath = findPythonExecutable();
            console.log('Python encontrado despues de instalacion:', pythonPath);

            // Eliminar marca ya que Python está disponible
            try {
                fs.unlinkSync(pythonInstalledMarker);
                console.log('Marca eliminada, Python disponible');
            } catch (err) {
                console.error('Error al eliminar marca:', err);
            }

            // Python encontrado, continuar sin reiniciar
            notifyInstallationProgress('python-ready', 'Python listo', 20);
            return true;
        } catch (findError) {
            // No se pudo encontrar Python, requiere reinicio
            console.log('Python aun no disponible. Requiere reinicio.');
            notifyUser('warning', 'Python fue instalado. Reinicia Alfred para continuar.');

            // Limpiar marca
            try {
                fs.unlinkSync(pythonInstalledMarker);
                console.log('Marca de instalacion eliminada');
            } catch (err) {
                console.error('Error al eliminar marca:', err);
            }

            // Mostrar diálogo de reinicio
            if (mainWindow && !mainWindow.isDestroyed()) {
                const result = await dialog.showMessageBox(mainWindow, {
                    type: 'info',
                    title: 'Reinicio Requerido',
                    message: 'Python fue instalado en la sesion anterior. Alfred necesita reiniciarse.',
                    buttons: ['Reiniciar Ahora', 'Salir'],
                    defaultId: 0,
                    cancelId: 1
                });

                if (result.response === 0) {
                    app.relaunch();
                    app.exit(0);
                } else {
                    app.exit(0);
                }
            }
            return false;
        }
    }

    // No hay marca, verificar si Python ya está instalado y es versión correcta
    if (await checkPython()) {
        console.log('Python ya esta instalado con version correcta');
        return true;
    }

    console.log('Python no esta instalado o version incorrecta');
    notifyUser('warning', 'Python no detectado. Iniciando instalacion...');

    try {
        // Descargar e instalar Python automáticamente
        if (process.platform === 'win32') {
            return await downloadAndInstallPythonWindows();
        } else if (process.platform === 'darwin') {
            notifyUser('error', 'Por favor instala Python 3.10+ manualmente desde python.org');
            return false;
        } else {
            notifyUser('error', 'Por favor instala Python 3.10+ usando el gestor de paquetes de tu sistema');
            return false;
        }
    } catch (installError) {
        console.error('Error al instalar Python:', installError);
        notifyUser('error', 'Error al instalar Python automaticamente. Visita python.org para instalacion manual');
        return false;
    }
}

// Descargar e instalar Python en Windows
async function downloadAndInstallPythonWindows() {
    const pythonVersion = '3.12.0';  // Python 3.12.0 LTS
    const installerName = 'python-3.12.0-amd64.exe';
    const installerPath = path.join(app.getPath('temp'), installerName);
    const downloadUrl = `https://www.python.org/ftp/python/${pythonVersion}/${installerName}`;

    console.log('Descargando Python desde:', downloadUrl);
    notifyUser('info', 'Descargando Python 3.12... esto puede tomar varios minutos');
    notifyInstallationProgress('python-download', 'Descargando Python 3.12...', 5);

    try {
        // Descargar el instalador
        await downloadFile(downloadUrl, installerPath);

        notifyUser('info', 'Instalando Python... esto puede tomar unos minutos');
        notifyInstallationProgress('python-install', 'Instalando Python 3.12...', 15);
        console.log('Ejecutando instalador de Python...');

        // Instalar Python de forma silenciosa con opciones importantes
        // /quiet = instalacion silenciosa
        // InstallAllUsers=0 = instalar para usuario actual
        // PrependPath=1 = agregar Python a PATH
        // Include_test=0 = no incluir tests
        // Include_pip=1 = incluir pip
        await new Promise((resolve, reject) => {
            const installer = spawn(installerPath, [
                '/quiet',
                'InstallAllUsers=0',
                'PrependPath=1',
                'Include_test=0',
                'Include_pip=1',
                'Include_doc=0',
                'Include_dev=0',
                'Include_launcher=1',
                'InstallLauncherAllUsers=0'
            ], {
                stdio: 'pipe',
                windowsHide: true  // Ocultar ventana del instalador
            });

            installer.stdout.on('data', (data) => {
                console.log(`[Python Installer] ${data.toString().trim()}`);
            });

            installer.stderr.on('data', (data) => {
                console.error(`[Python Installer Error] ${data.toString().trim()}`);
            });

            installer.on('close', (code) => {
                if (code === 0) {
                    console.log('Instalador de Python completado exitosamente');
                    resolve();
                } else {
                    reject(new Error(`Instalador de Python termino con codigo ${code}`));
                }
            });

            installer.on('error', (err) => {
                reject(err);
            });
        });

        // Esperar 2 segundos adicionales para que el instalador termine completamente
        console.log('Esperando a que el instalador finalice completamente...');
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Limpiar el instalador
        try {
            fs.unlinkSync(installerPath);
            console.log('Instalador de Python eliminado');
        } catch { }

        // Python se instaló correctamente
        console.log('Python instalado correctamente.');
        notifyUser('success', 'Python 3.12 instalado correctamente');

        // Esperar 3 segundos para que el sistema actualice PATH
        console.log('Esperando finalizacion de procesos...');
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Intentar encontrar Python inmediatamente
        try {
            const pythonPath = findPythonExecutable();
            console.log('Python disponible inmediatamente en:', pythonPath);
            notifyUser('success', 'Python listo para usar');
            return true; // Python encontrado, continuar sin reiniciar
        } catch (findError) {
            // Python no está disponible aún, necesita reinicio
            console.log('Python requiere reinicio para actualizar PATH.');

            // Crear archivo de marca para indicar que Python se instaló
            const pythonInstalledMarker = path.join(app.getPath('userData'), '.python_installed');
            try {
                fs.writeFileSync(pythonInstalledMarker, new Date().toISOString());
                console.log('Marca de instalacion de Python creada');
            } catch (err) {
                console.error('Error al crear marca de instalacion:', err);
            }

            // Solicitar reinicio de la aplicación
            notifyUser('warning', 'Reinicio requerido para actualizar PATH de Python');

            if (mainWindow && !mainWindow.isDestroyed()) {
                const { dialog } = require('electron');
                const result = await dialog.showMessageBox(mainWindow, {
                    type: 'info',
                    title: 'Reinicio Requerido',
                    message: 'Python se instalo correctamente. Alfred necesita reiniciarse para que Python este disponible.',
                    detail: 'Al reiniciar, Alfred continuara con la instalacion de los componentes restantes.',
                    buttons: ['Reiniciar Ahora', 'Salir'],
                    defaultId: 0,
                    cancelId: 1
                });

                if (result.response === 0) {
                    console.log('Reiniciando aplicacion...');
                    app.relaunch();
                    app.exit(0);
                } else {
                    console.log('Usuario cancelo reinicio. Cerrando aplicacion...');
                    app.exit(0);
                }
            } else {
                // Si no hay ventana, simplemente salir para que el usuario reinicie manualmente
                console.log('No hay ventana principal. Cerrando aplicacion para reinicio...');
                app.exit(0);
            }

            return false;
        }

    } catch (error) {
        console.error('Error al descargar/instalar Python:', error);
        notifyUser('error', 'Error al instalar Python automaticamente');
        return false;
    }
}

// Verificar si Ollama está instalado y corriendo
async function checkOllama() {
    try {
        // Intentar conectar al endpoint de Ollama
        const result = await new Promise((resolve) => {
            const req = http.request({
                hostname: '127.0.0.1',
                port: 11434,
                path: '/api/tags',
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

        return result;
    } catch {
        return false;
    }
}

// Asegurar que Ollama esté instalado y corriendo
async function ensureOllama() {
    console.log('[OLLAMA-CHECK] === INICIANDO VERIFICACION DE OLLAMA ===');
    console.log('[OLLAMA-CHECK] Flag isDownloadingOllama:', isDownloadingOllama);
    notifyInstallationProgress('ollama-check', 'Verificando Ollama...', 40);

    // Verificar si Ollama está corriendo
    console.log('[OLLAMA-CHECK] Paso 1: Verificando si Ollama ya esta corriendo...');
    if (await checkOllama()) {
        console.log('[OLLAMA-CHECK] ✓ Ollama ya esta corriendo y respondiendo en puerto 11434');
        notifyInstallationProgress('ollama-ready', 'Ollama listo', 50);
        return true;
    }
    console.log('[OLLAMA-CHECK] ✗ Ollama no responde en puerto 11434');

    console.log('[OLLAMA-CHECK] ✗ Ollama no responde en puerto 11434');

    // Verificar si Ollama está instalado pero no corriendo
    console.log('[OLLAMA-CHECK] Paso 2: Verificando si Ollama esta instalado...');
    try {
        execSync('ollama --version', { stdio: 'pipe' });
        console.log('[OLLAMA-CHECK] ✓ Ollama instalado, intentando iniciar...');
        notifyInstallationProgress('ollama-start', 'Iniciando Ollama...', 45);

        // Intentar iniciar Ollama
        try {
            if (process.platform === 'win32') {
                // En Windows, iniciar Ollama en background
                spawn('ollama', ['serve'], {
                    detached: true,
                    stdio: 'ignore'
                }).unref();
            } else {
                execSync('ollama serve &', { stdio: 'ignore' });
            }

            // Esperar a que Ollama esté disponible
            await new Promise(resolve => setTimeout(resolve, 3000));

            if (await checkOllama()) {
                console.log('[OLLAMA-CHECK] ✓ Ollama iniciado correctamente');
                notifyInstallationProgress('ollama-ready', 'Ollama iniciado', 50);
                return true;
            }
        } catch (startError) {
            console.error('[OLLAMA-CHECK] ✗ Error al iniciar Ollama:', startError);
        }
    } catch {
        // Ollama no está instalado
        console.log('[OLLAMA-CHECK] ✗ Ollama NO esta instalado');
        console.log('[OLLAMA-CHECK] Paso 3: Descargando e instalando Ollama...');
        notifyUser('warning', 'Descargando Ollama... esto puede tomar varios minutos');
        notifyInstallationProgress('ollama-download', 'Descargando Ollama...', 42);

        try {
            // Descargar e instalar Ollama automáticamente
            if (process.platform === 'win32') {
                console.log('[OLLAMA-CHECK] Llamando a downloadAndInstallOllamaWindows()...');
                const result = await downloadAndInstallOllamaWindows();
                console.log('[OLLAMA-CHECK] downloadAndInstallOllamaWindows() retorno:', result);
                return result;
            } else {
                notifyUser('error', 'Por favor instala Ollama manualmente desde https://ollama.ai');
                return false;
            }
        } catch (installError) {
            console.error('[OLLAMA-CHECK] ✗ Error al instalar Ollama:', installError);
            notifyUser('error', 'Error al instalar Ollama. Por favor instala manualmente desde https://ollama.ai');
            return false;
        }
    }

    console.log('[OLLAMA-CHECK] ✗ Ollama no pudo iniciarse ni instalarse');
    return false;
}

// Descargar e instalar Ollama en Windows
async function downloadAndInstallOllamaWindows() {
    // Prevenir descargas múltiples simultáneas
    if (isDownloadingOllama) {
        console.log('[OLLAMA] Ya hay una descarga en progreso, esperando...');
        notifyUser('warning', 'Ya hay una descarga de Ollama en progreso');
        return false;
    }

    isDownloadingOllama = true;

    const installerPath = path.join(app.getPath('temp'), 'OllamaSetup.exe');
    const downloadUrl = 'https://ollama.ai/download/OllamaSetup.exe';

    console.log('[OLLAMA] Iniciando descarga desde:', downloadUrl);
    notifyUser('info', 'Descargando Ollama... esto puede tardar varios minutos');
    notifyInstallationProgress('ollama-download', 'Descargando Ollama...', 42);

    try {
        // Descargar el instalador
        await downloadFile(downloadUrl, installerPath);

        console.log('[OLLAMA] Descarga completada, iniciando instalacion...');
        notifyUser('info', 'Instalando Ollama... sigue las instrucciones del instalador');
        notifyInstallationProgress('ollama-install', 'Instalando Ollama...', 50);

        // Ejecutar el instalador
        await new Promise((resolve, reject) => {
            const installer = spawn(installerPath, ['/SILENT'], {
                stdio: 'pipe'
            });

            installer.on('close', (code) => {
                console.log(`[OLLAMA] Instalador termino con codigo: ${code}`);
                if (code === 0 || code === null) {
                    resolve();
                } else {
                    reject(new Error(`Instalador termino con codigo ${code}`));
                }
            });

            installer.on('error', (err) => {
                console.error('[OLLAMA] Error al ejecutar instalador:', err);
                reject(err);
            });
        });

        // Limpiar el instalador
        try {
            if (fs.existsSync(installerPath)) {
                fs.unlinkSync(installerPath);
                console.log('[OLLAMA] Instalador eliminado');
            }
        } catch (cleanError) {
            console.warn('[OLLAMA] No se pudo limpiar instalador:', cleanError.message);
        }

        // Esperar a que Ollama este disponible
        console.log('[OLLAMA] Esperando a que Ollama inicie (max 60 segundos)...');
        notifyUser('info', 'Esperando a que Ollama inicie...');
        notifyInstallationProgress('ollama-wait', 'Esperando Ollama...', 55);

        await new Promise(resolve => setTimeout(resolve, 5000));

        // Verificar que Ollama este corriendo con reintentos
        for (let i = 0; i < 12; i++) {
            console.log(`[OLLAMA] Intento ${i + 1}/12 de verificacion...`);

            if (await checkOllama()) {
                console.log('[OLLAMA] Ollama instalado e iniciado correctamente');
                notifyUser('success', 'Ollama instalado correctamente');
                notifyInstallationProgress('ollama-ready', 'Ollama listo', 60);
                return true;
            }

            // Esperar 5 segundos entre intentos
            await new Promise(resolve => setTimeout(resolve, 5000));
        }

        console.warn('[OLLAMA] Ollama instalado pero no responde despues de 60 segundos');
        notifyUser('warning', 'Ollama instalado pero no responde. Intentando iniciar manualmente...');

        // Intentar iniciar Ollama manualmente
        try {
            spawn('ollama', ['serve'], {
                detached: true,
                stdio: 'ignore'
            }).unref();

            console.log('[OLLAMA] Comando de inicio enviado, esperando 10 segundos...');
            await new Promise(resolve => setTimeout(resolve, 10000));

            if (await checkOllama()) {
                console.log('[OLLAMA] Ollama iniciado manualmente con exito');
                notifyUser('success', 'Ollama iniciado correctamente');
                return true;
            }
        } catch (startError) {
            console.error('[OLLAMA] Error al iniciar manualmente:', startError);
        }

        notifyUser('warning', 'Ollama instalado pero no responde. Por favor reinicia la aplicacion');
        return false;

    } catch (error) {
        console.error('[OLLAMA] Error critico durante instalacion:', error);
        notifyUser('error', `Error al instalar Ollama: ${error.message}`);
        return false;
    } finally {
        // Siempre liberar el flag de descarga
        isDownloadingOllama = false;
        console.log('[OLLAMA] Flag de descarga liberado');
    }
}

// Descargar archivo con progreso
function downloadFile(url, destPath, maxRedirects = 5) {
    return new Promise((resolve, reject) => {
        if (maxRedirects <= 0) {
            reject(new Error('Demasiadas redirecciones'));
            return;
        }

        const file = fs.createWriteStream(destPath);
        let redirectCount = 5 - maxRedirects;

        console.log(`[DOWNLOAD] Intentando descargar desde: ${url} (redireccion ${redirectCount})`);

        https.get(url, (response) => {
            // Manejar todas las redirecciones HTTP (301, 302, 303, 307, 308)
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                // Seguir redireccion
                console.log(`[DOWNLOAD] Redireccion ${response.statusCode} -> ${response.headers.location}`);
                file.close();
                try {
                    if (fs.existsSync(destPath)) {
                        fs.unlinkSync(destPath);
                    }
                } catch (e) {
                    console.warn('[DOWNLOAD] Error al limpiar archivo temporal:', e.message);
                }
                downloadFile(response.headers.location, destPath, maxRedirects - 1)
                    .then(resolve)
                    .catch(reject);
                return;
            }

            if (response.statusCode !== 200) {
                file.close();
                reject(new Error(`Error HTTP ${response.statusCode} al descargar desde ${url}`));
                return;
            }

            const totalSize = parseInt(response.headers['content-length'], 10);
            let downloaded = 0;
            let lastPercent = 0;

            console.log(`[DOWNLOAD] Iniciando descarga: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);

            response.on('data', (chunk) => {
                downloaded += chunk.length;
                const percent = Math.floor((downloaded / totalSize) * 100);

                // Solo mostrar cada 10%
                if (percent >= lastPercent + 10) {
                    lastPercent = percent;
                    console.log(`[DOWNLOAD] Progreso: ${percent}% (${(downloaded / 1024 / 1024).toFixed(2)} MB)`);
                    notifyInstallationProgress('ollama-download', `Descargando Ollama... ${percent}%`, 42 + (percent * 0.08));
                }
            });

            response.pipe(file);

            file.on('finish', () => {
                file.close();
                console.log('[DOWNLOAD] Descarga completada exitosamente');
                resolve();
            });

            file.on('error', (err) => {
                file.close();
                try {
                    if (fs.existsSync(destPath)) {
                        fs.unlinkSync(destPath);
                    }
                } catch (e) {
                    console.warn('[DOWNLOAD] Error al limpiar archivo con error:', e.message);
                }
                reject(err);
            });

        }).on('error', (err) => {
            file.close();
            try {
                if (fs.existsSync(destPath)) {
                    fs.unlinkSync(destPath);
                }
            } catch (e) {
                console.warn('[DOWNLOAD] Error al limpiar archivo tras fallo de conexion:', e.message);
            }
            reject(err);
        });
    });
}

// Verificar y descargar modelos de Ollama
async function ensureOllamaModels() {
    console.log('Verificando modelos de Ollama...');
    notifyInstallationProgress('models-check', 'Verificando modelos de IA...', 55);

    try {
        // Obtener lista de modelos instalados
        const modelsOutput = execSync('ollama list', {
            encoding: 'utf8',
            stdio: 'pipe'
        });

        const installedModels = modelsOutput.toLowerCase();
        let modelIndex = 0;
        const totalModels = REQUIRED_OLLAMA_MODELS.length;

        // Verificar cada modelo requerido
        for (const model of REQUIRED_OLLAMA_MODELS) {
            const modelName = model.toLowerCase();
            modelIndex++;
            const baseProgress = 55 + (modelIndex - 1) * (30 / totalModels);

            if (!installedModels.includes(modelName.split(':')[0])) {
                console.log(`Descargando modelo ${model}...`);
                notifyUser('info', `Descargando modelo ${model}... (puede ser grande, hasta 2GB)`);
                notifyInstallationProgress('models-download', `Descargando ${model}... (${modelIndex}/${totalModels})`, baseProgress);

                try {
                    // Descargar modelo de forma asíncrona para no congelar la UI
                    await new Promise((resolve, reject) => {
                        const pullProcess = spawn('ollama', ['pull', model], {
                            stdio: ['ignore', 'pipe', 'pipe'],
                            env: {
                                ...process.env,
                                NO_COLOR: '1',  // Deshabilitar colores
                                TERM: 'dumb'    // Terminal simple sin ANSI
                            }
                        });

                        let lastProgress = '';
                        let lastNotification = 0;

                        pullProcess.stdout.on('data', (data) => {
                            const output = data.toString().trim();

                            // Detectar progreso de descarga (ej: "pulling 4f1b43ef9323... 45%")
                            const progressMatch = output.match(/(\d+)%/);
                            if (progressMatch) {
                                const progress = parseInt(progressMatch[1]);
                                const now = Date.now();

                                // Calcular progreso total considerando todos los modelos
                                const modelProgress = baseProgress + (progress / 100) * (30 / totalModels);

                                // Notificar cada 10% o cada 5 segundos
                                if (progress % 10 === 0 || now - lastNotification > 5000) {
                                    console.log(`[Ollama] Descargando ${model}: ${progress}%`);
                                    notifyUser('info', `Descargando ${model}: ${progress}%`);
                                    notifyInstallationProgress('models-download', `Descargando ${model}: ${progress}% (${modelIndex}/${totalModels})`, modelProgress);
                                    lastNotification = now;
                                }
                            } else if (output.includes('pulling')) {
                                const layerMatch = output.match(/pulling ([a-f0-9]+)/);
                                if (layerMatch && output !== lastProgress) {
                                    console.log(`[Ollama] Descargando capa: ${layerMatch[1].substring(0, 12)}...`);
                                    notifyUser('info', `Descargando componente del modelo...`);
                                    notifyInstallationProgress('models-download', `Descargando componentes de ${model}...`, baseProgress + 5);
                                    lastProgress = output;
                                }
                            } else if (output.includes('verifying')) {
                                console.log(`[Ollama] Verificando integridad...`);
                                notifyUser('info', `Verificando ${model}...`);
                                notifyInstallationProgress('models-verify', `Verificando ${model}...`, baseProgress + 25);
                            } else if (output.includes('success')) {
                                console.log(`[Ollama] Modelo descargado exitosamente`);
                            }

                            // Solo mostrar lineas significativas en consola
                            if (output && output !== lastProgress && !output.includes('pulling')) {
                                console.log(`[Ollama] ${output}`);
                            }
                        });

                        pullProcess.stderr.on('data', (data) => {
                            const error = data.toString().trim();
                            if (error) console.error(`[Ollama Error] ${error}`);
                        });

                        pullProcess.on('close', (code) => {
                            if (code === 0) {
                                console.log(`Modelo ${model} descargado correctamente`);
                                resolve();
                            } else {
                                reject(new Error(`ollama pull termino con codigo ${code}`));
                            }
                        });

                        pullProcess.on('error', (err) => {
                            reject(err);
                        });
                    });

                    notifyUser('success', `Modelo ${model} listo`);
                    notifyInstallationProgress('models-ready', `Modelo ${model} listo (${modelIndex}/${totalModels})`, baseProgress + 30 / totalModels);

                } catch (pullError) {
                    console.error(`Error al descargar ${model}:`, pullError);
                    notifyUser('error', `Error al descargar modelo ${model}`);
                    throw pullError;
                }
            } else {
                console.log(`Modelo ${model} ya instalado`);
            }
        }

        console.log('Todos los modelos estan listos');
        return true;

    } catch (error) {
        console.error('Error al verificar modelos:', error);
        notifyUser('error', 'Error al configurar modelos de IA');
        throw error;
    }
}

// Encontrar la ruta completa de Python instalado
function findPythonExecutable() {
    // Rutas comunes donde Python se instala en Windows
    const commonPaths = [
        path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python313', 'python.exe'),
        path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python312', 'python.exe'),
        path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python311', 'python.exe'),
        path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python310', 'python.exe'),
        'C:\\Python313\\python.exe',
        'C:\\Python312\\python.exe',
        'C:\\Python311\\python.exe',
        'C:\\Python310\\python.exe'
    ];

    // Primero intentar con el comando directo (si PATH está actualizado)
    try {
        execSync('python --version', { stdio: 'pipe' });
        console.log('Python encontrado en PATH');
        return 'python';
    } catch { }

    // Buscar en rutas comunes
    for (const pythonPath of commonPaths) {
        if (fs.existsSync(pythonPath)) {
            console.log('Python encontrado en:', pythonPath);
            return pythonPath;
        }
    }

    // Si no se encuentra, intentar buscar en %LOCALAPPDATA%\Programs\Python\
    try {
        const pythonBaseDir = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python');
        if (fs.existsSync(pythonBaseDir)) {
            const pythonDirs = fs.readdirSync(pythonBaseDir);
            for (const dir of pythonDirs) {
                if (dir.startsWith('Python3')) {
                    const pythonExe = path.join(pythonBaseDir, dir, 'python.exe');
                    if (fs.existsSync(pythonExe)) {
                        console.log('Python encontrado en:', pythonExe);
                        return pythonExe;
                    }
                }
            }
        }
    } catch { }

    throw new Error('No se pudo encontrar Python instalado');
}

// Cargar configuración de paquetes problemáticos
function loadProblematicPackages(backendPath) {
    try {
        const configPath = path.join(backendPath, 'problematic-packages.json');
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            console.log(`✓ Configuracion de paquetes problematicos cargada: ${config.problematic_packages.length} paquetes`);
            return config;
        }
    } catch (error) {
        console.log('No se pudo cargar problematic-packages.json, usando defaults:', error.message);
    }

    // Fallback si no existe el archivo
    return {
        problematic_packages: [
            'greenlet', 'grpcio', 'numpy', 'scipy', 'pandas', 'pillow',
            'matplotlib', 'lxml', 'cryptography', 'cffi', 'sympy',
            'nltk'
        ],
        install_config: {
            delay_between_packages_ms: 2000,
            retries_per_package: 5,
            timeout_per_package_seconds: 300
        }
    };
}

// Cargar configuración de paquetes GPU
function loadGPUPackages(backendPath) {
    try {
        const configPath = path.join(backendPath, 'gpu-packages.json');
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            console.log('✓ Configuracion de paquetes GPU cargada');
            return config;
        }
    } catch (error) {
        console.log('No se pudo cargar gpu-packages.json, usando defaults:', error.message);
    }

    // Fallback
    return {
        gpu_packages: {
            nvidia_cuda: {
                packages: ['torch==2.5.1', 'torchvision==0.20.1', 'torchaudio==2.5.1'],
                index_url: 'https://download.pytorch.org/whl/cu121'
            }
        },
        cpu_fallback: {
            packages: ['torch==2.5.1', 'torchvision==0.20.1', 'torchaudio==2.5.1'],
            index_url: 'https://download.pytorch.org/whl/cpu'
        },
        install_config: {
            gpu: { timeout_per_package_seconds: 600, retries_per_package: 3 },
            cpu: { timeout_per_package_seconds: 300, retries_per_package: 3 }
        }
    };
}

// Detectar tipo de GPU disponible
async function detectGPUType() {
    console.log('Detectando hardware GPU...');

    // Verificar NVIDIA
    try {
        if (process.platform === 'win32') {
            execSync('nvidia-smi', { stdio: 'pipe' });
            console.log('✓ GPU NVIDIA detectada');
            return 'nvidia_cuda';
        }
    } catch {
        // No hay NVIDIA GPU
    }

    // Verificar Apple Silicon
    try {
        if (process.platform === 'darwin') {
            const arch = execSync('uname -m', { encoding: 'utf8' }).trim();
            if (arch === 'arm64') {
                console.log('✓ Apple Silicon detectado (M1/M2/M3)');
                return 'apple_mps';
            }
        }
    } catch {
        // No es Apple Silicon
    }

    // TODO: AMD ROCm detection

    console.log('⚠️  No se detecto GPU compatible, usando CPU');
    return 'cpu';
}

// Instalar paquetes de GPU/CPU según hardware
async function installGPUPackages(pythonCmd, backendPath, gpuConfig) {
    const gpuType = await detectGPUType();
    const tempDir = path.join(backendPath, 'temp');

    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }

    let packagesToInstall = [];
    let indexUrl = null;
    let config = gpuConfig.install_config.cpu;
    let label = 'CPU';

    if (gpuType === 'nvidia_cuda' && gpuConfig.gpu_packages.nvidia_cuda) {
        packagesToInstall = gpuConfig.gpu_packages.nvidia_cuda.packages;
        indexUrl = gpuConfig.gpu_packages.nvidia_cuda.index_url;
        config = gpuConfig.install_config.gpu;
        label = 'GPU NVIDIA (CUDA)';
    } else if (gpuType === 'apple_mps' && gpuConfig.gpu_packages.apple_mps) {
        packagesToInstall = gpuConfig.gpu_packages.apple_mps.packages;
        config = gpuConfig.install_config.gpu;
        label = 'Apple Silicon (MPS)';
    } else {
        packagesToInstall = gpuConfig.cpu_fallback.packages;
        indexUrl = gpuConfig.cpu_fallback.index_url;
    }

    if (packagesToInstall.length === 0) {
        console.log('No hay paquetes GPU/CPU para instalar');
        return [];
    }

    console.log(`\n=== Instalando PyTorch para ${label} ===`);
    console.log(`Paquetes: ${packagesToInstall.join(', ')}`);
    if (indexUrl) {
        console.log(`Index URL: ${indexUrl}`);
    }
    notifyUser('info', `Instalando PyTorch para ${label}... (esto puede tardar varios minutos)`);
    notifyInstallationProgress('gpu-install', `Instalando PyTorch (${label})...`, 43);

    let installed = 0;
    let failed = [];
    const total = packagesToInstall.length;

    for (const pkg of packagesToInstall) {
        installed++;
        const progress = 43 + Math.min(2, (installed / total) * 2);
        console.log(`[pip gpu] ${installed}/${total}: Instalando ${pkg}...`);
        notifyInstallationProgress('gpu-install', `Instalando ${pkg}... (${installed}/${total})`, progress);

        try {
            const success = await new Promise((resolve) => {
                const args = [
                    "-m", "pip", "install",
                    "--prefer-binary",
                    "--no-cache-dir",
                    "--no-color",
                    "--progress-bar", "off",
                    "--disable-pip-version-check",
                    "--retries", String(config.retries_per_package),
                    "--timeout", String(config.timeout_per_package_seconds)
                ];

                // Agregar index-url si existe
                if (indexUrl) {
                    args.push("--index-url", indexUrl);
                }

                args.push(pkg);

                const proc = spawn(pythonCmd, args, {
                    cwd: backendPath,
                    stdio: "pipe",
                    env: {
                        ...process.env,
                        PYTHONIOENCODING: 'utf-8',
                        PYTHONUNBUFFERED: '1',
                        TEMP: tempDir,
                        TMP: tempDir
                    }
                });

                let output = '';
                let errorOut = '';

                proc.stdout.on('data', (data) => {
                    output += data.toString();
                    const lines = output.split('\n');
                    for (const line of lines) {
                        if (line.includes('Downloading') && line.includes('MB')) {
                            console.log(`  ${line.trim()}`);
                        }
                    }
                });

                proc.stderr.on('data', (data) => {
                    const err = data.toString();
                    errorOut += err;
                    if (!err.includes('WARNING') && !err.includes('DEPRECATION')) {
                        console.error(`  [stderr] ${err.trim()}`);
                    }
                });

                proc.on('close', (code) => {
                    if (code === 0) {
                        console.log(`  ✓ ${pkg} instalado correctamente`);
                        resolve(true);
                    } else {
                        console.error(`  ✗ ${pkg} fallo: ${errorOut.substring(0, 150)}`);
                        resolve(false);
                    }
                });

                proc.on('error', (err) => {
                    console.error(`  ✗ Error de proceso: ${err.message}`);
                    resolve(false);
                });
            });

            if (!success) {
                failed.push(pkg.split('==')[0]); // Solo el nombre sin versión
            }

            // Delay entre paquetes grandes
            await new Promise(resolve => setTimeout(resolve, 1500));

        } catch (error) {
            console.error(`  ✗ Error al instalar ${pkg}:`, error.message);
            failed.push(pkg.split('==')[0]);
        }
    }

    if (failed.length > 0) {
        console.log(`\n⚠️  Paquetes GPU/CPU que fallaron (${failed.length}): ${failed.join(', ')}`);
        notifyUser('warning', `${total - failed.length}/${total} paquetes GPU instalados`);
    } else {
        console.log(`✓ PyTorch instalado correctamente para ${label}`);
        notifyUser('success', `PyTorch instalado para ${label}`);
    }

    notifyInstallationProgress('gpu-ready', 'PyTorch instalado', 45);
    return failed;
}

// Cargar configuración de paquetes problemáticos
function loadProblematicPackages(backendPath) {
    try {
        const configPath = path.join(backendPath, 'problematic-packages.json');
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            console.log(`✓ Configuracion de paquetes problematicos cargada: ${config.problematic_packages.length} paquetes`);
            return config;
        }
    } catch (error) {
        console.log('No se pudo cargar problematic-packages.json, usando defaults:', error.message);
    }

    // Fallback si no existe el archivo
    return {
        problematic_packages: [
            'greenlet', 'grpcio', 'numpy', 'scipy', 'pandas', 'pillow',
            'matplotlib', 'lxml', 'cryptography', 'cffi', 'sympy',
            'torch', 'torchvision', 'torchaudio', 'nltk'
        ],
        install_config: {
            delay_between_packages_ms: 2000,
            retries_per_package: 5,
            timeout_per_package_seconds: 300
        }
    };
}

// Instalar paquetes problemáticos con estrategia especial
async function installProblematicPackages(pythonCmd, backendPath, problematicPackages, installConfig) {
    const tempDir = path.join(backendPath, 'temp');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }

    // Leer requirements.txt para obtener las especificaciones completas de versión
    const requirementsPath = path.join(backendPath, 'requirements.txt');
    const requirementsContent = fs.readFileSync(requirementsPath, 'utf8');
    const allPackages = requirementsContent
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'));

    // Mapear nombres de paquetes a sus especificaciones completas
    const packageMap = {};
    allPackages.forEach(spec => {
        const nameMatch = spec.match(/^([a-zA-Z0-9_-]+)/);
        if (nameMatch) {
            packageMap[nameMatch[1].toLowerCase()] = spec;
        }
    });

    let installed = 0;
    let failed = [];
    const total = problematicPackages.length;
    const delay = installConfig.delay_between_packages_ms || 2000;

    console.log(`⚠️  Instalando ${total} paquetes problematicos con delays de ${delay}ms...`);

    for (const pkgName of problematicPackages) {
        installed++;
        const progress = 38 + Math.min(4, (installed / total) * 4);

        // Buscar la especificación completa del paquete
        const pkgSpec = packageMap[pkgName.toLowerCase()] || pkgName;

        console.log(`[pip problematic] ${installed}/${total}: Instalando ${pkgSpec}...`);
        notifyInstallationProgress(
            'deps-problematic',
            `Instalando ${pkgName}... (${installed}/${total})`,
            progress
        );

        try {
            const success = await new Promise((resolve) => {
                const proc = spawn(pythonCmd, [
                    "-m", "pip", "install",
                    "--prefer-binary",
                    "--no-cache-dir",
                    "--no-color",
                    "--progress-bar", "off",
                    "--disable-pip-version-check",
                    "--retries", String(installConfig.retries_per_package || 5),
                    "--timeout", String(installConfig.timeout_per_package_seconds || 300),
                    pkgSpec
                ], {
                    cwd: backendPath,
                    stdio: "pipe",
                    env: {
                        ...process.env,
                        PYTHONIOENCODING: 'utf-8',
                        PYTHONUNBUFFERED: '1',
                        TEMP: tempDir,
                        TMP: tempDir
                    }
                });

                let output = '';
                let errorOut = '';

                proc.stdout.on('data', (data) => {
                    output += data.toString();
                    // Mostrar progreso importante
                    const lines = output.split('\n');
                    for (const line of lines) {
                        if (line.includes('Downloading') || line.includes('Installing')) {
                            console.log(`  ${line.trim()}`);
                        }
                    }
                });

                proc.stderr.on('data', (data) => {
                    const err = data.toString();
                    errorOut += err;
                    if (!err.includes('WARNING') && !err.includes('DEPRECATION')) {
                        console.error(`  [stderr] ${err.trim()}`);
                    }
                });

                proc.on('close', (code) => {
                    if (code === 0) {
                        console.log(`  ✓ ${pkgName} instalado correctamente`);
                        resolve(true);
                    } else {
                        console.error(`  ✗ ${pkgName} fallo: ${errorOut.substring(0, 150)}`);
                        resolve(false);
                    }
                });

                proc.on('error', (err) => {
                    console.error(`  ✗ Error de proceso: ${err.message}`);
                    resolve(false);
                });
            });

            if (!success) {
                failed.push(pkgName);
            }

            // DELAY LARGO entre paquetes problemáticos para liberar recursos
            console.log(`  Esperando ${delay}ms antes del siguiente paquete...`);
            await new Promise(resolve => setTimeout(resolve, delay));

        } catch (error) {
            console.error(`  ✗ Error al instalar ${pkgName}:`, error.message);
            failed.push(pkgName);
        }
    }

    if (failed.length > 0) {
        console.log(`\n⚠️  Paquetes problematicos que fallaron (${failed.length}): ${failed.join(', ')}`);
    } else {
        console.log(`✓ Todos los paquetes problematicos instalados correctamente`);
    }

    return failed;
}

// Función para instalar paquetes en bloque (rápido pero puede fallar algunos)
async function installPackagesInBulk(pythonCmd, backendPath, requirementsPath, packagesToInstall) {
    const tempDir = path.join(backendPath, 'temp');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }

    const failedPackages = [];

    // Leer requirements.txt y filtrar solo los paquetes que queremos instalar
    const requirementsContent = fs.readFileSync(requirementsPath, 'utf8');
    const allSpecs = requirementsContent
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'));

    // Crear mapa de nombre → especificación completa
    const packageMap = {};
    allSpecs.forEach(spec => {
        const nameMatch = spec.match(/^([a-zA-Z0-9_-]+)/);
        if (nameMatch) {
            packageMap[nameMatch[1].toLowerCase()] = spec;
        }
    });

    // Obtener especificaciones completas de los paquetes a instalar
    const specsToInstall = packagesToInstall
        .map(pkg => packageMap[pkg.toLowerCase()] || pkg)
        .filter(spec => spec);

    if (specsToInstall.length === 0) {
        console.log('No hay paquetes para instalar en bloque');
        return [];
    }

    console.log(`Instalando ${specsToInstall.length} paquetes en bloque...`);

    return new Promise((resolve) => {
        // Instalar directamente con los nombres de paquetes (no -r requirements.txt)
        const proc = spawn(pythonCmd, [
            "-m", "pip", "install",
            "--prefer-binary",
            "--no-cache-dir",
            "--no-color",
            "--progress-bar", "off",
            "--disable-pip-version-check",
            "--retries", "3",
            "--timeout", "120",
            ...specsToInstall  // Expandir array de especificaciones
        ], {
            cwd: backendPath,
            stdio: ["ignore", "pipe", "pipe"],
            env: {
                ...process.env,
                PYTHONIOENCODING: 'utf-8',
                PYTHONUNBUFFERED: '1',
                TEMP: tempDir,
                TMP: tempDir
            }
        });

        let installOutput = '';
        let errorOutput = '';
        let lastPackage = '';
        let packagesInstalled = 0;

        proc.stdout.on("data", (data) => {
            const output = data.toString('utf8').trim();
            installOutput += output + '\n';

            const collectingMatch = output.match(/Collecting ([^\s]+)/);
            const installingMatch = output.match(/Installing collected packages: (.+)/);

            if (collectingMatch && collectingMatch[1] !== lastPackage) {
                lastPackage = collectingMatch[1];
                packagesInstalled++;
                const progress = 36 + Math.min(6, (packagesInstalled / packagesToInstall.length) * 6);
                console.log(`[pip bulk] Procesando: ${lastPackage}`);
                notifyInstallationProgress('deps-download', `Instalando ${lastPackage}... (${packagesInstalled}/${packagesToInstall.length})`, progress);
            } else if (installingMatch) {
                notifyInstallationProgress('deps-finalizing', 'Finalizando instalacion...', 42);
            }
        });

        proc.stderr.on("data", (data) => {
            const error = data.toString('utf8').trim();
            errorOutput += error + '\n';

            // Detectar paquetes que fallaron - MEJORADO
            // Patrón 1: ERROR: Could not install packages... 'path\package\file'
            const errorMatch1 = error.match(/ERROR:.*?'[^']*[\\/]site-packages[\\/]([^\\/]+)/);
            if (errorMatch1 && !failedPackages.includes(errorMatch1[1])) {
                failedPackages.push(errorMatch1[1]);
                console.log(`[pip] Paquete con error detectado: ${errorMatch1[1]}`);
            }

            // Patrón 2: ERROR: Could not install packages... temp\...\package-version.whl
            const errorMatch2 = error.match(/temp[\\/][^\\/]+[\\/]([a-zA-Z0-9_-]+)-[\d.]+/);
            if (errorMatch2 && !failedPackages.includes(errorMatch2[1])) {
                failedPackages.push(errorMatch2[1]);
                console.log(`[pip] Paquete con error detectado: ${errorMatch2[1]}`);
            }

            // Patrón 3: Collecting package_name (failed)
            const errorMatch3 = error.match(/ERROR:.*?Could not find.*?for ([a-zA-Z0-9_-]+)/);
            if (errorMatch3 && !failedPackages.includes(errorMatch3[1])) {
                failedPackages.push(errorMatch3[1]);
                console.log(`[pip] Paquete con error detectado: ${errorMatch3[1]}`);
            }

            if (error && !error.includes('WARNING') && !error.includes('DEPRECATION')) {
                console.error(`[pip stderr] ${error}`);
            }
        });

        proc.on("close", (code) => {
            if (code === 0) {
                console.log("✓ Instalacion en bloque completada correctamente");
                console.log("✓ Instalacion en bloque completada correctamente");
                resolve([]);
            } else {
                console.log(`⚠️  Instalacion en bloque termino con errores (code ${code})`);

                // Si no detectamos paquetes específicos, devolver los que intentamos instalar
                if (failedPackages.length === 0) {
                    console.log('⚠️  No se detectaron paquetes especificos con errores.');
                    console.log('Por seguridad, se marcaran como fallidos para retry...');
                    resolve(packagesToInstall.slice());
                } else {
                    console.log(`Paquetes detectados con errores (${failedPackages.length}): ${failedPackages.join(', ')}`);
                    resolve(failedPackages);
                }
            }
        });

        proc.on("error", (err) => {
            console.error('Error al ejecutar pip:', err);
            resolve(failedPackages);
        });
    });
}

// Función para reintentar paquetes fallidos uno por uno
async function retryFailedPackages(pythonCmd, backendPath, failedPackages) {
    const tempDir = path.join(backendPath, 'temp');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }

    // Leer requirements.txt para obtener las especificaciones completas de versión
    const requirementsPath = path.join(backendPath, 'requirements.txt');
    const requirementsContent = fs.readFileSync(requirementsPath, 'utf8');
    const allPackages = requirementsContent
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'));

    // Mapear nombres de paquetes a sus especificaciones completas
    const packageMap = {};
    allPackages.forEach(spec => {
        const nameMatch = spec.match(/^([a-zA-Z0-9_-]+)/);
        if (nameMatch) {
            packageMap[nameMatch[1].toLowerCase()] = spec;
        }
    });

    let retried = 0;
    let stillFailed = [];

    for (const pkgName of failedPackages) {
        retried++;
        const progress = 40 + Math.min(5, (retried / failedPackages.length) * 5);

        // Buscar la especificación completa del paquete
        const pkgSpec = packageMap[pkgName.toLowerCase()] || pkgName;

        console.log(`[pip retry] Reintentando ${pkgSpec}... (${retried}/${failedPackages.length})`);
        notifyInstallationProgress('deps-retry', `Reintentando ${pkgName}... (${retried}/${failedPackages.length})`, progress);

        try {
            const success = await new Promise((resolve) => {
                const proc = spawn(pythonCmd, [
                    "-m", "pip", "install",
                    "--prefer-binary",
                    "--no-cache-dir",
                    "--no-color",
                    "--progress-bar", "off",
                    "--disable-pip-version-check",
                    "--retries", "5",
                    "--timeout", "180",
                    pkgSpec  // Usar especificación completa con versión
                ], {
                    cwd: backendPath,
                    stdio: "pipe",
                    env: {
                        ...process.env,
                        PYTHONIOENCODING: 'utf-8',
                        PYTHONUNBUFFERED: '1',
                        TEMP: tempDir,
                        TMP: tempDir
                    }
                });

                let errorOut = '';

                proc.stdout.on('data', (data) => {
                    const output = data.toString();
                    // Mostrar output importante
                    if (output.includes('Successfully installed') || output.includes('Requirement already satisfied')) {
                        console.log(`[pip retry] ${output.trim()}`);
                    }
                });

                proc.stderr.on('data', (data) => {
                    const err = data.toString();
                    errorOut += err;
                });

                proc.on('close', (code) => {
                    if (code === 0) {
                        console.log(`✓ ${pkgName} instalado correctamente en retry`);
                        resolve(true);
                    } else {
                        console.error(`✗ ${pkgName} sigue fallando: ${errorOut.substring(0, 150)}`);
                        resolve(false);
                    }
                });

                proc.on('error', () => {
                    resolve(false);
                });
            });

            if (!success) {
                stillFailed.push(pkgName);
            }

            // Pausa mayor entre reintentos para dar tiempo a Windows
            await new Promise(resolve => setTimeout(resolve, 1000));

        } catch (error) {
            console.error(`Error al reintentar ${pkgName}:`, error.message);
            stillFailed.push(pkgName);
        }
    }

    if (stillFailed.length > 0) {
        console.log(`\n⚠️  Paquetes que aun fallan (${stillFailed.length}):`);
        stillFailed.forEach(pkg => console.log(`   - ${pkg}`));
        notifyUser('warning', `${failedPackages.length - stillFailed.length}/${failedPackages.length} paquetes recuperados. ${stillFailed.length} siguen fallando.`);
    } else {
        console.log(`✓ Todos los paquetes fallidos fueron instalados correctamente`);
        notifyUser('success', `${failedPackages.length} paquetes recuperados exitosamente`);
    }

    notifyInstallationProgress('deps-ready', 'Dependencias instaladas', 45);
}

// Función auxiliar para cerrar procesos de Python bloqueantes
async function killPythonProcesses(venvPath) {
    if (process.platform !== 'win32') return;

    try {
        console.log('Cerrando procesos de Python que puedan estar bloqueando archivos...');

        // Obtener PIDs de procesos Python usando el venv
        const tasklist = execSync('tasklist /FI "IMAGENAME eq python.exe" /FO CSV /NH', {
            encoding: 'utf8',
            stdio: 'pipe'
        });

        const lines = tasklist.trim().split('\n');
        for (const line of lines) {
            const parts = line.split(',');
            if (parts.length >= 2) {
                const pid = parts[1].replace(/"/g, '').trim();
                if (pid && !isNaN(pid)) {
                    try {
                        // Intentar cerrar el proceso amablemente primero
                        execSync(`taskkill /PID ${pid}`, {
                            stdio: 'pipe',
                            timeout: 5000
                        });
                        console.log(`Proceso Python (PID ${pid}) cerrado`);
                    } catch (killError) {
                        // Si falla, ignorar (puede que ya no exista)
                    }
                }
            }
        }

        // Esperar un momento para que los archivos se liberen
        await new Promise(resolve => setTimeout(resolve, 1000));

    } catch (error) {
        console.log('No se pudieron cerrar procesos Python:', error.message);
    }
}

// Asegurar que el entorno virtual de Python esté creado y configurado
async function ensurePythonEnv(backendPath, retryCount = 0) {
    const venvPath = path.join(backendPath, "venv");
    const requirementsPath = path.join(backendPath, "requirements.txt");
    const MAX_RETRIES = 2;

    // Detectar rutas del binario Python
    const pythonCmd = process.platform === "win32"
        ? path.join(venvPath, "Scripts", "python.exe")
        : path.join(venvPath, "bin", "python");

    try {
        // Encontrar Python base instalado
        const basePython = findPythonExecutable();
        console.log('Usando Python base:', basePython);
        notifyInstallationProgress('venv-check', 'Configurando entorno de Python...', 25);

        // Verificar si el venv existe y está corrupto
        if (fs.existsSync(venvPath)) {
            console.log("Verificando entorno virtual existente...");
            notifyInstallationProgress('venv-verify', 'Verificando entorno virtual...', 27);

            // Intentar ejecutar python del venv para verificar si funciona
            try {
                execSync(`"${pythonCmd}" --version`, {
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

        if (!fs.existsSync(venvPath)) {
            console.log("Creando entorno virtual...");
            notifyUser('info', 'Creando entorno virtual de Python...');
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

            // Actualizar pip a la última versión
            console.log("Actualizando pip...");
            notifyUser('info', 'Actualizando pip...');
            notifyInstallationProgress('pip-upgrade', 'Actualizando gestor de paquetes (pip)...', 32);
            execSync(`"${pythonCmd}" -m pip install --upgrade pip`, {
                cwd: backendPath,
                encoding: 'utf8',
                stdio: 'pipe',
                timeout: 60000  // 60 segundos timeout
            });
            console.log("pip actualizado correctamente");
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

        // Verificar dependencias instaladas
        console.log("Verificando dependencias...");
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
            notifyUser('info', `Instalando ${missing.length} dependencias de Python. Esto puede tomar varios minutos...`);
            notifyInstallationProgress('deps-install', `Instalando ${missing.length} dependencias de Python...`, 36);

            // Cerrar cualquier proceso de Python que pueda estar bloqueando archivos
            await killPythonProcesses(venvPath);

            // Pequeña pausa para asegurar que no hay procesos bloqueantes
            await new Promise(resolve => setTimeout(resolve, 2000));

            // NUEVA ESTRATEGIA: Separar paquetes estables de problemáticos
            console.log('Cargando configuracion de paquetes problematicos...');
            const problematicConfig = loadProblematicPackages(backendPath);
            const problematicSet = new Set(problematicConfig.problematic_packages.map(p => p.toLowerCase()));

            // Separar paquetes
            const stablePackages = missing.filter(pkg => !problematicSet.has(pkg.toLowerCase()));
            const problematicPackages = missing.filter(pkg => problematicSet.has(pkg.toLowerCase()));

            console.log(`📦 Paquetes estables: ${stablePackages.length}`);
            console.log(`⚠️  Paquetes problematicos: ${problematicPackages.length} (${problematicPackages.join(', ')})`);

            // FASE 1: Instalar paquetes estables en bloque (rápido)
            let failedStable = [];
            if (stablePackages.length > 0) {
                console.log('\n=== FASE 1: Instalando paquetes estables en bloque ===');
                notifyUser('info', `Instalando ${stablePackages.length} paquetes estables...`);
                notifyInstallationProgress('deps-stable', `Instalando ${stablePackages.length} paquetes estables...`, 36);

                failedStable = await installPackagesInBulk(pythonCmd, backendPath, requirementsPath, stablePackages);
            }

            // FASE 2: Instalar paquetes problemáticos UNO POR UNO con delays largos
            let failedProblematic = [];
            if (problematicPackages.length > 0) {
                console.log('\n=== FASE 2: Instalando paquetes problematicos uno por uno ===');
                notifyUser('info', `Instalando ${problematicPackages.length} paquetes problematicos (mas lento pero seguro)...`);
                notifyInstallationProgress('deps-problematic', `Instalando paquetes problematicos...`, 38);

                failedProblematic = await installProblematicPackages(
                    pythonCmd,
                    backendPath,
                    problematicPackages,
                    problematicConfig.install_config
                );
            }

            // FASE 3: Instalar paquetes GPU/CPU según hardware
            console.log('\n=== FASE 3: Instalando PyTorch (GPU/CPU) ===');
            const gpuConfig = loadGPUPackages(backendPath);
            const failedGPU = await installGPUPackages(pythonCmd, backendPath, gpuConfig);

            // FASE 4: Reintentar todos los fallidos
            const allFailed = [...failedStable, ...failedProblematic, ...failedGPU];
            if (allFailed.length > 0) {
                console.log(`\n=== FASE 4: Reintentando ${allFailed.length} paquetes fallidos ===`);
                notifyUser('warning', `Reintentando ${allFailed.length} paquetes que fallaron...`);
                notifyInstallationProgress('deps-retry', `Reintentando ${allFailed.length} paquetes...`, 46);

                await retryFailedPackages(pythonCmd, backendPath, allFailed);
            } else {
                notifyInstallationProgress('deps-ready', 'Dependencias instaladas', 48);
            }

            // Limpiar directorio temporal DESPUÉS de todos los reintentos
            console.log('Limpiando directorio temporal...');
            await new Promise(resolve => setTimeout(resolve, 2000)); // Esperar que pip libere archivos

            try {
                const tempDir = path.join(backendPath, 'temp');
                if (fs.existsSync(tempDir)) {
                    fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 1000 });
                    console.log('Directorio temporal limpiado');
                }
            } catch (cleanupErr) {
                console.log('No se pudo limpiar directorio temporal (no es critico):', cleanupErr.message);
            }

        } else {
            console.log("Todas las dependencias ya estan instaladas.");

            // SIEMPRE verificar si PyTorch esta instalado, si no, instalarlo
            console.log('Verificando instalacion de PyTorch...');
            const hasTorch = installedPackages.some(pkg => pkg.toLowerCase() === 'torch');
            if (!hasTorch) {
                console.log('PyTorch no detectado, instalando...');
                const gpuConfig = loadGPUPackages(backendPath);
                await installGPUPackages(pythonCmd, backendPath, gpuConfig);
            }

            notifyInstallationProgress('deps-ready', 'Dependencias verificadas', 48);
        }

        // Verificar que PyTorch funcione correctamente
        console.log('\n=== Verificacion Final de PyTorch ===');
        await verifyPyTorchInstallation(pythonCmd);

        // NOTA: Poppler ya no es necesario - usamos PyPDFLoader que es nativo de Python
        // await checkPoppler();

        return pythonCmd;
    } catch (err) {
        console.error("Error en ensurePythonEnv:", err);

        // Si el error es por archivos bloqueados y no hemos alcanzado el límite de reintentos
        if (err.message === 'VENV_LOCKED' && retryCount < MAX_RETRIES) {
            console.log(`Intento ${retryCount + 1}/${MAX_RETRIES}: Limpiando entorno virtual bloqueado...`);
            notifyUser('warning', `Reintentando instalacion (intento ${retryCount + 1}/${MAX_RETRIES})...`);
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
                notifyUser('error', 'No se pudo limpiar el entorno virtual. Intenta cerrar otros programas y reiniciar Alfred.');
                throw new Error(`No se pudo limpiar el entorno virtual: ${cleanupError.message}`);
            }
        }

        throw err;
    }
}

// Verificar si PyTorch tiene soporte CUDA
// Verificar estado de PyTorch (solo informativo)
async function verifyPyTorchInstallation(pythonCmd) {
    try {
        console.log("Verificando instalacion de PyTorch...");

        // Verificar que PyTorch esté importable
        const checkScript = "import torch; print(f'PyTorch {torch.__version__} - CUDA: {torch.cuda.is_available()}')";
        const result = execSync(`"${pythonCmd}" -c "${checkScript}"`, {
            encoding: 'utf8',
            stdio: 'pipe',
            timeout: 10000
        }).trim();

        console.log(`✓ ${result}`);

        if (result.includes('CUDA: True')) {
            notifyUser('success', 'PyTorch con aceleracion GPU instalado correctamente');
        } else {
            notifyUser('info', 'PyTorch CPU instalado (GPU no disponible)');
        }

        return true;
    } catch (err) {
        console.log("⚠️  No se pudo verificar PyTorch:", err.message);
        notifyUser('warning', 'PyTorch podria no estar instalado correctamente');
        return false;
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
    notifyInstallationProgress('backend-init', 'Iniciando servidor Alfred...', 85);

    while (Date.now() - startTime < timeout) {
        // Verificar si el proceso del backend sigue vivo
        if (!backendProcess || backendProcess.exitCode !== null) {
            console.error('⚠️  El proceso del backend ha terminado inesperadamente');
            notifyUser('error', 'El backend se cerró. Verifica que todas las dependencias estén instaladas.');
            notifyBackendStatus(false);
            return false;
        }

        if (await isBackendRunning()) {
            console.log('Backend esta disponible');
            notifyBackendStatus(true);  // Notificar que esta conectado
            notifyInstallationProgress('backend-ready', 'Alfred iniciado correctamente', 100);
            return true;
        }
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Actualizar progreso mientras espera
        const elapsed = Date.now() - startTime;
        const progress = 85 + Math.min(10, (elapsed / timeout) * 10);
        console.log('Esperando al backend...');
        notifyInstallationProgress('backend-starting', 'Cargando sistema de IA...', progress);
    }

    notifyBackendStatus(false);  // Notificar que fallo la conexion
    return false;
}

// Iniciar el backend y ESPERAR hasta que responda correctamente
async function startBackendAndWait() {
    console.log('[INIT] === PASO 5: INICIANDO BACKEND ===');
    console.log('[INIT] Ollama ya debe estar completamente funcional en este punto');
    console.log('[INIT] Iniciando backend y esperando respuesta...');
    console.log('[INIT] Flag isInitializing:', isInitializing);
    console.log('[INIT] Este es el UNICO punto autorizado para iniciar el backend durante setup');

    // Temporalmente permitir el inicio del backend desde este flujo
    const wasInitializing = isInitializing;
    if (wasInitializing) {
        console.log('[INIT] Temporalmente deshabilitando flag isInitializing para permitir inicio controlado');
        isInitializing = false;
    }

    try {
        // Primero iniciar el proceso
        const started = await startBackend();

        if (!started) {
            console.error('No se pudo iniciar el proceso del backend');
            return false;
        }

        // Ahora esperar con reintentos más largos hasta que responda
        console.log('Backend iniciado, esperando respuesta del servidor...');
        notifyInstallationProgress('backend-init', 'Esperando respuesta del backend...', 85);

        const maxRetries = 60; // 60 intentos = 2 minutos
        const retryDelay = 2000; // 2 segundos entre intentos

        for (let i = 0; i < maxRetries; i++) {
            const progress = 85 + Math.min(14, (i / maxRetries) * 14);
            notifyInstallationProgress('backend-starting', `Esperando backend... (${i + 1}/${maxRetries})`, progress);

            try {
                const isRunning = await isBackendRunning();
                if (isRunning) {
                    console.log(`✓ Backend respondio correctamente despues de ${i + 1} intentos`);
                    notifyUser('success', 'Backend conectado correctamente');
                    notifyBackendStatus(true);
                    notifyInstallationProgress('backend-ready', 'Backend listo', 100);
                    return true;
                }
            } catch (error) {
                console.log(`Intento ${i + 1}/${maxRetries} - Backend aun no responde`);
            }

            await new Promise(resolve => setTimeout(resolve, retryDelay));
        }

        console.error('Backend no respondio despues de 2 minutos');
        notifyUser('error', 'El backend no responde. Revisa los logs en la consola.');
        return false;
    } finally {
        // Restaurar el flag si era necesario
        if (wasInitializing) {
            console.log('[INIT] Restaurando flag isInitializing a true');
            isInitializing = true;
        }
    }
}

async function startBackend() {
    console.log('[BACKEND] Verificando si el backend ya esta iniciado...');
    console.log('[BACKEND] Flag isInitializing:', isInitializing);

    // PROTECCIÓN ADICIONAL: No iniciar durante la inicialización
    if (isInitializing) {
        console.log('[BACKEND] ⚠️  ABORTADO: isInitializing=true, no se puede iniciar backend ahora');
        return false;
    }

    if (backendProcess) {
        console.log('[BACKEND] El backend ya esta iniciado');
        return true;
    }

    console.log('[BACKEND] === INICIANDO BACKEND DE ALFRED ===');
    console.log('[BACKEND] IMPORTANTE: Ollama debe estar corriendo ANTES de este paso');
    notifyInstallationProgress('backend-start', 'Preparando servidor de Alfred...', 80);

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
        notifyInstallationProgress('backend-launch', 'Lanzando servidor FastAPI...', 82);

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

        // Captura de errores - DETECTAR ERRORES CRÍTICOS
        let hasModuleError = false;
        backendProcess.stderr.on('data', (data) => {
            const error = data.toString('utf8').trim();
            if (error) console.error(`[Backend Error] ${error}`);

            // Detectar errores de módulo faltante
            if (error.includes('ModuleNotFoundError') || error.includes('ImportError')) {
                hasModuleError = true;
                console.error('⚠️  ERROR CRÍTICO: Faltan dependencias de Python');
            }
        });

        backendProcess.on('close', (code) => {
            console.log(`[Backend] Proceso finalizado con codigo ${code}`);

            if (code !== 0 && hasModuleError) {
                console.error('⚠️  Backend cerrado por dependencias faltantes');
                notifyUser('error', 'Faltan dependencias. Reinstalando...');
            }

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
        notifyBackendStatus(false);  // Notificar desconexion
    }
}

// Verificar y, si es necesario, iniciar el backend
async function checkAndStartBackend() {
    // CRÍTICO: No permitir inicio durante la inicialización
    if (isInitializing) {
        console.log('[CHECK-BACKEND] Inicializacion en progreso, ABORTANDO checkAndStartBackend');
        return false;
    }

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
            notifyBackendStatus(true);  // Notificar conexion exitosa

            // Enviar evento backend-ready para que el loader se oculte
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('backend-ready');
            }

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
            const isRunning = await isBackendRunning();
            notifyBackendStatus(isRunning);

            // Si el backend esta caido, intentar reiniciarlo
            if (!isRunning && isBackendStartedByElectron) {
                console.log('[MONITOR] Backend caido, intentando reiniciar...');
                await checkAndStartBackend();
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