# Configuration

Cassini is configured through environment variables, a TOML config file, or both. Environment variables take precedence over the config file.

## Config File (`cassini.toml`)

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

## Environment Variables

All environment variables use the `CASSINI_` prefix. A complete template is available at [`backend/.env.example`](../backend/.env.example).

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

## Database Options

Cassini supports four database engines. SQLite is the default and requires zero configuration. Production deployments should use PostgreSQL.

| Database | Install Extra | Connection String |
|----------|--------------|-------------------|
| **SQLite** *(default)* | *(included)* | `sqlite+aiosqlite:///./cassini.db` |
| **PostgreSQL** *(recommended for production)* | `pip install -e ".[databases]"` | `postgresql+asyncpg://user:pass@host:5432/dbname` |
| **MySQL** | `pip install -e ".[databases]"` | `mysql+aiomysql://user:pass@host:3306/dbname` |
| **MSSQL** | `pip install -e ".[databases]"` | `mssql+aioodbc://user:pass@host:1433/dbname?driver=ODBC+Driver+17+for+SQL+Server` |

> **Note:** PostgreSQL, MySQL, and MSSQL require the `databases` optional extra. Install it with `pip install -e ".[databases]"` (from source) or `pip install cassini[databases]` (from package).

## Python Extras

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
