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

# OpenSPC

**An open-source, real-time Statistical Process Control platform for manufacturing and process industries.**

OpenSPC brings SPC charting, Nelson rule violation detection, and process monitoring to any team that needs to track quality — from a single machine in a small shop to a multi-site enterprise. It is designed for **quality engineers**, **process engineers**, **production supervisors**, and **operators** who need to monitor process stability, detect out-of-control conditions, and drive continuous improvement.

Built as a modern web application with a Python backend and React frontend, OpenSPC runs anywhere — on a factory-floor PC, a cloud VM, or a Raspberry Pi. No proprietary licenses, no vendor lock-in.

---

## Features

### Control Charts

| Chart Type | Description | Use Case |
|------------|-------------|----------|
| **X-bar** | Subgroup means | Monitoring process center |
| **X-bar & R** | Means + Range (dual chart) | Small subgroups (n < 10) |
| **X-bar & S** | Means + Std Dev (dual chart) | Larger subgroups (n >= 10) |
| **I-MR** | Individuals + Moving Range | Single measurements |
| **p** | Proportion defective | Attribute data (variable sample) |
| **np** | Count defective | Attribute data (fixed sample) |
| **c** | Defects per unit | Count data (fixed opportunity) |
| **u** | Defects per unit | Count data (variable opportunity) |

All charts are rendered on HTML5 canvas via ECharts for high performance with thousands of data points. Charts include:

- **Control limits** (UCL/LCL) with automatic calculation using standard SPC constants (A2, D3, D4, c4, etc.)
- **Specification limits** (USL/LSL) with toggleable visibility
- **Zone shading** (A/B/C zones) for visual sigma-level reference
- **Distribution histogram** — vertical (right-side) or horizontal (below), synchronized with the control chart
- **Comparison mode** — overlay two characteristics on the same chart
- **Gradient line strokes** and custom point shapes (circles, diamonds for violations, triangles for undersized)
- **Cross-chart hover sync** — hovering a point on X-bar highlights the corresponding point on the Range chart
- **Resizable chart panels** — drag dividers between primary/secondary charts and histogram

### Nelson Rules Engine

All 8 Western Electric / Nelson rules are evaluated in real-time as samples arrive:

| Rule | Name | Condition | Severity |
|------|------|-----------|----------|
| 1 | Beyond 3σ | Single point outside control limits | CRITICAL |
| 2 | Zone Bias | 9 consecutive points on same side of center | WARNING |
| 3 | Trend | 6 consecutive points increasing or decreasing | WARNING |
| 4 | Oscillation | 14 consecutive points alternating up/down | WARNING |
| 5 | Zone A Pattern | 2 of 3 points beyond 2σ | WARNING |
| 6 | Zone B Pattern | 4 of 5 points beyond 1σ | WARNING |
| 7 | Zone C Stability | 15 consecutive points within 1σ (stratification) | INFO |
| 8 | Mixed Zones | 8 consecutive points outside Zone C | WARNING |

Each rule can be individually enabled/disabled and configured to require acknowledgment. Violation sparkline visualizations show the characteristic pattern for each rule.

### Plant & Hierarchy Management

- **Multi-plant support** — manage multiple sites/facilities, each with isolated data
- **ISA-95 hierarchy** — Enterprise > Site > Area > Line > Cell > Equipment, fully configurable
- **Plant-scoped roles** — users can have different roles at different plants
- **Hierarchy-based navigation** — browse characteristics by location in the equipment tree

### User Management & Roles

Four-tier role hierarchy with granular permissions:

| Role | Permissions |
|------|-------------|
| **Operator** | View charts, add annotations, manual data entry |
| **Supervisor** | + Edit samples, exclude/restore samples, acknowledge violations |
| **Engineer** | + Configure characteristics, limits, sampling, Nelson rules |
| **Admin** | + Manage users, plants, hierarchy, system configuration |

- JWT authentication with httpOnly refresh cookie
- Per-plant role assignments (a user can be Operator at Plant A, Engineer at Plant B)
- Admin bootstrap on first run

### Real-Time Updates

- **WebSocket push** — new samples, violations, and acknowledgments stream to connected clients instantly
- **Automatic chart refresh** — no polling; charts update the moment new data arrives
- **Connection management** — heartbeat monitoring, automatic reconnection with exponential backoff

### Sample Inspector

Click any data point on a control chart to open the Sample Inspector modal:

- **Overview** — mean value (color-coded by zone), metadata, status chips (in control, excluded, modified)
- **Measurements** — individual measurement grid with mini distribution chart, inline editing (supervisor+)
- **Violations** — rule details with sparkline pattern visualization, acknowledgment workflow
- **Annotations** — view/add/edit/delete notes with full edit history timeline
- **Edit History** — who changed what, when, and why (before/after diffs)

### Annotations

- **Point annotations** — attach notes to specific data points
- **Period annotations** — mark time ranges on the chart (shift changes, material lots, etc.)
- **Edit history** — full audit trail of annotation changes
- **Visual indicators** — annotations render as markers on the chart

### Reports & Export

- **PDF export** — generate reports with chart snapshots, statistics, and violation summaries
- **Excel export** — download sample data with full measurement details
- **Kiosk mode** — fullscreen dashboard for shop-floor displays

### Industrial Connectivity

- **MQTT / Sparkplug B** — connect to industrial brokers for automatic data ingestion
- **Multi-broker support** — configure and manage multiple MQTT broker connections
- **Topic discovery** — browse available topics and metrics from connected brokers
- **Tag mapping** — map broker tags/metrics to OpenSPC characteristics with live preview

### Theming & Customization

- **Dark/light mode** with system preference detection
- **Customizable chart colors** — primary, secondary, and zone colors
- **Responsive layout** — works on desktop, tablet, and large-format displays

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Python 3.11+, FastAPI, SQLAlchemy 2.0 (async), Alembic |
| **Frontend** | React 19, TypeScript 5.9, Vite 7, Tailwind CSS 4 |
| **Charts** | ECharts 6 (canvas rendering) |
| **State** | TanStack Query (server), Zustand (client) |
| **Database** | SQLite (default), any SQLAlchemy-compatible DB |
| **Real-time** | WebSockets, MQTT |
| **Auth** | JWT + httpOnly refresh cookies, bcrypt/argon2 |

---

## Quick Start

### Prerequisites

- **Python** 3.11 or later
- **Node.js** 18 or later (with npm)
- **Git**

### 1. Clone the repository

```bash
git clone https://github.com/djbrandl/OpenSPC.git
cd OpenSPC
```

### 2. Start the backend

**Windows:**
```cmd
cd backend
start.bat
```

**macOS / Linux:**
```bash
cd backend
chmod +x start.sh
./start.sh
```

**Or manually:**
```bash
cd backend
python -m venv .venv

# Activate the virtual environment
source .venv/bin/activate        # macOS/Linux
.venv\Scripts\activate.bat       # Windows

# Install dependencies
pip install -e .

# Run database migrations
alembic upgrade head

# Start the server
uvicorn openspc.main:app --reload --host 0.0.0.0 --port 8000
```

The backend will be available at **http://localhost:8000** with API docs at **http://localhost:8000/docs**.

### 3. Start the frontend

Open a new terminal:

**Windows:**
```cmd
cd frontend
start.bat
```

**macOS / Linux:**
```bash
cd frontend
chmod +x start.sh
./start.sh
```

**Or manually:**
```bash
cd frontend
npm install
npm run dev
```

The frontend will be available at **http://localhost:5173**.

### 4. Log in

Default credentials (configurable via environment variables):

| | |
|---|---|
| **Username** | `admin` |
| **Password** | `password` |

---

## Environment Variables

All backend environment variables use the `OPENSPC_` prefix. They can be set in the shell, in a `.env` file in the `backend/` directory, or via the start scripts.

### Core

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENSPC_DATABASE_URL` | `sqlite+aiosqlite:///./openspc.db` | SQLAlchemy async database URL |
| `OPENSPC_JWT_SECRET` | *(auto-generated)* | Secret key for signing JWT tokens. **Set this in production.** |
| `OPENSPC_APP_VERSION` | `0.3.0` | Version string returned by the API |

### Authentication

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENSPC_ADMIN_USERNAME` | `admin` | Username for the bootstrap admin account |
| `OPENSPC_ADMIN_PASSWORD` | *(required on first run)* | Password for the bootstrap admin account |
| `OPENSPC_COOKIE_SECURE` | `false` | Set to `true` for HTTPS deployments (marks refresh cookie as Secure) |

### CORS

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENSPC_CORS_ORIGINS` | `http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:3000` | Comma-separated list of allowed frontend origins |

### Development

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENSPC_SANDBOX` | `false` | Enables dev tools: database reset, seed scripts (`/api/v1/devtools`) |

---

## Project Structure

```
OpenSPC/
├── backend/
│   ├── src/openspc/
│   │   ├── main.py              # FastAPI application entry point
│   │   ├── core/
│   │   │   ├── config.py        # Settings (pydantic-settings)
│   │   │   ├── auth.py          # JWT + password hashing
│   │   │   └── events.py        # Event bus for real-time updates
│   │   ├── api/v1/              # API route handlers
│   │   │   ├── auth.py          # Login, refresh, logout
│   │   │   ├── samples.py       # Sample CRUD + data entry
│   │   │   ├── violations.py    # Nelson rule violations
│   │   │   ├── annotations.py   # Chart annotations
│   │   │   ├── hierarchy.py     # Equipment hierarchy
│   │   │   ├── characteristics.py
│   │   │   ├── brokers.py       # MQTT broker management
│   │   │   ├── tags.py          # Tag mapping
│   │   │   └── websocket.py     # WebSocket connections
│   │   ├── db/
│   │   │   ├── models/          # SQLAlchemy models
│   │   │   └── database.py      # Async engine + session factory
│   │   ├── spc/
│   │   │   ├── engine.py        # SPC calculation engine
│   │   │   └── nelson_rules.py  # Nelson rule evaluation
│   │   └── connectivity/
│   │       ├── mqtt_manager.py  # MQTT broker connections
│   │       └── sparkplug_b/     # Sparkplug B protocol support
│   ├── alembic/                 # Database migrations
│   ├── tests/                   # Backend test suite
│   ├── examples/                # Integration examples
│   ├── start.bat                # Windows startup script
│   ├── start.sh                 # Unix startup script
│   └── pyproject.toml           # Python project configuration
│
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   │   ├── client.ts        # API client with auth/refresh handling
│   │   │   └── hooks.ts         # TanStack Query hooks
│   │   ├── components/
│   │   │   ├── ControlChart.tsx  # Main SPC chart (ECharts)
│   │   │   ├── DistributionHistogram.tsx
│   │   │   ├── SampleInspectorModal.tsx
│   │   │   ├── charts/
│   │   │   │   ├── DualChartPanel.tsx
│   │   │   │   └── RangeChart.tsx
│   │   │   └── characteristic-config/
│   │   │       ├── LimitsTab.tsx
│   │   │       ├── SamplingTab.tsx
│   │   │       ├── RulesTab.tsx
│   │   │       └── NelsonSparklines.tsx
│   │   ├── pages/
│   │   │   ├── OperatorDashboard.tsx
│   │   │   ├── ReportsView.tsx
│   │   │   └── ...
│   │   ├── providers/
│   │   │   ├── AuthProvider.tsx
│   │   │   ├── PlantProvider.tsx
│   │   │   └── WebSocketProvider.tsx
│   │   ├── stores/              # Zustand stores
│   │   ├── hooks/               # Custom React hooks
│   │   ├── lib/                 # Utilities, constants
│   │   └── types/               # TypeScript type definitions
│   ├── start.bat                # Windows startup script
│   ├── start.sh                 # Unix startup script
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── package.json
│
└── README.md
```

---

## API Documentation

When the backend is running, interactive API documentation is available at:

- **Swagger UI** — http://localhost:8000/docs
- **ReDoc** — http://localhost:8000/redoc
- **Health check** — http://localhost:8000/health

### Key API Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /api/v1/auth/login` | Authenticate and receive JWT tokens |
| `GET /api/v1/plants` | List all plants |
| `GET /api/v1/hierarchy/tree` | Get equipment hierarchy tree |
| `GET /api/v1/characteristics/{id}` | Get characteristic details |
| `GET /api/v1/characteristics/{id}/chart-data` | Get chart data with control limits |
| `POST /api/v1/samples` | Submit a new sample |
| `GET /api/v1/violations` | Query rule violations |
| `POST /api/v1/annotations` | Create an annotation |
| `GET /api/v1/brokers` | List MQTT broker connections |
| `WS /api/v1/websocket/connect` | WebSocket for real-time updates |

---

## Database

OpenSPC uses **SQLite** by default — no database server to install or configure. The database file (`openspc.db`) is created automatically in the `backend/` directory on first run.

For production deployments, you can point `OPENSPC_DATABASE_URL` to PostgreSQL or any other SQLAlchemy-compatible async database:

```bash
# PostgreSQL example
OPENSPC_DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/openspc
```

### Migrations

Database schema is managed by Alembic. Migrations run automatically via the start scripts, or manually:

```bash
cd backend
alembic upgrade head      # Apply all migrations
alembic downgrade -1      # Roll back one migration
alembic history           # View migration history
```

---

## Development

### Running Tests

```bash
cd backend
pip install -e ".[dev]"
pytest
```

### Linting

```bash
# Backend
cd backend
ruff check src/
mypy src/

# Frontend
cd frontend
npm run lint
```

### Building for Production

```bash
cd frontend
npm run build
# Output in frontend/dist/
```

The production build can be served by any static file server, or by the FastAPI backend with a static mount.

---

## License

This project is open source. See [LICENSE](LICENSE) for details.
