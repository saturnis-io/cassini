"""Unit tests for the indexer module — text extraction + chunking + PII.

Embedder back-fill paths and DB persistence are covered in integration
tests; here we focus on the pure-function pieces.
"""
from __future__ import annotations

from pathlib import Path

import pytest

from cassini.core.rag.indexer import (
    TextChunk,
    chunk_text,
    detect_pii,
    extract_text,
)


# ---------------------------------------------------------------------------
# chunk_text
# ---------------------------------------------------------------------------


def test_chunk_text_empty_returns_empty() -> None:
    assert chunk_text("") == []
    assert chunk_text("   ") == []


def test_chunk_text_short_input_one_chunk() -> None:
    text = "five tokens here exactly five"
    chunks = chunk_text(text, target_tokens=512, overlap_tokens=64)
    assert len(chunks) == 1
    assert chunks[0].text == text
    assert chunks[0].token_count == 5
    assert chunks[0].chunk_index == 0


def test_chunk_text_windows_with_overlap() -> None:
    # 100 tokens, target 30, overlap 10 -> step 20 -> windows at
    # 0..30, 20..50, 40..70, 60..90, 80..110(=100). 5 chunks.
    tokens = [f"w{i}" for i in range(100)]
    text = " ".join(tokens)
    chunks = chunk_text(text, target_tokens=30, overlap_tokens=10)
    assert len(chunks) == 5
    assert chunks[0].text.split() == tokens[:30]
    assert chunks[1].text.split() == tokens[20:50]
    assert chunks[-1].text.split() == tokens[80:100]


def test_chunk_text_negative_or_invalid_args_raise() -> None:
    with pytest.raises(ValueError):
        chunk_text("hello", target_tokens=0)
    with pytest.raises(ValueError):
        chunk_text("hello", target_tokens=10, overlap_tokens=10)
    with pytest.raises(ValueError):
        chunk_text("hello", target_tokens=10, overlap_tokens=-1)


def test_chunk_text_paragraph_label_from_markdown_heading() -> None:
    text = "# Setup procedure\n" + " ".join(f"w{i}" for i in range(20))
    chunks = chunk_text(text, target_tokens=100, overlap_tokens=10)
    assert chunks[0].paragraph_label == "Setup procedure"


def test_chunk_text_paragraph_label_from_pdf_page_marker() -> None:
    text = "[page 3]\n" + " ".join(f"w{i}" for i in range(20))
    chunks = chunk_text(text, target_tokens=100, overlap_tokens=10)
    assert chunks[0].paragraph_label == "page 3"


# ---------------------------------------------------------------------------
# extract_text — text and markdown only (no optional deps)
# ---------------------------------------------------------------------------


def test_extract_text_plain_txt(tmp_path: Path) -> None:
    p = tmp_path / "sop.txt"
    p.write_text("hello world", encoding="utf-8")
    assert extract_text(p, "text/plain") == "hello world"


def test_extract_text_markdown(tmp_path: Path) -> None:
    p = tmp_path / "sop.md"
    p.write_text("# Title\nbody", encoding="utf-8")
    assert "# Title" in extract_text(p, "text/markdown")


def test_extract_text_unknown_suffix_raises(tmp_path: Path) -> None:
    p = tmp_path / "sop.bin"
    p.write_bytes(b"\x00\x01\x02")
    with pytest.raises(ValueError, match="Unsupported"):
        extract_text(p, "application/octet-stream")


# ---------------------------------------------------------------------------
# detect_pii
# ---------------------------------------------------------------------------


def test_detect_pii_clean_text() -> None:
    matched, summary = detect_pii("Tighten the bolt to 50 Nm before assembly.")
    assert matched is False
    assert summary is None


def test_detect_pii_email() -> None:
    matched, summary = detect_pii("Contact ops@factory.test for sign-off.")
    assert matched is True
    assert "email" in summary


def test_detect_pii_ssn_like() -> None:
    matched, summary = detect_pii("Operator SSN 123-45-6789 on file.")
    assert matched is True
    assert "ssn_like" in summary


def test_detect_pii_credit_card_like() -> None:
    matched, summary = detect_pii("Card on file: 4111 1111 1111 1111.")
    assert matched is True
    assert "cc_like" in summary


def test_detect_pii_multiple_categories() -> None:
    matched, summary = detect_pii(
        "Contact ops@factory.test or operator with SSN 123-45-6789."
    )
    assert matched is True
    # both categories present
    assert "email" in summary and "ssn_like" in summary
