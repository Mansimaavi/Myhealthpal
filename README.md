# MyHealthPal

MyHealthPal is a health assistant app. It supports symptom-check ("diagnosis") chat sessions, a supportive therapy-style chat, sentiment detection on user messages, and a lookup for nearby healthcare providers.

The repo contains three parts: a React frontend, an Express/MongoDB backend, and a FastAPI ML service.

## Architecture

```
React frontend  ──►  Express API (Node.js)  ──►  MongoDB
 (Web Speech API)         │
                          ├──►  OpenRouter (via LangChain)   chat replies
                          └──►  FastAPI ML service
                                  ├─ /sentiment   fine-tuned BERT emotion classifier
                                  └─ /retrieve    embeddings + Atlas Vector Search RAG
                          └──►  OpenStreetMap Overpass API   nearby healthcare providers
```

- **Frontend**: React (Vite) app with login/register, a medical-history step before symptom checks, therapy and symptom-check chats, and a provider finder.
- **Speech**: speech-to-text uses the browser's `SpeechRecognition` API (`src/hooks/useSpeechRecognition.js`, `en-IN`). Text-to-speech uses `speechSynthesis` (`src/hooks/useSpeechSynthesis.js`), with a "Read replies aloud" toggle and a Listen button on each reply. Voice input works in Chrome and Edge; other browsers fall back to typing.

- **Express API**: handles auth (JWT), users, sessions, messages, diagnoses, and healthcare places.
- **Chat**: `services/gpt.service.js` uses LangChain's `ChatOpenAI` pointed at OpenRouter's OpenAI-compatible endpoint. Each session starts with system prompts. Only the most recent messages are sent to the model, up to `MAX_HISTORY_MESSAGES` messages and `MAX_HISTORY_CHARS` characters.
- **Emotion detection (BERT)**: therapy messages are sent to the ML service, and the detected emotion and sentiment are stored on the message and passed to the LLM as a hint.
- **RAG**: before each reply, the user's latest message is sent to the ML service's retriever. In therapy sessions, the top matching knowledge-base chunks are added to the system prompt. The knowledge base only covers emotional and mental-health topics, so diagnosis (physical-symptom) sessions only use the crisis check.
- If the ML service is down, chat still works, just without the emotion hint and retrieved context.
- **Healthcare providers**: `/discover` finds real hospitals, clinics, doctors and counsellors around the user's location from OpenStreetMap (Overpass API), with results cached for 10 minutes. Places you add yourself are stored in MongoDB with a GeoJSON `location` and `2dsphere` index, and `/nearby` returns them with `$geoNear`. When a symptom-check reply says the issue needs medical attention, the chat shows a "Find doctors near you" link.

## Tech stack

- **Frontend**: React 19, React Router, Vite, Web Speech API
- **Backend**: Node.js, Express 5, MongoDB/Mongoose, LangChain (`@langchain/openai`), OpenRouter, JWT, bcrypt, axios
- **ML service**: Python, FastAPI, Hugging Face Transformers, PyTorch, fastembed (bge-small-en-v1.5), MongoDB Atlas Vector Search, pypdf, scikit-learn

## BERT emotion classifier

- **Data**: [GoEmotions](https://github.com/google-research/google-research/tree/master/goemotions), 58k Reddit comments labelled with 27 emotions. `training/prepare_data.py` maps them to Ekman's 6 basic emotions + neutral (anger, disgust, fear, joy, sadness, surprise, neutral) using the dataset's own `ekman_mapping.json`. It keeps only comments whose labels agree on a single emotion, which gives about 39.5k train / 4.9k dev / 5k test examples.
- **Model**: `bert-base-uncased` fine-tuned for sequence classification (`training/train_bert.py`) with the Hugging Face `Trainer`. The classes are very imbalanced (fear and disgust are about 1% each), so the loss uses square-root-softened class weights and the best epoch is chosen by macro-F1 on the dev set. The test-set report is saved next to the model.
- **Serving**: `POST /sentiment {"text": "..."}` returns `{"label": "sadness", "score": 0.91, "sentiment": "negative", "scores": {...}}`. If no trained model is present, the endpoint returns 503 and everything else keeps working.

## RAG pipeline

Ingestion runs offline (`python -m app.rag.ingest`, also run on every deploy). Retrieval runs on each chat message.

```
knowledge_base/*.md|txt|html|pdf
  → Extraction      loaders.py    text from Markdown, plain text, HTML (visible text only) and PDF (pypdf)
  → Cleaning        cleaning.py   Unicode NFKC, HTML entities, Markdown syntax, PDF hyphenation/page numbers, whitespace;
                                  "Source:" lines are moved into metadata
  → Deduplication   dedup.py      exact (SHA-256 of normalised text) for documents and chunks,
                                  near-duplicate chunks by 5-word-shingle Jaccard similarity ≥ 0.8
  → Chunking        chunking.py   split on headings, then pack whole sentences up to 150 words with ~30 words of overlap;
                                  each chunk is embedded with a "Title - Section" header for context
  → Metadata        pipeline.py   doc id, source file/type, title, section, chunk index, source URLs, content hash,
                                  embedding model/dimension, ingest time
  → Embeddings      embeddings.py BAAI/bge-small-en-v1.5 (384-dim, normalised) via fastembed/ONNX Runtime
  → Vector DB       store.py      MongoDB Atlas Vector Search (`kb_chunks` collection, cosine `vectorSearch` index);
                                  in-memory numpy store for local development and tests
  → Retrieval       retriever.py  embed the query (bge query instruction), $vectorSearch top-k, drop matches below
                                  RAG_MIN_SCORE; crisis phrases always pin the helpline chunk (safety.py)
  → Citation        backend       chunks are numbered [1]..[k] in the prompt, the LLM cites them inline, and the
                                  sources it actually cites are saved with the reply and shown as links in the chat
```

Re-running ingestion is idempotent: chunks are upserted by id and chunks that no longer exist are deleted.

**Evaluation** (`python -m app.rag.ingest --eval`, 14 labelled queries, bge-small on Atlas): the correct topic ranked first for all 12 emotional queries. Relevant top scores ranged 0.58–0.77, while the off-topic queries ("my knee hurts", "what is the capital of France") topped out at 0.54, so `RAG_MIN_SCORE` defaults to 0.56. The crisis query ("everyone would be better off without me") only scored 0.53, which is why crisis phrases are pinned by `safety.py` instead of relying on similarity.

- **Knowledge base**: `ml-service/knowledge_base/`, curated notes on emotion-related mental-health topics only: depression, anxiety, panic attacks, stress, burnout, grief, loneliness, sleep problems, social anxiety, anger, trauma/PTSD, and crisis support. They are written in plain language from WHO, NIMH, NHS and Tele-MANAS guidance, and each file lists its sources.
- **Scope**: documents are used in therapy chats. Symptom-check chats only use the crisis check, since the knowledge base doesn't cover physical conditions.
- **Why bge-small + fastembed**: semantic matching ("I can't switch my mind off" finds the anxiety notes without shared keywords), small enough for a free-tier server, no PyTorch at runtime.

## Project structure

```
frontend/
  src/pages/             Login, Register, Home, Profile, Chat, Providers
  src/hooks/             useSpeechRecognition, useSpeechSynthesis
  src/components/        Layout, MicButton, RequireAuth
  src/api.js, auth.jsx   API client and login state
ml-service/
  app/main.py            FastAPI app (/health, /sentiment, /retrieve)
  app/classifier.py      loads the fine-tuned BERT model
  app/rag/               RAG pipeline: loaders, cleaning, dedup, chunking, embeddings, store, retriever, ingest
  app/safety.py          crisis phrase check
  app/labels.py          emotion labels shared by training and serving
  training/              prepare_data.py, train_bert.py
  knowledge_base/        curated markdown documents for RAG
  tests/                 pytest tests
backend/
  app.js, server.js
  controllers/   request handlers
  routes/        express routers
  services/      business logic, LLM + ML service clients
  models/        mongoose schemas
  middleware/    auth (JWT) and validation / error handling
  dto/
  scripts/       one-off maintenance scripts
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

uvicorn app.main:app --port 8000      # local dev: builds an in-memory vector index on startup
pytest -q

# optional: use MongoDB Atlas Vector Search instead of the in-memory store
VECTOR_STORE=atlas MONGO_URI="mongodb+srv://..." python -m app.rag.ingest --eval
VECTOR_STORE=atlas MONGO_URI="mongodb+srv://..." uvicorn app.main:app --port 8000
```

Training `bert-base-uncased` for 3 epochs takes roughly 20–30 minutes on a GPU (e.g. a free Colab T4) and several hours on a CPU. On Colab, run the same two training commands, then download `models/emotion-bert/` into `ml-service/models/`. The service looks for the model in `MODEL_DIR` (default `ml-service/models/emotion-bert`).

### 2. Backend

```bash
cd backend
npm install
cp .env.example .env    # then fill in the values
npm run dev             # or: npm start
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
- **ML service** (Python): build with `pip install -r ml-service/requirements-deploy.txt && cd ml-service && python -m app.rag.ingest --eval`, start with `cd ml-service && uvicorn app.main:app --host 0.0.0.0 --port $PORT`, and set `VECTOR_STORE=atlas` and `MONGO_URI`. The build step embeds the knowledge base into Atlas and prints a retrieval check. The BERT model needs more memory than Render's free tier, so on free plans `/sentiment` returns 503 and chat works without the emotion hint.
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
| `OVERPASS_URL` | OpenStreetMap Overpass endpoint for provider discovery |

ML service (optional, set in the shell):

| Variable | Description |
|---|---|
| `MODEL_DIR` | Fine-tuned model directory (default `models/emotion-bert`) |
| `KB_DIR` | Knowledge base directory (default `knowledge_base`) |
| `VECTOR_STORE` | `memory` (default, builds the index on startup) or `atlas` |
| `MONGO_URI`, `MONGO_DB`, `KB_COLLECTION` | Atlas connection, database (default `myhealthpal`) and collection (default `kb_chunks`) |
| `EMBEDDING_MODEL` | fastembed model (default `BAAI/bge-small-en-v1.5`) |
| `RAG_MIN_SCORE` | Minimum cosine similarity for a chunk to be returned (default 0.56, tuned with `--eval`) |
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
