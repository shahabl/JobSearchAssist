// Constants for API configuration
const API_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-4o';

import { getMockResponse } from './mockResponses.js';

console.log('[JobListingAssistant] Background script initialized');

// Cache for API key and criteria
let apiKey = null;
let jobCriteria = null;

// Default criteria if none set
function getDefaultCriteria() {
    return `Please consider:
1. Required experience level
2. Skills required
3. Job responsibilities
4. Company reputation
5. Overall job quality`;
}

// Load saved settings
chrome.storage.local.get(['apiKey', 'jobCriteria'], (result) => {
    console.log('[JobListingAssistant] Settings loaded:', {
        hasApiKey: !!result.apiKey,
        apiKey: result.apiKey ? result.apiKey.slice(0, 5) + '...' : 'not set',
        hasJobCriteria: !!result.jobCriteria
    });
    
    apiKey = result.apiKey;
    
    // Use jobCriteria or default if not found
    if (result.jobCriteria) {
        jobCriteria = result.jobCriteria;
    } else {
        jobCriteria = getDefaultCriteria();
    }
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('[JobListingAssistant] Received message:', {
        action: request.action,
        hasContent: !!request.content,
        hasRequestId: !!request.requestId,
        hasResume: !!request.resume
    });
    
    // Special handling for messages with requestId (from the new message system)
    const hasRequestId = !!request.requestId;
    
    if (request.action === 'analyzeListing') {
        // Handle job listing analysis request
        console.log('[JobListingAssistant] Analyzing listing with request ID:', request.requestId);
        
        // Quick validation of request data
        if (!request.content || !request.content.jobId) {
            if (hasRequestId) {
                chrome.tabs.sendMessage(sender.tab.id, {
                    responseToId: request.requestId,
                    data: { success: false, error: 'Invalid job content' }
                });
                return false;
            } else {
                sendResponse({ success: false, error: 'Invalid job content' });
                return true;
            }
        }

        processJobListing(request, sender, sendResponse, hasRequestId);
        
        // Return true to indicate we'll respond asynchronously
        return true;
    } else if (request.action === 'saveCriteria') {
        // Save manually edited criteria from the feedback window
        console.log('[JobListingAssistant] Saving manually edited criteria');
        
        if (!request.criteria) {
            if (hasRequestId) {
                chrome.tabs.sendMessage(sender.tab.id, {
                    responseToId: request.requestId,
                    data: { success: false, error: 'No criteria provided' }
                });
                return false;
            } else {
                sendResponse({ success: false, error: 'No criteria provided' });
                return true;
            }
        }
        
        try {
            // Save the edited criteria to local storage
            chrome.storage.local.set({ jobCriteria: request.criteria }, () => {
                if (chrome.runtime.lastError) {
                    console.error('[JobListingAssistant] Error saving criteria:', chrome.runtime.lastError);
                    
                    if (hasRequestId) {
                        chrome.tabs.sendMessage(sender.tab.id, {
                            responseToId: request.requestId,
                            data: { success: false, error: chrome.runtime.lastError.message }
                        });
                    } else {
                        sendResponse({ success: false, error: chrome.runtime.lastError.message });
                    }
                } else {
                    console.log('[JobListingAssistant] Manually edited criteria saved successfully');
                    // Update our local cache
                    jobCriteria = request.criteria;
                    
                    if (hasRequestId) {
                        chrome.tabs.sendMessage(sender.tab.id, {
                            responseToId: request.requestId,
                            data: { success: true }
                        });
                    } else {
                        sendResponse({ success: true });
                    }
                }
            });
        } catch (error) {
            console.error('[JobListingAssistant] Error saving criteria:', error);
            
            if (hasRequestId) {
                chrome.tabs.sendMessage(sender.tab.id, {
                    responseToId: request.requestId,
                    data: { success: false, error: error.message }
                });
                return false;
            } else {
                sendResponse({ success: false, error: error.message });
                return true;
            }
        }
        
        // Keep the message channel open for both methods as we're using async callback
        return true;
    } else if (request.action === 'openOptions') {
        // Open the options page
        console.log('[JobListingAssistant] Opening options page');
        chrome.runtime.openOptionsPage();
        
        if (hasRequestId) {
            chrome.tabs.sendMessage(sender.tab.id, {
                responseToId: request.requestId,
                data: { success: true }
            });
            return false;
        } else {
            sendResponse({ success: true });
            return true;
        }
    }

    // Return false for unknown message types to avoid keeping channel open unnecessarily
    return false;
});

// Add the missing processJobListing function
/**
 * Process a job listing analysis request and send the response
 */
async function processJobListing(request, sender, sendResponse, hasRequestId) {
    try {
        console.log('[JobListingAssistant] Processing job listing:', {
            title: request.content.title,
            company: request.content.company,
            jobId: request.content.jobId,
            hasResume: !!request.resume
        });
        
        // Call the API to analyze the job listing
        const result = await analyzeWithAPI(request.content, request.resume);
        
        // Send the response based on the messaging system being used
        if (hasRequestId) {
            // New message system - send direct response with requestId
            console.log('[JobListingAssistant] Sending analysis response for request:', request.requestId);
            
            chrome.tabs.sendMessage(sender.tab.id, {
                responseToId: request.requestId,
                data: {
                    success: true,
                    isGoodFit: result.isGoodFit,
                    analysis: result.analysis,
                    title: request.content.title || result.title || '',
                    company: request.content.company || result.company || '',
                    location: request.content.location || result.location || '',
                    description: request.content.description || result.description || '',
                    descriptionHtml: request.content.descriptionHtml || result.descriptionHtml || '',
                    date: new Date().toISOString()
                }
            });
        } else {
            // Legacy system - use sendResponse
            sendResponse({
                success: true,
                ...result
            });
        }
    } catch (error) {
        console.error('[JobListingAssistant] Analysis error:', error);
        
        // Send error response
        if (hasRequestId) {
            // New message system
            console.log('[JobListingAssistant] Sending error response for request:', request.requestId);
            
            chrome.tabs.sendMessage(sender.tab.id, {
                responseToId: request.requestId,
                data: {
                    success: false,
                    isGoodFit: false,
                    analysis: `Error: ${error.message || 'Unknown error during analysis'}`,
                    title: request.content.title || '',
                    company: request.content.company || '',
                    location: request.content.location || '',
                    description: request.content.description || '',
                    descriptionHtml: request.content.descriptionHtml || '',
                    date: new Date().toISOString()
                }
            });
        } else {
            // Legacy system
            sendResponse({
                success: false,
                isGoodFit: false,
                analysis: `Error: ${error.message || 'Unknown error during analysis'}`
            });
        }
    }
}

// Function to analyze job with OpenAI API
async function analyzeWithAPI(content, resume = null) {
    // Get the latest API key and criteria from storage
    const result = await chrome.storage.local.get(['apiKey', 'jobCriteria']);
    apiKey = result.apiKey; // Update the local variable
    
    // Use the latest criteria from storage if available
    if (result.jobCriteria) {
        jobCriteria = result.jobCriteria;
    }
    
    console.log('[JobListingAssistant] Analyzing job with API settings:', {
        hasApiKey: !!apiKey,
        hasCriteria: !!jobCriteria,
        hasResume: !!resume
    });
    
    if (!apiKey || apiKey === '0') {
        throw new Error('API key not configured');
    }
    const systemPrompt = `You are a job matching assistant. Your task is to analyze the provided job listing and determine if it is a good match based solely on the candidate's experience requirement, technical skills, and project focus. Evaluate the job listing by comparing it against the provided candidate's resume and specified job criteria. Start your response with a clear YES or NO, followed by a detailed explanation.
Read the job criteria and resume sections provided  under jobCriteria and resumeSection.
Review the job listing details, including Title, Company, Location, and Description.
Analyze the job listing focusing exclusively on:
Experience requirement
Technical skills
Project focus
Do not include job location or salary details in your reasoning.
Format your output in HTML with the following structure:
An <h2>Analysis</h2> heading at the beginning.
A <strong> tag containing the YES/NO answer at the start.
An unordered list (<ul>) listing the reasons.
Output Format: Your final response must be in HTML format exactly as specified.`;

    const prompt = createAnalysisPrompt(content, resume);
    
    try {
        
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: MODEL,
                messages: [
                    {
                        role: 'system',
                        content: systemPrompt
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.3
            })
        });

        if (!response.ok) {
            throw new Error(`API request failed: ${response.statusText}`);
        }

        const data = await response.json();
        const analysis = data.choices[0].message.content;
        
        return {
            isGoodFit: determineGoodFit(analysis),
            analysis: analysis,
            title: content.title,
            company: content.company,
            location: content.location,
            description: content.description || '',
            descriptionHtml: content.descriptionHtml || '',
            date: new Date().toISOString()
        };
    } catch (error) {
        console.error('Error calling OpenAI API:', error);
        throw error;
    }
}

function createAnalysisPrompt(content, resume = null) {
    // Add resume section if available
    const resumeSection = resume 
        ? `\nCandidate Resume/Background:\n${resume}\n\n` 
        : '';

    return `Please analyze the following job listing based on the given criteria ${resume ? `and the candidate's resume` : ''}to determine if it is a good match for the candidate's experience and interests. Follow these instructions:

Instructions:

1. Respond with a clear YES or NO at the start.
2. If the answer is NO: List the reasons why it is not a good match.
3. If the answer is YES: List only the key reasons that support a match based solely on the experience requirement, technical skills, and project focus.
4. Do not include any details regarding the job's location or salary in your reasons, even if the listing meets these criteria.
5. Format your response in HTML, starting with an <h2>Analysis</h2> heading, followed by a <strong> tag for the YES/NO answer, and then an unordered list of reasons.

Criteria:

${jobCriteria}
${resumeSection}

Job Listing:

Title: ${content.title}
Company: ${content.company}
Location: ${content.location}
Description: ${content.description}`;
}

function determineGoodFit(analysis) {
    // Check for YES in the HTML-formatted response
    // The response format is <h2>Analysis</h2><strong>YES</strong>
    const analysisText = analysis.trim();
    
    // Use a simple regex to extract the content of the <strong> tag
    const strongMatch = analysisText.match(/<strong>(.*?)<\/strong>/i);
    if (strongMatch && strongMatch[1]) {
        return strongMatch[1].trim().toUpperCase() === 'YES';
    }
    
    // Fallback to the old method in case the format is different
    return analysisText.toUpperCase().startsWith('YES');
}
