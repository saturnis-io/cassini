"""Document text extraction, chunking, and indexing for SOP-grounded RAG.

Pipeline:

    upload -> extract_text() -> chunk_text() -> embed (per chunk) -> persist

``extract_text`` handles TXT, MD, PDF, DOCX. PDF / DOCX deps are optional
and gated behind the ``rag`` extras group; missing deps raise a clear
``RuntimeError`` rather than crashing the whole feature.

``chunk_text`` is whitespace-token-windowed (no tiktoken). Default
``target_tokens=512`` and ``overlap_tokens=64`` balance retrieval recall
against context budget.

``index_document`` orchestrates the full pipeline as an async coroutine
and updates ``SopDoc.status`` from ``pending`` -> ``indexing`` -> ``ready``
or ``failed``.

PII: a regex sweep over the extracted text sets ``SopDoc.pii_warning``
when matches are found. The match summary is recorded in
``pii_match_summary`` for operator review. We don't redact — operators
decide whether to keep the doc indexed.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING

import structlog

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from cassini.core.rag.embeddings import BaseEmbedder

logger = structlog.get_logger(__name__)


# PII regex set — conservative. False positives are OK; false negatives
# defeat the warning's purpose. Matches:
#   SSN-like:    XXX-XX-XXXX
#   credit card: 13-19 digit Luhn-ish (we don't validate, just shape)
#   email:       basic RFC2822-ish
_PII_PATTERNS: list[tuple[str, re.Pattern]] = [
    ("ssn_like", re.compile(r"\b\d{3}-\d{2}-\d{4}\b")),
    ("cc_like", re.compile(r"\b\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}\b")),
    ("email", re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b")),
]


@dataclass(slots=True)
class TextChunk:
    """A whitespace-token-windowed slice of source text."""

    chunk_index: int
    text: str
    token_count: int
    paragraph_label: str | None = None


def extract_text(path: Path | str, content_type: str) -> str:
    """Extract text from an uploaded SOP file.

    ``content_type`` is the MIME type from the upload. We dispatch by
    suffix when MIME is generic (``application/octet-stream``).

    Raises ``RuntimeError`` if a required optional dep is missing.
    Raises ``ValueError`` if the file extension is unsupported.
    """
    path = Path(path)
    suffix = path.suffix.lower()

    if content_type in ("text/plain", "text/markdown") or suffix in (".txt", ".md"):
        return path.read_text(encoding="utf-8", errors="replace")

    if "pdf" in content_type or suffix == ".pdf":
        return _extract_pdf(path)

    if "wordprocessingml" in content_type or "docx" in content_type or suffix == ".docx":
        return _extract_docx(path)

    raise ValueError(f"Unsupported document type: {content_type!r} ({suffix})")


def _extract_pdf(path: Path) -> str:
    try:
        import pypdf
    except ImportError as exc:
        raise RuntimeError(
            "PDF extraction requires the 'rag' extras. "
            "Install with: pip install 'cassini[rag]'"
        ) from exc
    reader = pypdf.PdfReader(str(path))
    pages: list[str] = []
    for i, page in enumerate(reader.pages, start=1):
        try:
            text = page.extract_text() or ""
        except Exception as exc:  # noqa: BLE001 — pypdf surfaces many failure modes
            logger.warning("pdf_page_extract_failed", page=i, error=str(exc))
            text = ""
        pages.append(f"[page {i}]\n{text}")
    return "\n\n".join(pages)


def _extract_docx(path: Path) -> str:
    try:
        from docx import Document
    except ImportError as exc:
        raise RuntimeError(
            "DOCX extraction requires the 'rag' extras. "
            "Install with: pip install 'cassini[rag]'"
        ) from exc
    doc = Document(str(path))
    paras = [p.text for p in doc.paragraphs if p.text.strip()]
    return "\n\n".join(paras)


def chunk_text(
    text: str,
    target_tokens: int = 512,
    overlap_tokens: int = 64,
) -> list[TextChunk]:
    """Split ``text`` into overlapping windows of whitespace tokens.

    Tokens are split on whitespace (no tiktoken dep). Empty text returns
    an empty list. Windows are joined with single spaces; if the source
    contained newlines, those are preserved inside individual tokens
    only when they were attached to a word — paragraph structure is
    captured by the paragraph_label heuristic.
    """
    if not text or not text.strip():
        return []
    if target_tokens <= 0:
        raise ValueError("target_tokens must be positive")
    if overlap_tokens < 0 or overlap_tokens >= target_tokens:
        raise ValueError("overlap_tokens must satisfy 0 <= overlap < target")

    # Token + trailing whitespace preserves original spacing (newlines
    # included), so heading detection sees real line structure.
    parts = re.findall(r"\S+\s*", text)
    if not parts:
        return []
    tokens = [p.strip() for p in parts]

    step = target_tokens - overlap_tokens
    chunks: list[TextChunk] = []
    chunk_index = 0
    for start in range(0, len(tokens), step):
        window_parts = parts[start : start + target_tokens]
        if not window_parts:
            break
        chunk_text_str = "".join(window_parts).rstrip()
        chunks.append(
            TextChunk(
                chunk_index=chunk_index,
                text=chunk_text_str,
                token_count=len(window_parts),
                paragraph_label=_first_heading(chunk_text_str),
            )
        )
        chunk_index += 1
        if start + target_tokens >= len(tokens):
            break
    return chunks


def _first_heading(text: str) -> str | None:
    """Best-effort heading extraction for paragraph_label.

    Recognizes:

    * ``[page N]`` page markers from the PDF extractor.
    * Markdown ``# Heading`` line.
    * Short ALL-CAPS line starting the chunk.

    Walks the first six non-empty lines so a chunk can pick up a
    section heading that follows a page marker.
    """
    if not text:
        return None
    seen = 0
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        seen += 1
        if seen > 6:
            break
        page_match = re.match(r"\[page \d+\]$", line)
        if page_match:
            return line.strip("[]")
        if line.startswith("#"):
            return line.lstrip("#").strip()[:120] or None
        if (
            4 <= len(line) <= 80
            and line.upper() == line
            and any(c.isalpha() for c in line)
        ):
            return line[:120]
    return None


def detect_pii(text: str) -> tuple[bool, str | None]:
    """Run regex PII sweep. Returns ``(matched, summary)``.

    Summary is a short human-readable string like
    ``"3 ssn_like, 1 email"`` when matches found, else ``None``.
    """
    counts: dict[str, int] = {}
    for label, pat in _PII_PATTERNS:
        matches = pat.findall(text)
        if matches:
            counts[label] = len(matches)
    if not counts:
        return False, None
    summary = ", ".join(f"{n} {label}" for label, n in counts.items())
    return True, summary


async def index_document(
    doc_id: int,
    embedder: "BaseEmbedder",
    db: "AsyncSession",
    target_tokens: int = 512,
    overlap_tokens: int = 64,
) -> None:
    """Re-extract, chunk, embed, and persist chunks for an existing SopDoc.

    Updates ``SopDoc.status`` through the lifecycle. Existing chunks for
    the doc are deleted before re-indexing (re-indexing is destructive).

    The function is fault-tolerant for the embedder: if embedding fails
    (e.g. provider offline), chunks are persisted with ``embedding=NULL``
    and the doc status moves to ``ready`` regardless. The next run of
    ``index_document`` (or a separate back-fill job) will populate them.
    """
    from sqlalchemy import delete, select

    from cassini.db.models.sop_doc import SopChunk, SopDoc

    doc = await db.get(SopDoc, doc_id)
    if doc is None:
        raise ValueError(f"SopDoc {doc_id} not found")

    doc.status = "indexing"
    doc.status_message = None
    await db.flush()

    try:
        text = extract_text(Path(doc.storage_path), doc.content_type)
        if not text.strip():
            raise ValueError("Document produced no extractable text")

        pii_match, pii_summary = detect_pii(text)
        doc.pii_warning = pii_match
        doc.pii_match_summary = pii_summary
        doc.char_count = len(text)

        chunks = chunk_text(text, target_tokens=target_tokens, overlap_tokens=overlap_tokens)
        if not chunks:
            raise ValueError("Document produced no chunks")

        await db.execute(delete(SopChunk).where(SopChunk.doc_id == doc.id))

        embeddings: list[bytes | None] = [None] * len(chunks)
        embed_dim: int | None = None
        try:
            arr = embedder.embed([c.text for c in chunks])
            embed_dim = embedder.dim
            embeddings = [embedder.to_bytes(arr[i]) for i in range(len(chunks))]
            doc.embedding_model = embedder.model_name
        except Exception as exc:  # noqa: BLE001 — fall through to NULL embeddings
            logger.warning(
                "sop_rag_embed_failed",
                doc_id=doc.id,
                error=str(exc),
                chunks=len(chunks),
            )
            doc.embedding_model = None

        for tc, blob in zip(chunks, embeddings, strict=True):
            db.add(
                SopChunk(
                    doc_id=doc.id,
                    plant_id=doc.plant_id,
                    chunk_index=tc.chunk_index,
                    text=tc.text,
                    token_count=tc.token_count,
                    paragraph_label=tc.paragraph_label,
                    embedding=blob,
                    embedding_dim=embed_dim if blob is not None else None,
                )
            )

        doc.chunk_count = len(chunks)
        doc.status = "ready"
        doc.status_message = None
        await db.flush()
        logger.info(
            "sop_rag_indexed",
            doc_id=doc.id,
            plant_id=doc.plant_id,
            chunks=len(chunks),
            embedded=sum(1 for b in embeddings if b is not None),
        )
    except Exception as exc:
        doc.status = "failed"
        doc.status_message = str(exc)[:1000]
        await db.flush()
        logger.error("sop_rag_index_failed", doc_id=doc_id, error=str(exc))
        raise


async def backfill_missing_embeddings(
    plant_id: int,
    embedder: "BaseEmbedder",
    db: "AsyncSession",
    batch_size: int = 64,
) -> int:
    """Embed any chunks for ``plant_id`` whose ``embedding`` is NULL.

    Returns count of chunks back-filled. Idempotent — chunks already
    embedded for a different model are left alone (re-index the doc to
    change embedder).
    """
    from sqlalchemy import select, update

    from cassini.db.models.sop_doc import SopChunk

    total = 0
    while True:
        rows = (
            await db.execute(
                select(SopChunk)
                .where(SopChunk.plant_id == plant_id)
                .where(SopChunk.embedding.is_(None))
                .limit(batch_size)
            )
        ).scalars().all()
        if not rows:
            break
        arr = embedder.embed([r.text for r in rows])
        for i, row in enumerate(rows):
            row.embedding = embedder.to_bytes(arr[i])
            row.embedding_dim = embedder.dim
        await db.flush()
        total += len(rows)
        if len(rows) < batch_size:
            break
    return total
