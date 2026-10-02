// agent/chatGraph.js
// The chat reply flow as a LangGraph state machine.
//
//   START → loadConversation → safetyCheck ─┬─ crisis ─────→ addCrisisSupport ─┐
//                                           ├─ therapy ────→ retrieve ─────────┤
//                                           └─ symptom check ──────────────────┤
//                                                                              ▼
//                         ┌──────────── bad citations, retry once ───────── generate
//                         ▼                                                    │
//                     generate ← ─ ─ verifyCitations ← ────────────────────────┘
//                                         │ ok
//                                         ▼
//                                  checkEscalation → END
//
// Every node is a plain async function: it gets the current state and returns only the
// fields it wants to change. The edges decide which node runs next.
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { extractCitations, formatContext } from '../services/rag.service.js';

const MEDICAL_ATTENTION = /this issue requires medical attention/i;
const MAX_ATTEMPTS = 2;

// The state every node reads from and writes to.
// For most fields the newest value wins; `trace` appends, so it records the path taken.
export const ChatState = Annotation.Root({
  sessionId: Annotation(),
  sessionType: Annotation(),
  history: Annotation(),           // [{ sender, content, emotion, sentiment }] oldest first
  userText: Annotation(),          // latest user message
  crisis: Annotation(),
  safetyCheckFailed: Annotation(),
  chunks: Annotation(),            // knowledge base chunks for the prompt, numbered [1]..[k]
  reply: Annotation(),
  sources: Annotation(),           // chunks the reply actually cites
  attempts: Annotation(),
  citationFeedback: Annotation(),  // set when generate has to try again
  needsDoctor: Annotation(),
  trace: Annotation({ reducer: (a, b) => a.concat(b), default: () => [] }),
});

const THERAPY = 'MENTAL_HEALTH_THERAPIST';

// deps are passed in (instead of imported) so tests can swap in fakes
export function buildChatGraph(deps) {
  const { loadConversation, checkCrisis, retrieveContext, buildChatMessages, generateReply } = deps;

  // 1. load the session and its messages from MongoDB
  const loadConversationNode = async (state) => {
    const { sessionType, history } = await loadConversation(state.sessionId);
    const lastUser = [...history].reverse().find(m => m.sender === 'user');
    return {
      sessionType,
      history,
      userText: lastUser?.content || '',
      attempts: 0,
      chunks: [],
      trace: ['loadConversation'],
    };
  };

  // 2. deterministic crisis check (MCP tool check_crisis) - never left to the LLM
  const safetyCheckNode = async (state) => {
    if (!state.userText) return { crisis: false, trace: ['safetyCheck'] };
    try {
      return { crisis: await checkCrisis(state.userText), trace: ['safetyCheck'] };
    } catch (err) {
      console.warn('Safety check unavailable:', err.message);
      // fail safe: generate still adds the helpline instruction when this is set
      return { crisis: false, safetyCheckFailed: true, trace: ['safetyCheck'] };
    }
  };

  // 3a. crisis: pull the helpline chunk (search_knowledge_base pins it for crisis messages)
  const addCrisisSupportNode = async (state) => {
    const { chunks } = await retrieveContext(state.userText, 2);
    return { chunks, trace: ['addCrisisSupport'] };
  };

  // 3b. therapy chat: RAG over the mental-health knowledge base
  const retrieveNode = async (state) => {
    const { chunks } = await retrieveContext(state.userText);
    return { chunks, trace: ['retrieve'] };
  };

  // 4. call the LLM with the conversation + retrieved context
  const generateNode = async (state) => {
    let context = formatContext({ crisis: state.crisis, chunks: state.chunks });
    if (state.safetyCheckFailed) {
      context += '\n\nIf the user seems at risk of harming themselves, gently share Tele-MANAS '
        + '(14416, free, 24/7) and 112 for emergencies.';
    }
    if (state.citationFeedback) context += `\n\n${state.citationFeedback}`;

    const reply = await generateReply(buildChatMessages(state.history, context.trim()));
    return { reply, attempts: state.attempts + 1, citationFeedback: null, trace: ['generate'] };
  };

  // 5. check the [n] citations point at real sources; ask for one retry if they don't
  const verifyCitationsNode = (state) => {
    const used = [...state.reply.matchAll(/\[(\d{1,2})\]/g)].map(m => Number(m[1]));
    const invalid = used.filter(n => n < 1 || n > state.chunks.length);

    if (invalid.length && state.attempts < MAX_ATTEMPTS) {
      const allowed = state.chunks.length
        ? `only [1] to [${state.chunks.length}]`
        : 'no source numbers at all, since there are no sources';
      return {
        citationFeedback: `Your previous reply cited sources that don't exist (${[...new Set(invalid)].map(n => `[${n}]`).join(', ')}). `
          + `Write the reply again and use ${allowed}.`,
        trace: ['verifyCitations'],
      };
    }

    // still wrong after the retry: drop the made-up markers rather than show them
    const reply = state.reply.replace(/\s?\[(\d{1,2})\]/g, (m, n) => (
      Number(n) >= 1 && Number(n) <= state.chunks.length ? m : ''
    ));
    return { reply, sources: extractCitations(reply, state.chunks), trace: ['verifyCitations'] };
  };

  // 6. symptom checks: flag replies that say a doctor is needed so the app can offer provider search
  const checkEscalationNode = (state) => ({
    needsDoctor: state.sessionType !== THERAPY && MEDICAL_ATTENTION.test(state.reply),
    trace: ['checkEscalation'],
  });

  // ---- routing ----
  const afterSafetyCheck = (state) => {
    if (state.crisis) return 'addCrisisSupport';
    // the knowledge base only covers emotional health, so symptom checks skip retrieval
    return state.sessionType === THERAPY ? 'retrieve' : 'generate';
  };

  const afterVerify = (state) => (state.citationFeedback ? 'generate' : 'checkEscalation');

  return new StateGraph(ChatState)
    .addNode('loadConversation', loadConversationNode)
    .addNode('safetyCheck', safetyCheckNode)
    .addNode('addCrisisSupport', addCrisisSupportNode)
    .addNode('retrieve', retrieveNode)
    .addNode('generate', generateNode)
    .addNode('verifyCitations', verifyCitationsNode)
    .addNode('checkEscalation', checkEscalationNode)
    .addEdge(START, 'loadConversation')
    .addEdge('loadConversation', 'safetyCheck')
    .addConditionalEdges('safetyCheck', afterSafetyCheck, ['addCrisisSupport', 'retrieve', 'generate'])
    .addEdge('addCrisisSupport', 'generate')
    .addEdge('retrieve', 'generate')
    .addEdge('generate', 'verifyCitations')
    .addConditionalEdges('verifyCitations', afterVerify, ['generate', 'checkEscalation'])
    .addEdge('checkEscalation', END)
    .compile();
}
