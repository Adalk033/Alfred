import { showNotification } from '../../core/notifications.js';
import { showConfirm } from '../../core/dialogs.js';

/**
 * Cargar estado de indexacion
 */
export async function loadIndexationStatus() {
    try {
        const response = await fetch('http://127.0.0.1:8000/documents/stats');
        const data = await response.json();

        if (data.success) {
            const statsDiv = document.getElementById('indexationStats');
            if (statsDiv) {
                statsDiv.innerHTML = `
                    <div class="stat-item">
                        <span class="stat-label">Documentos indexados:</span>
                        <span class="stat-value">${data.data.total_documents || 0}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Chunks totales:</span>
                        <span class="stat-value">${data.data.total_chunks || 0}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Vectores en DB:</span>
                        <span class="stat-value">${data.data.total_vectors || 0}</span>
                    </div>
                `;
            }
        }
    } catch (error) {
        console.error('Error al cargar estado de indexacion:', error);
        const statsDiv = document.getElementById('indexationStats');
        if (statsDiv) {
            statsDiv.innerHTML = '<div class="error-message">Error al cargar estadisticas</div>';
        }
    }
}

/**
 * Cargar paths de documentos
 */
export async function loadDocumentPaths() {
    const pathsList = document.getElementById('docPathsList');

    try {
        const response = await fetch('http://127.0.0.1:8000/documents/paths');
        const data = await response.json();

        if (data.success && data.data) {
            const paths = data.data;

            if (paths.length === 0) {
                pathsList.innerHTML = `
                    <div class="no-paths-message">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"></path>
                        </svg>
                        <p>No hay rutas configuradas</p>
                        <p style="font-size: 12px;">Agrega una ruta para comenzar a indexar documentos</p>
                    </div>
                `;
                return;
            }

            pathsList.innerHTML = '';

            paths.forEach(path => {
                const pathItem = document.createElement('div');
                pathItem.className = 'doc-path-item';

                pathItem.innerHTML = `
                    <div class="path-info">
                        <div class="path-header">
                            <span class="path-location">${path.path}</span>
                            <label class="toggle-switch">
                                <input type="checkbox" 
                                    ${path.enabled ? 'checked' : ''} 
                                    onchange="toggleDocPath(${path.id}, this.checked)">
                                <span class="toggle-slider"></span>
                            </label>
                        </div>
                        <div class="path-stats">
                            <span class="stat">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"></path>
                                    <polyline points="14 2 14 8 20 8"></polyline>
                                </svg>
                                ${path.document_count || 0} documentos
                            </span>
                            <span class="stat">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <rect x="3" y="3" width="7" height="7"></rect>
                                    <rect x="14" y="3" width="7" height="7"></rect>
                                    <rect x="14" y="14" width="7" height="7"></rect>
                                    <rect x="3" y="14" width="7" height="7"></rect>
                                </svg>
                                ${path.chunk_count || 0} chunks
                            </span>
                        </div>
                    </div>
                    <div class="path-actions">
                        <button class="icon-btn-small" onclick="browseDocPath(${path.id})" title="Cambiar ruta">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"></path>
                            </svg>
                        </button>
                        <button class="icon-btn-small danger" onclick="removeDocPath(${path.id})" title="Eliminar ruta">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path>
                            </svg>
                        </button>
                    </div>
                `;

                pathsList.appendChild(pathItem);
            });
        }
    } catch (error) {
        console.error('Error al cargar paths:', error);
        pathsList.innerHTML = '<div class="error-message">Error al cargar rutas de documentos</div>';
    }
}

/**
 * Agregar nuevo path
 */
export async function addDocPath() {
    try {
        const result = await window.alfredAPI.selectFolder();

        if (result.success && result.path) {
            const response = await fetch('http://127.0.0.1:8000/documents/paths', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: result.path })
            });

            const data = await response.json();

            if (data.success) {
                showNotification('success', 'Ruta agregada correctamente');
                await loadDocumentPaths();
            } else {
                showNotification('error', data.error || 'Error al agregar ruta');
            }
        }
    } catch (error) {
        console.error('Error al agregar path:', error);
        showNotification('error', 'Error al agregar ruta de documentos');
    }
}

/**
 * Explorar/cambiar path
 */
export async function browseDocPath(pathId) {
    try {
        const result = await window.alfredAPI.selectFolder();

        if (result.success && result.path) {
            const response = await fetch(`http://127.0.0.1:8000/documents/paths/${pathId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: result.path })
            });

            const data = await response.json();

            if (data.success) {
                showNotification('success', 'Ruta actualizada correctamente');
                await loadDocumentPaths();
            } else {
                showNotification('error', data.error || 'Error al actualizar ruta');
            }
        }
    } catch (error) {
        console.error('Error al cambiar path:', error);
        showNotification('error', 'Error al cambiar ruta');
    }
}

/**
 * Habilitar/deshabilitar path
 */
export async function toggleDocPath(pathId, enabled) {
    try {
        const response = await fetch(`http://127.0.0.1:8000/documents/paths/${pathId}/toggle`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled: enabled })
        });

        const data = await response.json();

        if (data.success) {
            if (enabled) {
                showNotification('success', 'Ruta habilitada. Los documentos se indexaran en la proxima reindexacion.');
            } else {
                const confirmed = await showConfirm(
                    'Al deshabilitar esta ruta:\n\n' +
                    '- Se eliminaran TODOS los vectores y chunks de esta ruta\n' +
                    '- Los documentos YA NO apareceran en busquedas\n' +
                    '- Puede tardar un momento\n\n' +
                    'Continuar?',
                    'Deshabilitar ruta?',
                    { type: 'warning', confirmText: 'Deshabilitar', cancelText: 'Cancelar' }
                );

                if (!confirmed) {
                    await loadDocumentPaths();
                    return;
                }

                showNotification('info', 'Eliminando vectores de la ruta...');
                const deleteResponse = await fetch(`http://127.0.0.1:8000/documents/paths/${pathId}/vectors`, {
                    method: 'DELETE'
                });

                const deleteData = await deleteResponse.json();

                if (deleteData.success) {
                    showNotification('success', `Ruta deshabilitada. Se eliminaron ${deleteData.data.deleted_chunks} chunks y ${deleteData.data.deleted_documents} documentos.`);
                } else {
                    showNotification('error', 'Error al eliminar vectores');
                }
            }

            await loadDocumentPaths();
            await loadIndexationStatus();
        } else {
            showNotification('error', data.error || 'Error al cambiar estado');
            await loadDocumentPaths();
        }
    } catch (error) {
        console.error('Error al toggle path:', error);
        showNotification('error', 'Error al cambiar estado de la ruta');
        await loadDocumentPaths();
    }
}

/**
 * Eliminar path
 */
export async function removeDocPath(pathId) {
    const confirmed = await showConfirm(
        'La ruta se eliminara de la configuracion.',
        'Eliminar esta ruta de documentos?',
        { type: 'danger', confirmText: 'Eliminar', cancelText: 'Cancelar' }
    );

    if (!confirmed) return;

    try {
        const response = await fetch(`http://127.0.0.1:8000/documents/paths/${pathId}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (data.success) {
            showNotification('success', 'Ruta eliminada correctamente');
            await loadDocumentPaths();
            await loadIndexationStatus();
        } else {
            showNotification('error', data.error || 'Error al eliminar ruta');
        }
    } catch (error) {
        console.error('Error al eliminar path:', error);
        showNotification('error', 'Error al eliminar ruta');
    }
}

/**
 * Reindexar documentos
 */
export async function reindexDocuments() {
    const confirmMsg = 'REINDEXAR TODOS LOS DOCUMENTOS\n\n' +
        'Esto hara:\n' +
        '- Procesar SOLO rutas HABILITADAS\n' +
        '- Agregar/actualizar documentos de rutas habilitadas\n' +
        '- Puede tardar varios minutos\n\n' +
        'Nota: Las rutas deshabilitadas ya tienen sus documentos eliminados.\n\n' +
        'Continuar?';

    if (!confirm(confirmMsg)) return;

    const reindexBtn = document.getElementById('reindexDocsBtn');
    const originalText = reindexBtn.textContent;
    reindexBtn.disabled = true;
    reindexBtn.textContent = 'Indexando...';

    const overlay = document.createElement('div');
    overlay.id = 'reindex-overlay';
    overlay.className = 'reindex-overlay';
    document.body.appendChild(overlay);

    const progressContainer = document.createElement('div');
    progressContainer.id = 'reindex-progress';
    progressContainer.className = 'reindex-progress-container';
    progressContainer.innerHTML = `
        <div class="progress-header">
            <h3>Reindexando Documentos</h3>
            <button id="closeProgressBtn" class="close-progress-btn" disabled>×</button>
        </div>
        <div class="progress-bar-container">
            <div class="progress-bar" id="progressBar" style="width: 0%">
                <span class="progress-text" id="progressText">0%</span>
            </div>
        </div>
        <div class="progress-message" id="progressMessage">Conectando...</div>
        <div class="progress-details" id="progressDetails"></div>
    `;

    document.body.appendChild(progressContainer);

    const eventSource = new EventSource('http://127.0.0.1:8000/documents/reindex/progress');
    let reindexStarted = false;

    eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);

        const progressBar = document.getElementById('progressBar');
        const progressText = document.getElementById('progressText');
        const progressMessage = document.getElementById('progressMessage');
        const progressDetails = document.getElementById('progressDetails');
        const closeBtn = document.getElementById('closeProgressBtn');

        if (data.stage === 'connecting') {
            progressMessage.textContent = 'Conectando con el servidor...';
        } else if (data.stage === 'start') {
            if (!reindexStarted) {
                reindexStarted = true;
                fetch('http://127.0.0.1:8000/documents/reindex', {
                    method: 'POST'
                }).catch(err => console.error('Error al iniciar reindexacion:', err));
            }
            progressMessage.textContent = data.message || 'Iniciando reindexacion...';
        } else if (data.stage === 'processing') {
            const progress = data.progress || 0;
            progressBar.style.width = `${progress}%`;
            progressText.textContent = `${Math.round(progress)}%`;
            progressMessage.textContent = data.message || 'Procesando documentos...';

            if (data.current_file) {
                progressDetails.innerHTML = `
                    <div class="detail-item">
                        <strong>Archivo actual:</strong> ${data.current_file}
                    </div>
                    <div class="detail-item">
                        <strong>Progreso:</strong> ${data.processed || 0} / ${data.total || 0} documentos
                    </div>
                `;
            }
        } else if (data.stage === 'complete') {
            progressBar.style.width = '100%';
            progressText.textContent = '100%';
            progressMessage.textContent = data.message || 'Reindexacion completada!';
            progressMessage.classList.add('success');

            if (data.stats) {
                progressDetails.innerHTML = `
                    <div class="stats-grid">
                        <div class="stat-card">
                            <div class="stat-value">${data.stats.total_documents || 0}</div>
                            <div class="stat-label">Documentos procesados</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-value">${data.stats.total_chunks || 0}</div>
                            <div class="stat-label">Chunks creados</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-value">${data.stats.total_vectors || 0}</div>
                            <div class="stat-label">Vectores almacenados</div>
                        </div>
                    </div>
                `;
            }

            closeBtn.disabled = false;
            closeBtn.onclick = () => {
                eventSource.close();
                document.body.removeChild(overlay);
                document.body.removeChild(progressContainer);
            };

            eventSource.close();
            reindexBtn.disabled = false;
            reindexBtn.textContent = originalText;

            loadIndexationStatus();
            loadDocumentPaths();
            showNotification('success', 'Documentos reindexados correctamente');
        } else if (data.stage === 'error') {
            progressMessage.textContent = data.message || 'Error en la reindexacion';
            progressMessage.classList.add('error');
            progressDetails.innerHTML = `<div class="error-detail">${data.error || 'Error desconocido'}</div>`;

            closeBtn.disabled = false;
            closeBtn.onclick = () => {
                eventSource.close();
                document.body.removeChild(overlay);
                document.body.removeChild(progressContainer);
            };

            eventSource.close();
            reindexBtn.disabled = false;
            reindexBtn.textContent = originalText;
            showNotification('error', 'Error en la reindexacion');
        }
    };

    eventSource.onerror = (error) => {
        console.error('Error en SSE:', error);
        const progressMessage = document.getElementById('progressMessage');
        const closeBtn = document.getElementById('closeProgressBtn');

        if (progressMessage) {
            progressMessage.textContent = 'Error de conexion con el servidor';
            progressMessage.classList.add('error');
        }

        if (closeBtn) {
            closeBtn.disabled = false;
            closeBtn.onclick = () => {
                eventSource.close();
                const overlay = document.getElementById('reindex-overlay');
                const progress = document.getElementById('reindex-progress');
                if (overlay) document.body.removeChild(overlay);
                if (progress) document.body.removeChild(progress);
            };
        }

        eventSource.close();
        reindexBtn.disabled = false;
        reindexBtn.textContent = originalText;
        showNotification('error', 'Error de conexion durante la reindexacion');
    };
}

/**
 * Limpiar indice
 */
export async function clearIndex() {
    const confirmed = await showConfirm(
        'Esta accion:\n' +
        '- Borrara TODOS los vectores y chunks\n' +
        '- Eliminara la base de datos ChromaDB completamente\n' +
        '- Reseteara contadores de TODAS las rutas\n' +
        '- NO elimina las rutas configuradas\n\n' +
        'NO SE PUEDE DESHACER\n\n' +
        'Despues tendras que reindexar para volver a usar el sistema RAG.',
        'Eliminar todo el indice?',
        { type: 'danger', confirmText: 'Si, eliminar todo', cancelText: 'Cancelar' }
    );

    if (!confirmed) return;

    const clearBtn = document.getElementById('clearIndexBtn');
    const originalText = clearBtn.textContent;
    clearBtn.disabled = true;
    clearBtn.textContent = 'Limpiando...';

    try {
        const response = await fetch('http://127.0.0.1:8000/documents/clear', {
            method: 'DELETE'
        });

        const data = await response.json();

        if (data.success) {
            showNotification('success', 'Indice eliminado correctamente. Todos los vectores han sido borrados.');
            await loadIndexationStatus();
            await loadDocumentPaths();
        } else {
            showNotification('error', data.error || 'Error al limpiar indice');
        }
    } catch (error) {
        console.error('Error al limpiar indice:', error);
        showNotification('error', 'Error al limpiar el indice');
    } finally {
        clearBtn.disabled = false;
        clearBtn.textContent = originalText;
    }
}
