# Cassini — Active Tasks

> Last updated: 2026-03-02

---

## Manual QA — Product Limits (commit `7d77a20`)

Per-product-code control limits with full-stack implementation. Needs manual verification.

**Pre-requisites:**
```bash
cd backend && alembic upgrade head   # Apply migrations 047 + 048
cd frontend && npm run dev
cd backend && uvicorn cassini.main:app --reload
```

**Checklist:**
- [ ] Create a plant + characteristic with control limits
- [ ] Submit samples with and without `product_code`
- [ ] Create product-specific limits (Configuration > Product Limits tab) — verify inherited badges, CRUD
- [ ] Chart filtering: product dropdown filters samples + swaps control limits
- [ ] Manual entry: product code autocomplete, sample appears in chart
- [ ] Recalculate limits for a product — stored in `product_limit`, not characteristic
- [ ] MQTT/OPC-UA: `product_json_path` extracts product_code from payload (if data source configured)
- [ ] Backward compat: existing characteristics without product codes still work

**E2E:** `cd frontend && npx playwright test e2e/product-limits.spec.ts --reporter=list` (expect 16 passed, 1 skipped)

---

## Manual QA — TLS Certificate Support (commit `9133613`)

TLS fields on MQTT brokers and OPC-UA servers. Needs manual testing with actual TLS endpoints.

**Checklist:**
- [ ] `alembic upgrade head` applies cleanly
- [ ] MQTT broker: paste CA cert PEM, optionally client cert+key, toggle TLS Insecure — verify TLS handshake in logs
- [ ] OPC-UA server: add TLS cert PEM fields, verify connection
- [ ] Backward compat: existing brokers/servers without TLS still work

**E2E:** `cd frontend && npx playwright test e2e/connectivity.spec.ts --reporter=list`

---

## E2E Test Failures — Pre-Existing (low priority)

22 failures that predate recent features. Fix when time permits.

- [ ] `connectivity.spec.ts > browse tab renders` — UI timing
- [ ] `cusum-ewma.spec.ts > CUSUM chart-data API` — response structure mismatch
- [ ] `settings.spec.ts` (4 tests) — tab rendering
- [ ] `settings-extended.spec.ts` (5 tests) — API keys, retention, database
- [ ] `plants.spec.ts` (3 tests) — Plant CRUD
- [ ] `hierarchy.spec.ts > create department node`
- [ ] `mobile-responsive.spec.ts > mobile sidebar`
- [ ] `notifications.spec.ts > SMTP section renders`
- [ ] `rbac.spec.ts > engineer sees API Keys`
- [ ] `scheduled-reports.spec.ts > reports settings page`
- [ ] `sso-settings.spec.ts > SSO settings page renders`

---

## Gap Closure — Final Housekeeping

All 5 sprints (5-9) + skeptic audit complete. Remaining wrap-up:

- [ ] Commit all uncommitted Sprint 8/9 changes + tag release
- [ ] Regenerate knowledge graph (`/knowledge-graph`) — stale after Sprint 8/9
- [ ] Review remaining WARNING items from skeptic review (`.planning/gap-closure/SKEPTIC-REVIEW-REPORT.md`)
