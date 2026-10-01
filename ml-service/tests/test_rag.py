from pathlib import Path

import pytest

from app.rag.chunking import chunk_document, chunk_text, split_sections
from app.rag.cleaning import clean_text, extract_sources
from app.rag.dedup import dedup_exact, dedup_near
from app.rag.embeddings import HashingEmbedder
from app.rag.loaders import Document, load_documents
from app.rag.pipeline import build_records, ingest
from app.rag.retriever import Retriever
from app.rag.store import InMemoryVectorStore
from app.safety import is_crisis

KB_DIR = Path(__file__).resolve().parent.parent / "knowledge_base"


def _minimal_pdf(text):
    """A one-page PDF with a single line of text, built by hand so tests need no PDF writer."""
    stream = f"BT /F1 12 Tf 72 720 Td ({text}) Tj ET".encode()
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R "
        b"/Resources << /Font << /F1 5 0 R >> >> >>",
        b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out, offsets = b"%PDF-1.4\n", []
    for i, obj in enumerate(objects, 1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % i + obj + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objects) + 1)
    out += b"".join(b"%010d 00000 n \n" % o for o in offsets)
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objects) + 1, xref)
    return out


# ---- extraction ----

def test_loads_markdown_html_pdf_and_text(tmp_path):
    (tmp_path / "a.md").write_text("# Stress\n\n## Overview\nStress is common.")
    (tmp_path / "b.html").write_text(
        "<html><head><title>Sleep</title><style>p{}</style></head><body><nav>menu</nav>"
        "<h2>Tips</h2><p>Keep a routine.</p><script>x()</script></body></html>")
    (tmp_path / "c.pdf").write_bytes(_minimal_pdf("Grief comes in waves."))
    (tmp_path / "d.txt").write_text("Plain notes.")
    (tmp_path / "ignore.json").write_text("{}")

    docs = {d.doc_id: d for d in load_documents(tmp_path)}
    assert set(docs) == {"a", "b", "c", "d"}
    assert docs["b"].metadata["title"] == "Sleep"
    assert "## Tips" in docs["b"].text and "Keep a routine." in docs["b"].text
    assert "menu" not in docs["b"].text and "x()" not in docs["b"].text
    assert "Grief comes in waves." in docs["c"].text
    assert docs["c"].metadata["file_type"] == "pdf"


# ---- cleaning ----

def test_cleaning():
    raw = "Some **bold**, *italic* and a [link](http://x.y) &amp; more.\n\n\n\nPage 3 of 10\nhyphen-\nated  ﬁne\x07"
    assert clean_text(raw) == "Some bold, italic and a link & more.\n\nhyphenated fine"


def test_sources_become_metadata():
    text, sources = extract_sources("# T\nSource: https://a.org/x\nSource: https://b.org\nBody")
    assert sources == ["https://a.org/x", "https://b.org"]
    assert "Source:" not in text


# ---- dedup ----

def test_exact_dedup_ignores_case_whitespace_punctuation():
    kept, removed = dedup_exact(["Hello world.", "hello   WORLD", "other"], lambda s: s)
    assert kept == ["Hello world.", "other"] and len(removed) == 1


def test_near_dedup():
    base = "regular exercise and a consistent sleep schedule can reduce feelings of stress and anxiety over time"
    near = base.replace("over time", "over several weeks")
    different = "talking to a trusted friend about grief can help you process the loss"
    kept, removed = dedup_near([base, near, different], lambda s: s, threshold=0.7)
    assert kept == [base, different] and removed == [near]


# ---- chunking ----

def test_split_sections_uses_h1_as_title():
    title, sections = split_sections("# Depression\n\n## Overview\nA.\n\n## Signs\nB.")
    assert title == "Depression"
    assert sections == [("Overview", "A."), ("Signs", "B.")]


def test_chunks_respect_size_and_overlap():
    text = " ".join(f"Sentence {i} is about stress and sleep." for i in range(40))
    chunks = chunk_text(text, max_words=40, overlap_words=10)
    assert len(chunks) > 1
    assert all(len(c.split()) <= 40 for c in chunks)
    last_sentence_of_first = chunks[0].split(". ")[-1]
    assert chunks[1].startswith(last_sentence_of_first.rstrip("."))


def test_chunk_metadata_and_header():
    doc = Document("stress", "# Stress\n\n## What can help\nTake breaks.", {"source_file": "stress.md"})
    [chunk] = chunk_document(doc)
    assert chunk.chunk_id == "stress:0"
    assert chunk.text == "Stress - What can help\nTake breaks."
    assert chunk.body == "Take breaks."
    assert chunk.metadata["title"] == "Stress" and chunk.metadata["section"] == "What can help"


# ---- full pipeline + store + retrieval ----

@pytest.fixture(scope="module")
def retriever():
    store = InMemoryVectorStore()
    ingest(KB_DIR, store, HashingEmbedder())
    return Retriever(store, HashingEmbedder(), min_score=0.25)


def test_pipeline_stats_and_metadata():
    records, stats = build_records(KB_DIR, HashingEmbedder())
    assert stats["documents_loaded"] == 12
    assert stats["chunks_indexed"] == len(records) > 0
    r = records[0]
    assert len(r["embedding"]) == 384
    meta = r["metadata"]
    for key in ("title", "section", "source_urls", "topic", "content_hash", "embedding_model", "ingested_at"):
        assert key in meta
    assert all(rec["metadata"]["source_urls"] for rec in records)


def test_reingest_removes_stale_chunks(tmp_path):
    (tmp_path / "a.md").write_text("# A\n\n## One\nFirst section text.\n\n## Two\nSecond section text.")
    store, emb = InMemoryVectorStore(), HashingEmbedder()
    ingest(tmp_path, store, emb)
    assert store.count() == 2
    (tmp_path / "a.md").write_text("# A\n\n## One\nFirst section text.")
    stats = ingest(tmp_path, store, emb)
    assert store.count() == 1 and stats["stale_chunks_deleted"] == 1


def test_retrieval_returns_citations(retriever):
    results = retriever.search("panic attack racing heart can't breathe", top_k=3)
    assert results and results[0]["topic"] == "panic-attacks"
    citation = results[0]["citation"]
    assert citation["url"].startswith("https://") and " - " in citation["title"]
    scores = [r["score"] for r in results]
    assert scores == sorted(scores, reverse=True)


def test_unrelated_query_below_threshold(retriever):
    assert retriever.search("capital of France") == []


def test_crisis_chunks_contain_helpline(retriever):
    [chunk] = retriever.crisis_chunks()
    assert "14416" in chunk["text"]


# ---- crisis detection ----

@pytest.mark.parametrize("text", [
    "I don't want to be here anymore",
    "I have been thinking about suicide",
    "I want to end it all",
    "I've been hurting myself",
])
def test_crisis_detected(text):
    assert is_crisis(text)


@pytest.mark.parametrize("text", ["this exam is killing me", "I'm dying to see that movie", "I cut my finger cooking"])
def test_crisis_not_triggered_by_idioms(text):
    assert not is_crisis(text)
