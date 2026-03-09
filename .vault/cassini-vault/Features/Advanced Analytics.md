---
type: feature
status: active
created: 2026-03-06
updated: 2026-03-06
sprint: "[[Sprints/Sprint 9 - Advanced Analytics]]"
tags:
  - feature
  - active
aliases:
  - Multivariate SPC
  - Predictive Analytics
  - Gen AI Analysis
  - DOE
  - Design of Experiments
  - Inter-Characteristic Correlation
---

# Advanced Analytics

Suite of advanced statistical and AI capabilities: multivariate SPC (Hotelling T-squared, MEWMA, PCA decomposition), correlation analysis, predictive forecasting (ARIMA, exponential smoothing, auto model selection by AIC), Design of Experiments (full/fractional factorial, Plackett-Burman, Box-Behnken), and gen-AI analysis (OpenAI/Anthropic adapters with SPC-context prompts).

## Key Backend Components

- **Multivariate**: `core/multivariate/hotelling.py` (T-squared, UCL, MYT decomposition), `mewma.py`, `correlation.py` (Pearson/Spearman + PCA), `data_loader.py` (time-series alignment), `decomposition.py`
- **Forecasting**: `core/forecasting/engine.py`, `arima.py`, `exponential_smoothing.py`, `model_selector.py` (auto AIC), `alerts.py` (predicted OOC)
- **DOE**: `core/doe/engine.py`, `designs.py` (4 design types), `analysis.py` (ANOVA, effects, regression)
- **AI Analysis**: `core/ai_analysis/engine.py`, `providers.py` (OpenAI/Anthropic), `context_builder.py`, `prompts.py`
- **Models**: `MultivariateGroup`, `MultivariateSample`, `CorrelationResult` in `db/models/multivariate.py`; `PredictionConfig`, `PredictionModel`, `Forecast` in `db/models/prediction.py`; `DOEStudy`, `DOEFactor`, `DOERun`, `DOEAnalysis` in `db/models/doe.py`; `AIConfig` in `db/models/ai_config.py`
- **Routers**: `api/v1/multivariate.py`, `api/v1/predictions.py`, `api/v1/doe.py`, `api/v1/ai_analysis.py` (~30 endpoints total)
- **Migration**: 039 (12 tables)

## Key Frontend Components

- **Multivariate**: `MultivariateTab.tsx`, `T2Chart.tsx`, `GroupManager.tsx`, `CorrelationTab.tsx`, `CorrelationHeatmap.tsx`, `PCABiplot.tsx`
- **Predictions**: `PredictionsTab.tsx`, `PredictionConfig.tsx`, `PredictionOverlay.tsx`
- **DOE**: `DOEStudyEditor.tsx`, `DesignMatrix.tsx`, `FactorEditor.tsx`, `RunTable.tsx`, `ANOVATable.tsx`, `MainEffectsPlot.tsx`, `InteractionPlot.tsx`, `ParetoChart.tsx`
- **AI**: `AIInsightPanel.tsx`, `AIInsightsTab.tsx`, `AIConfigSettings.tsx`
- Page routes: `/analytics`, `/doe`
- Hooks: `useMultivariateGroups`, `useCorrelation`, `usePredictions`, `useDOEStudies`, `useAIAnalysis`

## Connections

- Multivariate groups link to [[SPC Engine]] characteristics
- Prediction overlay renders on [[SPC Engine]] control charts
- DOE sign-off optionally via [[Electronic Signatures]]
- AI provider API keys encrypted with Fernet (same key as [[Admin]] DB encryption)
- AI analysis builds context from [[SPC Engine]] data + [[Capability]] metrics

## Known Limitations

- Multivariate `DataLoader` must align time series by timestamp -- missing values filled with NaN or last-known
- PCA requires centered/scaled data (handled by correlation engine)
- DOE run order randomized by default; `standard_order` preserved for reference
- AI provider keys encrypted with Fernet from `.db_encryption_key`
- ARIMA model selection compares ARIMA, exponential smoothing, and linear models by AIC
