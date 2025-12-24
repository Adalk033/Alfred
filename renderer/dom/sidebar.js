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
 */
export function toggleLeftSidebar() {
    if (leftSidebar) {
        leftSidebar.classList.toggle('collapsed');

        // Rotar el icono del menu
        if (menuToggle) {
            menuToggle.classList.toggle('active');
        }
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
