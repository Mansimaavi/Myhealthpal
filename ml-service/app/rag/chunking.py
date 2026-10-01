"""Step 5: split documents into overlapping, heading-aware chunks."""
import re
from dataclasses import dataclass, field

_HEADING = re.compile(r"^(#{1,3})\s+(.+)$", re.MULTILINE)
_SENTENCE_END = re.compile(r"(?<=[.!?;])\s+(?=[A-Z0-9\"'(])")


@dataclass
class Chunk:
    chunk_id: str
    doc_id: str
    text: str            # what gets embedded: "<title> - <section>\n<body>"
    body: str            # the chunk text on its own, shown to the LLM
    metadata: dict = field(default_factory=dict)


def split_sections(text):
    """Returns (document title, [(section heading, body), ...])."""
    title = None
    sections = []
    matches = list(_HEADING.finditer(text))

    intro = text[: matches[0].start()].strip() if matches else text.strip()
    if intro:
        sections.append(("Introduction", intro))

    for i, m in enumerate(matches):
        level, heading = len(m.group(1)), m.group(2).strip()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        body = text[m.end():end].strip()
        if level == 1 and title is None:
            title = heading
            if body:
                sections.append(("Introduction", body))
            continue
        if body:
            sections.append((heading, body))
    return title, sections


def split_sentences(text):
    sentences = []
    for paragraph in re.split(r"\n\s*\n", text):
        paragraph = " ".join(paragraph.split())
        if paragraph:
            sentences.extend(s.strip() for s in _SENTENCE_END.split(paragraph) if s.strip())
    return sentences


def _word_count(text):
    return len(text.split())


def chunk_text(text, max_words=150, overlap_words=30):
    """Packs whole sentences into chunks of at most max_words.

    Each new chunk starts with the last ~overlap_words of the previous one so an idea
    split across a boundary still appears together in at least one chunk.
    """
    sentences = []
    for sentence in split_sentences(text):
        words = sentence.split()
        # a single very long "sentence" (e.g. a list run together) is split by words
        for i in range(0, len(words), max_words):
            sentences.append(" ".join(words[i:i + max_words]))

    chunks, current = [], []
    for sentence in sentences:
        if current and _word_count(" ".join(current + [sentence])) > max_words:
            chunks.append(" ".join(current))
            overlap = []
            for prev in reversed(current):
                if _word_count(" ".join([prev] + overlap)) > overlap_words:
                    break
                overlap.insert(0, prev)
            current = overlap
        current.append(sentence)
    if current:
        chunks.append(" ".join(current))
    return chunks


def chunk_document(doc, max_words=150, overlap_words=30):
    title, sections = split_sections(doc.text)
    title = title or doc.metadata.get("title") or doc.doc_id
    chunks = []
    for section, body in sections:
        for part, piece in enumerate(chunk_text(body, max_words, overlap_words)):
            index = len(chunks)
            chunks.append(Chunk(
                chunk_id=f"{doc.doc_id}:{index}",
                doc_id=doc.doc_id,
                # prefixing the title/section ("contextual chunk header") helps short
                # chunks match queries about their topic
                text=f"{title} - {section}\n{piece}",
                body=piece,
                metadata={
                    **doc.metadata,
                    "title": title,
                    "section": section,
                    "chunk_index": index,
                    "section_part": part,
                    "word_count": _word_count(piece),
                },
            ))
    return chunks
