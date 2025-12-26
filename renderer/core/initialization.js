// ====================================
// INITIALIZATION MODULE
// ====================================
// Handles application initialization and event listener setup

import * as State from '../state/state.js';
import { sendMessage } from './messages.js';
import { getCryptoManager } from '../crypto/crypto.js';
import { initializeSidebar, toggleLeftSidebar, closeSidebarOnMobile, hideLeftSidebarContent, setActiveNavItem, loadSidebarState } from '../dom/sidebar.js';
import { showNotification } from './notifications.js';

/**
 * Initialize the application when DOM is ready
 * @param {Object} refs - Object containing all DOM element references and functions
 */
export async function initializeApp(refs) {
    const {
        // Functions
        waitForBackendReady,
        checkAndShowWelcomeModal,
        checkAndShowFirstTimeEncryptionModal,
        loadMode,
        loadTheme,
        loadModelsIntoSelector,
        loadSettings,
        loadCurrentModel,
        loadOllamaKeepAlive,
        loadProfilePicture,
        loadUserInfo,
        loadConversations,
        loadAppVersions,
        setupEventListeners
    } = refs;

    // Inicializar elementos del DOM en State
    State.setDOMElements({
        messagesContainer: document.getElementById('messages'),
        messageInput: document.getElementById('messageInput'),
        sendBtn: document.getElementById('sendBtn'),
        typingIndicator: document.getElementById('typingIndicator'),
        statusElement: document.getElementById('status'),
        sidebar: document.getElementById('leftSidebarContent'),
        sidebarTitle: null,
        sidebarContent: document.getElementById('leftSidebarContent')
    });

    // Inicializar elementos locales
    const elements = {
        historyBtn: document.getElementById('historyBtn'),
        settingsBtn: document.getElementById('settingsBtn'),
        searchDocsBtn: document.getElementById('searchDocsBtn'),
        promptOnlyBtn: document.getElementById('promptOnlyBtn'),
        modelSelect: document.getElementById('modelSelect'),
        settingsModal: document.getElementById('settingsModal'),
        closeSettings: document.getElementById('closeSettings'),
        cancelSettings: document.getElementById('cancelSettings'),
        saveSettings: document.getElementById('saveSettings'),
        changeProfilePictureBtn: document.getElementById('changeProfilePictureBtn'),
        currentProfilePicture: document.getElementById('currentProfilePicture'),
        profileHistoryGallery: document.getElementById('profileHistoryGallery'),
        profileHistoryCount: document.getElementById('profileHistoryCount'),
        ollamaKeepAliveSlider: document.getElementById('ollamaKeepAlive'),
        ollamaKeepAliveValue: document.getElementById('ollamaKeepAliveValue'),
        ollamaKeepAlivePresets: document.querySelectorAll('.preset-btn'),
        menuToggle: document.getElementById('menuToggle'),
        leftSidebar: document.getElementById('leftSidebar'),
        leftSidebarContent: document.getElementById('leftSidebarContent'),
        newChatBtn: document.getElementById('newChatBtn'),
        conversationsBtn: document.getElementById('conversationsBtn'),
        profilePictureTopbar: document.getElementById('profilePictureTopbar'),
        modeIndicator: document.getElementById('modeIndicator'),
        modeIndicatorName: null
    };

    // Obtener modeIndicatorName
    if (elements.modeIndicator) {
        elements.modeIndicatorName = elements.modeIndicator.querySelector('.mode-name');
    }

    // Inicializar sidebar con referencias DOM
    initializeSidebar({
        leftSidebar: elements.leftSidebar,
        leftSidebarContent: elements.leftSidebarContent,
        menuToggle: elements.menuToggle
    });

    // Esperar a que el backend este listo antes de habilitar el chat
    await waitForBackendReady();

    // IMPORTANTE: Inicializar gestor de cifrado para datos en transito
    console.log('[INIT] Inicializando gestor de cifrado...');
    const cryptoManager = getCryptoManager();
    const cryptoInitialized = await cryptoManager.initialize();
    if (cryptoInitialized) {
        console.log('[INIT] Gestor de cifrado inicializado correctamente');
    } else {
        console.warn('[INIT] No se pudo inicializar cifrado, continuando sin cifrado');
    }

    // Verificar si es primera instalacion:
    // 1. Primero mostrar bienvenida (nombre, edad, foto)
    // 2. Luego mostrar configuracion de cifrado
    await checkAndShowWelcomeModal();
    await checkAndShowFirstTimeEncryptionModal();

    // Cargar modo desde BD antes de continuar
    await loadMode();

    // Cargar tema desde BD
    await loadTheme();

    // Cargar estado del sidebar desde BD
    await loadSidebarState();

    // Cargar modelos disponibles en el selector del topbar
    await loadModelsIntoSelector();

    setupEventListeners(elements);
    loadSettings();
    await loadCurrentModel();
    await loadOllamaKeepAlive();
    loadProfilePicture();
    await loadUserInfo();
    await loadConversations();

    // Cargar versiones de la aplicacion en seccion "Acerca de"
    loadAppVersions();

    // Auto-ajustar altura del textarea
    State.messageInput.addEventListener('input', () => {
        State.messageInput.style.height = 'auto';
        State.messageInput.style.height = State.messageInput.scrollHeight + 'px';
    });

    return elements;
}

/**
 * Setup all event listeners for the application
 * @param {Object} elements - DOM element references
 * @param {Object} handlers - Event handler functions
 */
export function setupEventListeners(elements, handlers) {
    const {
        showHistory,
        showConversations,
        saveSettingsHandler,
        changeModel,
        changeProfilePicture,
        saveUserInfo,
        savePersonalization,
        addDocPath,
        reindexDocuments,
        clearIndex,
        handleFileAttach,
        removeAttachedFile,
        setupDragAndDrop,
        updateKeepAliveDisplay,
        downloadOllamaModel,
        loadOllamaModels,
        toggleEncryptionKey,
        copyEncryptionKey,
        loadEncryptionKey,
        enableEncryption,
        loadDocumentPaths,
        loadIndexationStatus,
        loadPersonalization,
        loadEncryptionStatus
    } = handlers;

    // Message input handlers
    State.sendBtn.addEventListener('click', sendMessage);
    State.messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    State.messageInput.addEventListener('input', () => {
        State.sendBtn.disabled = !State.messageInput.value.trim();
    });

    // Event listeners para botones de modo
    elements.searchDocsBtn.addEventListener('click', () => {
        State.setSearchMode('documents');
        elements.searchDocsBtn.classList.add('active');
        elements.promptOnlyBtn.classList.remove('active');
    });

    elements.promptOnlyBtn.addEventListener('click', () => {
        State.setSearchMode('prompt');
        elements.promptOnlyBtn.classList.add('active');
        elements.searchDocsBtn.classList.remove('active');
    });

    elements.historyBtn.addEventListener('click', () => {
        showHistory();
        closeSidebarOnMobile();
    });

    elements.settingsBtn.addEventListener('click', () => {
        elements.settingsModal.classList.remove('none');
        closeSidebarOnMobile();
    });

    // Event listeners del sidebar izquierdo
    elements.menuToggle.addEventListener('click', toggleLeftSidebar);
    elements.newChatBtn.addEventListener('click', () => {
        window.createNewConversation();
        hideLeftSidebarContent();
        setActiveNavItem(null);
        closeSidebarOnMobile();
    });

    elements.conversationsBtn.addEventListener('click', () => {
        showConversations();
        closeSidebarOnMobile();
    });

    // Event listener para foto de perfil en el topbar
    elements.profilePictureTopbar.addEventListener('click', () => {
        elements.settingsModal.classList.remove('none');
    });

    // Event listeners para botones de modo en el nuevo menu
    const modeMenuItems = document.querySelectorAll('.mode-menu-item');
    const settingsMenuDropdown = document.getElementById('settingsMenuDropdown');

    modeMenuItems.forEach(btn => {
        btn.addEventListener('click', async () => {
            const mode = btn.dataset.mode;

            // Cambiar clase active
            modeMenuItems.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Cerrar menu
            if (settingsMenuDropdown) {
                settingsMenuDropdown.style.display = 'none';
            }

            // Cambiar modo en la aplicacion
            await window.setMode(mode);
        });
    });

    // Event listeners para botones de tema en el nuevo menu
    const themeMenuItems = document.querySelectorAll('.theme-menu-item');
    themeMenuItems.forEach(btn => {
        btn.addEventListener('click', async () => {
            const theme = btn.dataset.theme;

            // Cambiar clase active
            themeMenuItems.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Cerrar menu
            if (settingsMenuDropdown) {
                settingsMenuDropdown.style.display = 'none';
            }

            // Cambiar tema en la aplicacion
            await window.setTheme(theme);
        });
    });

    // Event listener para abrir/cerrar el menu de configuracion
    const settingsMenuBtn = document.getElementById('settingsMenuBtn');

    if (settingsMenuBtn && settingsMenuDropdown) {
        settingsMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isVisible = settingsMenuDropdown.style.display !== 'none';
            settingsMenuDropdown.style.display = isVisible ? 'none' : 'flex';
        });
    }

    // Cerrar menu al hacer clic fuera
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.settings-menu-container') && settingsMenuDropdown) {
            settingsMenuDropdown.style.display = 'none';
        }
    });

    elements.closeSettings.addEventListener('click', () => elements.settingsModal.classList.add('none'));
    elements.cancelSettings.addEventListener('click', () => elements.settingsModal.classList.add('none'));
    elements.saveSettings.addEventListener('click', saveSettingsHandler);

    // Event listener para cerrar modales con tecla ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            // Cerrar modal de configuraciones si está abierta
            if (elements.settingsModal && !elements.settingsModal.classList.contains('none')) {
                elements.settingsModal.classList.add('none');
            }

            // Cerrar modal de diálogo personalizado si está abierta
            const customDialogOverlay = document.getElementById('customDialogOverlay');
            if (customDialogOverlay && customDialogOverlay.style.display !== 'none') {
                customDialogOverlay.style.display = 'none';
            }

            // Cerrar menú desplegable si está abierto
            if (settingsMenuDropdown && settingsMenuDropdown.style.display !== 'none') {
                settingsMenuDropdown.style.display = 'none';
            }
        }
    });

    // Event listeners para navegacion de configuraciones
    const settingsNavItems = document.querySelectorAll('.settings-nav-item');
    const settingsSections = document.querySelectorAll('.settings-section');

    settingsNavItems.forEach(navItem => {
        navItem.addEventListener('click', () => {
            const sectionName = navItem.dataset.section;

            // Cambiar item activo en el menu
            settingsNavItems.forEach(item => item.classList.remove('active'));
            navItem.classList.add('active');

            // Mostrar seccion correspondiente
            settingsSections.forEach(section => {
                if (section.dataset.section === sectionName) {
                    section.classList.add('active');
                } else {
                    section.classList.remove('active');
                }
            });

            // Cargar modelos si se abre la seccion de modelos
            if (sectionName === 'modelos') {
                loadOllamaModels();
            }

            // Cargar documentos si se abre la seccion de documentos
            if (sectionName === 'documentos') {
                loadDocumentPaths();
                loadIndexationStatus();
            }

            // Cargar personalizacion si se abre la seccion de personalizacion
            if (sectionName === 'personalizacion') {
                loadPersonalization();
            }

            // Cargar seguridad si se abre la seccion de seguridad
            if (sectionName === 'seguridad') {
                loadEncryptionStatus();
            }
        });
    });

    // Event listener para cambio de modelo
    elements.modelSelect.addEventListener('change', changeModel);

    // Event listener para cambiar foto de perfil
    elements.changeProfilePictureBtn.addEventListener('click', changeProfilePicture);

    // Event listener para guardar informacion personal (Perfil)
    const saveUserInfoBtn = document.getElementById('saveUserInfoBtn');
    if (saveUserInfoBtn) {
        saveUserInfoBtn.addEventListener('click', saveUserInfo);
    }

    // Event listener para guardar personalizacion (Personalizacion)
    const savePersonalizationBtn = document.getElementById('savePersonalizationBtn');
    if (savePersonalizationBtn) {
        savePersonalizationBtn.addEventListener('click', savePersonalization);
    }

    // Event listeners para seccion de documentos
    const addDocPathBtn = document.getElementById('addDocPathBtn');
    const reindexDocsBtn = document.getElementById('reindexDocsBtn');
    const clearIndexBtn = document.getElementById('clearIndexBtn');

    if (addDocPathBtn) {
        addDocPathBtn.addEventListener('click', addDocPath);
    }
    if (reindexDocsBtn) {
        reindexDocsBtn.addEventListener('click', reindexDocuments);
    }
    if (clearIndexBtn) {
        clearIndexBtn.addEventListener('click', clearIndex);
    }

    // Event listeners para archivos adjuntos temporales
    const attachFileBtn = document.getElementById('attachFileBtn');
    const fileInput = document.getElementById('fileInput');
    const removeAllFilesBtn = document.getElementById('removeAllFilesBtn');

    if (attachFileBtn && fileInput) {
        attachFileBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', handleFileAttach);
    }
    if (removeAllFilesBtn) {
        removeAllFilesBtn.addEventListener('click', removeAttachedFile);
    }

    // Drag and Drop en el area de conversacion
    setupDragAndDrop();

    // Event listeners para Keep Alive de Ollama
    if (elements.ollamaKeepAliveSlider) {
        elements.ollamaKeepAliveSlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            updateKeepAliveDisplay(value);
        });
    }

    if (elements.ollamaKeepAlivePresets) {
        elements.ollamaKeepAlivePresets.forEach(btn => {
            btn.addEventListener('click', () => {
                const seconds = parseInt(btn.dataset.seconds);
                elements.ollamaKeepAliveSlider.value = seconds;
                updateKeepAliveDisplay(seconds);
            });
        });
    }

    // Event listeners para gestion de modelos
    const downloadModelBtn = document.getElementById('downloadModelBtn');
    const refreshModelsBtn = document.getElementById('refreshModelsBtn');

    if (downloadModelBtn) {
        downloadModelBtn.addEventListener('click', downloadOllamaModel);
    }

    if (refreshModelsBtn) {
        refreshModelsBtn.addEventListener('click', loadOllamaModels);
    }

    // Event listener para Enter en input de descarga
    const downloadModelInput = document.getElementById('downloadModel');
    if (downloadModelInput) {
        downloadModelInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                downloadOllamaModel();
            }
        });
    }

    // Event listeners para seguridad y cifrado
    const toggleEncryptionKeyBtn = document.getElementById('toggleEncryptionKeyBtn');
    const copyEncryptionKeyBtn = document.getElementById('copyEncryptionKeyBtn');
    const reloadEncryptionKeyBtn = document.getElementById('reloadEncryptionKeyBtn');
    const enableEncryptionBtn = document.getElementById('enableEncryptionBtn');

    if (toggleEncryptionKeyBtn) {
        toggleEncryptionKeyBtn.addEventListener('click', toggleEncryptionKey);
    }

    if (copyEncryptionKeyBtn) {
        copyEncryptionKeyBtn.addEventListener('click', copyEncryptionKey);
    }

    if (reloadEncryptionKeyBtn) {
        reloadEncryptionKeyBtn.addEventListener('click', async () => {
            console.log('🔄 Recargando clave manualmente...');
            await loadEncryptionKey();
            showNotification('info', 'Clave recargada');
        });
    }

    if (enableEncryptionBtn) {
        enableEncryptionBtn.addEventListener('click', enableEncryption);
    }
}
