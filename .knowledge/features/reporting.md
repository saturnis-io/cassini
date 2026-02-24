# Reporting

## Data Flow

```mermaid
flowchart TD
    subgraph Frontend
        C1[ReportPreview.tsx] --> H1[useCharacteristic]
        C1 --> H2[useChartData]
        C1 --> H3[useCapability]
        C2[ReportsView.tsx] --> H4[useReportSchedules]
    end
    subgraph API
        H1 --> E1[GET /api/v1/characteristics/:id]
        H2 --> E2[GET /api/v1/characteristics/:id/chart-data]
        H4 --> E3[GET /api/v1/reports/schedules/]
    end
    subgraph Backend
        E3 --> R1[ReportScheduleRepository]
        R1 --> M1[(ReportSchedule)]
        S1[ReportGenerator] --> R2[SampleRepository]
        S2[ReportScheduler] --> S1
    end
```

## Entity Relationships

```mermaid
erDiagram
    ReportSchedule }o--|| Plant : "for plant"
    ReportSchedule ||--o{ ReportRun : "has runs"
    ReportSchedule {
        int id PK
        int plant_id FK
        string name
        string report_type
        string schedule_cron
        bool is_active
        string recipients
        int characteristic_id FK
    }
    ReportRun {
        int id PK
        int schedule_id FK
        datetime started_at
        datetime completed_at
        string status
        string output_path
    }
    Plant {
        int id PK
    }
```

## Backend

### Models
| Model | File | Key Columns/Relations | Migration |
|-------|------|-----------------------|-----------|
| ReportSchedule | `db/models/report_schedule.py` | id, plant_id FK, name, report_type, schedule_cron, is_active, recipients JSON, characteristic_id FK (nullable), last_run_at; rels: runs | 022 |
| ReportRun | `db/models/report_schedule.py` | id, schedule_id FK, started_at, completed_at, status (running/completed/failed), output_path, error_message | 022 |

### Endpoints
| Method | Path | Params | Response Shape | Auth |
|--------|------|--------|----------------|------|
| GET | /api/v1/reports/schedules/ | plant_id | list[ReportScheduleResponse] | get_current_engineer |
| POST | /api/v1/reports/schedules/ | body: ReportScheduleCreate | ReportScheduleResponse | get_current_engineer |
| GET | /api/v1/reports/schedules/{id} | - | ReportScheduleResponse | get_current_engineer |
| PATCH | /api/v1/reports/schedules/{id} | body: ReportScheduleUpdate | ReportScheduleResponse | get_current_engineer |
| DELETE | /api/v1/reports/schedules/{id} | - | 204 | get_current_engineer |
| POST | /api/v1/reports/schedules/{id}/trigger | - | ReportRunResponse | get_current_engineer |
| GET | /api/v1/reports/schedules/{id}/runs | - | list[ReportRunResponse] | get_current_engineer |

### Services
| Module | File | Key Functions |
|--------|------|---------------|
| ReportGenerator | `core/report_generator.py` | generate(schedule) -> output_path (creates PDF/Excel reports) |
| ReportScheduler | `core/report_scheduler.py` | start(), stop(), check_due_reports() |

### Repositories
| Class | File | Key Methods |
|-------|------|-------------|
| ReportScheduleRepository | `db/repositories/report_schedule.py` | get_by_plant, get_by_id, create, update, delete, get_due_schedules, create_run |

## Frontend

### Components
| Component | File | Key Props | Hooks Used |
|-----------|------|-----------|------------|
| ReportPreview | `components/ReportPreview.tsx` | characteristicId, reportType | useCharacteristic, useChartData, useCapability |

### Hooks / API
| Hook/Method | Namespace | Endpoint | Cache Key |
|-------------|-----------|----------|-----------|
| useReportSchedules | reportsApi.listSchedules | GET /reports/schedules/ | ['report-schedules', 'list', plantId] |
| useCreateSchedule | reportsApi.createSchedule | POST /reports/schedules/ | invalidates list |
| useTriggerReport | reportsApi.triggerReport | POST /reports/schedules/:id/trigger | invalidates runs |
| useReportRuns | reportsApi.getRuns | GET /reports/schedules/:id/runs | ['report-schedules', 'runs', id] |

### Pages / Routes
| Route | Page | Key Components |
|-------|------|----------------|
| /reports | ReportsView | ReportPreview, report schedule management |

## Migrations
- 022: report_schedule, report_run tables

## Known Issues / Gotchas
- Report generation is synchronous (no background task queue yet)
- ReportPreview renders client-side using chart data and capability data
- Frontend uses lib/report-templates.ts for template definitions
- Frontend uses lib/export-utils.ts for PDF/Excel export utilities
