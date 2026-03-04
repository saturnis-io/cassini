# Pharmaceutical Manufacturing — Demo Companion Guide

## Overview

This seed models a pharmaceutical production facility under FDA 21 CFR Part 11 compliance requirements. It demonstrates electronic signature workflows, anomaly detection for batch deviation, MSA for analytical instruments, LIMS/ERP integration, and records retention policies.

**Login:** `admin` / `password`
**Plant:** Pharma Plant (auto-selected)

## Walkthrough

### 1. Electronic Signature Workflows

> Navigate to **Settings > Signatures**.

This is the core compliance feature for pharmaceutical prospects. 21 CFR Part 11 requires:
- Electronic signatures bound to individual users (non-transferable).
- Signatures include meaning (e.g., "Reviewed", "Approved", "Rejected").
- Signed records are tamper-evident (hash-based integrity).

**Demo flow:**
1. Show the workflow configuration — which resource types require signatures.
2. Open a signed record and point out the signature trail (who, when, meaning, hash).
3. Attempt to modify a signed record — it will invalidate the signature and require re-signing.

**Talking point:** Many SPC tools offer "electronic signatures" that are just a name field. Cassini's signatures are cryptographic — a SHA-256 hash of the record content is signed, making any post-signature tampering detectable.

### 2. Anomaly Detection for Batch Deviations

> Navigate to a process characteristic on the **Dashboard** and toggle **AI Insights**.

- PELT changepoint detection identifies when a batch started behaving differently.
- K-S distribution shift tests catch changes in the underlying distribution (e.g., active ingredient concentration shifting from batch 15 onward).
- Each detected anomaly generates an event with severity and affected sample range.

**Regulatory context:** In pharma, every out-of-trend (OOT) result requires a documented investigation. Anomaly detection provides an automated first-pass that identifies which results warrant investigation.

### 3. MSA — Analytical Instrument Qualification

> Navigate to **MSA** in the sidebar.

- Open a study for an HPLC or titration measurement system.
- The Gage R&R results show whether the analytical method (not just the instrument) is capable.
- Key output: %GRR relative to the specification tolerance.

**Talking point for pharma:** USP <1058> requires measurement system suitability as part of method validation. Cassini's MSA module produces the variance decomposition needed for this documentation.

### 4. LIMS / ERP Integration

> Navigate to **Connectivity > Integrations**.

- Show the ERP connector configuration — Cassini supports SAP OData, Oracle REST, Generic LIMS, and Webhook adapters.
- Sync engine runs on a configurable schedule (cron-based).
- Inbound: pull batch records, material specs, lot numbers from LIMS.
- Outbound: push SPC results, violation alerts, capability snapshots to ERP.
- Authentication credentials are Fernet-encrypted at rest.

**Talking point:** Manual data transcription between LIMS and SPC is a top audit finding. Automated integration eliminates transcription errors and provides a complete digital thread.

### 5. Records Retention Policy

> Navigate to **Settings > Retention**.

- FDA requires specific retention periods for different record types (batch records: life of product + 1 year, calibration: 3 years, etc.).
- The retention tree browser shows policies inherited through the hierarchy.
- Purge operations are logged in the audit trail with full before/after records.

**Demo flow:**
1. Show the retention policy tree — plant-level defaults, overrides at characteristic level.
2. Point out the inheritance chain: if a characteristic has no policy, it inherits from the station, then line, then plant.
3. Show the purge history log.

### 6. Audit Trail

> Navigate to **Settings > Audit Log**.

- Every data modification, configuration change, and approval is logged.
- Filters: user, resource type, action, date range.
- Export to CSV for regulatory submission.

## Quick Reference Checklist

- [ ] Electronic signatures — 21 CFR Part 11, SHA-256 hash, meaning, tamper detection
- [ ] Anomaly detection — PELT, K-S shift, OOT investigation support
- [ ] MSA — HPLC/titration Gage R&R, USP <1058> alignment
- [ ] ERP/LIMS — SAP/Oracle/webhook, sync schedule, encrypted credentials
- [ ] Retention — policy tree, inheritance, purge history
- [ ] Audit trail — full traceability, CSV export, regulatory readiness
