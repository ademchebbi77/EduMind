"""Extract plain text from course material, locally and without network access."""

import re
import zipfile
from collections import Counter
from pathlib import Path
from xml.etree import ElementTree

from pypdf import PdfReader
from pypdf.errors import PdfReadError

MAX_PAGES = 200
MAX_CHARACTERS = 300_000

TEXT_EXTENSIONS = ("txt", "md")
SUPPORTED_EXTENSIONS = ("pdf", "docx", *TEXT_EXTENSIONS)

_TIMESTAMP_RE = re.compile(r"\[?\(?\b\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?\)?\]?\s*(?:-->\s*\S+)?")
_MARKDOWN_RE = re.compile(r"^\s{0,3}(?:#{1,6}\s+|[-*+]\s+|>\s+|\d+[.)]\s+)", re.MULTILINE)
_PAGE_NUMBER_RE = re.compile(r"^\s*(?:page\s*)?\d+\s*(?:/\s*\d+)?\s*$", re.IGNORECASE)
_DOCX_NS = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


class ExtractionError(Exception):
    """The source cannot be turned into usable text. The message is user-facing."""


def _clean_pages(pages):
    """Join PDF pages, dropping running headers/footers and page numbers."""
    line_counts = Counter()
    for page in pages:
        for line in {line.strip() for line in page.splitlines() if line.strip()}:
            line_counts[line] += 1
    repeated = (
        {line for line, count in line_counts.items() if count >= 3 and len(line) < 80}
        if len(pages) >= 4
        else set()
    )

    kept = []
    for page in pages:
        lines = [
            line
            for line in page.splitlines()
            if line.strip() not in repeated and not _PAGE_NUMBER_RE.match(line)
        ]
        kept.append("\n".join(lines))
    return "\n\n".join(kept)


def clean_text(raw):
    """Normalise whitespace, rejoin hyphenated words and wrapped lines."""
    text = raw.replace("\r\n", "\n").replace("\r", "\n").replace("­", "")
    text = text.replace("’", "'").replace(" ", " ").replace("\t", " ")
    text = re.sub(r"(\w)-\n(\w)", r"\1\2", text)  # "appren-\ntissage"
    text = _MARKDOWN_RE.sub("", text)
    text = re.sub(r"[*_`]{1,3}", "", text)

    paragraphs = []
    for block in re.split(r"\n\s*\n", text):
        lines = [line.strip() for line in block.split("\n") if line.strip()]
        if not lines:
            continue
        merged = lines[0]
        for line in lines[1:]:
            # A short line without final punctuation, followed by a capitalised
            # line, is a heading: keep it apart. Otherwise it is a wrapped line.
            if (
                len(merged) < 60
                and not merged.endswith((".", ":", ";", ","))
                and line[:1].isupper()
            ):
                paragraphs.append(merged)
                merged = line
            else:
                merged = f"{merged} {line}"
        paragraphs.append(merged)
    return "\n\n".join(" ".join(paragraph.split()) for paragraph in paragraphs)[:MAX_CHARACTERS]


def extract_pdf(file_obj):
    try:
        reader = PdfReader(file_obj)
        if reader.is_encrypted:
            raise ExtractionError("This PDF is password-protected.")
        pages = [page.extract_text() or "" for page in reader.pages[:MAX_PAGES]]
    except PdfReadError as error:
        raise ExtractionError("This PDF could not be read.") from error
    text = clean_text(_clean_pages(pages))
    if not text.strip():
        raise ExtractionError(
            "No text could be extracted from this PDF. It may be a scanned document."
        )
    return text


def extract_docx(file_obj):
    try:
        with zipfile.ZipFile(file_obj) as archive:
            xml = archive.read("word/document.xml")
    except (zipfile.BadZipFile, KeyError) as error:
        raise ExtractionError("This Word document could not be read.") from error
    root = ElementTree.fromstring(xml)
    paragraphs = []
    for paragraph in root.iter(f"{_DOCX_NS}p"):
        text = "".join(node.text or "" for node in paragraph.iter(f"{_DOCX_NS}t"))
        if text.strip():
            paragraphs.append(text)
    return clean_text("\n\n".join(paragraphs))


def extract_plain(data):
    for encoding in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            return clean_text(data.decode(encoding))
        except UnicodeDecodeError:
            continue
    raise ExtractionError("This text file uses an unsupported encoding.")


def clean_transcript(raw):
    """Remove timestamps from a course transcript."""
    return clean_text(_TIMESTAMP_RE.sub(" ", raw))


def extract_file(field_file, name):
    """Extract text from a stored upload, dispatching on its extension."""
    extension = Path(name).suffix.lower().lstrip(".")
    if extension not in SUPPORTED_EXTENSIONS:
        raise ExtractionError("Unsupported file type.")
    with field_file.open("rb") as handle:
        if extension == "pdf":
            return extract_pdf(handle)
        if extension == "docx":
            return extract_docx(handle)
        return extract_plain(handle.read())


def extract_course(course):
    """Text of a course: its PDF, or the completed transcript of an audio/video course."""
    if course.type == "pdf" and course.file:
        with course.file.open("rb") as handle:
            return extract_pdf(handle)

    # A missing one-to-one relation raises an AttributeError subclass.
    transcript = getattr(course, "transcript", None)
    if transcript is not None and transcript.status == "completed" and transcript.text.strip():
        return clean_transcript(transcript.text)
    raise ExtractionError(
        "This course has no readable text yet. Generate its transcript first, "
        "or upload a document instead."
    )
