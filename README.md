```
  ██████╗  █████╗  ██████╗ ██████╗ ██╗███╗   ██╗██╗
 ██╔════╝ ██╔══██╗██╔════╝██╔════╝ ██║████╗  ██║██║
 ██║      ███████║╚█████╗ ╚█████╗  ██║██╔██╗ ██║██║
 ██║      ██╔══██║ ╚═══██╗ ╚═══██╗ ██║██║╚██╗██║██║
 ╚██████╗ ██║  ██║██████╔╝██████╔╝ ██║██║ ╚████║██║
  ╚═════╝ ╚═╝  ╚═╝╚═════╝ ╚═════╝  ╚═╝╚═╝  ╚═══╝╚═╝

 ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌ UCL
       ●            ●                          ●
 ● ╌╌╌╌╌╌╌ ● ╌╌╌╌╌╌╌╌ ● ╌╌╌╌╌ ● ╌╌╌╌╌╌╌╌ ● ╌ ●    CL
                 ●               ●
 ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌ LCL

 Statistical Process Control Platform
 by Saturnis LLC
```

![Python](https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?logo=fastapi&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)
![License](https://img.shields.io/badge/License-Open_Source-green)

# Cassini

An open-source Statistical Process Control platform by Saturnis LLC. Monitor process stability, detect out-of-control conditions with Nelson rules, and manage quality data across one or many sites.

*"In-control, like the Cassini Division"*

![Cassini Dashboard](docs/images/dashboard.png)

---

## Features

**Control Charts** -- X-bar, X-bar & R, X-bar & S, I-MR, p, np, c, u charts rendered on HTML5 canvas with zone shading, gradient lines, cross-chart hover sync, and resizable panels.

**Nelson Rules Engine** -- All 8 Western Electric / Nelson rules evaluated in real time. Each rule is individually configurable with optional acknowledgment workflows and severity levels.

**Real-Time Updates** -- WebSocket push for instant chart updates. No polling -- charts refresh the moment new data arrives, with automatic reconnection and heartbeat monitoring.

**Industrial Connectivity** -- MQTT / Sparkplug B and OPC-UA support with multi-broker and multi-server management, topic and node browsing, tag-to-characteristic mapping, live value preview, and a unified Connectivity Hub UI.

**Multi-Database Support** -- SQLite (default), PostgreSQL, MySQL, and MSSQL with encrypted credential storage, one-click switching, and a database administration panel (backup, vacuum, migration status).

**MQTT Outbound Publishing** -- Publish SPC events (violations, statistics, Nelson rule triggers) to configurable MQTT topics with rate control and per-event filtering.

**Multi-Plant Management** -- ISA-95 equipment hierarchy, plant-scoped data isolation, and per-plant role-based access control across four tiers (Operator, Supervisor, Engineer, Admin).

**Electronic Signatures (21 CFR Part 11)** -- Configurable multi-step signature workflows with password re-authentication, SHA-256 tamper detection, plant-scoped signature meanings, and FDA-compliant password policies. Every signature is immutable and verifiable through the audit trail.

**AI/ML Anomaly Detection** -- Three machine learning detectors (PELT changepoint, Kolmogorov-Smirnov distribution shift, Isolation Forest outlier) run per-characteristic with configurable sensitivity. Detected anomalies overlay directly on control charts and integrate with the notification system.

**Reports & Export** -- PDF, Excel, and PNG export with built-in report templates. Kiosk mode and wall dashboard for shop-floor displays with auto-rotation and keyboard navigation.

---

## Quick Start

**Prerequisites:** Python 3.11+, Node.js 18+, Git

```bash
# Clone and start the backend
git clone https://github.com/djbrandl/Cassini.git
cd Cassini/backend
python -m venv .venv && .venv/Scripts/activate   # Windows
# source .venv/bin/activate                       # macOS/Linux
pip install -e .
alembic upgrade head
uvicorn cassini.main:app --reload --host 0.0.0.0 --port 8000

# In a new terminal, start the frontend
cd Cassini/frontend
npm install && npm run dev
```

Open **http://localhost:5173** and log in with `admin` / `password`.

> For platform-specific startup scripts, see [Getting Started](docs/getting-started.md).

---
