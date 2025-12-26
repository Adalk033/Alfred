import { showNotification } from '../../core/notifications.js';
import { showConfirm } from '../../core/dialogs.js';

// Archivos adjuntos temporales (maximo 5)
const MAX_ATTACHED_FILES = 5;
let attachedFiles = [];

/**
 * Get current attached files array
 */
export function getAttachedFiles() {
    return attachedFiles.length > 0 ? attachedFiles : null;
}

/**
 * Get current attached file (legacy - returns first file or null)
 * @deprecated Use getAttachedFiles() instead
 */
export function getAttachedFile() {
    return attachedFiles.length > 0 ? attachedFiles[0] : null;
}

/**
 * Clear all attached files
 */
export function clearAttachedFiles() {
    attachedFiles = [];
}

/**
 * Clear attached file (legacy)
 * @deprecated Use clearAttachedFiles() instead
 */
export function clearAttachedFile() {
    attachedFiles = [];
}

/**
 * Get count of attached files
 */
export function getAttachedFilesCount() {
    return attachedFiles.length;
}

/**
 * Manejar adjuntar archivo
 */
export async function handleFileAttach(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Verificar limite de archivos
    if (attachedFiles.length >= MAX_ATTACHED_FILES) {
        showNotification('warning', `Maximo ${MAX_ATTACHED_FILES} archivos permitidos. Remueve alguno para agregar mas.`);
        event.target.value = '';
        return;
    }

    // Verificar si el archivo ya esta adjunto
    const alreadyAttached = attachedFiles.some(f => f.name === file.name && f.size === file.size);
    if (alreadyAttached) {
        showNotification('warning', `El archivo "${file.name}" ya esta adjunto.`);
        event.target.value = '';
        return;
    }

    // Sistema de advertencias progresivas
    const fileSize = file.size;
    const sizeMB = (fileSize / (1024 * 1024)).toFixed(2);

    // 0-10MB: Sin advertencia
    // 10-50MB: Advertencia moderada
    // 50MB+: Advertencia fuerte

    if (fileSize > 50 * 1024 * 1024) {
        // Mas de 50MB
        const confirmed = await showConfirm(
            `El archivo es muy grande (${sizeMB} MB)\n\n` +
            `Esto puede causar:\n` +
            `- Procesamiento muy lento\n` +
            `- Uso alto de memoria\n` +
            `- Posible congelamiento de la aplicacion\n\n` +
            `Estas seguro de continuar?`,
            'Archivo muy grande',
            { type: 'warning', confirmText: 'Continuar', cancelText: 'Cancelar' }
        );
        if (!confirmed) {
            event.target.value = '';
            return;
        }
    } else if (fileSize > 10 * 1024 * 1024) {
        // Entre 10-50MB
        const confirmed = await showConfirm(
            `El procesamiento puede tardar un poco.\nDeseas continuar?`,
            `Archivo grande (${sizeMB} MB)`,
            { type: 'info', confirmText: 'Continuar', cancelText: 'Cancelar' }
        );
        if (!confirmed) {
            event.target.value = '';
            return;
        }
    }

    try {
        // Leer el contenido del archivo
        showNotification('info', `Leyendo archivo: ${file.name} (${sizeMB} MB)...`);
        const content = await readFileContent(file);

        // Agregar archivo a la lista de adjuntos
        const newFile = {
            name: file.name,
            size: file.size,
            type: file.type,
            content: content
        };
        attachedFiles.push(newFile);

        // Mostrar indicador actualizado
        updateAttachedFilesIndicator();

        const remainingSlots = MAX_ATTACHED_FILES - attachedFiles.length;
        if (fileSize > 10 * 1024 * 1024) {
            showNotification('success', `Archivo adjunto: ${file.name} (${sizeMB} MB) - Puede tardar en procesarse`);
        } else {
            const slotsMsg = remainingSlots > 0 ? ` (${remainingSlots} espacios disponibles)` : '';
            showNotification('success', `Archivo adjunto: ${file.name}${slotsMsg}`);
        }
    } catch (error) {
        console.error('Error al leer archivo:', error);
        showNotification('error', 'Error al leer el archivo');
        event.target.value = '';
    }
}

/**
 * Leer contenido del archivo
 */
function readFileContent(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            resolve(e.target.result);
        };

        reader.onerror = (e) => {
            reject(new Error('Error al leer el archivo'));
        };

        // Formatos binarios que requieren base64
        const binaryFormats = ['.pdf', '.docx', '.xlsx', '.pptx'];
        const isBinary = binaryFormats.some(ext => file.name.toLowerCase().endsWith(ext));

        if (isBinary) {
            // Archivos binarios (PDF, Word, Excel, PowerPoint) como base64
            reader.readAsDataURL(file);
        } else {
            // Archivos de texto plano (txt, md, json, xml, csv, etc)
            reader.readAsText(file);
        }
    });
}

/**
 * Mostrar indicador de archivo adjunto (legacy - single file)
 * @deprecated Use updateAttachedFilesIndicator() instead
 */
function showAttachedFileIndicator(fileName, fileSize) {
    const indicator = document.getElementById('attachedFileIndicator');
    const fileNameEl = document.getElementById('attachedFileName');
    const fileSizeEl = document.getElementById('attachedFileSize');

    fileNameEl.textContent = fileName;
    fileSizeEl.textContent = formatFileSize(fileSize);
    indicator.style.display = 'flex';
}

/**
 * Actualizar indicador de multiples archivos adjuntos
 */
function updateAttachedFilesIndicator() {
    const indicator = document.getElementById('attachedFileIndicator');
    const filesListContainer = document.getElementById('attachedFilesList');
    
    if (attachedFiles.length === 0) {
        indicator.style.display = 'none';
        return;
    }
    
    // Si existe el nuevo contenedor de lista, usar ese
    if (filesListContainer) {
        filesListContainer.innerHTML = '';
        
        attachedFiles.forEach((file, index) => {
            const fileItem = document.createElement('div');
            fileItem.className = 'attached-file-item';
            fileItem.innerHTML = `
                <div class="attached-file-info">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6z"/>
                    </svg>
                    <span class="file-name" title="${file.name}">${file.name}</span>
                    <span class="file-size">${formatFileSize(file.size)}</span>
                </div>
                <button class="remove-file-btn" data-index="${index}" title="Quitar archivo">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 6L6 18M6 6l12 12"/>
                    </svg>
                </button>
            `;
            filesListContainer.appendChild(fileItem);
        });
        
        // Agregar evento de click a cada boton de remover
        filesListContainer.querySelectorAll('.remove-file-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.currentTarget.dataset.index);
                removeAttachedFileByIndex(index);
            });
        });
        
        indicator.style.display = 'flex';
    } else {
        // Fallback al indicador simple (legacy)
        const fileNameEl = document.getElementById('attachedFileName');
        const fileSizeEl = document.getElementById('attachedFileSize');
        
        if (attachedFiles.length === 1) {
            fileNameEl.textContent = attachedFiles[0].name;
            fileSizeEl.textContent = formatFileSize(attachedFiles[0].size);
        } else {
            const totalSize = attachedFiles.reduce((sum, f) => sum + f.size, 0);
            fileNameEl.textContent = `${attachedFiles.length} archivos`;
            fileSizeEl.textContent = formatFileSize(totalSize);
        }
        indicator.style.display = 'flex';
    }
}

/**
 * Remover archivo por indice
 */
export function removeAttachedFileByIndex(index) {
    if (index >= 0 && index < attachedFiles.length) {
        const removedFile = attachedFiles.splice(index, 1)[0];
        showNotification('info', `Archivo removido: ${removedFile.name}`);
        updateAttachedFilesIndicator();
        
        // Limpiar input de archivo
        const fileInput = document.getElementById('fileInput');
        if (fileInput) {
            fileInput.value = '';
        }
    }
}

/**
 * Quitar todos los archivos adjuntos
 */
export function removeAttachedFiles() {
    const count = attachedFiles.length;
    attachedFiles = [];
    const indicator = document.getElementById('attachedFileIndicator');
    indicator.style.display = 'none';

    // Limpiar input de archivo
    const fileInput = document.getElementById('fileInput');
    if (fileInput) {
        fileInput.value = '';
    }

    if (count > 0) {
        showNotification('info', count === 1 ? 'Archivo removido' : `${count} archivos removidos`);
    }
}

/**
 * Quitar archivo adjunto (legacy - remueve todos)
 * @deprecated Use removeAttachedFiles() or removeAttachedFileByIndex() instead
 */
export function removeAttachedFile() {
    removeAttachedFiles();
}

/**
 * Configurar Drag and Drop en el area de conversacion
 */
export function setupDragAndDrop() {
    const messagesContainer = document.getElementById('messages');
    const chatContainer = document.querySelector('.chat-container');

    if (!messagesContainer || !chatContainer) return;

    // Variables para el overlay visual
    let dragOverlay = null;
    let dragCounter = 0;

    // Evitar el comportamiento por defecto en el contenedor
    chatContainer.addEventListener('dragenter', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter++;

        // Mostrar overlay visual solo la primera vez
        if (!dragOverlay) {
            dragOverlay = document.createElement('div');
            dragOverlay.className = 'drag-overlay';
            dragOverlay.innerHTML = '<div class="drag-overlay-content"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg><p>Suelta el archivo aqui</p></div>';
            chatContainer.appendChild(dragOverlay);
        }
        dragOverlay.classList.add('active');
    });

    chatContainer.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'copy';
    });

    chatContainer.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter--;

        // Remover overlay cuando se sale completamente del contenedor
        if (dragCounter === 0 && dragOverlay) {
            dragOverlay.classList.remove('active');
        }
    });

    chatContainer.addEventListener('drop', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        // Reset contador y remover overlay
        dragCounter = 0;
        if (dragOverlay) {
            dragOverlay.classList.remove('active');
        }

        const files = e.dataTransfer.files;
        if (files.length === 0) return;

        // Validar formatos aceptados
        const acceptedFormats = ['.txt', '.pdf', '.docx', '.xlsx', '.pptx', '.md', '.json', '.xml', '.csv'];
        
        // Procesar multiples archivos (hasta el limite disponible)
        const availableSlots = MAX_ATTACHED_FILES - attachedFiles.length;
        if (availableSlots <= 0) {
            showNotification('warning', `Maximo ${MAX_ATTACHED_FILES} archivos permitidos. Remueve alguno para agregar mas.`);
            return;
        }
        
        const filesToProcess = Math.min(files.length, availableSlots);
        let addedCount = 0;
        
        for (let i = 0; i < filesToProcess; i++) {
            const file = files[i];
            const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
            
            if (!acceptedFormats.includes(fileExtension)) {
                showNotification('error', `Formato no soportado: ${file.name}`);
                continue;
            }
            
            // Verificar si ya esta adjunto
            const alreadyAttached = attachedFiles.some(f => f.name === file.name && f.size === file.size);
            if (alreadyAttached) {
                showNotification('warning', `"${file.name}" ya esta adjunto.`);
                continue;
            }
            
            // Simular evento change para cada archivo
            const fileInput = document.getElementById('fileInput');
            if (fileInput) {
                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(file);
                fileInput.files = dataTransfer.files;
                
                const event = new Event('change', { bubbles: true });
                fileInput.dispatchEvent(event);
                addedCount++;
            }
        }
        
        if (files.length > filesToProcess) {
            const skipped = files.length - filesToProcess;
            showNotification('warning', `${skipped} archivo(s) omitido(s) por limite de ${MAX_ATTACHED_FILES}`);
        }
    });
}

/**
 * Formatear tamano de archivo
 */
export function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}
