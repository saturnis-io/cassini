---
title: Semantic Pattern Search
type: design
status: research
date: 2026-03-07
tags:
  - analytics
  - pattern-search
  - time-series
  - similarity
  - feature-engineering
  - commercial
---

# Semantic Pattern Search

Search SPC quality history by **pattern similarity** rather than keywords. Find historical subsequences that are similar in shape to a query pattern, regardless of amplitude, offset, or time scale.

## Status

Research complete. No code written. Ready for design review and prioritization.

## Full Document

See `docs/plans/2026-03-07-semantic-pattern-search-research.md` for the complete research document covering:

1. Use cases and personas
2. Six time-series similarity approaches compared (DTW, feature vectors, Matrix Profile, shapelets, learned embeddings, SAX)
3. Recommended approach: **statistical feature extraction pipeline** (19 features x 3 scales = 57-dimensional vector)
4. Pattern taxonomy (13 canonical SPC patterns with fingerprints)
5. UI/UX concepts ("Find Similar" from chart selection, pattern library browser)
6. Competitive landscape (no SPC vendor offers this today)
7. Feedback loop and AI agent integration
8. Technical requirements (pgvector, STUMPY, phased rollout)

## Key Decisions

- **Primary approach**: Statistical feature vectors (interpretable, fast, SPC-native) over learned embeddings (black box, overkill at current scale)
- **Storage**: pgvector for PostgreSQL, brute-force JSON for SQLite/dev
- **Tier**: Commercial feature (pattern library taxonomy is free, search engine is commercial)
- **Dependencies**: `stumpy` (Matrix Profile), `tslearn` (DTW), `pgvector` (Python) -- no PyTorch

## Related Notes

- [[Anomaly Detection]] -- existing PELT/K-S/Isolation Forest detectors
- [[AI Quality Agent Research]] -- AI analysis integration point
- [[Show Your Work]] -- explainability philosophy applies to similarity scores
- [[Sprint 9 - Advanced Analytics]] -- multivariate and predictive analytics context
- [[Open-Core Plugin Architecture]] -- commercial-tier extension point
