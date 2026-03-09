---
type: decision
status: active
id: D-002
created: 2026-02-23
updated: 2026-03-06
sprint: "[[Sprints/Sprint 7 - Shop Floor Connectivity]]"
alternatives_considered: 3
tags: [decision]
---

# D-002: RS-232 Gage Architecture

**Date:** 2026-02-23
**Status:** DECIDED

## Context

RS-232/USB gage integration requires deciding how a browser-based app talks to serial ports.

## Options Considered

| # | Option | Pros | Cons |
|---|--------|------|------|
| 1 | **Browser WebSerial API** | Zero install | Chrome/Edge only, no Firefox/Safari, requires HTTPS + user gesture |
| 2 | **Python gage bridge agent** | All browsers, reuses MQTT, headless | Extra deployment component, requires Python on shop floor PC |
| 3 | **Electron/Tauri wrapper** | Native serial access | Changes deployment model entirely |

## Decision

**Option 2** -- Python gage bridge agent (`cassini-bridge` package).

## Rationale

- Works with ALL browsers (Chrome, Firefox, Safari, Edge)
- Reuses existing MQTT/TagProvider/SubgroupBuffer/SPC engine pipeline -- zero new data ingestion code
- Shop floor teams familiar with local agent pattern (similar to OPC-UA collectors, data historians)
- Can run headless on industrial PCs (no browser needed)
- Supports legacy serial AND USB gages via pyserial
- Bridge publishes to MQTT topics; Cassini just sees MQTT messages (clean separation)

## Consequences

- Extra deployment component on shop floor PCs (`pip install cassini-bridge`)
- Requires Python 3.10+ on shop floor PC
- Bridge needs network access to MQTT broker + Cassini API (config pull)
- New DB tables: `gage_bridge` (registration) + `gage_port` (serial config)
- Auto-mapping: gage_port to MQTTDataSource on characteristic (leverages existing pipeline)

## Related

- [[Designs/Sprint 7 - Gage Bridge]] -- Full design and implementation details
- [[Sprints/Sprint 7 - Shop Floor Connectivity]] -- Sprint context
