# Getting Started

<a id="new-to-the-command-line"></a>
<details>
<summary><strong>New to the command line?</strong></summary>

The guides below use terminal commands. Here's how to open a terminal on your platform.

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

## Windows

### Option A: Windows Installer (recommended)

Download the installer from [GitHub Releases](https://github.com/saturnis-io/cassini/releases), run it, and Cassini is ready.

#### What Gets Installed

| Component | Description |
|-----------|-------------|
| **Cassini Server** | Backend + frontend bundled into a single executable |
| **System Tray** | Status icon with health monitoring, service controls, and browser launch |
| **Bridge** *(optional)* | Serial gage to MQTT translator for shop floor gages |

The installer registers Cassini as a Windows Service that starts automatically on boot. Data is stored in `C:\ProgramData\Cassini\`.

#### After Install

1. Cassini starts automatically as a Windows Service
2. The system tray icon appears -- right-click for controls
3. Open **http://localhost:8000** in your browser
4. Log in with `admin` / `cassini` (you'll be prompted to change the password)

![Cassini Login](screenshots/core/login.png)

#### Configuration

Edit `C:\ProgramData\Cassini\cassini.toml` to change server port, database, or other settings. See [configuration.md](configuration.md) and [cli.md](cli.md).

To run these commands, open a terminal ([how?](#new-to-the-command-line)) and type:

```bash
cassini check     # validate config, database, and license
cassini version   # print version and build info
```

#### Uninstall

Use **Add or Remove Programs** in Windows Settings. The uninstaller stops the service and removes program files. Your data directory (`C:\ProgramData\Cassini\`) is preserved -- delete it manually if you want a clean removal.

---

<a id="docker"></a>

### Option B: Docker

#### Prerequisites

Install [Docker Desktop for Windows](https://docs.docker.com/desktop/setup/install/windows-install/).

#### Run Cassini

Open a terminal ([how?](#new-to-the-command-line)) and run:

```bash
# Clone the repository
git clone https://github.com/saturnis-io/cassini.git
cd cassini

# Start Cassini + PostgreSQL
docker compose up -d
```

Open **http://localhost:8000** in your browser.

The Docker Compose setup includes:
- **Cassini** (backend + frontend built together) on port 8000
- **PostgreSQL 16** for the database (data persisted in a Docker volume)
- Automatic database migrations on startup

#### First Login

On first startup, Cassini creates an admin account. The default credentials are:

- **Username:** `admin`
- **Password:** `cassini`

> You will be prompted to change the password on first login.

To set a custom admin password instead of the default, create a file called `.env` in the `cassini` folder (same folder as `docker-compose.yml`) **before** the first start. Use any text editor -- Notepad works fine. Save it with this content:

```env
CASSINI_ADMIN_PASSWORD=my-secure-password
JWT_SECRET=change-me-in-production
```

Then run `docker compose up -d`. Log in at **http://localhost:8000**.

> **Important:** The admin account is only created on the very first startup (when the database is empty). If you want to change the admin password after that, use the UI or delete the Docker volumes and start fresh with `docker compose down -v && docker compose up -d`.

#### Stopping and Restarting

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

<a id="from-source"></a>

### Option C: From Source

Run Cassini directly from source. This gives you hot-reload on both frontend and backend -- useful for development or when Docker isn't an option.

#### Prerequisites

You need three things installed. If you don't have them yet, follow the download links. You'll also need a terminal open ([how?](#new-to-the-command-line)).

| Prerequisite | Version | Download |
|-------------|---------|----------|
| **Python** | 3.11 or newer | [python.org/downloads](https://www.python.org/downloads/) |
| **Node.js** | 18 or newer (22 LTS recommended) | [nodejs.org](https://nodejs.org/) |
| **Git** | Any recent version | [git-scm.com/downloads](https://git-scm.com/downloads) |

Verify your installs. Open a terminal and type each command, pressing Enter after each one:

```
python --version
node --version
git --version
```

You should see version numbers (Python 3.11+, Node v18+, Git any version). If a command says "not recognized", that tool isn't installed yet -- follow the download links above.

> **Windows tip:** If `python` isn't recognized, reinstall from [python.org](https://www.python.org/downloads/) and check **"Add Python to PATH"** during setup. Or try `python3` instead of `python`.

#### Step 1: Clone the Repository

```bash
git clone https://github.com/saturnis-io/cassini.git
cd cassini
```

#### Step 2: Start the Backend

Run each line one at a time, pressing Enter after each.

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

You should see output like:

```
INFO:     Uvicorn running on http://0.0.0.0:8000
INFO:     Started reloader process
```

> **Leave this terminal running** -- the server needs to stay open. Open a **new** terminal window for the next step (right-click the taskbar and choose "Terminal" or "Command Prompt").

#### Step 3: Start the Frontend

In your **new** terminal, navigate back to the `cassini` folder you cloned earlier, then:

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

You should see:

```
  VITE v7.x.x  ready

  ➜  Local:   http://localhost:5173/
```

#### Step 4: Log In

1. Open **http://localhost:5173** in your browser
2. Log in with username `admin` and the password you set in Step 2
3. You will be prompted to change the password on first login
4. Start creating your plant hierarchy and adding characteristics

> **Tip:** The backend uses SQLite by default -- zero configuration needed. Your database is stored as `cassini.db` in the `backend/` directory. For production use, see [deployment.md](deployment.md).

---

## macOS

### Option A: Docker (recommended)

#### Prerequisites

Install [Docker Desktop for Mac](https://docs.docker.com/desktop/setup/install/mac-install/).

#### Run Cassini

Open a terminal (**Cmd + Space**, type **Terminal**, press Enter) and run:

```bash
# Clone the repository
git clone https://github.com/saturnis-io/cassini.git
cd cassini

# Start Cassini + PostgreSQL
docker compose up -d
```

Open **http://localhost:8000** in your browser.

The Docker Compose setup includes:
- **Cassini** (backend + frontend built together) on port 8000
- **PostgreSQL 16** for the database (data persisted in a Docker volume)
- Automatic database migrations on startup

#### First Login

On first startup, Cassini creates an admin account. The default credentials are:

- **Username:** `admin`
- **Password:** `cassini`

> You will be prompted to change the password on first login.

To set a custom admin password instead of the default, create a file called `.env` in the `cassini` folder (same folder as `docker-compose.yml`) **before** the first start. Use TextEdit or `nano .env` in the terminal. Save it with this content:

```env
CASSINI_ADMIN_PASSWORD=my-secure-password
JWT_SECRET=change-me-in-production
```

Then run `docker compose up -d`. Log in at **http://localhost:8000**.

> **Important:** The admin account is only created on the very first startup (when the database is empty). If you want to change the admin password after that, use the UI or delete the Docker volumes and start fresh with `docker compose down -v && docker compose up -d`.

#### Stopping and Restarting

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

### Option B: From Source

Run Cassini directly from source. This gives you hot-reload on both frontend and backend -- useful for development or when Docker isn't an option.

#### Prerequisites

Install via [Homebrew](https://brew.sh/):

```bash
brew install python@3.11 node git
```

Or download manually:

| Prerequisite | Version | Download |
|-------------|---------|----------|
| **Python** | 3.11 or newer | [python.org/downloads](https://www.python.org/downloads/) |
| **Node.js** | 18 or newer (22 LTS recommended) | [nodejs.org](https://nodejs.org/) |
| **Git** | Any recent version | [git-scm.com/downloads](https://git-scm.com/downloads) |

Verify your installs:

```bash
python3 --version
node --version
git --version
```

You should see version numbers (Python 3.11+, Node v18+, Git any version). If Git isn't installed, macOS will offer to install the Xcode Command Line Tools -- accept the prompt.

#### Step 1: Clone the Repository

```bash
git clone https://github.com/saturnis-io/cassini.git
cd cassini
```

#### Step 2: Start the Backend

Run each line one at a time, pressing Enter after each.

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

You should see output like:

```
INFO:     Uvicorn running on http://0.0.0.0:8000
INFO:     Started reloader process
```

> **Leave this terminal running** -- the server needs to stay open. Open a **new** terminal window for the next step (**Cmd + N** in Terminal.app).

#### Step 3: Start the Frontend

In your **new** terminal, navigate back to the `cassini` folder you cloned earlier, then:

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

You should see:

```
  VITE v7.x.x  ready

  ➜  Local:   http://localhost:5173/
```

#### Step 4: Log In

1. Open **http://localhost:5173** in your browser
2. Log in with username `admin` and the password you set in Step 2
3. You will be prompted to change the password on first login
4. Start creating your plant hierarchy and adding characteristics

> **Tip:** The backend uses SQLite by default -- zero configuration needed. Your database is stored as `cassini.db` in the `backend/` directory. For production use, see [deployment.md](deployment.md).

---

### Running in Background

#### System Tray

`cassini tray` launches a menu bar icon with health monitoring, service controls, and one-click browser launch.

#### Auto-Start with launchd

To run Cassini as a background service that starts on login, save the following to `~/Library/LaunchAgents/io.saturnis.cassini.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>io.saturnis.cassini</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/cassini</string>
    <string>serve</string>
  </array>
  <key>WorkingDirectory</key>
  <string>/opt/cassini/backend</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>CASSINI_DATABASE_URL</key>
    <string>postgresql+asyncpg://cassini:password@localhost:5432/cassini</string>
    <key>CASSINI_JWT_SECRET</key>
    <string>your-jwt-secret</string>
    <key>CASSINI_COOKIE_SECURE</key>
    <string>true</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/opt/cassini/logs/cassini.log</string>
  <key>StandardErrorPath</key>
  <string>/opt/cassini/logs/cassini-error.log</string>
</dict>
</plist>
```

Load the service:

```bash
launchctl load ~/Library/LaunchAgents/io.saturnis.cassini.plist
```

Manage it:

```bash
launchctl stop io.saturnis.cassini     # stop
launchctl start io.saturnis.cassini    # start
launchctl unload ~/Library/LaunchAgents/io.saturnis.cassini.plist  # remove
```

---

## Linux

### Option A: Docker (recommended)

#### Prerequisites

Install [Docker Engine](https://docs.docker.com/engine/install/) for your distribution.

#### Run Cassini

Open a terminal (**Ctrl + Alt + T**) and run:

```bash
# Clone the repository
git clone https://github.com/saturnis-io/cassini.git
cd cassini

# Start Cassini + PostgreSQL
docker compose up -d
```

Open **http://localhost:8000** in your browser.

The Docker Compose setup includes:
- **Cassini** (backend + frontend built together) on port 8000
- **PostgreSQL 16** for the database (data persisted in a Docker volume)
- Automatic database migrations on startup

#### First Login

On first startup, Cassini creates an admin account. The default credentials are:

- **Username:** `admin`
- **Password:** `cassini`

> You will be prompted to change the password on first login.

To set a custom admin password instead of the default, create a file called `.env` in the `cassini` folder (same folder as `docker-compose.yml`) **before** the first start. Use `nano .env` or any text editor. Save it with this content:

```env
CASSINI_ADMIN_PASSWORD=my-secure-password
JWT_SECRET=change-me-in-production
```

Then run `docker compose up -d`. Log in at **http://localhost:8000**.

> **Important:** The admin account is only created on the very first startup (when the database is empty). If you want to change the admin password after that, use the UI or delete the Docker volumes and start fresh with `docker compose down -v && docker compose up -d`.

#### Stopping and Restarting

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

### Option B: From Source

Run Cassini directly from source. This gives you hot-reload on both frontend and backend -- useful for development or when Docker isn't an option.

#### Prerequisites

**Ubuntu / Debian:**

```bash
sudo apt update && sudo apt install python3.11 python3.11-venv python3-pip nodejs npm git
```

**Fedora / RHEL:**

```bash
sudo dnf install python3.11 nodejs npm git
```

Verify your installs:

```bash
python3 --version
node --version
git --version
```

You should see version numbers (Python 3.11+, Node v18+, Git any version).

#### Step 1: Clone the Repository

```bash
git clone https://github.com/saturnis-io/cassini.git
cd cassini
```

#### Step 2: Start the Backend

Run each line one at a time, pressing Enter after each.

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

You should see output like:

```
INFO:     Uvicorn running on http://0.0.0.0:8000
INFO:     Started reloader process
```

> **Leave this terminal running** -- the server needs to stay open. Open a **new** terminal window for the next step (**Ctrl + Shift + N** in most terminal emulators).

#### Step 3: Start the Frontend

In your **new** terminal, navigate back to the `cassini` folder you cloned earlier, then:

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

You should see:

```
  VITE v7.x.x  ready

  ➜  Local:   http://localhost:5173/
```

#### Step 4: Log In

1. Open **http://localhost:5173** in your browser
2. Log in with username `admin` and the password you set in Step 2
3. You will be prompted to change the password on first login
4. Start creating your plant hierarchy and adding characteristics

> **Tip:** The backend uses SQLite by default -- zero configuration needed. Your database is stored as `cassini.db` in the `backend/` directory. For production use, see [deployment.md](deployment.md).

---

### Running in Background

#### System Tray

`cassini tray` works on Linux desktop environments with system tray support.

#### Auto-Start with systemd

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

Enable and start:

```bash
sudo systemctl enable cassini
sudo systemctl start cassini
```

Manage it:

```bash
sudo systemctl status cassini    # check status
sudo systemctl stop cassini      # stop
sudo systemctl restart cassini   # restart
journalctl -u cassini -f         # follow logs
```

---

## Troubleshooting

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

<details>
<summary><strong>macOS: "python3" not found after Homebrew install</strong></summary>

- Run `brew link python@3.11` to ensure it's on your PATH
- Or use the full path: `/opt/homebrew/bin/python3`
- If you see "command not found" for Git, accept the Xcode Command Line Tools prompt that appears

</details>

<details>
<summary><strong>Linux: Python 3.11 not available in package manager</strong></summary>

- **Ubuntu/Debian**: Add the deadsnakes PPA first:
  ```bash
  sudo add-apt-repository ppa:deadsnakes/ppa
  sudo apt update
  sudo apt install python3.11 python3.11-venv
  ```
- **Fedora**: Try `sudo dnf install python3.11` or build from source via [pyenv](https://github.com/pyenv/pyenv)

</details>

<details>
<summary><strong>Docker: "permission denied" on Linux</strong></summary>

- Add your user to the `docker` group: `sudo usermod -aG docker $USER`
- Log out and back in for the group change to take effect
- Or prefix Docker commands with `sudo`

</details>
