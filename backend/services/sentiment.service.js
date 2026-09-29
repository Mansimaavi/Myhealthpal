import axios from 'axios';

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';
const ML_TIMEOUT_MS = Number(process.env.ML_TIMEOUT_MS) || 10000;

// calls the FastAPI service that runs the fine-tuned BERT classifier
export const analyzeSentiment = async (text) => {
  const response = await axios.post(
    `${ML_SERVICE_URL}/sentiment`,
    { text },
    { timeout: ML_TIMEOUT_MS }
  );

  const { label, score } = response.data || {};
  if (typeof label !== 'string' || !label.trim()) {
    throw new Error('ML service returned an invalid sentiment response');
  }

  return {
    label: label.trim(),
    score: typeof score === 'number' ? score : null,
  };
};

export default { analyzeSentiment };
