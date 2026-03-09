---
type: sprint
status: complete
created: 2026-03-06
updated: 2026-03-06
branch: main
started: 2026-02-23
completed: 2026-02-23
features:
  - "[[Features/Gage Bridge Integration]]"
decisions:
  - "[[Decisions/D-002 Python Bridge Agent]]"
migration_range: 034-035
tags:
  - sprint
  - complete
  - phase-c
  - shop-floor
  - serial
  - gage
aliases:
  - Sprint 7
---

## Overview

Sprint 7 delivered shop floor connectivity via RS-232/USB gage integration. Per [[Decisions/D-002 Python Bridge Agent]], the architecture uses a standalone Python bridge agent (`cassini-bridge` pip package) installed on shop floor PCs that translates serial gage protocols to MQTT for ingestion by the Cassini backend. The sprint added the bridge package, backend management APIs with API key authentication, and a Gages tab in the Connectivity Hub frontend.

## Features Delivered

- **C1 RS-232/USB Gage Integration** ([[Features/Gage Bridge Integration]])
  - **Bridge package** (`bridge/`):
    - pip-installable `cassini-bridge` (formerly `openspc-bridge`)
    - Parsers: Mitutoyo Digimatic SPC protocol + generic regex parser
    - `SerialReader` (pyserial) for RS-232/USB serial communication
    - `GageMQTTPublisher` (paho-mqtt) for MQTT translation
    - CLI commands: `list-ports`, `test-port`, `run`
    - Runner with heartbeat thread for health monitoring
  - **Backend**:
    - Migration 034: `gage_bridge` + `gage_port` tables
    - Migration 035: unique constraint on gage port
    - 12 API endpoints (CRUD, heartbeat, `/my-config`, ports, profiles)
    - API key authentication (SHA-256 hashed, shown once on registration)
    - Auto-mapping: gage port automatically creates/links MQTTDataSource
  - **Frontend**:
    - Serial protocol added to connectivity protocol registry
    - `gageBridgeApi` namespace (9 methods)
    - 7 React Query hooks for gage operations
    - 5 new components: GagesTab, GageBridgeList, GageBridgeRegisterDialog, GagePortConfig, GageProfileSelector
    - Gages tab integrated into Connectivity Hub

## Key Commits

| Hash | Description |
|------|-------------|
| `bb97fc6` | Sprint 7 start commit |
| `b77961b` | Sprint 7 final commit |
| (7 total) | 7 commits spanning bb97fc6..b77961b on main |

## Migration

**Migration 034** — New tables:
- `gage_bridge` — bridge agent registration, API key hash, last heartbeat, config
- `gage_port` — serial port configuration per bridge (baud, parity, stop bits, parser profile, mapped characteristic)

**Migration 035** — Schema fix:
- Added unique constraint on gage port (bridge_id + port_name)

## Codebase Impact

- **Backend models**: ~38 total — `db/models/gage.py` (GageBridge, GagePort)
- **Backend routers**: ~27 total (~215+ endpoints) — `api/v1/gage_bridges.py` (12 endpoints incl. `/my-config`)
- **Frontend**: ~180 files, ~135 components, 14 pages, ~107 React Query hooks
- **Frontend API**: 23 namespaces (gageBridgeApi with 9 methods added)
- **Bridge package**: `bridge/` — 7 Python modules, standalone pip-installable
- **Connectivity Hub**: 29 components total (24 existing + 5 new Gages tab)
- **Design docs**: `.planning/designs/2026-02-23-sprint7-gage-bridge.md`, `.planning/designs/2026-02-23-sprint7-implementation-plan.md`

## Skeptic Review

**3 BLOCKERs fixed:**
1. Config URL mismatch between bridge agent and backend endpoint
2. JSON keys mismatch between bridge serialization and backend deserialization
3. Dual-mapping race condition on simultaneous characteristic + port update

**5 WARNINGs fixed:**
1. Broker credential fallback not handled when bridge has no stored credentials
2. Parity enum mismatch between bridge and backend
3. `stop_bits` using float keys in lookup (1.5 stop bits)
4. Unique constraint missing on gage port (fixed in migration 035)
5. Serial timeout not configurable (hardcoded value)

## Lessons Learned

- API key auth pattern: hash with SHA-256, store only the hash, show the raw key exactly once at registration time -- no recovery possible
- Auto-mapping (gage port to MQTTDataSource) must be atomic to avoid dual-mapping race conditions
- Bridge agents need a heartbeat mechanism for health monitoring from the backend
- See [[Lessons/Lessons Learned]] for full cross-sprint patterns
