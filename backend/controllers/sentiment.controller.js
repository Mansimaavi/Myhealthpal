import { analyzeSentiment } from '../services/sentiment.service.js';

export const analyze = async (req, res) => {
  const { text } = req.body;

  if (!text) {
    return res.status(400).json({ error: 'Text is required' });
  }

  try {
    const sentiment = await analyzeSentiment(text);
    res.status(200).json({ sentiment });
  } catch (error) {
    console.error('Sentiment analysis failed:', error.message);
    res.status(500).json({ error: 'Failed to analyze sentiment' });
  }
};
