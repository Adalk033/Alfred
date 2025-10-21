// Mostrar notificación
export function showNotification(type, message) {
    // Crear contenedor de notificaciones si no existe
    let notificationContainer = document.getElementById('notification-container');
    if (!notificationContainer) {
        notificationContainer = document.createElement('div');
        notificationContainer.id = 'notification-container';
        document.body.appendChild(notificationContainer);
    }

    // Crear elemento de notificación
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;

    // Crear contenedor de contenido
    const contentDiv = document.createElement('div');
    contentDiv.className = 'notification-content';

    // Crear elemento de mensaje
    const messageSpan = document.createElement('span');
    messageSpan.className = 'notification-message';
    messageSpan.textContent = message;

    // Crear botón de cerrar
    const closeButton = document.createElement('button');
    closeButton.className = 'notification-close';
    closeButton.innerHTML = '×';
    closeButton.setAttribute('aria-label', 'Cerrar notificación');

    // Función para cerrar la notificación
    const closeNotification = () => {
        notification.classList.remove('show');
        setTimeout(() => {
            notification.remove();
            // Si no hay más notificaciones, remover el contenedor
            if (notificationContainer.children.length === 0) {
                notificationContainer.remove();
            }
        }, 300);
    };

    // Agregar evento al botón de cerrar
    closeButton.addEventListener('click', closeNotification);

    // Agregar elementos a la notificación
    contentDiv.appendChild(messageSpan);
    notification.appendChild(contentDiv);
    notification.appendChild(closeButton);

    // Agregar al contenedor
    notificationContainer.appendChild(notification);

    // Animar entrada
    setTimeout(() => notification.classList.add('show'), 12);

    // Remover después de 10 segundos
    const autoCloseTimeout = setTimeout(() => {
        closeNotification();
    }, 10000);

    // Cancelar el cierre automático si el usuario cierra manualmente
    closeButton.addEventListener('click', () => {
        clearTimeout(autoCloseTimeout);
    }, { once: true });

    // Actualizar status si es error de conexión
    if (type === 'error' && message.includes('conexión')) {
        updateStatus('error', 'Error de conexión');
    }
}