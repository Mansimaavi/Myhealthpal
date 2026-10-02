"""The ML service's actual logic. Both the REST endpoints (main.py) and the MCP tools
(mcp_server.py) call these functions, so there is one implementation and two ways in."""
import logging
from pathlib import Path

from .config import INDEX_DIR, KB_DIR, MODEL_DIR
from .rag.pipeline import ingest
from .rag.retriever import Retriever
from .rag.tfidf_index import TfidfIndex
from .safety import is_crisis

logger = logging.getLogger("uvicorn.error")

state = {"classifier": None, "retriever": None}

CRISIS_RESOURCES = {
    "country": "India",
    "helplines": [
        {"name": "Tele-MANAS", "phone": "14416", "alt_phone": "1-800-891-4416",
         "hours": "24/7", "cost": "free", "url": "https://telemanas.mohfw.gov.in"},
        {"name": "Emergency services", "phone": "112", "hours": "24/7"},
    ],
    "guidance": "If someone is in immediate danger, call 112 or go to the nearest hospital emergency department.",
}


def load_classifier():
    if not Path(MODEL_DIR, "config.json").exists():
        logger.warning("No fine-tuned model found at %s - emotion analysis is disabled. "
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


def startup():
    state["retriever"] = load_retriever()
    state["classifier"] = load_classifier()


class ModelNotLoaded(Exception):
    pass


def analyze_emotion(text):
    if state["classifier"] is None:
        raise ModelNotLoaded("Emotion model is not loaded")
    return state["classifier"].predict(text)


def search_knowledge_base(query, top_k=3):
    """TF-IDF retrieval; crisis messages always get the helpline chunk first."""
    retriever = state["retriever"]
    results = retriever.search(query, top_k=top_k)
    crisis = is_crisis(query)
    if crisis:
        pinned = retriever.crisis_chunks()
        pinned_ids = {c["id"] for c in pinned}
        results = (pinned + [r for r in results if r["id"] not in pinned_ids])[:top_k]
    return {"crisis": crisis, "results": results}


def check_crisis(text):
    return {"crisis": is_crisis(text)}


def health():
    retriever = state["retriever"]
    return {
        "status": "ok",
        "classifier_loaded": state["classifier"] is not None,
        "kb_chunks": len(retriever.index) if retriever else 0,
        "index_built_at": retriever.index.manifest["built_at"] if retriever else None,
        "vocabulary_size": retriever.index.manifest["vocabulary_size"] if retriever else 0,
    }
