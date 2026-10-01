"""Step 4: drop exact and near-duplicate documents/chunks before they reach the index."""
import hashlib
import re


def normalise_for_hash(text):
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", "", text.lower())).strip()


def content_hash(text):
    return hashlib.sha256(normalise_for_hash(text).encode("utf-8")).hexdigest()


def dedup_exact(items, get_text):
    """Keeps the first item for each distinct (normalised) text."""
    seen, kept, removed = set(), [], []
    for item in items:
        h = content_hash(get_text(item))
        if h in seen:
            removed.append(item)
        else:
            seen.add(h)
            kept.append(item)
    return kept, removed


def shingles(text, k=5):
    words = normalise_for_hash(text).split()
    if len(words) < k:
        return {" ".join(words)} if words else set()
    return {" ".join(words[i:i + k]) for i in range(len(words) - k + 1)}


def jaccard(a, b):
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def dedup_near(items, get_text, threshold=0.8):
    """Removes items whose 5-word shingles overlap an earlier item by >= threshold (Jaccard).

    Pairwise comparison is fine for a knowledge base of a few hundred chunks; a large
    corpus would use MinHash + LSH to avoid comparing every pair.
    """
    kept, kept_shingles, removed = [], [], []
    for item in items:
        s = shingles(get_text(item))
        if any(jaccard(s, other) >= threshold for other in kept_shingles):
            removed.append(item)
        else:
            kept.append(item)
            kept_shingles.append(s)
    return kept, removed
