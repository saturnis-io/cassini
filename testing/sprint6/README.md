# Sprint 6: Automotive/Aerospace Compliance — Verification Checklist

**Status**: Complete
**Features**: B1 Gage R&R/MSA, B2 Short-Run Charts, B3 First Article Inspection

---

## Prerequisites

1. Run the Sprint 6 test seed from DevTools page (or `python backend/scripts/seed_test_sprint6.py`)
2. Four users available: `admin`, `engineer1`, `engineer2`, `operator` (all password: `password`)
3. Three test plants created: B1 (Gage R&R), B2 (Short-Run), B3 (FAI)

---

## B1: Gage R&R / MSA

**Seed plant**: "B1: Gage R&R Study"
**Login as**: engineer1

### Data Verification

- [ ] Plant "B1: Gage R&R Study" exists with Gage Lab > Caliper Station hierarchy
- [ ] "Reference Diameter" characteristic has 20 SPC samples on its chart
- [ ] MSA study "Caliper Gage R&R — Reference Diameter" appears on the MSA page (/msa)
- [ ] Study shows 3 operators (Alice, Bob, Charlie), 10 parts, 3 replicates
- [ ] Study status is "collecting" (measurements entered, ready to calculate)

### Feature Verification

- [ ] Navigate to /msa, select B1 plant — study list renders
- [ ] Open study — wizard shows operators, parts, measurement data grid
- [ ] Measurement grid displays 90 values (10 parts × 3 operators × 3 replicates)
- [ ] Click "Calculate" — ANOVA results appear with variance components table
- [ ] %GRR (Gage R&R as % of Study Variation) displayed — expect ~20-35% (marginal range)
- [ ] Repeatability (EV) and Reproducibility (AV) breakdown shown separately
- [ ] Number of Distinct Categories (ndc) calculated and displayed
- [ ] P/T ratio (% of Tolerance) displayed — tolerance is 0.200 mm
- [ ] ANOVA table shows Source, DF, SS, MS, F, p-value columns
- [ ] Verdict badge: "Acceptable" (≤10%), "Marginal" (10-30%), or "Unacceptable" (>30%)
- [ ] Bar chart visualizes EV/AV/GRR/PV/TV breakdown

---

## B2: Short-Run Charts

**Seed plant**: "B2: Short-Run SPC"
**Login as**: engineer1

### Data Verification

- [ ] Plant "B2: Short-Run SPC" exists with Job Shop > CNC Cell 1 hierarchy
- [ ] 5 characteristics created: Run-A through Run-E with different nominals
- [ ] Run-A, B, C have `short_run_mode = standardized`
- [ ] Run-D, E have `short_run_mode = deviation`

### Feature Verification

- [ ] Open Run-A (standardized mode): Y-axis shows "Z-Score" label
- [ ] Standardized chart: center line = 0, UCL = +3, LCL = -3
- [ ] Tooltip shows "Z-Score" values instead of raw measurements
- [ ] Open Run-D (deviation mode): Y-axis shows "Deviation from Target" label
- [ ] Deviation chart: data points show offset from target value
- [ ] Short-run mode dropdown visible in characteristic settings (LimitsTab)
- [ ] Changing mode between Off/Deviation/Standardized updates chart display
- [ ] ChartPanel domain adapts correctly for standardized mode (symmetric around 0)

---

## B3: First Article Inspection

**Seed plant**: "B3: FAI Verification"
**Login as**: engineer1 (create/edit), engineer2 (approve)

### Data Verification

- [ ] Plant "B3: FAI Verification" exists with Inspection Bay > CMM Station hierarchy
- [ ] 3 characteristics with SPC data (Bore Diameter, Length, Surface Finish)
- [ ] 2 FAI reports visible on FAI page (/fai) when B3 plant selected
- [ ] Report "PN-7891-A" (Turbine Bearing Housing) in draft status
- [ ] Report "PN-2345-B" (Fuel Nozzle Assembly) in submitted status

### Feature Verification — Report Browsing

- [ ] Navigate to /fai, select B3 plant — report list renders with status badges
- [ ] Draft report shows "Draft" badge, submitted shows "Submitted" badge
- [ ] Click on draft report — FAI editor opens with 3 tabs (Form 1/2/3)

### Feature Verification — AS9102 Forms

- [ ] Form 1 (Part Accountability): part number, revision, drawing number, supplier visible
- [ ] Form 2 (Product Accountability): material spec "AMS 5662 (Inconel 718)", special processes list
- [ ] Form 3 (Characteristic Accountability): 3 inspection items in grid
- [ ] Items show balloon numbers (1, 2, 3), nominal/USL/LSL/actual values
- [ ] All 3 items in draft report show "pass" result (green indicator)

### Feature Verification — Submitted Report

- [ ] Open submitted report "PN-2345-B"
- [ ] 2 items pass, 1 item (Surface Finish) shows "deviation" result
- [ ] Deviation reason text visible: "Surface finish exceeds USL..."
- [ ] Functional test results JSON displayed in Form 2

### Feature Verification — Workflow

- [ ] As engineer1: draft report can be edited (fields are editable)
- [ ] As engineer1: click "Submit" on draft report — status changes to "submitted"
- [ ] As engineer1: try to approve own submitted report — get 403 (separation of duties)
- [ ] Log in as engineer2: navigate to submitted report
- [ ] As engineer2: click "Approve" — status changes to "approved", timestamp recorded
- [ ] Verify: approved report is read-only (no edits allowed)

### Feature Verification — Rejection Flow

- [ ] Create a new draft report, add items, submit it (as engineer1)
- [ ] As engineer2: click "Reject" with reason — status returns to "draft"
- [ ] Rejection reason visible on the report
- [ ] Draft report is editable again after rejection

### Feature Verification — Print View

- [ ] Open any report, check print preview (if available)
- [ ] AS9102 form layout renders in print-friendly format

---

## Quick Smoke Test

Run through these items for a fast confidence check:

1. [ ] /msa page loads, B1 study visible with measurement data
2. [ ] B2 plant: Run-A chart shows Z-Score axis (standardized mode active)
3. [ ] /fai page loads, B3 plant shows 2 reports with correct statuses
4. [ ] FAI Form 3 grid shows balloon numbers and pass/fail/deviation results
5. [ ] Separation of duties works: engineer1 cannot approve own submission
