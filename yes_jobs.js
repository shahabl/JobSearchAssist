document.addEventListener('DOMContentLoaded', async () => {
    const jobList = document.getElementById('jobList');
    const frameContainer = document.getElementById('frameContainer');
    
    // Add debug button
    const debugButton = document.createElement('button');
    debugButton.textContent = 'Debug Storage';
    debugButton.style.position = 'fixed';
    debugButton.style.bottom = '10px';
    debugButton.style.right = '10px';
    debugButton.style.zIndex = '9999';
    debugButton.style.padding = '8px 16px';
    debugButton.style.backgroundColor = '#f0f0f0';
    debugButton.style.border = '1px solid #ccc';
    debugButton.style.borderRadius = '4px';
    debugButton.style.cursor = 'pointer';
    
    debugButton.addEventListener('click', async () => {
        await debugStorage();
    });
    
    document.body.appendChild(debugButton);
    
    // Debug function to check storage
    async function debugStorage() {
        console.log('===== STORAGE DEBUG =====');
        
        // Check chrome.storage.local
        const chromeStorage = await new Promise(resolve => 
            chrome.storage.local.get(null, resolve)
        );
        console.log('Chrome Storage:', chromeStorage);
        
        if (chromeStorage.matchingJobs) {
            console.log('matchingJobs type:', typeof chromeStorage.matchingJobs);
            if (typeof chromeStorage.matchingJobs === 'string') {
                try {
                    const parsed = JSON.parse(chromeStorage.matchingJobs);
                    console.log('Parsed matchingJobs:', parsed);
                    console.log('matchingJobs length:', parsed.length);
                } catch (e) {
                    console.error('Error parsing matchingJobs:', e);
                }
            } else if (Array.isArray(chromeStorage.matchingJobs)) {
                console.log('matchingJobs length:', chromeStorage.matchingJobs.length);
            }
        }
        
        // Check localStorage
        console.log('===== LOCAL STORAGE =====');
        const jobKeys = Object.keys(localStorage).filter(key => key.startsWith('job_'));
        console.log('Job keys in localStorage:', jobKeys);
        
        // Display a message with the results
        const debugInfo = document.createElement('div');
        debugInfo.style.position = 'fixed';
        debugInfo.style.top = '50%';
        debugInfo.style.left = '50%';
        debugInfo.style.transform = 'translate(-50%, -50%)';
        debugInfo.style.backgroundColor = 'white';
        debugInfo.style.padding = '20px';
        debugInfo.style.border = '1px solid #ccc';
        debugInfo.style.borderRadius = '8px';
        debugInfo.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
        debugInfo.style.zIndex = '10000';
        debugInfo.style.maxWidth = '80%';
        debugInfo.style.maxHeight = '80%';
        debugInfo.style.overflow = 'auto';
        
        let infoHTML = '<h2>Storage Debug Info</h2>';
        
        // Chrome Storage
        infoHTML += '<h3>Chrome Storage</h3>';
        if (chromeStorage.matchingJobs) {
            const matchingJobsType = typeof chromeStorage.matchingJobs;
            infoHTML += `<p>matchingJobs type: ${matchingJobsType}</p>`;
            
            if (matchingJobsType === 'string') {
                try {
                    const parsed = JSON.parse(chromeStorage.matchingJobs);
                    infoHTML += `<p>matchingJobs length: ${parsed.length}</p>`;
                    infoHTML += `<p>First few items: ${JSON.stringify(parsed.slice(0, 2), null, 2)}</p>`;
                } catch (e) {
                    infoHTML += `<p>Error parsing matchingJobs: ${e.message}</p>`;
                }
            } else if (Array.isArray(chromeStorage.matchingJobs)) {
                infoHTML += `<p>matchingJobs length: ${chromeStorage.matchingJobs.length}</p>`;
            }
        } else {
            infoHTML += '<p>No matchingJobs found in chrome.storage.local</p>';
        }
        
        // localStorage
        infoHTML += '<h3>Local Storage</h3>';
        if (jobKeys.length > 0) {
            infoHTML += `<p>Found ${jobKeys.length} job keys in localStorage</p>`;
            infoHTML += '<ul>';
            jobKeys.slice(0, 5).forEach(key => {
                infoHTML += `<li>${key}</li>`;
            });
            if (jobKeys.length > 5) {
                infoHTML += `<li>... and ${jobKeys.length - 5} more</li>`;
            }
            infoHTML += '</ul>';
        } else {
            infoHTML += '<p>No job keys found in localStorage</p>';
        }
        
        // Close button
        infoHTML += '<button id="closeDebugInfo" style="margin-top: 15px; padding: 8px 16px;">Close</button>';
        
        debugInfo.innerHTML = infoHTML;
        document.body.appendChild(debugInfo);
        
        document.getElementById('closeDebugInfo').addEventListener('click', () => {
            document.body.removeChild(debugInfo);
        });
    }
    
    // Load matching jobs from storage
    try {
        const result = await new Promise(resolve => 
            chrome.storage.local.get(['matchingJobs'], resolve)
        );
        
        let matchingJobs = [];
        
        // Parse the JSON string if it exists
        if (result.matchingJobs) {
            try {
                // Check if it's already an array or needs to be parsed
                if (typeof result.matchingJobs === 'string') {
                    matchingJobs = JSON.parse(result.matchingJobs);
                } else if (Array.isArray(result.matchingJobs)) {
                    matchingJobs = result.matchingJobs;
                } else {
                    console.warn('matchingJobs is not in expected format:', result.matchingJobs);
                    matchingJobs = [];
                }
            } catch (parseError) {
                console.error('Error parsing matchingJobs JSON:', parseError);
                matchingJobs = [];
            }
        }
        
        console.log('Loaded matching jobs:', matchingJobs);
        
        // Deduplicate jobs based on ID
        if (matchingJobs.length > 0) {
            // Create a Map to deduplicate by job ID (keeping only the most recent version of each job)
            const uniqueJobsMap = new Map();
            matchingJobs.forEach(job => {
                if (job && job.id) {
                    // If we already have this job, only replace it if the new one is newer
                    const existingJob = uniqueJobsMap.get(job.id);
                    if (!existingJob || (job.timestamp && existingJob.timestamp && 
                        new Date(job.timestamp) > new Date(existingJob.timestamp))) {
                        uniqueJobsMap.set(job.id, job);
                    }
                }
            });
            
            // Convert back to array
            const dedupedJobs = Array.from(uniqueJobsMap.values());
            
            // If we removed duplicates, save the deduped list back to storage
            if (dedupedJobs.length < matchingJobs.length) {
                console.log(`Removed ${matchingJobs.length - dedupedJobs.length} duplicate jobs`);
                chrome.storage.local.set({ matchingJobs: JSON.stringify(dedupedJobs) });
                matchingJobs = dedupedJobs;
            }
        }
        
        if (matchingJobs.length === 0) {
            // Show message when no jobs are found
            showNoJobsMessage();
        } else {
            // Populate the job list
            populateJobList(matchingJobs);
        }
    } catch (error) {
        console.error('Error loading matching jobs:', error);
        showErrorMessage('Failed to load matching jobs. Please try again.');
    }
    
    /**
     * Populates the job list with the matching jobs
     * @param {Array} jobs - Array of job objects
     */
    function populateJobList(jobs) {
        // Clear any existing content
        jobList.innerHTML = '';
        
        // Add each job to the list
        jobs.forEach(job => {
            const listItem = document.createElement('li');
            listItem.className = 'job-item';
            listItem.dataset.jobId = job.id;
            listItem.dataset.jobUrl = `https://www.linkedin.com/jobs/view/${job.id}/`;
            
            const title = document.createElement('div');
            title.className = 'job-title';
            title.textContent = job.title;
            
            const company = document.createElement('div');
            company.className = 'job-company';
            company.textContent = job.company;
            
            listItem.appendChild(title);
            listItem.appendChild(company);
            
            // Add click event to show job preview and open in new tab option
            listItem.addEventListener('click', function() {
                // Remove active class from all items
                document.querySelectorAll('.job-item').forEach(item => {
                    item.classList.remove('active');
                });
                
                // Add active class to clicked item
                this.classList.add('active');
                
                // Show job preview
                showJobPreview(job);
            });
            
            jobList.appendChild(listItem);
        });
    }
    
    /**
     * Shows a preview of the job with a button to open in a new tab
     * @param {Object} job - The job object to display
     */
    function showJobPreview(job) {
        // Clear the frame container
        frameContainer.innerHTML = '';
        
        // Create a preview panel
        const previewPanel = document.createElement('div');
        previewPanel.className = 'job-preview';
        
        // Prepare job description content (with fallbacks)
        let descriptionContent = '';
        if (job.descriptionHtml && job.descriptionHtml.trim()) {
            // Use HTML description if available
            descriptionContent = `
                <div class="description-content formatted-html">
                    ${job.descriptionHtml}
                </div>
            `;
        } else if (job.description && job.description.trim()) {
            // Fall back to plain text description with paragraphs
            const paragraphs = job.description.split('\n\n')
                .filter(p => p.trim())
                .map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`)
                .join('');
                
            descriptionContent = `
                <div class="description-content">
                    ${paragraphs}
                </div>
            `;
        } else {
            // No description available
            descriptionContent = `
                <div class="description-content">
                    <p class="no-description">No detailed job description available.</p>
                </div>
            `;
        }
        
        // Populate the preview with job details
        previewPanel.innerHTML = `
            <div class="preview-header">
                <h2>${job.title}</h2>
                <h3>${job.company}</h3>
                ${job.location ? `<div class="preview-location">${job.location}</div>` : ''}
            </div>
            <div class="preview-content">
                <div class="preview-section">
                    <h4>Analysis</h4>
                    ${job.analysis ? 
                        `<div class="formatted-html">${job.analysis}</div>` : 
                        '<p>Good match for your criteria</p>'}
                </div>
                <div class="preview-section">
                    <h4>Date Added</h4>
                    <p>${formatDate(job.timestamp)}</p>
                </div>
                <div class="preview-section job-description-section">
                    <h4>Job Description</h4>
                    ${descriptionContent}
                </div>
            </div>
            <div class="preview-actions">
                <a href="https://www.linkedin.com/jobs/view/${job.id}/" target="_blank" class="view-job-btn">
                    Open Job on LinkedIn
                </a>
                <button class="remove-job-btn" data-job-id="${job.id}">
                    Remove from List
                </button>
            </div>
        `;
        
        // Add the preview panel to the container
        frameContainer.appendChild(previewPanel);
        
        // Add event listener for the remove button
        const removeButton = previewPanel.querySelector('.remove-job-btn');
        if (removeButton) {
            removeButton.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                removeJob(job.id);
            });
        }
    }
    
    /**
     * Format a date string to a more readable format
     * @param {string} dateString - ISO date string
     * @returns {string} - Formatted date
     */
    function formatDate(dateString) {
        if (!dateString) return 'Unknown date';
        
        try {
            const date = new Date(dateString);
            return new Intl.DateTimeFormat('en-US', { 
                year: 'numeric', 
                month: 'short', 
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            }).format(date);
        } catch (e) {
            return 'Unknown date';
        }
    }
    
    /**
     * Removes a job from the saved list
     * @param {string} jobId - The ID of the job to remove
     */
    async function removeJob(jobId) {
        try {
            // Get current jobs
            const result = await new Promise(resolve => 
                chrome.storage.local.get(['matchingJobs'], resolve)
            );
            
            let matchingJobs = [];
            
            // Parse the JSON string if it exists
            if (result.matchingJobs) {
                try {
                    // Check if it's already an array or needs to be parsed
                    if (typeof result.matchingJobs === 'string') {
                        matchingJobs = JSON.parse(result.matchingJobs);
                    } else if (Array.isArray(result.matchingJobs)) {
                        matchingJobs = result.matchingJobs;
                    } else {
                        console.warn('matchingJobs is not in expected format:', result.matchingJobs);
                        matchingJobs = [];
                    }
                } catch (parseError) {
                    console.error('Error parsing matchingJobs JSON:', parseError);
                    matchingJobs = [];
                }
            }
            
            // Filter out the job to remove
            matchingJobs = matchingJobs.filter(job => job.id !== jobId);
            
            // Save back to storage
            await new Promise(resolve => 
                chrome.storage.local.set({ matchingJobs: JSON.stringify(matchingJobs) }, resolve)
            );
            
            console.log(`Removed job ${jobId} from matching jobs`);
            
            // Refresh the job list
            if (matchingJobs.length === 0) {
                showNoJobsMessage();
            } else {
                populateJobList(matchingJobs);
                
                // Clear the preview panel
                frameContainer.innerHTML = '';
                frameContainer.innerHTML = `
                    <div class="empty-state">
                        <h2>Select a job listing</h2>
                        <p>Click on a job from the list on the left to view it here.</p>
                    </div>
                `;
            }
        } catch (error) {
            console.error('Error removing job:', error);
            showErrorMessage('Failed to remove job. Please try again.');
        }
    }
    
    /**
     * Shows a message when no matching jobs are found
     */
    function showNoJobsMessage() {
        jobList.innerHTML = '';
        frameContainer.innerHTML = '';
        
        const noJobs = document.createElement('div');
        noJobs.className = 'no-jobs';
        noJobs.innerHTML = `
            <h2>No Matching Jobs Found</h2>
            <p>You haven't saved any matching jobs yet.</p>
            <p>Browse LinkedIn job listings and jobs marked with "✓" will be saved here.</p>
        `;
        
        frameContainer.appendChild(noJobs);
    }
    
    /**
     * Shows an error message
     * @param {string} message - Error message to display
     */
    function showErrorMessage(message) {
        jobList.innerHTML = '';
        frameContainer.innerHTML = '';
        
        const errorDiv = document.createElement('div');
        errorDiv.className = 'no-jobs';
        errorDiv.innerHTML = `
            <h2>Error</h2>
            <p>${message}</p>
        `;
        
        frameContainer.appendChild(errorDiv);
    }
}); 