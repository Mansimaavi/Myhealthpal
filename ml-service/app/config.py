import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
MODEL_DIR = os.getenv("MODEL_DIR", str(BASE_DIR / "models" / "emotion-bert"))
KB_DIR = os.getenv("KB_DIR", str(BASE_DIR / "knowledge_base"))
VECTOR_STORE = os.getenv("VECTOR_STORE", "memory")

os.environ.setdefault("EMBEDDING_CACHE_DIR", str(BASE_DIR / ".cache" / "fastembed"))


def make_store():
    if VECTOR_STORE == "atlas":
        from .rag.store import AtlasVectorStore

        uri = os.getenv("MONGO_URI")
        if not uri:
            raise RuntimeError("VECTOR_STORE=atlas needs MONGO_URI")
        return AtlasVectorStore(
            uri,
            db_name=os.getenv("MONGO_DB", "myhealthpal"),
            collection=os.getenv("KB_COLLECTION", "kb_chunks"),
        )
    from .rag.store import InMemoryVectorStore

    return InMemoryVectorStore()
