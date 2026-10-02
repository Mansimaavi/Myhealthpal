from pathlib import Path

import pytest

from app.rag.chunking import chunk_document, chunk_text, split_sections
from app.rag.cleaning import clean_text, extract_sources
from app.rag.dedup import dedup_exact, dedup_near
from app.rag.loaders import Document, load_documents
from app.rag.pipeline import build_records, ingest
from app.rag.retriever import Retriever
from app.rag.tfidf_index import TfidfIndex, tokenize
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


# ---- tokenizer ----

def test_tokenizer_keeps_domain_words_and_stems():
    tokens = tokenize("I can't sleep, I feel EMPTY and alone. I'm lying awake worrying")
    assert tokens == ["cannot", "sleep", "feel", "empti", "alon", "lie", "awak", "worri"]


def test_word_forms_map_to_the_same_term():
    assert tokenize("anxious") == tokenize("anxiety")
    assert tokenize("depressed") == tokenize("depression")
    assert tokenize("lonely") == tokenize("loneliness")


def test_old_index_version_is_rejected(tmp_path):
    import json
    index, _ = ingest(KB_DIR, tmp_path / "index")
    manifest = json.loads((tmp_path / "index" / "manifest.json").read_text())
    manifest["index_version"] = 0
    (tmp_path / "index" / "manifest.json").write_text(json.dumps(manifest))
    with pytest.raises(ValueError):
        TfidfIndex.load(tmp_path / "index")
    _, stats = ingest(KB_DIR, tmp_path / "index")      # ingest rebuilds instead of crashing
    assert stats["rebuilt"] is True


# ---- full pipeline, persistent index, retrieval ----

@pytest.fixture(scope="module")
def index(tmp_path_factory):
    index, _ = ingest(KB_DIR, tmp_path_factory.mktemp("idx") / "index")
    return index


@pytest.fixture(scope="module")
def retriever(index):
    return Retriever(index, min_score=0.12)


def test_pipeline_stats_and_metadata():
    records, stats = build_records(KB_DIR)
    assert stats["documents_loaded"] == 12
    assert stats["chunks_indexed"] == len(records) > 0
    meta = records[0]["metadata"]
    for key in ("title", "section", "source_urls", "topic", "content_hash", "source_file", "chunk_index"):
        assert key in meta
    assert all(r["metadata"]["source_urls"] for r in records)
    assert records[0]["index_text"].startswith(meta["title"] + " - ")


def test_index_persists_and_reloads(tmp_path):
    index, stats = ingest(KB_DIR, tmp_path / "index")
    assert stats["rebuilt"] is True
    assert sorted(p.name for p in (tmp_path / "index").iterdir()) == \
        ["chunks.json", "manifest.json", "matrix.npz", "vectorizer.joblib"]

    loaded = TfidfIndex.load(tmp_path / "index")
    assert len(loaded) == len(index)
    assert loaded.manifest["vocabulary_size"] == index.manifest["vocabulary_size"]
    query = "I can't stop worrying"
    assert [c["id"] for c, _ in loaded.search(query)] == [c["id"] for c, _ in index.search(query)]


def test_reingest_skips_when_unchanged_and_rebuilds_on_change(tmp_path):
    kb = tmp_path / "kb"
    kb.mkdir()
    (kb / "a.md").write_text("# A\n\n## One\nFirst section about sleep.\n\n## Two\nSecond section about stress.")
    _, first = ingest(kb, tmp_path / "index")
    _, second = ingest(kb, tmp_path / "index")
    assert first["rebuilt"] is True and second["rebuilt"] is False

    (kb / "a.md").write_text("# A\n\n## One\nFirst section about sleep.")
    index, third = ingest(kb, tmp_path / "index")
    assert third["rebuilt"] is True and len(index) == 1


def test_failed_save_keeps_previous_index(tmp_path, monkeypatch):
    kb = tmp_path / "kb"
    kb.mkdir()
    (kb / "a.md").write_text("# A\n\n## One\nAbout sleep.")
    ingest(kb, tmp_path / "index")
    (kb / "a.md").write_text("# A\n\n## One\nAbout sleep.\n\n## Two\nAbout stress.")

    import app.rag.tfidf_index as ti
    monkeypatch.setattr(ti.sparse, "save_npz", lambda *a, **k: (_ for _ in ()).throw(OSError("disk full")))
    with pytest.raises(OSError):
        ingest(kb, tmp_path / "index")
    assert len(TfidfIndex.load(tmp_path / "index")) == 1   # old index still intact


def test_scores_are_cosine_similarity(index):
    import numpy as np
    query = "panic attack racing heart"
    chunk, score = index.search(query, top_k=1)[0]
    row = index.chunks.index(chunk)
    q = index.vectorizer.transform([query]).toarray()[0]
    d = index.matrix[row].toarray()[0]
    assert score == pytest.approx(float(q @ d / (np.linalg.norm(q) * np.linalg.norm(d))))


def test_retrieval_returns_citations(retriever):
    results = retriever.search("my heart was racing and I couldn't breathe, I thought I was dying", top_k=3)
    assert results and results[0]["topic"] == "panic-attacks"
    citation = results[0]["citation"]
    assert citation["url"].startswith("https://") and " - " in citation["title"]
    scores = [r["score"] for r in results]
    assert scores == sorted(scores, reverse=True)


@pytest.mark.parametrize("query", ["what is the capital of France", "how do I reset my wifi router"])
def test_unrelated_query_returns_nothing(retriever, query):
    assert retriever.search(query) == []


def test_crisis_chunks_contain_helpline(retriever):
    [chunk] = retriever.crisis_chunks()
    assert "14416" in chunk["text"]


# ---- crisis detection ----

@pytest.mark.parametrize("text", [
    "I don't want to be here anymore",
    "I have been thinking about suicide",
    "I want to end it all",
    "I've been hurting myself",
    "I don't see any point in living anymore",
    "life is not worth living",
    "I can't go on like this",
])
def test_crisis_detected(text):
    assert is_crisis(text)


@pytest.mark.parametrize("text", [
    "this exam is killing me", "I'm dying to see that movie", "I cut my finger cooking",
    "no point in studying tonight", "killing time before class", "the point of living abroad is to learn",
])
def test_crisis_not_triggered_by_idioms(text):
    assert not is_crisis(text)
