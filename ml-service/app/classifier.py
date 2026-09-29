import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer

from .labels import EMOTION_TO_SENTIMENT


class EmotionClassifier:
    """Loads the fine-tuned BERT model saved by training/train_bert.py."""

    def __init__(self, model_dir, max_length=128):
        self.tokenizer = AutoTokenizer.from_pretrained(model_dir)
        self.model = AutoModelForSequenceClassification.from_pretrained(model_dir)
        self.model.eval()
        self.max_length = max_length
        self.id2label = {int(k): v for k, v in self.model.config.id2label.items()}

    @torch.inference_mode()
    def predict(self, text):
        inputs = self.tokenizer(text, truncation=True, max_length=self.max_length, return_tensors="pt")
        probs = torch.softmax(self.model(**inputs).logits[0], dim=-1)

        idx = int(torch.argmax(probs))
        label = self.id2label[idx]
        return {
            "label": label,
            "score": round(float(probs[idx]), 4),
            "sentiment": EMOTION_TO_SENTIMENT.get(label, "neutral"),
            "scores": {self.id2label[i]: round(float(p), 4) for i, p in enumerate(probs)},
        }
