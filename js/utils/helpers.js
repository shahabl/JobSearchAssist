/**
 * helpers.js
 * Utility functions that can be used across the extension
 */

/**
 * Safely extract text content from an element
 * @param {Element} element - DOM element
 * @param {String} defaultValue - Default value if element is null
 * @returns {String} Text content or default value
 */
export function safeTextContent(element, defaultValue = '') {
    return element ? element.textContent.trim() : defaultValue;
}

/**
 * Delay execution for specified time
 * @param {Number} ms - Milliseconds to delay
 * @returns {Promise} Promise that resolves after delay
 */
export function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function until it succeeds or max attempts reached
 * @param {Function} fn - Function to retry
 * @param {Number} maxAttempts - Maximum number of attempts
 * @param {Number} delayMs - Delay between attempts in ms
 * @returns {Promise} Promise that resolves with function result
 */
export async function retry(fn, maxAttempts = 5, delayMs = 1000) {
    let attempts = 0;
    let lastError;
    
    while (attempts < maxAttempts) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            attempts++;
            await delay(delayMs);
        }
    }
    
    throw new Error(`Max retry attempts reached: ${lastError.message}`);
}

/**
 * Check if element is visible in viewport
 * @param {Element} element - DOM element
 * @returns {Boolean} True if element is visible
 */
export function isElementVisible(element) {
    if (!element) return false;
    
    const rect = element.getBoundingClientRect();
    const isVisible = (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= window.innerHeight &&
        rect.right <= window.innerWidth
    );
    
    return isVisible && window.getComputedStyle(element).display !== 'none';
}

/**
 * Generate a unique ID
 * @returns {String} Unique ID
 */
export function generateUniqueId() {
    return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
}

/**
 * Format an object for logging
 * @param {Object} obj - Object to format
 * @returns {String} Formatted string
 */
export function formatObject(obj) {
    try {
        return JSON.stringify(obj, null, 2);
    } catch (e) {
        return String(obj);
    }
}

/**
 * Debug logger with configurable level and better formatting
 */
export const logger = {
    LEVELS: {
        DEBUG: 0,
        INFO: 1,
        WARN: 2,
        ERROR: 3
    },
    
    // Set default level (can be changed at runtime)
    level: 1, // INFO
    
    // Add prefix to logs
    prefix: '[JobAssistant]',
    
    // Format arguments for better logging
    formatArgs(args) {
        return args.map(arg => {
            if (typeof arg === 'object' && arg !== null) {
                return formatObject(arg);
            }
            return arg;
        });
    },
    
    debug(message, ...args) {
        if (this.level <= this.LEVELS.DEBUG) {
            console.debug(`${this.prefix} ${message}`, ...this.formatArgs(args));
        }
    },
    
    info(message, ...args) {
        if (this.level <= this.LEVELS.INFO) {
            console.info(`${this.prefix} ${message}`, ...this.formatArgs(args));
        }
    },
    
    warn(message, ...args) {
        if (this.level <= this.LEVELS.WARN) {
            console.warn(`${this.prefix} ${message}`, ...this.formatArgs(args));
        }
    },
    
    error(message, ...args) {
        if (this.level <= this.LEVELS.ERROR) {
            console.error(`${this.prefix} ${message}`, ...this.formatArgs(args));
        }
    }
}; 