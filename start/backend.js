// backend.js - Modulo para manejo del backend FastAPI
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

// NOTAS sobre ALFRED_DEV_MODE:
// - DESARROLLO (npm run dev o durante tests): ALFRED_DEV_MODE=1
//   Datos se guardan en ./data, ./db, ./logs, ./chroma_db (carpetas en raiz del proyecto)
// - PRODUCCION (app.isPackaged): ALFRED_DEV_MODE=0
//   Datos se guardan en %AppData%\Alfred\ (AppData del usuario)

// ============================================================================
// VERIFICACION DE BACKEND
// ============================================================================

/**
 * Verificar si el backend esta completamente inicializado (lifespan ready)
 * @param {string|Object} hostOrConfig - Host del backend o objeto config
 * @param {number} [port] - Puerto del backend (opcional si se pasa config)
 * @returns {Promise<boolean>} true si el backend esta completamente listo
 */
async function isBackendFullyInitialized(hostOrConfig, port) {
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
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const health = JSON.parse(data);
                    // Retornar true SOLO si el backend esta completamente listo
                    resolve(health.is_fully_initialized === true);
                } catch (e) {
                    resolve(false);
                }
            });
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
    
    let httpReachable = false;  // Flag para saber si HTTP esta accesible

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

        // FASE 1: Esperar que HTTP este accesible
        if (!httpReachable) {
            if (await isBackendRunning(config.host, config.port)) {
                console.log(`[WAIT-BACKEND] FASE 1 OK: Backend HTTP accesible (intento ${attemptCount}, ${Math.round(elapsed / 1000)}s)`);
                httpReachable = true;
            }
        }
        
        // FASE 2: Esperar que initialize_async() este completo (is_fully_initialized = true)
        if (httpReachable) {
            if (await isBackendFullyInitialized(config.host, config.port)) {
                console.log(`[WAIT-BACKEND] FASE 2 OK: Backend completamente inicializado (intento ${attemptCount}, ${Math.round(elapsed / 1000)}s)`);
                console.log(`[WAIT-BACKEND] Backend esta listo para procesar consultas`);
                notifyStatus(true);
                // No actualizar aqui, dejar que main.js maneje el 100% final
                return true;
            } else {
                if (attemptCount % 10 === 0) {
                    console.log(`[WAIT-BACKEND] Esperando inicializacion completa... (intento ${attemptCount}, ${Math.round(elapsed / 1000)}s)`);
                }
            }
        } else {
            // Log cada 10 intentos mientras esperamos HTTP
            if (attemptCount % 10 === 0) {
                console.log(`[WAIT-BACKEND] Esperando que HTTP este accesible (intento ${attemptCount}, ${Math.round(elapsed / 1000)}s)`);
            }
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
            
            const phase = httpReachable ? 'Inicializando sistema' : 'Cargando servidor';
            notifyProgress('backend-starting', `${phase}...`, progress);
        }
    }

    console.error(`[WAIT-BACKEND] TIMEOUT: Backend no respondio en ${Math.round(config.startupTimeout / 1000)}s`);
    console.error(`[WAIT-BACKEND] Total de intentos: ${attemptCount}`);
    console.error(`[WAIT-BACKEND] Estado: HTTP accesible=${httpReachable}`);
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
    // Log detallado para debugging
    console.log('[BACKEND] startBackend() llamado');
    console.log('[BACKEND] processState.process existe:', !!processState.process);
    console.log('[BACKEND] processState.process PID:', processState.process?.pid);
    console.log('[BACKEND] processState.process exitCode:', processState.process?.exitCode);
    
    if (processState.process && processState.process.exitCode === null) {
        console.log('[BACKEND] El backend ya esta iniciado y corriendo, PID:', processState.process.pid);
        // No notificar aqui, dejar que main.js maneje el progreso
        return true;
    }
    
    // Si el proceso anterior termino, limpiarlo
    if (processState.process && processState.process.exitCode !== null) {
        console.log('[BACKEND] Proceso anterior termino con exitCode:', processState.process.exitCode);
        processState.process = null;
        processState.isStartedByElectron = false;
    }

    // No notificar aqui tampoco, main.js ya notifico en 80%
    // Solo log para debugging
    console.log('[BACKEND] Iniciando nuevo proceso de backend...');

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
        console.log('[BACKEND] ===== SPAWNING PROCESO PYTHON =====');
        console.log('[BACKEND] Comando:', pythonPath, ['-u', scriptPath]);
        console.log('[BACKEND] Working directory:', config.path);
        console.log('[BACKEND] Timestamp:', new Date().toISOString());

        // Determinar modo: DESARROLLO = 1 (siempre en Electron), PRODUCCION = 0 (cuando está empaquetada)
        const devMode = app && app.isPackaged ? '0' : '1';
        console.log(`[BACKEND] Modo: ${devMode === '1' ? 'DESARROLLO' : 'PRODUCCION'}`);

        processState.process = spawn(pythonPath, ['-u', scriptPath], {
            cwd: config.path,
            env: {
                ...process.env,
                PYTHONIOENCODING: 'utf-8',
                PYTHONUNBUFFERED: '1',
                ALFRED_DEV_MODE: devMode
            },
            stdio: ['ignore', 'pipe', 'pipe']
        });

        console.log('[BACKEND] Proceso spawn creado, PID:', processState.process.pid);

        // Configurar logging (pasar processState para reinicio automatico)
        setupBackendLogging(processState.process, backendLogPath, pythonPath, scriptPath, config.path, notifyProgress, processState);

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
 * @param {Object} processState - Estado del proceso (para reinicio automatico)
 */
function setupBackendLogging(process, logPath, pythonPath, scriptPath, cwd, notifyProgress, processState) {
    const logStream = fs.createWriteStream(logPath, { flags: 'a' });
    logStream.write(`\n\n=== INICIO DEL BACKEND ${new Date().toISOString()} ===\n`);
    logStream.write(`Python: ${pythonPath}\n`);
    logStream.write(`Script: ${scriptPath}\n`);
    logStream.write(`CWD: ${cwd}\n\n`);

    let stdoutBuffer = '';
    let stderrBuffer = '';
    let hasModuleError = false;
    let hasOutput = false;
    
    // Inicializar contador de reintentos si no existe
    if (!processState.autoRepairRetries) {
        processState.autoRepairRetries = 0;
    }

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
        
        console.log(`[BACKEND] Proceso finalizado con codigo ${code}`);

        // Codigo 3 = Auto-reparacion aplicada, reiniciar automaticamente
        if (code === 3) {
            // Verificar limite de reintentos (maximo 2 intentos)
            processState.autoRepairRetries = (processState.autoRepairRetries || 0) + 1;
            
            if (processState.autoRepairRetries > 2) {
                console.error('[BACKEND] Auto-reparacion fallo despues de 2 intentos. Abortando reinicio automatico.');
                logStream.write(`\n=== AUTO-REPARACION FALLO DESPUES DE ${processState.autoRepairRetries - 1} INTENTOS ===\n`);
                logStream.write(`No se puede reiniciar automaticamente. El usuario debe reiniciar manualmente.\n`);
                logStream.end();
                
                if (notifyProgress) {
                    notifyProgress('backend-auto-repair-failed', 'Error: Auto-reparacion fallo. Por favor reinicie la aplicacion.', 0);
                }
                
                return; // No procesar como error ni reintentar
            }
            
            console.log(`[BACKEND] Auto-reparacion completada. Reiniciando backend automaticamente... (intento ${processState.autoRepairRetries}/2)`);
            
            // Escribir ANTES de cerrar el stream
            logStream.write(`\n=== PROCESO FINALIZADO codigo: ${code} (AUTO-REPARACION) ===\n`);
            logStream.write(`Auto-reparacion detectada, reiniciando...\n`);
            logStream.end();
            
            // Limpiar estado del proceso actual
            if (processState) {
                processState.process = null;
                processState.isStartedByElectron = false;
            }
            
            // Esperar 2 segundos antes de reiniciar
            setTimeout(async () => {
                console.log('[BACKEND] Iniciando backend despues de auto-reparacion...');
                if (notifyProgress) {
                    notifyProgress('backend-auto-repair', 'Reiniciando backend despues de reparacion automatica...', 85);
                }
                
                // Configuracion para el reinicio
                const restartConfig = {
                    path: cwd,
                    port: 8000,
                    host: '127.0.0.1',
                    startupTimeout: 30000
                };
                
                // Reiniciar el backend
                const started = await startBackend(
                    restartConfig,
                    pythonPath,
                    require('electron').app.getPath('userData'),
                    notifyProgress,
                    processState
                );
                
                if (started) {
                    console.log('[BACKEND] Proceso reiniciado, esperando que responda...');
                    
                    // Esperar que el backend este listo (sin notifyStatus porque no esta disponible en este scope)
                    const ready = await waitForBackend(
                        restartConfig,
                        notifyProgress,
                        (status) => { console.log('[BACKEND] Estado del backend:', status); },
                        () => processState.process
                    );
                    
                    if (ready) {
                        console.log('[BACKEND] Backend reiniciado exitosamente despues de auto-reparacion');
                        // Resetear contador de reintentos porque el reinicio fue exitoso
                        processState.autoRepairRetries = 0;
                        if (notifyProgress) {
                            notifyProgress('backend-ready', 'Backend reiniciado y listo', 100);
                        }
                    } else {
                        console.error('[BACKEND] Backend reiniciado pero no respondio a tiempo');
                    }
                } else {
                    console.error('[BACKEND] Error al reiniciar backend despues de auto-reparacion');
                }
            }, 2000);
            
            return; // No procesar como error
        }

        // Cerrar el stream normalmente para otros casos
        logStream.write(`\n=== PROCESO FINALIZADO codigo: ${code} ===\n`);
        logStream.end();

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
        
        // Solo escribir si el stream no esta cerrado
        if (!logStream.closed && !logStream.destroyed) {
            logStream.write(`\n=== ERROR DEL PROCESO: ${err.message} ===\n`);
            logStream.end();
        }

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
    // Resetear contador de auto-reparacion cuando inicia correctamente
    processState.autoRepairRetries = 0;
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
    isBackendFullyInitialized,
    waitForBackend,
    startBackend,
    startBackendAndWait,
    stopBackend,
    checkAndStartBackend,
    setupBackendLogging
};
