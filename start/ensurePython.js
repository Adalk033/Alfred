const { app, dialog } = require('electron');
const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Importar modulo de instalacion de paquetes
const packagesModule = require('./installPackages');
const {
    installPackagesInBulk,
    installProblematicPackages,
    installGPUPackages,
    verifyPyTorchInstallation,
    retryFailedPackages,
    killPythonProcesses,
    loadProblematicPackages,
    loadGPUPackages
} = packagesModule;

// ============================================================================
// CACHÉ DE VERIFICACION (evita reinicializar multiples veces en la misma sesion)
// ============================================================================

let envCached = null; // Almacena el resultado de ensurePythonEnv para esta sesion

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
    // MODO PRODUCCION: Usar python-portable incluido
    if (!isDevelopment && backendPath) {
        const pythonPortablePath = path.join(backendPath, 'python-portable', 'python.exe');
        if (fs.existsSync(pythonPortablePath)) { return pythonPortablePath; }
        else { throw new Error('Python portable no encontrado en produccion'); }
    }

    // MODO DESARROLLO: Usar Python del sistema
    try {
        execSync('python --version', { stdio: 'pipe' });
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
    notifyProgress('python-check', 'Verificando Python...', 5);

    // Verificar si existe marca de instalacion previa
    const pythonInstalledMarker = path.join(app.getPath('userData'), '.python_installed');

    // Si existe la marca, Python se instalo en sesion anterior
    if (fs.existsSync(pythonInstalledMarker)) {
        notifyProgress('python-verify', 'Verificando Python instalado...', 7);

        try {
            findPythonExecutable(null, true); // Buscar en PATH sistema
            // Python encontrado, eliminar marca
            fs.unlinkSync(pythonInstalledMarker);
            // No actualizar aqui, main.js maneja los porcentajes finales
            return true;
        } catch (findError) {
            // Python aun no disponible, requiere reinicio
            console.log('[PYTHON] Python aun no disponible. Requiere reinicio.');
            // Limpiar marca
            fs.unlinkSync(pythonInstalledMarker);

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
        // No actualizar aqui, main.js maneja los porcentajes finales
        return true;
    }

    // Instalar Python segun plataforma
    try {
        if (process.platform === 'win32') {
            return await downloadAndInstallPythonWindows(mainWindow, notifyProgress);
        }
        else if (process.platform === 'darwin') { // macOS
            console.error('[PYTHON] Instalacion automatica no soportada en macOS');
            return false;
        }
        else {// Linux u otras plataformas
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
    notifyProgress('python-download', `Descargando Python ${pythonVersion}...`, 8);

    try {
        // Descargar el instalador (8-12% del total del progreso de Python)
        const { downloadFile } = require('./downloadUtils');
        await downloadFile(downloadUrl, installerPath, notifyProgress, 'python-download', 8, 12);

        notifyProgress('python-install', `Instalando Python ${pythonVersion}...`, 13);
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
// UTILIDADES
// ============================================================================

/**
 * Obtener directorio temporal seguro segun modo (produccion/desarrollo)
 * @param {string} backendPath - Ruta al directorio backend
 * @param {boolean} isPackaged - Si la app esta empaquetada
 * @returns {string} Ruta al directorio temporal
 */
function getSafeTempDir(backendPath, isPackaged) {
    // En produccion (empaquetada), usar AppData del usuario
    // En desarrollo, usar carpeta temp en backend
    if (isPackaged) {
        const userDataPath = app.getPath('userData');
        const tempDir = path.join(userDataPath, 'temp');

        // Crear si no existe
        if (!fs.existsSync(tempDir)) { fs.mkdirSync(tempDir, { recursive: true }); }
        return tempDir;
    }
    else {
        // Modo desarrollo: usar temp en backend
        const tempDir = path.join(backendPath, 'temp');
        if (!fs.existsSync(tempDir)) { fs.mkdirSync(tempDir, { recursive: true }); }
        return tempDir;
    }
}

// ============================================================================
// ENTORNO PYTHON (VENV O PORTABLE)
// ============================================================================

/**
 * Verificar dependencias instaladas y comparar con requerimientos
 * Logica comun para produccion y desarrollo
 * @param {string} installedPkgs - Output de pip freeze (ya en lowercase)
 * @param {string} requirementsPath - Ruta al archivo requirements.txt
 * @param {Function} notifyProgress - Callback para notificar progreso
 * @returns {Object} { reqPkgNames, missing, normalizedInstalledPkgs }
 */
function checkInstalledDependencies(installedPkgs, requirementsPath, notifyProgress) {
    const reqs = fs.readFileSync(requirementsPath, "utf8")
        .split("\n")
        .filter(line => line.trim() && !line.trim().startsWith('#'))
        .map(line => line.trim());

    // Extraer nombres de paquetes y normalizarlos (convertir guiones y puntos a guiones bajos)
    const reqPkgNames = reqs.map(r => {
        const match = r.match(/^([a-zA-Z0-9\-_.]+)/);
        return match ? match[1].toLowerCase().replace(/-/g, '_').replace(/\./g, '_') : null;
    }).filter(Boolean);

    const normalizedInstalledPkgs = installedPkgs
        .split('\n')
        .map(line => {
            // Reemplazar guiones y puntos en el nombre del paquete (antes del ==)
            return line.replace(/^([a-z0-9._-]+)/gm, (match) => {
                return match.replace(/-/g, '_').replace(/\./g, '_');
            });
        })
        .join('\n');

    // Verificar si hay paquetes faltantes
    const missing = reqPkgNames.filter(pkg => {
        const searchName = pkg;
        const pattern = new RegExp(`^${searchName}==`, 'm');
        const found = pattern.test(normalizedInstalledPkgs);
        if (found) { return false; }

        // Busqueda alternativa para meta-paquetes (ej: unstructured)
        const componentPattern = new RegExp(`^${searchName}_[a-z]+==`, 'm');
        const foundComponent = componentPattern.test(normalizedInstalledPkgs);

        if (foundComponent) { return false; }
        return true;
    });

    return { reqPkgNames, missing, normalizedInstalledPkgs };
}

/**
 * Instalar o verificar dependencias Python
 * Logica comun para produccion y desarrollo
 * @param {string} pythonCmd - Comando/ruta de Python a usar
 * @param {string} backendPath - Ruta al directorio backend
 * @param {string} requirementsPath - Ruta al archivo requirements.txt
 * @param {Array} missing - Array de paquetes faltantes
 * @param {boolean} isPackaged - Si la app esta empaquetada
 * @param {Function} notifyProgress - Callback para notificar progreso
 * @returns {Promise<void>}
 */
async function installOrVerifyDependencies(pythonCmd, backendPath, requirementsPath, missing, isPackaged, notifyProgress) {
    if (missing.length > 0) {
        console.log(`\n========================================================`);
        console.log(`  INSTALANDO ${missing.length} DEPENDENCIAS FALTANTES`);
        console.log(`========================================================`);
        console.log(`Paquetes a instalar: ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? '...' : ''}`);
        console.log('[deps-install] Instalando dependencias de Python...');

        // Cerrar cualquier proceso de Python que pueda estar bloqueando archivos
        const venvPath = path.join(backendPath, "venv");
        await killPythonProcesses(venvPath);

        // Pequeña pausa para asegurar que no hay procesos bloqueantes
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Separar paquetes estables de problematicos
        const problematicConfig = loadProblematicPackages(backendPath);
        const problematicSet = new Set(problematicConfig.problematic_packages.map(p => p.toLowerCase()));

        const stablePackages = missing.filter(pkg => !problematicSet.has(pkg.toLowerCase()));
        const problematicPackages = missing.filter(pkg => problematicSet.has(pkg.toLowerCase()));

        // FASE 1: Instalar paquetes estables en bloque
        let failedStable = [];
        if (stablePackages.length > 0) {
            console.log('\n=== FASE 1: Instalando paquetes estables en bloque ===');
            console.log(`[deps-stable] Instalando ${stablePackages.length} paquetes estables...`);
            const tempDir = getSafeTempDir(backendPath, isPackaged);
            failedStable = await installPackagesInBulk(pythonCmd, backendPath, requirementsPath, stablePackages, tempDir);
        }

        // FASE 2: Instalar paquetes problematicos uno por uno
        let failedProblematic = [];
        if (problematicPackages.length > 0) {
            console.log('\n=== FASE 2: Instalando paquetes problematicos uno por uno ===');
            console.log('[deps-problematic] Instalando paquetes problematicos...');
            const tempDir = getSafeTempDir(backendPath, isPackaged);
            failedProblematic = await installProblematicPackages(
                pythonCmd,
                backendPath,
                problematicPackages,
                problematicConfig.install_config,
                tempDir,
                notifyProgress
            );
        }

        // FASE 3: Instalar paquetes GPU/CPU segun hardware
        console.log('\n=== FASE 3: Instalando PyTorch (GPU/CPU) ===');
        const gpuConfig = loadGPUPackages(backendPath);
        const tempDir = getSafeTempDir(backendPath, isPackaged);
        const failedGPU = await installGPUPackages(pythonCmd, backendPath, gpuConfig, tempDir, notifyProgress);

        // FASE 4: Reintentar todos los fallidos
        const allFailed = [...failedStable, ...failedProblematic, ...failedGPU];
        if (allFailed.length > 0) {
            console.log(`\n=== FASE 4: Reintentando ${allFailed.length} paquetes fallidos ===`);
            console.log(`[deps-retry] Reintentando ${allFailed.length} paquetes...`);
            const tempDir = getSafeTempDir(backendPath, isPackaged);
            await retryFailedPackages(pythonCmd, backendPath, allFailed, tempDir, notifyProgress);
        } else {
            console.log('[deps-ready] Dependencias instaladas');
        }

        // Limpiar directorio temporal DESPUES de todos los reintentos
        console.log('Limpiando directorio temporal...');
        await new Promise(resolve => setTimeout(resolve, 3000)); // Esperar que pip libere archivos

        try {
            const tempDir = getSafeTempDir(backendPath, isPackaged);
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
        // No actualizar aqui, main.js maneja el porcentaje final

        // Verificar si PyTorch ya esta instalado y funciona
        console.log('Verificando instalacion de PyTorch...');
        const pyTorchInstalled = await verifyPyTorchInstallation(pythonCmd);

        if (pyTorchInstalled) {
            console.log('[GPU-VERIFY] PyTorch ya esta correctamente instalado, no requiere reinstalacion');
            // No actualizar aqui, main.js maneja el porcentaje final
        } else {
            console.log('[GPU-VERIFY] PyTorch no esta disponible, intentando instalar...');
            const tempDir = getSafeTempDir(backendPath, isPackaged);
            const gpuConfig = loadGPUPackages(backendPath);

            try {
                await installGPUPackages(pythonCmd, backendPath, gpuConfig, tempDir, notifyProgress);
            }
            catch (error) {
                console.error('Error al instalar PyTorch:', error.message);
                // No actualizar aqui, dejar que main.js maneje errores
            }
        }
    }
}

/**
 * Asegurar que el entorno Python este listo (venv en desarrollo, portable en produccion)
 * NOTA: Esta funcion usa caché interna para evitar reinicializaciones multiples en la misma sesion
 * @param {string} backendPath - Ruta al directorio backend
 * @param {boolean} isPackaged - Si la app esta empaquetada
 * @param {Function} notifyProgress - Callback para notificar progreso
 * @param {number} retryCount - Numero de reintentos (usado internamente)
 * @returns {Promise<string>} Comando de Python a usar
 */
async function ensurePythonEnv(backendPath, isPackaged, notifyProgress, retryCount = 0) {
    // Si ya se verificó el entorno en esta sesion, devolver el resultado en cache
    if (envCached !== null && retryCount === 0) {
        console.log('[ENV-CACHE] Reutilizando entorno Python verificado previamente:', envCached);
        return envCached;
    }

    const venvPath = path.join(backendPath, "venv");
    const requirementsPath = path.join(backendPath, "requirements.txt");
    const portablePythonPath = path.join(backendPath, "python-portable", "python.exe");
    const MAX_RETRIES = 2;

    // Detectar modo: Si app esta empaquetada -> PRODUCCION (usa python-portable)
    //                Si NO esta empaquetada -> DESARROLLO (usa Python del sistema)
    const isDevelopment = !isPackaged;
    // No notificar aqui, main.js maneja el progreso 70-75%
    console.log(`[ENV] MODO ${isDevelopment ? 'DESARROLLO' : 'PRODUCCION'} detectado (retry ${retryCount})`);
    try {
        // MODO PRODUCCION: Usar Python portable con paquetes pre-instalados
        if (!isDevelopment) {

            // Si existe python-portable/, usar directamente
            if (fs.existsSync(portablePythonPath)) {
                console.log('[portable-ready] Usando Python portable optimizado...');
                // Verificar que funciona
                try {
                    execSync(`"${portablePythonPath}" --version`, {
                        encoding: 'utf8',
                        stdio: 'pipe'
                    });
                    // No actualizar aqui, main.js maneja el porcentaje final
                } catch (error) {
                    console.log('[portable-error] Error con Python portable, reintentando...');
                    throw new Error(`Python portable no funciona: ${error.message}`);
                }

                // Verificar pip en Python portable
                try {
                    execSync(`"${portablePythonPath}" -m pip --version`, {
                        encoding: 'utf8',
                        stdio: 'pipe'
                    });
                } catch (pipError) {
                    execSync(`"${portablePythonPath}" -m ensurepip --upgrade`, {
                        encoding: 'utf8',
                        stdio: 'inherit'
                    });
                }

                // Verificar dependencias instaladas en Python portable
                // No notificar aqui, main.js maneja 70-75%
                console.log('[ENV] Verificando dependencias de Python...');

                let installedPkgs = '';
                try {
                    installedPkgs = execSync(`"${portablePythonPath}" -m pip freeze`, {
                        encoding: "utf8",
                        stdio: 'pipe'
                    }).toLowerCase();
                }
                catch (err) {
                    console.error('[ENV] Error al listar dependencias:', err.message);
                }

                // Usar funcion comun para verificar dependencias
                const { missing } = checkInstalledDependencies(installedPkgs, requirementsPath, notifyProgress);

                console.log(`[ENV] Dependencias faltantes: ${missing.length}`);

                // Usar funcion comun para instalar o verificar dependencias si hay faltantes
                if (missing.length > 0) {
                    console.log('[ENV] Instalando dependencias...');
                    await installOrVerifyDependencies(portablePythonPath, backendPath, requirementsPath, missing, isPackaged, notifyProgress);
                }

                // No actualizar aqui, main.js maneja el porcentaje final
                // Guardar en caché antes de devolver
                envCached = portablePythonPath;
                return portablePythonPath;
            }
            else {
                // Listar contenido del backend para diagnostico
                if (fs.existsSync(backendPath)) {
                    try {
                        const files = fs.readdirSync(backendPath);
                        files.forEach(file => console.error(`  - ${file}`));
                    } catch (e) {
                        notifyProgress('dir-error', `No se pudo listar directorio del backend: ${e.message}`, 50);
                        throw new Error(`No se pudo listar directorio del backend: ${e.message}`);
                    }
                }
            }
        } else {
            console.log('========================================================');
            console.log('  MODO DESARROLLO: Usando venv tradicional');
            console.log('========================================================');

            // Detectar rutas del binario Python para venv
            const pythonCmd = process.platform === "win32"
                ? path.join(venvPath, "Scripts", "python.exe")
                : path.join(venvPath, "bin", "python");

            // Encontrar Python base instalado DEL SISTEMA (portable no tiene venv)
            const basePython = findPythonExecutable(backendPath, isDevelopment);
            console.log('[ENV] Configurando entorno de desarrollo...');
            // No notificar aqui, main.js maneja progreso 70-75%

            // Verificar si el venv existe y está corrupto
            if (fs.existsSync(venvPath)) {
                console.log('[ENV] Verificando entorno virtual...');
                // No notificar aqui

                // Intentar ejecutar python del venv para verificar si funciona
                try {
                    execSync(`"${basePython}" --version`, {
                        encoding: 'utf8',
                        stdio: 'pipe',
                        timeout: 5000
                    });
                    console.log("[ENV] Entorno virtual existente funciona correctamente");
                } catch (venvError) {
                    console.log("[ENV] Entorno virtual corrupto detectado. Eliminando...");
                    // No notificar aqui, main.js maneja progreso
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
                console.log('[venv-create] Creando entorno virtual...');

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

            // Verificar y actualizar pip
            try {
                const pipVersion = execSync(`"${pythonCmd}" -m pip --version`, {
                    encoding: 'utf8',
                    stdio: 'pipe'
                });
                console.log('pip actual:', pipVersion.trim());
                // Validar si pip es version 25.2 o superior
                const versionMatch = pipVersion.match(/pip (\d+)\.(\d+)\.(\d+)/);
                if (versionMatch) {
                    const major = parseInt(versionMatch[1], 10);
                    const minor = parseInt(versionMatch[2], 10);
                    const patch = parseInt(versionMatch[3], 10);
                    if (major < 25 || (major === 25 && minor < 2)) {
                        console.log("pip es muy antiguo, se actualizara a 25.2+");
                        console.log('[pip-upgrade] Actualizando gestor de paquetes (pip)...');
                        execSync(`"${pythonCmd}" -m pip install --upgrade pip`, {
                            cwd: backendPath,
                            encoding: 'utf8',
                            stdio: 'pipe',
                            timeout: 80000  // 80 segundos timeout
                        });
                    } else {
                        console.log("pip esta actualizado (>= 25.2)");
                    }
                }
            } catch (pipError) {
                console.log("Error al verificar/actualizar pip:", pipError.message);
                console.log("Instalando pip...");
                console.log('[pip-install] Instalando pip...');
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
            console.log('[deps-check] Verificando dependencias de Python...');
            const installedPkgs = execSync(`"${pythonCmd}" -m pip freeze`, {
                encoding: "utf8",
                stdio: 'pipe'
            }).toLowerCase();

            // Usar funcion comun para verificar dependencias
            const { missing } = checkInstalledDependencies(installedPkgs, requirementsPath, notifyProgress);
            await installOrVerifyDependencies(pythonCmd, backendPath, requirementsPath, missing, isPackaged, notifyProgress);
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
                        console.log(`${check.package} OK`);
                    } catch (importError) {
                        console.error(`ERROR: ${check.package} no se puede importar como '${check.module}'`);
                        failedChecks.push(check);
                    }
                }

                // Si hay paquetes que fallan, intentar reinstalarlos
                if (failedChecks.length > 0) {
                    console.log(`\nDetectadas ${failedChecks.length} instalaciones corruptas. Reparando...`);
                    console.log(`[deps-repair] Reparando ${failedChecks.length} paquetes corruptos...`);

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
                            console.log(`${check.package} reparado exitosamente`);
                        } catch (repairError) {
                            console.error(`Error al reparar ${check.package}:`, repairError.message);
                            throw new Error(`No se pudo reparar ${check.package}`);
                        }
                    }

                    // Verificar nuevamente despues de reparar
                    for (const check of failedChecks) {
                        execSync(`"${pythonCmd}" -c "import ${check.module}"`, {
                            encoding: 'utf8',
                            stdio: 'pipe',
                            cwd: backendPath
                        });
                        console.log(`${check.package} verificado OK`);
                    }
                }
            } catch (verifyError) {
                console.error('ERROR CRITICO: Dependencias no instaladas correctamente');
                throw verifyError;
            }

            console.log(`Entorno Python listo en: ${pythonCmd}`);
            // Guardar en caché antes de devolver
            envCached = pythonCmd;
            return pythonCmd;
        } // Fin del bloque else (MODO DESARROLLO)
    }
    catch (err) {
        console.error("Error en ensurePythonEnv:", err);

        // Si el error es por archivos bloqueados y no hemos alcanzado el límite de reintentos
        if (err.message === 'VENV_LOCKED' && retryCount < MAX_RETRIES) {
            console.log(`Intento ${retryCount + 1}/${MAX_RETRIES}: Limpiando entorno virtual bloqueado...`);
            console.log('[venv-cleanup] Limpiando entorno virtual bloqueado...');

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
                return await ensurePythonEnv(backendPath, isPackaged, notifyProgress, retryCount + 1);

            } catch (cleanupError) {
                console.error('Error al limpiar entorno virtual:', cleanupError);
                throw new Error(`No se pudo limpiar el entorno virtual: ${cleanupError.message}`);
            }
        }

        throw err;
    }
}

// ============================================================================
// EXPORTACIONES
// ============================================================================

module.exports = {
    checkPython,
    ensurePython,
    findPythonExecutable,
    downloadAndInstallPythonWindows,
    getSafeTempDir,
    ensurePythonEnv,
    checkInstalledDependencies,
    installOrVerifyDependencies
};