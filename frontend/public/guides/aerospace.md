# Aerospace — Demo Companion Guide

## Overview

This seed models an aerospace manufacturing facility producing turbine blades and structural components. It demonstrates the compliance-heavy workflow: First Article Inspection (AS9102), CMM gage integration, short-run charts for low-volume variants, MSA studies, and attribute defect tracking.

**Login:** `admin` / `password`
**Plant:** Aerospace Plant (auto-selected)

## Walkthrough

### 1. First Article Inspection

> Navigate to **FAI** in the sidebar.

This is the headline feature for aerospace prospects. AS9102 Rev C compliance is non-negotiable.

- Open an existing FAI report to see the three-form layout:
  - **Form 1** — Part Number Accountability (traceability)
  - **Form 2** — Product Accountability (material, process)
  - **Form 3** — Characteristic Accountability (each dimension with nominal/tolerance/actual)
- Walk through the workflow states: **Draft** -> **Submitted** -> **Approved**
- Show separation of duties: the person who submits cannot approve.
- Click the **Print** view for a clean, auditor-ready document.

**Talking point:** Most SPC tools treat FAI as an afterthought or require a separate module. Cassini embeds it directly with full electronic signature support.

### 2. MSA / Gage R&R for CMM

> Navigate to **MSA** in the sidebar.

- Open the CMM bore diameter study — this is a crossed ANOVA design (operators x parts x replicates).
- Key outputs: %GRR, %EV (equipment variation), %AV (appraiser variation), ndc (number of distinct categories).
- The AIAG MSA 4th Edition guideline: %GRR < 10% is acceptable, 10-30% conditionally acceptable, > 30% unacceptable.

| Metric | Acceptable | What It Means |
|---|---|---|
| %GRR | < 10% | Measurement system captures true part variation |
| ndc | >= 5 | Gage can distinguish at least 5 groups |
| %AV | Low | Operators agree with each other |

### 3. Short-Run Charts for Blade Variants

> Return to the **Dashboard** and find a short-run characteristic.

- Aerospace makes small batches of different blade variants — too few parts for traditional SPC.
- Short-run mode transforms data: **Deviation** mode (subtract target) or **Standardized Z** mode (Z = (x - target) / sigma).
- Multiple part numbers plot on the same chart, each centered at zero.
- Control limits apply to the transformed values, not raw measurements.

**Talking point:** Without short-run charts, aerospace shops either skip SPC on low-volume parts or maintain dozens of charts with insufficient data. Cassini consolidates them.

### 4. Attribute Defect Rate

> Find the **Visual Inspection** or defect-rate characteristic on the dashboard.

- This uses a p-chart (proportion defective) or c-chart (count of defects per unit).
- Attribute data is entered as pass/fail or defect counts rather than continuous measurements.
- Nelson Rules 1-4 apply to attribute charts (rules 5-8 are suppressed — they require continuous data).

### 5. Electronic Signatures on FAI Approval

> Return to **FAI**, open a submitted report, and click **Approve**.

- The signature dialog requires password confirmation and a meaning selection (e.g., "Reviewed and Approved").
- The signature is bound to a SHA-256 hash of the report content — any subsequent edit invalidates it.
- Show the signature trail at the bottom of the report.

## Quick Reference Checklist

- [ ] FAI — AS9102 Forms 1/2/3, draft/submit/approve workflow
- [ ] MSA — crossed ANOVA, %GRR, ndc, AIAG 4th Ed guidelines
- [ ] Short-run charts — deviation mode, standardized Z, multi-variant
- [ ] Attribute charts — p/c chart, defect rate, visual inspection
- [ ] Electronic signatures — SHA-256 hash, meaning, separation of duties
- [ ] Gage bridge — CMM data via RS-232/USB (Connectivity > Gages)
- [ ] Audit trail — Settings > Audit Log for full traceability
