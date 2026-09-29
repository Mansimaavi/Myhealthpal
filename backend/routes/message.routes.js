import express from 'express';
import messageService from '../services/message.service.js';
import gptService from '../services/gpt.service.js';
import MessageResponseDto from '../dto/messageResponseDto.js';
import { requireAuth } from '../middleware/auth.js';
import { validateObjectId } from '../middleware/validate.js';

const router = express.Router();

router.use(requireAuth);

// accept either a raw JSON string or { content: '...' }
const readContent = (body) => (typeof body === 'string' ? body : body?.content);

router.get('/session/:id', validateObjectId('id'), async (req, res) => {
  const messages = await messageService.getVisibleMessages(req.params.id, req.user.id);
  res.json(messages);
});

router.post('/therapy/:sessionId', validateObjectId('sessionId'), async (req, res) => {
  const sessionId = req.params.sessionId;
  await messageService.getSessionById(sessionId, req.user.id);

  const messageData = {
    content: readContent(req.body),
    sender: 'user',
  };

  const userMessage = await messageService.createTherapyMessage(messageData, sessionId);

  const gptResponse = await gptService.getIterativeChatResponse(sessionId);

  const responseDto = new MessageResponseDto(userMessage, gptResponse);

  res.json(responseDto);
});

router.get('/:id', validateObjectId('id'), async (req, res) => {
  const message = await messageService.getMessageById(req.params.id, req.user.id);
  res.json(message);
});

router.post('/:sessionId', validateObjectId('sessionId'), async (req, res) => {
  const sessionId = req.params.sessionId;
  await messageService.getSessionById(sessionId, req.user.id);

  const userMessageData = {
    content: readContent(req.body),
    sender: 'user',
  };

  const userMessage = await messageService.createMessage(userMessageData, sessionId);

  const gptResponse = await gptService.getIterativeChatResponse(sessionId);

  const responseDto = new MessageResponseDto(userMessage, gptResponse);

  // If user message contains "The medicine I want help understanding is:" delete it (similar to original)
  if (userMessage.content.includes('The medicine I want help understanding is:')) {
    await userMessage.deleteOne();
  }

  res.json(responseDto);
});

export default router;
