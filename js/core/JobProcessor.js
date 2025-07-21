/**
 * JobProcessor.js
 * Core functionality for processing job listings regardless of source
 */

class JobProcessor {
    constructor() {
        this.responseCache = {};
        this.currentCriteria = '';
        this.processedListings = new Set();
        this.matchingJobs = [];
        this.rejectedJobs = [];
        this.logger = null;
        this.useLocalStorage = true; // Flag to enable/disable localStorage caching
    }

    /**
     * Initialize the processor
     */
    async init() {
        try {
            // Dynamically import helpers
            const helpersModule = await import(chrome.runtime.getURL('js/utils/helpers.js'));
            this.logger = helpersModule.logger;
            
            // Load data from storage
            await Promise.all([
                this.loadCurrentCriteria(),
                this.loadMatchingJobs(),
                this.loadRejectedJobs()
            ]);
            
            // Load from localStorage if available
            this.loadCacheFromLocalStorage();
            
            this.logger?.info('JobProcessor initialized successfully');
        } catch (error) {
            console.error('Error initializing JobProcessor:', error);
            // Set default values in case loading fails
            this.currentCriteria = '';
            this.matchingJobs = [];
            this.rejectedJobs = [];
        }
    }

    /**
     * Process a job listing
     * @param {Object} content - The content extracted from the listing
     * @param {String} cacheKey - Key to use for caching
     * @param {String} resume - Optional user resume for better matching
     * @returns {Object|null} The processing result or null
     */
    async processListing(content, cacheKey, resume = null) {
        try {
            // Validate job content first
            if (!content || !content.jobId) {
                this.logger?.warn('Invalid job content or missing jobId:', content);
                return null;
            }
            
            this.logger?.debug('Processing job:', {
                jobId: content.jobId,
                title: content.title,
                company: content.company,
                hasResume: !!resume
            });
            
            // Check cache first
            const cachedResult = this.getCachedResult(cacheKey);
            if (cachedResult) {
                this.logger?.debug('Using cached result for job', content.jobId);
                return cachedResult;
            }

            // Send to background for processing
            const result = await this.sendToBackground(content, cacheKey, resume);
            if (result) {
                this.processedListings.add(content.jobId);
                this.saveToCache(cacheKey, result);
                return result;
            }
            
            return null;
        } catch (error) {
            this.logger?.error('Error processing listing:', error);
            return null;
        }
    }

    /**
     * Send job to background for analysis
     * @param {Object} content - Content to process
     * @param {String} cacheKey - Cache key for storage
     * @param {String} resume - Optional user resume for better matching
     * @returns {Object|null} Processing result or null
     */
    async sendToBackground(content, cacheKey, resume = null) {
        try {
            this.logger?.debug('Sending job to background for analysis:', {
                jobId: content.jobId,
                title: content.title,
                hasResume: !!resume
            });
            
            const response = await this.sendMessageToBackground({
                action: 'analyzeListing',
                content: content,
                resume: resume
            });

            this.logger?.debug('Raw response from background:', response);

            // Check for successful response - the response has the data directly at root level
            if (response && response.success === true) {
                this.logger?.debug('Received successful analysis for job', content.jobId, 'with analysis:', response.analysis);
                
                // Make sure we save analysis content to the cache
                const resultToSave = {
                    isGoodFit: response.isGoodFit,
                    analysis: response.analysis,
                    title: response.title || content.title,
                    company: response.company || content.company,
                    location: response.location || content.location,
                    description: response.description || content.description,
                    descriptionHtml: response.descriptionHtml || content.descriptionHtml,
                    salary: response.salary || content.salary
                };
                
                this.logger?.debug('Saving result to cache with analysis present:', !!resultToSave.analysis, 'isGoodFit:', resultToSave.isGoodFit);
                
                this.saveToCache(cacheKey, resultToSave);
                return resultToSave;
            }
            
            if (!response || !response.success) {
                this.logger?.error('Background processing failed:', response?.error || 'No valid response');
            }
            
            return null;
        } catch (error) {
            this.logger?.error('Error sending to background:', error);
            return null;
        }
    }

    /**
     * Send a message to the background script
     * @param {Object} message - Message to send
     * @returns {Promise<Object>} Response from background
     */
    async sendMessageToBackground(message) {
        return new Promise((resolve) => {
            // Use a unique request ID to track this message
            const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            message.requestId = requestId;
            
            this.logger?.debug('Sending message to background with requestId:', requestId, {
                jobId: message.content.jobId,
                title: message.content.title
            });
            
            // Set a timeout in case we never get a response
            const timeoutId = setTimeout(() => {
                this.logger?.error(`Background message timed out after 15 seconds for job ${message.content.jobId}`);
                
                // Clean up the listener if it's still active
                try {
                    chrome.runtime.onMessage.removeListener(messageListener);
                } catch (error) {
                    this.logger?.error('Error removing message listener:', error);
                }
                
                resolve({ 
                    success: false, 
                    error: 'Request timed out after 15 seconds. The background script did not respond in time.',
                    timeoutOccurred: true
                });
            }, 15000); // 15 seconds timeout instead of 30
            
            // Define the message listener
            const messageListener = (response) => {
                /// this.logger?.debug('Received message in listener:', response);
                
                // Check if this is a response to our request
                if (response && response.responseToId === requestId) {
                    this.logger?.debug('Match found for requestId:', requestId);
                    
                    // Clean up
                    clearTimeout(timeoutId);
                    
                    try {
                        chrome.runtime.onMessage.removeListener(messageListener);
                    } catch (error) {
                        this.logger?.error('Error removing message listener:', error);
                    }
                    
                    // Resolve with the response data
                    /// this.logger?.debug('Resolving with data:', response.data);
                    resolve(response.data || { success: false, error: 'No data in response' });
                    return true;
                }
                
                // Not for us, continue listening
                return false;
            };
            
            try {
                // Add the listener before sending the message
                chrome.runtime.onMessage.addListener(messageListener);
                
                // Send the message without a callback (we'll use the listener)
                chrome.runtime.sendMessage(message, (directResponse) => {
                    // Check for any immediate errors
                    if (chrome.runtime.lastError) {
                        this.logger?.error('Error sending message:', chrome.runtime.lastError);
                        clearTimeout(timeoutId);
                        chrome.runtime.onMessage.removeListener(messageListener);
                        
                        // Safely extract the error message, with a fallback
                        const errorMessage = chrome.runtime.lastError?.message || 
                                             chrome.runtime.lastError?.toString() || 
                                             'Unknown Chrome runtime error';
                        
                        resolve({ success: false, error: errorMessage });
                        return;
                    }
                    
                    // If we got a direct response (synchronous), use it
                    if (directResponse) {
                        this.logger?.debug('Received direct (synchronous) response:', directResponse);
                        clearTimeout(timeoutId);
                        chrome.runtime.onMessage.removeListener(messageListener);
                        resolve(directResponse);
                    }
                    // Otherwise, the async listener will handle it
                });
                
                this.logger?.debug(`Message sent with ID ${requestId}`);
            } catch (error) {
                this.logger?.error('Error in sendMessageToBackground:', error);
                clearTimeout(timeoutId);
                try {
                    chrome.runtime.onMessage.removeListener(messageListener);
                } catch (err) {
                    this.logger?.error('Error removing listener after error:', err);
                }
                resolve({ success: false, error: error.message || 'Unknown error' });
            }
        });
    }

    /**
     * Get result from cache
     * @param {String} cacheKey - Cache key
     * @returns {Object|null} Cached result or null
     */
    getCachedResult(cacheKey) {
        // Validate cache key
        if (!cacheKey || cacheKey.includes('undefined')) {
            this.logger?.warn('Invalid cache key:', cacheKey);
            return null;
        }
        return this.responseCache[cacheKey];
    }

    /**
     * Save result to cache
     * @param {String} cacheKey - Cache key
     * @param {Object} result - Result to save
     */
    saveToCache(cacheKey, result) {
        // Validate cache key before saving
        if (!cacheKey || cacheKey.includes('undefined')) {
            this.logger?.warn('Not saving to cache - invalid cache key:', cacheKey);
            return;
        }
        
        if (!result) {
            this.logger?.warn('Not saving to cache - empty result for key:', cacheKey);
            return;
        }
        
        this.logger?.debug('SAVING TO CACHE - Key:', cacheKey, 'Result has analysis:', !!result.analysis, 'isGoodFit:', result.isGoodFit);
        
        // Save to memory cache
        this.responseCache[cacheKey] = result;
        
        // Save to localStorage
        try {
            if (this.useLocalStorage && window.localStorage) {
                localStorage.setItem(cacheKey, JSON.stringify(result));
                this.logger?.debug('Saved to localStorage:', cacheKey);
            }
        } catch (err) {
            this.logger?.error('Error saving to localStorage:', err);
        }
        
        // Save to extension storage
        try {
            // Make sure matchingJobs and rejectedJobs are initialized
            if (!this.matchingJobs) this.matchingJobs = [];
            if (!this.rejectedJobs) this.rejectedJobs = [];
            
            // Store some basic info about processed jobs
            if (result.isGoodFit === true) {
                this.logger?.debug('Adding to matching jobs list - has analysis:', !!result.analysis);
                this.addToMatchingJobs(cacheKey, result);
            } else if (result.isGoodFit === false) {
                this.logger?.debug('Adding to rejected jobs list - has analysis:', !!result.analysis);
                this.addToRejectedJobs(cacheKey, result);
            }
        } catch (err) {
            this.logger?.error('Error adding job to persistent storage:', err);
        }
    }
    
    /**
     * Add a job to the matching jobs list
     * @param {String} key - Cache key
     * @param {Object} result - Analysis result
     */
    addToMatchingJobs(key, result) {
        try {
            if (!this.matchingJobs) this.matchingJobs = [];
            
            // Extract job ID from the key (format is typically job_JOBID)
            const jobId = key.startsWith('job_') ? key.substring(4) : key;
            
            const basicInfo = {
                key,
                id: jobId, // Add the job ID
                title: result.title || 'Unknown Title',
                company: result.company || 'Unknown Company',
                timestamp: new Date().toISOString(),
                description: result.description || '',
                descriptionHtml: result.descriptionHtml || '',
                location: result.location || '',
                salary: result.salary || '',
                analysis: result.analysis || '', // Use the full HTML analysis
                isGoodFit: result.isGoodFit
            };
            
            // Check if job already exists to avoid duplicates
            const exists = this.matchingJobs.some(job => job.key === key || job.id === jobId);
            if (!exists) {
                this.matchingJobs.push(basicInfo);
                this.saveMatchingJobs();
                this.logger?.debug('Added job to matching jobs list:', basicInfo.id);
            } else {
                // Update the existing job with new data
                const index = this.matchingJobs.findIndex(job => job.key === key || job.id === jobId);
                if (index !== -1) {
                    this.matchingJobs[index] = basicInfo;
                    this.saveMatchingJobs();
                    this.logger?.debug('Updated existing job in matching jobs list:', basicInfo.id);
                } else {
                    this.logger?.debug('Job already in matching jobs list, not adding again:', key);
                }
            }
        } catch (err) {
            this.logger?.error('Error in addToMatchingJobs:', err);
        }
    }
    
    /**
     * Add a job to the rejected jobs list
     * @param {String} key - Cache key
     * @param {Object} result - Analysis result
     */
    addToRejectedJobs(key, result) {
        try {
            if (!this.rejectedJobs) this.rejectedJobs = [];
            
            // Extract job ID from the key (format is typically job_JOBID)
            const jobId = key.startsWith('job_') ? key.substring(4) : key;
            
            const basicInfo = {
                key,
                id: jobId, // Add the job ID
                title: result.title || 'Unknown Title',
                company: result.company || 'Unknown Company',
                timestamp: new Date().toISOString(),
                description: result.description || '',
                descriptionHtml: result.descriptionHtml || '',
                location: result.location || '',
                salary: result.salary || '',
                analysis: result.analysis || '', // Use the full HTML analysis
                isGoodFit: result.isGoodFit
            };
            
            // Check if job already exists to avoid duplicates
            const exists = this.rejectedJobs.some(job => job.key === key || job.id === jobId);
            if (!exists) {
                this.rejectedJobs.push(basicInfo);
                this.saveRejectedJobs();
                this.logger?.debug('Added job to rejected jobs list:', basicInfo.id);
            } else {
                // Update the existing job with new data
                const index = this.rejectedJobs.findIndex(job => job.key === key || job.id === jobId);
                if (index !== -1) {
                    this.rejectedJobs[index] = basicInfo;
                    this.saveRejectedJobs();
                    this.logger?.debug('Updated existing job in rejected jobs list:', basicInfo.id);
                } else {
                    this.logger?.debug('Job already in rejected jobs list, not adding again:', key);
                }
            }
        } catch (err) {
            this.logger?.error('Error in addToRejectedJobs:', err);
        }
    }

    /**
     * Load current criteria from storage
     */
    async loadCurrentCriteria() {
        try {
            const result = await new Promise(resolve => {
                chrome.storage.local.get(['currentCriteria'], resolve);
            });
            
            if (result.currentCriteria) {
                this.currentCriteria = result.currentCriteria;
            }
        } catch (error) {
            console.error('[JobProcessor] Error loading criteria:', error);
        }
    }

    /**
     * Load matching jobs from storage
     */
    async loadMatchingJobs() {
        try {
            const result = await new Promise(resolve => {
                chrome.storage.local.get(['matchingJobs'], resolve);
            });
            
            if (result.matchingJobs) {
                this.matchingJobs = JSON.parse(result.matchingJobs);
            }
        } catch (error) {
            console.error('[JobProcessor] Error loading matching jobs:', error);
        }
    }

    /**
     * Save matching jobs to storage
     */
    async saveMatchingJobs() {
        try {
            await new Promise(resolve => {
                chrome.storage.local.set({
                    matchingJobs: JSON.stringify(this.matchingJobs)
                }, resolve);
            });
        } catch (error) {
            console.error('[JobProcessor] Error saving matching jobs:', error);
        }
    }

    /**
     * Load rejected jobs from storage
     */
    async loadRejectedJobs() {
        try {
            const result = await new Promise(resolve => {
                chrome.storage.local.get(['rejectedJobs'], resolve);
            });
            
            if (result.rejectedJobs) {
                this.rejectedJobs = JSON.parse(result.rejectedJobs);
            }
        } catch (error) {
            console.error('[JobProcessor] Error loading rejected jobs:', error);
        }
    }

    /**
     * Save rejected jobs to storage
     */
    async saveRejectedJobs() {
        try {
            await new Promise(resolve => {
                chrome.storage.local.set({
                    rejectedJobs: JSON.stringify(this.rejectedJobs)
                }, resolve);
            });
        } catch (error) {
            console.error('[JobProcessor] Error saving rejected jobs:', error);
        }
    }

    /**
     * Load cached results from localStorage
     */
    loadCacheFromLocalStorage() {
        try {
            if (!this.useLocalStorage || !window.localStorage) {
                return;
            }
            
            // Look for keys that start with job_
            Object.keys(localStorage).forEach(key => {
                if (key.startsWith('job_')) {
                    try {
                        const data = JSON.parse(localStorage.getItem(key));
                        if (data) {
                            this.responseCache[key] = data;
                            this.logger?.debug('Loaded from localStorage:', key);
                        }
                    } catch (e) {
                        this.logger?.error(`Error parsing localStorage item ${key}:`, e);
                    }
                }
            });
            
            this.logger?.debug('Loaded cache from localStorage with', Object.keys(this.responseCache).length, 'items');
        } catch (err) {
            this.logger?.error('Error loading from localStorage:', err);
        }
    }
}

export default JobProcessor; 