# Sprint 8: Enterprise Integration — Verification Checklist

**Status**: Planned (not started)
**Features**: D1 ERP Connectors, D2 LIMS/MES Middleware, D3 Native Mobile Apps

> **Note**: Sprint 8 features are not yet implemented. This checklist currently covers
> seed data scaffolding verification only. Feature verification items (marked "Future")
> will be expanded when implementation begins.

---

## D1: ERP Connectors

**Seed plant**: "D1: ERP Integration"

### Data Scaffolding

- [ ] Plant "D1: ERP Integration" exists with correct hierarchy
- [ ] Part numbers follow ERP naming convention in hierarchy (e.g., "PN-10045-Rev.C")
- [ ] Work orders embedded in hierarchy naming (e.g., "WO-2026-0142")
- [ ] Batch numbers follow ERP pattern: `WO-xxxx-xxxx` format
- [ ] At least 3 different part numbers with multiple work orders each
- [ ] Sample data has timestamps spanning multiple production shifts

### Future Feature Verification

- [ ] SAP connector configuration (RFC destination, credentials, function modules)
- [ ] Oracle ERP Cloud connector (REST API, OAuth2 flow)
- [ ] Epicor connector (REST API, API key)
- [ ] Connector framework: pluggable adapter pattern for new ERP systems
- [ ] Bidirectional sync: pull part master data, push SPC results
- [ ] Work order status polling and automatic characteristic activation
- [ ] Error handling: retry logic, dead letter queue for failed syncs

---

## D2: LIMS/MES Middleware

**Seed plant**: "D2: LIMS Lab Data"

### Data Scaffolding

- [ ] Plant "D2: LIMS Lab Data" exists with correct hierarchy
- [ ] Hierarchy mimics lab structure: Lab -> Instrument -> Test
- [ ] Lab-style measurements with certificate metadata in descriptions
- [ ] At least 2 instruments with 3 test types each
- [ ] Measurements include traceability info (certificate number, analyst ID in metadata)
- [ ] Results span multiple days to simulate lab reporting cadence

### Future Feature Verification

- [ ] Middleware adapter framework for LIMS protocols (HL7, ASTM, custom REST)
- [ ] Bidirectional sync: receive lab results, return SPC disposition
- [ ] Certificate of Analysis (CoA) data import
- [ ] Instrument calibration status tracking
- [ ] Sample login and tracking workflow
- [ ] Result approval workflow integration with electronic signatures (P12)

---

## D3: Native Mobile Apps

**Seed plant**: "D3: Mobile Entry"

### Data Scaffolding

- [ ] Plant "D3: Mobile Entry" exists with correct hierarchy
- [ ] Small subgroups used: n=1 to n=3 (typical for manual mobile data entry)
- [ ] Short batch names suitable for mobile display (< 15 characters)
- [ ] At least 5 characteristics with simple, clear names
- [ ] Spec limits set on all characteristics (for immediate go/no-go feedback)
- [ ] Sample counts are modest (20-40 per characteristic, simulating manual entry pace)

### Future Feature Verification

- [ ] PWA or React Native application builds and installs
- [ ] Offline data entry with local storage queue
- [ ] Background sync when connectivity restored
- [ ] Camera integration for reading barcodes/QR codes (part number, work order)
- [ ] Large touch targets for gloved/dirty hands operation
- [ ] Immediate go/no-go visual feedback (green/red) on measurement entry
- [ ] Push notifications for out-of-control alerts

---

## Quick Smoke Test

Run through these 3 items for a fast confidence check:

1. [ ] Open "D1: ERP Integration" plant, verify batch names match `WO-xxxx-xxxx` pattern
2. [ ] Open "D2: LIMS Lab Data" plant, verify Lab -> Instrument -> Test hierarchy structure
3. [ ] Open "D3: Mobile Entry" plant, verify subgroup sizes are n=1 to n=3
