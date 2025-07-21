document.addEventListener('DOMContentLoaded', () => {
    const startButton = document.getElementById('startProcessing');
    const viewMatchingJobsButton = document.getElementById('viewMatchingJobs');
    const viewRejectedJobsButton = document.getElementById('viewRejectedJobs');
    const status = document.getElementById('status');
    const optionsLink = document.getElementById('openOptions');
    const maxJobsInput = document.getElementById('maxJobsInput');

    // Load saved max jobs value
    chrome.storage.local.get(['maxJobsToProcess'], (result) => {
        if (result.maxJobsToProcess) {
            maxJobsInput.value = result.maxJobsToProcess;
        }
    });

    // Check if API key is configured
    chrome.storage.local.get(['apiKey'], (result) => {
        if (!result.apiKey) {
            startButton.disabled = true;
            status.textContent = 'Please configure your API key first';
            status.className = 'error';
            status.style.display = 'block';
        }
    });

    // Save max jobs value when changed
    maxJobsInput.addEventListener('change', () => {
        const maxJobs = parseInt(maxJobsInput.value);
        if (maxJobs && maxJobs > 0) {
            chrome.storage.local.set({ maxJobsToProcess: maxJobs });
            console.log('Saved max jobs:', maxJobs);
        }
    });

    // Handle start processing button click
    startButton.addEventListener('click', async () => {
        startButton.disabled = true;
        status.style.display = 'none';

        try {
            // Save the current max jobs value
            const maxJobs = parseInt(maxJobsInput.value) || 100;
            chrome.storage.local.set({ maxJobsToProcess: maxJobs });
            
            // Check if we're on a LinkedIn jobs page
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!tab.url.includes('linkedin.com/jobs')) {
                throw new Error('Please navigate to a LinkedIn jobs search page first');
            }

            // Send message directly to the content script
            // The content script is already loaded via manifest.json, so we don't need to inject it
            try {
                const response = await chrome.tabs.sendMessage(tab.id, { action: 'startProcessing' });
                
                if (response && response.success === true) {
                    startButton.textContent = 'Processing Complete';
                } else {
                    throw new Error(response?.error || 'Failed to start processing');
                }
            } catch (error) {
                console.error('Error communicating with content script:', error);
                
                // The error might be because the content script hasn't fully loaded yet
                status.textContent = 'Please refresh the LinkedIn page and try again.';
                status.className = 'error';
                status.style.display = 'block';
                startButton.disabled = false;
                startButton.textContent = 'Start Processing';
            }
        } catch (error) {
            console.error('Error:', error);
            status.textContent = error.message || 'Could not connect to page. Please refresh and try again.';
            status.className = 'error';
            status.style.display = 'block';
            startButton.disabled = false;
            startButton.textContent = 'Start Processing';
        }
    });

    // Handle view matching jobs button click
    viewMatchingJobsButton.addEventListener('click', () => {
        // Open the matching jobs page in a new tab
        chrome.tabs.create({ url: 'yes_jobs.html' });
    });

    // Handle view rejected jobs button click
    viewRejectedJobsButton.addEventListener('click', () => {
        // Open the rejected jobs page in a new tab
        chrome.tabs.create({ url: 'no_jobs.html' });
    });

    // Handle options link click
    optionsLink.addEventListener('click', (e) => {
        e.preventDefault();
        chrome.runtime.openOptionsPage();
    });
}); 