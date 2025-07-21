/**
 * LinkedInAdapter.js
 * LinkedIn-specific implementation for job listing processing
 */

// Import the base adapter class
import BaseJobSiteAdapter from '../core/BaseJobSiteAdapter.js';

class LinkedInAdapter extends BaseJobSiteAdapter {
    constructor() {
        super(); // Call the parent constructor
    }

    /**
     * Set up mutation observer to detect DOM changes
     */
    setupMutationObserver() {
        // Observer for job listings and job description panel
        this.observer = new MutationObserver((mutations) => {
            let hasNewListings = false;
            let hasJobDescriptionUpdate = false;
            let hasPaginationChanges = false;
            
            for (const mutation of mutations) {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    // Check for new job listings
                    const newListings = Array.from(mutation.addedNodes).some(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            return node.classList && (
                                node.classList.contains('job-card-container') ||
                                node.querySelector('.job-card-container') ||
                                node.classList.contains('scaffold-layout__list-item') ||
                                node.querySelector('.scaffold-layout__list-item') ||
                                node.id === 'jobs-search-results-footer' ||
                                node.querySelector('.jobs-search-pagination')
                            );
                        }
                        return false;
                    });
                    
                    if (newListings) {
                        hasNewListings = true;
                    }
                    
                    // Check for job description updates
                    const descriptionUpdates = Array.from(mutation.addedNodes).some(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            return node.classList && (
                                node.classList.contains('jobs-description') ||
                                node.classList.contains('jobs-box--fadein') ||
                                node.querySelector('.jobs-description') ||
                                node.querySelector('.jobs-box--fadein')
                            );
                        }
                        return false;
                    });
                    
                    if (descriptionUpdates) {
                        hasJobDescriptionUpdate = true;
                    }
                    
                    // Check for pagination changes
                    const paginationUpdates = Array.from(mutation.addedNodes).some(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            return node.id === 'jobs-search-results-footer' ||
                                   node.querySelector('.jobs-search-pagination') ||
                                   node.classList && node.classList.contains('jobs-search-pagination');
                        }
                        return false;
                    });
                    
                    if (paginationUpdates) {
                        hasPaginationChanges = true;
                    }
                }
            }
            
            // Process new listings if detected
            if (hasNewListings || hasPaginationChanges) {
                this.logger?.info('LinkedInAdapter: New job listings or pagination detected, updating UI');
                // Use a longer timeout to ensure LinkedIn's UI has stabilized
                setTimeout(() => {
                    this.displayCachedResultsForVisibleListings();
                }, 1500);
            }
            
            // Handle job description updates
            if (hasJobDescriptionUpdate) {
                this.logger?.info('LinkedInAdapter: Job description update detected');
            }
        });
        
        this.observer.observe(document.body, {
            childList: true,
            subtree: true
        });
        
        // Observer for URL changes (pagination, navigation)
        let lastUrl = location.href;
        
        this.urlObserver = new MutationObserver(() => {
            if (location.href !== lastUrl) {
                this.logger?.info('LinkedInAdapter: URL changed, refreshing listings');
                lastUrl = location.href;
                
                // Use a staggered approach to handle LinkedIn's loading behavior
                setTimeout(() => {
                    this.displayCachedResultsForVisibleListings();
                }, 1500);
                
                // Try again after a longer delay to catch any late-loaded items
                setTimeout(() => {
                    this.displayCachedResultsForVisibleListings();
                }, 3000);
            }
        });
        
        this.urlObserver.observe(document.body, { 
            childList: true,
            subtree: true 
        });
        
        // Add scroll listener to handle lazy loading
        window.addEventListener('scroll', this.debounce(() => {
            this.displayCachedResultsForVisibleListings();
        }, 300));
    }

    /**
     * Find job listings in the DOM
     * @returns {Array} Array of job listing elements
     */
    findJobListings() {
        try {
            // The main jobs list container - LinkedIn's current structure
            const jobsList = document.querySelector('ul.hGByQEOVDCYtBdgZhMutwkWZGDYyuVk');
            
            if (jobsList) {
                // Get all job listings in the list
                const listings = Array.from(jobsList.querySelectorAll('li.scaffold-layout__list-item'));
                this.logger?.debug(`Found ${listings.length} listings using main container selector`);
                return listings;
            }
            
            // Fallback selectors if the main container isn't found
            const fallbackSelectors = [
                'li.scaffold-layout__list-item',
                'div[data-job-id]',
                '.job-card-container',
                '.jobs-search-results__list-item'
            ];
            
            for (const selector of fallbackSelectors) {
                const listings = Array.from(document.querySelectorAll(selector));
                if (listings.length > 0) {
                    this.logger?.debug(`Found ${listings.length} listings using fallback selector: ${selector}`);
                    return listings;
                }
            }
            
            this.logger?.debug('No job listings found with any selector');
            return [];
        } catch (error) {
            this.logger?.error('Error finding job listings:', error);
            return [];
        }
    }

    /**
     * Find the "Next" button for pagination
     * @returns {Element|null} The next page button element or null if not found
     */
    findNextPageButton() {
        try {
            // First try to find the next button in the jobs-search-results-footer structure
            // which is the main structure in the current LinkedIn UI
            const jobsFooter = document.getElementById('jobs-search-results-footer');
            if (jobsFooter) {
                this.logger?.debug('LinkedInAdapter: Found jobs-search-results-footer container');
                
                // Look for the Next button within the footer
                const nextButton = jobsFooter.querySelector('button[aria-label="View next page"], button.jobs-search-pagination__button--next');
                
                if (nextButton && !nextButton.disabled && nextButton.style.display !== 'none') {
                    this.logger?.debug('LinkedInAdapter: Found next button in jobs-search-results-footer');
                    return nextButton;
                }
            }
            
            // Try various pagination containers that LinkedIn might use
            const paginationContainers = [
                '.jobs-search-pagination',
                '.jobs-search-results-list__pagination',
                '.artdeco-pagination'
            ];
            
            for (const containerSelector of paginationContainers) {
                const container = document.querySelector(containerSelector);
                if (container) {
                    this.logger?.debug(`LinkedInAdapter: Found pagination container with selector: ${containerSelector}`);
                    
                    // Look for the Next button within the container
                    const nextButton = container.querySelector(
                        'button[aria-label="View next page"], ' +
                        'button[aria-label="Next"], ' +
                        'button.jobs-search-pagination__button--next, ' +
                        'button.artdeco-pagination__button--next'
                    );
                    
                    if (nextButton && !nextButton.disabled && nextButton.style.display !== 'none') {
                        this.logger?.debug(`LinkedInAdapter: Found next button in ${containerSelector}`);
                        return nextButton;
                    }
                }
            }
            
            // Try to find by specific selectors
            const nextButtonSelectors = [
                'button.artdeco-button.jobs-search-pagination__button--next', // Based on the provided HTML
                'button.jobs-search-pagination__button--next',
                'button.artdeco-pagination__button--next',
                'button[aria-label="View next page"]',
                'button[aria-label="Next"]'
            ];
            
            for (const selector of nextButtonSelectors) {
                const button = document.querySelector(selector);
                if (button && !button.disabled && button.style.display !== 'none') {
                    this.logger?.debug(`LinkedInAdapter: Found next button using selector: ${selector}`);
                    return button;
                }
            }
            
            // If all else fails, look for any button with "Next" text content
            const allButtons = document.querySelectorAll('button');
            for (const button of allButtons) {
                const buttonText = button.textContent.trim().toLowerCase();
                if (buttonText === 'next' || buttonText.endsWith('next')) {
                    if (!button.disabled && 
                        button.style.display !== 'none' && 
                        button.offsetParent !== null) {
                        this.logger?.debug('LinkedInAdapter: Found next button by text content');
                        return button;
                    }
                }
            }
            
            this.logger?.debug('LinkedInAdapter: No next button found');
            return null;
        } catch (error) {
            this.logger?.error('Error finding next button:', error);
            return null;
        }
    }

    /**
     * Get the ID of a job listing
     * @param {Element} listing - Job listing element
     * @returns {String} Listing ID
     */
    getListingId(listing) {
        if (!listing) {
            this.logger?.warn('getListingId called with null/undefined listing');
            return `unknown_${Date.now()}`;
        }
        
        try {
            // Try to get the job ID first from the data-occludable-job-id attribute (based on HTML example)
            const occludableJobId = listing.getAttribute('data-occludable-job-id');
            if (occludableJobId) {
                this.logger?.debug('Found job ID from data-occludable-job-id:', occludableJobId);
                return occludableJobId;
            }
            
            // Try to extract from job title link (most reliable based on HTML example)
            const jobTitleLink = listing.querySelector('a.job-card-list__title--link, a.job-card-container__link, a[href*="/jobs/view/"]');
            if (jobTitleLink) {
                const href = jobTitleLink.getAttribute('href') || '';
                // Match job ID in URLs like "/jobs/view/3978697868/?eBP=..."
                const matches = href.match(/\/jobs\/view\/(\d+)/);
                if (matches && matches[1]) {
                    this.logger?.debug('Found job ID from title link href:', matches[1]);
                    return matches[1];
                }
            }
            
            // Also try to get it from the data-job-id attribute
            const directJobId = listing.getAttribute('data-job-id');
            if (directJobId) {
                this.logger?.debug('Found job ID from data-job-id on listing:', directJobId);
                return directJobId;
            }
            
            // Check for the job card container (nested element with job ID)
            const jobCard = listing.querySelector('div[data-job-id]');
            if (jobCard) {
                const dataJobId = jobCard.getAttribute('data-job-id');
                if (dataJobId) {
                    this.logger?.debug('Found job ID from nested div[data-job-id]:', dataJobId);
                    return dataJobId;
                }
            }
            
            // Fallback to previous methods if necessary
            const entityUrn = listing.getAttribute('data-entity-urn') || listing.getAttribute('data-urn');
            const idFromUrn = entityUrn ? this.extractIdFromUrn(entityUrn) : null;
            
            // Generate a fallback ID if needed
            const fallbackId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
            
            // Use the first available ID or fallback
            const id = occludableJobId || directJobId || idFromUrn || fallbackId;
            
            if (id === fallbackId) {
                this.logger?.warn('Could not find a proper job ID, using generated ID:', id);
            } else {
                this.logger?.debug('Using job ID:', id);
            }
            
            return id;
        } catch (error) {
            this.logger?.error('Error extracting job ID:', error);
            return `error_${Date.now()}`;
        }
    }
    
    /**
     * Helper method to extract ID from LinkedIn URN
     * @param {String} urn - LinkedIn URN string
     * @returns {String|null} Extracted ID or null
     */
    extractIdFromUrn(urn) {
        if (!urn) return null;
        
        try {
            // Format: urn:li:fs_jobPosting:123456789
            const parts = urn.split(':');
            if (parts.length > 2) {
                const id = parts[parts.length - 1];
                this.logger?.debug('Extracted ID from URN:', id);
                return id;
            }
        } catch (e) {
            this.logger?.error('Error extracting ID from URN:', e);
        }
        
        return null;
    }

    /**
     * Extract content from a job listing element
     * @param {Element} listingElement - Job listing element
     * @returns {Object|null} Extracted content or null
     */
    async extractListingContent(listingElement) {
        try {
            if (!listingElement) {
                this.logger?.warn('extractListingContent called with null/undefined element');
                return null;
            }
            
            // Get job ID early so we can use it for debugging
            let jobId;
            try {
                jobId = this.getListingId(listingElement);
                this.logger?.info(`Extracting content for job ID: ${jobId}`);
            } catch (error) {
                this.logger?.error('Error getting job ID:', error);
                jobId = listingElement.getAttribute('data-job-id') || `unknown_${Date.now()}`;
            }
            
            // --- Title Element Detection ---
            let titleElement = null;
            try {
                // LinkedIn job titles are typically in elements with these classes
                const titleSelectors = [
                    'a.job-card-list__title--link',           // Current main format (based on HTML example)
                    'a.job-card-container__link',             // Alternative format
                    '.artdeco-entity-lockup__title a',        // Title within lockup component
                    'a[href*="/jobs/view/"]',                 // Any link to a job with view in URL
                    '.job-card-list__title',                  // Title without link
                    // Direct target by element structure
                    'div.artdeco-entity-lockup__title a',     // Title within lockup nested div
                    '.full-width a[href*="/jobs/view/"][id]',     // Title within full-width container
                    // Most generic fallback that would match both examples
                    'a[href*="/jobs/view/"][id]'              // Any link that goes to a job view with an ID
                ];
                
                // Try each selector
                for (const selector of titleSelectors) {
                    titleElement = listingElement.querySelector(selector);
                    if (titleElement) {
                        break;
                    }
                }
                
                // If we still couldn't find it, try to find it from any internal element with specific text
                if (!titleElement) {
                    // Look for elements containing the text "Software Engineer" or similar job titles
                    const allElements = listingElement.querySelectorAll('a, strong');
                    for (const el of allElements) {
                        if (el.textContent && 
                            (el.textContent.includes('Engineer') || 
                             el.textContent.includes('Developer') || 
                             el.textContent.includes('Manager'))) {
                            titleElement = el;
                            break;
                        }
                    }
                }
            } catch (error) {
                this.logger?.error(`Error finding title element for job ${jobId}:`, error);
            }
            
            // Get the job title text
            let title = '';
            try {
                if (titleElement) {
                    // First try to get the title from the strong element (visible title)
                    const strongElement = titleElement.querySelector('strong');
                    if (strongElement) {
                        title = strongElement.textContent.trim();
                    } else {
                        // If no strong element, try to get the first text node that's not inside a .visually-hidden span
                        const visibleSpans = Array.from(titleElement.childNodes).filter(node => 
                            node.nodeType === Node.ELEMENT_NODE && 
                            !node.classList.contains('visually-hidden')
                        );
                        
                        if (visibleSpans.length > 0) {
                            title = visibleSpans[0].textContent.trim();
                        } else {
                            // Get the full text and handle possible duplication
                            const fullText = titleElement.textContent.trim();
                            
                            // LinkedIn often duplicates text in elements. Check if the text is duplicated
                            // and only use the first half if it is.
                            const halfLength = Math.floor(fullText.length / 2);
                            const firstHalf = fullText.substring(0, halfLength).trim();
                            const secondHalf = fullText.substring(halfLength).trim();
                            
                            // Check if the two halves are identical or very similar
                            if (firstHalf && firstHalf === secondHalf) {
                                title = firstHalf; // Use just the first half if it's duplicated
                            } else {
                                title = fullText; // Use the full text if it doesn't seem duplicated
                            }
                        }
                    }
                }
                
                // Further cleanup for duplicate title issues
                if (title) {
                    // Some LinkedIn titles have duplication with a pattern like "Title - Title"
                    const parts = title.split(' - ');
                    if (parts.length === 2 && parts[0] === parts[1]) {
                        title = parts[0];
                    }
                    
                    // Final cleanup for any duplicate titles not caught by other methods
                    // This checks for any duplication patterns
                    const titleLength = title.length;
                    for (let i = 1; i <= Math.floor(titleLength / 2); i++) {
                        const firstPart = title.substring(0, i);
                        if (title === firstPart.repeat(titleLength / i)) {
                            title = firstPart;
                            break;
                        }
                    }
                }
                
                this.logger?.debug(`Final job title: "${title}"`);
            } catch (error) {
                this.logger?.error(`Error extracting title text for job ${jobId}:`, error);
            }
            
            // --- Company Element Detection ---
            let companyElement = null;
            try {
                // LinkedIn company names are typically in these elements
                const companySelectors = [
                    '.tfikReLxWHbMYqtKsAqWoLItrOTsRlmAgCsf',         // Current format (from HTML example)
                    '.artdeco-entity-lockup__subtitle',               // Common format
                    '.artdeco-entity-lockup__subtitle span',          // Company within span in subtitle
                    '.fjcgoHIpDYpBsijttvhurDAnkofMEqgvxjg',          // Another class pattern seen in examples
                    '.job-card-container__company-name',              // Alternative format
                    '.job-card-container__primary-description',       // Another alternative
                    // Fallback to more generic approaches
                    'div.artdeco-entity-lockup__subtitle span',       // Company name in subtitle span
                    '.artdeco-entity-lockup__content div:nth-child(2)'// Second div in lockup content (usually company)
                ];
                
                for (const selector of companySelectors) {
                    companyElement = listingElement.querySelector(selector);
                    if (companyElement) {
                        break;
                    }
                }
            } catch (error) {
                this.logger?.error(`Error finding company element for job ${jobId}:`, error);
            }
            
            // Get company name
            let company = '';
            try {
                if (companyElement) {
                    company = companyElement.textContent.trim();
                }
            } catch (error) {
                this.logger?.error(`Error extracting company text for job ${jobId}:`, error);
            }
            
            // --- Location Element Detection ---
            let locationElement = null;
            try {
                // LinkedIn locations are typically in these elements
                const locationSelectors = [
                    '.aKSgVMyrvfklKQtOCeldDxVIKTrBVVGeWwISo',        // Current format (from HTML example)
                    '.nbpFZfvKBWVtmzxFwhcFOgkuACqIrtxq',             // Another class pattern seen in examples
                    '.artdeco-entity-lockup__caption .job-card-container__metadata-wrapper li', // Common format
                    '.job-card-container__metadata-item',             // Alternative format
                    '.job-search-card__location',                     // Another alternative
                    // Looking for captions/metadata that typically contain location
                    '.artdeco-entity-lockup__caption li',             // Location in list item in caption
                    '.artdeco-entity-lockup__caption span',           // Location in span in caption
                    'ul.job-card-container__metadata-wrapper li'      // Location in metadata wrapper list item
                ];
                
                // First try specific selectors
                for (const selector of locationSelectors) {
                    const elements = listingElement.querySelectorAll(selector);
                    if (elements && elements.length > 0) {
                        // Use the first location element found (usually the one containing the location)
                        locationElement = elements[0];
                        break;
                    }
                }
            } catch (error) {
                this.logger?.error(`Error finding location element for job ${jobId}:`, error);
            }
            
            // Get location text
            let location = '';
            try {
                if (locationElement) {
                    location = locationElement.textContent.trim();
                }
            } catch (error) {
                this.logger?.error(`Error extracting location text for job ${jobId}:`, error);
            }
            
            // --- Get salary information ---
            let salary = '';
            try {
                // Look for salary information in metadata items
                const metadataItems = listingElement.querySelectorAll('.job-card-container__metadata-item, .artdeco-entity-lockup__caption li');
                if (metadataItems && metadataItems.length > 0) {
                    for (const item of metadataItems) {
                        const text = item.textContent.trim().toLowerCase();
                        if (text.includes('$') || text.includes('/yr') || text.includes('/hour') || 
                            text.includes('salary') || text.includes('k/yr')) {
                            salary = item.textContent.trim();
                            break;
                        }
                    }
                }
            } catch (error) {
                this.logger?.error(`Error extracting salary for job ${jobId}:`, error);
            }
            
            // --- Get Description ---
            // Try to get the full job description from the right panel
            let description = '';
            let descriptionHtml = '';
            
            try {
                // First click the listing to load the description in the right panel
                const clickableElement = listingElement.querySelector('a.job-card-list__title--link, a.job-card-container__link, a[href*="/jobs/view/"]') || listingElement;
                clickableElement.click();
                
                // Wait for the description to load using a Promise
                await new Promise(resolve => {
                    // We need to wait for the description panel to update
                    const checkDescription = () => {
                        const descriptionContainer = document.querySelector('.jobs-description');
                        if (descriptionContainer) {
                            description = descriptionContainer.textContent.trim();
                            descriptionHtml = descriptionContainer.innerHTML;
                            this.logger?.debug(`Found job description with ${description.length} characters`);
                            resolve();
                        } else {
                            // Try again after a short delay
                            setTimeout(checkDescription, 500);
                        }
                    };
                    
                    // Start checking after a short initial delay
                    setTimeout(checkDescription, 500);
                    
                    // Set a safety timeout in case description never loads
                    setTimeout(() => {
                        if (!description) {
                            this.logger?.warn(`Timed out waiting for description for job ${jobId}`);
                            resolve(); // Resolve anyway to prevent hanging
                        }
                    }, 5000);
                });
            } catch (error) {
                this.logger?.error(`Error getting full description for job ${jobId}:`, error);
            }
            
            // Return the structured content
            return {
                jobId,
                title,
                company,
                location,
                salary,
                description,
                descriptionHtml,
                url: `https://www.linkedin.com/jobs/view/${jobId}/`
            };
        } catch (error) {
            this.logger?.error('Error extracting listing content:', error);
            return null;
        }
    }
    
    /**
     * Extract reason from HTML analysis for badge tooltips
     * @param {String} analysisHtml - HTML analysis content
     * @returns {String} Extracted reason text
     */
    extractReason(analysisHtml) {
        if (!analysisHtml) return null;
        
        try {
            // Create a temporary div to parse the HTML
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = analysisHtml;
            
            // Find the first reason in the list
            const firstListItem = tempDiv.querySelector('li');
            if (firstListItem) {
                return firstListItem.textContent.trim();
            }
            
            // If no list item found, just get the text after the YES/NO
            const strongTag = tempDiv.querySelector('strong');
            if (strongTag && strongTag.nextSibling) {
                return strongTag.nextSibling.textContent.trim();
            }
            
            // If still nothing, get the first paragraph
            const firstParagraph = tempDiv.querySelector('p');
            if (firstParagraph) {
                return firstParagraph.textContent.trim();
            }
        } catch (e) {
            this.logger?.error('Error extracting reason from analysis:', e);
        }
        
        return null;
    }
    
    /**
     * Update the UI of a job listing with analysis results
     * @param {Element} listing - Job listing element
     * @param {Object} result - Analysis result
     */
    updateListingUI(listing, result) {
        try {
            if (!listing || !document.body.contains(listing)) {
                this.logger?.warn('updateListingUI called with invalid listing element');
                return;
            }
            
            const listingId = this.getListingId(listing);
            this.logger?.debug(`Updating UI for listing ${listingId}`);
            
            // Check if we already added a badge to this listing
            if (listing.querySelector('.search-assist-badge')) {
                // Already has a badge, just update its appearance if needed
                this.updateBadgeAppearance(listing, result);
                return;
            }
            
            // Ensure the listing has position relative to anchor the badge properly
            listing.style.position = 'relative';
            
            // Create the badge element
            const badge = document.createElement('div');
            badge.className = 'search-assist-badge';
            badge.setAttribute('data-job-id', listingId);
            
            // Set badge content based on result
            let tooltipText = '';
            if (result.isGoodFit === true) {
                badge.textContent = '✓';
                badge.style.backgroundColor = '#4caf50'; // Green
                tooltipText = this.extractReason(result.analysis) || 'Good match based on your criteria!';
            } else if (result.isGoodFit === false) {
                badge.textContent = '✗';
                badge.style.backgroundColor = '#f44336'; // Red
                tooltipText = this.extractReason(result.analysis) || 'Not a good match for your criteria';
            } else {
                badge.textContent = '?';
                badge.style.backgroundColor = '#ff9800'; // Orange for indeterminate
                tooltipText = 'Match unknown';
            }
            
            // Add tooltip functionality
            badge.title = tooltipText;
            
            // Add click handler to show analysis
            badge.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.showAnalysisOverlay(listingId, result);
            });
            
            // Add hover effect for better user experience
            badge.style.cursor = 'pointer';
            badge.style.transition = 'transform 0.2s';
            badge.addEventListener('mouseenter', () => {
                badge.style.transform = 'scale(1.2)';
            });
            badge.addEventListener('mouseleave', () => {
                badge.style.transform = 'scale(1)';
            });
            
            // Append the badge to the listing
            listing.appendChild(badge);
        } catch (error) {
            this.logger?.error('Error updating listing UI:', error);
        }
    }
    
    /**
     * Update badge appearance for existing badge
     * @param {Element} listing - Job listing element
     * @param {Object} result - Analysis result
     */
    updateBadgeAppearance(listing, result) {
        try {
            const badge = listing.querySelector('.search-assist-badge');
            if (!badge) return;
            
            let tooltipText = '';
            if (result.isGoodFit === true) {
                badge.textContent = '✓';
                badge.style.backgroundColor = '#4caf50'; // Green
                tooltipText = this.extractReason(result.analysis) || 'Good match based on your criteria!';
            } else if (result.isGoodFit === false) {
                badge.textContent = '✗';
                badge.style.backgroundColor = '#f44336'; // Red
                tooltipText = this.extractReason(result.analysis) || 'Not a good match for your criteria';
            } else {
                badge.textContent = '?';
                badge.style.backgroundColor = '#ff9800'; // Orange for indeterminate
                tooltipText = 'Match unknown';
            }
            
            // Update tooltip
            badge.title = tooltipText;
        } catch (error) {
            this.logger?.error('Error updating badge appearance:', error);
        }
    }
    
    /**
     * Show analysis overlay with detailed information
     * @param {String} jobId - Job ID
     * @param {Object} result - Analysis result
     */
    showAnalysisOverlay(jobId, result) {
        try {
            // Create overlay container
            const overlay = document.createElement('div');
            overlay.className = 'search-assist-overlay';
            
            // Create modal content
            const modal = document.createElement('div');
            modal.className = 'search-assist-modal';
            
            // Set up content
            const title = document.createElement('h2');
            title.textContent = result.title || 'Job Analysis';
            
            const company = document.createElement('h3');
            company.textContent = result.company || '';
            
            const location = document.createElement('p');
            location.textContent = result.location || '';
            
            // Add salary if available
            const salary = document.createElement('p');
            salary.style.fontStyle = 'italic';
            if (result.salary) {
                salary.textContent = `Salary: ${result.salary}`;
            }
            
            const analysis = document.createElement('div');
            analysis.className = 'search-assist-analysis';
            
            // Add header with result
            const resultHeader = document.createElement('div');
            resultHeader.className = 'search-assist-result-header';
            
            if (result.isGoodFit === true) {
                resultHeader.innerHTML = '<h3 style="color: #4caf50;">✓ Good Match</h3>';
            } else if (result.isGoodFit === false) {
                resultHeader.innerHTML = '<h3 style="color: #f44336;">✗ Not a Match</h3>';
            } else {
                resultHeader.innerHTML = '<h3 style="color: #ff9800;">? Indeterminate</h3>';
            }
            
            // Add analysis content
            if (result.analysis) {
                analysis.innerHTML = result.analysis;
            } else {
                analysis.innerHTML = '<p>No detailed analysis available.</p>';
            }
            
            // Close button
            const closeButton = document.createElement('button');
            closeButton.textContent = 'Close';
            closeButton.style.marginTop = '20px';
            closeButton.style.padding = '8px 16px';
            closeButton.style.backgroundColor = '#f0f0f0';
            closeButton.style.border = 'none';
            closeButton.style.borderRadius = '4px';
            closeButton.style.cursor = 'pointer';
            closeButton.addEventListener('click', () => {
                document.body.removeChild(overlay);
            });
            
            // Assemble modal
            modal.appendChild(title);
            modal.appendChild(company);
            modal.appendChild(location);
            if (result.salary) modal.appendChild(salary);
            modal.appendChild(resultHeader);
            modal.appendChild(analysis);
            modal.appendChild(closeButton);
            
            // Add modal to overlay
            overlay.appendChild(modal);
            
            // Add overlay to body
            document.body.appendChild(overlay);
            
            // Add click outside to close
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    document.body.removeChild(overlay);
                }
            });
        } catch (error) {
            this.logger?.error('Error showing analysis overlay:', error);
        }
    }
}

export default LinkedInAdapter; 