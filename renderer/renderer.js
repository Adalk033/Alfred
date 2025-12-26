import { showNotification } from './core/notifications.js';
import { addMessage, updateStatus } from './dom/dom-utils.js';
import { createNewConversation, loadConversations, loadConversation, deleteConversationById } from './core/conversations.js';
import * as State from './state/state.js';
import { getCryptoManager } from './crypto/crypto.js';
import { initializeSidebar, toggleLeftSidebar, closeSidebarOnMobile, hideLeftSidebarContent, setActiveNavItem, loadSidebarState } from './dom/sidebar.js';
import { sendMessage } from './core/messages.js';
import { setupBackendListeners } from './features/backend/backend-listeners.js';
import { handleFileAttach, removeAttachedFile, setupDragAndDrop } from './features/attachments/file-handler.js';
import { showHistory } from './features/history/history-manager.js';
import { loadIndexationStatus, loadDocumentPaths, addDocPath, browseDocPath, toggleDocPath, removeDocPath, reindexDocuments, clearIndex } from './features/documents/documents-manager.js';
import { loadProfilePicture, changeProfilePicture, loadUserInfo, loadPersonalization, saveUserInfo, savePersonalization } from './features/user/profile-manager.js';
import { initializeOllamaElements, loadOllamaKeepAlive, updateKeepAliveDisplay, loadModelsIntoSelector, loadOllamaModels, downloadOllamaModel, selectModel, deleteModel, loadCurrentModel, changeModel } from './features/models/ollama-manager.js';
import { checkAndShowWelcomeModal, checkAndShowFirstTimeEncryptionModal, loadEncryptionStatus, loadEncryptionKey, toggleEncryptionKey, copyEncryptionKey, enableEncryption } from './features/security/encryption-manager.js';
import { loadSettings, saveSettingsHandler } from './features/settings/settings-manager.js';
import { showConversations } from './features/conversations/conversations-manager.js';
import { MODES, THEMES, setMode, loadMode, setTheme, loadTheme, getCurrentMode } from './features/appearance/themes-manager.js';

// Setup backend listeners
setupBackendListeners(updateConnectionStatus);

// Elementos del DOM (locales a renderer.js)
let historyBtn;
let settingsBtn;
let menuToggle;
let leftSidebar;
let leftSidebarContent;
let newChatBtn;
let conversationsBtn;
let profilePictureTopbar;

// Indicador de modo en topbar
let modeIndicator;
let modeIndicatorName;

// Botones de modo de busqueda
let searchDocsBtn;
let promptOnlyBtn;

// Selector de modelo
let modelSelect;

// Modal de configuracion
let settingsModal;
let closeSettings;
let cancelSettings;
let saveSettings;

// Elementos de foto de perfil
let changeProfilePictureBtn;
let currentProfilePicture;
let profileHistoryGallery;
let profileHistoryCount;
let ollamaKeepAliveSlider;
let ollamaKeepAliveValue;
let ollamaKeepAlivePresets;

// Inicializacion
document.addEventListener('DOMContentLoaded', async () => {
    // Inicializar elementos del DOM en State
    State.setDOMElements({
        messagesContainer: document.getElementById('messages'),
        messageInput: document.getElementById('messageInput'),
        sendBtn: document.getElementById('sendBtn'),
        typingIndicator: document.getElementById('typingIndicator'),
        statusElement: document.getElementById('status'),
        sidebar: document.getElementById('leftSidebarContent'), // Ahora usamos el contenedor del sidebar izquierdo
        sidebarTitle: null, // Ya no necesitamos titulo separado
        sidebarContent: document.getElementById('leftSidebarContent')
    });

    // Inicializar elementos locales
    historyBtn = document.getElementById('historyBtn');
    settingsBtn = document.getElementById('settingsBtn');
    searchDocsBtn = document.getElementById('searchDocsBtn');
    promptOnlyBtn = document.getElementById('promptOnlyBtn');
    modelSelect = document.getElementById('modelSelect');
    settingsModal = document.getElementById('settingsModal');
    closeSettings = document.getElementById('closeSettings');
    cancelSettings = document.getElementById('cancelSettings');
    saveSettings = document.getElementById('saveSettings');
    changeProfilePictureBtn = document.getElementById('changeProfilePictureBtn');
    currentProfilePicture = document.getElementById('currentProfilePicture');
    profileHistoryGallery = document.getElementById('profileHistoryGallery');
    profileHistoryCount = document.getElementById('profileHistoryCount');
    ollamaKeepAliveSlider = document.getElementById('ollamaKeepAlive');
    ollamaKeepAliveValue = document.getElementById('ollamaKeepAliveValue');
    ollamaKeepAlivePresets = document.querySelectorAll('.preset-btn');

    // Elementos del sidebar izquierdo
    menuToggle = document.getElementById('menuToggle');
    leftSidebar = document.getElementById('leftSidebar');
    leftSidebarContent = document.getElementById('leftSidebarContent');
    newChatBtn = document.getElementById('newChatBtn');
    conversationsBtn = document.getElementById('conversationsBtn');
    profilePictureTopbar = document.getElementById('profilePictureTopbar');

    // Indicador de modo en topbar
    modeIndicator = document.getElementById('modeIndicator');
    modeIndicatorName = modeIndicator ? modeIndicator.querySelector('.mode-name') : null;

    // Initialize Ollama manager elements
    initializeOllamaElements();

    // Inicializar sidebar con referencias DOM
    initializeSidebar({
        leftSidebar,
        leftSidebarContent,
        menuToggle
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

    setupEventListeners();
    loadSettings();
    await loadCurrentModel();
    await loadOllamaKeepAlive(); // Cargar configuracion de keep_alive
    loadProfilePicture();
    await loadUserInfo(); // Cargar informacion personal del usuario
    await loadConversations(); // Cargar conversaciones al inicio

    // Cargar versiones de la aplicacion en seccion "Acerca de"
    loadAppVersions();

    // Auto-ajustar altura del textarea
    State.messageInput.addEventListener('input', () => {
        State.messageInput.style.height = 'auto';
        State.messageInput.style.height = State.messageInput.scrollHeight + 'px';
    });
});

// Configurar event listeners
function setupEventListeners() {
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
    searchDocsBtn.addEventListener('click', () => {
        State.setSearchMode('documents');
        searchDocsBtn.classList.add('active');
        promptOnlyBtn.classList.remove('active');
    });

    promptOnlyBtn.addEventListener('click', () => {
        State.setSearchMode('prompt');
        promptOnlyBtn.classList.add('active');
        searchDocsBtn.classList.remove('active');
    });

    historyBtn.addEventListener('click', () => {
        showHistory();
        closeSidebarOnMobile();
    });
    settingsBtn.addEventListener('click', () => {
        settingsModal.classList.remove('none');
        closeSidebarOnMobile();
    });

    // Event listeners del sidebar izquierdo
    menuToggle.addEventListener('click', toggleLeftSidebar);
    newChatBtn.addEventListener('click', () => {
        window.createNewConversation();
        hideLeftSidebarContent();
        setActiveNavItem(null);
        closeSidebarOnMobile();
    });
    conversationsBtn.addEventListener('click', () => {
        showConversations();
        closeSidebarOnMobile();
    });

    // Event listener para foto de perfil en el topbar
    profilePictureTopbar.addEventListener('click', () => {
        settingsModal.classList.remove('none');
    });

    // Event listeners para botones de modo en el nuevo menu
    const modeMenuItems = document.querySelectorAll('.mode-menu-item');
    modeMenuItems.forEach(btn => {
        btn.addEventListener('click', async () => {
            const mode = btn.dataset.mode;

            // Cambiar clase active
            modeMenuItems.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Cerrar menu
            settingsMenuDropdown.style.display = 'none';

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
            settingsMenuDropdown.style.display = 'none';

            // Cambiar tema en la aplicacion
            await window.setTheme(theme);
        });
    });

    // Event listener para abrir/cerrar el menu de configuracion
    const settingsMenuBtn = document.getElementById('settingsMenuBtn');
    const settingsMenuDropdown = document.getElementById('settingsMenuDropdown');

    settingsMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isVisible = settingsMenuDropdown.style.display !== 'none';
        settingsMenuDropdown.style.display = isVisible ? 'none' : 'flex';
    });

    // Cerrar menu al hacer clic fuera
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.settings-menu-container')) {
            settingsMenuDropdown.style.display = 'none';
        }
    });

    closeSettings.addEventListener('click', () => settingsModal.classList.add('none'));
    cancelSettings.addEventListener('click', () => settingsModal.classList.add('none'));
    saveSettings.addEventListener('click', saveSettingsHandler);

    // Event listener para cerrar modales con tecla ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            // Cerrar modal de configuraciones si está abierta
            if (settingsModal && !settingsModal.classList.contains('none')) {
                settingsModal.classList.add('none');
            }

            // Cerrar modal de diálogo personalizado si está abierta
            const customDialogOverlay = document.getElementById('customDialogOverlay');
            if (customDialogOverlay && customDialogOverlay.style.display !== 'none') {
                customDialogOverlay.style.display = 'none';
            }

            // Cerrar menú desplegable si está abierto
            const settingsMenuDropdown = document.getElementById('settingsMenuDropdown');
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
    modelSelect.addEventListener('change', changeModel);

    // Event listener para cambiar foto de perfil
    changeProfilePictureBtn.addEventListener('click', changeProfilePicture);

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
    if (ollamaKeepAliveSlider) {
        ollamaKeepAliveSlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            updateKeepAliveDisplay(value);
        });
    }

    if (ollamaKeepAlivePresets) {
        ollamaKeepAlivePresets.forEach(btn => {
            btn.addEventListener('click', () => {
                const seconds = parseInt(btn.dataset.seconds);
                ollamaKeepAliveSlider.value = seconds;
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

// Esperar a que el backend este completamente listo
// NOTA: Esta función YA NO oculta el loader automáticamente
// El loader se mantiene visible hasta que main.js envíe 'backend-ready'
async function waitForBackendReady() {
    const API_BASE_URL = 'http://127.0.0.1:8000';
    const MAX_RETRIES = 5500; // 5500 intentos = 120 minutos
    const RETRY_INTERVAL = 1300; // 1.3 segundos

    // Referencias al overlay (NO lo ocultaremos aquí)
    const overlay = document.getElementById('backendLoadingOverlay');
    const statusText = document.getElementById('loadingStatusText');
    const progressBar = document.getElementById('loadingProgressBar');

    // Deshabilitar input mientras se espera
    if (State.messageInput) {
        State.messageInput.disabled = true;
        State.messageInput.placeholder = 'Iniciando Alfred...';
    }
    if (State.sendBtn) {
        State.sendBtn.disabled = true;
    }

    updateStatus('warning', 'Iniciando backend...', State.statusElement);

    let retries = 0;

    while (retries < MAX_RETRIES) {
        try {
            // Actualizar progreso visual
            const progress = (retries / MAX_RETRIES) * 100;
            if (progressBar) {
                progressBar.style.width = `${progress}%`;
            }

            // Intentar llamar al endpoint /health
            const response = await fetch(`${API_BASE_URL}/health`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json();

                // Verificar que alfred_core este inicializado, vectorstore cargado Y lifespan ready
                // Aceptar tanto "healthy" como "degraded" (degraded = componentes opcionales fallan)
                const isReady = (data.status === 'healthy' || data.status === 'degraded')
                    && data.alfred_core_initialized
                    && data.vectorstore_loaded
                    && data.is_fully_initialized === true;  // NUEVA: Verificar que initialize_async() completo

                if (isReady) {
                    // Backend esta completamente listo!
                    if (progressBar) {
                        progressBar.style.width = '100%';
                    }
                    if (statusText) {
                        statusText.textContent = 'Alfred esta listo!';
                    }

                    // NO ocultar el overlay aquí - esperamos la señal de 'backend-ready' desde main.js
                    // El loader permanecerá visible hasta que main.js confirme todo

                    updateStatus('connected', 'Conectado', State.statusElement);

                    // showNotification ya se mostrará cuando se reciba 'backend-ready'
                    return true;
                }

                // Backend responde pero no esta completamente listo
                if (statusText) {
                    if (!data.is_fully_initialized) {
                        statusText.textContent = 'Inicializando sistema de IA...';
                    } else if (!data.alfred_core_initialized) {
                        statusText.textContent = 'Configurando Alfred Core...';
                    } else if (!data.vectorstore_loaded) {
                        statusText.textContent = 'Cargando documentos...';
                    } else {
                        statusText.textContent = 'Preparando recursos...';
                    }
                }
                updateStatus('warning', 'Cargando...', State.statusElement);
            }
        } catch (error) {
            // Error de conexion - backend aun no responde
            console.log(`Esperando backend... intento ${retries + 1}/${MAX_RETRIES}`);

            if (statusText) {
                const dots = '.'.repeat((retries % 3) + 1);
                statusText.textContent = `Conectando con el backend${dots}`;
            }
        }

        // Esperar antes del siguiente intento
        await new Promise(resolve => setTimeout(resolve, RETRY_INTERVAL));
        retries++;

        // Actualizar mensaje de estado
        const dots = '.'.repeat((retries % 3) + 1);
        updateStatus('warning', `Iniciando backend${dots}`, State.statusElement);
    }

    // Si llegamos aqui, el backend no se inicio en el tiempo esperado
    // NO ocultar el loader - dejar que el usuario vea el error en el loader
    if (statusText) {
        statusText.textContent = 'Error: Backend no responde despues de 2 minutos';
    }
    if (progressBar) {
        progressBar.style.width = '0%'; // Resetear barra a 0 para indicar error
    }

    updateStatus('error', 'Error al iniciar backend', State.statusElement);
    showNotification('error', 'No se pudo conectar con el backend. Revisa los logs en la consola.');

    return false;
}

// Verificar estado del servidor
async function checkServerStatus() {
    try {
        const result = await window.alfredAPI.checkServer();
        if (result.success || result.connected) {
            updateStatus('connected', 'Conectado', State.statusElement);
        } else {
            updateStatus('error', 'Desconectado', State.statusElement);
            showNotification('No se pudo conectar con el servidor de Alfred. Asegúrate de que esté ejecutándose.', 'Hubo un error al conectar con el servidor de Alfred. Asegúrate de que esté ejecutándose.');
        }
    } catch (error) {
        updateStatus('error', 'Error de conexión', State.statusElement);
        showNotification('Error al verificar el servidor', 'Hubo un error al verificar el estado del servidor.');
    }
}

// Funcion para reiniciar backend manualmente
async function restartBackend() {
    try {
        showNotification('info', 'Reiniciando servidor...');
        const result = await window.alfredAPI.restartBackend();

        if (result.success) {
            showNotification('success', 'Servidor reiniciado correctamente');
            await checkServerStatus();
        } else {
            showNotification('error', 'Error al reiniciar el servidor');
        }
    } catch (error) {
        console.error('Error al reiniciar backend:', error);
        showNotification('error', 'Error al reiniciar el servidor');
    }
}

// Función para detener Ollama y liberar recursos
function stopOllama() {
    // Mostrar mensaje inmediatamente sin confirmación bloqueante
    showNotification('info', 'Deteniendo Ollama en segundo plano...');
    addMessage('🛑 Deteniendo Ollama para liberar recursos...', 'system');

    // Ejecutar en segundo plano sin await
    window.alfredAPI.stopOllama()
        .then(result => {
            if (result.success) {
                showNotification('success', result.data.message || 'Ollama detenido exitosamente');
                // Actualizar el mensaje del sistema
                const systemMessages = State.messagesContainer.querySelectorAll('.message.system');
                const lastSystemMsg = systemMessages[systemMessages.length - 1];
                if (lastSystemMsg && lastSystemMsg.textContent.includes('Deteniendo Ollama')) {
                    lastSystemMsg.querySelector('.message-bubble').textContent = '🛑 Ollama detenido. Recursos liberados. Se recargará automáticamente en la próxima pregunta.';
                }
            } else {
                showNotification('error', result.error || 'Error al detener Ollama');
                // Actualizar el mensaje con error
                const systemMessages = State.messagesContainer.querySelectorAll('.message.system');
                const lastSystemMsg = systemMessages[systemMessages.length - 1];
                if (lastSystemMsg && lastSystemMsg.textContent.includes('Deteniendo Ollama')) {
                    lastSystemMsg.querySelector('.message-bubble').textContent = '❌ Error al detener Ollama.';
                }
            }
        })
        .catch(error => {
            console.error('Error al detener Ollama:', error);
            showNotification('error', 'Error al detener Ollama');
            if (State.messagesContainer) {
                const systemMessages = State.messagesContainer.querySelectorAll('.message.system');
                const lastSystemMsg = systemMessages[systemMessages.length - 1];
                if (lastSystemMsg && lastSystemMsg.textContent.includes('Deteniendo Ollama')) {
                    lastSystemMsg.querySelector('.message-bubble').textContent = '❌ Error al detener Ollama.';
                }
            }
        });

    // Retornar inmediatamente para no bloquear la UI
}

// Función auxiliar para actualizar estado de conexión
function updateConnectionStatus(connected) {
    if (connected) {
        updateStatus('connected', 'Conectado', State.statusElement);
    } else {
        updateStatus('error', 'Desconectado', State.statusElement);
    }
}

// ===============================================
// EXPONER FUNCIONES GLOBALMENTE PARA onclick
// ===============================================
window.toggleDocPath = toggleDocPath;
window.browseDocPath = browseDocPath;
window.removeDocPath = removeDocPath;
window.addDocPath = addDocPath;
window.reindexDocuments = reindexDocuments;
window.clearIndex = clearIndex;

// ===============================================
// GLOBAL EXPORTS FOR HTML ONCLICK HANDLERS
// ===============================================

// Exponer funciones globalmente para los botones HTML
// Global exports for HTML onclick handlers
window.selectModel = selectModel;
window.deleteModel = deleteModel;
window.loadConversation = loadConversation;
window.deleteConversationById = deleteConversationById;
window.createNewConversation = createNewConversation;
window.stopOllama = stopOllama;
window.restartBackend = restartBackend;
window.setMode = setMode;
window.setTheme = setTheme;
window.getCurrentMode = getCurrentMode;
window.MODES = MODES;
window.THEMES = THEMES;

// Funciones de documentos
window.addDocPath = addDocPath;
window.browseDocPath = browseDocPath;
window.removeDocPath = removeDocPath;
window.reindexDocuments = reindexDocuments;

// ============================================
// SECCION: ACERCA DE - VERSIONES
// ============================================

/**
 * Carga las versiones de la aplicacion, Electron, Node.js y Chrome
 * en la seccion "Acerca de" de configuracion
 */
function loadAppVersions() {
    try {
        // Version de la aplicacion (desde package.json)
        const appVersionEl = document.getElementById('appVersion');
        if (appVersionEl) {
            appVersionEl.textContent = '0.0.25';
        }

        // Versiones de Electron, Node.js y Chrome (desde process.versions)
        if (window.alfredAPI && window.alfredAPI.getVersions) {
            window.alfredAPI.getVersions().then(versions => {
                const electronVersionEl = document.getElementById('electronVersion');
                const nodeVersionEl = document.getElementById('nodeVersion');
                const chromeVersionEl = document.getElementById('chromeVersion');

                if (electronVersionEl && versions.electron) {
                    electronVersionEl.textContent = versions.electron;
                }
                if (nodeVersionEl && versions.node) {
                    nodeVersionEl.textContent = versions.node;
                }
                if (chromeVersionEl && versions.chrome) {
                    chromeVersionEl.textContent = versions.chrome;
                }
            }).catch(error => {
                console.error('[ABOUT] Error al cargar versiones:', error);
            });
        }
    } catch (error) {
        console.error('[ABOUT] Error al inicializar versiones:', error);
    }
}