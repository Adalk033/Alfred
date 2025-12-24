import { showNotification } from '../../core/notifications.js';
import { showConfirm } from '../../core/dialogs.js';

// Ollama keep-alive configuration elements (initialized from renderer.js)
let ollamaKeepAliveSlider;
let ollamaKeepAliveValue;
let ollamaKeepAlivePresets;
let modelSelect;

// Initialize DOM elements for Ollama management
export function initializeOllamaElements() {
    ollamaKeepAliveSlider = document.getElementById('ollamaKeepAlive');
    ollamaKeepAliveValue = document.getElementById('ollamaKeepAliveValue');
    ollamaKeepAlivePresets = document.querySelectorAll('.preset-btn');
    modelSelect = document.getElementById('modelSelect');
}

// ==================== KEEP-ALIVE MANAGEMENT ====================

// Load Ollama keep-alive configuration
export async function loadOllamaKeepAlive() {
    try {
        const result = await window.alfredAPI.getOllamaKeepAlive();

        if (result.success && result.data) {
            const seconds = result.data.keep_alive_seconds;
            if (ollamaKeepAliveSlider) {
                ollamaKeepAliveSlider.value = seconds;
                updateKeepAliveDisplay(seconds);
            }
            console.log('Keep alive cargado:', seconds, 'segundos');
        }
    } catch (error) {
        console.error('Error al cargar keep_alive:', error);
    }
}

// Update keep-alive display
export function updateKeepAliveDisplay(seconds) {
    if (ollamaKeepAliveValue) {
        ollamaKeepAliveValue.textContent = seconds;
    }

    // Update preset buttons
    if (ollamaKeepAlivePresets) {
        ollamaKeepAlivePresets.forEach(btn => {
            const presetSeconds = parseInt(btn.dataset.seconds);
            if (presetSeconds === seconds) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }
}

// Save keep-alive configuration
export async function saveOllamaKeepAlive() {
    try {
        const seconds = parseInt(ollamaKeepAliveSlider.value);
        const result = await window.alfredAPI.setOllamaKeepAlive(seconds);

        if (result.success) {
            console.log('Keep alive actualizado a', seconds, 'segundos');
            showNotification('success', 'Configuracion de Ollama actualizada');
        } else {
            console.error('Error al actualizar keep_alive:', result.error);
            showNotification('error', 'Error al actualizar configuracion de Ollama');
        }
    } catch (error) {
        console.error('Error al guardar keep_alive:', error);
        showNotification('error', 'Error al actualizar configuracion de Ollama');
    }
}

// ==================== MODEL MANAGEMENT ====================

// Load models into topbar selector
export async function loadModelsIntoSelector() {
    if (!modelSelect) {
        console.error('modelSelect no esta inicializado');
        return;
    }

    try {
        const response = await fetch('http://127.0.0.1:8000/ollama/models/list');
        const data = await response.json();

        if (data.models && data.models.length > 0) {
            // Clear current options
            modelSelect.innerHTML = '';

            // Add each model as option
            data.models.forEach(model => {
                const option = document.createElement('option');
                option.value = model.name;
                option.textContent = model.name;
                modelSelect.appendChild(option);
            });

            console.log(`Cargados ${data.models.length} modelos en el selector del topbar`);

            // Load currently selected model
            await loadCurrentModel();
        } else {
            // No models installed
            modelSelect.innerHTML = '<option value="">No hay modelos instalados</option>';
            console.warn('No hay modelos de Ollama instalados');
        }
    } catch (error) {
        console.error('Error al cargar modelos en selector:', error);
        modelSelect.innerHTML = '<option value="">Error al cargar modelos</option>';
    }
}

// Load list of installed models
export async function loadOllamaModels() {
    const modelsList = document.getElementById('modelsList');

    if (!modelsList) return;

    // Show loading
    modelsList.innerHTML = `
        <div class="loading-models">
            <div class="loading-spinner"></div>
            <span>Cargando modelos...</span>
        </div>
    `;

    try {
        const response = await fetch('http://127.0.0.1:8000/ollama/models/list');
        const data = await response.json();

        if (data.models && data.models.length > 0) {
            modelsList.innerHTML = data.models.map(model => `
                <div class="model-item">
                    <div class="model-info">
                        <div class="model-name">${model.name}</div>
                        <div class="model-details">
                            <span class="model-size">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                                    <polyline points="17 21 17 13 7 13 7 21"></polyline>
                                    <polyline points="7 3 7 8 15 8"></polyline>
                                </svg>
                                ${model.size}
                            </span>
                            <span class="model-modified">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <circle cx="12" cy="12" r="10"></circle>
                                    <polyline points="12 6 12 12 16 14"></polyline>
                                </svg>
                                ${model.modified}
                            </span>
                        </div>
                    </div>
                    <div class="model-actions">
                        <button class="model-action-btn" onclick="selectModel('${model.name}')">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                            Usar
                        </button>
                        <button class="model-action-btn delete" onclick="deleteModel('${model.name}')">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                            Eliminar
                        </button>
                    </div>
                </div>
            `).join('');

            console.log(`Cargados ${data.models.length} modelos de Ollama`);
        } else {
            modelsList.innerHTML = `
                <div class="no-models-message">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="12"></line>
                        <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                    <p>No hay modelos instalados</p>
                    <p style="font-size: 12px;">Descarga un modelo usando el campo de arriba</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error al cargar modelos:', error);
        modelsList.innerHTML = `
            <div class="no-models-message">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="15" y1="9" x2="9" y2="15"></line>
                    <line x1="9" y1="9" x2="15" y2="15"></line>
                </svg>
                <p>Error al cargar modelos</p>
                <p style="font-size: 12px;">Asegurate de que Ollama este instalado y corriendo</p>
            </div>
        `;
        showNotification('error', 'Error al cargar modelos de Ollama');
    }
}

// Download an Ollama model
export async function downloadOllamaModel() {
    const modelInput = document.getElementById('downloadModel');
    const modelName = modelInput.value.trim();

    if (!modelName) {
        showNotification('error', 'Ingresa el nombre del modelo');
        return;
    }

    try {
        const response = await fetch(`http://127.0.0.1:8000/ollama/models/download?model_name=${encodeURIComponent(modelName)}`, {
            method: 'POST'
        });

        const data = await response.json();

        if (response.ok) {
            showNotification('info', `Descarga de ${modelName} iniciada.`);
            modelInput.value = ''; // Clear input

            // Show progress container
            const progressContainer = document.getElementById('downloadProgress');
            progressContainer.style.display = 'block';

            // Start polling for this model
            startDownloadPolling(modelName);
        } else {
            showNotification('error', `Error al descargar modelo: ${data.detail}`);
        }
    } catch (error) {
        console.error('Error al descargar modelo:', error);
        showNotification('error', 'Error al iniciar descarga del modelo');
    }
}

// Active polling intervals storage
const activePolling = {};
const pollingStartTime = {};

// Start download polling for a model
function startDownloadPolling(modelName) {
    // If polling already active for this model, don't create another
    if (activePolling[modelName]) {
        console.log(`[Polling] Ya existe polling activo para ${modelName}`);
        return;
    }

    // Add progress item to container
    addDownloadProgressItem(modelName);

    // Save start time
    pollingStartTime[modelName] = Date.now();

    console.log(`[Polling] Iniciando polling para ${modelName}`);

    // Poll every 2 seconds
    activePolling[modelName] = setInterval(async () => {
        try {
            // Timeout of 30 minutes (1800000ms)
            const elapsed = Date.now() - pollingStartTime[modelName];
            if (elapsed > 1800000) {
                console.warn(`[Polling] Timeout alcanzado para ${modelName}, deteniendo polling`);
                clearInterval(activePolling[modelName]);
                delete activePolling[modelName];
                delete pollingStartTime[modelName];
                showNotification('error', `Timeout en descarga de ${modelName}`);
                return;
            }

            const response = await fetch(`http://127.0.0.1:8000/ollama/models/status/${encodeURIComponent(modelName)}`);
            const data = await response.json();

            console.log(`[Polling] Estado de ${modelName}:`, data.status, `${data.progress}%`);

            if (data.found) {
                updateDownloadProgress(modelName, data.status, data.progress, data.message);

                // If download finished (completed or failed), stop polling
                if (data.status === 'completed' || data.status === 'failed') {
                    console.log(`[Polling] Descarga finalizada para ${modelName}: ${data.status}`);
                    clearInterval(activePolling[modelName]);
                    delete activePolling[modelName];
                    delete pollingStartTime[modelName];

                    // Reload model list after 2 seconds
                    if (data.status === 'completed') {
                        setTimeout(async () => {
                            // Reload models list in settings section
                            loadOllamaModels();

                            // Update topbar selector
                            await loadModelsIntoSelector();

                            showNotification('success', `Modelo ${modelName} descargado exitosamente`);

                            // Hide progress item after 3 more seconds
                            setTimeout(() => {
                                const itemId = `download-${modelName.replace(/[^a-zA-Z0-9]/g, '-')}`;
                                const item = document.getElementById(itemId);
                                if (item) {
                                    item.style.transition = 'opacity 0.5s';
                                    item.style.opacity = '0';
                                    setTimeout(() => item.remove(), 500);
                                }
                            }, 3000);
                        }, 2000);
                    } else if (data.status === 'failed') {
                        showNotification('error', `Error al descargar ${modelName}: ${data.message}`);
                    }
                }
            } else {
                console.warn(`[Polling] No se encontro informacion para ${modelName}`);
            }
        } catch (error) {
            console.error('[Polling] Error al obtener progreso:', error);
        }
    }, 2000);
}

// Add progress item
function addDownloadProgressItem(modelName) {
    const list = document.getElementById('downloadProgressList');

    const item = document.createElement('div');
    item.className = 'download-progress-item';
    item.id = `download-${modelName.replace(/[^a-zA-Z0-9]/g, '-')}`;
    item.innerHTML = `
        <div class="download-progress-info">
            <span class="download-model-name">${modelName}</span>
            <span class="download-progress-percent">0%</span>
        </div>
        <div class="download-progress-bar">
            <div class="download-progress-fill" style="width: 0%"></div>
        </div>
        <div class="download-progress-status">Iniciando descarga...</div>
    `;

    list.appendChild(item);
}

// Update download progress
function updateDownloadProgress(modelName, status, progress, message) {
    const itemId = `download-${modelName.replace(/[^a-zA-Z0-9]/g, '-')}`;
    const item = document.getElementById(itemId);

    if (!item) return;

    const fill = item.querySelector('.download-progress-fill');
    const percent = item.querySelector('.download-progress-percent');
    const statusText = item.querySelector('.download-progress-status');

    fill.style.width = `${progress}%`;
    percent.textContent = `${progress}%`;
    statusText.textContent = message || `Descargando... ${progress}%`;

    // Apply classes based on status
    item.className = 'download-progress-item';
    if (status === 'completed') {
        item.classList.add('completed');
        statusText.textContent = 'Descarga completada';
    } else if (status === 'failed') {
        item.classList.add('failed');
        statusText.textContent = message || 'Error en la descarga';
    }
}

// Select a model to use
export async function selectModel(modelName) {
    try {
        const response = await fetch('http://127.0.0.1:8000/model', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model_name: modelName })
        });

        const data = await response.json();

        if (response.ok) {
            showNotification('success', `Modelo ${modelName} seleccionado`);

            // Update model selector in topbar
            if (modelSelect) {
                modelSelect.value = modelName;
            }

            // Update current model in system
            await loadCurrentModel();
        } else {
            showNotification('error', `Error al seleccionar modelo: ${data.detail}`);
        }
    } catch (error) {
        console.error('Error al seleccionar modelo:', error);
        showNotification('error', 'Error al seleccionar modelo');
    }
}

// Delete an Ollama model
export async function deleteModel(modelName) {
    const confirmed = await showConfirm(
        `Se eliminara el modelo y todos sus archivos del sistema.`,
        `Eliminar modelo ${modelName}?`,
        { type: 'danger', confirmText: 'Eliminar', cancelText: 'Cancelar' }
    );

    if (!confirmed) {
        return;
    }

    try {
        const response = await fetch(`http://127.0.0.1:8000/ollama/models/${encodeURIComponent(modelName)}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (response.ok) {
            showNotification('success', `Modelo ${modelName} eliminado`);

            // Reload models list in settings section
            loadOllamaModels();

            // Update topbar selector
            await loadModelsIntoSelector();
        } else {
            showNotification('error', `Error al eliminar modelo: ${data.detail}`);
        }
    } catch (error) {
        console.error('Error al eliminar modelo:', error);
        showNotification('error', 'Error al eliminar modelo');
    }
}

// Load current model
export async function loadCurrentModel() {
    try {
        console.log('Cargando modelo actual...');
        const result = await window.alfredAPI.getModel();

        console.log('Respuesta de getModel:', result);

        if (result.success && result.data) {
            const currentModel = result.data.model_name;
            console.log('Modelo actual:', currentModel);

            if (modelSelect) {
                modelSelect.value = currentModel;
                console.log('Modelo cargado y seleccionado:', currentModel);
            } else {
                console.error('ERROR: modelSelect es null');
            }
        } else {
            console.error('Error en respuesta:', result);
        }
    } catch (error) {
        console.error('Error al cargar el modelo actual:', error);
    }
}

// Change model
export async function changeModel() {
    const newModel = modelSelect.value;
    const previousModel = modelSelect.options[modelSelect.selectedIndex === 0 ? 1 : 0].value;

    try {
        // Show change indicator
        modelSelect.disabled = true;
        
        const result = await window.alfredAPI.changeModel(newModel);

        if (result.success) {
            showNotification('success', `Modelo cambiado exitosamente a ${newModel}`);
        } else {
            showNotification('error', 'Error al cambiar el modelo');
            // Revert to previous model
            modelSelect.value = previousModel;
        }
    } catch (error) {
        console.error('Error al cambiar modelo:', error);
        showNotification('error', 'Error al cambiar el modelo');
        // Revert to previous model
        modelSelect.value = previousModel;
    } finally {
        modelSelect.disabled = false;
    }
}
