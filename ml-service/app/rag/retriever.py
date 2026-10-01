"""Step 9-10: embed the query, search the vector store, and return chunks with citation info."""
import os

CRISIS_TOPIC = "crisis-support"


def _to_result(record, score):
    meta = record.get("metadata", {})
    sources = meta.get("source_urls") or []
    return {
        "id": record["_id"],
        "text": record["text"],
        "score": round(score, 4),
        "topic": meta.get("topic"),
        "title": meta.get("title"),
        "section": meta.get("section"),
        "sources": sources,
        "citation": {
            "title": f"{meta.get('title')} - {meta.get('section')}",
            "url": sources[0] if sources else None,
            "source_file": meta.get("source_file"),
        },
    }


class Retriever:
    def __init__(self, store, embedder, min_score=None):
        self.store = store
        self.embedder = embedder
        self.min_score = float(os.getenv("RAG_MIN_SCORE", "0.6")) if min_score is None else min_score

    def search(self, query, top_k=3):
        vector = self.embedder.embed_query(query)
        hits = self.store.search(vector, top_k=top_k)
        return [_to_result(rec, score) for rec, score in hits if score >= self.min_score]

    def crisis_chunks(self):
        records = self.store.find({"topic": CRISIS_TOPIC})
        return [_to_result(r, 1.0) for r in records if str(r["metadata"].get("section", "")).startswith("Getting help")]
