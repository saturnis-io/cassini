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

![Cassini SPC Dashboard](docs/screenshots/core/dashboard-control-chart.png)

Monitor process stability, detect out-of-control conditions, run capability studies, and manage quality data across your manufacturing operation — from a single control chart to a regulated multi-plant deployment.

*"In-control, like the Cassini Division."*

> **Open-core model**: The Community Edition is free under AGPL-3.0 and includes a complete SPC platform. [Commercial licenses](https://saturnis.io/pricing) unlock multi-plant, compliance, and advanced analytics features for organizations that need them.

---

## Table of Contents

- [Quick Start (Windows Installer)](#quick-start-windows-installer) -- download and run, no dependencies
- [Quick Start (Docker)](#quick-start-docker) -- 2 commands, any platform
- [Quick Start (Manual)](#quick-start-manual) -- run from source
- [CLI Reference](#cli-reference) -- `cassini serve`, `cassini check`, etc.
- [Configuration Reference](#configuration-reference) -- environment variables, TOML config, database options
- [Production Deployment](#production-deployment) -- enterprise-grade setup
- [Features](#community-edition-free-agpl-30) -- what Cassini can do
- [Architecture](#architecture) -- tech stack and project structure
- [Development](#development) -- contributing and dev workflow
- [License](#license--commercial-use) -- AGPL-3.0 and commercial options

---

<a id="new-to-the-command-line"></a>
<details>
<summary><strong>New to the command line?</strong></summary>

The Quick Start guides below use terminal commands. Here's how to open a terminal on your platform.

**Windows**

Open File Explorer and navigate to the folder where you want to put Cassini. Click the address bar at the top, type `cmd`, and press Enter. A command prompt opens, already pointed at that folder.

You can also search for **Terminal** or **PowerShell** in the Start menu.

**macOS**

Press **Cmd + Space**, type **Terminal**, and press Enter. Then navigate to your folder:

```
cd ~/Desktop
```

**Linux**

Press **Ctrl + Alt + T** (works on most distributions), or find **Terminal** in your application menu. Then navigate to your folder:

```
cd ~/Desktop
```

</details>

---

## Quick Start (Windows Installer)

Download the installer from [GitHub Releases](https://github.com/saturnis-io/cassini/releases), run it, and Cassini is ready.

### What Gets Installed

| Component | Description |
|-----------|-------------|
| **Cassini Server** | Backend + frontend bundled into a single executable |
| **System Tray** | Status icon with health monitoring, service controls, and browser launch |
| **Bridge** *(optional)* | Serial gage to MQTT translator for shop floor gages |

The installer registers Cassini as a Windows Service that starts automatically on boot. Data is stored in `C:\ProgramData\Cassini\`.

### After Install

1. Cassini starts automatically as a Windows Service
2. The system tray icon appears — right-click for controls
3. Open **http://localhost:8000** in your browser
4. Log in with `admin` / `cassini` (you'll be prompted to change the password)

![Cassini Login](docs/screenshots/core/login.png)

### Configuration

Edit `C:\ProgramData\Cassini\cassini.toml` to change server port, database, or other settings. See [CLI Reference](#cli-reference) and [Configuration Reference](#configuration-reference).

To run these commands, open a terminal ([how?](#new-to-the-command-line)) and type:

```bash
cassini check     # validate config, database, and license
cassini version   # print version and build info
```

### Uninstall

Use **Add or Remove Programs** in Windows Settings. The uninstaller stops the service and removes program files. Your data directory (`C:\ProgramData\Cassini\`) is preserved — delete it manually if you want a clean removal.

---

## Quick Start (Docker)

**The fastest way to get Cassini running on any platform.** Two commands, no dependencies to install other than Docker.

### Prerequisites

Install Docker Desktop for your platform:

| Platform | Download |
|----------|----------|
| **Windows** | [Docker Desktop for Windows](https://docs.docker.com/desktop/setup/install/windows-install/) |
| **macOS** | [Docker Desktop for Mac](https://docs.docker.com/desktop/setup/install/mac-install/) |
| **Linux** | [Docker Engine](https://docs.docker.com/engine/install/) |

### Run Cassini

Open a terminal ([how?](#new-to-the-command-line)) and run:

```bash
# Clone the repository
git clone https://github.com/saturnis-io/cassini.git
cd cassini

# Start Cassini + PostgreSQL
docker compose up -d
```

That's it. Open **http://localhost:8000** in your browser.

The Docker Compose setup includes:
- **Cassini** (backend + frontend built together) on port 8000
- **PostgreSQL 16** for the database (data persisted in a Docker volume)
- Automatic database migrations on startup

### First Login

On first startup, Cassini creates an admin account. The default credentials are:

- **Username:** `admin`
- **Password:** `cassini`

> You will be prompted to change the password on first login.

To set a custom admin password instead of the default, create a file called `.env` in the `cassini` folder (same folder as `docker-compose.yml`) **before** the first start. Use any text editor — Notepad on Windows, TextEdit on macOS, or `nano` on Linux. Save it with this content:

```env
CASSINI_ADMIN_PASSWORD=my-secure-password
JWT_SECRET=change-me-in-production
```

Then run `docker compose up -d`. Log in at **http://localhost:8000**.

> **Important:** The admin account is only created on the very first startup (when the database is empty). If you want to change the admin password after that, use the UI or delete the Docker volumes and start fresh with `docker compose down -v && docker compose up -d`.

### Stopping and Restarting

Open a terminal in the `cassini` folder and run:

```bash
# Stop Cassini (data is preserved)
docker compose down

# Start again
docker compose up -d

# Stop and DELETE all data (start fresh)
docker compose down -v
```

---

## Quick Start (Manual)

Run Cassini directly from source. This gives you hot-reload on both frontend and backend — useful for development or when Docker isn't an option.

### Prerequisites

You need three things installed. If you don't have them yet, follow the download links for your platform. You'll also need a terminal open ([how?](#new-to-the-command-line)).

| Prerequisite | Version | Download |
|-------------|---------|----------|
| **Python** | 3.11 or newer | [python.org/downloads](https://www.python.org/downloads/) |
| **Node.js** | 18 or newer (22 LTS recommended) | [nodejs.org](https://nodejs.org/) |
| **Git** | Any recent version | [git-scm.com/downloads](https://git-scm.com/downloads) |

> **Verify your installs.** Open a terminal and type each command, pressing Enter after each one:
> ```
> python --version
> node --version
> git --version
> ```
> You should see version numbers (Python 3.11+, Node v18+, Git any version). If a command says "not recognized" or "not found", that tool isn't installed yet — follow the download links above.
>
> **Windows:** If `python` isn't recognized, reinstall from [python.org](https://www.python.org/downloads/) and check **"Add Python to PATH"** during setup. Or try `python3` instead of `python`.
>
> **macOS:** Python 3 may need to be called as `python3`. If Git isn't installed, macOS will offer to install the Xcode Command Line Tools — accept the prompt.

### Step 1: Clone the Repository

In your terminal, run:

```bash
git clone https://github.com/saturnis-io/cassini.git
cd cassini
```

This downloads Cassini into a `cassini` folder and moves into it.

### Step 2: Start the Backend

Run each line one at a time, pressing Enter after each.

<details open>
<summary><strong>Windows (Command Prompt)</strong></summary>

```bash
cd backend                                    # go into the backend folder
python -m venv .venv                          # create a Python virtual environment
.venv\Scripts\activate                        # activate it (your prompt will change)
pip install -e .                              # install Cassini and its dependencies
alembic upgrade head                          # set up the database
set CASSINI_ADMIN_PASSWORD=my-secure-password  # choose your admin password
set CASSINI_COOKIE_SECURE=false               # needed for local development (no HTTPS)
uvicorn cassini.main:app --reload --host 0.0.0.0 --port 8000   # start the server
```

</details>

<details>
<summary><strong>macOS / Linux</strong></summary>

```bash
cd backend                                       # go into the backend folder
python3 -m venv .venv                            # create a Python virtual environment
source .venv/bin/activate                        # activate it (your prompt will change)
pip install -e .                                 # install Cassini and its dependencies
alembic upgrade head                             # set up the database
export CASSINI_ADMIN_PASSWORD=my-secure-password  # choose your admin password
export CASSINI_COOKIE_SECURE=false               # needed for local development (no HTTPS)
uvicorn cassini.main:app --reload --host 0.0.0.0 --port 8000   # start the server
```

</details>

You should see output like:

```
INFO:     Uvicorn running on http://0.0.0.0:8000
INFO:     Started reloader process
```

> **Leave this terminal running** — the server needs to stay open. Open a **new** terminal window for the next step (on Windows: right-click the taskbar and choose "Terminal" or "Command Prompt"; on macOS/Linux: Cmd+N or Ctrl+Shift+N in your terminal app).

### Step 3: Start the Frontend

In your **new** terminal, navigate back to the `cassini` folder you cloned earlier, then:

<details open>
<summary><strong>Windows</strong></summary>

```bash
cd frontend
start.bat
```

Or run it manually:

```bash
cd frontend
npm install       # download frontend dependencies (takes a minute the first time)
npm run dev       # start the frontend dev server
```

</details>

<details>
<summary><strong>macOS / Linux</strong></summary>

```bash
cd frontend
./start.sh
```

Or run it manually:

```bash
cd frontend
npm install       # download frontend dependencies (takes a minute the first time)
npm run dev       # start the frontend dev server
```

</details>

You should see:

```
  VITE v7.x.x  ready

  ➜  Local:   http://localhost:5173/
```

### Step 4: Log In

1. Open **http://localhost:5173** in your browser
2. Log in with username `admin` and the password you set in Step 2
3. You will be prompted to change the password on first login
4. Start creating your plant hierarchy and adding characteristics

> **Tip:** The backend uses SQLite by default -- zero configuration needed. Your database is stored as `cassini.db` in the `backend/` directory. For production use, see [Production Deployment](#production-deployment).

### Quick Start Troubleshooting

<details>
<summary><strong>"python" is not recognized (Windows)</strong></summary>

- Reinstall Python from [python.org](https://www.python.org/downloads/) and check **"Add Python to PATH"** during installation
- Or try `python3` instead of `python`
- Or use the full path: `C:\Users\YourName\AppData\Local\Programs\Python\Python311\python.exe`

</details>

<details>
<summary><strong>"npm" is not recognized</strong></summary>

- Reinstall Node.js from [nodejs.org](https://nodejs.org/) (the LTS version)
- Close and reopen your terminal after installing

</details>

<details>
<summary><strong>Backend starts but frontend shows a blank page or network errors</strong></summary>

- Make sure the backend is still running on port 8000 in its own terminal
- The frontend dev server proxies API requests to `localhost:8000` automatically
- Check the browser console (F12) for specific error messages

</details>

<details>
<summary><strong>"No admin user created" in backend logs</strong></summary>

- You need to set `CASSINI_ADMIN_PASSWORD` before starting the server
- The admin is only created on first startup when the database is empty
- To reset: delete `cassini.db` and restart the backend with the password set

</details>

<details>
<summary><strong>Port 8000 or 5173 already in use</strong></summary>

- Another process is using that port. Find and stop it, or:
  - Backend: `uvicorn cassini.main:app --reload --port 8001`
  - Frontend: edit `vite.config.ts` or set `--port 5174` on the dev command

</details>

---

## CLI Reference

The `cassini` command is available after installing via pip (`pip install -e .`) or the Windows Installer (if PATH was added). These commands work on Windows, macOS, and Linux unless noted.

```
cassini serve                  # start server (runs migrations first)
cassini serve --no-migrate     # start server, skip migrations
cassini serve --host 0.0.0.0 --port 9000
cassini migrate                # run database migrations only
cassini create-admin           # create admin user (interactive)
cassini version                # print version and build info
cassini check                  # validate config, database, license
cassini tray                   # launch system tray companion (Windows only)
cassini service install        # install as Windows Service (Windows only)
cassini service uninstall      # remove Windows Service (Windows only)
cassini service start          # start the service (Windows only)
cassini service stop           # stop the service (Windows only)
```

`cassini serve` auto-migrates the database before starting. Use `--no-migrate` if migrations are managed separately.

Host and port default to values in `cassini.toml` (see below), falling back to `127.0.0.1:8000`.

> **Linux/macOS tip:** Use `systemd` or `supervisord` to run Cassini as a background service. See [Production Deployment](#production-deployment) for a ready-made systemd unit file.

---

## Configuration Reference

Cassini is configured through environment variables, a TOML config file, or both. Environment variables take precedence over the config file.

### Config File (`cassini.toml`)

Cassini looks for `cassini.toml` in this order:

1. Path set in `CASSINI_CONFIG` environment variable
2. Current working directory
3. `C:\ProgramData\Cassini\cassini.toml` (Windows) or `/etc/cassini/cassini.toml` (Linux/macOS)

```toml
[server]
host = "0.0.0.0"
port = 8000

[database]
# Empty = SQLite default at data/cassini.db
# url = "postgresql+asyncpg://user:pass@localhost/cassini"

[license]
# file = "data/license.key"
```

### Environment Variables

All environment variables use the `CASSINI_` prefix. A complete template is available at [`backend/.env.example`](backend/.env.example).

### Core Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `CASSINI_DATABASE_URL` | `sqlite+aiosqlite:///./cassini.db` | Database connection string (see [Database Options](#database-options)) |
| `CASSINI_ADMIN_USERNAME` | `admin` | Username for the bootstrap admin account |
| `CASSINI_ADMIN_PASSWORD` | *(empty -- must set)* | Password for the bootstrap admin account. **Required on first run.** |
| `CASSINI_JWT_SECRET` | *(auto-generated)* | Secret key for signing JWT tokens. Auto-generated and saved to `.jwt_secret` if not set. Set explicitly in production. |
| `CASSINI_DB_ENCRYPTION_KEY` | *(auto-generated)* | Fernet key for encrypting stored database credentials. Auto-generated and saved to `.db_encryption_key` if not set. |
| `CASSINI_COOKIE_SECURE` | `true` | Set to `false` for local development over HTTP. Must be `true` in production (HTTPS). |
| `CASSINI_CORS_ORIGINS` | `http://localhost:5173,...` | Comma-separated list of allowed frontend origins |
| `CASSINI_LOG_FORMAT` | `console` | `console` for human-readable output, `json` for structured logging |

### Rate Limiting

| Variable | Default | Description |
|----------|---------|-------------|
| `CASSINI_RATE_LIMIT_LOGIN` | `5/minute` | Max login attempts per IP |
| `CASSINI_RATE_LIMIT_DEFAULT` | `60/minute` | Default API rate limit per IP |

### Optional Integrations

| Variable | Default | Description |
|----------|---------|-------------|
| `CASSINI_VAPID_PRIVATE_KEY` | *(empty)* | Web push notification private key |
| `CASSINI_VAPID_PUBLIC_KEY` | *(empty)* | Web push notification public key |
| `CASSINI_VAPID_CONTACT_EMAIL` | *(empty)* | Contact email for push notifications |
| `CASSINI_LICENSE_FILE` | *(empty)* | Path to commercial license file |

### Database Options

Cassini supports four database engines. SQLite is the default and requires zero configuration. Production deployments should use PostgreSQL.

| Database | Install Extra | Connection String |
|----------|--------------|-------------------|
| **SQLite** *(default)* | *(included)* | `sqlite+aiosqlite:///./cassini.db` |
| **PostgreSQL** *(recommended for production)* | `pip install -e ".[databases]"` | `postgresql+asyncpg://user:pass@host:5432/dbname` |
| **MySQL** | `pip install -e ".[databases]"` | `mysql+aiomysql://user:pass@host:3306/dbname` |
| **MSSQL** | `pip install -e ".[databases]"` | `mssql+aioodbc://user:pass@host:1433/dbname?driver=ODBC+Driver+17+for+SQL+Server` |

> **Note:** PostgreSQL, MySQL, and MSSQL require the `databases` optional extra. Install it with `pip install -e ".[databases]"` (from source) or `pip install cassini[databases]` (from package).

### Optional Python Extras

Install only what you need, or use `[all]` for everything:

```bash
pip install -e ".[all]"          # Everything below
pip install -e ".[databases]"    # PostgreSQL, MySQL, MSSQL drivers
pip install -e ".[opcua]"        # OPC-UA server connectivity
pip install -e ".[notifications]" # Email and web push notifications
pip install -e ".[sso]"          # OAuth / OIDC single sign-on
pip install -e ".[reporting]"    # PDF and Excel report generation
pip install -e ".[analytics]"    # Advanced statistical analytics
pip install -e ".[ml]"           # Machine learning anomaly detection
pip install -e ".[erp]"          # ERP/LIMS integration adapters
pip install -e ".[dev]"          # All of the above + testing tools
```

---

## Production Deployment

This section covers deploying Cassini for real-world use in a manufacturing environment.

> **Windows on-prem?** The [Windows Installer](#quick-start-windows-installer) handles service registration, auto-start, and configuration out of the box. The sections below cover Docker and manual Linux/macOS deployments.

### Recommended Architecture

```
Internet/Intranet
       │
┌──────▼──────┐
│ Reverse Proxy│  (nginx, Caddy, or cloud LB)
│ TLS/HTTPS    │
└──────┬──────┘
       │ :8000
┌──────▼──────┐     ┌─────────────┐
│   Cassini    │────▶│ PostgreSQL  │
│   (Docker)   │     │   (or other)│
└─────────────┘     └─────────────┘
```

### Option A: Docker Compose (Recommended)

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

### Option B: Manual Deployment (No Docker)

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

**4. Build the frontend:**

```bash
cd frontend
npm ci
npm run build
```

The built files will be in `frontend/dist/`. Serve them with nginx (see below) or any static file server.

**5. Run the backend with a production server:**

```bash
uvicorn cassini.main:app --host 0.0.0.0 --port 8000
```

> **Note on workers:** You can add `--workers 4` for higher throughput, but test carefully -- each worker runs its own event loop, MQTT connections, and WebSocket manager. For most deployments, a single worker with async concurrency handles the load well.

> **Tip:** Use a process manager like `systemd` or `supervisord` to keep the backend running after logout.

<details>
<summary><strong>Example systemd service file</strong></summary>

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

</details>

### Reverse Proxy (HTTPS)

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

### Security Checklist

Before going live, verify each item:

- [ ] `CASSINI_JWT_SECRET` is set to a unique, random value (not the default)
- [ ] `CASSINI_COOKIE_SECURE=true` (requires HTTPS)
- [ ] `CASSINI_ADMIN_PASSWORD` is strong and you have changed it after first login
- [ ] PostgreSQL credentials are not the defaults (`cassini`/`cassini`)
- [ ] The server is behind a reverse proxy with TLS
- [ ] PostgreSQL is not exposed to the public internet (bind to `127.0.0.1` or use Docker networking)
- [ ] Firewall rules restrict access to necessary ports only
- [ ] Structured logging is enabled (`CASSINI_LOG_FORMAT=json`) for your log aggregation system

### Backups

**Database (PostgreSQL):**

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

**Database (SQLite):**

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

**Docker volumes (macOS / Linux):**

```bash
# Backup PostgreSQL data volume
docker run --rm -v cassini_postgres-data:/data -v $(pwd):/backup alpine \
    tar czf /backup/postgres-backup.tar.gz -C /data .
```

> **Windows:** Docker volume backups work the same in PowerShell, but replace `$(pwd)` with `${PWD}`.

### Upgrading

**Docker (all platforms):**

```bash
git pull
docker compose build
docker compose up -d
```

**Manual (macOS / Linux):**

```bash
git pull
cd backend && source .venv/bin/activate
pip install -e ".[all]"
alembic upgrade head
cd ../frontend && npm ci && npm run build
sudo systemctl restart cassini
```

**Manual (Windows):**

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

Then restart the Cassini Windows Service from the system tray or `cassini service stop && cassini service start`.

> **Always back up your database before upgrading.**

---

## Community Edition (Free, AGPL-3.0)

Everything you need for production SPC -- no license key required.

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

![Violations](docs/screenshots/core/violations.png)

### Data Entry & Ingestion

Multiple paths to get data into the system, from manual single-sample entry to high-throughput batch pipelines processing up to 200K samples/min.

![Data Entry](docs/screenshots/core/data-entry.png)

#### Manual & Interactive

- **Manual entry**: Form-based sample submission with measurement validation, subgroup size enforcement, and optional batch/operator metadata
- **CSV/Excel import**: 4-step wizard (upload → validate → map columns → confirm) with preview and error reporting

#### API Ingestion

The REST API provides three ingestion endpoints optimized for different use cases:

| Endpoint | Use Case | Throughput |
|----------|----------|------------|
| `POST /api/v1/data-entry/submit` | Single sample with full SPC + supplementary analysis (CUSUM/EWMA). Supports API key auth for machine integration. | Real-time |
| `POST /api/v1/samples/` | Single sample submission (user auth) | Real-time |
| `POST /api/v1/samples/batch` | Bulk import up to 10,000 samples per request | Up to 200K samples/min |

#### Batch Import (`POST /api/v1/samples/batch`)

The batch endpoint is the primary path for high-volume data ingestion. It accepts up to 10,000 samples per request, all targeting a single characteristic, with three processing modes:

| Mode | Flag | Description | Typical Use |
|------|------|-------------|-------------|
| **Skip rules** | `skip_rule_evaluation: true` | Direct database insert, no SPC evaluation | Historical data migration, backfill |
| **Sync SPC** | (default) | Each sample evaluated through full SPC pipeline (Nelson rules, zone classification) | Standard batch import with immediate violation detection |
| **Async SPC** | `async_spc: true` | Samples inserted immediately, SPC evaluation deferred to background workers | High-throughput production ingestion (**commercial**) |

**Request format:**
```json
{
  "characteristic_id": 42,
  "skip_rule_evaluation": false,
  "async_spc": false,
  "samples": [
    {"measurements": [10.1, 10.2, 10.0]},
    {"measurements": [9.9, 10.1, 10.0], "batch_number": "B-2024-001"},
    {"measurements": [10.3, 10.1, 10.2], "timestamp": "2024-01-15T08:30:00Z"}
  ]
}
```

**Response:**
```json
{
  "total": 3,
  "imported": 3,
  "failed": 0,
  "errors": [],
  "status": "complete"
}
```

Individual sample failures do not abort the batch — successful samples commit while errors are accumulated in the response.

#### Connectivity (MQTT / OPC-UA)

- **MQTT / Sparkplug B**: Topic-to-characteristic mapping with live value preview. Community Edition supports one broker; commercial unlocks unlimited brokers.
- **OPC-UA**: Server management with node tree browsing and subscription-to-SPC pipeline (**commercial**)
- **RS-232/USB Gages**: Bridge agent translates serial gage protocols to MQTT (**commercial**)

### MQTT Connectivity

Native MQTT and Sparkplug B support with topic tree browsing, tag-to-characteristic mapping, and live value preview. Community Edition includes one broker connection; commercial unlocks unlimited brokers.

![Connectivity Monitor](docs/screenshots/connectivity/monitor.png)

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

![Kiosk Mode](docs/screenshots/display/kiosk.png)

### Infrastructure

- **Windows Installer**: Download-and-run `.exe` with Windows Service, system tray, and auto-start
- **Docker**: Production-ready multi-stage Dockerfile + docker-compose with PostgreSQL
- **CLI**: `cassini serve`, `cassini check`, `cassini migrate`, and more — from any terminal
- **REST API**: 300+ endpoints for full programmatic access
- **Batch import**: Up to 10,000 samples per request, three processing modes (skip rules, sync SPC, async SPC)
- **Throughput**: Up to 200K samples/min bulk ingestion (benchmarked on PostgreSQL, 4 uvicorn workers)
- **WebSocket**: Real-time push for chart updates and notifications
- **PWA**: Progressive web app with offline queue support

---

## Commercial Features

> **These features require a [commercial license](https://saturnis.io/pricing) ($3,500/plant/year).** Community Edition users can evaluate commercial features locally by setting `CASSINI_DEV_COMMERCIAL=true`. [Learn more →](https://saturnis.io/pricing)

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

**Measurement System Analysis (Gage R&R)** -- Crossed ANOVA, range method, nested ANOVA, and attribute agreement analysis (Cohen's and Fleiss' Kappa). Uses AIAG MSA 4th Edition d2* tables. Full wizard from study setup through results interpretation.

**First Article Inspection** -- AS9102 Rev C compliant inspection reports with Forms 1, 2, and 3. Draft-to-submitted-to-approved workflow with separation of duties enforcement. Print-optimized view for physical records.

**Design of Experiments** -- Full factorial, fractional factorial, Plackett-Burman, and central composite designs. Interactive design matrix, run table, ANOVA results, main effects plot, and interaction plots.

### Advanced Analytics

![Advanced Analytics](docs/screenshots/commercial/analytics.png)

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

### High-Throughput Async Ingestion

Production environments generating thousands of samples per minute need ingestion that doesn't block on SPC computation. The async SPC pipeline decouples data persistence from rule evaluation:

1. **Ingest**: Samples are validated and committed to the database immediately with `spc_status=pending_spc`
2. **Enqueue**: Sample IDs are published to the background SPC processor
3. **Evaluate**: Background workers run Nelson rules, zone classification, and violation detection asynchronously
4. **Notify**: Violations trigger real-time WebSocket updates and configured notifications

This achieves up to **175K samples/min with full SPC evaluation** — compared to ~26K/min with synchronous processing. The batch endpoint (`POST /api/v1/samples/batch`) enables async mode with a single flag:

```json
{
  "characteristic_id": 42,
  "async_spc": true,
  "samples": [...]
}
```

The response returns immediately with `"status": "processing"` and a list of `sample_ids` for tracking. SPC results appear on charts and dashboards as background processing completes.

| Metric | Sync SPC | Async SPC |
|--------|----------|-----------|
| Throughput (batch, 4 workers) | ~26K samples/min | ~175K samples/min |
| Latency per 1000-sample batch | ~7,400ms | ~2,400ms |
| Violation detection | Immediate in response | Background (seconds) |

### Enterprise Compliance

![Electronic Signatures](docs/screenshots/settings/signatures.png)

**Electronic Signatures (21 CFR Part 11)** -- Configurable multi-step signature workflows with password re-authentication, SHA-256 tamper detection, plant-scoped signature meanings, and FDA-compliant password policies.

**Data Retention** -- Configurable retention policies with inheritance chain (global > plant > area > line > station). Purge engine with full history tracking for regulatory compliance.

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
| Non-normal distribution fitting | -- | Yes |
| Run rule preset management | -- | Yes |
| **Data & Ingestion** | | |
| Manual data entry | Yes | Yes |
| CSV / Excel import wizard | Yes | Yes |
| Batch import API (up to 10K samples/req) | Yes | Yes |
| Bulk import throughput | Up to 200K samples/min | Up to 200K samples/min |
| Throughput with SPC rules | ~26K samples/min (sync) | Up to 175K samples/min (async) |
| MQTT / Sparkplug B connectivity | 1 broker | Unlimited |
| OPC-UA connectivity | -- | Yes |
| RS-232 / USB gage bridge | -- | Yes |
| ERP / LIMS connectors | -- | Yes |
| ISA-95 plant hierarchy | Single plant | Multi-plant |
| **Quality Systems** | | |
| MSA / Gage R&R | -- | Yes |
| First Article Inspection (AS9102) | -- | Yes |
| Electronic signatures (21 CFR Part 11) | -- | Yes |
| DOE (Design of Experiments) | -- | Yes |
| **Analytics & Reporting** | | |
| Dashboard & violation tracking | Yes | Yes |
| Anomaly detection (ML) | -- | Yes |
| Multivariate SPC (T-squared, MEWMA) | -- | Yes |
| AI-powered analysis | -- | Yes |
| Predictive analytics | -- | Yes |
| Scheduled & automated reporting | -- | Yes |
| Ishikawa root cause diagrams | -- | Yes |
| **Administration** | | |
| User management & RBAC | Yes | Yes |
| Audit trail | Yes | Yes |
| SSO / OIDC | -- | Yes |
| Data retention policies | -- | Yes |
| ERP / MES integration | -- | Yes |
| Push notifications | -- | Yes |
| **Infrastructure** | | |
| Windows installer + service | Yes | Yes |
| CLI (`cassini serve`, etc.) | Yes | Yes |
| Database | SQLite | PostgreSQL, MSSQL, MySQL |
| REST API (300+) | Yes | Yes |
| Batch import API | Yes | Yes |
| Async SPC pipeline | -- | Yes |
| Source code access | Yes | Yes |
| Modification rights | AGPL (share-alike) | Proprietary |
| Support | Community (GitHub) | Dedicated with SLA |
| | **Free** | **$3,500/plant/yr** |

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
| **Backend** | Python 3.11+, FastAPI, SQLAlchemy async, Alembic, Pydantic, Click (CLI) |
| **Frontend** | React 19, TypeScript 5.9, Vite 7, TanStack Query v5, Zustand v5 |
| **Charts** | ECharts 6 (tree-shaken, canvas renderer) |
| **Validation** | Zod v4 (frontend), Pydantic v2 (backend) |
| **Styling** | Tailwind CSS v4 with retro and glass visual themes |
| **Bridge** | Python, pyserial, paho-mqtt (pip-installable `cassini-bridge`) |
| **Desktop** | PyInstaller (freeze), Inno Setup (installer), pystray (tray), pywin32 (service) |
| **Database** | SQLite, PostgreSQL, MySQL, MSSQL via dialect abstraction |
| **Real-time** | WebSocket (FastAPI native), MQTT (paho-mqtt / asyncio-mqtt) |
| **ML** | ruptures (changepoint), scikit-learn (Isolation Forest), scipy |

### Project Structure

```
cassini/
├── backend/              FastAPI application
│   ├── src/cassini/
│   │   ├── api/          Routers, schemas, dependencies
│   │   ├── cli/          CLI entrypoint (cassini serve, migrate, etc.)
│   │   ├── core/         SPC engine, capability, MSA, anomaly, signatures
│   │   ├── db/           Models, repositories, migrations
│   │   ├── service/      Windows Service (CassiniSPC)
│   │   └── tray/         System tray companion (pystray)
│   ├── alembic/          Database migrations
│   ├── cassini-server.spec  PyInstaller spec for server executable
│   ├── cassini-tray.spec   PyInstaller spec for tray executable
│   ├── .env.example      Environment variable template
│   └── pyproject.toml    Python dependencies
├── frontend/             React SPA
│   ├── src/
│   │   ├── api/          API client, hooks, namespaces (21 API modules)
│   │   ├── components/   200+ components organized by domain
│   │   ├── pages/        22 page components
│   │   ├── stores/       Zustand state stores
│   │   └── hooks/        Custom React hooks
│   ├── start.sh          One-command dev startup (macOS/Linux)
│   ├── start.bat         One-command dev startup (Windows)
│   └── package.json      Node dependencies
├── bridge/               Serial gage → MQTT translator (commercial)
│   ├── src/cassini_bridge/
│   └── cassini-bridge.spec  PyInstaller spec for bridge executable
├── installer/            Inno Setup Windows installer
│   ├── cassini.iss       Installer script
│   └── templates/        Default config files
├── docker-compose.yml    Production-ready Docker setup
├── Dockerfile            Multi-stage build (frontend + backend)
└── docs/                 Documentation and images
```

---

## Development

These commands work on all platforms. Run them from the `cassini` root folder.

```bash
# Type checking (frontend)
cd frontend && npx tsc --noEmit

# Full build check
cd frontend && npx tsc -b

# Production build
cd frontend && npm run build

# Run backend with auto-reload (activate .venv first)
cd backend && uvicorn cassini.main:app --reload

# Run backend tests
cd backend && pytest tests/ -x

# New database migration
cd backend && alembic revision --autogenerate -m "description"

# Install bridge for development
cd bridge && pip install -e .
```

> **Reminder:** Activate the Python virtual environment before running backend commands. On Windows: `.venv\Scripts\activate`. On macOS/Linux: `source .venv/bin/activate`.

### Key Conventions

- **TypeScript**: Strict mode, `noUnusedLocals`, `noUnusedParameters`
- **Formatting**: Prettier -- no semicolons, single quotes, trailing commas, 100 char width
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

The AGPL-3.0 is a strong copyleft license that ensures improvements stay open. The key requirement: **if you modify Cassini and make it available over a network -- including internal company networks -- the AGPL requires you to share your complete source code with all users.** This is what keeps open source sustainable.

If your organization needs to make proprietary modifications, embed Cassini in a closed-source product, or requires commercial features like electronic signatures and multi-plant management, a [commercial license](https://saturnis.io/pricing) removes the AGPL obligations and unlocks the full platform.

**Not sure which you need?** Email [sales@saturnis.io](mailto:sales@saturnis.io).

---

## Links

| | |
|---|---|
| **Pricing** | [saturnis.io/pricing](https://saturnis.io/pricing) |
| **Commercial License** | [saturnis.io/pricing](https://saturnis.io/pricing) |
| **Contributing** | [CONTRIBUTING.md](CONTRIBUTING.md) |
| **Security** | [SECURITY.md](SECURITY.md) |
| **Code of Conduct** | [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) |
| **Support** | [community@saturnis.io](mailto:community@saturnis.io) |

---

Copyright 2026 [Saturnis LLC](https://saturnis.io). Built with FastAPI, React, ECharts, and statistical rigor.
