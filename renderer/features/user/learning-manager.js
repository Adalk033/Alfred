/**
 * Learning Manager - Gestor del sistema de aprendizaje personalizado
 * Maneja la UI y comunicacion con el backend para el aprendizaje automatico
 */

import { showNotification } from '../../core/notifications.js';
import { getApiUrl } from '../../api/api.js';

// Estado del modulo
let isLearning = false;
let pollInterval = null;

/**
 * Inicializar el gestor de aprendizaje
 */
export async function initLearningManager() {
    console.log('Inicializando Learning Manager...');
    
    // Cargar estado actual
    await loadLearningStatus();
    await loadLearningSettings();
    
    // Configurar event listeners
    setupLearningEventListeners();
    
    console.log('Learning Manager inicializado');
}

/**
 * Configurar event listeners para la seccion de aprendizaje
 */
function setupLearningEventListeners() {
    // Boton de iniciar aprendizaje manual
    const startLearningBtn = document.getElementById('startLearningBtn');
    if (startLearningBtn) {
        startLearningBtn.addEventListener('click', startManualLearning);
    }
    
    // Boton de resetear aprendizaje
    const resetLearningBtn = document.getElementById('resetLearningBtn');
    if (resetLearningBtn) {
        resetLearningBtn.addEventListener('click', resetLearning);
    }
    
    // Toggle de aprendizaje automatico
    const autoLearningEnabled = document.getElementById('autoLearningEnabled');
    if (autoLearningEnabled) {
        autoLearningEnabled.addEventListener('change', updateLearningSettings);
    }
    
    // Selector de modo por defecto
    const defaultLearningMode = document.getElementById('defaultLearningMode');
    if (defaultLearningMode) {
        defaultLearningMode.addEventListener('change', updateLearningSettings);
    }
}

/**
 * Cargar estado actual del aprendizaje
 */
export async function loadLearningStatus() {
    try {
        const response = await fetch(`${getApiUrl()}/learning/status`);
        
        if (!response.ok) {
            throw new Error('Error al obtener estado de aprendizaje');
        }
        
        const data = await response.json();
        
        // Actualizar UI con estado
        updateLearningStatusUI(data);
        
        // Si hay patrones aprendidos, mostrarlos
        if (data.patterns_summary) {
            updateLearnedPatternsUI(data.patterns_summary);
        }
        
        return data;
        
    } catch (error) {
        console.error('Error cargando estado de aprendizaje:', error);
        return null;
    }
}

/**
 * Actualizar UI con estado del aprendizaje
 */
function updateLearningStatusUI(status) {
    // Ultima fecha de aprendizaje
    const lastDateEl = document.getElementById('lastLearningDate');
    if (lastDateEl) {
        if (status.last_learning_date) {
            const date = new Date(status.last_learning_date);
            lastDateEl.textContent = date.toLocaleDateString('es-ES', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } else {
            lastDateEl.textContent = 'Nunca';
        }
    }
    
    // Modo utilizado
    const modeEl = document.getElementById('lastLearningMode');
    if (modeEl) {
        const modeLabels = {
            'light': 'Ligero',
            'heavy': 'Profundo'
        };
        modeEl.textContent = modeLabels[status.last_mode_used] || '-';
    }
    
    // Cantidad de temas aprendidos
    const topicsEl = document.getElementById('learnedTopicsCount');
    if (topicsEl && status.patterns_summary) {
        topicsEl.textContent = status.patterns_summary.topics_count || 0;
    }
}

/**
 * Actualizar UI con patrones aprendidos
 */
function updateLearnedPatternsUI(patterns) {
    const container = document.getElementById('learnedPatterns');
    if (!container) return;
    
    if (!patterns || !patterns.top_topics || patterns.top_topics.length === 0) {
        container.innerHTML = '<p class="no-patterns">No hay patrones aprendidos aun.</p>';
        return;
    }
    
    const detailLabels = {
        'concise': 'Respuestas concisas',
        'medium': 'Respuestas balanceadas',
        'detailed': 'Respuestas detalladas'
    };
    
    const toneLabels = {
        'educational': 'Educativo',
        'supportive': 'De apoyo',
        'direct': 'Directo',
        'balanced': 'Balanceado'
    };
    
    const vocabLabels = {
        'basic': 'Basico',
        'intermediate': 'Intermedio',
        'advanced': 'Avanzado'
    };
    
    let html = `
        <div class="patterns-grid">
            <div class="pattern-item">
                <span class="pattern-label">Preferencia de detalle:</span>
                <span class="pattern-value">${detailLabels[patterns.detail_preference] || patterns.detail_preference || '-'}</span>
            </div>
            <div class="pattern-item">
                <span class="pattern-label">Tono preferido:</span>
                <span class="pattern-value">${toneLabels[patterns.tone_preference] || patterns.tone_preference || '-'}</span>
            </div>
            <div class="pattern-item">
                <span class="pattern-label">Nivel de vocabulario:</span>
                <span class="pattern-value">${vocabLabels[patterns.vocabulary_level] || patterns.vocabulary_level || '-'}</span>
            </div>
            <div class="pattern-item">
                <span class="pattern-label">Conversaciones analizadas:</span>
                <span class="pattern-value">${patterns.conversations_analyzed || 0}</span>
            </div>
        </div>
    `;
    
    if (patterns.top_topics && patterns.top_topics.length > 0) {
        html += `
            <div class="pattern-topics">
                <span class="pattern-label">Temas frecuentes:</span>
                <div class="topics-tags">
                    ${patterns.top_topics.map(topic => `<span class="topic-tag">${topic}</span>`).join('')}
                </div>
            </div>
        `;
    }
    
    container.innerHTML = html;
}

/**
 * Cargar configuracion del aprendizaje
 */
async function loadLearningSettings() {
    try {
        const response = await fetch(`${getApiUrl()}/learning/settings`);
        
        if (!response.ok) {
            throw new Error('Error al obtener configuracion');
        }
        
        const settings = await response.json();
        
        // Actualizar UI
        const autoEnabled = document.getElementById('autoLearningEnabled');
        if (autoEnabled) {
            autoEnabled.checked = settings.auto_learning_enabled;
        }
        
        const defaultMode = document.getElementById('defaultLearningMode');
        if (defaultMode) {
            defaultMode.value = settings.default_mode || 'light';
        }
        
    } catch (error) {
        console.error('Error cargando configuracion de aprendizaje:', error);
    }
}

/**
 * Actualizar configuracion del aprendizaje
 */
async function updateLearningSettings() {
    try {
        const autoEnabled = document.getElementById('autoLearningEnabled')?.checked ?? true;
        const defaultMode = document.getElementById('defaultLearningMode')?.value || 'light';
        
        const response = await fetch(`${getApiUrl()}/learning/settings`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                auto_learning_enabled: autoEnabled,
                default_mode: defaultMode,
                learning_interval_days: 7,
                min_conversations_trigger: 50
            })
        });
        
        if (!response.ok) {
            throw new Error('Error al guardar configuracion');
        }
        
        console.log('Configuracion de aprendizaje actualizada');
        
    } catch (error) {
        console.error('Error actualizando configuracion:', error);
        showNotification('error', 'Error al guardar configuracion de aprendizaje');
    }
}

/**
 * Iniciar aprendizaje manual
 */
async function startManualLearning() {
    if (isLearning) {
        showNotification('warning', 'Ya hay un aprendizaje en curso');
        return;
    }
    
    const modeSelect = document.getElementById('manualLearningMode');
    const mode = modeSelect?.value || 'light';
    
    const startBtn = document.getElementById('startLearningBtn');
    const progressContainer = document.getElementById('learningProgress');
    const progressFill = document.getElementById('learningProgressFill');
    const progressText = document.getElementById('learningProgressText');
    
    try {
        isLearning = true;
        
        // Actualizar UI
        if (startBtn) {
            startBtn.disabled = true;
            startBtn.innerHTML = `
                <svg class="spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="32">
                        <animate attributeName="stroke-dashoffset" values="32;0" dur="1s" repeatCount="indefinite"/>
                    </circle>
                </svg>
                Aprendiendo...
            `;
        }
        
        if (progressContainer) {
            progressContainer.style.display = 'block';
        }
        
        const modeLabel = mode === 'heavy' ? 'profundo' : 'ligero';
        showNotification('info', `Iniciando aprendizaje ${modeLabel}...`);
        
        // Llamar al endpoint
        const response = await fetch(`${getApiUrl()}/learning/start`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ mode })
        });
        
        const result = await response.json();
        
        if (result.success) {
            // Actualizar progreso
            if (progressFill) progressFill.style.width = '100%';
            if (progressText) progressText.textContent = 'Completado';
            
            showNotification('success', result.message || 'Aprendizaje completado exitosamente');
            
            // Recargar estado
            await loadLearningStatus();
            
        } else {
            throw new Error(result.message || 'Error en el aprendizaje');
        }
        
    } catch (error) {
        console.error('Error en aprendizaje manual:', error);
        showNotification('error', `Error: ${error.message}`);
        
        if (progressText) progressText.textContent = 'Error';
        
    } finally {
        isLearning = false;
        
        // Restaurar boton
        if (startBtn) {
            startBtn.disabled = false;
            startBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                    <polyline points="22 4 12 14.01 9 11.01"></polyline>
                </svg>
                Iniciar Aprendizaje
            `;
        }
        
        // Ocultar progreso despues de un momento
        setTimeout(() => {
            if (progressContainer) {
                progressContainer.style.display = 'none';
            }
            if (progressFill) progressFill.style.width = '0%';
        }, 3000);
    }
}

/**
 * Resetear todo el aprendizaje
 */
async function resetLearning() {
    // Confirmar accion
    const confirmed = await showConfirmDialog(
        'Resetear Aprendizaje',
        'Esto eliminara todos los patrones que Alfred ha aprendido sobre ti. El asistente dejara de usar preferencias personalizadas hasta que aprenda nuevamente. ¿Deseas continuar?'
    );
    
    if (!confirmed) return;
    
    try {
        const response = await fetch(`${getApiUrl()}/learning/reset`, {
            method: 'DELETE'
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification('success', 'Aprendizaje reseteado exitosamente');
            
            // Limpiar UI
            const container = document.getElementById('learnedPatterns');
            if (container) {
                container.innerHTML = '<p class="no-patterns">No hay patrones aprendidos aun.</p>';
            }
            
            document.getElementById('lastLearningDate').textContent = 'Nunca';
            document.getElementById('lastLearningMode').textContent = '-';
            document.getElementById('learnedTopicsCount').textContent = '0';
            
        } else {
            throw new Error(result.message || 'Error al resetear');
        }
        
    } catch (error) {
        console.error('Error reseteando aprendizaje:', error);
        showNotification('error', `Error: ${error.message}`);
    }
}

/**
 * Mostrar dialogo de confirmacion
 */
function showConfirmDialog(title, message) {
    return new Promise((resolve) => {
        // Usar el sistema de dialogos existente si esta disponible
        if (typeof window.showCustomDialog === 'function') {
            window.showCustomDialog({
                title,
                message,
                type: 'warning',
                buttons: [
                    { text: 'Cancelar', type: 'secondary', action: () => resolve(false) },
                    { text: 'Confirmar', type: 'danger', action: () => resolve(true) }
                ]
            });
        } else {
            // Fallback a confirm nativo
            resolve(confirm(message));
        }
    });
}

/**
 * Verificar y ejecutar aprendizaje automatico
 * Llamar periodicamente (ej: al iniciar la app)
 */
export async function checkAutoLearning() {
    try {
        const response = await fetch(`${getApiUrl()}/learning/check-auto`, {
            method: 'POST'
        });
        
        const result = await response.json();
        
        if (result.action === 'learned') {
            console.log('Aprendizaje automatico completado:', result);
            showNotification('info', 'Alfred ha aprendido nuevos patrones de tus conversaciones');
            await loadLearningStatus();
        }
        
        return result;
        
    } catch (error) {
        console.error('Error en verificacion de aprendizaje automatico:', error);
        return null;
    }
}
