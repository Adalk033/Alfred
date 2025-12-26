/**
 * Message Attachment Indicator Component
 * Creates a secure attachment indicator for messages without using innerHTML with user data
 */

/**
 * Creates an attachment indicator element for a message safely
 * @param {Array<{name: string}>} attachedFiles - Array of file objects with name property
 * @returns {HTMLElement} The created attachment indicator element
 */
export function createMessageAttachmentIndicator(attachedFiles) {
    // Create main container
    const attachmentIndicator = document.createElement('div');
    attachmentIndicator.className = 'message-attachment';
    
    // Create attachment icon SVG
    const iconSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    iconSvg.setAttribute('width', '14');
    iconSvg.setAttribute('height', '14');
    iconSvg.setAttribute('viewBox', '0 0 24 24');
    iconSvg.setAttribute('fill', 'currentColor');
    
    const iconPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    iconPath.setAttribute('d', 'M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z');
    iconSvg.appendChild(iconPath);
    
    // Create files list container
    const filesList = document.createElement('div');
    filesList.className = 'attachment-files-list';
    
    // Add each file name safely using textContent
    attachedFiles.forEach(file => {
        const fileNameSpan = document.createElement('span');
        fileNameSpan.className = 'attachment-file-name';
        fileNameSpan.textContent = file.name; // Safe: textContent escapes HTML
        filesList.appendChild(fileNameSpan);
    });
    
    // Assemble the component
    attachmentIndicator.appendChild(iconSvg);
    attachmentIndicator.appendChild(filesList);
    
    return attachmentIndicator;
}
