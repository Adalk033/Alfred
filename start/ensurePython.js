// ensurePython.js - Modulo para manejo de Python
const { app, dialog } = require('electron');
const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// ============================================================================
// VERIFICACION DE PYTHON
// ============================================================================

/**
 * Verificar si Python esta instalado y su version es >= 3.12
 * @returns {Promise<boolean>} true si Python esta instalado con version correcta
 */
async function checkPython() {
    try {
        const version = execSync('python --version', {
            encoding: 'utf8',
            stdio: 'pipe'
        }).trim();
        console.log('[PYTHON] Python detectado:', version);

        // Verificar version >= 3.12
        const match = version.match(/Python (\d+)\.(\d+)/);
        if (match) {
            const major = parseInt(match[1]);
            const minor = parseInt(match[2]);
            if (major >= 3 && minor >= 12) {
                console.log('[PYTHON] Version valida:', `${major}.${minor}`);
                return true;
            } else {
                console.error('[PYTHON] Version muy antigua:', version);
                return false;
            }
        }
        return true;
    } catch (error) {
        console.error('[PYTHON] Python no esta instalado o no esta en PATH');
        return false;
    }
}

/**
 * Encontrar ruta completa del ejecutable de Python
 * @param {string} backendPath - Ruta al directorio backend
 * @param {boolean} isDevelopment - Si esta en modo desarrollo
 * @returns {string} Comando de Python a usar
 */
function findPythonExecutable(backendPath = null, isDevelopment = false) {
    console.log(`[PYTHON] Buscando Python en modo: ${isDevelopment ? 'DESARROLLO' : 'PRODUCCION'}`);

    // MODO PRODUCCION: Usar python-portable incluido
    if (!isDevelopment && backendPath) {
        const pythonPortablePath = path.join(backendPath, 'python-portable', 'python.exe');
        console.log('[PRODUCCION] Verificando Python portable en:', pythonPortablePath);

        if (fs.existsSync(pythonPortablePath)) {
            console.log('[PRODUCCION] Python portable encontrado');
            return pythonPortablePath;
        } else {
            throw new Error('Python portable no encontrado en produccion');
        }
    }

    // MODO DESARROLLO: Usar Python del sistema
    console.log('[DESARROLLO] Buscando Python del sistema...');
    try {
        execSync('python --version', { stdio: 'pipe' });
        console.log('[DESARROLLO] Python del sistema encontrado');
        return 'python';
    } catch {
        throw new Error('Python no encontrado en el sistema');
    }
}

// ============================================================================
// INSTALACION DE PYTHON
// ============================================================================

/**
 * Asegurar que Python este instalado
 * @param {BrowserWindow} mainWindow - Ventana principal para dialogos
 * @param {Function} notifyProgress - Callback para notificar progreso
 * @returns {Promise<boolean>} true si Python esta listo
 */
async function ensurePython(mainWindow, notifyProgress) {
    console.log('[PYTHON] === INICIANDO VERIFICACION DE PYTHON ===');
    notifyProgress('python-check', 'Verificando Python...', 0);

    // Verificar si existe marca de instalacion previa
    const pythonInstalledMarker = path.join(app.getPath('userData'), '.python_installed');

    // Si existe la marca, Python se instalo en sesion anterior
    if (fs.existsSync(pythonInstalledMarker)) {
        console.log('[PYTHON] Detectada marca de instalacion previa');
        notifyProgress('python-verify', 'Verificando Python instalado...', 2);

        try {
            findPythonExecutable(null, true); // Buscar en PATH sistema
            
            // Python encontrado, eliminar marca
            try {
                fs.unlinkSync(pythonInstalledMarker);
                console.log('[PYTHON] Marca eliminada, Python disponible');
            } catch (err) {
                console.error('[PYTHON] Error al eliminar marca:', err);
            }

            notifyProgress('python-ready', 'Python listo', 20);
            return true;

        } catch (findError) {
            // Python aun no disponible, requiere reinicio
            console.log('[PYTHON] Python aun no disponible. Requiere reinicio.');

            // Limpiar marca
            try {
                fs.unlinkSync(pythonInstalledMarker);
            } catch (err) {
                console.error('[PYTHON] Error al eliminar marca:', err);
            }

            // Mostrar dialogo de reinicio
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

    // No hay marca, verificar si Python ya esta instalado
    if (await checkPython()) {
        console.log('[PYTHON] Python ya esta instalado con version correcta');
        notifyProgress('python-ready', 'Python listo', 20);
        return true;
    }

    // Instalar Python segun plataforma
    try {
        if (process.platform === 'win32') {
            return await downloadAndInstallPythonWindows(mainWindow, notifyProgress);
        } else if (process.platform === 'darwin') {
            console.error('[PYTHON] Instalacion automatica no soportada en macOS');
            return false;
        } else {
            console.error('[PYTHON] Instalacion automatica no soportada en esta plataforma');
            return false;
        }
    } catch (installError) {
        console.error('[PYTHON] Error al instalar Python:', installError);
        return false;
    }
}

/**
 * Descargar e instalar Python en Windows
 * @param {BrowserWindow} mainWindow - Ventana principal
 * @param {Function} notifyProgress - Callback para notificar progreso
 * @returns {Promise<boolean>} true si instalacion exitosa
 */
async function downloadAndInstallPythonWindows(mainWindow, notifyProgress) {
    const pythonVersion = '3.12.0';
    const installerName = `python-${pythonVersion}-amd64.exe`;
    const installerPath = path.join(app.getPath('temp'), installerName);
    const downloadUrl = `https://www.python.org/ftp/python/${pythonVersion}/${installerName}`;

    console.log('[PYTHON] Iniciando descarga desde:', downloadUrl);
    notifyProgress('python-download', `Descargando Python ${pythonVersion}...`, 5);

    try {
        // Descargar el instalador
        const { downloadFile } = require('./downloadUtils');
        await downloadFile(downloadUrl, installerPath, notifyProgress, 'python-download', 5, 15);

        notifyProgress('python-install', `Instalando Python ${pythonVersion}...`, 15);
        console.log('[PYTHON] Ejecutando instalador...');

        // Instalar Python de forma silenciosa
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
                windowsHide: true
            });

            installer.stdout.on('data', (data) => {
                console.log(`[PYTHON Installer] ${data.toString().trim()}`);
            });

            installer.stderr.on('data', (data) => {
                console.error(`[PYTHON Installer Error] ${data.toString().trim()}`);
            });

            installer.on('close', (code) => {
                if (code === 0) {
                    console.log('[PYTHON] Instalacion completada exitosamente');
                    resolve();
                } else {
                    reject(new Error(`Instalador termino con codigo ${code}`));
                }
            });

            installer.on('error', (err) => {
                reject(err);
            });
        });

        // Esperar a que el instalador termine completamente
        console.log('[PYTHON] Esperando finalizacion del instalador...');
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Limpiar instalador
        try {
            fs.unlinkSync(installerPath);
            console.log('[PYTHON] Instalador eliminado');
        } catch {
            console.warn('[PYTHON] No se pudo eliminar el instalador');
        }

        console.log('[PYTHON] Instalacion completada');
        await new Promise(resolve => setTimeout(resolve, 4000));

        // Intentar encontrar Python inmediatamente
        try {
            findPythonExecutable(null, true);
            notifyProgress('python-ready', 'Python listo', 20);
            return true;
        } catch (findError) {
            // Python requiere reinicio para actualizar PATH
            console.log('[PYTHON] Requiere reinicio para actualizar PATH');

            // Crear marca de instalacion
            const pythonInstalledMarker = path.join(app.getPath('userData'), '.python_installed');
            try {
                fs.writeFileSync(pythonInstalledMarker, new Date().toISOString());
                console.log('[PYTHON] Marca de instalacion creada');
            } catch (err) {
                console.error('[PYTHON] Error al crear marca:', err);
            }

            // Solicitar reinicio
            if (mainWindow && !mainWindow.isDestroyed()) {
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
                    console.log('[PYTHON] Reiniciando aplicacion...');
                    app.relaunch();
                    app.exit(0);
                } else {
                    console.log('[PYTHON] Usuario cancelo reinicio');
                    app.exit(0);
                }
            } else {
                console.log('[PYTHON] Cerrando para reinicio manual');
                app.exit(0);
            }

            return false;
        }

    } catch (error) {
        console.error('[PYTHON] Error durante descarga/instalacion:', error);
        return false;
    }
}

// ============================================================================
// EXPORTACIONES
// ============================================================================

module.exports = {
    checkPython,
    ensurePython,
    findPythonExecutable,
    downloadAndInstallPythonWindows
};
