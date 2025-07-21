/**
 * content.js
 * Main entry point for the content script
 */

// Import AdapterFactory instead of individual adapters
import AdapterFactory from './core/AdapterFactory.js';
import { logger } from './utils/helpers.js';

// Set logger level to debug during troubleshooting
logger.level = logger.LEVELS.DEBUG;

// Log when the script loads to help with troubleshooting
logger.info('Content script module loaded successfully');

// Prevent multiple initializations
if (window.jobAssistant) {
    logger.debug('Content script already initialized, skipping');
} else {
    /**
     * Main class to handle site detection and adapter initialization
     */
    class JobAssistant {
        constructor() {
            this.currentAdapter = null;
            this.initialize();
        }

        /**
         * Initialize the appropriate adapter based on current site
         */
        initialize() {
            try {
                logger.info('Initializing Job Assistant');
                
                // Use the factory to get the appropriate adapter
                this.currentAdapter = AdapterFactory.getAdapter();
                
                if (this.currentAdapter) {
                    logger.info(`Adapter created for site: ${window.location.hostname}`);
                    this.currentAdapter.init()
                        .then(() => logger.info('Adapter initialized successfully'))
                        .catch(error => logger.error('Error initializing adapter:', error));
                } else {
                    logger.info('No adapter available for this site');
                }
            } catch (error) {
                logger.error('Error during initialization:', error);
            }
        }
    }

    // Create and store instance in window object
    window.jobAssistant = new JobAssistant();
    logger.info('Job Assistant initialized successfully');
} 