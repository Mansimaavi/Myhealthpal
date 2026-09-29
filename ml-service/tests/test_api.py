import os

import pytest
from fastapi.testclient import TestClient

from app import main


@pytest.fixture(scope="module")
def client():
    with TestClient(main.app) as c:
        yield c


def test_health(client):
    body = client.get("/health").json()
    assert body["status"] == "ok"
    assert body["kb_chunks"] > 0


def test_retrieve(client):
    res = client.post("/retrieve", json={"query": "I feel anxious and can't stop worrying", "top_k": 2})
    assert res.status_code == 200
    body = res.json()
    assert body["crisis"] is False
    assert 1 <= len(body["results"]) <= 2
    assert {"title", "section", "text", "score", "sources"} <= set(body["results"][0])


def test_retrieve_crisis_pins_helpline(client):
    body = client.post("/retrieve", json={"query": "I don't want to be here anymore"}).json()
    assert body["crisis"] is True
    assert "14416" in body["results"][0]["text"]


@pytest.mark.parametrize("payload", [{}, {"query": "   "}, {"query": "x" * 5001}, {"query": "hi", "top_k": 50}])
def test_retrieve_validation(client, payload):
    assert client.post("/retrieve", json=payload).status_code == 422


def test_sentiment_validation(client):
    assert client.post("/sentiment", json={"text": ""}).status_code == 422


@pytest.mark.skipif(os.path.exists(os.path.join(main.MODEL_DIR, "config.json")), reason="model is present")
def test_sentiment_without_model_returns_503(client):
    assert client.post("/sentiment", json={"text": "I feel great"}).status_code == 503


@pytest.mark.skipif(not os.path.exists(os.path.join(main.MODEL_DIR, "config.json")), reason="no trained model")
def test_sentiment_with_model(client):
    body = client.post("/sentiment", json={"text": "I am so happy today"}).json()
    assert body["label"] in body["scores"]
    assert body["sentiment"] in {"positive", "negative", "neutral", "ambiguous"}
    assert abs(sum(body["scores"].values()) - 1) < 0.01
