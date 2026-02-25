# Sprint 9: Advanced Analytics — Verification Checklist

**Status**: Implementation complete, pending testing
**Features**: E1 Multivariate SPC, E2 Predictive Analytics, E3 AI Analysis, E4 Correlation, E5 DOE
**Migration**: 039 (13 tables)
**Backend routes**: 36 new endpoints across 4 routers
**Frontend**: 2 new pages (Analytics, DOE), 29 new components

---

## Setup

```bash
# 1. Seed the database
cd backend
python scripts/seed_test_sprint9.py

# 2. Start the backend
python -m openspc

# 3. Start the frontend (separate terminal)
cd frontend
npm run dev

# 4. Login
#    Admin: admin / password
#    Operator: operator / password
```

**Expected seed output:**
- 4 plants (MVAR, PRED, CORR, DOE)
- ~1,400 samples, ~1,880 measurements
- 1 multivariate group (3 members)
- 1 DOE study (3 factors, 8 runs with response values)
- 1 prediction config (auto model, horizon=20)

---

## 0. Migration & Startup Verification

- [ ] Backend starts without errors, logs show "Application startup complete"
- [ ] Route count includes Sprint 9 routes (expect ~299 total)
- [ ] No import errors in startup logs for multivariate, predictions, ai_analysis, doe routers
- [ ] `alembic upgrade head` succeeds — migration chain 038 → 039

---

## 1. Navigation & Routing

- [ ] Sidebar shows "Analytics" nav item (TrendingUp icon) — requires engineer+ role
- [ ] Sidebar shows "DOE" nav item (FlaskConical icon) — requires engineer+ role
- [ ] Clicking Analytics navigates to `/analytics` — shows tabbed page
- [ ] Clicking DOE navigates to `/doe` — shows study list
- [ ] Operator role does NOT see Analytics/DOE in sidebar
- [ ] Settings page has "AI" tab under admin settings

---

## 2. E1 + E4: Correlation Tab (Analytics Page)

**Plant**: Switch to "E4: Correlation Study" (CORR) first

### Correlation Matrix

- [ ] Correlation tab is the default (first) tab on Analytics page
- [ ] Characteristic multi-select shows 4 chars (Shaft Diameter, Shaft Roundness, Surface Roughness, Hardness)
- [ ] Select all 4 characteristics, choose Pearson method, click Compute
- [ ] Heatmap renders with -1 (blue) to +1 (red) color scale
- [ ] Shaft Diameter ↔ Shaft Roundness shows high correlation (~0.90)
- [ ] Surface Roughness ↔ Hardness shows low correlation (~0.10)
- [ ] Cross-pairs show low correlation (< 0.20)
- [ ] Diagonal cells show 1.00

### PCA

- [ ] Select all 4 chars, enable "Include PCA" checkbox, click Compute
- [ ] PCA biplot renders PC1 vs PC2 scatter with loading vectors
- [ ] First 2 components explain majority of variance (cumulative shown)
- [ ] Loading vectors show which characteristics cluster together

### Correlation History

- [ ] After computing, result appears in "Recent Results" list
- [ ] Clicking a result re-displays its heatmap

**Plant**: Switch to "E1: Multivariate Process" (MVAR)

- [ ] Select all 3 characteristics (Temperature, Pressure, Flow Rate)
- [ ] Compute correlation — heatmap shows high inter-correlation (~0.85)

---

## 3. E1: Multivariate Tab (Analytics Page)

**Plant**: "E1: Multivariate Process" (MVAR)

### Group Management

- [ ] Multivariate tab shows the seeded group "Reactor Conditions"
- [ ] Group card shows: t_squared chart type, Phase I, 3 members, active
- [ ] Create New Group button opens group editor
- [ ] Able to create a second group (e.g., select 2 of 3 chars, MEWMA type)
- [ ] Delete group works (admin only)

### T-Squared Chart (Phase I)

- [ ] Click "Compute" on "Reactor Conditions" group
- [ ] T² chart renders as time series with UCL line (F-distribution based)
- [ ] Points above UCL highlighted as out-of-control (red)
- [ ] Mean vector displayed below the chart
- [ ] Characteristic names shown in legend

### MYT Decomposition

- [ ] Click an OOC point on the T² chart
- [ ] Decomposition table appears showing per-variable contribution
- [ ] Variables sorted by contribution (highest first)
- [ ] Contributions sum approximately to the T² value

### Phase Freeze (Phase I → Phase II)

- [ ] Click "Freeze" button on the group
- [ ] Confirmation dialog appears
- [ ] After freeze: group status changes to Phase II
- [ ] Re-compute: T² values now use frozen reference parameters
- [ ] UCL changes (Phase II uses chi-squared instead of F-distribution)

### MEWMA Chart

- [ ] Create a new group with chart_type = "mewma"
- [ ] Compute MEWMA — chart renders with lambda-weighted T² values
- [ ] UCL based on asymptotic chi-squared distribution
- [ ] Small shifts are more detectable than with T² chart

---

## 4. E2: Predictions Tab (Analytics Page)

**Plant**: "E2: Predictive Process" (PRED)

### Dashboard

- [ ] Predictions tab shows dashboard with seeded config for "Fill Weight (g)"
- [ ] Shows: enabled status, model type (auto), no trained model yet
- [ ] Other characteristics in the plant are NOT shown (no config)

### Configuration

- [ ] Click on Fill Weight characteristic row
- [ ] Config panel shows: model_type=auto, horizon=20, refit_interval=50, confidence=[0.8, 0.95]
- [ ] Can toggle model type between auto/arima/exponential_smoothing
- [ ] Can adjust horizon slider
- [ ] Changes persist after save

### Model Training

- [ ] Click "Train Now" button
- [ ] **If statsmodels is installed**: Model trains successfully
  - [ ] Model type shown (arima or exponential_smoothing, auto-selected)
  - [ ] AIC value displayed
  - [ ] Training samples count shown (120)
- [ ] **If statsmodels NOT installed**: 503 error with clear message "Prediction features require statsmodels package"
  - Install: `pip install statsmodels`

### Forecast Display

- [ ] After training, forecast overlay appears
- [ ] 20-step forecast shown as dashed line
- [ ] 80% confidence interval shown as inner shaded band
- [ ] 95% confidence interval shown as outer shaded band
- [ ] Since data has drift (+0.015/sample), forecast should trend upward
- [ ] Predicted OOC step flagged if forecast crosses UCL (502.0)

### Forecast History

- [ ] Re-train model to generate second forecast
- [ ] History shows both forecast batches with timestamps

---

## 5. E3: AI Insights Tab (Analytics Page)

### Configuration (Settings → AI)

- [ ] Navigate to Settings → AI tab
- [ ] Provider dropdown: claude, openai
- [ ] API key field: input and save (Fernet-encrypted in DB, never returned in responses)
- [ ] Model name field: e.g., "claude-sonnet-4-20250514"
- [ ] Max tokens: configurable
- [ ] Test Connection button: sends a test prompt to validate the API key

### AI Analysis

- [ ] AI Insights tab shows list of characteristics
- [ ] Click "Analyze" on a characteristic
- [ ] **If API key configured**: LLM analysis runs, returns structured insight
  - [ ] Patterns section: identified patterns in the data
  - [ ] Risks section: potential quality risks
  - [ ] Recommendations section: actionable suggestions
  - [ ] Collapsible sections work
- [ ] **If no API key**: Clear error message about missing configuration
- [ ] Insight history: previous analyses listed with timestamps

---

## 6. E5: DOE Page

**Plant**: "E5: DOE Study" (DOE)

### Study List

- [ ] DOE page shows study "Process Optimization — 2^3 Factorial"
- [ ] Status filter tabs: All, Design, Collecting, Analyzed
- [ ] Study card shows: design type (full_factorial), 3 factors, 8 runs, status=collecting
- [ ] "New Study" button visible

### Study Editor — View Existing

- [ ] Click the study to open editor
- [ ] 4-phase wizard: Define → Design → Collect → Analyze
- [ ] Since status is "collecting", wizard opens at Collect phase

#### Define Phase (read-only for existing study)

- [ ] Study name, design type, response name/unit shown
- [ ] 3 factors displayed: Temperature (160-200 °C), Pressure (400-500 kPa), Feed Rate (20-30 L/min)

#### Collect Phase

- [ ] Run Table shows 8 runs with factor values and response values
- [ ] All 8 runs have response values pre-populated from seed
- [ ] Factor values show actual levels (160/200, 400/500, 20/30 — not coded -1/+1)
- [ ] Progress bar shows 8/8 runs completed

#### Analyze Phase

- [ ] Click "Analyze" button
- [ ] ANOVA table renders with columns: Source, SS, df, MS, F, p-value
- [ ] Main effects:
  - Temperature (A): effect ≈ +6.0 (coefficient ≈ +3.0) — **significant**
  - Pressure (B): effect ≈ +3.0 (coefficient ≈ +1.5) — **significant**
  - Feed Rate (C): effect ≈ +4.0 (coefficient ≈ +2.0) — **significant**
- [ ] Interaction AB: effect ≈ +1.6 (coefficient ≈ +0.8) — may or may not be significant
- [ ] p-values color-coded (green < 0.05, red > 0.05)
- [ ] R² displayed (should be high, > 0.90)

#### Main Effects Plot

- [ ] Bar or line chart showing effect magnitude per factor
- [ ] Temperature has largest effect, Feed Rate second, Pressure third

#### Interaction Plot

- [ ] Grid of interaction sub-plots
- [ ] AB interaction visible (non-parallel lines)
- [ ] Other interactions near zero (parallel lines)

#### Pareto Chart

- [ ] Horizontal bar chart of effects sorted by absolute magnitude
- [ ] Reference line at significance threshold

### Create New Study

- [ ] Click "New Study" from DOE page
- [ ] Wizard starts at Define phase
- [ ] Select design type: full_factorial, fractional_factorial, central_composite, box_behnken
- [ ] Add 2-3 factors with names, low/high levels, units
- [ ] Box-Behnken validation: requires 3+ factors
- [ ] Fractional factorial: shows resolution selector
- [ ] Click "Generate Design" to create runs
- [ ] Study transitions from "design" → "collecting"
- [ ] Run table appears with generated factor combinations
- [ ] Enter response values for each run
- [ ] Click "Analyze" — ANOVA and effects computed

---

## 7. DualChartPanel Integration

- [ ] On any standard control chart, verify new toolbar buttons:
  - [ ] Predictions toggle (TrendingUp icon) — shows/hides forecast overlay
  - [ ] AI Analysis button (Brain icon) — opens AI insight panel
- [ ] Predictions toggle only appears if characteristic has a prediction config
- [ ] AI analysis panel slides in from the right

---

## 8. API Verification (curl / Swagger)

### Multivariate (12 endpoints)

```bash
# List groups
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/multivariate/groups?plant_id=1"

# Compute T² chart
curl -X POST -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/multivariate/groups/1/compute"

# Compute correlation
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"plant_id":3,"characteristic_ids":[7,8,9,10],"method":"pearson","include_pca":true}' \
  "http://localhost:8000/api/v1/multivariate/correlation/compute"
```

### Predictions (8 endpoints)

```bash
# Get prediction dashboard
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/predictions/dashboard?plant_id=2"

# Get config for a characteristic
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/predictions/4/config"

# Train model
curl -X POST -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/predictions/4/train"
```

### DOE (10 endpoints)

```bash
# List studies
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/doe/studies?plant_id=4"

# Analyze study (triggers ANOVA)
curl -X POST -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/doe/studies/1/analyze"

# Get analysis results
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/doe/studies/1/analysis"
```

### AI Analysis (6 endpoints)

```bash
# Get AI config
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/ai/config?plant_id=1"

# Test connection (requires API key configured)
curl -X POST -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/ai/test?plant_id=1"
```

---

## 9. Edge Cases & Error Handling

- [ ] DOE: Cannot generate design for a study already in "collecting" status (409 Conflict)
- [ ] DOE: Cannot analyze a study in "design" status (409 Conflict)
- [ ] DOE: Analysis with missing response values returns 400 with run_order list
- [ ] Predictions: Training with < 50 samples returns 400 with clear message
- [ ] Predictions: Missing statsmodels returns 503 (not 500)
- [ ] Multivariate: Compute with < min_samples returns 400 with counts
- [ ] Multivariate: Group with no members returns 400
- [ ] Correlation: < 3 aligned observations returns 400
- [ ] PCA: < 3 samples returns 400
- [ ] AI Analysis: API key never returned in GET responses (has_api_key boolean only)
- [ ] AI Analysis: Test connection without API key returns clear error
- [ ] All endpoints require engineer+ role (operator gets 403)
- [ ] DOE delete requires admin role

---

## 10. Seed Data Cross-Check

| Plant | Code | Chars | Samples | Special |
|-------|------|-------|---------|---------|
| E1: Multivariate Process | MVAR | 3 (Temp, Pressure, Flow) | 200 each | rho ≈ 0.85, 1 MV group |
| E2: Predictive Process | PRED | 1 (Fill Weight) | 120 (n=5) | Drift +0.015/sample, 1 pred config |
| E4: Correlation Study | CORR | 4 (Diameter, Roundness, Roughness, Hardness) | 150 each | 2 pairs: rho≈0.90 + rho≈0.10 |
| E5: DOE Study | DOE | 2 (Yield, Purity) | 80 (8 runs × 5 reps × 2) | 1 DOE study, 3 factors, 8 runs |

---

## Quick Smoke Test

1. [ ] Seed database and start backend — no startup errors
2. [ ] Login as admin, verify Analytics and DOE visible in sidebar
3. [ ] Analytics page loads with 4 tabs (Correlation, Multivariate, Predictions, AI Insights)
4. [ ] Switch to CORR plant → Correlation tab → compute correlation for 4 chars → heatmap renders
5. [ ] Switch to MVAR plant → Multivariate tab → compute T² for Reactor Conditions group → chart renders
6. [ ] Switch to PRED plant → Predictions tab → train model for Fill Weight → forecast renders
7. [ ] DOE page → click study → Collect phase shows 8 runs → click Analyze → ANOVA table renders
8. [ ] Login as operator → verify Analytics and DOE are NOT visible
