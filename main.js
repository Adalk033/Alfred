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

// === Cargar configuración desde .env ===
function loadEnvConfig() {
    const envPath = path.join(__dirname, '.env');
    const config = {
        host: '127.0.0.1',
        port: 8000
    };

    try {
        if (fs.existsSync(envPath)) {
            const envContent = fs.readFileSync(envPath, 'utf-8');
            const lines = envContent.split('\n');

            lines.forEach(line => {
                line = line.trim();
                if (line && !line.startsWith('#')) {
                    const [key, ...valueParts] = line.split('=');
                    const value = valueParts.join('=').trim();

                    if (key === 'ALFRED_HOST' && value) {
                        config.host = value;
                    } else if (key === 'ALFRED_PORT' && value) {
                        config.port = parseInt(value, 10) || 8000;
                    }
                }
            });
            console.log('Configuración cargada desde .env:', config);
        } else {
            console.warn('Archivo .env no encontrado, usando valores por defecto');
        }
    } catch (error) {
        console.error('Error al cargar .env:', error);
    }

    return config;
}

const ENV_CONFIG = loadEnvConfig();
const BACKEND_PORT = ENV_CONFIG.port;
const HOST = ENV_CONFIG.host;
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
    startupTimeout: 900000  // 15 minutos para instalaciones grandes (modelos de 2GB)
};

// Modelos de Ollama requeridos
const REQUIRED_OLLAMA_MODELS = [
    'gemma3n:e4b',
    'nomic-embed-text:v1.5'
];

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
        initializeAppWithProgress();
        // Iniciar monitoreo del estado del backend
        startStatusMonitoring();
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

        // 1. Verificar/Instalar Python
        notifyUser('info', 'Verificando Python...');
        const pythonReady = await ensurePython();
        if (!pythonReady) {
            notifyUser('error', 'No se pudo instalar Python. La aplicacion se cerrara.');
            // Dar tiempo para que el usuario vea el mensaje
            await new Promise(resolve => setTimeout(resolve, 3000));
            app.exit(1);
            return false;
        }

        // 2. Verificar/Instalar Ollama
        notifyUser('info', 'Verificando Ollama...');
        const ollamaReady = await ensureOllama();
        if (!ollamaReady) {
            notifyUser('error', 'No se pudo instalar Ollama. Por favor instala manualmente desde ollama.ai');
            return false;
        }

        // 3. Verificar/Descargar modelos de Ollama
        notifyUser('info', 'Verificando modelos de IA...');
        await ensureOllamaModels();

        // 4. Configurar entorno Python y dependencias
        notifyUser('info', 'Configurando entorno Python...');
        await ensurePythonEnv(BACKEND_CONFIG.path);

        // 5. Iniciar backend
        notifyUser('info', 'Iniciando servidor de Alfred...');
        await checkAndStartBackend();

        notifyUser('success', 'Alfred esta listo para usar');
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

    // Verificar PRIMERO si Python ya está disponible (puede estar instalado aunque no esté en PATH del comando)
    const pythonInstalledMarker = path.join(app.getPath('userData'), '.python_installed');

    // Si existe la marca, intentar encontrar Python instalado
    if (fs.existsSync(pythonInstalledMarker)) {
        console.log('Detectada marca de instalacion previa de Python.');
        notifyUser('info', 'Verificando Python instalado previamente...');

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

    try {
        // Descargar el instalador
        await downloadFile(downloadUrl, installerPath);

        notifyUser('info', 'Instalando Python... esto puede tomar unos minutos');
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
    console.log('Verificando instalacion de Ollama...');

    // Verificar si Ollama está corriendo
    if (await checkOllama()) {
        console.log('Ollama ya esta corriendo');
        return true;
    }

    // Verificar si Ollama está instalado pero no corriendo
    try {
        execSync('ollama --version', { stdio: 'pipe' });
        console.log('Ollama instalado, intentando iniciar...');

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
                console.log('Ollama iniciado correctamente');
                return true;
            }
        } catch (startError) {
            console.error('Error al iniciar Ollama:', startError);
        }
    } catch {
        // Ollama no está instalado
        console.log('Ollama no esta instalado');
        notifyUser('warning', 'Descargando Ollama... esto puede tomar varios minutos');

        try {
            // Descargar e instalar Ollama automáticamente
            if (process.platform === 'win32') {
                return await downloadAndInstallOllamaWindows();
            } else {
                notifyUser('error', 'Por favor instala Ollama manualmente desde https://ollama.ai');
                return false;
            }
        } catch (installError) {
            console.error('Error al instalar Ollama:', installError);
            notifyUser('error', 'Error al instalar Ollama. Por favor instala manualmente desde https://ollama.ai');
            return false;
        }
    }

    return false;
}

// Descargar e instalar Ollama en Windows
async function downloadAndInstallOllamaWindows() {
    const installerPath = path.join(app.getPath('temp'), 'OllamaSetup.exe');
    const downloadUrl = 'https://ollama.ai/download/OllamaSetup.exe';

    console.log('Descargando Ollama desde:', downloadUrl);
    notifyUser('info', 'Descargando Ollama...');

    try {
        // Descargar el instalador
        await downloadFile(downloadUrl, installerPath);

        notifyUser('info', 'Instalando Ollama... sigue las instrucciones del instalador');

        // Ejecutar el instalador
        await new Promise((resolve, reject) => {
            const installer = spawn(installerPath, [], {
                stdio: 'inherit'
            });

            installer.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`Instalador termino con codigo ${code}`));
                }
            });

            installer.on('error', reject);
        });

        // Limpiar el instalador
        try {
            fs.unlinkSync(installerPath);
        } catch { }

        // Esperar a que Ollama esté disponible
        notifyUser('info', 'Esperando a que Ollama inicie...');
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Verificar que Ollama esté corriendo
        for (let i = 0; i < 10; i++) {
            if (await checkOllama()) {
                console.log('Ollama instalado e iniciado correctamente');
                notifyUser('success', 'Ollama instalado correctamente');
                return true;
            }
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        notifyUser('warning', 'Ollama instalado pero no responde. Por favor reinicia la aplicacion');
        return false;

    } catch (error) {
        console.error('Error al descargar/instalar Ollama:', error);
        notifyUser('error', 'Error al instalar Ollama automaticamente');
        return false;
    }
}

// Descargar archivo con progreso
function downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(destPath);

        https.get(url, (response) => {
            if (response.statusCode === 302 || response.statusCode === 301) {
                // Seguir redirección
                file.close();
                fs.unlinkSync(destPath);
                downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
                return;
            }

            if (response.statusCode !== 200) {
                reject(new Error(`Error al descargar: ${response.statusCode}`));
                return;
            }

            const totalSize = parseInt(response.headers['content-length'], 10);
            let downloaded = 0;

            response.on('data', (chunk) => {
                downloaded += chunk.length;
                const percent = ((downloaded / totalSize) * 100).toFixed(1);
                console.log(`Descarga: ${percent}%`);
            });

            response.pipe(file);

            file.on('finish', () => {
                file.close();
                resolve();
            });

        }).on('error', (err) => {
            fs.unlinkSync(destPath);
            reject(err);
        });
    });
}

// Verificar y descargar modelos de Ollama
async function ensureOllamaModels() {
    console.log('Verificando modelos de Ollama...');

    try {
        // Obtener lista de modelos instalados
        const modelsOutput = execSync('ollama list', {
            encoding: 'utf8',
            stdio: 'pipe'
        });

        const installedModels = modelsOutput.toLowerCase();

        // Verificar cada modelo requerido
        for (const model of REQUIRED_OLLAMA_MODELS) {
            const modelName = model.toLowerCase();

            if (!installedModels.includes(modelName.split(':')[0])) {
                console.log(`Descargando modelo ${model}...`);
                notifyUser('info', `Descargando modelo ${model}... (puede ser grande, hasta 2GB)`);

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
                                
                                // Notificar cada 10% o cada 5 segundos
                                if (progress % 10 === 0 || now - lastNotification > 5000) {
                                    console.log(`[Ollama] Descargando ${model}: ${progress}%`);
                                    notifyUser('info', `Descargando ${model}: ${progress}%`);
                                    lastNotification = now;
                                }
                            } else if (output.includes('pulling')) {
                                const layerMatch = output.match(/pulling ([a-f0-9]+)/);
                                if (layerMatch && output !== lastProgress) {
                                    console.log(`[Ollama] Descargando capa: ${layerMatch[1].substring(0, 12)}...`);
                                    notifyUser('info', `Descargando componente del modelo...`);
                                    lastProgress = output;
                                }
                            } else if (output.includes('verifying')) {
                                console.log(`[Ollama] Verificando integridad...`);
                                notifyUser('info', `Verificando ${model}...`);
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

async function ensurePythonEnv(backendPath) {
    const venvPath = path.join(backendPath, "venv");
    const requirementsPath = path.join(backendPath, "requirements.txt");

    // Detectar rutas del binario Python
    const pythonCmd = process.platform === "win32"
        ? path.join(venvPath, "Scripts", "python.exe")
        : path.join(venvPath, "bin", "python");

    try {
        // Encontrar Python base instalado
        const basePython = findPythonExecutable();
        console.log('Usando Python base:', basePython);

        // Verificar si el venv existe y está corrupto
        if (fs.existsSync(venvPath)) {
            console.log("Verificando entorno virtual existente...");

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

            await new Promise((resolve, reject) => {
                const proc = spawn(pythonCmd, [
                    "-m", "pip", "install",
                    "--prefer-binary",  // Preferir binarios pero permitir compilación si es necesario
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
                let errorOutput = '';
                let lastPackage = '';

                proc.stdout.on("data", (data) => {
                    const output = data.toString('utf8').trim();
                    installOutput += output + '\n';
                    
                    // Detectar qué paquete se está instalando
                    const collectingMatch = output.match(/Collecting ([^\s]+)/);
                    const downloadingMatch = output.match(/Downloading ([^\s]+)/);
                    const installingMatch = output.match(/Installing collected packages: (.+)/);
                    
                    if (collectingMatch && collectingMatch[1] !== lastPackage) {
                        lastPackage = collectingMatch[1];
                        console.log(`[pip] Descargando: ${lastPackage}`);
                        notifyUser('info', `Descargando: ${lastPackage}...`);
                    } else if (downloadingMatch && downloadingMatch[1] !== lastPackage) {
                        lastPackage = downloadingMatch[1];
                        console.log(`[pip] Obteniendo: ${lastPackage}`);
                        notifyUser('info', `Obteniendo: ${lastPackage}...`);
                    } else if (installingMatch) {
                        const packages = installingMatch[1];
                        console.log(`[pip] Instalando: ${packages}`);
                        notifyUser('info', `Instalando paquetes finales...`);
                    }
                    
                    if (output && !output.includes('Requirement already satisfied')) {
                        console.log(`[pip] ${output}`);
                    }
                });

                proc.stderr.on("data", (data) => {
                    const error = data.toString('utf8').trim();
                    errorOutput += error + '\n';
                    
                    // Filtrar warnings no críticos
                    if (error && !error.includes('WARNING') && !error.includes('DEPRECATION')) {
                        console.error(`[pip stderr] ${error}`);
                    }
                });

                proc.on("close", (code) => {
                    if (code === 0) {
                        console.log("Dependencias instaladas correctamente.");
                        notifyUser('success', 'Todas las dependencias instaladas correctamente');
                        resolve();
                    } else {
                        console.error("=== Error durante la instalacion de dependencias ===");
                        console.error("STDOUT:", installOutput);
                        console.error("STDERR:", errorOutput);
                        console.error("Exit code:", code);

                        // Notificar al usuario con más detalle
                        const errorMsg = errorOutput || installOutput || 'Error desconocido';
                        notifyUser('error', `Error al instalar dependencias: ${errorMsg.substring(0, 100)}`);

                        reject(new Error(`pip exited with code ${code}. Error: ${errorMsg}`));
                    }
                });

                proc.on("error", (err) => {
                    console.error("Error al ejecutar pip:", err);
                    notifyUser('error', `Error al ejecutar pip: ${err.message}`);
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
            notifyBackendStatus(true);  // Notificar que esta conectado
            return true;
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
        console.log('Esperando al backend...');
    }

    notifyBackendStatus(false);  // Notificar que fallo la conexion
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
        notifyBackendStatus(false);  // Notificar desconexion
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
            notifyBackendStatus(true);  // Notificar conexion exitosa
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

