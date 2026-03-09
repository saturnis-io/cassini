---
type: lesson
status: active
created: 2026-03-06
updated: 2026-03-08
severity: critical
source: multi
tags: [lesson, active]
---

# Lessons Learned

Patterns and rules to prevent recurring mistakes. Review at session start.

> **Source**: `tasks/lessons.md` (authoritative). This vault note mirrors the lessons file for cross-referencing within Obsidian.

---

## L-001: Always Use Semantic Theme Tokens for Frontend Colors (2026-03-03)

**Mistake**: Used hardcoded Tailwind palette colors (`bg-emerald-100`, `text-amber-800`, `dark:bg-red-900/30`) and hardcoded HSL values (`hsl(248 33% 59%)`) instead of the Cassini theme system's CSS variables.

**Why it matters**: Hardcoded colors don't adapt to light/dark mode, don't respect the Cassini brand palette, and create visual inconsistency. This mistake has happened multiple times.

**Rule**: On EVERY frontend change, verify all colors use semantic tokens:

| Need | Use | Never Use |
|------|-----|-----------|
| Success (green) | `text-success`, `bg-success/10` | `text-emerald-*`, `bg-green-*` |
| Warning (orange) | `text-warning`, `bg-warning/10` | `text-amber-*`, `bg-yellow-*` |
| Danger (red) | `text-destructive`, `bg-destructive/10` | `text-red-*`, `bg-rose-*` |
| Primary (gold) | `text-primary`, `bg-primary/10` | hardcoded gold HSL |
| Chart purple | `text-chart-tertiary`, `bg-chart-tertiary/10` | `text-purple-*`, `hsl(248 33% 59%)` |
| Chart orange | `text-chart-quaternary` | hardcoded orange HSL |
| Neutral text | `text-foreground`, `text-muted-foreground` | `text-gray-*`, `text-slate-*` |
| Borders | `border-border`, `border-foreground/10` | `border-gray-*` |
| Backgrounds | `bg-card`, `bg-muted`, `bg-foreground/[0.03]` | `bg-gray-*`, `bg-slate-*` |

**Checklist before completing any frontend task**:
1. `grep -E "text-(emerald|amber|red|green|purple|slate|gray)-" <changed files>` -- should return nothing new
2. `grep -E "bg-(emerald|amber|red|green|purple|slate|gray)-" <changed files>` -- should return nothing new
3. `grep -E "hsl\(" <changed files>` -- no hardcoded HSL in JSX/TSX (CSS vars in index.css are fine)
4. Verify colors work in both light and dark mode

**Exception**: Some existing components (pre-dating this rule) use hardcoded colors. Don't fix those in unrelated PRs -- but never add new ones.

**Relates to**: [[Architecture/System Overview]], [[Features/Theming]]

---

## L-002: Run the Pre-Completion Checklist -- Every Time (2026-03-03)

**Mistake**: Claimed work was done without deploying adversarial subagent, without checking audit trail requirements, and initially without running backend tests. User had to remind 4 times about CLAUDE.md compliance.

**Why it matters**: The CLAUDE.md checklist exists to catch bugs that the implementer is blind to. Skipping it turns user review into QA -- exactly what the checklist prevents. The adversarial subagent found 3 BLOCKERs (field name wrong, subgroup mean wrong, batch endpoint inconsistency) that would have been production crashes.

**Rule**: After finishing implementation but BEFORE claiming done:
1. Re-read the MANDATORY PRE-COMPLETION CHECKLIST at the top of `~/.claude/CLAUDE.md`
2. Execute every item -- no "this doesn't apply" rationalization
3. Spawn adversarial subagent for ANY multi-file change
4. Cross-check project CLAUDE.md cross-cutting requirements (audit, signatures, API contracts)
5. Run both `pytest` and `tsc --noEmit`

**Pattern to watch for**: The urge to say "Phase 1 done, Phase 2 done, Phase 3 done, all verified!" without actually running the checklist. Completion feels productive but unchecked completion ships bugs.

**Relates to**: [[Audits/Skeptic Review Report]]

---

## L-003: Sample Model Has No mean/range_value Columns (2026-03-03)

**Mistake**: Wrote trial limit computation accessing `sample.mean` and `sample.range_value` -- attributes that don't exist on the `Sample` SQLAlchemy model. Mean and range are computed on-the-fly from `sample.measurements` using `calculate_mean_range()`.

**Why it matters**: SQLAlchemy silently returns `None` for non-existent attributes accessed this way, so the filter `s.mean is not None` silently filtered out ALL samples. The trial computation never fired, falling through to the stored-value path. No error, just wrong behavior.

**Rule**: When working with Sample data:
- `Sample` has NO `mean`, `range_value`, or `std_dev` columns
- Mean/range are computed from `sample.measurements` (a relationship to the `Measurement` table)
- Use `calculate_mean_range([m.value for m in sample.measurements])` from `cassini.utils.statistics`
- The `measurements` relationship requires `selectinload(Sample.measurements)` in async context -- both `get_rolling_window` and `get_by_characteristic` already do this

**Relates to**: [[Architecture/System Overview]], [[Features/SPC Engine]]

---

## L-004: ECharts markLine yAxis Values Are Ignored -- Use Line Series Instead (2026-03-03)

**Mistake**: Used ECharts `markLine` with `yAxis` values to draw horizontal control limit lines (UCL, LCL, CL). The lines rendered at the series mean instead of the specified y-coordinate.

**Why it matters**: Control limit lines at wrong positions make charts useless. The bug is silent -- no errors, just wrong rendering. `markArea` with the same `yAxis` values renders correctly, making the bug even more confusing to diagnose.

**Rule**: NEVER use `markLine` with `yAxis` for horizontal reference lines in ECharts. Instead:
- Create constant-value line series: `{ type: 'line', data: data.map(() => value), symbol: 'none', silent: true }`
- Use `endLabel` for the label (replaces `markLine` label `position: 'end'`)
- Set `z: 4` so limit lines render below data points (`z: 5` for main series)
- Increase grid `right` margin to `120` to give endLabels room (default `60` clips them)

**Applies to**: `ControlChart.tsx` (primary chart) AND `RangeChart.tsx` (secondary chart) -- both had the same bug.

**Relates to**: [[Features/Charts]]

---

## L-005: Always Use formatSampleRef / useSampleLabel for Sample References (2026-03-04)

**Mistake**: Displayed raw `Sample #315` in the AI insights popover instead of the user's configured display key format (e.g., `260304-042`). The display key formatting system was already in place but wasn't used for anomaly event sample references.

**Why it matters**: The display key format is a user-configurable localization setting (date pattern, separator, number placement). Showing raw database IDs bypasses this setting and creates inconsistency between the chart labels, tooltips, and AI insights.

**Rule**: NEVER display a raw `sample_id` number to users. Always use one of:
- `formatSampleRef(sampleId, canonicalDisplayKey?)` -- pure function in `lib/display-key.ts`. Use when you have the canonical key available.
- `useSampleLabel(characteristicId)` -- React hook in `hooks/useSampleLabel.ts`. Returns a `(sampleId) => string` function that looks up the display key from React Query chart data cache.

**Pattern**: Any place that shows sample identifiers to users (tooltips, popovers, event lists, modals) must go through these centralized functions.

**Relates to**: [[Features/AI Anomaly Detection]], [[Features/Charts]]

---

## L-006: SQLite cast(timestamp, Date) Is a No-Op -- Use Range Comparison (2026-03-05)

**Mistake**: Changed `func.date(Sample.timestamp) == day_date` to `cast(Sample.timestamp, Date) == day_date` in `display_keys.py` for "MSSQL portability". On SQLite, `CAST(timestamp AS DATE)` returns the raw datetime string unchanged (e.g., `'2026-02-12 14:30:00'`), so `== '2026-02-12'` always fails. The query returned 0 rows and all sample ranks defaulted to 1, producing duplicate display keys (`YYMMDD-001` for every sample).

**Why it matters**: This is a silent data-display regression -- no errors, no crashes. Every chart shows all samples as `#0001` for their day. The original code's docstring even warned about this exact bug, but the warning was overwritten.

**Rule**: For dialect-portable date comparisons on timestamp columns:
- NEVER use `cast(column, Date)` -- no-op on SQLite
- NEVER use `func.date()` -- unavailable on MSSQL
- ALWAYS use range comparison: `timestamp >= day_start AND timestamp < day_end`
- This works on all four supported dialects (SQLite, PostgreSQL, MySQL, MSSQL)

**Relates to**: [[Features/Multi-Database]], [[Architecture/System Overview]]

---

## L-007: Never Compute Capability Indices Client-Side (2026-03-06)

**Mistake**: Dashboard computed Cpk client-side using subgroup means (from chart data points) divided by `stored_sigma` (R-bar/d2 within-subgroup sigma for individual measurements). These are fundamentally mismatched scales, producing values like -1195.26 instead of the correct 1.7555.

**Why it matters**: In a regulated SPC system, every displayed statistical value must be traceable to a single computation path. Client-side duplication of backend calculations introduces drift.

**Rule**: Statistical indices (Cpk, Ppk, Cp, Pp, Cpm) must ALWAYS come from the backend capability endpoint:
- Dashboard uses `useCapability(charId)` hook
- `<Explainable>` wrappers for capability metrics must NOT pass `chartOptions`
- The explain API "with chart options" path is ONLY for values computed from the chart view (subgroup means)

**Relates to**: [[Features/SPC Engine]], [[Features/Show Your Work]]

---

## L-008: External Y-Axis Domain Can Override Chart-Local Domain Logic (2026-03-06)

**Mistake**: Fixed spec limit toggle in ControlChart's own Z-scale domain branch, but the chart still didn't respond because `ChartPanel` passes an `externalDomain` computed by `calculateSharedYAxisDomain()` in `chart-domain.ts`. That function had the same bug.

**Why it matters**: When debugging rendering issues, tracing only the component's internal logic misses the parent's domain override.

**Rule**: When fixing Y-axis domain bugs:
- Check `chart-domain.ts` (`calculateSharedYAxisDomain`) -- used by ChartPanel and DualChartPanel
- Check `ControlChart.tsx` internal domain -- used when no external domain
- Both must have identical logic for spec limits, control limits, and Z-scale handling

**Relates to**: [[Features/Charts]], [[Features/Short-Run Charts]]

---

## L-009: Don't Re-Present Resolved Decisions as Open Questions (2026-03-07)

**Mistake**: Presented subagent audit findings that contradicted an earlier in-conversation decision as if they were new ambiguity.

**Rule**: When presenting subagent findings, cross-check against decisions already made in the conversation. If a finding covers already-decided ground, state "we already decided X" rather than re-opening the question.

**Relates to**: [[Audits/Skeptic Review Report]]

---

## L-010: MaterialResolver Must Be Applied in ALL SPC-Consuming Paths (2026-03-08)

**Mistake**: Material-specific limit overrides (USL, LSL, target, sigma, control limits) were only applied in the Shewhart chart data path. CUSUM, EWMA, attribute chart data, capability calculations, explain API, and data entry endpoints all used characteristic defaults, ignoring material overrides. The rolling window also mixed samples from different materials, causing phantom Nelson Rule violations.

**Why it matters**: A customer using different materials on the same characteristic (e.g., Aluminum vs Steel on a bore diameter) would see correct limits on the Shewhart chart but wrong limits on CUSUM/EWMA charts, wrong Cpk values, wrong explanations, and cross-material contamination in Nelson Rule evaluation.

**Rule**: When adding a new SPC-consuming path (new chart type, new calculation, new endpoint):
1. Accept `material_id` as a parameter
2. Run `MaterialResolver(session).resolve_flat(char_id, material_id)` to get effective values
3. Use resolved values (`usl`, `lsl`, `target_value`, `stored_sigma`, `stored_center_line`, `ucl`, `lcl`) instead of characteristic defaults
4. Pass `material_id` to `get_rolling_window_data()`, `get_rolling_window()`, and rolling window manager
5. The resolution cascade is: material override > deepest class > parent class > root class > characteristic default

**Adversarial review found 6 BLOCKERs** in a single pass -- this pattern is easy to miss because each path works correctly with the default (null) material.

**Relates to**: [[Features/SPC Engine]], [[Features/Capability]]
