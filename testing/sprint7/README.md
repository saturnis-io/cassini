# Sprint 7: Gage Connectivity — Verification Checklist

**Status**: Complete
**Features**: C1: RS-232/USB Gage Integration

---

## Prerequisites

1. Run the Sprint 7 test seed from DevTools page (or `python backend/scripts/seed_test_sprint7.py`)
2. Users available: `admin`, `engineer1` (all password: `password`)
3. Test plant "C1: Gage Integration" with 4 characteristics

---

## C1: RS-232/USB Gage Integration

**Seed plant**: "C1: Gage Integration"
**Login as**: engineer1

### Data Verification

- [ ] Plant "C1: Gage Integration" exists with 4 characteristics
- [ ] Bridge "Shop Floor Bridge 1" appears in Gages tab (/connectivity/gages)
- [ ] Bridge shows "online" status with recent heartbeat
- [ ] 4 ports configured (COM3-COM6) with correct protocol profiles
- [ ] COM3/COM4 use mitutoyo_digimatic profile
- [ ] COM5/COM6 use generic profile with custom regex patterns

### Feature Verification — Bridge Management

- [ ] Navigate to /connectivity/gages — Gages tab visible in sidebar
- [ ] Bridge list shows "Shop Floor Bridge 1" with online status badge (green dot)
- [ ] Click "Register Bridge" — registration dialog opens
- [ ] Enter name and select MQTT broker — submit creates bridge
- [ ] API key shown once with copy button and warning message
- [ ] Delete bridge — confirm dialog, cascades to ports

### Feature Verification — Port Configuration

- [ ] Click on bridge — port configuration panel shows below
- [ ] Port table shows 4 ports with names, baud rates, protocols
- [ ] Click "Add Port" — port configuration form opens
- [ ] Select Mitutoyo profile — auto-fills baud 9600, 8N1
- [ ] Select Generic profile — regex pattern field appears
- [ ] MQTT topic auto-generated as openspc/gage/{id}/{port}/value
- [ ] Assign characteristic to port — creates MQTT data source mapping
- [ ] Delete port — removes mapping

### Feature Verification — Profile Selector

- [ ] Profile dropdown lists Mitutoyo Digimatic and Generic
- [ ] Selecting profile auto-fills default serial settings
- [ ] Generic profile shows parse pattern input field

---

## Quick Smoke Test

1. [ ] /connectivity/gages tab loads, bridge list visible
2. [ ] Bridge status badge shows green "online"
3. [ ] Port config panel shows 4 configured ports
4. [ ] Register new bridge — API key displayed once
5. [ ] Delete test bridge — cascades cleanly
