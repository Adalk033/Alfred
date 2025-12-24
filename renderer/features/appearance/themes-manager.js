import { showNotification } from '../../core/notifications.js';

// ====================================
// SISTEMA DE MODOS
// ====================================

// Modos disponibles
export const MODES = {
    WORK: 'work',
    FOCUS: 'focus',
    PERSONAL: 'personal',
    CREATIVE: 'creative'
};

// Nombres de modos para mostrar
export const MODE_NAMES = {
    work: 'Work',
    focus: 'Focus',
    personal: 'Personal',
    creative: 'Creative'
};

// Temas disponibles
export const THEMES = {
    LIGHT: 'light',
    DARK: 'dark'
};

// Estado actual del modo
let currentMode = MODES.WORK;

// Estado actual del tema
let currentTheme = THEMES.DARK;

// Referencia al indicador de modo
let modeIndicatorName = null;

/**
 * Actualiza el indicador visual de modo en el topbar
 * @param {string} mode - Modo activo
 */
export function updateModeIndicator(mode) {
    console.log('[updateModeIndicator] Llamada con modo:', mode);
    console.log('[updateModeIndicator] modeIndicatorName existe:', !!modeIndicatorName);

    if (!modeIndicatorName) {
        console.warn('[updateModeIndicator] modeIndicatorName no esta inicializado, buscando elemento...');
        const indicator = document.getElementById('modeIndicator');
        if (indicator) {
            modeIndicatorName = indicator.querySelector('.mode-name');
            console.log('[updateModeIndicator] Elemento encontrado manualmente');
        } else {
            console.error('[updateModeIndicator] No se pudo encontrar #modeIndicator en el DOM');
            return;
        }
    }

    const modeName = MODE_NAMES[mode] || 'Work';
    modeIndicatorName.textContent = modeName;
    console.log('[updateModeIndicator] Texto actualizado a:', modeName);
}

/**
 * Cambia el modo de la aplicacion
 * @param {string} mode - Modo a activar (work, focus, personal, creative)
 */
export async function setMode(mode) {
    if (!Object.values(MODES).includes(mode)) {
        console.error(`Modo invalido: ${mode}`);
        return;
    }

    // Actualizar modo actual
    currentMode = mode;

    // Aplicar el modo al body
    document.body.setAttribute('data-mode', mode);

    // Actualizar indicador de modo en topbar
    updateModeIndicator(mode);

    // Guardar en base de datos
    try {
        const response = await fetch('http://127.0.0.1:8000/settings/mode', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ mode })
        });

        if (!response.ok) {
            throw new Error('Error al guardar el modo');
        }

        showNotification('success', `Modo ${mode} activado`);
    } catch (error) {
        console.error('Error al guardar modo:', error);
        showNotification('error', 'Error al guardar el modo');
    }
}

/**
 * Obtiene el modo actual desde la base de datos
 */
export async function loadMode() {
    try {
        console.log('[loadMode] Iniciando carga de modo...');
        const response = await fetch('http://127.0.0.1:8000/settings/mode');

        if (!response.ok) {
            throw new Error('Error al cargar el modo');
        }

        const data = await response.json();
        const savedMode = data.mode || MODES.WORK;

        console.log('[loadMode] Modo recibido del backend:', savedMode);

        // Aplicar el modo guardado
        currentMode = savedMode;
        document.body.setAttribute('data-mode', savedMode);
        console.log('[loadMode] Aplicado data-mode al body:', savedMode);

        // Actualizar indicador de modo en topbar
        updateModeIndicator(savedMode);

        // Marcar el boton activo en la UI (en el nuevo menu)
        const modeMenuItems = document.querySelectorAll('.mode-menu-item');
        console.log('[loadMode] Items de modo encontrados:', modeMenuItems.length);
        modeMenuItems.forEach(btn => {
            if (btn.dataset.mode === savedMode) {
                btn.classList.add('active');
                console.log('[loadMode] Item marcado como activo:', btn.dataset.mode);
            } else {
                btn.classList.remove('active');
            }
        });

        console.log(`[loadMode] Modo cargado exitosamente: ${savedMode}`);
    } catch (error) {
        console.error('[loadMode] Error al cargar modo:', error);
        // Si falla, usar modo por defecto (work)
        document.body.setAttribute('data-mode', MODES.WORK);
        updateModeIndicator(MODES.WORK);

        // Marcar work como activo por defecto
        const modeMenuItems = document.querySelectorAll('.mode-menu-item');
        modeMenuItems.forEach(btn => {
            if (btn.dataset.mode === 'work') {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }
}

/**
 * Cambia el tema de la aplicacion
 * @param {string} theme - Tema a activar (light, dark)
 */
export async function setTheme(theme) {
    if (!Object.values(THEMES).includes(theme)) {
        console.error(`Tema invalido: ${theme}`);
        return;
    }

    // Actualizar tema actual
    currentTheme = theme;

    // Agregar clase de transicion al body
    document.body.classList.add('theme-transition');

    // Aplicar el tema al body
    document.body.setAttribute('data-theme', theme);

    // Actualizar los botones de tema en el menu
    const themeMenuItems = document.querySelectorAll('.theme-menu-item');
    themeMenuItems.forEach(btn => {
        if (btn.dataset.theme === theme) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // Remover clase de transicion despues de que termine
    setTimeout(() => {
        document.body.classList.remove('theme-transition');
    }, 300);

    // Guardar en base de datos
    try {
        const response = await fetch('http://127.0.0.1:8000/settings/theme', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ theme })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: 'Error desconocido' }));
            throw new Error(`HTTP ${response.status}: ${errorData.detail || 'Error al guardar el tema'}`);
        }

        const data = await response.json();
        console.log('[setTheme] Respuesta del servidor:', data);
        showNotification('success', `Tema ${theme === 'light' ? 'claro' : 'oscuro'} activado`);
    } catch (error) {
        console.error('Error al guardar tema:', error);
        showNotification('error', `Error al guardar el tema: ${error.message}`);
    }
}

/**
 * Obtiene el tema actual desde la base de datos
 */
export async function loadTheme() {
    try {
        console.log('[loadTheme] Iniciando carga de tema...');
        const response = await fetch('http://127.0.0.1:8000/settings/theme');

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: 'Error desconocido' }));
            throw new Error(`HTTP ${response.status}: ${errorData.detail || 'Error al cargar el tema'}`);
        }

        const data = await response.json();
        // Modo oscuro por defecto si no hay tema guardado
        const savedTheme = data.theme || THEMES.DARK;

        console.log('[loadTheme] Tema recibido del backend:', savedTheme);

        // Aplicar el tema guardado
        currentTheme = savedTheme;
        document.body.setAttribute('data-theme', savedTheme);
        console.log('[loadTheme] Aplicado data-theme al body:', savedTheme);

        // Marcar el boton activo en la UI
        const themeMenuItems = document.querySelectorAll('.theme-menu-item');
        console.log('[loadTheme] Items de tema encontrados:', themeMenuItems.length);
        themeMenuItems.forEach(btn => {
            if (btn.dataset.theme === savedTheme) {
                btn.classList.add('active');
                console.log('[loadTheme] Item marcado como activo:', btn.dataset.theme);
            } else {
                btn.classList.remove('active');
            }
        });

        console.log(`[loadTheme] Tema cargado exitosamente: ${savedTheme}`);
    } catch (error) {
        console.error('[loadTheme] Error al cargar tema:', error);
        console.warn('[loadTheme] Usando tema por defecto (dark)');
        // Si falla, usar tema por defecto (dark)
        document.body.setAttribute('data-theme', THEMES.DARK);

        // Marcar dark como activo por defecto
        const themeMenuItems = document.querySelectorAll('.theme-menu-item');
        themeMenuItems.forEach(btn => {
            if (btn.dataset.theme === 'dark') {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }
}

/**
 * Obtiene el modo actual
 * @returns {string} Modo actual
 */
export function getCurrentMode() {
    return currentMode;
}

/**
 * Obtiene el tema actual
 * @returns {string} Tema actual
 */
export function getCurrentTheme() {
    return currentTheme;
}

// Expose globally for HTML onclick handlers
window.setMode = setMode;
window.setTheme = setTheme;
