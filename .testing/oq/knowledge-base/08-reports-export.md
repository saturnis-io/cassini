# Feature: Reports & Export

## Category: RPT
## Config Reference: `{ prefix: "RPT", name: "Reports & Export", kb: "08-reports-export.md" }`

---

## What It Does

The reporting and export system generates structured output from SPC data for management review, customer audits, and regulatory submissions. It is how Cassini turns live process data into documented evidence of process control.

From a compliance perspective, this system is critical for:

- **21 CFR Part 11** (FDA) -- Documented evidence of process control must be available for inspection. Reports must accurately reflect the data in the system and be traceable to the original electronic records.
- **ISO 13485** (Medical Devices) -- Management review requires periodic SPC reports showing process stability, capability trends, and out-of-control incidents. Reports are quality records.
- **IATF 16949** (Automotive) -- Customers require Ppk/Cpk reports with control chart evidence. Supplier quality submissions must include capability data with supporting charts.
- **AS9100 / AS9102** (Aerospace) -- First Article Inspection reports include SPC data. Process capability evidence is required for production approval.

The system supports four report templates and three export formats, all driven by the same underlying data queries used in the live dashboard, ensuring what the report says matches what the operator saw.

---

## Where To Find It

| Page / Feature              | URL                        | Min Role    | Description                                       |
|-----------------------------|----------------------------|-------------|---------------------------------------------------|
| Reports page                | `/reports`                 | Supervisor  | Template selection, characteristic picker, preview |
| Export dropdown             | Various (charts, reports)  | Any role    | PDF, Excel, CSV export from any chart or table     |
| Audit log export            | `/settings/audit-log`      | Admin       | CSV export of audit trail records                  |
| Scheduled reports config    | `/settings/reports`        | Engineer    | Scheduled report delivery configuration            |

---

## Key Concepts (Six Sigma Context)

### Report Types (Templates)

Cassini provides four built-in report templates, each addressing a different management review need:

1. **Characteristic Summary** (`characteristic-summary`) -- The workhorse SPC report. Includes control chart, descriptive statistics, recent violations, annotations, and sample listing for a single characteristic. This is what a quality engineer presents in a daily or weekly process review meeting. Sections: header, controlChart, statistics, violations, annotations, samples.

2. **Capability Analysis** (`capability-analysis`) -- Process capability metrics (Cp, Cpk, Pp, Ppk) with distribution analysis (histogram). This is the report customers demand when qualifying a supplier or approving a process change. Demonstrates whether the process is capable of meeting specification limits. Sections: header, histogram, capabilityMetrics, interpretation, annotations.

3. **Violation Summary** (`violation-summary`) -- All violations across selected characteristics with summary statistics and trend chart. Used for Pareto analysis of out-of-control events, root cause prioritization, and demonstrating corrective action effectiveness over time. Sections: header, violationStats, violationTable, trendChart.

4. **Trend Analysis** (`trend-analysis`) -- Time-series analysis with trend detection. Used for identifying slow drifts, seasonal patterns, or tool wear before they become out-of-control conditions. Sections: header, trendChart, statistics, interpretation, annotations.

### Export Formats

- **PDF** -- Captures the report preview as a rendered document. Uses the html2canvas library to capture the DOM element, then generates a PDF via jsPDF. Landscape orientation for chart readability.
- **Excel** -- Structured data export with chart data points, violations, and statistics in tabular format.
- **CSV** -- Plain text tabular data for import into external analysis tools (Minitab, JMP, Excel).

### Chart Image Rendering for Reports

Control charts in reports use a dual-rendering approach. ECharts renders the live canvas, then the `useStaticChart` hook captures a PNG data URL from the canvas at 2x pixel ratio. The report preview displays the static image (not the live canvas) because canvas-based charts do not reliably render in PDF capture or print contexts. This ensures the chart in the exported PDF matches exactly what the user previewed.

### Time Range Filtering

Reports share the same time range state as the dashboard (via `dashboardStore`). Three modes:

1. **Points** -- Last N data points (default 50). Useful for recent process performance.
2. **Duration** -- Hours back from now. Useful for shift-based or daily reports.
3. **Custom** -- Explicit start and end dates. Required for customer-requested date range reports (e.g., "Show me all data from January 2026").

The time range is converted to `chartOptions` (`limit`, `startDate`, `endDate`) and passed to the `useChartData` and `useViolations` hooks. The same chart options are passed to the `ReportPreview` component, ensuring the report reflects exactly the data window selected.

### Audit Log Export

Separate from the report system, the audit log export is a CSV download of all audit trail records. Available only to admin users at `/settings/audit-log`. The export endpoint (`GET /audit/logs/export`) streams a CSV response with columns: id, timestamp, username, action, resource_type, resource_id, detail, ip_address, user_agent.

---

## How To Configure (Step-by-Step)

### Generating a Report

1. Log in as supervisor or higher
2. Navigate to `/reports` via the sidebar
3. Select a report template from the dropdown (e.g., "Characteristic Summary")
4. Select a characteristic using the CharacteristicContextBar (hierarchy picker in the bar below the controls)
5. Optionally adjust the time range using the TimeRangeSelector
6. The report preview renders automatically below the controls bar
7. Click the Export dropdown (top-right) to export as PDF, Excel, or CSV

### Exporting Chart Data

1. From any page with a control chart (dashboard, reports)
2. Click the Export dropdown button
3. Choose format: PDF (captures visible chart), Excel (data table), or CSV (raw data)
4. File downloads with a timestamped filename (e.g., `characteristic-summary-report-2026-02-26.pdf`)

### Audit Log CSV Export

1. Log in as admin
2. Navigate to `/settings/audit-log`
3. Apply any desired filters (user, action, date range)
4. Click "Export CSV" button
5. CSV file downloads with all matching audit records

---

## How To Use (Typical Workflow)

### Weekly Process Review Report

1. Navigate to `/reports`
2. Select "Characteristic Summary" template
3. Select the characteristic under review from the context bar
4. Set time range to "Duration: Last 168 hours" (7 days) or "Custom" with the week's date range
5. Review the preview: check the control chart for stability, review statistics, note any violations
6. Export as PDF for the quality meeting file
7. Repeat for each characteristic on the review agenda

### Customer Capability Submission

1. Navigate to `/reports`
2. Select "Capability Analysis" template
3. Select the characteristic the customer requested
4. Set time range to match the customer's requested sample window
5. Verify Cpk/Ppk values meet the customer's requirements (typically Cpk >= 1.33 for automotive, >= 1.67 for safety-critical)
6. Export as PDF for customer submission
7. Note: The histogram shows the distribution shape, which is important for non-normal processes

### Violation Root Cause Prioritization

1. Navigate to `/reports`
2. Select "Violation Summary" template
3. Select the characteristic or process area
4. Set time range to the analysis period
5. Review violation statistics (count by rule, trend over time)
6. Use the violation table to identify recurring patterns
7. Export as CSV for further Pareto analysis in external tools

---

## Acceptance Criteria (OQ-Style)

| # | Criterion | Pass Condition |
|---|---|---|
| 1 | Reports page accessible to supervisor+ | Page loads with template dropdown, time range, and export controls |
| 2 | Reports page blocked for operator | Redirected to /dashboard with insufficient permissions toast |
| 3 | Template selection renders preview | Selecting a template + characteristic renders the report content |
| 4 | Characteristic Summary includes chart | Preview shows control chart image, statistics table, and violations list |
| 5 | Capability Analysis includes metrics | Preview shows histogram, Cp/Cpk/Pp/Ppk values, and interpretation |
| 6 | Violation Summary includes table | Preview shows violation count, breakdown by rule, and detail table |
| 7 | PDF export downloads file | Clicking Export > PDF downloads a .pdf file with rendered content |
| 8 | Excel export downloads file | Clicking Export > Excel downloads a .xlsx file with data tables |
| 9 | CSV export downloads file | Clicking Export > CSV downloads a .csv file with raw data |
| 10 | Time range filter works | Changing the time range updates the report preview data |
| 11 | Audit log CSV export works | Admin can export filtered audit records as CSV |
| 12 | Report data matches dashboard | Statistics and chart in report match the same characteristic on the dashboard with the same time range |

---

## Edge Cases & Constraints

- **No characteristic selected** -- The report area shows a "No characteristic selected" empty state. The export button is disabled. No error is thrown.
- **No template selected** -- After selecting a characteristic but before selecting a template, a placeholder message says "No template selected. Choose a report template from the dropdown above to preview."
- **Empty data range** -- If the selected time range contains no samples, the report preview shows empty sections (no chart points, no violations, statistics show N/A). This is expected and not an error.
- **Large data ranges** -- Very large time ranges (thousands of data points) may cause slower rendering. The PDF capture may take several seconds.
- **Chart image fidelity** -- The static chart image is captured at 2x pixel ratio for print quality. The white background is forced regardless of the user's dark mode setting, ensuring print readability.
- **PDF landscape orientation** -- PDF export defaults to landscape to accommodate control chart width.
- **CSV column order** -- CSV exports include timestamp, mean, range, zone, violation_rules columns for chart data. Violation CSV includes id, created_at, characteristic_name, rule_id, rule_name, severity, acknowledged.
- **Audit log export is admin-only** -- Non-admin users cannot access the audit log page or the export endpoint.

---

## API Reference (for seeding)

All paths below are relative to the API base (`/api/v1/`). The `fetchApi` client in the frontend prepends this prefix automatically.

### Data Endpoints Used by Reports

Reports do not have a dedicated report generation API. They use the same data endpoints as the dashboard:

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/characteristics/{id}/chart-data` | JWT | Chart data with time range params (limit, start_date, end_date) |
| `GET` | `/characteristics/{id}/capability` | JWT | Capability indices (Cp, Cpk, Pp, Ppk, Cpm) |
| `GET` | `/violations/` | JWT | Violations list with filters (characteristic_id, pagination) |
| `GET` | `/characteristics/{id}` | JWT | Characteristic details (name, chart type, spec limits) |
| `GET` | `/characteristics/{id}/annotations` | JWT | Annotations for the characteristic |

### Audit Log Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/audit/logs` | Admin | List audit log entries with filters |
| `GET` | `/audit/logs/export` | Admin | Stream CSV export of filtered audit log |
| `GET` | `/audit/stats` | Admin | Summary statistics (event counts by action/resource) |

### Scheduled Reports (Configuration)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/scheduled-reports/` | Engineer+ | List scheduled report configurations |
| `POST` | `/scheduled-reports/` | Engineer+ | Create a scheduled report |
| `PUT` | `/scheduled-reports/{id}` | Engineer+ | Update a scheduled report |
| `DELETE` | `/scheduled-reports/{id}` | Engineer+ | Delete a scheduled report |

### Export Format Details

**PDF Export**: Client-side capture via html2canvas + jsPDF. No server-side PDF generation.

**Excel/CSV Export**: Client-side generation using data from React Query cache. The `ExportDropdown` component calls `prepareChartDataForExport()` and `prepareViolationsForExport()` utility functions, then passes the prepared data to `exportToExcel()` or `exportToCsv()`.
