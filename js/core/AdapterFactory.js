/**
 * AdapterFactory.js
 * Factory for creating site-specific job adapters
 */

import LinkedInAdapter from '../sites/LinkedInAdapter.js';

class AdapterFactory {
    /**
     * Get the appropriate adapter for the current site
     * @returns {Object} The site-specific adapter instance
     */
    static getAdapter() {
        const currentUrl = window.location.href;
        
        // Match LinkedIn URLs
        if (currentUrl.includes('linkedin.com')) {
            console.log('Creating LinkedIn adapter');
            return new LinkedInAdapter();
        }
        
        // Add more site adapters here as they are implemented
        // Example:
        // if (currentUrl.includes('indeed.com')) {
        //     console.log('Creating Indeed adapter');
        //     return new IndeedAdapter();
        // }
        
        // Default to LinkedIn for now
        console.log('No specific adapter found for URL, defaulting to LinkedIn adapter');
        return new LinkedInAdapter();
    }
}

export default AdapterFactory; 