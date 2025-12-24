import { showNotification } from '../../core/notifications.js';
import { showConfirm } from '../../core/dialogs.js';

// Archivo adjunto temporal
let attachedFile = null;

/**
 * Get current attached file
 */
export function getAttachedFile() {
    return attachedFile;
}

/**
 * Clear attached file
 */
export function clearAttachedFile() {
    attachedFile = null;
}

/**
 * Manejar adjuntar archivo
 */
export async function handleFileAttach(event) {
    const file = event.target.files[0];
    if (!file) return;

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

        // Guardar archivo adjunto
        attachedFile = {
            name: file.name,
            size: file.size,
            type: file.type,
            content: content
        };

        // Mostrar indicador
        showAttachedFileIndicator(file.name, file.size);

        if (fileSize > 10 * 1024 * 1024) {
            showNotification('success', `Archivo adjunto: ${file.name} (${sizeMB} MB) - Puede tardar en procesarse`);
        } else {
            showNotification('success', `Archivo adjunto: ${file.name}`);
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
 * Mostrar indicador de archivo adjunto
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
 * Quitar archivo adjunto
 */
export function removeAttachedFile() {
    attachedFile = null;
    const indicator = document.getElementById('attachedFileIndicator');
    indicator.style.display = 'none';

    // Limpiar input de archivo
    const fileInput = document.getElementById('fileInput');
    if (fileInput) {
        fileInput.value = '';
    }

    showNotification('info', 'Archivo removido');
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

        const file = files[0];

        // Validar que sea un formato aceptado
        const acceptedFormats = ['.txt', '.pdf', '.docx', '.xlsx', '.pptx', '.md', '.json', '.xml', '.csv'];
        const fileExtension = '.' + file.name.split('.').pop().toLowerCase();

        if (!acceptedFormats.includes(fileExtension)) {
            showNotification('error', `Formato no soportado: ${fileExtension}`);
            return;
        }

        // Simular un evento change en el file input
        const fileInput = document.getElementById('fileInput');
        if (fileInput) {
            // Crear un DataTransfer para asignar el archivo al input
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            fileInput.files = dataTransfer.files;

            // Disparar el evento change
            const event = new Event('change', { bubbles: true });
            fileInput.dispatchEvent(event);
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
