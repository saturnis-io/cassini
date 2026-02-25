# Cassini Gage Bridge

RS-232/USB serial gage to MQTT bridge agent for Cassini SPC.

## Installation

```bash
pip install cassini-bridge
```

Or install from source:

```bash
cd bridge
pip install -e .
```

## Usage

### List available serial ports

```bash
cassini-bridge list-ports
```

### Test a specific port

```bash
cassini-bridge test-port COM3 --baud 9600 --profile mitutoyo_digimatic
```

### Run the bridge (server mode)

```bash
cassini-bridge run --server https://cassini.local --api-key YOUR_API_KEY
```

### Run with local config

```bash
cassini-bridge run --config bridge-config.yaml
```

## Supported Gage Protocols

- **Mitutoyo Digimatic** — Standard SPC output (`01A+00123.456`)
- **Generic** — User-defined regex with `(?P<value>...)` capture group
