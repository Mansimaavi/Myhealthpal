"""Ingestion: documents -> extraction -> cleaning -> dedup -> chunking -> metadata -> embeddings -> store."""
import logging
import os
from datetime import datetime, timezone

from .chunking import chunk_document
from .cleaning import clean_text, extract_sources
from .dedup import content_hash, dedup_exact, dedup_near
from .loaders import load_documents

logger = logging.getLogger(__name__)

CHUNK_MAX_WORDS = int(os.getenv("CHUNK_MAX_WORDS", "150"))
CHUNK_OVERLAP_WORDS = int(os.getenv("CHUNK_OVERLAP_WORDS", "30"))


def build_records(kb_dir, embedder, max_words=CHUNK_MAX_WORDS, overlap_words=CHUNK_OVERLAP_WORDS):
    stats = {}

    documents = load_documents(kb_dir)
    stats["documents_loaded"] = len(documents)

    for doc in documents:
        text, sources = extract_sources(doc.text)
        doc.text = clean_text(text)
        doc.metadata["source_urls"] = sources
        doc.metadata["topic"] = doc.doc_id.split("/")[-1]
    documents = [d for d in documents if d.text]

    documents, dup_docs = dedup_exact(documents, lambda d: d.text)
    stats["duplicate_documents_removed"] = len(dup_docs)

    chunks = [c for doc in documents for c in chunk_document(doc, max_words, overlap_words)]
    stats["chunks_created"] = len(chunks)

    chunks, exact = dedup_exact(chunks, lambda c: c.body)
    chunks, near = dedup_near(chunks, lambda c: c.body)
    stats["duplicate_chunks_removed"] = len(exact) + len(near)

    vectors = embedder.embed_documents([c.text for c in chunks]) if chunks else []
    now = datetime.now(timezone.utc).isoformat()

    records = []
    for chunk, vector in zip(chunks, vectors):
        records.append({
            "_id": chunk.chunk_id,
            "text": chunk.body,
            "embedding": [float(x) for x in vector],
            "metadata": {
                **chunk.metadata,
                "doc_id": chunk.doc_id,
                "content_hash": content_hash(chunk.body),
                "embedding_model": embedder.name,
                "embedding_dim": embedder.dim,
                "ingested_at": now,
            },
        })
    stats["chunks_indexed"] = len(records)
    return records, stats


def ingest(kb_dir, store, embedder, **kwargs):
    records, stats = build_records(kb_dir, embedder, **kwargs)
    store.upsert(records)
    stats["stale_chunks_deleted"] = store.delete_missing([r["_id"] for r in records])
    stats["index_ready"] = store.ensure_index(embedder.dim) is not False
    logger.info("Ingestion finished: %s", stats)
    return stats
