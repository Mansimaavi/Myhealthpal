import { analyzeSentiment } from '../services/sentiment.service.js';

export const analyze = async (req, res) => {
  const { text } = req.body || {};

  if (typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'Text is required' });
  }
  if (text.length > 5000) {
    return res.status(400).json({ error: 'Text is too long (max 5000 characters)' });
  }

  try {
    const result = await analyzeSentiment(text);
    res.status(200).json(result);
  } catch (error) {
    console.error('Sentiment analysis failed:', error.message);
    res.status(502).json({ error: 'Failed to analyze sentiment' });
  }
};
