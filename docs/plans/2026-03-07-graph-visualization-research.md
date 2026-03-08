# Graph Visualization for Cassini SPC Platform — Research Document

**Date:** 2026-03-07
**Type:** Research / Exploration
**Status:** Draft

---

## 1. Graph Data Already in Cassini

Cassini's ~45 SQLAlchemy models contain a rich web of relationships that are already queryable without adding any new data sources. Below is a complete entity-relationship map of what could be visualized as a graph.

### 1.1 Node Types (Entities)

| Node Type | Model | Key Fields | Approx. Count Range |
|-----------|-------|------------|---------------------|
| **Plant** | `Plant` | name, code, capability thresholds | 1-20 |
| **Hierarchy** | `Hierarchy` | name, type (Line/Cell/Equipment/Tag) | 10-500 |
| **Characteristic** | `Characteristic` | name, data_type, chart_type, spec limits | 50-10,000 |
| **Sample** | `Sample` | timestamp, operator_id, batch_number | 1,000-1,000,000+ |
| **Violation** | `Violation` | rule_id, rule_name, severity, acknowledged | 100-100,000 |
| **Anomaly Event** | `AnomalyEvent` | detector_type, event_type, severity, summary | 10-10,000 |
| **Gage Port** | `GagePort` | port_name, protocol_profile, characteristic_id | 1-200 |
| **Gage Bridge** | `GageBridge` | name, status, last_heartbeat_at | 1-50 |
| **MQTT Broker** | `MQTTBroker` | name, host, port | 1-10 |
| **OPC-UA Server** | `OPCUAServer` | name, endpoint_url | 1-10 |
| **Data Source** | `DataSource` (MQTT/OPC-UA) | topic/node_id, trigger_strategy | 10-5,000 |
| **MSA Study** | `MSAStudy` | name, study_type, status, characteristic_id | 1-500 |
| **MSA Operator** | `MSAOperator` | name (appraiser in study) | 5-100 |
| **FAI Report** | `FAIReport` | part_number, status, created_by/approved_by | 1-1,000 |
| **FAI Item** | `FAIItem` | characteristic_name, result, characteristic_id | 10-10,000 |
| **DOE Study** | `DOEStudy` | name, design_type, status | 1-100 |
| **DOE Factor** | `DOEFactor` | name, low/high levels | 2-20 per study |
| **Multivariate Group** | `MultivariateGroup` | name, chart_type, phase | 1-100 |
| **Correlation Result** | `CorrelationResult` | method, matrix, p_values | 1-500 |
| **Capability Snapshot** | `CapabilityHistory` | cpk, ppk, cp, pp, cpm | 100-100,000 |
| **User** | `User` | username, full_name, is_active | 5-500 |
| **ERP Connector** | `ERPConnector` | name, connector_type, status | 1-10 |
| **Prediction Config** | `PredictionConfig` | model_type, forecast_horizon | 1-5,000 |
| **Audit Log** | `AuditLog` | action, resource_type, resource_id, username | 1,000-10,000,000 |
| **Operator** (implicit) | `Sample.operator_id` (string, not FK) | operator identifier | 5-200 |

### 1.2 Edge Types (Relationships)

| Edge | From | To | Cardinality | Meaning |
|------|------|----|-------------|---------|
| **contains** | Plant | Hierarchy (root) | 1:N | Plant contains top-level hierarchy nodes |
| **parent_of** | Hierarchy | Hierarchy | 1:N | Equipment hierarchy tree |
| **has_characteristic** | Hierarchy | Characteristic | 1:N | Equipment measures characteristic |
| **measured_by** | Characteristic | GagePort | 1:1 | Physical gage connection |
| **hosted_on** | GagePort | GageBridge | N:1 | Port belongs to bridge agent |
| **feeds_via** | DataSource (MQTT) | MQTTBroker | N:1 | Data flows through broker |
| **feeds_via** | DataSource (OPC-UA) | OPCUAServer | N:1 | Data flows through server |
| **automated_by** | Characteristic | DataSource | 1:0..1 | Characteristic has data source |
| **produced_sample** | Characteristic | Sample | 1:N | Data collection relationship |
| **recorded_by** | Sample | Operator (implicit) | N:1 | Which operator took the measurement |
| **triggered** | Sample | Violation | 1:N | Sample triggered rule violations |
| **detected_on** | AnomalyEvent | Characteristic | N:1 | Anomaly detected on characteristic |
| **at_sample** | AnomalyEvent | Sample | N:0..1 | Anomaly linked to specific sample |
| **correlated_with** | Characteristic | Characteristic | N:N | Statistical correlation (from CorrelationResult matrix) |
| **grouped_with** | Characteristic | MultivariateGroup | N:N | Via MultivariateGroupMember |
| **studied_by** | Characteristic | MSAStudy | 1:N | MSA study targets characteristic |
| **operated_by** | MSAStudy | MSAOperator | 1:N | Appraisers in study |
| **inspected_in** | Characteristic | FAIItem | 1:N | Via FAIItem.characteristic_id |
| **part_of_report** | FAIItem | FAIReport | N:1 | Items belong to FAI report |
| **created_by** | FAIReport/MSAStudy/DOEStudy | User | N:1 | Authorship |
| **approved_by** | FAIReport | User | N:0..1 | Approval workflow |
| **acted_on** | AuditLog | (resource_type, resource_id) | N:1 | User action on any resource |
| **performed_by** | AuditLog | User | N:1 | Who performed the action |
| **synced_by** | ERPConnector | Plant | N:1 | ERP integration per plant |
| **capability_at** | CapabilityHistory | Characteristic | N:1 | Capability snapshot over time |
| **predicts** | PredictionConfig | Characteristic | 1:1 | Forecasting enabled |
| **batch_link** | Sample | Sample | implicit N:N | Samples sharing same batch_number |
| **product_link** | Sample | Sample | implicit N:N | Samples sharing same product_code |

### 1.3 Derived / Computed Edges (no FK, but queryable)

These relationships don't exist as explicit FKs but can be computed from existing data:

- **Temporal co-occurrence**: Two characteristics that violate simultaneously (violations within same time window)
- **Operator overlap**: Two characteristics measured by the same operator_id
- **Batch traceability**: Characteristics linked through shared batch_number on samples
- **Product traceability**: Characteristics linked through shared product_code on samples
- **Capability drift co-movement**: Characteristics whose Cpk trends move together (from CapabilityHistory)
- **Violation cascade**: A violation on characteristic A followed by a violation on characteristic B within a configurable time window (suggesting process flow dependency)

---

## 2. Visualization Library Comparison

### 2.1 Evaluation Criteria

| Criterion | Weight | Why It Matters for Cassini |
|-----------|--------|--------------------------|
| React integration | High | Must work cleanly with React 19 + TypeScript |
| Performance at scale | High | Need to handle 500-5,000 nodes in investigation views |
| Interactivity | High | Click, hover, zoom, filter, expand are core to the UX |
| Layout algorithms | High | Need hierarchical, force-directed, and radial layouts |
| Styling/theming | Medium | Must support Cassini's retro/glass design tokens |
| Bundle size | Medium | Already shipping ECharts + Three.js; marginal cost matters |
| Maintenance status | Medium | Must not be abandonware |
| TypeScript support | Medium | Strict mode TypeScript project |

### 2.2 Library Comparison Matrix

| Library | Renderer | Bundle Size (min+gz) | React Integration | Performance (nodes) | Layout Algorithms | TS Support | Last Release | Verdict |
|---------|----------|---------------------|-------------------|--------------------|--------------------|------------|-------------|---------|
| **D3.js force** | SVG/Canvas | ~30 KB (d3-force only) | Manual (imperative) | ~1,000 (SVG), ~10,000 (Canvas) | Force-directed only; others manual | @types/d3 | Active | Too low-level for this use case; would require building everything from scratch |
| **Cytoscape.js** | Canvas | ~280 KB | react-cytoscapejs (Plotly) | ~5,000 nodes comfortably | 10+ built-in (cola, dagre, fcose, circle, grid, concentric, breadthfirst) | Built-in | Active (v3.31+) | **Strong contender** — mature, rich layout, graph-theory algorithms built-in |
| **react-force-graph** | Canvas (2D) / WebGL (3D) | ~50 KB (2D) / ~150 KB (3D, uses Three.js) | Native React component | ~10,000 (2D), ~50,000 (3D with WebGL) | Force-directed only (d3-force / ngraph) | Built-in | Active (v1.48) | Good for force-only layouts; Three.js already in project = low marginal cost for 3D |
| **Sigma.js** | WebGL | ~60 KB (+ graphology ~20 KB) | @react-sigma | ~100,000 edges with default styles; ~5,000 with icons | Force Atlas 2 (via graphology); limited built-in | Built-in (v3) | Active | Best raw performance; but limited layout variety and styling |
| **vis-network** | Canvas | ~200 KB | vis-network-react | ~3,000 nodes | Hierarchical, force-directed, random | @types/vis-network | Active (v10) | Decent but aging API design; less flexible styling |
| **G6 (AntV)** | Canvas/SVG/WebGL | ~400 KB (full), tree-shakeable | Integration guide (not native wrapper) | ~10,000 with WebGL | 15+ layouts (force, dagre, radial, fruchterman, circular, grid, MDS, combo, etc.) | Built-in (v5) | Active (v5.x) | **Most feature-rich** — Rust-based WASM layouts, combo graphs, tree-shaking. Heavy. |

### 2.3 Recommendation

**Primary: Cytoscape.js** via `react-cytoscapejs`

Rationale:
- Best balance of features, performance, and bundle size for Cassini's needs
- 10+ layout algorithms including hierarchical (dagre), force-directed (fcose/cola), radial, and grid — all needed for the proposed views
- Built-in graph theory algorithms (BFS, DFS, shortest path, betweenness centrality) useful for investigation/tracing views
- Mature ecosystem with extension plugins (compound nodes, edge bending, context menus, popper/tippy tooltips)
- Canvas rendering handles 5,000 nodes comfortably — sufficient for plant-level views
- Strong community: 10k+ GitHub stars, active maintenance, Plotly-maintained React wrapper
- Good TypeScript support

**Secondary (for 3D exploration view): react-force-graph-3d**

Rationale:
- Three.js is already a dependency (`"three": "^0.183.1"` in package.json)
- Marginal bundle cost is ~50 KB since Three.js is already loaded
- 3D force-directed graphs are visually compelling for correlation webs and plant topology
- Could be used for a single "explore in 3D" mode as a premium/wow feature

**Not recommended:**
- **D3.js raw**: Too low-level; would require 2,000+ lines of custom code to match what Cytoscape gives out of the box
- **G6**: Feature-rich but 400KB+ bundle, no native React wrapper, documentation quality inconsistent outside Chinese audience
- **vis-network**: Functional but less flexible styling, aging API, harder to integrate with Cassini's design system
- **Sigma.js**: Best for enormous graphs (100k+ edges) but limited layout algorithms; Cassini doesn't need that scale

---

## 3. UX Patterns for Graph Visualization in Industrial/Quality Contexts

### 3.1 The Hairball Problem

The "hairball" is the single biggest risk with graph visualization: when all entities and relationships are shown simultaneously, the screen fills with an unreadable tangle. In Cassini's data model, a single plant with 500 characteristics, 50,000 samples, and 5,000 violations would produce exactly this result if rendered naively.

### 3.2 Core UX Patterns

#### Progressive Disclosure (Expand-on-Click)
- **Start small**: Initial view shows 20-50 nodes (e.g., hierarchy level, or a single characteristic's neighborhood)
- **Expand**: Click a node to load and reveal its neighbors (lazy-loaded from API)
- **Collapse**: Double-click or context menu to collapse a branch back
- **Depth control**: Slider or buttons to set expansion depth (1-hop, 2-hop, 3-hop)
- **Implementation**: Cytoscape's `ele.neighborhood()` + lazy API calls to fetch connected entities

#### Filtering by Relationship Type
- **Edge type toggles**: Sidebar checkboxes to show/hide relationship types (correlations, violations, gage connections, operator links)
- **Node type filters**: Show only certain entity types (hide samples, show only characteristics + violations)
- **Severity filter**: In violation/anomaly views, filter to show only CRITICAL severity
- **Status filter**: Show only unacknowledged violations, only out-of-control characteristics

#### Clustering / Grouping
- **Compound nodes**: Cytoscape supports compound (parent-child) nodes natively — use hierarchy nodes as containers for their characteristics
- **Auto-clustering**: Collapse clusters by hierarchy level (show Lines as single nodes, expand to see Equipment/Characteristics on click)
- **Visual grouping**: Color-code clusters by hierarchy branch, capability status, or violation count

#### Search + Highlight Paths
- **Global search**: Type a characteristic name, operator ID, or batch number to find and center on that node
- **Path highlighting**: "Show me the path between Characteristic A and Violation B" — uses Cytoscape's built-in BFS/shortest path
- **Highlight neighbors**: Hover to highlight direct connections; fade everything else to 20% opacity

#### Semantic Zoom
- **Zoomed out**: Show hierarchy as colored circles with aggregate health indicators (green/yellow/red based on worst Cpk in group)
- **Mid zoom**: Show individual characteristics as nodes with Cpk badge and violation count
- **Zoomed in**: Show full detail — node cards with spec limits, control limits, last sample value, trend sparkline
- **Implementation**: Cytoscape's zoom events to swap between node representations (simple shape vs. compound node with HTML labels)

#### Timeline-Based Filtering
- **Date range slider**: Filter the graph to show only entities with activity in a date range
- **Playback mode**: Step through time (day by day, shift by shift) to see how the graph state evolves — which violations appeared, which correlations strengthened
- **Snapshot comparison**: "Show me the graph state last Monday vs. today" — highlight what changed (new violations, resolved violations, new anomalies)

#### Additional Patterns for Quality Context

- **RAG (Red-Amber-Green) coding**: Every node gets a health indicator based on its current state (Cpk threshold, violation count, anomaly status)
- **Edge thickness encoding**: Correlation strength mapped to edge thickness; violation count mapped to edge color intensity
- **Ghost nodes**: Show nodes that were recently removed or resolved as semi-transparent (e.g., resolved violations) to maintain spatial stability
- **Pinning**: Allow users to pin important nodes to fixed positions so the layout doesn't jump around during exploration

---

## 4. Concrete Graph Views to Build

### View 1: Plant Topology Map
**Purpose**: Spatial overview of the entire equipment hierarchy with live health indicators.

- **Layout**: Hierarchical (dagre) — Plant at top, Lines below, Stations/Equipment below, Characteristics as leaf nodes
- **Node encoding**: Color = capability health (green/yellow/red from plant thresholds); Size = sample volume; Badge = violation count
- **Edge encoding**: Parent-child hierarchy edges (thin, structural)
- **Interactions**: Click to expand/collapse hierarchy branches; click characteristic to navigate to its SPC chart; hover for tooltip with Cpk, last sample, violation summary
- **Data source**: Hierarchy tree + latest capability per characteristic + active violation count

### View 2: Correlation Web
**Purpose**: Visualize statistical correlations between characteristics to discover hidden process dependencies.

- **Layout**: Force-directed (fcose) — strongly correlated characteristics pull together
- **Node encoding**: Each characteristic is a node; color = hierarchy branch; size = sample count; badge = Cpk value
- **Edge encoding**: Edges = statistically significant correlations from CorrelationResult; thickness = |r| value; color = positive (blue) vs. negative (red) correlation; only show |r| > configurable threshold (default 0.5)
- **Interactions**: Slider to adjust correlation threshold dynamically; click edge to see scatter plot of the two characteristics; hover node to see all its correlations highlighted
- **Data source**: CorrelationResult.matrix + CorrelationResult.p_values, filtered to significant pairs
- **3D variant**: This view is a strong candidate for react-force-graph-3d, where the z-axis can encode a third dimension (time of correlation, or PCA component)

### View 3: Investigation Graph (Root Cause Trace)
**Purpose**: Starting from a violation or anomaly event, trace all related entities to support root cause investigation.

- **Layout**: Radial or concentric — the triggering event at center, related entities in concentric rings by relationship distance
- **Starting point**: User clicks "Investigate" on a violation or anomaly event
- **Ring 1 (center)**: The triggering violation/anomaly event
- **Ring 2**: The characteristic and sample that triggered it
- **Ring 3**: The operator who recorded the sample, the gage that measured it, the data source that fed it
- **Ring 4**: Other characteristics at the same station/line, other samples by the same operator, other samples with the same batch_number
- **Ring 5**: Violations on those related characteristics in the same time window (24h)
- **Edge encoding**: Relationship type encoded by color and dash style
- **Interactions**: Expand any ring node to pull in its own neighborhood; timeline filter to narrow the investigation window; "Save investigation" to persist the graph state for audit trail
- **Data source**: Violations, samples, characteristics, hierarchy, operators, gages, anomaly events — all filtered by time window and relationship proximity

### View 4: Operator-Characteristic Interaction Map
**Purpose**: Show which operators interact with which characteristics, useful for MSA analysis and identifying operator-specific quality issues.

- **Layout**: Bipartite — operators on the left, characteristics on the right
- **Node encoding**: Operator nodes sized by sample count; characteristic nodes colored by capability status
- **Edge encoding**: Thickness = number of samples by that operator on that characteristic; color = violation rate for that operator-characteristic pair (red = high violation rate)
- **Interactions**: Click operator to highlight all their characteristics; click characteristic to see all operators; filter by time period; highlight "hot" edges (high violation rate)
- **Data source**: Sample.operator_id aggregated per characteristic; violations per operator-characteristic pair

### View 5: Connectivity Architecture Map
**Purpose**: Show the physical data flow from gages and data sources through brokers/servers to characteristics.

- **Layout**: Left-to-right hierarchical (dagre) — physical devices on left, data infrastructure in middle, characteristics on right
- **Layers**: GageBridge → GagePort → Characteristic (for serial gages); MQTTBroker → MQTTDataSource → Characteristic (for MQTT); OPCUAServer → OPCUADataSource → Characteristic (for OPC-UA)
- **Node encoding**: Color = status (online/offline/error); shape = device type (bridge=hexagon, broker=diamond, characteristic=circle)
- **Edge encoding**: Solid = active connection; dashed = inactive; red = error state
- **Interactions**: Click broker to see all connected data sources; click bridge to see all ports; real-time status updates via WebSocket
- **Data source**: GageBridge, GagePort, MQTTBroker, MQTTDataSource, OPCUAServer, OPCUADataSource, DataSource.is_active + GageBridge.status

### View 6: Batch / Product Traceability Graph
**Purpose**: Trace all quality data related to a specific batch_number or product_code across characteristics and stations.

- **Layout**: Timeline-based horizontal — time flows left to right
- **Starting point**: User enters a batch number or product code
- **Nodes**: All samples with that batch/product, grouped by characteristic; all violations on those samples; the characteristics and their hierarchy positions
- **Edge encoding**: Temporal sequence edges (sample → next sample in time for same batch); violation edges; characteristic-to-hierarchy edges
- **Interactions**: Click sample cluster to see individual measurements; click violation to see rule details; filter to specific time range
- **Data source**: Sample.batch_number or Sample.product_code, joined to violations, characteristics, hierarchy

### View 7: Quality Impact Heatmap Graph
**Purpose**: Hybrid view combining the hierarchy graph with aggregated quality metrics to quickly identify the most problematic areas.

- **Layout**: Treemap-style or force-directed with gravity toward problem areas
- **Node encoding**: Size = total sample count; color = composite quality score (weighted Cpk, violation rate, anomaly count); inner ring = trend direction (improving/stable/deteriorating from CapabilityHistory)
- **Edge encoding**: Only show edges where there's a quality dependency (correlation > 0.7 or violation co-occurrence)
- **Interactions**: Click to drill from plant → line → station → characteristic; toggle between Cpk-based and violation-based coloring; time range selector
- **Data source**: Hierarchy tree + CapabilityHistory + Violation counts + AnomalyEvent counts, all aggregated at each hierarchy level

---

## 5. Questions a Graph Visualization Can Answer That Tables/Charts Cannot

Tables show records. Charts show trends over time. Graphs show **relationships and topology** — a fundamentally different dimension. Here are specific questions:

1. **"Which characteristics are correlated, and how strong is the correlation?"** — A correlation matrix table shows numbers, but a correlation web graph shows clusters of co-moving characteristics at a glance, revealing process dependencies invisible in a table.

2. **"When this violation fired, what else was happening?"** — An investigation graph traces from a single violation through the operator, gage, batch, time window, and sibling characteristics to reveal context that would require 5+ separate table queries.

3. **"Is operator X associated with more violations on certain characteristics?"** — A bipartite operator-characteristic graph with edge color encoding violation rate instantly reveals operator-specific quality patterns.

4. **"Which part of my production line is the weakest?"** — A plant topology graph with RAG health indicators shows the spatial relationship between problem areas — two red nodes next to each other suggests a systemic issue at that station, not random variation.

5. **"How does a quality problem propagate through my process?"** — Violation cascade visualization shows temporal co-occurrence: "When Characteristic A goes out of control, Characteristics B and C follow within 30 minutes" — a pattern invisible in individual control charts.

6. **"Are my gages all connected and reporting?"** — The connectivity architecture map shows the entire data flow topology at a glance, with status indicators — versus scrolling through a table of 200 gage ports to find the 3 that are offline.

7. **"What batch should I quarantine?"** — Batch traceability graph traces a quality issue from a single failed measurement through all other characteristics that measured the same batch, across stations and lines.

8. **"Which characteristics should be grouped for multivariate analysis?"** — The correlation web naturally reveals clusters of characteristics that move together — candidates for T-squared/MEWMA grouping.

9. **"What changed between last week and this week?"** — Timeline-filtered graph snapshots with diff highlighting show which violations are new, which resolved, which correlations strengthened — impossible to see in tabular audit logs.

10. **"Who approved this FAI report and what characteristics did they inspect?"** — An investigation graph from an FAI report traces through the approval chain (created_by → submitted_by → approved_by) and the inspected characteristics, showing the full quality assurance chain.

11. **"Where is the single point of failure in my data infrastructure?"** — The connectivity map reveals if 50 characteristics all depend on one MQTT broker or one gage bridge — a risk invisible when viewing individual data source configurations.

12. **"How do DOE factors relate to process capability changes?"** — A graph linking DOE study factors to the characteristics they affect, with temporal edges to capability history snapshots, shows which experimental changes actually moved the needle.

---

## 6. Competitive Landscape

### 6.1 SPC / Quality Management Tools

**No major SPC tool offers interactive graph visualization.** The current landscape is:

| Tool | Visualization | Graph/Network? |
|------|--------------|----------------|
| **InfinityQS ProFicient** | Control charts, Pareto, dashboards | No graph views |
| **Minitab** | Control charts, capability, DOE plots, fishbone diagrams | Fishbone only (static, not interactive) |
| **DataPARC** | Real-time dashboards, trend charts | No network graph |
| **Siemens Opcenter Quality** | Control charts, dashboards, reports | No graph visualization |
| **Net-Inspect** | SPC charts, aerospace compliance reports | No graph views |
| **AlisQI** | Control charts, dashboards | No graph views |
| **High QA** | SPC charts, CMM data visualization | No graph views |
| **WinSPC** | Control charts, histograms, Pareto | No graph views |

This is a **significant competitive gap**. Every SPC tool on the market thinks in terms of individual control charts and tabular reports. None offers graph-based investigation or topology visualization.

### 6.2 Manufacturing Graph Analytics (Non-SPC)

| Solution | Approach | Relevance |
|----------|----------|-----------|
| **Boston Scientific + Neo4j** | Neo4j graph database for batch traceability and root cause analysis in medical device manufacturing. Reduced query time from 2+ minutes to 10-55 seconds. Variable-length path queries for multi-hop investigation. | **Directly validates our approach.** They proved graph-based quality investigation works in regulated manufacturing. But their tool is custom-built, not a product. |
| **Neo4j Bloom** | Interactive graph exploration tool for Neo4j databases. Node grouping, search, perspective switching, rule-based styling. | UX patterns worth studying (perspectives, rule-based styling) but requires Neo4j backend — not applicable to Cassini's SQL backend. |
| **yFiles** | Commercial graph visualization SDK. Supply chain mapping, network flows, Sankey diagrams, interactive aggregation. | High-quality UX but commercial license ($$$). Patterns worth studying for layout and interaction design. |
| **Cambridge Intelligence KeyLines** | Commercial graph visualization for investigation and intelligence analysis. Progressive disclosure, timeline analysis, geospatial views. | Their "graph visualization UX" blog posts are the best design reference for investigation graph patterns. |

### 6.3 Digital Twin + Knowledge Graph (Academic/Research)

Recent research papers (2024-2026) demonstrate:
- Knowledge graphs in digital twins for intelligent manufacturing processes (MDPI Sensors, 2024)
- Multi-layer knowledge graph models for manufacturing digital twins (Nature Scientific Reports, 2024)
- Atlas Copco's use of knowledge graphs in digital twins for manufacturing (ScienceDirect, 2022)

These confirm the industry direction: manufacturing is moving toward graph-based representations for process understanding. Cassini would be the first SPC-specific tool to offer this natively.

### 6.4 Competitive Positioning

Adding graph visualization to Cassini would create a **category-defining feature** that no competitor offers. The closest analog is Boston Scientific's custom Neo4j solution — but that's an internal tool, not a product. Cassini would be the first SPC platform to offer interactive graph-based quality investigation as a standard feature.

---

## 7. Data API Requirements

### 7.1 Response Format

All graph endpoints should return a standardized node-edge JSON format:

```typescript
interface GraphResponse {
  nodes: GraphNode[]
  edges: GraphEdge[]
  meta: {
    total_nodes: number
    total_edges: number
    truncated: boolean // true if server limited results
    query_time_ms: number
  }
}

interface GraphNode {
  id: string // e.g., "char:42", "violation:1337", "operator:jsmith"
  type: string // "characteristic", "violation", "sample", "operator", "gage", etc.
  label: string // display name
  data: Record<string, unknown> // type-specific payload (cpk, severity, status, etc.)
  group?: string // optional grouping key for clustering
  parent?: string // for compound/hierarchical layouts
  position?: { x: number; y: number } // pre-computed position (optional)
  style?: {
    color?: string // semantic: "success", "warning", "destructive", etc.
    size?: number // relative size multiplier
    shape?: string // "circle", "diamond", "hexagon", etc.
    badge?: string // e.g., "3" for violation count
  }
}

interface GraphEdge {
  id: string // unique edge ID
  source: string // source node ID
  target: string // target node ID
  type: string // "contains", "correlated_with", "triggered", etc.
  label?: string // optional edge label
  data: Record<string, unknown> // type-specific payload (correlation r, violation rule, etc.)
  style?: {
    width?: number // edge thickness
    color?: string // semantic color
    dashed?: boolean // dashed vs solid
  }
}
```

### 7.2 Required API Endpoints

| Endpoint | Method | Purpose | Key Parameters |
|----------|--------|---------|----------------|
| `GET /graph/topology/{plant_id}` | GET | Plant hierarchy with health indicators | `depth` (1-5), `include_health` (bool) |
| `GET /graph/correlations/{plant_id}` | GET | Correlation web for a plant | `min_r` (float, default 0.5), `method` (pearson/spearman), `characteristic_ids` (optional filter) |
| `GET /graph/investigate/{entity_type}/{entity_id}` | GET | Investigation graph from a starting entity | `depth` (1-3), `time_window_hours` (int), `include_types` (list of node types) |
| `GET /graph/operator-map/{plant_id}` | GET | Operator-characteristic interaction map | `start_date`, `end_date`, `min_samples` (int) |
| `GET /graph/connectivity/{plant_id}` | GET | Data source connectivity architecture | (none — returns full connectivity map) |
| `GET /graph/traceability` | GET | Batch or product traceability | `batch_number` or `product_code`, `time_window_hours` |
| `GET /graph/neighborhood/{node_id}` | GET | Expand a single node's neighbors (lazy load) | `depth` (1-2), `edge_types` (list), `limit` (max neighbors) |
| `GET /graph/impact/{plant_id}` | GET | Quality impact heatmap data | `metric` (cpk/violations/anomalies), `start_date`, `end_date` |

### 7.3 Backend Implementation Notes

- **No new database tables required.** All graph data is derived from existing models via JOINs and aggregations.
- **Correlation edges** come from `CorrelationResult.matrix` (already stored as NxN JSON) — parse and emit as edges where |r| > threshold.
- **Operator nodes** are synthetic — derived from `SELECT DISTINCT operator_id FROM sample WHERE char_id IN (...)`.
- **Investigation depth control** prevents runaway queries — each depth level adds one query layer. Depth 3 is the practical maximum for interactive use.
- **Caching**: Graph topology changes slowly (hierarchy and connectivity change rarely). These endpoints should be cached aggressively (5-minute TTL for topology, 1-hour TTL for correlations). Investigation and traceability queries are more dynamic and should not be cached.
- **Pagination/truncation**: For large plants, the API should enforce a maximum node count (e.g., 500 nodes) and indicate truncation in the `meta` response. The frontend uses lazy expansion to fetch more.
- **Performance target**: <500ms for topology and connectivity views; <2s for investigation depth-3 queries; <1s for correlation web.

### 7.4 Frontend Architecture

- **New route**: `/graph` with sub-routes for each view type
- **Shared component**: `<GraphCanvas>` wrapping Cytoscape.js with Cassini theming (retro/glass, light/dark)
- **Layout selector**: Dropdown to switch layout algorithms per view
- **Sidebar**: Node detail panel (slide-out, similar to ExplanationPanel) showing full details when a node is clicked
- **Toolbar**: Filter controls, search, depth slider, time range, export (PNG/SVG)
- **State management**: Zustand store for graph view state (active filters, expanded nodes, selected node)
- **React Query integration**: Each graph endpoint as a query key; expansion queries use dependent queries

---

## 8. Implementation Phases (High-Level)

If this feature is approved for development, suggested phasing:

**Phase 1 — Foundation (1 sprint)**
- Install Cytoscape.js + react-cytoscapejs
- Build `<GraphCanvas>` with Cassini theming (retro/glass modes, light/dark)
- Implement topology API + Plant Topology view
- Implement connectivity API + Connectivity Architecture view
- Basic interactions: click, hover, zoom, pan, search

**Phase 2 — Investigation (1 sprint)**
- Implement investigation API with depth control
- Build Investigation Graph view with radial layout
- Add lazy node expansion (neighborhood API)
- Add timeline filtering
- Add node detail sidebar

**Phase 3 — Correlation & Operators (1 sprint)**
- Implement correlation web API
- Build Correlation Web view with force-directed layout
- Implement operator-map API
- Build Operator-Characteristic Map with bipartite layout
- Add edge threshold slider, filtering controls

**Phase 4 — Advanced (1 sprint)**
- Implement batch/product traceability API + view
- Build Quality Impact heatmap view
- Add 3D exploration mode (react-force-graph-3d) for correlation web
- Add "Save investigation" persistence
- Add graph export (PNG/SVG/JSON)

---

## Sources

### Library Documentation
- [Cytoscape.js](https://js.cytoscape.org/)
- [react-cytoscapejs (Plotly)](https://github.com/plotly/react-cytoscapejs)
- [G6 by AntV](https://g6.antv.antgroup.com/en)
- [Sigma.js](https://www.sigmajs.org/)
- [react-force-graph](https://github.com/vasturiano/react-force-graph)
- [vis-network](https://visjs.github.io/vis-network/docs/)
- [D3 Force](https://d3js.org/d3-force)

### UX & Design Patterns
- [Graph Visualization UX — Cambridge Intelligence](https://cambridge-intelligence.com/graph-visualization-ux-how-to-avoid-wrecking-your-graph-visualization/)
- [Fixing Data Hairballs — Cambridge Intelligence](https://cambridge-intelligence.com/how-to-fix-hairballs/)
- [Guide to Visualizing Knowledge Graphs — yFiles](https://www.yfiles.com/resources/how-to/guide-to-visualizing-knowledge-graphs)

### Competitive / Industry
- [Boston Scientific + Neo4j Manufacturing Quality](https://neo4j.com/blog/graph-data-science/how-boston-scientific-improves-manufacturing-quality-using-graph-analytics/)
- [Digital Twin Meets Knowledge Graph (MDPI, 2024)](https://www.mdpi.com/1424-8220/24/8/2618)
- [Knowledge Graphs at Atlas Copco (ScienceDirect)](https://www.sciencedirect.com/science/article/pii/S2405896322016263)
- [JavaScript Graph Library Comparison — Cylynx](https://www.cylynx.io/blog/a-comparison-of-javascript-graph-network-visualisation-libraries/)
- [Top 13 JS Graph Libraries — Linkurious](https://linkurious.com/blog/top-javascript-graph-libraries/)
- [Best Libraries for Large Force-Directed Graphs — Medium](https://weber-stephen.medium.com/the-best-libraries-and-methods-to-render-large-network-graphs-on-the-web-d122ece2f4dc)
