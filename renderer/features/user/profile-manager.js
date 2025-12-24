import { showNotification } from '../../core/notifications.js';
import * as State from '../../state/state.js';
import { getCryptoManager } from '../../crypto/crypto.js';

// ==================== PROFILE PICTURE MANAGEMENT ====================

// Load profile picture from backend and update UI
export async function loadProfilePicture() {
    try {
        console.log('🖼️ Cargando foto de perfil desde backend...');
        const result = await window.alfredAPI.getProfilePicture();

        if (result.success && result.data) {
            const { current, history } = result.data;
            
            console.log('📦 Datos recibidos del backend:', {
                hasCurrent: !!current,
                currentLength: current?.length,
                isEncrypted: current?.startsWith('gAAAAAB'),
                historyCount: history?.length || 0
            });
            
            // Get crypto manager
            const cryptoManager = getCryptoManager();
            
            // Decrypt profile picture using IPC (Main Process with Fernet)
            let decryptedCurrent = current;
            if (current && cryptoManager.isFernetEncrypted(current)) {
                console.log('🔓 Descifrando foto de perfil con Fernet...');
                try {
                    const decryptResult = await window.alfredAPI.decryptFernet(current);
                    if (decryptResult.success) {
                        decryptedCurrent = decryptResult.data;
                        console.log('✅ Foto descifrada correctamente, longitud:', decryptedCurrent?.length);
                    } else {
                        console.error('❌ Error al descifrar con Fernet:', decryptResult.error);
                        decryptedCurrent = current;
                    }
                } catch (decryptError) {
                    console.error('❌ Excepcion al descifrar:', decryptError);
                    decryptedCurrent = current;
                }
            } else {
                console.log('ℹ️ Foto no requiere descifrado (texto plano o vacia)');
            }

            // Update local state
            State.updateSettings({
                profilePicture: decryptedCurrent,
                profilePictureHistory: history || []
            });

            // Save to localStorage for use in messages
            localStorage.setItem('alfred-settings', JSON.stringify(State.settings));

            // Update UI
            if (decryptedCurrent) {
                updateProfilePictureDisplay(decryptedCurrent);
            }
            updateProfileHistory();

            console.log('✅ Foto de perfil cargada:', {
                hasCurrent: !!decryptedCurrent,
                historyCount: history?.length || 0,
                isValidDataUrl: decryptedCurrent?.startsWith('data:')
            });
        } else {
            console.log('ℹ️ No hay foto de perfil guardada');
            State.updateSettings({
                profilePicture: null,
                profilePictureHistory: []
            });
        }
    } catch (error) {
        console.error('❌ Error al cargar foto de perfil:', error);
        State.updateSettings({
            profilePicture: null,
            profilePictureHistory: []
        });
    }
}

// Update profile picture display in UI
export function updateProfilePictureDisplay(imageDataUrl) {
    const currentProfilePicture = document.getElementById('currentProfilePicture');
    const profilePictureTopbar = document.getElementById('profilePictureTopbar');

    // Update in settings modal
    if (currentProfilePicture) {
        currentProfilePicture.innerHTML = '';
        const img = document.createElement('img');
        img.src = imageDataUrl;
        img.alt = 'Foto de perfil';
        currentProfilePicture.appendChild(img);
    }

    // Update in topbar
    if (profilePictureTopbar) {
        profilePictureTopbar.innerHTML = '';
        const imgTopbar = document.createElement('img');
        imgTopbar.src = imageDataUrl;
        imgTopbar.alt = 'Foto de perfil';
        profilePictureTopbar.appendChild(imgTopbar);
    }
}

// Change profile picture
export async function changeProfilePicture() {
    try {
        console.log('🖼️ Iniciando seleccion de foto de perfil...');

        const result = await window.alfredAPI.selectProfilePicture();

        console.log('📥 Resultado de seleccion:', {
            success: result.success,
            hasData: !!result.data,
            dataLength: result.data?.length,
            error: result.error
        });

        if (!result.success) {
            if (result.error !== 'Seleccion cancelada') {
                showNotification('error', `Error: ${result.error}`);
            }
            return;
        }

        if (result.success && result.data) {
            const newImageData = result.data;

            // Validate image size (max ~5MB in base64)
            const imageSizeKB = Math.round(newImageData.length / 1024);
            console.log(`📊 Tamaño de imagen: ${imageSizeKB} KB`);

            if (imageSizeKB > 5000) {
                showNotification('error', 'La imagen es demasiado grande (max 5MB). Por favor, usa una imagen mas pequeña.');
                return;
            }

            // Save to backend
            console.log('💾 Guardando foto en backend...');
            const saveResult = await window.alfredAPI.setProfilePicture(newImageData);

            if (!saveResult.success) {
                throw new Error(saveResult.error || 'Error al guardar foto');
            }

            // Update local state
            State.updateSettings({ profilePicture: newImageData });

            // Save to localStorage for use in messages
            localStorage.setItem('alfred-settings', JSON.stringify(State.settings));

            // Update UI
            updateProfilePictureDisplay(newImageData);

            // Reload history from backend
            await loadProfilePicture();

            console.log('✅ Foto de perfil guardada correctamente');
            showNotification('success', 'Foto de perfil actualizada correctamente');
        }
    } catch (error) {
        console.error('❌ Error al cambiar foto de perfil:', error);
        showNotification('error', `Error al guardar la foto: ${error.message}`);
    }
}

// Update profile history gallery
export function updateProfileHistory() {
    const profileHistoryGallery = document.getElementById('profileHistoryGallery');
    const profileHistoryCount = document.getElementById('profileHistoryCount');
    const currentProfilePicture = document.getElementById('currentProfilePicture');

    if (!profileHistoryGallery) return;

    profileHistoryGallery.innerHTML = '';

    // Ensure history exists
    if (!State.settings.profilePictureHistory) {
        State.updateSettings({ profilePictureHistory: [] });
    }

    const history = State.settings.profilePictureHistory;

    if (history.length === 0) {
        profileHistoryGallery.innerHTML = '<div class="no-history-message">No hay fotos en el historial</div>';
        if (profileHistoryCount) {
            profileHistoryCount.textContent = '0 fotos';
        }
        return;
    }

    if (profileHistoryCount) {
        profileHistoryCount.textContent = `${history.length} foto${history.length !== 1 ? 's' : ''}`;
    }

    history.forEach((imageData, index) => {
        const item = document.createElement('div');
        item.className = 'profile-history-item';

        // Mark as active if it's the current photo
        if (imageData === State.settings.profilePicture) {
            item.classList.add('active');
        }

        const img = document.createElement('img');
        img.src = imageData;
        img.alt = `Foto historica ${index + 1}`;

        // Click to restore photo
        img.addEventListener('click', () => restoreProfilePicture(imageData, index));

        // Delete button
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.innerHTML = '×';
        deleteBtn.title = 'Eliminar esta foto';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteProfilePicture(index);
        });

        item.appendChild(img);
        item.appendChild(deleteBtn);
        profileHistoryGallery.appendChild(item);
    });
}

// Restore profile picture from history
export async function restoreProfilePicture(imageData, index) {
    try {
        console.log('🔄 Restaurando foto del historial...');

        // Save the selected photo from history directly
        const saveResult = await window.alfredAPI.setProfilePicture(imageData);

        if (!saveResult.success) {
            throw new Error(saveResult.error || 'Error al restaurar foto');
        }

        // Update local state
        State.updateSettings({ profilePicture: imageData });

        // Save to localStorage for use in messages
        localStorage.setItem('alfred-settings', JSON.stringify(State.settings));

        // Update UI
        updateProfilePictureDisplay(imageData);

        // Reload history from backend
        await loadProfilePicture();

        console.log('✅ Foto restaurada correctamente');
        showNotification('success', 'Foto de perfil restaurada');
    } catch (error) {
        console.error('❌ Error al restaurar foto:', error);
        showNotification('error', `Error al restaurar foto: ${error.message}`);
    }
}

// Delete photo from history
export async function deleteProfilePicture(index) {
    try {
        console.log('🗑️ Eliminando foto del historial...');

        const imageToDelete = State.settings.profilePictureHistory[index];
        const currentProfilePicture = document.getElementById('currentProfilePicture');

        // If it's the current photo, delete from backend
        if (imageToDelete === State.settings.profilePicture) {
            const deleteResult = await window.alfredAPI.deleteProfilePicture();

            if (!deleteResult.success) {
                throw new Error(deleteResult.error || 'Error al eliminar foto');
            }

            State.updateSettings({ profilePicture: null });

            // Save to localStorage
            localStorage.setItem('alfred-settings', JSON.stringify(State.settings));

            if (currentProfilePicture) {
                currentProfilePicture.innerHTML = '<span class="default-avatar">👤</span>';
            }
        }

        // Remove from local history
        const newHistory = [...State.settings.profilePictureHistory];
        newHistory.splice(index, 1);

        // Save updated history to backend
        await window.alfredAPI.setUserSetting('profile_picture_history', newHistory, 'json');

        // Update local state
        State.updateSettings({ profilePictureHistory: newHistory });

        // Update UI
        updateProfileHistory();

        console.log('✅ Foto eliminada correctamente');
        showNotification('success', 'Foto eliminada del historial');
    } catch (error) {
        console.error('❌ Error al eliminar foto:', error);
        showNotification('error', `Error al eliminar foto: ${error.message}`);
    }
}

// ==================== USER INFORMATION MANAGEMENT ====================

// Load user personal information (Profile: name and age)
export async function loadUserInfo() {
    try {
        console.log('📋 Cargando informacion personal...');
        
        // Get crypto manager
        const cryptoManager = getCryptoManager();

        // Load name
        const nameResult = await window.alfredAPI.getUserSetting('user_name');
        if (nameResult.success && nameResult.data) {
            let userName = nameResult.data.value || '';
            
            console.log('📦 user_name recibido:', {
                length: userName?.length,
                isEncrypted: userName?.startsWith('gAAAAAB')
            });
            
            // Decrypt if necessary using IPC (Main Process with Fernet)
            if (cryptoManager.isFernetEncrypted(userName)) {
                console.log('🔓 Descifrando user_name con Fernet...');
                try {
                    const decryptResult = await window.alfredAPI.decryptFernet(userName);
                    if (decryptResult.success) {
                        userName = decryptResult.data;
                        console.log('✅ Nombre descifrado:', userName);
                    } else {
                        console.error('❌ Error al descifrar user_name:', decryptResult.error);
                    }
                } catch (decryptError) {
                    console.error('❌ Excepcion al descifrar user_name:', decryptError);
                }
            }
            
            const userNameInput = document.getElementById('userName');
            if (userNameInput) {
                userNameInput.value = userName;
                console.log('✅ Nombre cargado en UI:', userName);
            }
        }

        // Load age
        const ageResult = await window.alfredAPI.getUserSetting('user_age');
        if (ageResult.success && ageResult.data) {
            let userAge = ageResult.data.value || '';
            
            console.log('📦 user_age recibido:', {
                value: userAge,
                type: typeof userAge,
                isEncrypted: (typeof userAge === 'string' && userAge?.startsWith('gAAAAAB'))
            });
            
            // Decrypt if necessary using IPC (Main Process with Fernet)
            if (typeof userAge === 'string' && cryptoManager.isFernetEncrypted(userAge)) {
                console.log('🔓 Descifrando user_age con Fernet...');
                try {
                    const decryptResult = await window.alfredAPI.decryptFernet(userAge);
                    if (decryptResult.success) {
                        userAge = decryptResult.data;
                        console.log('✅ Edad descifrada:', userAge);
                    } else {
                        console.error('❌ Error al descifrar user_age:', decryptResult.error);
                    }
                } catch (decryptError) {
                    console.error('❌ Excepcion al descifrar user_age:', decryptError);
                }
            }
            
            const userAgeInput = document.getElementById('userAge');
            if (userAgeInput) {
                userAgeInput.value = userAge;
                console.log('✅ Edad cargada en UI:', userAge);
            }
        }

    } catch (error) {
        console.error('❌ Error al cargar informacion personal:', error);
    }
}

// Load personalization (Personalization: assistant, instructions, occupation, about you)
export async function loadPersonalization() {
    try {
        console.log('📋 Cargando personalizacion...');

        // Load assistant name
        const assistantResult = await window.alfredAPI.getUserSetting('assistant_name');
        const assistantNameInput = document.getElementById('assistantName');
        if (assistantResult.success && assistantResult.data && assistantNameInput) {
            const assistantName = assistantResult.data.value || 'Alfred';
            assistantNameInput.value = assistantName;
            console.log('✅ Nombre del asistente cargado:', assistantName);
        }

        // Load custom instructions
        const instructionsResult = await window.alfredAPI.getUserSetting('custom_instructions');
        const customInstructionsInput = document.getElementById('customInstructions');
        if (instructionsResult.success && instructionsResult.data && customInstructionsInput) {
            const customInstructions = instructionsResult.data.value || '';
            customInstructionsInput.value = customInstructions;
            console.log('✅ Instrucciones personalizadas cargadas');
        }

        // Load occupation
        const occupationResult = await window.alfredAPI.getUserSetting('user_occupation');
        const userOccupationInput = document.getElementById('userOccupation');
        if (occupationResult.success && occupationResult.data && userOccupationInput) {
            const userOccupation = occupationResult.data.value || '';
            userOccupationInput.value = userOccupation;
            console.log('✅ Ocupacion cargada:', userOccupation);
        }

        // Load about user information
        const aboutResult = await window.alfredAPI.getUserSetting('about_user');
        const aboutUserInput = document.getElementById('aboutUser');
        if (aboutResult.success && aboutResult.data && aboutUserInput) {
            const aboutUser = aboutResult.data.value || '';
            aboutUserInput.value = aboutUser;
            console.log('✅ Informacion sobre el usuario cargada');
        }

    } catch (error) {
        console.error('❌ Error al cargar personalizacion:', error);
    }
}

// Save user personal information (Profile: name and age)
export async function saveUserInfo() {
    try {
        const userNameInput = document.getElementById('userName');
        const userAgeInput = document.getElementById('userAge');

        const userName = userNameInput?.value.trim();
        const userAge = userAgeInput?.value;

        console.log('💾 Guardando informacion personal...', { userName, userAge });

        // Save name
        if (userName) {
            const nameResult = await window.alfredAPI.setUserSetting('user_name', userName, 'string');
            if (!nameResult.success) {
                throw new Error('Error al guardar nombre');
            }
        }

        // Save age
        if (userAge) {
            const ageResult = await window.alfredAPI.setUserSetting('user_age', userAge, 'integer');
            if (!ageResult.success) {
                throw new Error('Error al guardar edad');
            }
        }

        console.log('✅ Informacion personal guardada');
        showNotification('success', 'Informacion personal actualizada. Los cambios se aplicaran en tu proxima conversacion.');

    } catch (error) {
        console.error('❌ Error al guardar informacion personal:', error);
        showNotification('error', `Error al guardar: ${error.message}`);
    }
}

// Save personalization (Personalization: assistant, instructions, occupation, about you)
export async function savePersonalization() {
    try {
        const assistantNameInput = document.getElementById('assistantName');
        const customInstructionsInput = document.getElementById('customInstructions');
        const userOccupationInput = document.getElementById('userOccupation');
        const aboutUserInput = document.getElementById('aboutUser');

        const assistantName = assistantNameInput?.value.trim();
        const customInstructions = customInstructionsInput?.value.trim();
        const userOccupation = userOccupationInput?.value.trim();
        const aboutUser = aboutUserInput?.value.trim();

        console.log('💾 Guardando personalizacion...', {
            assistantName, customInstructions, userOccupation, aboutUser
        });

        // Save assistant name
        if (assistantName) {
            const assistantResult = await window.alfredAPI.setUserSetting('assistant_name', assistantName, 'string');
            if (!assistantResult.success) {
                throw new Error('Error al guardar nombre del asistente');
            }
        }

        // Save custom instructions
        if (customInstructions) {
            const instructionsResult = await window.alfredAPI.setUserSetting('custom_instructions', customInstructions, 'string');
            if (!instructionsResult.success) {
                throw new Error('Error al guardar instrucciones personalizadas');
            }
        }

        // Save occupation
        if (userOccupation) {
            const occupationResult = await window.alfredAPI.setUserSetting('user_occupation', userOccupation, 'string');
            if (!occupationResult.success) {
                throw new Error('Error al guardar ocupacion');
            }
        }

        // Save about user information
        if (aboutUser) {
            const aboutResult = await window.alfredAPI.setUserSetting('about_user', aboutUser, 'string');
            if (!aboutResult.success) {
                throw new Error('Error al guardar informacion sobre el usuario');
            }
        }

        console.log('✅ Personalizacion guardada');
        showNotification('success', 'Personalizacion actualizada. Los cambios se aplicaran en tu proxima conversacion.');

    } catch (error) {
        console.error('❌ Error al guardar personalizacion:', error);
        showNotification('error', `Error al guardar: ${error.message}`);
    }
}
