"""Fine-tune BERT on the Ekman-mapped GoEmotions data (see prepare_data.py).

Usage:
  python training/train_bert.py --data-dir data --output-dir models/emotion-bert

A GPU (e.g. Colab T4) is strongly recommended; 3 epochs of bert-base-uncased
takes roughly 20-30 minutes there.
"""
import argparse
import json
import math
import os
import shutil
import sys

import numpy as np
import pandas as pd
import torch
from sklearn.metrics import accuracy_score, classification_report, f1_score
from sklearn.utils.class_weight import compute_class_weight
from transformers import (
    AutoModelForSequenceClassification,
    AutoTokenizer,
    Trainer,
    TrainingArguments,
)

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from app.labels import EMOTION_LABELS  # noqa: E402

LABEL2ID = {label: i for i, label in enumerate(EMOTION_LABELS)}
ID2LABEL = {i: label for label, i in LABEL2ID.items()}


class EmotionDataset(torch.utils.data.Dataset):
    def __init__(self, df, tokenizer, max_length):
        self.encodings = tokenizer(df["text"].tolist(), truncation=True, max_length=max_length)
        self.labels = [LABEL2ID[label] for label in df["label"]]

    def __len__(self):
        return len(self.labels)

    def __getitem__(self, idx):
        item = {k: torch.tensor(v[idx]) for k, v in self.encodings.items()}
        item["labels"] = torch.tensor(self.labels[idx])
        return item


class WeightedTrainer(Trainer):
    """Cross-entropy with class weights, since fear/disgust are rare in GoEmotions."""

    def __init__(self, *args, class_weights=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.class_weights = class_weights

    def compute_loss(self, model, inputs, return_outputs=False, **kwargs):
        labels = inputs.pop("labels")
        outputs = model(**inputs)
        weight = self.class_weights.to(outputs.logits.device) if self.class_weights is not None else None
        loss = torch.nn.functional.cross_entropy(outputs.logits, labels, weight=weight)
        return (loss, outputs) if return_outputs else loss


def compute_metrics(eval_pred):
    logits, labels = eval_pred
    preds = np.argmax(logits, axis=-1)
    return {
        "accuracy": accuracy_score(labels, preds),
        "macro_f1": f1_score(labels, preds, average="macro"),
    }


def load_split(data_dir, split, limit=None):
    df = pd.read_csv(os.path.join(data_dir, f"{split}.csv")).dropna()
    if limit:
        df = df.sample(n=min(limit, len(df)), random_state=42)
    return df


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-name", default="bert-base-uncased")
    parser.add_argument("--data-dir", default="data")
    parser.add_argument("--output-dir", default="models/emotion-bert")
    parser.add_argument("--epochs", type=float, default=3)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--lr", type=float, default=2e-5)
    parser.add_argument("--max-length", type=int, default=128)
    parser.add_argument("--max-train-samples", type=int, default=None, help="for quick test runs")
    parser.add_argument("--max-eval-samples", type=int, default=None)
    args = parser.parse_args()

    tokenizer = AutoTokenizer.from_pretrained(args.model_name)
    model = AutoModelForSequenceClassification.from_pretrained(
        args.model_name,
        num_labels=len(EMOTION_LABELS),
        id2label=ID2LABEL,
        label2id=LABEL2ID,
    )

    train_df = load_split(args.data_dir, "train", args.max_train_samples)
    dev_df = load_split(args.data_dir, "dev", args.max_eval_samples)
    test_df = load_split(args.data_dir, "test", args.max_eval_samples)

    train_ds = EmotionDataset(train_df, tokenizer, args.max_length)
    dev_ds = EmotionDataset(dev_df, tokenizer, args.max_length)
    test_ds = EmotionDataset(test_df, tokenizer, args.max_length)

    present = np.unique(train_ds.labels)
    weights = np.ones(len(EMOTION_LABELS), dtype=np.float32)
    weights[present] = compute_class_weight("balanced", classes=present, y=train_ds.labels)
    # full "balanced" weights over-correct for the tiny classes; soften them
    class_weights = torch.tensor(np.sqrt(weights), dtype=torch.float)

    # 10% linear warmup; computed as a step count so this works on transformers 4.x and 5.x
    steps_per_epoch = math.ceil(len(train_ds) / args.batch_size)
    warmup_steps = int(0.1 * steps_per_epoch * args.epochs)

    training_args = TrainingArguments(
        output_dir=os.path.join(args.output_dir, "checkpoints"),
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=args.batch_size * 2,
        learning_rate=args.lr,
        weight_decay=0.01,
        warmup_steps=warmup_steps,
        eval_strategy="epoch",
        save_strategy="epoch",
        save_total_limit=1,
        load_best_model_at_end=True,
        metric_for_best_model="macro_f1",
        logging_steps=50,
        report_to="none",
        seed=42,
    )

    trainer = WeightedTrainer(
        model=model,
        args=training_args,
        train_dataset=train_ds,
        eval_dataset=dev_ds,
        processing_class=tokenizer,
        compute_metrics=compute_metrics,
        class_weights=class_weights,
    )
    trainer.train()

    output = trainer.predict(test_ds)
    preds = np.argmax(output.predictions, axis=-1)
    report = classification_report(
        test_ds.labels, preds,
        labels=list(range(len(EMOTION_LABELS))),
        target_names=EMOTION_LABELS,
        zero_division=0,
    )
    print(report)

    trainer.save_model(args.output_dir)
    tokenizer.save_pretrained(args.output_dir)
    with open(os.path.join(args.output_dir, "test_metrics.json"), "w") as f:
        json.dump({k: float(v) for k, v in output.metrics.items()}, f, indent=2)
    with open(os.path.join(args.output_dir, "test_report.txt"), "w") as f:
        f.write(report)
    shutil.rmtree(training_args.output_dir, ignore_errors=True)
    print(f"Saved model to {args.output_dir}")


if __name__ == "__main__":
    main()
