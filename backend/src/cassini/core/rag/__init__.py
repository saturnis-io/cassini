"""SOP-grounded RAG (Retrieval-Augmented Generation) with citation lock.

Public surface — keep this module thin so the migration can do the
heavy lifting in submodules:

* ``embeddings`` — pluggable embedder (sentence-transformers default,
  Voyage AI opt-in).
* ``indexer`` — chunk + embed an uploaded SopDoc.
* ``retriever`` — hybrid (vector + BM25) plant-scoped retrieval.
* ``citation_lock`` — parse + validate ``[citation:<chunk_id>]`` markers
  in LLM responses; reject any uncited sentence with a two-strikes
  refusal pattern.

The feature is gated behind the Enterprise tier via the ``sop_rag``
licensing feature key.
"""
from cassini.core.rag.citation_lock import (
    CitationValidationResult,
    CitedSentence,
    parse_cited_response,
    validate_citation_lock,
)
from cassini.core.rag.embeddings import (
    BaseEmbedder,
    LocalEmbedder,
    VoyageEmbedder,
    create_embedder,
)
from cassini.core.rag.indexer import (
    chunk_text,
    extract_text,
    index_document,
)
from cassini.core.rag.retriever import HybridRetriever, RetrievedChunk

__all__ = [
    "BaseEmbedder",
    "LocalEmbedder",
    "VoyageEmbedder",
    "create_embedder",
    "chunk_text",
    "extract_text",
    "index_document",
    "HybridRetriever",
    "RetrievedChunk",
    "CitationValidationResult",
    "CitedSentence",
    "parse_cited_response",
    "validate_citation_lock",
]
