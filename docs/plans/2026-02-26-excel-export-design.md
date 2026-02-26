# Excel Export for SPC Dashboard — Design Document

**Date**: 2026-02-26
**Status**: Approved

## Overview

Export the underlying SPC data from the dashboard as a richly-formatted Excel workbook with live Excel formulas, giving statistics-savvy users the agency to perform their own analysis on top of what Cassini provides.

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Generation | Backend (openpyxl, MIT license) | Real formulas, conditional formatting, frozen panes, named ranges — full Excel power |
| Layout | Wide format (one row per subgroup) | Natural for Excel users; formulas reference same-row cells |
| UI Trigger | Dashboard ChartPanel toolbar | Highest visibility; exports exactly the data window the user sees |
| Stats approach | Formulas only (no server cross-check) | Empowers users to modify data and watch stats recalculate |

## Sheet Structure

### Sheet 1: Measurements

One row per sample/subgroup. Columns:

| Column | Content | Type |
|--------|---------|------|
| A: Timestamp | Sample datetime | datetime |
| B: Operator | operator_id | text (optional) |
| C: Batch | batch_number | text (optional) |
| D..N: Meas 1..N | Individual measurement values | float (dynamic by subgroup size) |
| N+1: Mean | `=AVERAGE(D{row}:N{row})` | Excel formula |
| N+2: Range | `=MAX(D{row}:N{row})-MIN(D{row}:N{row})` | Excel formula |
| N+3: Min | `=MIN(D{row}:N{row})` | Excel formula |
| N+4: Max | `=MAX(D{row}:N{row})` | Excel formula |
| N+5: Std Dev | `=STDEV.S(D{row}:N{row})` | Excel formula (subgroup > 1 only) |
| N+6: Violations | Text like "Rule 1, Rule 4" | text (or blank) |
| N+7: Annotations | Annotation text | text (if any on this sample) |
| N+8: Excluded | TRUE/FALSE | boolean |

**Styling**: Frozen top row, header fill color, number formatting matching `decimal_precision`, conditional formatting (red fill if violations exist in row).

### Sheet 2: Summary Statistics

All formula-based, referencing the Measurements sheet:

| Metric | Formula |
|--------|---------|
| Sample Count | `=COUNTA(Measurements!A:A)-1` |
| X-bar (Grand Mean) | `=AVERAGE(MeanColumn)` |
| R-bar (Avg Range) | `=AVERAGE(RangeColumn)` |
| Std Dev (Overall) | `=STDEV.S(MeanColumn)` |
| USL / LSL / Target | Static values from characteristic config |
| Cp | `=(USL-LSL)/(6*Sigma)` |
| Cpk | `=MIN((USL-Xbar)/(3*Sigma), (Xbar-LSL)/(3*Sigma))` |
| Pp | `=(USL-LSL)/(6*StdDev)` |
| Ppk | `=MIN((USL-Xbar)/(3*StdDev), (Xbar-LSL)/(3*StdDev))` |

Capability metrics only included when both spec limits exist.

### Sheet 3: Control Limits

| Field | Value |
|-------|-------|
| UCL | Static from stored limits |
| Center Line | Static |
| LCL | Static |
| USL | Static |
| LSL | Static |
| Target | Static |
| Stored Sigma | Static |
| Subgroup Size | Static |
| Chart Type | e.g., "X-bar/R" |

### Sheet 4: Violations

| Column | Content |
|--------|---------|
| Sample # | Row reference back to Measurements sheet |
| Timestamp | When violation was detected |
| Rule | "Rule 1: One point beyond 3σ" |
| Severity | WARNING / CRITICAL |
| Acknowledged | Yes/No |
| Ack By / Reason | If acknowledged |

### Sheet 5: Annotations

| Column | Content |
|--------|---------|
| Type | Point / Period |
| Sample # | Row reference to Measurements |
| Text | Annotation content |
| Author | created_by |
| Created | Timestamp |

## Metadata Header

Each sheet gets a small header block (rows 1-3):
- Characteristic name + hierarchy path
- Export date/time
- Data window description (e.g., "Last 100 samples" or "2026-01-01 to 2026-02-26")

Data starts at row 5 so the header doesn't interfere with formulas/filtering.

## API Contract

```
GET /api/v1/characteristics/{char_id}/export/excel
  ?limit=100          (optional, default 100)
  &start_date=...     (optional ISO datetime)
  &end_date=...       (optional ISO datetime)

Response: 200
Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
Content-Disposition: attachment; filename="{characteristic_name}_{date}.xlsx"
```

- Requires `operator` role minimum
- Audit logged via middleware (GET won't be caught — need explicit audit_service.log() call)

## Frontend Integration

- Export button added to ChartPanel toolbar
- Passes current `chartOptions` (limit, startDate, endDate) as query params
- Uses `fetchApi` to request the endpoint, triggers browser download via blob URL

## Dependencies

- **Backend**: `openpyxl` (MIT license — compatible with AGPL and future commercial)
- **Frontend**: No new dependencies (uses existing fetchApi + blob download pattern)

## Scope Exclusions

- No sample history page export (can add later)
- No attribute chart variant (can extend later — different column structure)
- No CUSUM/EWMA variant (can extend later)
- Variable charts only for v1
