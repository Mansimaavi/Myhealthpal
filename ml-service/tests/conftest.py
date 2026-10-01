import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# tests run offline: lexical hashing embedder + in-memory vector store
os.environ.setdefault("EMBEDDING_BACKEND", "hashing")
os.environ.setdefault("VECTOR_STORE", "memory")
# the hashing embedder has a different score range from bge-small, so tests use their own threshold
os.environ.setdefault("RAG_MIN_SCORE", "0.25")
