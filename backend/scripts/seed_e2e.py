"""Seed E2E test database with all required test data.

Creates all plants, hierarchies, characteristics, samples, users, and config
needed by the Playwright E2E specs. Uses raw sqlite3 for speed and simplicity.
Designed to run AFTER alembic migrations on a fresh test-e2e.db.

Usage:
    python scripts/seed_e2e.py [--db path/to/test-e2e.db]
"""

import json
import random
import sqlite3
import sys
from dataclasses import asdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Add backend/src to path for password hashing
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir / "src"))

from cassini.core.auth.passwords import hash_password
from cassini.core.msa.engine import GageRREngine

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
    cur.execute("SELECT id FROM plant WHERE code = ?", (code,))
    row = cur.fetchone()
    if row:
        return row[0]
    cur.execute(
        "INSERT OR IGNORE INTO plant (name, code, is_active, created_at, updated_at) VALUES (?, ?, 1, ?, ?)",
        (name, code, utcnow(), utcnow()),
    )
    return cur.lastrowid


def insert_hierarchy(cur: sqlite3.Cursor, plant_id: int, name: str, htype: str, parent_id: int | None = None) -> int:
    cur.execute(
        "SELECT id FROM hierarchy WHERE plant_id = ? AND name = ? AND parent_id IS ?",
        (plant_id, name, parent_id),
    )
    row = cur.fetchone()
    if row:
        return row[0]
    cur.execute(
        "INSERT OR IGNORE INTO hierarchy (plant_id, name, type, parent_id) VALUES (?, ?, ?, ?)",
        (plant_id, name, htype, parent_id),
    )
    return cur.lastrowid


def insert_characteristic(cur: sqlite3.Cursor, hierarchy_id: int, name: str, **kwargs) -> int:
    """Insert a characteristic with sensible defaults. Idempotent by hierarchy_id + name."""
    cur.execute(
        "SELECT id FROM characteristic WHERE hierarchy_id = ? AND name = ?",
        (hierarchy_id, name),
    )
    row = cur.fetchone()
    if row:
        return row[0]
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
        """INSERT OR IGNORE INTO characteristic
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
            """INSERT OR IGNORE INTO characteristic_rules
            (char_id, rule_id, is_enabled, require_acknowledgement)
            VALUES (?, ?, ?, ?)""",
            (char_id, rule_id, is_enabled, require_ack),
        )


def insert_variable_sample(
    cur: sqlite3.Cursor, char_id: int, value: float,
    ts: str | None = None, material_id: int | None = None,
    source: str = "MANUAL",
) -> int:
    """Insert a variable sample with one measurement."""
    ts = ts or seed_ts()
    cur.execute(
        """INSERT OR IGNORE INTO sample
        (char_id, timestamp, actual_n, is_excluded, is_undersized, is_modified, material_id, source)
        VALUES (?, ?, 1, 0, 0, 0, ?, ?)""",
        (char_id, ts, material_id, source),
    )
    sample_id = cur.lastrowid
    cur.execute(
        "INSERT OR IGNORE INTO measurement (sample_id, value) VALUES (?, ?)",
        (sample_id, value),
    )
    return sample_id


def insert_material_class(
    cur: sqlite3.Cursor, plant_id: int, name: str, code: str,
    parent_id: int | None = None, parent_path: str = "/", depth: int = 0,
    description: str | None = None,
) -> tuple[int, str]:
    """Insert a material class and fix up its materialized path.

    Returns (class_id, path) so children can reference both.
    """
    now = utcnow()
    cur.execute(
        """INSERT OR IGNORE INTO material_class
        (plant_id, parent_id, name, code, path, depth, description, created_at, updated_at)
        VALUES (?, ?, ?, ?, '/', ?, ?, ?, ?)""",
        (plant_id, parent_id, name, code, depth, description, now, now),
    )
    class_id = cur.lastrowid
    path = f"{parent_path}{class_id}/"
    cur.execute("UPDATE material_class SET path = ? WHERE id = ?", (path, class_id))
    return class_id, path


def insert_material(
    cur: sqlite3.Cursor, plant_id: int, class_id: int | None,
    name: str, code: str, description: str | None = None,
) -> int:
    """Insert a material row. Returns material_id."""
    now = utcnow()
    cur.execute(
        """INSERT OR IGNORE INTO material
        (plant_id, class_id, name, code, description, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (plant_id, class_id, name, code, description, now, now),
    )
    return cur.lastrowid


def insert_material_limit_override(
    cur: sqlite3.Cursor, char_id: int, *,
    material_id: int | None = None, class_id: int | None = None, **kwargs,
) -> int:
    """Insert a material limit override for a characteristic.

    Exactly one of material_id or class_id must be provided.
    """
    now = utcnow()
    cur.execute(
        """INSERT OR IGNORE INTO material_limit_override
        (characteristic_id, material_id, class_id, ucl, lcl, stored_sigma,
         stored_center_line, target_value, usl, lsl, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            char_id, material_id, class_id,
            kwargs.get("ucl"), kwargs.get("lcl"),
            kwargs.get("stored_sigma"), kwargs.get("stored_center_line"),
            kwargs.get("target_value"), kwargs.get("usl"), kwargs.get("lsl"),
            now, now,
        ),
    )
    return cur.lastrowid


def insert_attribute_sample(
    cur: sqlite3.Cursor, char_id: int, defect_count: int,
    sample_size: int | None = None, units_inspected: int | None = None,
    ts: str | None = None, source: str = "MANUAL",
) -> int:
    """Insert an attribute sample (no measurement row needed)."""
    ts = ts or seed_ts()
    cur.execute(
        """INSERT OR IGNORE INTO sample
        (char_id, timestamp, actual_n, is_excluded, is_undersized, is_modified,
         defect_count, sample_size, units_inspected, source)
        VALUES (?, ?, 1, 0, 0, 0, ?, ?, ?, ?)""",
        (char_id, ts, defect_count, sample_size, units_inspected, source),
    )
    return cur.lastrowid


def insert_violation(
    cur: sqlite3.Cursor, sample_id: int, char_id: int, rule_id: int = 1,
    rule_name: str = "Beyond Control Limits", severity: str = "CRITICAL",
    requires_ack: bool = True,
) -> int:
    """Insert a violation for a sample (simulates SPC engine detection)."""
    cur.execute(
        """INSERT OR IGNORE INTO violation
        (sample_id, char_id, rule_id, rule_name, severity, acknowledged,
         requires_acknowledgement, created_at)
        VALUES (?, ?, ?, ?, ?, 0, ?, ?)""",
        (sample_id, char_id, rule_id, rule_name, severity, requires_ack, utcnow()),
    )
    return cur.lastrowid


def insert_user(cur: sqlite3.Cursor, username: str, password: str, must_change: bool = False) -> int:
    # Check if user already exists (idempotent for running against existing DBs)
    cur.execute("SELECT id FROM user WHERE username = ?", (username,))
    row = cur.fetchone()
    if row:
        return row[0]
    hashed = hash_password(password)
    cur.execute(
        """INSERT OR IGNORE INTO user (username, hashed_password, is_active, must_change_password, created_at, updated_at)
        VALUES (?, ?, 1, ?, ?, ?)""",
        (username, hashed, must_change, utcnow(), utcnow()),
    )
    return cur.lastrowid


def insert_role(cur: sqlite3.Cursor, user_id: int, plant_id: int, role: str) -> None:
    cur.execute(
        "SELECT id FROM user_plant_role WHERE user_id = ? AND plant_id = ?",
        (user_id, plant_id),
    )
    if cur.fetchone():
        return
    cur.execute(
        "INSERT OR IGNORE INTO user_plant_role (user_id, plant_id, role) VALUES (?, ?, ?)",
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

    # ── 7. Material Limits Plant ──
    ml = seed_standard_hierarchy(cur, "Material Limits Plant", "MATLIM")

    # Material classes: Raw Materials > Metals
    raw_cls_id, raw_path = insert_material_class(
        cur, ml["plant_id"], "Raw Materials", "RAW",
        description="Raw material inputs",
    )
    metals_cls_id, metals_path = insert_material_class(
        cur, ml["plant_id"], "Metals", "MTL",
        parent_id=raw_cls_id, parent_path=raw_path, depth=1,
        description="Metal alloys",
    )

    # Materials
    mat_a_id = insert_material(
        cur, ml["plant_id"], metals_cls_id,
        "Test Material A", "MAT-A", "First test material",
    )
    mat_b_id = insert_material(
        cur, ml["plant_id"], metals_cls_id,
        "Test Material B", "MAT-B", "Second test material",
    )

    # Samples without material (backward compat)
    for val in NORMAL_VALUES:
        insert_variable_sample(cur, ml["char_id"], val)
    # Samples with materials
    for val in [10.2, 10.3, 10.4, 10.5]:
        insert_variable_sample(cur, ml["char_id"], val, material_id=mat_a_id)
    for val in [9.8, 9.9, 10.0, 10.1]:
        insert_variable_sample(cur, ml["char_id"], val, material_id=mat_b_id)

    # Material limit overrides
    insert_material_limit_override(
        cur, ml["char_id"], material_id=mat_a_id,
        ucl=13.0, lcl=9.0, stored_sigma=0.6, stored_center_line=10.5,
        target_value=10.0,
    )
    insert_material_limit_override(
        cur, ml["char_id"], material_id=mat_b_id,
        ucl=11.0, lcl=9.5,
    )
    insert_role(cur, admin_id, ml["plant_id"], "admin")
    manifest["material_limits"] = ml

    # ── 8. Simple plants (just need to exist, no hierarchy/samples) ──
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
        """INSERT OR IGNORE INTO webhook_config (name, url, is_active, retry_count, created_at, updated_at)
        VALUES (?, ?, 1, 3, ?, ?)""",
        ("E2E Seed Hook", "https://httpbin.org/post", utcnow(), utcnow()),
    )
    manifest["notifications"] = {"webhook_id": cur.lastrowid}

    # ── 9. Screenshot Tour Plant (commercial feature data) ──────────────
    tour = seed_standard_hierarchy(cur, "Screenshot Tour Plant", "SCRNTOUR")
    insert_role(cur, admin_id, tour["plant_id"], "admin")
    tour_char_id = tour["char_id"]
    tour_plant_id = tour["plant_id"]

    # 50 variable samples: mix of normal, near-limits, and OOC
    rng = random.Random(42)
    for i in range(40):
        # Normal values centered around 10.0 with sigma ~0.5
        val = round(rng.gauss(10.0, 0.4), 3)
        insert_variable_sample(cur, tour_char_id, val)
    for i in range(7):
        # Near-limits values (close to UCL=11.5 / LCL=8.5)
        val = round(rng.choice([rng.uniform(11.0, 11.4), rng.uniform(8.6, 9.0)]), 3)
        insert_variable_sample(cur, tour_char_id, val)
    # 3 OOC values
    ooc_values = [12.8, 7.2, 13.1]
    ooc_sample_ids = []
    for val in ooc_values:
        sid = insert_variable_sample(cur, tour_char_id, val)
        ooc_sample_ids.append(sid)

    # 2 violations: 1 acknowledged, 1 unacknowledged
    v1 = insert_violation(cur, ooc_sample_ids[0], tour_char_id)
    insert_violation(cur, ooc_sample_ids[1], tour_char_id)
    # Third OOC sample has no violation (it's just an out-of-spec measurement)

    cur.execute(
        "UPDATE violation SET acknowledged = 1, ack_user = ?, "
        "ack_reason = ?, ack_timestamp = ? WHERE id = ?",
        ("admin", "Expected process adjustment", utcnow(), v1),
    )

    # ── 9a. MSA Gage R&R Study ──
    now = utcnow()
    msa_n_ops = 3
    msa_n_parts = 10
    msa_n_reps = 3
    msa_tolerance = 4.0

    # Insert study initially without results_json (we'll UPDATE after computing)
    cur.execute(
        """INSERT OR IGNORE INTO msa_study
        (plant_id, name, study_type, characteristic_id, num_operators, num_parts,
         num_replicates, tolerance, status, created_by, created_at, completed_at, results_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            tour_plant_id, "Bore Diameter Gage R&R", "crossed_anova",
            tour_char_id, msa_n_ops, msa_n_parts, msa_n_reps, msa_tolerance,
            "complete", admin_id, now, now, None,
        ),
    )
    msa_study_id = cur.lastrowid

    # 3 operators
    operator_ids = []
    for seq, name in enumerate(["Alice", "Bob", "Carlos"]):
        cur.execute(
            "INSERT OR IGNORE INTO msa_operator (study_id, name, sequence_order) VALUES (?, ?, ?)",
            (msa_study_id, name, seq),
        )
        operator_ids.append(cur.lastrowid)

    # 10 parts
    part_ids = []
    rng_msa = random.Random(42)
    ref_values = []
    for seq in range(msa_n_parts):
        ref_val = round(10.0 + rng_msa.uniform(-1.5, 1.5), 3)
        ref_values.append(ref_val)
        cur.execute(
            "INSERT OR IGNORE INTO msa_part (study_id, name, reference_value, sequence_order) VALUES (?, ?, ?, ?)",
            (msa_study_id, f"Part {seq + 1}", ref_val, seq),
        )
        part_ids.append(cur.lastrowid)

    # 90 measurements (3 operators x 10 parts x 3 replicates)
    # Build 3D array simultaneously for engine computation
    measurements_3d: list[list[list[float]]] = []
    for op_idx, op_id in enumerate(operator_ids):
        op_measurements: list[list[float]] = []
        for part_idx, part_id in enumerate(part_ids):
            ref = ref_values[part_idx]
            rep_measurements: list[float] = []
            for rep in range(1, msa_n_reps + 1):
                val = round(ref + rng_msa.gauss(0, 0.15), 4)
                rep_measurements.append(val)
                cur.execute(
                    """INSERT OR IGNORE INTO msa_measurement
                    (study_id, operator_id, part_id, replicate_num, value, timestamp)
                    VALUES (?, ?, ?, ?, ?, ?)""",
                    (msa_study_id, op_id, part_id, rep, val, now),
                )
            op_measurements.append(rep_measurements)
        measurements_3d.append(op_measurements)

    # Compute real Gage R&R results using the engine
    grr_engine = GageRREngine()
    grr_result = grr_engine.calculate_crossed_anova(
        measurements_3d, tolerance=msa_tolerance,
    )
    cur.execute(
        "UPDATE msa_study SET results_json = ? WHERE id = ?",
        (json.dumps(asdict(grr_result)), msa_study_id),
    )

    # ── 9b. FAI Report ──
    cur.execute(
        """INSERT OR IGNORE INTO fai_report
        (plant_id, part_number, part_name, revision, serial_number, drawing_number,
         organization_name, supplier, reason_for_inspection, status,
         created_by, created_at, submitted_by, submitted_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            tour_plant_id, "PN-2026-001", "Turbine Housing", "Rev C",
            "SN-00042", "DWG-TH-100", "Saturnis Manufacturing",
            "Apex Precision Parts", "new_part", "submitted",
            admin_id, now, admin_id, now,
        ),
    )
    fai_report_id = cur.lastrowid

    # 6 inspection items (5 PASS, 1 FAIL)
    fai_items = [
        (1, "Bore Diameter",     25.000, 25.050, 24.950, 25.012, "mm",  "Bore Micrometer",  True,  "pass"),
        (2, "Overall Length",    100.000, 100.100, 99.900, 100.045, "mm", "Caliper",          False, "pass"),
        (3, "Surface Roughness",  0.800,   1.600,  None,   0.920, "Ra",  "Profilometer",     True,  "pass"),
        (4, "Thread Pitch",       1.500,   1.520,  1.480,  1.505, "mm",  "Thread Gauge",     False, "pass"),
        (5, "Hardness",          58.000,  62.000, 55.000, 59.200, "HRC", "Rockwell Tester",  True,  "pass"),
        (6, "Concentricity",      0.000,   0.025,  None,   0.032, "mm",  "CMM",              True,  "fail"),
    ]
    for seq, (balloon, name, nom, usl, lsl, actual, unit, tool, designed, result) in enumerate(fai_items):
        cur.execute(
            """INSERT OR IGNORE INTO fai_item
            (report_id, balloon_number, characteristic_name, nominal, usl, lsl,
             actual_value, unit, tools_used, designed_char, result, sequence_order)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (fai_report_id, balloon, name, nom, usl, lsl, actual, unit, tool, designed, result, seq),
        )

    # ── 9c. DOE Study ──
    cur.execute(
        """INSERT OR IGNORE INTO doe_study
        (plant_id, name, design_type, status, response_name, response_unit,
         notes, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            tour_plant_id, "Surface Finish Optimization", "full_factorial",
            "analyzed", "Surface Roughness", "Ra",
            "2-factor full factorial study to optimize machining parameters",
            admin_id, now, now,
        ),
    )
    doe_study_id = cur.lastrowid

    # 2 factors: Temperature, Speed
    cur.execute(
        """INSERT OR IGNORE INTO doe_factor
        (study_id, name, low_level, high_level, center_point, unit, display_order)
        VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (doe_study_id, "Temperature", 150.0, 250.0, 200.0, "C", 0),
    )
    cur.execute(
        """INSERT OR IGNORE INTO doe_factor
        (study_id, name, low_level, high_level, center_point, unit, display_order)
        VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (doe_study_id, "Cutting Speed", 500.0, 1500.0, 1000.0, "RPM", 1),
    )

    # 10 runs: 2^2 full factorial (4 combos) + 2 replicates of center point + 4 extra reps
    rng_doe = random.Random(42)
    doe_runs = [
        # (run_order, std_order, temp, speed, is_center, replicate)
        (1,  1,  150.0,  500.0, False, 1),
        (2,  2,  250.0,  500.0, False, 1),
        (3,  3,  150.0, 1500.0, False, 1),
        (4,  4,  250.0, 1500.0, False, 1),
        (5,  5,  200.0, 1000.0, True,  1),
        (6,  6,  200.0, 1000.0, True,  2),
        (7,  1,  150.0,  500.0, False, 2),
        (8,  2,  250.0,  500.0, False, 2),
        (9,  3,  150.0, 1500.0, False, 2),
        (10, 4,  250.0, 1500.0, False, 2),
    ]
    for run_order, std_order, temp, speed, is_center, replicate in doe_runs:
        # Response model: roughness = 2.0 - 0.3*temp_coded - 0.5*speed_coded + 0.2*interaction + noise
        temp_coded = (temp - 200.0) / 50.0
        speed_coded = (speed - 1000.0) / 500.0
        response = round(2.0 - 0.3 * temp_coded - 0.5 * speed_coded + 0.2 * temp_coded * speed_coded
                         + rng_doe.gauss(0, 0.1), 3)
        factor_vals = json.dumps({"Temperature": temp, "Cutting Speed": speed})
        cur.execute(
            """INSERT OR IGNORE INTO doe_run
            (study_id, run_order, standard_order, factor_values, factor_actuals,
             response_value, is_center_point, replicate, completed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (doe_study_id, run_order, std_order, factor_vals, factor_vals,
             response, is_center, replicate, now),
        )

    # DOE Analysis results
    cur.execute(
        """INSERT OR IGNORE INTO doe_analysis
        (study_id, anova_table, effects, interactions, r_squared, adj_r_squared,
         regression_model, optimal_settings, computed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            doe_study_id,
            json.dumps([
                {"source": "Temperature", "df": 1, "ss": 0.72, "ms": 0.72, "f_value": 14.4, "p_value": 0.005},
                {"source": "Cutting Speed", "df": 1, "ss": 2.0, "ms": 2.0, "f_value": 40.0, "p_value": 0.0002},
                {"source": "Temperature*Speed", "df": 1, "ss": 0.32, "ms": 0.32, "f_value": 6.4, "p_value": 0.035},
                {"source": "Residual", "df": 6, "ss": 0.30, "ms": 0.05, "f_value": None, "p_value": None},
            ]),
            json.dumps({"Temperature": -0.3, "Cutting Speed": -0.5}),
            json.dumps({"Temperature*Cutting Speed": 0.2}),
            0.91, 0.87,
            json.dumps({"intercept": 2.0, "Temperature": -0.3, "Cutting Speed": -0.5,
                         "Temperature*Cutting Speed": 0.2}),
            json.dumps({"Temperature": 250.0, "Cutting Speed": 1500.0,
                         "predicted_response": 1.0}),
            now,
        ),
    )

    # ── 9d. MQTT Broker ──
    cur.execute(
        """INSERT OR IGNORE INTO mqtt_broker
        (plant_id, name, host, port, client_id, keepalive, max_reconnect_delay,
         use_tls, tls_insecure, is_active, payload_format,
         outbound_enabled, outbound_topic_prefix, outbound_format, outbound_rate_limit,
         created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            tour_plant_id, "Shop Floor Broker", "localhost", 1883,
            "cassini-tour-001", 60, 300,
            0, 0, 1, "json",
            0, "cassini", "json", 1.0,
            now, now,
        ),
    )
    tour_broker_id = cur.lastrowid

    # ── 9e. Signature Workflow ──
    cur.execute(
        """INSERT OR IGNORE INTO signature_workflow
        (plant_id, name, resource_type, is_active, is_required, description, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            tour_plant_id, "Sample Approval Workflow", "sample_approval",
            1, 1, "Two-step approval for critical sample data",
            now, now,
        ),
    )
    tour_workflow_id = cur.lastrowid

    # 2 workflow steps
    cur.execute(
        """INSERT OR IGNORE INTO signature_workflow_step
        (workflow_id, step_order, name, min_role, meaning_code, is_required, allow_self_sign, timeout_hours)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (tour_workflow_id, 1, "Engineering Review", "engineer", "reviewed", 1, 0, 48),
    )
    cur.execute(
        """INSERT OR IGNORE INTO signature_workflow_step
        (workflow_id, step_order, name, min_role, meaning_code, is_required, allow_self_sign, timeout_hours)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (tour_workflow_id, 2, "Quality Approval", "supervisor", "approved", 1, 0, 24),
    )

    # Signature meanings
    for sort_order, (code, display, desc, req_comment) in enumerate([
        ("reviewed", "Reviewed", "Content has been technically reviewed", 0),
        ("approved", "Approved", "Content has been approved for release", 0),
        ("rejected", "Rejected", "Content has been rejected — requires rework", 1),
    ]):
        cur.execute(
            """INSERT OR IGNORE INTO signature_meaning
            (plant_id, code, display_name, description, requires_comment, is_active, sort_order)
            VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (tour_plant_id, code, display, desc, req_comment, 1, sort_order),
        )

    # ── 9f. Retention Policy (7 years) ──
    cur.execute(
        """INSERT OR IGNORE INTO retention_policy
        (plant_id, scope, hierarchy_id, characteristic_id,
         retention_type, retention_value, retention_unit, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (tour_plant_id, "global", None, None, "time_delta", 7, "years", now, now),
    )

    # ── 9g. Audit Log Entries ──
    audit_entries = [
        (admin_id, "admin", "login",            None,                None,   {"method": "password"},        "192.168.1.100"),
        (admin_id, "admin", "create_plant",      "plant",             tour_plant_id, {"name": "Screenshot Tour Plant"}, "192.168.1.100"),
        (admin_id, "admin", "create_characteristic", "characteristic", tour_char_id, {"name": "Test Char"},       "192.168.1.100"),
        (admin_id, "admin", "submit_sample",     "sample",            ooc_sample_ids[0], {"value": 12.8},         "192.168.1.100"),
        (admin_id, "admin", "acknowledge_violation", "violation",     v1,             {"reason": "Expected process adjustment"}, "192.168.1.100"),
        (admin_id, "admin", "export_report",     "report",            None,           {"format": "pdf", "type": "capability"}, "192.168.1.100"),
    ]
    for user_id, username, action, res_type, res_id, detail, ip in audit_entries:
        cur.execute(
            """INSERT OR IGNORE INTO audit_log
            (user_id, username, action, resource_type, resource_id, detail, ip_address, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (user_id, username, action, res_type, res_id, json.dumps(detail), ip, now),
        )

    manifest["screenshot_tour"] = {
        **tour,
        "msa_study_id": msa_study_id,
        "fai_report_id": fai_report_id,
        "doe_study_id": doe_study_id,
        "broker_id": tour_broker_id,
        "workflow_id": tour_workflow_id,
    }

    # ── 10. Sprint 13 Test Plant ──────────────────────────────────────────
    s13_plant = insert_plant(cur, "Sprint 13 Tests", "SPRINT13")
    s13_dept = insert_hierarchy(cur, s13_plant, "S13 Dept", "Area")
    s13_line = insert_hierarchy(cur, s13_plant, "S13 Line", "Line", s13_dept)
    s13_station = insert_hierarchy(cur, s13_plant, "S13 Station", "Cell", s13_line)
    insert_role(cur, admin_id, s13_plant, "admin")

    # Variable characteristic with known data for capability testing
    s13_char = insert_characteristic(
        cur, s13_station, "S13 Variable",
        target_value=10.0, usl=12.0, lsl=8.0,
        ucl=11.5, lcl=8.5, stored_sigma=0.5, stored_center_line=10.0,
    )
    insert_nelson_rules(cur, s13_char)

    # Seed 100 normal samples (mean~10.0, sigma~0.5 deterministic spread)
    rng_s13 = random.Random(1337)
    for i in range(100):
        val = round(rng_s13.gauss(10.0, 0.5), 3)
        insert_variable_sample(cur, s13_char, val)

    # Add 5 OOC samples to trigger violations + stability warning
    ooc_vals_s13 = [14.0, 6.0, 13.5, 5.5, 14.5]
    s13_violation_ids = []
    for val in ooc_vals_s13:
        sid = insert_variable_sample(cur, s13_char, val)
        vid = insert_violation(cur, sid, s13_char)
        s13_violation_ids.append(vid)

    # Characteristic for pooled sigma testing (with material overrides)
    s13_pooled_char = insert_characteristic(
        cur, s13_station, "S13 Pooled",
        target_value=10.0, usl=15.0, lsl=5.0,
        ucl=13.0, lcl=7.0, stored_sigma=0.8, stored_center_line=10.0,
        sigma_method="pooled",
    )
    insert_nelson_rules(cur, s13_pooled_char)

    # Create materials for pooled sigma char
    s13_raw_cls_id, s13_raw_path = insert_material_class(
        cur, s13_plant, "S13 Materials", "S13MAT",
        description="Sprint 13 test materials",
    )
    s13_mat_a = insert_material(cur, s13_plant, s13_raw_cls_id, "S13 Material A", "S13-MAT-A")
    s13_mat_b = insert_material(cur, s13_plant, s13_raw_cls_id, "S13 Material B", "S13-MAT-B")

    insert_material_limit_override(
        cur, s13_pooled_char, material_id=s13_mat_a,
        target_value=10.0, stored_sigma=0.8, stored_center_line=10.0,
    )
    insert_material_limit_override(
        cur, s13_pooled_char, material_id=s13_mat_b,
        target_value=11.0, stored_sigma=0.9, stored_center_line=11.0,
    )

    # Seed samples for pooled char with materials
    for i in range(30):
        val = round(rng_s13.gauss(10.0, 0.8), 3)
        insert_variable_sample(cur, s13_pooled_char, val, material_id=s13_mat_a)
    for i in range(30):
        val = round(rng_s13.gauss(11.0, 0.9), 3)
        insert_variable_sample(cur, s13_pooled_char, val, material_id=s13_mat_b)

    # Characteristic for Phase I/II testing
    s13_phase_char = insert_characteristic(
        cur, s13_station, "S13 Phase",
        target_value=10.0, usl=20.0, lsl=0.0,
        ucl=13.0, lcl=7.0, stored_sigma=1.0, stored_center_line=10.0,
    )
    insert_nelson_rules(cur, s13_phase_char)
    for i in range(50):
        val = round(rng_s13.gauss(10.0, 1.0), 3)
        insert_variable_sample(cur, s13_phase_char, val)

    # Create a locked-out user for unlock testing
    s13_locked_user = insert_user(cur, "s13-locked", "S13Locked123!")
    insert_role(cur, s13_locked_user, s13_plant, "operator")
    # Set 10 failed login attempts and lock until far future
    cur.execute(
        "UPDATE user SET failed_login_count = 10, locked_until = ? WHERE id = ?",
        ((_SEED_BASE_TIME + timedelta(hours=24)).isoformat(), s13_locked_user),
    )

    # Create a deactivated user for username recycling test
    s13_deactivated_user = insert_user(cur, "s13-deactivated", "S13Deact123!")
    insert_role(cur, s13_deactivated_user, s13_plant, "operator")
    cur.execute("UPDATE user SET is_active = 0 WHERE id = ?", (s13_deactivated_user,))

    # Audit log entries for Sprint 13 (freeze/unfreeze actions)
    for action, summary in [
        ("freeze", "Control limits frozen for 'S13 Phase' (Phase II)"),
        ("unfreeze", "Control limits unfrozen for 'S13 Phase' (back to Phase I)"),
    ]:
        cur.execute(
            """INSERT OR IGNORE INTO audit_log
            (user_id, username, action, resource_type, resource_id, detail, ip_address, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (admin_id, "admin", action, "characteristic", s13_phase_char,
             json.dumps({"summary": summary}), "192.168.1.100", utcnow()),
        )

    manifest["sprint13"] = {
        "plant_id": s13_plant,
        "dept_id": s13_dept,
        "line_id": s13_line,
        "station_id": s13_station,
        "char_id": s13_char,
        "pooled_char_id": s13_pooled_char,
        "phase_char_id": s13_phase_char,
        "locked_user_id": s13_locked_user,
        "deactivated_user_id": s13_deactivated_user,
        "mat_a_id": s13_mat_a,
        "mat_b_id": s13_mat_b,
    }

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
