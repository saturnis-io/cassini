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
- **Comparison mode** — view two characteristics side by side with independent color schemes
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

## Production Deployment

This section covers deploying OpenSPC in a production environment. Choose the tier that matches your scale.

### Sizing Guide

| Tier | Users | Characteristics | Infrastructure | Database |
|------|-------|-----------------|----------------|----------|
| **Small** | 1–25 | < 100 | Single server | SQLite |
| **Medium** | 25–200 | 100–1,000 | 2–3 servers | PostgreSQL |
| **Large** | 200+ | 1,000+ | Containerized / HA | PostgreSQL (managed) |

---

### Common Steps (All Tiers)

#### 1. Build the frontend

On your build machine (or CI), produce the static bundle:

```bash
cd frontend
npm ci
npm run build
# Output: frontend/dist/
```

This generates a `dist/` directory of static HTML/JS/CSS files. These are served by Nginx — the Node.js runtime is **not** needed on the production server.

#### 2. Install the backend

```bash
cd backend
python -m venv /opt/openspc/venv
source /opt/openspc/venv/bin/activate
pip install -e .
```

#### 3. Generate a JWT secret

```bash
python -c "import secrets; print(secrets.token_urlsafe(64))"
```

Save this value — you'll use it in the environment file.

#### 4. Create the environment file

```bash
# /opt/openspc/.env
OPENSPC_JWT_SECRET=<your-generated-secret>
OPENSPC_ADMIN_USERNAME=admin
OPENSPC_ADMIN_PASSWORD=<strong-password>
OPENSPC_COOKIE_SECURE=true
OPENSPC_CORS_ORIGINS=https://spc.yourcompany.com
OPENSPC_SANDBOX=false
```

#### 5. Run migrations

```bash
cd /opt/openspc/backend
source /opt/openspc/venv/bin/activate
alembic upgrade head
```

---

### Small Deployment (Single Server)

A single Linux server running Nginx, the Python backend, and SQLite. Suitable for a single plant or lab with a handful of concurrent users.

**Server requirements:** 2 CPU cores, 4 GB RAM, 20 GB disk.

#### System layout

```
/opt/openspc/
├── backend/          # Python application + SQLite database
├── frontend/dist/    # Built static files
├── venv/             # Python virtual environment
└── .env              # Environment variables
```

#### systemd service — `/etc/systemd/system/openspc.service`

```ini
[Unit]
Description=OpenSPC Backend
After=network.target

[Service]
Type=exec
User=openspc
Group=openspc
WorkingDirectory=/opt/openspc/backend
EnvironmentFile=/opt/openspc/.env
ExecStart=/opt/openspc/venv/bin/uvicorn openspc.main:app \
    --host 127.0.0.1 \
    --port 8000 \
    --workers 2
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo useradd -r -s /usr/sbin/nologin openspc
sudo chown -R openspc:openspc /opt/openspc
sudo systemctl daemon-reload
sudo systemctl enable --now openspc
```

#### Nginx — `/etc/nginx/sites-available/openspc`

```nginx
server {
    listen 443 ssl http2;
    server_name spc.yourcompany.com;

    ssl_certificate     /etc/ssl/certs/openspc.crt;
    ssl_certificate_key /etc/ssl/private/openspc.key;

    # Frontend static files
    root /opt/openspc/frontend/dist;
    index index.html;

    # API and WebSocket → backend
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /ws/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }

    location /docs {
        proxy_pass http://127.0.0.1:8000;
    }

    location /openapi.json {
        proxy_pass http://127.0.0.1:8000;
    }

    location /health {
        proxy_pass http://127.0.0.1:8000;
    }

    # SPA fallback — serve index.html for client-side routes
    location / {
        try_files $uri $uri/ /index.html;
    }
}

server {
    listen 80;
    server_name spc.yourcompany.com;
    return 301 https://$host$request_uri;
}
```

```bash
sudo ln -s /etc/nginx/sites-available/openspc /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

#### SQLite considerations

SQLite works well at this scale. A few things to keep in mind:

- The database file lives at `/opt/openspc/backend/openspc.db` by default
- **Back up** the file with a cron job (copy while the app is idle, or use `sqlite3 .backup`)
- SQLite handles concurrent reads well but serializes writes — this is fine for < 25 users
- Ensure the `openspc` user has write permission to the directory containing the database

#### Backup cron — `/etc/cron.d/openspc-backup`

```cron
0 2 * * * openspc sqlite3 /opt/openspc/backend/openspc.db ".backup /opt/openspc/backups/openspc-$(date +\%Y\%m\%d).db"
0 3 * * 0 find /opt/openspc/backups -name "*.db" -mtime +30 -delete
```

---

### Medium Deployment (Separate Services)

Separate the database onto its own server (or use a managed PostgreSQL service). Multiple uvicorn workers handle increased concurrency. Suitable for multiple plants with dozens of active users.

**Server requirements:**
- App server: 4 CPU cores, 8 GB RAM
- Database: 2 CPU cores, 4 GB RAM, SSD storage

#### Switch to PostgreSQL

Install PostgreSQL on the database server and create the database:

```sql
CREATE USER openspc WITH PASSWORD 'strong-password-here';
CREATE DATABASE openspc OWNER openspc;
```

Install the async PostgreSQL driver on the app server:

```bash
source /opt/openspc/venv/bin/activate
pip install asyncpg
```

Update the environment file:

```bash
# /opt/openspc/.env
OPENSPC_DATABASE_URL=postgresql+asyncpg://openspc:strong-password-here@db.internal:5432/openspc
```

Run migrations against the new database:

```bash
cd /opt/openspc/backend
alembic upgrade head
```

#### Scale the backend

Increase workers based on CPU cores (guideline: `2 × cores + 1`):

```ini
# In openspc.service
ExecStart=/opt/openspc/venv/bin/uvicorn openspc.main:app \
    --host 127.0.0.1 \
    --port 8000 \
    --workers 9
```

#### PostgreSQL tuning

Add to `postgresql.conf` for an SPC workload (many small reads, periodic writes):

```ini
shared_buffers = 1GB
effective_cache_size = 3GB
work_mem = 16MB
maintenance_work_mem = 256MB
max_connections = 100
```

#### PostgreSQL backups

```bash
# Daily logical backup
pg_dump -U openspc -h db.internal openspc | gzip > /backups/openspc-$(date +%Y%m%d).sql.gz

# Point-in-time recovery: enable WAL archiving in postgresql.conf
wal_level = replica
archive_mode = on
archive_command = 'cp %p /backups/wal/%f'
```

#### MQTT broker integration

If connecting to plant-floor MQTT brokers for automated data ingestion:

- Configure broker connections via the Admin UI (**Connectivity** page) or API
- The backend's MQTT manager maintains persistent connections and reconnects automatically
- Sparkplug B payloads are decoded natively — no middleware required
- Ensure the app server can reach the MQTT broker(s) on TCP port 1883 (or 8883 for TLS)
- For brokers on isolated OT networks, place the OpenSPC server on a DMZ or use a firewall rule to allow outbound MQTT only

---

### Large Deployment (Containerized / HA)

For enterprise-scale deployments with high availability, horizontal scaling, and centralized orchestration. Suitable for multi-site organizations with hundreds of users and thousands of characteristics.

#### Docker

Create a `Dockerfile` for the backend:

```dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY backend/ .
RUN pip install --no-cache-dir -e .

EXPOSE 8000
CMD ["uvicorn", "openspc.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
```

Build the frontend into an Nginx image:

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY frontend/ .
RUN npm ci && npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

#### Docker Compose

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: openspc
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: openspc
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U openspc"]
      interval: 10s
      retries: 5

  backend:
    build:
      context: .
      dockerfile: Dockerfile.backend
    environment:
      OPENSPC_DATABASE_URL: postgresql+asyncpg://openspc:${DB_PASSWORD}@db:5432/openspc
      OPENSPC_JWT_SECRET: ${JWT_SECRET}
      OPENSPC_ADMIN_PASSWORD: ${ADMIN_PASSWORD}
      OPENSPC_COOKIE_SECURE: "true"
      OPENSPC_CORS_ORIGINS: https://spc.yourcompany.com
    depends_on:
      db:
        condition: service_healthy
    ports:
      - "8000:8000"

  frontend:
    build:
      context: .
      dockerfile: Dockerfile.frontend
    ports:
      - "443:443"
    depends_on:
      - backend

  mqtt-broker:
    image: eclipse-mosquitto:2
    ports:
      - "1883:1883"
    volumes:
      - ./mosquitto.conf:/mosquitto/config/mosquitto.conf

volumes:
  pgdata:
```

```bash
# Generate secrets
export DB_PASSWORD=$(python -c "import secrets; print(secrets.token_urlsafe(32))")
export JWT_SECRET=$(python -c "import secrets; print(secrets.token_urlsafe(64))")
export ADMIN_PASSWORD="<your-admin-password>"

docker compose up -d
docker compose exec backend alembic upgrade head
```

#### Kubernetes considerations

For Kubernetes deployments:

- Run the backend as a **Deployment** with 3+ replicas behind a **Service**
- Use a **managed PostgreSQL** service (AWS RDS, GCP Cloud SQL, Azure Database) instead of running Postgres in a pod
- Store secrets in a **Secret** resource, not environment variables in the manifest
- Use an **Ingress** controller (nginx-ingress, Traefik) for TLS termination and routing
- Mount the frontend `dist/` as a ConfigMap or build it into a separate Nginx deployment
- WebSocket connections are long-lived — configure your Ingress with appropriate read timeouts (`proxy-read-timeout: 86400`)
- The health endpoint (`GET /health`) can be used for **readiness and liveness probes**

#### High availability notes

- **Backend**: Stateless — scale horizontally. Each replica connects to the shared database and manages its own WebSocket connections.
- **Database**: Use PostgreSQL streaming replication or a managed service with automated failover.
- **WebSocket fan-out**: Each backend instance only pushes updates to its own connected WebSocket clients. All instances receive the same database events, so clients connected to any replica see real-time updates.
- **MQTT**: Only one backend instance should connect to each MQTT broker to avoid duplicate sample ingestion. Use a leader-election pattern or designate a single "ingest" replica.

---

### Security Checklist

Before going live, verify:

- [ ] `OPENSPC_JWT_SECRET` is set to a unique, random value (at least 64 characters)
- [ ] `OPENSPC_ADMIN_PASSWORD` is changed from the default
- [ ] `OPENSPC_COOKIE_SECURE=true` is set (requires HTTPS)
- [ ] `OPENSPC_SANDBOX=false` (disables dev tools)
- [ ] `OPENSPC_CORS_ORIGINS` lists only your actual frontend domain(s)
- [ ] HTTPS is enforced (HTTP redirects to HTTPS)
- [ ] Nginx does **not** expose `/docs` or `/redoc` externally (remove those `location` blocks, or restrict by IP)
- [ ] Database credentials are not hardcoded in source control
- [ ] Firewall rules restrict database access to the app server only
- [ ] WebSocket endpoint is behind the same TLS termination as the API
- [ ] Regular backups are configured and tested (restore drill at least once)
- [ ] The `openspc` system user has minimal permissions (no shell, no sudo)
- [ ] If using MQTT: broker connections use TLS where the network is untrusted

### Monitoring

OpenSPC exposes a health endpoint for monitoring:

```
GET /health → 200 OK  {"status": "healthy", "database": "connected"}
GET /health → 503      {"status": "unhealthy", "database": "unreachable"}
```

Integrate this with your existing monitoring stack:

- **Uptime checks**: Point Pingdom, UptimeRobot, or Nagios at `https://spc.yourcompany.com/health`
- **Metrics**: Use Nginx access logs + a log collector (Filebeat, Promtail) for request rate, latency, and error rate
- **Database monitoring**: Standard PostgreSQL monitoring (pg_stat_statements, connection count, replication lag)
- **Alerting**: Alert on health endpoint failures, 5xx error spikes, and disk space thresholds (especially for SQLite deployments)

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
