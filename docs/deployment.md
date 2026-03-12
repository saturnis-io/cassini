# Production Deployment

Deploying Cassini for real-world use in a manufacturing environment.

> **Windows on-prem?** The [Windows Installer](getting-started.md#windows) handles service registration, auto-start, and configuration out of the box. The sections below cover Docker and manual Linux/macOS deployments.

For environment variables and TOML configuration, see [Configuration Reference](configuration.md).

---

## Recommended Architecture

```
Internet/Intranet
       |
+------v------+
| Reverse Proxy|  (nginx, Caddy, or cloud LB)
| TLS/HTTPS    |
+------+------+
       | :8000
+------v------+     +-------------+
|   Cassini    |---->| PostgreSQL  |
|   (Docker)   |     |   (or other)|
+-------------+     +-------------+
```

---

## Docker Compose (Recommended)

The simplest production setup. Uses the included `docker-compose.yml` with customized environment variables.

**1. Create a production `.env` file next to `docker-compose.yml`:**

```env
# REQUIRED: Set these before first startup
CASSINI_ADMIN_PASSWORD=a-very-strong-password-here

# These are Docker Compose substitution variables (used in docker-compose.yml),
# NOT direct Cassini env vars. The compose file maps them to CASSINI_* variables.
JWT_SECRET=generate-a-random-64-char-string
POSTGRES_PASSWORD=a-different-strong-password

# Set to true when behind HTTPS reverse proxy (recommended)
CASSINI_COOKIE_SECURE=true

# Port (default 8000)
CASSINI_PORT=8000
```

> **Generate a JWT secret:**
> ```bash
> # macOS / Linux
> python3 -c "import secrets; print(secrets.token_urlsafe(64))"
>
> # Windows
> python -c "import secrets; print(secrets.token_urlsafe(64))"
> ```

**2. Update `docker-compose.yml` for production:**

The included `docker-compose.yml` already supports production use via `.env` file substitution. The variables from step 1 are automatically picked up.

If you need to customize the compose file, the key environment variables are:

```yaml
environment:
  - CASSINI_DATABASE_URL=postgresql+asyncpg://cassini:${POSTGRES_PASSWORD:-cassini}@postgres:5432/cassini
  - CASSINI_JWT_SECRET=${JWT_SECRET:-change-me-in-production}
  - CASSINI_ADMIN_PASSWORD=${CASSINI_ADMIN_PASSWORD:-cassini}
  - CASSINI_COOKIE_SECURE=${CASSINI_COOKIE_SECURE:-false}
  - CASSINI_LOG_FORMAT=json
```

**3. Start the deployment:**

```bash
docker compose up -d
```

**4. Verify health:**

```bash
# Check that containers are running
docker compose ps

# Check application health
curl http://localhost:8000/api/v1/health
```

---

## Manual Deployment (No Docker)

For environments where Docker is not available or not desired.

**1. Install Python 3.11+ and Node.js 18+** on the server.

**2. Set up a PostgreSQL database:**

```sql
CREATE USER cassini WITH PASSWORD 'your-password';
CREATE DATABASE cassini OWNER cassini;
```

**3. Install and configure the backend:**

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[all]"

# Set environment variables
export CASSINI_DATABASE_URL=postgresql+asyncpg://cassini:your-password@localhost:5432/cassini
export CASSINI_JWT_SECRET=$(python3 -c "import secrets; print(secrets.token_urlsafe(64))")
export CASSINI_ADMIN_PASSWORD=your-admin-password
export CASSINI_COOKIE_SECURE=true
export CASSINI_LOG_FORMAT=json

# Run database migrations
alembic upgrade head
```

See [Configuration Reference](configuration.md) for the full list of environment variables and TOML options.

**4. Build the frontend:**

```bash
cd frontend
npm ci
npm run build
```

The built files will be in `frontend/dist/`. Serve them with nginx (see [Reverse Proxy](#reverse-proxy-https) below) or any static file server.

**5. Run the backend with a production server:**

```bash
uvicorn cassini.main:app --host 0.0.0.0 --port 8000
```

> **Note on workers:** You can add `--workers 4` for higher throughput, but test carefully -- each worker runs its own event loop, MQTT connections, and WebSocket manager. For most deployments, a single worker with async concurrency handles the load well.

---

## Running as a Service

### Windows

The [Windows Installer](getting-started.md#windows) handles service registration automatically. For manual service management, use the [CLI](cli.md):

```bash
cassini service install
cassini service start
cassini service stop
cassini service uninstall
```

### Linux (systemd)

Save to `/etc/systemd/system/cassini.service`:

```ini
[Unit]
Description=Cassini SPC Platform
After=network.target postgresql.service

[Service]
Type=simple
User=cassini
WorkingDirectory=/opt/cassini/backend
Environment=CASSINI_DATABASE_URL=postgresql+asyncpg://cassini:password@localhost:5432/cassini
Environment=CASSINI_JWT_SECRET=your-jwt-secret
Environment=CASSINI_COOKIE_SECURE=true
Environment=CASSINI_LOG_FORMAT=json
ExecStart=/opt/cassini/backend/.venv/bin/uvicorn cassini.main:app --host 0.0.0.0 --port 8000 --workers 4
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Then:

```bash
sudo systemctl enable cassini
sudo systemctl start cassini
```

### macOS (launchd)

For production macOS deployments, see the launchd plist in the [Getting Started guide](getting-started.md#running-in-background).

---

## Reverse Proxy (HTTPS)

**Always put Cassini behind a reverse proxy** in production. This handles TLS termination and serves the frontend static files efficiently.

<details>
<summary><strong>nginx configuration</strong></summary>

```nginx
upstream cassini_backend {
    server 127.0.0.1:8000;
}

server {
    listen 443 ssl http2;
    server_name cassini.yourcompany.com;

    ssl_certificate     /etc/ssl/certs/cassini.crt;
    ssl_certificate_key /etc/ssl/private/cassini.key;

    # Frontend static files (if built separately)
    location / {
        root /opt/cassini/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    # API and WebSocket proxy
    location /api/ {
        proxy_pass http://cassini_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /ws {
        proxy_pass http://cassini_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}

server {
    listen 80;
    server_name cassini.yourcompany.com;
    return 301 https://$host$request_uri;
}
```

</details>

<details>
<summary><strong>Caddy configuration (auto-TLS)</strong></summary>

```caddyfile
cassini.yourcompany.com {
    handle /api/* {
        reverse_proxy localhost:8000
    }

    handle /ws {
        reverse_proxy localhost:8000
    }

    handle {
        root * /opt/cassini/frontend/dist
        try_files {path} /index.html
        file_server
    }
}
```

</details>

> **Docker users:** If running the Docker image (which includes the frontend), proxy everything to port 8000. The backend serves both the API and the frontend static files.

---

## Security Checklist

Before going live, verify each item:

- [ ] `CASSINI_JWT_SECRET` is set to a unique, random value (not the default)
- [ ] `CASSINI_COOKIE_SECURE=true` (requires HTTPS)
- [ ] `CASSINI_ADMIN_PASSWORD` is strong and you have changed it after first login
- [ ] PostgreSQL credentials are not the defaults (`cassini`/`cassini`)
- [ ] The server is behind a reverse proxy with TLS
- [ ] PostgreSQL is not exposed to the public internet (bind to `127.0.0.1` or use Docker networking)
- [ ] Firewall rules restrict access to necessary ports only
- [ ] Structured logging is enabled (`CASSINI_LOG_FORMAT=json`) for your log aggregation system

---

## Backups

### Database (PostgreSQL)

<details>
<summary><strong>macOS / Linux</strong></summary>

```bash
# Backup
pg_dump -U cassini -h localhost cassini > cassini_backup_$(date +%Y%m%d).sql

# Restore
psql -U cassini -h localhost cassini < cassini_backup_20260309.sql
```

</details>

<details>
<summary><strong>Windows (Command Prompt)</strong></summary>

```bash
# Backup
pg_dump -U cassini -h localhost cassini > cassini_backup_%date:~-4%%date:~4,2%%date:~7,2%.sql

# Restore
psql -U cassini -h localhost cassini < cassini_backup_20260309.sql
```

</details>

### Database (SQLite)

<details>
<summary><strong>macOS / Linux</strong></summary>

```bash
# Stop the server first, then copy the file
cp cassini.db cassini_backup_$(date +%Y%m%d).db
```

</details>

<details>
<summary><strong>Windows</strong></summary>

```bash
# Stop the server first, then copy the file
copy cassini.db cassini_backup.db
```

</details>

### Docker Volumes

```bash
# Backup PostgreSQL data volume (macOS / Linux)
docker run --rm -v cassini_postgres-data:/data -v $(pwd):/backup alpine \
    tar czf /backup/postgres-backup.tar.gz -C /data .
```

> **Windows:** Docker volume backups work the same in PowerShell, but replace `$(pwd)` with `${PWD}`.

---

## Upgrading

> **Always back up your database before upgrading.**

### Docker (all platforms)

```bash
git pull
docker compose build
docker compose up -d
```

### Manual (macOS / Linux)

```bash
git pull
cd backend && source .venv/bin/activate
pip install -e ".[all]"
alembic upgrade head
cd ../frontend && npm ci && npm run build
sudo systemctl restart cassini
```

### Manual (Windows)

```bash
git pull
cd backend
.venv\Scripts\activate
pip install -e ".[all]"
alembic upgrade head
cd ..\frontend
npm ci
npm run build
```

Then restart the Cassini Windows Service from the system tray or:

```bash
cassini service stop && cassini service start
```
