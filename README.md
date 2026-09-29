# MyHealthPal

MyHealthPal is a health assistant app. It supports symptom-check ("diagnosis") chat sessions, a supportive therapy-style chat, sentiment detection on user messages, and a lookup for nearby healthcare providers.

> Status: the Express/MongoDB backend is in this repo. The FastAPI ML service (BERT sentiment + RAG) and the React frontend are in progress.

## Architecture

```
React frontend  ──►  Express API (Node.js)  ──►  MongoDB
                          │
                          ├──►  OpenRouter (via LangChain)   chat replies
                          └──►  FastAPI ML service           sentiment (BERT)
```

- **Express API**: handles auth (JWT), users, sessions, messages, diagnoses, and healthcare places.
- **Chat**: `services/gpt.service.js` uses LangChain's `ChatOpenAI` pointed at OpenRouter's OpenAI-compatible endpoint. Each session starts with system prompts. Only the most recent messages are sent to the model, up to `MAX_HISTORY_MESSAGES` messages and `MAX_HISTORY_CHARS` characters.
- **Sentiment**: therapy messages are sent to the ML service at `POST {ML_SERVICE_URL}/sentiment`, which returns `{ "label": "...", "score": 0.0 }`. The label is stored on the message and passed to the LLM as a hint. If the ML service is down, the chat still works without the hint.
- **Healthcare places**: stored with a GeoJSON `location` and a `2dsphere` index. The `/nearby` route uses `$geoNear`.

## Tech stack

Node.js, Express 5, MongoDB/Mongoose, LangChain (`@langchain/openai`), OpenRouter, JWT, bcrypt, axios.

## Project structure

```
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

Requirements: Node.js 22+ and MongoDB (local or Atlas).

```bash
cd backend
npm install
cp .env.example .env    # then fill in the values
npm run dev             # or: npm start
```

The API runs on `http://localhost:5000`.

If you already have healthcare places in the database from before the `location` field existed, run this once:

```bash
npm run backfill:locations
```

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
| POST | `/sentiment` 🔒 | `{ text }` → `{ sentiment, score }` |
| GET/POST | `/diagnoses` 🔒 | scoped to your sessions |
| GET | `/healthcare-places` | all places |
| GET | `/healthcare-places/nearby?latitude=&longitude=&maxDistance=&limit=` | `maxDistance` in km (default 10, max 100) |
| POST / DELETE | `/healthcare-places` 🔒 | |
