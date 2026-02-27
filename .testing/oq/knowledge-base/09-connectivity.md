# Feature: Connectivity

## Category: CONN
## Config Reference: `{ prefix: "CONN", name: "Connectivity", kb: "09-connectivity.md" }`

---

## What It Does

The Connectivity Hub integrates Cassini with industrial data sources, automating measurement collection from the shop floor. It replaces manual data entry with real-time, automated data feeds from industrial equipment, reducing transcription errors and enabling higher sampling frequencies.

Four connectivity protocols are supported:

1. **MQTT** -- Message Queuing Telemetry Transport. The standard IoT/IIoT protocol for lightweight publish/subscribe messaging. Used for sensor networks, PLCs with MQTT gateways, and SparkplugB-compliant devices.
2. **OPC-UA** -- Open Platform Communications Unified Architecture. The industrial automation standard for structured, secure, and reliable data exchange. Used for PLCs, SCADA systems, CNCs, and industrial robots.
3. **RS-232/USB Serial Gages** -- Traditional measurement instruments (Mitutoyo calipers, micrometers, height gages, CMMs) that communicate via serial port. A bridge agent running on a shop floor PC reads serial data and publishes it to MQTT.
4. **ERP/LIMS/MES** -- Enterprise Resource Planning, Laboratory Information Management, and Manufacturing Execution systems. Bidirectional connectors sync part definitions, specifications, and SPC results between Cassini and enterprise systems.

From a compliance perspective:

- **21 CFR Part 11** (FDA) -- Automated data collection from calibrated instruments provides higher data integrity than manual transcription. The audit trail records the data source for every measurement.
- **IATF 16949** (Automotive) -- Automated SPC data collection is a control plan requirement for critical characteristics. Real-time data enables immediate reaction to out-of-control conditions.
- **AS9100** (Aerospace) -- Documented data collection procedures must specify the measurement system. Connectivity configurations serve as part of the measurement system documentation.

---

## Where To Find It

| Page / Feature              | URL                              | Min Role  | Description                                              |
|-----------------------------|----------------------------------|-----------|----------------------------------------------------------|
| Connectivity Hub            | `/connectivity`                  | Engineer  | Top-level page with sidebar navigation                   |
| Monitor tab                 | `/connectivity/monitor`          | Engineer  | Operational dashboard: metrics, data flow, server status |
| Servers tab                 | `/connectivity/servers`          | Engineer  | MQTT broker and OPC-UA server CRUD management            |
| Browse tab                  | `/connectivity/browse`           | Engineer  | Browse MQTT topics or OPC-UA node trees                  |
| Mapping tab                 | `/connectivity/mapping`          | Engineer  | Map data source tags/topics to characteristics           |
| Gages tab                   | `/connectivity/gages`            | Engineer  | RS-232/USB gage bridge registration and port config      |
| Integrations tab            | `/connectivity/integrations`     | Engineer  | ERP/LIMS/MES connector wizard and management             |

The Connectivity Hub uses a sidebar layout with grouped navigation:
- **Operations**: Monitor, Servers
- **Configuration**: Browse, Mapping
- **Instruments**: Gages
- **Integrations**: ERP/LIMS

---

## Key Concepts (Six Sigma Context)

### Why Automated Data Collection Matters

In Six Sigma, measurement system error is a component of observed variation. Manual data entry introduces transcription errors (writing down 10.03 when the gage reads 10.30), rounding bias, and sampling delays. Automated data collection:

- Eliminates transcription errors (data flows directly from instrument to database)
- Enables 100% inspection where manual sampling was economically infeasible
- Reduces reaction time from minutes/hours to seconds (real-time SPC)
- Provides exact timestamps for traceability
- Supports high-frequency sampling for short-run production

### MQTT Architecture

MQTT uses a publish/subscribe model with a central broker:

1. **Broker** -- Central message router (e.g., Mosquitto, HiveMQ, EMQX). Cassini connects as a client to one or more brokers.
2. **Topics** -- Hierarchical message addresses (e.g., `factory/line1/gage42/value`). Cassini subscribes to topics and maps incoming messages to characteristics.
3. **QoS Levels** -- 0 (at most once), 1 (at least once), 2 (exactly once). SPC data should use QoS 1 minimum.
4. **SparkplugB** -- An MQTT specification for industrial IoT that defines message format, birth/death certificates, and metric naming. Cassini supports SparkplugB natively.
5. **TLS** -- Encrypted connections for brokers that require it.

### OPC-UA Architecture

OPC-UA provides a client/server model with structured data:

1. **Endpoint** -- Server address in format `opc.tcp://host:port/path`
2. **Security Policy** -- None, Basic128Rsa15, Basic256, Basic256Sha256. Production environments should use Basic256Sha256.
3. **Security Mode** -- None, Sign, SignAndEncrypt. Production should use SignAndEncrypt.
4. **Nodes** -- Hierarchical data model. Each node has a NodeId, browse name, and value. The Browse tab lets users navigate the node tree.
5. **Subscriptions** -- OPC-UA subscriptions push value changes to Cassini at configurable intervals (publishing interval, sampling interval).

### Gage Bridge Architecture

The gage bridge solves the "last meter" problem -- getting data from traditional serial instruments into the digital system:

1. **Bridge Agent** (`cassini-bridge` pip package) -- A Python process running on a shop floor PC with serial ports connected to gages.
2. **Serial Communication** -- RS-232 or USB-to-serial. Configured with baud rate (typically 9600), data bits (8), parity (none), stop bits (1).
3. **Parser Profiles** -- Predefined parsers for specific gage protocols:
   - **Mitutoyo Digimatic** -- The SPC-II protocol used by Mitutoyo calipers, micrometers, and indicators
   - **Generic Regex** -- Custom regex pattern for other gage formats
4. **Data Flow** -- Bridge reads serial data, parses it, publishes to MQTT topic, Cassini subscribes and routes to the mapped characteristic.
5. **API Key Auth** -- Each bridge authenticates with a unique API key (SHA-256 hashed, shown once at registration). The key is used for the bridge-to-backend API calls (heartbeat, config retrieval).
6. **Heartbeat** -- Bridge sends periodic heartbeats so the backend knows which bridges are online.

### ERP/LIMS Integration

Enterprise connectors enable bidirectional data sync:

1. **Adapter Types**:
   - **SAP OData** -- Connects to SAP S/4HANA via OData REST API
   - **Oracle REST** -- Connects to Oracle ERP Cloud via REST endpoints
   - **Generic LIMS** -- Flexible connector for laboratory information management systems
   - **Webhook** -- HMAC-authenticated webhook for push-based integrations
2. **Sync Engine** -- Cron-based scheduler (using croniter) pulls data on a configured schedule
3. **Field Mapping** -- Maps external system fields to Cassini fields (part number, specification limits, measurement values)
4. **Outbound Publishing** -- Event bus subscriber pushes SPC results (violations, capability snapshots) to ERP systems
5. **Auth Config** -- Connector credentials are Fernet-encrypted at rest

---

## How To Configure (Step-by-Step)

### Adding an MQTT Broker

1. Log in as engineer or higher
2. Navigate to `/connectivity/servers`
3. Click the "Add Server" button
4. Select "MQTT" as the protocol
5. Fill in the form:
   - **Name**: Descriptive name (e.g., "Production Floor Broker")
   - **Host**: Broker hostname or IP (e.g., `192.168.1.100`)
   - **Port**: Broker port (default 1883, or 8883 for TLS)
   - **Username / Password**: If broker requires authentication (optional)
   - **Client ID**: Unique client identifier (default: `openspc-client`)
   - **Keepalive**: Connection keepalive in seconds (default: 60)
   - **Use TLS**: Toggle for encrypted connection
6. Optionally configure outbound publishing (MQTT Publishing):
   - **Outbound Enabled**: Toggle to push SPC data back to MQTT
   - **Topic Prefix**: Base topic for outbound messages (default: `openspc`)
   - **Format**: JSON or SparkplugB
   - **Rate Limit**: Maximum messages per second
7. Click "Save" -- the broker appears in the server list
8. Use the "Test Connection" button to verify connectivity (will show error if broker is unreachable)

### Adding an OPC-UA Server

1. Navigate to `/connectivity/servers`
2. Click "Add Server" and select "OPC-UA"
3. Fill in the form:
   - **Name**: Descriptive name (e.g., "CNC Line 1")
   - **Endpoint URL**: Full OPC-UA endpoint (e.g., `opc.tcp://192.168.1.50:4840`)
   - **Auth Mode**: Anonymous or Username/Password
   - **Security Policy**: None, Basic128Rsa15, Basic256, Basic256Sha256
   - **Security Mode**: None, Sign, SignAndEncrypt
   - **Session Timeout**: Milliseconds (default: 30000)
   - **Publishing Interval**: Subscription publishing interval in ms (default: 1000)
   - **Sampling Interval**: Node sampling interval in ms (default: 250)
4. Click "Save"
5. Test connection (will show error if server is unreachable)

### Registering a Gage Bridge

1. Navigate to `/connectivity/gages`
2. Click "Register Bridge"
3. Fill in the dialog:
   - **Name**: Descriptive name (e.g., "Inspection Station 3")
   - **MQTT Broker**: Select from dropdown (a broker must exist first)
4. Click "Register"
5. **IMPORTANT**: Copy the API key shown in the success dialog. It is displayed only once and cannot be retrieved later. The bridge agent needs this key for authentication.

### Configuring a Gage Port

1. On the Gages tab, click on a registered bridge to expand it
2. Click "Add Port"
3. Fill in the port configuration:
   - **Port Name**: Serial port identifier (e.g., `COM3` on Windows, `/dev/ttyUSB0` on Linux)
   - **Baud Rate**: Communication speed (default: 9600)
   - **Data Bits**: 5, 6, 7, or 8 (default: 8)
   - **Parity**: None, Even, or Odd (default: None)
   - **Stop Bits**: 1, 1.5, or 2 (default: 1)
   - **Protocol Profile**: Select Mitutoyo Digimatic or Generic Regex
   - **Parse Pattern**: Custom regex (only for Generic Regex profile)
   - **Characteristic**: Optionally map to a characteristic for automatic data routing
4. Click "Save"

### Adding an ERP Connector

1. Navigate to `/connectivity/integrations`
2. Click "Add Connector" (admin-only)
3. The ConnectorWizard opens:
   - **Step 1**: Select adapter type (SAP OData, Oracle REST, Generic LIMS, Webhook)
   - **Step 2**: Configure connection details (endpoint URL, authentication credentials)
   - **Step 3**: Configure field mappings (map external fields to Cassini fields)
   - **Step 4**: Configure sync schedule (cron expression) and direction (inbound, outbound, bidirectional)
4. Save the connector
5. Use "Test Connection" to verify the external system is reachable
6. Use "Sync Now" to trigger an immediate sync (useful for initial data load)

---

## How To Use (Typical Workflow)

### Monitoring Connectivity Health

1. Navigate to `/connectivity/monitor`
2. Review the dashboard:
   - **Connectivity Metrics** -- Aggregate counts: total servers, connected, disconnected, messages/sec
   - **Data Flow Pipeline** -- Visual representation of data flowing from sources through MQTT/OPC-UA into the SPC engine
   - **Server Status Grid** -- Cards for each configured server showing connection state, last heartbeat, message counts
3. If a server shows "Disconnected", navigate to the Servers tab to diagnose

### Browsing and Mapping Data Sources

1. Navigate to `/connectivity/browse`
2. Select a server (MQTT broker or OPC-UA server)
3. For MQTT: Browse the topic tree. Click a topic to see live message previews.
4. For OPC-UA: Navigate the node tree. Expand folders to find data nodes.
5. Navigate to `/connectivity/mapping`
6. Create a mapping: select a source (MQTT topic or OPC-UA node), select a target characteristic
7. The QuickMapForm allows rapid mapping of multiple sources to characteristics

### Managing Gage Bridges

1. Navigate to `/connectivity/gages`
2. View the bridge list -- shows online/offline status based on heartbeat
3. Click a bridge to expand its port configuration
4. Add, edit, or delete ports as gages are added/removed from the inspection station
5. Monitor the bridge's last heartbeat timestamp to ensure it is running

---

## Acceptance Criteria (OQ-Style)

| # | Criterion | Pass Condition |
|---|---|---|
| 1 | Connectivity Hub loads | Page renders with sidebar navigation and all 6 tabs accessible |
| 2 | Monitor tab renders | Shows connectivity metrics, data flow pipeline, and server status grid (or empty state) |
| 3 | MQTT broker CRUD | Can create, read, update, and delete MQTT broker configurations |
| 4 | OPC-UA server CRUD | Can create, read, update, and delete OPC-UA server configurations |
| 5 | Connection test shows result | Test Connection button shows success or descriptive error message |
| 6 | Topic/node browsing | Browse tab shows topic tree (MQTT) or node tree (OPC-UA) for connected servers |
| 7 | Tag mapping works | Can create a mapping from a source (topic/node) to a characteristic |
| 8 | Gage bridge registration | Can register a bridge, receive a one-time API key |
| 9 | Gage port configuration | Can add a port with serial parameters and parser profile |
| 10 | ERP connector wizard | Can complete the connector wizard and save a connector configuration |
| 11 | Role gate enforced | Operator and supervisor cannot access /connectivity (redirected to dashboard) |
| 12 | Server list filters | Can filter servers by protocol (All, MQTT, OPC-UA) and search by name |

### NOTE FOR OQ TESTING

External system connectivity (MQTT brokers, OPC-UA servers, serial gages, ERP systems) requires actual external systems to be running. For OQ qualification:

- **UI configuration tests** -- Verify forms render, validation works, settings save and reload. These tests can be run without external systems.
- **Connection tests** -- Will show connection errors (expected without real endpoints). Verify the error is displayed gracefully, not a crash.
- **Data flow tests** -- Skip actual data flow verification. These require a running MQTT broker, OPC-UA server, or serial device. Data flow can be validated separately with a dedicated integration test environment.
- **ERP tests** -- Skip actual sync. Verify wizard completes, configuration saves, sync log viewer renders.

---

## Edge Cases & Constraints

- **No servers configured** -- Monitor tab and Browse tab show an empty state with a prompt to add a server. No error.
- **Connection test failure** -- The "Test Connection" button shows a descriptive error (e.g., "Connection refused", "Authentication failed", "DNS resolution failed"). The UI does not crash.
- **Duplicate broker name** -- The backend enforces plant-scoped unique names. The form shows a validation error.
- **Gage bridge API key** -- Shown only once at registration. If lost, the bridge must be deleted and re-registered with a new key.
- **Gage port COM port format** -- On Windows, port names are `COM1`, `COM2`, etc. On Linux, `/dev/ttyUSB0`, `/dev/ttyS0`. The form accepts any string.
- **OPC-UA security negotiation** -- If the security policy doesn't match the server's requirements, connection will fail with a security error.
- **ERP credential encryption** -- Connector auth_config is Fernet-encrypted at rest. The password is never returned in API responses (write-only).
- **MQTT TLS** -- Enabling TLS typically requires changing the port from 1883 to 8883. The form does not auto-adjust.
- **Webhook HMAC** -- Webhook connectors validate incoming requests using HMAC-SHA256. Invalid signatures are rejected silently.
- **Sync schedule** -- Uses cron expressions (e.g., `*/15 * * * *` for every 15 minutes). Invalid cron expressions are rejected at save time.
- **Protocol selector** -- The "Add Server" flow requires selecting a protocol first (MQTT or OPC-UA), then shows the protocol-specific form.
- **Plant scoping** -- All connectivity configurations are scoped to the currently selected plant.

---

## API Reference (for seeding)

All paths below are relative to the API base (`/api/v1/`). The `fetchApi` client in the frontend prepends this prefix automatically.

### MQTT Broker Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/mqtt/brokers` | JWT (Engineer+) | List brokers for plant |
| `POST` | `/mqtt/brokers` | JWT (Engineer+) | Create a broker |
| `GET` | `/mqtt/brokers/{id}` | JWT (Engineer+) | Get broker by ID |
| `PUT` | `/mqtt/brokers/{id}` | JWT (Engineer+) | Update broker |
| `DELETE` | `/mqtt/brokers/{id}` | JWT (Engineer+) | Delete broker |
| `POST` | `/mqtt/brokers/{id}/test` | JWT (Engineer+) | Test broker connection |
| `GET` | `/mqtt/brokers/status` | JWT (Engineer+) | Get all broker connection statuses |
| `GET` | `/mqtt/brokers/{id}/topics` | JWT (Engineer+) | Discover MQTT topics |

### OPC-UA Server Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/opcua/servers` | JWT (Engineer+) | List OPC-UA servers for plant |
| `POST` | `/opcua/servers` | JWT (Engineer+) | Create a server |
| `GET` | `/opcua/servers/{id}` | JWT (Engineer+) | Get server by ID |
| `PUT` | `/opcua/servers/{id}` | JWT (Engineer+) | Update server |
| `DELETE` | `/opcua/servers/{id}` | JWT (Engineer+) | Delete server |
| `POST` | `/opcua/servers/{id}/test` | JWT (Engineer+) | Test server connection |
| `GET` | `/opcua/servers/status` | JWT (Engineer+) | Get all server connection statuses |
| `POST` | `/opcua/servers/{id}/browse` | JWT (Engineer+) | Browse OPC-UA node tree |
| `GET` | `/opcua/servers/{id}/subscriptions` | JWT (Engineer+) | List active subscriptions |
| `POST` | `/opcua/servers/{id}/subscribe` | JWT (Engineer+) | Create a subscription |
| `DELETE` | `/opcua/servers/{id}/subscriptions/{sub_id}` | JWT (Engineer+) | Delete a subscription |

### Tag Mapping Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/tags/mappings` | JWT (Engineer+) | List tag-to-characteristic mappings |
| `POST` | `/tags/mappings` | JWT (Engineer+) | Create a mapping |
| `PUT` | `/tags/mappings/{id}` | JWT (Engineer+) | Update a mapping |
| `DELETE` | `/tags/mappings/{id}` | JWT (Engineer+) | Delete a mapping |

### Gage Bridge Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/gage-bridges/` | JWT (Engineer+) | List gage bridges for plant |
| `POST` | `/gage-bridges/` | JWT (Engineer+) | Register a new bridge (returns one-time API key) |
| `GET` | `/gage-bridges/{id}` | JWT (Engineer+) | Get bridge with ports |
| `PUT` | `/gage-bridges/{id}` | JWT (Engineer+) | Update bridge |
| `DELETE` | `/gage-bridges/{id}` | JWT (Engineer+) | Delete bridge |
| `POST` | `/gage-bridges/{id}/heartbeat` | API Key | Bridge heartbeat |
| `GET` | `/gage-bridges/my-config` | API Key | Get bridge config (used by bridge agent) |
| `POST` | `/gage-bridges/{id}/ports` | JWT (Engineer+) | Add a port to a bridge |
| `PUT` | `/gage-bridges/{id}/ports/{port_id}` | JWT (Engineer+) | Update a port |
| `DELETE` | `/gage-bridges/{id}/ports/{port_id}` | JWT (Engineer+) | Delete a port |
| `GET` | `/gage-bridges/profiles` | JWT (Engineer+) | List available parser profiles |

### ERP Connector Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/erp/connectors` | JWT (Engineer+) | List connectors for plant |
| `POST` | `/erp/connectors` | JWT (Admin) | Create a connector |
| `GET` | `/erp/connectors/{id}` | JWT (Engineer+) | Get connector by ID |
| `PUT` | `/erp/connectors/{id}` | JWT (Admin) | Update connector |
| `DELETE` | `/erp/connectors/{id}` | JWT (Admin) | Delete connector |
| `POST` | `/erp/connectors/{id}/test` | JWT (Admin) | Test connector connection |
| `POST` | `/erp/connectors/{id}/sync` | JWT (Admin) | Trigger immediate sync |
| `GET` | `/erp/connectors/{id}/logs` | JWT (Engineer+) | Get sync history logs |
| `GET` | `/erp/connectors/{id}/mappings` | JWT (Engineer+) | Get field mappings |
| `PUT` | `/erp/connectors/{id}/mappings` | JWT (Admin) | Update field mappings |

### Key Request Schemas

```json
// MQTT Broker Create
{
  "name": "Production Broker",
  "host": "192.168.1.100",
  "port": 1883,
  "plant_id": 1,
  "username": "cassini",
  "password": "secret",
  "client_id": "openspc-client",
  "keepalive": 60,
  "use_tls": false
}

// OPC-UA Server Create
{
  "name": "CNC Line 1",
  "endpoint_url": "opc.tcp://192.168.1.50:4840",
  "plant_id": 1,
  "auth_mode": "anonymous",
  "security_policy": "None",
  "security_mode": "None",
  "session_timeout": 30000,
  "publishing_interval": 1000,
  "sampling_interval": 250
}

// Gage Bridge Register
{
  "name": "Inspection Station 3",
  "plant_id": 1,
  "mqtt_broker_id": 1
}

// Gage Port Create
{
  "port_name": "COM3",
  "baud_rate": 9600,
  "data_bits": 8,
  "parity": "none",
  "stop_bits": 1,
  "protocol_profile": "mitutoyo_digimatic",
  "parse_pattern": null,
  "characteristic_id": 42,
  "is_active": true
}
```
