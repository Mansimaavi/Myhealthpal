import Message from '../models/message.model.js';
import Session from '../models/session.model.js'; // You must create this or adjust accordingly
import SentimentService from './sentiment.service.js'; // Your sentiment analysis implementation

class MessageService {
  async getAllMessages() {
    return Message.find().exec();
  }

  async getMessageById(id) {
    const message = await Message.findById(id).exec();
    if (!message) throw new Error('Message not found with ID: ' + id);
    return message;
  }

  async getMessagesBySessionId(sessionId) {
    return Message.find({ session: sessionId }).exec();
  }

  async createMessage(messageData, sessionId) {
    const session = await this.getSessionById(sessionId);
    const message = new Message({
      ...messageData,
      session: session._id,
      timestamp: new Date(),
    });
    return message.save();
  }

  async createTherapyMessage(messageData, sessionId) {
    const session = await this.getSessionById(sessionId);
    const sentiment = await SentimentService.analyzeSentiment(messageData.content);
    const newContent = `${messageData.content}, The detected sentiment of the user is: ${sentiment}`;
    const message = new Message({
      ...messageData,
      content: newContent,
      session: session._id,
      timestamp: new Date(),
    });
    return message.save();
  }

  async getSessionById(sessionId) {
    const session = await Session.findById(sessionId).exec();
    if (!session) throw new Error('Session not found with ID: ' + sessionId);
    return session;
  }
}

export default new MessageService();
