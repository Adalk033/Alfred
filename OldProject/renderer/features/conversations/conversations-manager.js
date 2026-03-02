import { showNotification } from '../../core/notifications.js';
import * as State from '../../state/state.js';
import { loadConversations } from '../../core/conversations.js';
import { showLeftSidebarContent, hideLeftSidebarContent, setActiveNavItem, getActiveNavItem } from '../../dom/sidebar.js';

// Conversations state
export const conversationsState = {
    allConversations: [],
    filteredConversations: [],
    currentPage: 1,
    itemsPerPage: 5,
    totalItems: 0,
    searchTerm: ''
};

// Expose globally for other modules to access
window.conversationsState = conversationsState;

// ==================== CONVERSATIONS LIST ====================

// Show conversations list
export async function showConversations() {
    const conversationsBtn = document.getElementById('conversationsBtn');
    const leftSidebarContent = document.getElementById('leftSidebarContent');

    // If already active, hide it
    if (getActiveNavItem() === conversationsBtn && leftSidebarContent.classList.contains('active')) {
        hideLeftSidebarContent();
        setActiveNavItem(null);
        return;
    }

    try {
        await loadConversations();

        // Load all conversations into state
        conversationsState.allConversations = State.conversations;
        conversationsState.filteredConversations = State.conversations;
        conversationsState.currentPage = 1;
        conversationsState.totalItems = State.conversations.length;
        conversationsState.searchTerm = '';

        renderConversationsWithSearch();
        showLeftSidebarContent();
        setActiveNavItem(conversationsBtn);
    } catch (error) {
        showNotification('error', 'Error al cargar conversaciones');
        console.error('Error:', error);
    }
}

// Render conversations with search interface
export function renderConversationsWithSearch() {
    State.sidebarContent.innerHTML = '';

    // Header with title and actions
    const header = document.createElement('div');
    header.className = 'conversations-header';

    const title = document.createElement('h4');
    title.textContent = 'Conversaciones';
    title.style.marginBottom = '16px';
    title.style.color = 'var(--text-primary)';

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'conversations-actions';

    const selectionBtn = document.createElement('button');
    selectionBtn.id = 'selectionModeBtn';
    selectionBtn.className = 'icon-btn-small';
    selectionBtn.title = 'Seleccionar multiples';
    selectionBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>';
    selectionBtn.onclick = () => window.conversationActions.toggleSelectionMode();

    const deleteBtn = document.createElement('button');
    deleteBtn.id = 'deleteSelectedBtn';
    deleteBtn.className = 'icon-btn-small danger';
    deleteBtn.title = 'Eliminar seleccionadas';
    deleteBtn.style.display = 'none';
    deleteBtn.disabled = true;
    deleteBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg><span class="selected-count" style="display: none;"></span>';
    deleteBtn.onclick = () => window.conversationActions.deleteSelected();

    actionsDiv.appendChild(selectionBtn);
    actionsDiv.appendChild(deleteBtn);

    header.appendChild(title);
    header.appendChild(actionsDiv);
    State.sidebarContent.appendChild(header);

    // Search container
    const searchContainer = document.createElement('div');
    searchContainer.className = 'history-search-container';

    // Search input
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'history-search-bar';
    searchInput.placeholder = 'Buscar conversaciones...';
    searchInput.addEventListener('input', (e) => handleConversationsSearch(e.target.value));

    searchContainer.appendChild(searchInput);
    State.sidebarContent.appendChild(searchContainer);

    // Render initial results
    renderConversationsResults();
}

// Handle conversations search
export function handleConversationsSearch(searchTerm) {
    conversationsState.searchTerm = searchTerm.toLowerCase();
    conversationsState.currentPage = 1;

    if (searchTerm.trim().length === 0) {
        conversationsState.filteredConversations = conversationsState.allConversations;
    } else {
        filterConversationsResults();
    }

    renderConversationsResults();
}

// Filter conversation results
export function filterConversationsResults() {
    const term = conversationsState.searchTerm;

    if (term.length === 0) {
        conversationsState.filteredConversations = conversationsState.allConversations;
    } else {
        conversationsState.filteredConversations = conversationsState.allConversations.filter(conv => {
            const titleMatch = conv.title.toLowerCase().includes(term);
            const messagesMatch = conv.messages && conv.messages.some(msg =>
                (msg.content && msg.content.toLowerCase().includes(term))
            );
            return titleMatch || messagesMatch;
        });
    }

    conversationsState.totalItems = conversationsState.filteredConversations.length;
}

// Render conversation results with pagination
export function renderConversationsResults() {
    // Clear previous results container if exists
    let resultsContainer = State.sidebarContent.querySelector('.conversations-results-container');
    if (resultsContainer) {
        resultsContainer.remove();
    }

    // Create results container
    const resultsContainerDiv = document.createElement('div');
    resultsContainerDiv.className = 'conversations-results-container history-results-container';

    // Results info
    const resultsInfo = document.createElement('div');
    resultsInfo.className = 'history-results-info';

    const countText = document.createElement('span');
    countText.className = 'history-results-count';
    if (conversationsState.totalItems === 0) {
        countText.textContent = 'Sin resultados';
    } else {
        const startItem = (conversationsState.currentPage - 1) * conversationsState.itemsPerPage + 1;
        const endItem = Math.min(conversationsState.currentPage * conversationsState.itemsPerPage, conversationsState.totalItems);
        countText.innerHTML = `<span>${startItem}-${endItem} de ${conversationsState.totalItems}</span>`;
    }

    resultsInfo.appendChild(countText);
    resultsContainerDiv.appendChild(resultsInfo);

    // Items container
    const itemsContainer = document.createElement('div');
    itemsContainer.className = 'conversations-list history-items-container';

    if (conversationsState.filteredConversations.length === 0) {
        const emptyState = document.createElement('div');
        emptyState.className = 'history-empty-state';
        emptyState.innerHTML = `
            <div class="history-empty-state-icon">🗂️</div>
            <div class="history-empty-state-text">
                ${conversationsState.searchTerm ? 'No se encontraron conversaciones' : 'No hay conversaciones guardadas'}
            </div>
        `;
        itemsContainer.appendChild(emptyState);
    } else {
        // Calculate current page items
        const startIdx = (conversationsState.currentPage - 1) * conversationsState.itemsPerPage;
        const endIdx = startIdx + conversationsState.itemsPerPage;
        const pageItems = conversationsState.filteredConversations.slice(startIdx, endIdx);

        pageItems.forEach(conversation => {
            const convItem = document.createElement('div');
            convItem.className = 'conversation-item history-item';
            convItem.setAttribute('data-conversation-id', conversation.id);

            // Add checkbox if in selection mode
            if (State.conversationSelectionMode) {
                const checkboxDiv = document.createElement('div');
                checkboxDiv.className = 'item-checkbox';
                
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.checked = State.selectedConversations.has(conversation.id);
                checkbox.onclick = (e) => {
                    e.stopPropagation();
                    if (checkbox.checked) {
                        State.selectedConversations.add(conversation.id);
                        convItem.classList.add('selected');
                    } else {
                        State.selectedConversations.delete(conversation.id);
                        convItem.classList.remove('selected');
                    }
                    // Call global function to update delete button
                    if (window.conversationActions && window.conversationActions.updateDeleteButton) {
                        window.conversationActions.updateDeleteButton();
                    }
                };
                
                checkboxDiv.appendChild(checkbox);
                convItem.appendChild(checkboxDiv);
                
                // If item is selected, mark it visually
                if (State.selectedConversations.has(conversation.id)) {
                    convItem.classList.add('selected');
                }
            }

            const contentWrapper = document.createElement('div');
            contentWrapper.className = 'history-item-content';
            contentWrapper.style.cursor = State.conversationSelectionMode ? 'pointer' : 'pointer';
            
            if (State.conversationSelectionMode) {
                // In selection mode, clicking toggles checkbox
                contentWrapper.onclick = () => {
                    const checkbox = convItem.querySelector('input[type="checkbox"]');
                    if (checkbox) {
                        checkbox.checked = !checkbox.checked;
                        
                        if (checkbox.checked) {
                            State.selectedConversations.add(conversation.id);
                            convItem.classList.add('selected');
                        } else {
                            State.selectedConversations.delete(conversation.id);
                            convItem.classList.remove('selected');
                        }
                        
                        // Update delete button
                        if (window.conversationActions && window.conversationActions.updateDeleteButton) {
                            window.conversationActions.updateDeleteButton();
                        }
                    }
                };
            } else {
                // In normal mode, opens conversation
                contentWrapper.onclick = () => window.conversationActions.load(conversation.id);
            }

            const title = document.createElement('div');
            title.className = 'history-question';
            title.textContent = conversation.title;

            contentWrapper.appendChild(title);

            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'history-item-actions';

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-history-btn';
            deleteBtn.textContent = 'x';
            deleteBtn.title = 'Eliminar conversacion';
            deleteBtn.onclick = async (e) => {
                e.stopPropagation();
                await window.conversationActions.delete(conversation.id);
            };

            actionsDiv.appendChild(deleteBtn);

            // Add selected class if in selectedConversations
            if (State.selectedConversations.has(conversation.id)) {
                convItem.classList.add('selected');
            }

            convItem.appendChild(contentWrapper);
            convItem.appendChild(actionsDiv);
            itemsContainer.appendChild(convItem);
        });
    }

    resultsContainerDiv.appendChild(itemsContainer);
    State.sidebarContent.appendChild(resultsContainerDiv);

    // Add pagination if there's more than one page
    const totalPages = Math.ceil(conversationsState.totalItems / conversationsState.itemsPerPage);
    if (totalPages > 1) {
        const paginationDiv = document.createElement('div');
        paginationDiv.className = 'history-pagination';

        const prevBtn = document.createElement('button');
        prevBtn.className = 'pagination-btn';
        prevBtn.disabled = conversationsState.currentPage === 1;
        prevBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg> Anterior';
        prevBtn.addEventListener('click', () => {
            if (conversationsState.currentPage > 1) {
                conversationsState.currentPage--;
                renderConversationsResults();
            }
        });

        const pageInfo = document.createElement('span');
        pageInfo.className = 'pagination-info';
        pageInfo.textContent = `Pagina ${conversationsState.currentPage} de ${totalPages}`;

        const nextBtn = document.createElement('button');
        nextBtn.className = 'pagination-btn';
        nextBtn.disabled = conversationsState.currentPage === totalPages;
        nextBtn.innerHTML = 'Siguiente <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>';
        nextBtn.addEventListener('click', () => {
            if (conversationsState.currentPage < totalPages) {
                conversationsState.currentPage++;
                renderConversationsResults();
            }
        });

        paginationDiv.appendChild(prevBtn);
        paginationDiv.appendChild(pageInfo);
        paginationDiv.appendChild(nextBtn);
        resultsContainerDiv.appendChild(paginationDiv);
    }
}

// Expose renderConversationsResults globally for toggleSelectionMode to call
window.renderConversationsResults = renderConversationsResults;
