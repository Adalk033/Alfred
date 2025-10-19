// downloadUtils.js - Utilidades para descargas
const https = require('https');
const fs = require('fs');

/**
 * Descargar archivo con soporte para redirecciones y progreso
 * @param {string} url - URL del archivo a descargar
 * @param {string} destPath - Ruta de destino
 * @param {Function} notifyProgress - Callback para notificar progreso
 * @param {string} stage - Etapa de instalacion
 * @param {number} progressStart - Progreso inicial (0-100)
 * @param {number} progressEnd - Progreso final (0-100)
 * @param {number} maxRedirects - Maximo numero de redirecciones
 * @returns {Promise<void>}
 */
function downloadFile(url, destPath, notifyProgress = null, stage = 'download', progressStart = 0, progressEnd = 100, maxRedirects = 6) {
    return new Promise((resolve, reject) => {
        if (maxRedirects <= 0) {
            reject(new Error('Demasiadas redirecciones'));
            return;
        }

        const file = fs.createWriteStream(destPath);
        
        https.get(url, (response) => {
            // Manejar redirecciones HTTP (301, 302, 303, 307, 308)
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                console.log(`[DOWNLOAD] Redireccion ${response.statusCode} -> ${response.headers.location}`);
                file.close();
                
                try {
                    if (fs.existsSync(destPath)) { 
                        fs.unlinkSync(destPath); 
                    }
                } catch (e) {
                    console.warn('[DOWNLOAD] Error al limpiar archivo temporal:', e.message);
                }
                
                downloadFile(response.headers.location, destPath, notifyProgress, stage, progressStart, progressEnd, maxRedirects - 1)
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

                // Notificar cada 10%
                if (percent >= lastPercent + 10) {
                    lastPercent = percent;
                    const downloadedMB = (downloaded / 1024 / 1024).toFixed(2);
                    console.log(`[DOWNLOAD] Progreso: ${percent}% (${downloadedMB} MB)`);
                    
                    if (notifyProgress) {
                        const currentProgress = progressStart + (percent / 100) * (progressEnd - progressStart);
                        notifyProgress(stage, `Descargando... ${percent}%`, currentProgress);
                    }
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

/**
 * Descargar archivo con progreso simple (sin notificaciones)
 * @param {string} url - URL del archivo
 * @param {string} destPath - Ruta de destino
 * @param {number} maxRedirects - Maximo de redirecciones
 * @returns {Promise<void>}
 */
function downloadFileSimple(url, destPath, maxRedirects = 6) {
    return downloadFile(url, destPath, null, 'download', 0, 100, maxRedirects);
}

module.exports = {
    downloadFile,
    downloadFileSimple
};
