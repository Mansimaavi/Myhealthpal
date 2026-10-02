import { callTool } from './mcp.client.js';

// asks the ML service's analyze_emotion MCP tool (fine-tuned BERT) for the user's emotion
export const analyzeSentiment = async (text) => {
  const data = await callTool('analyze_emotion', { text });

  if (data?.error) throw new Error(data.error);
  const { label, score, sentiment } = data || {};
  if (typeof label !== 'string' || !label.trim()) {
    throw new Error('ML service returned an invalid sentiment response');
  }

  return {
    emotion: label.trim(),
    sentiment: typeof sentiment === 'string' ? sentiment : null,
    score: typeof score === 'number' ? score : null,
  };
};

export default { analyzeSentiment };
