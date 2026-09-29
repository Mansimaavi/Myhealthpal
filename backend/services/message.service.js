import Message from '../models/message.model.js';
import Session from '../models/session.model.js';
import { analyzeSentiment } from './sentiment.service.js';
import { HttpError } from '../middleware/validate.js';

const MAX_CONTENT_LENGTH = 5000;

const validateContent = (content) => {
  if (typeof content !== 'string' || !content.trim()) {
    throw new HttpError(400, 'Message content is required');
  }
  if (content.length > MAX_CONTENT_LENGTH) {
    throw new HttpError(400, `Message content is too long (max ${MAX_CONTENT_LENGTH} characters)`);
  }
  return content.trim();
};

class MessageService {
  async getMessageById(id, userId) {
    const message = await Message.findById(id).exec();
    if (!message) throw new HttpError(404, 'Message not found with ID: ' + id);
    await this.getSessionById(message.session, userId);
    return message;
  }

  async getMessagesBySessionId(sessionId) {
    return Message.find({ session: sessionId }).sort({ timestamp: 1 }).exec();
  }

  // same as above but only for the session owner, and without the prompt messages
  async getVisibleMessages(sessionId, userId) {
    await this.getSessionById(sessionId, userId);
    return Message.find({ session: sessionId, sender: { $ne: 'system' } }).sort({ timestamp: 1 }).exec();
  }

  async createMessage(messageData, sessionId) {
    const session = await this.getSessionById(sessionId);
    const message = new Message({
      content: messageData.sender === 'user' ? validateContent(messageData.content) : messageData.content,
      sender: messageData.sender,
      session: session._id,
      timestamp: new Date(),
    });
    return message.save();
  }

  async createTherapyMessage(messageData, sessionId) {
    const session = await this.getSessionById(sessionId);
    const content = validateContent(messageData.content);

    // the chat should still work if the ML service is down, just without the sentiment hint
    let sentiment;
    try {
      sentiment = (await analyzeSentiment(content)).label;
    } catch (err) {
      console.warn('Sentiment analysis unavailable:', err.message);
    }

    const message = new Message({
      content,
      sender: 'user',
      sentiment,
      session: session._id,
      timestamp: new Date(),
    });
    return message.save();
  }

  async deleteMessagesBySessionId(sessionId) {
    return Message.deleteMany({ session: sessionId }).exec();
  }

  async getSessionById(sessionId, userId) {
    const filter = { _id: sessionId };
    if (userId) filter.user = userId;
    const session = await Session.findOne(filter).exec();
    if (!session) throw new HttpError(404, 'Session not found with ID: ' + sessionId);
    return session;
  }
}

export default new MessageService();
