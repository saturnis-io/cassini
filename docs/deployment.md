# Deployment Guide

> Production deployment for OpenSPC -- from a single server to Kubernetes.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Common Setup Steps (All Tiers)](#2-common-setup-steps-all-tiers)
3. [Small Deployment (Single Server)](#3-small-deployment-single-server)
4. [Medium Deployment (Separate Services)](#4-medium-deployment-separate-services)
5. [Large Deployment (Containerized / HA)](#5-large-deployment-containerized--ha)
6. [Security Checklist](#6-security-checklist)
7. [Monitoring](#7-monitoring)
8. [Environment Variables Reference](#8-environment-variables-reference)

---

## 1. Overview

OpenSPC scales from a single server running SQLite to a containerized, high-availability cluster with managed PostgreSQL. Choose the deployment tier that matches your organization's scale.

### Sizing Guide

| Tier | Users | Characteristics | Infrastructure | Database | MQTT Brokers |
|------|-------|-----------------|----------------|----------|--------------|
| **Small** | 1--25 | < 100 | Single server | SQLite | 0--1 |
| **Medium** | 25--200 | 100--1,000 | 2--3 servers | PostgreSQL | 1--3 |
| **Large** | 200+ | 1,000+ | Containerized / HA | PostgreSQL (managed) | Multiple |

### Decision Tree

```mermaid
flowchart TD
    A[How many concurrent users?] --> B{Less than 25?}
    B -->|Yes| C{Need high availability?}
    C -->|No| D[Small Deployment<br/>Single server + SQLite]
    C -->|Yes| F[Medium Deployment<br/>Separate DB server]
    B -->|No| E{Less than 200?}
    E -->|Yes| F
    E -->|No| G{Containerized infrastructure?}
    G -->|Yes| H[Large Deployment<br/>Kubernetes / Docker Compose]
    G -->|No| F

    style D fill:#d4edda,stroke:#28a745
    style F fill:#fff3cd,stroke:#ffc107
    style H fill:#cce5ff,stroke:#007bff
```

All three tiers share the same application code and configuration model. The differences are in how the backend, database, and reverse proxy are deployed and scaled.

---

## 2. Common Setup Steps (All Tiers)

These steps apply regardless of deployment tier. Complete them before following the tier-specific instructions.

### 2.1 Build the Frontend

On your build machine or CI server, produce the static bundle:

```bash
cd frontend
npm ci
npm run build
# Output: frontend/dist/
```

This generates a `dist/` directory containing static HTML, JavaScript, and CSS files. These are served by Nginx or any static file server. **Node.js is not required on the production server.**

### 2.2 Install the Backend

```bash
cd backend
python -m venv /opt/openspc/venv
source /opt/openspc/venv/bin/activate
pip install -e .
```

> **Tip:** For reproducible builds, pin dependencies with `pip freeze > requirements.txt` on the build machine, then install with `pip install -r requirements.txt` in production.

### 2.3 Generate Secrets

**JWT Secret** -- signs all access and refresh tokens. Must be a strong, random value and remain consistent across restarts.

```bash
python -c "import secrets; print(secrets.token_urlsafe(64))"
```

Save the output -- you will use it in the environment file.

> **Warning:** If the JWT secret changes, all existing sessions are invalidated and every user will be forced to log in again.

**Database Encryption Key** -- OpenSPC uses a Fernet encryption key (stored in `.db_encryption_key`) to encrypt sensitive database credentials configured through the Database Admin UI. This key is automatically generated on first use and is **separate** from the JWT secret. In production:

- **Back up `.db_encryption_key`** alongside your `.env` file. If this key is lost, encrypted database credentials cannot be decrypted.
- **Do not rotate the JWT secret expecting it to affect database credentials** -- they use independent keys.
- Restrict file permissions: `chmod 600 /opt/openspc/.db_encryption_key`.

### 2.4 Create the Environment File

Create `/opt/openspc/.env` with your production configuration:

```bash
# /opt/openspc/.env

# Authentication
OPENSPC_JWT_SECRET=<your-generated-secret>
OPENSPC_ADMIN_USERNAME=admin
OPENSPC_ADMIN_PASSWORD=<strong-password>
OPENSPC_COOKIE_SECURE=true

# CORS -- list your frontend domain(s), comma-separated
OPENSPC_CORS_ORIGINS=https://spc.yourcompany.com

# Database (default is SQLite; override for PostgreSQL)
# OPENSPC_DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/openspc

# Disable dev tools in production
OPENSPC_SANDBOX=false
```

> **Warning:** Never commit the `.env` file to version control. Add it to `.gitignore` and restrict file permissions: `chmod 600 /opt/openspc/.env`.

### 2.5 Run Migrations

Apply database schema migrations before starting the application:

```bash
cd /opt/openspc/backend
source /opt/openspc/venv/bin/activate
alembic upgrade head
```

Run this step every time you upgrade OpenSPC to a new version.

### 2.6 Admin Bootstrap

On first startup, if the `users` table is empty, OpenSPC automatically creates an admin user from the `OPENSPC_ADMIN_USERNAME` and `OPENSPC_ADMIN_PASSWORD` environment variables. The admin user is assigned the `admin` role for **all** active plants.

After the initial bootstrap:

1. Log in with the bootstrap credentials
2. Change the admin password via the UI (or API)
3. Create additional user accounts as needed

See the [Administration Guide](administration.md) for user and role management details.

---

## 3. Small Deployment (Single Server)

A single Linux server running Nginx, the Python backend, and SQLite. Suitable for a single plant or lab with a handful of concurrent users.

### Server Requirements

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| CPU | 2 cores | 4 cores |
| RAM | 4 GB | 8 GB |
| Disk | 20 GB | 50 GB SSD |
| OS | Ubuntu 22.04+ / RHEL 9+ | Ubuntu 24.04 LTS |

### System Layout

```mermaid
graph LR
    subgraph "Single Server"
        NGINX["Nginx<br/>:443 / :80"]
        UVICORN["Uvicorn<br/>:8000<br/>(2 workers)"]
        SQLITE[(SQLite<br/>openspc.db)]
        STATIC["Static Files<br/>frontend/dist/"]
    end

    CLIENT["Browser"] --> NGINX
    NGINX -->|"/api/*, /ws/*"| UVICORN
    NGINX -->|"/*"| STATIC
    UVICORN --> SQLITE
```

### File System Layout

```
/opt/openspc/
├── backend/          # Python application source
├── frontend/dist/    # Built static files (from npm run build)
├── venv/             # Python virtual environment
├── .env              # Environment variables
├── backups/          # Database backup directory
└── openspc.db        # SQLite database (default location)
```

### systemd Service

Create `/etc/systemd/system/openspc.service`:

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

Enable and start the service:

```bash
# Create a dedicated service account
sudo useradd -r -s /usr/sbin/nologin openspc

# Set ownership
sudo chown -R openspc:openspc /opt/openspc

# Enable and start
sudo systemctl daemon-reload
sudo systemctl enable --now openspc

# Verify
sudo systemctl status openspc
journalctl -u openspc -f
```

### Nginx Reverse Proxy

Create `/etc/nginx/sites-available/openspc`:

```nginx
server {
    listen 443 ssl http2;
    server_name spc.yourcompany.com;

    ssl_certificate     /etc/ssl/certs/openspc.crt;
    ssl_certificate_key /etc/ssl/private/openspc.key;

    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Frontend static files
    root /opt/openspc/frontend/dist;
    index index.html;

    # API requests -> backend
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket -> backend
    location /ws/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }

    # Health check (accessible internally or by monitoring)
    location /health {
        proxy_pass http://127.0.0.1:8000;
    }

    # Block API docs in production (uncomment to restrict)
    # location /docs { return 404; }
    # location /redoc { return 404; }
    # location /openapi.json { return 404; }

    # SPA fallback -- serve index.html for client-side routes
    location / {
        try_files $uri $uri/ /index.html;
    }
}

# HTTP -> HTTPS redirect
server {
    listen 80;
    server_name spc.yourcompany.com;
    return 301 https://$host$request_uri;
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/openspc /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### SQLite Considerations

SQLite is a solid choice for small deployments. Keep these points in mind:

- **File location**: The database lives at `/opt/openspc/backend/openspc.db` by default (configurable via `OPENSPC_DATABASE_URL`)
- **Concurrency**: SQLite handles concurrent reads well but serializes writes -- this is fine for fewer than 25 users
- **File permissions**: The `openspc` service user must have write permission to both the database file **and** its parent directory (SQLite creates journal/WAL files alongside the database)
- **No network access**: SQLite does not accept network connections. The backend and database must be on the same machine
- **Size limits**: Practical limit is around 1 TB, but performance degrades on large datasets without proper indexing

### Backup Cron

Create `/etc/cron.d/openspc-backup`:

```cron
# Daily backup at 2 AM
0 2 * * * openspc sqlite3 /opt/openspc/backend/openspc.db ".backup /opt/openspc/backups/openspc-$(date +\%Y\%m\%d).db"

# Clean up backups older than 30 days (weekly on Sunday at 3 AM)
0 3 * * 0 openspc find /opt/openspc/backups -name "*.db" -mtime +30 -delete
```

Create the backup directory:

```bash
sudo mkdir -p /opt/openspc/backups
sudo chown openspc:openspc /opt/openspc/backups
```

> **Tip:** Test your backup by restoring it to a temporary location: `sqlite3 /tmp/test-restore.db ".restore /opt/openspc/backups/openspc-20260101.db"`. Verify the data is intact before trusting the backup process.

---

## 4. Medium Deployment (Separate Services)

Separate the database onto its own server or use a managed database service. Multiple uvicorn workers handle increased concurrency. Suitable for multiple plants with dozens of active users.

OpenSPC supports **PostgreSQL** (recommended), **MySQL**, and **Microsoft SQL Server** as production database backends in addition to SQLite. Choose based on your organization's existing infrastructure. See [Database URL Examples](#database-url-examples) for connection string formats.

### Server Requirements

| Component | CPU | RAM | Disk | Notes |
|-----------|-----|-----|------|-------|
| App server | 4 cores | 8 GB | 20 GB | Runs Nginx + backend |
| Database server | 2 cores | 4 GB | 50 GB SSD | PostgreSQL |

### Architecture

```mermaid
graph LR
    subgraph "App Server"
        NGINX["Nginx<br/>:443"]
        UVICORN["Uvicorn<br/>:8000<br/>(9 workers)"]
        STATIC["Static Files"]
    end

    subgraph "Database Server"
        PG[(PostgreSQL<br/>:5432)]
    end

    subgraph "OT Network (optional)"
        MQTT["MQTT Broker<br/>:1883"]
        OPCUA["OPC-UA Server<br/>:4840"]
    end

    CLIENT["Browsers"] --> NGINX
    NGINX --> UVICORN
    NGINX --> STATIC
    UVICORN --> PG
    UVICORN -.->|"MQTT/SparkplugB"| MQTT
    UVICORN -.->|"OPC-UA"| OPCUA
```

### PostgreSQL Setup

On the database server, install PostgreSQL and create the database:

```bash
# Install PostgreSQL (Ubuntu)
sudo apt install postgresql postgresql-contrib

# Create the database and user
sudo -u postgres psql
```

```sql
CREATE USER openspc WITH PASSWORD 'strong-password-here';
CREATE DATABASE openspc OWNER openspc;
\q
```

On the app server, install the async PostgreSQL driver:

```bash
source /opt/openspc/venv/bin/activate
pip install asyncpg
```

Update the environment file on the app server:

```bash
# /opt/openspc/.env
OPENSPC_DATABASE_URL=postgresql+asyncpg://openspc:strong-password-here@db.internal:5432/openspc
```

Run migrations against the new database:

```bash
cd /opt/openspc/backend
source /opt/openspc/venv/bin/activate
alembic upgrade head
```

### Scaling Uvicorn Workers

Increase the worker count based on CPU cores. A common guideline is `2 x cores + 1`:

```ini
# In /etc/systemd/system/openspc.service
ExecStart=/opt/openspc/venv/bin/uvicorn openspc.main:app \
    --host 127.0.0.1 \
    --port 8000 \
    --workers 9
```

Each worker is an independent process with its own event loop, MQTT connections, and WebSocket client list. This is important for:

- **WebSocket fan-out**: Clients connected to different workers receive updates independently. All workers query the same database, so data consistency is maintained.
- **MQTT connections**: Each worker maintains its own MQTT connection. To avoid duplicate sample ingestion, configure only **one** worker's MQTT manager as active, or use an external MQTT broker with shared subscriptions.

### PostgreSQL Tuning

Add to `postgresql.conf` for an SPC workload (many small reads, periodic writes, time-series patterns):

```ini
# Memory
shared_buffers = 1GB              # ~25% of total RAM
effective_cache_size = 3GB        # ~75% of total RAM
work_mem = 16MB                   # Per-operation sort/hash memory
maintenance_work_mem = 256MB      # For VACUUM, CREATE INDEX

# Connections
max_connections = 100             # Adjust based on worker count + headroom

# Write-ahead log
wal_level = replica               # Enable for backups and replication
checkpoint_completion_target = 0.9

# Query planner
random_page_cost = 1.1            # SSD storage
effective_io_concurrency = 200    # SSD storage
```

### PostgreSQL Backups

```bash
# Daily logical backup (run via cron)
pg_dump -U openspc -h db.internal openspc \
    | gzip > /backups/openspc-$(date +%Y%m%d).sql.gz

# Restore from backup
gunzip -c /backups/openspc-20260101.sql.gz | psql -U openspc -h db.internal openspc
```

For point-in-time recovery, enable WAL archiving in `postgresql.conf`:

```ini
wal_level = replica
archive_mode = on
archive_command = 'cp %p /backups/wal/%f'
```

### MQTT Broker Integration

If connecting to plant-floor MQTT brokers for automated data ingestion:

- Configure broker connections via the Admin UI (**Connectivity** page) or the [Brokers API](api-reference.md)
- The backend's MQTT manager maintains persistent connections and reconnects automatically with exponential backoff (up to `max_reconnect_delay` seconds)
- Sparkplug B payloads are decoded natively -- no additional middleware required
- Ensure the app server can reach the MQTT broker(s) on TCP port 1883 (or 8883 for TLS)
- For brokers on isolated OT networks, place the OpenSPC server on a DMZ or configure firewall rules to allow outbound MQTT only

**MQTT Outbound Publishing**: OpenSPC can also publish SPC events (violations, statistics, Nelson rule triggers) to MQTT brokers. Configure outbound topics and rate limits via the Connectivity page.

### OPC-UA Server Integration

If connecting to OPC-UA servers for automated data ingestion:

- Configure OPC-UA server connections via the **Connectivity** page (Servers tab) or the [OPC-UA API](api-reference.md)
- The backend uses `asyncua` for asynchronous OPC-UA communication
- Node browsing and discovery are available via the Connectivity page (Browse tab)
- Map OPC-UA nodes to characteristics via the Mapping tab
- Ensure the app server can reach OPC-UA server(s) on TCP port 4840 (default) or the configured port
- OPC-UA subscriptions deliver real-time data into the SPC engine for automatic control chart processing

---

## 5. Large Deployment (Containerized / HA)

For enterprise-scale deployments with high availability, horizontal scaling, and centralized orchestration. Suitable for multi-site organizations with hundreds of users and thousands of characteristics.

### Architecture

```mermaid
graph TB
    LB["Load Balancer<br/>(Nginx / Ingress)"]

    subgraph "Backend Replicas"
        B1["Backend #1<br/>Uvicorn"]
        B2["Backend #2<br/>Uvicorn"]
        B3["Backend #3<br/>Uvicorn"]
    end

    subgraph "Frontend"
        FE["Nginx<br/>Static Files"]
    end

    subgraph "Data Layer"
        PG_PRIMARY[(PostgreSQL<br/>Primary)]
        PG_REPLICA[(PostgreSQL<br/>Replica)]
    end

    subgraph "Messaging"
        MQTT["MQTT Broker"]
    end

    CLIENT["Browsers"] --> LB
    LB --> FE
    LB -->|"/api/*, /ws/*"| B1
    LB -->|"/api/*, /ws/*"| B2
    LB -->|"/api/*, /ws/*"| B3
    B1 --> PG_PRIMARY
    B2 --> PG_PRIMARY
    B3 --> PG_PRIMARY
    PG_PRIMARY -->|"Streaming<br/>Replication"| PG_REPLICA
    B1 -.->|"MQTT Leader"| MQTT
```

### Backend Dockerfile

Create `Dockerfile.backend` in the project root:

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for asyncpg, argon2, cryptography, and OPC-UA
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libffi-dev libssl-dev \
    && rm -rf /var/lib/apt/lists/*

COPY backend/ .
RUN pip install --no-cache-dir -e . asyncpg cryptography asyncua

# For MySQL support, also install: aiomysql
# For MSSQL support, also install: aioodbc (requires unixODBC-dev)

# Run migrations on startup (optional -- can also run as an init container)
# RUN alembic upgrade head

EXPOSE 8000

CMD ["uvicorn", "openspc.main:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--workers", "4"]
```

### Frontend Dockerfile

Create `Dockerfile.frontend` in the project root:

```dockerfile
# Stage 1: Build
FROM node:20-alpine AS build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# Stage 2: Serve
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

Create `nginx.conf` for the frontend container:

```nginx
server {
    listen 80;

    root /usr/share/nginx/html;
    index index.html;

    # API and WebSocket -> backend service
    location /api/ {
        proxy_pass http://backend:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /ws/ {
        proxy_pass http://backend:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }

    location /health {
        proxy_pass http://backend:8000;
    }

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

### Docker Compose

Create `docker-compose.yml`:

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
    restart: unless-stopped

  backend:
    build:
      context: .
      dockerfile: Dockerfile.backend
    environment:
      OPENSPC_DATABASE_URL: postgresql+asyncpg://openspc:${DB_PASSWORD}@db:5432/openspc
      OPENSPC_JWT_SECRET: ${JWT_SECRET}
      OPENSPC_ADMIN_USERNAME: admin
      OPENSPC_ADMIN_PASSWORD: ${ADMIN_PASSWORD}
      OPENSPC_COOKIE_SECURE: "true"
      OPENSPC_CORS_ORIGINS: https://spc.yourcompany.com
      OPENSPC_SANDBOX: "false"
    depends_on:
      db:
        condition: service_healthy
    ports:
      - "8000:8000"
    restart: unless-stopped

  frontend:
    build:
      context: .
      dockerfile: Dockerfile.frontend
    ports:
      - "443:80"
    depends_on:
      - backend
    restart: unless-stopped

  mqtt-broker:
    image: eclipse-mosquitto:2
    ports:
      - "1883:1883"
    volumes:
      - ./mosquitto.conf:/mosquitto/config/mosquitto.conf
    restart: unless-stopped

volumes:
  pgdata:
```

Start the stack:

```bash
# Generate secrets
export DB_PASSWORD=$(python -c "import secrets; print(secrets.token_urlsafe(32))")
export JWT_SECRET=$(python -c "import secrets; print(secrets.token_urlsafe(64))")
export ADMIN_PASSWORD="<your-admin-password>"

# Start all services
docker compose up -d

# Run database migrations
docker compose exec backend alembic upgrade head

# Verify
docker compose ps
curl -s http://localhost:8000/health
```

### Kubernetes Deployment

```mermaid
graph TB
    subgraph "Kubernetes Cluster"
        ING["Ingress Controller<br/>(nginx-ingress / Traefik)"]

        subgraph "openspc namespace"
            SVC_BE["Service: backend<br/>ClusterIP :8000"]
            SVC_FE["Service: frontend<br/>ClusterIP :80"]

            DEP_BE["Deployment: backend<br/>replicas: 3"]
            DEP_FE["Deployment: frontend<br/>replicas: 2"]

            SEC["Secret: openspc-secrets<br/>JWT_SECRET, DB_PASSWORD"]
            CM["ConfigMap: openspc-config<br/>CORS_ORIGINS, etc."]
        end

        subgraph "Managed Services"
            PG["Cloud PostgreSQL<br/>(RDS / Cloud SQL)"]
        end
    end

    INTERNET["Internet"] --> ING
    ING -->|"spc.yourcompany.com/api/*"| SVC_BE
    ING -->|"spc.yourcompany.com/*"| SVC_FE
    SVC_BE --> DEP_BE
    SVC_FE --> DEP_FE
    DEP_BE --> PG
    DEP_BE --> SEC
    DEP_BE --> CM
```

Key considerations for Kubernetes deployments:

- **Backend**: Run as a `Deployment` with 3+ replicas behind a `Service`. The backend is stateless and scales horizontally.
- **Database**: Use a **managed PostgreSQL** service (AWS RDS, GCP Cloud SQL, Azure Database for PostgreSQL) rather than running Postgres in a pod. Managed services handle replication, backups, and failover.
- **Secrets**: Store `OPENSPC_JWT_SECRET`, `OPENSPC_ADMIN_PASSWORD`, and database credentials in a Kubernetes `Secret` resource, not in environment variables in the manifest.
- **Frontend**: Build the static files into an Nginx image and deploy as a separate `Deployment` + `Service`.
- **Ingress**: Use an Ingress controller (nginx-ingress, Traefik) for TLS termination and path-based routing to backend vs. frontend.
- **WebSocket timeouts**: Configure your Ingress with appropriate read timeouts for long-lived WebSocket connections:
  ```yaml
  metadata:
    annotations:
      nginx.ingress.kubernetes.io/proxy-read-timeout: "86400"
      nginx.ingress.kubernetes.io/proxy-send-timeout: "86400"
  ```
- **Health probes**: Use the `/health` endpoint for both readiness and liveness probes:
  ```yaml
  livenessProbe:
    httpGet:
      path: /health
      port: 8000
    initialDelaySeconds: 10
    periodSeconds: 30
  readinessProbe:
    httpGet:
      path: /health
      port: 8000
    initialDelaySeconds: 5
    periodSeconds: 10
  ```

### High Availability Notes

| Component | Strategy |
|-----------|----------|
| **Backend** | Stateless -- scale horizontally with multiple replicas. Each replica connects to the shared database and manages its own WebSocket connections. |
| **Database** | PostgreSQL streaming replication or a managed service with automated failover. |
| **WebSocket fan-out** | Each backend instance pushes updates only to its own connected WebSocket clients. All instances read from the same database, so clients connected to any replica see consistent data. |
| **MQTT ingestion** | Only **one** backend instance should connect to each MQTT broker to avoid duplicate sample ingestion. Use a leader-election pattern (e.g., Kubernetes lease) or designate a single "ingest" replica. Other replicas should not have active MQTT brokers configured. |
| **OPC-UA ingestion** | Same leader pattern as MQTT -- only one backend instance should maintain active OPC-UA subscriptions to avoid duplicate data ingestion. |
| **Session state** | JWT tokens are stateless (validated by signature, not session store). Any backend replica can validate any token as long as all replicas share the same `OPENSPC_JWT_SECRET`. |

---

## 6. Security Checklist

Verify each item before going live.

### Authentication and Secrets

- [ ] `OPENSPC_JWT_SECRET` is set to a unique, random value (at least 64 characters)
- [ ] `OPENSPC_ADMIN_PASSWORD` is changed from the default
- [ ] `OPENSPC_COOKIE_SECURE=true` is set (requires HTTPS)
- [ ] The `.env` file is not committed to version control
- [ ] The `.env` file has restricted permissions (`chmod 600`)
- [ ] The `.db_encryption_key` file is backed up and has restricted permissions (`chmod 600`)
- [ ] Database credentials are not hardcoded in source code

### Network and Transport

- [ ] HTTPS is enforced (HTTP redirects to HTTPS)
- [ ] TLS certificates are valid and auto-renewed (Let's Encrypt or corporate CA)
- [ ] WebSocket endpoint is behind the same TLS termination as the API
- [ ] `OPENSPC_CORS_ORIGINS` lists only your actual frontend domain(s)
- [ ] Firewall rules restrict database access to the app server only
- [ ] If using MQTT: broker connections use TLS where the network is untrusted
- [ ] If using OPC-UA: server connections use encrypted endpoints where the network is untrusted

### Application Configuration

- [ ] `OPENSPC_SANDBOX=false` (disables dev tools endpoint)
- [ ] Nginx does **not** expose `/docs`, `/redoc`, or `/openapi.json` externally (remove those `location` blocks or restrict by IP)
- [ ] The `openspc` system user has minimal permissions (no shell, no sudo)

### Operational

- [ ] Regular backups are configured and tested (perform a restore drill at least once)
- [ ] Log files are rotated and retained per your organization's policy
- [ ] A monitoring check is configured for the `/health` endpoint

---

## 7. Monitoring

### Health Endpoint

OpenSPC provides a health endpoint that verifies database connectivity:

```
GET /health

# Healthy response (HTTP 200)
{"status": "healthy"}

# Unhealthy response (HTTP 200 with status field -- check response body)
{"status": "unhealthy"}
```

> **Note:** The health endpoint executes `SELECT 1` against the database. If the database is unreachable, the response will indicate "unhealthy".

### Uptime Monitoring

Integrate the health endpoint with your monitoring stack:

| Tool | Configuration |
|------|--------------|
| **Pingdom / UptimeRobot** | HTTP check on `https://spc.yourcompany.com/health`, alert on non-200 or body containing "unhealthy" |
| **Nagios / Icinga** | `check_http -H spc.yourcompany.com -u /health -s healthy --ssl` |
| **Prometheus** | Use blackbox_exporter to probe `/health` |

### Key Metrics to Track

| Metric | Source | Alert Threshold |
|--------|--------|-----------------|
| Health endpoint status | `/health` response | Any "unhealthy" response |
| HTTP 5xx error rate | Nginx access logs | > 1% of requests |
| API response latency (p95) | Nginx access logs | > 2 seconds |
| WebSocket connection count | Application logs | Sudden drop to 0 |
| Database connection pool | PostgreSQL `pg_stat_activity` | > 80% of `max_connections` |
| Disk usage | OS metrics | > 80% (especially important for SQLite) |
| MQTT connection status | `/api/v1/brokers/all/status` | Disconnected for > 5 minutes |
| OPC-UA connection status | `/api/v1/opcua/servers` | Disconnected for > 5 minutes |

### Log Collection

OpenSPC uses **structlog** for structured logging. Set `OPENSPC_LOG_FORMAT=json` for machine-readable JSON output (recommended for production log aggregation), or `console` for human-readable output during development. In containerized deployments, logs are captured automatically by Docker or Kubernetes. For systemd deployments, logs are available via `journalctl`:

```bash
# Follow live logs
journalctl -u openspc -f

# View logs from the last hour
journalctl -u openspc --since "1 hour ago"
```

For centralized log collection, configure a log shipper (Filebeat, Promtail, Fluentd) to collect from:

- **Nginx access logs**: Request rate, latency, error codes
- **Nginx error logs**: Upstream failures, proxy errors
- **Application logs**: Startup/shutdown events, MQTT/OPC-UA connection status, SPC engine processing
- **PostgreSQL logs**: Slow queries, connection errors

### Alerting Recommendations

| Alert | Condition | Severity |
|-------|-----------|----------|
| Health check failure | `/health` returns "unhealthy" for 2+ consecutive checks | Critical |
| High error rate | 5xx rate > 1% over 5 minutes | Critical |
| MQTT disconnected | Broker status "disconnected" for > 5 minutes | Warning |
| OPC-UA disconnected | Server status "disconnected" for > 5 minutes | Warning |
| Disk space low | > 80% disk usage on database volume | Warning |
| Disk space critical | > 95% disk usage on database volume | Critical |
| Database connections exhausted | Active connections > 90% of max | Warning |
| Certificate expiry | TLS certificate expires within 14 days | Warning |

---

## 8. Environment Variables Reference

All environment variables use the `OPENSPC_` prefix. The backend reads them via [pydantic-settings](https://docs.pydantic.dev/latest/concepts/pydantic_settings/) from both environment variables and a `.env` file.

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `OPENSPC_APP_VERSION` | string | `"0.4.0"` | Application version string (displayed in API root and docs) |
| `OPENSPC_DATABASE_URL` | string | `"sqlite+aiosqlite:///./openspc.db"` | SQLAlchemy async database URL. Use `postgresql+asyncpg://...` for PostgreSQL, `mysql+aiomysql://...` for MySQL, or `mssql+aioodbc://...` for MSSQL. |
| `OPENSPC_JWT_SECRET` | string | `""` (auto-generated) | Secret key for signing JWT tokens. If empty, a random secret is generated and persisted to a `.jwt_secret` file. **Always set this explicitly in production.** |
| `OPENSPC_COOKIE_SECURE` | bool | `false` | Set the `Secure` flag on the refresh token cookie. Must be `true` in production (requires HTTPS). |
| `OPENSPC_ADMIN_USERNAME` | string | `"admin"` | Username for the bootstrap admin account (created on first startup when no users exist). |
| `OPENSPC_ADMIN_PASSWORD` | string | `""` | Password for the bootstrap admin account. **Must be set to a strong value in production.** |
| `OPENSPC_CORS_ORIGINS` | string | `"http://localhost:5173,..."` | Comma-separated list of allowed CORS origins. In production, set this to your frontend domain(s) only. |
| `OPENSPC_RATE_LIMIT_LOGIN` | string | `"5/minute"` | Rate limit for login attempts. |
| `OPENSPC_RATE_LIMIT_DEFAULT` | string | `"60/minute"` | Default rate limit for API endpoints. |
| `OPENSPC_LOG_FORMAT` | string | `"console"` | Log output format. Use `"console"` for human-readable or `"json"` for structured JSON logging (recommended for production log aggregation). |
| `OPENSPC_SANDBOX` | bool | `false` | Enable sandbox mode. When `true`, registers the `/api/v1/devtools` router with database reset and seed endpoints. **Must be `false` in production.** |
| `OPENSPC_DEV_MODE` | bool | `false` | Development mode. Disables enterprise enforcement features (e.g., forced password change). **Must be `false` in production.** |

### Database URL Examples

| Database | URL Format |
|----------|-----------|
| SQLite (default) | `sqlite+aiosqlite:///./openspc.db` |
| SQLite (absolute path) | `sqlite+aiosqlite:////opt/openspc/data/openspc.db` |
| PostgreSQL | `postgresql+asyncpg://user:password@host:5432/dbname` |
| PostgreSQL (SSL) | `postgresql+asyncpg://user:password@host:5432/dbname?ssl=require` |
| MySQL | `mysql+aiomysql://user:password@host:3306/dbname` |
| MSSQL | `mssql+aioodbc://user:password@host:1433/dbname?driver=ODBC+Driver+18+for+SQL+Server` |

> **Tip:** The `.env` file supports standard `KEY=value` syntax. Values with special characters should be quoted: `OPENSPC_DATABASE_URL="postgresql+asyncpg://user:p@ss@host/db"`.

---

## Cross-References

- [Getting Started](getting-started.md) -- Development setup and first run
- [Administration Guide](administration.md) -- User management, roles, plant configuration
- [Architecture](architecture.md) -- System design and component diagrams
- [API Reference](api-reference.md) -- REST API endpoints and WebSocket protocol
- [Development Guide](development.md) -- Contributing and testing
