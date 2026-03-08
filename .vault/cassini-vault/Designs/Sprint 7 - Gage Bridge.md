---
type: design
status: complete
created: 2026-02-23
updated: 2026-03-06
sprint: "[[Sprints/Sprint 7 - Shop Floor Connectivity]]"
tags:
  - design
  - complete
aliases:
  - Designs/Sprint 7 Gage Bridge
---

# Sprint 7: Gage Bridge

RS-232/USB gage integration via a Python bridge agent that reads serial ports and publishes measurements to MQTT.

**Architecture Decision**: [[Decisions/D-002 Python Bridge Agent]]

## Architecture

```
[Gage] --RS232/USB--> [cassini-bridge] --MQTT--> [Broker] --> [TagProvider] --> [SubgroupBuffer] --> [SPC Engine]
                       (shop floor PC)            (existing)   (existing)       (existing)          (existing)
```

The bridge is a serial-to-MQTT translator. Everything downstream (TagProvider, SubgroupBuffer, SPC Engine) is already built. Sprint 7 adds three components:

1. **`cassini-bridge`** -- Lightweight Python package for shop floor PCs
2. **Bridge management backend** -- Registration, config sync, health monitoring
3. **Gages tab in Connectivity Hub** -- Configure bridges + ports from the UI

## Component 1: cassini-bridge Package

Standalone pip-installable package in `bridge/` directory.

### Responsibilities

- **Serial reader**: pyserial, opens configured ports, reads lines
- **Parser profiles**: Mitutoyo Digimatic (format: `01A+00123.456\r\n`) + Generic (regex capture group)
- **MQTT publisher**: Publishes parsed float to `cassini/gage/{bridge_id}/{port}/value`
- **Heartbeat**: Bridge status to `cassini/gage/{bridge_id}/heartbeat` every 30s
- **Config sync**: Pulls port configs from Cassini API on startup
- **CLI**: `cassini-bridge run`, `cassini-bridge list-ports`, `cassini-bridge test-port COM3`

### Dependencies

pyserial>=3.5, paho-mqtt>=2.0, pyyaml>=6.0, httpx>=0.27

## Component 2: Backend

### Migration 034 + 035

Two tables: `gage_bridge` (registration with API key hash, MQTT broker link, status/heartbeat) and `gage_port` (serial config per port -- baud, parity, stop bits, parser profile, MQTT topic, characteristic link).

### Auto-Mapping Logic

When `gage_port.characteristic_id` is set:
1. Auto-create `MQTTDataSource` on the characteristic (broker_id, topic, trigger_strategy="on_change")
2. When port is deleted or characteristic cleared -> remove auto-created DataSource
3. Error if characteristic already has a different DataSource type

### Bridge Authentication

Bridges authenticate via API key (not JWT). Key generated on registration, shown once, stored as SHA-256 hash. Two endpoints use bridge auth: heartbeat and config pull.

### API: 12 Endpoints

Bridge CRUD (5), heartbeat (1), config pull (1), port CRUD (3), parser profiles list (1), `/my-config` (1).

## Component 3: Frontend -- Gages Tab

New 5th tab in Connectivity Hub (`/connectivity/gages`):

- **GageBridgeList.tsx** -- Table of registered bridges with status badges
- **GageBridgeRegisterDialog.tsx** -- Registration wizard (shows API key once, copy-to-clipboard)
- **GagePortConfig.tsx** -- Port configuration with serial settings form, characteristic picker
- **GageProfileSelector.tsx** -- Protocol profile picker (Mitutoyo pre-configured, Generic with regex/CSV)

Serial protocol added to `frontend/src/lib/protocols.ts` registry.

## Data Flow (End to End)

1. Admin installs `pip install cassini-bridge` on shop floor PC
2. Admin registers bridge in Connectivity Hub -> gets API key
3. Admin configures gage port (COM3, 9600, Mitutoyo) -> assigns to characteristic
4. Backend auto-creates MQTTDataSource with topic `cassini/gage/bridge-1/COM3/value`
5. Bridge starts: `cassini-bridge run --server https://cassini.local --api-key abc123`
6. Bridge pulls config, opens COM3, reads and parses serial data
7. Bridge publishes float to MQTT topic
8. Existing TagProvider -> SubgroupBuffer -> SPC Engine pipeline handles the rest
9. Bridge heartbeats every 30s -> status badge updates

## Out of Scope

USB HID, WebSerial fallback, bridge auto-discovery, bidirectional gage commands, calibration management.

## Skeptic Findings (Fixed)

- 3 BLOCKERs: Config URL mismatch, JSON keys mismatch, dual-mapping on simultaneous char+port update
- 5 WARNINGs: Broker credential fallback, parity mismatch, stop_bits float keys, unique constraint, serial timeout
