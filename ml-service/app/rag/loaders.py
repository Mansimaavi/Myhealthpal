"""Step 1-2: load documents from the knowledge base folder and extract their text."""
from dataclasses import dataclass, field
from html.parser import HTMLParser
from pathlib import Path

SUPPORTED_TYPES = {".md", ".txt", ".html", ".htm", ".pdf"}


@dataclass
class Document:
    doc_id: str
    text: str
    metadata: dict = field(default_factory=dict)


class _HTMLTextExtractor(HTMLParser):
    """Keeps visible text, turns h1-h3 into markdown headings so the chunker sees sections."""

    SKIP = {"script", "style", "nav", "footer", "header", "noscript"}
    HEADINGS = {"h1": "# ", "h2": "## ", "h3": "### "}
    BLOCKS = {"p", "div", "li", "br", "section", "article", "tr"}

    def __init__(self):
        super().__init__()
        self.parts = []
        self.title = None
        self._skip_depth = 0
        self._in_title = False

    def handle_starttag(self, tag, attrs):
        if tag in self.SKIP:
            self._skip_depth += 1
        elif tag == "title":
            self._in_title = True
        elif tag in self.HEADINGS:
            self.parts.append("\n\n" + self.HEADINGS[tag])
        elif tag in self.BLOCKS:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in self.SKIP and self._skip_depth:
            self._skip_depth -= 1
        elif tag == "title":
            self._in_title = False
        elif tag in self.HEADINGS or tag in self.BLOCKS:
            self.parts.append("\n")

    def handle_data(self, data):
        if self._in_title:
            self.title = (self.title or "") + data.strip()
        elif not self._skip_depth:
            self.parts.append(data)


def _read_html(path):
    parser = _HTMLTextExtractor()
    parser.feed(path.read_text(encoding="utf-8", errors="replace"))
    return "".join(parser.parts), parser.title


def _read_pdf(path):
    from pypdf import PdfReader

    reader = PdfReader(str(path))
    pages = [page.extract_text() or "" for page in reader.pages]
    title = (reader.metadata.title if reader.metadata else None) or None
    return "\n\n".join(pages), title


def extract_text(path):
    """Returns (text, title or None) for a supported file."""
    suffix = path.suffix.lower()
    if suffix in {".md", ".txt"}:
        return path.read_text(encoding="utf-8", errors="replace"), None
    if suffix in {".html", ".htm"}:
        return _read_html(path)
    if suffix == ".pdf":
        return _read_pdf(path)
    raise ValueError(f"Unsupported file type: {path}")


def load_documents(kb_dir):
    kb_dir = Path(kb_dir)
    documents = []
    for path in sorted(kb_dir.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in SUPPORTED_TYPES:
            continue
        text, title = extract_text(path)
        rel = path.relative_to(kb_dir).as_posix()
        documents.append(Document(
            doc_id=rel.rsplit(".", 1)[0],
            text=text,
            metadata={"source_file": rel, "file_type": path.suffix.lower().lstrip("."), "title": title},
        ))
    return documents
