import { showNotification } from '../../core/notifications.js';

// Variables para el log de actividad
let activityLogMessages = [];
const MAX_ACTIVITY_LOG_ITEMS = 20;

/**
 * Setup backend event listeners
 */
export function setupBackendListeners(updateConnectionStatusCallback) {
    // Escuchar notificaciones del backend
    window.alfredAPI.onBackendNotification((data) => {
        const { type, message } = data;

        // Mostrar notificacion visual
        showNotification(type, message);

        // Actualizar estado de conexion
        if (type === 'success') {
            updateConnectionStatusCallback(true);
        } else if (type === 'error') {
            updateConnectionStatusCallback(false);
        }
    });

    // Escuchar cambios de estado del backend
    window.alfredAPI.onBackendStatus((data) => {
        const { status } = data;
        updateConnectionStatusCallback(status === 'connected');
    });

    // Escuchar progreso de instalacion
    window.alfredAPI.onInstallationProgress((data) => {
        const { stage, message, progress } = data;
        updateLoadingUI(stage, message, progress);
    });

    // Escuchar cuando el backend esta listo para ocultar el loader
    window.alfredAPI.onBackendReady(() => {
        console.log('Backend confirmado listo - ocultando loader');
        hideLoadingOverlay();
        updateConnectionStatusCallback(true);
    });
}

/**
 * Actualizar UI del loader con progreso detallado
 */
function updateLoadingUI(stage, message, progress) {
    const statusText = document.getElementById('loadingStatusText');
    const progressBar = document.getElementById('loadingProgressBar');
    const activityLogContainer = document.getElementById('activityLogMessages');

    // Actualizar texto principal
    if (statusText) {
        statusText.textContent = message || 'Iniciando Alfred...';
    }

    // Actualizar barra de progreso
    if (progressBar && typeof progress === 'number') {
        progressBar.style.width = `${Math.min(100, Math.max(0, progress))}%`;
    }

    // Agregar al log de actividad
    if (activityLogContainer && message) {
        // Determinar si es un mensaje importante (PyTorch, errores, completado)
        const isImportant = 
            message.includes('PyTorch') || 
            message.includes('Descargando') || 
            message.includes('instalado') ||
            message.includes('Error') ||
            message.includes('listo') ||
            progress >= 95;

        // Crear elemento de log
        const logItem = document.createElement('div');
        logItem.className = `activity-log-item ${isImportant ? 'important' : ''}`;
        logItem.innerHTML = `
            <div class="activity-icon"></div>
            <div class="activity-text">
                ${message}
                ${typeof progress === 'number' ? `<span class="activity-progress">(${progress}%)</span>` : ''}
            </div>
        `;

        // Agregar al principio (mensajes mas recientes arriba)
        activityLogContainer.insertBefore(logItem, activityLogContainer.firstChild);

        // Mantener solo los ultimos N mensajes
        activityLogMessages.push({ stage, message, progress, timestamp: Date.now() });
        if (activityLogMessages.length > MAX_ACTIVITY_LOG_ITEMS) {
            activityLogMessages.shift();
            // Eliminar el ultimo elemento del DOM
            const lastChild = activityLogContainer.lastChild;
            if (lastChild) {
                activityLogContainer.removeChild(lastChild);
            }
        }

        // Auto-scroll al mensaje mas reciente (que esta arriba)
        activityLogContainer.scrollTop = 0;
    }

    console.log(`[INSTALLATION] ${stage}: ${message} (${progress}%)`);
}

/**
 * Ocultar loading overlay
 */
function hideLoadingOverlay() {
    const overlay = document.getElementById('backendLoadingOverlay');
    if (overlay) {
        overlay.classList.add('hidden');

        // Eliminar del DOM despues de la animacion
        setTimeout(() => {
            if (overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
        }, 500);
    }

    // Habilitar input
    const messageInput = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');
    
    if (messageInput) {
        messageInput.disabled = false;
        messageInput.placeholder = 'Escribe tu mensaje...';
    }
    if (sendBtn) {
        sendBtn.disabled = false;
    }
}
