// ensureOllama.js - Modulo para manejo de Ollama
const { execSync, spawn } = require('child_process');
const http = require('http');
const path = require('path');
const { app } = require('electron');
const fs = require('fs');

// Flag global para prevenir descargas simultaneas
let isDownloadingOllama = false;

// Modelos requeridos por defecto
const DEFAULT_REQUIRED_MODELS = ['gemma3n:e4b', 'nomic-embed-text:v1.5'];

// ============================================================================
// VERIFICACION DE OLLAMA
// ============================================================================

/**
 * Verificar si Ollama esta corriendo
 * @returns {Promise<boolean>} true si Ollama responde
 */
async function checkOllama() {
    try {
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

/**
 * Verificar si Ollama esta instalado (sin verificar si esta corriendo)
 * @returns {boolean} true si Ollama esta instalado
 */
function isOllamaInstalled() {
    try {
        execSync('ollama --version', { stdio: 'pipe' });
        return true;
    } catch {
        return false;
    }
}

/**
 * Iniciar servicio de Ollama
 * @returns {Promise<boolean>} true si se inicio correctamente
 */
async function startOllamaService() {
    console.log('[OLLAMA] Intentando iniciar servicio...');

    try {
        if (process.platform === 'win32') {
            // En Windows, iniciar Ollama en background
            spawn('ollama', ['serve'], {
                detached: true,
                stdio: 'ignore'
            }).unref();
        } else if (process.platform === 'linux' || process.platform === 'darwin') {
            // En Linux/macOS, iniciar Ollama en background
            spawn('bash', ['-c', 'nohup ollama serve > /dev/null 2>&1 &'], {
                detached: true,
                stdio: 'ignore'
            }).unref();
        }

        // Esperar a que Ollama este disponible
        console.log('[OLLAMA] Esperando 3 segundos para que inicie...');
        await new Promise(resolve => setTimeout(resolve, 3000));

        return await checkOllama();
    } catch (error) {
        console.error('[OLLAMA] Error al iniciar servicio:', error);
        return false;
    }
}

// ============================================================================
// INSTALACION DE OLLAMA
// ============================================================================

/**
 * Asegurar que Ollama este instalado y corriendo
 * @param {Function} notifyProgress - Callback para notificar progreso
 * @returns {Promise<boolean>} true si Ollama esta listo
 */
async function ensureOllama(notifyProgress) {
    console.log('[OLLAMA] === INICIANDO VERIFICACION DE OLLAMA ===');
    console.log('[OLLAMA] Flag isDownloadingOllama:', isDownloadingOllama);

    // Paso 1: Verificar si Ollama esta corriendo
    if (await checkOllama()) {
        console.log('[OLLAMA] Ollama ya esta corriendo en puerto 11434');
        // No actualizar progreso aqui, lo maneja main.js
        return true;
    }

    console.log('[OLLAMA] Ollama no responde en puerto 11434');

    // Paso 2: Verificar si Ollama esta instalado pero no corriendo
    console.log('[OLLAMA] Verificando si Ollama esta instalado...');
    if (isOllamaInstalled()) {
        console.log('[OLLAMA] Ollama instalado, intentando iniciar...');
        notifyProgress('ollama-start', 'Iniciando Ollama...', 25);

        if (await startOllamaService()) {
            console.log('[OLLAMA] Ollama iniciado correctamente');
            // No actualizar progreso aqui, lo maneja main.js
            return true;
        }

        console.error('[OLLAMA] No se pudo iniciar Ollama');
    } else {
        console.log('[OLLAMA] Ollama NO esta instalado');
    }

    // Paso 3: Instalar Ollama
    console.log('[OLLAMA] Descargando e instalando Ollama...');
    notifyProgress('ollama-download', 'Descargando Ollama...', 28);

    try {
        if (process.platform === 'win32') {
            console.log('[OLLAMA] Llamando a downloadAndInstallOllamaWindows()...');
            const result = await downloadAndInstallOllamaWindows(notifyProgress);
            console.log('[OLLAMA] Resultado de instalacion:', result);
            return result;
        } else if (process.platform === 'linux') {
            console.log('[OLLAMA] Llamando a downloadAndInstallOllamaLinux()...');
            const result = await downloadAndInstallOllamaLinux(notifyProgress);
            console.log('[OLLAMA] Resultado de instalacion:', result);
            return result;
        } else if (process.platform === 'darwin') {
            console.log('[OLLAMA] Llamando a downloadAndInstallOllamaMac()...');
            const result = await downloadAndInstallOllamaMac(notifyProgress);
            console.log('[OLLAMA] Resultado de instalacion:', result);
            return result;
        } else {
            console.error('[OLLAMA] Instalacion automatica no soportada en esta plataforma:', process.platform);
            return false;
        }
    } catch (installError) {
        console.error('[OLLAMA] Error al instalar Ollama:', installError);
        return false;
    }
}

/**
 * Descargar e instalar Ollama en Windows
 * @param {Function} notifyProgress - Callback para notificar progreso
 * @returns {Promise<boolean>} true si instalacion exitosa
 */
async function downloadAndInstallOllamaWindows(notifyProgress) {
    // Prevenir descargas multiples simultaneas
    if (isDownloadingOllama) {
        console.log('[OLLAMA] Ya hay una descarga en progreso, esperando...');
        return false;
    }

    isDownloadingOllama = true;
    const installerPath = path.join(app.getPath('temp'), 'OllamaSetup.exe');
    const downloadUrl = 'https://ollama.ai/download/OllamaSetup.exe';

    console.log('[OLLAMA] Iniciando descarga desde:', downloadUrl);

    try {
        // Descargar el instalador (28-32%)
        const { downloadFile } = require('./downloadUtils');
        await downloadFile(downloadUrl, installerPath, notifyProgress, 'ollama-download', 28, 32);

        console.log('[OLLAMA] Descarga completada, iniciando instalacion...');
        notifyProgress('ollama-install', 'Instalando Ollama...', 33);

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
        notifyProgress('ollama-wait', 'Esperando Ollama...', 55);
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Verificar con reintentos
        for (let i = 0; i < 12; i++) {
            console.log(`[OLLAMA] Intento ${i + 1}/12 de verificacion...`);

            if (await checkOllama()) {
                console.log('[OLLAMA] Ollama instalado e iniciado correctamente');
                notifyProgress('ollama-ready', 'Ollama listo', 60);
                return true;
            }

            await new Promise(resolve => setTimeout(resolve, 5000));
        }

        console.warn('[OLLAMA] Ollama instalado pero no responde despues de 60 segundos');

        // Intentar iniciar manualmente
        if (await startOllamaService()) {
            console.log('[OLLAMA] Ollama iniciado manualmente con exito');
            notifyProgress('ollama-ready', 'Ollama listo', 60);
            return true;
        }

        return false;

    } catch (error) {
        console.error('[OLLAMA] Error critico durante instalacion:', error);
        return false;
    } finally {
        // Siempre liberar el flag
        isDownloadingOllama = false;
        console.log('[OLLAMA] Flag de descarga liberado');
    }
}

/**
 * Descargar e instalar Ollama en Linux
 * @param {Function} notifyProgress - Callback para notificar progreso
 * @returns {Promise<boolean>} true si instalacion exitosa
 */
async function downloadAndInstallOllamaLinux(notifyProgress) {
    if (isDownloadingOllama) {
        console.log('[OLLAMA] Ya hay una descarga en progreso, esperando...');
        return false;
    }

    isDownloadingOllama = true;
    console.log('[OLLAMA] Iniciando instalacion en Linux...');

    try {
        // Usar el script oficial de instalacion de Ollama
        notifyProgress('ollama-download', 'Descargando e instalando Ollama...', 30);
        
        await new Promise((resolve, reject) => {
            const installProcess = spawn('bash', ['-c', 'curl -fsSL https://ollama.com/install.sh | sh'], {
                stdio: ['ignore', 'pipe', 'pipe'],
                env: {
                    ...process.env,
                    DEBIAN_FRONTEND: 'noninteractive'
                }
            });

            installProcess.stdout.on('data', (data) => {
                const output = data.toString().trim();
                console.log(`[OLLAMA] ${output}`);
                
                if (output.includes('Downloading')) {
                    notifyProgress('ollama-download', 'Descargando Ollama...', 35);
                } else if (output.includes('Installing')) {
                    notifyProgress('ollama-install', 'Instalando Ollama...', 45);
                }
            });

            installProcess.stderr.on('data', (data) => {
                const error = data.toString().trim();
                console.log(`[OLLAMA] ${error}`);
            });

            installProcess.on('close', (code) => {
                console.log(`[OLLAMA] Instalador termino con codigo: ${code}`);
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`Instalador termino con codigo ${code}`));
                }
            });

            installProcess.on('error', (err) => {
                console.error('[OLLAMA] Error al ejecutar instalador:', err);
                reject(err);
            });
        });

        console.log('[OLLAMA] Esperando a que Ollama inicie...');
        notifyProgress('ollama-wait', 'Esperando Ollama...', 55);
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Verificar con reintentos
        for (let i = 0; i < 12; i++) {
            console.log(`[OLLAMA] Intento ${i + 1}/12 de verificacion...`);

            if (await checkOllama()) {
                console.log('[OLLAMA] Ollama instalado e iniciado correctamente');
                notifyProgress('ollama-ready', 'Ollama listo', 60);
                return true;
            }

            await new Promise(resolve => setTimeout(resolve, 5000));
        }

        console.warn('[OLLAMA] Ollama instalado pero no responde, intentando iniciar...');

        if (await startOllamaService()) {
            console.log('[OLLAMA] Ollama iniciado manualmente con exito');
            notifyProgress('ollama-ready', 'Ollama listo', 60);
            return true;
        }

        return false;

    } catch (error) {
        console.error('[OLLAMA] Error critico durante instalacion en Linux:', error);
        return false;
    } finally {
        isDownloadingOllama = false;
        console.log('[OLLAMA] Flag de descarga liberado');
    }
}

/**
 * Descargar e instalar Ollama en macOS
 * @param {Function} notifyProgress - Callback para notificar progreso
 * @returns {Promise<boolean>} true si instalacion exitosa
 */
async function downloadAndInstallOllamaMac(notifyProgress) {
    if (isDownloadingOllama) {
        console.log('[OLLAMA] Ya hay una descarga en progreso, esperando...');
        return false;
    }

    isDownloadingOllama = true;
    const installerPath = path.join(app.getPath('temp'), 'Ollama.zip');
    const downloadUrl = 'https://ollama.com/download/Ollama-darwin.zip';

    console.log('[OLLAMA] Iniciando descarga desde:', downloadUrl);

    try {
        // Descargar el instalador
        const { downloadFile } = require('./downloadUtils');
        await downloadFile(downloadUrl, installerPath, notifyProgress, 'ollama-download', 28, 35);

        console.log('[OLLAMA] Descarga completada, extrayendo...');
        notifyProgress('ollama-install', 'Instalando Ollama...', 40);

        // Extraer y mover a /Applications
        await new Promise((resolve, reject) => {
            const extractProcess = spawn('unzip', ['-o', installerPath, '-d', '/Applications'], {
                stdio: 'pipe'
            });

            extractProcess.on('close', (code) => {
                console.log(`[OLLAMA] Extraccion termino con codigo: ${code}`);
                if (code === 0 || code === null) {
                    resolve();
                } else {
                    reject(new Error(`Extraccion termino con codigo ${code}`));
                }
            });

            extractProcess.on('error', (err) => {
                console.error('[OLLAMA] Error al extraer:', err);
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

        console.log('[OLLAMA] Esperando a que Ollama inicie...');
        notifyProgress('ollama-wait', 'Esperando Ollama...', 55);
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Verificar con reintentos
        for (let i = 0; i < 12; i++) {
            console.log(`[OLLAMA] Intento ${i + 1}/12 de verificacion...`);

            if (await checkOllama()) {
                console.log('[OLLAMA] Ollama instalado e iniciado correctamente');
                notifyProgress('ollama-ready', 'Ollama listo', 60);
                return true;
            }

            await new Promise(resolve => setTimeout(resolve, 5000));
        }

        console.warn('[OLLAMA] Ollama instalado pero no responde, intentando iniciar...');

        if (await startOllamaService()) {
            console.log('[OLLAMA] Ollama iniciado manualmente con exito');
            notifyProgress('ollama-ready', 'Ollama listo', 60);
            return true;
        }

        return false;

    } catch (error) {
        console.error('[OLLAMA] Error critico durante instalacion en macOS:', error);
        return false;
    } finally {
        isDownloadingOllama = false;
        console.log('[OLLAMA] Flag de descarga liberado');
    }
}

// ============================================================================
// MODELOS DE OLLAMA
// ============================================================================

/**
 * Verificar y descargar modelos de Ollama requeridos
 * @param {Array<string>} requiredModels - Lista de modelos requeridos
 * @param {Function} notifyProgress - Callback para notificar progreso
 * @returns {Promise<boolean>} true si todos los modelos estan listos
 */
async function ensureOllamaModels(requiredModels = DEFAULT_REQUIRED_MODELS, notifyProgress) {
    console.log('[OLLAMA-MODELS] === VERIFICANDO MODELOS ===');
    console.log('[OLLAMA-MODELS] Modelos requeridos:', requiredModels);
    notifyProgress('models-check', 'Verificando modelos de IA...', 52);

    try {
        // Obtener lista de modelos instalados
        const modelsOutput = execSync('ollama list', {
            encoding: 'utf8',
            stdio: 'pipe'
        });

        const installedModels = modelsOutput.toLowerCase();
        let modelIndex = 0;
        const totalModels = requiredModels.length;

        // Verificar cada modelo requerido
        for (const model of requiredModels) {
            const modelName = model.toLowerCase();
            modelIndex++;
            const baseProgress = 52 + (modelIndex - 1) * (13 / totalModels);

            // Verificar si el modelo ya esta instalado
            if (!installedModels.includes(modelName.split(':')[0])) {
                console.log(`[OLLAMA-MODELS] Descargando modelo ${model}...`);
                notifyProgress('models-download', `Descargando ${model}... (${modelIndex}/${totalModels})`, baseProgress);

                try {
                    await downloadOllamaModel(model, modelIndex, totalModels, baseProgress, notifyProgress);
                    notifyProgress('models-ready', `Modelo ${model} listo (${modelIndex}/${totalModels})`, baseProgress + 13 / totalModels);
                } catch (pullError) {
                    console.error(`[OLLAMA-MODELS] Error al descargar ${model}:`, pullError);
                    throw pullError;
                }
            } else {
                console.log(`[OLLAMA-MODELS] Modelo ${model} ya instalado`);
            }
        }

        console.log('[OLLAMA-MODELS] Todos los modelos estan listos');
        // No actualizar aqui, main.js maneja el porcentaje final
        return true;

    } catch (error) {
        console.error('[OLLAMA-MODELS] Error al verificar modelos:', error);
        throw error;
    }
}

/**
 * Descargar un modelo especifico de Ollama
 * @param {string} model - Nombre del modelo
 * @param {number} modelIndex - Indice del modelo actual
 * @param {number} totalModels - Total de modelos a descargar
 * @param {number} baseProgress - Progreso base
 * @param {Function} notifyProgress - Callback para notificar progreso
 * @returns {Promise<void>}
 */
async function downloadOllamaModel(model, modelIndex, totalModels, baseProgress, notifyProgress) {
    return new Promise((resolve, reject) => {
        const pullProcess = spawn('ollama', ['pull', model], {
            stdio: ['ignore', 'pipe', 'pipe'],
            env: {
                ...process.env,
                NO_COLOR: '1',
                TERM: 'dumb'
            }
        });

        let lastProgress = '';
        let lastNotification = 0;

        pullProcess.stdout.on('data', (data) => {
            const output = data.toString().trim();

            // Detectar progreso de descarga
            const progressMatch = output.match(/(\d+)%/);
            if (progressMatch) {
                const progress = parseInt(progressMatch[1]);
                const now = Date.now();
                const modelProgress = baseProgress + (progress / 100) * (30 / totalModels);

                // Notificar cada 10% o cada 5 segundos
                if (progress % 10 === 0 || now - lastNotification > 5000) {
                    console.log(`[OLLAMA-MODELS] Descargando ${model}: ${progress}%`);
                    notifyProgress('models-download', `Descargando ${model}: ${progress}% (${modelIndex}/${totalModels})`, modelProgress);
                    lastNotification = now;
                }
            } else if (output.includes('pulling')) {
                const layerMatch = output.match(/pulling ([a-f0-9]+)/);
                if (layerMatch && output !== lastProgress) {
                    console.log(`[OLLAMA-MODELS] Descargando capa: ${layerMatch[1].substring(0, 12)}...`);
                    notifyProgress('models-download', `Descargando componentes de ${model}...`, baseProgress + 5);
                    lastProgress = output;
                }
            } else if (output.includes('verifying')) {
                console.log(`[OLLAMA-MODELS] Verificando integridad...`);
                notifyProgress('models-verify', `Verificando ${model}...`, baseProgress + 25);
            } else if (output.includes('success')) {
                console.log(`[OLLAMA-MODELS] Modelo descargado exitosamente`);
            }

            // Solo mostrar lineas significativas
            if (output && output !== lastProgress && !output.includes('pulling')) {
                console.log(`[OLLAMA-MODELS] ${output}`);
            }
        });

        pullProcess.stderr.on('data', (data) => {
            const error = data.toString().trim();
            if (error) console.error(`[OLLAMA-MODELS Error] ${error}`);
        });

        pullProcess.on('close', (code) => {
            if (code === 0) {
                console.log(`[OLLAMA-MODELS] Modelo ${model} descargado correctamente`);
                resolve();
            } else {
                reject(new Error(`ollama pull termino con codigo ${code}`));
            }
        });

        pullProcess.on('error', (err) => {
            reject(err);
        });
    });
}

// ============================================================================
// EXPORTACIONES
// ============================================================================

module.exports = {
    checkOllama,
    ensureOllama,
    isOllamaInstalled,
    startOllamaService,
    ensureOllamaModels,
    downloadOllamaModel,
    downloadAndInstallOllamaWindows,
    downloadAndInstallOllamaLinux,
    downloadAndInstallOllamaMac,
    DEFAULT_REQUIRED_MODELS
};
