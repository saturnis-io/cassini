# Reporting

## Data Flow
```
Scheduled Reports:
  SettingsView.tsx → ReportScheduleManager → useReportSchedules(plantId)
    → GET /api/v1/reports/schedules/?plant_id=N
    → POST /api/v1/reports/schedules/ (create schedule with template, scope, frequency, recipients)
    → PUT /api/v1/reports/schedules/{id} (update)
    → DELETE /api/v1/reports/schedules/{id}
    → POST /api/v1/reports/schedules/{id}/trigger (manual trigger)
    → GET /api/v1/reports/schedules/{id}/runs (run history)

  ReportScheduler (background service):
    → checks due schedules periodically
    → generates PDF report from template + scope data
    → delivers via SMTP to recipients
    → records ReportRun (status, recipients_count, pdf_size_bytes)

Report Preview:
  ReportPreview.tsx → renders print-ready HTML/PDF preview of SPC data
    → uses characteristic chart data, capability metrics, violation history
```

## Backend

### Models
| Model | File | Key Columns/Relations | Migration |
|-------|------|-----------------------|-----------|
| ReportSchedule | db/models/report_schedule.py | id, plant_id(FK CASCADE), name, template_id, scope_type(plant/hierarchy/characteristic), scope_id, frequency(daily/weekly/monthly), hour, day_of_week, day_of_month, recipients(JSON text), window_days, is_active, last_run_at, created_by(FK SET NULL), created_at, updated_at; rels: plant, creator, runs | 022 |
| ReportRun | db/models/report_schedule.py | id, schedule_id(FK CASCADE), started_at, completed_at, status, error_message, recipients_count, pdf_size_bytes; rel: schedule (back_populates) | 022 |

### Endpoints
| Method | Path | Params | Response Shape | Auth |
|--------|------|--------|----------------|------|
| GET | /api/v1/reports/schedules/ | plant_id | list[ReportScheduleResponse] | get_current_engineer |
| POST | /api/v1/reports/schedules/ | body: ReportScheduleCreate | ReportScheduleResponse (201) | get_current_engineer |
| GET | /api/v1/reports/schedules/{schedule_id} | - | ReportScheduleResponse | get_current_engineer |
| PUT | /api/v1/reports/schedules/{schedule_id} | body: ReportScheduleUpdate | ReportScheduleResponse | get_current_engineer |
| DELETE | /api/v1/reports/schedules/{schedule_id} | - | 204 | get_current_engineer |
| POST | /api/v1/reports/schedules/{schedule_id}/trigger | - | ReportRunResponse | get_current_engineer |
| GET | /api/v1/reports/schedules/{schedule_id}/runs | limit | list[ReportRunResponse] | get_current_engineer |

### Services
| Module | File | Key Functions |
|--------|------|---------------|
| ReportScheduler | (app.state.report_scheduler) | run_schedule() — generates PDF and delivers via SMTP |

### Repositories
| Class | File | Key Methods |
|-------|------|-------------|
| ReportScheduleRepository | db/repositories/report_schedule.py | get_by_plant, get_by_id, create, update, delete, get_runs |

## Frontend

### Components
| Component | File | Key Props | Hooks Used |
|-----------|------|-----------|------------|
| ReportPreview | components/ReportPreview.tsx | characteristicId | useChartData, useCapability — print-ready SPC report preview |

### Hooks / API
| Hook/Method | Namespace | Endpoint | Cache Key |
|-------------|-----------|----------|-----------|
| useReportSchedules | reportApi.listSchedules | GET /reports/schedules/ | ['reports', 'schedules', plantId] |
| useCreateReportSchedule | reportApi.createSchedule | POST /reports/schedules/ | invalidates schedules |
| useUpdateReportSchedule | reportApi.updateSchedule | PUT /reports/schedules/{id} | invalidates schedules |
| useDeleteReportSchedule | reportApi.deleteSchedule | DELETE /reports/schedules/{id} | invalidates schedules |
| useTriggerReport | reportApi.triggerReport | POST /reports/schedules/{id}/trigger | invalidates runs |
| useReportRuns | reportApi.getRuns | GET /reports/schedules/{id}/runs | ['reports', 'runs', scheduleId] |

### Pages / Routes
| Route | Page | Key Components |
|-------|------|----------------|
| /settings | SettingsView.tsx | ReportScheduleManager (tab) |
| /reports | ReportView.tsx | ReportPreview |

## Migrations
- 022 (scheduled_reports): report_schedule, report_run tables

## Known Issues / Gotchas
- Report scheduler is a background service registered on app.state during lifespan
- Manual trigger (POST /trigger) requires engineer+ role and runs synchronously
- Recipients stored as JSON-encoded string in the database (not native JSON column for SQLite compat)
- Scope types: "plant" (all chars), "hierarchy" (subtree), "characteristic" (single char)
- Frequencies: "daily" (at specified hour), "weekly" (day_of_week + hour), "monthly" (day_of_month + hour)
- ReportRun tracks PDF generation metadata (size, recipient count, error message)
- Run history limited to 200 per request (Query limit cap)
