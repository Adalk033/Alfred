// ===============================================
// SISTEMA DE DIALOGOS PERSONALIZADOS
// ===============================================

/**
 * Mostrar un dialogo de alerta personalizado
 * @param {string} message - Mensaje a mostrar
 * @param {string} title - Titulo del dialogo (opcional)
 * @param {string} type - Tipo de icono: 'info', 'success', 'warning', 'error' (default: 'info')
 * @returns {Promise<void>}
 */
export function showAlert(message, title = 'Informacion', type = 'info') {
    return new Promise((resolve) => {
        const overlay = document.getElementById('customDialogOverlay');
        const dialog = document.getElementById('customDialog');
        const iconContainer = document.getElementById('customDialogIcon');
        const titleElement = document.getElementById('customDialogTitle');
        const messageElement = document.getElementById('customDialogMessage');
        const actionsContainer = document.getElementById('customDialogActions');

        // Configurar icono segun tipo
        const icons = {
            info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>',
            success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>',
            warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
            error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>'
        };

        // Configurar contenido
        iconContainer.innerHTML = icons[type] || icons.info;
        iconContainer.className = `custom-dialog-icon ${type}`;
        titleElement.textContent = title;
        messageElement.textContent = message;

        // Crear boton de aceptar
        actionsContainer.innerHTML = '<button class="button primary" id="dialogAcceptBtn">Aceptar</button>';

        // Mostrar dialogo
        overlay.style.display = 'flex';
        setTimeout(() => overlay.classList.add('show'), 10);

        // Manejar cierre
        const acceptBtn = document.getElementById('dialogAcceptBtn');
        const closeDialog = () => {
            overlay.classList.remove('show');
            setTimeout(() => {
                overlay.style.display = 'none';
                resolve();
            }, 200);
        };

        acceptBtn.onclick = closeDialog;

        // Cerrar con ESC
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                closeDialog();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
    });
}

/**
 * Mostrar un dialogo de confirmacion personalizado
 * @param {string} message - Mensaje a mostrar
 * @param {string} title - Titulo del dialogo (opcional)
 * @param {object} options - Opciones de configuracion
 * @param {string} options.confirmText - Texto del boton de confirmar (default: 'Confirmar')
 * @param {string} options.cancelText - Texto del boton de cancelar (default: 'Cancelar')
 * @param {string} options.type - Tipo de icono y boton: 'info', 'warning', 'danger' (default: 'warning')
 * @returns {Promise<boolean>} - true si confirma, false si cancela
 */
export function showConfirm(message, title = 'Confirmar accion', options = {}) {
    return new Promise((resolve) => {
        const {
            confirmText = 'Confirmar',
            cancelText = 'Cancelar',
            type = 'warning'
        } = options;

        const overlay = document.getElementById('customDialogOverlay');
        const dialog = document.getElementById('customDialog');
        const iconContainer = document.getElementById('customDialogIcon');
        const titleElement = document.getElementById('customDialogTitle');
        const messageElement = document.getElementById('customDialogMessage');
        const actionsContainer = document.getElementById('customDialogActions');

        // Iconos para confirmacion
        const icons = {
            info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>',
            warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
            danger: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>',
            question: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>'
        };

        // Configurar contenido
        iconContainer.innerHTML = icons[type] || icons.question;
        iconContainer.className = `custom-dialog-icon ${type}`;
        titleElement.textContent = title;
        messageElement.textContent = message;

        // Crear botones
        const buttonClass = type === 'danger' ? 'danger' : 'primary';
        actionsContainer.innerHTML = `
            <button class="button secondary" id="dialogCancelBtn">${cancelText}</button>
            <button class="button ${buttonClass}" id="dialogConfirmBtn">${confirmText}</button>
        `;

        // Mostrar dialogo
        overlay.style.display = 'flex';
        setTimeout(() => overlay.classList.add('show'), 10);

        // Manejar respuestas
        const confirmBtn = document.getElementById('dialogConfirmBtn');
        const cancelBtn = document.getElementById('dialogCancelBtn');

        const closeDialog = (result) => {
            overlay.classList.remove('show');
            setTimeout(() => {
                overlay.style.display = 'none';
                resolve(result);
            }, 200);
        };

        confirmBtn.onclick = () => closeDialog(true);
        cancelBtn.onclick = () => closeDialog(false);

        // Cerrar con ESC (cancelar)
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                closeDialog(false);
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);

        // Focus en boton de confirmar
        setTimeout(() => confirmBtn.focus(), 100);
    });
}
