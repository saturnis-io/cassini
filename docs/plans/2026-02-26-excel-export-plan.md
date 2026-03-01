# Excel Export Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a backend-generated Excel export to the dashboard that gives users a rich, formula-driven workbook with all their SPC data.

**Architecture:** New endpoint on the existing characteristics router (`GET /{char_id}/export/excel`) generates an `.xlsx` via openpyxl (already in deps). Frontend adds an Export button to ChartToolbar that triggers a blob download using the existing `fetch` + blob pattern from audit log export.

**Tech Stack:** openpyxl (backend, already installed), StreamingResponse (FastAPI), raw fetch + blob URL (frontend)

---

### Task 1: Backend — Excel export service module

**Files:**
- Create: `backend/src/cassini/core/excel_export.py`

**Step 1: Create the Excel export service**

This module builds the workbook. It receives pre-fetched data (samples, violations, annotations, characteristic) and returns an openpyxl Workbook. No database access — pure transformation.

```python
"""Excel export service — builds rich .xlsx workbooks from SPC data."""

from __future__ import annotations

import math
from datetime import datetime
from io import BytesIO
from typing import TYPE_CHECKING

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side, numbers
from openpyxl.utils import get_column_letter

if TYPE_CHECKING:
    from cassini.db.models.annotation import Annotation
    from cassini.db.models.characteristic import Characteristic
    from cassini.db.models.sample import Sample
    from cassini.db.models.violation import Violation


# ── Styling constants ────────────────────────────────────────────────
_HEADER_FONT = Font(name="Calibri", bold=True, size=11, color="FFFFFF")
_HEADER_FILL = PatternFill(start_color="2F5496", end_color="2F5496", fill_type="solid")
_META_FONT = Font(name="Calibri", bold=True, size=10, color="2F5496")
_METRIC_LABEL_FONT = Font(name="Calibri", bold=True, size=10)
_THIN_BORDER = Border(
    left=Side(style="thin"),
    right=Side(style="thin"),
    top=Side(style="thin"),
    bottom=Side(style="thin"),
)
_VIOLATION_FILL = PatternFill(start_color="FFC7CE", end_color="FFC7CE", fill_type="solid")

# Nelson rule descriptions
_RULE_NAMES: dict[int, str] = {
    1: "One point beyond 3σ",
    2: "Nine points same side of center",
    3: "Six points trending",
    4: "Fourteen points alternating",
    5: "Two of three beyond 2σ",
    6: "Four of five beyond 1σ",
    7: "Fifteen points within 1σ",
    8: "Eight points beyond 1σ both sides",
}


def build_export_workbook(
    characteristic: Characteristic,
    samples: list[Sample],
    violations_by_sample: dict[int, list[Violation]],
    annotations: list[Annotation],
    hierarchy_path: str,
    data_window_description: str,
) -> BytesIO:
    """Build a complete Excel workbook and return it as a BytesIO stream."""
    wb = Workbook()
    n = characteristic.subgroup_size or 1
    precision = characteristic.decimal_precision or 3
    num_fmt = f"0.{'0' * precision}"

    # Sheet 1: Measurements
    _build_measurements_sheet(wb, characteristic, samples, violations_by_sample, annotations, hierarchy_path, data_window_description, n, precision, num_fmt)

    # Sheet 2: Summary Statistics
    _build_summary_sheet(wb, characteristic, hierarchy_path, data_window_description, n, num_fmt)

    # Sheet 3: Control Limits
    _build_limits_sheet(wb, characteristic, hierarchy_path, data_window_description, num_fmt)

    # Sheet 4: Violations
    _build_violations_sheet(wb, samples, violations_by_sample, hierarchy_path, data_window_description)

    # Sheet 5: Annotations
    _build_annotations_sheet(wb, annotations, samples, hierarchy_path, data_window_description)

    # Remove default empty sheet if it exists
    if "Sheet" in wb.sheetnames:
        del wb["Sheet"]

    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf


# ── Helpers ──────────────────────────────────────────────────────────

def _write_meta_header(ws, hierarchy_path: str, data_window: str, start_row: int = 1) -> int:
    """Write 3-row metadata header. Returns the row where data headers start (start_row + 4)."""
    ws.cell(row=start_row, column=1, value=hierarchy_path).font = _META_FONT
    ws.cell(row=start_row + 1, column=1, value=f"Exported: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}").font = _META_FONT
    ws.cell(row=start_row + 2, column=1, value=f"Data window: {data_window}").font = _META_FONT
    return start_row + 4  # Data headers at row 5


def _style_header_row(ws, row: int, col_count: int) -> None:
    """Apply header styling to a row."""
    for col in range(1, col_count + 1):
        cell = ws.cell(row=row, column=col)
        cell.font = _HEADER_FONT
        cell.fill = _HEADER_FILL
        cell.alignment = Alignment(horizontal="center")
        cell.border = _THIN_BORDER


def _auto_width(ws, min_width: int = 10, max_width: int = 30) -> None:
    """Auto-fit column widths based on content."""
    for col in ws.columns:
        max_len = 0
        col_letter = get_column_letter(col[0].column)
        for cell in col:
            if cell.value is not None:
                max_len = max(max_len, len(str(cell.value)))
        ws.column_dimensions[col_letter].width = min(max(max_len + 2, min_width), max_width)


# ── Sheet builders ───────────────────────────────────────────────────

def _build_measurements_sheet(
    wb: Workbook,
    char: Characteristic,
    samples: list[Sample],
    violations_by_sample: dict[int, list[Violation]],
    annotations: list[Annotation],
    hierarchy_path: str,
    data_window: str,
    n: int,
    precision: int,
    num_fmt: str,
) -> None:
    ws = wb.active
    ws.title = "Measurements"

    header_row = _write_meta_header(ws, hierarchy_path, data_window)

    # Build annotation lookup: sample_id -> annotation text
    annotation_by_sample: dict[int, str] = {}
    for ann in annotations:
        if ann.sample_id is not None:
            existing = annotation_by_sample.get(ann.sample_id, "")
            annotation_by_sample[ann.sample_id] = f"{existing}; {ann.text}" if existing else ann.text

    # Column layout: Timestamp | Operator | Batch | Meas1..MeasN | Mean | Range | Min | Max | StdDev | Violations | Annotations | Excluded
    fixed_before = ["Timestamp", "Operator", "Batch"]
    meas_cols = [f"Meas {i+1}" for i in range(n)]
    formula_cols = ["Mean", "Range", "Min", "Max"]
    if n > 1:
        formula_cols.append("Std Dev")
    trailing_cols = ["Violations", "Annotations", "Excluded"]
    all_cols = fixed_before + meas_cols + formula_cols + trailing_cols

    # Write headers
    for col_idx, name in enumerate(all_cols, start=1):
        ws.cell(row=header_row, column=col_idx, value=name)
    _style_header_row(ws, header_row, len(all_cols))

    # Freeze header
    ws.freeze_panes = ws.cell(row=header_row + 1, column=1)

    # Column indices (1-based)
    meas_start_col = len(fixed_before) + 1  # Column D
    meas_end_col = meas_start_col + n - 1
    mean_col = meas_end_col + 1
    range_col = mean_col + 1
    min_col = range_col + 1
    max_col = min_col + 1
    stddev_col = max_col + 1 if n > 1 else None
    violations_col = (stddev_col + 1) if stddev_col else (max_col + 1)
    annotations_col = violations_col + 1
    excluded_col = annotations_col + 1

    # Data rows
    for row_offset, sample in enumerate(samples):
        row = header_row + 1 + row_offset

        # Fixed columns
        ws.cell(row=row, column=1, value=sample.timestamp)
        ws.cell(row=row, column=1).number_format = "YYYY-MM-DD HH:MM:SS"
        ws.cell(row=row, column=2, value=sample.operator_id or "")
        ws.cell(row=row, column=3, value=sample.batch_number or "")

        # Measurement values
        measurements = sorted(sample.measurements, key=lambda m: m.id)
        for i in range(n):
            col = meas_start_col + i
            if i < len(measurements):
                cell = ws.cell(row=row, column=col, value=measurements[i].value)
                cell.number_format = num_fmt

        # Formula columns — reference measurement cells in same row
        meas_start_letter = get_column_letter(meas_start_col)
        meas_end_letter = get_column_letter(meas_end_col)
        cell_range = f"{meas_start_letter}{row}:{meas_end_letter}{row}"

        mean_cell = ws.cell(row=row, column=mean_col, value=f"=AVERAGE({cell_range})")
        mean_cell.number_format = num_fmt

        range_cell = ws.cell(row=row, column=range_col, value=f"=MAX({cell_range})-MIN({cell_range})")
        range_cell.number_format = num_fmt

        min_cell = ws.cell(row=row, column=min_col, value=f"=MIN({cell_range})")
        min_cell.number_format = num_fmt

        max_cell = ws.cell(row=row, column=max_col, value=f"=MAX({cell_range})")
        max_cell.number_format = num_fmt

        if stddev_col:
            sd_cell = ws.cell(row=row, column=stddev_col, value=f"=STDEV.S({cell_range})")
            sd_cell.number_format = num_fmt

        # Violations text
        sample_violations = violations_by_sample.get(sample.id, [])
        if sample_violations:
            viol_text = ", ".join(
                f"Rule {v.rule_id}" for v in sample_violations
            )
            ws.cell(row=row, column=violations_col, value=viol_text)
            # Red fill for violation rows
            for c in range(1, len(all_cols) + 1):
                ws.cell(row=row, column=c).fill = _VIOLATION_FILL

        # Annotations
        ann_text = annotation_by_sample.get(sample.id, "")
        ws.cell(row=row, column=annotations_col, value=ann_text)

        # Excluded flag
        ws.cell(row=row, column=excluded_col, value=sample.is_excluded)

    _auto_width(ws)


def _build_summary_sheet(
    wb: Workbook,
    char: Characteristic,
    hierarchy_path: str,
    data_window: str,
    n: int,
    num_fmt: str,
) -> None:
    ws = wb.create_sheet("Summary Statistics")
    header_row = _write_meta_header(ws, hierarchy_path, data_window)

    # Reference columns on Measurements sheet
    # Mean column is fixed_before(3) + meas_cols(n) + 1
    mean_col_letter = get_column_letter(3 + n + 1)
    range_col_letter = get_column_letter(3 + n + 2)
    data_start = header_row + 1 + 1  # +1 for Measurements header row offset (they share same header_row=5)
    # Use open-ended ranges for flexibility
    mean_range = f"Measurements!{mean_col_letter}:{mean_col_letter}"
    range_range = f"Measurements!{range_col_letter}:{range_col_letter}"

    # Write metric rows
    metrics: list[tuple[str, str | float | None]] = [
        ("Sample Count", f'=COUNTA(Measurements!A:A)-5'),  # subtract meta rows + header
        ("X-bar (Grand Mean)", f"=AVERAGE({mean_range})"),
        ("R-bar (Average Range)", f"=AVERAGE({range_range})"),
        ("Overall Std Dev", f"=STDEV.S({mean_range})"),
    ]

    # Spec limits (static values)
    metrics.append(("", ""))  # spacer
    metrics.append(("--- Specification Limits ---", ""))
    metrics.append(("USL", char.usl))
    metrics.append(("LSL", char.lsl))
    metrics.append(("Target", char.target_value))

    # Capability formulas — only if both spec limits exist
    if char.usl is not None and char.lsl is not None:
        metrics.append(("", ""))
        metrics.append(("--- Process Capability ---", ""))
        # We'll use named cell references within this sheet
        # Xbar is row header_row+2 col B, Sigma is row header_row+4 col B
        xbar_cell = f"B{header_row + 2}"
        rbar_cell = f"B{header_row + 3}"
        sigma_cell = f"B{header_row + 4}"
        usl_cell = f"B{header_row + 7}"
        lsl_cell = f"B{header_row + 8}"

        metrics.append(("Cp", f"=({usl_cell}-{lsl_cell})/(6*{sigma_cell})"))
        metrics.append(("Cpu", f"=({usl_cell}-{xbar_cell})/(3*{sigma_cell})"))
        metrics.append(("Cpl", f"=({xbar_cell}-{lsl_cell})/(3*{sigma_cell})"))
        metrics.append(("Cpk", f"=MIN(B{header_row + 12},B{header_row + 13})"))

        # Pp/Ppk use overall std dev
        overall_sd_cell = f"B{header_row + 4}"
        metrics.append(("Pp", f"=({usl_cell}-{lsl_cell})/(6*{overall_sd_cell})"))
        metrics.append(("Ppu", f"=({usl_cell}-{xbar_cell})/(3*{overall_sd_cell})"))
        metrics.append(("Ppl", f"=({xbar_cell}-{lsl_cell})/(3*{overall_sd_cell})"))
        metrics.append(("Ppk", f"=MIN(B{header_row + 16},B{header_row + 17})"))

    # Headers
    ws.cell(row=header_row, column=1, value="Metric")
    ws.cell(row=header_row, column=2, value="Value")
    _style_header_row(ws, header_row, 2)

    for i, (label, value) in enumerate(metrics):
        row = header_row + 1 + i
        label_cell = ws.cell(row=row, column=1, value=label)
        label_cell.font = _METRIC_LABEL_FONT
        val_cell = ws.cell(row=row, column=2, value=value)
        if isinstance(value, str) and value.startswith("="):
            val_cell.number_format = num_fmt
        elif isinstance(value, (int, float)) and value is not None:
            val_cell.number_format = num_fmt

    ws.column_dimensions["A"].width = 25
    ws.column_dimensions["B"].width = 20


def _build_limits_sheet(
    wb: Workbook,
    char: Characteristic,
    hierarchy_path: str,
    data_window: str,
    num_fmt: str,
) -> None:
    ws = wb.create_sheet("Control Limits")
    header_row = _write_meta_header(ws, hierarchy_path, data_window)

    ws.cell(row=header_row, column=1, value="Parameter")
    ws.cell(row=header_row, column=2, value="Value")
    _style_header_row(ws, header_row, 2)

    params: list[tuple[str, object]] = [
        ("UCL (Upper Control Limit)", char.ucl),
        ("Center Line", char.stored_center_line),
        ("LCL (Lower Control Limit)", char.lcl),
        ("", ""),
        ("USL (Upper Spec Limit)", char.usl),
        ("LSL (Lower Spec Limit)", char.lsl),
        ("Target", char.target_value),
        ("", ""),
        ("Stored Sigma", char.stored_sigma),
        ("Subgroup Size", char.subgroup_size),
        ("Decimal Precision", char.decimal_precision),
        ("Data Type", char.data_type),
        ("Chart Type", char.chart_type or "X-bar/R"),
        ("Short-Run Mode", char.short_run_mode or "None"),
    ]

    for i, (label, value) in enumerate(params):
        row = header_row + 1 + i
        ws.cell(row=row, column=1, value=label).font = _METRIC_LABEL_FONT
        val_cell = ws.cell(row=row, column=2, value=value)
        if isinstance(value, float):
            val_cell.number_format = num_fmt

    ws.column_dimensions["A"].width = 30
    ws.column_dimensions["B"].width = 20


def _build_violations_sheet(
    wb: Workbook,
    samples: list[Sample],
    violations_by_sample: dict[int, list[Violation]],
    hierarchy_path: str,
    data_window: str,
) -> None:
    ws = wb.create_sheet("Violations")
    header_row = _write_meta_header(ws, hierarchy_path, data_window)

    cols = ["Sample #", "Timestamp", "Rule", "Severity", "Acknowledged", "Ack By", "Ack Reason"]
    for col_idx, name in enumerate(cols, start=1):
        ws.cell(row=header_row, column=col_idx, value=name)
    _style_header_row(ws, header_row, len(cols))

    ws.freeze_panes = ws.cell(row=header_row + 1, column=1)

    # Build sample index lookup (1-based row in Measurements sheet)
    sample_index = {s.id: i + 1 for i, s in enumerate(samples)}

    row = header_row + 1
    for sample in samples:
        for v in violations_by_sample.get(sample.id, []):
            rule_desc = _RULE_NAMES.get(v.rule_id, f"Rule {v.rule_id}")
            ws.cell(row=row, column=1, value=sample_index.get(sample.id, ""))
            ws.cell(row=row, column=2, value=v.created_at)
            ws.cell(row=row, column=2).number_format = "YYYY-MM-DD HH:MM:SS"
            ws.cell(row=row, column=3, value=f"Rule {v.rule_id}: {rule_desc}")
            ws.cell(row=row, column=4, value=v.severity)
            ws.cell(row=row, column=5, value="Yes" if v.acknowledged else "No")
            ws.cell(row=row, column=6, value=v.ack_user or "")
            ws.cell(row=row, column=7, value=v.ack_reason or "")
            row += 1

    _auto_width(ws)


def _build_annotations_sheet(
    wb: Workbook,
    annotations: list[Annotation],
    samples: list[Sample],
    hierarchy_path: str,
    data_window: str,
) -> None:
    ws = wb.create_sheet("Annotations")
    header_row = _write_meta_header(ws, hierarchy_path, data_window)

    cols = ["Type", "Sample #", "Text", "Author", "Created"]
    for col_idx, name in enumerate(cols, start=1):
        ws.cell(row=header_row, column=col_idx, value=name)
    _style_header_row(ws, header_row, len(cols))

    ws.freeze_panes = ws.cell(row=header_row + 1, column=1)

    sample_index = {s.id: i + 1 for i, s in enumerate(samples)}

    for i, ann in enumerate(annotations):
        row = header_row + 1 + i
        ws.cell(row=row, column=1, value=ann.annotation_type)
        sample_num = sample_index.get(ann.sample_id, "") if ann.sample_id else ""
        ws.cell(row=row, column=2, value=sample_num)
        ws.cell(row=row, column=3, value=ann.text)
        ws.cell(row=row, column=4, value=ann.created_by or "")
        ws.cell(row=row, column=5, value=ann.created_at)
        ws.cell(row=row, column=5).number_format = "YYYY-MM-DD HH:MM:SS"

    _auto_width(ws)
```

**Step 2: Verify the module imports correctly**

Run: `cd backend && python -c "from cassini.core.excel_export import build_export_workbook; print('OK')"`
Expected: `OK`

**Step 3: Commit**

```bash
git add backend/src/cassini/core/excel_export.py
git commit -m "feat(export): add Excel export service with openpyxl

Builds 5-sheet workbook: Measurements (with formulas), Summary Statistics,
Control Limits, Violations, Annotations. All stats use live Excel formulas."
```

---

### Task 2: Backend — Export API endpoint

**Files:**
- Modify: `backend/src/cassini/api/v1/characteristics.py` (add endpoint at bottom)

**Step 1: Add the export endpoint**

Add this at the bottom of the characteristics router, BEFORE any `/{char_id}` catch-all routes (but after all other specific routes — the route ordering here is safe since `/export/excel` is more specific than `/{char_id}`):

```python
@router.get("/{char_id}/export/excel")
async def export_excel(
    char_id: int,
    limit: int = Query(100, ge=1, le=1000, description="Number of recent samples"),
    start_date: datetime | None = Query(None, description="Start date filter"),
    end_date: datetime | None = Query(None, description="End date filter"),
    repo: CharacteristicRepository = Depends(get_characteristic_repo),
    sample_repo: SampleRepository = Depends(get_sample_repo),
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
    request: Request = None,
) -> StreamingResponse:
    """Export characteristic data as a formatted Excel workbook."""
    from cassini.core.excel_export import build_export_workbook
    from cassini.db.models.annotation import Annotation
    from cassini.db.repositories import ViolationRepository
    from cassini.db.repositories.hierarchy import HierarchyRepository

    # Load characteristic
    characteristic = await repo.get_by_id(char_id)
    if characteristic is None:
        raise HTTPException(status_code=404, detail=f"Characteristic {char_id} not found")

    # Fetch samples (same pattern as chart-data endpoint)
    if start_date or end_date:
        samples = await sample_repo.get_by_characteristic(
            char_id=char_id, start_date=start_date, end_date=end_date,
        )
        if len(samples) > limit:
            samples = samples[-limit:]
    else:
        samples = await sample_repo.get_rolling_window(
            char_id=char_id, window_size=limit, exclude_excluded=False,
        )

    # Batch-load violations
    violation_repo = ViolationRepository(session)
    sample_ids = [s.id for s in samples]
    violations_by_sample = await violation_repo.get_by_sample_ids(sample_ids)

    # Load annotations
    stmt = (
        select(Annotation)
        .where(Annotation.characteristic_id == char_id)
        .order_by(Annotation.created_at)
    )
    result = await session.execute(stmt)
    annotations = list(result.scalars().all())

    # Build hierarchy path
    hierarchy_repo = HierarchyRepository(session)
    hierarchy_path = ""
    if characteristic.hierarchy_id:
        from cassini.api.v1.violations import build_hierarchy_path
        hierarchy_path = await build_hierarchy_path(hierarchy_repo, characteristic.hierarchy_id)
    hierarchy_path = f"{hierarchy_path} > {characteristic.name}" if hierarchy_path else characteristic.name

    # Describe the data window
    if start_date and end_date:
        data_window = f"{start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}"
    elif start_date:
        data_window = f"From {start_date.strftime('%Y-%m-%d')}"
    elif end_date:
        data_window = f"Until {end_date.strftime('%Y-%m-%d')}"
    else:
        data_window = f"Last {limit} samples"

    # Build workbook
    buf = build_export_workbook(
        characteristic=characteristic,
        samples=samples,
        violations_by_sample=violations_by_sample,
        annotations=annotations,
        hierarchy_path=hierarchy_path,
        data_window_description=data_window,
    )

    # Audit log (explicit — GET not caught by middleware)
    from cassini.core.audit import AuditService
    audit = AuditService(session)
    await audit.log(
        action="export",
        resource_type="characteristic",
        resource_id=char_id,
        detail={"format": "excel", "samples": len(samples)},
        user_id=user.id,
        username=user.username,
        ip_address=request.client.host if request and request.client else None,
    )
    await session.commit()

    # Safe filename
    safe_name = "".join(c if c.isalnum() or c in "-_ " else "_" for c in characteristic.name)
    filename = f"{safe_name}_{datetime.now().strftime('%Y%m%d')}.xlsx"

    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
```

**Step 2: Add missing imports at top of file**

Add these imports to the top of `characteristics.py` if not already present:

```python
from starlette.responses import StreamingResponse
from sqlalchemy import select
```

(`select` is likely already imported; `StreamingResponse` may not be.)

**Step 3: Verify endpoint loads**

Run: `cd backend && python -c "from cassini.api.v1.characteristics import router; print(len(router.routes), 'routes')"`
Expected: Route count increases by 1.

**Step 4: Commit**

```bash
git add backend/src/cassini/api/v1/characteristics.py
git commit -m "feat(export): add GET /{char_id}/export/excel endpoint

Streams .xlsx workbook with samples, violations, annotations.
Explicit audit logging for GET export action."
```

---

### Task 3: Frontend — Export API function + download helper

**Files:**
- Create: `frontend/src/api/export.api.ts`

**Step 1: Create the export API module**

```typescript
import { getAccessToken } from '@/api/client'

export const exportApi = {
  /**
   * Download an Excel export for a characteristic's chart data.
   * Uses raw fetch (not fetchApi) to handle blob responses.
   */
  downloadExcel: async (
    characteristicId: number,
    options?: { limit?: number; startDate?: string; endDate?: string },
  ) => {
    const params = new URLSearchParams()
    if (options?.limit) params.set('limit', String(options.limit))
    if (options?.startDate) params.set('start_date', options.startDate)
    if (options?.endDate) params.set('end_date', options.endDate)

    const query = params.toString()
    const url = `/api/v1/characteristics/${characteristicId}/export/excel${query ? `?${query}` : ''}`

    const token = getAccessToken()
    const response = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    })

    if (!response.ok) {
      throw new Error(`Export failed: ${response.status}`)
    }

    // Extract filename from Content-Disposition header or use default
    const disposition = response.headers.get('Content-Disposition')
    let filename = 'export.xlsx'
    if (disposition) {
      const match = disposition.match(/filename="?([^"]+)"?/)
      if (match) filename = match[1]
    }

    const blob = await response.blob()
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = filename
    a.click()
    URL.revokeObjectURL(blobUrl)
  },
}
```

**Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: Zero errors.

**Step 3: Commit**

```bash
git add frontend/src/api/export.api.ts
git commit -m "feat(export): add frontend exportApi with blob download"
```

---

### Task 4: Frontend — Add Export button to ChartToolbar

**Files:**
- Modify: `frontend/src/components/ChartToolbar.tsx`

**Step 1: Add Export button to toolbar**

Add `Download` to the lucide-react import:

```typescript
import {
  Columns2,
  Eye,
  EyeOff,
  ArrowLeftRight,
  CalendarClock,
  SlidersHorizontal,
  Sparkles,
  Download,
} from 'lucide-react'
```

Add new props to `ChartToolbarProps`:

```typescript
interface ChartToolbarProps {
  characteristicId?: number | null
  subgroupSize?: number
  isAttributeData?: boolean
  overrideChartType?: ChartTypeId | null
  onAttributeChartTypeChange?: (chartType: string) => void
  onComparisonToggle?: () => void
  onChangeSecondary?: () => void
  onExportExcel?: () => void
}
```

Destructure `onExportExcel` in the component function params.

Add the Export button in the right group, before the Compare separator:

```tsx
{onExportExcel && (
  <>
    <div className="bg-border/40 mx-0.5 h-4 w-px" />
    <ToolbarBtn onClick={onExportExcel} title="Export data to Excel">
      <Download className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">Export</span>
    </ToolbarBtn>
  </>
)}
```

Insert this just before the `<div className="bg-border/40 mx-0.5 h-4 w-px" />` that precedes the Compare button (line 169 area).

**Step 2: Wire up in OperatorDashboard**

Find where `<ChartToolbar>` is used in `OperatorDashboard.tsx` and add the `onExportExcel` callback:

```typescript
import { exportApi } from '@/api/export.api'
import toast from 'react-hot-toast'
```

Add a handler function inside the dashboard component:

```typescript
const handleExportExcel = async () => {
  if (!selectedCharacteristic) return
  try {
    await exportApi.downloadExcel(selectedCharacteristic.id, {
      limit: chartOptions?.limit,
      startDate: chartOptions?.startDate,
      endDate: chartOptions?.endDate,
    })
    toast.success('Excel export downloaded')
  } catch {
    toast.error('Failed to export Excel file')
  }
}
```

Pass it to ChartToolbar:

```tsx
<ChartToolbar
  characteristicId={selectedCharacteristic?.id}
  // ... existing props
  onExportExcel={selectedCharacteristic ? handleExportExcel : undefined}
/>
```

**Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: Zero errors.

**Step 4: Commit**

```bash
git add frontend/src/components/ChartToolbar.tsx frontend/src/pages/OperatorDashboard.tsx
git commit -m "feat(export): add Export button to chart toolbar

Wires download through exportApi.downloadExcel with current
chart options (limit/date range) passed as query params."
```

---

### Task 5: Backend — Audit trail labels

**Files:**
- Modify: `frontend/src/components/AuditLogViewer.tsx` (add labels if not present)

**Step 1: Verify audit action/resource labels**

Check that `AuditLogViewer.tsx` has `"export": "Export"` in `ACTION_LABELS` and `"characteristic": "Characteristic"` in `RESOURCE_LABELS`. The research showed both already exist — verify and add only if missing.

**Step 2: Commit (if changes needed)**

```bash
git add frontend/src/components/AuditLogViewer.tsx
git commit -m "chore(audit): ensure export action labels exist"
```

---

### Task 6: Integration test — manual verification

**Step 1: Start backend**

Run: `cd backend && uvicorn cassini.main:app --reload`

**Step 2: Start frontend**

Run: `cd frontend && npm run dev`

**Step 3: Verify the flow**

1. Log in, navigate to a characteristic with data on the dashboard
2. Click the Export button in the chart toolbar
3. Verify `.xlsx` file downloads
4. Open in Excel and verify:
   - Measurements sheet has formulas in Mean/Range/Min/Max/StdDev columns
   - Summary Statistics formulas reference Measurements sheet
   - Violation rows have red fill
   - Frozen panes work
   - All 5 sheets present
5. Check audit log — verify "export" action logged for the characteristic

**Step 4: Final type-check**

Run: `cd frontend && npx tsc --noEmit`
Run: `cd backend && python -c "import ast; [ast.parse(open(f).read()) for f in __import__('glob').glob('src/cassini/**/*.py', recursive=True)]; print('OK')"`
Expected: Both pass cleanly.

**Step 5: Final commit (if any adjustments)**

```bash
git commit -m "fix(export): integration adjustments from manual testing"
```
