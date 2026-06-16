import axios from 'axios';

const FLASK_API_URL = 'http://localhost:5000/api/sentiment'; // Replace with actual Flask URL

export const analyzeSentiment = async (text) => {
  const response = await axios.post(FLASK_API_URL, { text });
  return response.data.sentiment;
};
