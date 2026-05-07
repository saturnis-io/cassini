"""Unit tests for the embeddings module — factory + serialization.

The actual model load (sentence-transformers) is heavy; we don't load
it in unit tests. The factory and bytes round-trip are covered here
with a tiny stub embedder.
"""
from __future__ import annotations

import numpy as np
import pytest

from cassini.core.rag.embeddings import (
    BaseEmbedder,
    LocalEmbedder,
    VoyageEmbedder,
    cosine_similarity,
    create_embedder,
)


class _StubEmbedder(BaseEmbedder):
    model_name = "stub"
    dim = 4

    def embed(self, texts):  # type: ignore[override]
        return np.tile(np.array([1, 0, 0, 0], dtype=np.float32), (len(texts), 1))


def test_create_embedder_known_short_name_returns_local() -> None:
    emb = create_embedder("local")
    assert isinstance(emb, LocalEmbedder)
    assert emb.dim == 384


def test_create_embedder_alias_model_name() -> None:
    emb = create_embedder("all-MiniLM-L6-v2")
    assert isinstance(emb, LocalEmbedder)


def test_create_embedder_voyage_requires_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("VOYAGE_API_KEY", raising=False)
    with pytest.raises(RuntimeError, match="VOYAGE_API_KEY"):
        create_embedder("voyage")


def test_create_embedder_voyage_with_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("VOYAGE_API_KEY", "fake-key")
    emb = create_embedder("voyage")
    assert isinstance(emb, VoyageEmbedder)
    assert emb.dim == 512


def test_create_embedder_unknown_raises() -> None:
    with pytest.raises(ValueError, match="Unknown embedder"):
        create_embedder("nonexistent")


def test_to_bytes_from_bytes_round_trip() -> None:
    emb = _StubEmbedder()
    vec = np.array([0.1, -0.2, 0.3, -0.4], dtype=np.float32)
    blob = emb.to_bytes(vec)
    assert isinstance(blob, bytes)
    assert len(blob) == 4 * 4  # 4 floats * 4 bytes
    out = emb.from_bytes(blob)
    np.testing.assert_array_equal(out, vec)


def test_from_bytes_dim_mismatch_raises() -> None:
    emb = _StubEmbedder()
    blob = np.array([1, 2, 3], dtype=np.float32).tobytes()  # only 3 dims
    with pytest.raises(ValueError, match="Embedding dim mismatch"):
        emb.from_bytes(blob)


def test_embed_one_returns_single_vector() -> None:
    emb = _StubEmbedder()
    out = emb.embed_one("test")
    assert out.shape == (4,)


def test_cosine_similarity_normalized_vectors() -> None:
    q = np.array([1, 0, 0, 0], dtype=np.float32)
    chunks = np.array(
        [
            [1, 0, 0, 0],   # identical -> cos=1
            [0, 1, 0, 0],   # orthogonal -> cos=0
            [-1, 0, 0, 0],  # opposite -> cos=-1
        ],
        dtype=np.float32,
    )
    sims = cosine_similarity(q, chunks)
    np.testing.assert_allclose(sims, [1.0, 0.0, -1.0], atol=1e-6)


def test_cosine_similarity_single_chunk_reshape() -> None:
    q = np.array([1, 0, 0, 0], dtype=np.float32)
    chunk = np.array([1, 0, 0, 0], dtype=np.float32)
    sims = cosine_similarity(q, chunk)
    assert sims.shape == (1,)


def test_local_embedder_no_extras_raises_clear_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """If sentence-transformers is missing, ``embed`` raises with install hint."""
    import sys

    # Ensure import-time failure path runs every call by clearing model cache
    monkeypatch.setitem(sys.modules, "sentence_transformers", None)
    emb = LocalEmbedder()
    with pytest.raises(RuntimeError, match="rag"):
        emb.embed(["text"])
