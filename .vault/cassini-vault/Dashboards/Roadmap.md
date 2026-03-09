---
type: dashboard
status: active
created: 2026-03-06
updated: 2026-03-06
tags:
  - active
  - dashboard
---

# Gap Closure Roadmap

> Source of truth for scope. 15 features across 5 sprints, closing every major competitive gap identified in the February 2026 analysis of 13 commercial SPC tools.

**Basis**: [[Competitive Analysis]] | **Pricing**: [[Pricing Strategy]]

## Sprint Summary

| Sprint | Phase | Theme | Features | Market Unlock | Status |
|--------|-------|-------|----------|---------------|--------|
| [[Sprint 5 - Statistical Credibility]] | A | Statistical Credibility | 3 | Matches Minitab statistical depth | COMPLETE |
| [[Sprint 6 - Compliance Gate]] | B | Automotive/Aerospace Compliance | 3 | Opens IATF 16949 + AS9100 verticals | COMPLETE |
| [[Sprint 7 - Shop Floor Connectivity]] | C | Shop Floor Connectivity | 1 | Matches WinSPC/SQCpack brownfield | COMPLETE |
| [[Sprint 8 - Enterprise Integration]] | D | Enterprise Integration | 3 | ERP/MES/mobile for enterprise deals | COMPLETE |
| [[Sprint 9 - Advanced Analytics]] | E | Advanced Analytics | 5 | Category leadership position | COMPLETE |

## Feature Allocation

### Sprint 5 -- Phase A: Statistical Credibility

| ID | Feature | Description |
|----|---------|-------------|
| A1 | Non-Normal Capability | Distribution fitting (Box-Cox, Johnson, Weibull, lognormal), auto-cascade, Q-Q plots |
| A2 | Custom Run Rules | 8 parameterized Nelson rules, 4 presets (Nelson/AIAG/WECO/Wheeler), rule config UI |
| A3 | Laney p'/u' Charts | Overdispersion correction, per-point Laney limits |

### Sprint 6 -- Phase B: Automotive/Aerospace Compliance

| ID | Feature | Description |
|----|---------|-------------|
| B1 | Gage R&R / MSA | ANOVA + Range + Nested methods, attribute agreement (Kappa), AIAG MSA 4th Ed d2* table |
| B2 | Short-Run Charts | Deviation mode + standardized Z-score mode for mixed-part runs |
| B3 | First Article Inspection | AS9102 Rev C Forms 1/2/3, draft/submitted/approved workflow, separation of duties |

### Sprint 7 -- Phase C: Shop Floor Connectivity

| ID | Feature | Description |
|----|---------|-------------|
| C1 | RS-232/USB Gage Integration | Python bridge agent (serial to MQTT), Mitutoyo Digimatic parser, CLI, Gages tab in Connectivity Hub |

Architecture decision: [[Decisions]] D-002 -- Python bridge agent over WebSerial and Electron.

### Sprint 8 -- Phase D: Enterprise Integration

| ID | Feature | Description |
|----|---------|-------------|
| D1 | ERP Connectors | SAP OData, Oracle REST, Generic LIMS, Webhook adapters; sync engine with cron scheduling |
| D2 | LIMS/MES Middleware | Generic middleware adapter, bidirectional sync (merged with D1) |
| D3 | SSO/OIDC + PWA | DB-backed OIDC state, account linking, push notifications, offline queue, mobile nav |

Architecture decision: [[Decisions]] D-003 -- PWA-lite over React Native.

### Sprint 9 -- Phase E: Advanced Analytics

| ID | Feature | Description |
|----|---------|-------------|
| E1 | Multivariate SPC | Hotelling T-squared, MEWMA, covariance-based limits, OOC decomposition |
| E2 | Predictive Analytics | ARIMA trend extrapolation, prediction intervals, "predicted OOC in N samples" alerts |
| E3 | Gen AI Chart Analysis | LLM-powered pattern interpretation, configurable provider (Claude/OpenAI/local) |
| E4 | Inter-Characteristic Correlation | Correlation matrix heatmap, scatter plot matrix, PCA |
| E5 | DOE | Full/fractional factorial, response surface, Taguchi arrays, ANOVA, interaction plots |

## Explicitly Out of Scope

| Feature | Reason |
|---------|--------|
| OPC-DA/Classic | Legacy; MQTT + OPC-UA cover modern plants |
| CMM/Vision integration | Too device-specific |
| Barcode/scanner entry | Low impact |
| Semiconductor (SECS/GEM) | Different market |
| IQ/OQ/PQ validation docs | Sales collateral, not software |
| GAMP 5 compliance mapping | Professional services deliverable |

## Success Criteria (Post Sprint 9)

1. **Match Minitab** on statistical depth (non-normal, multivariate, DOE, MSA)
2. **Match InfinityQS** on enterprise compliance (21 CFR Part 11, MSA, multi-plant, ERP)
3. **Exceed all competitors** on modern architecture (Docker, REST, WebSocket, MQTT, OPC-UA, AI/ML)
4. **Unlock every major manufacturing vertical**: pharma, automotive, aerospace, food, ISO 9001
5. **Support full pricing ladder**: Community ($0) through Enterprise Plus ($50--150K)

## Related

- [[Decisions]] -- architecture decision records
- [[Competitive Analysis]] -- February 2026 analysis vs 13 tools
- [[Pricing Strategy]] -- open-core pricing model
- [[Session Start]] -- session checklist
- [[Project Status]] -- codebase stats
