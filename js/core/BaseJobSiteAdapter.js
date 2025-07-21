/**
 * BaseJobSiteAdapter.js
 * Base class for all job site-specific adapters
 */

class BaseJobSiteAdapter {
    constructor() {
        // Dependencies will be loaded dynamically in init
        this.processor = null;
        this.uiManager = null;
        this.isProcessing = false;
        this.observer = null;
        this.urlObserver = null;
        this.logger = null; // Will be set during init
        
        // Keep track of found job IDs to prevent duplicates
        this.processedIds = new Set();
        
        // Add a counter for total jobs processed in this session
        this.totalJobsProcessedThisSession = 0;
    }

    /**
     * Initialize the adapter
     */
    async init() {
        try {
            // Initialize logger to null
            this.logger = null;
            
            // Use console.log for initial messages before logger is loaded
            console.log(`${this.constructor.name}: Loading dependencies...`);
            
            // Dynamically import dependencies
            const JobProcessorModule = await import(chrome.runtime.getURL('js/core/JobProcessor.js'));
            const UIManagerModule = await import(chrome.runtime.getURL('js/ui/UIManager.js'));
            const helpersModule = await import(chrome.runtime.getURL('js/utils/helpers.js'));
            
            // Extract the needed exports
            const JobProcessor = JobProcessorModule.default;
            const UIManager = UIManagerModule.default;
            this.logger = helpersModule.logger;
            
            console.log(`${this.constructor.name}: Dependencies loaded successfully`);
            
            // Create instances
            this.processor = new JobProcessor();
            this.uiManager = new UIManager();
            
            // Initialize processor
            await this.processor.init();
            
            // Set up event handlers
            this.setupMessageListener();
            this.setupMutationObserver();
            
            // Add styles
            this.uiManager.addStyles();
            
            // Do initial setup
            await this.initialSetup();
            
            this.logger.info(`${this.constructor.name}: Initialized successfully`);
        } catch (error) {
            // Use console.error here as this.logger might not be initialized yet
            console.error(`${this.constructor.name}: Initialization error:`, error);
        }
    }

    /**
     * Perform initial setup when extension loads - to be overridden by subclasses
     */
    async initialSetup() {
        this.logger?.info(`${this.constructor.name}: Running initial setup`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        try {
            // First try to extract jobs from the current page
            const jobCards = this.findJobListings();
            this.logger?.info(`${this.constructor.name}: Found ${jobCards.length} job cards during initial setup`);
            
            // Always display cached results first, regardless of whether we found job cards
            await this.displayCachedResultsForVisibleListings();
            
            // Process existing job cards
            if (jobCards.length > 0) {
                await this.addResultBadgesToAllListings();
                
                // Add a second attempt after a delay to ensure badges are visible
                setTimeout(async () => {
                    await this.displayCachedResultsForVisibleListings();
                    
                    // Force repaint by scrolling slightly and back
                    const scrollPosition = window.scrollY;
                    window.scrollBy(0, 1);
                    setTimeout(() => window.scrollTo(0, scrollPosition), 50);
                }, 3000);
            } else {
                this.logger?.info(`${this.constructor.name}: No job cards found during initial setup, waiting...`);
                await new Promise(resolve => setTimeout(resolve, 3000));
                
                // Try one more time to find listings and display cached results
                await this.displayCachedResultsForVisibleListings();
                await this.addResultBadgesToAllListings(8, 2000); // More retries with longer delay
                
                // Add a final attempt after all the retries
                setTimeout(async () => {
                    await this.displayCachedResultsForVisibleListings();
                }, 4000);
            }
        } catch (error) {
            this.logger?.error(`${this.constructor.name}: Error in initial setup:`, error);
        }
    }

    /**
     * Set up mutation observer to detect DOM changes - should be implemented by subclasses
     */
    setupMutationObserver() {
        throw new Error('setupMutationObserver must be implemented by subclass');
    }

    /**
     * Set up message listener for extension communication
     */
    setupMessageListener() {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            // Handle response messages from background script
            if (request.responseToId) {
                // This is a response to a previous request
                // We don't need to do anything here as the JobProcessor
                // has its own listener for these messages
                return false;
            }
            
            if (request.action === 'startProcessing') {
                this.logger?.info(`${this.constructor.name}: Starting job processing`);
                
                // Allow explicitly setting resetProcessed flag in the request
                const resetProcessed = request.resetProcessed === true;
                
                // We need to ensure sendResponse is called within a reasonable timeframe
                // Create a timeout to ensure we respond even if the process takes too long
                let responseHandled = false;
                
                // Set a safety timeout to make sure we respond before Chrome closes the channel
                const safetyTimeout = setTimeout(() => {
                    if (!responseHandled) {
                        try {
                            this.logger?.warn(`${this.constructor.name}: Sending provisional success response`);
                            responseHandled = true;
                            sendResponse({ success: true, message: 'Processing started in background' });
                        } catch (err) {
                            this.logger?.error('Error sending timeout response:', err);
                        }
                    }
                }, 1000); // Respond within 1 second to be safe
                
                // Start processing and handle the response when possible
                this.startProcessing(resetProcessed)
                    .then(() => {
                        clearTimeout(safetyTimeout);
                        try {
                            if (!responseHandled) {
                                responseHandled = true;
                                sendResponse({ success: true });
                            }
                        } catch (err) {
                            this.logger?.error('Error sending success response:', err);
                        }
                    })
                    .catch(error => {
                        clearTimeout(safetyTimeout);
                        try {
                            this.logger?.error(`${this.constructor.name}: Processing error:`, error);
                            if (!responseHandled) {
                                responseHandled = true;
                                sendResponse({ success: false, error: error.message });
                            }
                        } catch (err) {
                            this.logger?.error('Error sending error response:', err);
                        }
                    });
                
                // Return true to indicate we'll respond asynchronously
                return true;
            } else if (request.action === 'updateCriteria') {
                // For synchronous operations, respond immediately
                try {
                    this.processor.currentCriteria = request.criteria;
                    sendResponse({ success: true });
                } catch (error) {
                    this.logger?.error('Error updating criteria:', error);
                    sendResponse({ success: false, error: error.message });
                }
                
                // No need to return true for synchronous responses
                return false;
            }
            
            // Default response for unhandled messages
            sendResponse({ success: false, error: 'Unknown action' });
            return false;
        });
    }

    /**
     * Start processing job listings
     * @param {Boolean} resetProcessed - Whether to reset the list of processed jobs
     */
    async startProcessing(resetProcessed = false) {
        if (this.isProcessing) {
            this.logger?.debug(`${this.constructor.name}: Already processing, skipping`);
            return;
        }
        
        this.isProcessing = true;
        
        try {
            // Only reset processed listings if explicitly requested (should rarely be needed)
            if (resetProcessed) {
                this.logger?.debug(`${this.constructor.name}: Resetting processed listings`);
                this.processor.processedListings.clear();
                // Reset our counter too
                this.totalJobsProcessedThisSession = 0;
            }
            
            // Get the maximum jobs to process from storage
            let maxJobsToProcess = 100; // Default value
            try {
                const result = await new Promise(resolve => {
                    chrome.storage.local.get(['maxJobsToProcess'], resolve);
                });
                if (result.maxJobsToProcess) {
                    maxJobsToProcess = parseInt(result.maxJobsToProcess);
                    this.logger?.debug(`${this.constructor.name}: Using max jobs limit from settings: ${maxJobsToProcess}`);
                }
            } catch (error) {
                this.logger?.error(`${this.constructor.name}: Error retrieving maxJobsToProcess:`, error);
            }
            
            const listings = await this.waitForJobListings();
            if (!listings || listings.length === 0) {
                this.logger?.warn(`${this.constructor.name}: No job listings found`);
                return;
            }
            
            // Reset the counter when starting a new processing session
            this.totalJobsProcessedThisSession = 0;
            
            // Process current page with the specified max jobs limit
            const totalProcessed = await this.processCurrentPage(maxJobsToProcess);
            
            this.logger?.debug(`${this.constructor.name}: Finished processing. Total new jobs processed across all pages: ${totalProcessed}`);
            
        } catch (error) {
            this.logger?.error(`${this.constructor.name}: Processing error:`, error);
            throw error; // Re-throw so the message listener can catch it
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Wait for job listings to appear
     * @param {Number} maxAttempts - Maximum number of attempts
     * @param {Number} delay - Delay between attempts in ms
     * @returns {Array|null} Job listings or null
     */
    async waitForJobListings(maxAttempts = 10, delay = 1000) {
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            const listings = this.findJobListings();
            if (listings.length > 0) {
                return listings;
            }
            await new Promise(resolve => setTimeout(resolve, delay));
        }
        return null;
    }

    /**
     * Process job listings on the current page
     * @param {Number} maxJobsOnPage - Maximum new jobs to process on page
     * @returns {Number} Total number of new jobs processed on this page
     */
    async processCurrentPage(maxJobsOnPage = Infinity) {
        const listings = this.findJobListings();
        if (!listings || listings.length === 0) {
            this.logger?.warn(`${this.constructor.name}: No job listings found on current page`);
            return 0;
        }
        
        // Calculate how many more jobs we can process within the limit
        const remainingJobsAllowed = maxJobsOnPage - this.totalJobsProcessedThisSession;
        
        // If we've already hit the limit, don't process any more jobs
        if (remainingJobsAllowed <= 0) {
            this.logger?.info(`${this.constructor.name}: Already reached the maximum of ${maxJobsOnPage} jobs, stopping processing`);
            return 0;
        }

        this.logger?.debug(`${this.constructor.name}: Processing up to ${remainingJobsAllowed} more jobs out of ${listings.length} found on page`);
        this.logger?.debug(`${this.constructor.name}: Currently have ${this.processor.processedListings.size} already processed jobs in memory`);
        this.logger?.debug(`${this.constructor.name}: Already processed ${this.totalJobsProcessedThisSession}/${maxJobsOnPage} jobs in this session`);
        
        // First, check if any listings are already in the cache and update their UI
        this.logger?.debug(`${this.constructor.name}: Checking for cached results before processing`);
        await this.displayCachedResultsForVisibleListings();
        
        let processedCount = 0;
        let skippedCount = 0;
        let alreadyProcessedCount = 0;
        let failedCount = 0;
        
        for (let i = 0; i < listings.length; i++) {
            // Check if we've reached the SESSION limit
            if (this.totalJobsProcessedThisSession >= maxJobsOnPage) {
                this.logger?.debug(`${this.constructor.name}: Reached overall max limit of ${maxJobsOnPage} jobs, stopping`);
                break;
            }
            
            // Check if we've reached the PAGE limit (redundant but a good safety check)
            if (processedCount >= remainingJobsAllowed) {
                this.logger?.debug(`${this.constructor.name}: Reached page limit of ${remainingJobsAllowed} jobs, stopping`);
                break;
            }
            
            const listing = listings[i];
            const listingId = this.getListingId(listing);
            
            if (!listingId) {
                this.logger?.warn(`${this.constructor.name}: Could not get ID for listing, skipping`);
                skippedCount++;
                continue;
            }
            
            // Skip listings we've already processed
            if (this.processor.processedListings.has(listingId)) {
                this.logger?.debug(`${this.constructor.name}: Skipping already processed listing ${listingId}`);
                alreadyProcessedCount++;
                continue;
            }
            
            // Start the delay timer immediately as we begin processing
            const delayPromise = new Promise(resolve => setTimeout(resolve, 1500));
            
            try {
                this.logger?.debug(`${this.constructor.name}: Processing new listing ${listingId} (${i+1} of ${listings.length})`);
                
                // Process the listing and wait for completion
                const result = await this.processListing(listing);
                
                if (result) {
                    this.processor.processedListings.add(listingId);
                    processedCount++;
                    this.totalJobsProcessedThisSession++; // Update the session-wide counter
                    this.logger?.debug(`${this.constructor.name}: Successfully processed job ${i+1}/${listings.length}, total this page: ${processedCount}/${remainingJobsAllowed}, total session: ${this.totalJobsProcessedThisSession}/${maxJobsOnPage}`);
                }
                
                // If this isn't the last job to process and we haven't hit our limit,
                // wait for the minimum delay time before moving to the next job
                if (i < listings.length - 1 && processedCount < remainingJobsAllowed && this.totalJobsProcessedThisSession < maxJobsOnPage) {
                    this.logger?.debug(`${this.constructor.name}: Waiting for delay before processing next job...`);
                    
                    // Only wait for the delay to finish (we've already completed the job processing)
                    await delayPromise;
                }
            } catch (error) {
                this.logger?.error(`${this.constructor.name}: Error processing listing ${listingId}:`, error);
                failedCount++;
                
                // If we encounter too many failures in a row, slow down to avoid hitting rate limits
                if (failedCount > 3) {
                    this.logger?.warn(`${this.constructor.name}: Multiple failures detected, adding extra delay`);
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    failedCount = 0; // Reset counter after waiting
                }
            }
        }
        
        this.logger?.debug(`${this.constructor.name}: Finished processing page. New jobs processed: ${processedCount}, Already processed: ${alreadyProcessedCount}, Skipped due to errors: ${skippedCount}`);
        
        // If we haven't reached the max jobs limit yet and there are more pages, go to the next page
        const remainingAfterThisPage = maxJobsOnPage - this.totalJobsProcessedThisSession;
        if (remainingAfterThisPage > 0) {
            const nextButton = this.findNextPageButton();
            if (nextButton) {
                this.logger?.debug(`${this.constructor.name}: Found next page button, navigating to next page (${remainingAfterThisPage} jobs remaining in limit)`);
                
                // Scroll to the button to ensure it's in view
                nextButton.scrollIntoView({ behavior: 'smooth' });
                
                // Wait a moment before clicking to allow scroll to complete
                await new Promise(resolve => setTimeout(resolve, 1500));
                
                // Click the next button
                nextButton.click();
                
                // Wait for the page to load - need more time for pagination
                this.logger?.debug(`${this.constructor.name}: Waiting for next page to load`);
                await new Promise(resolve => setTimeout(resolve, 4000));
                
                // Find new listings and process them - pass the OVERALL limit, not just what's left
                this.logger?.debug(`${this.constructor.name}: Processing next page`);
                const additionalProcessed = await this.processCurrentPage(maxJobsOnPage);
                
                // Add the additional processed count to our total for this page's return value
                processedCount += additionalProcessed;
            } else {
                this.logger?.debug(`${this.constructor.name}: No next page button found, finished processing all available pages`);
            }
        } else {
            this.logger?.info(`${this.constructor.name}: Reached max job limit (${maxJobsOnPage}), not checking for more pages`);
        }
        
        return processedCount;
    }

    /**
     * Process a single job listing
     * @param {Element} listing - Job listing element
     * @returns {Promise<boolean>} True if successfully processed
     */
    async processListing(listing) {
        try {
            // Get the listing ID for logging
            const listingId = this.getListingId(listing);
            if (!listingId) {
                this.logger?.warn(`${this.constructor.name}: Could not get ID for listing, skipping`);
                return false;
            }
            
            this.logger?.info(`${this.constructor.name}: Processing job ${listingId}`);
            
            // First, verify the listing is still in the DOM
            if (!document.body.contains(listing)) {
                this.logger?.warn(`${this.constructor.name}: Listing ${listingId} is no longer in the DOM, skipping`);
                return false;
            }
            
            // 1. Scroll the job listing into view to ensure it's visible and properly loaded
            this.logger?.debug(`${this.constructor.name}: Scrolling job listing ${listingId} into view`);
            listing.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            // 2. Click the listing to ensure the job description panel is loaded
            // (if the listing isn't already selected/active)
            if (!listing.classList.contains('active') && !listing.classList.contains('selected') && !listing.hasAttribute('aria-selected')) {
                this.logger?.debug(`${this.constructor.name}: Clicking job listing ${listingId} to load description`);
                listing.click();
            }
            
            // 3. Give the page time to respond to the scroll and click
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Extract content from the listing - implement retry logic for reliability
            let content = null;
            let retryCount = 0;
            const maxRetries = 3;
            
            while (!content && retryCount < maxRetries) {
                try {
                    // 4. Ensure the job description panel is visible before extraction
                    // This varies by site so we can only attempt some general approaches
                    const descriptionPanel = document.querySelector('.jobs-description, .job-description-panel, [data-job-id="' + listingId + '"]');
                    if (descriptionPanel) {
                        this.logger?.debug(`${this.constructor.name}: Found description panel for ${listingId}, ensuring visibility`);
                        descriptionPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        // Short wait after scrolling
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                    
                    content = await this.extractListingContent(listing);
                    
                    // Validate that we have at least basic job details
                    if (content && (!content.title || !content.company || content.title === "Unknown Title" || content.company === "Unknown Company")) {
                        this.logger?.warn(`${this.constructor.name}: Incomplete data extracted for listing ${listingId}, will retry`);
                        
                        // Scroll again to ensure visibility and wait longer before retry
                        if (descriptionPanel) {
                            descriptionPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        } else {
                            listing.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }
                        
                        // Longer delay before retry with increasing wait times
                        const retryDelay = 1000 * (retryCount + 1);
                        await new Promise(resolve => setTimeout(resolve, retryDelay));
                        content = null; // Force retry
                        retryCount++;
                    }
                } catch (error) {
                    this.logger?.error(`${this.constructor.name}: Error extracting content from listing ${listingId}, attempt ${retryCount + 1}:`, error);
                    
                    // Wait a bit longer before next retry
                    await new Promise(resolve => setTimeout(resolve, 1500 * (retryCount + 1)));
                    retryCount++;
                }
            }
            
            if (!content) {
                this.logger?.warn(`${this.constructor.name}: Could not extract valid content from listing ${listingId} after ${maxRetries} attempts`);
                return false;
            }
            
            // Log successful content extraction
            this.logger?.debug(`${this.constructor.name}: Successfully extracted content for job ${listingId}:`, 
                              { title: content.title, company: content.company });

            // Retrieve the user's resume from storage
            let resume = null;
            try {
                const storageData = await new Promise(resolve => {
                    chrome.storage.local.get(['userResume'], resolve);
                });
                resume = storageData.userResume || null;
                
                if (resume) {
                    this.logger?.info('Retrieved resume from storage, length:', resume.length);
                } else {
                    this.logger?.info('No resume found in storage');
                }
            } catch (error) {
                this.logger?.error('Error retrieving resume from storage:', error);
            }

            const cacheKey = `job_${content.jobId}`;
            // Pass resume as an additional parameter to processListing
            const result = await this.processor.processListing(content, cacheKey, resume);
            
            if (result) {
                // Check if listing is still in DOM before updating UI
                if (document.body.contains(listing)) {
                    this.updateListingUI(listing, result);
                    return true;
                } else {
                    this.logger?.warn(`${this.constructor.name}: Listing ${listingId} is no longer in the DOM, can't update UI`);
                    return false;
                }
            }
            
            return false;
        } catch (error) {
            this.logger?.error(`${this.constructor.name}: Error in processListing:`, error);
            throw error;
        }
    }

    /**
     * Add result badges to all listings
     * @param {Number} maxRetries - Maximum number of retries
     * @param {Number} delay - Delay between retries in ms
     */
    async addResultBadgesToAllListings(maxRetries = 3, delay = 1000) {
        let retries = 0;
        
        while (retries < maxRetries) {
            try {
                const listings = this.findJobListings();
                if (listings && listings.length > 0) {
                    this.logger?.debug(`${this.constructor.name}: Adding result badges to ${listings.length} listings`);
                    
                    for (const listing of listings) {
                        const listingId = this.getListingId(listing);
                        if (listingId) {
                            const cacheKey = `job_${listingId}`;
                            const cachedResult = this.processor.getCachedResult(cacheKey);
                            
                            if (cachedResult) {
                                this.updateListingUI(listing, cachedResult);
                            }
                        }
                    }
                    return;
                }
            } catch (error) {
                this.logger?.error(`${this.constructor.name}: Error adding result badges:`, error);
            }
            
            retries++;
            if (retries < maxRetries) {
                this.logger?.debug(`${this.constructor.name}: Retry ${retries}/${maxRetries} for adding result badges`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        
        this.logger?.warn(`${this.constructor.name}: Failed to add result badges after ${maxRetries} attempts`);
    }

    /**
     * Display cached results for visible listings
     */
    async displayCachedResultsForVisibleListings() {
        try {
            const listings = this.findJobListings();
            if (!listings || listings.length === 0) {
                return;
            }
            
            this.logger?.debug(`${this.constructor.name}: Checking cached results for ${listings.length} listings`);
            
            for (const listing of listings) {
                try {
                    const listingId = this.getListingId(listing);
                    if (!listingId) continue;
                    
                    const cacheKey = `job_${listingId}`;
                    const cachedResult = this.processor.getCachedResult(cacheKey);
                    
                    if (cachedResult) {
                        this.updateListingUI(listing, cachedResult);
                    }
                } catch (error) {
                    this.logger?.error(`${this.constructor.name}: Error displaying cached result for listing:`, error);
                }
            }
        } catch (error) {
            this.logger?.error(`${this.constructor.name}: Error displaying cached results:`, error);
        }
    }

    /**
     * Helper method: Debounce function to limit how often a function is called
     * @param {Function} func - Function to debounce
     * @param {Number} wait - Wait time in ms
     * @returns {Function} Debounced function
     */
    debounce(func, wait) {
        let timeout;
        return function(...args) {
            const context = this;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), wait);
        };
    }

    // Abstract methods that must be implemented by subclasses
    
    /**
     * Find job listings in the DOM
     * @returns {Array} Array of job listing elements
     */
    findJobListings() {
        throw new Error('findJobListings must be implemented by subclass');
    }
    
    /**
     * Get the ID of a job listing
     * @param {Element} listing - Job listing element
     * @returns {String} Listing ID
     */
    getListingId(listing) {
        throw new Error('getListingId must be implemented by subclass');  
    }
    
    /**
     * Extract content from a job listing element
     * @param {Element} listingElement - Job listing element
     * @returns {Promise<Object|null>} Promise resolving to extracted content or null
     */
    async extractListingContent(listingElement) {
        throw new Error('extractListingContent must be implemented by subclass');
    }
    
    /**
     * Find the "Next" button for pagination
     * @returns {Element|null} The next page button element or null if not found
     */
    findNextPageButton() {
        throw new Error('findNextPageButton must be implemented by subclass');
    }
    
    /**
     * Update the UI of a job listing with analysis results
     * @param {Element} listing - Job listing element
     * @param {Object} result - Analysis result
     */
    updateListingUI(listing, result) {
        throw new Error('updateListingUI must be implemented by subclass');
    }
}

export default BaseJobSiteAdapter; 