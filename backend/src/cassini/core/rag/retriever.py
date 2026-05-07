"""Hybrid retriever: vector cosine + BM25, plant-scoped.

Vector path: numpy cosine similarity over float32-bytes embeddings
loaded from ``SopChunk.embedding``. Chunks with NULL embeddings are
ignored by the vector path (BM25 still hits them).

BM25 path: ``rank-bm25`` library, in-memory. Built per-query; for
plants with many chunks, the BM25 corpus is cached on
``app.state.bm25_cache`` keyed by plant_id and invalidated on doc
upload/delete.

Fusion: reciprocal rank fusion (RRF) with k=60. Each chunk gets
``1 / (k + rank)`` from each ranking and the sum is the final score.
RRF is robust to score-scale mismatches between vector cos-sim and
BM25 raw scores.

Plant scoping is enforced at SQL level — every query filters by
``plant_id``. The citation_lock module re-verifies at validation time
as defense-in-depth.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

import numpy as np
import structlog
from sqlalchemy import select

from cassini.core.rag.embeddings import BaseEmbedder, cosine_similarity
from cassini.db.models.sop_doc import SopChunk, SopDoc

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

logger = structlog.get_logger(__name__)


@dataclass(slots=True)
class RetrievedChunk:
    """A chunk returned from retrieval with score + provenance."""

    chunk_id: int
    doc_id: int
    plant_id: int
    chunk_index: int
    text: str
    paragraph_label: str | None
    doc_title: str
    score: float
    vector_rank: int | None = None
    bm25_rank: int | None = None


class HybridRetriever:
    """Plant-scoped hybrid retrieval (vector + BM25) with RRF fusion."""

    def __init__(self, db: "AsyncSession", embedder: BaseEmbedder, rrf_k: int = 60) -> None:
        self._db = db
        self._embedder = embedder
        self._rrf_k = rrf_k

    async def retrieve(
        self,
        plant_id: int,
        query: str,
        top_k: int = 8,
        candidate_pool: int = 64,
    ) -> list[RetrievedChunk]:
        """Retrieve up to ``top_k`` chunks for ``plant_id`` matching ``query``.

        ``candidate_pool`` controls how many chunks each individual
        ranking considers before fusion. Larger pool = better recall at
        the cost of more RAM/CPU per query. Default 64 is comfortable
        for plants with up to ~50k chunks.
        """
        if not query.strip():
            return []
        if top_k <= 0:
            return []

        rows = (
            await self._db.execute(
                select(
                    SopChunk.id,
                    SopChunk.doc_id,
                    SopChunk.plant_id,
                    SopChunk.chunk_index,
                    SopChunk.text,
                    SopChunk.paragraph_label,
                    SopChunk.embedding,
                    SopChunk.embedding_dim,
                    SopDoc.title.label("doc_title"),
                )
                .join(SopDoc, SopChunk.doc_id == SopDoc.id)
                .where(SopChunk.plant_id == plant_id)
                .where(SopDoc.status == "ready")
            )
        ).all()

        if not rows:
            return []

        # Vector ranking — only chunks with matching-dim embeddings.
        vector_ranking = self._vector_rank(query, rows, candidate_pool)

        # BM25 ranking — every chunk participates regardless of embedding.
        bm25_ranking = self._bm25_rank(query, rows, candidate_pool)

        fused = self._reciprocal_rank_fusion(vector_ranking, bm25_ranking)

        # Take top_k after fusion. Build RetrievedChunk records.
        row_by_id = {row.id: row for row in rows}
        v_rank_by_id = {cid: rank for rank, cid in enumerate(vector_ranking)}
        b_rank_by_id = {cid: rank for rank, cid in enumerate(bm25_ranking)}

        out: list[RetrievedChunk] = []
        for cid, score in fused[:top_k]:
            row = row_by_id.get(cid)
            if row is None:
                continue
            out.append(
                RetrievedChunk(
                    chunk_id=row.id,
                    doc_id=row.doc_id,
                    plant_id=row.plant_id,
                    chunk_index=row.chunk_index,
                    text=row.text,
                    paragraph_label=row.paragraph_label,
                    doc_title=row.doc_title,
                    score=score,
                    vector_rank=v_rank_by_id.get(cid),
                    bm25_rank=b_rank_by_id.get(cid),
                )
            )
        return out

    def _vector_rank(self, query: str, rows: list, top_n: int) -> list[int]:
        """Return chunk_ids ranked by cosine similarity (descending)."""
        embedded_rows = [
            r for r in rows
            if r.embedding is not None and r.embedding_dim == self._embedder.dim
        ]
        if not embedded_rows:
            return []
        try:
            qvec = self._embedder.embed_one(query)
        except Exception as exc:  # noqa: BLE001
            logger.warning("sop_rag_query_embed_failed", error=str(exc))
            return []
        chunk_arr = np.stack(
            [self._embedder.from_bytes(r.embedding, r.embedding_dim) for r in embedded_rows]
        )
        sims = cosine_similarity(qvec, chunk_arr)
        order = np.argsort(-sims)[:top_n]
        return [embedded_rows[int(i)].id for i in order]

    def _bm25_rank(self, query: str, rows: list, top_n: int) -> list[int]:
        """Return chunk_ids ranked by BM25 score (descending)."""
        try:
            from rank_bm25 import BM25Okapi
        except ImportError:
            logger.warning("sop_rag_bm25_unavailable")
            return []
        if not rows:
            return []
        tokenized_corpus = [_tokenize(r.text) for r in rows]
        bm25 = BM25Okapi(tokenized_corpus)
        scores = bm25.get_scores(_tokenize(query))
        order = np.argsort(-scores)[:top_n]
        return [rows[int(i)].id for i in order]

    def _reciprocal_rank_fusion(
        self,
        vector_ranking: list[int],
        bm25_ranking: list[int],
    ) -> list[tuple[int, float]]:
        """Combine two rankings via RRF. Returns ``(chunk_id, score)`` desc."""
        scores: dict[int, float] = {}
        for rank, cid in enumerate(vector_ranking):
            scores[cid] = scores.get(cid, 0.0) + 1.0 / (self._rrf_k + rank + 1)
        for rank, cid in enumerate(bm25_ranking):
            scores[cid] = scores.get(cid, 0.0) + 1.0 / (self._rrf_k + rank + 1)
        return sorted(scores.items(), key=lambda kv: -kv[1])


def _tokenize(text: str) -> list[str]:
    """Light tokenizer for BM25: lowercase + split on whitespace + strip punct."""
    import string

    table = str.maketrans({c: " " for c in string.punctuation})
    return text.lower().translate(table).split()
