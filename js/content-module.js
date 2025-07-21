/**
 * content-module.js
 * Main entry point for the content script (module version)
 */

// Log loading status first, before attempting any imports
console.log('content-module.js loaded - attempting dynamic imports');

// Use dynamic import to load dependencies
async function initializeExtension() {
    try {
        // Dynamically import dependencies
        const helpersModule = await import(chrome.runtime.getURL('js/utils/helpers.js'));
        const LinkedInAdapterModule = await import(chrome.runtime.getURL('js/sites/LinkedInAdapter.js'));
        
        // Extract the needed exports
        const { logger } = helpersModule;
        const LinkedInAdapter = LinkedInAdapterModule.default;
        
        // Log success
        console.log('Successfully loaded module dependencies!');
        
        // Set logger level to debug during troubleshooting
        logger.level = logger.LEVELS.DEBUG;
        
        // Log when the script loads to help with troubleshooting
        logger.info('Module script loaded successfully with all dependencies ✓');
        
        // Prevent multiple initializations
        if (window.jobAssistant) {
            logger.debug('Module already initialized, skipping');
            return;
        }
        
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
                    const site = this.detectSite();
                    logger.info(`Detected site: ${site}`);
                    
                    switch (site) {
                        case 'linkedin':
                            logger.info('Creating LinkedIn adapter');
                            this.currentAdapter = new LinkedInAdapter();
                            this.currentAdapter.init()
                                .then(() => logger.debug('Adapter init complete'))
                                .catch(error => logger.error('Error initializing LinkedIn adapter:', error));
                            break;
                            
                        // Add more site adapters here as needed
                        // case 'indeed':
                        //     this.currentAdapter = new IndeedAdapter();
                        //     this.currentAdapter.init();
                        //     break;
                        
                        default:
                            logger.info('No adapter available for this site');
                            break;
                    }
                } catch (error) {
                    logger.error('Error during initialization:', error);
                }
            }
            
            /**
             * Detect current site
             * @returns {String} Site identifier
             */
            detectSite() {
                const url = window.location.href;
                logger.debug(`Current URL: ${url}`);
                
                if (url.includes('linkedin.com')) {
                    return 'linkedin';
                }
                
                // Add more site detection rules here as needed
                // if (url.includes('indeed.com')) {
                //     return 'indeed';
                // }
                
                return 'unknown';
            }
        }
        
        // Create and store instance in window object
        window.jobAssistant = new JobAssistant();
        logger.info('Job Assistant initialized successfully');
    } catch (error) {
        console.error('Failed to load module dependencies:', error);
        // Add a visual indicator that module loading failed
        if (document.body) {
            const errorIndicator = document.createElement('div');
            errorIndicator.style.position = 'fixed';
            errorIndicator.style.top = '10px';
            errorIndicator.style.right = '10px';
            errorIndicator.style.backgroundColor = '#f8d7da';
            errorIndicator.style.color = '#721c24';
            errorIndicator.style.padding = '8px 12px';
            errorIndicator.style.borderRadius = '4px';
            errorIndicator.style.zIndex = '10000';
            errorIndicator.textContent = 'Module loading failed - see console';
            document.body.appendChild(errorIndicator);
        }
    }
}

// Start the initialization process
initializeExtension(); 