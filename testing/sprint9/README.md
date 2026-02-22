# Sprint 9: Advanced Analytics — Verification Checklist

**Status**: Planned (not started)
**Features**: E1 Multivariate SPC, E2 Predictive Analytics, E4 Inter-Characteristic Correlation, E5 Design of Experiments

> **Note**: Sprint 9 features are not yet implemented. This checklist currently covers
> seed data scaffolding verification only. Feature verification items (marked "Future")
> will be expanded when implementation begins.

---

## E1: Multivariate SPC

**Seed plant**: "E1: Multivariate Process"

### Data Scaffolding

- [ ] Plant "E1: Multivariate Process" exists with correct hierarchy
- [ ] 3 characteristics created representing correlated process variables
- [ ] Known correlation between characteristics (target r approximately 0.85 for primary pair)
- [ ] 200+ samples per characteristic (sufficient for multivariate statistics)
- [ ] Timestamps aligned across all 3 characteristics (same sample times)
- [ ] At least one deliberate multivariate shift event embedded in the data (detectable by Hotelling T² but not univariate charts)

### Future Feature Verification

- [ ] Hotelling T² control chart with UCL from F-distribution
- [ ] MEWMA (Multivariate EWMA) chart for detecting small persistent shifts
- [ ] MCUSUM (Multivariate CUSUM) chart
- [ ] Decomposition: when T² signals, identify which variable(s) contribute
- [ ] Correlation matrix display with statistical significance indicators
- [ ] Phase I (retrospective) vs Phase II (monitoring) mode selection

---

## E2: Predictive Analytics

**Seed plant**: "E2: Predictive Process"

### Data Scaffolding

- [ ] Plant "E2: Predictive Process" exists with correct hierarchy
- [ ] 500+ samples with a gradual drift pattern embedded in the data
- [ ] Drift is subtle enough that standard control chart signals late
- [ ] Timestamps are evenly spaced (simulating regular sampling interval)
- [ ] At least one characteristic has seasonal/cyclical component in addition to drift
- [ ] Data includes a "clean" segment followed by a "drifting" segment for training/testing split

### Future Feature Verification

- [ ] ARIMA model fit and forecast display on chart
- [ ] Prediction intervals (80% and 95%) shown as shaded bands
- [ ] Time-to-out-of-control estimate based on drift rate
- [ ] Model selection diagnostics (AIC/BIC comparison, residual ACF plot)
- [ ] Automatic re-fit trigger when prediction error exceeds threshold
- [ ] Alert when predicted values cross control or spec limits within forecast horizon

---

## E4: Inter-Characteristic Correlation

**Seed plant**: "E4: Correlation Study"

### Data Scaffolding

- [ ] Plant "E4: Correlation Study" exists with correct hierarchy
- [ ] 4 characteristics created with known correlation structure:
  - [ ] Pair 1 (Chars 1-2): high positive correlation (r approximately 0.90)
  - [ ] Pair 2 (Chars 3-4): high negative correlation (r approximately -0.85)
  - [ ] Cross-pairs (1-3, 1-4, 2-3, 2-4): low correlation (|r| < 0.15)
- [ ] 100+ samples per characteristic
- [ ] Timestamps aligned across all 4 characteristics

### Future Feature Verification

- [ ] Correlation matrix heatmap with color-coded cells
- [ ] Scatter matrix (pairwise scatter plots) for all characteristic combinations
- [ ] PCA biplot showing principal components and variable loadings
- [ ] Statistical significance test for each correlation coefficient (p-values)
- [ ] Time-varying correlation tracking (rolling window correlation chart)
- [ ] Alert when historically correlated characteristics decouple

---

## E5: Design of Experiments

**Seed plant**: "E5: DOE Study"

### Data Scaffolding

- [ ] Plant "E5: DOE Study" exists with correct hierarchy
- [ ] 2^3 full factorial structure: 3 factors at 2 levels = 8 runs
- [ ] 5 replicates per run (40 total experimental units)
- [ ] 2 response characteristics measured per experimental unit (80 total measurements)
- [ ] Factor levels encoded in hierarchy or metadata (e.g., "Temp:High/Pressure:Low/Speed:High")
- [ ] Run order randomized (not in standard order) to simulate real experiment
- [ ] At least one significant main effect and one significant interaction embedded in the data

### Future Feature Verification

- [ ] Factorial analysis with ANOVA table (main effects + interactions)
- [ ] Main effects plots for each factor
- [ ] Interaction plots for all 2-factor interactions
- [ ] Normal probability plot of effects (to identify significant factors)
- [ ] Residual analysis (normality, constant variance, independence)
- [ ] Optimal factor settings recommendation based on desirability function
- [ ] Fractional factorial and response surface designs (future extension)

---

## Quick Smoke Test

Run through these 4 items for a fast confidence check:

1. [ ] Open "E1: Multivariate Process" plant, verify 3 characteristics with 200+ samples each
2. [ ] Open "E2: Predictive Process" plant, verify 500+ samples with visible drift in later data
3. [ ] Open "E4: Correlation Study" plant, verify 4 characteristics exist
4. [ ] Open "E5: DOE Study" plant, verify 8 runs with 5 replicates structure in hierarchy
