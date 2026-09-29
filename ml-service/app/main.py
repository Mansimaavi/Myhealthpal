import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field, field_validator

from .rag import TfidfRetriever, is_crisis

logger = logging.getLogger("uvicorn.error")

BASE_DIR = Path(__file__).resolve().parent.parent
MODEL_DIR = os.getenv("MODEL_DIR", str(BASE_DIR / "models" / "emotion-bert"))
KB_DIR = os.getenv("KB_DIR", str(BASE_DIR / "knowledge_base"))
RAG_MIN_SCORE = float(os.getenv("RAG_MIN_SCORE", "0.05"))

state = {"classifier": None, "retriever": None}


def load_classifier():
    if not Path(MODEL_DIR, "config.json").exists():
        logger.warning("No fine-tuned model found at %s - /sentiment will return 503. "
                       "Run training/train_bert.py first.", MODEL_DIR)
        return None
    # imported here so the RAG endpoint still works on machines without torch installed properly
    from .classifier import EmotionClassifier
    logger.info("Loading BERT model from %s", MODEL_DIR)
    return EmotionClassifier(MODEL_DIR)


@asynccontextmanager
async def lifespan(app):
    state["retriever"] = TfidfRetriever(KB_DIR)
    logger.info("Indexed %d knowledge base chunks", len(state["retriever"].chunks))
    state["classifier"] = load_classifier()
    yield


app = FastAPI(title="MyHealthPal ML service", lifespan=lifespan)


class TextIn(BaseModel):
    text: str = Field(..., max_length=5000)

    @field_validator("text")
    @classmethod
    def not_blank(cls, v):
        if not v.strip():
            raise ValueError("text must not be empty")
        return v.strip()


class RetrieveIn(BaseModel):
    query: str = Field(..., max_length=5000)
    top_k: int = Field(3, ge=1, le=10)

    @field_validator("query")
    @classmethod
    def not_blank(cls, v):
        if not v.strip():
            raise ValueError("query must not be empty")
        return v.strip()


@app.get("/health")
def health():
    return {
        "status": "ok",
        "classifier_loaded": state["classifier"] is not None,
        "kb_chunks": len(state["retriever"].chunks) if state["retriever"] else 0,
    }


@app.post("/sentiment")
def sentiment(body: TextIn):
    classifier = state["classifier"]
    if classifier is None:
        raise HTTPException(status_code=503, detail="Emotion model is not loaded")
    return classifier.predict(body.text)


@app.post("/retrieve")
def retrieve(body: RetrieveIn):
    retriever = state["retriever"]
    results = retriever.search(body.query, top_k=body.top_k, min_score=RAG_MIN_SCORE)

    crisis = is_crisis(body.query)
    if crisis:
        pinned = retriever.crisis_chunks()
        pinned_ids = {c["id"] for c in pinned}
        results = (pinned + [r for r in results if r["id"] not in pinned_ids])[:body.top_k]

    return {"crisis": crisis, "results": results}
