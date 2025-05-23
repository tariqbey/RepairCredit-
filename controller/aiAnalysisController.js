const Client = require('../models/client');
const CreditItems = require('../models/creditItems');
const Person = require('../models/person');
const CreditBureau = require('../models/creditBureau'); // Added for dispute letter
const CreditScore = require('../models/creditScrore'); // Added for action plan
// const config = require('config'); // For API key, not needed for mock

// @desc   Analyze client credit items
// @route  POST /api/ai/analyze-items/:clientId
// @access Private (assumption, should be clarified)
async function analyzeClientCreditItems(clientId) {
    try {
        // Step 1 & 2: Fetch Client, Person, and CreditItems
        const client = await Client.findById(clientId);
        if (!client) {
            return { success: false, message: 'Client not found', status: 404 };
        }

        const person = await Person.findById(client.person);
        if (!person) {
            // This case might indicate data inconsistency if a client exists without a person
            return { success: false, message: 'Person associated with client not found', status: 404 };
        }

        const creditItems = await CreditItems.find({ person: person._id });
        if (!creditItems || creditItems.length === 0) {
            return { success: false, message: 'No credit items found for this client', status: 404 };
        }

        // Step 3: Transform credit items into anonymized format
        const anonymizedItems = creditItems.map(item => ({
            creditorName: item.creditorName,
            accountName: item.accountName,
            accountType: item.accountType,
            accountTypeDetail: item.accountTypeDetail,
            accountStatus: item.accountStatus,
            monthlyPayment: item.monthlyPayment,
            dateOpened: item.dateOpened,
            balance: item.balance,
            terms: item.terms,
            highCredit: item.highCredit,
            creditLimit: item.creditLimit,
            pastDueAmount: item.pastDueAmount,
            paymentStatus: item.paymentStatus,
            lastReportedDate: item.lastReportedDate,
            comments: item.comments,
            dateLastActive: item.dateLastActive,
            dateOfLastPayment: item.dateOfLastPayment,
            // Account number (item.account) is intentionally excluded
        }));

        // Step 4: Construct a detailed prompt for the Gemini API
        const prompt = `
Analyze the following credit report items for client ${person.firstName} ${person.lastName} (Client ID: ${clientId}).
For each item, please:
1. Identify any derogatory information.
2. Specify the type of derogatory mark (e.g., late payment, collection, charge-off).
3. Note any inconsistencies within the item's data or compared to common reporting standards.
4. Highlight items that are strong candidates for dispute with a brief reasoning.
5. Provide the analysis in a structured JSON format as an array of objects. Each object should contain the original item data (as provided) and an 'analysis' object with your insights.

Credit Items:
${JSON.stringify(anonymizedItems, null, 2)}

Expected JSON Output Structure:
[
  {
    "originalItem": { /* anonymized item data */ },
    "analysis": {
      "isDerogatory": true/false,
      "derogatoryType": "e.g., Late Payment, Collection, Public Record, None",
      "inconsistencies": "Description of any inconsistencies or 'None noted'",
      "disputeCandidate": true/false,
      "disputeReasoning": "Brief reasoning if it's a dispute candidate"
    }
  },
  // ... more analyzed items
]
`;
        // console.log("Generated Prompt:", prompt); // For debugging, would remove in production

        // Step 5: Mock the AI API Call
        const mockedApiResponse = anonymizedItems.map((item, index) => {
            // Simple mock logic: mark items with past due amounts or specific comments as derogatory
            let isDerogatory = false;
            let derogatoryType = "None";
            let disputeCandidate = false;
            let disputeReasoning = "N/A";

            if (item.pastDueAmount && item.pastDueAmount > 0) {
                isDerogatory = true;
                derogatoryType = "Past Due Amount";
                disputeCandidate = true;
                disputeReasoning = "Item shows a past due amount. Verify accuracy and payment history.";
            } else if (item.accountStatus && item.accountStatus.toLowerCase().includes('collection')) {
                isDerogatory = true;
                derogatoryType = "Collection";
                disputeCandidate = true;
                disputeReasoning = "Account is in collection. Verify debt validation and reporting accuracy.";
            } else if (index % 2 === 0 && item.balance > 500) { // Mocking some other potential issue
                isDerogatory = true;
                derogatoryType = "High Balance Reported";
                disputeCandidate = true;
                disputeReasoning = "High balance reported. Consider verifying if this is accurate or if a payment was recently made.";
            }


            return {
                originalItem: item,
                analysis: {
                    isDerogatory,
                    derogatoryType,
                    inconsistencies: "None noted in mock.", // Simple mock
                    disputeCandidate,
                    disputeReasoning
                }
            };
        });

        // Step 6: Return mocked AI analysis
        return { success: true, data: mockedApiResponse, status: 200 };

    } catch (error) {
        console.error('Error in analyzeClientCreditItems:', error);
        // In a real app, you might want to distinguish between different types of errors
        return { success: false, message: 'Internal server error', status: 500 };
    }
}

module.exports = {
    analyzeClientCreditItems,
    generateDisputeLetterDraft,
    generateClientActionPlanAndCommSnippets, // Added new function
};

// @desc   Generate a dispute letter draft using mocked AI
// @route  POST /api/ai/generate-dispute-letter
// @access Private (assumption)
async function generateDisputeLetterDraft(payload) {
    try {
        const {
            clientId,
            creditItemDocumentId,
            targetAccountName,
            targetCreditorName, // This is the bureau name like 'Experian', 'Equifax', 'TransUnion' from the creditItem.creditBureauData object key
            bureauId, // This is the _id of the CreditBureau model document
            disputeReason
        } = payload;

        // Validate essential payload fields
        if (!clientId || !creditItemDocumentId || !targetAccountName || !targetCreditorName || !bureauId || !disputeReason) {
            return { success: false, message: 'Missing required fields in payload', status: 400 };
        }

        // Step 1: Fetch Client and Person
        const client = await Client.findById(clientId);
        if (!client) {
            return { success: false, message: 'Client not found', status: 404 };
        }

        const person = await Person.findById(client.person).populate('address'); // Populate address
        if (!person) {
            return { success: false, message: 'Person associated with client not found', status: 404 };
        }
        // Mock SSN - assuming last 4 digits are stored or can be derived. For now, a placeholder.
        const ssnLastFour = person.ssn ? `XXX-XX-${person.ssn.slice(-4)}` : "XXX-XX-1234";
        const clientAddress = person.address && person.address.length > 0 ?
            `${person.address[0].street}, ${person.address[0].city}, ${person.address[0].state} ${person.address[0].zipCode}` :
            "Client Address Not Available";


        // Step 2: Fetch CreditBureau details
        const creditBureau = await CreditBureau.findById(bureauId).populate('address');
        if (!creditBureau) {
            return { success: false, message: 'Credit Bureau not found', status: 404 };
        }
        const bureauAddress = creditBureau.address && creditBureau.address.length > 0 ?
            `${creditBureau.address[0].street}, ${creditBureau.address[0].city}, ${creditBureau.address[0].state} ${creditBureau.address[0].zipCode}` :
            "Bureau Address Not Available";

        // Step 3: Fetch CreditItems document
        const creditItemsDoc = await CreditItems.findById(creditItemDocumentId);
        if (!creditItemsDoc) {
            return { success: false, message: 'CreditItems document not found', status: 404 };
        }

        // Step 4: Find the specific disputed item
        let disputedItemDetails = null;
        let bureauDataForTargetCreditor = null;

        // The targetCreditorName (e.g., "experian", "equifax") is a key in creditBureauData
        if (creditItemsDoc.creditBureauData && creditItemsDoc.creditBureauData[targetCreditorName.toLowerCase()]) {
            bureauDataForTargetCreditor = creditItemsDoc.creditBureauData[targetCreditorName.toLowerCase()];
        } else if (creditItemsDoc.creditBureauData && creditItemsDoc.creditBureauData[targetCreditorName.toUpperCase()]) {
            bureauDataForTargetCreditor = creditItemsDoc.creditBureauData[targetCreditorName.toUpperCase()];
        }


        if (bureauDataForTargetCreditor && bureauDataForTargetCreditor.creditData) {
            const foundItem = bureauDataForTargetCreditor.creditData.find(item => item.name === targetAccountName);
            if (foundItem) {
                disputedItemDetails = {
                    accountName: foundItem.name, // This often contains masked account number like "AccountName XXXX1234"
                    creditor: bureauDataForTargetCreditor.creditor, // This is the name of the bureau from the doc like "EXPERIAN"
                    balance: foundItem.rows.find(r => r.name === 'BALANCE')?.value || "N/A",
                    dateOpened: foundItem.rows.find(r => r.name === 'DATE OPENED')?.value || "N/A",
                    accountType: foundItem.rows.find(r => r.name === 'ACCOUNT TYPE')?.value || "N/A",
                    // Add more fields as needed for the letter
                };
            }
        }

        if (!disputedItemDetails) {
            return { success: false, message: `Specific account '${targetAccountName}' under creditor '${targetCreditorName}' not found in credit items.`, status: 404 };
        }
        
        // Mask account number if it's not already (simple masking for the prompt example)
        // The `targetAccountName` might already be like "CITI CARD XXXX1234"
        // If it's just a plain account number, this would be more relevant.
        // For now, we assume targetAccountName is sufficiently descriptive/masked.
        const maskedAccountNumber = disputedItemDetails.accountName;


        // Step 5: Construct the prompt (for future AI integration, not used for mock response generation here directly)
        const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        const prompt = `
Date: ${today}

${person.firstName} ${person.lastName}
${clientAddress}
DOB: ${new Date(person.dob).toLocaleDateString('en-US')}
SSN: ${ssnLastFour}

${creditBureau.name}
${bureauAddress}

Subject: Dispute of Inaccurate Information in My Credit Report - Account: ${maskedAccountNumber}

Dear ${creditBureau.name},

I am writing to dispute the following information in my credit file. I have identified an error on my credit report regarding account ${maskedAccountNumber}, listed under creditor ${disputedItemDetails.creditor_name_from_item || targetCreditorName}. The current information appears to be inaccurate.

The specific item I am disputing is:
Account Name/Number: ${maskedAccountNumber}
Creditor Name: ${disputedItemDetails.creditor_name_from_item || targetCreditorName} 
Details from report (e.g. Balance, Date Opened): Balance: ${disputedItemDetails.balance}, Date Opened: ${disputedItemDetails.dateOpened}

The reason for my dispute is: ${disputeReason}.

I request that you investigate this matter and remove or correct the inaccurate information as required by the Fair Credit Reporting Act (FCRA). Please provide written confirmation of the actions taken once your investigation is complete.

Enclosed are copies of [mention any documents you would typically enclose, e.g., my credit report with the item highlighted, proof of identity, etc. - FOR MOCK, WE DON'T HAVE ACTUAL ENCLOSURES].

Sincerely,

${person.firstName} ${person.lastName}
`;
        // console.log("Generated Prompt for AI:", prompt); // For debugging

        // Step 6: Mocked AI Response
        const mockedLetterText = `
${today}

${person.firstName} ${person.lastName}
${clientAddress}
DOB: ${new Date(person.dob).toLocaleDateString('en-US')}
SSN: ${ssnLastFour}

${creditBureau.name}
${bureauAddress}

Subject: Formal Dispute of Inaccurate Information - Account: ${maskedAccountNumber}

Dear ${creditBureau.name},

This letter is a formal request under the Fair Credit Reporting Act (FCRA) to investigate and correct or remove inaccurate information currently appearing on my credit report regarding account ${maskedAccountNumber}. This item is listed with creditor ${disputedItemDetails.creditor_name_from_item || targetCreditorName}.

The specific details of the account I am disputing are as follows:
Account Name as it appears on report: ${maskedAccountNumber}
Reported Balance: ${disputedItemDetails.balance}
Reported Date Opened: ${disputedItemDetails.dateOpened}

My reason for this dispute is: ${disputeReason}. I believe this information is incorrect [mock can add a generic phrase here].

I kindly request a thorough investigation into this matter. Please send me documentation of your findings and confirmation of any corrections or deletions made to my credit file.

Thank you for your prompt attention to this critical issue.

Sincerely,

${person.firstName} ${person.lastName}
(Mocked AI Generated Letter)
`;

        return { success: true, data: { letterText: mockedLetterText }, status: 200 };

    } catch (error) {
        console.error('Error in generateDisputeLetterDraft:', error);
        // Distinguish between different types of errors if necessary
        if (error.name === 'CastError') {
            return { success: false, message: 'Invalid ID format provided.', status: 400 };
        }
        return { success: false, message: 'Internal server error while generating dispute letter.', status: 500 };
    }
}

// @desc   Generate client action plan and communication snippets using mocked AI
// @route  POST /api/ai/generate-action-plan/:clientId
// @access Private (assumption)
async function generateClientActionPlanAndCommSnippets(clientId) {
    try {
        // Step 1: Fetch Client and Person
        const client = await Client.findById(clientId);
        if (!client) {
            return { success: false, message: 'Client not found', status: 404 };
        }

        const person = await Person.findById(client.person);
        if (!person) {
            return { success: false, message: 'Person associated with client not found', status: 404 };
        }
        const clientFirstName = person.firstName || "Client";

        // Step 2: Fetch latest CreditScore
        // Assuming CreditScore model has 'client' field for association and 'datePulled'
        const latestCreditScore = await CreditScore.findOne({ client: clientId })
            .sort({ datePulled: -1 })
            .populate('scores.bureau', 'name'); // Populate bureau name for each score

        if (!latestCreditScore || !latestCreditScore.scores || latestCreditScore.scores.length === 0) {
            return { success: false, message: 'No credit scores found for this client.', status: 404 };
        }

        const scoresSummary = latestCreditScore.scores.map(s =>
            `${s.bureau ? s.bureau.name : 'Unknown Bureau'}: ${s.score}`
        ).join(', ');

        // Step 3: Call existing analyzeClientCreditItems function
        const analysisResult = await analyzeClientCreditItems(clientId);
        if (!analysisResult.success || !analysisResult.data || analysisResult.data.length === 0) {
            // If analyzeClientCreditItems itself returns success:false, or no data,
            // we might still be able_to generate a generic plan, or we can choose to error out.
            // For this subtask, let's assume we need this analysis.
            return { success: false, message: 'Could not retrieve or analyze credit items. Action plan cannot be generated.', status: analysisResult.status || 404 };
        }
        const analyzedItems = analysisResult.data;
        const derogatoryItemsSummary = analyzedItems
            .filter(item => item.analysis.isDerogatory)
            .map(item => `${item.originalItem.accountName} (${item.analysis.derogatoryType})`)
            .slice(0, 2) // Take first two for brevity in mock
            .join(', ');

        // Step 4: Construct a detailed prompt (conceptual)
        const prompt = `
Generate a step-by-step action plan for a credit repair specialist and client communication snippets for client ${clientFirstName}.

Client Name: ${clientFirstName}
Latest Credit Scores: ${scoresSummary}
Key Issues from Credit Analysis: ${derogatoryItemsSummary || "No specific derogatory items highlighted in initial analysis, focus on general credit health."}

Action Plan (for specialist):
1. Initial Review & Setup:
   - Verify client identity and authorization.
   - Confirm all credit reports (Experian, Equifax, TransUnion) are available.
   - Detailed review of all items from the AI analysis.
2. Dispute Strategy:
   - Prioritize disputes based on impact and likelihood of success (e.g., clear inaccuracies, old items).
   - For items like ${derogatoryItemsSummary || "any identified negative items"}, prepare initial dispute letters.
3. Client Communication:
   - Schedule initial consultation call with ${clientFirstName}.
   - Explain findings and proposed dispute strategy.
4. Monitoring & Follow-up:
   - Track dispute responses from bureaus.
   - Follow up on non-responses.
   - Plan for subsequent rounds of disputes if needed.
5. Credit Building:
   - Advise ${clientFirstName} on credit building strategies (e.g., secured cards, on-time payments, credit utilization).

Communication Snippets (for client ${clientFirstName}):
- Opening Summary: "Hello ${clientFirstName}, we've completed the initial review of your credit reports. Your current scores are ${scoresSummary}. We've identified a few areas we can work on, including items like ${derogatoryItemsSummary || 'general areas for improvement'}."
- Explaining Disputes: "We'll be disputing items such as ${derogatoryItemsSummary || 'any inaccuracies we found'} with the credit bureaus. This involves sending formal letters to request investigation and correction."
- Next Steps: "Our next step is to finalize these dispute letters and send them out. We'll keep you updated on their status. Expect to hear from us in about 4-6 weeks regarding responses from the bureaus."
- General Advice: "Remember ${clientFirstName}, consistently making on-time payments and keeping your credit card balances low are key to improving your credit score over time."
`;

        // Step 5: Mocked AI Response
        const mockedActionPlan = [
            `Initial Review: Confirm all documents for ${clientFirstName} are in order. Current scores: ${scoresSummary}.`,
            `Dispute Strategy: Focus on ${derogatoryItemsSummary || "any inaccurate items found"}. Prepare initial dispute letters.`,
            `Client Communication: Schedule a call with ${clientFirstName} to discuss findings.`,
            "Monitoring: Track bureau responses diligently.",
            `Credit Building: Advise ${clientFirstName} on maintaining low credit utilization.`
        ];

        const mockedCommunicationSnippets = {
            opening: `Hello ${clientFirstName}, we've completed the initial review of your credit reports. Your scores are currently: ${scoresSummary}. We've identified items like '${derogatoryItemsSummary || "areas for improvement"}' that we can address.`,
            disputeExplanation: `Based on our analysis, we will be disputing items such as '${derogatoryItemsSummary || "any inaccuracies identified"}' with the credit bureaus on your behalf. This is the first step in correcting potential errors.`,
            nextSteps: `We will now prepare and send out the first round of dispute letters for you, ${clientFirstName}. We'll monitor for responses and keep you informed. You should see updates within 30-45 days.`,
            generalAdvice: `Hi ${clientFirstName}, as we work on the disputes, remember that making all payments on time and keeping credit card balances low are very important for your credit health.`
        };

        return {
            success: true,
            data: {
                actionPlan: mockedActionPlan,
                communicationSnippets: mockedCommunicationSnippets
            },
            status: 200
        };

    } catch (error) {
        console.error('Error in generateClientActionPlanAndCommSnippets:', error);
        if (error.name === 'CastError') {
            return { success: false, message: 'Invalid Client ID format provided.', status: 400 };
        }
        // Check if it's an error from analyzeClientCreditItems that wasn't caught as !analysisResult.success
        if (error.message && error.message.includes('analyzeClientCreditItems')) {
             return { success: false, message: `Failed to generate action plan due to error in credit item analysis: ${error.message}`, status: 500 };
        }
        return { success: false, message: 'Internal server error while generating action plan.', status: 500 };
    }
}
