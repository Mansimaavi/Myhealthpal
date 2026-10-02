"""Steps 7-8: TF-IDF vectorization and a persistent on-disk index.

Saved layout (INDEX_DIR):
    vectorizer.joblib   fitted TfidfVectorizer (vocabulary + IDF weights)
    matrix.npz          sparse chunk x term TF-IDF matrix (rows are L2-normalised)
    chunks.json         chunk text + metadata, row i <-> matrix row i
    manifest.json       build time, parameters, corpus hash, library versions, stats
"""
import json
import logging
import re
import shutil
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import sklearn
import snowballstemmer
from scipy import sparse
from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS, TfidfVectorizer

from .dedup import content_hash

logger = logging.getLogger(__name__)

INDEX_VERSION = 2

# sklearn's list drops words that matter a lot in this domain ("I feel empty and alone",
# "I can't sleep", "nobody cares"), so those are kept as terms
KEEP_WORDS = {
    "alone", "empty", "cry", "nobody", "none", "nothing", "never", "no", "not", "cannot",
    "down", "off", "without", "together", "afraid", "serious", "against",
}
STOP_WORDS = frozenset(ENGLISH_STOP_WORDS - KEEP_WORDS)

_stemmer = snowballstemmer.stemmer("english")
_TOKEN = re.compile(r"[a-z]+")
_CONTRACTIONS = [
    (re.compile(r"\bcan't\b"), "cannot"),
    (re.compile(r"\bwon't\b"), "will not"),
    (re.compile(r"n't\b"), " not"),
    (re.compile(r"'(m|re|ve|ll|d|s)\b"), ""),
]


# Snowball only strips suffixes, so related forms people use for feelings end up as different
# terms ("anxious" -> anxious, "anxiety" -> anxieti). Map them to one form before stemming.
WORD_FORMS = {
    "anxious": "anxiety", "anxiousness": "anxiety",
    "depressed": "depression", "depressing": "depression", "depressive": "depression",
    "lonely": "loneliness", "lonesome": "loneliness",
    "angry": "anger", "angrily": "anger", "angered": "anger",
    "grieving": "grief", "grieve": "grief", "grieved": "grief",
    "traumatic": "trauma", "traumatised": "trauma", "traumatized": "trauma",
    "panicky": "panic", "panicking": "panic", "panicked": "panic",
    "stressed": "stress", "stressful": "stress",
    "suicidal": "suicide",
    "scared": "fear", "afraid": "fear", "fearful": "fear", "frightened": "fear",
    "sleepless": "insomnia",
    "exhaustion": "exhausted",
}


def tokenize(text):
    """Lowercase, expand contractions, drop stop words, unify word forms, Snowball-stem."""
    text = text.lower().replace("\u2019", "'")
    for pattern, repl in _CONTRACTIONS:
        text = pattern.sub(repl, text)
    words = [w for w in _TOKEN.findall(text) if len(w) > 1 and w not in STOP_WORDS]
    return _stemmer.stemWords([WORD_FORMS.get(w, w) for w in words])


VECTORIZER_PARAMS = {
    "ngram_range": (1, 2),    # unigrams + bigrams ("panic attack", "can't sleep")
    "sublinear_tf": True,     # 1 + log(tf), so repeating a word doesn't dominate
    "min_df": 1,              # small corpus: keep every term
    "max_df": 0.9,            # ignore terms that appear in almost every chunk
    "norm": "l2",             # unit vectors, so cosine similarity == dot product
}


def vectorizer_params(num_chunks):
    params = dict(VECTORIZER_PARAMS)
    if num_chunks < 10:
        # with only a handful of chunks "90% of documents" can be less than one document
        params["max_df"] = 1.0
    return params


def make_vectorizer(num_chunks):
    return TfidfVectorizer(tokenizer=tokenize, lowercase=False, token_pattern=None, **vectorizer_params(num_chunks))


def corpus_hash(records):
    return content_hash("|".join(f"{r['id']}:{r['metadata']['content_hash']}" for r in records))


class TfidfIndex:
    def __init__(self, vectorizer, matrix, chunks, manifest):
        self.vectorizer = vectorizer
        self.matrix = matrix
        self.chunks = chunks
        self.manifest = manifest

    @classmethod
    def build(cls, records, stats=None):
        if not records:
            raise ValueError("No chunks to index")
        vectorizer = make_vectorizer(len(records))
        # the "Title - Section" header is indexed with the body so short chunks still
        # match queries about their topic
        matrix = vectorizer.fit_transform([r["index_text"] for r in records]).tocsr()
        chunks = [{k: v for k, v in r.items() if k != "index_text"} for r in records]
        manifest = {
            "index_version": INDEX_VERSION,
            "built_at": datetime.now(timezone.utc).isoformat(),
            "corpus_hash": corpus_hash(records),
            "num_chunks": matrix.shape[0],
            "vocabulary_size": matrix.shape[1],
            "vectorizer_params": {k: list(v) if isinstance(v, tuple) else v
                                  for k, v in vectorizer_params(len(records)).items()},
            "sklearn_version": sklearn.__version__,
            "ingestion_stats": stats or {},
        }
        return cls(vectorizer, matrix, chunks, manifest)

    def save(self, index_dir):
        """Writes to a temp folder and swaps it in, so a crash mid-save never leaves a broken index."""
        index_dir = Path(index_dir)
        index_dir.parent.mkdir(parents=True, exist_ok=True)
        tmp = Path(tempfile.mkdtemp(prefix=".index-", dir=index_dir.parent))
        try:
            joblib.dump(self.vectorizer, tmp / "vectorizer.joblib")
            sparse.save_npz(tmp / "matrix.npz", self.matrix)
            (tmp / "chunks.json").write_text(json.dumps(self.chunks, ensure_ascii=False, indent=1))
            (tmp / "manifest.json").write_text(json.dumps(self.manifest, indent=2))
            old = index_dir.with_name(index_dir.name + ".old")
            if index_dir.exists():
                index_dir.rename(old)
            tmp.rename(index_dir)
            shutil.rmtree(old, ignore_errors=True)
        except Exception:
            shutil.rmtree(tmp, ignore_errors=True)
            raise

    @classmethod
    def load(cls, index_dir):
        index_dir = Path(index_dir)
        manifest = json.loads((index_dir / "manifest.json").read_text())
        if manifest.get("index_version") != INDEX_VERSION:
            raise ValueError(f"Index version {manifest.get('index_version')} != {INDEX_VERSION}, rebuild it")
        if manifest.get("sklearn_version") != sklearn.__version__:
            logger.warning("Index was built with scikit-learn %s, running %s",
                           manifest.get("sklearn_version"), sklearn.__version__)
        vectorizer = joblib.load(index_dir / "vectorizer.joblib")
        matrix = sparse.load_npz(index_dir / "matrix.npz").tocsr()
        chunks = json.loads((index_dir / "chunks.json").read_text())
        if matrix.shape[0] != len(chunks):
            raise ValueError("Index is inconsistent: matrix rows != chunks")
        return cls(vectorizer, matrix, chunks, manifest)

    def search(self, query, top_k=3):
        """Returns [(chunk, cosine score)] for the top_k rows, best first."""
        query_vec = self.vectorizer.transform([query])
        if query_vec.nnz == 0:          # no known terms in the query
            return []
        # rows and query are L2-normalised, so this sparse dot product is the cosine similarity
        scores = (self.matrix @ query_vec.T).toarray().ravel()
        top = np.argsort(-scores)[:top_k]
        return [(self.chunks[i], float(scores[i])) for i in top if scores[i] > 0]

    def find(self, metadata_filter):
        return [c for c in self.chunks
                if all(c["metadata"].get(k) == v for k, v in metadata_filter.items())]

    def __len__(self):
        return len(self.chunks)
