"""Download GoEmotions and turn it into a single-label Ekman emotion dataset.

Usage: python training/prepare_data.py --out-dir data
"""
import argparse
import io
import json
import os
import sys
import urllib.request

import pandas as pd

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from app.labels import EMOTION_LABELS  # noqa: E402

BASE_URL = "https://raw.githubusercontent.com/google-research/google-research/master/goemotions/data"
SPLITS = {"train": "train.tsv", "dev": "dev.tsv", "test": "test.tsv"}


def fetch(name):
    with urllib.request.urlopen(f"{BASE_URL}/{name}", timeout=60) as resp:
        return resp.read().decode("utf-8")


def build_mapping():
    goemotions = fetch("emotions.txt").split()
    ekman = json.loads(fetch("ekman_mapping.json"))
    fine_to_ekman = {"neutral": "neutral"}
    for coarse, fine_labels in ekman.items():
        for fine in fine_labels:
            fine_to_ekman[fine] = coarse
    return goemotions, fine_to_ekman


def convert(split_tsv, goemotions, fine_to_ekman):
    df = pd.read_csv(io.StringIO(split_tsv), sep="\t", header=None,
                     names=["text", "labels", "id"], quoting=3)
    rows = []
    for text, labels in zip(df["text"], df["labels"]):
        coarse = {fine_to_ekman[goemotions[int(i)]] for i in str(labels).split(",")}
        # GoEmotions is multi-label; keep only comments whose labels agree on one emotion
        if len(coarse) == 1:
            rows.append({"text": str(text).strip(), "label": coarse.pop()})
    return pd.DataFrame(rows)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out-dir", default="data")
    args = parser.parse_args()

    os.makedirs(args.out_dir, exist_ok=True)
    goemotions, fine_to_ekman = build_mapping()

    for split, filename in SPLITS.items():
        df = convert(fetch(filename), goemotions, fine_to_ekman)
        assert set(df["label"]) <= set(EMOTION_LABELS)
        path = os.path.join(args.out_dir, f"{split}.csv")
        df.to_csv(path, index=False)
        print(f"{split}: {len(df)} rows -> {path}")
        print(df["label"].value_counts().to_string(), "\n")


if __name__ == "__main__":
    main()
