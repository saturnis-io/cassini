---
type: design
status: complete
created: 2026-02-24
updated: 2026-03-06
sprint: "[[Sprints/Sprint 9 - Advanced Analytics]]"
tags: [design, complete]
---

# Sprint 9: Advanced Analytics

Five features moving Cassini from competitive parity to category leadership. Only 1-2 commercial SPC tools offer any of these.

## Features

- **E1**: Multivariate SPC (Hotelling T^2, MEWMA)
- **E2**: Predictive Analytics (ARIMA, Holt-Winters)
- **E3**: Generative AI Chart Analysis (Claude, OpenAI)
- **E4**: Inter-Characteristic Correlation (Pearson, Spearman, PCA)
- **E5**: DOE (Full/Fractional Factorial, CCD, Box-Behnken)

E1 + E4 merged into a single `core/multivariate/` module (shared covariance/correlation logic).

## Migration 039

**12 new tables** in a single migration:

| Group | Tables |
|-------|--------|
| Multivariate (E1+E4) | `multivariate_group`, `multivariate_group_member`, `multivariate_sample`, `correlation_result` |
| Predictions (E2) | `prediction_config`, `prediction_model`, `forecast` |
| AI Analysis (E3) | `ai_provider_config`, `ai_insight` |
| DOE (E5) | `doe_study`, `doe_factor`, `doe_run`, `doe_analysis` |

## E1 + E4: Multivariate SPC & Correlation

### Backend: `core/multivariate/`

- **`hotelling.py`**: Hotelling T^2 engine -- Phase I estimation (mean + covariance), Phase II monitoring, UCL via F-distribution or chi-squared, MYT decomposition for OOC diagnosis
- **`mewma.py`**: Multivariate EWMA -- smoothed vector Z_i = lambda*X_i + (1-lambda)*Z_{i-1}, time-varying covariance, configurable lambda (default 0.1)
- **`correlation.py`**: Pearson r / Spearman rho for all pairs with p-values, PCA via eigendecomposition of correlation matrix
- **`data_loader.py`**: Multi-characteristic aligned data extraction (timestamp-based join with configurable tolerance window)
- **`decomposition.py`**: MYT T^2 conditional decomposition identifying which variable(s) drove an OOC signal

### Key Design Decisions

- Minimum samples: 20 x p (number of characteristics) for Phase I
- Singular covariance: check condition number > 1e10 -> use pseudo-inverse
- Phase I -> Phase II freeze: stores reference mean + covariance permanently

### Frontend

- Analytics page with Correlation + Multivariate tabs
- `CorrelationHeatmap.tsx`: ECharts heatmap (-1 blue -> 0 white -> +1 red)
- `ScatterMatrix.tsx`: NxN grid (scatter lower triangle, histogram diagonal, r-value upper)
- `PCABiplot.tsx`: PC1 vs PC2 scores with loading vectors
- `T2Chart.tsx`: T^2 time series with UCL line, click OOC -> decomposition table

## E2: Predictive Analytics

### Backend: `core/forecasting/`

Event-bus subscriber pattern (like anomaly detector). On each `SampleProcessedEvent`:
1. Check if characteristic has prediction config enabled
2. If enough new data since last fit -> retrain via auto-model selection
3. Generate forecast with confidence intervals (80%, 95%)
4. Check for predicted OOC (forecast crossing UCL/LCL) -> publish `PredictedOOCEvent`

### Auto-Model Selection

Try ARIMA(1,1,1), ARIMA(2,1,0), ARIMA(0,1,1), ARIMA(1,0,1), Holt-Winters additive, simple ES. Select by AIC. Minimum 50 observations. Lazy import of `statsmodels` with graceful degradation.

### Frontend

- Prediction overlay on existing charts: dashed line + shaded confidence bands (MarkLine + MarkArea)
- "Show Predictions" toggle on chart toolbar
- PredictionsTab in Analytics page: model info, forecast accuracy (MAPE)

## E3: Generative AI Chart Analysis

### Backend: `core/ai_analysis/`

- **Context builder**: Serializes chart state (recent values, control limits, capability, violations, anomalies, detected patterns) into structured context for LLM
- **Provider abstraction**: `ClaudeProvider` (Anthropic API) + `OpenAIProvider` (OpenAI API)
- **Prompt templates**: Structured prompt asking for JSON output with summary, patterns, risks, recommendations
- **Caching**: SHA-256 context hash -> skip re-analysis if context unchanged within 1 hour

### Security

- API key Fernet-encrypted in DB (same as ERP connector pattern)
- API key NEVER returned in GET responses
- LLM errors -> generic message to user, full details logged server-side
- 30s timeout on httpx calls

### Frontend

- "AI Analysis" button (Brain icon) on chart toolbar
- `AIInsightPanel.tsx`: Summary paragraph, collapsible Patterns/Risks/Recommendations sections
- `AIConfigSettings.tsx`: Provider selector, API key, model name, enable/disable, test connection

## E5: DOE (Design of Experiments)

### Backend: `core/doe/`

**Design generators**: Full factorial (2^k), fractional factorial (2^(k-p) with resolution), CCD (rotatable/face-centered/orthogonal), Box-Behnken. All return randomized run order with coded values.

**Analysis**: Main effects, 2-factor interactions, ANOVA (SS/df/MS/F/p-value), polynomial regression for RSM, optimal factor settings.

### Frontend

- DOE page with wizard-based study editor (Define -> Design -> Collect -> Analyze)
- `FactorEditor.tsx`: Add/edit factors with low/high/unit
- `RunTable.tsx`: Design matrix with editable response column
- `ANOVATable.tsx`: Formatted ANOVA with color-coded p-values
- `MainEffectsPlot.tsx`, `InteractionPlot.tsx`, `ParetoChart.tsx`

## New Dependencies

| Package | Purpose | Strategy |
|---------|---------|----------|
| `statsmodels>=0.14.0` | ARIMA, Holt-Winters, regression | Lazy import -- graceful degradation |

ECharts heatmap chart registered in `echarts.ts` for correlation visualization.

## Execution Model

5 waves, 12 agents total:
1. Migration + models (1 agent)
2. 4 backend engines (parallel)
3. 2 API agents (parallel)
4. 3 frontend agents (parallel)
5. Integration + skeptic (2 parallel)

## New Events

- `PredictedOOCEvent` -- Published by ForecastingEngine, consumed by NotificationDispatcher
- `CorrelationAlertEvent` -- Published by CorrelationEngine when |r| > threshold

## Frontend Routes

- `/analytics` -- AnalyticsPage (tabs: Correlation, Multivariate, Predictions, AI Insights)
- `/doe` -- DOEPage (study list)
- `/doe/:studyId` -- DOEStudyEditor
- `/settings/ai` -- AIConfigSettings (admin)
