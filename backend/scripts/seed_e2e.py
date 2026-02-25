"""Seed E2E test database with all required test data.

Creates all plants, hierarchies, characteristics, samples, users, and config
needed by the Playwright E2E specs. Uses raw sqlite3 for speed and simplicity.
Designed to run AFTER alembic migrations on a fresh test-e2e.db.

Usage:
    python scripts/seed_e2e.py [--db path/to/test-e2e.db]
"""

import json
import sqlite3
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Add backend/src to path for password hashing
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir / "src"))

from cassini.core.auth.passwords import hash_password

DB_PATH = backend_dir / "test-e2e.db"

# ── Helper functions ─────────────────────────────────────────────────────

def utcnow() -> str:
    """ISO timestamp for SQLite."""
    return datetime.now(timezone.utc).isoformat()


# Base time for seed data — all samples spread backwards from "now"
_SEED_BASE_TIME = datetime.now(timezone.utc)
_seed_counter = 0


def seed_ts(hours_back: float | None = None) -> str:
    """Generate a realistic timestamp for seed data.

    Samples are spread 1 hour apart (auto-incrementing) unless hours_back is given.
    This ensures the time-axis chart mode renders meaningful data.
    """
    global _seed_counter
    if hours_back is not None:
        return (_SEED_BASE_TIME - timedelta(hours=hours_back)).isoformat()
    _seed_counter += 1
    return (_SEED_BASE_TIME - timedelta(hours=200 - _seed_counter)).isoformat()


def insert_plant(cur: sqlite3.Cursor, name: str, code: str) -> int:
    cur.execute(
        "INSERT INTO plant (name, code, is_active, created_at, updated_at) VALUES (?, ?, 1, ?, ?)",
        (name, code, utcnow(), utcnow()),
    )
    return cur.lastrowid


def insert_hierarchy(cur: sqlite3.Cursor, plant_id: int, name: str, htype: str, parent_id: int | None = None) -> int:
    cur.execute(
        "INSERT INTO hierarchy (plant_id, name, type, parent_id) VALUES (?, ?, ?, ?)",
        (plant_id, name, htype, parent_id),
    )
    return cur.lastrowid


def insert_characteristic(cur: sqlite3.Cursor, hierarchy_id: int, name: str, **kwargs) -> int:
    """Insert a characteristic with sensible defaults."""
    defaults = {
        "subgroup_size": 1,
        "data_type": "variable",
        "subgroup_mode": "NOMINAL_TOLERANCE",
        "min_measurements": 1,
        "decimal_precision": 3,
        "is_excluded": 0,
    }
    defaults.update(kwargs)
    cur.execute(
        """INSERT INTO characteristic
        (hierarchy_id, name, subgroup_size, data_type, subgroup_mode,
         min_measurements, decimal_precision, target_value, usl, lsl, ucl, lcl,
         stored_sigma, stored_center_line, attribute_chart_type, default_sample_size,
         chart_type, cusum_target, cusum_k, cusum_h, ewma_lambda, ewma_l)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            hierarchy_id,
            name,
            defaults.get("subgroup_size"),
            defaults.get("data_type"),
            defaults.get("subgroup_mode"),
            defaults.get("min_measurements"),
            defaults.get("decimal_precision"),
            defaults.get("target_value"),
            defaults.get("usl"),
            defaults.get("lsl"),
            defaults.get("ucl"),
            defaults.get("lcl"),
            defaults.get("stored_sigma"),
            defaults.get("stored_center_line"),
            defaults.get("attribute_chart_type"),
            defaults.get("default_sample_size"),
            defaults.get("chart_type"),
            defaults.get("cusum_target"),
            defaults.get("cusum_k"),
            defaults.get("cusum_h"),
            defaults.get("ewma_lambda"),
            defaults.get("ewma_l"),
        ),
    )
    return cur.lastrowid


def insert_nelson_rules(cur: sqlite3.Cursor, char_id: int) -> None:
    """Insert default Nelson rules for a characteristic."""
    rules = [
        (1, True, True),
        (2, True, True),
        (3, True, False),
        (4, True, False),
        (5, True, False),
        (6, True, False),
        (7, True, False),
        (8, True, False),
    ]
    for rule_id, is_enabled, require_ack in rules:
        cur.execute(
            """INSERT INTO characteristic_rules
            (char_id, rule_id, is_enabled, require_acknowledgement)
            VALUES (?, ?, ?, ?)""",
            (char_id, rule_id, is_enabled, require_ack),
        )


def insert_variable_sample(cur: sqlite3.Cursor, char_id: int, value: float, ts: str | None = None) -> int:
    """Insert a variable sample with one measurement."""
    ts = ts or seed_ts()
    cur.execute(
        """INSERT INTO sample
        (char_id, timestamp, actual_n, is_excluded, is_undersized, is_modified)
        VALUES (?, ?, 1, 0, 0, 0)""",
        (char_id, ts),
    )
    sample_id = cur.lastrowid
    cur.execute(
        "INSERT INTO measurement (sample_id, value) VALUES (?, ?)",
        (sample_id, value),
    )
    return sample_id


def insert_attribute_sample(
    cur: sqlite3.Cursor, char_id: int, defect_count: int,
    sample_size: int | None = None, units_inspected: int | None = None,
    ts: str | None = None,
) -> int:
    """Insert an attribute sample (no measurement row needed)."""
    ts = ts or seed_ts()
    cur.execute(
        """INSERT INTO sample
        (char_id, timestamp, actual_n, is_excluded, is_undersized, is_modified,
         defect_count, sample_size, units_inspected)
        VALUES (?, ?, 1, 0, 0, 0, ?, ?, ?)""",
        (char_id, ts, defect_count, sample_size, units_inspected),
    )
    return cur.lastrowid


def insert_violation(
    cur: sqlite3.Cursor, sample_id: int, char_id: int, rule_id: int = 1,
    rule_name: str = "Beyond Control Limits", severity: str = "CRITICAL",
    requires_ack: bool = True,
) -> int:
    """Insert a violation for a sample (simulates SPC engine detection)."""
    cur.execute(
        """INSERT INTO violation
        (sample_id, char_id, rule_id, rule_name, severity, acknowledged,
         requires_acknowledgement, created_at)
        VALUES (?, ?, ?, ?, ?, 0, ?, ?)""",
        (sample_id, char_id, rule_id, rule_name, severity, requires_ack, utcnow()),
    )
    return cur.lastrowid


def insert_user(cur: sqlite3.Cursor, username: str, password: str, must_change: bool = False) -> int:
    hashed = hash_password(password)
    cur.execute(
        """INSERT INTO user (username, hashed_password, is_active, must_change_password, created_at, updated_at)
        VALUES (?, ?, 1, ?, ?, ?)""",
        (username, hashed, must_change, utcnow(), utcnow()),
    )
    return cur.lastrowid


def insert_role(cur: sqlite3.Cursor, user_id: int, plant_id: int, role: str) -> None:
    cur.execute(
        "INSERT INTO user_plant_role (user_id, plant_id, role) VALUES (?, ?, ?)",
        (user_id, plant_id, role),
    )


def seed_standard_hierarchy(cur: sqlite3.Cursor, plant_name: str, plant_code: str) -> dict:
    """Create a standard plant + dept → line → station → characteristic with limits."""
    pid = insert_plant(cur, plant_name, plant_code)
    dept = insert_hierarchy(cur, pid, "Test Dept", "Area")
    line = insert_hierarchy(cur, pid, "Test Line", "Line", dept)
    station = insert_hierarchy(cur, pid, "Test Station", "Cell", line)
    char_id = insert_characteristic(
        cur, station, "Test Char",
        target_value=10.0, usl=12.0, lsl=8.0,
        ucl=11.5, lcl=8.5, stored_sigma=0.5, stored_center_line=10.0,
    )
    insert_nelson_rules(cur, char_id)
    return {"plant_id": pid, "dept_id": dept, "line_id": line, "station_id": station, "char_id": char_id}


NORMAL_VALUES = [10.1, 9.9, 10.2, 9.8, 10.0, 10.3, 9.7, 10.1, 9.9, 10.0]
KIOSK_NORMAL = [
    10.0, 10.1, 9.9, 10.0, 10.2, 9.8, 10.1, 9.9, 10.0, 10.1,
    10.0, 10.1, 9.9, 10.0, 10.2, 9.8, 10.1, 9.9, 10.0, 10.1,
    10.0, 10.1, 9.9, 10.0, 10.2,
]
CUSUM_EWMA_VALUES = [
    10.0, 10.1, 9.9, 10.0, 10.2, 9.8, 10.1, 9.9, 10.0, 10.1,
    10.0, 9.9, 10.2, 9.8, 10.1, 10.0, 10.1, 9.9, 10.0, 10.2,
    9.8, 10.1, 9.9, 10.0, 10.1,
]


# ── Main seed function ───────────────────────────────────────────────────

def seed(db_path: str) -> dict:
    """Seed all E2E test data. Returns manifest of created IDs."""
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute("PRAGMA journal_mode=WAL")
    cur.execute("PRAGMA synchronous=NORMAL")

    manifest = {}

    # ── 1. Admin user (bootstrap would create this, but we do it explicitly) ──
    admin_id = insert_user(cur, "admin", "admin", must_change=False)
    manifest["admin_user_id"] = admin_id

    # ── 2. Plants with standard hierarchy (seedFullHierarchy pattern) ──
    standard_plants = {
        "dashboard":    ("Dashboard Plant",    "DSHBRD"),
        "annotations":  ("Annotations Plant",  "ANNPLNT"),
        "data_entry":   ("Data Entry Plant",   "DATAENT"),
        "violations":   ("Violations Plant",   "VIOLATN"),
        "reports":      ("Reports Plant",      "RPTPLNT"),
        "sample_mgmt":  ("Sample Mgmt Plant",  "SAMPLEM"),
        "config":       ("Config Plant",       "CONFIGP"),
        "inspector":    ("Inspector Plant",    "INSPCTR"),
        "csv_import":   ("CSV Import Plant",   "CSVIMPO"),
    }

    for key, (name, code) in standard_plants.items():
        ids = seed_standard_hierarchy(cur, name, code)
        manifest[key] = ids

        # Seed normal samples for specs that need chart data
        if key in ("dashboard", "annotations", "violations", "reports",
                   "sample_mgmt", "config", "inspector", "data_entry"):
            for val in NORMAL_VALUES:
                insert_variable_sample(cur, ids["char_id"], val)

        # Seed OOC samples + violations for specs that need them
        if key in ("dashboard", "violations", "inspector"):
            ooc1 = insert_variable_sample(cur, ids["char_id"], 15.0)
            ooc2 = insert_variable_sample(cur, ids["char_id"], 16.0)
            insert_violation(cur, ooc1, ids["char_id"])
            insert_violation(cur, ooc2, ids["char_id"])

    # ── 3. RBAC Plant (needs extra users) ──
    rbac = seed_standard_hierarchy(cur, "RBAC Plant", "RBACPLA")
    for val in NORMAL_VALUES:
        insert_variable_sample(cur, rbac["char_id"], val)
    rbac_ooc1 = insert_variable_sample(cur, rbac["char_id"], 15.0)
    rbac_ooc2 = insert_variable_sample(cur, rbac["char_id"], 16.0)
    insert_violation(cur, rbac_ooc1, rbac["char_id"])
    insert_violation(cur, rbac_ooc2, rbac["char_id"])

    # Create RBAC test users with different roles
    rbac_users = {
        "operator": ("rbac-operator", "RbacOper123!"),
        "supervisor": ("rbac-supervisor", "RbacSuper123!"),
        "engineer": ("rbac-engineer", "RbacEng123!"),
        "admin2": ("rbac-admin2", "RbacAdmin123!"),
    }
    rbac_user_ids = {}
    for role_key, (username, password) in rbac_users.items():
        uid = insert_user(cur, username, password)
        role = "admin" if role_key == "admin2" else role_key
        insert_role(cur, uid, rbac["plant_id"], role)
        rbac_user_ids[role_key] = uid
    rbac["user_ids"] = rbac_user_ids
    manifest["rbac"] = rbac

    # Assign admin to ALL plants
    cur.execute("SELECT id FROM plant")
    all_plant_ids = [row[0] for row in cur.fetchall()]
    for pid in all_plant_ids:
        insert_role(cur, admin_id, pid, "admin")

    # ── 4. Kiosk Plant (2 characteristics, 25 samples each + OOC) ──
    kiosk = seed_standard_hierarchy(cur, "Kiosk Plant", "KIOSKPL")
    kiosk_char2 = insert_characteristic(
        cur, kiosk["station_id"], "Kiosk Char 2",
        target_value=10.0, usl=12.0, lsl=8.0,
        ucl=11.5, lcl=8.5, stored_sigma=0.5, stored_center_line=10.0,
    )
    insert_nelson_rules(cur, kiosk_char2)
    for val in KIOSK_NORMAL:
        insert_variable_sample(cur, kiosk["char_id"], val)
        insert_variable_sample(cur, kiosk_char2, val)
    insert_variable_sample(cur, kiosk["char_id"], 15.0)
    insert_variable_sample(cur, kiosk_char2, 16.0)
    kiosk["char_id_2"] = kiosk_char2
    manifest["kiosk"] = kiosk

    # ── 5. CUSUM/EWMA Plant ──
    ce_plant = insert_plant(cur, "CUSUM EWMA Plant", "CUSUMEWMA")
    ce_dept = insert_hierarchy(cur, ce_plant, "CE Dept", "Area")
    ce_line = insert_hierarchy(cur, ce_plant, "CE Line", "Line", ce_dept)
    ce_station = insert_hierarchy(cur, ce_plant, "CE Station", "Cell", ce_line)
    cusum_char = insert_characteristic(
        cur, ce_station, "CUSUM Diameter",
        chart_type="cusum", cusum_target=10.0, cusum_k=0.5, cusum_h=5.0,
        ucl=10.5, lcl=9.5, stored_sigma=0.15, stored_center_line=10.0,
    )
    ewma_char = insert_characteristic(
        cur, ce_station, "EWMA Pressure",
        chart_type="ewma", ewma_lambda=0.2, ewma_l=2.7,
        target_value=10.0,
        ucl=10.5, lcl=9.5, stored_sigma=0.15, stored_center_line=10.0,
    )
    insert_nelson_rules(cur, cusum_char)
    insert_nelson_rules(cur, ewma_char)
    for val in CUSUM_EWMA_VALUES:
        insert_variable_sample(cur, cusum_char, val)
        insert_variable_sample(cur, ewma_char, val)
    manifest["cusum_ewma"] = {
        "plant_id": ce_plant, "station_id": ce_station,
        "cusum_char_id": cusum_char, "ewma_char_id": ewma_char,
    }

    # Assign admin to CUSUM/EWMA plant
    insert_role(cur, admin_id, ce_plant, "admin")

    # ── 6. Attribute Charts Plant ──
    attr_plant = insert_plant(cur, "Attribute Charts Plant", "ATTRCHRT")
    attr_dept = insert_hierarchy(cur, attr_plant, "Attr Dept", "Area")
    attr_line = insert_hierarchy(cur, attr_plant, "Attr Line", "Line", attr_dept)
    attr_station = insert_hierarchy(cur, attr_plant, "Attr Station", "Cell", attr_line)

    p_char = insert_characteristic(
        cur, attr_station, "Proportion Defectives",
        data_type="attribute", attribute_chart_type="p", default_sample_size=100,
    )
    np_char = insert_characteristic(
        cur, attr_station, "Number Defectives",
        data_type="attribute", attribute_chart_type="np", default_sample_size=50,
    )
    c_char = insert_characteristic(
        cur, attr_station, "Total Defects",
        data_type="attribute", attribute_chart_type="c", default_sample_size=100,
    )
    u_char = insert_characteristic(
        cur, attr_station, "Defects Per Unit",
        data_type="attribute", attribute_chart_type="u", default_sample_size=10,
    )
    for cid in (p_char, np_char, c_char, u_char):
        insert_nelson_rules(cur, cid)

    # p-chart samples
    for count in [3, 5, 2, 4, 6, 3, 7]:
        insert_attribute_sample(cur, p_char, count, sample_size=100)
    # np-chart samples
    for count in [2, 3, 1, 4, 2, 5, 3]:
        insert_attribute_sample(cur, np_char, count, sample_size=50)
    # c-chart samples
    for count in [8, 12, 5, 10, 7, 14, 9]:
        insert_attribute_sample(cur, c_char, count, sample_size=100)
    # u-chart samples
    for count in [3, 5, 2, 6, 4, 7, 3]:
        insert_attribute_sample(cur, u_char, count, sample_size=10, units_inspected=10)

    manifest["attribute_charts"] = {
        "plant_id": attr_plant, "station_id": attr_station,
        "p_char_id": p_char, "np_char_id": np_char,
        "c_char_id": c_char, "u_char_id": u_char,
    }

    # Assign admin to Attribute Charts plant
    insert_role(cur, admin_id, attr_plant, "admin")

    # ── 7. Simple plants (just need to exist, no hierarchy/samples) ──
    simple_plants = {
        "connectivity":  ("Connectivity Test Plant", "CTP"),
        "navigation":    ("Nav Test Plant",          "NAV"),
        "hierarchy":     ("Hierarchy Test Plant",    "HTP"),
        "mobile":        ("Mobile Test Plant",       "MOBPLNT"),
        "users":         ("Users Test Plant",        "UTP"),
        "settings":      ("Settings Test Plant",     "STP"),
    }
    for key, (name, code) in simple_plants.items():
        pid = insert_plant(cur, name, code)
        insert_role(cur, admin_id, pid, "admin")
        manifest[key] = {"plant_id": pid}

    # ── 8. Notifications seed webhook ──
    cur.execute(
        """INSERT INTO webhook_config (name, url, is_active, retry_count, created_at, updated_at)
        VALUES (?, ?, 1, 3, ?, ?)""",
        ("E2E Seed Hook", "https://httpbin.org/post", utcnow(), utcnow()),
    )
    manifest["notifications"] = {"webhook_id": cur.lastrowid}

    conn.commit()
    conn.close()

    return manifest


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Seed E2E test database")
    parser.add_argument("--db", default=str(DB_PATH), help="Path to SQLite database")
    parser.add_argument("--manifest", default=str(backend_dir / "e2e-manifest.json"),
                        help="Path to write ID manifest JSON")
    args = parser.parse_args()

    if not Path(args.db).exists():
        print(f"ERROR: Database {args.db} does not exist. Run alembic upgrade head first.", file=sys.stderr)
        sys.exit(1)

    manifest = seed(args.db)

    # Write manifest for test consumption
    with open(args.manifest, "w") as f:
        json.dump(manifest, f, indent=2)

    print(f"Seeded {args.db} successfully.")
    print(f"Manifest written to {args.manifest}")
    print(f"  Plants: {sum(1 for v in manifest.values() if isinstance(v, dict) and 'plant_id' in v)}")
    print(f"  Admin user ID: {manifest['admin_user_id']}")
