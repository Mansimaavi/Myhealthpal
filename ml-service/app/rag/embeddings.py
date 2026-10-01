"""Step 7: turn chunk text into dense vectors."""
import os

import numpy as np

DEFAULT_MODEL = "BAAI/bge-small-en-v1.5"


class FastEmbedEmbedder:
    """bge-small-en-v1.5 (384-dim) run with ONNX Runtime via fastembed - no PyTorch needed,
    so it fits in a small server. Vectors are L2-normalised, so dot product == cosine."""

    def __init__(self, model_name=None, cache_dir=None):
        from fastembed import TextEmbedding

        self.name = model_name or os.getenv("EMBEDDING_MODEL", DEFAULT_MODEL)
        self.model = TextEmbedding(
            self.name,
            cache_dir=cache_dir or os.getenv("EMBEDDING_CACHE_DIR"),
            threads=int(os.getenv("EMBEDDING_THREADS", "1")),
        )
        self.dim = len(next(iter(self.model.embed(["dimension check"]))))

    def embed_documents(self, texts):
        return np.array(list(self.model.passage_embed(texts)), dtype=np.float32)

    def embed_query(self, text):
        # bge models expect queries to carry an instruction prefix; query_embed adds it
        return np.array(next(iter(self.model.query_embed(text))), dtype=np.float32)


class HashingEmbedder:
    """Offline stand-in used in tests/CI where the model can't be downloaded.
    Lexical (not semantic), but produces normalised vectors with the same interface."""

    def __init__(self, dim=384):
        from sklearn.feature_extraction.text import HashingVectorizer

        self.name = f"hashing-{dim}"
        self.dim = dim
        self.vectorizer = HashingVectorizer(
            n_features=dim, alternate_sign=False, norm="l2", stop_words="english", ngram_range=(1, 2)
        )

    def embed_documents(self, texts):
        return self.vectorizer.transform(texts).toarray().astype(np.float32)

    def embed_query(self, text):
        return self.embed_documents([text])[0]


def get_embedder():
    if os.getenv("EMBEDDING_BACKEND", "fastembed") == "hashing":
        return HashingEmbedder()
    return FastEmbedEmbedder()
