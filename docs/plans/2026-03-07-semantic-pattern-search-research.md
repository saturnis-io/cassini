# Semantic Pattern Search for SPC — Research Document

**Date:** 2026-03-07
**Status:** Research / Exploratory
**Author:** Claude (research-only, no code changes)

---

## 1. Problem Statement

Quality engineers performing root cause analysis repeatedly encounter a fundamental limitation: they can search SPC data by keywords, date ranges, characteristics, and violation types — but they cannot search by *shape*. When an engineer sees a control chart exhibiting gradual drift and wants to know "has this happened before, on any characteristic, at any time?", they must manually browse through charts one by one.

**Semantic pattern search** means finding time-series subsequences that are *similar in shape* to a query pattern, regardless of amplitude, offset, or time scale.

---

## 2. Concrete Use Cases

### 2.1 Who Uses This

| Persona | Task | Current Pain |
|---------|------|-------------|
| **Quality Engineer** | Root cause analysis after OOC event | Manually browses dozens of charts looking for historical precedent |
| **Process Engineer** | Identifying systematic equipment degradation | No way to query "show me all gradual drift episodes" across characteristics |
| **Supervisor** | Recognizing recurring shift-start patterns | Relies on memory and tribal knowledge |
| **AI Analysis Agent** | Automated investigation (existing feature) | Currently gets only the last 50 samples — cannot search for historical analogues |

### 2.2 Query Types

1. **"Find similar to this region"** — Select a window on a control chart, search for historical subsequences with similar shape across all characteristics or within the same one.

2. **"Have we seen this violation pattern before?"** — Given a sequence of Nelson rule violations (e.g., Rule 2 followed by Rule 1 within 10 samples), find historical occurrences of the same violation signature.

3. **"Show me characteristics that behave similarly"** — Given a characteristic's recent behavior, find other characteristics with correlated or similar temporal dynamics (cross-characteristic similarity).

4. **"Find historical periods that look like now"** — Given the current window of N samples, find past windows on the same characteristic with the most similar shape.

5. **"Which characteristics have had gradual drift like this one?"** — Search by named pattern archetype (drift, shift, oscillation, stratification) rather than by a specific shape.

6. **"Show me all tool wear patterns across Line 3"** — Search by a saved/named pattern template within a hierarchy scope.

---

## 3. Time-Series Similarity Approaches

### 3.1 Dynamic Time Warping (DTW)

**How it works:** DTW finds an optimal alignment between two time series by warping the time axis. It computes a distance matrix between all pairs of points and finds the minimum-cost warping path.

**Pros for SPC:**
- Handles time-axis distortion (a 5-sample drift and a 7-sample drift are recognized as similar)
- Well-understood, extensively published in manufacturing literature
- Mature Python libraries: `tslearn` (DTW + k-means + shapelets), `dtaidistance` (fast C implementation)
- Works directly on raw values — no feature engineering required
- Interpretable: the warping path shows exactly which points aligned

**Cons for SPC:**
- O(n*m) per comparison, O(N * n * m) to search N candidates — expensive for large datasets
- No natural indexing structure (must compare against every candidate)
- Sensitive to amplitude differences unless z-normalized first
- FastDTW approximation trades accuracy for speed, but approximation quality degrades on short sequences (typical SPC windows of 20-50 points)
- Cannot distinguish between a *trend* and a *shift* if final positions are similar — shape-agnostic

**Cassini fit:** Good for ad-hoc "find similar to this selection" queries where the candidate set is pre-filtered (same plant, same time range). Not suitable as the primary indexing mechanism for large-scale search.

**Library:** `tslearn` 0.8.0 — `tslearn.metrics.dtw`, `tslearn.clustering.TimeSeriesKMeans(metric="dtw")`

### 3.2 Statistical Feature Extraction (Recommended Primary Approach)

**How it works:** Extract a fixed-length feature vector from each time-series window. Features capture statistical properties (mean, sigma, skewness, kurtosis), trend properties (slope, curvature), pattern properties (autocorrelation, run length, violation density, Hurst exponent), and spectral properties (dominant frequency, spectral entropy). Then use standard similarity metrics (cosine distance, Euclidean) on normalized feature vectors.

**Pros for SPC:**
- Extremely fast at query time — vector comparison is O(d) where d is feature dimension
- Features are interpretable and SPC-native ("this matched because both have similar trend slope and violation density")
- Natural indexing via pgvector or in-memory numpy arrays
- Scales linearly with pre-computation, constant-time at query
- Features can be incrementally updated as new samples arrive
- The feature vocabulary maps directly to SPC concepts engineers already understand
- Can combine with pgvector for ANN search at scale

**Cons for SPC:**
- Requires careful feature engineering — wrong features miss important patterns
- Lossy: two very different shapes could have similar feature vectors (e.g., a ramp-up and a ramp-down have similar absolute slope)
- Cannot capture arbitrary novel patterns not represented in the feature set
- Window size affects feature values — must normalize or compute at multiple scales

**Cassini fit:** Excellent. This is the most practical approach for Cassini's current architecture and user base. Features align with what SPC engineers already think about (drift, sigma changes, run patterns). Can be stored in PostgreSQL with pgvector or as JSON columns.

**Recommended feature set** (see Section 4 for details).

### 3.3 Matrix Profile (STUMPY)

**How it works:** The Matrix Profile computes, for every subsequence of length m in a time series, the z-normalized Euclidean distance to its nearest neighbor. The result is a vector (the "profile") where low values indicate motifs (repeated patterns) and high values indicate discords (anomalies).

**Pros for SPC:**
- Discovers motifs and anomalies simultaneously — no need to specify what you are looking for
- Near-parameter-free: only requires subsequence length m
- `stumpy` library is production-grade, GPU-accelerated, actively maintained (v1.14)
- `stumpy.mass()` for fast pattern matching against a query — O(n log n) per time series
- AB-join variant can find conserved patterns *across* two different time series (cross-characteristic search)
- Semantic segmentation (change-point detection) comes for free — complements existing PELT

**Cons for SPC:**
- O(n^2) for full profile computation — expensive on long histories (>10K samples)
- Fixed subsequence length m — must choose or compute profiles at multiple scales
- Only finds *exact nearest neighbors*, not "top-k most similar" efficiently
- Profile must be recomputed when new data arrives (incremental variants exist but are less mature)
- Does not inherently classify patterns (motifs are unnamed — just "similar subsequences")

**Cassini fit:** Strong complement to feature vectors. Use Matrix Profile for *discovery* ("what recurring patterns exist in this characteristic's history?") and MASS for *query* ("find this specific pattern in other characteristics"). Pre-compute profiles during low-load periods.

**Library:** `stumpy` 1.14 — `stumpy.stump()` (profile), `stumpy.mass()` (pattern query), `stumpy.stumped()` (distributed)

### 3.4 Shapelet Discovery

**How it works:** Shapelets are short subsequences that are maximally discriminative — they distinguish one class of time series from another. They can be mined from data or learned via gradient descent.

**Pros for SPC:**
- Directly produces interpretable "signature shapes" for each pattern class
- Once learned, classification is fast (distance to each shapelet)
- `tslearn.shapelets.LearningShapelets` provides a PyTorch-based implementation

**Cons for SPC:**
- Requires labeled training data (supervised) — Cassini does not currently have labeled pattern datasets
- Learning phase is computationally expensive (neural network training)
- Brittle with small datasets — SPC characteristics may have only hundreds of samples
- Designed for classification (pattern A vs pattern B), not similarity search

**Cassini fit:** Not recommended as a primary approach due to the labeled data requirement. Could become valuable later if the pattern library (Section 6) accumulates enough user-labeled examples to train a classifier. Keep as a future enhancement.

### 3.5 Learned Embeddings (TS2Vec, TNC, TST)

**How it works:** Self-supervised contrastive learning trains an encoder to map time-series windows into a fixed-dimensional embedding space where similar patterns are close together. TS2Vec (AAAI 2022) is the current state of the art — it uses hierarchical contrastive learning over augmented context views.

**Pros for SPC:**
- Captures complex, non-linear pattern similarity that feature vectors miss
- No manual feature engineering — learns what matters from data
- Once trained, inference is fast (single forward pass per window)
- Embeddings can be stored in pgvector for ANN search
- TS2Vec is self-supervised — no labels needed

**Cons for SPC:**
- Requires significant data volume for meaningful training (thousands of windows minimum)
- "Black box" — cannot explain *why* two patterns are similar
- Model must be retrained when the data distribution changes (new products, new processes)
- Adds PyTorch dependency to the backend (~500MB)
- Overkill for a system with ~45 models and potentially modest sample counts per characteristic
- Explainability matters in regulated manufacturing — "the model says they are similar" is insufficient

**Cassini fit:** Premature for current scale. Revisit when Cassini has customers with 100K+ samples per characteristic and when the feature-vector approach proves insufficient. Could be offered as a commercial-tier enhancement.

**Library:** `ts2vec` (GitHub: zhihanyue/ts2vec), PyTorch-based

### 3.6 SAX (Symbolic Aggregate Approximation)

**How it works:** SAX reduces a time series to a string by: (1) z-normalize, (2) PAA (Piecewise Aggregate Approximation) to reduce dimensionality, (3) map each segment to a letter based on Gaussian breakpoints. The resulting string can be compared using string distance metrics, indexed with suffix trees, or searched with standard text indexing.

**Pros for SPC:**
- Extreme compression — a 50-point window becomes a 5-10 character string
- Lower-bounding guarantee: SAX distance <= true Euclidean distance (no false negatives)
- iSAX indexing supports billion-scale search
- Intuitive: "aabccba" represents a U-shape pattern
- String-based search enables SQL LIKE queries or text search indexes

**Cons for SPC:**
- Lossy — quantization discards fine-grained shape information
- Alphabet size and word length are sensitive hyperparameters
- Does not handle time warping (unlike DTW)
- Gaussian breakpoints assume normally distributed data — may not hold for attribute charts or non-normal processes

**Cassini fit:** Good as a coarse pre-filter or secondary indexing strategy. Convert windows to SAX strings, store alongside feature vectors, use for fast approximate matching before refining with DTW or feature-vector distance. Could power a "pattern hash" for quick duplicate detection.

---

## 4. Recommended Approach: Feature Vector Pipeline

### 4.1 Feature Extraction

For each time-series window (configurable, default 25 samples), extract the following feature vector:

**Location & Scale (4 features):**
| Feature | Description | SPC Relevance |
|---------|-------------|---------------|
| `z_mean` | Z-normalized mean (relative to characteristic's center line) | How far process has drifted from center |
| `z_sigma` | Sigma of window / historical sigma | Variability change (sigma increase/decrease) |
| `cv` | Coefficient of variation | Scale-independent variability |
| `range_ratio` | Window range / historical range | Spread relative to baseline |

**Trend & Shape (5 features):**
| Feature | Description | SPC Relevance |
|---------|-------------|---------------|
| `slope` | Linear regression slope (z-normalized) | Trend direction and magnitude |
| `curvature` | Quadratic term from polynomial fit | Accelerating/decelerating drift |
| `skewness` | Distribution skewness within window | Asymmetric behavior |
| `kurtosis` | Excess kurtosis within window | Tail behavior (outlier propensity) |
| `last_minus_first` | Normalized difference between window endpoints | Net directional change |

**Autocorrelation & Memory (3 features):**
| Feature | Description | SPC Relevance |
|---------|-------------|---------------|
| `lag1_acf` | Autocorrelation at lag 1 | Serial correlation (process inertia) |
| `lag2_acf` | Autocorrelation at lag 2 | Oscillation detection |
| `hurst` | Hurst exponent (R/S method) | Long-range dependence vs mean-reversion |

**SPC-Specific (5 features):**
| Feature | Description | SPC Relevance |
|---------|-------------|---------------|
| `violation_density` | Violations per sample in window | Process instability intensity |
| `violation_type_mask` | Bitmask of Nelson rules triggered (8 bits) | Which rules fired |
| `run_length` | Longest run (consecutive same-side-of-CL) | Shift detection |
| `ooc_fraction` | Fraction of points beyond control limits | OOC severity |
| `zone_entropy` | Entropy of zone distribution (A/B/C) | Stratification vs spread |

**Spectral (2 features):**
| Feature | Description | SPC Relevance |
|---------|-------------|---------------|
| `dominant_period` | Dominant frequency from FFT | Cyclical pattern detection |
| `spectral_entropy` | Entropy of power spectrum | Regular vs chaotic behavior |

**Total: 19 features per window.**

### 4.2 Normalization Strategy

1. **Z-normalize** the raw time series *before* feature extraction (subtract mean, divide by sigma) — this makes features scale-independent across characteristics measuring different things (e.g., millimeters vs degrees Celsius)
2. **Feature-level normalization**: Maintain running min/max or quantile statistics per feature across all stored windows. Normalize each feature to [0, 1] using quantile normalization (robust to outliers).
3. **For cross-characteristic search**: Z-normalization handles amplitude/offset. Features like `slope` and `curvature` are computed on z-normalized data so they are comparable across characteristics.

### 4.3 Similarity Metric

**Cosine similarity** is recommended as the primary metric:
- Invariant to vector magnitude (a "strong drift" and "mild drift" with the same shape profile still score high)
- Fast to compute, well-supported by pgvector
- Interpretable: 1.0 = identical feature profile, 0.0 = orthogonal

**Euclidean distance** as secondary metric for cases where magnitude matters (e.g., "find violations with similar *severity*, not just similar shape").

### 4.4 Window Size Handling

SPC patterns occur at multiple scales. A shift happens in 1-2 samples; a trend takes 15+. Strategy:

1. **Multi-scale extraction**: Compute features at 3 window sizes: short (10 samples), medium (25 samples), long (50 samples)
2. **Query-time window**: When the user selects a chart region, extract features at the scale closest to the selection length
3. **Concatenated vector**: For the stored profile, concatenate all 3 scales into a single 57-dimensional vector (19 features x 3 scales). This enables "this pattern looks similar at any scale" queries via cosine similarity on the full vector.
4. **Scale-specific query**: For "find similar drift at this specific timescale," query only the relevant 19-dimensional subvector.

### 4.5 Indexing for Fast Retrieval

**Small scale (< 50K windows):** In-memory numpy arrays with brute-force cosine similarity. At 57 dimensions and 50K vectors, a full scan takes ~1ms on modern hardware.

**Medium scale (50K - 5M windows):** pgvector with HNSW index. Store the feature vector as a `vector(57)` column. pgvector's HNSW index provides approximate nearest neighbor search with excellent recall (>95% at default settings). This keeps everything in PostgreSQL — no additional infrastructure.

**Large scale (5M+ windows):** Consider pgvectorscale (Timescale's StreamingDiskANN extension) or a dedicated vector database. Unlikely to be needed for Cassini's target market in the near term.

### 4.6 Incremental Updates

When new samples arrive for a characteristic:
1. The most recent window shifts by one sample
2. Re-extract features for the current window at all 3 scales
3. Update the "current window" row in the feature store
4. Every N samples (configurable, default 25), snapshot the feature vector as a historical entry (append-only)
5. This can piggyback on the existing `process_new_sample` pipeline in `spc_engine.py`

---

## 5. Pattern Taxonomy for SPC

### 5.1 Eight Canonical Patterns

Based on established SPC literature (Western Electric rules, Nelson rules, AIAG SPC manual) and the academic classification literature:

| ID | Pattern | Description | Nelson Rules | Typical Root Causes |
|----|---------|-------------|-------------|---------------------|
| P1 | **Normal** | Random variation around center line, bell-shaped zone distribution | None triggered | Process in control |
| P2 | **Sudden Shift (Up)** | Abrupt mean jump upward | Rule 2 (9 same side), Rule 1 (beyond 3σ) | New material lot, tool change, operator change |
| P3 | **Sudden Shift (Down)** | Abrupt mean jump downward | Rule 2, Rule 1 | Same as P2 |
| P4 | **Gradual Drift (Up)** | Slow upward trend | Rule 3 (6 increasing), Rule 4 (14 alternating) | Tool wear, temperature drift, fixture loosening |
| P5 | **Gradual Drift (Down)** | Slow downward trend | Rule 3 | Same as P4 |
| P6 | **Increased Variability** | Sigma increase, points scatter further from center | Rule 5 (2/3 beyond 2σ), Rule 1 | Worn bearing, loose fixture, incoming material variation |
| P7 | **Decreased Variability (Stratification)** | Points cluster tightly around center | Rule 8 (8 beyond 1σ on both sides — inverse) | Measurement resolution, mixed streams with similar means |
| P8 | **Cyclical / Periodic** | Regular oscillation | Rule 7 (15 within 1σ — false positive risk), Rule 4 | Temperature cycles, shift changes, batch effects, rotation schedules |

### 5.2 Extended Patterns (Manufacturing-Specific)

| ID | Pattern | Description | Feature Signature |
|----|---------|-------------|-------------------|
| P9 | **Tool Wear (Sawtooth)** | Slow drift followed by sudden reset, repeating | High curvature + periodic dominant_period + high slope variance across sub-windows |
| P10 | **Mixture / Bimodal** | Two distinct populations overlaid | High kurtosis (negative excess), zone_entropy near maximum, Rule 4 |
| P11 | **Systematic Alternation** | Strict high-low-high-low pattern | lag1_acf near -1.0, Rule 4 |
| P12 | **Instability Burst** | Short period of high violation density within otherwise stable process | violation_density spike in local window, low violation_density in surrounding windows |
| P13 | **Capability Degradation** | Cpk declining over time while process appears in-control | Trend in OOC fraction approaching spec limits, slope toward USL or LSL |

### 5.3 Pattern Fingerprints

Each pattern can be encoded as a reference feature vector (a "fingerprint"). When a user searches by pattern name, the system computes cosine similarity between the stored windows and the pattern fingerprint.

Example fingerprints (schematic — actual values would be calibrated from real data):

```
P4 (Gradual Drift Up):
  slope: +0.8, curvature: ~0, lag1_acf: +0.7, run_length: high,
  violation_density: low-medium, ooc_fraction: low,
  zone_entropy: medium, hurst: >0.7

P6 (Increased Variability):
  slope: ~0, z_sigma: >1.5, range_ratio: >1.5, kurtosis: high,
  violation_density: medium-high, ooc_fraction: medium,
  zone_entropy: high, hurst: ~0.5

P8 (Cyclical):
  slope: ~0, dominant_period: >0 (non-zero peak), spectral_entropy: low,
  lag1_acf: positive, lag2_acf: variable, zone_entropy: medium
```

---

## 6. UI/UX Design Concepts

### 6.1 Entry Points

**A. "Find Similar" from Chart Selection**
1. User is viewing a control chart
2. User clicks-and-drags to select a region (N samples)
3. A "Find Similar" button appears in the selection toolbar
4. System extracts features from the selected window
5. Results panel opens showing matches ranked by similarity

**B. Pattern Library Browser**
1. Accessible from the main navigation or a chart's toolbar
2. Shows the 13 canonical/extended patterns as visual tiles (small sparkline icons representing each shape)
3. User clicks a pattern → system searches for historical occurrences across the current plant's characteristics
4. Can filter by hierarchy scope (all, specific line, specific station)

**C. Natural Language Query (via AI Agent)**
1. User types "find characteristics with drift patterns in the last month"
2. AI agent translates to a feature-vector query (slope > threshold, last 30 days)
3. Results integrated into the AI analysis response

### 6.2 Results Display

**Ranked List with Thumbnails:**
- Each result shows a miniature sparkline of the matching window
- Similarity score (0-100%) with an explanation badge: "Similar slope (+0.92), similar variability (+0.85)"
- Characteristic name with hierarchy breadcrumb path (per existing convention)
- Timestamp range of the match
- Click to navigate to that characteristic's chart, scrolled to the matching time window

**Overlay Comparison:**
- "Compare" button on any result overlays the query pattern and the match on the same chart
- Both z-normalized for visual comparison
- DTW alignment lines shown optionally (toggle)

**Side-by-Side:**
- Full chart view with query on left, match on right
- Synchronized zoom/pan

### 6.3 Similarity Score Explanation

Critical for trust in regulated environments. Each result includes:
- Overall similarity percentage
- Per-feature contribution breakdown (which features drove the match)
- "This matched because: similar trend slope (0.85 vs 0.82), similar violation density (0.12 vs 0.14), similar run length (7 vs 8)"
- This leverages Cassini's existing "Show Your Work" philosophy

### 6.4 Wireframe Concept

```
+------------------------------------------------------------------+
| Control Chart: Bore Diameter (Plant > Line 2 > Station A)        |
|  [Chart with selected region highlighted in blue]                 |
|                                                                   |
|  Selection: Samples 142-167 (25 pts)  [Find Similar] [Cancel]   |
+------------------------------------------------------------------+

Results Panel (slides in from right, like ExplanationPanel):
+-----------------------------+
| Pattern Search Results       |
| 7 matches found              |
|                              |
| Sort: [Similarity v]        |
| Scope: [This Plant v]       |
|                              |
| 1. ~~~~/\/\~~  93%          |
|    OD Measurement            |
|    Line 2 > Station B        |
|    2026-01-15 to 2026-01-22  |
|    "Similar drift + sigma"   |
|    [Compare] [Go to Chart]   |
|                              |
| 2. ~~~/\___~~  87%          |
|    Surface Roughness          |
|    Line 3 > Station A        |
|    2025-11-02 to 2025-11-10  |
|    "Similar trend slope"     |
|    [Compare] [Go to Chart]   |
|                              |
| ...                          |
+-----------------------------+
```

---

## 7. Competitive Landscape

### 7.1 Established SPC Vendors

| Vendor | Product | Pattern Search? | Notes |
|--------|---------|----------------|-------|
| **InfinityQS (Advantive)** | ProFicient / Enact | No semantic pattern search. Has rule-based alerts and trend detection. | Market leader. Focus on data collection and compliance, not discovery. |
| **WinSPC (dataPARC)** | WinSPC | No. Real-time alerting only. | Strong on shop-floor integration, weak on analytics. |
| **Siemens** | Opcenter Quality (formerly IBS QMS) | No pattern search. Has AI-powered "quality prediction." | Enterprise-tier, typically bundled with MES. |
| **Augmentir** | Connected Worker + SPC | No. Focus on operator guidance. | AI is used for worker instructions, not pattern discovery. |
| **SafetyChain** | SPC module | No. Basic charting + alerts. | Food/beverage focus. |
| **SPC for Excel** | Excel add-in | No. Educational tool. | Not enterprise software. |
| **Minitab** | Connect + Workspace | Limited. Has "assistant" that suggests analyses but no similarity search. | Strong in DOE/statistical analysis, weak in real-time SPC. |

### 7.2 Time-Series Analytics Platforms

| Platform | Pattern Search? | Relevance |
|----------|----------------|-----------|
| **KX Systems (kdb+/q)** | Yes — Temporal Similarity Search (TSS). Patent-pending compression model. | Financial/IoT focus. Expensive. Not SPC-specific. |
| **Timescale (TimescaleDB)** | pgvector integration for embeddings. No native pattern matching. | Good infrastructure layer if Cassini adopts PostgreSQL+pgvector. |
| **Elasticsearch** | Time series anomaly detection (ML). No shape similarity search. | Wrong tool for this problem. |
| **InfluxDB** | Flux language has limited pattern queries. No similarity search. | Time-series storage, not analytics. |

### 7.3 Competitive Positioning

**No established SPC vendor offers semantic pattern search.** This would be a genuinely differentiating feature for Cassini. The closest capability in the market is KX Systems' TSS, which targets financial and IoT data, not manufacturing SPC.

The feature would position Cassini as the first SPC platform with "search by shape" — a capability quality engineers have wanted but never had access to outside custom data-science projects.

**Recommended positioning:** Commercial-tier feature (not community edition). Highlight as "Pattern Intelligence" or "Shape Search" in marketing materials. The pattern library/taxonomy is free; the similarity search engine is commercial.

---

## 8. Pattern Library and Feedback Loop

### 8.1 Built-in Pattern Library

Ship with the 13 canonical patterns (Section 5) as pre-defined reference fingerprints. Each pattern includes:
- Name and description
- Visual icon (sparkline)
- Reference feature vector (fingerprint)
- Typical root causes (educational content)
- Related Nelson rules

### 8.2 User-Defined Patterns

1. User selects a chart region and labels it: "Tool wear on Station A drill bit"
2. System extracts feature vector and saves as a named pattern
3. Pattern is scoped to the plant (private by default)
4. Admins can promote patterns to "shared" (visible across plants)

### 8.3 Feedback Loop

1. **Relevance feedback:** Each search result has thumbs-up/thumbs-down. Accepted results reinforce the feature weights; rejected results provide negative examples.
2. **Named pattern refinement:** When multiple examples of a named pattern are saved, compute the centroid and spread. Use the centroid as the updated fingerprint and the spread as the similarity threshold.
3. **Automatic pattern suggestion:** When the system detects a pattern via Nelson rules or anomaly detection, suggest saving it to the library: "This looks like tool wear (87% match to your saved pattern). Label it?"

### 8.4 AI Agent Integration

The existing `AIAnalysisEngine` already receives `chart_patterns` in its context (see `context_builder.py`). Enhancement:
1. When the AI agent investigates a characteristic, automatically run a pattern search across the plant
2. Include top-3 historical matches in the LLM prompt context
3. LLM can reference them: "This drift pattern was previously seen on Surface Roughness (Station B) in January 2026, which was caused by a worn fixture — consider checking the fixture."

This transforms the AI from "analyzing this chart in isolation" to "analyzing this chart with historical pattern memory."

---

## 9. Technical Requirements and Architecture

### 9.1 New Database Objects

```
pattern_feature_store
  id: PK
  char_id: FK -> characteristic
  window_start_sample_id: FK -> sample
  window_end_sample_id: FK -> sample
  window_size: int (10, 25, or 50)
  feature_vector: vector(57)  -- pgvector type, or JSON for SQLite
  extracted_at: timestamp
  is_current: bool  -- true for the latest window

pattern_template
  id: PK
  plant_id: FK -> plant (nullable for global patterns)
  name: str
  description: text
  category: str (canonical | user-defined)
  pattern_type_id: str (P1-P13 for canonical)
  feature_vector: vector(57)
  icon_svg: text (optional, sparkline SVG)
  root_causes: JSON
  created_by: FK -> user
  is_shared: bool

pattern_search_feedback
  id: PK
  query_feature_vector: vector(57)
  result_feature_store_id: FK -> pattern_feature_store
  relevance: enum (positive, negative)
  user_id: FK -> user
  created_at: timestamp
```

### 9.2 Multi-Dialect Considerations

pgvector is PostgreSQL-only. For SQLite (dev) and MySQL/MSSQL:
- Store feature vectors as JSON arrays
- Implement brute-force cosine similarity in Python
- This is acceptable for development and small deployments
- For production at scale, PostgreSQL + pgvector is the recommended stack
- Abstract behind a `VectorStore` interface that switches implementation by dialect (similar to existing `db/dialects.py` pattern)

### 9.3 Pre-Computation Pipeline

**Trigger points:**
1. **On sample insert** (real-time): Update the "current window" feature vector for the characteristic. Lightweight — only re-extracts features for the most recent window.
2. **On bulk import**: After bulk sample creation, re-extract features for all affected windows.
3. **Background job** (scheduled): Nightly job to backfill feature vectors for characteristics that have accumulated new samples since last extraction. Also computes multi-scale windows for historical data.
4. **On-demand**: When a user first uses pattern search for a characteristic with no stored features, compute them synchronously (with a loading indicator).

**Performance budget:**
- Feature extraction for one 50-sample window: ~1ms (numpy operations)
- Feature extraction for 1000 windows: ~1 second
- Full backfill for a characteristic with 10,000 samples at 3 scales: ~3 seconds
- pgvector HNSW query for top-10 nearest neighbors among 1M vectors: ~5ms

### 9.4 API Endpoints

```
POST /api/v1/patterns/search
  Body: { char_id, start_sample_id, end_sample_id, scope, limit }
  → Extracts features from the specified window, searches the feature store
  → Returns ranked matches with similarity scores and explanations

GET /api/v1/patterns/templates
  → Returns all available pattern templates (canonical + user-defined)

POST /api/v1/patterns/templates
  Body: { name, description, char_id, start_sample_id, end_sample_id }
  → Creates a user-defined pattern template from a chart selection

POST /api/v1/patterns/search-by-template
  Body: { template_id, scope, limit }
  → Searches for occurrences of a named pattern

POST /api/v1/patterns/feedback
  Body: { search_result_id, relevance }
  → Records user feedback on search result quality

GET /api/v1/characteristics/{id}/similar
  → Finds characteristics with similar recent behavior
```

### 9.5 Dependency Additions

| Package | Version | Purpose | Size Impact |
|---------|---------|---------|-------------|
| `stumpy` | 1.14+ | Matrix Profile, MASS pattern matching | ~2MB (numpy dependency already present) |
| `tslearn` | 0.8+ | DTW, shapelet extraction (future) | ~5MB |
| `pgvector` (Python) | 0.3+ | pgvector SQLAlchemy integration | ~100KB |
| `scipy` | (already present) | FFT, autocorrelation, Hurst exponent | Already a dependency |
| `numpy` | (already present) | Feature extraction | Already a dependency |

**No PyTorch dependency.** Learned embeddings (TS2Vec) are deferred to a future phase.

### 9.6 Phased Rollout

**Phase 1 — Feature Vector Search (MVP):**
- Feature extraction pipeline (19 features x 3 scales)
- `pattern_feature_store` table + background backfill job
- `POST /patterns/search` endpoint (brute-force for SQLite, pgvector for PG)
- "Find Similar" button on chart selection
- Results panel with sparkline thumbnails and similarity scores
- 5 canonical patterns (Normal, Shift Up/Down, Drift Up/Down)

**Phase 2 — Pattern Library:**
- Full 13-pattern taxonomy with fingerprints
- Pattern template CRUD (user-defined patterns)
- Pattern library browser UI
- Feedback loop (thumbs up/down)
- AI agent integration (include matches in analysis context)

**Phase 3 — Advanced Search:**
- Matrix Profile integration (motif discovery mode)
- MASS-based exact pattern query
- Cross-characteristic similarity ("find characteristics like this one")
- DTW overlay visualization
- Multi-variate pattern search (patterns across correlated characteristics)

**Phase 4 — Intelligence (Future):**
- Learned embeddings (TS2Vec) for commercial tier
- Automatic pattern labeling from user feedback
- Pattern-based alerting ("notify me when tool wear pattern appears")
- Pattern trend analysis ("is this pattern becoming more frequent?")

---

## 10. Open Questions

1. **Window stride for historical backfill:** Should historical windows overlap (stride 1 — maximum coverage but high storage) or be non-overlapping (stride = window_size — minimum storage but may miss patterns that span window boundaries)? Recommendation: stride = window_size/2 (50% overlap) as a balance.

2. **Attribute chart patterns:** Feature extraction assumes variable data (continuous measurements). For p/np/c/u charts, some features (skewness, kurtosis) are less meaningful. Need a separate feature set for attribute characteristics, or normalize attribute data to z-scores first.

3. **Short-run chart patterns:** Characteristics in short-run mode (deviation or Z-score) already have normalized data. Feature extraction should use the transformed values, not raw measurements.

4. **CUSUM/EWMA patterns:** These chart types have different pattern semantics — a CUSUM "drift" looks like a monotonically increasing cumulative sum, not a gradual slope in raw data. Pattern search for CUSUM/EWMA may need chart-type-specific feature extraction.

5. **Cross-plant search scope:** Should engineers be able to search patterns across plants? Useful for multi-plant companies, but raises data access control questions. Recommendation: respect existing plant-level RBAC — only search plants the user has access to.

6. **Storage budget:** At 3 scales x stride window_size/2, a characteristic with 10,000 samples generates ~1,200 feature vectors (57 floats each). That is ~274KB per characteristic. For 1,000 characteristics: ~274MB. Manageable for PostgreSQL; may want to compress or prune old windows periodically.

---

## 11. References

### Academic
- Nelson, L.S. "The Shewhart Control Chart — Tests for Special Causes" (1984)
- Yeh et al. "[Matrix Profile I: All Pairs Similarity Joins](https://www.cs.ucr.edu/~eamonn/MatrixProfile.html)" (ICDM 2016)
- Yue et al. "[TS2Vec: Towards Universal Representation of Time Series](https://arxiv.org/abs/2106.10466)" (AAAI 2022)
- Lin et al. "[Experiencing SAX: A Novel Symbolic Representation of Time Series](https://cs.gmu.edu/~jessica/SAX_DAMI_preprint.pdf)" (DMKD 2007)
- Cheng et al. "[Concurrent Control Chart Pattern Recognition: A Systematic Review](https://www.mdpi.com/2227-7390/10/6/934)" (Mathematics 2022)
- Chen et al. "[Time-Series Pattern Recognition in Smart Manufacturing Systems](https://arxiv.org/pdf/2301.12495)" (J. Manufacturing Systems 2023)

### Libraries
- [STUMPY](https://github.com/TDAmeritrade/stumpy) — Matrix Profile (Python, v1.14)
- [tslearn](https://tslearn.readthedocs.io/) — DTW, shapelets, clustering (Python, v0.8)
- [pgvector](https://github.com/pgvector/pgvector) — Vector similarity for PostgreSQL
- [pgvectorscale](https://github.com/timescale/pgvectorscale) — StreamingDiskANN for pgvector
- [saxpy](https://github.com/seninp/saxpy) — SAX implementation (Python)

### Competitive
- [InfinityQS ProFicient](https://www.advantive.com/brands/infinity-qs/) — Market-leading SPC, no pattern search
- [WinSPC / dataPARC](https://www.dataparc.com/spc-sqc/) — Real-time SPC, no pattern search
- [Siemens Opcenter Quality](https://www.siemens.com/en-us/technology/statistical-process-control-spc/) — Enterprise SPC, no pattern search
- [KX Systems TSS](https://medium.com/kx-systems/time-series-similarity-search-for-iot-sensor-failure-detection-6573de6c55e4) — Time-series similarity (financial/IoT, not SPC)
- [STUMPY fast pattern matching](https://stumpy.readthedocs.io/en/latest/Tutorial_Pattern_Matching.html) — Tutorial on MASS-based search
