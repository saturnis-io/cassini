"""Seed Cassini showcase database with rich demo data.

Creates 3 industry-themed plants (automotive, aerospace, pharma) with full
ISA-95 hierarchies, 8 users across 4 role levels, and 24 characteristics
covering every chart type, distribution, and SPC feature.

Uses raw sqlite3 for speed (same pattern as seed_e2e.py).

Usage:
    python scripts/seed_showcase.py --dry-run        # Test generators only
    python scripts/seed_showcase.py --force           # Create showcase.db
    python scripts/seed_showcase.py --db-path foo.db  # Custom path
"""

import argparse
import hashlib
import json
import math
import os
import random
import sqlite3
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

# ── Path setup ───────────────────────────────────────────────────────────
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir / "src"))

from cassini.core.auth.passwords import hash_password

# ── Constants ────────────────────────────────────────────────────────────
DB_PATH = backend_dir / "showcase.db"
DUMMY_SERVER_URL = "http://localhost:3000/api"
IDS: dict[str, int] = {}

# Reproducible random data
random.seed(42)

# ── Timestamp helpers ────────────────────────────────────────────────────
BASE_TIME = datetime.now(timezone.utc)


def utcnow() -> str:
    """ISO timestamp for SQLite."""
    return datetime.now(timezone.utc).isoformat()


def ts_offset(base_dt: datetime, minutes: int = 0, hours: int = 0, days: int = 0) -> str:
    """ISO string offset from a base datetime."""
    return (base_dt + timedelta(minutes=minutes, hours=hours, days=days)).isoformat()


# ── Data generators ──────────────────────────────────────────────────────

def gen_normal(n: int, mean: float, std: float, seed: int | None = None) -> list[float]:
    """Generate n normally distributed values."""
    if seed is not None:
        random.seed(seed)
    return [random.gauss(mean, std) for _ in range(n)]


def gen_weibull(n: int, shape: float, scale: float, seed: int | None = None) -> list[float]:
    """Generate n Weibull-distributed values via inverse CDF."""
    if seed is not None:
        random.seed(seed)
    return [scale * (-math.log(1 - random.random())) ** (1 / shape) for _ in range(n)]


def gen_gamma(n: int, shape: float, scale: float, seed: int | None = None) -> list[float]:
    """Generate n Gamma-distributed values."""
    if seed is not None:
        random.seed(seed)
    return [random.gammavariate(shape, scale) for _ in range(n)]


def gen_lognormal(n: int, mu: float, sigma: float, seed: int | None = None) -> list[float]:
    """Generate n log-normally distributed values."""
    if seed is not None:
        random.seed(seed)
    return [random.lognormvariate(mu, sigma) for _ in range(n)]


def gen_exponential(n: int, lam: float, seed: int | None = None) -> list[float]:
    """Generate n exponentially distributed values. lam = rate parameter."""
    if seed is not None:
        random.seed(seed)
    return [random.expovariate(lam) for _ in range(n)]


def gen_drift(n: int, mean: float, std: float, drift_per_sample: float, seed: int | None = None) -> list[float]:
    """Generate n values with a linear mean drift."""
    if seed is not None:
        random.seed(seed)
    return [random.gauss(mean + i * drift_per_sample, std) for i in range(n)]


def gen_shift(n: int, mean1: float, std1: float, shift_point: int,
              mean2: float, std2: float, seed: int | None = None) -> list[float]:
    """Generate n values with a mean shift at shift_point."""
    if seed is not None:
        random.seed(seed)
    result = []
    for i in range(n):
        if i < shift_point:
            result.append(random.gauss(mean1, std1))
        else:
            result.append(random.gauss(mean2, std2))
    return result


def gen_poisson(n: int, lam: float, seed: int | None = None) -> list[int]:
    """Generate n Poisson-distributed values using Knuth's algorithm."""
    if seed is not None:
        random.seed(seed)
    results = []
    for _ in range(n):
        L = math.exp(-lam)
        k = 0
        p = 1.0
        while True:
            k += 1
            p *= random.random()
            if p <= L:
                break
        results.append(k - 1)
    return results


def gen_binomial(n: int, trials: int, prob: float, seed: int | None = None) -> list[int]:
    """Generate n binomial-distributed values."""
    if seed is not None:
        random.seed(seed)
    return [sum(1 for _ in range(trials) if random.random() < prob) for _ in range(n)]


# ── Dummy server helper ─────────────────────────────────────────────────

def api_call(method: str, path: str, body: dict | None = None) -> tuple[bool, str]:
    """Make an HTTP request to the dummy server. Returns (success, response_or_error)."""
    url = f"{DUMMY_SERVER_URL}{path}"
    data = json.dumps(body).encode() if body else None
    headers = {"Content-Type": "application/json"} if body else {}
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return (True, resp.read().decode())
    except urllib.error.URLError as e:
        return (False, str(e))
    except Exception as e:
        return (False, str(e))


# ── Insert helpers ───────────────────────────────────────────────────────

def insert_plant(cur: sqlite3.Cursor, name: str, code: str, settings: dict | None = None) -> int:
    """Insert a plant row."""
    cur.execute(
        "INSERT INTO plant (name, code, is_active, settings, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)",
        (name, code, json.dumps(settings) if settings else None, utcnow(), utcnow()),
    )
    return cur.lastrowid


def insert_hierarchy(cur: sqlite3.Cursor, plant_id: int, name: str, htype: str,
                     parent_id: int | None = None) -> int:
    """Insert a hierarchy node."""
    cur.execute(
        "INSERT INTO hierarchy (plant_id, name, type, parent_id) VALUES (?, ?, ?, ?)",
        (plant_id, name, htype, parent_id),
    )
    return cur.lastrowid


def insert_user(cur: sqlite3.Cursor, username: str, password: str,
                email: str | None = None, full_name: str | None = None) -> int:
    """Insert a user with hashed password."""
    hashed = hash_password(password)
    now = utcnow()
    cur.execute(
        """INSERT INTO user
        (username, email, hashed_password, full_name, is_active, must_change_password,
         failed_login_count, created_at, updated_at)
        VALUES (?, ?, ?, ?, 1, 0, 0, ?, ?)""",
        (username, email, hashed, full_name, now, now),
    )
    return cur.lastrowid


def insert_role(cur: sqlite3.Cursor, user_id: int, plant_id: int, role: str) -> None:
    """Insert a user-plant-role assignment."""
    cur.execute(
        "INSERT INTO user_plant_role (user_id, plant_id, role, created_at) VALUES (?, ?, ?, ?)",
        (user_id, plant_id, role, utcnow()),
    )


def insert_char(cur: sqlite3.Cursor, hierarchy_id: int, name: str, **kwargs) -> int:
    """Insert a characteristic with sensible defaults and flexible kwargs."""
    defaults = {
        "description": None,
        "subgroup_size": 1,
        "target_value": None,
        "usl": None,
        "lsl": None,
        "ucl": None,
        "lcl": None,
        "subgroup_mode": "NOMINAL_TOLERANCE",
        "min_measurements": 1,
        "stored_sigma": None,
        "stored_center_line": None,
        "data_type": "variable",
        "attribute_chart_type": None,
        "default_sample_size": None,
        "chart_type": None,
        "cusum_target": None,
        "cusum_k": None,
        "cusum_h": None,
        "ewma_lambda": None,
        "ewma_l": None,
        "decimal_precision": 3,
        "distribution_method": None,
        "box_cox_lambda": None,
        "distribution_params": None,
        "use_laney_correction": 0,
        "short_run_mode": None,
    }
    defaults.update(kwargs)
    cur.execute(
        """INSERT INTO characteristic
        (hierarchy_id, name, description, subgroup_size, target_value, usl, lsl, ucl, lcl,
         subgroup_mode, min_measurements, stored_sigma, stored_center_line,
         data_type, attribute_chart_type, default_sample_size,
         chart_type, cusum_target, cusum_k, cusum_h, ewma_lambda, ewma_l,
         decimal_precision, distribution_method, box_cox_lambda, distribution_params,
         use_laney_correction, short_run_mode)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            hierarchy_id,
            name,
            defaults["description"],
            defaults["subgroup_size"],
            defaults["target_value"],
            defaults["usl"],
            defaults["lsl"],
            defaults["ucl"],
            defaults["lcl"],
            defaults["subgroup_mode"],
            defaults["min_measurements"],
            defaults["stored_sigma"],
            defaults["stored_center_line"],
            defaults["data_type"],
            defaults["attribute_chart_type"],
            defaults["default_sample_size"],
            defaults["chart_type"],
            defaults["cusum_target"],
            defaults["cusum_k"],
            defaults["cusum_h"],
            defaults["ewma_lambda"],
            defaults["ewma_l"],
            defaults["decimal_precision"],
            defaults["distribution_method"],
            defaults["box_cox_lambda"],
            defaults["distribution_params"],
            defaults["use_laney_correction"],
            defaults["short_run_mode"],
        ),
    )
    return cur.lastrowid


def insert_sample(cur: sqlite3.Cursor, char_id: int, ts: str,
                  values: list[float] | None = None, actual_n: int | None = None,
                  is_undersized: bool = False, batch: str | None = None,
                  operator: str | None = None, defect_count: int | None = None,
                  sample_size: int | None = None, units_inspected: int | None = None,
                  z_score: float | None = None, cusum_high: float | None = None,
                  cusum_low: float | None = None, ewma_value: float | None = None) -> int:
    """Insert a sample with optional measurement rows.

    For variable data, pass values=[...] and actual_n is set to len(values).
    For attribute data, pass values=None; actual_n defaults to 1.
    """
    if values is not None:
        n = actual_n if actual_n is not None else len(values)
    else:
        n = actual_n if actual_n is not None else 1

    cur.execute(
        """INSERT INTO sample
        (char_id, timestamp, actual_n, is_excluded, is_undersized, is_modified,
         batch_number, operator_id, defect_count, sample_size, units_inspected,
         z_score, cusum_high, cusum_low, ewma_value)
        VALUES (?, ?, ?, 0, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            char_id, ts, n, 1 if is_undersized else 0,
            batch, operator, defect_count, sample_size, units_inspected,
            z_score, cusum_high, cusum_low, ewma_value,
        ),
    )
    sample_id = cur.lastrowid

    if values is not None:
        for v in values:
            cur.execute(
                "INSERT INTO measurement (sample_id, value) VALUES (?, ?)",
                (sample_id, v),
            )

    return sample_id


def insert_violation(cur: sqlite3.Cursor, sample_id: int, char_id: int,
                     rule_id: int = 1, rule_name: str = "Beyond Control Limits",
                     severity: str = "CRITICAL", acknowledged: bool = False,
                     ack_user: str | None = None, ack_reason: str | None = None,
                     ack_ts: str | None = None) -> int:
    """Insert a violation record."""
    cur.execute(
        """INSERT INTO violation
        (sample_id, char_id, rule_id, rule_name, severity, acknowledged,
         requires_acknowledgement, ack_user, ack_reason, ack_timestamp, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)""",
        (
            sample_id, char_id, rule_id, rule_name, severity,
            1 if acknowledged else 0,
            ack_user, ack_reason, ack_ts, utcnow(),
        ),
    )
    return cur.lastrowid


def insert_annotation(cur: sqlite3.Cursor, char_id: int, atype: str, text: str,
                      color: str | None = None, sample_id: int | None = None,
                      start_sid: int | None = None, end_sid: int | None = None,
                      created_by: str | None = None) -> int:
    """Insert a chart annotation (point or period)."""
    now = utcnow()
    cur.execute(
        """INSERT INTO annotation
        (characteristic_id, annotation_type, text, color, sample_id,
         start_sample_id, end_sample_id, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (char_id, atype, text, color, sample_id, start_sid, end_sid, created_by, now, now),
    )
    return cur.lastrowid


def insert_capability(cur: sqlite3.Cursor, char_id: int, cp: float, cpk: float,
                      pp: float, ppk: float, cpm: float | None = None,
                      sample_count: int = 100, p_value: float | None = None,
                      calc_by: str = "system") -> int:
    """Insert a capability history snapshot."""
    cur.execute(
        """INSERT INTO capability_history
        (characteristic_id, cp, cpk, pp, ppk, cpm, sample_count,
         normality_p_value, normality_test, calculated_at, calculated_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            char_id, cp, cpk, pp, ppk, cpm, sample_count,
            p_value, "shapiro-wilk" if p_value is not None else None,
            utcnow(), calc_by,
        ),
    )
    return cur.lastrowid


def insert_nelson_rules(cur: sqlite3.Cursor, char_id: int,
                        rules: list[tuple[int, bool, bool]] | None = None,
                        preset_id: int | None = None,
                        params: dict[int, str] | None = None) -> None:
    """Insert Nelson rules for a characteristic.

    Default: rules 1-4 enabled with require_ack=True, 5-8 enabled with require_ack=False.
    If preset_id provided, updates the characteristic's rule_preset_id.
    If params provided (rule_id -> JSON string), sets parameters column.
    """
    if rules is None:
        rules = [
            (1, True, True),
            (2, True, True),
            (3, True, True),
            (4, True, True),
            (5, True, False),
            (6, True, False),
            (7, True, False),
            (8, True, False),
        ]

    for rule_id, is_enabled, require_ack in rules:
        param_json = None
        if params and rule_id in params:
            param_json = params[rule_id]
        cur.execute(
            """INSERT INTO characteristic_rules
            (char_id, rule_id, is_enabled, require_acknowledgement, parameters)
            VALUES (?, ?, ?, ?, ?)""",
            (char_id, rule_id, 1 if is_enabled else 0, 1 if require_ack else 0, param_json),
        )

    if preset_id is not None:
        # rule_preset_id is set on the characteristic if the table supports it
        # This is a best-effort update; the column may not exist in all schemas
        try:
            cur.execute(
                "UPDATE characteristic SET rule_preset_id = ? WHERE id = ?",
                (preset_id, char_id),
            )
        except sqlite3.OperationalError:
            pass  # Column doesn't exist in this schema version


# ── Foundation: Plants, Hierarchy, Users, Roles ─────────────────────────

def seed_foundation(cur: sqlite3.Cursor) -> None:
    """Create 3 plants, full hierarchies, 8 users, and role assignments."""

    # ── Plants ───────────────────────────────────────────────────────────
    IDS["det_plant"] = insert_plant(cur, "Precision Motors \u2014 Detroit", "DET")
    IDS["ict_plant"] = insert_plant(cur, "Titan Aerospace \u2014 Wichita", "ICT")
    IDS["rtp_plant"] = insert_plant(cur, "BioVerde Pharma \u2014 Research Triangle", "RTP")

    # ── Detroit hierarchy ────────────────────────────────────────────────
    # Machining Area
    IDS["det_machining"] = insert_hierarchy(cur, IDS["det_plant"], "Machining Area", "Area")
    IDS["det_cnc1"] = insert_hierarchy(cur, IDS["det_plant"], "CNC Line 1", "Line", IDS["det_machining"])
    IDS["det_lathe"] = insert_hierarchy(cur, IDS["det_plant"], "Lathe CNC-401", "Cell", IDS["det_cnc1"])
    IDS["det_mill"] = insert_hierarchy(cur, IDS["det_plant"], "Mill CNC-402", "Cell", IDS["det_cnc1"])
    IDS["det_cnc2"] = insert_hierarchy(cur, IDS["det_plant"], "CNC Line 2", "Line", IDS["det_machining"])
    IDS["det_grinder"] = insert_hierarchy(cur, IDS["det_plant"], "Grinder CNC-501", "Cell", IDS["det_cnc2"])
    IDS["det_inspection"] = insert_hierarchy(cur, IDS["det_plant"], "Inspection", "Line", IDS["det_machining"])
    IDS["det_cmm"] = insert_hierarchy(cur, IDS["det_plant"], "CMM Station", "Cell", IDS["det_inspection"])
    # Assembly Area
    IDS["det_assembly"] = insert_hierarchy(cur, IDS["det_plant"], "Assembly Area", "Area")
    IDS["det_torque"] = insert_hierarchy(cur, IDS["det_plant"], "Torque Station", "Cell", IDS["det_assembly"])
    IDS["det_solder"] = insert_hierarchy(cur, IDS["det_plant"], "Solder Line", "Cell", IDS["det_assembly"])
    IDS["det_final"] = insert_hierarchy(cur, IDS["det_plant"], "Final Test", "Cell", IDS["det_assembly"])
    # Paint Shop
    IDS["det_paint"] = insert_hierarchy(cur, IDS["det_plant"], "Paint Shop", "Area")
    IDS["det_spray"] = insert_hierarchy(cur, IDS["det_plant"], "Spray Booth", "Cell", IDS["det_paint"])
    IDS["det_curing"] = insert_hierarchy(cur, IDS["det_plant"], "Curing Oven", "Cell", IDS["det_paint"])

    # ── Wichita hierarchy ────────────────────────────────────────────────
    # Composite Fabrication
    IDS["ict_composite"] = insert_hierarchy(cur, IDS["ict_plant"], "Composite Fabrication", "Area")
    IDS["ict_layup"] = insert_hierarchy(cur, IDS["ict_plant"], "Layup Room", "Cell", IDS["ict_composite"])
    IDS["ict_autoclave"] = insert_hierarchy(cur, IDS["ict_plant"], "Autoclave", "Cell", IDS["ict_composite"])
    # Machining
    IDS["ict_machining"] = insert_hierarchy(cur, IDS["ict_plant"], "Machining", "Area")
    IDS["ict_5axis"] = insert_hierarchy(cur, IDS["ict_plant"], "5-Axis CNC", "Cell", IDS["ict_machining"])
    # Assembly
    IDS["ict_assembly"] = insert_hierarchy(cur, IDS["ict_plant"], "Assembly", "Area")
    IDS["ict_fastener"] = insert_hierarchy(cur, IDS["ict_plant"], "Fastener Station", "Cell", IDS["ict_assembly"])
    IDS["ict_bench"] = insert_hierarchy(cur, IDS["ict_plant"], "Torque Bench", "Cell", IDS["ict_assembly"])
    # NDT Lab
    IDS["ict_ndt"] = insert_hierarchy(cur, IDS["ict_plant"], "NDT Lab", "Area")
    IDS["ict_xray"] = insert_hierarchy(cur, IDS["ict_plant"], "X-Ray", "Cell", IDS["ict_ndt"])
    IDS["ict_ultrasonic"] = insert_hierarchy(cur, IDS["ict_plant"], "Ultrasonic", "Cell", IDS["ict_ndt"])

    # ── RTP hierarchy ────────────────────────────────────────────────────
    # API Manufacturing
    IDS["rtp_api"] = insert_hierarchy(cur, IDS["rtp_plant"], "API Manufacturing", "Area")
    IDS["rtp_reactor"] = insert_hierarchy(cur, IDS["rtp_plant"], "Reactor R-100", "Cell", IDS["rtp_api"])
    IDS["rtp_dryer"] = insert_hierarchy(cur, IDS["rtp_plant"], "Dryer D-200", "Cell", IDS["rtp_api"])
    # Formulation
    IDS["rtp_formulation"] = insert_hierarchy(cur, IDS["rtp_plant"], "Formulation", "Area")
    IDS["rtp_blender"] = insert_hierarchy(cur, IDS["rtp_plant"], "Blender B-300", "Cell", IDS["rtp_formulation"])
    IDS["rtp_tablet"] = insert_hierarchy(cur, IDS["rtp_plant"], "Tablet Press", "Cell", IDS["rtp_formulation"])
    # Packaging
    IDS["rtp_packaging"] = insert_hierarchy(cur, IDS["rtp_plant"], "Packaging", "Area")
    IDS["rtp_fill"] = insert_hierarchy(cur, IDS["rtp_plant"], "Fill Line", "Cell", IDS["rtp_packaging"])
    IDS["rtp_seal"] = insert_hierarchy(cur, IDS["rtp_plant"], "Seal Station", "Cell", IDS["rtp_packaging"])
    # QC Lab
    IDS["rtp_qc"] = insert_hierarchy(cur, IDS["rtp_plant"], "QC Lab", "Area")
    IDS["rtp_hplc"] = insert_hierarchy(cur, IDS["rtp_plant"], "HPLC", "Cell", IDS["rtp_qc"])
    IDS["rtp_dissolution"] = insert_hierarchy(cur, IDS["rtp_plant"], "Dissolution", "Cell", IDS["rtp_qc"])

    # ── Users ────────────────────────────────────────────────────────────
    IDS["admin"] = insert_user(cur, "admin", "demo123",
                               email="admin@cassini-demo.com", full_name="Sarah Chen")
    IDS["eng_det"] = insert_user(cur, "eng.detroit", "demo123",
                                  email="marcus@cassini-demo.com", full_name="Marcus Johnson")
    IDS["eng_ict"] = insert_user(cur, "eng.wichita", "demo123",
                                  email="priya@cassini-demo.com", full_name="Priya Patel")
    IDS["eng_rtp"] = insert_user(cur, "eng.pharma", "demo123",
                                  email="david@cassini-demo.com", full_name="David Kim")
    IDS["sup_det"] = insert_user(cur, "sup.detroit", "demo123",
                                  email="ana@cassini-demo.com", full_name="Ana Rodriguez")
    IDS["sup_rtp"] = insert_user(cur, "sup.pharma", "demo123",
                                  email="james@cassini-demo.com", full_name="James O'Brien")
    IDS["op_det"] = insert_user(cur, "op.floor1", "demo123",
                                 email="tyler@cassini-demo.com", full_name="Tyler Washington")
    IDS["op_ict"] = insert_user(cur, "op.floor2", "demo123",
                                 email="maria@cassini-demo.com", full_name="Maria Santos")

    # ── Role assignments ─────────────────────────────────────────────────
    # admin -> all 3 plants
    for plant_key in ("det_plant", "ict_plant", "rtp_plant"):
        insert_role(cur, IDS["admin"], IDS[plant_key], "admin")

    # Engineers
    insert_role(cur, IDS["eng_det"], IDS["det_plant"], "engineer")
    insert_role(cur, IDS["eng_ict"], IDS["ict_plant"], "engineer")
    insert_role(cur, IDS["eng_rtp"], IDS["rtp_plant"], "engineer")

    # Supervisors
    insert_role(cur, IDS["sup_det"], IDS["det_plant"], "supervisor")
    insert_role(cur, IDS["sup_det"], IDS["ict_plant"], "supervisor")
    insert_role(cur, IDS["sup_rtp"], IDS["rtp_plant"], "supervisor")

    # Operators
    insert_role(cur, IDS["op_det"], IDS["det_plant"], "operator")
    insert_role(cur, IDS["op_ict"], IDS["ict_plant"], "operator")
    insert_role(cur, IDS["op_ict"], IDS["rtp_plant"], "operator")

    # ── Password Policy: RTP (strict 21 CFR Part 11) ────────────────────
    cur.execute(
        """INSERT INTO password_policy
        (plant_id, password_expiry_days, max_failed_attempts, lockout_duration_minutes,
         min_password_length, require_uppercase, require_lowercase, require_digit,
         require_special, password_history_count, session_timeout_minutes,
         signature_timeout_minutes, updated_at)
        VALUES (?, 90, 5, 30, 12, 1, 1, 1, 1, 12, 480, 15, ?)""",
        (IDS["rtp_plant"], utcnow()),
    )


# ── Characteristics ──────────────────────────────────────────────────────

def seed_characteristics(cur: sqlite3.Cursor) -> None:
    """Create all 24 characteristics across 3 plants."""

    # ══════════════════════════════════════════════════════════════════════
    # DETROIT (9 characteristics)
    # ══════════════════════════════════════════════════════════════════════

    # 1. Crankshaft Bearing OD (X-bar R, n=5, NARRATIVE ARC)
    IDS["bearing_od"] = insert_char(cur, IDS["det_lathe"], "Crankshaft Bearing OD",
        subgroup_size=5, target_value=25.000, usl=25.050, lsl=24.950,
        ucl=25.030, lcl=24.970, stored_sigma=0.008, stored_center_line=25.000,
        decimal_precision=4)

    # 2. Surface Finish Ra (I-MR, Weibull distribution)
    IDS["surface_finish"] = insert_char(cur, IDS["det_mill"], "Surface Finish Ra",
        subgroup_size=1, target_value=1.200, usl=2.000, lsl=0.400,
        ucl=1.800, lcl=0.600, stored_sigma=0.300, stored_center_line=1.200,
        distribution_method="auto",
        distribution_params='{"type":"weibull","shape":2.5,"scale":1.2}',
        decimal_precision=3)

    # 3. Bore Diameter (X-bar S, n=8, short-run standardized)
    IDS["bore_dia"] = insert_char(cur, IDS["det_grinder"], "Bore Diameter",
        subgroup_size=8, target_value=50.000, usl=50.050, lsl=49.950,
        ucl=50.025, lcl=49.975, stored_sigma=0.010, stored_center_line=50.000,
        short_run_mode="standardized", decimal_precision=4)

    # 4. Pin Height (CUSUM)
    IDS["pin_height"] = insert_char(cur, IDS["det_cmm"], "Pin Height",
        subgroup_size=1, target_value=12.700, usl=12.800, lsl=12.600,
        stored_sigma=0.020, stored_center_line=12.700,
        chart_type="cusum", cusum_target=12.700, cusum_k=0.5, cusum_h=5.0,
        decimal_precision=4)

    # 5. Bolt Torque (EWMA)
    IDS["bolt_torque"] = insert_char(cur, IDS["det_torque"], "Bolt Torque",
        subgroup_size=1, target_value=45.0, usl=50.0, lsl=40.0,
        ucl=47.5, lcl=42.5, stored_sigma=1.5, stored_center_line=45.0,
        chart_type="ewma", ewma_lambda=0.2, ewma_l=3.0,
        decimal_precision=1)

    # 6. Solder Defects (p-chart, Laney p')
    IDS["solder_defects"] = insert_char(cur, IDS["det_solder"], "Solder Defects",
        data_type="attribute", attribute_chart_type="p", default_sample_size=100,
        use_laney_correction=1, decimal_precision=4)

    # 7. Electrical Pass/Fail (np-chart)
    IDS["electrical_pf"] = insert_char(cur, IDS["det_final"], "Electrical Pass/Fail",
        data_type="attribute", attribute_chart_type="np", default_sample_size=100,
        decimal_precision=0)

    # 8. Paint Defects per Panel (c-chart)
    IDS["paint_defects"] = insert_char(cur, IDS["det_spray"], "Paint Defects per Panel",
        data_type="attribute", attribute_chart_type="c", default_sample_size=1,
        decimal_precision=0)

    # 9. Blemishes per m^2 (u-chart)
    IDS["blemishes"] = insert_char(cur, IDS["det_curing"], "Blemishes per m\u00b2",
        data_type="attribute", attribute_chart_type="u", default_sample_size=10,
        decimal_precision=2)

    # ══════════════════════════════════════════════════════════════════════
    # WICHITA (7 characteristics)
    # ══════════════════════════════════════════════════════════════════════

    # 10. Ply Thickness (X-bar R, n=5, AIAG preset, variable subgroups)
    IDS["ply_thickness"] = insert_char(cur, IDS["ict_layup"], "Ply Thickness",
        subgroup_size=5, target_value=0.250, usl=0.270, lsl=0.230,
        ucl=0.260, lcl=0.240, stored_sigma=0.005, stored_center_line=0.250,
        decimal_precision=4)

    # 11. Cure Temperature (I-MR, NARRATIVE ARC - anomaly detection)
    IDS["cure_temp"] = insert_char(cur, IDS["ict_autoclave"], "Cure Temperature",
        subgroup_size=1, target_value=177.0, usl=180.0, lsl=174.0,
        ucl=178.5, lcl=175.5, stored_sigma=0.50, stored_center_line=177.0,
        decimal_precision=1)

    # 12. Turbine Blade Profile (X-bar S, n=8, Gamma distribution)
    IDS["blade_profile"] = insert_char(cur, IDS["ict_5axis"], "Turbine Blade Profile",
        subgroup_size=8, target_value=2.150, usl=2.300, lsl=2.000,
        ucl=2.250, lcl=2.050, stored_sigma=0.040, stored_center_line=2.150,
        distribution_method="auto",
        distribution_params='{"type":"gamma","shape":5,"scale":0.3}',
        decimal_precision=4)

    # 13. Rivet Grip Length (I-MR, short-run deviation mode)
    IDS["rivet_grip"] = insert_char(cur, IDS["ict_fastener"], "Rivet Grip Length",
        subgroup_size=1, target_value=6.350, usl=6.500, lsl=6.200,
        ucl=6.450, lcl=6.250, stored_sigma=0.030, stored_center_line=6.350,
        short_run_mode="deviation", decimal_precision=4)

    # 14. Fastener Torque (EWMA, Wheeler preset)
    IDS["fastener_torque"] = insert_char(cur, IDS["ict_bench"], "Fastener Torque",
        subgroup_size=1, target_value=25.0, usl=28.0, lsl=22.0,
        ucl=26.5, lcl=23.5, stored_sigma=0.80, stored_center_line=25.0,
        chart_type="ewma", ewma_lambda=0.2, ewma_l=3.0,
        decimal_precision=1)

    # 15. Void Percentage (p-chart)
    IDS["void_pct"] = insert_char(cur, IDS["ict_xray"], "Void Percentage",
        data_type="attribute", attribute_chart_type="p", default_sample_size=50,
        decimal_precision=4)

    # 16. Delamination Count (c-chart)
    IDS["delam_count"] = insert_char(cur, IDS["ict_ultrasonic"], "Delamination Count",
        data_type="attribute", attribute_chart_type="c", default_sample_size=1,
        decimal_precision=0)

    # ══════════════════════════════════════════════════════════════════════
    # RTP (8 characteristics)
    # ══════════════════════════════════════════════════════════════════════

    # 17. Active Ingredient Concentration (X-bar R, n=5, Lognormal)
    IDS["api_conc"] = insert_char(cur, IDS["rtp_reactor"], "Active Ingredient Concentration",
        subgroup_size=5, target_value=99.50, usl=101.0, lsl=98.0,
        ucl=100.50, lcl=98.50, stored_sigma=0.40, stored_center_line=99.50,
        distribution_method="auto",
        distribution_params='{"type":"lognormal","mu":4.6,"sigma":0.05}',
        decimal_precision=2)

    # 18. Moisture Content % (I-MR)
    IDS["moisture"] = insert_char(cur, IDS["rtp_dryer"], "Moisture Content %",
        subgroup_size=1, target_value=2.50, usl=3.50, lsl=1.50,
        ucl=3.00, lcl=2.00, stored_sigma=0.25, stored_center_line=2.50,
        decimal_precision=2)

    # 19. Blend Uniformity (X-bar S, n=8, custom rule preset)
    IDS["blend_unif"] = insert_char(cur, IDS["rtp_blender"], "Blend Uniformity",
        subgroup_size=8, target_value=98.0, usl=102.0, lsl=94.0,
        ucl=100.5, lcl=95.5, stored_sigma=1.20, stored_center_line=98.0,
        decimal_precision=1)

    # 20. Tablet Weight (I-MR, NARRATIVE ARC - signature workflow)
    IDS["tablet_weight"] = insert_char(cur, IDS["rtp_tablet"], "Tablet Weight",
        subgroup_size=1, target_value=200.0, usl=205.0, lsl=195.0,
        ucl=202.5, lcl=197.5, stored_sigma=1.00, stored_center_line=200.0,
        decimal_precision=1)

    # 21. Fill Volume (CUSUM, tight pharma tolerances)
    IDS["fill_volume"] = insert_char(cur, IDS["rtp_fill"], "Fill Volume",
        subgroup_size=1, target_value=5.000, usl=5.100, lsl=4.900,
        stored_sigma=0.015, stored_center_line=5.000,
        chart_type="cusum", cusum_target=5.000, cusum_k=0.5, cusum_h=4.0,
        decimal_precision=3)

    # 22. Seal Failures (p-chart)
    IDS["seal_failures"] = insert_char(cur, IDS["rtp_seal"], "Seal Failures",
        data_type="attribute", attribute_chart_type="p", default_sample_size=200,
        decimal_precision=4)

    # 23. Assay % (I-MR, Exponential distribution)
    IDS["assay_pct"] = insert_char(cur, IDS["rtp_hplc"], "Assay %",
        subgroup_size=1, target_value=99.5, usl=101.0, lsl=98.0,
        ucl=100.5, lcl=98.5, stored_sigma=0.40, stored_center_line=99.5,
        distribution_method="auto",
        distribution_params='{"type":"exponential","lambda":0.02}',
        decimal_precision=2)

    # 24. Dissolution Rate (EWMA)
    IDS["dissolution"] = insert_char(cur, IDS["rtp_dissolution"], "Dissolution Rate",
        subgroup_size=1, target_value=85.0, usl=95.0, lsl=75.0,
        ucl=90.0, lcl=80.0, stored_sigma=2.50, stored_center_line=85.0,
        chart_type="ewma", ewma_lambda=0.2, ewma_l=3.0,
        decimal_precision=1)

    # ── Nelson rules for all 24 characteristics ──────────────────────────
    all_char_keys = [
        # Detroit (9)
        "bearing_od", "surface_finish", "bore_dia", "pin_height", "bolt_torque",
        "solder_defects", "electrical_pf", "paint_defects", "blemishes",
        # Wichita (7)
        "ply_thickness", "cure_temp", "blade_profile", "rivet_grip", "fastener_torque",
        "void_pct", "delam_count",
        # RTP (8)
        "api_conc", "moisture", "blend_unif", "tablet_weight", "fill_volume",
        "seal_failures", "assay_pct", "dissolution",
    ]
    for char_key in all_char_keys:
        insert_nelson_rules(cur, IDS[char_key])


# ── Main ─────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Seed Cassini showcase database")
    parser.add_argument("--db-path", default=str(DB_PATH))
    parser.add_argument("--dry-run", action="store_true", help="Test imports and generators only")
    parser.add_argument("--force", action="store_true", help="Overwrite existing DB")
    parser.add_argument("--skip-dummy-server", action="store_true")
    args = parser.parse_args()

    if args.dry_run:
        print("=== Dry Run -- Testing imports and generators ===")
        print(f"Password hash OK: {len(hash_password('test')) > 0}")
        print(f"gen_normal(5): {gen_normal(5, 10, 1)}")
        print(f"gen_weibull(5): {gen_weibull(5, 2.5, 1.2)}")
        print(f"gen_gamma(5): {gen_gamma(5, 5, 0.3)}")
        print(f"gen_lognormal(5): {gen_lognormal(5, 4.6, 0.05)}")
        print(f"gen_exponential(5): {gen_exponential(5, 0.02)}")
        print(f"gen_drift(5): {gen_drift(5, 10, 1, 0.1)}")
        print(f"gen_shift(10): {gen_shift(10, 10, 1, 5, 12, 1)}")
        print(f"gen_poisson(5): {gen_poisson(5, 4)}")
        print(f"gen_binomial(5): {gen_binomial(5, 100, 0.03)}")
        print("=== All generators OK ===")
        return

    db_path = args.db_path
    if os.path.exists(db_path):
        if not args.force:
            print(f"ERROR: {db_path} already exists. Use --force to overwrite.")
            sys.exit(1)
        os.remove(db_path)

    # Run alembic migrations to create schema
    print("Running Alembic migrations...")
    os.environ["CASSINI_DATABASE_URL"] = f"sqlite:///{os.path.abspath(db_path)}"
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=str(backend_dir),
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        print(f"Alembic failed:\n{result.stderr}")
        sys.exit(1)
    print("Migrations complete.")

    # Seed data
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute("PRAGMA journal_mode=WAL")
    cur.execute("PRAGMA synchronous=NORMAL")
    cur.execute("PRAGMA foreign_keys=ON")

    print("Seeding foundation (plants, hierarchy, users)...")
    seed_foundation(cur)
    print("Seeding characteristics...")
    seed_characteristics(cur)

    conn.commit()

    # Print summary
    tables = ["plant", "hierarchy", "user", "user_plant_role", "characteristic", "characteristic_rules"]
    for t in tables:
        cur.execute(f"SELECT COUNT(*) FROM {t}")
        print(f"  {t}: {cur.fetchone()[0]}")

    conn.close()
    print(f"\nShowcase DB created: {db_path}")
    print("Login with any user / password: demo123")


if __name__ == "__main__":
    main()
