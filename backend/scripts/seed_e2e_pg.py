"""Seed E2E test database for PostgreSQL (and other non-SQLite dialects).

Monkey-patches seed_e2e.py's helper functions to use PostgreSQL-compatible
SQL (proper boolean literals, quoted reserved words, RETURNING id for
lastrowid), then delegates to the main seed logic.

Usage:
    python scripts/seed_e2e_pg.py --url "postgresql://cassini:cassini@localhost:5432/cassini_test"
    python scripts/seed_e2e_pg.py --url "postgresql://..." --manifest e2e-manifest.json
"""

import json
import re
import sys
from pathlib import Path

# Add backend/src to path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir / "src"))

import psycopg2

from cassini.core.auth.passwords import hash_password


# ── PostgreSQL-compatible replacements for seed_e2e.py helpers ────────────
# These replace the sqlite3-specific versions that use hardcoded 1/0 for booleans
# and unquoted `user` table name.


def utcnow() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()


def pg_insert_plant(cur, name: str, code: str) -> int:
    cur.execute(
        "INSERT INTO plant (name, code, is_active, created_at, updated_at)"
        " VALUES (%s, %s, true, %s, %s) RETURNING id",
        (name, code, utcnow(), utcnow()),
    )
    row = cur.fetchone()
    return row[0]


def pg_insert_hierarchy(cur, plant_id: int, name: str, htype: str, parent_id=None) -> int:
    cur.execute(
        "INSERT INTO hierarchy (plant_id, name, type, parent_id)"
        " VALUES (%s, %s, %s, %s) RETURNING id",
        (plant_id, name, htype, parent_id),
    )
    row = cur.fetchone()
    return row[0]


def pg_insert_characteristic(cur, hierarchy_id: int, name: str, **kwargs) -> int:
    defaults = {
        "subgroup_size": 1,
        "data_type": "variable",
        "subgroup_mode": "NOMINAL_TOLERANCE",
        "min_measurements": 1,
        "decimal_precision": 3,
        "is_excluded": False,
    }
    defaults.update(kwargs)
    cur.execute(
        """INSERT INTO characteristic
        (hierarchy_id, name, subgroup_size, data_type, subgroup_mode,
         min_measurements, decimal_precision, target_value, usl, lsl, ucl, lcl,
         stored_sigma, stored_center_line, attribute_chart_type, default_sample_size,
         chart_type, cusum_target, cusum_k, cusum_h, ewma_lambda, ewma_l)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING id""",
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
    row = cur.fetchone()
    return row[0]


def pg_insert_nelson_rules(cur, char_id: int) -> None:
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
            VALUES (%s, %s, %s, %s)""",
            (char_id, rule_id, is_enabled, require_ack),
        )


# Shared timestamp state (mirrors seed_e2e._seed_counter)
from datetime import datetime, timedelta, timezone
_SEED_BASE_TIME = datetime.now(timezone.utc)
_seed_counter = 0


def seed_ts(hours_back=None) -> str:
    global _seed_counter
    if hours_back is not None:
        return (_SEED_BASE_TIME - timedelta(hours=hours_back)).isoformat()
    _seed_counter += 1
    return (_SEED_BASE_TIME - timedelta(hours=200 - _seed_counter)).isoformat()


def pg_insert_variable_sample(cur, char_id: int, value: float,
                               ts=None, material_id=None) -> int:
    ts = ts or seed_ts()
    cur.execute(
        """INSERT INTO sample
        (char_id, timestamp, actual_n, is_excluded, is_undersized, is_modified, material_id)
        VALUES (%s, %s, 1, false, false, false, %s) RETURNING id""",
        (char_id, ts, material_id),
    )
    row = cur.fetchone()
    sample_id = row[0]
    cur.execute(
        "INSERT INTO measurement (sample_id, value) VALUES (%s, %s)",
        (sample_id, value),
    )
    return sample_id


def pg_insert_attribute_sample(cur, char_id: int, defect_count: int,
                                sample_size=None, units_inspected=None,
                                ts=None) -> int:
    ts = ts or seed_ts()
    cur.execute(
        """INSERT INTO sample
        (char_id, timestamp, actual_n, is_excluded, is_undersized, is_modified,
         defect_count, sample_size, units_inspected)
        VALUES (%s, %s, 1, false, false, false, %s, %s, %s) RETURNING id""",
        (char_id, ts, defect_count, sample_size, units_inspected),
    )
    row = cur.fetchone()
    return row[0]


def pg_insert_violation(cur, sample_id: int, char_id: int, rule_id: int = 1,
                         rule_name: str = "Beyond Control Limits",
                         severity: str = "CRITICAL",
                         requires_ack: bool = True) -> int:
    cur.execute(
        """INSERT INTO violation
        (sample_id, char_id, rule_id, rule_name, severity, acknowledged,
         requires_acknowledgement, created_at)
        VALUES (%s, %s, %s, %s, %s, false, %s, %s) RETURNING id""",
        (sample_id, char_id, rule_id, rule_name, severity, requires_ack, utcnow()),
    )
    row = cur.fetchone()
    return row[0]


def pg_insert_user(cur, username: str, password: str, must_change: bool = False) -> int:
    hashed = hash_password(password)
    cur.execute(
        """INSERT INTO "user" (username, hashed_password, is_active, must_change_password, created_at, updated_at)
        VALUES (%s, %s, true, %s, %s, %s) RETURNING id""",
        (username, hashed, must_change, utcnow(), utcnow()),
    )
    row = cur.fetchone()
    return row[0]


def pg_insert_role(cur, user_id: int, plant_id: int, role: str) -> None:
    cur.execute(
        "INSERT INTO user_plant_role (user_id, plant_id, role) VALUES (%s, %s, %s)",
        (user_id, plant_id, role),
    )


def pg_insert_material_class(cur, plant_id: int, name: str, code: str,
                              parent_id=None, parent_path: str = "/", depth: int = 0,
                              description=None):
    now = utcnow()
    cur.execute(
        """INSERT INTO material_class
        (plant_id, parent_id, name, code, path, depth, description, created_at, updated_at)
        VALUES (%s, %s, %s, %s, '/', %s, %s, %s, %s) RETURNING id""",
        (plant_id, parent_id, name, code, depth, description, now, now),
    )
    row = cur.fetchone()
    class_id = row[0]
    path = f"{parent_path}{class_id}/"
    cur.execute("UPDATE material_class SET path = %s WHERE id = %s", (path, class_id))
    return class_id, path


def pg_insert_material(cur, plant_id: int, class_id, name: str, code: str,
                        description=None) -> int:
    now = utcnow()
    cur.execute(
        """INSERT INTO material
        (plant_id, class_id, name, code, description, created_at, updated_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id""",
        (plant_id, class_id, name, code, description, now, now),
    )
    row = cur.fetchone()
    return row[0]


def pg_insert_material_limit_override(cur, char_id: int, *,
                                       material_id=None, class_id=None, **kwargs) -> int:
    now = utcnow()
    cur.execute(
        """INSERT INTO material_limit_override
        (characteristic_id, material_id, class_id, ucl, lcl, stored_sigma,
         stored_center_line, target_value, usl, lsl, created_at, updated_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id""",
        (
            char_id, material_id, class_id,
            kwargs.get("ucl"), kwargs.get("lcl"),
            kwargs.get("stored_sigma"), kwargs.get("stored_center_line"),
            kwargs.get("target_value"), kwargs.get("usl"), kwargs.get("lsl"),
            now, now,
        ),
    )
    row = cur.fetchone()
    return row[0]


def pg_seed_standard_hierarchy(cur, plant_name: str, plant_code: str) -> dict:
    pid = pg_insert_plant(cur, plant_name, plant_code)
    dept = pg_insert_hierarchy(cur, pid, "Test Dept", "Area")
    line = pg_insert_hierarchy(cur, pid, "Test Line", "Line", dept)
    station = pg_insert_hierarchy(cur, pid, "Test Station", "Cell", line)
    char_id = pg_insert_characteristic(
        cur, station, "Test Char",
        target_value=10.0, usl=12.0, lsl=8.0,
        ucl=11.5, lcl=8.5, stored_sigma=0.5, stored_center_line=10.0,
    )
    pg_insert_nelson_rules(cur, char_id)
    return {"plant_id": pid, "dept_id": dept, "line_id": line, "station_id": station, "char_id": char_id}


# ── Seed data constants (imported from seed_e2e) ────────────────────────

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

def seed_pg(url: str) -> dict:
    """Seed all E2E test data into PostgreSQL. Returns manifest of created IDs."""
    import random
    from dataclasses import asdict

    from cassini.core.msa.engine import GageRREngine

    conn = psycopg2.connect(url)
    conn.autocommit = False
    cur = conn.cursor()

    manifest = {}

    # 1. Admin user
    admin_id = pg_insert_user(cur, "admin", "admin", must_change=False)
    manifest["admin_user_id"] = admin_id

    # 2. Standard plants
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
        ids = pg_seed_standard_hierarchy(cur, name, code)
        manifest[key] = ids

        if key in ("dashboard", "annotations", "violations", "reports",
                   "sample_mgmt", "config", "inspector", "data_entry"):
            for val in NORMAL_VALUES:
                pg_insert_variable_sample(cur, ids["char_id"], val)

        if key in ("dashboard", "violations", "inspector"):
            ooc1 = pg_insert_variable_sample(cur, ids["char_id"], 15.0)
            ooc2 = pg_insert_variable_sample(cur, ids["char_id"], 16.0)
            pg_insert_violation(cur, ooc1, ids["char_id"])
            pg_insert_violation(cur, ooc2, ids["char_id"])

    # 3. RBAC Plant
    rbac = pg_seed_standard_hierarchy(cur, "RBAC Plant", "RBACPLA")
    for val in NORMAL_VALUES:
        pg_insert_variable_sample(cur, rbac["char_id"], val)
    rbac_ooc1 = pg_insert_variable_sample(cur, rbac["char_id"], 15.0)
    rbac_ooc2 = pg_insert_variable_sample(cur, rbac["char_id"], 16.0)
    pg_insert_violation(cur, rbac_ooc1, rbac["char_id"])
    pg_insert_violation(cur, rbac_ooc2, rbac["char_id"])

    rbac_users = {
        "operator": ("rbac-operator", "RbacOper123!"),
        "supervisor": ("rbac-supervisor", "RbacSuper123!"),
        "engineer": ("rbac-engineer", "RbacEng123!"),
        "admin2": ("rbac-admin2", "RbacAdmin123!"),
    }
    rbac_user_ids = {}
    for role_key, (username, password) in rbac_users.items():
        uid = pg_insert_user(cur, username, password)
        role = "admin" if role_key == "admin2" else role_key
        pg_insert_role(cur, uid, rbac["plant_id"], role)
        rbac_user_ids[role_key] = uid
    rbac["user_ids"] = rbac_user_ids
    manifest["rbac"] = rbac

    # Assign admin to ALL plants
    cur.execute("SELECT id FROM plant")
    all_plant_ids = [row[0] for row in cur.fetchall()]
    for pid in all_plant_ids:
        pg_insert_role(cur, admin_id, pid, "admin")

    # 4. Kiosk Plant
    kiosk = pg_seed_standard_hierarchy(cur, "Kiosk Plant", "KIOSKPL")
    kiosk_char2 = pg_insert_characteristic(
        cur, kiosk["station_id"], "Kiosk Char 2",
        target_value=10.0, usl=12.0, lsl=8.0,
        ucl=11.5, lcl=8.5, stored_sigma=0.5, stored_center_line=10.0,
    )
    pg_insert_nelson_rules(cur, kiosk_char2)
    for val in KIOSK_NORMAL:
        pg_insert_variable_sample(cur, kiosk["char_id"], val)
        pg_insert_variable_sample(cur, kiosk_char2, val)
    pg_insert_variable_sample(cur, kiosk["char_id"], 15.0)
    pg_insert_variable_sample(cur, kiosk_char2, 16.0)
    kiosk["char_id_2"] = kiosk_char2
    manifest["kiosk"] = kiosk

    # 5. CUSUM/EWMA Plant
    ce_plant = pg_insert_plant(cur, "CUSUM EWMA Plant", "CUSUMEWMA")
    ce_dept = pg_insert_hierarchy(cur, ce_plant, "CE Dept", "Area")
    ce_line = pg_insert_hierarchy(cur, ce_plant, "CE Line", "Line", ce_dept)
    ce_station = pg_insert_hierarchy(cur, ce_plant, "CE Station", "Cell", ce_line)
    cusum_char = pg_insert_characteristic(
        cur, ce_station, "CUSUM Diameter",
        chart_type="cusum", cusum_target=10.0, cusum_k=0.5, cusum_h=5.0,
        ucl=10.5, lcl=9.5, stored_sigma=0.15, stored_center_line=10.0,
    )
    ewma_char = pg_insert_characteristic(
        cur, ce_station, "EWMA Pressure",
        chart_type="ewma", ewma_lambda=0.2, ewma_l=2.7,
        target_value=10.0,
        ucl=10.5, lcl=9.5, stored_sigma=0.15, stored_center_line=10.0,
    )
    pg_insert_nelson_rules(cur, cusum_char)
    pg_insert_nelson_rules(cur, ewma_char)
    for val in CUSUM_EWMA_VALUES:
        pg_insert_variable_sample(cur, cusum_char, val)
        pg_insert_variable_sample(cur, ewma_char, val)
    manifest["cusum_ewma"] = {
        "plant_id": ce_plant, "station_id": ce_station,
        "cusum_char_id": cusum_char, "ewma_char_id": ewma_char,
    }
    pg_insert_role(cur, admin_id, ce_plant, "admin")

    # 6. Attribute Charts Plant
    attr_plant = pg_insert_plant(cur, "Attribute Charts Plant", "ATTRCHRT")
    attr_dept = pg_insert_hierarchy(cur, attr_plant, "Attr Dept", "Area")
    attr_line = pg_insert_hierarchy(cur, attr_plant, "Attr Line", "Line", attr_dept)
    attr_station = pg_insert_hierarchy(cur, attr_plant, "Attr Station", "Cell", attr_line)

    p_char = pg_insert_characteristic(
        cur, attr_station, "Proportion Defectives",
        data_type="attribute", attribute_chart_type="p", default_sample_size=100,
    )
    np_char = pg_insert_characteristic(
        cur, attr_station, "Number Defectives",
        data_type="attribute", attribute_chart_type="np", default_sample_size=50,
    )
    c_char = pg_insert_characteristic(
        cur, attr_station, "Total Defects",
        data_type="attribute", attribute_chart_type="c", default_sample_size=100,
    )
    u_char = pg_insert_characteristic(
        cur, attr_station, "Defects Per Unit",
        data_type="attribute", attribute_chart_type="u", default_sample_size=10,
    )
    for cid in (p_char, np_char, c_char, u_char):
        pg_insert_nelson_rules(cur, cid)

    for count in [3, 5, 2, 4, 6, 3, 7]:
        pg_insert_attribute_sample(cur, p_char, count, sample_size=100)
    for count in [2, 3, 1, 4, 2, 5, 3]:
        pg_insert_attribute_sample(cur, np_char, count, sample_size=50)
    for count in [8, 12, 5, 10, 7, 14, 9]:
        pg_insert_attribute_sample(cur, c_char, count, sample_size=100)
    for count in [3, 5, 2, 6, 4, 7, 3]:
        pg_insert_attribute_sample(cur, u_char, count, sample_size=10, units_inspected=10)

    manifest["attribute_charts"] = {
        "plant_id": attr_plant, "station_id": attr_station,
        "p_char_id": p_char, "np_char_id": np_char,
        "c_char_id": c_char, "u_char_id": u_char,
    }
    pg_insert_role(cur, admin_id, attr_plant, "admin")

    # 7. Material Limits Plant
    ml = pg_seed_standard_hierarchy(cur, "Material Limits Plant", "MATLIM")
    raw_cls_id, raw_path = pg_insert_material_class(
        cur, ml["plant_id"], "Raw Materials", "RAW",
        description="Raw material inputs",
    )
    metals_cls_id, metals_path = pg_insert_material_class(
        cur, ml["plant_id"], "Metals", "MTL",
        parent_id=raw_cls_id, parent_path=raw_path, depth=1,
        description="Metal alloys",
    )
    mat_a_id = pg_insert_material(
        cur, ml["plant_id"], metals_cls_id,
        "Test Material A", "MAT-A", "First test material",
    )
    mat_b_id = pg_insert_material(
        cur, ml["plant_id"], metals_cls_id,
        "Test Material B", "MAT-B", "Second test material",
    )
    for val in NORMAL_VALUES:
        pg_insert_variable_sample(cur, ml["char_id"], val)
    for val in [10.2, 10.3, 10.4, 10.5]:
        pg_insert_variable_sample(cur, ml["char_id"], val, material_id=mat_a_id)
    for val in [9.8, 9.9, 10.0, 10.1]:
        pg_insert_variable_sample(cur, ml["char_id"], val, material_id=mat_b_id)

    pg_insert_material_limit_override(
        cur, ml["char_id"], material_id=mat_a_id,
        ucl=13.0, lcl=9.0, stored_sigma=0.6, stored_center_line=10.5,
        target_value=10.0,
    )
    pg_insert_material_limit_override(
        cur, ml["char_id"], material_id=mat_b_id,
        ucl=11.0, lcl=9.5,
    )
    pg_insert_role(cur, admin_id, ml["plant_id"], "admin")
    manifest["material_limits"] = ml

    # 8. Simple plants
    simple_plants = {
        "connectivity":  ("Connectivity Test Plant", "CTP"),
        "navigation":    ("Nav Test Plant",          "NAV"),
        "hierarchy":     ("Hierarchy Test Plant",    "HTP"),
        "mobile":        ("Mobile Test Plant",       "MOBPLNT"),
        "users":         ("Users Test Plant",        "UTP"),
        "settings":      ("Settings Test Plant",     "STP"),
    }
    for key, (name, code) in simple_plants.items():
        pid = pg_insert_plant(cur, name, code)
        pg_insert_role(cur, admin_id, pid, "admin")
        manifest[key] = {"plant_id": pid}

    # 8b. Notifications seed webhook
    now = utcnow()
    cur.execute(
        "INSERT INTO webhook_config (name, url, is_active, retry_count, created_at, updated_at)"
        " VALUES (%s, %s, true, 3, %s, %s) RETURNING id",
        ("E2E Seed Hook", "https://httpbin.org/post", now, now),
    )
    manifest["notifications"] = {"webhook_id": cur.fetchone()[0]}

    # 9. Screenshot Tour Plant
    tour = pg_seed_standard_hierarchy(cur, "Screenshot Tour Plant", "SCRNTOUR")
    pg_insert_role(cur, admin_id, tour["plant_id"], "admin")
    tour_char_id = tour["char_id"]
    tour_plant_id = tour["plant_id"]

    rng = random.Random(42)
    for i in range(40):
        val = round(rng.gauss(10.0, 0.4), 3)
        pg_insert_variable_sample(cur, tour_char_id, val)
    for i in range(7):
        val = round(rng.choice([rng.uniform(11.0, 11.4), rng.uniform(8.6, 9.0)]), 3)
        pg_insert_variable_sample(cur, tour_char_id, val)

    ooc_values = [12.8, 7.2, 13.1]
    ooc_sample_ids = []
    for val in ooc_values:
        sid = pg_insert_variable_sample(cur, tour_char_id, val)
        ooc_sample_ids.append(sid)

    v1 = pg_insert_violation(cur, ooc_sample_ids[0], tour_char_id)
    pg_insert_violation(cur, ooc_sample_ids[1], tour_char_id)

    cur.execute(
        "UPDATE violation SET acknowledged = true, ack_user = %s, "
        "ack_reason = %s, ack_timestamp = %s WHERE id = %s",
        ("admin", "Expected process adjustment", now, v1),
    )

    # 9a. MSA Gage R&R Study
    msa_n_ops = 3
    msa_n_parts = 10
    msa_n_reps = 3
    msa_tolerance = 4.0

    cur.execute(
        "INSERT INTO msa_study"
        " (plant_id, name, study_type, characteristic_id, num_operators, num_parts,"
        "  num_replicates, tolerance, status, created_by, created_at, completed_at, results_json)"
        " VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id",
        (
            tour_plant_id, "Bore Diameter Gage R&R", "crossed_anova",
            tour_char_id, msa_n_ops, msa_n_parts, msa_n_reps, msa_tolerance,
            "complete", admin_id, now, now, None,
        ),
    )
    msa_study_id = cur.fetchone()[0]

    operator_ids = []
    for seq, opname in enumerate(["Alice", "Bob", "Carlos"]):
        cur.execute(
            "INSERT INTO msa_operator (study_id, name, sequence_order)"
            " VALUES (%s, %s, %s) RETURNING id",
            (msa_study_id, opname, seq),
        )
        operator_ids.append(cur.fetchone()[0])

    part_ids = []
    rng_msa = random.Random(42)
    ref_values = []
    for seq in range(msa_n_parts):
        ref_val = round(10.0 + rng_msa.uniform(-1.5, 1.5), 3)
        ref_values.append(ref_val)
        cur.execute(
            "INSERT INTO msa_part (study_id, name, reference_value, sequence_order)"
            " VALUES (%s, %s, %s, %s) RETURNING id",
            (msa_study_id, f"Part {seq + 1}", ref_val, seq),
        )
        part_ids.append(cur.fetchone()[0])

    measurements_3d = []
    for op_idx, op_id in enumerate(operator_ids):
        op_measurements = []
        for part_idx, part_id in enumerate(part_ids):
            ref = ref_values[part_idx]
            rep_measurements = []
            for rep in range(1, msa_n_reps + 1):
                val = round(ref + rng_msa.gauss(0, 0.15), 4)
                rep_measurements.append(val)
                cur.execute(
                    "INSERT INTO msa_measurement"
                    " (study_id, operator_id, part_id, replicate_num, value, timestamp)"
                    " VALUES (%s, %s, %s, %s, %s, %s)",
                    (msa_study_id, op_id, part_id, rep, val, now),
                )
            op_measurements.append(rep_measurements)
        measurements_3d.append(op_measurements)

    grr_engine = GageRREngine()
    grr_result = grr_engine.calculate_crossed_anova(
        measurements_3d, tolerance=msa_tolerance,
    )
    cur.execute(
        "UPDATE msa_study SET results_json = %s WHERE id = %s",
        (json.dumps(asdict(grr_result)), msa_study_id),
    )

    # 9b. FAI Report
    cur.execute(
        "INSERT INTO fai_report"
        " (plant_id, part_number, part_name, revision, serial_number, drawing_number,"
        "  organization_name, supplier, reason_for_inspection, status,"
        "  created_by, created_at, submitted_by, submitted_at)"
        " VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id",
        (
            tour_plant_id, "PN-2026-001", "Turbine Housing", "Rev C",
            "SN-00042", "DWG-TH-100", "Saturnis Manufacturing",
            "Apex Precision Parts", "new_part", "submitted",
            admin_id, now, admin_id, now,
        ),
    )
    fai_report_id = cur.fetchone()[0]

    fai_items = [
        (1, "Bore Diameter",     25.000, 25.050, 24.950, 25.012, "mm",  "Bore Micrometer",  True,  "pass"),
        (2, "Overall Length",    100.000, 100.100, 99.900, 100.045, "mm", "Caliper",          False, "pass"),
        (3, "Surface Roughness",  0.800,   1.600,  None,   0.920, "Ra",  "Profilometer",     True,  "pass"),
        (4, "Thread Pitch",       1.500,   1.520,  1.480,  1.505, "mm",  "Thread Gauge",     False, "pass"),
        (5, "Hardness",          58.000,  62.000, 55.000, 59.200, "HRC", "Rockwell Tester",  True,  "pass"),
        (6, "Concentricity",      0.000,   0.025,  None,   0.032, "mm",  "CMM",              True,  "fail"),
    ]
    for seq, (balloon, fname, nom, usl, lsl, actual, unit, tool, designed, result) in enumerate(fai_items):
        cur.execute(
            "INSERT INTO fai_item"
            " (report_id, balloon_number, characteristic_name, nominal, usl, lsl,"
            "  actual_value, unit, tools_used, designed_char, result, sequence_order)"
            " VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
            (fai_report_id, balloon, fname, nom, usl, lsl, actual, unit, tool, designed, result, seq),
        )

    # 9c. DOE Study
    cur.execute(
        "INSERT INTO doe_study"
        " (plant_id, name, design_type, status, response_name, response_unit,"
        "  notes, created_by, created_at, updated_at)"
        " VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id",
        (
            tour_plant_id, "Surface Finish Optimization", "full_factorial",
            "analyzed", "Surface Roughness", "Ra",
            "2-factor full factorial study to optimize machining parameters",
            admin_id, now, now,
        ),
    )
    doe_study_id = cur.fetchone()[0]

    cur.execute(
        "INSERT INTO doe_factor"
        " (study_id, name, low_level, high_level, center_point, unit, display_order)"
        " VALUES (%s, %s, %s, %s, %s, %s, %s)",
        (doe_study_id, "Temperature", 150.0, 250.0, 200.0, "C", 0),
    )
    cur.execute(
        "INSERT INTO doe_factor"
        " (study_id, name, low_level, high_level, center_point, unit, display_order)"
        " VALUES (%s, %s, %s, %s, %s, %s, %s)",
        (doe_study_id, "Cutting Speed", 500.0, 1500.0, 1000.0, "RPM", 1),
    )

    rng_doe = random.Random(42)
    doe_runs = [
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
        temp_coded = (temp - 200.0) / 50.0
        speed_coded = (speed - 1000.0) / 500.0
        response = round(2.0 - 0.3 * temp_coded - 0.5 * speed_coded + 0.2 * temp_coded * speed_coded
                         + rng_doe.gauss(0, 0.1), 3)
        factor_vals = json.dumps({"Temperature": temp, "Cutting Speed": speed})
        cur.execute(
            "INSERT INTO doe_run"
            " (study_id, run_order, standard_order, factor_values, factor_actuals,"
            "  response_value, is_center_point, replicate, completed_at)"
            " VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)",
            (doe_study_id, run_order, std_order, factor_vals, factor_vals,
             response, is_center, replicate, now),
        )

    cur.execute(
        "INSERT INTO doe_analysis"
        " (study_id, anova_table, effects, interactions, r_squared, adj_r_squared,"
        "  regression_model, optimal_settings, computed_at)"
        " VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)",
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

    # 9d. MQTT Broker
    cur.execute(
        "INSERT INTO mqtt_broker"
        " (plant_id, name, host, port, client_id, keepalive, max_reconnect_delay,"
        "  use_tls, tls_insecure, is_active, payload_format,"
        "  outbound_enabled, outbound_topic_prefix, outbound_format, outbound_rate_limit,"
        "  created_at, updated_at)"
        " VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id",
        (
            tour_plant_id, "Shop Floor Broker", "localhost", 1883,
            "cassini-tour-001", 60, 300,
            False, False, True, "json",
            False, "cassini", "json", 1.0,
            now, now,
        ),
    )
    tour_broker_id = cur.fetchone()[0]

    # 9e. Signature Workflow
    cur.execute(
        "INSERT INTO signature_workflow"
        " (plant_id, name, resource_type, is_active, is_required, description, created_at, updated_at)"
        " VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING id",
        (
            tour_plant_id, "Sample Approval Workflow", "sample_approval",
            True, True, "Two-step approval for critical sample data",
            now, now,
        ),
    )
    tour_workflow_id = cur.fetchone()[0]

    cur.execute(
        "INSERT INTO signature_workflow_step"
        " (workflow_id, step_order, name, min_role, meaning_code, is_required, allow_self_sign, timeout_hours)"
        " VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
        (tour_workflow_id, 1, "Engineering Review", "engineer", "reviewed", True, False, 48),
    )
    cur.execute(
        "INSERT INTO signature_workflow_step"
        " (workflow_id, step_order, name, min_role, meaning_code, is_required, allow_self_sign, timeout_hours)"
        " VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
        (tour_workflow_id, 2, "Quality Approval", "supervisor", "approved", True, False, 24),
    )

    for sort_order, (mcode, display, desc, req_comment) in enumerate([
        ("reviewed", "Reviewed", "Content has been technically reviewed", False),
        ("approved", "Approved", "Content has been approved for release", False),
        ("rejected", "Rejected", "Content has been rejected -- requires rework", True),
    ]):
        cur.execute(
            "INSERT INTO signature_meaning"
            " (plant_id, code, display_name, description, requires_comment, is_active, sort_order)"
            " VALUES (%s, %s, %s, %s, %s, %s, %s)",
            (tour_plant_id, mcode, display, desc, req_comment, True, sort_order),
        )

    # 9f. Retention Policy
    cur.execute(
        "INSERT INTO retention_policy"
        " (plant_id, scope, hierarchy_id, characteristic_id,"
        "  retention_type, retention_value, retention_unit, created_at, updated_at)"
        " VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)",
        (tour_plant_id, "global", None, None, "time_delta", 7, "years", now, now),
    )

    # 9g. Audit Log Entries
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
            "INSERT INTO audit_log"
            " (user_id, username, action, resource_type, resource_id, detail, ip_address, timestamp)"
            " VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
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

    conn.commit()
    conn.close()

    return manifest


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Seed E2E test database (PostgreSQL)")
    parser.add_argument("--url", required=True, help="PostgreSQL connection URL")
    parser.add_argument("--manifest", default=str(backend_dir / "e2e-manifest.json"),
                        help="Path to write ID manifest JSON")
    args = parser.parse_args()

    manifest = seed_pg(args.url)

    with open(args.manifest, "w") as f:
        json.dump(manifest, f, indent=2)

    print(f"Seeded PostgreSQL successfully.")
    print(f"Manifest written to {args.manifest}")
    print(f"  Plants: {sum(1 for v in manifest.values() if isinstance(v, dict) and 'plant_id' in v)}")
    print(f"  Admin user ID: {manifest['admin_user_id']}")
