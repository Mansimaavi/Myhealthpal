"""Ingestion: documents -> extraction -> cleaning -> dedup -> chunking -> metadata -> TF-IDF index."""
import logging
import os
from pathlib import Path

from .chunking import chunk_document
from .cleaning import clean_text, extract_sources
from .dedup import content_hash, dedup_exact, dedup_near
from .loaders import load_documents
from .tfidf_index import TfidfIndex, corpus_hash

logger = logging.getLogger(__name__)

CHUNK_MAX_WORDS = int(os.getenv("CHUNK_MAX_WORDS", "150"))
CHUNK_OVERLAP_WORDS = int(os.getenv("CHUNK_OVERLAP_WORDS", "30"))


def build_records(kb_dir, max_words=CHUNK_MAX_WORDS, overlap_words=CHUNK_OVERLAP_WORDS):
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

    records = [{
        "id": chunk.chunk_id,
        "text": chunk.body,
        "index_text": chunk.text,
        "metadata": {**chunk.metadata, "doc_id": chunk.doc_id, "content_hash": content_hash(chunk.body)},
    } for chunk in chunks]
    stats["chunks_indexed"] = len(records)
    return records, stats


def ingest(kb_dir, index_dir, force=False, **kwargs):
    """Builds the index and saves it, unless the saved index already matches the documents."""
    records, stats = build_records(kb_dir, **kwargs)

    if not force and Path(index_dir, "manifest.json").exists():
        try:
            existing = TfidfIndex.load(index_dir)
            if existing.manifest["corpus_hash"] == corpus_hash(records):
                logger.info("Index is up to date (%d chunks), skipping rebuild", len(existing))
                return existing, {**stats, "rebuilt": False}
        except Exception as err:
            logger.warning("Existing index unusable (%s), rebuilding", err)

    index = TfidfIndex.build(records, stats)
    index.save(index_dir)
    stats = {**stats, "rebuilt": True, "vocabulary_size": index.manifest["vocabulary_size"]}
    logger.info("Index built: %s", stats)
    return index, stats
