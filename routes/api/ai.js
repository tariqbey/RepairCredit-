const express = require('express');
const router = express.Router();
const aiAnalysisController = require('../../controller/aiAnalysisController');
// const authMiddleware = require('../../middleware/auth'); // Assuming auth middleware might be needed later

// @route   POST /api/ai/analyze-items/:clientId
// @desc    Analyze client's credit items using AI (mocked)
// @access  Private (assumption, add authMiddleware if needed)
router.post('/analyze-items/:clientId', async (req, res) => {
    try {
        const clientId = req.params.clientId;
        if (!clientId) {
            return res.status(400).json({ success: false, message: 'Client ID is required' });
        }

        // The controller function is already async and returns a structured object
        const result = await aiAnalysisController.analyzeClientCreditItems(clientId);

        return res.status(result.status).json(result);

    } catch (error) {
        // This catch block is for unexpected errors in the route handler itself,
        // though the controller is designed to handle its own errors.
        console.error('Error in AI analysis route:', error);
        res.status(500).json({ success: false, message: 'Server error in AI analysis route' });
    }
});

// @route   POST /api/ai/generate-action-plan/:clientId
// @desc    Generate a client action plan and communication snippets using mocked AI
// @access  Private (assumption, add authMiddleware if needed)
router.post('/generate-action-plan/:clientId', async (req, res) => {
    try {
        const clientId = req.params.clientId;
        if (!clientId) {
            return res.status(400).json({ success: false, message: 'Client ID is required' });
        }

        // The controller function handles detailed validation, data fetching, and logic
        const result = await aiAnalysisController.generateClientActionPlanAndCommSnippets(clientId);

        return res.status(result.status).json(result);

    } catch (error) {
        // Catch unexpected errors in the route handler itself
        console.error('Error in generate action plan route:', error);
        res.status(500).json({ success: false, message: 'Server error in generate action plan route' });
    }
});

// @route   POST /api/ai/generate-dispute-letter
// @desc    Generate a dispute letter draft using mocked AI
// @access  Private (assumption, add authMiddleware if needed)
router.post('/generate-dispute-letter', async (req, res) => {
    try {
        const payload = req.body;

        // Basic validation for the presence of payload
        if (!payload || Object.keys(payload).length === 0) {
            return res.status(400).json({ success: false, message: 'Request body (payload) is required' });
        }

        // The controller function handles detailed validation and logic
        const result = await aiAnalysisController.generateDisputeLetterDraft(payload);

        return res.status(result.status).json(result);

    } catch (error) {
        // Catch unexpected errors in the route handler itself
        console.error('Error in generate dispute letter route:', error);
        res.status(500).json({ success: false, message: 'Server error in generate dispute letter route' });
    }
});

module.exports = router;
