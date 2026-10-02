import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
MODEL_DIR = os.getenv("MODEL_DIR", str(BASE_DIR / "models" / "emotion-bert"))
KB_DIR = os.getenv("KB_DIR", str(BASE_DIR / "knowledge_base"))
INDEX_DIR = os.getenv("INDEX_DIR", str(BASE_DIR / "index"))
