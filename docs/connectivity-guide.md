# Connectivity Guide

> Set up MQTT brokers, OPC-UA servers, gage bridges, and ERP connectors in Cassini SPC.

---

## Table of Contents

1. [Data Flow Overview](#1-data-flow-overview)
2. [MQTT Broker Setup](#2-mqtt-broker-setup)
3. [OPC-UA Server Setup](#3-opc-ua-server-setup)
4. [Gage Bridge Setup](#4-gage-bridge-setup)
5. [ERP/LIMS Connectors](#5-erplims-connectors)
6. [Troubleshooting](#6-troubleshooting)

---

## 1. Data Flow Overview

Cassini supports multiple paths for getting measurement data into the SPC engine. Choose the path that matches your shop floor infrastructure.

### Automated Data Collection

```
Gage (RS-232/USB)
    └── cassini-bridge (shop floor PC)
            └── MQTT Broker ──→ Cassini Server ──→ SPC Engine ──→ Control Charts

OPC-UA Server (PLCs, SCADA)
    └── ─────────────────────→ Cassini Server ──→ SPC Engine ──→ Control Charts
```

### Manual Data Entry

```
Operator
    └── Data Entry Form ──→ Cassini API ──→ SPC Engine ──→ Control Charts
```

### Outbound Data (ERP/LIMS)

```
SPC Engine ──→ Violations / Stats / Events
                    └── MQTT Outbound Publishing ──→ External Systems
                    └── ERP Connector ──→ SAP / Oracle / LIMS
                    └── Webhook ──→ Custom Integrations
```

### Connectivity Hub

All connectivity configuration is managed through the **Connectivity Hub** page, accessible from the sidebar. The hub has tabs for each protocol:

- **MQTT Brokers** -- Inbound data ingestion and outbound event publishing
- **OPC-UA** -- Direct connection to OPC-UA servers
- **Gages** -- RS-232/USB gage bridge management
- **ERP/LIMS** -- Enterprise system connectors

---

## 2. MQTT Broker Setup

MQTT is the most common protocol for automated data collection in Cassini. An MQTT broker acts as a message hub between your data sources (gages, PLCs, sensors) and Cassini.

### Adding a Broker

1. Navigate to **Connectivity Hub** in the sidebar
2. Click the **MQTT Brokers** tab
3. Click **Add Broker**
4. Fill in the connection details:

| Field | Description | Example |
|-------|-------------|---------|
| **Name** | A friendly name for this broker | "Production Floor Broker" |
| **Host** | Broker hostname or IP address | `mqtt.example.com` or `192.168.1.100` |
| **Port** | Broker port (1883 for plain, 8883 for TLS) | `1883` |
| **Username** | Broker authentication username (optional) | `cassini-user` |
| **Password** | Broker authentication password (optional) | (stored encrypted) |

5. Click **Test Connection** to verify Cassini can reach the broker
6. Click **Save**
7. Toggle the broker to **Active** to start listening

### TLS Configuration

If your broker requires encrypted connections:

1. Toggle **Use TLS** on -- the port field auto-suggests 8883
2. Paste the **CA Certificate** in PEM format (starts with `-----BEGIN CERTIFICATE-----`)
3. For mutual TLS (mTLS), also paste the **Client Certificate** and **Client Private Key**
4. Click **Test Connection** to verify TLS works

See the [Security Guide](security-guide.md) for detailed certificate instructions and troubleshooting.

### Topic Mapping

After adding a broker, you need to tell Cassini which MQTT topics correspond to which characteristics.

#### Automatic Discovery

1. Select your broker in the list
2. Click **Start Discovery** -- Cassini subscribes to the `#` wildcard and listens for messages
3. Trigger some measurements on your shop floor equipment
4. Discovered topics appear in the discovery panel, shown as a flat list or a tree view
5. Click a topic to map it to a characteristic

#### Manual Mapping

1. Go to the **Configuration** page
2. Select a characteristic
3. In the characteristic settings, set the **Data Source** to MQTT
4. Enter the MQTT topic that this characteristic should listen to
5. Select the broker to use

### Topic Format

Cassini does not enforce a specific topic structure. Common patterns include:

```
plant/line/machine/characteristic
cassini/gage/1/port/COM3
site/area/equipment/measurement
sparkplugb/spBv1.0/group/DDATA/edge
```

### Outbound Publishing

Cassini can publish SPC events back to MQTT brokers for consumption by other systems.

1. Edit a broker and enable the **Outbound** toggle
2. Configure the topic prefix and event types to publish

Cassini publishes these event types:

| Event | Topic Suffix | Payload |
|-------|-------------|---------|
| Violations | `.../violation` | Rule number, severity, sample data |
| Statistics | `.../stats` | Mean, sigma, Cp, Cpk |
| Nelson Events | `.../nelson` | Rule triggered, point index, pattern |

Formats: **JSON** (default) or **SparkplugB** (for SparkplugB-compatible infrastructure).

---

## 3. OPC-UA Server Setup

OPC-UA provides direct, real-time connections to PLCs, SCADA systems, and industrial equipment.

### Adding a Server

1. Navigate to **Connectivity Hub** in the sidebar
2. Click the **OPC-UA** tab
3. Click **Add Server**
4. Fill in the connection details:

| Field | Description | Example |
|-------|-------------|---------|
| **Name** | A friendly name for this server | "CNC Mill Controller" |
| **Endpoint URL** | OPC-UA server endpoint | `opc.tcp://192.168.1.50:4840` |
| **Auth Mode** | Authentication method | Anonymous or Username/Password |
| **Security Policy** | Encryption level | None or Basic256Sha256 |

5. Click **Test Connection** to verify connectivity
6. Click **Save**

### Node Browsing

After connecting to an OPC-UA server, you can explore its address space:

1. Select your server in the list
2. Click the **Browse** tab
3. Navigate the node tree -- expand folders to find data nodes (variables)
4. Each node shows its:
   - **Display Name** -- human-readable name
   - **Node ID** -- unique identifier (e.g., `ns=2;s=Temperature.PV`)
   - **Data Type** -- Float, Double, Int32, etc.
   - **Current Value** -- live value from the server

### Subscribing Nodes to Characteristics

1. In the Browse tab, find the node you want to monitor
2. Click **Map to Characteristic**
3. Select the target characteristic from the dropdown
4. Set the **Sampling Interval** (how often to read the node, in milliseconds)
5. Click **Save**

Cassini creates an OPC-UA subscription and delivers new values directly into the SPC engine for automatic control chart processing.

### Security Setup

For production OPC-UA connections, set the security policy to `Basic256Sha256`:

1. Edit the server connection
2. Set **Security Policy** to `Basic256Sha256`
3. Upload the **Client Certificate** and **Client Private Key**
4. Optionally upload the **Server Certificate** for trust verification

After saving, you must also add Cassini's client certificate to the OPC-UA server's trust list. See the [Security Guide](security-guide.md) for details.

---

## 4. Gage Bridge Setup

The Cassini Gage Bridge connects RS-232 and USB serial gages (calipers, micrometers, CMMs) to Cassini via MQTT.

For the complete step-by-step setup, see the dedicated **[Gage Bridge Setup Guide](gage-bridge-setup.md)**.

### Quick Overview

1. Install the bridge on a shop floor PC: `pip install cassini-bridge`
2. Register the bridge in Cassini: Connectivity Hub > Gages > Register Bridge
3. Configure serial ports and map them to characteristics
4. Run: `cassini-bridge run --server https://spc.example.com --api-key YOUR_KEY`

The bridge reads serial data, parses it (Mitutoyo Digimatic or generic regex), and publishes values to the MQTT broker for ingestion by Cassini.

---

## 5. ERP/LIMS Connectors

Cassini can sync data with enterprise systems for part master import, inspection plan retrieval, and SPC result export.

### Supported Adapters

| Adapter | Systems | Direction |
|---------|---------|-----------|
| **SAP OData** | SAP S/4HANA, ECC (via Gateway) | Bidirectional |
| **Oracle REST** | Oracle Fusion Cloud, E-Business Suite | Bidirectional |
| **Generic LIMS** | Any LIMS with a REST API | Bidirectional |
| **Webhook** | Custom integrations | Outbound only |

### Adding a Connector

1. Navigate to **Connectivity Hub** in the sidebar
2. Click the **ERP/LIMS** tab
3. Click **Add Connector**
4. Select the adapter type
5. Fill in the connection details:

| Field | Description |
|-------|-------------|
| **Name** | A friendly name for this connector |
| **Base URL** | The ERP/LIMS API endpoint |
| **Auth Type** | Basic, OAuth2, API Key, or Bearer Token |
| **Auth Config** | Credentials (stored encrypted with Fernet) |

6. Click **Test Connection** to verify
7. Click **Save**

### Sync Configuration

After creating a connector, configure what data to sync:

1. Select your connector
2. Set the **Sync Schedule** using a cron expression:

| Expression | Meaning |
|-----------|---------|
| `*/15 * * * *` | Every 15 minutes |
| `0 * * * *` | Every hour on the hour |
| `0 6 * * *` | Daily at 6:00 AM |
| `0 6 * * 1-5` | Weekdays at 6:00 AM |

3. Configure **Field Mappings** between Cassini and the ERP system
4. Enable the connector to start syncing

### Webhook Connector

The webhook adapter publishes SPC events to any HTTP endpoint:

- Payloads are signed with HMAC-SHA256 for verification
- Configure the webhook URL and the secret key
- Select which events to publish (violations, stats, capability snapshots)

---

## 6. Troubleshooting

### MQTT Issues

| Problem | Likely Cause | Solution |
|---------|-------------|----------|
| "Connection refused" | Wrong host, port, or firewall blocking | Verify broker hostname and port. Check firewall rules allow outbound TCP to the broker port |
| "TLS handshake failed" | Certificate mismatch or expired | Verify CA certificate matches the broker. Check certificate expiry dates. Try "Skip verification" to isolate the issue |
| "Authentication failed" | Wrong username or password | Re-enter credentials. Check if the broker requires a specific username format |
| "Not authorized" | Broker ACL blocking subscription | Check broker ACLs allow the configured username to subscribe to the required topics |
| Topics discovered but no data in charts | Topic not mapped to a characteristic | Go to Configuration, select the characteristic, and verify the MQTT topic mapping |
| Duplicate samples appearing | Multiple Cassini instances subscribing | Ensure only one Cassini backend instance has the MQTT broker set to Active |

### OPC-UA Issues

| Problem | Likely Cause | Solution |
|---------|-------------|----------|
| "Timeout" or "Connection refused" | Wrong endpoint URL or firewall | Verify the OPC-UA endpoint URL (must include `opc.tcp://`). Check firewall for TCP port access (default 4840) |
| "BadSecurityPolicyRejected" | Server does not support the selected policy | Try a different security policy. Check which policies the server supports |
| "BadCertificateUntrusted" | Cassini's certificate not in server trust list | Add Cassini's client certificate to the OPC-UA server's trusted certificates folder |
| "BadIdentityTokenRejected" | Wrong credentials or auth mode | Verify username/password. Try Anonymous auth mode to test connectivity first |
| Node values not updating | Subscription not active or wrong node | Verify the subscription is active. Check the node ID is correct. Confirm the node's data type is numeric |

### Gage Bridge Issues

See the [Gage Bridge Setup Guide](gage-bridge-setup.md) troubleshooting section.

### ERP/LIMS Issues

| Problem | Likely Cause | Solution |
|---------|-------------|----------|
| "Connection refused" or timeout | Wrong base URL or firewall | Verify the ERP API endpoint URL. Check network connectivity and firewall rules |
| "401 Unauthorized" | Invalid or expired credentials | Re-enter authentication credentials. For OAuth2, check if the token needs refreshing |
| Sync runs but no data imported | Field mapping mismatch | Verify field mappings match the ERP system's response format |
| "HMAC verification failed" (webhooks) | Secret key mismatch | Ensure the webhook secret configured in Cassini matches the receiving system |

### General Connectivity Tips

1. **Start simple**: Test with the least secure settings first (no TLS, anonymous auth), then add security layers one at a time
2. **Check the network**: Use `ping`, `telnet`, or `nc` to verify basic network connectivity before troubleshooting application-level issues
3. **Check the logs**: Cassini logs connection events to the application log. Set `CASSINI_LOG_FORMAT=json` for structured logs
4. **Test Connection button**: Always use the "Test Connection" button in the UI before saving -- it provides immediate feedback on connectivity issues
5. **One thing at a time**: When troubleshooting, change only one setting at a time and test after each change

---

## Cross-References

- [Security Guide](security-guide.md) -- TLS certificates, HTTPS, and encryption details
- [Gage Bridge Setup Guide](gage-bridge-setup.md) -- Complete RS-232/USB gage integration walkthrough
- [Deployment Guide](deployment.md) -- Production deployment and infrastructure
- [User Guide](user-guide.md) -- Feature reference for daily use
