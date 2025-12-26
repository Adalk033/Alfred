/**
 * Download Progress Item Component
 * Creates a secure download progress item without using innerHTML with user data
 */

/**
 * Creates a download progress item element safely
 * @param {string} modelName - The name of the model being downloaded
 * @returns {HTMLElement} The created download progress item element
 */
export function createDownloadProgressItem(modelName) {
    // Sanitize the model name for use in ID
    const sanitizedId = sanitizeForId(modelName);
    
    // Create main container
    const item = document.createElement('div');
    item.className = 'download-progress-item';
    item.id = `download-${sanitizedId}`;
    
    // Create progress info section
    const progressInfo = document.createElement('div');
    progressInfo.className = 'download-progress-info';
    
    // Create model name span (using textContent for security)
    const modelNameSpan = document.createElement('span');
    modelNameSpan.className = 'download-model-name';
    modelNameSpan.textContent = modelName; // Safe: textContent escapes HTML
    
    // Create progress percent span
    const progressPercent = document.createElement('span');
    progressPercent.className = 'download-progress-percent';
    progressPercent.textContent = '0%';
    
    progressInfo.appendChild(modelNameSpan);
    progressInfo.appendChild(progressPercent);
    
    // Create progress bar section
    const progressBar = document.createElement('div');
    progressBar.className = 'download-progress-bar';
    
    const progressFill = document.createElement('div');
    progressFill.className = 'download-progress-fill';
    progressFill.style.width = '0%';
    
    progressBar.appendChild(progressFill);
    
    // Create status section
    const progressStatus = document.createElement('div');
    progressStatus.className = 'download-progress-status';
    progressStatus.textContent = 'Iniciando descarga...';
    
    // Assemble the component
    item.appendChild(progressInfo);
    item.appendChild(progressBar);
    item.appendChild(progressStatus);
    
    return item;
}

/**
 * Sanitizes a string for use in an HTML ID attribute
 * @param {string} str - The string to sanitize
 * @returns {string} The sanitized string
 */
export function sanitizeForId(str) {
    if (typeof str !== 'string') {
        return '';
    }
    return str.replace(/[^a-zA-Z0-9]/g, '-');
}

/**
 * Gets the element ID for a download progress item
 * @param {string} modelName - The model name
 * @returns {string} The element ID
 */
export function getDownloadItemId(modelName) {
    return `download-${sanitizeForId(modelName)}`;
}
