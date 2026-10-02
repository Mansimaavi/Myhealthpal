// Tests every path through the chat graph with fake dependencies (no DB, LLM or ML service).
// Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildChatGraph } from '../agent/chatGraph.js';

const CHUNKS = [
  { title: 'Anxiety', section: 'What can help', text: 'Slow breathing helps.', url: 'https://example.org/anxiety' },
  { title: 'Stress', section: 'Overview', text: 'Stress is common.', url: 'https://example.org/stress' },
];

// builds a graph with fakes; `replies` are returned by the fake LLM in order
const setup = ({ sessionType = 'MENTAL_HEALTH_THERAPIST', text = 'I keep worrying', crisis = false,
  replies = ['Try slow breathing [1].'], crisisCheckFails = false } = {}) => {
  const calls = { prompts: [], retrieved: [] };
  const graph = buildChatGraph({
    loadConversation: async () => ({
      sessionType,
      history: [{ sender: 'system', content: 'You are supportive.' }, { sender: 'user', content: text }],
    }),
    checkCrisis: async () => {
      if (crisisCheckFails) throw new Error('ML service down');
      return crisis;
    },
    retrieveContext: async (query, topK) => {
      calls.retrieved.push({ query, topK });
      return { crisis, chunks: crisis ? [{ ...CHUNKS[0], title: 'Crisis support' }] : CHUNKS };
    },
    buildChatMessages: (history, context) => [{ role: 'system', content: context }, ...history],
    generateReply: async (messages) => {
      calls.prompts.push(messages[0].content);
      return replies[Math.min(calls.prompts.length - 1, replies.length - 1)];
    },
  });
  return { run: () => graph.invoke({ sessionId: 'abc' }), calls };
};

test('therapy chat: retrieves, generates and keeps valid citations', async () => {
  const { run, calls } = setup();
  const out = await run();
  assert.deepEqual(out.trace, ['loadConversation', 'safetyCheck', 'retrieve', 'generate', 'verifyCitations', 'checkEscalation']);
  assert.equal(out.reply, 'Try slow breathing [1].');
  assert.deepEqual(out.sources, [{ n: 1, title: 'Anxiety - What can help', url: 'https://example.org/anxiety' }]);
  assert.match(calls.prompts[0], /\[1\] Anxiety - What can help/);
  assert.equal(out.needsDoctor, false);
});

test('crisis message: routes to crisis support and puts the helpline in the prompt', async () => {
  const { run, calls } = setup({ text: 'I want to end it all', crisis: true, replies: ['You matter. Please call 14416 [1].'] });
  const out = await run();
  assert.deepEqual(out.trace, ['loadConversation', 'safetyCheck', 'addCrisisSupport', 'generate', 'verifyCitations', 'checkEscalation']);
  assert.match(calls.prompts[0], /may indicate thoughts of suicide/);
  assert.match(calls.prompts[0], /14416/);
  assert.equal(calls.retrieved[0].topK, 2);
});

test('symptom check: skips the knowledge base and flags when a doctor is needed', async () => {
  const { run, calls } = setup({
    sessionType: 'DIAGNOSIS',
    text: 'chest pain and breathless',
    replies: ['This issue requires medical attention. Please see a doctor today.'],
  });
  const out = await run();
  assert.deepEqual(out.trace, ['loadConversation', 'safetyCheck', 'generate', 'verifyCitations', 'checkEscalation']);
  assert.equal(calls.retrieved.length, 0);
  assert.equal(out.needsDoctor, true);
});

test('invalid citation: regenerates once with feedback', async () => {
  const { run, calls } = setup({ replies: ['See [5] for more.', 'Slow breathing can help [1].'] });
  const out = await run();
  assert.equal(calls.prompts.length, 2);
  assert.match(calls.prompts[1], /cited sources that don't exist \(\[5\]\)/);
  assert.equal(out.reply, 'Slow breathing can help [1].');
  assert.deepEqual(out.trace.filter(n => n === 'generate'), ['generate', 'generate']);
});

test('still invalid after the retry: made-up markers are removed', async () => {
  const { run, calls } = setup({ replies: ['See [5].', 'Still see [7], but [2] is real.'] });
  const out = await run();
  assert.equal(calls.prompts.length, 2);
  assert.equal(out.reply, 'Still see, but [2] is real.');
  assert.deepEqual(out.sources.map(s => s.n), [2]);
});

test('safety check unavailable: fails safe by adding the helpline instruction', async () => {
  const { run, calls } = setup({ crisisCheckFails: true, replies: ['I hear you.'] });
  const out = await run();
  assert.equal(out.safetyCheckFailed, true);
  assert.match(calls.prompts[0], /Tele-MANAS/);
});
