// ====================================
// SIDEBAR MODULE
// ====================================
// Handles left sidebar toggling, navigation, and mobile behavior

// DOM element references (set from renderer.js)
let leftSidebar = null;
let leftSidebarContent = null;
let menuToggle = null;
let activeNavItem = null;

/**
 * Initialize sidebar with DOM element references
 * @param {Object} elements - Object containing sidebar DOM elements
 */
export function initializeSidebar(elements) {
    leftSidebar = elements.leftSidebar;
    leftSidebarContent = elements.leftSidebarContent;
    menuToggle = elements.menuToggle;
}

/**
 * Toggle the left sidebar collapsed/expanded state
 * Saves the state to database for persistence
 */
export async function toggleLeftSidebar() {
    if (leftSidebar) {
        leftSidebar.classList.toggle('collapsed');

        // Rotar el icono del menu
        if (menuToggle) {
            menuToggle.classList.toggle('active');
        }

        // Guardar estado en base de datos
        const isCollapsed = leftSidebar.classList.contains('collapsed');
        await saveSidebarState(isCollapsed);
    }
}

/**
 * Save sidebar state to database
 * @param {boolean} collapsed - True if sidebar is collapsed
 */
async function saveSidebarState(collapsed) {
    try {
        const response = await fetch('http://127.0.0.1:8000/settings/sidebar', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ collapsed })
        });

        if (!response.ok) {
            console.error('[Sidebar] Error al guardar estado del sidebar');
        }
    } catch (error) {
        console.error('[Sidebar] Error al guardar estado:', error);
    }
}

/**
 * Load sidebar state from database and apply it
 */
export async function loadSidebarState() {
    try {
        console.log('[Sidebar] Cargando estado del sidebar...');
        console.log('[Sidebar] leftSidebar existe:', !!leftSidebar);
        console.log('[Sidebar] menuToggle existe:', !!menuToggle);
        
        const response = await fetch('http://127.0.0.1:8000/settings/sidebar');

        if (!response.ok) {
            console.error('[Sidebar] Error al cargar estado del sidebar, status:', response.status);
            return;
        }

        const data = await response.json();
        console.log('[Sidebar] Respuesta del servidor:', data);
        const isCollapsed = data.collapsed || false;

        console.log('[Sidebar] Estado a aplicar:', isCollapsed ? 'colapsado' : 'expandido');

        // Aplicar estado al sidebar
        if (leftSidebar) {
            if (isCollapsed) {
                leftSidebar.classList.add('collapsed');
                console.log('[Sidebar] Clase collapsed agregada');
                if (menuToggle) {
                    menuToggle.classList.add('active');
                    console.log('[Sidebar] Clase active agregada a menuToggle');
                }
            } else {
                leftSidebar.classList.remove('collapsed');
                console.log('[Sidebar] Clase collapsed removida');
                if (menuToggle) {
                    menuToggle.classList.remove('active');
                    console.log('[Sidebar] Clase active removida de menuToggle');
                }
            }
            console.log('[Sidebar] Estado aplicado correctamente');
        } else {
            console.error('[Sidebar] No se puede aplicar estado: leftSidebar es null');
        }
    } catch (error) {
        console.error('[Sidebar] Error al cargar estado:', error);
    }
}

/**
 * Close sidebar on mobile devices (responsive behavior)
 */
export function closeSidebarOnMobile() {
    if (window.innerWidth <= 768 && leftSidebar) {
        leftSidebar.classList.add('collapsed');
    }
}

/**
 * Show content in the left sidebar
 */
export function showLeftSidebarContent() {
    if (leftSidebarContent) {
        leftSidebarContent.classList.add('active');
    }
}

/**
 * Hide content in the left sidebar
 */
export function hideLeftSidebarContent() {
    if (leftSidebarContent) {
        leftSidebarContent.classList.remove('active');
    }
}

/**
 * Mark a navigation item as active
 * @param {HTMLElement} button - The navigation button to activate
 */
export function setActiveNavItem(button) {
    // Remover clase activa de todos los botones
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.classList.remove('active');
    });

    // Agregar clase activa al boton actual
    if (button) {
        button.classList.add('active');
        activeNavItem = button;
    }
}

/**
 * Get the currently active navigation item
 * @returns {HTMLElement|null} The active navigation button
 */
export function getActiveNavItem() {
    return activeNavItem;
}

/**
 * Check if sidebar is collapsed
 * @returns {boolean} True if sidebar is collapsed
 */
export function isSidebarCollapsed() {
    return leftSidebar ? leftSidebar.classList.contains('collapsed') : false;
}
