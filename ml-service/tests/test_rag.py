from pathlib import Path

import pytest

from app.rag import TfidfRetriever, is_crisis

KB_DIR = Path(__file__).resolve().parent.parent / "knowledge_base"


@pytest.fixture(scope="module")
def retriever():
    return TfidfRetriever(KB_DIR)


@pytest.mark.parametrize("query, topic", [
    ("I can't stop worrying about everything, my mind never switches off", "anxiety"),
    ("my heart was racing and I felt like I couldn't breathe", "panic-attacks"),
    ("I feel empty and hopeless, nothing I used to enjoy feels good", "depression"),
    ("exams are next week and I'm overwhelmed with pressure", "stress"),
    ("my grandmother passed away and I keep crying", "grief"),
    ("I keep having nightmares and flashbacks about the accident", "trauma-ptsd"),
])
def test_top_result_is_relevant(retriever, query, topic):
    results = retriever.search(query)
    assert results and results[0]["topic"] == topic


def test_overlapping_topics_both_retrieved(retriever):
    # anxiety also talks about lying awake at night, so either can rank first
    topics = [r["topic"] for r in retriever.search("I lie awake for hours every night", top_k=2)]
    assert "sleep-problems" in topics


def test_unrelated_query_returns_nothing(retriever):
    assert retriever.search("what is the capital of France") == []


def test_results_sorted_by_score(retriever):
    scores = [r["score"] for r in retriever.search("stress and anxiety at work", top_k=5)]
    assert scores == sorted(scores, reverse=True)


@pytest.mark.parametrize("text", [
    "I don't want to be here anymore",
    "I have been thinking about suicide",
    "I want to end it all",
    "I've been hurting myself",
])
def test_crisis_detected(text):
    assert is_crisis(text)


@pytest.mark.parametrize("text", ["this exam is killing me", "I'm dying to see that movie", "I cut my finger cooking"])
def test_crisis_not_triggered_by_idioms(text):
    assert not is_crisis(text)
