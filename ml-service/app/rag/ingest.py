"""Build/refresh the vector index from knowledge_base/.

    python -m app.rag.ingest            # ingest into the configured store
    python -m app.rag.ingest --eval     # ...and print retrieval results for sample queries
"""
import argparse
import logging
import sys

from ..config import KB_DIR, make_store
from .embeddings import get_embedder
from .pipeline import ingest
from .retriever import Retriever

EVAL_QUERIES = [
    ("I can't stop worrying about everything, my mind never switches off", "anxiety"),
    ("my heart was racing and I felt like I couldn't breathe", "panic-attacks"),
    ("I feel empty and hopeless, nothing I used to enjoy feels good", "depression"),
    ("exams are next week and I'm overwhelmed with pressure from my parents", "stress"),
    ("I lie awake for hours every night and wake up exhausted", "sleep-problems"),
    ("my grandmother passed away last month and I keep crying", "grief"),
    ("I moved to a new city and have no one to talk to", "loneliness"),
    ("I snap at everyone over small things lately", "anger"),
    ("I keep having nightmares and flashbacks about the accident", "trauma-ptsd"),
    ("I'm terrified of speaking in class, everyone will judge me", "social-anxiety"),
    ("work has drained me completely, I dread every morning", "burnout"),
    ("everyone would be better off without me", "crisis-support"),
    ("my knee hurts when I climb stairs", None),
    ("what is the capital of France", None),
]


def evaluate(retriever):
    hits = 0
    for query, expected in EVAL_QUERIES:
        raw = retriever.store.search(retriever.embedder.embed_query(query), top_k=3)
        top = [(r["metadata"]["topic"], round(s, 3)) for r, s in raw]
        kept = [t for t, s in top if s >= retriever.min_score]
        ok = (kept[:1] == [expected]) if expected else not kept
        hits += ok
        print(f"{'OK ' if ok else 'XX '} expected={expected!s:15} top3={top}")
    print(f"eval: {hits}/{len(EVAL_QUERIES)} correct at min_score={retriever.min_score}")
    return hits


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--eval", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    embedder = get_embedder()
    store = make_store()
    print(f"store={store.kind} embedder={embedder.name} dim={embedder.dim}")

    stats = ingest(KB_DIR, store, embedder)
    for k, v in stats.items():
        print(f"  {k}: {v}")

    if args.eval:
        evaluate(Retriever(store, embedder))
    if not stats.get("index_ready"):
        sys.exit("vector index did not become ready")


if __name__ == "__main__":
    main()
