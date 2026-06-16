import express from 'express';
import messageService from '../services/message.service.js';
import gptService from '../services/gpt.service.js'; // Your GPTService from previous example
import MessageResponseDto from '../dto/messageResponseDto.js'; // We'll define below

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const messages = await messageService.getAllMessages();
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const message = await messageService.getMessageById(req.params.id);
    res.json(message);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

router.get('/session/:id', async (req, res) => {
  try {
    const messages = await messageService.getMessagesBySessionId(req.params.id);
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:sessionId', async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const userMessageData = req.body;

    const userMessage = await messageService.createMessage(userMessageData, sessionId);

    const gptResponse = await gptService.getIterativeChatResponse(sessionId);

    const responseDto = new MessageResponseDto(userMessage, gptResponse);

    // If user message contains "The medicine I want help understanding is:" delete it (similar to original)
    if (userMessage.content.includes('The medicine I want help understanding is:')) {
      await userMessage.deleteOne();
    }

    res.json(responseDto);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/therapy/:sessionId', async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const content = req.body.content || req.body; // Accept raw string or {content: '...'}

    const messageData = {
      content,
      sender: 'user',
    };

    const userMessage = await messageService.createTherapyMessage(messageData, sessionId);

    const gptResponse = await gptService.getIterativeChatResponse(sessionId);

    const responseDto = new MessageResponseDto(userMessage, gptResponse);

    res.json(responseDto);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
