"""Unit tests for the citation_lock module — pure parsing + validation.

DB tests live in ``tests/integration/test_sop_rag_endpoint.py``. These
tests cover the synchronous parse path and exercise validation against
in-memory candidate sets without hitting SQLAlchemy.
"""
from __future__ import annotations

import pytest

from cassini.core.rag.citation_lock import (
    CitationValidationResult,
    CitedSentence,
    build_strict_retry_prompt,
    parse_cited_response,
    strip_citations,
)


def test_parse_single_sentence_with_citation() -> None:
    text = "The torque spec is 50 Nm [citation:42]."
    sentences = parse_cited_response(text)
    assert len(sentences) == 1
    assert sentences[0].chunk_ids == [42]
    assert sentences[0].is_cited


def test_parse_multiple_sentences_each_cited() -> None:
    text = (
        "Tighten the bolt to 50 Nm [citation:1]. "
        "Then verify torque after 24 hours [citation:2]."
    )
    sentences = parse_cited_response(text)
    assert len(sentences) == 2
    assert sentences[0].chunk_ids == [1]
    assert sentences[1].chunk_ids == [2]


def test_parse_multiple_citations_per_sentence_dedup() -> None:
    text = "Use lubricant before assembly [citation:5][citation:5][citation:7]."
    sentences = parse_cited_response(text)
    assert len(sentences) == 1
    # de-dup preserves first-seen order
    assert sentences[0].chunk_ids == [5, 7]


def test_parse_uncited_sentence() -> None:
    text = "This claim has no citation marker."
    sentences = parse_cited_response(text)
    assert len(sentences) == 1
    assert sentences[0].chunk_ids == []
    assert not sentences[0].is_cited


def test_parse_empty_input() -> None:
    assert parse_cited_response("") == []
    assert parse_cited_response("   \n\t  ") == []


def test_parse_drops_empty_sentences_after_split() -> None:
    text = "First [citation:1].   Second [citation:2]!"
    sentences = parse_cited_response(text)
    assert len(sentences) == 2


def test_strip_citations_removes_markers() -> None:
    text = "Tighten to 50 Nm [citation:1] and verify [citation:2]."
    assert strip_citations(text) == "Tighten to 50 Nm and verify ."


def test_strict_retry_prompt_mentions_failure_reason_uncited() -> None:
    prompt = build_strict_retry_prompt(
        "uncited_sentence", "An uncited claim about torque."
    )
    assert "uncited" in prompt.lower()
    assert "An uncited claim about torque." in prompt


def test_strict_retry_prompt_mentions_failure_reason_out_of_set() -> None:
    prompt = build_strict_retry_prompt(
        "out_of_set", "A claim with bad chunk_id."
    )
    assert "candidate set" in prompt.lower()
    assert "A claim with bad chunk_id." in prompt


# ---------------------------------------------------------------------------
# Validation tests with in-memory DB session — uses pytest-asyncio fixtures
# from conftest where available, but here we mock the session entirely so
# this remains a unit test.
# ---------------------------------------------------------------------------


class _StubResult:
    def __init__(self, rows: list[tuple[int, int]]) -> None:
        self._rows = [type("Row", (), {"id": cid, "plant_id": pid}) for cid, pid in rows]

    def all(self) -> list:
        return self._rows


class _StubSession:
    """Bare-minimum AsyncSession stub returning seeded chunk plant ids."""

    def __init__(self, chunk_plant_map: dict[int, int]) -> None:
        self._chunks = chunk_plant_map

    async def execute(self, _stmt) -> _StubResult:
        # _stmt is a SQLAlchemy select — for the test we just return all known chunks.
        # The validator passes in a where(SopChunk.id.in_(...)) — we ignore the filter
        # because the validator only iterates the returned ids.
        return _StubResult(list(self._chunks.items()))


@pytest.mark.asyncio
async def test_validate_accepts_well_cited_response() -> None:
    from cassini.core.rag.citation_lock import validate_citation_lock

    sentences = [
        CitedSentence(index=0, text="A [citation:1].", chunk_ids=[1]),
        CitedSentence(index=1, text="B [citation:2].", chunk_ids=[2]),
    ]
    candidate_ids = {1, 2}
    db = _StubSession({1: 100, 2: 100})

    result = await validate_citation_lock(sentences, candidate_ids, plant_id=100, db=db)
    assert result.valid
    assert result.failure_reason is None


@pytest.mark.asyncio
async def test_validate_rejects_uncited_sentence() -> None:
    from cassini.core.rag.citation_lock import validate_citation_lock

    sentences = [
        CitedSentence(index=0, text="Has citation [citation:1].", chunk_ids=[1]),
        CitedSentence(index=1, text="No citation here.", chunk_ids=[]),
    ]
    candidate_ids = {1}
    db = _StubSession({1: 100})

    result = await validate_citation_lock(sentences, candidate_ids, plant_id=100, db=db)
    assert not result.valid
    assert result.failure_reason == "uncited_sentence"
    assert result.failed_sentence == "No citation here."


@pytest.mark.asyncio
async def test_validate_rejects_out_of_set_chunk() -> None:
    from cassini.core.rag.citation_lock import validate_citation_lock

    sentences = [
        CitedSentence(index=0, text="Bogus [citation:99].", chunk_ids=[99]),
    ]
    candidate_ids = {1, 2, 3}  # 99 not in set
    db = _StubSession({1: 100, 2: 100, 3: 100})

    result = await validate_citation_lock(sentences, candidate_ids, plant_id=100, db=db)
    assert not result.valid
    assert result.failure_reason == "out_of_set"
    assert result.failed_chunk_id == 99


@pytest.mark.asyncio
async def test_validate_rejects_cross_plant_chunk() -> None:
    from cassini.core.rag.citation_lock import validate_citation_lock

    sentences = [
        CitedSentence(index=0, text="Cross-plant [citation:5].", chunk_ids=[5]),
    ]
    candidate_ids = {5}  # caller's retriever erroneously included it
    db = _StubSession({5: 200})  # but DB says it belongs to plant 200

    result = await validate_citation_lock(sentences, candidate_ids, plant_id=100, db=db)
    assert not result.valid
    assert result.failure_reason == "cross_plant"
    assert result.failed_chunk_id == 5


@pytest.mark.asyncio
async def test_validate_rejects_empty_response() -> None:
    from cassini.core.rag.citation_lock import validate_citation_lock

    db = _StubSession({})
    result = await validate_citation_lock([], set(), plant_id=100, db=db)
    assert not result.valid
    assert result.failure_reason == "uncited_sentence"
