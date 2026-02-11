# Administration Guide

This guide covers system administration tasks for OpenSPC, including initial setup, plant management, user management, equipment hierarchy configuration, industrial connectivity, and ongoing maintenance.

**Audience:** Administrators and engineers responsible for deploying, configuring, and maintaining an OpenSPC installation.

---

## Table of Contents

1. [Initial Setup](#1-initial-setup)
2. [Plant Management](#2-plant-management)
3. [Equipment Hierarchy](#3-equipment-hierarchy)
4. [Characteristic Management](#4-characteristic-management)
5. [User Management](#5-user-management)
6. [Industrial Connectivity (MQTT & OPC-UA)](#6-industrial-connectivity-mqtt--opc-ua)
7. [Database Administration](#7-database-administration)
8. [API Keys](#8-api-keys)
9. [System Settings](#9-system-settings)
10. [Development Tools (Sandbox Mode)](#10-development-tools-sandbox-mode)
11. [Maintenance](#11-maintenance)

---

## 1. Initial Setup

### First Login

When OpenSPC starts for the first time with an empty database, it automatically creates a bootstrap admin account. The default credentials are:

| Field    | Default Value |
|----------|---------------|
| Username | `admin`       |
| Password | `admin`       |

These defaults can be overridden with environment variables before first startup:

```bash
export OPENSPC_ADMIN_USERNAME=myadmin
export OPENSPC_ADMIN_PASSWORD=a-strong-password-here
```

Navigate to the login page and sign in with the bootstrap credentials.

> **Warning:** Change the default admin password immediately after first login. The default `admin`/`admin` credentials are insecure and should never be used in production.

### Changing Default Credentials

1. Log in as the admin user.
2. Navigate to **Users** (`/admin/users`) in the sidebar.
3. Click **Edit** on the admin user row.
4. Enter a new password (minimum 8 characters) and confirm it.
5. Click **Save Changes**.

Alternatively, set the `OPENSPC_ADMIN_USERNAME` and `OPENSPC_ADMIN_PASSWORD` environment variables before the first startup so the bootstrap process creates the account with your chosen credentials from the start.

### Understanding the Admin Role

OpenSPC uses a four-tier role hierarchy. The admin role is the highest level and grants full access to all system features:

| Role       | Level | Access Scope |
|------------|-------|--------------|
| Operator   | 1     | Dashboard, data entry, violations, kiosk |
| Supervisor | 2     | + Reports, acknowledge violations, edit/exclude samples |
| Engineer   | 3     | + Configuration, connectivity, API keys, database settings |
| Admin      | 4     | + User management, site management, branding, dev tools |

Roles are **per-plant** -- a user can be an admin on one plant and an operator on another. The system resolves the user's effective role based on the currently selected plant.

When new plants are created, all existing admin users are automatically granted admin access to the new plant.

---

## 2. Plant Management

### What Is a Plant?

A **plant** (also called a "site") represents a physical facility or logical grouping for data isolation. Each plant has its own:

- Equipment hierarchy
- Characteristics and samples
- MQTT broker connections and OPC-UA server connections
- User role assignments

This multi-tenant design allows a single OpenSPC instance to serve multiple sites while keeping data cleanly separated.

### Default Plant

Every installation starts with a **DEFAULT** plant. This plant:

- Cannot be deleted
- Cannot be deactivated
- Has its code locked to `DEFAULT`
- Serves as the initial data container

### Creating a Plant

1. Navigate to **Settings > Sites** (`/settings`, Sites tab).
2. Scroll to the **Add New Site** form.
3. Fill in:
   - **Site Name** -- a human-readable name (e.g., "Chicago Factory")
   - **Code** -- a short uppercase identifier, max 10 characters (e.g., `CHI`)
   - **Settings (JSON)** -- optional plant-specific configuration (e.g., `{"timezone": "America/Chicago"}`)
4. Click **Add Site**.

When a new plant is created, all users with admin roles on any existing plant are automatically granted admin access to the new plant.

### Managing Plants

From the Sites settings tab, you can:

- **Edit** a plant's name, code, or settings by clicking the pencil icon.
- **Deactivate** a plant by clicking the power-off icon (non-DEFAULT plants only). Deactivated plants are hidden from regular users but retain their data.
- **Activate** a previously deactivated plant by clicking the power icon.
- **Delete** a plant by clicking the trash icon (only available for inactive, non-DEFAULT plants). This permanently removes the plant and all associated hierarchies, characteristics, and data.

> **Warning:** Deleting a plant is irreversible and destroys all data associated with that site.

### Switching Between Plants

Use the **plant selector** dropdown in the application header to switch between plants. Switching plants:

- Reloads the hierarchy tree
- Resets the dashboard and configuration views
- Updates all data queries to the selected plant scope

---

## 3. Equipment Hierarchy

### ISA-95 Equipment Model

OpenSPC organizes equipment using a tree structure based on the ISA-95 standard. The available node types are:

| Node Type   | Description                          | Typical Use |
|-------------|--------------------------------------|-------------|
| Enterprise  | Top-level organization               | Company name |
| Site        | Physical location                    | Factory, campus |
| Area        | Functional area within a site        | Building, department |
| Line        | Production line                      | Assembly line, packaging line |
| Cell        | Work cell within a line              | Station, machine group |
| Equipment   | Individual piece of equipment        | CNC machine, oven, press |
| Tag         | Data point on equipment              | Sensor, measurement point |
| Folder      | Generic organizational grouping      | Logical grouping of any items |

The hierarchy is plant-scoped -- each plant has its own independent tree.

### Example Hierarchy

```mermaid
graph TD
    E[Enterprise: Acme Corp]
    E --> S1[Site: Chicago Plant]
    E --> S2[Site: Detroit Plant]
    S1 --> A1[Area: Tablet Manufacturing]
    S1 --> A2[Area: Quality Lab]
    A1 --> L1[Line: Compression Line 1]
    A1 --> L2[Line: Coating Line]
    L1 --> EQ1[Equipment: Tablet Press #1]
    L1 --> EQ2[Equipment: Tablet Press #2]
    EQ1 --> C1((Char: Tablet Weight))
    EQ1 --> C2((Char: Hardness))
    EQ2 --> C3((Char: Tablet Weight))
    A2 --> EQ3[Equipment: Dissolution Tester]
    EQ3 --> C4((Char: Dissolution Rate))
```

### Creating Hierarchy Nodes

1. Navigate to **Configuration** (`/configuration`) in the sidebar.
2. Make sure the correct plant is selected in the header dropdown.
3. Click the **+** button in the Hierarchy panel header.
4. Select a **Node Type** from the dropdown.
5. Enter a **Name** for the node.
6. If you have a node selected in the tree, the new node will be created as a child of that node. Otherwise, it will be created as a root-level node.
7. Click **Create Node**.

### Organizing Characteristics

Characteristics (measurable quality attributes) are attached to hierarchy nodes. Select a node in the tree, then click **Add Characteristic** to open the creation wizard.

### Best Practices for Hierarchy Design

- **Mirror your physical layout.** The hierarchy should reflect how your factory floor is organized so operators can find characteristics intuitively.
- **Use consistent naming conventions.** Establish naming patterns early (e.g., `Line 1 > Press A > Weight` not `Weight of Press A on L1`).
- **Keep the tree shallow when possible.** Deep nesting (more than 5-6 levels) makes navigation cumbersome.
- **Use Folders for logical grouping.** When items do not map directly to ISA-95 levels, use Folder nodes.
- **Delete leaf-first.** You cannot delete a node that has children -- remove or relocate child nodes first.
- **Plan before building.** Restructuring a large hierarchy later requires recreating nodes since moving nodes between parents is not directly supported.

---

## 4. Characteristic Management

### What Is a Characteristic?

A **characteristic** represents a single measurable quality attribute that you want to monitor with SPC control charts. Examples include:

- Tablet weight (mg)
- Fill volume (mL)
- Temperature (C)
- Surface roughness (Ra)
- pH level

Each characteristic has its own control chart, control limits, Nelson rule configuration, and sample history.

### Creating Characteristics with the Wizard

The Create Characteristic Wizard walks you through a multi-step process:

```mermaid
flowchart LR
    A[Step 1: Basics] --> B{Provider Type?}
    B -->|Manual| D[Step 2: Limits]
    B -->|MQTT Tag| C[Step 2: Data Source]
    B -->|OPC-UA Node| C
    C --> D
    D --> E[Create Characteristic]
    E --> F{Automated provider?}
    F -->|Yes| G[Create Data Source Mapping]
    G --> H[Refresh Subscriptions]
    F -->|No| I[Done]
    H --> I
```

**Step 1 -- Basics:**
- **Name**: Descriptive name for the characteristic
- **Provider Type**: `Manual Entry` (operator inputs data), `MQTT Tag` (automated via MQTT broker), or `OPC-UA Node` (automated via OPC-UA server)
- **Subgroup Size**: Number of measurements per sample (1-25). This determines the chart type:
  - n=1: Individuals & Moving Range (I-MR)
  - n=2-10: X-bar & R chart
  - n>10: X-bar & S chart

**Step 2 -- Data Source** (MQTT Tag or OPC-UA Node provider types):
- **MQTT**: Select a connected MQTT broker, browse or enter the topic, select a Sparkplug B metric (if applicable)
- **OPC-UA**: Select a connected OPC-UA server, browse the address space, select a variable node
- Choose a trigger strategy (On Change, On Trigger, On Timer)

**Step 3 -- Limits:**
- **Target**: Nominal target value (optional)
- **USL / LSL**: Upper and Lower Specification Limits (optional)
- All limits can be configured or changed later

### Configuration Tabs

After creating a characteristic, select it in the Configuration page hierarchy tree to access the detailed configuration tabs:

**General Tab:**
- Name and description
- Provider type (Manual, MQTT Tag, or OPC-UA Node)
- Subgroup size
- Decimal precision for display

**Limits Tab:**
- View current UCL (Upper Control Limit), CL (Center Line), and LCL (Lower Control Limit)
- **Recalculate limits** with options:
  - Exclude out-of-control samples
  - Specify a date range
  - Use last N samples (default: 100)
- **Set manual limits**: Override calculated limits with specific UCL/CL/LCL values

**Sampling Tab:**
- **Subgroup mode**:
  - *Nominal Tolerance* -- Standard mode using target/USL/LSL
  - *Standardized* -- Z-score normalization for variable subgroup sizes
  - *Variable Limits* -- Per-sample control limits based on actual subgroup size
- Minimum measurement count per sample
- Warning threshold for undersized samples

**Rules Tab:**
- Enable or disable each of the 8 Nelson rules individually
- Configure whether each rule requires acknowledgment when triggered
- Visual sparkline illustrations show the pattern each rule detects:

| Rule | Name           | Pattern                                           | Default Severity |
|------|----------------|----------------------------------------------------|-----------------|
| 1    | Outlier        | 1 point beyond 3-sigma                             | CRITICAL        |
| 2    | Shift          | 9 consecutive points on same side of center line    | WARNING         |
| 3    | Trend          | 6 consecutive points monotonically increasing/decreasing | WARNING    |
| 4    | Alternator     | 14 consecutive alternating up/down                  | WARNING         |
| 5    | Zone A         | 2 of 3 consecutive in Zone A or beyond              | WARNING         |
| 6    | Zone B         | 4 of 5 consecutive in Zone B or beyond              | WARNING         |
| 7    | Stratification | 15 consecutive in Zone C (too little variation)     | WARNING         |
| 8    | Mixture        | 8 consecutive outside Zone C                        | WARNING         |

---

## 5. User Management

### Creating Users

1. Navigate to **Users** (`/admin/users`) in the sidebar (admin only).
2. Click **Create User**.
3. Fill in the user details:
   - **Username** (required, minimum 3 characters)
   - **Email** (optional)
   - **Password** (required, minimum 8 characters)
   - **Confirm Password**
4. Add **Site Role Assignments** (see below).
5. Click **Create User**.

### Role Hierarchy

Roles are hierarchical -- a higher role inherits all permissions of lower roles:

```
Admin (4)
  |-- Engineer (3)
       |-- Supervisor (2)
            |-- Operator (1)
```

| Role       | Can Do Everything Below Plus...                              |
|------------|--------------------------------------------------------------|
| Operator   | View dashboards, enter data, view violations, use kiosk mode |
| Supervisor | Acknowledge violations, edit/exclude/delete samples, create annotations, view reports |
| Engineer   | Configure characteristics, manage hierarchy, configure connectivity, manage API keys |
| Admin      | Manage users, manage plants/sites, configure branding, access dev tools |

### Assigning Per-Plant Roles

Roles are scoped to individual plants. A user can have different roles at different sites:

1. In the Create/Edit User dialog, click **+ Add Assignment** under Site Roles.
2. Select a **Site** from the dropdown.
3. Select a **Role** from the dropdown.
4. Repeat for each plant the user needs access to.
5. To remove access to a plant, click the **x** button next to the assignment.

A user with no role assigned to a plant will not be able to access that plant's data or appear in the plant selector.

### Password Management

- Passwords are hashed using Argon2id (industry-standard algorithm).
- When editing a user, leave the password field blank to keep the current password.
- Enter a new password (minimum 8 characters) to change it.
- There is no self-service password reset -- an admin must set new passwords.

### Deactivating Users

Deactivating a user prevents them from logging in while preserving their data and audit trail:

1. In the User Management table, click the user's action menu.
2. Click **Deactivate**.
3. Confirm the action in the dialog.

Deactivated users:
- Cannot log in
- Retain their username (cannot be reused while deactivated)
- Can be reactivated by editing the user and checking the "Active" checkbox

### Permanently Deleting Users

Permanent deletion is a two-step process:

1. First, **deactivate** the user.
2. Once deactivated, the **Delete** option becomes available.
3. Click **Delete** and confirm.

> **Warning:** Permanent deletion cannot be undone. The username becomes available for reuse.

**Safeguards:**
- You cannot deactivate yourself.
- You cannot remove your own admin role.
- You cannot permanently delete an active user (must deactivate first).

---

## 6. Industrial Connectivity (MQTT & OPC-UA)

### Overview

OpenSPC can automatically ingest data from industrial equipment via two protocols: **MQTT** (with Sparkplug B support) and **OPC-UA**. This eliminates manual data entry by subscribing to equipment data and feeding measurements directly into the SPC engine.

```mermaid
flowchart LR
    PLC1[PLC / Edge Device] -->|Publish| MQTT[MQTT Broker]
    PLC2[PLC / DCS] -->|OPC-UA| OPCUA[OPC-UA Server]
    MQTT -->|Subscribe| OSP_MQTT[MQTT Manager]
    OPCUA -->|Monitor| OSP_OPCUA[OPC-UA Manager]
    OSP_MQTT --> TAG[Tag Provider]
    OSP_OPCUA --> OPCPROV[OPC-UA Provider]
    TAG -->|Mapped Topics| SPC[SPC Engine]
    OPCPROV -->|Mapped Nodes| SPC
    SPC --> DB[(Database)]
    SPC --> WS[WebSocket]
    WS --> UI[Real-time UI Update]

    style PLC1 fill:#f9f,stroke:#333
    style PLC2 fill:#f9f,stroke:#333
    style MQTT fill:#bbf,stroke:#333
    style OPCUA fill:#dbf,stroke:#333
    style OSP_MQTT fill:#bfb,stroke:#333
    style OSP_OPCUA fill:#bfb,stroke:#333
```

**Supported protocols:**
- **MQTT** -- Standard MQTT with JSON payloads
- **Sparkplug B** -- Protobuf-encoded industrial IoT payloads over MQTT
- **OPC-UA** -- OPC Unified Architecture for direct PLC/DCS communication

All connectivity management is done through the **Connectivity Hub** (`/connectivity`), a unified interface with four tabs: Monitor, Servers, Browse, and Mapping. See the [User Guide -- Connectivity Hub](user-guide.md#11-connectivity-hub) for a detailed walkthrough of the UI.

### Adding MQTT Broker Connections

MQTT brokers are added via the Connectivity Hub Servers tab:

1. Navigate to **Connectivity > Servers**.
2. Click **Add Server** and select **MQTT**.
3. Configure the broker connection:
   - **Name**: A descriptive name (e.g., "Factory Floor Broker")
   - **Host**: Broker hostname or IP address
   - **Port**: MQTT port (default: 1883)
   - **Username / Password**: MQTT authentication credentials (optional)
   - **Client ID**: Custom MQTT client identifier (optional)
   - **Payload Format**: `json` or `sparkplugb`
   - **TLS**: Enable for encrypted connections
4. Click **Test Connection** to verify connectivity.
5. Click **Create Server**.

### Adding OPC-UA Server Connections

OPC-UA servers are added via the same Servers tab:

1. Navigate to **Connectivity > Servers**.
2. Click **Add Server** and select **OPC-UA**.
3. Configure the server connection:
   - **Name**: A descriptive name (e.g., "PLC Controller 1")
   - **Endpoint URL**: The OPC-UA endpoint (must start with `opc.tcp://`, e.g., `opc.tcp://192.168.1.100:4840`)
   - **Auth Mode**: Anonymous or Username/Password
   - **Security Policy**: None or Basic256Sha256
   - **Security Mode**: None, Sign, or Sign and Encrypt
   - **Session Timeout**: Connection timeout in milliseconds (default: 30000)
   - **Publish Interval**: How often the server sends data updates (default: 1000 ms)
   - **Sampling Interval**: How often the server samples node values (default: 250 ms)
4. Click **Test Connection** to verify the endpoint is reachable.
5. Click **Create Server**.

> **Note:** OPC-UA security settings (policy and mode) must match the server's configuration. If the server requires Basic256Sha256, set both the policy and mode accordingly. Anonymous authentication works for most development and testing scenarios.

### Connection Status Monitoring

The Connectivity Hub Monitor tab provides a real-time operational dashboard:

- **Connectivity Metrics**: Summary cards showing total servers, connected count, mapped sources, activity status, and error count
- **Data Flow Pipeline**: A three-stage visual diagram (Sources > Ingestion > SPC Engine) color-coded by health:
  - Green: Healthy -- all connections active
  - Amber: Degraded -- some errors but data still flowing
  - Red: Down -- all connections failed
  - Gray: Idle -- no servers configured
- **Server Status Grid**: Individual cards for every server showing protocol, connection state, and key metrics

### Topic Discovery and Browsing (MQTT)

The Browse tab provides protocol-specific data exploration:

1. Select a connected MQTT broker from the server dropdown.
2. Browse discovered topics in the **Topic Browser**:
   - **Tree view**: Topics organized by `/` separator hierarchy
   - **Flat view**: All topics listed alphabetically
   - **Search**: Filter topics by name
3. For Sparkplug B topics, the browser shows decoded metric names and their current values.
4. Select a topic to see a live value preview in the right panel.

> **Tip:** Topic discovery subscribes to all messages on the broker. On busy brokers, limit the discovery duration to avoid overwhelming the system.

### Node Browsing (OPC-UA)

1. Select a connected OPC-UA server from the server dropdown in the Browse tab.
2. The **Address Space** browser displays the OPC-UA namespace as an expandable tree.
3. Expand folders to drill into the namespace and locate variable nodes.
4. Select a node to see its live value, data type, and quality in the preview panel.
5. Use the **Quick Map Form** in the right panel to map the selected node directly to a characteristic.

### Data Source Mapping

The Mapping tab provides a unified view of all tag-to-characteristic mappings:

1. Click **New Mapping** to open the mapping dialog.
2. Select the protocol (MQTT or OPC-UA).
3. Configure the data source:
   - **MQTT**: Select broker, topic, and optionally a Sparkplug B metric
   - **OPC-UA**: Select server and node
4. Select the target characteristic.
5. Choose a trigger strategy:
   - **On Change**: Create a sample whenever the value changes
   - **On Trigger**: Create a sample when a specific trigger tag fires
   - **On Timer**: Create samples at timed intervals
6. Click Save.

Alternatively, use the **Quick Map Form** in the Browse tab to map data points as you discover them.

The Mapping tab also shows unmapped characteristics, making it easy to identify which quality attributes still need automated data sources.

### Troubleshooting Connections

| Symptom | Possible Cause | Resolution |
|---------|---------------|------------|
| MQTT broker shows "Disconnected" | Wrong host/port, broker offline | Verify broker address and ensure the broker process is running |
| MQTT connection error | Authentication failure | Check username/password credentials |
| No MQTT topics discovered | Broker has no active publishers | Verify that PLCs/edge devices are publishing to the broker |
| SparkplugB metrics not decoded | Wrong payload format | Ensure the broker is configured with `sparkplugb` payload format |
| OPC-UA server unreachable | Wrong endpoint URL or firewall | Verify the `opc.tcp://` URL and check that port 4840 (or custom) is open |
| OPC-UA authentication error | Mismatched credentials or security | Ensure auth mode, security policy, and security mode match the server configuration |
| OPC-UA browse returns empty tree | Server has restricted namespaces | Check that the authenticated user has Browse permissions on the server |
| Topic/node values not updating | Subscription not refreshed | Disconnect and reconnect the server, or check the publish/sampling intervals |

---

## 7. Database Administration

### Overview

OpenSPC supports multiple database backends for production deployment flexibility. The database administration interface is available in **Settings > Database** and provides connection configuration, migration management, maintenance tools, and data export.

### Supported Database Engines

| Engine | Driver | Best For |
|--------|--------|----------|
| **SQLite** | aiosqlite | Development, small installations, single-server deployments |
| **PostgreSQL** | asyncpg | Production, enterprise deployments, high concurrency |
| **MySQL** | aiomysql | Production environments with existing MySQL infrastructure |
| **MSSQL** | aioodbc | Enterprise environments with Microsoft SQL Server |

SQLite is the default and requires no additional server setup. For production deployments with multiple users or high data volumes, PostgreSQL is recommended.

### Database Configuration

The database connection is configured through the **Settings > Database > Connection** sub-tab (admin only).

**Changing the database engine:**

1. Navigate to **Settings > Database** and click the **Connection** pill.
2. Select a database engine from the four options (SQLite, PostgreSQL, MySQL, MSSQL).
3. For SQLite, enter the database file path (default: `./openspc.db`).
4. For server-based engines, fill in:
   - **Host**: Database server hostname or IP
   - **Port**: Server port (auto-populated with defaults: PostgreSQL 5432, MySQL 3306, MSSQL 1433)
   - **Database Name**: The database to connect to
   - **Username**: Database user
   - **Password**: Database password
5. Click **Test Connection** to verify connectivity. The test reports success/failure, latency, and server version.
6. Only after a successful test, the **Save Configuration** button becomes active.
7. Click **Save Configuration**.

> **Warning:** Changing the database configuration requires an application restart to take effect. The old database is not migrated automatically -- you must handle data migration separately.

> **Note:** MSSQL requires the ODBC Driver for SQL Server to be installed on the host machine.

### Credential Security

Database credentials are encrypted at rest using Fernet symmetric encryption:

- Credentials are stored in `db_config.json` in the backend directory
- The encryption key is stored in `.db_encryption_key` (auto-generated on first use)
- The encryption key is **separate** from the JWT signing secret -- rotating JWT keys does not affect stored database credentials
- Passwords are never returned by the API; the UI shows a placeholder when a password exists

> **Warning:** Back up both `db_config.json` and `.db_encryption_key` together. The config file is unreadable without the encryption key.

### Migration Management

OpenSPC uses Alembic for database schema migrations. The **Settings > Database > Migrations** sub-tab (admin only) shows:

- **Current Revision**: The migration revision currently applied to the database
- **Head Revision**: The latest available migration
- **Status**: "Up to date" (green) or "N pending migrations" (amber)

If migrations are pending, the UI displays instructions to run:

```bash
alembic upgrade head
```

Migrations are applied automatically on application startup in most cases. The Migrations tab is useful for verifying the schema state after manual database operations.

### Database Status

The **Settings > Database > Status** sub-tab shows:

- **Engine**: The active database dialect (SQLite, PostgreSQL, MySQL, MSSQL)
- **Status**: Connected or Disconnected
- **Tables**: Total table count in the database
- **Size**: Database size in MB (when available)
- **Version**: Database server version string
- **Statistics**: Record counts for characteristics, samples, and violations

### Maintenance Tools

The **Settings > Database > Maintenance** sub-tab provides:

**Backup:**
- For SQLite: Creates a timestamped file copy of the database. Optionally specify a custom backup directory.
- For server-based engines: Displays the appropriate CLI backup command (e.g., `pg_dump` for PostgreSQL).
- After backup, the UI shows the backup file path (copyable) and file size.

**Optimize (Vacuum/Analyze):**
- Runs `VACUUM` and `ANALYZE` to reclaim disk space and update query planner statistics.
- Requires confirmation before executing.
- Particularly useful after bulk data deletions.

**Data Export:**
- Export all characteristics, samples, and violations as **JSON** or **CSV**.
- JSON export includes all entities with timestamps.
- CSV export contains sample data (ID, characteristic ID, timestamp, mean, range, excluded status).
- Exports are limited to 10,000 records per entity; a warning is shown if data is truncated.

### Danger Zone

At the bottom of the Database settings, a "Danger Zone" section provides destructive operations:

- **Clear Sample Data**: Deletes all samples and violations while preserving the hierarchy and characteristic configurations.
- **Reset Database**: Deletes all data including hierarchy, characteristics, samples, and violations.

Both operations require confirmation and are currently disabled for safety in the UI. Use database tools directly for destructive operations.

---

## 8. API Keys

### What Are API Keys For?

API keys enable **programmatic data submission** from external systems without requiring user login credentials. Common use cases:

- Custom data collection scripts
- Integration with laboratory information systems (LIMS)
- Edge computing devices submitting measurements
- Third-party quality management systems

### Creating API Keys

1. Navigate to **Settings > API Keys** (`/settings`, API Keys tab).
2. Click **Create Key**.
3. Enter a descriptive **name** (e.g., "Production Line 1 Collector").
4. Click **Create**.
5. **Copy the key immediately** -- it is only displayed once and cannot be retrieved later.

The key format is `openspc_` followed by 32 URL-safe bytes (e.g., `openspc_a1b2c3d4...`).

> **Warning:** Store API keys securely. If a key is compromised, revoke it immediately and create a new one.

### Using API Keys

Include the API key in the `X-API-Key` HTTP header when calling the data entry endpoints:

```bash
# Submit a single sample
curl -X POST https://your-openspc-server/api/v1/data-entry/submit \
  -H "X-API-Key: openspc_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "characteristic_id": 1,
    "measurements": [10.5, 10.3, 10.4]
  }'

# Batch submit multiple samples
curl -X POST https://your-openspc-server/api/v1/data-entry/batch \
  -H "X-API-Key: openspc_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "samples": [
      {"characteristic_id": 1, "measurements": [10.5, 10.3]},
      {"characteristic_id": 2, "measurements": [5.1, 5.0, 4.9]}
    ]
  }'
```

The schema endpoint (`GET /api/v1/data-entry/schema`) is unauthenticated and returns the expected JSON structure for integration development.

### Key Permissions and Scoping

API keys support optional scoping:

- **Characteristic permissions**: Restrict the key to submit data only for specific characteristics. Keys with no permissions configured have access to all characteristics.
- **Expiration**: Keys can have an optional expiry date. Expired keys are automatically rejected.
- **Rate limiting**: Each key has a `rate_limit_per_minute` setting (default: 60 requests/minute).

### Managing Keys

From the API Keys settings tab:

- **Revoke**: Deactivates a key without deleting it. Revoked keys cannot authenticate but remain in the list for audit purposes.
- **Delete**: Permanently removes the key. Any integrations using the key will immediately stop working.

---

## 9. System Settings

The Settings page (`/settings`) provides system-wide configuration organized into tabs with a sidebar navigation. Tabs are grouped under **Personal** and **Administration**, and visibility depends on the user's role.

### Appearance (All Users)

- **Chart color presets**: Choose from predefined color schemes or customize individual chart element colors (lines, zones, points, violations)
- Changes apply immediately and are persisted to the browser's local storage

### Notifications (All Users)

Configure notification preferences for violation alerts and system events.

### Branding (Admin Only)

Customize the application's visual identity:

- **Primary color**: Main brand color used for buttons, links, and accents
- **Accent color**: Secondary brand color
- **Logo**: Upload a custom logo image (stored as data URI)
- **App name**: Change the application name displayed in the header

Brand settings are stored in local storage and applied via CSS custom properties.

### Sites (Admin Only)

Manage plants/sites as described in [Plant Management](#2-plant-management).

### API Keys (Engineer+)

API key management for programmatic access. See [API Keys](#8-api-keys).

### Database (Engineer+)

Multi-database configuration, migration management, maintenance tools, and data export. The Database tab has four sub-tabs: Status, Connection (admin only), Migrations (admin only), and Maintenance. See [Database Administration](#7-database-administration) for full details.

---

## 10. Development Tools (Sandbox Mode)

### What Is Sandbox Mode?

Sandbox mode enables development and testing tools that are not appropriate for production use. It is controlled by the `OPENSPC_SANDBOX` environment variable:

```bash
export OPENSPC_SANDBOX=true
```

When sandbox mode is enabled:

- The **Dev Tools** page appears in the sidebar (admin only)
- The `/api/v1/devtools` endpoints become available
- A warning badge is displayed to indicate the instance is in sandbox mode

### Database Reset and Seed Data

The Dev Tools page provides seed scripts that **wipe the entire database** and reload it with demonstration data:

| Seed Script      | Description                              | Data Volume |
|------------------|------------------------------------------|-------------|
| Pharma           | Pharmaceutical manufacturing demo: 3 sites, ~26 characteristics | ~37,000 samples |
| Nelson Test      | Nelson rules testing: 2 plants, 10 characteristics with various rule violations | ~1,200 samples |
| Chart Showcase   | Chart type demonstrations: 1 plant, 4 characteristics | ~360 samples |

**To run a seed script:**

1. Navigate to **Dev Tools** (`/dev-tools`).
2. Click **Run** on the desired seed script card.
3. Confirm the destructive action in the dialog -- this will **wipe ALL existing data**.
4. Wait for the seed to complete. Script output is displayed in the output panel.
5. You will be automatically logged out and redirected to the login page.
6. Log in with the default credentials (`admin`/`admin`) created by the seed script.

> **Warning:** Database reset is irreversible and destroys all plants, users, samples, violations, and configuration. Only use this in development and testing environments.

### When to Use Sandbox Mode

- **Development**: Testing new features with realistic data
- **Training**: Demonstrating OpenSPC capabilities to new users
- **Testing**: Verifying SPC calculations with known data patterns
- **Sales demos**: Showcasing the application with pre-populated data

**Never enable sandbox mode in production.** The reset operation has no safeguards beyond the confirmation dialog.

---

## 11. Maintenance

### Backup Strategies

OpenSPC supports multiple database backends, each with its own backup approach.

**SQLite (default):**

SQLite stores the entire database in a single file:
- **Default location**: `./openspc.db` in the backend directory
- **Configurable via**: the Settings UI or `OPENSPC_DATABASE_URL` environment variable

Backup approaches:
1. **UI Backup**: Navigate to Settings > Database > Maintenance and click **Backup**. This creates a timestamped copy in the backend directory (or a custom directory you specify).
2. **File copy**: Stop the application, copy the `openspc.db` file, restart.
3. **SQLite `.backup` command**: Perform a hot backup without stopping the application:
   ```bash
   sqlite3 openspc.db ".backup backup_$(date +%Y%m%d).db"
   ```

**PostgreSQL:**

```bash
pg_dump -h localhost -U openspc -d openspc > backup_$(date +%Y%m%d).sql
```

**MySQL:**

```bash
mysqldump -h localhost -u openspc -p openspc > backup_$(date +%Y%m%d).sql
```

**MSSQL:**

```bash
sqlcmd -S localhost -U openspc -Q "BACKUP DATABASE openspc TO DISK='backup.bak'"
```

For server-based databases, the Settings > Database > Maintenance UI displays the appropriate CLI backup command rather than performing the backup directly.

**Critical files to back up** (in addition to the database):
- `.jwt_secret` -- JWT signing secret (loss invalidates all sessions)
- `.db_encryption_key` -- Database credential encryption key (loss makes `db_config.json` unreadable)
- `db_config.json` -- Encrypted database configuration

> **Warning:** The `.db_encryption_key` and `db_config.json` must be backed up together. Without the encryption key, stored database credentials cannot be recovered.

### Monitoring

Key metrics to monitor:

- **Application health**: Backend API responsiveness (`GET /api/v1/auth/me` with valid token)
- **MQTT connectivity**: Broker connection status via the Connectivity Hub or `GET /api/v1/brokers/all/status`
- **OPC-UA connectivity**: Server connection status via the Connectivity Hub or `GET /api/v1/opcua/servers/status`
- **Tag provider**: Samples processed count via `GET /api/v1/providers/status`
- **Violation rates**: Unacknowledged violation counts via `GET /api/v1/violations/stats`
- **Database size**: Check via Settings > Database > Status, or monitor file size (SQLite) / server metrics (PostgreSQL/MySQL/MSSQL)
- **Migration status**: Verify schema is up to date via Settings > Database > Migrations

For production monitoring setup, see the [Deployment Guide](deployment.md).

### Database Management

**JWT Secret:**
The JWT signing secret is auto-generated on first startup and stored in a `.jwt_secret` file in the backend directory. If this file is lost, all active sessions are invalidated and users must re-authenticate. Include this file in your backup procedures.

**Database Encryption Key:**
Database credentials are encrypted using a Fernet key stored in `.db_encryption_key`. This key is auto-generated on first use and is **separate** from the JWT secret. Rotating the JWT secret does not affect stored database credentials, and vice versa.

**Database URL:**
The default SQLite database can be overridden via the Settings UI or environment variables:

```bash
# SQLite (default)
export OPENSPC_DATABASE_URL="sqlite+aiosqlite:///./openspc.db"

# PostgreSQL
export OPENSPC_DATABASE_URL="postgresql+asyncpg://user:pass@localhost:5432/openspc"

# MySQL
export OPENSPC_DATABASE_URL="mysql+aiomysql://user:pass@localhost:3306/openspc"

# MSSQL
export OPENSPC_DATABASE_URL="mssql+aioodbc://user:pass@localhost:1433/openspc?driver=ODBC+Driver+18+for+SQL+Server"
```

> **Note:** When using the Settings UI to configure the database, credentials are encrypted and stored in `db_config.json`. The environment variable takes precedence if set.

**Environment variables reference:**

| Variable                   | Default                                  | Description                       |
|----------------------------|------------------------------------------|-----------------------------------|
| `OPENSPC_DATABASE_URL`     | `sqlite+aiosqlite:///./openspc.db`       | Database connection string        |
| `OPENSPC_JWT_SECRET`       | Auto-generated                           | JWT signing secret                |
| `OPENSPC_COOKIE_SECURE`    | `false`                                  | Set `true` for HTTPS production   |
| `OPENSPC_ADMIN_USERNAME`   | `admin`                                  | Bootstrap admin username          |
| `OPENSPC_ADMIN_PASSWORD`   | `admin`                                  | Bootstrap admin password          |
| `OPENSPC_CORS_ORIGINS`     | `http://localhost:5173`                  | Comma-separated allowed origins   |
| `OPENSPC_SANDBOX`          | `false`                                  | Enable sandbox/dev tools mode     |

---

## See Also

- [Getting Started](getting-started.md) -- Installation and first steps
- [User Guide](user-guide.md) -- Day-to-day usage for operators and supervisors
- [Deployment Guide](deployment.md) -- Production deployment, scaling, and infrastructure
- [API Reference](api-reference.md) -- Complete REST API documentation
- [Architecture](architecture.md) -- System design and technical architecture
