"""Embedding providers for SOP-grounded RAG.

Two providers ship out of the box:

* ``LocalEmbedder`` — sentence-transformers ``all-MiniLM-L6-v2`` (384 dims).
  Default. Runs CPU-only, no external API. Loaded lazily on first use so
  the cassini package can import without paying the model-load cost.
* ``VoyageEmbedder`` — Voyage AI ``voyage-3-lite`` (512 dims). Opt-in via
  ``VOYAGE_API_KEY`` env var. HTTP call per batch.

Each embedder reports its ``model_name`` and ``dim`` so chunks can be
tagged at index time and the retriever can refuse to score across
mismatched dimensions.

Embeddings are stored as numpy ``float32`` byte sequences (``np.tobytes()``
on the array). The dimension is recorded in ``SopChunk.embedding_dim``.

The ``rag`` extras group (``pip install 'cassini[rag]'``) provides the
optional deps. Calling ``LocalEmbedder.embed`` without sentence-transformers
installed raises ``RuntimeError`` with the install hint.
"""
from __future__ import annotations

import os
from abc import ABC, abstractmethod
from typing import TYPE_CHECKING

import numpy as np

if TYPE_CHECKING:
    from numpy.typing import NDArray


class BaseEmbedder(ABC):
    """Abstract embedding provider."""

    model_name: str
    dim: int

    @abstractmethod
    def embed(self, texts: list[str]) -> "NDArray[np.float32]":
        """Embed a batch of strings. Returns an ``(N, dim)`` float32 array."""

    def embed_one(self, text: str) -> "NDArray[np.float32]":
        """Embed a single string. Returns a ``(dim,)`` float32 array."""
        return self.embed([text])[0]

    def to_bytes(self, vec: "NDArray[np.float32]") -> bytes:
        """Serialize a single embedding to bytes for DB storage."""
        return np.ascontiguousarray(vec, dtype=np.float32).tobytes()

    def from_bytes(self, blob: bytes, dim: int | None = None) -> "NDArray[np.float32]":
        """Deserialize an embedding from DB bytes."""
        arr = np.frombuffer(blob, dtype=np.float32)
        expected = dim or self.dim
        if arr.shape[0] != expected:
            raise ValueError(
                f"Embedding dim mismatch: blob has {arr.shape[0]}, expected {expected}"
            )
        return arr


class LocalEmbedder(BaseEmbedder):
    """sentence-transformers all-MiniLM-L6-v2, 384 dims, CPU-friendly.

    Model weights download to the HuggingFace cache on first use
    (~90MB). Set ``HF_HOME`` to control cache location for offline
    deployments — air-gapped sites should pre-cache the model.
    """

    model_name = "all-MiniLM-L6-v2"
    dim = 384

    def __init__(self) -> None:
        self._model = None

    def _ensure_model(self) -> None:
        if self._model is not None:
            return
        try:
            from sentence_transformers import SentenceTransformer
        except ImportError as exc:
            raise RuntimeError(
                "LocalEmbedder requires the 'rag' extras. "
                "Install with: pip install 'cassini[rag]'"
            ) from exc
        self._model = SentenceTransformer(self.model_name)

    def embed(self, texts: list[str]) -> "NDArray[np.float32]":
        if not texts:
            return np.zeros((0, self.dim), dtype=np.float32)
        self._ensure_model()
        assert self._model is not None
        arr = self._model.encode(
            texts,
            convert_to_numpy=True,
            normalize_embeddings=True,
            show_progress_bar=False,
        )
        return arr.astype(np.float32, copy=False)


class VoyageEmbedder(BaseEmbedder):
    """Voyage AI voyage-3-lite, 512 dims. Requires ``VOYAGE_API_KEY``."""

    model_name = "voyage-3-lite"
    dim = 512

    def __init__(self, api_key: str | None = None, batch_size: int = 32) -> None:
        self._api_key = api_key or os.environ.get("VOYAGE_API_KEY")
        if not self._api_key:
            raise RuntimeError(
                "VoyageEmbedder requires VOYAGE_API_KEY env var or explicit api_key"
            )
        self._batch_size = batch_size

    def embed(self, texts: list[str]) -> "NDArray[np.float32]":
        if not texts:
            return np.zeros((0, self.dim), dtype=np.float32)
        try:
            import httpx
        except ImportError as exc:
            raise RuntimeError("VoyageEmbedder requires httpx") from exc
        out: list[list[float]] = []
        for start in range(0, len(texts), self._batch_size):
            batch = texts[start : start + self._batch_size]
            r = httpx.post(
                "https://api.voyageai.com/v1/embeddings",
                headers={"Authorization": f"Bearer {self._api_key}"},
                json={"input": batch, "model": self.model_name, "input_type": "document"},
                timeout=30.0,
            )
            r.raise_for_status()
            payload = r.json()
            out.extend(item["embedding"] for item in payload["data"])
        arr = np.asarray(out, dtype=np.float32)
        norms = np.linalg.norm(arr, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        return arr / norms


_KNOWN: dict[str, type[BaseEmbedder]] = {
    "local": LocalEmbedder,
    "all-MiniLM-L6-v2": LocalEmbedder,
    "voyage": VoyageEmbedder,
    "voyage-3-lite": VoyageEmbedder,
}


def create_embedder(name: str = "local") -> BaseEmbedder:
    """Factory: pick an embedder by short name or model_name.

    Defaults to ``LocalEmbedder``. Raises ``ValueError`` on unknown name.
    """
    cls = _KNOWN.get(name)
    if cls is None:
        raise ValueError(
            f"Unknown embedder: {name!r}. Known: {sorted(_KNOWN)}"
        )
    return cls()


def cosine_similarity(
    query: "NDArray[np.float32]", chunks: "NDArray[np.float32]"
) -> "NDArray[np.float32]":
    """Cosine similarity between a query vector and a stack of chunk vectors.

    Both inputs are assumed L2-normalized (LocalEmbedder and VoyageEmbedder
    both normalize). Returns ``(N,)`` array of similarities in ``[-1, 1]``.
    """
    if chunks.ndim == 1:
        chunks = chunks.reshape(1, -1)
    return chunks @ query
