import { showNotification } from '../../core/notifications.js';
import * as State from '../../state/state.js';
import { addMessage } from '../../dom/dom-utils.js';
import { hideLeftSidebarContent, setActiveNavItem, getActiveNavItem, showLeftSidebarContent } from '../../dom/sidebar.js';

// Estado global para el historial
export const historyState = {
    allHistory: [],
    filteredHistory: [],
    currentPage: 1,
    itemsPerPage: 5,
    searchTerm: '',
    totalItems: 0
};

// Exponer historyState globalmente
window.historyState = historyState;

// Mostrar historial con busqueda y paginacion
export async function showHistory() {
    const historyBtn = document.getElementById('historyBtn');
    const leftSidebarContent = document.getElementById('leftSidebarContent');
    
    // Si ya esta activo, ocultarlo
    if (getActiveNavItem() === historyBtn && leftSidebarContent.classList.contains('active')) {
        hideLeftSidebarContent();
        setActiveNavItem(null);
        return;
    }

    try {
        const result = await window.alfredAPI.getHistory(50);

        if (result.success) {
            historyState.allHistory = result.data;
            historyState.filteredHistory = result.data;
            historyState.currentPage = 1;
            historyState.totalItems = result.data.length;
            historyState.searchTerm = '';

            renderHistoryWithSearch();
            showLeftSidebarContent();
            setActiveNavItem(historyBtn);
        }
    } catch (error) {
        showNotification('error', 'Error al cargar el historial');
        console.error('Error:', error);
    }
}

// Renderizar historial con interfaz de busqueda
function renderHistoryWithSearch() {
    State.sidebarContent.innerHTML = '';

    // Titulo principal
    const title = document.createElement('h4');
    title.style.marginBottom = '16px';
    title.style.color = 'var(--text-primary)';
    title.textContent = 'Historial Preguntas Rapidas';
    State.sidebarContent.appendChild(title);

    // Contenedor de busqueda
    const searchContainer = document.createElement('div');
    searchContainer.className = 'history-search-container';

    // Input de busqueda directo
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'history-search-bar';
    searchInput.placeholder = 'Buscar preguntas...';
    searchInput.addEventListener('input', (e) => handleHistorySearch(e.target.value));

    searchContainer.appendChild(searchInput);
    State.sidebarContent.appendChild(searchContainer);

    // Renderizar resultados iniciales
    renderHistoryResults();
}

// Manejar busqueda de historial
async function handleHistorySearch(searchTerm) {
    historyState.searchTerm = searchTerm.toLowerCase();
    historyState.currentPage = 1;

    if (searchTerm.trim().length === 0) {
        historyState.filteredHistory = historyState.allHistory;
    } else {
        filterHistoryResults();
    }

    renderHistoryResults();
}

// Filtrar resultados del historial
function filterHistoryResults() {
    const term = historyState.searchTerm;

    if (term.length === 0) {
        historyState.filteredHistory = historyState.allHistory;
    } else {
        historyState.filteredHistory = historyState.allHistory.filter(item => {
            const questionMatch = item.question.toLowerCase().includes(term);
            const answerMatch = item.answer.toLowerCase().includes(term);
            return questionMatch || answerMatch;
        });
    }

    historyState.totalItems = historyState.filteredHistory.length;
}

// Renderizar resultados del historial con paginacion
function renderHistoryResults() {
    // Limpiar contenedor de resultados anterior si existe
    let resultsContainer = State.sidebarContent.querySelector('.history-results-container');
    if (resultsContainer) {
        resultsContainer.remove();
    }

    // Crear contenedor de resultados
    const resultsContainerDiv = document.createElement('div');
    resultsContainerDiv.className = 'history-results-container';

    // Info de resultados
    const resultsInfo = document.createElement('div');
    resultsInfo.className = 'history-results-info';

    const countText = document.createElement('span');
    countText.className = 'history-results-count';
    if (historyState.totalItems === 0) {
        countText.textContent = 'Sin resultados';
    } else {
        const startItem = (historyState.currentPage - 1) * historyState.itemsPerPage + 1;
        const endItem = Math.min(historyState.currentPage * historyState.itemsPerPage, historyState.totalItems);
        countText.innerHTML = `<span>${startItem}-${endItem} de ${historyState.totalItems}</span>`;
    }

    resultsInfo.appendChild(countText);
    resultsContainerDiv.appendChild(resultsInfo);

    // Contenedor de items
    const itemsContainer = document.createElement('div');
    itemsContainer.className = 'history-items-container';

    if (historyState.filteredHistory.length === 0) {
        const emptyState = document.createElement('div');
        emptyState.className = 'history-empty-state';
        emptyState.innerHTML = `
            <div class="history-empty-state-icon">📭</div>
            <div class="history-empty-state-text">
                ${historyState.searchTerm ? 'No se encontraron resultados para tu busqueda' : 'No hay conversaciones guardadas'}
            </div>
        `;
        itemsContainer.appendChild(emptyState);
    } else {
        // Calcular items de la pagina actual
        const startIdx = (historyState.currentPage - 1) * historyState.itemsPerPage;
        const endIdx = startIdx + historyState.itemsPerPage;
        const pageItems = historyState.filteredHistory.slice(startIdx, endIdx);

        pageItems.forEach(item => {
            const historyItem = document.createElement('div');
            historyItem.className = 'history-item';

            const contentWrapper = document.createElement('div');
            contentWrapper.className = 'history-item-content';
            contentWrapper.onclick = () => loadHistoryItem(item);

            const question = document.createElement('div');
            question.className = 'history-question';
            question.textContent = item.question;

            contentWrapper.appendChild(question);

            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'history-item-actions';

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-history-btn';
            deleteBtn.textContent = 'x';
            deleteBtn.title = 'Eliminar del historial';
            deleteBtn.onclick = async (e) => {
                e.stopPropagation();
                await deleteHistoryItem(item.timestamp);
            };

            actionsDiv.appendChild(deleteBtn);

            historyItem.appendChild(contentWrapper);
            historyItem.appendChild(actionsDiv);
            itemsContainer.appendChild(historyItem);
        });
    }

    resultsContainerDiv.appendChild(itemsContainer);
    State.sidebarContent.appendChild(resultsContainerDiv);

    // Agregar paginacion si hay mas de una pagina
    const totalPages = Math.ceil(historyState.totalItems / historyState.itemsPerPage);
    if (totalPages > 1) {
        const paginationDiv = document.createElement('div');
        paginationDiv.className = 'history-pagination';

        const prevBtn = document.createElement('button');
        prevBtn.className = 'pagination-btn';
        prevBtn.disabled = historyState.currentPage === 1;
        prevBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg> Anterior';
        prevBtn.addEventListener('click', () => {
            if (historyState.currentPage > 1) {
                historyState.currentPage--;
                renderHistoryResults();
            }
        });

        const pageInfo = document.createElement('span');
        pageInfo.className = 'pagination-info';
        pageInfo.textContent = `Pagina ${historyState.currentPage} de ${totalPages}`;

        const nextBtn = document.createElement('button');
        nextBtn.className = 'pagination-btn';
        nextBtn.disabled = historyState.currentPage === totalPages;
        nextBtn.innerHTML = 'Siguiente <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>';
        nextBtn.addEventListener('click', () => {
            if (historyState.currentPage < totalPages) {
                historyState.currentPage++;
                renderHistoryResults();
            }
        });

        paginationDiv.appendChild(prevBtn);
        paginationDiv.appendChild(pageInfo);
        paginationDiv.appendChild(nextBtn);
        resultsContainerDiv.appendChild(paginationDiv);
    }
}

// Eliminar item del historial
async function deleteHistoryItem(timestamp) {
    try {
        const result = await window.alfredAPI.deleteHistoryItem(timestamp);

        if (result.success) {
            showNotification('success', 'Pregunta eliminada del historial');
            // Recargar el historial
            await showHistory();
        } else {
            showNotification('error', 'Error al eliminar del historial');
        }
    } catch (error) {
        showNotification('error', 'Error al eliminar del historial');
        console.error('Error:', error);
    }
}

// Cargar item del historial
function loadHistoryItem(item) {
    // Limpiar mensaje de bienvenida si existe
    const welcomeMsg = State.messagesContainer.querySelector('.welcome-message');
    if (welcomeMsg) {
        welcomeMsg.remove();
    }

    addMessage(item.question, 'user');
    addMessage(item.answer, 'assistant', {
        from_history: true,
        sources: item.sources || []
    });

    // Ocultar el contenido del sidebar al cargar un item
    hideLeftSidebarContent();
    setActiveNavItem(null);
}
