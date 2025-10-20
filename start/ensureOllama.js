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
        } else {
            execSync('ollama serve &', { stdio: 'ignore' });
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
    notifyProgress('ollama-check', 'Verificando Ollama...', 40);

    // Paso 1: Verificar si Ollama esta corriendo
    if (await checkOllama()) {
        console.log('[OLLAMA] Ollama ya esta corriendo en puerto 11434');
        notifyProgress('ollama-ready', 'Ollama listo', 50);
        return true;
    }

    console.log('[OLLAMA] Ollama no responde en puerto 11434');

    // Paso 2: Verificar si Ollama esta instalado pero no corriendo
    console.log('[OLLAMA] Verificando si Ollama esta instalado...');
    if (isOllamaInstalled()) {
        console.log('[OLLAMA] Ollama instalado, intentando iniciar...');
        notifyProgress('ollama-start', 'Iniciando Ollama...', 45);

        if (await startOllamaService()) {
            console.log('[OLLAMA] Ollama iniciado correctamente');
            notifyProgress('ollama-ready', 'Ollama iniciado', 50);
            return true;
        }

        console.error('[OLLAMA] No se pudo iniciar Ollama');
    } else {
        console.log('[OLLAMA] Ollama NO esta instalado');
    }

    // Paso 3: Instalar Ollama
    console.log('[OLLAMA] Descargando e instalando Ollama...');
    notifyProgress('ollama-download', 'Descargando Ollama...', 42);

    try {
        if (process.platform === 'win32') {
            console.log('[OLLAMA] Llamando a downloadAndInstallOllamaWindows()...');
            const result = await downloadAndInstallOllamaWindows(notifyProgress);
            console.log('[OLLAMA] Resultado de instalacion:', result);
            return result;
        } else {
            console.error('[OLLAMA] Instalacion automatica no soportada en esta plataforma');
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
    notifyProgress('ollama-download', 'Descargando Ollama...', 42);

    try {
        // Descargar el instalador
        const { downloadFile } = require('./downloadUtils');
        await downloadFile(downloadUrl, installerPath, notifyProgress, 'ollama-download', 42, 50);

        console.log('[OLLAMA] Descarga completada, iniciando instalacion...');
        notifyProgress('ollama-install', 'Instalando Ollama...', 50);

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
    notifyProgress('models-check', 'Verificando modelos de IA...', 55);

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
            const baseProgress = 55 + (modelIndex - 1) * (30 / totalModels);

            // Verificar si el modelo ya esta instalado
            if (!installedModels.includes(modelName.split(':')[0])) {
                console.log(`[OLLAMA-MODELS] Descargando modelo ${model}...`);
                notifyProgress('models-download', `Descargando ${model}... (${modelIndex}/${totalModels})`, baseProgress);

                try {
                    await downloadOllamaModel(model, modelIndex, totalModels, baseProgress, notifyProgress);
                    notifyProgress('models-ready', `Modelo ${model} listo (${modelIndex}/${totalModels})`, baseProgress + 30 / totalModels);
                } catch (pullError) {
                    console.error(`[OLLAMA-MODELS] Error al descargar ${model}:`, pullError);
                    throw pullError;
                }
            } else {
                console.log(`[OLLAMA-MODELS] Modelo ${model} ya instalado`);
            }
        }

        console.log('[OLLAMA-MODELS] Todos los modelos estan listos');
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
    DEFAULT_REQUIRED_MODELS
};
