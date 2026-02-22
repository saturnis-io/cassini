# OpenSPC Verification Checklists

This folder contains manual verification checklists for the gap-closure sprints (5-9).
Each sprint folder has a README with feature-level verification steps using pre-seeded
test data.

## Sprint Index

| Sprint | Theme                          | Status   | Folder        |
|--------|--------------------------------|----------|---------------|
| 5      | Statistical Credibility        | Complete | `sprint5/`    |
| 6      | Automotive/Aerospace Compliance| Planned  | `sprint6/`    |
| 7      | Shop Floor Connectivity        | Planned  | `sprint7/`    |
| 8      | Enterprise Integration         | Planned  | `sprint8/`    |
| 9      | Advanced Analytics             | Planned  | `sprint9/`    |

## How to Run

### Option A: DevTools Seed Page (Recommended)

1. Set `OPENSPC_SANDBOX=true` in your environment or `.env` file
2. Start the application (`npm run dev` + `uvicorn`)
3. Navigate to the DevTools page in the UI
4. Click the seed button for the sprint you want to verify
5. Follow the checklist in the corresponding `sprintN/README.md`

### Option B: Standalone Seed Script

```bash
cd backend
python scripts/seed_test_sprintN.py
```

Replace `N` with the sprint number (e.g., `seed_test_sprint5.py`).

## Prerequisites

- **Sandbox mode**: `OPENSPC_SANDBOX=true` environment variable must be set
- **Admin account**: Default credentials `admin` / `password`
- **Database**: SQLite (default) or any configured dialect with migrations applied
- **All migrations applied**: `alembic upgrade head`

## Checklist Convention

Each README uses checkbox format for manual verification:

```
- [ ] Unchecked — not yet verified
- [x] Checked  — verified working
```

Work through each item, checking off as you go. If a check fails, note the
failure inline and file an issue.

## Full Scope Reference

See [`.planning/gap-closure/ROADMAP.md`](../.planning/gap-closure/ROADMAP.md) for the
complete feature list, priorities, and sprint assignments across all 15 gap-closure
features.
