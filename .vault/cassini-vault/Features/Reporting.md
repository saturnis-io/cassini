---
type: feature
status: active
created: 2026-03-06
updated: 2026-03-06
sprint: "[[Sprints/Sprint 1 - Visual Impact]]"
tags:
  - feature
  - active
aliases:
  - Scheduled Reports
  - PDF Reports
---

# Reporting

Scheduled and on-demand PDF report generation. Reports are templated (defined in frontend `lib/report-templates.ts`, rendered server-side as PDF), scoped to plant/hierarchy/characteristic, and can be scheduled at daily/weekly/monthly intervals with configurable recipients. Includes a report run history for tracking execution status.

## Key Backend Components

- **Generator**: `core/report_generator.py` -- `generate(template_id, scope, window_days)` returns PDF bytes
- **Scheduler**: `core/report_scheduler.py` -- `check_due_schedules()`, `execute_schedule()` (background task)
- **Models**: `ReportSchedule`, `ReportRun` in `db/models/report_schedule.py`
- **Router**: `api/v1/scheduled_reports.py` -- 8 endpoints (schedule CRUD, run, generate, runs history)
- **Repository**: `db/repositories/report_schedule.py`
- **Migration**: 001

## Key Frontend Components

- `ReportPreview.tsx` -- on-demand report preview/download
- `ReportsView.tsx` -- schedule list and management page
- Page route: `/reports`
- Hooks: `useReportSchedules`, `useCreateSchedule`, `useGenerateReport`

## Connections

- Pulls data from [[SPC Engine]] (samples, violations) and [[Capability]] (Cp/Cpk values)
- Report generation respects [[Auth]] role permissions
- Scheduled reports can trigger [[Notifications]] email delivery
- Report templates defined in frontend, rendered server-side

## Known Limitations

- Report templates are frontend-defined -- adding new templates requires frontend code changes
- Scheduler runs as a background task checking for due schedules periodically
- PDF generation is synchronous per report
