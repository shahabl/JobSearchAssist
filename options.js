// Default criteria text
const defaultCriteria = `Please consider:
1. Required experience level
2. Skills required
3. Job responsibilities
4. Company reputation
5. Overall job quality`;

// DOM Elements
const apiKeyInput = document.getElementById('apiKey');
const criteriaTextarea = document.getElementById('analysisCriteria');
const resumeTextarea = document.getElementById('userResume');
const saveButton = document.getElementById('save');
const statusDiv = document.getElementById('status');

// Load saved settings
function loadSettings() {
    chrome.storage.local.get(['apiKey', 'jobCriteria', 'userResume'], (result) => {
        if (result.apiKey) {
            apiKeyInput.value = result.apiKey;
        }
        
        // Use jobCriteria or default
        criteriaTextarea.value = result.jobCriteria || defaultCriteria;
        
        // Load resume if it exists
        if (result.userResume) {
            resumeTextarea.value = result.userResume;
        }
    });
}

// Save settings
function saveSettings() {
    const apiKey = apiKeyInput.value.trim();
    const criteria = criteriaTextarea.value.trim();
    const resume = resumeTextarea.value.trim();

    if (!criteria) {
        showStatus('Please enter job matching criteria', false);
        return;
    }

    chrome.storage.local.set({
        apiKey: apiKey,
        jobCriteria: criteria,
        userResume: resume
    }, () => {
        if (chrome.runtime.lastError) {
            showStatus('Error saving settings: ' + chrome.runtime.lastError.message, false);
        } else {
            showStatus('Settings saved successfully!', true);
        }
    });
}

// Show status message
function showStatus(message, success) {
    statusDiv.textContent = message;
    statusDiv.className = 'status ' + (success ? 'success' : 'error');
    statusDiv.style.display = 'block';
    setTimeout(() => {
        statusDiv.style.display = 'none';
    }, 3000);
}

// Event Listeners
document.addEventListener('DOMContentLoaded', loadSettings);
saveButton.addEventListener('click', saveSettings); 