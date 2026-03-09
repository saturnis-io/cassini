```
  ██████╗  █████╗  ██████╗ ██████╗ ██╗███╗   ██╗██╗
 ██╔════╝ ██╔══██╗██╔════╝██╔════╝ ██║████╗  ██║██║
 ██║      ███████║╚█████╗ ╚█████╗  ██║██╔██╗ ██║██║
 ██║      ██╔══██║ ╚═══██╗ ╚═══██╗ ██║██║╚██╗██║██║
 ╚██████╗ ██║  ██║██████╔╝██████╔╝ ██║██║ ╚████║██║
  ╚═════╝ ╚═╝  ╚═╝╚═════╝ ╚═════╝  ╚═╝╚═╝  ╚═══╝╚═╝

 Statistical Process Control Platform
 by Saturnis LLC
```

![Python](https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![FastAPI](https://img.shields.io/badge/FastAPI-0.109+-009688?logo=fastapi&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)
![ECharts](https://img.shields.io/badge/ECharts-6-AA344D?logo=apacheecharts&logoColor=white)
![License](https://img.shields.io/badge/License-AGPL--3.0-blue)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)

# Cassini

**Open-source statistical process control for manufacturing. Free forever, commercially supported.**

Monitor process stability, detect out-of-control conditions, run capability studies, and manage quality data across your manufacturing operation — from a single control chart to a regulated multi-plant deployment.

*"In-control, like the Cassini Division."*

> **Open-core model**: The Community Edition is free under AGPL-3.0 and includes a complete SPC platform. [Commercial licenses](LICENSE-COMMERCIAL.md) unlock multi-plant, compliance, and advanced analytics features for organizations that need them.

---

## Quick Start

**Prerequisites:** Python 3.11+, Node.js 18+, Git

```bash
# Clone the repository
git clone https://github.com/saturnis-io/cassini.git
cd cassini

# Start the backend
cd backend
python -m venv .venv && .venv/Scripts/activate   # Windows
# source .venv/bin/activate                       # macOS/Linux
pip install -e .
alembic upgrade head
uvicorn cassini.main:app --reload --host 0.0.0.0 --port 8000

# In a new terminal, start the frontend
cd frontend
npm install && npm run dev
```

Open **http://localhost:5173** and log in with `admin` / `password`.

### Docker

```bash
docker compose up -d
```

The compose file starts the app with PostgreSQL. See [CONTRIBUTING.md](CONTRIBUTING.md) for configuration details.

---

## Community Edition (Free, AGPL-3.0)

Everything you need for production SPC — no license key required.

### Control Charts & SPC Engine

Real-time control charts rendered on HTML5 canvas with zone shading, gradient lines, cross-chart hover sync, and resizable panels. WebSocket push means charts update the moment new data arrives.

- **Variable charts**: X-bar, X-bar & R, X-bar & S, I-MR, CUSUM, EWMA
- **Attribute charts**: p, np, c, u with Laney p'/u' overdispersion correction
- **Nelson Rules**: All 8 Nelson / WECO / AIAG rules individually configurable per characteristic with parameterized thresholds
- **Short-run charts**: Deviation mode and standardized Z-score mode for low-volume, high-mix production
- **Annotations**: Point and period annotations with categories and descriptions
- **Show Your Work**: Click any statistical value to see the formula (KaTeX-rendered), step-by-step computation, raw inputs, and AIAG citation

### Capability Analysis

Full process capability with Cp, Cpk, Pp, Ppk, and Cpm. Color-coded capability metrics with trend charting and full computation traceability via Show Your Work.

- Snapshot history for tracking capability over time
- Subgroup and individual measurement modes

### Violations & Nelson Rules

Violations are detected in real time as data flows in. Each violation references the specific Nelson rule triggered, the sample that caused it, and the characteristic's current state. Bulk acknowledgment, filtering by severity/status/rule, and one-click navigation to the offending chart point.

### Data Entry

Multiple paths to get data into the system:

- **Manual entry**: Form-based sample submission with validation
- **CSV/Excel import**: 4-step wizard (upload, validate, map columns, confirm)
- **MQTT / Sparkplug B**: Automatic via connectivity mappings (single broker in Community)
- **API**: RESTful endpoints for programmatic integration

### MQTT Connectivity

Native MQTT and Sparkplug B support with topic tree browsing, tag-to-characteristic mapping, and live value preview. Community Edition includes one broker connection; commercial unlocks unlimited brokers.

### Equipment Hierarchy

ISA-95 / UNS-compatible equipment hierarchy (Enterprise > Site > Area > Line > Cell > Equipment) with characteristics as leaves. Create, move, and organize your plant structure visually.

### User Management & RBAC

Plant-scoped role-based access control across four tiers:

| Role | Access |
|------|--------|
| **Operator** | Dashboard, data entry, violations |
| **Supervisor** | + Reports |
| **Engineer** | + Configuration, settings, connectivity |
| **Admin** | + User management, all plants |

### Database

SQLite (default, zero-config) included with Community Edition. PostgreSQL, MySQL, and MSSQL available with commercial license. Database administration panel for backup, vacuum, and migration status.

### Audit Trail

Fire-and-forget middleware captures every data modification with user, timestamp, and action detail. Event bus integration logs background operations. Searchable viewer with filters and CSV export.

### Reports & Display Modes

- **Reports**: PDF, Excel, and PNG export with built-in templates
- **Kiosk Mode**: Full-screen auto-rotating characteristic display for factory floor monitors
- **Wall Dashboard**: Multi-chart grid layouts (2x2, 3x3, 4x4) with saved presets for control room displays

### Infrastructure

- **Docker**: Production-ready multi-stage Dockerfile + docker-compose with PostgreSQL
- **REST API**: 300+ endpoints for full programmatic access
- **WebSocket**: Real-time push for chart updates and notifications
- **PWA**: Progressive web app with offline queue support

---

## Commercial Features

> Unlock additional capabilities with a [commercial license](LICENSE-COMMERCIAL.md) at $299/site/month. [Learn more](https://saturnis.io/pricing).

### Industrial Connectivity Hub

A unified Connectivity Hub manages all data sources with a visual data flow pipeline showing source health, ingestion metrics, and SPC engine status at a glance.

- **Unlimited MQTT Brokers**: Multi-broker management for complex industrial networks
- **OPC-UA**: Multi-server management, node tree browsing, subscription-to-SPC engine pipeline with priority triggers
- **RS-232/USB Gages**: Python bridge agent (`cassini-bridge` pip package) translates serial gage protocols (Mitutoyo Digimatic, generic regex) to MQTT on shop floor PCs
- **ERP/LIMS**: SAP OData, Oracle REST, generic LIMS, and webhook adapters with cron-based sync scheduling

### Non-Normal Distribution Fitting

Automatic non-normal distribution handling via Shapiro-Wilk normality testing, Box-Cox transformation, and 6-distribution auto-fitting (normal, lognormal, Weibull, gamma, exponential, beta). Includes distribution analysis modal with histogram, Q-Q plot, and comparison table.

### Run Rule Preset Management

Standardize rule configuration across your plant with four built-in presets (Nelson, AIAG, WECO, Wheeler) and the ability to create custom presets. Apply and manage rule configurations in bulk.

### Quality Studies

**Measurement System Analysis (Gage R&R)** — Crossed ANOVA, range method, nested ANOVA, and attribute agreement analysis (Cohen's and Fleiss' Kappa). Uses AIAG MSA 4th Edition d2* tables. Full wizard from study setup through results interpretation.

**First Article Inspection** — AS9102 Rev C compliant inspection reports with Forms 1, 2, and 3. Draft-to-submitted-to-approved workflow with separation of duties enforcement. Print-optimized view for physical records.

**Design of Experiments** — Full factorial, fractional factorial, Plackett-Burman, and central composite designs. Interactive design matrix, run table, ANOVA results, main effects plot, and interaction plots.

### Advanced Analytics

- **Correlation**: Multi-variate correlation heatmap across characteristics
- **Multivariate SPC**: PCA biplot, Hotelling T-squared chart, MEWMA, decomposition table
- **Predictions**: Time series forecasting with ARIMA/Prophet overlay on control charts
- **AI Insights**: LLM-generated analysis with guardrails for responsible interpretation
- **Ishikawa Diagrams**: Interactive fishbone (cause-and-effect) diagrams for root cause analysis

### AI/ML Anomaly Detection

Three machine learning detectors per characteristic:

- **PELT Changepoint**: Detects abrupt shifts in process mean or variance
- **Kolmogorov-Smirnov**: Identifies distribution drift over sliding windows
- **Isolation Forest**: Spots multivariate outliers invisible to univariate rules

Anomalies overlay directly on control charts and integrate with the notification system.

### Enterprise Compliance

**Electronic Signatures (21 CFR Part 11)** — Configurable multi-step signature workflows with password re-authentication, SHA-256 tamper detection, plant-scoped signature meanings, and FDA-compliant password policies.

**Data Retention** — Configurable retention policies with inheritance chain (global > plant > area > line > station). Purge engine with full history tracking for regulatory compliance.

### Multi-Plant, SSO & Operations

- **Multi-database**: PostgreSQL, MySQL, and MSSQL with encrypted credential storage (Fernet) and one-click switching
- **Multi-plant**: Manage multiple sites from a single deployment
- **SSO/OIDC**: Multiple identity providers, claim mapping, plant-scoped role mapping, account linking
- **Notifications**: Email, HMAC-signed webhooks, and PWA push notifications
- **Scheduled Reports**: Cron-based report scheduling with email delivery

---

## Feature Comparison

| Feature | Community | Commercial |
|---------|:---------:|:----------:|
| **SPC Engine** | | |
| Control charts (X-bar, R, S, I-MR, CUSUM, EWMA, p/np/c/u) | Yes | Yes |
| Capability analysis (Cp, Cpk, Pp, Ppk, Cpm) | Yes | Yes |
| Nelson / WECO / AIAG run rules | Yes | Yes |
| Short-run SPC (deviation + Z-score) | Yes | Yes |
| Show Your Work (computation transparency) | Yes | Yes |
| Non-normal distribution fitting | — | Yes |
| Run rule preset management | — | Yes |
| **Data** | | |
| Manual data entry | Yes | Yes |
| MQTT / Sparkplug B connectivity | 1 broker | Unlimited |
| OPC-UA connectivity | — | Yes |
| RS-232 / USB gage bridge | — | Yes |
| ISA-95 plant hierarchy | Single plant | Multi-plant |
| **Quality Systems** | | |
| MSA / Gage R&R | — | Yes |
| First Article Inspection (AS9102) | — | Yes |
| Electronic signatures (21 CFR Part 11) | — | Yes |
| DOE (Design of Experiments) | — | Yes |
| **Analytics & Reporting** | | |
| Dashboard & violation tracking | Yes | Yes |
| Anomaly detection (ML) | — | Yes |
| Multivariate SPC (T-squared, MEWMA) | — | Yes |
| AI-powered analysis | — | Yes |
| Predictive analytics | — | Yes |
| Scheduled & automated reporting | — | Yes |
| Ishikawa root cause diagrams | — | Yes |
| **Administration** | | |
| User management & RBAC | Yes | Yes |
| Audit trail | Yes | Yes |
| SSO / OIDC | — | Yes |
| Data retention policies | — | Yes |
| ERP / MES integration | — | Yes |
| Push notifications | — | Yes |
| **Infrastructure** | | |
| Database | SQLite | PostgreSQL, MSSQL, MySQL |
| REST API (300+) | Yes | Yes |
| Source code access | Yes | Yes |
| Modification rights | AGPL (share-alike) | Proprietary |
| Support | Community (GitHub) | Dedicated with SLA |
| | **Free** | **$299/site/mo** |

> Need custom terms, on-premise deployment assistance, validation documentation, or SLA guarantees? [Contact sales](mailto:sales@saturnis.io).

---

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                        Data Sources                            │
│  MQTT/SparkplugB  OPC-UA  RS-232 Gages  CSV/Excel  ERP/LIMS  │
└──────────────────────────┬─────────────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────────────┐
│                    FastAPI Backend                              │
│  JWT Auth · RBAC · Audit Middleware · Rate Limiting             │
│                                                                │
│  ┌─────────────┐ ┌──────────────┐ ┌──────────────┐            │
│  │ SPC Engine   │ │ Capability   │ │ MSA Engine   │            │
│  │ 8 Nelson     │ │ Non-normal   │ │ Gage R&R     │            │
│  │ rules        │ │ distributions│ │ ANOVA        │            │
│  └─────────────┘ └──────────────┘ └──────────────┘            │
│  ┌─────────────┐ ┌──────────────┐ ┌──────────────┐            │
│  │ Anomaly Det.│ │ Signature    │ │ Notification  │            │
│  │ PELT/KS/IF  │ │ Engine       │ │ Dispatcher    │            │
│  └─────────────┘ └──────────────┘ └──────────────┘            │
│                                                                │
│  Event Bus ──── WebSocket · Notifications · Audit · MQTT Out   │
│                                                                │
│  SQLAlchemy Async ── SQLite / PostgreSQL / MySQL / MSSQL       │
└────────────────────────────────────────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────────────┐
│                    React Frontend                               │
│  TanStack Query · Zustand · ECharts 6 · Zod · Tailwind CSS    │
│                                                                │
│  22 pages · 200+ components · 240+ React Query hooks           │
│  PWA with push notifications and offline queue                 │
└────────────────────────────────────────────────────────────────┘
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Python 3.11+, FastAPI, SQLAlchemy async, Alembic, Pydantic |
| **Frontend** | React 19, TypeScript 5.9, Vite 7, TanStack Query v5, Zustand v5 |
| **Charts** | ECharts 6 (tree-shaken, canvas renderer) |
| **Validation** | Zod v4 (frontend), Pydantic v2 (backend) |
| **Styling** | Tailwind CSS v4 with retro and glass visual themes |
| **Bridge** | Python, pyserial, paho-mqtt (pip-installable `cassini-bridge`) |
| **Database** | SQLite, PostgreSQL, MySQL, MSSQL via dialect abstraction |
| **Real-time** | WebSocket (FastAPI native), MQTT (paho-mqtt / asyncio-mqtt) |
| **ML** | ruptures (changepoint), scikit-learn (Isolation Forest), scipy |

### Monorepo Structure

```
cassini/
├── backend/           FastAPI application
│   ├── src/cassini/
│   │   ├── api/       Routers, schemas, dependencies
│   │   ├── core/      SPC engine, capability, MSA, anomaly, signatures
│   │   └── db/        Models, repositories, migrations
│   └── alembic/       59 database migrations
├── frontend/          React SPA
│   └── src/
│       ├── api/       API client, hooks, namespaces (21 API modules)
│       ├── components/ 200+ components organized by domain
│       ├── pages/     22 page components
│       ├── stores/    Zustand state stores
│       └── hooks/     Custom React hooks
├── bridge/            Serial gage → MQTT translator
│   └── src/cassini_bridge/
│       ├── cli.py           CLI interface
│       ├── config.py        Configuration loading (YAML + env vars)
│       ├── parsers.py       Mitutoyo Digimatic, generic regex
│       ├── serial_reader.py Serial port reading
│       ├── mqtt_publisher.py MQTT publishing
│       └── runner.py        Main bridge agent loop
└── docs/              Documentation and images
```

---

## Development

```bash
# Type checking (frontend)
cd frontend && npx tsc --noEmit

# Full build check
cd frontend && npx tsc -b

# Production build
cd frontend && npm run build

# Run backend with auto-reload
cd backend && uvicorn cassini.main:app --reload

# Run backend tests
cd backend && pytest tests/ -x

# New database migration
cd backend && alembic revision --autogenerate -m "description"

# Install bridge for development
cd bridge && pip install -e .
```

### Key Conventions

- **TypeScript**: Strict mode, `noUnusedLocals`, `noUnusedParameters`
- **Formatting**: Prettier — no semicolons, single quotes, trailing commas, 100 char width
- **Imports**: `@/` alias for `src/` (never relative cross-directory)
- **Components**: Function components, named exports, one per file
- **API paths**: Never include `/api/v1/` prefix in `fetchApi` calls (prepended automatically)

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full contribution guide.

---

## License & Commercial Use

Cassini is dual-licensed:

- **Community Edition**: [GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0)
- **Commercial License**: Available from [Saturnis LLC](https://saturnis.io/pricing)

### What This Means

The Community Edition is **genuinely free** and includes a complete SPC platform. Use it, deploy it, build on it.

The AGPL-3.0 is a strong copyleft license that ensures improvements stay open. The key requirement: **if you modify Cassini and make it available over a network — including internal company networks — the AGPL requires you to share your complete source code with all users.** This is what keeps open source sustainable.

If your organization needs to make proprietary modifications, embed Cassini in a closed-source product, or requires commercial features like electronic signatures and multi-plant management, a [commercial license](LICENSE-COMMERCIAL.md) removes the AGPL obligations and unlocks the full platform.

**Not sure which you need?** See the [Commercial License FAQ](LICENSE-COMMERCIAL.md#faq) or email [sales@saturnis.io](mailto:sales@saturnis.io).

---

## Links

| | |
|---|---|
| **Pricing** | [saturnis.io/pricing](https://saturnis.io/pricing) |
| **Commercial License** | [LICENSE-COMMERCIAL.md](LICENSE-COMMERCIAL.md) |
| **Contributing** | [CONTRIBUTING.md](CONTRIBUTING.md) |
| **Security** | [SECURITY.md](SECURITY.md) |
| **Code of Conduct** | [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) |
| **Support** | [community@saturnis.io](mailto:community@saturnis.io) |

---

Copyright 2026 [Saturnis LLC](https://saturnis.io). Built with FastAPI, React, ECharts, and statistical rigor.
