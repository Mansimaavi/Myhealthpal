# GoEmotions' 27 emotions are grouped into Ekman's 6 basic emotions + neutral,
# using the ekman_mapping.json published with the dataset.
EMOTION_LABELS = ["anger", "disgust", "fear", "joy", "sadness", "surprise", "neutral"]

# coarse sentiment for each emotion (same grouping as GoEmotions' sentiment_mapping.json)
EMOTION_TO_SENTIMENT = {
    "anger": "negative",
    "disgust": "negative",
    "fear": "negative",
    "sadness": "negative",
    "joy": "positive",
    "surprise": "ambiguous",
    "neutral": "neutral",
}
