"""Unit tests for the retriever module — fusion + tokenization.

DB-coupled retrieval (vector cosine + BM25 scoring against persisted
chunks) is exercised in integration tests.
"""
from __future__ import annotations

from unittest.mock import AsyncMock

import numpy as np
import pytest

from cassini.core.rag.embeddings import BaseEmbedder
from cassini.core.rag.retriever import HybridRetriever, _tokenize


class _StubEmbedder(BaseEmbedder):
    model_name = "stub"
    dim = 4

    def embed(self, texts):  # type: ignore[override]
        return np.tile(np.array([1, 0, 0, 0], dtype=np.float32), (len(texts), 1))


def test_tokenize_lowercases_and_strips_punctuation() -> None:
    assert _tokenize("Tighten the BOLT, then verify!") == [
        "tighten", "the", "bolt", "then", "verify",
    ]


def test_tokenize_empty_input() -> None:
    assert _tokenize("") == []
    assert _tokenize("   ") == []


def test_tokenize_handles_hyphens_and_punct() -> None:
    # Punctuation -> space; hyphens are punctuation so they split.
    assert _tokenize("M6x1.0 self-locking bolt.") == [
        "m6x1", "0", "self", "locking", "bolt",
    ]


def test_reciprocal_rank_fusion_known_overlap() -> None:
    """Chunk that ranks highly in both should rank first overall."""
    db = AsyncMock()
    embedder = _StubEmbedder()
    r = HybridRetriever(db=db, embedder=embedder, rrf_k=60)

    vector_ranking = [10, 20, 30]   # 10 ranks first by vector
    bm25_ranking = [10, 40, 50]     # 10 also ranks first by BM25

    fused = r._reciprocal_rank_fusion(vector_ranking, bm25_ranking)
    fused_ids = [cid for cid, _ in fused]

    # 10 must rank first because it scored in both rankings
    assert fused_ids[0] == 10
    # 20, 30, 40, 50 follow but their relative order depends on rank.
    assert set(fused_ids) == {10, 20, 30, 40, 50}


def test_reciprocal_rank_fusion_only_one_ranking_path() -> None:
    db = AsyncMock()
    embedder = _StubEmbedder()
    r = HybridRetriever(db=db, embedder=embedder, rrf_k=60)
    fused = r._reciprocal_rank_fusion([1, 2, 3], [])
    assert [cid for cid, _ in fused] == [1, 2, 3]


@pytest.mark.asyncio
async def test_retrieve_blank_query_returns_empty() -> None:
    db = AsyncMock()
    embedder = _StubEmbedder()
    r = HybridRetriever(db=db, embedder=embedder)
    out = await r.retrieve(plant_id=1, query="   ", top_k=8)
    assert out == []
    db.execute.assert_not_called()


@pytest.mark.asyncio
async def test_retrieve_zero_top_k_returns_empty() -> None:
    db = AsyncMock()
    embedder = _StubEmbedder()
    r = HybridRetriever(db=db, embedder=embedder)
    out = await r.retrieve(plant_id=1, query="hello", top_k=0)
    assert out == []
    db.execute.assert_not_called()
