// services/gptService.js
import fetch from 'node-fetch'; // or use axios
import MessageService from './message.service.js';
import MessageHistoryDto from '../dto/messageHistoryDto.js';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

class GPTService {
  async getChatResponse(prompt) {
    const body = {
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 500,
      temperature: 0.7,
    };

    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  async getIterativeChatResponse(sessionId) {
    const messages = await MessageService.getMessagesBySessionId(sessionId);
    const historyDtos = messages.map(MessageHistoryDto.fromEntity);

    let prompt = 'This is the conversation history so far:\n\n';
    historyDtos.forEach(dto => {
      prompt += `${dto.sender}: ${dto.content}\n`;
    });

    if (historyDtos.length) {
      const lastMessage = historyDtos[historyDtos.length - 1];
      prompt += `\nFocus on responding to the latest message:\n${lastMessage.content}`;
    }

    const responseContent = await this.getChatResponse(prompt);

    const gptMessage = {
      content: responseContent,
      sender: 'ChatGPT',
    };

    return MessageService.createMessage(gptMessage, sessionId);
  }
}

export default new GPTService();
