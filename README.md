```
  ██████╗ ██████╗ ███████╗███╗   ██╗███████╗██████╗  ██████╗
 ██╔═══██╗██╔══██╗██╔════╝████╗  ██║██╔════╝██╔══██╗██╔════╝
 ██║   ██║██████╔╝█████╗  ██╔██╗ ██║███████╗██████╔╝██║
 ██║   ██║██╔═══╝ ██╔══╝  ██║╚██╗██║╚════██║██╔═══╝ ██║
 ╚██████╔╝██║     ███████╗██║ ╚████║███████║██║     ╚██████╗
  ╚═════╝ ╚═╝     ╚══════╝╚═╝  ╚═══╝╚══════╝╚═╝      ╚═════╝

 ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  UCL
       ●            ●                       ●
 ● ─ ─ ─ ─ ● ─ ─ ─ ─ ─ ● ─ ─ ─ ● ─ ─ ─ ─ ─ ● ─ ●     CL
                 ●              ●
 ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  LCL

 Statistical Process Control Platform
```

![Python](https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?logo=fastapi&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)
![License](https://img.shields.io/badge/License-Open_Source-green)

# OpenSPC

An open-source Statistical Process Control platform. Monitor process stability, detect out-of-control conditions with Nelson rules, and manage quality data across one or many sites.

![OpenSPC Dashboard](docs/images/dashboard.png)

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
git clone https://github.com/djbrandl/OpenSPC.git
cd OpenSPC/backend
python -m venv .venv && .venv/Scripts/activate   # Windows
# source .venv/bin/activate                       # macOS/Linux
pip install -e .
alembic upgrade head
uvicorn openspc.main:app --reload --host 0.0.0.0 --port 8000

# In a new terminal, start the frontend
cd OpenSPC/frontend
npm install && npm run dev
```

Open **http://localhost:5173** and log in with `admin` / `password`.

> For platform-specific startup scripts, see [Getting Started](docs/getting-started.md).

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Python 3.11+, FastAPI, SQLAlchemy 2.0 (async), Alembic |
| **Frontend** | React 19, TypeScript 5.9, Vite 7, Tailwind CSS 4 |
| **Charts** | ECharts 6 (canvas rendering) |
| **State** | TanStack Query (server), Zustand (client) |
| **Database** | SQLite (default), PostgreSQL (asyncpg), MySQL (aiomysql), MSSQL (aioodbc) |
| **Real-time** | WebSockets, MQTT / Sparkplug B, OPC-UA (asyncua) |
| **Auth** | JWT + httpOnly refresh cookies, Argon2 password hashing |

---

## Documentation

- [Getting Started](docs/getting-started.md) -- Installation and first run
- [User Guide](docs/user-guide.md) -- Features and workflows
- [Administration Guide](docs/administration.md) -- User management, roles, and plant configuration
- [Architecture](docs/architecture.md) -- System design with diagrams
- [API Reference](docs/api-reference.md) -- REST API and WebSocket protocol
- [Deployment Guide](docs/deployment.md) -- Production deployment (single server to Kubernetes)
- [Development Guide](docs/development.md) -- Contributing, testing, and project structure
- [Electronic Signatures](docs/electronic-signatures.md) -- 21 CFR Part 11 compliance
- [Anomaly Detection](docs/anomaly-detection.md) -- AI/ML process monitoring
- [Roadmap](docs/TODO.md) -- Planned features and known issues

---

## Contributing

Contributions are welcome. See the [Development Guide](docs/development.md) for setup instructions, project structure, and coding conventions.

---

## License

This project is open source. See [LICENSE](LICENSE) for details.
