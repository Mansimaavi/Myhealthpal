// controllers/messageController.js
import express from 'express';
import MessageService from '../services/message.service.js';
import GPTService from '../services/gpt.service.js';
import MessageResponseDto from '../dto/messageResponseDto.js';

const router = express.Router();

router.get('/', async (req, res) => {
  const messages = await MessageService.getAllMessages();
  res.json(messages);
});

router.get('/:id', async (req, res) => {
  const message = await MessageService.getMessageById(req.params.id);
  res.json(message);
});

router.get('/session/:sessionId', async (req, res) => {
  const messages = await MessageService.getMessagesBySessionId(req.params.sessionId);
  res.json(messages);
});

router.post('/:sessionId', async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const userMessageData = req.body;
    const userMessage = await MessageService.createMessage(userMessageData, sessionId);

    const gptResponse = await GPTService.getIterativeChatResponse(sessionId);

    // You can add any filtering or deletion logic here if needed

    const responseDto = new MessageResponseDto(userMessage, gptResponse);
    res.json(responseDto);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/therapy/:sessionId', async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const content = req.body.content || req.body; // adjust based on client request

    const userMessage = await MessageService.createTherapyMessage(content, sessionId);
    const gptResponse = await GPTService.getIterativeChatResponse(sessionId);

    const responseDto = new MessageResponseDto(userMessage, gptResponse);
    res.json(responseDto);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
