// services/gpt.service.js
import { ChatOpenAI } from '@langchain/openai';
import { SystemMessage, HumanMessage, AIMessage } from '@langchain/core/messages';
import MessageService from './message.service.js';
import MessageHistoryDto from '../dto/messageHistoryDto.js';
import { HttpError } from '../middleware/validate.js';

const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
const MAX_HISTORY_MESSAGES = Number(process.env.MAX_HISTORY_MESSAGES) || 20;
const MAX_HISTORY_CHARS = Number(process.env.MAX_HISTORY_CHARS) || 12000;
const MAX_REPLY_LENGTH = 5000;

class GPTService {
  constructor() {
    this.model = null;
  }

  // created lazily so the server can start (and tests can run) without an API key
  getModel() {
    if (!this.model) {
      if (!process.env.OPENROUTER_API_KEY) {
        throw new HttpError(503, 'Chat is not configured (OPENROUTER_API_KEY missing)');
      }
      this.model = new ChatOpenAI({
        model: process.env.OPENROUTER_MODEL || 'openai/gpt-3.5-turbo',
        apiKey: process.env.OPENROUTER_API_KEY,
        temperature: 0.7,
        maxTokens: 500,
        timeout: 30000,
        maxRetries: 2,
        configuration: {
          baseURL: OPENROUTER_BASE_URL,
          defaultHeaders: {
            'HTTP-Referer': process.env.CLIENT_URL || 'http://localhost:3000',
            'X-Title': 'MyHealthPal',
          },
        },
      });
    }
    return this.model;
  }

  // system prompts are always kept; the rest of the conversation is trimmed to the
  // most recent messages so long sessions don't blow past the context window
  buildChatMessages(historyDtos) {
    const systemText = historyDtos
      .filter(dto => dto.sender === 'system')
      .map(dto => dto.content)
      .join('\n\n');

    const conversation = historyDtos.filter(dto => dto.sender !== 'system');
    const recent = [];
    let chars = 0;
    for (let i = conversation.length - 1; i >= 0 && recent.length < MAX_HISTORY_MESSAGES; i--) {
      chars += conversation[i].content.length;
      if (chars > MAX_HISTORY_CHARS && recent.length > 0) break;
      recent.unshift(conversation[i]);
    }

    const messages = [];
    if (systemText) messages.push(new SystemMessage(systemText));
    for (const dto of recent) {
      if (dto.sender === 'user') {
        const text = dto.sentiment
          ? `${dto.content}\n\n(Detected sentiment of the user: ${dto.sentiment})`
          : dto.content;
        messages.push(new HumanMessage(text));
      } else {
        messages.push(new AIMessage(dto.content));
      }
    }
    return messages;
  }

  async getChatResponse(messages) {
    let result;
    try {
      result = await this.getModel().invoke(messages);
    } catch (err) {
      if (err instanceof HttpError) throw err;
      console.error('OpenRouter request failed:', err.message);
      throw new HttpError(502, 'The AI service is currently unavailable, please try again');
    }

    let text = result?.content;
    if (Array.isArray(text)) {
      text = text.map(part => (typeof part === 'string' ? part : part?.text || '')).join('');
    }
    if (typeof text !== 'string' || !text.trim()) {
      throw new HttpError(502, 'The AI service returned an empty response');
    }

    return text.trim().replace(/^ChatGPT:\s*/i, '').slice(0, MAX_REPLY_LENGTH);
  }

  async getIterativeChatResponse(sessionId) {
    const messages = await MessageService.getMessagesBySessionId(sessionId);
    const historyDtos = messages.map(MessageHistoryDto.fromEntity);

    const responseContent = await this.getChatResponse(this.buildChatMessages(historyDtos));

    const gptMessage = {
      content: responseContent,
      sender: 'ChatGPT',
    };

    return MessageService.createMessage(gptMessage, sessionId);
  }
}

export default new GPTService();
