# Gage Bridge Setup Guide

> Connect RS-232 and USB serial gages to Cassini SPC for automated measurement collection.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Prerequisites](#2-prerequisites)
3. [Installation](#3-installation)
4. [Registering the Bridge](#4-registering-the-bridge)
5. [Configuring Serial Ports](#5-configuring-serial-ports)
6. [Testing](#6-testing)
7. [Running the Bridge](#7-running-the-bridge)
8. [TLS Configuration](#8-tls-configuration)
9. [Running as a Service](#9-running-as-a-service)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Overview

The Cassini Gage Bridge is a lightweight agent that runs on a shop floor PC, reads measurement data from RS-232 or USB serial gages, and publishes the readings to an MQTT broker. Cassini then ingests these readings through its MQTT integration for automatic SPC processing.

### Architecture

```
Shop Floor PC                           Network                    Server
┌─────────────────────────┐        ┌──────────────┐        ┌──────────────────┐
│  Gage (RS-232/USB)      │        │              │        │                  │
│    └── Serial Port      │        │  MQTT Broker │        │  Cassini Server  │
│         └── cassini-    │───────→│  (Mosquitto, │───────→│    └── SPC       │
│             bridge      │  MQTT  │   HiveMQ,    │  MQTT  │        Engine    │
│                         │        │   etc.)      │        │        └── Charts│
└─────────────────────────┘        └──────────────┘        └──────────────────┘
```

### Supported Gages

| Protocol | Gages | Parser |
|----------|-------|--------|
| **Mitutoyo Digimatic (SPC)** | Mitutoyo calipers, micrometers, indicators, and CMMs using the SPC data output protocol | `mitutoyo_digimatic` |
| **Generic Serial** | Any gage that outputs numeric values over serial. Uses a configurable regex pattern to extract the measurement value | `generic` |

---

## 2. Prerequisites

| Requirement | Details |
|-------------|---------|
| **Python** | 3.10 or higher |
| **Serial ports** | RS-232 ports or USB-to-serial adapters (FTDI, Prolific, CH340) |
| **MQTT broker** | Already configured in Cassini (see [Connectivity Guide](connectivity-guide.md)) |
| **Network** | The bridge PC must be able to reach the MQTT broker over the network |
| **Cassini server** | Running and accessible (for bridge registration and config pull) |

### Serial Adapters

If your PC does not have a native RS-232 port, use a USB-to-serial adapter. Common chipsets:

- **FTDI FT232** -- most reliable, recommended
- **Prolific PL2303** -- widely available, generally reliable
- **CH340/CH341** -- inexpensive, may need manual driver install on Windows

Install the adapter's driver before proceeding. The adapter should appear as a COM port (Windows) or `/dev/ttyUSB*` (Linux).

---

## 3. Installation

Install the `cassini-bridge` package from the project source:

```bash
# From the project root
cd bridge
pip install -e .
```

Or install directly if distributed as a package:

```bash
pip install cassini-bridge
```

Verify the installation:

```bash
cassini-bridge --help
```

You should see:

```
usage: cassini-bridge [-h] {list-ports,test-port,run} ...

Cassini Gage Bridge Agent

positional arguments:
  {list-ports,test-port,run}
    list-ports          List available serial ports
    test-port           Test reading from a serial port
    run                 Run the bridge agent
```

---

## 4. Registering the Bridge

Before the bridge can run, you must register it in Cassini so the server knows about it and can provide configuration.

### Step 1: Register in the UI

1. Log in to Cassini as an **engineer** or **admin**
2. Navigate to **Connectivity Hub** in the sidebar
3. Click the **Gages** tab
4. Click **Register Bridge**
5. Fill in:

| Field | Description | Example |
|-------|-------------|---------|
| **Name** | A friendly name for this bridge | "CNC Shop Floor PC" |
| **Plant** | Which plant this bridge belongs to | "Chicago Assembly" |
| **MQTT Broker** | The broker this bridge should publish to | "Production Broker" |

6. Click **Register**

### Step 2: Save the API Key

After registration, Cassini displays the bridge's **API key**. This key is shown only once.

```
API Key: brk_a1b2c3d4e5f6...
```

Copy and save this key securely. You will use it when running the bridge. If you lose the key, you must delete and re-register the bridge.

### Step 3: Note the Server URL

The bridge needs the Cassini server URL to pull its configuration. This is the URL you use to access Cassini in your browser, for example:

```
https://spc.example.com
```

---

## 5. Configuring Serial Ports

### List Available Ports

On the bridge PC, list the serial ports to find your gage connections:

```bash
cassini-bridge list-ports
```

Example output:

```
  COM3                  USB-SERIAL CH340 (COM3)
  COM7                  Prolific PL2303GT USB Serial COM Port (COM7)
```

On Linux:

```
  /dev/ttyUSB0          USB-SERIAL CH340
  /dev/ttyUSB1          Prolific PL2303GT
```

### Add Ports in the Cassini UI

1. In the **Connectivity Hub > Gages** tab, click your registered bridge
2. Click **Add Port**
3. Fill in the port configuration:

| Field | Description | Default |
|-------|-------------|---------|
| **Port Name** | Serial port identifier | `COM3` (Windows) or `/dev/ttyUSB0` (Linux) |
| **Baud Rate** | Communication speed | `9600` (Mitutoyo default) |
| **Data Bits** | Number of data bits per byte | `8` |
| **Parity** | Error checking: none, even, odd | `none` |
| **Stop Bits** | Stop bits: 1 or 2 | `1` |
| **Protocol Profile** | Parser to use | `mitutoyo_digimatic` or `generic` |
| **Parse Pattern** | Regex for generic parser (ignored for Mitutoyo) | e.g., `([\d.]+)` |
| **MQTT Topic** | Topic to publish readings to | `cassini/gage/1/port/COM3` |

4. Optionally map the port directly to a **Characteristic** for automatic data routing
5. Click **Save**

### Common Baud Rate Settings

| Gage | Baud Rate | Data Bits | Parity | Stop Bits |
|------|-----------|-----------|--------|-----------|
| Mitutoyo Digimatic | 9600 | 8 | None | 1 |
| Mahr MarConnect | 4800 | 7 | Even | 2 |
| Starrett DataSure | 9600 | 8 | None | 1 |
| Generic (check manual) | Varies | 8 | None | 1 |

Always check your gage's manual for the correct serial settings.

---

## 6. Testing

Before running the bridge in production, test each component separately.

### Test Serial Connection

Read raw data from a serial port to verify the gage is communicating:

```bash
cassini-bridge test-port COM3 --baud 9600
```

Trigger a measurement on the gage (press the DATA/SPC button). You should see:

```
Testing COM3 at 9600 baud (profile: mitutoyo_digimatic)...
Waiting for data (Ctrl+C to stop)...

  Raw: b'01A+00123.456\r\n'              -> 123.456
  Raw: b'01A+00123.455\r\n'              -> 123.455
```

If you see `[PARSE FAILED]`, the parser does not match the gage's output format. Try:

- A different `--profile` (e.g., `generic`)
- A custom `--pattern` regex for the generic profile:
  ```bash
  cassini-bridge test-port COM3 --baud 9600 --profile generic --pattern "([\d.]+)"
  ```

### Test with More Readings

Capture more readings to verify consistency:

```bash
cassini-bridge test-port COM3 --baud 9600 --count 10
```

### What If No Data Appears?

1. **Check the cable**: Ensure the serial cable is connected and seated firmly
2. **Check the port name**: Run `cassini-bridge list-ports` to confirm the port name
3. **Check baud rate**: Try common baud rates (9600, 4800, 19200)
4. **Trigger the gage**: Some gages only send data when you press the DATA or SPC button
5. **Check permissions**: On Linux, your user must be in the `dialout` group (see Troubleshooting)

---

## 7. Running the Bridge

### Using Server Config (Recommended)

The bridge pulls its configuration from the Cassini server, so any changes you make in the UI take effect on the next bridge restart:

```bash
cassini-bridge run --server https://spc.example.com --api-key YOUR_API_KEY
```

Output:

```
2026-03-01 08:00:01 [INFO] MQTT connected to mqtt.example.com:1883
2026-03-01 08:00:01 [INFO] Listening on COM3 → cassini/gage/1/port/COM3
2026-03-01 08:00:01 [INFO] Listening on COM7 → cassini/gage/1/port/COM7
Bridge running (2 port(s)). Ctrl+C to stop.
```

### Using Local YAML Config

For environments where the bridge PC cannot reach the Cassini server (air-gapped networks), use a local YAML configuration file:

```bash
cassini-bridge run --config bridge-config.yml
```

Example `bridge-config.yml`:

```yaml
bridge_id: 1

mqtt:
  host: mqtt.example.com
  port: 1883
  username: bridge-user
  password: bridge-pass
  use_tls: false
  # ca_cert_pem: |
  #   -----BEGIN CERTIFICATE-----
  #   ...
  #   -----END CERTIFICATE-----

ports:
  - port_name: COM3
    baud_rate: 9600
    data_bits: 8
    parity: none
    stop_bits: 1.0
    protocol_profile: mitutoyo_digimatic
    mqtt_topic: cassini/gage/1/port/COM3
    is_active: true

  - port_name: COM7
    baud_rate: 4800
    data_bits: 7
    parity: even
    stop_bits: 2.0
    protocol_profile: generic
    parse_pattern: "([\d.]+)"
    mqtt_topic: cassini/gage/1/port/COM7
    is_active: true
```

### Heartbeat

The bridge publishes a heartbeat message every 30 seconds (configurable) to the topic `cassini/gage/{bridge_id}/heartbeat`. Cassini uses this to display bridge online/offline status in the Connectivity Hub.

When the bridge shuts down gracefully, it publishes a final heartbeat with status `"offline"`.

---

## 8. TLS Configuration

When your MQTT broker requires TLS:

### With Server Config

If TLS is configured on the broker in Cassini's UI, the bridge automatically pulls the TLS settings (CA certificate, client certificates) from the `/my-config` API endpoint. No additional configuration is needed on the bridge side.

### With Local YAML Config

Add TLS settings to the `mqtt` section of your YAML file:

```yaml
mqtt:
  host: mqtt.example.com
  port: 8883
  username: bridge-user
  password: bridge-pass
  use_tls: true
  ca_cert_pem: |
    -----BEGIN CERTIFICATE-----
    MIIBkTCB+wIUXz3m...
    -----END CERTIFICATE-----
  # For mutual TLS (mTLS):
  # client_cert_pem: |
  #   -----BEGIN CERTIFICATE-----
  #   ...
  #   -----END CERTIFICATE-----
  # client_key_pem: |
  #   -----BEGIN PRIVATE KEY-----
  #   ...
  #   -----END PRIVATE KEY-----
  # tls_insecure: false  # Set true to skip certificate verification (testing only)
```

See the [Security Guide](security-guide.md) for certificate details and how to obtain certificates for your MQTT broker.

---

## 9. Running as a Service

For production use, configure the bridge to start automatically when the PC boots.

### Windows (Task Scheduler)

1. Open **Task Scheduler** (search for it in the Start menu)
2. Click **Create Basic Task**
3. **Name**: "Cassini Gage Bridge"
4. **Trigger**: "When the computer starts"
5. **Action**: "Start a program"
6. **Program/script**: Path to your Python executable, e.g.:
   ```
   C:\Users\operator\AppData\Local\Programs\Python\Python311\Scripts\cassini-bridge.exe
   ```
7. **Arguments**:
   ```
   run --server https://spc.example.com --api-key YOUR_API_KEY
   ```
8. Check "Open the Properties dialog" before finishing
9. In Properties:
   - Check **Run whether user is logged on or not**
   - Check **Run with highest privileges** (needed for COM port access)
   - On the **Settings** tab, uncheck "Stop the task if it runs longer than"

### Linux (systemd)

Create `/etc/systemd/system/cassini-bridge.service`:

```ini
[Unit]
Description=Cassini Gage Bridge
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/cassini-bridge run --server https://spc.example.com --api-key YOUR_API_KEY
Restart=always
RestartSec=5
User=cassini-bridge

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
# Create a dedicated service user
sudo useradd -r -s /usr/sbin/nologin -G dialout cassini-bridge

# Enable and start
sudo systemctl daemon-reload
sudo systemctl enable --now cassini-bridge

# Check status
sudo systemctl status cassini-bridge

# View logs
journalctl -u cassini-bridge -f
```

---

## 10. Troubleshooting

### Common Issues

| Problem | Solution |
|---------|----------|
| **"COM port not found"** | Verify the port name with `cassini-bridge list-ports`. On Windows, check Device Manager for the correct COM number. On Linux, check `/dev/ttyUSB*` or `/dev/ttyACM*`. |
| **"Permission denied" on `/dev/ttyUSB0`** | Add your user to the `dialout` group: `sudo usermod -aG dialout $USER` then log out and back in. For systemd services, ensure the service user is in the `dialout` group. |
| **"COM port access denied" (Windows)** | Close any other program using the port (terminal emulators, gage software). Run the bridge as Administrator if needed. |
| **"MQTT connection refused"** | Check broker hostname and port. Verify the broker is running. Check firewall rules between the bridge PC and the broker. |
| **"TLS handshake failed"** | Verify the CA certificate matches the broker's certificate. Check that the system clock is accurate (certificate validation depends on correct time). |
| **No data from gage** | Check the cable connection. Verify the baud rate matches the gage's settings. Press the gage's DATA/SPC button to trigger a reading. Try `cassini-bridge test-port` to see raw data. |
| **"API key invalid"** | The API key may have been regenerated. Delete the bridge in Cassini and re-register to get a new key. |
| **Data appears but values are wrong** | Check the parser profile. Mitutoyo gages use a specific protocol -- if your gage is not Mitutoyo, use the `generic` profile with a custom regex pattern. |
| **"Parse failed" on every reading** | The serial output format does not match the parser. Run `cassini-bridge test-port` with `--profile generic --pattern "(.+)"` to see raw output, then craft a regex that extracts the numeric value. |
| **Bridge connects but Cassini shows no data** | Verify the MQTT topic in the port config matches what Cassini is subscribed to. Check that the characteristic is mapped to the correct topic in Configuration. |

### Checking Bridge Status in Cassini

1. Go to **Connectivity Hub > Gages**
2. Each bridge shows its status:
   - **Online** (green) -- heartbeat received within the last 90 seconds
   - **Offline** (red) -- no heartbeat received
3. Click a bridge to see individual port status and last-received timestamps

### Getting Debug Output

For more detailed logging when diagnosing issues, set the Python log level:

```bash
# Linux/macOS
LOGLEVEL=DEBUG cassini-bridge run --server https://spc.example.com --api-key YOUR_KEY

# Windows (CMD)
set LOGLEVEL=DEBUG
cassini-bridge run --server https://spc.example.com --api-key YOUR_KEY
```

---

## Cross-References

- [Connectivity Guide](connectivity-guide.md) -- MQTT broker setup, OPC-UA, and ERP connectors
- [Security Guide](security-guide.md) -- TLS certificates and MQTT encryption
- [Deployment Guide](deployment.md) -- Production server setup
