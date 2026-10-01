"""Step 8: vector storage. MongoDB Atlas Vector Search in production, in-memory for local dev/tests."""
import logging
import time

import numpy as np

logger = logging.getLogger(__name__)


class InMemoryVectorStore:
    """Exact cosine search with numpy. Fine for a few thousand chunks."""

    kind = "memory"

    def __init__(self):
        self.records = {}
        self._ids, self._matrix = [], None

    def _rebuild(self):
        self._ids = list(self.records)
        self._matrix = (np.array([self.records[i]["embedding"] for i in self._ids], dtype=np.float32)
                        if self._ids else None)

    def upsert(self, records):
        for r in records:
            self.records[r["_id"]] = r
        self._rebuild()

    def delete_missing(self, keep_ids):
        stale = set(self.records) - set(keep_ids)
        for i in stale:
            del self.records[i]
        self._rebuild()
        return len(stale)

    def count(self):
        return len(self.records)

    def find(self, metadata_filter):
        return [r for r in self.records.values()
                if all(r["metadata"].get(k) == v for k, v in metadata_filter.items())]

    def search(self, query_vector, top_k=3):
        if self._matrix is None:
            return []
        scores = self._matrix @ np.asarray(query_vector, dtype=np.float32)
        order = np.argsort(-scores)[:top_k]
        return [(self.records[self._ids[i]], float(scores[i])) for i in order]

    def ensure_index(self, dim):
        pass


class AtlasVectorStore:
    """Chunks stored as MongoDB documents; a vectorSearch index on `embedding` serves $vectorSearch."""

    kind = "atlas"

    def __init__(self, uri, db_name="myhealthpal", collection="kb_chunks", index_name="kb_vector_index"):
        from pymongo import MongoClient

        self.client = MongoClient(uri, serverSelectionTimeoutMS=10000, appname="myhealthpal-ml")
        self.collection = self.client[db_name][collection]
        self.index_name = index_name

    def upsert(self, records):
        from pymongo import ReplaceOne

        if records:
            self.collection.bulk_write([ReplaceOne({"_id": r["_id"]}, r, upsert=True) for r in records])

    def delete_missing(self, keep_ids):
        return self.collection.delete_many({"_id": {"$nin": list(keep_ids)}}).deleted_count

    def count(self):
        return self.collection.count_documents({})

    def find(self, metadata_filter):
        query = {f"metadata.{k}": v for k, v in metadata_filter.items()}
        return list(self.collection.find(query, {"embedding": 0}))

    def ensure_index(self, dim, wait_seconds=120):
        from pymongo.operations import SearchIndexModel

        definition = {"fields": [
            {"type": "vector", "path": "embedding", "numDimensions": dim, "similarity": "cosine"},
            {"type": "filter", "path": "metadata.topic"},
        ]}
        existing = {i["name"]: i for i in self.collection.list_search_indexes()}
        if self.index_name not in existing:
            logger.info("Creating vector search index %s", self.index_name)
            self.collection.create_search_index(
                SearchIndexModel(definition=definition, name=self.index_name, type="vectorSearch"))
        elif existing[self.index_name].get("latestDefinition") != definition:
            logger.info("Updating vector search index %s", self.index_name)
            self.collection.update_search_index(self.index_name, definition)

        deadline = time.time() + wait_seconds
        while time.time() < deadline:
            info = next(iter(self.collection.list_search_indexes(self.index_name)), {})
            if info.get("queryable") and info.get("status") == "READY":
                return True
            time.sleep(3)
        logger.warning("Vector search index %s is not ready yet", self.index_name)
        return False

    def search(self, query_vector, top_k=3):
        pipeline = [
            {"$vectorSearch": {
                "index": self.index_name,
                "path": "embedding",
                "queryVector": [float(x) for x in query_vector],
                "numCandidates": max(50, top_k * 20),
                "limit": top_k,
            }},
            {"$project": {"embedding": 0, "score": {"$meta": "vectorSearchScore"}}},
        ]
        results = []
        for doc in self.collection.aggregate(pipeline):
            # Atlas reports cosine as (1 + cos) / 2; convert back so both stores use the same scale
            results.append((doc, 2 * doc.pop("score") - 1))
        return results
