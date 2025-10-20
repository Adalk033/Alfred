// installPackages.js - Modulo para instalacion de paquetes Python
const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// ============================================================================
// CONFIGURACION
// ============================================================================

/**
 * Cargar configuracion de paquetes problematicos
 * @param {string} backendPath - Ruta al directorio backend
 * @returns {Object} Configuracion de paquetes problemat icos
 */
function loadProblematicPackages(backendPath) {
    try {
        const configPath = path.join(backendPath, 'problematic-packages.json');
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            return config;
        }
    } catch (error) {
        console.log('[PACKAGES] No se pudo cargar problematic-packages.json, usando defaults:', error.message);
    }

    // Fallback
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

/**
 * Cargar configuracion de paquetes GPU
 * @param {string} backendPath - Ruta al directorio backend
 * @returns {Object} Configuracion de paquetes GPU
 */
function loadGPUPackages(backendPath) {
    try {
        const configPath = path.join(backendPath, 'gpu-packages.json');
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            console.log('[GPU-PACKAGES] Configuracion cargada');
            return config;
        }
    } catch (error) {
        console.log('[GPU-PACKAGES] No se pudo cargar gpu-packages.json, usando defaults:', error.message);
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

// ============================================================================
// DETECCION DE GPU
// ============================================================================

/**
 * Detectar tipo de GPU disponible
 * @returns {Promise<string>} Tipo de GPU: 'nvidia_cuda', 'apple_mps', o 'cpu'
 */
async function detectGPUType() {
    console.log('[GPU] Detectando hardware GPU...');

    // Verificar NVIDIA
    try {
        if (process.platform === 'win32') {
            execSync('nvidia-smi', { stdio: 'pipe' });
            console.log('[GPU] GPU NVIDIA detectada');
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
                console.log('[GPU] Apple Silicon detectado (M1/M2/M3)');
                return 'apple_mps';
            }
        }
    } catch {
        // No es Apple Silicon
    }

    // TODO: AMD ROCm detection

    console.log('[GPU] No se detecto GPU compatible, usando CPU');
    return 'cpu';
}

// ============================================================================
// INSTALACION DE PAQUETES
// ============================================================================

/**
 * Instalar paquetes GPU/CPU segun hardware
 * @param {string} pythonCmd - Comando Python
 * @param {string} backendPath - Ruta backend
 * @param {Object} gpuConfig - Configuracion GPU
 * @param {string} tempDir - Directorio temporal
 * @param {Function} notifyProgress - Callback progreso
 * @returns {Promise<Array<string>>} Paquetes fallidos
 */
async function installGPUPackages(pythonCmd, backendPath, gpuConfig, tempDir, notifyProgress) {
    const gpuType = await detectGPUType();

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
        console.log('[GPU-INSTALL] No hay paquetes GPU/CPU para instalar');
        return [];
    }

    console.log(`\n[GPU-INSTALL] === Instalando PyTorch para ${label} ===`);
    console.log(`[GPU-INSTALL] Paquetes: ${packagesToInstall.join(', ')}`);
    if (indexUrl) {
        console.log(`[GPU-INSTALL] Index URL: ${indexUrl}`);
    }
    notifyProgress('gpu-install', `Instalando PyTorch (${label})...`, 43);

    let installed = 0;
    let failed = [];
    const total = packagesToInstall.length;

    for (const pkg of packagesToInstall) {
        installed++;
        const progress = 43 + Math.min(2, (installed / total) * 2);
        console.log(`[GPU-INSTALL] ${installed}/${total}: Instalando ${pkg}...`);
        notifyProgress('gpu-install', `Instalando ${pkg}... (${installed}/${total})`, progress);

        try {
            const success = await installSinglePackage(
                pythonCmd,
                pkg,
                backendPath,
                tempDir,
                indexUrl,
                config.retries_per_package,
                config.timeout_per_package_seconds
            );

            if (!success) {
                failed.push(pkg.split('==')[0]);
            }

            await new Promise(resolve => setTimeout(resolve, 1500));

        } catch (error) {
            console.error(`[GPU-INSTALL] Error al instalar ${pkg}:`, error.message);
            failed.push(pkg.split('==')[0]);
        }
    }

    if (failed.length > 0) {
        console.log(`\n[GPU-INSTALL] Paquetes que fallaron (${failed.length}): ${failed.join(', ')}`);
    } else {
        console.log(`[GPU-INSTALL] PyTorch instalado correctamente para ${label}`);
    }

    notifyProgress('gpu-ready', 'PyTorch instalado', 45);
    return failed;
}

/**
 * Instalar paquetes problematicos con estrategia especial
 * @param {string} pythonCmd - Comando Python
 * @param {string} backendPath - Ruta backend
 * @param {Array<string>} problematicPackages - Lista de paquetes
 * @param {Object} installConfig - Configuracion de instalacion
 * @param {string} tempDir - Directorio temporal
 * @param {Function} notifyProgress - Callback progreso
 * @returns {Promise<Array<string>>} Paquetes fallidos
 */
async function installProblematicPackages(pythonCmd, backendPath, problematicPackages, installConfig, tempDir, notifyProgress) {
    const requirementsPath = path.join(backendPath, 'requirements.txt');
    const requirementsContent = fs.readFileSync(requirementsPath, 'utf8');
    const allPackages = requirementsContent
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'));

    // Mapear nombres a especificaciones completas
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

    console.log(`[PROBLEMATIC] Instalando ${total} paquetes con delays de ${delay}ms...`);

    for (const pkgName of problematicPackages) {
        installed++;
        const progress = 38 + Math.min(4, (installed / total) * 4);
        const pkgSpec = packageMap[pkgName.toLowerCase()] || pkgName;

        console.log(`[PROBLEMATIC] ${installed}/${total}: Instalando ${pkgSpec}...`);
        notifyProgress('deps-problematic', `Instalando ${pkgName}... (${installed}/${total})`, progress);

        try {
            const success = await installSinglePackage(
                pythonCmd,
                pkgSpec,
                backendPath,
                tempDir,
                null,
                installConfig.retries_per_package || 5,
                installConfig.timeout_per_package_seconds || 300
            );

            if (!success) {
                failed.push(pkgName);
            }

            console.log(`[PROBLEMATIC] Esperando ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));

        } catch (error) {
            console.error(`[PROBLEMATIC] Error al instalar ${pkgName}:`, error.message);
            failed.push(pkgName);
        }
    }

    if (failed.length > 0) {
        notifyProgress('deps-problematic-failed', 'Error en paquetes problematicos', 42);
        console.log(`\n[PROBLEMATIC] Paquetes fallidos (${failed.length}): ${failed.join(', ')}`);
    } else {
        notifyProgress('deps-problematic-done', 'Paquetes problematicos instalados', 42);
        console.log(`[PROBLEMATIC] Todos instalados correctamente`);
    }

    return failed;
}

/**
 * Instalar paquetes en bloque desde requirements.txt
 * @param {string} pythonCmd - Comando Python
 * @param {string} backendPath - Ruta backend
 * @param {string} requirementsPath - Ruta a requirements.txt
 * @param {Array<string>} packagesToInstall - Paquetes a instalar
 * @param {string} tempDir - Directorio temporal
 * @returns {Promise<Array<string>>} Paquetes fallidos
 */
async function installPackagesInBulk(pythonCmd, backendPath, requirementsPath, packagesToInstall, tempDir) {
    const failedPackages = [];
    const requirementsContent = fs.readFileSync(requirementsPath, 'utf8');
    const allSpecs = requirementsContent
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'));

    // Crear mapa nombre -> especificacion
    const packageMap = {};
    allSpecs.forEach(spec => {
        const nameMatch = spec.match(/^([a-zA-Z0-9_-]+)/);
        if (nameMatch) {
            packageMap[nameMatch[1].toLowerCase()] = spec;
        }
    });

    const specsToInstall = packagesToInstall
        .map(pkg => packageMap[pkg.toLowerCase()] || pkg)
        .filter(spec => spec);

    if (specsToInstall.length === 0) {
        console.log('[BULK-INSTALL] No hay paquetes para instalar en bloque');
        return [];
    }

    console.log(`[BULK-INSTALL] Instalando ${specsToInstall.length} paquetes en bloque...`);

    return new Promise((resolve) => {
        const proc = spawn(pythonCmd, [
            '-m', 'pip', 'install',
            '--prefer-binary',
            '--no-cache-dir',
            '--no-color',
            '--progress-bar', 'off',
            '--disable-pip-version-check',
            '--retries', '3',
            '--timeout', '300',
            ...specsToInstall
        ], {
            cwd: backendPath,
            stdio: 'pipe',
            env: {
                ...process.env,
                PYTHONIOENCODING: 'utf-8',
                PYTHONUNBUFFERED: '1',
                TEMP: tempDir,
                TMP: tempDir
            }
        });

        let output = '';
        let errorOutput = '';

        proc.stdout.on('data', (data) => {
            output += data.toString();
        });

        proc.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });

        proc.on('close', (code) => {
            if (code !== 0) {
                console.error(`[BULK-INSTALL] Instalacion en bloque fallo con codigo ${code}`);

                // Detectar paquetes fallidos del output
                const failedMatches = errorOutput.match(/ERROR:.*?([\w-]+)/g);
                if (failedMatches) {
                    failedMatches.forEach(match => {
                        const pkgMatch = match.match(/([\w-]+)/);
                        if (pkgMatch) failedPackages.push(pkgMatch[1]);
                    });
                }

                // Si no podemos detectar especificos, marcar todos como fallidos
                if (failedPackages.length === 0) {
                    failedPackages.push(...packagesToInstall);
                }
            } else {
                console.log(`[BULK-INSTALL] Instalacion en bloque exitosa`);
            }

            resolve(failedPackages);
        });

        proc.on('error', (err) => {
            console.error(`[BULK-INSTALL] Error de proceso: ${err.message}`);
            failedPackages.push(...packagesToInstall);
            resolve(failedPackages);
        });
    });
}

/**
 * Reintentar paquetes fallidos uno por uno
 * @param {string} pythonCmd - Comando Python
 * @param {string} backendPath - Ruta backend
 * @param {Array<string>} failedPackages - Paquetes fallidos
 * @param {string} tempDir - Directorio temporal
 * @param {Function} notifyProgress - Callback progreso
 * @returns {Promise<Array<string>>} Paquetes que aun fallan
 */
async function retryFailedPackages(pythonCmd, backendPath, failedPackages, tempDir, notifyProgress) {
    const requirementsPath = path.join(backendPath, 'requirements.txt');
    const requirementsContent = fs.readFileSync(requirementsPath, 'utf8');
    const allPackages = requirementsContent
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'));

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
        const progress = 35 + Math.min(5, (retried / failedPackages.length) * 5);
        const pkgSpec = packageMap[pkgName.toLowerCase()] || pkgName;

        console.log(`[RETRY] ${retried}/${failedPackages.length}: Reintentando ${pkgSpec}...`);
        notifyProgress('deps-retry', `Reintentando ${pkgName}... (${retried}/${failedPackages.length})`, progress);

        try {
            const success = await installSinglePackage(
                pythonCmd,
                pkgSpec,
                backendPath,
                tempDir,
                null,
                5,
                300
            );

            if (!success) {
                stillFailed.push(pkgName);
            }

            await new Promise(resolve => setTimeout(resolve, 1000));

        } catch (error) {
            console.error(`[RETRY] Error al reintentar ${pkgName}:`, error.message);
            stillFailed.push(pkgName);
        }
    }

    if (stillFailed.length > 0) {
        console.log(`\n[RETRY] Paquetes que aun fallan (${stillFailed.length}):`);
        stillFailed.forEach(pkg => console.log(`   - ${pkg}`));
    } else {
        console.log(`[RETRY] Todos los paquetes fallidos fueron instalados`);
    }

    notifyProgress('deps-ready', 'Dependencias instaladas', 45);
    return stillFailed;
}

/**
 * Instalar un paquete individual
 * @param {string} pythonCmd - Comando Python
 * @param {string} packageSpec - Especificacion del paquete
 * @param {string} backendPath - Ruta backend
 * @param {string} tempDir - Directorio temporal
 * @param {string} indexUrl - URL del index (opcional)
 * @param {number} retries - Numero de reintentos
 * @param {number} timeout - Timeout en segundos
 * @returns {Promise<boolean>} true si exitoso
 */
function installSinglePackage(pythonCmd, packageSpec, backendPath, tempDir, indexUrl, retries, timeout) {
    return new Promise((resolve) => {
        const args = [
            '-m', 'pip', 'install',
            '--prefer-binary',
            '--no-cache-dir',
            '--no-color',
            '--progress-bar', 'off',
            '--disable-pip-version-check',
            '--retries', String(retries),
            '--timeout', String(timeout)
        ];

        if (indexUrl) {
            args.push('--index-url', indexUrl);
        }

        args.push(packageSpec);

        const proc = spawn(pythonCmd, args, {
            cwd: backendPath,
            stdio: 'pipe',
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
        });

        proc.stderr.on('data', (data) => {
            errorOut += data.toString();
        });

        proc.on('close', (code) => {
            if (code === 0) {
                console.log(`${packageSpec} instalado`);
                resolve(true);
            } else {
                console.error(`${packageSpec} fallo: ${errorOut.substring(0, 150)}`);
                resolve(false);
            }
        });

        proc.on('error', () => {
            resolve(false);
        });
    });
}

/**
 * Cerrar procesos de Python bloqueantes (solo Windows)
 * @returns {Promise<void>}
 */
async function killPythonProcesses() {
    if (process.platform !== 'win32') return;

    try {
        console.log('[KILL-PYTHON] Cerrando procesos de Python bloqueantes...');
        execSync('taskkill /F /IM python.exe /T', { stdio: 'ignore' });
        await new Promise(resolve => setTimeout(resolve, 2000));
        console.log('[KILL-PYTHON] Procesos cerrados');
    } catch (error) {
        console.log('[KILL-PYTHON] No habia procesos Python para cerrar');
    }
}

// ============================================================================
// EXPORTACIONES
// ============================================================================

module.exports = {
    loadProblematicPackages,
    loadGPUPackages,
    detectGPUType,
    installGPUPackages,
    installProblematicPackages,
    installPackagesInBulk,
    retryFailedPackages,
    installSinglePackage,
    killPythonProcesses
};
