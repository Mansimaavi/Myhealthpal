import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field, field_validator

from .config import INDEX_DIR, KB_DIR, MODEL_DIR
from .rag.pipeline import ingest
from .rag.retriever import Retriever
from .rag.tfidf_index import TfidfIndex
from .safety import is_crisis

logger = logging.getLogger("uvicorn.error")

state = {"classifier": None, "retriever": None}


def load_classifier():
    if not Path(MODEL_DIR, "config.json").exists():
        logger.warning("No fine-tuned model found at %s - /sentiment will return 503. "
                       "Run training/train_bert.py first.", MODEL_DIR)
        return None
    # imported here so the service still starts on machines without torch
    from .classifier import EmotionClassifier
    logger.info("Loading BERT model from %s", MODEL_DIR)
    return EmotionClassifier(MODEL_DIR)


def load_retriever():
    try:
        index = TfidfIndex.load(INDEX_DIR)
        logger.info("Loaded TF-IDF index: %d chunks, built %s", len(index), index.manifest["built_at"])
    except FileNotFoundError:
        # first run / local dev: build it now (normally done by `python -m app.rag.ingest`)
        logger.info("No index at %s, building it", INDEX_DIR)
        index, _ = ingest(KB_DIR, INDEX_DIR)
    return Retriever(index)


@asynccontextmanager
async def lifespan(app):
    state["retriever"] = load_retriever()
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
    retriever = state["retriever"]
    return {
        "status": "ok",
        "classifier_loaded": state["classifier"] is not None,
        "kb_chunks": len(retriever.index) if retriever else 0,
        "index_built_at": retriever.index.manifest["built_at"] if retriever else None,
        "vocabulary_size": retriever.index.manifest["vocabulary_size"] if retriever else 0,
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
    try:
        results = retriever.search(body.query, top_k=body.top_k)
        crisis = is_crisis(body.query)
        if crisis:
            pinned = retriever.crisis_chunks()
            pinned_ids = {c["id"] for c in pinned}
            results = (pinned + [r for r in results if r["id"] not in pinned_ids])[:body.top_k]
    except Exception:
        logger.exception("Retrieval failed")
        raise HTTPException(status_code=503, detail="Retrieval is temporarily unavailable")

    return {"crisis": crisis, "results": results}
