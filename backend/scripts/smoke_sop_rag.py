"""Real-API smoke test for SOP-grounded RAG citation lock.

Validates that the system prompt actually causes Anthropic Claude to
emit ``[citation:<chunk_id>]`` markers in the right shape so the
citation lock pass succeeds against real model output (not just mocks).

Usage::

    set -a; source .env.test; set +a
    python scripts/smoke_sop_rag.py

Cost ceiling: $0.50 (hard halt). Each run is one or two LLM calls
against ``claude-sonnet-4-6`` — typically <$0.05 total.

Exit codes:
    0  = citation lock validated against real LLM
    1  = citation lock failed (means our system prompt isn't strong enough)
    2  = environment / setup failure
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path

# Ensure cassini source is importable from the worktree.
sys.path.insert(
    0,
    str(Path(__file__).resolve().parent.parent / "src"),
)

from cassini.core.ai_analysis.providers import ClaudeProvider  # noqa: E402
from cassini.core.rag.citation_lock import (  # noqa: E402
    parse_cited_response,
    strip_citations,
)


HARD_HALT_USD = 0.50
INPUT_PRICE_PER_MTOK = 3.0
OUTPUT_PRICE_PER_MTOK = 15.0


# Minimal candidate set the model should cite from. IDs are the
# integer chunk ids the citation lock validates against.
CANDIDATE_CHUNKS = [
    {
        "chunk_id": 101,
        "doc_title": "Bolt torque procedure",
        "paragraph_label": "Tightening sequence",
        "text": (
            "Tighten the M6 bolt to 12 Nm using the calibrated torque wrench. "
            "Apply Loctite 243 to the threads before assembly. Verify torque "
            "after 24 hours of cure time."
        ),
    },
    {
        "chunk_id": 102,
        "doc_title": "Bolt torque procedure",
        "paragraph_label": "Inspection",
        "text": (
            "After the cure period the operator must sign the inspection sheet "
            "in section 3-B. Operator ID is logged with timestamp."
        ),
    },
    {
        "chunk_id": 103,
        "doc_title": "Lubricant control plan",
        "paragraph_label": None,
        "text": (
            "Loctite 243 has a shelf life of 24 months from the manufacture "
            "date. Refrigerated storage extends this to 30 months."
        ),
    },
]


SYSTEM_PROMPT = (
    "You are an SOP investigator. Answer the operator's question using ONLY "
    "the candidate SOP chunks provided below. Every sentence in your answer "
    "MUST end with at least one [citation:<chunk_id>] marker referencing a "
    "chunk_id from the candidate set. If the candidate chunks don't contain "
    "the answer, say so plainly with a single citation to the closest chunk. "
    "Do NOT invent chunk_ids. Do NOT cite chunks that don't appear below.\n\n"
    "Candidate chunks:\n\n"
)
for ch in CANDIDATE_CHUNKS:
    label = f" [{ch['paragraph_label']}]" if ch["paragraph_label"] else ""
    SYSTEM_PROMPT += (
        f"chunk_id={ch['chunk_id']} | doc={ch['doc_title']}{label}\n"
        f"---\n{ch['text']}\n---\n\n"
    )


def _cost(in_tok: int, out_tok: int) -> float:
    return in_tok * INPUT_PRICE_PER_MTOK / 1e6 + out_tok * OUTPUT_PRICE_PER_MTOK / 1e6


async def main() -> int:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("ERR: ANTHROPIC_API_KEY missing — load .env.test first.")
        return 2

    provider = ClaudeProvider(
        api_key=api_key, model="claude-sonnet-4-6", max_tokens=1024
    )

    question = "What torque setting do I use for the M6 bolt and when do I sign off?"
    print(f"Q: {question}\n")

    response = await provider.generate(system_prompt=SYSTEM_PROMPT, user_prompt=question)
    answer = response.content or ""
    cost = _cost(response.input_tokens, response.output_tokens)
    print(f"A (raw):\n{answer}\n")
    print(f"Tokens: {response.input_tokens} in / {response.output_tokens} out")
    print(f"Cost:   ${cost:.4f}\n")

    if cost > HARD_HALT_USD:
        print(f"FAIL: cost ${cost:.4f} exceeded hard halt ${HARD_HALT_USD}")
        return 1

    sentences = parse_cited_response(answer)
    if not sentences:
        print("FAIL: no sentences parsed")
        return 1

    candidate_ids = {ch["chunk_id"] for ch in CANDIDATE_CHUNKS}
    issues: list[str] = []

    for s in sentences:
        if not s.is_cited:
            issues.append(f"Sentence {s.index} uncited: {s.text!r}")
        for cid in s.chunk_ids:
            if cid not in candidate_ids:
                issues.append(
                    f"Sentence {s.index} cites chunk_id {cid} not in candidate set"
                )

    if issues:
        print("FAIL: citation lock violations against real LLM output:")
        for issue in issues:
            print(f"  - {issue}")
        print("\nThis means the system prompt isn't strong enough; the two-strikes")
        print("retry path would kick in (with another LLM call).")
        return 1

    print("OK: citation lock satisfied on the first attempt.")
    print(f"  Sentences: {len(sentences)}")
    print(f"  Cited chunks: {sorted({c for s in sentences for c in s.chunk_ids})}")
    print(f"  Stripped answer:\n  {strip_citations(answer)}")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
