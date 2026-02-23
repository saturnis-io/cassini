# OpenSPC Gage Bridge

RS-232/USB serial gage to MQTT bridge agent for OpenSPC.

## Installation

```bash
pip install openspc-bridge
```

Or install from source:

```bash
cd bridge
pip install -e .
```

## Usage

### List available serial ports

```bash
openspc-bridge list-ports
```

### Test a specific port

```bash
openspc-bridge test-port COM3 --baud 9600 --profile mitutoyo_digimatic
```

### Run the bridge (server mode)

```bash
openspc-bridge run --server https://openspc.local --api-key YOUR_API_KEY
```

### Run with local config

```bash
openspc-bridge run --config bridge-config.yaml
```

## Supported Gage Protocols

- **Mitutoyo Digimatic** — Standard SPC output (`01A+00123.456`)
- **Generic** — User-defined regex with `(?P<value>...)` capture group
