import express from 'express';
import GPTService from '../services/gpt.service.js';

const router = express.Router();
const gptService = new GPTService();

router.post('/chat', async (req, res) => {
  try {
    const prompt = req.body;
    const response = await gptService.getChatResponse(prompt);
    res.json(response);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/chat/:sessionId', async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const responseMessage = await gptService.getIterativeChatResponse(sessionId);
    res.json(responseMessage);
  } catch (err) {
    res.status(500).json({
      sender: 'system',
      content: 'An error occurred while processing the response: ' + err.message,
    });
  }
});

export default router;
