# Gap Closure — Architecture Decision Records

> Numbered decisions that persist across sessions. Once decided, these are immutable
> (append new decisions to supersede old ones, don't edit).

---

## Index

| # | Date | Title | Status |
|---|------|-------|--------|
| D-001 | 2026-02-21 | Gap closure scope and phasing | **DECIDED** |
| D-002 | 2026-02-23 | RS-232 gage architecture | **DECIDED** — Python bridge agent |

---

## D-001: Gap Closure Scope and Phasing

**Date:** 2026-02-21
**Status:** DECIDED
**Context:** Competitive analysis identified 20+ feature gaps vs commercial SPC tools. Need to prioritize.

**Decision:**
15 features selected across 5 sprints:
- Sprint 5 (Phase A): Non-normal capability, custom run rules, Laney p'/u' — all three
- Sprint 6 (Phase B): Gage R&R/MSA, short-run charts, FAI — all three
- Sprint 7 (Phase C): RS-232/USB gage integration — only (skip OPC-DA, CMM, barcode)
- Sprint 8 (Phase D): ERP connectors, LIMS/MES middleware, native mobile apps — all three
- Sprint 9 (Phase E): Multivariate SPC, predictive analytics, gen AI analysis, inter-char correlation, DOE — all five

**Excluded:** OPC-DA, CMM integration, barcode entry, semiconductor (SECS/GEM), validation docs (separate sales effort), GAMP 5 mapping.

**Consequences:**
- This is a multi-week/multi-session effort
- Sprint 7 and Sprint 8 (D3) require architecture decisions before implementation
- Sprint order is deliberate: statistical credibility first (internal quality), then compliance gates (market access), then connectivity/integration (enterprise deals), then advanced analytics (leadership position)

---

## D-002: RS-232 Gage Architecture

**Date:** 2026-02-23
**Status:** DECIDED
**Context:** RS-232/USB gage integration requires deciding how browser-based app talks to serial ports.

**Options:**
1. **Browser WebSerial API** — Chrome/Edge only, no Firefox/Safari, requires HTTPS + user gesture. Zero install.
2. **Python gage bridge agent** — Lightweight local service reads serial, pushes data via MQTT or REST to OpenSPC. Works with any browser. Reuses existing MQTT infrastructure.
3. **Electron/Tauri wrapper** — Desktop app wrapper with native serial access. Changes deployment model.

**Decision:** Option 2 — Python gage bridge agent (`openspc-bridge` package).

**Rationale:**
- Works with ALL browsers (Chrome, Firefox, Safari, Edge)
- Reuses existing MQTT/TagProvider/SubgroupBuffer/SPC engine pipeline — zero new data ingestion code
- Shop floor teams familiar with local agent pattern (similar to OPC-UA collectors, data historians)
- Can run headless on industrial PCs (no browser needed)
- Supports legacy serial AND USB gages via pyserial
- Bridge publishes to MQTT topics; OpenSPC just sees MQTT messages (clean separation)

**Consequences:**
- Extra deployment component on shop floor PCs (`pip install openspc-bridge`)
- Requires Python 3.10+ on shop floor PC
- Bridge needs network access to MQTT broker + OpenSPC API (config pull)
- New DB tables: `gage_bridge` (registration) + `gage_port` (serial config)
- Auto-mapping: gage_port → MQTTDataSource on characteristic (leverages existing pipeline)

---

## D-003: (Reserved for Mobile Architecture)

**Date:** TBD
**Status:** PENDING
**Context:** Native mobile experience — need to decide approach.

**Options:**
1. **PWA (Progressive Web App)** — Add manifest + service worker to existing React app. Offline via IndexedDB. No app store.
2. **React Native** — Separate codebase, native performance, app store distribution. High effort.
3. **Responsive-only** — Current Tailwind responsive design is already mobile-friendly. Just polish breakpoints. Lowest effort.

**Decision:** TBD
**Consequences:** TBD
