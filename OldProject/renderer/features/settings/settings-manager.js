import * as State from '../../state/state.js';
import { showNotification } from '../../core/notifications.js';
import { saveOllamaKeepAlive } from '../models/ollama-manager.js';

// ==================== SETTINGS MANAGEMENT ====================

// Load settings from localStorage
export function loadSettings() {
    const saved = localStorage.getItem('alfred-settings');
    if (saved) {
        const loadedSettings = JSON.parse(saved);
        State.updateSettings(loadedSettings);
    }

    // Ensure profile picture properties exist
    const currentSettings = State.settings;
    if (!currentSettings.profilePicture) {
        State.updateSettings({ profilePicture: null });
    }
    if (!currentSettings.profilePictureHistory) {
        State.updateSettings({ profilePictureHistory: [] });
    }

    const serverUrlInput = document.getElementById('serverUrl');
    const autoSaveInput = document.getElementById('autoSave');
    const useHistoryInput = document.getElementById('useHistory');
    const soundEnabledInput = document.getElementById('soundEnabled');

    if (serverUrlInput) serverUrlInput.value = State.settings.serverUrl;
    if (autoSaveInput) autoSaveInput.checked = State.settings.autoSave;
    if (useHistoryInput) useHistoryInput.checked = State.settings.useHistory;
    if (soundEnabledInput) soundEnabledInput.checked = State.settings.soundEnabled;
}

// Save settings
export function saveSettingsHandler() {
    const serverUrlInput = document.getElementById('serverUrl');
    const autoSaveInput = document.getElementById('autoSave');
    const useHistoryInput = document.getElementById('useHistory');
    const soundEnabledInput = document.getElementById('soundEnabled');

    State.updateSettings({
        serverUrl: serverUrlInput?.value,
        autoSave: autoSaveInput?.checked,
        useHistory: useHistoryInput?.checked,
        soundEnabled: soundEnabledInput?.checked
    });

    localStorage.setItem('alfred-settings', JSON.stringify(State.settings));

    // Save Ollama keep_alive
    saveOllamaKeepAlive();

    const settingsModal = document.getElementById('settingsModal');
    if (settingsModal) {
        settingsModal.classList.add('none');
    }

    showNotification('success', 'Configuracion guardada');
}
