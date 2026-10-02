"""Build/refresh the TF-IDF index from knowledge_base/.

    python -m app.rag.ingest            # rebuild the index if the documents changed
    python -m app.rag.ingest --force    # always rebuild
    python -m app.rag.ingest --eval     # ...and print retrieval results for sample queries
"""
import argparse
import logging

from ..config import INDEX_DIR, KB_DIR
from .pipeline import ingest
from .retriever import Retriever

EVAL_QUERIES = [
    ("I can't stop worrying about everything, my mind never switches off", "anxiety"),
    ("my heart was racing and I felt like I couldn't breathe", "panic-attacks"),
    ("I feel empty and hopeless, nothing I used to enjoy feels good", "depression"),
    ("exams are next week and I'm overwhelmed with pressure from my parents", "stress"),
    ("I lie awake for hours every night and wake up exhausted", "sleep-problems"),
    ("my grandmother passed away last month and I keep crying", "grief"),
    ("I moved to a new city and have no one to talk to", "loneliness"),
    ("I snap at everyone over small things lately", "anger"),
    ("I keep having nightmares and flashbacks about the accident", "trauma-ptsd"),
    ("I'm terrified of speaking in class, everyone will judge me", "social-anxiety"),
    ("work has drained me completely, I dread every morning", "burnout"),
    ("everyone would be better off without me", "crisis-support"),
    ("my knee hurts when I climb stairs", None),
    ("what is the capital of France", None),
]

# second dev set (used when adding the "How people often put it" sections and tuning the threshold)
DEV_QUERIES_2 = [
    ("I overthink every little thing and feel tense all day", "anxiety"),
    ("suddenly I was shaking and sweating and thought I was dying", "panic-attacks"),
    ("I've stopped caring about anything and I'm tired all the time", "depression"),
    ("too many deadlines, I feel like I'm drowning in work and assignments", "stress"),
    ("I can't fall asleep at night and keep waking up at 4am", "sleep-problems"),
    ("my dad died two weeks ago and I still can't believe it", "grief"),
    ("I don't have any friends here and spend every weekend by myself", "loneliness"),
    ("I get so angry I end up shouting at my family", "anger"),
    ("ever since the assault I feel on edge and jumpy", "trauma-ptsd"),
    ("I avoid parties because I'm scared people will think I'm weird", "social-anxiety"),
    ("my job has left me exhausted and cynical, I don't care anymore", "burnout"),
    ("I keep thinking about ending my life", "crisis-support"),
    ("I sprained my ankle playing football", None),
    ("how do I reset my wifi router", None),
    ("my stomach hurts after eating spicy food", None),
    ("what's a good recipe for dinner", None),
]

# final test set: written after all tuning and reported as-is, never used to change anything
TEST_QUERIES = [
    ("my chest feels tight whenever I think about the future and I can't calm down", "anxiety"),
    ("what if I fail and disappoint everyone, I keep thinking about it", "anxiety"),
    ("out of nowhere my hands went numb and I couldn't catch my breath", "panic-attacks"),
    ("I have no energy, I just lie in bed all day and nothing feels worth it", "depression"),
    ("placement season is killing me, so much pressure to get a job", "stress"),
    ("I've been working 14 hour days for months and I feel burnt out", "burnout"),
    ("we lost our dog last week and the house feels so empty", "grief"),
    ("it's been three months since my breakup and I still miss her", "grief"),
    ("all my friends are busy and nobody calls me anymore", "loneliness"),
    ("insomnia again, it's 3am and I'm still awake", "sleep-problems"),
    ("I lose my temper over tiny things and then feel terrible", "anger"),
    ("I still flinch at loud noises after the car crash", "trauma-ptsd"),
    ("presenting in front of the class makes me want to disappear", "social-anxiety"),
    ("I don't see any point in living anymore", "crisis-support"),
    ("I've been self harming again", "crisis-support"),
    ("what's the best laptop for programming", None),
    ("I have a fever and a sore throat since yesterday", None),
    ("can you explain how photosynthesis works", None),
    ("my back hurts after sitting at my desk", None),
    ("who won the cricket match yesterday", None),
]


def evaluate(retriever, queries=EVAL_QUERIES, label="eval"):
    """Prints per-query results plus three metrics:
    ranking   - the expected topic is the top result (ignoring the threshold)
    retrieved - ...and it scores above the threshold, so it actually reaches the LLM
    rejected  - off-topic queries return nothing
    """
    ranked = retrieved = rejected = relevant = off_topic = 0
    for query, expected in queries:
        raw = retriever.index.search(query, top_k=3)
        top = [(c["metadata"]["topic"], round(s, 3)) for c, s in raw]
        passed = [t for t, s in top if s >= retriever.min_score]
        if expected:
            relevant += 1
            ranked += bool(top) and top[0][0] == expected
            ok = passed[:1] == [expected]
            retrieved += ok
        else:
            off_topic += 1
            ok = not passed
            rejected += ok
        print(f"{'OK ' if ok else 'XX '} expected={expected!s:15} top3={top}")
    print(f"{label} @ min_score={retriever.min_score}: ranking {ranked}/{relevant}, "
          f"retrieved {retrieved}/{relevant}, off-topic rejected {rejected}/{off_topic}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--eval", action="store_true")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    index, stats = ingest(KB_DIR, INDEX_DIR, force=args.force)
    print(f"index={INDEX_DIR} chunks={len(index)} vocabulary={index.manifest['vocabulary_size']}")
    for k, v in stats.items():
        print(f"  {k}: {v}")

    if args.eval:
        retriever = Retriever(index)
        evaluate(retriever)
        evaluate(retriever, DEV_QUERIES_2, "dev-2")
        evaluate(retriever, TEST_QUERIES, "test")


if __name__ == "__main__":
    main()
