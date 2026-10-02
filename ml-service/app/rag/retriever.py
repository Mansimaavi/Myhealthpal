"""Step 9-10: score chunks against the query with cosine similarity and attach citation info."""
import os

CRISIS_TOPIC = "crisis-support"


def _to_result(chunk, score):
    meta = chunk.get("metadata", {})
    sources = meta.get("source_urls") or []
    return {
        "id": chunk["id"],
        "text": chunk["text"],
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
    def __init__(self, index, min_score=None):
        self.index = index
        self.min_score = float(os.getenv("RAG_MIN_SCORE", "0.12")) if min_score is None else min_score

    def search(self, query, top_k=3):
        return [_to_result(c, s) for c, s in self.index.search(query, top_k) if s >= self.min_score]

    def crisis_chunks(self):
        return [_to_result(c, 1.0) for c in self.index.find({"topic": CRISIS_TOPIC})
                if str(c["metadata"].get("section", "")).startswith("Getting help")]
