# MyHealthPal

MyHealthPal is a health assistant app. It supports symptom-check ("diagnosis") chat sessions, a supportive therapy-style chat, sentiment detection on user messages, and a lookup for nearby healthcare providers.

The repo contains three parts: a React frontend, an Express/MongoDB backend, and a FastAPI ML service.

## Architecture

```
React frontend  ──►  Express API (Node.js)  ──►  MongoDB
 (Web Speech API)         │
                          ├── LangGraph chat graph (agent/chatGraph.js)
                          │      ├──► OpenRouter via LangChain       writes the reply
                          │      └──► MCP client ──► FastAPI ML service (MCP server at /mcp)
                          │                            ├─ check_crisis           phrase-based crisis check
                          │                            ├─ search_knowledge_base  TF-IDF + cosine similarity RAG
                          │                            ├─ analyze_emotion        fine-tuned BERT
                          │                            └─ get_crisis_resources   helplines
                          └──► OpenStreetMap Overpass API   nearby healthcare providers
```

A beginner-friendly walkthrough of the LangGraph graph and the MCP server, with interview Q&A, is in [docs/langgraph-and-mcp.md](docs/langgraph-and-mcp.md).

- **Frontend**: React (Vite) app with login/register, a medical-history step before symptom checks, therapy and symptom-check chats, and a provider finder.
- **Speech**: speech-to-text uses the browser's `SpeechRecognition` API (`src/hooks/useSpeechRecognition.js`, `en-IN`). Text-to-speech uses `speechSynthesis` (`src/hooks/useSpeechSynthesis.js`), with a "Read replies aloud" toggle and a Listen button on each reply. Voice input works in Chrome and Edge; other browsers fall back to typing.

- **Express API**: handles auth (JWT), users, sessions, messages, diagnoses, and healthcare places.
- **Chat (LangGraph)**: each reply runs through a LangGraph state machine: load conversation → deterministic crisis check → crisis support, RAG retrieval (therapy chats) or straight to generation (symptom checks) → LLM reply via LangChain + OpenRouter → citation check (one retry if the reply cites sources that don't exist) → escalation check (flags symptom-check replies that need a doctor). Only the most recent messages are sent to the model, up to `MAX_HISTORY_MESSAGES` messages and `MAX_HISTORY_CHARS` characters. The path each reply took is saved with it as `trace`.
- **MCP**: the ML service exposes its capabilities as MCP tools over streamable HTTP, and the backend calls them with the official MCP client (`services/mcp.client.js`). Any MCP client, such as Claude Desktop or the MCP Inspector, can use the same tools.
- **Emotion detection (BERT)**: therapy messages are sent to the ML service, and the detected emotion and sentiment are stored on the message and passed to the LLM as a hint.
- **RAG**: before each reply, the user's latest message is sent to the ML service's retriever. In therapy sessions, the top matching knowledge-base chunks are added to the system prompt. The knowledge base only covers emotional and mental-health topics, so diagnosis (physical-symptom) sessions only use the crisis check.
- If the ML service is down, chat still works, just without the emotion hint and retrieved context.
- **Healthcare providers**: `/discover` finds real hospitals, clinics, doctors and counsellors around the user's location from OpenStreetMap (Overpass API), with results cached for 10 minutes. Places you add yourself are stored in MongoDB with a GeoJSON `location` and `2dsphere` index, and `/nearby` returns them with `$geoNear`. When a symptom-check reply says the issue needs medical attention, the chat shows a "Find doctors near you" link.

## Tech stack

- **Frontend**: React 19, React Router, Vite, Web Speech API
- **Backend**: Node.js, Express 5, MongoDB/Mongoose, LangGraph.js, LangChain (`@langchain/openai`), OpenRouter, MCP TypeScript SDK (client), JWT, bcrypt, axios
- **ML service**: Python, FastAPI, MCP Python SDK (server), Hugging Face Transformers, PyTorch, scikit-learn (TF-IDF), SciPy sparse matrices, Snowball stemmer, pypdf

## BERT emotion classifier

- **Data**: [GoEmotions](https://github.com/google-research/google-research/tree/master/goemotions), 58k Reddit comments labelled with 27 emotions. `training/prepare_data.py` maps them to Ekman's 6 basic emotions + neutral (anger, disgust, fear, joy, sadness, surprise, neutral) using the dataset's own `ekman_mapping.json`. It keeps only comments whose labels agree on a single emotion, which gives about 39.5k train / 4.9k dev / 5k test examples.
- **Model**: `bert-base-uncased` fine-tuned for sequence classification (`training/train_bert.py`) with the Hugging Face `Trainer`. The classes are very imbalanced (fear and disgust are about 1% each), so the loss uses square-root-softened class weights and the best epoch is chosen by macro-F1 on the dev set. The test-set report is saved next to the model.
- **Serving**: `POST /sentiment {"text": "..."}` returns `{"label": "sadness", "score": 0.91, "sentiment": "negative", "scores": {...}}`. If no trained model is present, the endpoint returns 503 and everything else keeps working.

## RAG pipeline (TF-IDF + cosine similarity)

Ingestion runs offline (`python -m app.rag.ingest`, also run on every deploy) and writes a persistent index. Retrieval runs on each chat message.

```
knowledge_base/*.md|txt|html|pdf
  → Extraction      loaders.py       Markdown/plain text, HTML (visible text only, headings kept), PDF (pypdf)
  → Cleaning        cleaning.py      Unicode NFKC, HTML entities, Markdown syntax, PDF hyphenation and page numbers,
                                     whitespace; "Source:" lines are moved into metadata
  → Deduplication   dedup.py         exact (SHA-256 of normalised text) for documents and chunks, near-duplicate
                                     chunks by 5-word-shingle Jaccard similarity >= 0.8
  → Chunking        chunking.py      split on headings, then pack whole sentences up to 150 words with ~30 words of
                                     overlap; each chunk is indexed with a "Title - Section" header
  → Metadata        pipeline.py      doc id, source file/type, title, section, chunk index, source URLs, content hash
  → Vectorization   tfidf_index.py   TfidfVectorizer: unigrams + bigrams, sublinear TF, max_df 0.9, L2-normalised rows;
                                     custom tokenizer (contractions, domain-aware stop words, word-form lexicon, Snowball stemming)
  → Persistent      tfidf_index.py   vectorizer.joblib + matrix.npz (sparse) + chunks.json + manifest.json in index/;
    index                            saved atomically, versioned, and only rebuilt when the corpus hash changes
  → Retrieval       retriever.py     cosine similarity (dot product of L2-normalised sparse vectors), top-k,
                                     RAG_MIN_SCORE threshold; crisis phrases always pin the helpline chunk (safety.py)
  → Citation        backend          chunks are numbered [1]..[k] in the prompt, the LLM cites them inline, and the
                                     sources it actually cites are saved with the reply and shown as links in the chat
```

**Tokenizer choices.** scikit-learn's English stop-word list drops words that carry meaning here ("alone", "empty", "nobody", "never", "not"), so they are kept. Snowball stemming merges "worrying/worries" and "lying/lie", but it doesn't link derived forms ("anxious" → `anxious`, "anxiety" → `anxieti`), so a small lexicon maps feeling words to one form first (anxious → anxiety, lonely → loneliness, depressed → depression, scared → fear).

**Document expansion.** TF-IDF only matches shared words, so "my dad died" doesn't match a note about "death of a loved one". Each document has a "How people often put it" section with everyday phrasings for that topic.

**Evaluation** (`python -m app.rag.ingest --eval`). Ranking = expected topic is the top result; retrieved = and above the threshold; rejected = off-topic query returns nothing. Crisis queries are excluded because they are handled by the phrase check.

| Query set | Ranking | Retrieved (≥ 0.12) | Off-topic rejected |
|---|---|---|---|
| dev 1 (used while building) | 12/12 | 12/12 | 1/2 |
| dev 2 (used for document expansion and threshold) | 12/12 | 12/12 | 3/4 |
| **test (written after tuning)** | **8/15** | **7/15** | **3/5** |

The gap between the dev and test sets is the main result: document expansion fixed the phrasings it was written for, but new paraphrases with no shared words (e.g. "I still flinch at loud noises after the car crash") are still missed. That's the core limitation of lexical retrieval; the next step would be hybrid retrieval that adds dense embeddings alongside TF-IDF. The threshold trades precision for recall: at 0.19 every off-topic test query was rejected but only 3/15 relevant ones got through; 0.12 lets 7/15 through with some off-topic matches. Retrieval is only used in therapy chats, and the LLM is told to ignore irrelevant context, so recall is favoured.

- **Knowledge base**: `ml-service/knowledge_base/`, curated notes on emotion-related mental-health topics only: depression, anxiety, panic attacks, stress, burnout, grief, loneliness, sleep problems, social anxiety, anger, trauma/PTSD, and crisis support. They are written in plain language from WHO, NIMH, NHS and Tele-MANAS guidance, and each file lists its sources.
- **Scope**: documents are used in therapy chats. Symptom-check chats only use the crisis check, since the knowledge base doesn't cover physical conditions.

## Project structure

```
frontend/
  src/pages/             Login, Register, Home, Profile, Chat, Providers
  src/hooks/             useSpeechRecognition, useSpeechSynthesis
  src/components/        Layout, MicButton, RequireAuth
  src/api.js, auth.jsx   API client and login state
ml-service/
  app/main.py            FastAPI app (/health, /sentiment, /retrieve) with the MCP server mounted at /mcp
  app/mcp_server.py      MCP tools: check_crisis, search_knowledge_base, analyze_emotion, get_crisis_resources
  app/services.py        shared logic used by both the REST endpoints and the MCP tools
  app/classifier.py      loads the fine-tuned BERT model
  app/rag/               RAG pipeline: loaders, cleaning, dedup, chunking, tfidf_index, retriever, ingest
  app/safety.py          crisis phrase check
  app/labels.py          emotion labels shared by training and serving
  training/              prepare_data.py, train_bert.py
  knowledge_base/        curated markdown documents for RAG
  tests/                 pytest tests
backend/
  app.js, server.js
  controllers/   request handlers
  routes/        express routers
  agent/         LangGraph chat graph
  services/      business logic, LLM client, MCP client
  models/        mongoose schemas
  middleware/    auth (JWT) and validation / error handling
  dto/
  scripts/       one-off maintenance scripts
  test/          LangGraph tests (npm test)
docs/            LangGraph and MCP guide
```

## Setup

Requirements: Node.js 22+, Python 3.10+ and MongoDB (local or Atlas).

### 1. ML service

```bash
cd ml-service
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt

python training/prepare_data.py --out-dir data                         # downloads GoEmotions
python training/train_bert.py --data-dir data --output-dir models/emotion-bert

python -m app.rag.ingest --eval      # build the TF-IDF index in ml-service/index/ and print the evaluation
uvicorn app.main:app --port 8000      # (also builds the index on first start if it's missing)
pytest -q
```

Training `bert-base-uncased` for 3 epochs takes roughly 20–30 minutes on a GPU (e.g. a free Colab T4) and several hours on a CPU. On Colab, run the same two training commands, then download `models/emotion-bert/` into `ml-service/models/`. The service looks for the model in `MODEL_DIR` (default `ml-service/models/emotion-bert`).

### 2. Backend

```bash
cd backend
npm install
cp .env.example .env    # then fill in the values
npm run dev             # or: npm start
npm test                # LangGraph tests
```

The API runs on `http://localhost:5000` and expects the ML service at `ML_SERVICE_URL`.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`. The dev server proxies `/api` to the backend on port 5000. Voice input needs Chrome or Edge and microphone permission; the provider finder needs location permission.

### Running everything

Use three terminals: `uvicorn app.main:app --port 8000` in `ml-service/`, `npm run dev` in `backend/`, and `npm run dev` in `frontend/`. MongoDB must be running (or `MONGO_URI` must point to Atlas).

If you already have healthcare places in the database from before the `location` field existed, run this once:

```bash
npm run backfill:locations
```

## Deployment (Render + MongoDB Atlas)

- **App service** (Node): build with `cd frontend && npm install && npm run build && cd ../backend && npm install`, start with `cd backend && node server.js`. When `frontend/dist` exists, Express serves the React app, so the site and API share one URL.
- **ML service** (Python): build with `pip install -r ml-service/requirements-deploy.txt && cd ml-service && python -m app.rag.ingest --eval`, start with `cd ml-service && uvicorn app.main:app --host 0.0.0.0 --port $PORT`. The build step builds the TF-IDF index and prints the evaluation. The BERT model needs more memory than Render's free tier, so on free plans `/sentiment` returns 503 and chat works without the emotion hint.
- Set the app service's environment variables as below, with `ML_SERVICE_URL` pointing to the ML service URL.

## Environment variables (`backend/.env`)

| Variable | Description |
|---|---|
| `PORT` | API port (default 5000) |
| `MONGO_URI` | MongoDB connection string |
| `CLIENT_URL` | Frontend origin for CORS (default `http://localhost:3000`) |
| `JWT_SECRET` | Secret used to sign login tokens (required) |
| `JWT_EXPIRES_IN` | Token lifetime (default `7d`) |
| `OPENROUTER_API_KEY` | OpenRouter key; chat returns 503 without it |
| `OPENROUTER_MODEL` | Model id (default `openai/gpt-3.5-turbo`) |
| `MAX_HISTORY_MESSAGES` / `MAX_HISTORY_CHARS` | Limits on how much history is sent to the LLM |
| `ML_SERVICE_URL` | FastAPI ML service base URL (default `http://localhost:8000`) |
| `ML_TIMEOUT_MS` | Timeout for ML service calls |
| `RAG_TOP_K` | Number of knowledge base chunks added to the prompt (default 3) |
| `MCP_URL` | ML service MCP endpoint (default `${ML_SERVICE_URL}/mcp/`) |
| `OVERPASS_URL` | OpenStreetMap Overpass endpoint for provider discovery |

ML service (optional, set in the shell):

| Variable | Description |
|---|---|
| `MODEL_DIR` | Fine-tuned model directory (default `models/emotion-bert`) |
| `KB_DIR` | Knowledge base directory (default `knowledge_base`) |
| `INDEX_DIR` | Where the TF-IDF index is saved (default `index`) |
| `MCP_ALLOWED_HOSTS` | Extra hostnames the MCP endpoint accepts, comma-separated (localhost is always allowed), e.g. `myhealthpal-rag.onrender.com` |
| `RAG_MIN_SCORE` | Minimum cosine similarity for a chunk to be returned (default 0.12, see evaluation) |
| `CHUNK_MAX_WORDS`, `CHUNK_OVERLAP_WORDS` | Chunk size and overlap (default 150 / 30) |

Never commit `.env`.

## API overview

All routes are under `/api`. Routes marked 🔒 need an `Authorization: Bearer <token>` header.

| Method | Route | Notes |
|---|---|---|
| POST | `/users` | register (returns `{ user, token }`) |
| POST | `/users/login` | login (returns `{ user, token }`) |
| GET | `/users/:id` 🔒 | own profile only |
| PATCH | `/users/:id/medical-history` 🔒 | own profile only |
| GET | `/sessions` 🔒 | your sessions |
| POST | `/sessions` 🔒 | new diagnosis session |
| POST | `/sessions/therapy` 🔒 | new therapy session |
| GET/PUT/DELETE | `/sessions/:id` 🔒 | owner only |
| GET | `/messages/session/:id` 🔒 | chat history (system prompts hidden) |
| POST | `/messages/:sessionId` 🔒 | `{ content }` → user message + AI reply |
| POST | `/messages/therapy/:sessionId` 🔒 | same, with sentiment detection |
| POST | `/sentiment` 🔒 | `{ text }` → `{ emotion, sentiment, score }` |
| GET/POST | `/diagnoses` 🔒 | scoped to your sessions |
| GET | `/healthcare-places` | all places |
| GET | `/healthcare-places/nearby?latitude=&longitude=&maxDistance=&limit=` | saved places; `maxDistance` in km (default 10, max 100) |
| GET | `/healthcare-places/discover?latitude=&longitude=&radius=&mentalHealth=` 🔒 | live OpenStreetMap results; `radius` in km (default 5, max 20) |
| POST / DELETE | `/healthcare-places` 🔒 | |
