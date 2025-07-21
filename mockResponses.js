// Mock responses for testing
const mockResponses = [
    {
        isGoodFit: true,
        analysis: "YES - This role appears to be a great fit! Key positives:\n" +
                 "• Senior-level position with competitive compensation\n" +
                 "• Strong focus on technical leadership\n" +
                 "• Modern tech stack and innovative projects\n" +
                 "• Excellent company culture and benefits"
    },
    {
        isGoodFit: false,
        analysis: "NO - This position may not be the best match:\n" +
                 "• Required skills don't align with typical profile\n" +
                 "• Location/commute requirements may be challenging\n" +
                 "• Company size/stage might not be ideal\n" +
                 "• Compensation range below market expectations"
    },
    {
        isGoodFit: true,
        analysis: "YES - Excellent opportunity with great potential:\n" +
                 "• Perfect experience level match\n" +
                 "• Exciting technical challenges\n" +
                 "• Remote work options available\n" +
                 "• Growing company with advancement opportunities"
    },
    {
        isGoodFit: false,
        analysis: "NO - Several potential concerns:\n" +
                 "• Too many required technologies outside core expertise\n" +
                 "• Heavy travel requirements\n" +
                 "• On-call rotation mentioned\n" +
                 "• Project seems understaffed for scope"
    }
];

let mockResponseIndex = 0;

// Function to get next mock response
function getMockResponse() {
    const response = mockResponses[mockResponseIndex];
    mockResponseIndex = (mockResponseIndex + 1) % mockResponses.length;
    console.log('[JobListingAssistant] Generated mock response:', { 
        index: mockResponseIndex, 
        isGoodFit: response.isGoodFit 
    });
    return response;
}

export { getMockResponse }; 