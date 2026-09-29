import re
from pathlib import Path

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

CRISIS_TOPIC = "crisis-support"

# TF-IDF alone can rank a general depression chunk above crisis info for messages like
# "I don't want to be here anymore", so these phrases always pull in the crisis document
CRISIS_PATTERNS = [
    r"\bsuicid",
    r"\bkill (my ?self|me)\b",
    r"\bend (my|it all|my life)\b",
    r"\b(want|wanna|going) to die\b",
    r"\bdon'?t want to (live|be alive|be here|exist)",
    r"\bno reason to live\b",
    r"\bbetter off (dead|without me)\b",
    r"\bself[- ]?harm",
    r"\b(hurt|hurting|harm|harming|cut|cutting) my ?self\b",
    r"\boverdose\b",
]
_crisis_re = re.compile("|".join(CRISIS_PATTERNS), re.IGNORECASE)


def is_crisis(text):
    return bool(_crisis_re.search(text))


def load_chunks(kb_dir):
    """Split every markdown file into one chunk per '## ' section.

    Each file starts with '# Title' and an optional 'Source: ...' line.
    """
    chunks = []
    for path in sorted(Path(kb_dir).glob("*.md")):
        text = path.read_text(encoding="utf-8")
        title_match = re.search(r"^# (.+)$", text, re.MULTILINE)
        title = title_match.group(1).strip() if title_match else path.stem
        sources = re.findall(r"^Source: (.+)$", text, re.MULTILINE)

        for section in re.split(r"^## ", text, flags=re.MULTILINE)[1:]:
            heading, _, body = section.partition("\n")
            body = body.strip()
            if not body:
                continue
            chunks.append({
                "id": f"{path.stem}#{len(chunks)}",
                "topic": path.stem,
                "title": title,
                "section": heading.strip(),
                "text": body,
                "sources": sources,
            })
    return chunks


class TfidfRetriever:
    def __init__(self, kb_dir):
        self.chunks = load_chunks(kb_dir)
        if not self.chunks:
            raise ValueError(f"No knowledge base documents found in {kb_dir}")

        self.vectorizer = TfidfVectorizer(
            stop_words="english",
            ngram_range=(1, 2),
            sublinear_tf=True,
        )
        # the title and section heading are indexed with the body so that
        # e.g. "panic attack" matches the right document even if the body doesn't repeat it
        corpus = [f"{c['title']} {c['section']} {c['text']}" for c in self.chunks]
        self.matrix = self.vectorizer.fit_transform(corpus)

    def search(self, query, top_k=3, min_score=0.05):
        query_vec = self.vectorizer.transform([query])
        if query_vec.nnz == 0:
            return []

        scores = cosine_similarity(query_vec, self.matrix)[0]
        ranked = scores.argsort()[::-1][:top_k]
        return [
            {**self.chunks[i], "score": round(float(scores[i]), 4)}
            for i in ranked
            if scores[i] >= min_score
        ]

    def crisis_chunks(self):
        return [{**c, "score": 1.0} for c in self.chunks
                if c["topic"] == CRISIS_TOPIC and c["section"].startswith("Getting help")]
