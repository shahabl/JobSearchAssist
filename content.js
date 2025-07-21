/**
 * content.js (Bridge)
 * This is a compatibility bridge that helps handle messages when module isn't loaded
 * It should not use import/export syntax
 */

console.log('[JobAssistant] Compatibility bridge script loaded');

// Listen for messages - this will run first, before the module version
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === 'startProcessing') {
        // Check if the module version has loaded properly
        if (window.jobAssistant) {
            console.log('[JobAssistant] Delegating to module version');
            // Let the module version handle it - don't respond
            return false;
        }
        
        // If we get here, it means the module didn't load properly
        console.error('[JobAssistant] Module version not loaded - please check extension setup');
        
        // Respond immediately instead of using setTimeout which can cause message channel closing
        try {
            sendResponse({
                success: false,
                error: 'Extension module not loaded correctly. Please try refreshing the page.'
            });
        } catch (err) {
            console.error('[JobAssistant] Error sending response:', err);
        }
        
        // Show a visual notification
        try {
            const notice = document.createElement('div');
            notice.id = 'job-assistant-bridge-notice';
            notice.style.position = 'fixed';
            notice.style.top = '10px';
            notice.style.left = '10px';
            notice.style.backgroundColor = '#ffebee';
            notice.style.border = '1px solid #f44336';
            notice.style.padding = '15px';
            notice.style.zIndex = '10000';
            notice.style.borderRadius = '5px';
            notice.style.fontFamily = 'Arial, sans-serif';
            notice.style.fontSize = '14px';
            notice.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
            notice.style.maxWidth = '400px';
            
            notice.innerHTML = `
                <div style="font-weight:bold;margin-bottom:8px;">Job Listing Assistant - Module Error</div>
                <div>The extension's module version didn't load correctly. Try these steps:</div>
                <ol style="margin-top:8px;margin-bottom:12px;padding-left:24px;">
                    <li>Refresh this page</li>
                    <li>Go to chrome://extensions/</li>
                    <li>Find Job Listing Assistant</li>
                    <li>Toggle it off and back on</li>
                    <li>Reload this page in a new tab</li>
                </ol>
                <div style="margin-top:8px;font-style:italic;font-size:12px;">
                    Error details: Module script failed to load
                </div>
                <div style="text-align:right;margin-top:12px;">
                    <button id="job-assistant-close-notice" style="padding:6px 12px;background:#f8f8f8;border:1px solid #ddd;border-radius:4px;cursor:pointer;">Close</button>
                </div>
            `;
            
            // Add to document when ready
            const addNotice = () => {
                if (document.body && !document.getElementById('job-assistant-bridge-notice')) {
                    document.body.appendChild(notice);
                    document.getElementById('job-assistant-close-notice')?.addEventListener('click', function() {
                        notice.remove();
                    });
                }
            };
            
            if (document.body) {
                addNotice();
            } else {
                window.addEventListener('DOMContentLoaded', addNotice);
            }
        } catch (error) {
            console.error('[JobAssistant] Error showing notification:', error);
        }
        
        // We've already responded, so return false to close the message channel
        return false;
    }
    
    return false; // Let module version handle other messages
});

// Log that we're loaded and looking for module
console.log('[JobAssistant] Bridge loaded successfully, waiting for module version...'); 