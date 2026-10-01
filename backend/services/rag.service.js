import axios from 'axios';

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';
const ML_TIMEOUT_MS = Number(process.env.ML_TIMEOUT_MS) || 10000;
const RAG_TOP_K = Number(process.env.RAG_TOP_K) || 3;
const MAX_CHUNK_CHARS = 1500;

// asks the FastAPI service for knowledge base chunks relevant to the user's message.
// retrieval is optional context, so any failure just means no context.
export const retrieveContext = async (query) => {
  try {
    const response = await axios.post(
      `${ML_SERVICE_URL}/retrieve`,
      { query: query.slice(0, 5000), top_k: RAG_TOP_K },
      { timeout: ML_TIMEOUT_MS }
    );

    const results = Array.isArray(response.data?.results) ? response.data.results : [];
    return {
      crisis: response.data?.crisis === true,
      chunks: results
        .filter(r => typeof r?.text === 'string' && r.text.trim())
        .map(r => ({
          title: String(r.title || ''),
          section: String(r.section || ''),
          text: r.text.slice(0, MAX_CHUNK_CHARS),
          url: typeof r.citation?.url === 'string' && /^https?:\/\//.test(r.citation.url) ? r.citation.url : null,
        })),
    };
  } catch (err) {
    console.warn('RAG retrieval unavailable:', err.message);
    return { crisis: false, chunks: [] };
  }
};

export const formatContext = ({ crisis, chunks }) => {
  let text = '';
  if (chunks.length) {
    text += 'Reference information from the MyHealthPal mental health knowledge base, numbered as sources. '
      + 'Use it only if it is relevant to the user\'s latest message, explain it in your own words, '
      + 'and do not diagnose the user. When a sentence in your reply relies on a source, '
      + 'add its number in square brackets at the end of that sentence, like [1]. '
      + 'Only cite sources you actually used, and never invent source numbers:\n\n';
    text += chunks.map((c, i) => `[${i + 1}] ${c.title} - ${c.section}\n${c.text}`).join('\n\n');
  }
  if (crisis) {
    text += '\n\nIMPORTANT: The user\'s latest message may indicate thoughts of suicide or self-harm. '
      + 'Respond with warmth and without judgement, gently ask whether they are safe right now, '
      + 'and share that they can call Tele-MANAS (free, 24/7) on 14416 or 1-800-891-4416, '
      + 'or 112 in an emergency.';
  }
  return text.trim();
};

// returns the sources the reply actually cites, numbered as in the prompt
export const extractCitations = (reply, chunks) => {
  const cited = new Set(
    [...reply.matchAll(/\[(\d{1,2})\]/g)]
      .map(m => Number(m[1]))
      .filter(n => n >= 1 && n <= chunks.length)
  );
  return [...cited].sort((a, b) => a - b).map(n => ({
    n,
    title: `${chunks[n - 1].title} - ${chunks[n - 1].section}`,
    url: chunks[n - 1].url,
  }));
};

export default { retrieveContext, formatContext, extractCitations };
