# Sprint 7: RS-232/USB Gage Integration — Design Document

**Created:** 2026-02-23
**Sprint:** 7 (Phase C — Shop Floor Connectivity)
**Feature:** C1: RS-232/USB Gage Integration
**Architecture Decision:** D-002 → Python Bridge Agent (decided 2026-02-23)

---

## Architecture

```
[Gage] --RS232/USB--> [openspc-bridge] --MQTT--> [Broker] ---> [TagProvider] --> [SubgroupBuffer] --> [SPC Engine]
                       (shop floor PC)            (existing)    (existing)        (existing)           (existing)
```

The bridge is a **serial-to-MQTT translator**. Everything downstream (TagProvider, SubgroupBuffer, SPC Engine) is already built. Sprint 7 adds three components:

1. **`openspc-bridge`** — lightweight Python package for shop floor PCs
2. **Bridge management backend** — registration, config sync, health monitoring
3. **Gages tab in Connectivity Hub** — configure bridges + ports from the UI

---

## Component 1: `openspc-bridge` Package

Standalone pip-installable package in `bridge/` directory at project root.

### Responsibilities
- **Serial reader**: pyserial, opens configured ports, reads lines
- **Parser profiles**: Mitutoyo Digimatic + Generic (regex capture group)
- **MQTT publisher**: Publishes parsed float to auto-assigned topic `openspc/gage/{bridge_id}/{port}/value`
- **Heartbeat**: Publishes bridge status to `openspc/gage/{bridge_id}/heartbeat` every 30s
- **Config sync**: Pulls port configs from OpenSPC API on startup
- **CLI**: `openspc-bridge run`, `openspc-bridge list-ports`, `openspc-bridge test-port COM3`

### Parser Profiles

**Mitutoyo Digimatic SPC Output:**
- Format: `01A+00123.456\r\n` (2-byte header + sign + value)
- Baud: 9600, 8 data bits, No parity, 1 stop bit (8N1)
- Encoding: ASCII

**Generic Line-Based:**
- User-defined regex with named capture group `(?P<value>...)`
- OR CSV column index
- Configurable baud, parity, stop bits, terminator

### Dependencies
- `pyserial>=3.5` — serial port communication
- `paho-mqtt>=2.0` — MQTT publishing (lightweight, synchronous)
- `pyyaml>=6.0` — local config fallback
- `httpx>=0.27` — config pull from OpenSPC API

### CLI Interface
```bash
# List available serial ports
openspc-bridge list-ports

# Test a specific port (reads 5 values, prints parsed output)
openspc-bridge test-port COM3 --baud 9600 --profile mitutoyo

# Run the bridge (pulls config from server)
openspc-bridge run --server https://openspc.local --api-key <key>

# Run with local config file (offline mode)
openspc-bridge run --config bridge-config.yaml
```

---

## Component 2: Backend — Models + API

### Migration 034

**Table: `gage_bridge`**
| Column | Type | Notes |
|--------|------|-------|
| id | Integer PK | Auto-increment |
| plant_id | FK → plant.id | CASCADE |
| name | String(255) | Display name |
| api_key_hash | String(128) | SHA-256 of bridge API key |
| mqtt_broker_id | FK → mqtt_broker.id | Which broker the bridge publishes to |
| status | String(20) | "online", "offline", "error" |
| last_heartbeat_at | DateTime(tz) | Updated by heartbeat endpoint |
| registered_by | FK → user.id | Who registered |
| created_at | DateTime(tz) | Auto |

**Table: `gage_port`**
| Column | Type | Notes |
|--------|------|-------|
| id | Integer PK | Auto-increment |
| bridge_id | FK → gage_bridge.id | CASCADE |
| port_name | String(50) | "COM3", "/dev/ttyUSB0" |
| baud_rate | Integer | Default 9600 |
| data_bits | Integer | Default 8 |
| parity | String(10) | "none", "even", "odd" |
| stop_bits | Float | 1, 1.5, or 2 |
| protocol_profile | String(50) | "mitutoyo_digimatic", "generic" |
| parse_pattern | String(500) | Regex for generic profile (nullable) |
| mqtt_topic | String(500) | Auto-generated: openspc/gage/{bridge_id}/{port}/value |
| characteristic_id | FK → characteristic.id | SET NULL, nullable |
| is_active | Boolean | Default true |
| created_at | DateTime(tz) | Auto |

### API Endpoints (`/api/v1/gage-bridges`)

| Method | Path | Description | Role |
|--------|------|-------------|------|
| POST | `/` | Register new bridge (returns API key) | engineer+ |
| GET | `/` | List bridges for plant | supervisor+ |
| GET | `/{id}` | Get bridge details + ports | supervisor+ |
| PUT | `/{id}` | Update bridge settings | engineer+ |
| DELETE | `/{id}` | Delete bridge + ports | engineer+ |
| POST | `/{id}/heartbeat` | Bridge heartbeat (API key auth) | bridge |
| GET | `/{id}/config` | Pull port configs (API key auth) | bridge |
| POST | `/{id}/ports` | Add port configuration | engineer+ |
| PUT | `/{id}/ports/{port_id}` | Update port config | engineer+ |
| DELETE | `/{id}/ports/{port_id}` | Remove port | engineer+ |
| GET | `/profiles` | List available parser profiles | supervisor+ |

### Auto-Mapping Logic

When `gage_port.characteristic_id` is set (or updated):
1. Check if characteristic already has a DataSource → error if different type
2. Auto-create `MQTTDataSource` on the characteristic:
   - `broker_id` = bridge's `mqtt_broker_id`
   - `topic` = gage_port's `mqtt_topic`
   - `trigger_strategy` = "on_change"
   - `is_active` = True
3. When gage_port is deleted or characteristic_id cleared → remove the auto-created DataSource

### Bridge Authentication

Bridges authenticate via API key (not JWT). The API key is generated on registration and shown once. Bridge sends it as `Authorization: Bearer <key>` header.

Two endpoints use bridge auth instead of user JWT:
- `POST /{id}/heartbeat`
- `GET /{id}/config`

---

## Component 3: Frontend — Gages Tab

### Connectivity Hub Integration

New 5th tab in Connectivity Hub sidebar:
- **Icon**: `Usb` from lucide-react
- **Label**: "Gages"
- **Route**: `/connectivity/gages`

### Sub-Components

**GageBridgeList.tsx** — Table of registered bridges
- Columns: Name, Plant, MQTT Broker, Status badge (online/offline), Last Heartbeat, Port Count
- Actions: Register, Edit, Delete

**GageBridgeRegisterDialog.tsx** — Registration wizard
- Fields: Name, select plant, select MQTT broker
- On submit: shows generated API key (copy-to-clipboard, shown once)

**GagePortConfig.tsx** — Port configuration within a bridge
- Table: Port name, baud rate, protocol, target characteristic, active toggle
- Add/edit dialog with serial settings form
- Characteristic picker (dropdown of plant's characteristics)
- Preview panel: last 5 readings (via WebSocket/MQTT subscription)

**GageProfileSelector.tsx** — Protocol profile picker
- Mitutoyo Digimatic (pre-configured settings shown)
- Generic (shows regex/CSV config fields)

### Protocol Registry Update

Add to `frontend/src/lib/protocols.ts`:
```typescript
serial: {
  id: "serial",
  label: "Serial Gage",
  icon: Usb,
  color: "amber",
  textColor: "text-amber-400",
  bgColor: "bg-amber-500/10",
  borderColor: "border-amber-500/30",
  description: "RS-232/USB serial gage via bridge agent",
}
```

---

## Data Flow (End to End)

1. Admin installs `pip install openspc-bridge` on shop floor PC
2. Admin registers bridge in Connectivity Hub → gets API key
3. Admin configures gage port (COM3, 9600, Mitutoyo) → assigns to characteristic
4. Backend auto-creates MQTTDataSource: topic `openspc/gage/bridge-1/COM3/value` → characteristic
5. Bridge starts: `openspc-bridge run --server https://openspc.local --api-key abc123`
6. Bridge pulls config from API, opens COM3, starts reading
7. Bridge parses `01A+00123.456\r\n` → publishes `123.456` to MQTT topic
8. TagProvider receives → SubgroupBuffer → SPC Engine → Sample/Measurement (existing)
9. Bridge heartbeats every 30s → OpenSPC updates status badge

---

## Out of Scope (YAGNI)

- USB HID support (serial covers 95% of shop floor gages)
- WebSerial browser fallback
- Bridge auto-discovery (manual registration only)
- Bidirectional gage commands (read-only)
- Gage calibration management
- Bridge-to-bridge communication
