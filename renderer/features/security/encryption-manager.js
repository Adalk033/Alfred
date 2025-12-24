import { showNotification } from '../../core/notifications.js';
import { showAlert } from '../../core/dialogs.js';
import * as State from '../../state/state.js';
import { loadSettings } from '../settings/settings-manager.js';
import { loadProfilePicture, loadUserInfo } from '../user/profile-manager.js';

// Global encryption state
let actualEncryptionKey = '';
let encryptionKeyVisible = false;
let welcomeProfilePictureData = null;

// ==================== WELCOME MODAL ====================

// Check and show welcome modal on first launch
export async function checkAndShowWelcomeModal() {
    try {
        const response = await fetch('http://127.0.0.1:8000/settings/welcome/status');
        const data = await response.json();

        if (data.success && data.needs_welcome) {
            // Show welcome modal
            const modal = document.getElementById('firstTimeWelcomeModal');
            if (modal) {
                modal.style.display = 'flex';

                // Configure profile picture preview
                const profileInput = document.getElementById('welcomeProfileInput');
                const profilePreview = document.getElementById('welcomeProfilePreview');

                if (profileInput && profilePreview) {
                    profileInput.addEventListener('change', (e) => {
                        const file = e.target.files[0];
                        if (file) {
                            const reader = new FileReader();
                            reader.onload = (event) => {
                                welcomeProfilePictureData = event.target.result;
                                profilePreview.innerHTML = `<img src="${event.target.result}" alt="Preview">`;
                            };
                            reader.readAsDataURL(file);
                        }
                    });
                }

                // Configure buttons
                const continueBtn = document.getElementById('welcomeContinueBtn');
                const skipBtn = document.getElementById('welcomeSkipBtn');

                if (continueBtn) {
                    continueBtn.onclick = async () => {
                        await completeWelcomeSetup();
                        modal.style.display = 'none';
                    };
                }

                if (skipBtn) {
                    skipBtn.onclick = async () => {
                        // Skip without saving anything
                        await completeWelcomeSetup();
                        modal.style.display = 'none';
                    };
                }
            }
        }
    } catch (error) {
        console.error('Error al verificar estado de bienvenida:', error);
    }
}

// Complete welcome setup
export async function completeWelcomeSetup() {
    try {
        const userName = document.getElementById('welcomeName')?.value.trim();
        const userAge = document.getElementById('welcomeAge')?.value;

        const requestData = {};

        // Only include fields if they have value
        if (userName) {
            requestData.user_name = userName;
        }

        if (userAge && parseInt(userAge) > 0) {
            requestData.user_age = parseInt(userAge);
        }

        if (welcomeProfilePictureData) {
            requestData.profile_picture = welcomeProfilePictureData;
        }

        const response = await fetch('http://127.0.0.1:8000/settings/welcome/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestData)
        });

        const data = await response.json();

        if (data.success) {
            console.log('Configuracion de bienvenida completada');

            // Update local state if there's profile picture
            if (welcomeProfilePictureData) {
                State.updateSettings({ profilePicture: welcomeProfilePictureData });
                localStorage.setItem('alfred-settings', JSON.stringify(State.settings));
            }

            // Reload settings to show new data
            if (userName || userAge || welcomeProfilePictureData) {
                showNotification('success', 'Perfil configurado correctamente');

                // Reload data in UI
                setTimeout(() => {
                    loadSettings();
                    loadProfilePicture();
                    loadUserInfo();
                }, 500);
            }
        } else {
            console.error('Error al completar bienvenida:', data);
        }
    } catch (error) {
        console.error('Error al completar bienvenida:', error);
    }
}

// ==================== ENCRYPTION MODAL ====================

// Check and show first time encryption modal
export async function checkAndShowFirstTimeEncryptionModal() {
    try {
        const response = await fetch('http://127.0.0.1:8000/settings/encryption/status');
        const data = await response.json();

        if (data.success && data.needs_setup) {
            // Show first time installation modal
            const modal = document.getElementById('firstTimeEncryptionModal');
            if (modal) {
                modal.style.display = 'flex';

                // Configure event listener for modal button
                const enableBtn = document.getElementById('firstTimeEnableEncryption');

                if (enableBtn) {
                    enableBtn.onclick = async () => {
                        await setupEncryptionFirstTime(true);
                        modal.style.display = 'none';
                    };
                }
            }
        }
    } catch (error) {
        console.error('Error al verificar estado de cifrado:', error);
    }
}

// Setup encryption for first time from initial modal
export async function setupEncryptionFirstTime(enableEncryption) {
    try {
        const response = await fetch('http://127.0.0.1:8000/settings/encryption/setup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enable_encryption: enableEncryption })
        });

        const data = await response.json();

        if (data.success) {
            if (enableEncryption && data.key) {
                // IMPORTANT: Save key in global variable
                actualEncryptionKey = data.key;
                console.log('Clave guardada en memoria:', actualEncryptionKey.substring(0, 20) + '...');

                // Show notification with key
                showNotification('success', 'Cifrado habilitado correctamente');

                // Show alert with key
                setTimeout(async () => {
                    await showAlert(
                        `${data.key}\n\n` +
                        'Guarda esta clave en un lugar seguro.\n' +
                        'Si la pierdes, no podras recuperar tus datos.\n\n' +
                        'Puedes verla en cualquier momento en:\n' +
                        'Configuracion → Seguridad',
                        'Tu clave de cifrado',
                        'warning'
                    );
                }, 500);
            } else {
                showNotification('warning', 'Continuando sin cifrado - datos en texto plano');
            }
        } else {
            showNotification('error', data.message || 'Error al configurar cifrado');
        }
    } catch (error) {
        console.error('Error al configurar cifrado:', error);
        showNotification('error', 'Error al configurar cifrado');
    }
}

// ==================== ENCRYPTION STATUS ====================

// Load encryption status
export async function loadEncryptionStatus() {
    try {
        const response = await fetch('http://127.0.0.1:8000/settings/encryption/status');
        const data = await response.json();

        if (data.success) {
            const firstSetup = document.getElementById('securityFirstSetup');
            const securityStatus = document.getElementById('securityStatus');

            if (data.needs_setup) {
                // Show first setup dialog
                if (firstSetup) firstSetup.style.display = 'block';
                if (securityStatus) securityStatus.style.display = 'none';
            } else {
                // Show current status
                if (firstSetup) firstSetup.style.display = 'none';
                if (securityStatus) securityStatus.style.display = 'block';

                // Update status badge
                const statusBadge = document.getElementById('encryptionStatusBadge');
                const statusText = document.getElementById('encryptionStatusText');
                const keyGroup = document.getElementById('encryptionKeyGroup');

                if (data.encryption_enabled) {
                    if (statusBadge) {
                        statusBadge.classList.add('status-enabled');
                        statusBadge.classList.remove('status-disabled');
                    }
                    if (statusText) statusText.textContent = 'Cifrado habilitado';
                    if (keyGroup) keyGroup.style.display = 'block';

                    // Load encryption key
                    await loadEncryptionKey();
                } else {
                    if (statusBadge) {
                        statusBadge.classList.add('status-disabled');
                        statusBadge.classList.remove('status-enabled');
                    }
                    if (statusText) statusText.textContent = 'Cifrado deshabilitado';
                    if (keyGroup) keyGroup.style.display = 'none';
                }
            }
        }
    } catch (error) {
        console.error('Error al cargar estado de cifrado:', error);
        showNotification('error', 'Error al cargar configuracion de seguridad');
    }
}

// Load encryption key
export async function loadEncryptionKey() {
    try {
        console.log('🔑 Intentando cargar clave de cifrado...');
        const response = await fetch('http://127.0.0.1:8000/settings/encryption/key');

        if (!response.ok) {
            console.error('Error HTTP:', response.status, response.statusText);
            const errorText = await response.text();
            console.error('Respuesta del servidor:', errorText);
            showNotification('error', 'Error al cargar clave: ' + response.status);
            return;
        }

        const data = await response.json();
        console.log('📦 Respuesta del servidor:', data);

        if (data.success && data.key) {
            actualEncryptionKey = data.key;
            console.log('Clave de cifrado cargada correctamente');
            console.log('Longitud de la clave:', actualEncryptionKey.length);
            console.log('Primeros 20 caracteres:', actualEncryptionKey.substring(0, 20) + '...');

            // Show dots by default
            const keyField = document.getElementById('encryptionKeyField');
            if (keyField) {
                keyField.value = '••••••••••••••••••••••••••••••••';
                encryptionKeyVisible = false;
                console.log('Campo de clave actualizado con puntos');
            } else {
                console.error('No se encontro el campo encryptionKeyField');
            }
        } else {
            console.error('Respuesta invalida del servidor:', data);
            showNotification('error', 'La respuesta del servidor no contiene la clave');
        }
    } catch (error) {
        console.error('Error al cargar clave de cifrado:', error);
        console.error('Detalles:', error.message, error.stack);
        showNotification('error', 'Error al cargar la clave: ' + error.message);
    }
}

// ==================== ENCRYPTION KEY MANAGEMENT ====================

// Toggle show/hide encryption key
export function toggleEncryptionKey() {
    const keyField = document.getElementById('encryptionKeyField');
    const eyeIcon = document.getElementById('eyeIcon');

    if (!keyField || !eyeIcon) {
        console.error('No se encontraron los elementos necesarios');
        console.error('keyField:', keyField);
        console.error('eyeIcon:', eyeIcon);
        return;
    }

    if (!actualEncryptionKey) {
        showNotification('error', 'Clave no disponible. Haz clic en el boton de recargar (↻)');
        console.error('actualEncryptionKey esta vacio');
        return;
    }

    console.log('Toggle clave - Estado actual:', encryptionKeyVisible);
    console.log('Clave disponible (primeros 20 chars):', actualEncryptionKey.substring(0, 20) + '...');

    if (encryptionKeyVisible) {
        // Hide
        keyField.type = 'password';
        keyField.value = '••••••••••••••••••••••••••••••••';
        eyeIcon.innerHTML = `
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
        `;
        encryptionKeyVisible = false;
        console.log('Clave ocultada');
    } else {
        // Show
        keyField.type = 'text';
        keyField.value = actualEncryptionKey;
        eyeIcon.innerHTML = `
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
            <line x1="1" y1="1" x2="23" y2="23"></line>
        `;
        encryptionKeyVisible = true;
        console.log('Clave mostrada:', keyField.value);
    }
}

// Copy encryption key to clipboard
export async function copyEncryptionKey() {
    try {
        if (!actualEncryptionKey) {
            showNotification('error', 'Clave no disponible. Recarga la pagina.');
            return;
        }

        await navigator.clipboard.writeText(actualEncryptionKey);
        showNotification('success', 'Clave copiada al portapapeles');
        console.log('Clave copiada exitosamente');
    } catch (error) {
        console.error('Error al copiar clave:', error);
        showNotification('error', 'Error al copiar la clave');
    }
}

// Enable encryption (first time)
export async function enableEncryption() {
    try {
        const response = await fetch('http://127.0.0.1:8000/settings/encryption/setup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enable_encryption: true })
        });

        const data = await response.json();

        if (data.success) {
            showNotification('success', 'Cifrado habilitado correctamente');

            // Show key to user
            if (data.key) {
                actualEncryptionKey = data.key;
                await loadEncryptionStatus();

                // Additional notification with warning
                setTimeout(() => {
                    showNotification('warning', 'Guarda tu clave de cifrado en un lugar seguro');
                }, 1000);
            }
        } else {
            showNotification('error', data.message || 'Error al habilitar cifrado');
        }
    } catch (error) {
        console.error('Error al habilitar cifrado:', error);
        showNotification('error', 'Error al habilitar cifrado');
    }
}
