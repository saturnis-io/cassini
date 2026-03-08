---
title: Graph Visualization Research
type: design
status: research
date: 2026-03-07
tags:
  - graph
  - visualization
  - research
  - ux
  - competitive-analysis
---

# Graph Visualization Research

> **Full document**: `docs/plans/2026-03-07-graph-visualization-research.md`

## Summary

Comprehensive exploration of adding interactive graph visualization to Cassini. Research covers seven areas:

1. **Existing graph data** — mapped all 24+ node types and 30+ edge types already in the data model, no new data sources needed
2. **Library comparison** — evaluated D3, Cytoscape.js, react-force-graph, Sigma.js, vis-network, G6. **Recommendation: Cytoscape.js** (best balance of features, performance, layout algorithms, React integration)
3. **UX patterns** — progressive disclosure, semantic zoom, clustering, search+highlight, timeline filtering to avoid the "hairball problem"
4. **Seven concrete views** — Plant Topology, Correlation Web, Investigation Graph, Operator Map, Connectivity Architecture, Batch Traceability, Quality Impact Heatmap
5. **12 questions graphs answer** that tables/charts cannot (process propagation, operator patterns, infrastructure single points of failure, etc.)
6. **Competitive landscape** — **no SPC tool on the market offers graph visualization**. Closest analog is Boston Scientific's custom Neo4j solution. This would be category-defining.
7. **API design** — 8 endpoints, standardized node/edge JSON format, no new database tables required

## Key Decision

Cytoscape.js via `react-cytoscapejs` as primary library, with optional `react-force-graph-3d` for 3D correlation exploration (Three.js already a dependency).

## Related

- [[Sprint 9 - Advanced Analytics]] — correlation and multivariate data that feeds the correlation web view
- [[Anomaly Detection]] — anomaly events as starting points for investigation graph
- [[Sprint 7 - Gage Bridge]] — gage connectivity data for the connectivity architecture view
