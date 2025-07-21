/**
 * UIManager.js
 * Handles UI components and interactions
 */

class UIManager {
    constructor() {
        // Removed currentFeedbackJob property
    }

    /**
     * Add styles to the page
     */
    addStyles() {
        if (document.getElementById('search-assist-styles')) {
            return;
        }
        
        const styleElement = document.createElement('style');
        styleElement.id = 'search-assist-styles';
        
        styleElement.textContent = `
            /* Job card badge styles */
            .search-assist-badge {
                position: absolute;
                top: 36px;
                right: 10px;
                left: auto;
                width: 27px;
                height: 27px;
                border-radius: 50%;
                background-color: #4caf50;
                color: white;
                font-weight: bold;
                font-size: 16px;
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10;
                box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                cursor: pointer;
            }
            
            /* Result details overlay */
            .search-assist-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background-color: rgba(0,0,0,0.7);
                z-index: 9999;
                display: flex;
                justify-content: center;
                align-items: center;
            }
            
            .search-assist-modal {
                background-color: white;
                border-radius: 8px;
                padding: 20px;
                width: 600px;
                max-height: 80vh;
                overflow-y: auto;
                box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            }
            
            /* Remove feedback modal styles - no longer needed */
        `;
        
        document.head.appendChild(styleElement);
    }

    /**
     * Show loading spinner
     * @param {String} loadingText - Text to display
     * @param {Element} container - Container element
     */
    showLoadingSpinner(loadingText, container) {
        if (!container) return;
        
        const spinner = document.createElement('div');
        spinner.className = 'search-assist-spinner';
        spinner.innerHTML = `
            <div class="spinner-circle"></div>
            <div class="spinner-text">${loadingText || 'Loading...'}</div>
        `;
        
        container.innerHTML = '';
        container.appendChild(spinner);
    }

    /**
     * Show error message
     * @param {String} errorMessage - Error message
     * @param {Element} container - Container element
     */
    showErrorMessage(errorMessage, container) {
        if (!container) return;
        
        const errorElement = document.createElement('div');
        errorElement.className = 'search-assist-error';
        errorElement.textContent = errorMessage || 'An error occurred';
        
        container.innerHTML = '';
        container.appendChild(errorElement);
    }

    // Removed openFeedbackModal method
    // Removed createFeedbackModal method
    // Removed closeFeedbackModal method
    // Removed selectFeedbackType method
    // Removed submitFeedback method
    // Removed showFeedbackStatus method
}

export default UIManager; 