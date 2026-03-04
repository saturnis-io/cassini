# Data Center Operations — Demo Companion Guide

## Overview

This seed models a data center monitoring Power Usage Effectiveness (PUE), cooling system performance, and infrastructure reliability. It demonstrates EWMA for efficiency tracking, anomaly detection for HVAC failure prediction, push notification alerts, and CUSUM for chiller degradation.

**Login:** `admin` / `password`
**Plant:** Data Center (auto-selected)

## Walkthrough

### 1. EWMA for PUE Tracking

> Navigate to the **Dashboard** and find the **PUE** characteristic.

Power Usage Effectiveness is the data center's key efficiency metric (total facility power / IT equipment power). Ideal PUE is 1.0; typical values range from 1.2 to 1.8.

- The EWMA chart smooths short-term fluctuations (load spikes, weather) to reveal true efficiency trends.
- A rising EWMA trend indicates degrading infrastructure — cooling loss, airflow issues, or equipment aging.
- The target line represents the facility's design PUE.

**Talking point:** A 0.05 PUE increase on a 10MW facility costs roughly $200K/year in wasted electricity. EWMA catches this drift weeks before monthly energy reports do.

| Lambda | Use Case |
|---|---|
| 0.05-0.1 | Long-term efficiency tracking (weekly trends) |
| 0.2-0.3 | Medium-term (daily shifts in cooling performance) |
| 0.4+ | Short-term responsiveness (reacts to rapid changes) |

### 2. Anomaly Detection — HVAC Failure Prediction

> Open the **Supply Air Temperature** or **CRAH Unit** characteristic. Toggle **AI Insights** in the toolbar.

- PELT changepoint detection identifies when a cooling unit's behavior changed — often days before outright failure.
- The anomaly event list shows detected events with timestamps and severity.
- Pattern: a changepoint followed by increasing variance often indicates a compressor or fan bearing in early failure.

**Talking point:** Unplanned HVAC downtime in a data center can cost $5-10K per minute. Catching a degrading CRAH unit 48 hours early allows scheduled maintenance during a maintenance window.

### 3. Push Notification Alerts

> Navigate to **Settings > Notifications**.

- Configure push notification subscriptions for violation events.
- When a CUSUM or EWMA limit is breached, on-call engineers receive a browser push notification immediately.
- Also configurable: email alerts (SMTP) and webhook integrations (PagerDuty, Slack via webhook).

**Demo flow:**
1. Show the notification preferences panel.
2. Point out the event types: violation, anomaly, system alerts.
3. Explain the escalation path: push for immediate, email for summary, webhook for ticketing integration.

### 4. CUSUM for Chiller Degradation

> Find the **Chiller Delta-T** or **Cooling Efficiency** characteristic.

- Chiller degradation is a slow, one-directional process — performance drops gradually as refrigerant leaks or condensers foul.
- CUSUM is ideal because it accumulates small deviations that Shewhart charts ignore.
- A rising CUSUM value on delta-T (supply minus return temperature) means the chiller is working harder for the same cooling effect.

### 5. Multi-Plant for Campus Operations

> Click the **plant switcher** in the header.

- Data centers often operate multiple facilities or buildings.
- Each plant has isolated data, configuration, and user permissions.
- Engineers may have access to all sites while operators see only their assigned building.

## Quick Reference Checklist

- [ ] EWMA PUE — smoothing lambda, efficiency drift, cost impact
- [ ] Anomaly detection — PELT changepoints on HVAC, early failure warning
- [ ] Push notifications — browser push, email, webhook escalation
- [ ] CUSUM chiller — one-sided degradation, delta-T monitoring
- [ ] Multi-plant — campus-level plant switching, role isolation
- [ ] Show Your Work — verify EWMA computation trace and lambda parameter
