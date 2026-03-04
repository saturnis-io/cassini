# Full Feature Showcase — Demo Companion Guide

## Overview

This seed populates a broad cross-section of Cassini's capabilities across multiple plants. Use it for general demos, trade shows, or prospect evaluations where you need to touch every major feature area in a single session.

**Login:** `admin` / `password`

## Walkthrough

### 1. Dashboard — First Impressions

> Navigate to **Dashboard** after login.

- The operator dashboard shows real-time control chart tiles for the active plant.
- Click any tile to expand the full control chart with Nelson rule annotations.
- Point out the **quickStats** bar (Cpk, Ppk, mean, sigma) above each chart.
- Toggle **Show Your Work** in the header — click any underlined statistic to see the full computation trace with AIAG citations.

### 2. Control Charts

> Click into any characteristic from the dashboard.

| Chart Type | What to Show | Talking Point |
|---|---|---|
| I-MR | Individual measurements + moving range | Simplest chart — one measurement per subgroup |
| X-bar R | Subgroup means + range | Most common in manufacturing |
| X-bar S | Subgroup means + std deviation | Better for subgroups > 10 |
| CUSUM | Cumulative sum | Detects small persistent shifts |
| EWMA | Exponentially weighted moving average | Smooths noise, catches drift |
| p / np / c / u | Attribute charts | Defect counting — binary or rate |

### 3. MSA / Gage R&R

> Navigate to **MSA** in the sidebar.

- Open an existing study to show the ANOVA results table and variance breakdown.
- Highlight the %GRR value — under 10% is acceptable, 10-30% marginal, over 30% unacceptable.
- Show the attribute MSA with Cohen's Kappa agreement scores.

### 4. First Article Inspection

> Navigate to **FAI** in the sidebar.

- Open a report to show the AS9102 Rev C Forms 1/2/3 layout.
- Walk through the draft-to-submitted-to-approved workflow.
- Point out separation of duties — the approver cannot be the submitter.

### 5. Electronic Signatures

> Navigate to **Settings > Signatures**.

- Show the workflow configuration panel.
- Demonstrate the signature dialog — password confirmation, meaning selection, non-repudiation hash.

### 6. Anomaly Detection

> Return to a control chart and click **AI Insights** in the toolbar.

- The anomaly overlay shows detected changepoints (PELT), distribution shifts (K-S test), and isolation forest outliers.
- Expand the event list to see severity, affected range, and detection method.

### 7. Connectivity Hub

> Navigate to **Connectivity** in the sidebar.

- **Monitor** tab: live data source status, last-value timestamps.
- **Servers** tab: MQTT broker and OPC-UA server configuration.
- **Gages** tab: RS-232/USB bridge agents registered from shop floor PCs.
- **Integrations** tab: ERP/LIMS connectors (SAP, Oracle, webhook).

### 8. Analytics

> Navigate to **Analytics** in the sidebar.

- Capability analysis with non-normal distribution fitting.
- DOE study builder (full/fractional factorial).
- Multivariate T-squared and correlation matrix.

## Quick Reference Checklist

- [ ] Dashboard quickStats — Cpk/Ppk color coding
- [ ] Show Your Work — computation transparency
- [ ] Control charts — all 6+ types
- [ ] MSA — variance breakdown, %GRR
- [ ] FAI — AS9102 forms, approval workflow
- [ ] Signatures — dialog, hash, meanings
- [ ] Anomaly — AI Insights toggle, event list
- [ ] Connectivity — MQTT, OPC-UA, gages, ERP
- [ ] Analytics — capability, DOE, multivariate
- [ ] Notifications — push, email, webhook config
- [ ] Audit log — Settings > Audit Log, CSV export
- [ ] Multi-plant — plant switcher in header
