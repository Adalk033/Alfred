// backend.js - Modulo para manejo del backend FastAPI
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

// ============================================================================
// VERIFICACION DE BACKEND
// ============================================================================

/**
 * Verificar si el backend esta corriendo
 * @param {string|Object} hostOrConfig - Host del backend o objeto config
 * @param {number} [port] - Puerto del backend (opcional si se pasa config)
 * @returns {Promise<boolean>} true si el backend responde
 */
async function isBackendRunning(hostOrConfig, port) {
    // Manejar ambos casos: llamada con (host, port) o (config)
    let host, backendPort;

    if (typeof hostOrConfig === 'object' && hostOrConfig !== null) {
        // Se paso un objeto config
        host = hostOrConfig.host || '127.0.0.1';
        backendPort = hostOrConfig.port || 8000;
    } else {
        // Se pasaron parametros individuales
        host = hostOrConfig || '127.0.0.1';
        backendPort = port || 8000;
    }

    return new Promise((resolve) => {
        const req = http.request({
            hostname: host,
            port: backendPort,
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

/**
 * Esperar a que el backend este disponible
 * @param {Object} config - Configuracion del backend
 * @param {Function} notifyProgress - Callback para notificar progreso
 * @param {Function} notifyStatus - Callback para notificar estado
 * @param {Function} getBackendProcess - Funcion que retorna el proceso del backend
 * @returns {Promise<boolean>} true si el backend responde
 */
async function waitForBackend(config, notifyProgress, notifyStatus, getBackendProcess) {
    const startTime = Date.now();
    console.log(`[WAIT-BACKEND] Iniciando espera, timeout: ${config.startupTimeout}ms (${Math.round(config.startupTimeout / 1000 / 60)} minutos)`);
    notifyProgress('backend-init', 'Iniciando servidor Alfred...', 85);

    let attemptCount = 0;
    let lastProgressNotification = 0;  // Control para no spamear notificaciones
    const PROGRESS_UPDATE_INTERVAL = 5000;  // Notificar solo cada 5 segundos

    while (Date.now() - startTime < config.startupTimeout) {
        attemptCount++;
        const elapsed = Date.now() - startTime;

        // Verificar si el proceso del backend sigue vivo
        const process = getBackendProcess();
        if (!process || process.exitCode !== null) {
            console.error(`[WAIT-BACKEND] El proceso del backend ha terminado inesperadamente`);
            console.error(`[WAIT-BACKEND] Exit code: ${process?.exitCode}`);
            notifyStatus(false);
            return false;
        }

        if (await isBackendRunning(config.host, config.port)) {
            console.log(`[WAIT-BACKEND] Backend esta disponible despues de ${attemptCount} intentos (${Math.round(elapsed / 1000)}s)`);
            notifyStatus(true);
            // No actualizar aqui, dejar que main.js maneje el 100% final
            return true;
        }

        // Log cada 10 intentos para no spamear
        if (attemptCount % 10 === 0) {
            console.log(`[WAIT-BACKEND] Intento ${attemptCount}, tiempo transcurrido: ${Math.round(elapsed / 1000)}s`);
        }

        await new Promise(resolve => setTimeout(resolve, 1000));

        // Solo actualizar progreso cada 5 segundos, NO decimales
        if (elapsed - lastProgressNotification >= PROGRESS_UPDATE_INTERVAL) {
            lastProgressNotification = elapsed;
            // Usar valores enteros, solo 3 niveles: 85 -> 87 -> 89 -> 90
            let progress = 85;
            if (elapsed > 30000) progress = 87;
            if (elapsed > 60000) progress = 89;
            if (elapsed > 120000) progress = 90;
            notifyProgress('backend-starting', 'Cargando sistema de IA...', progress);
        }
    }

    console.error(`[WAIT-BACKEND] TIMEOUT: Backend no respondio en ${Math.round(config.startupTimeout / 1000)}s`);
    console.error(`[WAIT-BACKEND] Total de intentos: ${attemptCount}`);
    notifyStatus(false);
    return false;
}

// ============================================================================
// GESTION DEL BACKEND
// ============================================================================

/**
 * Iniciar el backend FastAPI
 * @param {Object} config - Configuracion del backend
 * @param {string} pythonPath - Ruta al ejecutable de Python
 * @param {string} userDataPath - Ruta a userData de la app
 * @param {Function} notifyProgress - Callback para notificar progreso
 * @param {Object} processState - Estado compartido del proceso {process, isStartedByElectron}
 * @returns {Promise<boolean>} true si el backend se inicio correctamente
 */
async function startBackend(config, pythonPath, userDataPath, notifyProgress, processState) {
    if (processState.process) {
        console.log('[BACKEND] El backend ya esta iniciado');
        // No notificar aqui, dejar que main.js maneje el progreso
        return true;
    }

    // No notificar aqui tampoco, main.js ya notifico en 80%
    // Solo log para debugging
    console.log('[BACKEND] Iniciando backend...');

    // Verificar directorios y script
    if (!fs.existsSync(config.path)) {
        console.error('[BACKEND] ERROR: No se encontro el directorio del backend:', config.path);
        // No notificar aqui, dejara que main.js maneje el error
        return false;
    }

    const scriptPath = path.join(config.path, 'core', config.script);
    if (!fs.existsSync(scriptPath)) {
        console.error('[BACKEND] ERROR: No se encontro el script del backend:', scriptPath);
        // No notificar aqui
        return false;
    }

    try {
        console.log('[BACKEND] Paso 1/3: Python configurado:', pythonPath);

        // Pequena pausa para asegurar que pip libere recursos
        await new Promise(resolve => setTimeout(resolve, 500));

        console.log('[BACKEND] Paso 2/3: Iniciando servidor FastAPI...');

        // Crear directorio de logs
        const logDir = path.join(userDataPath, 'logs');
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
        const backendLogPath = path.join(logDir, 'backend.log');
        console.log('[BACKEND] Los logs del backend se guardaran en:', backendLogPath);

        // Verificar que el script Python existe y es accesible
        try {
            const scriptContent = fs.readFileSync(scriptPath, 'utf8');
            console.log('[BACKEND] Script Python leido correctamente, tamano:', scriptContent.length, 'bytes');

            if (!scriptContent.includes('fastapi') && !scriptContent.includes('FastAPI')) {
                console.warn('[BACKEND] ADVERTENCIA: El script no parece contener codigo FastAPI');
            }
        } catch (readError) {
            console.error('[BACKEND] ERROR: No se puede leer el script Python:', readError);
            // No notificar aqui
            throw new Error(`No se puede leer ${scriptPath}: ${readError.message}`);
        }

        // Ejecutar backend
        console.log('[BACKEND] Ejecutando comando:', pythonPath, ['-u', scriptPath]);
        console.log('[BACKEND] Working directory:', config.path);

        processState.process = spawn(pythonPath, ['-u', scriptPath], {
            cwd: config.path,
            env: {
                ...process.env,
                PYTHONIOENCODING: 'utf-8',
                PYTHONUNBUFFERED: '1',
                ALFRED_DEV_MODE: '1'
            },
            stdio: ['ignore', 'pipe', 'pipe']
        });

        console.log('[BACKEND] Proceso spawn creado, PID:', processState.process.pid);

        // Configurar logging
        setupBackendLogging(processState.process, backendLogPath, pythonPath, scriptPath, config.path, notifyProgress);

        // Marcar que nosotros iniciamos el backend
        processState.isStartedByElectron = true;

        console.log('[BACKEND] Paso 3/3: Esperando respuesta del backend...');
        return true;

    } catch (error) {
        console.error('[BACKEND] ERROR durante inicio:', error);
        console.error('[BACKEND] Stack:', error.stack);
        // No notificar aqui, dejara que el wrapper maneje el error
        stopBackend(processState);
        return false;
    }
}

/**
 * Configurar logging del backend
 * @param {ChildProcess} process - Proceso del backend
 * @param {string} logPath - Ruta al archivo de log
 * @param {string} pythonPath - Ruta a Python
 * @param {string} scriptPath - Ruta al script
 * @param {string} cwd - Directorio de trabajo
 * @param {Function} notifyProgress - Callback para notificar progreso
 */
function setupBackendLogging(process, logPath, pythonPath, scriptPath, cwd, notifyProgress) {
    const logStream = fs.createWriteStream(logPath, { flags: 'a' });
    logStream.write(`\n\n=== INICIO DEL BACKEND ${new Date().toISOString()} ===\n`);
    logStream.write(`Python: ${pythonPath}\n`);
    logStream.write(`Script: ${scriptPath}\n`);
    logStream.write(`CWD: ${cwd}\n\n`);

    let stdoutBuffer = '';
    let stderrBuffer = '';
    let hasModuleError = false;
    let hasOutput = false;

    // Captura stdout
    process.stdout.on('data', (data) => {
        hasOutput = true;
        const output = data.toString('utf8');
        stdoutBuffer += output;
        logStream.write(`[STDOUT] ${output}`);

        const lines = output.split('\n');
        lines.forEach(line => {
            if (line.trim()) {
                console.log(`[Backend] ${line.trim()}`);
            }
        });
    });

    // Captura stderr
    process.stderr.on('data', (data) => {
        hasOutput = true;
        const error = data.toString('utf8');
        stderrBuffer += error;
        logStream.write(`[STDERR] ${error}`);

        const lines = error.split('\n');
        lines.forEach(line => {
            if (line.trim()) {
                console.error(`[Backend Error] ${line.trim()}`);
            }
        });

        // Detectar errores criticos
        if (error.includes('ModuleNotFoundError') || error.includes('ImportError')) {
            hasModuleError = true;
            console.error('[BACKEND] ERROR CRITICO: Faltan dependencias de Python');
        }

        if (error.includes('Traceback') || error.includes('Error:') || error.includes('Exception')) {
            console.error('[BACKEND] ERROR DETECTADO en stderr');
        }
    });

    // Timeout de inicio
    const outputTimeout = setTimeout(() => {
        if (!hasOutput && process && process.exitCode === null) {
            console.warn('[BACKEND] ADVERTENCIA: No hay output del backend despues de 30 segundos');
            console.warn('[BACKEND] El proceso sigue corriendo pero no muestra logs');
        }
    }, 30000);

    // Manejar cierre del proceso
    process.on('close', (code) => {
        clearTimeout(outputTimeout);
        logStream.write(`\n=== PROCESO FINALIZADO codigo: ${code} ===\n`);
        logStream.end();

        console.log(`[BACKEND] Proceso finalizado con codigo ${code}`);

        if (code !== 0) {
            console.error('[BACKEND] El backend termino con error');
            console.error('[BACKEND] Ultimos logs STDOUT:', stdoutBuffer.split('\n').slice(-10).join('\n'));
            console.error('[BACKEND] Ultimos logs STDERR:', stderrBuffer.split('\n').slice(-10).join('\n'));
            console.error('[BACKEND] Logs completos en:', logPath);

            if (hasModuleError) {
                console.error('[BACKEND] Backend cerrado por dependencias faltantes');
            }
        }
    });

    process.on('error', (err) => {
        clearTimeout(outputTimeout);
        logStream.write(`\n=== ERROR DEL PROCESO: ${err.message} ===\n`);
        logStream.end();

        console.error(`[BACKEND] Error del proceso: ${err.message}`);
        console.error(`[BACKEND] Error completo:`, err);
    });
}

/**
 * Iniciar backend y esperar a que responda
 * @param {Object} config - Configuracion del backend
 * @param {string} pythonPath - Ruta a Python
 * @param {string} userDataPath - Ruta a userData
 * @param {Function} notifyProgress - Callback para progreso
 * @param {Function} notifyStatus - Callback para estado
 * @param {Object} processState - Estado del proceso
 * @param {Function} getBackendProcess - Funcion que retorna el proceso
 * @returns {Promise<boolean>}
 */
async function startBackendAndWait(config, pythonPath, userDataPath, notifyProgress, notifyStatus, processState, getBackendProcess) {
    const started = await startBackend(config, pythonPath, userDataPath, notifyProgress, processState);

    if (!started) {
        console.error('[BACKEND] No se pudo iniciar el backend');
        return false;
    }

    console.log('[BACKEND] Esperando que el backend responda en http://127.0.0.1:8000/health...');
    const ready = await waitForBackend(config, notifyProgress, notifyStatus, getBackendProcess);

    if (!ready) {
        console.error('[BACKEND] ERROR: El backend no respondio a tiempo.');
        console.error('[BACKEND] Timeout:', config.startupTimeout, 'ms');
        stopBackend(processState);
        return false;
    }

    console.log('[BACKEND] Backend iniciado correctamente y respondiendo.');
    return true;
}

/**
 * Detener el backend
 * @param {Object} processState - Estado del proceso {process, isStartedByElectron}
 * @param {Function} notifyStatus - Callback para notificar estado (opcional)
 */
function stopBackend(processState, notifyStatus = null) {
    if (processState.process && processState.isStartedByElectron) {
        console.log('[BACKEND] Deteniendo backend...');

        // Intentar detener gracefully
        processState.process.kill('SIGTERM');

        // Si no se detiene en 5 segundos, forzar
        setTimeout(() => {
            if (processState.process) {
                console.log('[BACKEND] Forzando detencion del backend');
                processState.process.kill('SIGKILL');
            }
        }, 5000);

        processState.process = null;
        processState.isStartedByElectron = false;

        if (notifyStatus) {
            notifyStatus(false);
        }
    }
}

/**
 * Verificar y, si es necesario, iniciar el backend
 * @param {Object} config - Configuracion del backend
 * @param {string} pythonPath - Ruta a Python
 * @param {string} userDataPath - Ruta a userData
 * @param {Function} notifyProgress - Callback para progreso
 * @param {Function} notifyStatus - Callback para estado
 * @param {Object} processState - Estado del proceso
 * @param {BrowserWindow} mainWindow - Ventana principal
 * @param {Object} checkState - Estado del chequeo {isChecking}
 * @returns {Promise<boolean>}
 */
async function checkAndStartBackend(config, pythonPath, userDataPath, notifyProgress, notifyStatus, processState, mainWindow, checkState) {
    // Evitar chequeos simultaneos
    if (checkState.isChecking) {
        console.log('[CHECK-BACKEND] Ya hay un chequeo en progreso...');
        return false;
    }

    checkState.isChecking = true;

    try {
        console.log('[CHECK-BACKEND] Verificando estado del backend...');

        const isRunning = await isBackendRunning(config.host, config.port);

        if (isRunning) {
            console.log('[CHECK-BACKEND] El backend ya esta corriendo');
            notifyStatus(true);

            // Enviar evento backend-ready
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('backend-ready');
            }

            return true;
        }

        console.log('[CHECK-BACKEND] El backend no esta corriendo. Intentando iniciar...');
        return await startBackend(config, pythonPath, userDataPath, notifyProgress, processState);
    } finally {
        checkState.isChecking = false;
    }
}

// ============================================================================
// EXPORTACIONES
// ============================================================================

module.exports = {
    isBackendRunning,
    waitForBackend,
    startBackend,
    startBackendAndWait,
    stopBackend,
    checkAndStartBackend,
    setupBackendLogging
};
