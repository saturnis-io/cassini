# Sprint 7: Shop Floor Connectivity — Verification Checklist

**Status**: Planned (not started)
**Features**: C1 RS-232/USB Gage Integration

> **Note**: Sprint 7 features are not yet implemented. This checklist currently covers
> seed data scaffolding verification only. Feature verification items (marked "Future")
> will be expanded when implementation begins.

---

## C1: RS-232/USB Gage Integration

**Seed plant**: "C1: Gage Integration"

### Data Scaffolding

- [ ] Plant "C1: Gage Integration" exists with correct hierarchy
- [ ] 4 characteristics created, each simulating a different gage type:
  - [ ] Digital caliper (resolution: 0.01 mm)
  - [ ] Micrometer (resolution: 0.001 mm)
  - [ ] CMM probe (resolution: 0.0001 mm, 3D coordinates)
  - [ ] Surface roughness tester (resolution: 0.01 Ra)
- [ ] Timestamps follow regular intervals (simulating automated gage readings)
- [ ] Measurement values match realistic resolution for each gage type (no sub-resolution noise)
- [ ] Description metadata includes gage type, communication protocol, and measurement resolution

### Gage Type Detail

| Characteristic | Gage Type        | Protocol  | Resolution  | Sample Count |
|---------------|------------------|-----------|-------------|--------------|
| Caliper       | Digital Caliper  | RS-232    | 0.01 mm     | 50+          |
| Micrometer    | Digital Micrometer| USB HID  | 0.001 mm    | 50+          |
| CMM           | CMM Probe        | RS-232    | 0.0001 mm   | 30+          |
| Roughness     | Surface Tester   | USB       | 0.01 Ra     | 40+          |

### Future Feature Verification

- [ ] Serial port configuration dialog (baud rate, parity, stop bits, data bits)
- [ ] WebSerial API browser integration for direct USB/RS-232 access
- [ ] Alternative: gage bridge agent (local service relaying serial to WebSocket)
- [ ] Auto-detect gage protocol from initial handshake bytes
- [ ] Measurement auto-capture on SPC/Data button press
- [ ] Gage status indicator (connected/disconnected/error) in toolbar
- [ ] Buffered readings queue when network is temporarily unavailable
- [ ] Gage calibration due date tracking and alerts

---

## Quick Smoke Test

Run through these 2 items for a fast confidence check:

1. [ ] Open "C1: Gage Integration" plant, verify 4 characteristics exist with different gage types
2. [ ] Check that measurement values for the micrometer characteristic have 0.001 mm resolution (3 decimal places)
