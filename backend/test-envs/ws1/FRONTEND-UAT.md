# WS-1 Multi-Database — Frontend UAT Checklist

**Prereq**: Backend running on localhost:8000 with migrations up to date (016).

---

## 1. Access Control

### As Operator (lowest role)
- [ ] Navigate to Settings — "Database" tab should NOT appear

### As Engineer
- [ ] Navigate to Settings > Database tab — tab is visible
- [ ] Database Status card is visible (dialect badge, connection status, version, size, tables)
- [ ] Database Statistics card is visible (characteristics, samples, violations counts)
- [ ] Export Data section is visible (JSON + CSV buttons)
- [ ] Danger Zone section is visible (buttons disabled)
- [ ] Connection Configuration section is **NOT visible** (admin-only)
- [ ] Migration Status section is **NOT visible** (admin-only)
- [ ] Maintenance section is **NOT visible** (admin-only)

### As Admin
- [ ] All sections from Engineer are visible
- [ ] Connection Configuration section IS visible (collapsible)
- [ ] Migration Status section IS visible
- [ ] Maintenance section IS visible

---

## 2. Database Status Card (all roles with access)

- [ ] Shows "SQLite" dialect badge
- [ ] Shows green "Connected" indicator
- [ ] Shows SQLite version (e.g., "SQLite 3.45.1")
- [ ] Shows table count (should be 16)
- [ ] Shows database size in MB
- [ ] Refresh button works (spins while loading)

---

## 3. Connection Configuration (Admin only)

### Collapsible Panel
- [ ] Section starts collapsed
- [ ] Click header to expand — form appears
- [ ] Amber warning banner reads: "Changing database configuration requires application restart"

### Dialect Selection
- [ ] 4 dialect tiles visible: SQLite, PostgreSQL, MySQL, MSSQL
- [ ] SQLite is pre-selected (matches current config)
- [ ] Clicking a tile highlights it

### SQLite Mode
- [ ] Only "Database File Path" input shown
- [ ] Pre-populated with current path (e.g., `./openspc.db`)

### PostgreSQL Mode
- [ ] Click PostgreSQL tile
- [ ] Shows: Host, Port (pre-filled 5432), Database Name, Username, Password
- [ ] Host/username/password fields are empty

### MySQL Mode
- [ ] Click MySQL tile
- [ ] Shows same fields as PostgreSQL, port pre-filled to 3306

### MSSQL Mode
- [ ] Click MSSQL tile
- [ ] Shows same fields, port pre-filled to 1433
- [ ] Amber banner: "MSSQL requires ODBC Driver for SQL Server..."

### Test Connection (SQLite)
- [ ] Switch back to SQLite, enter `./openspc.db`
- [ ] Click "Test Connection"
- [ ] Green success badge appears: "Connection successful"
- [ ] Shows latency in ms
- [ ] Shows server version (e.g., "SQLite 3.45.1")

### Test Connection (Invalid)
- [ ] Switch to PostgreSQL, enter host=localhost, port=5432, db=nonexistent
- [ ] Click "Test Connection"
- [ ] Red failure badge: "Connection failed"

### Save Configuration
- [ ] "Save Configuration" button is disabled BEFORE a successful test
- [ ] After successful SQLite test, button becomes enabled
- [ ] Click Save — success toast: "Database configuration saved. Restart required..."
- [ ] Changing any field resets test result and disables Save again

---

## 4. Migration Status (Admin only)

- [ ] Shows "Current Revision" with monospace hash (e.g., "016")
- [ ] Shows "Head Revision" with monospace hash (e.g., "016")
- [ ] Green badge: "Up to date" (when current == head)
- [ ] Refresh button works
- [ ] No "alembic upgrade head" instructions shown (because up to date)

---

## 5. Maintenance Panel (Admin only)

### Backup
- [ ] "Backup" button visible with description text
- [ ] Click Backup — spinner shows while processing
- [ ] Success toast with backup filename (e.g., "Backup created: openspc_backup_20260209_161009.db")

### Vacuum/Optimize
- [ ] "Optimize" button visible with description text
- [ ] Click Optimize — inline confirmation appears (Cancel / Confirm)
- [ ] Click Cancel — confirmation hides, returns to default state
- [ ] Click Optimize again, then Confirm — spinner, then success toast
- [ ] Toast: "VACUUM and ANALYZE completed successfully"

---

## 6. Existing Functionality (Regression)

- [ ] Database Statistics still show correct counts
- [ ] Export JSON works — downloads file with characteristics, samples, violations
- [ ] Export CSV works — downloads samples CSV
- [ ] Danger Zone buttons still show disabled state with safety toast

---

## 7. Error Handling

- [ ] Disconnect backend, refresh page — status card shows "Disconnected" or error state
- [ ] API errors show toast notifications (not silent failures)

---

## Result

| Section | Pass/Fail | Notes |
|---------|-----------|-------|
| Access Control | | |
| Database Status | | |
| Connection Config | | |
| Migration Status | | |
| Maintenance | | |
| Regression | | |
| Error Handling | | |
