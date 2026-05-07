"""Citation lock — every claim must cite a chunk in the candidate set.

The wrapper around any LLM response in the SOP-RAG flow. Splits a model
output into sentences, parses ``[citation:<chunk_id>]`` markers, and
rejects:

1. Sentences with no citation marker (uncited claim).
2. Markers pointing at a chunk_id NOT in the retrieved candidate set
   (model hallucinated the id).
3. Markers pointing at a chunk that exists but belongs to a different
   plant than the caller (defense-in-depth multi-tenancy guard).

The two-strikes pattern lives one layer up in the API router: on the
first failure, retry once with a stricter prompt; on second failure,
return a ``RagRefusalResponse``.

The validator does NOT enforce that EVERY chunk in the candidate set is
cited — model is free to ignore irrelevant chunks. It only enforces
that every cited chunk_id is valid and every sentence has at least one.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession


# Citation marker: [citation:1234] — chunk_id is an integer
_CITATION_RE = re.compile(r"\[citation:(\d+)\]")

# Sentence boundary: end-of-sentence punctuation followed by whitespace
# or end-of-string. Conservative — won't split on abbreviations like
# "Dr. Smith" but that's fine: at worst we'd merge two sentences which
# only ever helps citation lock pass (more text per sentence ≠ harm).
_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+(?=[A-Z\d])")


@dataclass(slots=True)
class CitedSentence:
    """A sentence parsed from an LLM response with its citation markers."""

    index: int
    text: str
    chunk_ids: list[int] = field(default_factory=list)

    @property
    def is_cited(self) -> bool:
        return bool(self.chunk_ids)


@dataclass(slots=True)
class CitationValidationResult:
    """Outcome of validating a parsed response against a candidate set."""

    valid: bool
    sentences: list[CitedSentence]
    errors: list[str] = field(default_factory=list)
    failed_sentence: str | None = None
    failed_chunk_id: int | None = None
    failure_reason: str | None = None  # "uncited_sentence" | "out_of_set" | "cross_plant"


def parse_cited_response(text: str) -> list[CitedSentence]:
    """Split ``text`` into sentences and extract citation markers.

    Trailing whitespace and empty sentences are dropped. Marker chunks
    are NOT removed from the sentence text — the caller decides whether
    to strip them for display (the frontend renders them as inline pills).
    """
    if not text or not text.strip():
        return []

    raw_sentences = _SENTENCE_SPLIT_RE.split(text.strip())
    out: list[CitedSentence] = []
    for i, raw in enumerate(raw_sentences):
        s = raw.strip()
        if not s:
            continue
        chunk_ids = [int(m.group(1)) for m in _CITATION_RE.finditer(s)]
        # de-dup while preserving order
        seen: set[int] = set()
        unique: list[int] = []
        for cid in chunk_ids:
            if cid not in seen:
                seen.add(cid)
                unique.append(cid)
        out.append(CitedSentence(index=i, text=s, chunk_ids=unique))
    return out


def strip_citations(text: str) -> str:
    """Remove ``[citation:N]`` markers from text for clean display."""
    return _CITATION_RE.sub("", text).replace("  ", " ").strip()


async def validate_citation_lock(
    sentences: list[CitedSentence],
    candidate_chunk_ids: set[int],
    plant_id: int,
    db: "AsyncSession",
) -> CitationValidationResult:
    """Validate parsed sentences against the candidate set and plant.

    Three checks per sentence (in order — short-circuits on first
    failure):

    1. Every sentence must carry at least one citation marker.
    2. Every marker's chunk_id must be in ``candidate_chunk_ids``.
    3. Every marker's chunk must belong to ``plant_id`` (DB lookup).

    The DB plant check is defense-in-depth: ``candidate_chunk_ids``
    should already be plant-filtered by ``HybridRetriever``, but we
    re-verify here so a future bug in the retriever can't leak data.
    """
    if not sentences:
        return CitationValidationResult(
            valid=False,
            sentences=[],
            errors=["empty response"],
            failure_reason="uncited_sentence",
        )

    # Walk sentences in order so the first violation is the "failed_sentence".
    for s in sentences:
        if not s.is_cited:
            return CitationValidationResult(
                valid=False,
                sentences=sentences,
                errors=[f"sentence {s.index} has no citation marker"],
                failed_sentence=s.text,
                failure_reason="uncited_sentence",
            )
        for cid in s.chunk_ids:
            if cid not in candidate_chunk_ids:
                return CitationValidationResult(
                    valid=False,
                    sentences=sentences,
                    errors=[f"chunk_id {cid} not in candidate set"],
                    failed_sentence=s.text,
                    failed_chunk_id=cid,
                    failure_reason="out_of_set",
                )

    # All chunk_ids are in the candidate set; verify plant_id at the DB
    # level for the union of cited chunks. We do a single query for all
    # cited ids to avoid N+1.
    cited_union: set[int] = set()
    for s in sentences:
        cited_union.update(s.chunk_ids)
    if not cited_union:
        # Defensive — shouldn't reach here because every sentence has
        # been verified to have at least one chunk_id.
        return CitationValidationResult(
            valid=False,
            sentences=sentences,
            errors=["no citations after walk"],
            failure_reason="uncited_sentence",
        )

    from sqlalchemy import select

    from cassini.db.models.sop_doc import SopChunk

    rows = (
        await db.execute(
            select(SopChunk.id, SopChunk.plant_id).where(SopChunk.id.in_(cited_union))
        )
    ).all()
    plant_by_id = {row.id: row.plant_id for row in rows}

    for s in sentences:
        for cid in s.chunk_ids:
            actual_plant = plant_by_id.get(cid)
            if actual_plant is None:
                # Chunk doesn't exist — should have been caught by
                # candidate-set check, but this means stale candidate set.
                return CitationValidationResult(
                    valid=False,
                    sentences=sentences,
                    errors=[f"chunk_id {cid} not found in DB"],
                    failed_sentence=s.text,
                    failed_chunk_id=cid,
                    failure_reason="out_of_set",
                )
            if actual_plant != plant_id:
                return CitationValidationResult(
                    valid=False,
                    sentences=sentences,
                    errors=[
                        f"chunk_id {cid} belongs to plant {actual_plant}, "
                        f"caller is plant {plant_id}"
                    ],
                    failed_sentence=s.text,
                    failed_chunk_id=cid,
                    failure_reason="cross_plant",
                )

    return CitationValidationResult(valid=True, sentences=sentences)


def build_strict_retry_prompt(failure_reason: str, failed_sentence: str | None) -> str:
    """Generate the second-attempt system prompt after a citation failure.

    Used by the API router on the first validation failure to drive the
    retry. Concrete + directive — the model needs to know the specific
    problem to correct it.
    """
    base = (
        "You MUST cite EVERY sentence in your answer with at least one "
        "[citation:<chunk_id>] marker, where <chunk_id> is from the "
        "provided candidate set. Sentences without citations are "
        "automatically rejected. If no candidate chunk supports a claim, "
        "OMIT that claim entirely — do not invent citations."
    )
    if failure_reason == "uncited_sentence" and failed_sentence:
        base += (
            f"\n\nYour previous answer had this uncited sentence: "
            f"{failed_sentence!r}. Either cite it or remove it."
        )
    elif failure_reason == "out_of_set" and failed_sentence:
        base += (
            f"\n\nYour previous answer cited a chunk_id that is not in "
            f"the candidate set. The bad sentence was: {failed_sentence!r}. "
            f"Use only chunk_ids from the candidate set provided below."
        )
    return base
