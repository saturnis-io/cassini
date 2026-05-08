# Cassini Feature-Highlight Catalog

> **Intent**: a visual + functional regression baseline. Every feature, walked through every meaningful UI state — empty, configured, mid-interaction, populated-result, drill-down, edge case. The screenshots are the spec; if a future change breaks the populated-result view, the diff shows it.
>
> **Not in scope**: statistical correctness (covered by unit tests). This catalog is for everything else — wizards, populated views, value-bearing interactions, panel-open states.

## Scope summary

| Priority | Count | Meaning |
|---------:|------:|---------|
| **P0** | 143 | Must — the screenshot earns its keep on the marketing site or in the README |
| **P1** | 225 | Should — meaningful UI states that distinguish the product from "any SaaS" |
| **P2** | 12 | Nice — edge cases, mobile, alternate themes |
| **Total** | **380** | Full audit |

Capturing P0 alone is a comprehensive feature-tour. P0 + P1 is the full regression baseline. P2 is reserved for edge-case coverage when we have spare capture budget.

## How to use this document

1. **Review pass**: read top-to-bottom, mark states to drop or add. Comment in the PR that delivers this file.
2. **Seed-design pass**: collect the union of all "Seed needs" lines into the playground seed spec — that determines what data the seed must produce.
3. **Implementation pass**: for each state, write a Playwright capture (interaction + waits + screenshot path).
4. **Output structure** (proposed):
   ```
   docs/feature-audit/
     CATALOG.md           ← this file (the spec)
     <group-letter>/      ← per-feature subdirectory
       <feature-id>/      ← e.g., "G2-msa-crossed-anova"
         01-empty.png
         02-wizard-step1.png
         ...
       MANIFEST.md        ← captions + alt-text indexed for the website / README to consume
   ```

## Group index

| Group | Topic | Features |
|------:|-------|----------|
| A | Authentication & onboarding | Login, change password, forgot/reset, plant switcher |
| B | Core SPC | Dashboard, all chart types, violations, capability, annotations |
| C | Show Your Work + Audit + Replay | SYW panel, audit log, time-travel replay |
| D | Data ingestion | Manual entry, collection plans, sample history, CSV/Excel import wizard |
| E | Connectivity hub | MQTT, OPC-UA, gage bridges, ERP/LIMS |
| F | Configuration | Hierarchy editor, characteristic config, materials |
| G | Quality studies | MSA (4 study types), DOE, FAI |
| H | Compliance | Electronic signatures, signature dialog, retention |
| I | Analytics | Correlation, multivariate (T²), predictions, AI insights |
| J | Reports | Templates, batch export, scope modes |
| K | Display modes | Kiosk, wall dashboard, galaxy view |
| L | Settings & admin | 13 settings sub-pages |
| M | Enterprise features | CEP rules, SOP-RAG, Lakehouse, cluster status |
| N | Multi-plant + RBAC | Tier gates, compare plants, user management |
| O | Developer / integrator | Dev tools, guides, idle timeout |

## Conventions

- Each feature has a unique ID (`A1`, `B7`, `M2`, etc.) — referenced from screenshot paths.
- Each row in a State table is a single screenshot.
- "Seed needs" is the data prerequisite. The seed spec (separate doc) is the union of all these.
- "Interaction" is the user action that gets the page into the captured state. "none" = no interaction past navigation.
- "Tier" indicates Open / Pro / Enterprise — the Playwright run already has dev-tier override → enterprise, so all states are reachable in capture.
- "Known quirks" are timing or state issues the capture script must handle (e.g., ECharts render timing, Monaco worker init).

---

## A. Authentication and Onboarding

### A1. Login Page
- **Route**: `/login`
- **Seed needs**: At minimum the auto-bootstrapped `admin` user. Three.js Saturn scene loads in background.
- **Tier**: All
- **States**:
  | # | State | Shows | Interaction | Priority |
  |---|-------|-------|-------------|----------|
  | 01 | Default | Brand logo (CassiniLogo component), Saturn Three.js background, username/password fields, "Sign in" button, "Forgot password" link | none | P0 |
  | 02 | SSO providers visible | OIDC provider buttons rendered below the local form when providers are configured | requires OIDC config in settings | P1 |
  | 03 | Submitting | Button disabled, spinner | submit valid creds | P0 |
  | 04 | Invalid credentials | Error banner below form | submit wrong password | P1 |
  | 05 | OIDC callback processing | "SSO loading" state with spinner, `?code=&state=` in URL | triggered by OIDC redirect | P2 |
- **Known quirks**: Three.js Saturn scene is `React.lazy`-wrapped with `Suspense`; there is a brief layout shift while the canvas loads. The login page has no sidebar — it renders outside `<Layout>`. Backend auto-bootstraps `admin` on first run; first login forces password change and redirects to `/change-password`.

---

### A2. Change Password Page
- **Route**: `/change-password`
- **Seed needs**: User authenticated but `must_change_password=true` flag set
- **Tier**: All
- **States**:
  | # | State | Shows | Interaction | Priority |
  |---|-------|-------|-------------|----------|
  | 01 | Default | Current password, new password, confirm new password fields; submit button | none | P0 |
  | 02 | Validation error | Mismatch or weak password message | submit with mismatched fields | P1 |
  | 03 | Success | Redirect to dashboard | submit valid | P0 |
- **File**: `/apps/cassini/frontend/src/pages/ChangePasswordPage.tsx`

---

### A3. Forgot Password / Reset Password
- **Routes**: `/forgot-password`, `/reset-password`
- **Seed needs**: None (unauthenticated)
- **Tier**: All
- **States**:
  | # | State | Shows | Interaction | Priority |
  |---|-------|-------|-------------|----------|
  | 01 | Forgot form | Email input, submit button | none | P1 |
  | 02 | Email sent confirmation | Success message | submit valid email | P1 |
  | 03 | Reset form | Token from URL, new password + confirm fields | visit link from email | P1 |
  | 04 | Reset success | Success + redirect hint | submit valid | P1 |
- **Files**: `pages/ForgotPasswordPage.tsx`, `pages/ResetPasswordPage.tsx`

---

### A4. Plant Switcher (Header)
- **Location**: Top header bar, visible on all authenticated pages
- **Seed needs**: 2+ plants configured (Pro tier minimum for multi-plant; Community is capped at 1)
- **Tier**: Pro and above for multi-plant
- **States**:
  | # | State | Shows | Interaction | Priority |
  |---|-------|-------|-------------|----------|
  | 01 | Single plant | Plant name displayed, no dropdown arrow (or greyed out) | none | P0 |
  | 02 | Multi-plant dropdown open | List of plants with current highlighted | click plant name | P1 |
  | 03 | Plant selected | Sidebar re-populates with characteristics for new plant | pick different plant | P1 |

---

## B. Core SPC

### B1. Dashboard — Empty State
- **Route**: `/dashboard`
- **Seed needs**: No characteristics, or plant with no characteristics
- **Tier**: All (operator role minimum)
- **States**:
  | # | State | Shows | Interaction | Priority |
  |---|-------|-------|-------------|----------|
  | 01 | No characteristic selected | Centered "Select a characteristic" message + "Collection Plans" button link | none | P0 |
  | 02 | No characteristics exist | Sidebar characteristics panel empty; same center message | none | P0 |
- **Known quirks**: The sidebar's "Characteristics" section is independently collapsible (toggle stored in Zustand `characteristicsPanelOpen`). The nav section above it is also independently collapsible (`navSectionCollapsed`). Both default to open but are persisted. Screenshots with the characteristics panel collapsed look very different from the default.

---

### B2. Dashboard — Single Characteristic View (Variable, Xbar-R)
- **Route**: `/dashboard/:charId`
- **Seed needs**: Characteristic with `data_type=variable`, `subgroup_size>=2`, 50+ samples with no violations for "in control" state; separate data set with Nelson violations for "violation" state
- **Tier**: All
- **States**:
  | # | State | Shows | Interaction | Priority |
  |---|-------|-------|-------------|----------|
  | 01 | Loading | Spinner in chart area | none | P1 |
  | 02 | Stats bar populated | Characteristic name, Last value pill, Sample count pill, Out-of-control pill (green=0), Cpk/Ppk pills with SYW underline | characteristic with data | P0 |
  | 03 | Xbar-R dual chart | Upper: mean chart with UCL/CL/LCL; Lower: range chart | default for subgroup_size>=2 | P0 |
  | 04 | Xbar-S dual chart | Upper: mean chart; Lower: sigma chart | subgroup_size>=5 recommended | P1 |
  | 05 | I-MR dual chart | Individual/Moving Range — for subgroup_size=1 | set subgroup_size=1 | P0 |
  | 06 | With spec limits visible | USL/LSL dashed lines on chart | toggle "Spec Limits" in toolbar | P1 |
  | 07 | With violations highlighted | Red points on control chart | data with Nelson rule violations | P0 |
  | 08 | Range slider visible | Sparkline strip below toolbar; drag handles to zoom range | "Show Brush" toggle in toolbar | P1 |
  | 09 | Comparison mode — secondary chart empty | Lower half placeholder "Select characteristic to compare" + Browse button | enable comparison in toolbar | P1 |
  | 10 | Comparison mode — secondary populated | Two stacked chart panels with "Primary"/"Secondary" labels | pick secondary characteristic | P1 |
  | 11 | Region drag-select — action modal | Modal asking "Annotate" or "Acknowledge" after drag-select on chart | drag on chart canvas | P1 |
  | 12 | Pinned view mode active | Multi-chart tile view (PinnedChartsView) instead of single | click "Pinned View" toggle | P1 |
  | 13 | Replay scrubber visible (Pro+) | ReplayScrubber timeline bar below stats | click scrubber in toolbar, Pro license | P1 |
- **Known quirks**: ECharts `<canvas>` must always be in DOM — loading states use `visibility: hidden`, not conditional unmounting. The stats bar Cpk/Ppk values are wrapped in `<Explainable>` — clicking opens the SYW panel. View mode toggle ("Single View" / "Pinned View") is at the top-left of the content area.

---

### B3. Dashboard — Attribute Charts
- **Route**: `/dashboard/:charId` with attribute characteristic
- **Seed needs**: Characteristic with `data_type=attribute`, one of `p/np/c/u` attribute chart types, samples with `sample_size` (for p/np) or defect counts
- **Tier**: All
- **States**:
  | # | State | Shows | Interaction | Priority |
  |---|-------|-------|-------------|----------|
  | 01 | p-chart (proportion defective) | Single chart, UCL/LCL/CL, proportion plotted values | attribute char with sample sizes | P0 |
  | 02 | np-chart (number defective) | Single chart, count scale | switch attribute_chart_type | P1 |
  | 03 | c-chart (defects per unit) | Single chart | `c` type characteristic | P1 |
  | 04 | u-chart (defects per unit, variable sample) | Single chart with Laney correction possible | `u` type + `use_laney_correction` | P1 |
  | 05 | Attribute chart type selector in toolbar | Dropdown to switch p/np/c/u | click toolbar dropdown | P1 |
- **Known quirks**: The Capability tab in the bottom drawer is hidden for attribute characteristics — only the Annotations and Diagnose tabs show. Changing attribute chart type in the toolbar persists to backend via `characteristicApi.update`.

---

### B4. Dashboard — CUSUM / EWMA Charts
- **Route**: `/dashboard/:charId`
- **Seed needs**: Characteristic configured with `chart_type=cusum` or `chart_type=ewma`
- **Tier**: All
- **States**:
  | # | State | Shows | Interaction | Priority |
  |---|-------|-------|-------------|----------|
  | 01 | CUSUM single chart | C+ and C- cumulative sum lines, decision interval H | cusum characteristic | P1 |
  | 02 | EWMA single chart | Smoothed EWMA line with control limits | ewma characteristic | P1 |
- **Known quirks**: CUSUM and EWMA are forced by the `effectiveOverride` logic in `OperatorDashboard`. The `isDualChart` flag is false for these types, so they use `<ChartPanel>` not `<DualChartPanel>`.

---

### B5. Dashboard — Box-Whisker Chart
- **Route**: `/dashboard/:charId`
- **Seed needs**: Characteristic with `chart_type=box-whisker` (or manually selected in toolbar), sufficient samples
- **Tier**: All
- **States**:
  | # | State | Shows | Interaction | Priority |
  |---|-------|-------|-------------|----------|
  | 01 | Box-whisker only (no histogram) | Box-whisker chart filling full width | select "box-whisker" in toolbar | P1 |
  | 02 | Box-whisker + histogram right | Side-by-side: chart 70%, histogram 280px right column; Y-axes aligned | set histogram position = right | P1 |
  | 03 | Box-whisker + histogram below | Stacked: chart then 192px histogram strip | set histogram position = below | P1 |
- **Known quirks**: Shared Y-axis domain is computed only when `!isShortRun`. Box-whisker emits `onGridBottom`/`onGridTop` callbacks to align histogram gridlines pixel-perfectly.

---

### B6. Dashboard — Bottom Drawer (Capability + Annotations + Diagnose)
- **Route**: `/dashboard/:charId`
- **Seed needs**: Variable characteristic with USL/LSL set for capability; annotations created; violations for diagnose
- **Tier**: All
- **States**:
  | # | State | Shows | Interaction | Priority |
  |---|-------|-------|-------------|----------|
  | 01 | Drawer collapsed | Tabs visible at bottom; no content pane | default state | P0 |
  | 02 | Capability tab open | Cp, Cpk, Pp, Ppk, sigma_within, distribution, verdict badge; Explainable values | click "Capability" tab | P0 |
  | 03 | Capability — no spec limits | "No spec limits" placeholder message | characteristic without USL/LSL | P1 |
  | 04 | Annotations tab — empty | "No annotations" message + "Add" button | click "Annotations" tab | P1 |
  | 05 | Annotations tab — with entries | List of point and period annotations with timestamps | annotations created | P0 |
  | 06 | Annotation add dialog — point | Modal for point annotation with sample ID, label, note | click point on chart | P1 |
  | 07 | Annotation add dialog — period | Modal with start/end time pickers, label, note | click "Add" button | P1 |
  | 08 | Diagnose tab | AI/rules-based Ishikawa + Pareto content for the current characteristic | click "Diagnose" tab | P1 |

---

### B7. Dashboard — Modals
- **States**:
  | # | State | Shows | Interaction | Priority |
  |---|-------|-------|-------------|----------|
  | 01 | Input Modal | Full-screen data entry modal (InputModal); triggered from toolbar | click "Enter Data" in toolbar | P0 |
  | 02 | Sample Inspector Modal | Selected sample's raw measurements, timestamp, violations | click point on chart | P1 |
  | 03 | Bulk Acknowledge Dialog | Multi-violation ack with reason field, scope label | click "Bulk Ack" in toolbar | P1 |
  | 04 | Region Action Modal | "Annotate Region" / "Acknowledge Region" choice after drag-select | drag on chart | P1 |
  | 05 | Comparison Selector | Hierarchy browser for picking secondary characteristic | "Compare" in toolbar | P1 |

---

### B8. Violations View
- **Route**: `/violations`
- **Seed needs**: 20+ violations in mixed states: pending-required, informational, acknowledged; multiple Nelson rules violated
- **Tier**: All (operator minimum)
- **States**:
  | # | State | Shows | Interaction | Priority |
  |---|-------|-------|-------------|----------|
  | 01 | Empty (no violations) | "No violations found" row in table | clean data set | P1 |
  | 02 | Default view (Required filter active) | Stats cards (total, pending-required, informational, critical, warning); table with violations | seed data | P0 |
  | 03 | Stats cards populated | 5 card tiles with counts; unacknowledged count is highlighted red | violations exist | P0 |
  | 04 | Filter — Informational tab | Table shows informational-only violations (dimmed rows) | click "Informational" filter | P1 |
  | 05 | Filter — Acknowledged tab | Table shows acknowledged rows with ack user/time/reason | click "Acknowledged" filter | P1 |
  | 06 | Filter — Rule dropdown | Filtered to single Nelson rule (e.g., Rule 1 only) | select rule | P1 |
  | 07 | Filter — Time range picker | Custom date range applied | select custom range | P1 |
  | 08 | Inline ack in progress | Textarea for reason appears inline in row | click "Acknowledge" button on row | P0 |
  | 09 | Ack reason required (empty submit) | Button stays disabled | type nothing, try confirm | P1 |
  | 10 | Ack success | Row updates to show "Acknowledged" + user + timestamp + reason | confirm with reason | P0 |
  | 11 | Bulk acknowledge dialog | List of violation IDs, reason field, scope label | click "Bulk Acknowledge (N)" | P1 |
  | 12 | Violation Context Modal | Chart snippet showing surrounding points, violation rule detail | click "eye" icon on row | P1 |
  | 13 | Paginated view | Top + bottom pager when >50 results | >50 violations | P1 |
  | 14 | Mobile card layout | Card-per-violation layout (md:hidden) | narrow viewport | P2 |
- **Known quirks**: `statusFilter` defaults to `'required'` (not `'all'`), so the default view already filters. Violations page has a "Last N" mode via TimeRangeSelector that collapses to single page.

---

## C. Show Your Work + Audit + Replay

### C1. Show Your Work (SYW) Panel
- **Location**: Floating slide-out panel, accessible from any dashboard page; toggle in header
- **Seed needs**: Characteristic with capability data (Cpk, Ppk); dashboard quickStats visible
- **Tier**: All
- **States**:
  | # | State | Shows | Interaction | Priority |
  |---|-------|-------|-------------|----------|
  | 01 | SYW mode off | No dotted underlines on values | header toggle off | P0 |
  | 02 | SYW mode on | All Explainable values have dotted underline in stats bar and Capability tab | toggle header button | P0 |
  | 03 | ExplanationPanel open — Cpk | Slide-out from right at z-[60]: KaTeX formula, step-by-step computation with actual numbers, inputs table, AIAG citation | click underlined Cpk | P0 |
  | 04 | ExplanationPanel open — Ppk | Same panel structure for Ppk | click underlined Ppk | P0 |
  | 05 | ExplanationPanel open — center_line | Formula for mean of subgroup means | click underlined CL value | P1 |
  | 06 | Panel loading state | Spinner while fetching explain endpoint | first open | P1 |
- **Known quirks**: `ExplanationPanel` uses `z-[60]` to render above modals at `z-50`. The explain API returns two modes depending on whether `chartOptions` (start/end dates) are passed. Dashboard quickStats uses Mode 1 (chart-filtered subgroup means); CapabilityCard uses Mode 2 (individual measurements + stored_sigma).

---

### C2. Audit Log Viewer
- **Route**: `/settings/audit-log`
- **Seed needs**: 20+ audit events across multiple resource types (users, characteristics, violations, samples, reports)
- **Tier**: Pro+, admin role
- **States**:
  | # | State | Shows | Interaction | Priority |
  |---|-------|-------|-------------|----------|
  | 01 | Default view | Table of recent audit entries, filters for resource/action/user/date | navigate to page | P0 |
  | 02 | Filtered by resource type | Only `sample` or `violation` entries shown | select resource filter | P1 |
  | 03 | Filtered by user | Entries for specific user | select user filter | P1 |
  | 04 | Date range applied | Time-bounded audit window | select custom range | P1 |
  | 05 | Row detail expanded | Full JSON payload of the audit event | click row or expand | P1 |
  | 06 | Empty result | "No audit events" message | filter with no matches | P1 |
- **File**: `/apps/cassini/frontend/src/components/AuditLogViewer.tsx`

---

### C3. Time-Travel Replay
- **Location**: ReplayScrubber bar on dashboard (below stats bar) — Pro+ only
- **Seed needs**: Characteristic with 100+ historical samples; Pro license
- **Tier**: Pro+
- **States**:
  | # | State | Shows | Interaction | Priority |
  |---|-------|-------|-------------|----------|
  | 01 | Scrubber inactive | Timeline bar hidden for non-Pro; for Pro, shows collapsed strip | Pro license | P1 |
  | 02 | Scrubber active — seeking | Timestamp tooltip following drag position | drag scrubber | P1 |
  | 03 | Replay snapshot view | Chart shows what control limits looked like at selected timestamp; "Replay at [time]" banner | set replay timestamp | P1 |
- **File**: `/apps/cassini/frontend/src/components/replay/ReplayScrubber.tsx`

---

## D. Data Ingestion

### D1. Data Entry — Manual Entry
- **Route**: `/data-entry` (Manual Entry tab)
- **Seed needs**: At least one characteristic with active collection plan; characteristic with subgroup_size to know how many measurements to enter
- **Tier**: All (operator minimum)
- **States**:
  | # | State | Shows | Interaction | Priority |
  |---|-------|-------|-------------|----------|
  | 01 | No characteristic selected | ManualEntryPanel with "select a characteristic" prompt | sidebar empty | P0 |
  | 02 | Characteristic selected, input form | Fields for each measurement slot in subgroup, timestamp, material selector | select from sidebar | P0 |
  | 03 | Input validation error | Per-field error messages (out of range, non-numeric) | submit bad values | P1 |
  | 04 | Submit success | Toast "Sample recorded"; form resets | submit valid | P0 |
- **File**: `/apps/cassini/frontend/src/components/ManualEntryPanel.tsx`

---

### D2. Data Entry — Collection Plans
- **Route**: `/data-entry` (Collection Plans tab)
- **Seed needs**: Collection plan created in Configuration, with 2+ characteristics; operator-assigned to plant
- **Tier**: All
- **States**:
  | # | State | Shows | Interaction | Priority |
  |---|-------|-------|-------------|----------|
  | 01 | No plant selected | "Select a plant" message | no plant in context | P0 |
  | 02 | Plans list — empty | Empty state with "No active collection plans" | no plans configured | P1 |
  | 03 | Plans list — populated | Cards with plan name, description, item count, "Start" button | plans exist | P0 |
  | 04 | CollectionPlanExecutor — active | Full-screen overlay with step-by-step measurement entry per characteristic | click "Start" | P0 |
  | 05 | CollectionPlanExecutor — mid-progress | Partial measurements filled, progress indicator | enter some measurements | P0 |
  | 06 | CollectionPlanExecutor — complete | All cells filled, submit button enabled | fill all measurements | P0 |
- **File**: `/apps/cassini/frontend/src/components/CollectionPlanExecutor.tsx`

---

### D3. Data Entry — Sample History
- **Route**: `/data-entry` (Sample History tab)
- **Seed needs**: 20+ historical samples
- **Tier**: All
- **States**:
  | # | State | Shows | Interaction | Priority |
  |---|-------|-------|-------------|----------|
  | 01 | History table populated | Paginated list of samples with timestamp, values, status | samples exist | P0 |
  | 02 | Empty | "No samples" state | empty DB | P1 |
  | 03 | Filter applied | Filtered by characteristic or date range | set filters | P1 |
- **File**: `/apps/cassini/frontend/src/components/SampleHistoryPanel.tsx`

---

### D4. CSV/Excel Import Wizard
- **Route**: Triggered from `/data-entry` — "Import CSV/Excel" button
- **Seed needs**: Sample CSV file matching a characteristic's format; a characteristic to import into
- **Tier**: All
- **States**:
  | # | State | Shows | Interaction | Priority |
  |---|-------|-------|-------------|----------|
  | 01 | Upload step | File drop zone, "Browse" button, format hints | open wizard | P0 |
  | 02 | File selected — preview | Column detection, header row selector, first N rows preview | upload file | P0 |
  | 03 | Column mapping step | Dropdown per column: map to timestamp / measurement / sample_size / material | advance from preview | P0 |
  | 04 | Validation result | Row-by-row errors highlighted; valid row count | click "Validate" | P1 |
  | 05 | Import success | "N rows imported" toast; wizard closes | click "Import" | P0 |
  | 06 | Import error — format mismatch | Error message with specific problem rows | malformed CSV | P1 |
- **File**: `/apps/cassini/frontend/src/components/ImportWizard.tsx`

---

## E. Connectivity Hub

### E1. Monitor Tab
- **Route**: `/connectivity/monitor`
- **Seed needs**: At least one MQTT or OPC-UA data source configured; live or simulated data flowing
- **Tier**: All (engineer minimum)
- **States**:
  | # | State | Shows | Interaction | Priority |
  |---|-------|-------|-------------|----------|
  | 01 | No sources configured | ServerStatusGrid empty, DataFlowPipeline empty | navigate | P0 |
  | 02 | Sources configured — healthy | ServerStatusCard per source showing green status, message rate, last seen | data sources active | P0 |
  | 03 | Source degraded | ServerStatusCard showing orange/yellow; reduced message rate | source intermittent | P1 |
  | 04 | Source disconnected | ServerStatusCard red; "Disconnected" | source offline | P1 |
  | 05 | DataFlowPipeline diagram | Visual pipeline: Source → Validate → Route → Characteristic | any source active | P1 |
  | 06 | ConnectivityMetrics | Throughput sparklines, error rate, queue depth | sources exist | P1 |
  | 07 | LiveValuePreview | Streaming latest value per topic/node | source active | P1 |
- **Files**: `components/connectivity/MonitorTab.tsx`, `ServerStatusGrid.tsx`, `DataFlowPipeline.tsx`

---

### E2. Servers Tab (MQTT + OPC-UA)
- **Route**: `/connectivity/servers`
- **Seed needs**: No servers needed for empty state; MQTT/OPC-UA servers for configured state
- **Tier**: All (engineer minimum)
- **States**:
  | # | State | Shows | Interaction | Priority |
  |---|-------|-------|-------------|----------|
  | 01 | Empty — no servers | ServerListItem empty; "Add server" placeholder | navigate | P0 |
  | 02 | Server list populated | List of MQTT + OPC-UA servers with ProtocolBadge, status, edit/delete | servers configured | P0 |
  | 03 | Add MQTT server form | MQTTServerForm with host, port, clientId, auth, TLS section | click "Add MQTT" | P0 |
  | 04 | Add OPC-UA server form | OPCUAServerForm with endpoint URL, security policy, certs | click "Add OPC-UA" | P0 |
  | 05 | TLS cert section expanded | PEM certificate/key text areas for mutual TLS | expand TLS section | P1 |
  | 06 | Connection test — in progress | ConnectionTestButton spinner | click "Test" | P1 |
  | 07 | Connection test — success | Green checkmark, RTT displayed | test succeeds | P1 |
  | 08 | Connection test — failure | Red error with message | test fails | P1 |
- **Files**: `components/connectivity/ServersTab.tsx`, `MQTTServerForm.tsx`, `OPCUAServerForm.tsx`, `TlsCertificateSection.tsx`

---

### E3. Browse Tab (Pro+)
- **Route**: `/connectivity/browse`
- **Seed needs**: Connected MQTT broker with published topics, or OPC-UA server with node tree
- **Tier**: Pro+
- **States**:
  | # | State | Shows | Interaction | Priority |
  |---|-------|-------|-------------|----------|
  | 01 | MQTT topic tree | TopicTreeBrowser: hierarchical MQTT topic tree | MQTT source connected | P1 |
  | 02 | OPC-UA node tree | NodeTreeBrowser: OPC-UA address space tree | OPC-UA source connected | P1 |
  | 03 | Topic/node selected | DataPointPreview showing live values | click topic/node | P1 |
  | 04 | QuickMap form | Inline form to map selected topic → characteristic | right-click topic or click Map | P1 |
  | 05 | Upgrade page (Community) | `<UpgradePage>` shown instead | Community license | P0 |

---

### E4. Mapping Tab
- **Route**: `/connectivity/mapping`
- **Seed needs**: Characteristics configured; data sources configured
- **Tier**: All (engineer)
- **States**:
  | # | State | Shows | Interaction | Priority |
  |---|-------|-------|-------------|----------|
  | 01 | Empty table | "No mappings" row | no mappings | P0 |
  | 02 | Mapping table populated | MappingTable: rows with source → characteristic, protocol badge, edit/delete | mappings exist | P0 |
  | 03 | MappingDialog open — create | ServerSelector, topic/node picker, CharacteristicPicker, transformation fields | click "Add Mapping" | P0 |
  | 04 | MappingDialog open — edit | Pre-filled form with existing mapping | click edit on row | P1 |
  | 05 | MappingRow with live value preview | Inline numeric preview updating from live data | mapping active | P1 |

---

### E5. Gages Tab (Pro+)
- **Route**: `/connectivity/gages`
- **Seed needs**: cassini-bridge installed and registered; gage connected to bridge
- **Tier**: Pro+
- **States**:
  | # | State | Shows | Interaction | Priority |
  |---|-------|-------|-------------|----------|
  | 01 | No bridges registered | GageBridgeList empty; "Register Bridge" button | navigate | P0 |
  | 02 | Register bridge dialog | GageBridgeRegisterDialog: name, description, token copy | click "Register Bridge" | P1 |
  | 03 | Bridge registered — online | Bridge card with status = online, gage devices list | bridge connects | P1 |
  | 04 | Bridge registered — offline | Bridge card with offline indicator | bridge disconnects | P1 |
  | 05 | Gage port config | GagePortConfig + GageProfileSelector (manufacturer presets) | click configure on gage device | P1 |
  | 06 | Live reading preview | GagePortConfig live value streaming from bridge | gage active | P1 |

---

### E6. ERP/LIMS Integrations Tab (Enterprise)
- **Route**: `/connectivity/integrations`
- **Seed needs**: ERP connector configured (SAP/Oracle/Plex etc.)
- **Tier**: Enterprise
- **States**:
  | # | State | Shows | Interaction | Priority |
  |---|-------|-------|-------------|----------|
  | 01 | Empty | "No ERP/LIMS connectors" | navigate | P1 |
  | 02 | Connector list | Cards per connector type with status, last sync time | connectors configured | P1 |
  | 03 | Connector edit form | Connection string, auth, field mapping | click configure | P1 |

---

## F. Configuration (Equipment Hierarchy + Materials)

### F1. Hierarchy Editor
- **Route**: `/configuration`
- **Seed needs**: Plant selected; hierarchy with 3+ levels (Enterprise > Site > Line > Cell > Equipment); 3+ characteristics
- **Tier**: All (engineer minimum)
- **States**:
  | # | State | Shows | Interaction | Priority |
  |---|-------|-------|-------------|----------|
  | 01 | Empty — no hierarchy | HierarchyTree with just the plant root | fresh install | P0 |
  | 02 | Tree populated | Collapsible tree with type icons per node (Folder, Enterprise, Site, Area, Line, Cell, Equipment, Tag) | hierarchy exists | P0 |
  | 03 | Node selected — edit characteristic | Right panel: CharacteristicForm for the selected characteristic | click characteristic node | P0 |
  | 04 | Add node modal | Modal with name field, type selector (8 types) | click "+ Add Node" | P1 |
  | 05 | Add characteristic wizard | CreateCharacteristicWizard — multi-step: select type, enter limits, pick data source | click "+ Add Characteristic" | P0 |
  | 06 | Material config view | MaterialConfigView panel — see F3 | click "Materials" toggle | P1 |
- **Files**: `pages/ConfigurationView.tsx`, `components/HierarchyTree.tsx`, `components/CharacteristicForm.tsx`, `components/characteristic-config/CreateCharacteristicWizard.tsx`

---

### F2. Characteristic Configuration Wizard
- **Location**: Triggered from ConfigurationView
- **Seed needs**: At least one hierarchy node to attach to
- **States**:
  | # | State | Shows | Interaction | Priority |
  |---|-------|-------|-------------|----------|
  | 01 | Step 1 — type selection | Variable vs. Attribute selector; short-run option | first step | P0 |
  | 02 | Step 2 — basic config | Name, unit, subgroup_size, USL/LSL/nominal | advance | P0 |
  | 03 | Step 3 — chart type | Chart type picker (Xbar-R, Xbar-S, I-MR, CUSUM, EWMA, Box-Whisker, etc.) | advance | P1 |
  | 04 | Step 4 — data source | None (manual) / MQTT topic / OPC-UA node | advance | P1 |
  | 05 | Step 5 — collection plan assignment | Optional: add to existing collection plan | advance | P1 |
  | 06 | Wizard complete | Characteristic created, tree refreshes | click "Finish" | P0 |

---

### F3. Materials Configuration
- **Location**: Tab within ConfigurationView
- **Seed needs**: Material classes created; materials with spec limit overrides
- **States**:
  | # | State | Shows | Interaction | Priority |
  |---|-------|-------|-------------|----------|
  | 01 | Material classes empty | "No material classes" + "Add" button | navigate | P1 |
  | 02 | Material class list | Cards per class with type, description | classes exist | P1 |
  | 03 | Class detail — materials | Materials within a class with name, code, active toggle | click class | P1 |
  | 04 | Material override form | Per-characteristic USL/LSL override per material | click material → override | P1 |

---

## G. Quality Studies

### G1. MSA List Page
- **Route**: `/msa`
- **Seed needs**: MSA studies in mixed statuses
- **Tier**: Pro+, engineer role
- **States**:
  | # | State | Shows | Interaction | Priority |
  |---|-------|-------|-------------|----------|
  | 01 | No plant selected | "Select a plant" message | no plant | P0 |
  | 02 | Empty | Dashed border empty state + "Create your first study" link | no studies | P0 |
  | 03 | List — mixed statuses | Grid of study cards; status badges (Setup/Collecting/Complete); study type badge | studies exist | P0 |
  | 04 | Filter — Collecting | Only amber-badged studies | click "Collecting" filter | P1 |
  | 05 | Filter — Complete | Only green-badged studies | click "Complete" filter | P1 |
  | 06 | Delete confirm dialog | Modal "Delete MSA Study?" with warning text | click trash icon | P1 |

---

### G2. MSA Study Editor — Crossed ANOVA
- **Route**: `/msa/:studyId` (or `/msa/new` for setup)
- **Seed needs**: Crossed ANOVA study with 3 operators, 10 parts, 3 replicates; collected data; complete status
- **Tier**: Pro+, engineer
- **States**:
  | # | State | Shows | Interaction | Priority |
  |---|-------|-------|-------------|----------|
  | 01 | Setup step (MSANewStudyForm) | Study name, type selector, operators/parts/replicates fields, characteristic picker | navigate to /msa/new | P0 |
  | 02 | StudySteps progress bar | Breadcrumb steps (Overview → Data → Results); current step highlighted | navigate tabs | P1 |
  | 03 | Overview tab — study details | Name, type label, operator/part/replicate counts, created date, status badge | click "Overview" | P1 |
  | 04 | Data tab — MSADataGrid empty | Grid with operators × parts × replicates; all cells blank | setup complete | P0 |
  | 05 | Data tab — partial fill | Some cells filled; validation indicators on cells; navigation arrows | enter some measurements | P0 |
  | 06 | Data tab — complete fill | All cells filled; "Calculate" button enabled | fill all cells | P0 |
  | 07 | Results tab — variance components | MSAResults: %Contribution, %Study Var, %Tolerance; NDC; Repeatability/Reproducibility bar chart | after Calculate | P0 |
  | 08 | Results tab — verdict "Acceptable" | Green verdict badge (GRR < 10%) | high-quality data | P0 |
  | 09 | Results tab — verdict "Marginal" | Yellow badge (10-30%) + recommended actions | marginal data | P1 |
  | 10 | Results tab — verdict "Unacceptable" | Red badge (>30%) | poor data | P1 |
  | 11 | Signature dialog — sign-off | SignatureDialog modal for MSA approval | click "Sign" | P1 |
- **File**: `/apps/cassini/frontend/src/components/msa/MSAStudyEditor.tsx`

---

### G3. MSA Study Editor — Attribute Agreement
- **Route**: `/msa/:studyId` (study_type=attribute_agreement)
- **Seed needs**: Attribute study with 3 operators, 20 parts, 2 replicates; reference values filled; results calculated
- **States**:
  | # | State | Shows | Interaction | Priority |
  |---|-------|-------|-------------|----------|
  | 01 | Data grid — attribute | MSADataGrid with pass/fail/borderline cells | setup | P1 |
  | 02 | Results — AttributeMSAResults | Fleiss Kappa, Within-appraiser agreement %, Between-appraiser %, vs. reference | calculate | P1 |

---

### G4. MSA Study Editor — Linearity / Stability / Bias
- **Route**: `/msa/:studyId`
- **Seed needs**: Linearity study with reference values and bias measurements at multiple points
- **States**:
  | # | State | Shows | Interaction | Priority |
  |---|-------|-------|-------------|----------|
  | 01 | Linearity results | LinearityResults: scatter plot of bias vs. reference value, regression line | complete | P1 |
  | 02 | Stability results | StabilityResults: control chart of repeated measurements of standard over time | complete | P1 |
  | 03 | Bias results | BiasResults: mean bias, t-test result, verdict | complete | P1 |

---

### G5. DOE List Page
- **Route**: `/doe`
- **Seed needs**: DOE studies in mixed statuses (design, collecting, analyzed)
- **Tier**: Pro+, engineer
- **States** mirror MSA list: empty, list (cards with factor count, run count, design type badge, status), filter tabs, delete confirm.
- **States**:
  | # | State | Shows | Interaction | Priority |
  |---|-------|-------|-------------|----------|
  | 01 | Empty | Dashed empty state | no studies | P0 |
  | 02 | List — mixed statuses | Cards with design_type label, factor count, run count | studies exist | P0 |
  | 03 | Filter by status | Design / Collecting / Analyzed tabs | click filter | P1 |

---

### G6. DOE Study Editor
- **Route**: `/doe/:studyId` or `/doe/new`
- **Seed needs**: Full factorial 2^3 study with 8 runs; all responses collected; analysis complete
- **States**:
  | # | State | Shows | Interaction | Priority |
  |---|-------|-------|-------------|----------|
  | 01 | Design step | Factors table (name, low/high levels, unit); design type selector; run count preview | /doe/new | P0 |
  | 02 | Run matrix | DOEStudyEditor run grid: factor levels per run + response column | advance to data | P0 |
  | 03 | Run matrix partial | Some response cells filled | enter data | P0 |
  | 04 | Analysis results — ANOVA table | Source, SS, df, MS, F, p-value per factor | after calculate | P0 |
  | 05 | Analysis results — Effects pareto | Bar chart of factor effects sorted by magnitude | in results tab | P0 |
  | 06 | Analysis results — R² badge | R² and adj. R² shown as confidence metric | results | P1 |
  | 07 | Main effects plots | Line plots per factor showing low-to-high effect on response | click plots tab | P1 |
- **File**: `/apps/cassini/frontend/src/components/doe/DOEStudyEditor.tsx`

---

### G7. FAI List Page
- **Route**: `/fai`
- **Seed needs**: FAI reports in all statuses (draft, submitted, approved, rejected)
- **Tier**: Enterprise, engineer
- **States**:
  | # | State | Shows | Interaction | Priority |
  |---|-------|-------|-------------|----------|
  | 01 | No plant selected | "Select a plant" fallthrough message in FAIPage | no plant | P0 |
  | 02 | Empty | Dashed empty state + "Create your first report" | no reports | P0 |
  | 03 | List — mixed statuses | Grid of report cards with part number, status badge (Draft/Submitted/Approved/Rejected), revision, plant name, date | reports exist | P0 |
  | 04 | Delete confirm (draft only) | Modal "Delete Report?" — trash only appears for draft status | click trash on draft | P1 |

---

### G8. FAI Report Editor
- **Route**: `/fai/:reportId`
- **Seed needs**: FAI report with part_number, part_name, revision; form1/form2/form3 data filled; at least one in each status
- **Tier**: Enterprise, engineer
- **States**:
  | # | State | Shows | Interaction | Priority |
  |---|-------|-------|-------------|----------|
  | 01 | Form 1 — Design Record and Engineering Documents | FAIForm1: part info, drawing number, design authority | click "Form 1" tab | P0 |
  | 02 | Form 2 — Product Design Information | FAIForm2: materials, special characteristics checklist | click "Form 2" tab | P0 |
  | 03 | Form 3 — Characteristic Accountability | FAIForm3: balloon table with measured values vs. nominal, tolerances, gage used | click "Form 3" tab | P0 |
  | 04 | StudySteps progress bar | AS9102-style steps breadcrumb | navigate tabs | P1 |
  | 05 | Status = draft | "Submit for Approval" button active; no "Approve/Reject" | draft report | P0 |
  | 06 | Submit with signature required | SignatureDialog modal blocks submit | workflow configured | P1 |
  | 07 | Status = submitted | "Approve" + "Reject" buttons; "Submit" greyed | submitted | P0 |
  | 08 | Reject dialog | Reason textarea + confirm; report flips to rejected | click "Reject" | P1 |
  | 09 | Status = approved | "Approved" badge; print button active | approved | P0 |
  | 10 | Print view | FAIPrintView — paginated AS9102-formatted print layout | click "Print" | P1 |
  | 11 | Delta FAI creation | "Create Delta" button; spawns new report pre-populated from current | click "Create Delta" | P2 |
  | 12 | PDF export | Export to PDF via browser print or jsPDF | click "Download PDF" | P1 |
- **File**: `/apps/cassini/frontend/src/components/fai/FAIReportEditor.tsx`

---

## H. Compliance

### H1. Electronic Signatures Settings
- **Route**: `/settings/signatures`
- **Seed needs**: No workflows for empty; at least one workflow for configured state
- **Tier**: Pro+, engineer
- **States**:
  | # | State | Shows | Interaction | Priority |
  |---|-------|-------|-------------|----------|
  | 01 | No workflows configured | WorkflowConfig empty state | navigate | P0 |
  | 02 | Workflow list | List of workflow rules (resource type, required flag, step count) | workflows exist | P0 |
  | 03 | WorkflowStepEditor open | Modal for configuring approver steps per workflow | click edit | P1 |
  | 04 | MeaningManager | Configurable signature meanings (e.g., "Approved", "Reviewed") | click meanings | P1 |
  | 05 | PasswordPolicySettings | Minimum password strength config | scroll down | P1 |
  | 06 | PendingApprovalsDashboard | Pending signatures awaiting user's action | approvals exist | P1 |
- **File**: `/apps/cassini/frontend/src/components/signatures/SignatureSettingsPage.tsx`

---

### H2. Signature Dialog (in-context)
- **Location**: Modal overlay triggered during FAI approval, MSA sign-off, DOE sign-off
- **Seed needs**: Workflow configured for the resource type being acted on
- **States**:
  | # | State | Shows | Interaction | Priority |
  |---|-------|-------|-------------|----------|
  | 01 | Dialog open — default | Meaning selector, comment field, password re-entry, "Sign" button | trigger action | P0 |
  | 02 | Wrong password | Error inline | type wrong password | P1 |
  | 03 | Success | Dialog closes, resource transitions to next status | correct password | P0 |
- **File**: `/apps/cassini/frontend/src/components/signatures/SignatureDialog.tsx`

---

### H3. Retention Settings
- **Route**: `/settings/retention`
- **Seed needs**: At least one retention policy configured
- **Tier**: Enterprise, engineer
- **States**:
  | # | State | Shows | Interaction | Priority |
  |---|-------|-------|-------------|----------|
  | 01 | Empty | "No retention policies" | navigate | P1 |
  | 02 | Policy list | Cards per policy with resource type, duration, purge schedule | policies exist | P1 |
  | 03 | Add/edit policy form | Resource type picker, retention period, purge trigger | click add | P1 |
  | 04 | Purge confirmation | "This will permanently delete N records" dialog | trigger purge | P1 |
- **File**: `/apps/cassini/frontend/src/components/RetentionSettings.tsx`

---

## I. Analytics

### I1. Analytics Page — Correlation Tab
- **Route**: `/analytics?tab=correlation`
- **Seed needs**: 3+ characteristics with 50+ samples each; characteristics correlated (e.g., two measurements from same process)
- **Tier**: Enterprise, engineer
- **States**:
  | # | State | Shows | Interaction | Priority |
  |---|-------|-------|-------------|----------|
  | 01 | Initial state | HierarchyMultiSelector for choosing characteristics; Pearson/Spearman toggle; "Compute" button | navigate | P0 |
  | 02 | Computing | Loader spinner | click Compute | P1 |
  | 03 | Heatmap sub-tab | CorrelationHeatmap: N×N color grid with coefficient values | compute done | P0 |
  | 04 | PCA sub-tab — Scree plot | PCAScreePlot: bar chart of variance explained per component | click PCA | P1 |
  | 05 | PCA sub-tab — Biplot | PCABiplot: 2D scatter of samples with factor loading arrows | click Biplot | P1 |
  | 06 | Rankings sub-tab | Variable importance bar chart sorted descending | click Rankings | P1 |
  | 07 | Partial correlation sub-tab | Partial correlation matrix with control variable selection | click Partial | P1 |
  | 08 | Regression sub-tab | RegressionScatterPlot: X vs. Y scatter with regression line, R² | click Regression | P1 |
  | 09 | InterpretResult component | "What does this mean?" plain-language interpretation card | auto-shown with result | P1 |
- **File**: `/apps/cassini/frontend/src/components/analytics/CorrelationTab.tsx`

---

### I2. Analytics Page — Multivariate Tab (Hotelling T²)
- **Route**: `/analytics?tab=multivariate`
- **Seed needs**: Multivariate group configured (2+ characteristics); Phase I samples frozen; Phase II data with OOC points
- **Tier**: Enterprise, engineer
- **States**:
  | # | State | Shows | Interaction | Priority |
  |---|-------|-------|-------------|----------|
  | 01 | No group selected | GroupManager empty state + "Create Group" button | navigate | P0 |
  | 02 | Group list | List of multivariate groups with member count, phase | groups exist | P1 |
  | 03 | Group selected — Phase I (computing) | "Compute" button + UCL preview; no chart yet | before freeze | P1 |
  | 04 | Phase I frozen | "Frozen" badge; T² chart appears with Phase I UCL | after freeze | P1 |
  | 05 | T² timeline chart | T2Chart: time-series T² statistic with UCL/LCL; OOC points highlighted | chart data loaded | P0 |
  | 06 | OOC point selected | DecompositionTable below chart: per-variable contribution % to T² exceedance | click OOC point | P1 |
  | 07 | Bivariate view (2-member groups) | T2BivariatePlot: 2D ellipse confidence region; points colored in/out | switch view | P1 |
  | 08 | Freeze Phase I button + confirm | Modal "Are you sure? This locks the control limits" | click Freeze | P1 |
- **File**: `/apps/cassini/frontend/src/components/analytics/MultivariateTab.tsx`

---

### I3. Analytics Page — Predictions Tab
- **Route**: `/analytics?tab=predictions`
- **Seed needs**: Characteristics with prediction models enabled (ARIMA or exponential smoothing configured); forecast data computed
- **Tier**: Enterprise, engineer
- **States**:
  | # | State | Shows | Interaction | Priority |
  |---|-------|-------|-------------|----------|
  | 01 | No plant selected | "Select a plant" message | no plant | P0 |
  | 02 | Empty dashboard | GuidedEmptyState with hints for configuring predictions | no predictions | P1 |
  | 03 | Dashboard list | Cards per characteristic with model info, trend arrow (up/down/flat), forecast horizon | predictions exist | P0 |
  | 04 | Card expanded — forecast overlay | PredictionOverlay: forecast line with confidence bands on existing chart | click card expand | P0 |
  | 05 | PredictionConfig modal | ARIMA order (p,d,q) / smoothing alpha config; train/test split | click "Configure" | P1 |
  | 06 | IntervalStats panel | Upper/lower prediction interval statistics | expand detail | P1 |
  | 07 | Trend interpretation | InterpretResult: "trending upward, will breach UCL in ~N samples" | results computed | P1 |
- **File**: `/apps/cassini/frontend/src/components/analytics/PredictionsTab.tsx`

---

### I4. Analytics Page — AI Insights Tab
- **Route**: `/analytics?tab=ai-insights`
- **Seed needs**: AI provider configured (settings/ai); plant with violation-heavy data
- **Tier**: Enterprise (AI requires Enterprise config)
- **States**:
  | # | State | Shows | Interaction | Priority |
  |---|-------|-------|-------------|----------|
  | 01 | AI not configured | "Configure AI provider" prompt with link to settings | no AI config | P0 |
  | 02 | Generating insight | Spinner, "Analyzing plant data..." | click "Generate Insights" | P1 |
  | 03 | Insight card populated | AIInsightPanel: markdown-rendered insight with risk assessment, Ishikawa-style cause hypothesis | insight generated | P0 |
  | 04 | Insight with chart context | Referenced characteristic name + Pareto of top violations | insight for active char | P1 |
- **File**: `/apps/cassini/frontend/src/components/analytics/AIInsightsTab.tsx`

---

## J. Reports

### J1. Reports View
- **Route**: `/reports`
- **Seed needs**: Characteristics with data; DOE/MSA studies for study-scoped templates; plant with multiple lines for line-scoped
- **Tier**: Supervisor+ (Community free; starred templates are Pro)
- **States**:
  | # | State | Shows | Interaction | Priority |
  |---|-------|-------|-------------|----------|
  | 01 | No template selected | "No template selected" center placeholder | navigate | P0 |
  | 02 | No characteristic selected (char-scoped) | NoCharacteristicState placeholder | template selected but no char | P0 |
  | 03 | Template dropdown | All available templates; commercial ones prefixed with "★ " | click dropdown | P1 |
  | 04 | Characteristic Summary template | ChartPanel + violation summary table + capability indices | select template + characteristic | P0 |
  | 05 | Capability Evidence template | Control chart + Cp/Cpk/Pp/Ppk + distribution histogram | select template | P0 |
  | 06 | DOE Residuals template | Study selector dropdown; ANOVA table + effects pareto rendered inline | select DOE template | P1 |
  | 07 | MSA Resolution template | Study selector; GRR table + verdict | select MSA template | P1 |
  | 08 | Plant Health template (plant-scoped) | All characteristics Cpk / % in control; "This report covers all characteristics" banner | select plant-health template | P1 |
  | 09 | Line Assessment template | Line selector dropdown; characteristic table for selected line | select line template | P1 |
  | 10 | Batch Export mode active | Batch panel with characteristic checklist; select-all checkbox; "Export Selected (N)" button | click "Batch Export" | P1 |
  | 11 | Batch progress bar | Progress: N/M spinner + progress bar | batch export in progress | P1 |
  | 12 | Export dropdown | PDF / Excel / CSV / PNG options | click "Export" | P1 |
  | 13 | Time range selector | Custom date window applied to report | change time range | P1 |
  | 14 | Upgrade page (Community for commercial templates) | `<UpgradePage>` for starred templates | Community user selects commercial template | P0 |

---

## K. Display Modes

### K1. Kiosk View
- **Route**: `/kiosk` (outside main Layout — no sidebar)
- **Seed needs**: 3+ characteristics with data; URL params `?chars=1,2,3&interval=15`
- **Tier**: All
- **States**:
  | # | State | Shows | Interaction | Priority |
  |---|-------|-------|-------------|----------|
  | 01 | Loading | "Loading..." spinner full screen | navigate | P1 |
  | 02 | No characteristics | "No Characteristics" message with configuration hint | empty plant | P1 |
  | 03 | Single characteristic — in control | StatusIndicator green dot; characteristic name; ControlChart; stats bar (Current/UCL/LCL) | one char | P0 |
  | 04 | Rotating — paused | "Resume" button shows; current characteristic held | press Space or click Pause | P1 |
  | 05 | Rotating — active | Auto-advances every N seconds; pagination dots show progress | default | P0 |
  | 06 | Characteristic with violation | StatusIndicator animates red (pulsing) | violation present | P0 |
  | 07 | Characteristic approaching limits | StatusIndicator amber (warning — within 10% of limit range) | near-limit data | P1 |
  | 08 | Arrow navigation | Prev/next arrows overlay on chart left/right | multi-characteristic | P1 |
  | 09 | Keyboard navigation | Left/Right move, Space pauses | keyboard user | P2 |

---

### K2. Wall Dashboard
- **Route**: `/wall-dashboard`
- **Seed needs**: 4-16 characteristics for grid filling; preset saved in localStorage
- **Tier**: All
- **States**:
  | # | State | Shows | Interaction | Priority |
  |---|-------|-------|-------------|----------|
  | 01 | Default 2x2 grid — empty slots | 4 WallChartCard placeholders | navigate | P0 |
  | 02 | Grid picker open | Dropdown with grid size options: 2x2, 3x3, 4x4, 2x3, 3x2 | click grid size button | P1 |
  | 03 | Cells populated | WallChartCards each showing ControlChart for a characteristic | assign characteristics to cells | P0 |
  | 04 | 3x3 grid — fully populated | 9 charts, each auto-refreshing | 9 characteristics assigned | P0 |
  | 05 | Preset saved | "Saved!" toast; preset name in preset list | click "Save preset" | P1 |
  | 06 | Preset loaded | Grid and assignments restored | click stored preset | P1 |
  | 07 | Galaxy view toggle | Switches to GalaxyScene embedded in wall dashboard | click orbit icon | P2 |
  | 08 | Characteristic picker (click empty cell) | Dropdown/modal to assign characteristic to cell | click empty cell | P1 |
- **Known quirks**: Presets are stored in `localStorage` key `cassini-wall-dashboard-presets`. Grid sizes: `2x2`, `3x3`, `4x4`, `2x3`, `3x2`. The GalaxyScene is embedded via `WallDashboard.tsx` using the same Three.js scene as the Galaxy page.

---

### K3. Galaxy View
- **Route**: `/galaxy`
- **Seed needs**: Plant with 5+ characteristics; hierarchy with 2+ constellation groupings; some characteristics with violations (red planets)
- **Tier**: All (easter egg: type "cassini" on dashboard to trigger)
- **States**:
  | # | State | Shows | Interaction | Priority |
  |---|-------|-------|-------------|----------|
  | 01 | Galaxy zoom level | Stars/constellation view; all hierarchy groups as star clusters | navigate | P0 |
  | 02 | Constellation zoom | Fly-in to a hierarchy group; planet orbs for each characteristic | click constellation | P1 |
  | 03 | Planet zoom — in-control | Green/blue planet, orbital "moon" data points (recent samples) | click planet | P1 |
  | 04 | Planet zoom — violation | Red planet, pulsing; orbit disrupted | characteristic with violations | P0 |
  | 05 | PlanetOverlay | Side panel showing characteristic name, Cpk, latest value, violation count | planet focused | P1 |
  | 06 | GalaxySidebar | Left panel: hierarchy list; click to navigate camera | open sidebar | P1 |
  | 07 | GalaxyBreadcrumb | Breadcrumb trail at top: Galaxy > Constellation > Planet | drill-down active | P1 |
  | 08 | Moon trace lines toggle | Orbital trail lines on/off (showTrace state) | GalaxyControls toggle | P2 |
  | 09 | Moon spoke lines toggle | Radial spoke lines on/off (showSpokes state) | GalaxyControls toggle | P2 |
  | 10 | Sample inspector | SampleInspectorModal triggered by clicking a moon (data point) | click moon | P1 |
  | 11 | Kiosk mode | No sidebar/breadcrumb; URL param `?kiosk=true` | kiosk URL | P2 |
  | 12 | Multi-plant selector | Plant switcher dropdown in galaxy header | multi-plant install | P1 |
- **Known quirks**: Galaxy is a Three.js/WebGL scene. Page load includes camera fly animations — screenshots need a settled state. The easter egg is triggered by typing "cassini" on the dashboard (`useKonamiSequence` with `CASSINI_SEQUENCE`).

---

## L. Settings and Admin

### L1. Settings Shell
- **Route**: `/settings`
- **Tier**: Engineer minimum (varies per sub-page)
- **States**:
  | # | State | Shows | Interaction | Priority |
  |---|-------|-------|-------------|----------|
  | 01 | Settings sidebar — Community user | Only Personal + Organization sections visible (no Security/Data/Integrations Pro/Enterprise items) | Community license | P0 |
  | 02 | Settings sidebar — Pro user | Adds: Notifications, API Keys, Audit Log, Database, Scheduled Reports, Signatures | Pro license | P0 |
  | 03 | Settings sidebar — Enterprise | Adds: SSO, Retention, AI Config; extension tabs from commercial package | Enterprise license | P0 |

---

### L2. Account Settings
- **Route**: `/settings/account`
- **States**:
  | # | State | Shows | Interaction | Priority |
  |---|-------|-------|-------------|----------|
  | 01 | Default | Username, email display; "Change Password" section; avatar placeholder | navigate | P0 |

---

### L3. Appearance Settings
- **Route**: `/settings/appearance`
- **States**:
  | # | State | Shows | Interaction | Priority |
  |---|-------|-------|-------------|----------|
  | 01 | Theme selector | Light / Dark / System toggle; Visual style: Retro / Glass | navigate | P0 |
  | 02 | Retro style selected | Sharp corners, monospace fonts visible in preview | click Retro | P1 |
  | 03 | Glass style selected | Frosted backdrop-blur cards in preview | click Glass | P1 |

---

### L4. Notifications Settings (Pro+)
- **Route**: `/settings/notifications`
- **States**:
  | # | State | Shows | Interaction | Priority |
  |---|-------|-------|-------------|----------|
  | 01 | No push subscriptions | "No push subscriptions configured" | navigate | P1 |
  | 02 | Push subscription form | Webhook URL, event type selectors, test button | click "Add" | P1 |

---

### L5. License Settings (Admin)
- **Route**: `/settings/license`
- **States**:
  | # | State | Shows | Interaction | Priority |
  |---|-------|-------|-------------|----------|
  | 01 | Community license | Tier badge "Community", plant count: 1, feature table | Community | P0 |
  | 02 | Pro license active | Tier badge "Pro", plant count per license, expiry date | Pro license | P0 |
  | 03 | Enterprise license active | Tier badge "Enterprise", all features unlocked | Enterprise | P0 |
  | 04 | License upload form | Textarea or file picker for `.license` JWT | click "Upload License" | P1 |
  | 05 | License validation error | Invalid signature / expired / wrong instance ID message | upload bad license | P1 |
  | 06 | Activation workflow | Offline activation: copy activation string → portal → paste `.activation` response | offline mode | P2 |
- **File**: `/apps/cassini/frontend/src/components/LicenseSettings.tsx`

---

### L6. Sites (Plant) Settings (Admin)
- **Route**: `/settings/sites`
- **States**:
  | # | State | Shows | Interaction | Priority |
  |---|-------|-------|-------------|----------|
  | 01 | Plant list | Table of configured plants with name, code, active status | navigate | P0 |
  | 02 | Add plant form | Name, code, timezone fields | click "Add Plant" | P1 |
  | 03 | Edit plant form | Pre-filled edit form | click edit | P1 |

---

### L7. API Keys Settings (Pro+, Engineer)
- **Route**: `/settings/api-keys`
- **States**:
  | # | State | Shows | Interaction | Priority |
  |---|-------|-------|-------------|----------|
  | 01 | Empty | "No API keys" message | navigate | P0 |
  | 02 | Key list | Table of keys with name, last-used, permissions badge | keys exist | P0 |
  | 03 | Create key form | Name, scopes/permissions checkboxes | click "Create Key" | P1 |
  | 04 | Key created — reveal | One-time reveal of the secret; "Copy" button; warning to save it | after create | P0 |

---

### L8. SSO / OIDC Settings (Enterprise, Admin)
- **Route**: `/settings/sso`
- **States**:
  | # | State | Shows | Interaction | Priority |
  |---|-------|-------|-------------|----------|
  | 01 | No providers | "No OIDC providers configured" | navigate | P0 |
  | 02 | Provider form | Client ID, client secret, authorization URL, token URL, scopes | click "Add Provider" | P1 |
  | 03 | Provider active | Provider card with "Active" badge; redirect URI shown for IdP config | provider saved | P1 |

---

### L9. Database Settings (Pro+)
- **Route**: `/settings/database`
- **States**:
  | # | State | Shows | Interaction | Priority |
  |---|-------|-------|-------------|----------|
  | 01 | Current DB info | Dialect, connection string hint, version, size | navigate | P0 |
  | 02 | Backup controls | "Export backup" button, backup schedule | Pro | P1 |

---

### L10. Scheduled Reports (Pro+)
- **Route**: `/settings/reports`
- **States**:
  | # | State | Shows | Interaction | Priority |
  |---|-------|-------|-------------|----------|
  | 01 | Empty | "No scheduled reports" | navigate | P1 |
  | 02 | Schedule list | Cards: template, frequency (daily/weekly), recipients, last-run | schedules exist | P1 |
  | 03 | Add schedule form | Template picker, cron/frequency selector, recipient emails | click "Add" | P1 |

---

### L11. Branding Settings (Admin)
- **Route**: `/settings/branding`
- **States**:
  | # | State | Shows | Interaction | Priority |
  |---|-------|-------|-------------|----------|
  | 01 | Default Cassini brand | Logo preview, color palette preview | navigate | P1 |
  | 02 | Custom logo uploaded | Customer logo in preview | upload | P1 |
  | 03 | Custom colors applied | Primary/accent color pickers with live preview | set colors | P1 |

---

### L12. AI Config Settings (Enterprise, Admin)
- **Route**: `/settings/ai`
- **States**:
  | # | State | Shows | Interaction | Priority |
  |---|-------|-------|-------------|----------|
  | 01 | No AI configured | "Add AI provider" placeholder | navigate | P0 |
  | 02 | Provider configured | Provider name (OpenAI/Anthropic/local), model, budget cap | configured | P1 |
  | 03 | Budget meter | Monthly spend vs. cap progress bar | configured | P1 |

---

### L13. Email/Webhook Settings (Admin)
- **Route**: `/settings/email-webhooks`
- **States**:
  | # | State | Shows | Interaction | Priority |
  |---|-------|-------|-------------|----------|
  | 01 | SMTP config | Host, port, TLS, auth fields | navigate | P1 |
  | 02 | Webhook list | Outbound webhook URLs per event type | webhooks exist | P1 |

---

## M. Enterprise Features

### M1. CEP Rules Page
- **Route**: `/cep-rules`
- **Seed needs**: 2+ CEP rules in mixed enabled/disabled states; one rule with multiple conditions
- **Tier**: Enterprise, engineer
- **States**:
  | # | State | Shows | Interaction | Priority |
  |---|-------|-------|-------------|----------|
  | 01 | No plant | "Select a plant" message | no plant | P0 |
  | 02 | Empty list | "No CEP rules yet" text in left pane; editor pane shows prompt | no rules | P0 |
  | 03 | Rule list | Left pane: rules listed with name, enabled status, window + condition count | rules exist | P0 |
  | 04 | Rule selected | Right pane: CepRuleEditor (Monaco editor) showing YAML; header with rule name, Enabled checkbox, Save/Cancel/Delete | click rule | P0 |
  | 05 | New rule — draft | Editor shows DEFAULT_CEP_RULE_TEMPLATE YAML stub; "Create" button enabled | click "New Rule" | P0 |
  | 06 | Editor dirty | Save button becomes active | modify YAML | P1 |
  | 07 | Rule disabled | "disabled" label next to rule in list | rule.enabled = false | P1 |
  | 08 | Save success | Rule refreshes in list; dirty state cleared | click Save | P1 |
  | 09 | Delete confirm dialog | "Are you sure you want to delete 'N'?" | click Delete | P1 |
- **Known quirks**: Monaco editor takes ~1.5s to colorize YAML on first activation (web worker initialization). The layout is a two-pane split: left sidebar (`w-72`) + flex-1 editor. On mobile it stacks vertically with max-h-64 for the list.
- **File**: `/apps/cassini/frontend/src/pages/CepRulesPage.tsx`, `components/cep/CepRuleEditor.tsx`

---

### M2. SOP-Grounded RAG Page
- **Route**: `/sop-rag`
- **Seed needs**: 2+ SOP documents uploaded (one "ready", one "indexing"); AI provider configured; at least one answered question and one refused question
- **Tier**: Enterprise, operator
- **States**:
  | # | State | Shows | Interaction | Priority |
  |---|-------|-------|-------------|----------|
  | 01 | No plant | "Select a plant" message | no plant | P0 |
  | 02 | Empty corpus | Left pane: "No documents yet" | no docs | P0 |
  | 03 | Corpus populated — mixed statuses | DocRow per doc with status badge (ready=green/indexing=pulsing/failed=red), chunk count, PII warning if detected | docs uploaded | P0 |
  | 04 | PII warning badge | `AlertTriangle` + PII match summary text on DocRow | doc with PII | P1 |
  | 05 | Failed doc | Red `XCircle` + error message in DocRow | indexing failure | P1 |
  | 06 | Upload — choosing file | "Choose file" button; accepts TXT/MD/PDF/DOCX ≤ 25MB | click Choose | P1 |
  | 07 | Upload in progress | Button shows spinner | file selected | P1 |
  | 08 | Ask question — typing | Input field active | type question | P0 |
  | 09 | Ask in progress | "Ask" button shows spinner; input disabled | click Ask | P1 |
  | 10 | Answer — with citations | AnswerView: markdown answer; inline CitationPill badges `[chunkId]` with hover tooltip showing doc title + excerpt | question answered | P0 |
  | 11 | Refusal view | RefusalView: red border; "Citation lock refused" header; `reason` code; `failed_sentence` excerpt | hallucination detected | P0 |
  | 12 | Budget meter | BudgetCard: progress bar spent/$cap, query count, remaining | any queries done | P1 |
  | 13 | Budget exhausted | Progress bar red (100%); queries may be rejected | budget = cap | P1 |
  | 14 | Re-index button | Spinner on DocRow "Re-index" | click Re-index | P1 |
  | 15 | Delete doc dialog | "Permanently delete '...' and its indexed chunks" | click Delete | P1 |

---

### M3. Cassini Lakehouse
- **Route**: `/lakehouse`
- **Seed needs**: Plant with samples, violations, characteristics data; Pro license
- **Tier**: Pro+, engineer
- **States**:
  | # | State | Shows | Interaction | Priority |
  |---|-------|-------|-------------|----------|
  | 01 | Loading (license resolving) | Full-screen spinner | navigate | P1 |
  | 02 | Table selector | Dropdown of available tables (samples, violations, characteristics, etc.) | catalog loaded | P0 |
  | 03 | Format selector — Arrow IPC | Selected with primary border; helper text shown | click Arrow IPC | P0 |
  | 04 | Format selector — Parquet | Parquet selected | click Parquet | P1 |
  | 05 | Format selector — CSV | CSV selected | click CSV | P1 |
  | 06 | Format selector — JSON | JSON selected | click JSON | P1 |
  | 07 | Plant scope checkbox | "Scope to [plant name]" checkbox; unchecked = all plants | plant selected | P1 |
  | 08 | Columns metadata | Column names listed below table selector | table selected | P0 |
  | 09 | Export URL displayed | Full URL in monospace code block | any config | P0 |
  | 10 | curl snippet | Pre-block with curl command; "Copy" button | any config | P0 |
  | 11 | Python snippet | Pre-block with Python snippet; "Copy" button | any config | P0 |
  | 12 | Copy feedback | "Copied" flashes for 1.5s on copy buttons | click Copy | P1 |
  | 13 | Download in progress | Button shows spinner | click Download | P1 |
  | 14 | Download error | Red error card with `AlertCircle` icon | export fails | P1 |
  | 15 | Rate limit display | "Rate limit: N/hour" text next to Download | catalog loaded | P1 |

---

### M4. Cluster Status (Enterprise — extension route)
- **Route**: Registered via extension registry (enterprise commercial package)
- **Seed needs**: Multi-node cluster with at least 2 nodes in different roles
- **Tier**: Enterprise, admin
- **States**:
  | # | State | Shows | Interaction | Priority |
  |---|-------|-------|-------------|----------|
  | 01 | Single-node | Node table with 1 row; roles (api, spc, ingestion) | single-node install | P1 |
  | 02 | Multi-node cluster | Table with N rows; each row: node ID, roles, last-heartbeat, leader indicator | cluster active | P1 |
  | 03 | Leader election badge | "Leader" badge on the node holding the distributed lock | cluster | P1 |

---

## N. Multi-Plant + RBAC

### N1. Upgrade Page (Tier Gate)
- **Route**: Shown in-place when `<RequiresTier>` fails (not a separate route)
- **States**:
  | # | State | Shows | Interaction | Priority |
  |---|-------|-------|-------------|----------|
  | 01 | Upgrade prompt | Feature name, required tier, "Upgrade" CTA linking to website pricing | Community user hits Pro feature | P0 |
- **File**: `/apps/cassini/frontend/src/pages/UpgradePage.tsx`

---

### N2. Compare Plants View (Pro+)
- **Route**: `/compare-plants`
- **Seed needs**: 2+ plants with shared characteristic names; data in both
- **Tier**: Pro+, supervisor
- **States**:
  | # | State | Shows | Interaction | Priority |
  |---|-------|-------|-------------|----------|
  | 01 | Plant selector | Multi-select for which plants to compare | navigate | P0 |
  | 02 | Comparison table populated | Side-by-side Cpk, violation rates per characteristic across plants | plants selected | P1 |
  | 03 | Heatmap view | Color-coded capability grid across plants × characteristics | chart view toggle | P1 |

---

### N3. User Management (Admin)
- **Route**: `/admin/users`
- **Seed needs**: 3+ users in different states (active, deactivated); multiple plants for role assignment
- **Tier**: All, admin role
- **States**:
  | # | State | Shows | Interaction | Priority |
  |---|-------|-------|-------------|----------|
  | 01 | User list | UserTable: rows with username, email, active badge, plant roles; search bar | navigate | P0 |
  | 02 | Create user dialog | UserFormDialog: username, email, password, plant-role assignments | click "Create User" | P0 |
  | 03 | Edit user dialog | Pre-filled form; can change roles | click edit on row | P1 |
  | 04 | Deactivate confirm | "Are you sure? User will lose access" | click deactivate | P1 |
  | 05 | Deactivated user row | Greyed out; inactive badge | user deactivated | P1 |
  | 06 | Hard delete confirm | Separate "Permanently Delete" dialog | click permanent delete | P2 |
  | 07 | Role-restricted view (operator) | `/admin/users` redirects to 403 or is not visible in sidebar | login as operator | P1 |
- **File**: `/apps/cassini/frontend/src/pages/UserManagementPage.tsx`

---

## O. Developer / Integrator

### O1. Dev Tools Page
- **Route**: `/dev-tools` (sandbox mode only, admin role)
- **Seed needs**: `CASSINI_DEV_TIER=enterprise` + sandbox flag enabled via devtools API
- **Tier**: All (but sandbox mode required; visible in sidebar only when `devToolsStatus?.sandbox` is true)
- **States**:
  | # | State | Shows | Interaction | Priority |
  |---|-------|-------|-------------|----------|
  | 01 | Dev tools visible | Wrench icon appears in sidebar nav (with warning color) | sandbox active | P1 |
  | 02 | Dev tools page | Seed data generators, database reset, feature flag overrides | navigate | P1 |

---

### O2. Guide Page (Unauthenticated)
- **Route**: `/guide/:seedKey`
- **Seed needs**: None — accessible without login for evaluation
- **Tier**: All (no auth required)
- **States**:
  | # | State | Shows | Interaction | Priority |
  |---|-------|-------|-------------|----------|
  | 01 | Guide content | Markdown companion guide for a seed scenario | navigate with valid seedKey | P2 |
  | 02 | Invalid key | 404 or "Guide not found" | invalid seedKey | P2 |

---

### O3. Idle Timeout Banner
- **Location**: Global overlay (rendered inside `AuthenticatedProviders` → `IdleTimeoutBanner`)
- **Seed needs**: Session with idle_timeout configured; user goes idle
- **States**:
  | # | State | Shows | Interaction | Priority |
  |---|-------|-------|-------------|----------|
  | 01 | Warning banner | "You will be logged out in N seconds" countdown | near idle timeout | P1 |
  | 02 | Session expired | Redirect to `/login` with "Session expired" message | timeout elapsed | P1 |

---

## Cross-Cutting Known Quirks (apply to many features)

- **Sidebar characteristics panel**: `characteristicsPanelOpen` in Zustand UIStore. Defaults open. Screenshots of dashboard pages should show this panel open with a populated characteristic tree. The nav section above it (`navSectionCollapsed`) can be collapsed to give characteristics more space — both states worth capturing.
- **Sidebar collapse**: Desktop sidebar is drag-to-resize. Collapsed state is 56px icons-only. Most screenshots should be in expanded state.
- **Mobile sidebar**: Hidden by default on md+ screens; slide-out drawer with backdrop on mobile. Worth P2 screenshots.
- **ECharts canvas lifecycle**: Never conditionally unmount the chart container. Loading skeleton uses `visibility: hidden`. Any screenshot test must wait for ECharts `'finished'` event before capturing.
- **Monaco editor first load**: CEP Rules editor and any YAML/JSON editor powered by Monaco has ~1.5s worker init on first activation. Playwright should wait for `editor.getModel()` to be non-null before screenshots.
- **WebSocket connected vs. polling**: When WebSocket is connected, React Query polling is disabled (`refetchInterval: false`). Screenshots in test environments typically don't have WS; expect polling-mode behavior.
- **Toast notifications**: Use Sonner `<Toaster>` positioned `top-right`. For success/error state screenshots, toast must be triggered first and then captured before it auto-dismisses (3s default).
- **Retro vs. Glass visual style**: Retro (default) has sharp corners, monospace accents. Glass has rounded frosted cards. Both are worth a P1 screenshot of the dashboard to show the style is working.
- **Data UI attributes**: Most meaningful containers have `data-ui` attributes (e.g., `data-ui="dashboard-page"`, `data-ui="msa-page"`, `data-ui="cep-rules-list"`) — these are stable Playwright selectors.

---

## Essential Files for Implementation Reference

Key source files for building the Playwright skill and seed data:

- `/apps/cassini/frontend/src/App.tsx` — complete route map with tier and role guards
- `/apps/cassini/frontend/src/components/Sidebar.tsx` — navigation structure, role/tier filtering, all nav item paths
- `/apps/cassini/frontend/src/pages/OperatorDashboard.tsx` — dashboard state machine, all chart modes, bottom drawer, modals
- `/apps/cassini/frontend/src/pages/ViolationsView.tsx` — violation filters, ack flow, bulk ack, context modal
- `/apps/cassini/frontend/src/pages/MSAPage.tsx` — MSA list page structure
- `/apps/cassini/frontend/src/components/msa/MSAStudyEditor.tsx` — study editor tabs (overview/data/results), all study type branches
- `/apps/cassini/frontend/src/pages/FAIPage.tsx` — FAI list
- `/apps/cassini/frontend/src/components/fai/FAIReportEditor.tsx` — FAI form tabs, status workflow, signature integration
- `/apps/cassini/frontend/src/pages/DOEPage.tsx` — DOE list
- `/apps/cassini/frontend/src/pages/ReportsView.tsx` — template system, batch export, study/line/plant scope modes
- `/apps/cassini/frontend/src/pages/CepRulesPage.tsx` — CEP two-pane editor
- `/apps/cassini/frontend/src/pages/SopRagPage.tsx` — RAG three-pane layout, answer/refusal views, budget card
- `/apps/cassini/frontend/src/pages/LakehousePage.tsx` — format selector, code snippets, download
- `/apps/cassini/frontend/src/pages/KioskView.tsx` — kiosk rotation, status indicator, keyboard nav
- `/apps/cassini/frontend/src/pages/WallDashboard.tsx` — grid configs, preset system
- `/apps/cassini/frontend/src/pages/GalaxyPage.tsx` — Three.js scene, zoom levels, sidebar/breadcrumb
- `/apps/cassini/frontend/src/pages/AnalyticsPage.tsx` — tab structure for correlation/multivariate/predictions/ai
- `/apps/cassini/frontend/src/components/analytics/CorrelationTab.tsx` — 5 sub-tabs
- `/apps/cassini/frontend/src/components/analytics/MultivariateTab.tsx` — group management, T² chart, Phase I/II, decomposition
- `/apps/cassini/frontend/src/components/analytics/PredictionsTab.tsx` — prediction dashboard, forecast overlay
- `/apps/cassini/frontend/src/pages/SettingsView.tsx` — settings sidebar groups with role/tier gating
- `/apps/cassini/frontend/src/pages/DataEntryView.tsx` — manual entry, collection plans, sample history, import wizard
- `/apps/cassini/frontend/src/pages/ConnectivityPage.tsx` — connectivity sidebar tabs
- `/apps/cassini/frontend/src/pages/UserManagementPage.tsx` — user CRUD, role assignment
- `/apps/cassini/frontend/src/components/signatures/SignatureSettingsPage.tsx` — workflow config
- `/apps/cassini/frontend/src/components/signatures/SignatureDialog.tsx` — in-context signing modal
- `/apps/cassini/frontend/src/pages/LoginPage.tsx` — Three.js background, OIDC SSO buttons
- `/apps/cassini/frontend/src/components/LicenseSettings.tsx` — tier display, upload, activation
