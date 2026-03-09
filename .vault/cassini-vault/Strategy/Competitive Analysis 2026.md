---
type: strategy
status: active
created: 2026-02-12
updated: 2026-03-06
tags:
  - strategy
  - active
aliases:
  - Competitive Analysis
---

# Competitive Analysis 2026

> **Full source**: `.planning/COMPETITIVE-ANALYSIS-2026.md` (784 lines, 13 commercial tools analyzed)
> **Method**: 8 parallel research agents -- 2 codebase analysis (backend + frontend), 6 market research
> **Last updated**: 2026-02-24 (post Sprint 9)

---

## Executive Summary

Cassini (OpenSPC) is a fully functional, open-source SPC platform with ~299 API endpoints, ~65 data models, 17+ chart types, and triple-protocol industrial connectivity. After analyzing 13 commercial SPC platforms:

- **No open-source equivalent exists.** Zero production-ready open-source SPC applications with a web UI exist anywhere.
- **Cassini matches or exceeds every mid-market and most enterprise competitors** and has features no commercial tool offers at any price.
- **All gaps identified in February 2026 have been closed** across Sprints 5-9.

---

## Tier 1 Competitive Scorecard: 8/8

Achieved post [[Sprints/Sprint 4]] with electronic signatures closing the final gap.

| # | Feature | Status |
|---|---------|--------|
| 1 | Real-time data collection | YES |
| 2 | Browser-based access | YES |
| 3 | Mobile dashboards | YES (PWA) |
| 4 | RBAC + audit trails | YES |
| 5 | Standard charts + rules | YES (variable + attribute + CUSUM + EWMA) |
| 6 | Automated notifications | YES (email + webhooks + push) |
| 7 | Process capability | YES (Cp/Cpk/Pp/Ppk/Cpm + non-normal) |
| 8 | Regulatory compliance | YES (21 CFR Part 11 e-signatures + audit trail) |

---

## Features Only Cassini Has

No commercial SPC tool offers any of the following:

1. **Native MQTT + Sparkplug B** -- zero commercial SPC tools have this ([[Features/MQTT Connectivity]])
2. **Docker/containerized deployment** -- zero commercial SPC tools offer this ([[Features/Docker]])
3. **HMAC-signed webhook notifications** -- zero commercial tools ([[Features/Notifications]])
4. **REST API for third-party consumption** -- only 1Factory also has REST
5. **WebSocket real-time updates** -- zero commercial SPC tools
6. **Open source ($0 license)** -- no equivalent exists
7. **Purpose-built ML anomaly detection** (PELT + Isolation Forest + K-S) -- ([[Features/AI Anomaly Detection]])
8. **PWA with Web Push notifications and offline measurement queue** ([[Features/PWA]])
9. **Bridge-agent architecture for RS-232/USB gages** -- serial-to-MQTT translator ([[Features/Gage Bridge]])

---

## Competitive Position by Tier

### vs. Entry-Level ($0-$5K/year): QI Macros, SPC for Excel
**Cassini dominates completely.** These are Excel add-ins with zero enterprise features.

### vs. Mid-Market ($5K-$50K/year): WinSPC, SQCpack, Zontec, NWA
**Cassini exceeds mid-market tools.** Has every feature they offer plus multivariate SPC, DOE, predictive analytics, gen AI, MQTT/OPC-UA, Docker, REST API, WebSocket, PWA. Their remaining advantages: OPC-DA/Classic support and longer market track records.

### vs. Enterprise ($50K-$500K+/year): InfinityQS, Minitab RT, GainSeeker
**Cassini is a strong contender.** InfinityQS leads on DRAMS escalation and OPC-DA legacy. Minitab leads on pure statistical depth (15+ chart types, rare events). GainSeeker leads on 5-database support. However, Cassini matches on MSA, non-normal capability, multivariate SPC, DOE, and predictive analytics. Triple-protocol connectivity, Docker, gen AI, REST API, and $0 price point are genuine differentiators.

### vs. ERP/MES-Embedded: Epicor, DELMIAworks
**Different market.** Their SPC depth is shallow (basic X-bar/R only). Cassini has pre-built ERP connectors with field mapping and sync scheduling ([[Features/ERP Connectors]]).

---

## Gap Closure Status (All Closed)

| Former Gap | Sprint | Feature |
|------------|--------|---------|
| Gage R&R / MSA | [[Sprints/Sprint 6]] | AIAG MSA 4th Ed, crossed/range/nested ANOVA, Kappa |
| Non-normal capability | [[Sprints/Sprint 5]] | 6 distribution families, auto-cascade fitting |
| Laney p'/u' | [[Sprints/Sprint 5]] | Overdispersion correction |
| RS-232/USB gages | [[Sprints/Sprint 7]] | openspc-bridge agent |
| ERP connectors | [[Sprints/Sprint 8]] | SAP OData, Oracle REST, LIMS, Webhook |
| Short-run charts | [[Sprints/Sprint 6]] | Deviation + Z-score modes |
| Multivariate SPC | [[Sprints/Sprint 9]] | T^2 Hotelling, MEWMA |
| Correlation/PCA | [[Sprints/Sprint 9]] | Pearson/Spearman/Kendall, PCA biplot |
| DOE | [[Sprints/Sprint 9]] | Factorial, CCD, Box-Behnken |
| Predictive analytics | [[Sprints/Sprint 9]] | ARIMA, Holt-Winters |
| Gen AI analysis | [[Sprints/Sprint 9]] | Claude/OpenAI integration |

---

## Remaining Minor Gaps

### Chart Types (Low/Very Low Impact)
- G/T rare event (Minitab only)
- Moving Average, Zone Chart, Run Chart (Minitab)
- Median/R (NWA QA, Zontec)

### Quality Tools (Medium Impact)
- **Pareto Chart** -- most notable omission for daily use
- Acceptance Sampling -- relevant for incoming inspection
- Tolerance Intervals, Multi-Vari Chart, OC Curves

### Connectivity (Low Impact)
- OPC-DA/Classic (legacy protocol)
- CMM integration (niche hardware)
- SEMI SECS/GEM (semiconductor niche)

---

## Market Context

| Metric | Value |
|--------|-------|
| SPC software market (2024) | ~$941M |
| Projected (2032) | ~$2.15B at 12% CAGR |
| Enterprise SPC license cost | $50K-$500K+/year |
| Mid-market SPC license cost | $5K-$50K/year |
| Open-source SPC competitors | **None** |
| Advantive market share | ~40-50% of dedicated SPC |

---

## Industry Compliance Status

| Standard | Sector | Status |
|----------|--------|--------|
| IATF 16949 | Automotive | Feature-complete (SPC + MSA + short-run) |
| IA9100 | Aerospace | Feature-complete (SPC + MSA + DOE + FAI + predictive) |
| 21 CFR Part 11 | Pharmaceutical | Feature-complete (e-sigs + audit + RBAC + password policy) |
| ISO 9001 | General Manufacturing | Exceeds requirements |

---

## Academic SPC -- Leapfrog Opportunities

Methods that exist in peer-reviewed literature but have **never been implemented** in any commercial or open-source tool:

| Method | Impact | Maturity |
|--------|--------|----------|
| **Nonparametric Control Charts** | Eliminates "is my data normal?" problem entirely | Very High (20+ years) |
| **Self-Starting Charts** | Works from observation #1, no Phase I needed | High (20+ years) |
| **Profile Monitoring** | Monitors entire functional relationships | Very High (hottest research area) |
| **Conformal Prediction + SPC** | ML with rigorous false alarm guarantees | Early (2024-2025) |
| Adaptive Control Charts | Dynamic sampling intervals | High (30+ years) |
| Bayesian Control Charts | Prior knowledge incorporation | Medium |
| BOCPD | Online changepoint detection | Medium |

Implementing even one would make Cassini the **first SPC platform in history** to offer these capabilities outside R scripts and MATLAB prototypes.

---

## 5-Year TCO Comparison (10 Users)

| | Mid-Market Commercial | Enterprise Commercial | Cassini |
|---|---|---|---|
| Software license | $25K-$250K | $250K-$2.5M | $0 |
| Implementation | $5K-$50K | $50K-$250K | Self-service |
| Training | $5K-$15K | $20K-$100K | Self-service |
| Integration | $10K-$30K | $50K-$200K | REST API (free) |
| Validation (regulated) | $10K-$50K | $50K-$300K | Same effort |
| **Total 5-Year** | **$55K-$395K** | **$420K-$3.35M** | **$0 + hosting** |
