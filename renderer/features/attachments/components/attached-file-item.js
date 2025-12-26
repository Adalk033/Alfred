/**
 * Attached File Item Component
 * Creates a secure attached file item without using innerHTML with user data
 */

/**
 * Creates an attached file item element safely
 * @param {Object} file - The file object with name and size properties
 * @param {number} index - The index of the file in the array
 * @param {Function} formatFileSize - Function to format file size
 * @returns {HTMLElement} The created attached file item element
 */
export function createAttachedFileItem(file, index, formatFileSize) {
    // Create main container
    const fileItem = document.createElement('div');
    fileItem.className = 'attached-file-item';
    
    // Create file info section
    const fileInfo = document.createElement('div');
    fileInfo.className = 'attached-file-info';
    
    // Create file icon SVG
    const iconSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    iconSvg.setAttribute('width', '14');
    iconSvg.setAttribute('height', '14');
    iconSvg.setAttribute('viewBox', '0 0 24 24');
    iconSvg.setAttribute('fill', 'currentColor');
    
    const iconPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    iconPath.setAttribute('d', 'M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6z');
    iconSvg.appendChild(iconPath);
    
    // Create file name span (using textContent for security)
    const fileNameSpan = document.createElement('span');
    fileNameSpan.className = 'file-name';
    fileNameSpan.title = file.name; // Safe: title attribute is properly escaped by browser
    fileNameSpan.textContent = file.name; // Safe: textContent escapes HTML
    
    // Create file size span
    const fileSizeSpan = document.createElement('span');
    fileSizeSpan.className = 'file-size';
    fileSizeSpan.textContent = formatFileSize(file.size);
    
    // Assemble file info
    fileInfo.appendChild(iconSvg);
    fileInfo.appendChild(fileNameSpan);
    fileInfo.appendChild(fileSizeSpan);
    
    // Create remove button
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-file-btn';
    removeBtn.dataset.index = index.toString();
    removeBtn.title = 'Quitar archivo';
    
    // Create remove icon SVG
    const removeSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    removeSvg.setAttribute('width', '14');
    removeSvg.setAttribute('height', '14');
    removeSvg.setAttribute('viewBox', '0 0 24 24');
    removeSvg.setAttribute('fill', 'none');
    removeSvg.setAttribute('stroke', 'currentColor');
    removeSvg.setAttribute('stroke-width', '2');
    
    const removePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    removePath.setAttribute('d', 'M18 6L6 18M6 6l12 12');
    removeSvg.appendChild(removePath);
    
    removeBtn.appendChild(removeSvg);
    
    // Assemble the component
    fileItem.appendChild(fileInfo);
    fileItem.appendChild(removeBtn);
    
    return fileItem;
}
