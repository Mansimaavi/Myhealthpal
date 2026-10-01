"""Step 3: normalise extracted text so the same content always looks the same."""
import html
import re
import unicodedata

_SOURCE_LINE = re.compile(r"^\s*Source:\s*(\S+)\s*$", re.MULTILINE | re.IGNORECASE)
_MD_LINK = re.compile(r"\[([^\]]+)\]\((?:[^)]+)\)")
_MD_EMPHASIS = re.compile(r"(\*\*|__)(.+?)\1")
_MD_ITALIC = re.compile(r"(?<![\w*])\*(?!\s)([^*\n]+?)\*(?!\w)")
_PAGE_NUMBER = re.compile(r"^\s*(page\s+)?\d+(\s+of\s+\d+)?\s*$", re.MULTILINE | re.IGNORECASE)
_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def extract_sources(text):
    """Pulls 'Source: <url>' lines out of the text so they become metadata instead of content."""
    sources = _SOURCE_LINE.findall(text)
    return _SOURCE_LINE.sub("", text), sources


def clean_text(text):
    text = html.unescape(text)
    text = unicodedata.normalize("NFKC", text)
    text = text.replace("\u00ad", "")              # soft hyphens from PDFs
    text = re.sub(r"(\w)-\n(\w)", r"\1\2", text)   # words hyphenated across PDF lines
    text = _CONTROL.sub("", text)
    text = text.replace("\r\n", "\n").replace("\r", "\n")

    text = _MD_LINK.sub(r"\1", text)
    text = _MD_EMPHASIS.sub(r"\2", text)
    text = _MD_ITALIC.sub(r"\1", text)
    text = _PAGE_NUMBER.sub("", text)

    lines = [re.sub(r"[ \t]+", " ", line).strip() for line in text.split("\n")]
    text = "\n".join(lines)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()
