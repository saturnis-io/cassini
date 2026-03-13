"""Seed Cassini showcase database with rich demo data.

Creates 3 industry-themed plants (automotive, aerospace, pharma) with full
ISA-95 hierarchies, 8 users across 4 role levels, and 36 characteristics
covering every chart type, distribution, and SPC feature. Equipment nodes
have multiple sibling characteristics for realistic multi-measurement setups.

Uses raw sqlite3 for speed (same pattern as seed_e2e.py).

Usage:
    python scripts/seed_showcase.py --dry-run        # Test generators only
    python scripts/seed_showcase.py --force           # Create showcase.db
    python scripts/seed_showcase.py --db-path foo.db  # Custom path
"""

import argparse
import hashlib
import json
import logging
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

from dataclasses import asdict

from cassini.core.auth.passwords import hash_password
from cassini.core.msa.engine import GageRREngine
from cassini.core.msa.attribute_msa import AttributeMSAEngine

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


def make_timestamps(n: int, span_days: int = 90) -> list[str]:
    """Generate n timestamps spread over span_days, backdated from BASE_TIME."""
    interval = (span_days * 24 * 60) / n  # minutes between samples
    return [ts_offset(BASE_TIME, minutes=-(span_days * 24 * 60) + int(i * interval)) for i in range(n)]


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


def gen_correlated_pairs(
    n: int, mean1: float, std1: float, mean2: float, std2: float, correlation: float,
) -> tuple[list[float], list[float]]:
    """Generate n bivariate correlated normal samples via Cholesky decomposition."""
    z1 = [random.gauss(0, 1) for _ in range(n)]
    z2 = [random.gauss(0, 1) for _ in range(n)]
    x = [mean1 + std1 * z for z in z1]
    rho_comp = math.sqrt(1 - correlation ** 2)
    y = [mean2 + std2 * (correlation * z1[i] + rho_comp * z2[i]) for i in range(n)]
    return x, y


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
    IDS["admin"] = insert_user(cur, "admin", "password",
                               email="admin@cassini-demo.com", full_name="Sarah Chen")
    IDS["eng_det"] = insert_user(cur, "eng.detroit", "password",
                                  email="marcus@cassini-demo.com", full_name="Marcus Johnson")
    IDS["eng_ict"] = insert_user(cur, "eng.wichita", "password",
                                  email="priya@cassini-demo.com", full_name="Priya Patel")
    IDS["eng_rtp"] = insert_user(cur, "eng.pharma", "password",
                                  email="david@cassini-demo.com", full_name="David Kim")
    IDS["sup_det"] = insert_user(cur, "sup.detroit", "password",
                                  email="ana@cassini-demo.com", full_name="Ana Rodriguez")
    IDS["sup_rtp"] = insert_user(cur, "sup.pharma", "password",
                                  email="james@cassini-demo.com", full_name="James O'Brien")
    IDS["op_det"] = insert_user(cur, "op.floor1", "password",
                                 email="tyler@cassini-demo.com", full_name="Tyler Washington")
    IDS["op_ict"] = insert_user(cur, "op.floor2", "password",
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
    """Create all 36 characteristics across 3 plants.

    Many equipment nodes have multiple characteristics (siblings) to reflect
    real-world manufacturing where a single machine measures several dimensions.
    """

    # ══════════════════════════════════════════════════════════════════════
    # DETROIT (13 characteristics)
    # ══════════════════════════════════════════════════════════════════════

    # 1. Crankshaft Bearing OD (X-bar R, n=5, NARRATIVE ARC)
    IDS["bearing_od"] = insert_char(cur, IDS["det_lathe"], "Crankshaft Bearing OD",
        subgroup_size=5, target_value=25.000, usl=25.050, lsl=24.950,
        ucl=25.030, lcl=24.970, stored_sigma=0.008, stored_center_line=25.000,
        decimal_precision=4)

    # 1b. Bearing Width (X-bar R, n=5, sibling to Bearing OD)
    IDS["bearing_width"] = insert_char(cur, IDS["det_lathe"], "Bearing Width",
        subgroup_size=5, target_value=18.000, usl=18.030, lsl=17.970,
        ucl=18.018, lcl=17.982, stored_sigma=0.006, stored_center_line=18.000,
        decimal_precision=4)

    # 2. Surface Finish Ra (I-MR, Weibull distribution)
    IDS["surface_finish"] = insert_char(cur, IDS["det_mill"], "Surface Finish Ra",
        subgroup_size=1, target_value=1.200, usl=2.000, lsl=0.400,
        ucl=1.800, lcl=0.600, stored_sigma=0.300, stored_center_line=1.200,
        distribution_method="auto",
        distribution_params='{"type":"weibull","shape":2.5,"scale":1.2}',
        decimal_precision=3)

    # 2b. Flatness (I-MR, sibling to Surface Finish on same mill)
    IDS["flatness"] = insert_char(cur, IDS["det_mill"], "Flatness",
        subgroup_size=1, target_value=0.015, usl=0.030, lsl=0.000,
        ucl=0.025, lcl=0.005, stored_sigma=0.004, stored_center_line=0.015,
        decimal_precision=4)

    # 3. Bore Diameter (X-bar S, n=8, short-run standardized)
    IDS["bore_dia"] = insert_char(cur, IDS["det_grinder"], "Bore Diameter",
        subgroup_size=8, target_value=50.000, usl=50.050, lsl=49.950,
        ucl=50.025, lcl=49.975, stored_sigma=0.010, stored_center_line=50.000,
        short_run_mode="standardized", decimal_precision=4)

    # 3b. Bore Roundness (I-MR, sibling to Bore Diameter on same grinder)
    IDS["bore_roundness"] = insert_char(cur, IDS["det_grinder"], "Bore Roundness",
        subgroup_size=1, target_value=0.005, usl=0.012, lsl=0.000,
        ucl=0.010, lcl=0.000, stored_sigma=0.002, stored_center_line=0.005,
        decimal_precision=4)

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

    # 8b. Film Thickness (X-bar R, n=3, sibling to Paint Defects on same booth)
    IDS["film_thickness"] = insert_char(cur, IDS["det_spray"], "Film Thickness",
        subgroup_size=3, target_value=75.0, usl=90.0, lsl=60.0,
        ucl=82.0, lcl=68.0, stored_sigma=3.5, stored_center_line=75.0,
        decimal_precision=1)

    # 9. Blemishes per m^2 (u-chart)
    IDS["blemishes"] = insert_char(cur, IDS["det_curing"], "Blemishes per m\u00b2",
        data_type="attribute", attribute_chart_type="u", default_sample_size=10,
        decimal_precision=2)

    # ══════════════════════════════════════════════════════════════════════
    # WICHITA (11 characteristics)
    # ══════════════════════════════════════════════════════════════════════

    # 10. Ply Thickness (X-bar R, n=5, AIAG preset, variable subgroups)
    IDS["ply_thickness"] = insert_char(cur, IDS["ict_layup"], "Ply Thickness",
        subgroup_size=5, target_value=0.250, usl=0.270, lsl=0.230,
        ucl=0.260, lcl=0.240, stored_sigma=0.005, stored_center_line=0.250,
        decimal_precision=4)

    # 10b. Fiber Volume Fraction (I-MR, sibling to Ply Thickness in Layup Room)
    IDS["fiber_volume"] = insert_char(cur, IDS["ict_layup"], "Fiber Volume Fraction",
        subgroup_size=1, target_value=60.0, usl=65.0, lsl=55.0,
        ucl=63.0, lcl=57.0, stored_sigma=1.5, stored_center_line=60.0,
        decimal_precision=1)

    # 11. Cure Temperature (I-MR, NARRATIVE ARC - anomaly detection)
    IDS["cure_temp"] = insert_char(cur, IDS["ict_autoclave"], "Cure Temperature",
        subgroup_size=1, target_value=177.0, usl=180.0, lsl=174.0,
        ucl=178.5, lcl=175.5, stored_sigma=0.50, stored_center_line=177.0,
        decimal_precision=1)

    # 11b. Cure Pressure (I-MR, sibling to Cure Temperature in Autoclave)
    IDS["cure_pressure"] = insert_char(cur, IDS["ict_autoclave"], "Cure Pressure",
        subgroup_size=1, target_value=85.0, usl=90.0, lsl=80.0,
        ucl=88.0, lcl=82.0, stored_sigma=1.2, stored_center_line=85.0,
        decimal_precision=1)

    # 12. Turbine Blade Profile (X-bar S, n=8, Gamma distribution)
    IDS["blade_profile"] = insert_char(cur, IDS["ict_5axis"], "Turbine Blade Profile",
        subgroup_size=8, target_value=2.150, usl=2.300, lsl=2.000,
        ucl=2.250, lcl=2.050, stored_sigma=0.040, stored_center_line=2.150,
        distribution_method="auto",
        distribution_params='{"type":"gamma","shape":5,"scale":0.3}',
        decimal_precision=4)

    # 12b. Chord Length (X-bar R, n=5, sibling to Blade Profile on same CNC)
    IDS["chord_length"] = insert_char(cur, IDS["ict_5axis"], "Chord Length",
        subgroup_size=5, target_value=42.50, usl=42.80, lsl=42.20,
        ucl=42.70, lcl=42.30, stored_sigma=0.08, stored_center_line=42.50,
        decimal_precision=3)

    # 13. Rivet Grip Length (I-MR, short-run deviation mode)
    IDS["rivet_grip"] = insert_char(cur, IDS["ict_fastener"], "Rivet Grip Length",
        subgroup_size=1, target_value=6.350, usl=6.500, lsl=6.200,
        ucl=6.450, lcl=6.250, stored_sigma=0.030, stored_center_line=6.350,
        short_run_mode="deviation", decimal_precision=4)

    # 13b. Hole Diameter (I-MR, sibling to Rivet Grip at Fastener Station)
    IDS["hole_diameter"] = insert_char(cur, IDS["ict_fastener"], "Hole Diameter",
        subgroup_size=1, target_value=4.826, usl=4.876, lsl=4.776,
        ucl=4.860, lcl=4.792, stored_sigma=0.012, stored_center_line=4.826,
        decimal_precision=4)

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
    # RTP (12 characteristics)
    # ══════════════════════════════════════════════════════════════════════

    # 17. Active Ingredient Concentration (X-bar R, n=5, Lognormal)
    IDS["api_conc"] = insert_char(cur, IDS["rtp_reactor"], "Active Ingredient Concentration",
        subgroup_size=5, target_value=99.50, usl=101.0, lsl=98.0,
        ucl=100.50, lcl=98.50, stored_sigma=0.40, stored_center_line=99.50,
        distribution_method="auto",
        distribution_params='{"type":"lognormal","mu":4.6,"sigma":0.05}',
        decimal_precision=2)

    # 17b. Reaction pH (I-MR, sibling to API Concentration in Reactor)
    IDS["reaction_ph"] = insert_char(cur, IDS["rtp_reactor"], "Reaction pH",
        subgroup_size=1, target_value=7.40, usl=7.80, lsl=7.00,
        ucl=7.65, lcl=7.15, stored_sigma=0.10, stored_center_line=7.40,
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

    # 20b. Tablet Hardness (I-MR, sibling to Tablet Weight on same press)
    IDS["tablet_hardness"] = insert_char(cur, IDS["rtp_tablet"], "Tablet Hardness",
        subgroup_size=1, target_value=8.0, usl=12.0, lsl=4.0,
        ucl=10.5, lcl=5.5, stored_sigma=1.20, stored_center_line=8.0,
        decimal_precision=1)

    # 20c. Tablet Thickness (I-MR, sibling to Tablet Weight on same press)
    IDS["tablet_thickness"] = insert_char(cur, IDS["rtp_tablet"], "Tablet Thickness",
        subgroup_size=1, target_value=4.00, usl=4.20, lsl=3.80,
        ucl=4.12, lcl=3.88, stored_sigma=0.05, stored_center_line=4.00,
        decimal_precision=3)

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

    # 23b. Impurity Level (I-MR, sibling to Assay % on same HPLC)
    IDS["impurity_level"] = insert_char(cur, IDS["rtp_hplc"], "Impurity Level",
        subgroup_size=1, target_value=0.10, usl=0.50, lsl=0.00,
        ucl=0.35, lcl=0.00, stored_sigma=0.08, stored_center_line=0.10,
        decimal_precision=3)

    # 24. Dissolution Rate (EWMA)
    IDS["dissolution"] = insert_char(cur, IDS["rtp_dissolution"], "Dissolution Rate",
        subgroup_size=1, target_value=85.0, usl=95.0, lsl=75.0,
        ucl=90.0, lcl=80.0, stored_sigma=2.50, stored_center_line=85.0,
        chart_type="ewma", ewma_lambda=0.2, ewma_l=3.0,
        decimal_precision=1)

    # ── Nelson rules for all 24 characteristics ──────────────────────────
    all_char_keys = [
        # Detroit (13)
        "bearing_od", "bearing_width", "surface_finish", "flatness",
        "bore_dia", "bore_roundness", "pin_height", "bolt_torque",
        "solder_defects", "electrical_pf", "paint_defects", "film_thickness", "blemishes",
        # Wichita (11)
        "ply_thickness", "fiber_volume", "cure_temp", "cure_pressure",
        "blade_profile", "chord_length", "rivet_grip", "hole_diameter",
        "fastener_torque", "void_pct", "delam_count",
        # RTP (12)
        "api_conc", "reaction_ph", "moisture", "blend_unif",
        "tablet_weight", "tablet_hardness", "tablet_thickness",
        "fill_volume", "seal_failures", "assay_pct", "impurity_level", "dissolution",
    ]
    for char_key in all_char_keys:
        insert_nelson_rules(cur, IDS[char_key])


# ── Wave 2: Rules, Samples, Narratives ────────────────────────────────────

def seed_rules(cur: sqlite3.Cursor) -> None:
    """Create custom rule preset and assign preset-specific rules to characteristics."""
    # Check existing built-in presets
    cur.execute("SELECT id, name FROM rule_preset WHERE is_builtin = 1")
    presets = {row[1]: row[0] for row in cur.fetchall()}

    # Create custom pharma preset
    pharma_rules = json.dumps({
        "rules": [
            {"rule_id": 1, "is_enabled": True, "require_acknowledgement": True,
             "parameters": {"sigma_multiplier": 2.5}},
            {"rule_id": 2, "is_enabled": True, "require_acknowledgement": True,
             "parameters": {"consecutive_count": 7}},
            {"rule_id": 3, "is_enabled": True, "require_acknowledgement": True},
            {"rule_id": 4, "is_enabled": True, "require_acknowledgement": True},
        ]
    })
    cur.execute(
        """INSERT INTO rule_preset (name, description, is_builtin, rules_config, created_at, plant_id)
        VALUES (?, ?, 0, ?, ?, ?)""",
        ("BioVerde Pharma QC", "Custom pharma rules — tighter limits for 21 CFR Part 11",
         pharma_rules, utcnow(), IDS["rtp_plant"]))

    # Update characteristic rules for specific presets:
    # Ply Thickness -> AIAG preset (rules 1-6 enabled)
    if "AIAG" in presets:
        cur.execute("DELETE FROM characteristic_rules WHERE char_id = ?", (IDS["ply_thickness"],))
        for rule_id in range(1, 9):
            is_enabled = rule_id <= 6  # AIAG enables rules 1-6
            cur.execute(
                """INSERT INTO characteristic_rules (char_id, rule_id, is_enabled, require_acknowledgement)
                VALUES (?, ?, ?, ?)""",
                (IDS["ply_thickness"], rule_id, 1 if is_enabled else 0, 1 if rule_id <= 4 else 0))

    # Fastener Torque -> Wheeler preset (rules 1-4 only, conservative)
    if "Wheeler" in presets:
        cur.execute("DELETE FROM characteristic_rules WHERE char_id = ?", (IDS["fastener_torque"],))
        for rule_id in range(1, 9):
            is_enabled = rule_id <= 4  # Wheeler only enables rules 1-4
            cur.execute(
                """INSERT INTO characteristic_rules (char_id, rule_id, is_enabled, require_acknowledgement)
                VALUES (?, ?, ?, ?)""",
                (IDS["fastener_torque"], rule_id, 1 if is_enabled else 0, 1 if is_enabled else 0))

    # Blend Uniformity -> custom pharma preset (tighter rule 1 and 2)
    cur.execute("DELETE FROM characteristic_rules WHERE char_id = ?", (IDS["blend_unif"],))
    cur.execute(
        """INSERT INTO characteristic_rules (char_id, rule_id, is_enabled, require_acknowledgement, parameters)
        VALUES (?, 1, 1, 1, ?)""",
        (IDS["blend_unif"], json.dumps({"sigma_multiplier": 2.5})))
    cur.execute(
        """INSERT INTO characteristic_rules (char_id, rule_id, is_enabled, require_acknowledgement, parameters)
        VALUES (?, 2, 1, 1, ?)""",
        (IDS["blend_unif"], json.dumps({"consecutive_count": 7})))
    for rule_id in range(3, 9):
        cur.execute(
            """INSERT INTO characteristic_rules (char_id, rule_id, is_enabled, require_acknowledgement)
            VALUES (?, ?, ?, ?)""",
            (IDS["blend_unif"], rule_id, 1 if rule_id <= 4 else 0, 1 if rule_id <= 4 else 0))


def seed_variable_samples(cur: sqlite3.Cursor) -> None:
    """Generate ~500 samples for each non-narrative variable characteristic."""

    # ── Surface Finish Ra (I-MR, Weibull shape=2.5, scale=1.2) ────────
    timestamps = make_timestamps(500, span_days=90)
    values_all = gen_weibull(500, shape=2.5, scale=1.2)
    for i in range(500):
        insert_sample(cur, IDS["surface_finish"], timestamps[i], values=[values_all[i]])

    # ── Bearing Width (X-bar R, n=5, sibling to Bearing OD) ─────────
    timestamps = make_timestamps(500, span_days=90)
    for i in range(500):
        values = gen_normal(5, 18.000, 0.005)
        insert_sample(cur, IDS["bearing_width"], timestamps[i], values=values)

    # ── Flatness (I-MR, sibling to Surface Finish) ────────────────────
    timestamps = make_timestamps(500, span_days=90)
    raw_vals = gen_normal(500, 0.015, 0.003)
    for i in range(500):
        val = max(0.0, raw_vals[i])  # flatness can't be negative
        insert_sample(cur, IDS["flatness"], timestamps[i], values=[val])

    # ── Bore Diameter (X-bar S, n=8, short-run standardized) ──────────
    timestamps = make_timestamps(500, span_days=90)
    targets = [49.990, 50.000, 50.010]
    sigma = 0.010
    n_sub = 8
    for i in range(500):
        target = targets[i % 3]
        values = gen_normal(n_sub, target, sigma / 2)
        mean_val = sum(values) / n_sub
        z = (mean_val - 50.000) / (sigma / math.sqrt(n_sub))
        insert_sample(cur, IDS["bore_dia"], timestamps[i], values=values, z_score=z)

    # ── Bore Roundness (I-MR, sibling to Bore Diameter) ─────────────
    timestamps = make_timestamps(500, span_days=90)
    raw_vals = gen_normal(500, 0.005, 0.0015)
    for i in range(500):
        val = max(0.0, raw_vals[i])  # roundness can't be negative
        insert_sample(cur, IDS["bore_roundness"], timestamps[i], values=[val])

    # ── Pin Height (CUSUM, small shift at sample 300) ─────────────────
    timestamps = make_timestamps(500, span_days=90)
    vals_phase1 = gen_normal(300, 12.700, 0.015)
    vals_phase2 = gen_normal(200, 12.710, 0.015)
    all_vals = vals_phase1 + vals_phase2
    target = 12.700
    k = 0.5 * 0.020  # 0.5 * sigma = 0.010
    cusum_h = 0.0
    cusum_l = 0.0
    for i in range(500):
        cusum_h = max(0.0, cusum_h + (all_vals[i] - target) - k)
        cusum_l = min(0.0, cusum_l + (all_vals[i] - target) + k)
        insert_sample(cur, IDS["pin_height"], timestamps[i], values=[all_vals[i]],
                      cusum_high=cusum_h, cusum_low=cusum_l)

    # ── Bolt Torque (EWMA, gradual trend) ─────────────────────────────
    timestamps = make_timestamps(500, span_days=90)
    raw_vals = gen_drift(500, 45.0, 1.2, 0.003)
    ewma = 45.0
    lam = 0.2
    for i in range(500):
        ewma = lam * raw_vals[i] + (1 - lam) * ewma
        insert_sample(cur, IDS["bolt_torque"], timestamps[i], values=[raw_vals[i]],
                      ewma_value=ewma)

    # ── Ply Thickness (X-bar R, n=5, variable subgroups) ──────────────
    timestamps = make_timestamps(500, span_days=90)
    undersized_indices = set(random.sample(range(500), 50))
    for i in range(500):
        if i in undersized_indices:
            actual_n = random.choice([3, 4])
            values = gen_normal(actual_n, 0.250, 0.004)
            insert_sample(cur, IDS["ply_thickness"], timestamps[i], values=values,
                          actual_n=actual_n, is_undersized=True)
        else:
            values = gen_normal(5, 0.250, 0.004)
            insert_sample(cur, IDS["ply_thickness"], timestamps[i], values=values)

    # ── Film Thickness (X-bar R, n=3, sibling to Paint Defects) ─────
    timestamps = make_timestamps(500, span_days=90)
    for i in range(500):
        values = gen_normal(3, 75.0, 2.8)
        insert_sample(cur, IDS["film_thickness"], timestamps[i], values=values)

    # ── Fiber Volume Fraction (I-MR, sibling to Ply Thickness) ────────
    timestamps = make_timestamps(500, span_days=90)
    raw_vals = gen_normal(500, 60.0, 1.2)
    for i in range(500):
        insert_sample(cur, IDS["fiber_volume"], timestamps[i], values=[raw_vals[i]])

    # ── Cure Pressure (I-MR, sibling to Cure Temperature) ─────────────
    timestamps = make_timestamps(500, span_days=90)
    raw_vals = gen_normal(500, 85.0, 0.9)
    for i in range(500):
        insert_sample(cur, IDS["cure_pressure"], timestamps[i], values=[raw_vals[i]])

    # ── Turbine Blade Profile (X-bar S, n=8, Gamma-ish) ──────────────
    timestamps = make_timestamps(500, span_days=90)
    for i in range(500):
        values = [2.150 + (random.gammavariate(5, 0.04) - 0.20) for _ in range(8)]
        insert_sample(cur, IDS["blade_profile"], timestamps[i], values=values)

    # ── Chord Length (X-bar R, n=5, sibling to Blade Profile) ──────────
    timestamps = make_timestamps(500, span_days=90)
    for i in range(500):
        values = gen_normal(5, 42.50, 0.06)
        insert_sample(cur, IDS["chord_length"], timestamps[i], values=values)

    # ── Rivet Grip Length (I-MR, deviation mode, multi-target) ────────
    timestamps = make_timestamps(500, span_days=90)
    rivet_targets = [6.200, 6.350, 6.500]
    per_target = 500 // 3
    for i in range(500):
        if i < per_target:
            t = rivet_targets[0]
        elif i < 2 * per_target:
            t = rivet_targets[1]
        else:
            t = rivet_targets[2]
        val = random.gauss(t, 0.025)
        insert_sample(cur, IDS["rivet_grip"], timestamps[i], values=[val])

    # ── Hole Diameter (I-MR, sibling to Rivet Grip) ────────────────────
    timestamps = make_timestamps(500, span_days=90)
    raw_vals = gen_normal(500, 4.826, 0.010)
    for i in range(500):
        insert_sample(cur, IDS["hole_diameter"], timestamps[i], values=[raw_vals[i]])

    # ── Fastener Torque (EWMA, Wheeler, stable) ──────────────────────
    timestamps = make_timestamps(500, span_days=90)
    raw_vals = gen_normal(500, 25.0, 0.6)
    ewma = 25.0
    lam = 0.2
    for i in range(500):
        ewma = lam * raw_vals[i] + (1 - lam) * ewma
        insert_sample(cur, IDS["fastener_torque"], timestamps[i], values=[raw_vals[i]],
                      ewma_value=ewma)

    # ── API Concentration (X-bar R, n=5, lognormal) ──────────────────
    timestamps = make_timestamps(500, span_days=90)
    for i in range(500):
        values = gen_lognormal(5, mu=4.6, sigma=0.05)
        insert_sample(cur, IDS["api_conc"], timestamps[i], values=values)

    # ── Reaction pH (I-MR, sibling to API Concentration) ───────────────
    timestamps = make_timestamps(500, span_days=90)
    raw_vals = gen_normal(500, 7.40, 0.08)
    for i in range(500):
        insert_sample(cur, IDS["reaction_ph"], timestamps[i], values=[raw_vals[i]])

    # ── Moisture Content (I-MR, normal) ──────────────────────────────
    timestamps = make_timestamps(500, span_days=90)
    raw_vals = gen_normal(500, 2.50, 0.20)
    for i in range(500):
        insert_sample(cur, IDS["moisture"], timestamps[i], values=[raw_vals[i]])

    # ── Blend Uniformity (X-bar S, n=8, normal) ─────────────────────
    timestamps = make_timestamps(500, span_days=90)
    all_vals = gen_normal(500 * 8, 98.0, 1.0)
    for i in range(500):
        subgroup = all_vals[i * 8:(i + 1) * 8]
        insert_sample(cur, IDS["blend_unif"], timestamps[i], values=subgroup)

    # ── Tablet Hardness (I-MR, sibling to Tablet Weight) ───────────────
    timestamps = make_timestamps(500, span_days=90)
    raw_vals = gen_normal(500, 8.0, 0.9)
    for i in range(500):
        insert_sample(cur, IDS["tablet_hardness"], timestamps[i], values=[raw_vals[i]])

    # ── Tablet Thickness (I-MR, sibling to Tablet Weight) ────────────
    timestamps = make_timestamps(500, span_days=90)
    raw_vals = gen_normal(500, 4.00, 0.04)
    for i in range(500):
        insert_sample(cur, IDS["tablet_thickness"], timestamps[i], values=[raw_vals[i]])

    # ── Fill Volume (CUSUM, tight pharma) ────────────────────────────
    timestamps = make_timestamps(500, span_days=90)
    target = 5.000
    k = 0.5 * 0.015  # 0.0075
    cusum_h = 0.0
    cusum_l = 0.0
    for i in range(500):
        val = 5.000 + 0.005 * math.sin(2 * math.pi * i / 200) + random.gauss(0, 0.012)
        cusum_h = max(0.0, cusum_h + (val - target) - k)
        cusum_l = min(0.0, cusum_l + (val - target) + k)
        insert_sample(cur, IDS["fill_volume"], timestamps[i], values=[val],
                      cusum_high=cusum_h, cusum_low=cusum_l)

    # ── Assay % (I-MR, exponential-ish) ─────────────────────────────
    timestamps = make_timestamps(500, span_days=90)
    for i in range(500):
        val = 99.5 + random.expovariate(5.0)
        val = min(val, 101.5)  # cap at reasonable range
        insert_sample(cur, IDS["assay_pct"], timestamps[i], values=[val])

    # ── Impurity Level (I-MR, sibling to Assay %) ──────────────────────
    timestamps = make_timestamps(500, span_days=90)
    for i in range(500):
        val = max(0.0, random.expovariate(10.0))  # right-skewed, mostly low
        insert_sample(cur, IDS["impurity_level"], timestamps[i], values=[val])

    # ── Dissolution Rate (EWMA, gradual changes) ────────────────────
    timestamps = make_timestamps(500, span_days=90)
    raw_vals = gen_drift(500, 85.0, 2.0, 0.002)
    ewma = 85.0
    lam = 0.2
    for i in range(500):
        ewma = lam * raw_vals[i] + (1 - lam) * ewma
        insert_sample(cur, IDS["dissolution"], timestamps[i], values=[raw_vals[i]],
                      ewma_value=ewma)


def seed_attribute_samples(cur: sqlite3.Cursor) -> None:
    """Generate ~500 samples for each attribute characteristic."""

    # ── Solder Defects (p-chart, Laney p') ───────────────────────────
    timestamps = make_timestamps(500, span_days=90)
    for i in range(500):
        sample_size = random.randint(80, 120)  # overdispersed
        p_actual = max(0.0, random.gauss(0.05, 0.02))
        defects = max(0, int(random.gauss(p_actual * sample_size, 2)))
        defects = min(defects, sample_size)
        insert_sample(cur, IDS["solder_defects"], timestamps[i],
                      defect_count=defects, sample_size=sample_size)

    # ── Electrical Pass/Fail (np-chart) ──────────────────────────────
    timestamps = make_timestamps(500, span_days=90)
    defect_counts = gen_binomial(500, 100, 0.03)
    for i in range(500):
        insert_sample(cur, IDS["electrical_pf"], timestamps[i],
                      defect_count=defect_counts[i], sample_size=100)

    # ── Paint Defects per Panel (c-chart) ────────────────────────────
    timestamps = make_timestamps(500, span_days=90)
    for i in range(500):
        lam = 4.0 + 1.5 * math.sin(2 * math.pi * i / 50)
        defects = gen_poisson(1, max(0.1, lam))[0]
        insert_sample(cur, IDS["paint_defects"], timestamps[i],
                      defect_count=defects, sample_size=1)

    # ── Blemishes per m^2 (u-chart) ──────────────────────────────────
    timestamps = make_timestamps(500, span_days=90)
    for i in range(500):
        units = random.randint(5, 15)
        defects = gen_poisson(1, 1.2 * units)[0]
        insert_sample(cur, IDS["blemishes"], timestamps[i],
                      defect_count=defects, units_inspected=units)

    # ── Void Percentage (p-chart, aerospace) ─────────────────────────
    timestamps = make_timestamps(500, span_days=90)
    defect_counts = gen_binomial(500, 50, 0.02)
    for i in range(500):
        insert_sample(cur, IDS["void_pct"], timestamps[i],
                      defect_count=defect_counts[i], sample_size=50)

    # ── Seal Failures (p-chart, pharma) ──────────────────────────────
    timestamps = make_timestamps(500, span_days=90)
    defect_counts = gen_binomial(500, 200, 0.01)
    for i in range(500):
        insert_sample(cur, IDS["seal_failures"], timestamps[i],
                      defect_count=defect_counts[i], sample_size=200)

    # ── Delamination Count (c-chart) ─────────────────────────────────
    timestamps = make_timestamps(500, span_days=90)
    defect_counts = gen_poisson(500, 1.5)
    for i in range(500):
        insert_sample(cur, IDS["delam_count"], timestamps[i],
                      defect_count=defect_counts[i], sample_size=1)


def seed_narrative_arcs(cur: sqlite3.Cursor) -> None:
    """Create the 3 narrative story arcs with violations, annotations, and capabilities."""

    # ══════════════════════════════════════════════════════════════════
    # ARC 1: "Out-of-Control Crankshaft" (Bearing OD, X-bar R, n=5)
    # ══════════════════════════════════════════════════════════════════
    timestamps = make_timestamps(500, span_days=90)
    samples = []

    # Phase 1: Stable (samples 0-199) -- Cpk ~1.45
    for i in range(200):
        values = gen_normal(5, 25.000, 0.008)
        sid = insert_sample(cur, IDS["bearing_od"], timestamps[i], values=values)
        samples.append(sid)

    # Phase 2: Drifting (samples 200-279) -- tool wear
    for i in range(200, 280):
        drift = 0.0004 * (i - 200)  # gradual upward shift
        values = gen_normal(5, 25.000 + drift, 0.009)
        sid = insert_sample(cur, IDS["bearing_od"], timestamps[i], values=values)
        samples.append(sid)

    # Annotation at sample 250
    insert_annotation(cur, IDS["bearing_od"], "point",
                      "Tool wear investigation initiated — Bearing OD trending high",
                      color="#e67e22", sample_id=samples[250], created_by="eng.detroit")

    # Phase 3: Halted/recalibrated (samples 280-319)
    for i in range(280, 320):
        values = gen_normal(5, 25.002, 0.010)  # slightly off during recalibration
        sid = insert_sample(cur, IDS["bearing_od"], timestamps[i], values=values)
        samples.append(sid)

    # Annotation for recalibration
    insert_annotation(cur, IDS["bearing_od"], "period",
                      "Replaced cutting insert CNC-401. Process recalibrated.",
                      color="#27ae60", start_sid=samples[281], end_sid=samples[319],
                      created_by="eng.detroit")

    # Phase 4: Back in control (samples 320-499) -- tighter Cpk ~1.67
    for i in range(320, 500):
        values = gen_normal(5, 25.000, 0.006)
        sid = insert_sample(cur, IDS["bearing_od"], timestamps[i], values=values)
        samples.append(sid)

    # 4 capability snapshots
    insert_capability(cur, IDS["bearing_od"], cp=1.52, cpk=1.45, pp=1.48, ppk=1.40,
                      sample_count=100, p_value=0.45, calc_by="eng.detroit")
    insert_capability(cur, IDS["bearing_od"], cp=1.10, cpk=0.89, pp=1.05, ppk=0.82,
                      sample_count=250, p_value=0.12, calc_by="eng.detroit")
    insert_capability(cur, IDS["bearing_od"], cp=1.60, cpk=1.52, pp=1.55, ppk=1.48,
                      sample_count=350, p_value=0.62, calc_by="eng.detroit")
    insert_capability(cur, IDS["bearing_od"], cp=1.75, cpk=1.67, pp=1.70, ppk=1.62,
                      sample_count=500, p_value=0.78, calc_by="eng.detroit")

    IDS["bearing_od_samples"] = samples

    # ══════════════════════════════════════════════════════════════════
    # ARC 2: "Anomaly in the Autoclave" (Cure Temp, I-MR)
    # ══════════════════════════════════════════════════════════════════
    timestamps = make_timestamps(500, span_days=60)
    samples = []

    # Phase 1: Stable (samples 0-299)
    for i in range(300):
        values = [random.gauss(177.0, 0.30)]
        sid = insert_sample(cur, IDS["cure_temp"], timestamps[i], values=values)
        samples.append(sid)

    # Phase 2: Subtle shift (samples 300-349) -- anomaly region
    for i in range(300, 350):
        drift = 0.008 * (i - 300)
        values = [random.gauss(177.0 + drift, 0.35)]
        sid = insert_sample(cur, IDS["cure_temp"], timestamps[i], values=values)
        samples.append(sid)

    # Annotation
    insert_annotation(cur, IDS["cure_temp"], "point",
                      "AI flagged potential heater element degradation",
                      color="#e74c3c", sample_id=samples[320], created_by="system")

    # Phase 3: Corrected (samples 350-499)
    for i in range(350, 500):
        values = [random.gauss(177.0, 0.28)]
        sid = insert_sample(cur, IDS["cure_temp"], timestamps[i], values=values)
        samples.append(sid)

    IDS["cure_temp_samples"] = samples

    # ══════════════════════════════════════════════════════════════════
    # ARC 3: "Regulated Tablet" (Tablet Weight, I-MR)
    # ══════════════════════════════════════════════════════════════════
    timestamps = make_timestamps(500, span_days=42)
    samples = []

    for i in range(500):
        values = [random.gauss(200.0, 0.50)]
        sid = insert_sample(cur, IDS["tablet_weight"], timestamps[i], values=values)
        samples.append(sid)

    # 2 capability snapshots
    insert_capability(cur, IDS["tablet_weight"], cp=1.45, cpk=1.38, pp=1.42, ppk=1.35,
                      sample_count=250, p_value=0.55, calc_by="eng.pharma")
    insert_capability(cur, IDS["tablet_weight"], cp=1.50, cpk=1.41, pp=1.47, ppk=1.38,
                      sample_count=500, p_value=0.68, calc_by="eng.pharma")

    IDS["tablet_weight_samples"] = samples


def seed_correlated_overrides(cur: sqlite3.Cursor) -> None:
    """Replace independently-generated sibling samples with correlated data.

    Uses Cholesky conditioning: given observed anchor values z_anchor, generate
    sibling values z_sibling = r * z_anchor + sqrt(1 - r^2) * z_independent.

    Must run AFTER seed_variable_samples() and seed_narrative_arcs() but BEFORE
    replay_spc_violations() so violations are computed on the correlated data.
    """

    def _delete_samples(char_id: int) -> None:
        cur.execute(
            "DELETE FROM measurement WHERE sample_id IN "
            "(SELECT id FROM sample WHERE char_id = ?)", (char_id,))
        cur.execute("DELETE FROM sample WHERE char_id = ?", (char_id,))

    def _read_anchor(char_id: int) -> list[tuple[str, float]]:
        """Read (timestamp, value) pairs for an I-MR anchor characteristic."""
        cur.execute("""
            SELECT s.timestamp, m.value
            FROM sample s JOIN measurement m ON m.sample_id = s.id
            WHERE s.char_id = ? AND s.is_excluded = 0
            ORDER BY s.timestamp
        """, (char_id,))
        return cur.fetchall()

    # ── Group A: Tablet Press (RTP) ──────────────────────────────────────
    # Anchor: tablet_weight (narrative arc, 42-day span, ~200.0 ± 0.50)
    # Siblings: tablet_hardness (~8.0 ± 0.9), tablet_thickness (~4.00 ± 0.04)
    # Correlations: weight↔hardness r=0.65, weight↔thickness r=0.75
    weight_rows = _read_anchor(IDS["tablet_weight"])
    if weight_rows:
        _delete_samples(IDS["tablet_hardness"])
        _delete_samples(IDS["tablet_thickness"])

        w_mean, w_std = 200.0, 0.50
        h_mean, h_std, r_wh = 8.0, 0.9, 0.65
        t_mean, t_std, r_wt = 4.00, 0.04, 0.75
        rho_h = math.sqrt(1 - r_wh ** 2)
        rho_t = math.sqrt(1 - r_wt ** 2)

        for ts, w_val in weight_rows:
            z_w = (w_val - w_mean) / w_std
            h_val = h_mean + h_std * (r_wh * z_w + rho_h * random.gauss(0, 1))
            t_val = t_mean + t_std * (r_wt * z_w + rho_t * random.gauss(0, 1))
            insert_sample(cur, IDS["tablet_hardness"], ts, values=[h_val])
            insert_sample(cur, IDS["tablet_thickness"], ts, values=[t_val])

    # ── Group B: Autoclave (Wichita) ─────────────────────────────────────
    # Anchor: cure_temp (narrative arc, 60-day span, ~177.0 ± 0.30)
    # Sibling: cure_pressure (~85.0 ± 0.9), r=0.80
    temp_rows = _read_anchor(IDS["cure_temp"])
    if temp_rows:
        _delete_samples(IDS["cure_pressure"])

        tp_mean, tp_std = 177.0, 0.30
        pr_mean, pr_std, r_tp = 85.0, 0.9, 0.80
        rho_p = math.sqrt(1 - r_tp ** 2)

        for ts, t_val in temp_rows:
            z_t = (t_val - tp_mean) / tp_std
            p_val = pr_mean + pr_std * (r_tp * z_t + rho_p * random.gauss(0, 1))
            insert_sample(cur, IDS["cure_pressure"], ts, values=[p_val])

    # ── Group C: QC Lab (RTP) ────────────────────────────────────────────
    # Replace both assay_pct and impurity_level with correlated values.
    # assay ↔ impurity r=-0.70 (higher purity → lower impurities)
    cur.execute(
        "SELECT timestamp FROM sample WHERE char_id = ? ORDER BY timestamp",
        (IDS["assay_pct"],))
    assay_ts = [r[0] for r in cur.fetchall()]

    if assay_ts:
        _delete_samples(IDS["assay_pct"])
        _delete_samples(IDS["impurity_level"])

        n = len(assay_ts)
        assay_vals, imp_vals = gen_correlated_pairs(
            n, 99.70, 0.30, 0.10, 0.04, -0.70)

        for i in range(n):
            a = max(98.5, min(101.5, assay_vals[i]))
            imp = max(0.0, imp_vals[i])
            insert_sample(cur, IDS["assay_pct"], assay_ts[i], values=[a])
            insert_sample(cur, IDS["impurity_level"], assay_ts[i], values=[imp])

    # ── Group D: Surface Grinder (Detroit) ───────────────────────────────
    # Anchor: surface_finish (Weibull, 90-day span)
    # Sibling: flatness (~0.015 ± 0.003), r=0.55
    finish_rows = _read_anchor(IDS["surface_finish"])
    if finish_rows:
        _delete_samples(IDS["flatness"])

        f_vals = [r[1] for r in finish_rows]
        f_mean = sum(f_vals) / len(f_vals)
        f_std = math.sqrt(sum((v - f_mean) ** 2 for v in f_vals) / len(f_vals))

        fl_mean, fl_std, r_ff = 0.015, 0.003, 0.55
        rho_f = math.sqrt(1 - r_ff ** 2)

        for ts, sf_val in finish_rows:
            z_sf = (sf_val - f_mean) / max(f_std, 1e-10)
            flat = max(0.0, fl_mean + fl_std * (r_ff * z_sf + rho_f * random.gauss(0, 1)))
            insert_sample(cur, IDS["flatness"], ts, values=[flat])

    print(f"  Correlated overrides applied for 4 groups (7 characteristics)")


# ── Wave 3: Violations, Capability History, Annotations ──────────────────


def replay_spc_violations(cur: sqlite3.Cursor) -> None:
    """Replay seeded samples through real SPC engine logic to generate organic violations.

    Instead of hardcoding violations with random rule IDs and severities, this runs
    the actual Nelson rules, CUSUM thresholds, and EWMA limits on the seeded data
    to produce only violations that would naturally occur.
    """
    from collections import defaultdict
    from cassini.core.engine.nelson_rules import NelsonRuleLibrary
    from cassini.core.engine.rolling_window import (
        RollingWindow, ZoneBoundaries as RWZoneBoundaries, WindowSample,
    )
    from cassini.core.engine.attribute_engine import (
        check_attribute_nelson_rules, get_plotted_value, get_per_point_limits,
        calculate_attribute_limits, get_per_point_limits_laney, calculate_laney_sigma_z,
    )
    from cassini.core.engine.ewma_engine import calculate_ewma_limits

    total_violations = 0

    # Load all characteristics with their config
    cur.execute("""
        SELECT id, name, data_type, chart_type, subgroup_size,
               ucl, lcl, stored_sigma, stored_center_line, target_value,
               cusum_target, cusum_k, cusum_h,
               ewma_lambda, ewma_l,
               attribute_chart_type, use_laney_correction, short_run_mode
        FROM characteristic
    """)
    chars = cur.fetchall()
    col_names = [desc[0] for desc in cur.description]

    for char_row in chars:
        c = dict(zip(col_names, char_row))
        char_id = c["id"]
        data_type = c["data_type"]
        chart_type = c["chart_type"]

        # Load enabled rules for this characteristic
        cur.execute("""
            SELECT rule_id, require_acknowledgement, parameters
            FROM characteristic_rules WHERE char_id = ? AND is_enabled = 1
        """, (char_id,))
        rule_rows = cur.fetchall()
        enabled_rules = {r[0] for r in rule_rows}
        rule_params: dict[int, dict] = {}
        for rid, _, params_json in rule_rows:
            if params_json:
                try:
                    rule_params[rid] = json.loads(params_json)
                except (json.JSONDecodeError, TypeError):
                    pass

        if not enabled_rules:
            continue

        n_viol = 0

        # ═══════════════════════════════════════════════════════════
        # CUSUM characteristics
        # ═══════════════════════════════════════════════════════════
        if chart_type == "cusum":
            target = c["cusum_target"]
            sigma = c["stored_sigma"]
            k_mult = c["cusum_k"] or 0.5
            h_mult = c["cusum_h"] or 5.0

            if target is None or not sigma or sigma <= 0:
                continue

            # k and h are stored as sigma multipliers (AIAG convention)
            k_val = k_mult * sigma
            h_val = h_mult * sigma

            cur.execute("""
                SELECT s.id, m.value FROM sample s
                JOIN measurement m ON m.sample_id = s.id
                WHERE s.char_id = ? AND s.is_excluded = 0
                ORDER BY s.timestamp
            """, (char_id,))

            ch, cl = 0.0, 0.0
            for sid, val in cur.fetchall():
                ch = max(0.0, ch + (val - target - k_val))
                cl = max(0.0, cl + (target - val - k_val))
                if ch > h_val:
                    insert_violation(cur, sid, char_id, 1, "CUSUM+ Shift", "CRITICAL")
                    n_viol += 1
                if cl > h_val:
                    insert_violation(cur, sid, char_id, 1, "CUSUM- Shift", "CRITICAL")
                    n_viol += 1

        # ═══════════════════════════════════════════════════════════
        # EWMA characteristics
        # ═══════════════════════════════════════════════════════════
        elif chart_type == "ewma":
            lam = c["ewma_lambda"] or 0.2
            l_mult = c["ewma_l"] or 3.0
            target = c["target_value"] or c["stored_center_line"]
            sigma = c["stored_sigma"]

            if target is None or not sigma or sigma <= 0:
                continue

            ucl, lcl = calculate_ewma_limits(target, sigma, lam, l_mult)

            cur.execute("""
                SELECT id, ewma_value FROM sample
                WHERE char_id = ? AND is_excluded = 0 ORDER BY timestamp
            """, (char_id,))

            for sid, ewma_val in cur.fetchall():
                if ewma_val is None:
                    continue
                if ewma_val > ucl:
                    insert_violation(cur, sid, char_id, 1, "EWMA Above UCL", "CRITICAL")
                    n_viol += 1
                elif ewma_val < lcl:
                    insert_violation(cur, sid, char_id, 1, "EWMA Below LCL", "CRITICAL")
                    n_viol += 1

        # ═══════════════════════════════════════════════════════════
        # Attribute characteristics (p/np/c/u charts)
        # ═══════════════════════════════════════════════════════════
        elif data_type == "attribute":
            attr_type = c["attribute_chart_type"]
            use_laney = bool(c["use_laney_correction"])
            center_line = c["stored_center_line"]

            if not attr_type:
                continue

            # Load all samples chronologically
            cur.execute("""
                SELECT id, defect_count, sample_size, units_inspected
                FROM sample WHERE char_id = ? AND is_excluded = 0 ORDER BY timestamp
            """, (char_id,))
            all_samples = cur.fetchall()

            if not all_samples:
                continue

            # Calculate center_line from data if not stored
            if center_line is None:
                sample_dicts = [{"defect_count": dc or 0, "sample_size": ss,
                                 "units_inspected": ui}
                                for _, dc, ss, ui in all_samples]
                try:
                    limits = calculate_attribute_limits(attr_type, sample_dicts)
                    center_line = limits.center_line
                except Exception:
                    continue

            # Compute Laney sigma_z for overdispersion correction
            sigma_z = None
            if use_laney:
                sample_dicts = [{"defect_count": dc or 0, "sample_size": ss,
                                 "units_inspected": ui}
                                for _, dc, ss, ui in all_samples]
                try:
                    sigma_z = calculate_laney_sigma_z(attr_type, sample_dicts, center_line)
                except Exception:
                    pass

            # Attribute charts only support rules 1-4
            attr_enabled = enabled_rules & {1, 2, 3, 4}
            if not attr_enabled:
                continue

            # Build sliding window and check rules after each addition
            plotted_vals: list[float] = []
            ucl_vals: list[float] = []
            lcl_vals: list[float] = []
            sids: list[int] = []
            prev_triggered: set[int] = set()

            for sid, dc, ss, ui in all_samples:
                dc = dc or 0
                try:
                    pv = get_plotted_value(attr_type, dc, ss, ui)
                except Exception:
                    continue

                if use_laney and sigma_z is not None:
                    try:
                        u, l = get_per_point_limits_laney(
                            attr_type, center_line, sigma_z, ss, ui)
                    except Exception:
                        u, l = get_per_point_limits(attr_type, center_line, ss, ui)
                else:
                    try:
                        u, l = get_per_point_limits(attr_type, center_line, ss, ui)
                    except Exception:
                        continue

                plotted_vals.append(pv)
                ucl_vals.append(u)
                lcl_vals.append(l)
                sids.append(sid)

                # Sliding window of last 25 samples
                ws = min(25, len(plotted_vals))
                try:
                    results = check_attribute_nelson_rules(
                        plotted_vals[-ws:], center_line,
                        ucl_vals[-ws:], lcl_vals[-ws:],
                        sids[-ws:], attr_enabled,
                    )
                except Exception:
                    continue

                curr_triggered: set[int] = set()
                for r in results:
                    if not r.triggered:
                        continue
                    curr_triggered.add(r.rule_id)
                    # Rule 1: every OOC sample; Rules 2+: only on new trigger
                    if r.rule_id == 1 or r.rule_id not in prev_triggered:
                        sev = r.severity if isinstance(r.severity, str) else r.severity
                        insert_violation(cur, sid, char_id, r.rule_id, r.rule_name, sev)
                        n_viol += 1
                prev_triggered = curr_triggered

        # ═══════════════════════════════════════════════════════════
        # Variable characteristics (Shewhart X-bar / I-MR)
        # ═══════════════════════════════════════════════════════════
        elif data_type == "variable" and chart_type is None:
            sigma = c["stored_sigma"]
            center_line = c["stored_center_line"]
            short_run = c["short_run_mode"]
            target_val = c["target_value"]

            if not sigma or sigma <= 0 or center_line is None:
                continue

            # Zone boundaries depend on short-run mode
            if short_run == "standardized":
                b_cl, b_sig = 0.0, 1.0
            elif short_run == "deviation":
                b_cl, b_sig = 0.0, sigma
            else:
                b_cl, b_sig = center_line, sigma

            boundaries = RWZoneBoundaries(
                center_line=b_cl,
                plus_1_sigma=b_cl + b_sig,
                plus_2_sigma=b_cl + 2 * b_sig,
                plus_3_sigma=b_cl + 3 * b_sig,
                minus_1_sigma=b_cl - b_sig,
                minus_2_sigma=b_cl - 2 * b_sig,
                minus_3_sigma=b_cl - 3 * b_sig,
                sigma=b_sig,
            )

            # Build library with custom rule parameters if any
            library = NelsonRuleLibrary()
            if rule_params:
                configs = []
                for rid in range(1, 9):
                    cfg: dict = {"rule_id": rid}
                    if rid in rule_params:
                        cfg["parameters"] = rule_params[rid]
                    configs.append(cfg)
                library.create_from_config(configs)

            window = RollingWindow(25)
            window.set_boundaries(boundaries)

            # Batch-load samples and measurements
            cur.execute("""
                SELECT id, timestamp, z_score FROM sample
                WHERE char_id = ? AND is_excluded = 0 ORDER BY timestamp
            """, (char_id,))
            samples = cur.fetchall()
            sample_ids = [s[0] for s in samples]

            if not sample_ids:
                continue

            # Batch-load all measurements (SQLite variable limit is 999)
            meas_by_sid: dict[int, list[float]] = defaultdict(list)
            for batch_start in range(0, len(sample_ids), 900):
                batch_sids = sample_ids[batch_start:batch_start + 900]
                placeholders = ",".join("?" * len(batch_sids))
                cur.execute(
                    f"SELECT sample_id, value FROM measurement "
                    f"WHERE sample_id IN ({placeholders}) ORDER BY id",
                    batch_sids,
                )
                for msid, mval in cur.fetchall():
                    meas_by_sid[msid].append(mval)

            prev_triggered: set[int] = set()
            for sid, ts, z_score in samples:
                meas = meas_by_sid.get(sid, [])
                if not meas:
                    continue

                mean_val = sum(meas) / len(meas)

                # Plotted value depends on short-run mode
                if short_run == "standardized" and z_score is not None:
                    plot_val = z_score
                elif short_run == "deviation" and target_val is not None:
                    plot_val = mean_val - target_val
                else:
                    plot_val = mean_val

                zone, is_above, sigma_dist = window.classify_value(plot_val)
                ws = WindowSample(
                    sample_id=sid,
                    timestamp=(datetime.fromisoformat(ts)
                               if isinstance(ts, str) else ts),
                    value=plot_val,
                    range_value=None,
                    zone=zone,
                    is_above_center=is_above,
                    sigma_distance=sigma_dist,
                )
                window.append(ws)

                results = library.check_all(window, enabled_rules)
                curr_triggered: set[int] = set()
                for r in results:
                    if not r.triggered:
                        continue
                    curr_triggered.add(r.rule_id)
                    # Rule 1: every OOC sample; Rules 2+: only on new trigger
                    if r.rule_id == 1 or r.rule_id not in prev_triggered:
                        sev = (r.severity.value
                               if hasattr(r.severity, "value") else str(r.severity))
                        insert_violation(
                            cur, sid, char_id, r.rule_id, r.rule_name, sev)
                        n_viol += 1
                prev_triggered = curr_triggered

        total_violations += n_viol
        if n_viol > 0:
            print(f"  {c['name']}: {n_viol} violations")

    print(f"  Total: {total_violations} violations detected by SPC engine")

    # ── Post-replay: Acknowledge some narrative violations ────────
    # Find violations in bearing_od drift phase and acknowledge with story reasons
    if "bearing_od_samples" in IDS:
        bearing_samples = IDS["bearing_od_samples"]
        if len(bearing_samples) > 280:
            drift_sids = bearing_samples[200:280]
            placeholders = ",".join("?" * len(drift_sids))
            cur.execute(
                f"SELECT id FROM violation "
                f"WHERE char_id = ? AND sample_id IN ({placeholders}) ORDER BY id",
                [IDS["bearing_od"]] + drift_sids,
            )
            drift_viols = [row[0] for row in cur.fetchall()]

            ack_data = [
                ("eng.detroit", "Tool wear identified — scheduling replacement"),
                ("eng.detroit", "Corrective action initiated"),
            ]
            for i, vid in enumerate(drift_viols[:len(ack_data)]):
                user, reason = ack_data[i]
                cur.execute(
                    "UPDATE violation SET acknowledged = 1, ack_user = ?, "
                    "ack_reason = ?, ack_timestamp = ? WHERE id = ?",
                    (user, reason, utcnow(), vid),
                )


def seed_capability_and_annotations(cur: sqlite3.Cursor) -> None:
    """Add capability snapshots and general annotations for non-narrative chars."""

    # 2 capability snapshots per non-narrative variable characteristic
    cap_data = {
        "surface_finish": [(1.20, 1.10, 1.15, 1.05, 150), (1.25, 1.18, 1.20, 1.12, 500)],
        "bore_dia": [(1.35, 1.28, 1.30, 1.22, 150), (1.40, 1.33, 1.35, 1.28, 500)],
        "pin_height": [(1.50, 1.42, 1.45, 1.38, 150), (1.35, 1.25, 1.30, 1.20, 500)],
        "bolt_torque": [(1.45, 1.38, 1.40, 1.32, 150), (1.30, 1.22, 1.25, 1.18, 500)],
        "ply_thickness": [(1.55, 1.48, 1.50, 1.42, 150), (1.60, 1.52, 1.55, 1.48, 500)],
        "blade_profile": [(1.30, 1.20, 1.25, 1.15, 150), (1.35, 1.25, 1.30, 1.22, 500)],
        "rivet_grip": [(1.40, 1.32, 1.35, 1.28, 150), (1.45, 1.38, 1.40, 1.33, 500)],
        "fastener_torque": [(1.50, 1.45, 1.48, 1.42, 150), (1.55, 1.48, 1.52, 1.45, 500)],
        "api_conc": [(1.40, 1.30, 1.35, 1.25, 150), (1.45, 1.35, 1.40, 1.30, 500)],
        "moisture": [(1.60, 1.52, 1.55, 1.48, 150), (1.65, 1.58, 1.60, 1.53, 500)],
        "blend_unif": [(1.35, 1.28, 1.30, 1.22, 150), (1.40, 1.33, 1.35, 1.28, 500)],
        "fill_volume": [(1.55, 1.48, 1.50, 1.42, 150), (1.50, 1.40, 1.45, 1.35, 500)],
        "assay_pct": [(1.25, 1.15, 1.20, 1.10, 150), (1.30, 1.22, 1.25, 1.18, 500)],
        "dissolution": [(1.40, 1.32, 1.35, 1.28, 150), (1.35, 1.25, 1.30, 1.20, 500)],
    }

    for char_key, snapshots in cap_data.items():
        for cp, cpk, pp, ppk, count in snapshots:
            p_val = round(random.uniform(0.10, 0.85), 3)
            calc_by = {
                "surface_finish": "eng.detroit", "bore_dia": "eng.detroit",
                "pin_height": "eng.detroit", "bolt_torque": "eng.detroit",
                "ply_thickness": "eng.wichita", "blade_profile": "eng.wichita",
                "rivet_grip": "eng.wichita", "fastener_torque": "eng.wichita",
                "api_conc": "eng.pharma", "moisture": "eng.pharma",
                "blend_unif": "eng.pharma", "fill_volume": "eng.pharma",
                "assay_pct": "eng.pharma", "dissolution": "eng.pharma",
            }.get(char_key, "system")
            insert_capability(cur, IDS[char_key], cp, cpk, pp, ppk,
                sample_count=count, p_value=p_val, calc_by=calc_by)

    # General plant annotations (not tied to specific narrative arcs)
    # Detroit: scheduled maintenance
    det_chars = ["surface_finish", "bore_dia", "pin_height", "bolt_torque"]
    for ck in det_chars:
        cur.execute("SELECT id FROM sample WHERE char_id = ? ORDER BY timestamp LIMIT 1 OFFSET 100",
                    (IDS[ck],))
        row = cur.fetchone()
        if row:
            start_sid = row[0]
            cur.execute("SELECT id FROM sample WHERE char_id = ? ORDER BY timestamp LIMIT 1 OFFSET 110",
                        (IDS[ck],))
            end_row = cur.fetchone()
            if end_row:
                insert_annotation(cur, IDS[ck], "period",
                    "Scheduled maintenance — all machining lines",
                    color="#3498db", start_sid=start_sid, end_sid=end_row[0],
                    created_by="sup.detroit")
                break  # Just one annotation for Detroit

    # Wichita: new material batch
    cur.execute("SELECT id FROM sample WHERE char_id = ? ORDER BY timestamp LIMIT 1 OFFSET 200",
                (IDS["ply_thickness"],))
    row = cur.fetchone()
    if row:
        insert_annotation(cur, IDS["ply_thickness"], "point",
            "New material batch received — lot MB-2026-042",
            color="#2ecc71", sample_id=row[0], created_by="eng.wichita")

    # RTP: annual FDA audit
    rtp_chars = ["api_conc", "moisture", "blend_unif"]
    for ck in rtp_chars:
        cur.execute("SELECT id FROM sample WHERE char_id = ? ORDER BY timestamp LIMIT 1 OFFSET 300",
                    (IDS[ck],))
        row = cur.fetchone()
        if row:
            start_sid = row[0]
            cur.execute("SELECT id FROM sample WHERE char_id = ? ORDER BY timestamp LIMIT 1 OFFSET 320",
                        (IDS[ck],))
            end_row = cur.fetchone()
            if end_row:
                insert_annotation(cur, IDS[ck], "period",
                    "Annual FDA audit preparation — enhanced monitoring",
                    color="#9b59b6", start_sid=start_sid, end_sid=end_row[0],
                    created_by="sup.pharma")
                break  # Just one annotation for RTP


# ── Wave 4: Connectivity & Gage Bridges ──────────────────────────────────


def seed_connectivity(cur: sqlite3.Cursor) -> None:
    """Create MQTT brokers, OPC-UA servers, and data sources (JTI pattern)."""
    now = utcnow()

    # ── MQTT Brokers (one per plant) ────────────────────────────────────
    cur.execute("""INSERT INTO mqtt_broker
        (plant_id, name, host, port, username, password, client_id, keepalive, max_reconnect_delay,
         use_tls, is_active, payload_format, outbound_enabled, outbound_topic_prefix, outbound_format,
         outbound_rate_limit, created_at, updated_at)
        VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, ?, 0, 1, ?, 1, ?, ?, ?, ?, ?)""",
        (IDS["det_plant"], "Detroit MQTT", "localhost", 1883, "cassini-detroit", 60, 30,
         "json", "cassini/detroit/outbound/", "json", 10.0, now, now))
    IDS["det_broker"] = cur.lastrowid

    cur.execute("""INSERT INTO mqtt_broker
        (plant_id, name, host, port, username, password, client_id, keepalive, max_reconnect_delay,
         use_tls, is_active, payload_format, outbound_enabled, outbound_topic_prefix, outbound_format,
         outbound_rate_limit, created_at, updated_at)
        VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, ?, 0, 1, ?, 1, ?, ?, ?, ?, ?)""",
        (IDS["ict_plant"], "Wichita MQTT", "localhost", 1883, "cassini-wichita", 60, 30,
         "json", "cassini/wichita/outbound/", "json", 10.0, now, now))
    IDS["ict_broker"] = cur.lastrowid

    cur.execute("""INSERT INTO mqtt_broker
        (plant_id, name, host, port, username, password, client_id, keepalive, max_reconnect_delay,
         use_tls, is_active, payload_format, outbound_enabled, outbound_topic_prefix, outbound_format,
         outbound_rate_limit, created_at, updated_at)
        VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, ?, 0, 1, ?, 1, ?, ?, ?, ?, ?)""",
        (IDS["rtp_plant"], "RTP MQTT", "localhost", 1883, "cassini-rtp", 60, 30,
         "json", "cassini/rtp/outbound/", "json", 10.0, now, now))
    IDS["rtp_broker"] = cur.lastrowid

    # ── OPC-UA Servers (one per plant) ──────────────────────────────────
    endpoint = "opc.tcp://localhost:4840/UA/TestHarness"

    cur.execute("""INSERT INTO opcua_server
        (plant_id, name, endpoint_url, auth_mode, username, password, security_policy, security_mode,
         is_active, session_timeout, publishing_interval, sampling_interval, created_at, updated_at)
        VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, 1, ?, ?, ?, ?, ?)""",
        (IDS["det_plant"], "Detroit OPC-UA", endpoint, "anonymous", "None", "None",
         30000, 1000, 500, now, now))
    IDS["det_opcua"] = cur.lastrowid

    cur.execute("""INSERT INTO opcua_server
        (plant_id, name, endpoint_url, auth_mode, username, password, security_policy, security_mode,
         is_active, session_timeout, publishing_interval, sampling_interval, created_at, updated_at)
        VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, 1, ?, ?, ?, ?, ?)""",
        (IDS["ict_plant"], "Wichita OPC-UA", endpoint, "anonymous", "None", "None",
         30000, 1000, 500, now, now))
    IDS["ict_opcua"] = cur.lastrowid

    cur.execute("""INSERT INTO opcua_server
        (plant_id, name, endpoint_url, auth_mode, username, password, security_policy, security_mode,
         is_active, session_timeout, publishing_interval, sampling_interval, created_at, updated_at)
        VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, 1, ?, ?, ?, ?, ?)""",
        (IDS["rtp_plant"], "RTP OPC-UA", endpoint, "anonymous", "None", "None",
         30000, 1000, 500, now, now))
    IDS["rtp_opcua"] = cur.lastrowid

    # ── OPC-UA Data Sources (16 characteristics) ───────────────────────
    opcua_mappings = [
        # (char_key, server_key, node_id)
        ("bearing_od", "det_opcua", "ns=2;s=Detroit.BearingOD"),
        ("bearing_width", "det_opcua", "ns=2;s=Detroit.BearingWidth"),
        ("surface_finish", "det_opcua", "ns=2;s=Detroit.SurfaceFinish"),
        ("flatness", "det_opcua", "ns=2;s=Detroit.Flatness"),
        ("bore_dia", "det_opcua", "ns=2;s=Detroit.BoreDiameter"),
        ("bore_roundness", "det_opcua", "ns=2;s=Detroit.BoreRoundness"),
        ("pin_height", "det_opcua", "ns=2;s=Detroit.PinHeight"),
        ("cure_temp", "ict_opcua", "ns=2;s=Wichita.CureTemp"),
        ("cure_pressure", "ict_opcua", "ns=2;s=Wichita.CurePressure"),
        ("blade_profile", "ict_opcua", "ns=2;s=Wichita.BladeProfile"),
        ("chord_length", "ict_opcua", "ns=2;s=Wichita.ChordLength"),
        ("rivet_grip", "ict_opcua", "ns=2;s=Wichita.RivetGrip"),
        ("api_conc", "rtp_opcua", "ns=2;s=RTP.APIConcentration"),
        ("tablet_weight", "rtp_opcua", "ns=2;s=RTP.TabletWeight"),
        ("tablet_hardness", "rtp_opcua", "ns=2;s=RTP.TabletHardness"),
        ("fill_volume", "rtp_opcua", "ns=2;s=RTP.FillVolume"),
    ]

    for char_key, server_key, node_id in opcua_mappings:
        # Base data_source row
        cur.execute("""INSERT INTO data_source
            (type, characteristic_id, trigger_strategy, is_active, created_at, updated_at)
            VALUES ('opcua', ?, 'on_value_change', 1, ?, ?)""",
            (IDS[char_key], now, now))
        ds_id = cur.lastrowid
        # OPC-UA child row
        cur.execute("""INSERT INTO opcua_data_source
            (id, server_id, node_id, sampling_interval, publishing_interval)
            VALUES (?, ?, ?, 500, 1000)""",
            (ds_id, IDS[server_key], node_id))

    # ── MQTT Data Sources (20 characteristics) ─────────────────────────
    mqtt_mappings = [
        # (char_key, broker_key, topic, metric_name)
        ("bolt_torque", "det_broker", "detroit/assembly/measurements", "bolt_torque"),
        ("solder_defects", "det_broker", "detroit/assembly/measurements", "solder_defects"),
        ("electrical_pf", "det_broker", "detroit/assembly/measurements", "electrical_pf"),
        ("paint_defects", "det_broker", "detroit/paint/measurements", "paint_defects"),
        ("film_thickness", "det_broker", "detroit/paint/measurements", "film_thickness"),
        ("blemishes", "det_broker", "detroit/paint/measurements", "blemishes"),
        ("ply_thickness", "ict_broker", "wichita/composite/measurements", "ply_thickness"),
        ("fiber_volume", "ict_broker", "wichita/composite/measurements", "fiber_volume"),
        ("fastener_torque", "ict_broker", "wichita/assembly/measurements", "fastener_torque"),
        ("hole_diameter", "ict_broker", "wichita/assembly/measurements", "hole_diameter"),
        ("void_pct", "ict_broker", "wichita/ndt/measurements", "void_pct"),
        ("delam_count", "ict_broker", "wichita/ndt/measurements", "delam_count"),
        ("moisture", "rtp_broker", "rtp/api-mfg/measurements", "moisture"),
        ("reaction_ph", "rtp_broker", "rtp/api-mfg/measurements", "reaction_ph"),
        ("blend_unif", "rtp_broker", "rtp/formulation/measurements", "blend_uniformity"),
        ("tablet_thickness", "rtp_broker", "rtp/formulation/measurements", "tablet_thickness"),
        ("seal_failures", "rtp_broker", "rtp/packaging/measurements", "seal_failures"),
        ("assay_pct", "rtp_broker", "rtp/qc-lab/measurements", "assay_pct"),
        ("impurity_level", "rtp_broker", "rtp/qc-lab/measurements", "impurity_level"),
        ("dissolution", "rtp_broker", "rtp/qc-lab/measurements", "dissolution_rate"),
    ]

    for char_key, broker_key, topic, metric_name in mqtt_mappings:
        cur.execute("""INSERT INTO data_source
            (type, characteristic_id, trigger_strategy, is_active, created_at, updated_at)
            VALUES ('mqtt', ?, 'on_message', 1, ?, ?)""",
            (IDS[char_key], now, now))
        ds_id = cur.lastrowid
        cur.execute("""INSERT INTO mqtt_data_source
            (id, broker_id, topic, metric_name, trigger_tag)
            VALUES (?, ?, ?, ?, NULL)""",
            (ds_id, IDS[broker_key], topic, metric_name))


def seed_gage_bridges(cur: sqlite3.Cursor) -> None:
    """Create gage bridge configs with serial ports."""
    now = utcnow()

    # Bridge 1: CMM Bridge — Detroit Floor
    api_key_1 = "showcase-detroit-cmm-bridge-key-001"
    cur.execute("""INSERT INTO gage_bridge
        (plant_id, name, api_key_hash, mqtt_broker_id, status, last_heartbeat_at, registered_by, created_at)
        VALUES (?, ?, ?, ?, 'online', ?, ?, ?)""",
        (IDS["det_plant"], "CMM Bridge \u2014 Detroit Floor",
         hashlib.sha256(api_key_1.encode()).hexdigest(),
         IDS["det_broker"], now, IDS["eng_det"], now))
    bridge1 = cur.lastrowid

    # Port 1: COM3, Mitutoyo Digimatic, mapped to Pin Height
    cur.execute("""INSERT INTO gage_port
        (bridge_id, port_name, baud_rate, data_bits, parity, stop_bits, protocol_profile,
         parse_pattern, mqtt_topic, characteristic_id, is_active, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 1, ?)""",
        (bridge1, "COM3", 9600, 8, "none", 1.0, "mitutoyo_digimatic",
         "detroit/machining/measurements", IDS["pin_height"], now))

    # Port 2: COM5, generic regex, mapped to Bore Diameter
    cur.execute("""INSERT INTO gage_port
        (bridge_id, port_name, baud_rate, data_bits, parity, stop_bits, protocol_profile,
         parse_pattern, mqtt_topic, characteristic_id, is_active, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)""",
        (bridge1, "COM5", 115200, 8, "none", 1.0, "generic_regex",
         r"(?P<value>[\d.]+)\s*mm", "detroit/machining/measurements", IDS["bore_dia"], now))

    # Bridge 2: QC Lab Bridge — RTP
    api_key_2 = "showcase-rtp-qclab-bridge-key-002"
    cur.execute("""INSERT INTO gage_bridge
        (plant_id, name, api_key_hash, mqtt_broker_id, status, last_heartbeat_at, registered_by, created_at)
        VALUES (?, ?, ?, ?, 'online', ?, ?, ?)""",
        (IDS["rtp_plant"], "QC Lab Bridge \u2014 RTP",
         hashlib.sha256(api_key_2.encode()).hexdigest(),
         IDS["rtp_broker"], now, IDS["eng_rtp"], now))
    bridge2 = cur.lastrowid

    # Port 1: COM1, generic, mapped to Assay
    cur.execute("""INSERT INTO gage_port
        (bridge_id, port_name, baud_rate, data_bits, parity, stop_bits, protocol_profile,
         parse_pattern, mqtt_topic, characteristic_id, is_active, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 1, ?)""",
        (bridge2, "COM1", 9600, 8, "none", 1.0, "generic_regex",
         "rtp/qc-lab/measurements", IDS["assay_pct"], now))


# ── Wave 5: Anomaly, Signatures, MSA, FAI ────────────────────────────────


def seed_anomaly(cur: sqlite3.Cursor) -> None:
    """Anomaly detection configs and events for narrative arcs."""
    now = utcnow()

    # Config on Cure Temp: all 3 detectors enabled
    cur.execute("""INSERT INTO anomaly_detector_config
        (char_id, is_enabled, pelt_enabled, pelt_model, pelt_penalty, pelt_min_segment,
         iforest_enabled, iforest_contamination, iforest_n_estimators, iforest_min_training, iforest_retrain_interval,
         ks_enabled, ks_reference_window, ks_test_window, ks_alpha,
         notify_on_changepoint, notify_on_anomaly_score, notify_on_distribution_shift,
         anomaly_score_threshold, created_at, updated_at)
        VALUES (?, 1, 1, 'rbf', 'bic', 25,
                1, 0.05, 100, 50, 100,
                1, 100, 50, 0.05,
                1, 1, 1,
                0.7, ?, ?)""",
        (IDS["cure_temp"], now, now))

    # Config on Bearing OD: PELT only
    cur.execute("""INSERT INTO anomaly_detector_config
        (char_id, is_enabled, pelt_enabled, pelt_model, pelt_penalty, pelt_min_segment,
         iforest_enabled, iforest_contamination, iforest_n_estimators, iforest_min_training, iforest_retrain_interval,
         ks_enabled, ks_reference_window, ks_test_window, ks_alpha,
         notify_on_changepoint, notify_on_anomaly_score, notify_on_distribution_shift,
         anomaly_score_threshold, created_at, updated_at)
        VALUES (?, 1, 1, 'rbf', 'bic', 25,
                0, 0.05, 100, 50, 100,
                0, 100, 50, 0.05,
                1, 0, 0,
                0.7, ?, ?)""",
        (IDS["bearing_od"], now, now))

    # Config on Tablet Weight: K-S only
    cur.execute("""INSERT INTO anomaly_detector_config
        (char_id, is_enabled, pelt_enabled, pelt_model, pelt_penalty, pelt_min_segment,
         iforest_enabled, iforest_contamination, iforest_n_estimators, iforest_min_training, iforest_retrain_interval,
         ks_enabled, ks_reference_window, ks_test_window, ks_alpha,
         notify_on_changepoint, notify_on_anomaly_score, notify_on_distribution_shift,
         anomaly_score_threshold, created_at, updated_at)
        VALUES (?, 1, 0, 'rbf', 'bic', 25,
                0, 0.05, 100, 50, 100,
                1, 100, 50, 0.05,
                0, 0, 1,
                0.7, ?, ?)""",
        (IDS["tablet_weight"], now, now))

    # Anomaly events for Cure Temp (Arc 2)
    ct_samples = IDS["cure_temp_samples"]

    # 1. PELT changepoint at sample 310
    cur.execute("""INSERT INTO anomaly_event
        (char_id, detector_type, event_type, severity, details, sample_id, window_start_id, window_end_id,
         is_acknowledged, is_dismissed, summary, detected_at)
        VALUES (?, 'pelt', 'changepoint', 'high', ?, ?, NULL, NULL,
                1, 0, 'PELT detected process shift at sample 310', ?)""",
        (IDS["cure_temp"], json.dumps({"change_point_index": 310, "segment_means": [177.0, 177.4]}),
         ct_samples[310], now))

    # 2. IsolationForest outlier at sample 315
    cur.execute("""INSERT INTO anomaly_event
        (char_id, detector_type, event_type, severity, details, sample_id, window_start_id, window_end_id,
         is_acknowledged, is_dismissed, summary, detected_at)
        VALUES (?, 'isolation_forest', 'outlier', 'medium', ?, ?, NULL, NULL,
                0, 0, 'Unusual pattern detected — deviates from normal behavior', ?)""",
        (IDS["cure_temp"], json.dumps({"anomaly_score": 0.82, "threshold": 0.70}),
         ct_samples[315], now))

    # 3. IsolationForest outlier at sample 325
    cur.execute("""INSERT INTO anomaly_event
        (char_id, detector_type, event_type, severity, details, sample_id, window_start_id, window_end_id,
         is_acknowledged, is_dismissed, summary, detected_at)
        VALUES (?, 'isolation_forest', 'outlier', 'medium', ?, ?, NULL, NULL,
                0, 0, 'Unusual pattern detected — deviates from normal behavior', ?)""",
        (IDS["cure_temp"], json.dumps({"anomaly_score": 0.75, "threshold": 0.70}),
         ct_samples[325], now))

    # 4. IsolationForest outlier at sample 340
    cur.execute("""INSERT INTO anomaly_event
        (char_id, detector_type, event_type, severity, details, sample_id, window_start_id, window_end_id,
         is_acknowledged, is_dismissed, summary, detected_at)
        VALUES (?, 'isolation_forest', 'outlier', 'medium', ?, ?, NULL, NULL,
                1, 0, 'Unusual pattern detected — deviates from normal behavior', ?)""",
        (IDS["cure_temp"], json.dumps({"anomaly_score": 0.78, "threshold": 0.70}),
         ct_samples[340], now))

    # 5. K-S distribution shift window 280-350
    cur.execute("""INSERT INTO anomaly_event
        (char_id, detector_type, event_type, severity, details, sample_id, window_start_id, window_end_id,
         is_acknowledged, is_dismissed, summary, detected_at)
        VALUES (?, 'ks_test', 'distribution_shift', 'high', ?, NULL, ?, ?,
                1, 0, 'K-S test: distribution shift detected (p=0.003)', ?)""",
        (IDS["cure_temp"], json.dumps({"ks_statistic": 0.245, "p_value": 0.003, "alpha": 0.05}),
         ct_samples[280], ct_samples[350], now))

    # 6. Dismissed false positive at sample 200
    cur.execute("""INSERT INTO anomaly_event
        (char_id, detector_type, event_type, severity, details, sample_id, window_start_id, window_end_id,
         is_acknowledged, is_dismissed, dismissed_by, dismissed_reason, summary, detected_at)
        VALUES (?, 'isolation_forest', 'outlier', 'low', ?, ?, NULL, NULL,
                0, 1, 'eng.wichita', 'Normal variation during startup', 'Low anomaly score — within normal variation', ?)""",
        (IDS["cure_temp"], json.dumps({"anomaly_score": 0.55, "threshold": 0.70}),
         ct_samples[200], now))


def seed_signatures(cur: sqlite3.Cursor) -> None:
    """Electronic signatures — meanings, workflows, instances, individual signatures."""
    now = utcnow()

    # Signature meanings (5 per plant, shared codes)
    meanings = [
        ("approved", "Approved", "Indicates full approval of the resource", False),
        ("reviewed", "Reviewed", "Indicates technical review complete", False),
        ("verified", "Verified", "Indicates verification against spec", True),
        ("rejected", "Rejected", "Indicates rejection with required reason", True),
        ("released", "Released", "Indicates release for production", False),
    ]

    for plant_key in ["det_plant", "ict_plant", "rtp_plant"]:
        for i, (code, display, desc, req_comment) in enumerate(meanings):
            cur.execute("""INSERT INTO signature_meaning
                (plant_id, code, display_name, description, requires_comment, is_active, sort_order)
                VALUES (?, ?, ?, ?, ?, 1, ?)""",
                (IDS[plant_key], code, display, desc, 1 if req_comment else 0, i + 1))

    # 4 workflow configurations

    # WF1: FAI Report Approval (RTP, required)
    cur.execute("""INSERT INTO signature_workflow
        (plant_id, name, resource_type, is_active, is_required, description, created_at, updated_at)
        VALUES (?, 'FAI Report Approval', 'fai_report', 1, 1, 'Two-step approval for FAI reports', ?, ?)""",
        (IDS["rtp_plant"], now, now))
    wf1 = cur.lastrowid
    cur.execute("""INSERT INTO signature_workflow_step
        (workflow_id, step_order, name, min_role, meaning_code, is_required, allow_self_sign, timeout_hours)
        VALUES (?, 1, 'Engineer Review', 'engineer', 'reviewed', 1, 0, 48)""", (wf1,))
    wf1_step1 = cur.lastrowid
    cur.execute("""INSERT INTO signature_workflow_step
        (workflow_id, step_order, name, min_role, meaning_code, is_required, allow_self_sign, timeout_hours)
        VALUES (?, 2, 'Supervisor Approval', 'supervisor', 'approved', 1, 0, 72)""", (wf1,))
    wf1_step2 = cur.lastrowid

    # WF2: Spec Limit Change (RTP, required)
    cur.execute("""INSERT INTO signature_workflow
        (plant_id, name, resource_type, is_active, is_required, description, created_at, updated_at)
        VALUES (?, 'Spec Limit Change Approval', 'characteristic', 1, 1, 'Two-step approval for spec limit changes', ?, ?)""",
        (IDS["rtp_plant"], now, now))
    wf2 = cur.lastrowid
    cur.execute("""INSERT INTO signature_workflow_step
        (workflow_id, step_order, name, min_role, meaning_code, is_required, allow_self_sign, timeout_hours)
        VALUES (?, 1, 'Engineer Review', 'engineer', 'reviewed', 1, 0, 48)""", (wf2,))
    wf2_step1 = cur.lastrowid
    cur.execute("""INSERT INTO signature_workflow_step
        (workflow_id, step_order, name, min_role, meaning_code, is_required, allow_self_sign, timeout_hours)
        VALUES (?, 2, 'Supervisor Approval', 'supervisor', 'approved', 1, 0, 72)""", (wf2,))
    wf2_step2 = cur.lastrowid

    # WF3: MSA Study Sign-off (Wichita)
    cur.execute("""INSERT INTO signature_workflow
        (plant_id, name, resource_type, is_active, is_required, description, created_at, updated_at)
        VALUES (?, 'MSA Study Sign-off', 'msa_study', 1, 0, 'Engineer sign-off on MSA study results', ?, ?)""",
        (IDS["ict_plant"], now, now))
    wf3 = cur.lastrowid
    cur.execute("""INSERT INTO signature_workflow_step
        (workflow_id, step_order, name, min_role, meaning_code, is_required, allow_self_sign, timeout_hours)
        VALUES (?, 1, 'Engineer Review', 'engineer', 'reviewed', 1, 1, 168)""", (wf3,))
    wf3_step1 = cur.lastrowid

    # WF4: Critical Sample Approval (Detroit)
    cur.execute("""INSERT INTO signature_workflow
        (plant_id, name, resource_type, is_active, is_required, description, created_at, updated_at)
        VALUES (?, 'Critical Sample Approval', 'sample', 1, 0, 'Supervisor approval for critical OOC samples', ?, ?)""",
        (IDS["det_plant"], now, now))
    wf4 = cur.lastrowid
    cur.execute("""INSERT INTO signature_workflow_step
        (workflow_id, step_order, name, min_role, meaning_code, is_required, allow_self_sign, timeout_hours)
        VALUES (?, 1, 'Supervisor Approval', 'supervisor', 'approved', 1, 0, 24)""", (wf4,))
    wf4_step1 = cur.lastrowid

    # Generate resource hashes (content-based)
    import hashlib as _hl

    def resource_hash(rtype, rid, content=""):
        return _hl.sha256(f"{rtype}:{rid}:{content}".encode()).hexdigest()

    def sig_hash(user_id, meaning, ts, rhash):
        return _hl.sha256(f"{user_id}:{meaning}:{ts}:{rhash}".encode()).hexdigest()

    # 5 workflow instances

    # Instance 1: APPROVED — Tablet weight spec update (RTP)
    r_hash = resource_hash("characteristic", IDS["tablet_weight"], "spec_update_usl_205")
    cur.execute("""INSERT INTO signature_workflow_instance
        (workflow_id, resource_type, resource_id, status, current_step, initiated_by, initiated_at, completed_at, expires_at)
        VALUES (?, 'characteristic', ?, 'completed', 2, ?, ?, ?, NULL)""",
        (wf2, IDS["tablet_weight"], IDS["eng_rtp"], now, now))
    inst1 = cur.lastrowid
    # Step 1 signed by eng.pharma
    ts1 = now
    sh1 = sig_hash(IDS["eng_rtp"], "reviewed", ts1, r_hash)
    cur.execute("""INSERT INTO electronic_signature
        (user_id, username, full_name, timestamp, meaning_code, meaning_display, resource_type, resource_id,
         resource_hash, signature_hash, ip_address, workflow_step_id, comment, is_valid)
        VALUES (?, 'eng.pharma', 'David Kim', ?, 'reviewed', 'Reviewed', 'characteristic', ?,
                ?, ?, '10.0.1.50', ?, 'Spec limits verified against process capability', 1)""",
        (IDS["eng_rtp"], ts1, IDS["tablet_weight"], r_hash, sh1, wf2_step1))
    # Step 2 signed by sup.pharma
    sh2 = sig_hash(IDS["sup_rtp"], "approved", ts1, r_hash)
    cur.execute("""INSERT INTO electronic_signature
        (user_id, username, full_name, timestamp, meaning_code, meaning_display, resource_type, resource_id,
         resource_hash, signature_hash, ip_address, workflow_step_id, comment, is_valid)
        VALUES (?, 'sup.pharma', 'James O''Brien', ?, 'approved', 'Approved', 'characteristic', ?,
                ?, ?, '10.0.1.51', ?, NULL, 1)""",
        (IDS["sup_rtp"], ts1, IDS["tablet_weight"], r_hash, sh2, wf2_step2))

    # Instance 2: REJECTED — Wider API concentration limits (RTP)
    r_hash2 = resource_hash("characteristic", IDS["api_conc"], "widen_limits")
    cur.execute("""INSERT INTO signature_workflow_instance
        (workflow_id, resource_type, resource_id, status, current_step, initiated_by, initiated_at, completed_at, expires_at)
        VALUES (?, 'characteristic', ?, 'rejected', 2, ?, ?, ?, NULL)""",
        (wf2, IDS["api_conc"], IDS["eng_rtp"], now, now))
    inst2 = cur.lastrowid
    sh3 = sig_hash(IDS["eng_rtp"], "reviewed", ts1, r_hash2)
    cur.execute("""INSERT INTO electronic_signature
        (user_id, username, full_name, timestamp, meaning_code, meaning_display, resource_type, resource_id,
         resource_hash, signature_hash, ip_address, workflow_step_id, comment, is_valid)
        VALUES (?, 'eng.pharma', 'David Kim', ?, 'reviewed', 'Reviewed', 'characteristic', ?,
                ?, ?, '10.0.1.50', ?, 'Engineering review complete', 1)""",
        (IDS["eng_rtp"], ts1, IDS["api_conc"], r_hash2, sh3, wf2_step1))
    sh4 = sig_hash(IDS["sup_rtp"], "rejected", ts1, r_hash2)
    cur.execute("""INSERT INTO electronic_signature
        (user_id, username, full_name, timestamp, meaning_code, meaning_display, resource_type, resource_id,
         resource_hash, signature_hash, ip_address, workflow_step_id, comment, is_valid)
        VALUES (?, 'sup.pharma', 'James O''Brien', ?, 'rejected', 'Rejected', 'characteristic', ?,
                ?, ?, '10.0.1.51', ?, 'Limits too wide for FDA validation requirements', 1)""",
        (IDS["sup_rtp"], ts1, IDS["api_conc"], r_hash2, sh4, wf2_step2))

    # Instance 3: PENDING — Fill Volume limit change (RTP)
    cur.execute("""INSERT INTO signature_workflow_instance
        (workflow_id, resource_type, resource_id, status, current_step, initiated_by, initiated_at, completed_at, expires_at)
        VALUES (?, 'characteristic', ?, 'pending', 1, ?, ?, NULL, NULL)""",
        (wf2, IDS["fill_volume"], IDS["eng_rtp"], now))

    # Instance 4: PARTIAL — MSA sign-off (Wichita). Step 1 signed.
    r_hash4 = resource_hash("msa_study", 1, "gage_rr_study")
    cur.execute("""INSERT INTO signature_workflow_instance
        (workflow_id, resource_type, resource_id, status, current_step, initiated_by, initiated_at, completed_at, expires_at)
        VALUES (?, 'msa_study', 1, 'in_progress', 1, ?, ?, NULL, NULL)""",
        (wf3, IDS["eng_ict"], now))
    inst4 = cur.lastrowid
    sh5 = sig_hash(IDS["eng_ict"], "reviewed", ts1, r_hash4)
    cur.execute("""INSERT INTO electronic_signature
        (user_id, username, full_name, timestamp, meaning_code, meaning_display, resource_type, resource_id,
         resource_hash, signature_hash, ip_address, workflow_step_id, comment, is_valid)
        VALUES (?, 'eng.wichita', 'Priya Patel', ?, 'reviewed', 'Reviewed', 'msa_study', 1,
                ?, ?, '10.0.2.30', ?, 'GR&R results acceptable per AIAG MSA 4th Ed', 1)""",
        (IDS["eng_ict"], ts1, r_hash4, sh5, wf3_step1))

    # Instance 5: EXPIRED — Old Detroit sample approval
    expired_at = ts_offset(BASE_TIME, days=-30)
    initiated_at = ts_offset(BASE_TIME, days=-32)
    cur.execute("""INSERT INTO signature_workflow_instance
        (workflow_id, resource_type, resource_id, status, current_step, initiated_by, initiated_at, completed_at, expires_at)
        VALUES (?, 'sample', 1, 'expired', 1, ?, ?, NULL, ?)""",
        (wf4, IDS["sup_det"], initiated_at, expired_at))


def seed_msa(cur: sqlite3.Cursor) -> None:
    """Insert raw MSA study data (operators, parts, measurements).

    Studies that have complete measurement matrices are inserted with
    status='pending_calc'.  The finalize_calculations() pass runs the
    real engines to populate results_json and flip status to 'complete'.
    """
    now = utcnow()

    # ── Study 1: Crankshaft Gage R&R (Detroit, crossed_anova, Bearing OD) ──
    # 3 operators x 10 parts x 3 reps = 90 measurements
    cur.execute("""INSERT INTO msa_study
        (plant_id, name, study_type, characteristic_id, num_operators, num_parts, num_replicates,
         tolerance, status, created_by, created_at, completed_at, results_json)
        VALUES (?, ?, ?, ?, 3, 10, 3, 0.100, 'pending_calc', ?, ?, NULL, NULL)""",
        (IDS["det_plant"], "Crankshaft Gage R&R", "crossed_anova", IDS["bearing_od"],
         IDS["eng_det"], now))
    study1 = cur.lastrowid

    ops1 = []
    for i, name in enumerate(["Marcus Johnson", "Tyler Washington", "Ana Rodriguez"]):
        cur.execute("INSERT INTO msa_operator (study_id, name, sequence_order) VALUES (?, ?, ?)",
            (study1, name, i))
        ops1.append(cur.lastrowid)

    parts1 = []
    part_refs = [25.000 + 0.005 * (i - 5) for i in range(10)]
    for i in range(10):
        cur.execute("INSERT INTO msa_part (study_id, name, reference_value, sequence_order) VALUES (?, ?, ?, ?)",
            (study1, f"Part-{i+1:02d}", part_refs[i], i))
        parts1.append(cur.lastrowid)

    for op_idx, op_id in enumerate(ops1):
        for part_idx, part_id in enumerate(parts1):
            for rep in range(3):
                base = part_refs[part_idx]
                op_bias = [-0.001, 0.000, 0.001][op_idx]
                value = round(base + op_bias + random.gauss(0, 0.003), 4)
                cur.execute("""INSERT INTO msa_measurement
                    (study_id, operator_id, part_id, replicate_num, value, attribute_value, timestamp)
                    VALUES (?, ?, ?, ?, ?, NULL, ?)""",
                    (study1, op_id, part_id, rep + 1, value, now))

    # ── Study 2: CMM Repeatability (Detroit, range_method, Pin Height) ──
    # 2 operators x 10 parts x 2 reps = 40 measurements
    cur.execute("""INSERT INTO msa_study
        (plant_id, name, study_type, characteristic_id, num_operators, num_parts, num_replicates,
         tolerance, status, created_by, created_at, completed_at, results_json)
        VALUES (?, ?, ?, ?, 2, 10, 2, 0.200, 'pending_calc', ?, ?, NULL, NULL)""",
        (IDS["det_plant"], "CMM Repeatability Study", "range_method", IDS["pin_height"],
         IDS["eng_det"], now))
    study2 = cur.lastrowid

    ops2 = []
    for i, name in enumerate(["Marcus Johnson", "Ana Rodriguez"]):
        cur.execute("INSERT INTO msa_operator (study_id, name, sequence_order) VALUES (?, ?, ?)",
            (study2, name, i))
        ops2.append(cur.lastrowid)

    parts2 = []
    pin_refs = [12.700 + 0.010 * (i - 5) for i in range(10)]
    for i in range(10):
        cur.execute("INSERT INTO msa_part (study_id, name, reference_value, sequence_order) VALUES (?, ?, ?, ?)",
            (study2, f"Pin-{i+1:02d}", pin_refs[i], i))
        parts2.append(cur.lastrowid)

    for op_idx, op_id in enumerate(ops2):
        for part_idx, part_id in enumerate(parts2):
            for rep in range(2):
                base = pin_refs[part_idx]
                op_bias = [-0.002, 0.002][op_idx]
                value = round(base + op_bias + random.gauss(0, 0.004), 4)
                cur.execute("""INSERT INTO msa_measurement
                    (study_id, operator_id, part_id, replicate_num, value, attribute_value, timestamp)
                    VALUES (?, ?, ?, ?, ?, NULL, ?)""",
                    (study2, op_id, part_id, rep + 1, value, now))

    # ── Study 3: X-Ray Inspection Agreement (Wichita, attribute_agreement) ──
    # 3 operators x 20 parts x 2 reps = 120 measurements
    cur.execute("""INSERT INTO msa_study
        (plant_id, name, study_type, characteristic_id, num_operators, num_parts, num_replicates,
         tolerance, status, created_by, created_at, completed_at, results_json)
        VALUES (?, ?, ?, ?, 3, 20, 2, NULL, 'pending_calc', ?, ?, NULL, NULL)""",
        (IDS["ict_plant"], "X-Ray Inspection Agreement", "attribute_agreement", IDS["void_pct"],
         IDS["eng_ict"], now))
    study3 = cur.lastrowid

    op_names3 = ["Priya Patel", "Maria Santos", "Ana Rodriguez"]
    ops3 = []
    for i, name in enumerate(op_names3):
        cur.execute("INSERT INTO msa_operator (study_id, name, sequence_order) VALUES (?, ?, ?)",
            (study3, name, i))
        ops3.append(cur.lastrowid)

    # Ground truth: 3 of 20 parts are actually defective
    part_truth = [False] * 17 + [True] * 3
    random.shuffle(part_truth)
    parts3 = []
    for i in range(20):
        cur.execute("INSERT INTO msa_part (study_id, name, reference_value, sequence_order) VALUES (?, ?, NULL, ?)",
            (study3, f"Panel-{i+1:02d}", i))
        parts3.append((cur.lastrowid, part_truth[i]))

    for op_idx, op_id in enumerate(ops3):
        for part_idx, (part_id, is_defective) in enumerate(parts3):
            for rep in range(2):
                if is_defective:
                    call = "fail" if random.random() < 0.85 else "pass"
                else:
                    call = "pass" if random.random() < 0.95 else "fail"
                cur.execute("""INSERT INTO msa_measurement
                    (study_id, operator_id, part_id, replicate_num, value, attribute_value, timestamp)
                    VALUES (?, ?, ?, ?, 0.0, ?, ?)""",
                    (study3, op_id, part_id, rep + 1, call, now))

    # Study 4: Bore Diameter Gage R&R — In Progress (Detroit, crossed_anova, collecting)
    # 3 operators x 10 parts x 3 reps planned = 90, but only ~50 measurements so far
    cur.execute("""INSERT INTO msa_study
        (plant_id, name, study_type, characteristic_id, num_operators, num_parts, num_replicates,
         tolerance, status, created_by, created_at, completed_at, results_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)""",
        (IDS["det_plant"], "Bore Diameter Gage R&R (In Progress)", "crossed_anova", IDS["bore_dia"],
         3, 10, 3, 0.050, "collecting", IDS["eng_det"], now))
    study4 = cur.lastrowid

    # Operators
    ops4 = []
    for i, name in enumerate(["David Kim", "Sarah Foster", "Carlos Reyes"]):
        cur.execute("INSERT INTO msa_operator (study_id, name, sequence_order) VALUES (?, ?, ?)",
            (study4, name, i))
        ops4.append(cur.lastrowid)

    # Parts: 10 parts spread around 50.000mm nominal +/- 0.012
    parts4 = []
    part4_refs = [50.000 + 0.012 * (i - 5) / 5 for i in range(10)]  # 49.988 to 50.012
    for i in range(10):
        cur.execute("INSERT INTO msa_part (study_id, name, reference_value, sequence_order) VALUES (?, ?, ?, ?)",
            (study4, f"Part-C{i+1:02d}", round(part4_refs[i], 4), i))
        parts4.append(cur.lastrowid)

    # Partial measurements: operator 1 complete (10 parts x 3 reps = 30),
    # operator 2 first 7 parts x 3 reps = 21, minus a few random skips = ~48-50 total
    random.seed(99)  # reproducible partial pattern
    for op_idx, op_id in enumerate(ops4):
        if op_idx == 0:
            # Operator 1: complete — all 10 parts x 3 reps
            for part_idx, part_id in enumerate(parts4):
                for rep in range(3):
                    base = part4_refs[part_idx]
                    op_bias = -0.0005
                    value = round(base + op_bias + random.gauss(0, 0.002), 4)
                    cur.execute("""INSERT INTO msa_measurement
                        (study_id, operator_id, part_id, replicate_num, value, attribute_value, timestamp)
                        VALUES (?, ?, ?, ?, ?, NULL, ?)""",
                        (study4, op_id, part_id, rep + 1, value, now))
        elif op_idx == 1:
            # Operator 2: first 7 parts, 3 reps each, minus 2 random skips
            skip_set = {(2, 1), (5, 2)}  # (part_index, rep) pairs to skip
            for part_idx in range(7):
                part_id = parts4[part_idx]
                for rep in range(3):
                    if (part_idx, rep) in skip_set:
                        continue
                    base = part4_refs[part_idx]
                    op_bias = 0.0003
                    value = round(base + op_bias + random.gauss(0, 0.002), 4)
                    cur.execute("""INSERT INTO msa_measurement
                        (study_id, operator_id, part_id, replicate_num, value, attribute_value, timestamp)
                        VALUES (?, ?, ?, ?, ?, NULL, ?)""",
                        (study4, op_id, part_id, rep + 1, value, now))
        # Operator 3: not started yet (no measurements)
    random.seed(42)  # restore global seed


def seed_fai(cur: sqlite3.Cursor) -> None:
    """3 FAI reports per design doc."""
    now = utcnow()

    # Report 1: Turbine Blade Rev C (Wichita, approved)
    cur.execute("""INSERT INTO fai_report
        (plant_id, part_number, part_name, revision, serial_number, lot_number, drawing_number,
         organization_name, supplier, purchase_order, reason_for_inspection,
         material_supplier, material_spec, special_processes, functional_test_results,
         status, created_by, created_at, submitted_by, submitted_at, approved_by, approved_at, rejection_reason)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)""",
        (IDS["ict_plant"], "TB-2026-001", "Turbine Blade Assembly", "C", "SN-TB-0042",
         "LOT-2026-W08", "DWG-TB-2026-001-C",
         "Titan Aerospace Inc.", "AeroParts Global Ltd.", "PO-2026-0157", "new_production",
         "Alcoa Aerospace", "AMS 4928 Ti-6Al-4V", "Heat treat (AMS 2770), NDT (ASTM E2375), Coating (AMS 2460)",
         "All functional tests passed per ATP-TB-001",
         "approved", IDS["eng_ict"], now, IDS["eng_ict"], now, IDS["sup_det"], now))
    fai1 = cur.lastrowid

    # 15 FAI items for Turbine Blade (14 pass, 1 rework)
    blade_items = [
        (1, "Blade Chord Length", 42.50, 42.75, 42.25, 42.48, "mm", "CMM", True, "pass"),
        (2, "Blade Span", 185.00, 185.50, 184.50, 184.95, "mm", "CMM", True, "pass"),
        (3, "Root Width", 28.00, 28.10, 27.90, 28.02, "mm", "CMM", True, "pass"),
        (4, "Tip Thickness", 1.20, 1.30, 1.10, 1.22, "mm", "Micrometer", True, "pass"),
        (5, "Leading Edge Radius", 0.80, 0.90, 0.70, 0.82, "mm", "Optical", True, "pass"),
        (6, "Trailing Edge Thickness", 0.50, 0.60, 0.40, 0.48, "mm", "Micrometer", True, "pass"),
        (7, "Root Fillet Radius", 3.00, 3.20, 2.80, 3.05, "mm", "CMM", True, "pass"),
        (8, "Surface Roughness Ra", 0.80, 1.60, None, 0.95, "um", "Profilometer", False, "pass"),
        (9, "Airfoil Profile", 0.00, 0.10, -0.10, 0.03, "mm", "CMM", True, "pass"),
        (10, "Twist Angle", 32.00, 32.50, 31.50, 32.15, "deg", "CMM", True, "pass"),
        (11, "Platform Height", 12.00, 12.15, 11.85, 12.08, "mm", "CMM", True, "pass"),
        (12, "Dovetail Width", 18.50, 18.60, 18.40, 18.52, "mm", "CMM", True, "pass"),
        (13, "Cooling Hole Diameter", 0.80, 0.85, 0.75, 0.78, "mm", "Pin Gauge", True, "deviation"),
        (14, "Weight", 145.0, 150.0, 140.0, 146.2, "g", "Scale", False, "pass"),
        (15, "Hardness HRC", 36.0, 40.0, 34.0, 37.5, "HRC", "Rockwell", False, "pass"),
    ]

    for balloon, name, nom, usl, lsl, actual, unit, tools, designed, result in blade_items:
        deviation = "Cooling hole 0.78mm below min 0.75mm — reworked per NCR-2026-042" if result == "deviation" else None
        cur.execute("""INSERT INTO fai_item
            (report_id, balloon_number, characteristic_name, nominal, usl, lsl, actual_value,
             unit, tools_used, designed_char, result, deviation_reason, characteristic_id, sequence_order)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)""",
            (fai1, balloon, name, nom, usl, lsl, actual, unit, tools,
             1 if designed else 0, result, deviation, balloon))

    # Report 2: Tablet Press Setup (RTP, submitted)
    cur.execute("""INSERT INTO fai_report
        (plant_id, part_number, part_name, revision, serial_number, lot_number, drawing_number,
         organization_name, supplier, purchase_order, reason_for_inspection,
         material_supplier, material_spec, special_processes, functional_test_results,
         status, created_by, created_at, submitted_by, submitted_at, approved_by, approved_at, rejection_reason)
        VALUES (?, ?, ?, ?, NULL, ?, NULL,
                ?, NULL, NULL, ?,
                ?, ?, NULL, NULL,
                'submitted', ?, ?, ?, ?, NULL, NULL, NULL)""",
        (IDS["rtp_plant"], "TP-500-R4", "Tablet Press Die Set", "R4", "LOT-2026-P12",
         "BioVerde Pharma Inc.", "equipment_qualification",
         "PharmaParts Direct", "316L Stainless Steel per ASTM A240",
         IDS["eng_rtp"], now, IDS["sup_rtp"], now))
    fai2 = cur.lastrowid

    tablet_items = [
        (1, "Die Bore Diameter", 12.000, 12.010, 11.990, 12.002, "mm", "Bore Gauge", True, "pass"),
        (2, "Punch Tip Flat", 8.000, 8.020, 7.980, 8.005, "mm", "Optical", True, "pass"),
        (3, "Die Wall Perpendicularity", 0.000, 0.005, None, 0.002, "mm", "CMM", True, "pass"),
        (4, "Surface Finish Ra", 0.200, 0.400, None, 0.250, "um", "Profilometer", False, "pass"),
        (5, "Compression Force Range", 15.0, 20.0, 10.0, 15.5, "kN", "Load Cell", True, "pass"),
        (6, "Tablet Thickness", 4.000, 4.200, 3.800, 4.050, "mm", "Micrometer", True, "pass"),
        (7, "Hardness", 8.0, 12.0, 6.0, 9.2, "kP", "Hardness Tester", True, "pass"),
        (8, "Weight Uniformity", 200.0, 205.0, 195.0, 200.3, "mg", "Analytical Balance", True, "pass"),
    ]

    for balloon, name, nom, usl, lsl, actual, unit, tools, designed, result in tablet_items:
        cur.execute("""INSERT INTO fai_item
            (report_id, balloon_number, characteristic_name, nominal, usl, lsl, actual_value,
             unit, tools_used, designed_char, result, deviation_reason, characteristic_id, sequence_order)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)""",
            (fai2, balloon, name, nom, usl, lsl, actual, unit, tools, 1 if designed else 0, result, balloon))

    # Report 3: Crankshaft Housing (Detroit, draft)
    cur.execute("""INSERT INTO fai_report
        (plant_id, part_number, part_name, revision, serial_number, lot_number, drawing_number,
         organization_name, supplier, purchase_order, reason_for_inspection,
         material_supplier, material_spec, special_processes, functional_test_results,
         status, created_by, created_at, submitted_by, submitted_at, approved_by, approved_at, rejection_reason)
        VALUES (?, ?, ?, ?, NULL, NULL, ?,
                ?, NULL, NULL, ?,
                ?, ?, ?, NULL,
                'draft', ?, ?, NULL, NULL, NULL, NULL, NULL)""",
        (IDS["det_plant"], "CH-8800-A", "Crankshaft Main Housing", "A", "DWG-CH-8800-A",
         "Precision Motors Inc.", "new_production",
         "US Steel", "SAE 4340 per AMS 6414", "Heat treat (AMS 2759), Magnaflux (ASTM E1444)",
         IDS["eng_det"], now))
    fai3 = cur.lastrowid

    housing_items = [
        (1, "Main Bore Diameter", 65.000, 65.025, 64.975, 65.008, "mm", "CMM", True, "pass"),
        (2, "Bearing Seat Width", 25.400, 25.425, 25.375, 25.412, "mm", "CMM", True, "pass"),
        (3, "Face Flatness", 0.000, 0.010, None, 0.004, "mm", "CMM", True, "pass"),
        (4, "Bolt Hole Pattern PCD", 82.000, 82.050, 81.950, None, "mm", "CMM", True, "fail"),
        (5, "Oil Gallery Diameter", 8.000, 8.030, 7.970, None, "mm", "Bore Gauge", True, "fail"),
        (6, "Surface Finish Main Bore", 0.400, 0.800, None, 0.520, "um", "Profilometer", False, "pass"),
        (7, "Parallelism Bearing Faces", 0.000, 0.015, None, None, "mm", "CMM", True, "fail"),
        (8, "Thread Depth M8", 12.000, 12.500, 11.500, 12.200, "mm", "Thread Gauge", True, "pass"),
        (9, "Dowel Pin Hole", 10.000, 10.010, 9.990, 10.003, "mm", "Pin Gauge", True, "pass"),
        (10, "Overall Length", 180.000, 180.100, 179.900, None, "mm", "CMM", True, "fail"),
        (11, "Weight", 4.200, 4.500, 3.900, 4.280, "kg", "Scale", False, "pass"),
        (12, "Hardness HRC", 28.0, 34.0, 24.0, 30.5, "HRC", "Rockwell", False, "pass"),
    ]

    for balloon, name, nom, usl, lsl, actual, unit, tools, designed, result in housing_items:
        cur.execute("""INSERT INTO fai_item
            (report_id, balloon_number, characteristic_name, nominal, usl, lsl, actual_value,
             unit, tools_used, designed_char, result, deviation_reason, characteristic_id, sequence_order)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)""",
            (fai3, balloon, name, nom, usl, lsl, actual, unit, tools, 1 if designed else 0, result, balloon))


# ── Wave 6: Compliance — Notifications, ERP, Retention, Audit ────────────


def seed_compliance(cur: sqlite3.Cursor) -> None:
    """Notifications, ERP connectors, retention policies, and audit trail."""
    now = utcnow()

    # ── SMTP Config ──
    cur.execute("""INSERT INTO smtp_config
        (server, port, username, password, use_tls, from_address, is_active, created_at, updated_at)
        VALUES ('smtp.company-internal.local', 587, 'cassini-notify', NULL, 1, 'cassini@company-internal.local', 0, ?, ?)""",
        (now, now))

    # ── Webhook Configs ──
    cur.execute("""INSERT INTO webhook_config
        (name, url, secret, is_active, retry_count, events_filter, created_at, updated_at)
        VALUES ('Slack Quality Alerts', 'https://hooks.slack-mock.local/cassini-alerts',
                'whsec_showcase_slack_secret_001', 1, 3, 'violation,anomaly', ?, ?)""",
        (now, now))

    cur.execute("""INSERT INTO webhook_config
        (name, url, secret, is_active, retry_count, events_filter, created_at, updated_at)
        VALUES ('ERP Quality Webhook', 'https://erp.precision-motors.local/api/webhooks/quality',
                'whsec_showcase_erp_secret_002', 1, 5, 'capability,fai', ?, ?)""",
        (now, now))

    # ── Notification Preferences ──
    # event_types: violation, anomaly, capability, fai, signature, system
    # channels: email, webhook, push
    # severity_filter: all, critical, warning

    prefs = [
        # Operators: violation only, critical
        (IDS["op_det"], "violation", "email", 1, "critical"),
        (IDS["op_ict"], "violation", "email", 1, "critical"),
        # Engineers: violation + anomaly + capability
        (IDS["eng_det"], "violation", "email", 1, "all"),
        (IDS["eng_det"], "anomaly", "email", 1, "all"),
        (IDS["eng_det"], "capability", "email", 1, "all"),
        (IDS["eng_ict"], "violation", "email", 1, "all"),
        (IDS["eng_ict"], "anomaly", "email", 1, "all"),
        (IDS["eng_ict"], "capability", "email", 1, "all"),
        (IDS["eng_rtp"], "violation", "email", 1, "all"),
        (IDS["eng_rtp"], "anomaly", "email", 1, "all"),
        (IDS["eng_rtp"], "capability", "email", 1, "all"),
        # Supervisors: violation + fai + signature
        (IDS["sup_det"], "violation", "email", 1, "warning"),
        (IDS["sup_det"], "fai", "email", 1, "all"),
        (IDS["sup_det"], "signature", "email", 1, "all"),
        (IDS["sup_rtp"], "violation", "email", 1, "warning"),
        (IDS["sup_rtp"], "fai", "email", 1, "all"),
        (IDS["sup_rtp"], "signature", "email", 1, "all"),
        # Admin: everything
        (IDS["admin"], "violation", "email", 1, "all"),
        (IDS["admin"], "anomaly", "email", 1, "all"),
        (IDS["admin"], "capability", "email", 1, "all"),
        (IDS["admin"], "fai", "email", 1, "all"),
        (IDS["admin"], "signature", "email", 1, "all"),
        (IDS["admin"], "system", "email", 1, "all"),
        (IDS["admin"], "violation", "webhook", 1, "all"),
        (IDS["admin"], "anomaly", "webhook", 1, "all"),
    ]

    for user_id, event_type, channel, enabled, severity in prefs:
        cur.execute("""INSERT INTO notification_preference
            (user_id, event_type, channel, is_enabled, severity_filter, created_at)
            VALUES (?, ?, ?, ?, ?, ?)""",
            (user_id, event_type, channel, enabled, severity, now))

    # ── Push Subscriptions ──
    # Admin — facility manager push subscription (Chrome on desktop)
    cur.execute("""INSERT INTO push_subscription
        (user_id, endpoint, p256dh_key, auth_key, created_at)
        VALUES (?, ?, ?, ?, ?)""",
        (IDS["admin"],
         "https://fcm.googleapis.com/fcm/send/dKx7rM3cQlE:APA91bHG4k9JdX7fV3Nq2_showcase_admin_push_sub_001",
         "BIjWxE3F0VmTk5hR9yL4oPqDsMcN6wA2bKfGjH8uYvXzW1eS0dP3iO7nM5lJ4kT6rQ9sU2vC8xB0aE",
         "tR7uW3xY9zA1bC5dE8fG",
         now))

    # Detroit supervisor — quality alerts push subscription (Chrome on mobile)
    cur.execute("""INSERT INTO push_subscription
        (user_id, endpoint, p256dh_key, auth_key, created_at)
        VALUES (?, ?, ?, ?, ?)""",
        (IDS["sup_det"],
         "https://fcm.googleapis.com/fcm/send/eL2mN8pQrS4:APA91bHK7j9RfY2wX5uT_showcase_supdet_push_sub_002",
         "BGkZpE8F1VnUl6iS0yM5pPrEtNdO7xB3cLfHkI9uZwX2eT1dQ4jO8nN6mK5lJ7kU3rS9tV2wD0aF",
         "hJ4kL7mN0pQ3rS6tU9w",
         now))

    # ── OIDC Config + Account Link (SSO demo) ──
    cur.execute("""INSERT INTO oidc_config
        (name, issuer_url, client_id, client_secret_encrypted, scopes, role_mapping,
         auto_provision, default_role, claim_mapping, end_session_endpoint, post_logout_redirect_uri,
         allowed_redirect_uris, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)""",
        ("Contoso Motors Azure AD",
         "https://login.microsoftonline.com/contoso-motors/v2.0",
         "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
         "gAAAAABn_encrypted_placeholder_for_showcase_demo_only",
         '["openid", "profile", "email", "groups"]',
         json.dumps({"SPC-Admins": {"*": "admin"}, "SPC-Engineers": {"*": "engineer"}, "SPC-Operators": {"*": "operator"}}),
         1, "operator",
         json.dumps({"email": "preferred_username", "name": "name", "groups": "groups"}),
         "https://login.microsoftonline.com/contoso-motors/oauth2/v2.0/logout",
         "http://localhost:5173",
         '["http://localhost:5173/auth/callback", "https://cassini.contoso-motors.com/auth/callback"]',
         now, now))
    oidc_provider_id = cur.lastrowid

    # Link admin user to Contoso Motors Azure AD
    cur.execute("""INSERT INTO oidc_account_link
        (user_id, provider_id, oidc_subject, linked_at)
        VALUES (?, ?, ?, ?)""",
        (IDS["admin"], oidc_provider_id, "00000000-0000-0000-0000-000000000042", now))

    # ── ERP Connectors ──

    # SAP Quality Management (Detroit)
    cur.execute("""INSERT INTO erp_connector
        (plant_id, name, connector_type, base_url, auth_type, auth_config, headers, is_active, status,
         last_sync_at, last_error, created_at, updated_at)
        VALUES (?, 'SAP Quality Management', 'sap_odata',
                'https://sap.precision-motors.local/sap/opu/odata/sap/API_QUALITYNOTIFICATION',
                'oauth2_client_credentials', '{}', '{}', 1, 'active',
                ?, NULL, ?, ?)""",
        (IDS["det_plant"], ts_offset(BASE_TIME, hours=-6), now, now))
    sap_conn = cur.lastrowid

    # SAP field mappings
    cur.execute("""INSERT INTO erp_field_mapping
        (connector_id, name, direction, erp_entity, erp_field_path, openspc_entity, openspc_field, transform, is_active)
        VALUES (?, 'Material Number', 'inbound', 'QualityNotification', 'MaterialNumber', 'characteristic', 'name', NULL, 1)""",
        (sap_conn,))
    cur.execute("""INSERT INTO erp_field_mapping
        (connector_id, name, direction, erp_entity, erp_field_path, openspc_entity, openspc_field, transform, is_active)
        VALUES (?, 'Inspection Lot Qty', 'inbound', 'QualityNotification', 'InspLotQuantity', 'sample', 'actual_n', NULL, 1)""",
        (sap_conn,))

    # SAP sync schedule
    cur.execute("""INSERT INTO erp_sync_schedule
        (connector_id, direction, cron_expression, is_active, last_run_at, next_run_at)
        VALUES (?, 'inbound', '0 */6 * * *', 1, ?, ?)""",
        (sap_conn, ts_offset(BASE_TIME, hours=-6), ts_offset(BASE_TIME, hours=0)))

    # SAP sync logs (2 successful)
    cur.execute("""INSERT INTO erp_sync_log
        (connector_id, direction, status, records_processed, records_failed, started_at, completed_at, error_message, detail)
        VALUES (?, 'inbound', 'success', 42, 0, ?, ?, NULL, NULL)""",
        (sap_conn, ts_offset(BASE_TIME, hours=-6), ts_offset(BASE_TIME, hours=-5, minutes=-58)))
    cur.execute("""INSERT INTO erp_sync_log
        (connector_id, direction, status, records_processed, records_failed, started_at, completed_at, error_message, detail)
        VALUES (?, 'inbound', 'success', 38, 0, ?, ?, NULL, NULL)""",
        (sap_conn, ts_offset(BASE_TIME, hours=-12), ts_offset(BASE_TIME, hours=-11, minutes=-57)))

    # QC LIMS (RTP)
    cur.execute("""INSERT INTO erp_connector
        (plant_id, name, connector_type, base_url, auth_type, auth_config, headers, is_active, status,
         last_sync_at, last_error, created_at, updated_at)
        VALUES (?, 'QC LIMS', 'generic_lims',
                'https://lims.bioverde.local/api/v2/results',
                'api_key', '{}', '{}', 1, 'active',
                ?, NULL, ?, ?)""",
        (IDS["rtp_plant"], ts_offset(BASE_TIME, hours=-2), now, now))
    lims_conn = cur.lastrowid

    # LIMS field mappings
    cur.execute("""INSERT INTO erp_field_mapping
        (connector_id, name, direction, erp_entity, erp_field_path, openspc_entity, openspc_field, transform, is_active)
        VALUES (?, 'Test Result', 'inbound', 'LabResult', 'test_value', 'sample', 'value', NULL, 1)""",
        (lims_conn,))
    cur.execute("""INSERT INTO erp_field_mapping
        (connector_id, name, direction, erp_entity, erp_field_path, openspc_entity, openspc_field, transform, is_active)
        VALUES (?, 'Sample ID', 'inbound', 'LabResult', 'sample_id', 'sample', 'batch_number', NULL, 1)""",
        (lims_conn,))

    # LIMS sync schedule
    cur.execute("""INSERT INTO erp_sync_schedule
        (connector_id, direction, cron_expression, is_active, last_run_at, next_run_at)
        VALUES (?, 'inbound', '0 */2 * * *', 1, ?, ?)""",
        (lims_conn, ts_offset(BASE_TIME, hours=-2), ts_offset(BASE_TIME, hours=0)))

    # LIMS sync logs (2 success, 1 failure)
    cur.execute("""INSERT INTO erp_sync_log
        (connector_id, direction, status, records_processed, records_failed, started_at, completed_at, error_message, detail)
        VALUES (?, 'inbound', 'success', 25, 0, ?, ?, NULL, NULL)""",
        (lims_conn, ts_offset(BASE_TIME, hours=-2), ts_offset(BASE_TIME, hours=-1, minutes=-58)))
    cur.execute("""INSERT INTO erp_sync_log
        (connector_id, direction, status, records_processed, records_failed, started_at, completed_at, error_message, detail)
        VALUES (?, 'inbound', 'success', 31, 0, ?, ?, NULL, NULL)""",
        (lims_conn, ts_offset(BASE_TIME, hours=-4), ts_offset(BASE_TIME, hours=-3, minutes=-57)))
    cur.execute("""INSERT INTO erp_sync_log
        (connector_id, direction, status, records_processed, records_failed, started_at, completed_at, error_message, detail)
        VALUES (?, 'inbound', 'failed', 0, 0, ?, NULL, 'Connection timeout after 30s', NULL)""",
        (lims_conn, ts_offset(BASE_TIME, hours=-6)))

    # ── Retention Policies ──

    # Detroit global: 2-year (730 days)
    cur.execute("""INSERT INTO retention_policy
        (plant_id, scope, hierarchy_id, characteristic_id, retention_type, retention_value, retention_unit, created_at, updated_at)
        VALUES (?, 'global', NULL, NULL, 'time_delta', 730, 'days', ?, ?)""",
        (IDS["det_plant"], now, now))

    # Detroit per-char: 500 samples on Bearing OD
    cur.execute("""INSERT INTO retention_policy
        (plant_id, scope, hierarchy_id, characteristic_id, retention_type, retention_value, retention_unit, created_at, updated_at)
        VALUES (?, 'characteristic', NULL, ?, 'sample_count', 500, NULL, ?, ?)""",
        (IDS["det_plant"], IDS["bearing_od"], now, now))

    # Wichita global: forever
    cur.execute("""INSERT INTO retention_policy
        (plant_id, scope, hierarchy_id, characteristic_id, retention_type, retention_value, retention_unit, created_at, updated_at)
        VALUES (?, 'global', NULL, NULL, 'forever', NULL, NULL, ?, ?)""",
        (IDS["ict_plant"], now, now))

    # RTP global: 7-year (2555 days)
    cur.execute("""INSERT INTO retention_policy
        (plant_id, scope, hierarchy_id, characteristic_id, retention_type, retention_value, retention_unit, created_at, updated_at)
        VALUES (?, 'global', NULL, NULL, 'time_delta', 2555, 'days', ?, ?)""",
        (IDS["rtp_plant"], now, now))

    # RTP API Manufacturing: 10-year (3650 days) hierarchy override
    cur.execute("""INSERT INTO retention_policy
        (plant_id, scope, hierarchy_id, characteristic_id, retention_type, retention_value, retention_unit, created_at, updated_at)
        VALUES (?, 'hierarchy', ?, NULL, 'time_delta', 3650, 'days', ?, ?)""",
        (IDS["rtp_plant"], IDS["rtp_api"], now, now))

    # ── Audit Trail (~50 entries) ──

    # Login events for all users (over past 7 days)
    users_info = [
        ("admin", "Sarah Chen", IDS["admin"]),
        ("eng.detroit", "Marcus Johnson", IDS["eng_det"]),
        ("eng.wichita", "Priya Patel", IDS["eng_ict"]),
        ("eng.pharma", "David Kim", IDS["eng_rtp"]),
        ("sup.detroit", "Ana Rodriguez", IDS["sup_det"]),
        ("sup.pharma", "James O'Brien", IDS["sup_rtp"]),
        ("op.floor1", "Tyler Washington", IDS["op_det"]),
        ("op.floor2", "Maria Santos", IDS["op_ict"]),
    ]

    # Multiple logins per user spread over past week
    for username, full_name, user_id in users_info:
        # 2-3 login events each
        for days_ago in random.sample(range(1, 8), min(3, 7)):
            ts = ts_offset(BASE_TIME, days=-days_ago, hours=-random.randint(0, 12))
            cur.execute("""INSERT INTO audit_log
                (user_id, username, action, resource_type, resource_id, detail, ip_address, user_agent, timestamp)
                VALUES (?, ?, 'login', 'session', NULL, ?, ?, ?, ?)""",
                (user_id, username, json.dumps({"method": "password"}),
                 f"10.0.{random.randint(1,3)}.{random.randint(10,250)}",
                 "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0", ts))

    # Characteristic edits by engineers
    for char_key, eng_key, eng_name in [
        ("bearing_od", "eng_det", "eng.detroit"),
        ("cure_temp", "eng_ict", "eng.wichita"),
        ("tablet_weight", "eng_rtp", "eng.pharma"),
    ]:
        ts = ts_offset(BASE_TIME, days=-3)
        cur.execute("""INSERT INTO audit_log
            (user_id, username, action, resource_type, resource_id, detail, ip_address, user_agent, timestamp)
            VALUES (?, ?, 'update', 'characteristic', ?, ?, ?, ?, ?)""",
            (IDS[eng_key], eng_name, IDS[char_key],
             json.dumps({"field": "ucl", "old_value": "25.035", "new_value": "25.030"}),
             "10.0.1.50", "Mozilla/5.0 Chrome/122.0", ts))

    # Sample submissions by operators
    for i in range(5):
        ts = ts_offset(BASE_TIME, days=-random.randint(1, 5))
        op = random.choice([("op_det", "op.floor1"), ("op_ict", "op.floor2")])
        cur.execute("""INSERT INTO audit_log
            (user_id, username, action, resource_type, resource_id, detail, ip_address, user_agent, timestamp)
            VALUES (?, ?, 'create', 'sample', ?, NULL, ?, ?, ?)""",
            (IDS[op[0]], op[1], random.randint(1, 100),
             f"10.0.{random.randint(1,3)}.{random.randint(10,250)}",
             "Mozilla/5.0 Chrome/122.0", ts))

    # FAI status changes
    for action_detail, days in [
        ({"status": "submitted", "report": "TB-2026-001"}, 5),
        ({"status": "approved", "report": "TB-2026-001", "approver": "sup.detroit"}, 4),
        ({"status": "submitted", "report": "TP-500-R4"}, 2),
    ]:
        ts = ts_offset(BASE_TIME, days=-days)
        cur.execute("""INSERT INTO audit_log
            (user_id, username, action, resource_type, resource_id, detail, ip_address, user_agent, timestamp)
            VALUES (?, ?, 'update', 'fai_report', ?, ?, ?, ?, ?)""",
            (IDS["eng_ict"], "eng.wichita", 1,
             json.dumps(action_detail), "10.0.2.30", "Mozilla/5.0 Chrome/122.0", ts))

    # Limit change approvals (signature events)
    for i in range(3):
        ts = ts_offset(BASE_TIME, days=-random.randint(1, 10))
        cur.execute("""INSERT INTO audit_log
            (user_id, username, action, resource_type, resource_id, detail, ip_address, user_agent, timestamp)
            VALUES (?, ?, 'sign', 'characteristic', ?, ?, ?, ?, ?)""",
            (IDS["sup_rtp"], "sup.pharma", IDS["tablet_weight"],
             json.dumps({"meaning": "approved", "workflow": "Spec Limit Change Approval"}),
             "10.0.3.15", "Mozilla/5.0 Chrome/122.0", ts))

    # Config changes by admin
    config_changes = [
        ("update", "smtp_config", 1, {"field": "is_active", "old": False, "new": True}),
        ("create", "webhook_config", 1, {"name": "Slack Quality Alerts"}),
        ("create", "webhook_config", 2, {"name": "ERP Quality Webhook"}),
        ("update", "password_policy", 1, {"field": "min_password_length", "old": 8, "new": 12}),
        ("create", "erp_connector", 1, {"name": "SAP Quality Management"}),
        ("create", "erp_connector", 2, {"name": "QC LIMS"}),
        ("update", "retention_policy", 1, {"scope": "global", "plant": "Detroit"}),
    ]

    for action, rtype, rid, detail in config_changes:
        ts = ts_offset(BASE_TIME, days=-random.randint(1, 14))
        cur.execute("""INSERT INTO audit_log
            (user_id, username, action, resource_type, resource_id, detail, ip_address, user_agent, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (IDS["admin"], "admin", action, rtype, rid,
             json.dumps(detail), "10.0.1.1", "Mozilla/5.0 Chrome/122.0", ts))


# ── Wave 7: Analytics — Multivariate, Predictions, DOE, AI ────────────────


def seed_analytics(cur: sqlite3.Cursor) -> None:
    """Seed multivariate groups, prediction configs, DOE studies, and AI insights."""
    now = utcnow()

    # ══════════════════════════════════════════════════════════════════════
    # Multivariate Groups
    # ══════════════════════════════════════════════════════════════════════

    # Group 1: Tablet Press Monitor (RTP, 3 characteristics)
    cur.execute("""INSERT INTO multivariate_group
        (plant_id, name, description, chart_type, lambda_param, alpha, phase,
         min_samples, is_active, created_at, updated_at)
        VALUES (?, 'Tablet Press Monitor',
                'Monitors weight, hardness, and thickness correlations on Press 501',
                't_squared', 0.1, 0.0027, 'phase_ii', 30, 1, ?, ?)""",
        (IDS["rtp_plant"], now, now))
    mv_group1 = cur.lastrowid

    for i, key in enumerate(["tablet_weight", "tablet_hardness", "tablet_thickness"]):
        cur.execute("""INSERT INTO multivariate_group_member
            (group_id, characteristic_id, display_order)
            VALUES (?, ?, ?)""", (mv_group1, IDS[key], i))

    # Group 2: Autoclave Monitor (Wichita, 2 characteristics)
    cur.execute("""INSERT INTO multivariate_group
        (plant_id, name, description, chart_type, lambda_param, alpha, phase,
         min_samples, is_active, created_at, updated_at)
        VALUES (?, 'Autoclave Monitor',
                'Temperature and pressure correlation on Autoclave Alpha',
                't_squared', 0.1, 0.0027, 'phase_ii', 30, 1, ?, ?)""",
        (IDS["ict_plant"], now, now))
    mv_group2 = cur.lastrowid

    for i, key in enumerate(["cure_temp", "cure_pressure"]):
        cur.execute("""INSERT INTO multivariate_group_member
            (group_id, characteristic_id, display_order)
            VALUES (?, ?, ?)""", (mv_group2, IDS[key], i))

    # Group 3: QC Lab (RTP, 2 characteristics — negative correlation)
    cur.execute("""INSERT INTO multivariate_group
        (plant_id, name, description, chart_type, lambda_param, alpha, phase,
         min_samples, is_active, created_at, updated_at)
        VALUES (?, 'QC Lab Purity Monitor',
                'Assay vs impurity negative correlation for batch release',
                'mewma', 0.15, 0.0027, 'phase_ii', 30, 1, ?, ?)""",
        (IDS["rtp_plant"], now, now))
    mv_group3 = cur.lastrowid

    for i, key in enumerate(["assay_pct", "impurity_level"]):
        cur.execute("""INSERT INTO multivariate_group_member
            (group_id, characteristic_id, display_order)
            VALUES (?, ?, ?)""", (mv_group3, IDS[key], i))

    # ══════════════════════════════════════════════════════════════════════
    # Prediction Configs + Pre-trained Models + Forecasts
    # ══════════════════════════════════════════════════════════════════════

    # Config 1: Bolt Torque (Detroit, drift pattern — ideal for forecasting)
    cur.execute("""INSERT INTO prediction_config
        (characteristic_id, is_enabled, model_type, forecast_horizon,
         refit_interval, confidence_levels, created_at, updated_at)
        VALUES (?, 1, 'exponential_smoothing', 20, 50, '[0.8, 0.95]', ?, ?)""",
        (IDS["bolt_torque"], now, now))

    cur.execute("""INSERT INTO prediction_model
        (characteristic_id, model_type, model_params, aic, training_samples,
         fitted_at, is_current)
        VALUES (?, 'exponential_smoothing', ?, 152.3, 200, ?, 1)""",
        (IDS["bolt_torque"],
         json.dumps({"alpha": 0.15, "beta": 0.02, "type": "holt"}), now))
    model1 = cur.lastrowid

    # 20 forecast points — bolt_torque drifts upward, crosses UCL=47.5 at step 17
    # "Bad cone": 95% band breaches UCL by step 5, predicted line crosses at step 17
    base_fc = 46.5
    bolt_ucl = 47.5
    for step in range(1, 21):
        pred = base_fc + 0.06 * step
        sigma_s = 0.25 * math.sqrt(step)
        ooc = pred > bolt_ucl
        cur.execute("""INSERT INTO forecast
            (model_id, characteristic_id, step, predicted_value,
             lower_80, upper_80, lower_95, upper_95, predicted_ooc, generated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (model1, IDS["bolt_torque"], step,
             round(pred, 3),
             round(pred - 1.28 * sigma_s, 3), round(pred + 1.28 * sigma_s, 3),
             round(pred - 1.96 * sigma_s, 3), round(pred + 1.96 * sigma_s, 3),
             1 if ooc else 0, now))

    # Config 2: Dissolution (RTP, drift pattern)
    cur.execute("""INSERT INTO prediction_config
        (characteristic_id, is_enabled, model_type, forecast_horizon,
         refit_interval, confidence_levels, created_at, updated_at)
        VALUES (?, 1, 'auto', 20, 50, '[0.8, 0.95]', ?, ?)""",
        (IDS["dissolution"], now, now))

    cur.execute("""INSERT INTO prediction_model
        (characteristic_id, model_type, model_params, aic, training_samples,
         fitted_at, is_current)
        VALUES (?, 'arima', ?, 185.7, 200, ?, 1)""",
        (IDS["dissolution"],
         json.dumps({"order": [1, 1, 1], "seasonal_order": [0, 0, 0, 0]}), now))
    model2 = cur.lastrowid

    # "Good cone": stable process, narrow parallel bands within UCL=90/LCL=80
    # Constant sigma — well-characterized process with no trend uncertainty
    base_diss = 85.5
    for step in range(1, 21):
        pred = base_diss + 0.01 * step  # Nearly flat trend
        sigma_s = 0.5  # Constant — no flare, visually distinct from bad cone
        cur.execute("""INSERT INTO forecast
            (model_id, characteristic_id, step, predicted_value,
             lower_80, upper_80, lower_95, upper_95, predicted_ooc, generated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)""",
            (model2, IDS["dissolution"], step,
             round(pred, 3),
             round(pred - 1.28 * sigma_s, 3), round(pred + 1.28 * sigma_s, 3),
             round(pred - 1.96 * sigma_s, 3), round(pred + 1.96 * sigma_s, 3),
             now))

    # ══════════════════════════════════════════════════════════════════════
    # DOE Study (Detroit, Full Factorial 2^3, Analyzed)
    # ══════════════════════════════════════════════════════════════════════

    cur.execute("""INSERT INTO doe_study
        (plant_id, name, design_type, resolution, status, response_name, response_unit,
         notes, created_by, created_at, updated_at)
        VALUES (?, 'Injection Molding Optimization', 'full_factorial', NULL, 'pending_calc',
                'Tensile Strength', 'MPa',
                'Full 2^3 factorial to optimize tensile strength of injection-molded housings.',
                ?, ?, ?)""",
        (IDS["det_plant"], IDS["eng_det"], now, now))
    study_id = cur.lastrowid

    factors_def = [
        ("Temperature", 180.0, 220.0, 200.0, "°C", 1),
        ("Pressure", 40.0, 60.0, 50.0, "bar", 2),
        ("Cooling Rate", 5.0, 15.0, 10.0, "°C/min", 3),
    ]
    for name, low, high, center, unit, order in factors_def:
        cur.execute("""INSERT INTO doe_factor
            (study_id, name, low_level, high_level, center_point, unit, display_order)
            VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (study_id, name, low, high, center, unit, order))

    # 8 runs (2^3): model y = 65 + 5*x1 + 3*x2 - 2*x3 + 1.5*x1*x2 - 0.8*x1*x3
    # Status is 'pending_calc' — finalize_calculations() will run analysis
    doe_design = [
        (-1, -1, -1), (+1, -1, -1), (-1, +1, -1), (+1, +1, -1),
        (-1, -1, +1), (+1, -1, +1), (-1, +1, +1), (+1, +1, +1),
    ]
    run_order = list(range(8))
    random.shuffle(run_order)

    for run_idx, std_idx in enumerate(run_order):
        x1, x2, x3 = doe_design[std_idx]
        y = round(65.0 + 5.0 * x1 + 3.0 * x2 - 2.0 * x3
                  + 1.5 * x1 * x2 - 0.8 * x1 * x3 + random.gauss(0, 0.8), 2)
        # factor_values stores actual values (matching DOEEngine.generate_design)
        actual_vals = {"Temperature": 200.0 + 20.0 * x1,
                       "Pressure": 50.0 + 10.0 * x2,
                       "Cooling Rate": 10.0 + 5.0 * x3}
        fv_json = json.dumps(actual_vals)
        fa_json = json.dumps(actual_vals)
        cur.execute("""INSERT INTO doe_run
            (study_id, run_order, standard_order, factor_values, factor_actuals,
             response_value, is_center_point, replicate, notes, completed_at)
            VALUES (?, ?, ?, ?, ?, ?, 0, 1, NULL, ?)""",
            (study_id, run_idx + 1, std_idx + 1, fv_json, fa_json, y, now))

    # Second DOE study — draft status (Detroit, for demonstrating the design flow)
    cur.execute("""INSERT INTO doe_study
        (plant_id, name, design_type, resolution, status, response_name, response_unit,
         notes, created_by, created_at, updated_at)
        VALUES (?, 'Surface Roughness Screening', 'fractional_factorial', 3, 'design',
                'Surface Roughness Ra', 'µm',
                'Screening study to identify key factors affecting surface finish quality.',
                ?, ?, ?)""",
        (IDS["det_plant"], IDS["eng_det"], now, now))
    study2_id = cur.lastrowid
    for name, low, high, center, unit, order in [
        ("Feed Rate", 0.05, 0.15, 0.10, "mm/rev", 1),
        ("Spindle Speed", 800, 1600, 1200, "RPM", 2),
        ("Depth of Cut", 0.5, 2.0, 1.25, "mm", 3),
        ("Tool Nose Radius", 0.4, 1.2, 0.8, "mm", 4),
    ]:
        cur.execute("""INSERT INTO doe_factor
            (study_id, name, low_level, high_level, center_point, unit, display_order)
            VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (study2_id, name, low, high, center, unit, order))

    # ══════════════════════════════════════════════════════════════════════
    # AI Config + Pre-seeded Insights
    # ══════════════════════════════════════════════════════════════════════

    # AI config for Wichita (placeholder — no real API key)
    cur.execute("""INSERT INTO ai_provider_config
        (plant_id, provider_type, api_key, model_name, max_tokens, is_enabled,
         created_at, updated_at)
        VALUES (?, 'claude', NULL, 'claude-sonnet-4-20250514', 1024, 0, ?, ?)""",
        (IDS["ict_plant"], now, now))

    # Pre-seeded insight for cure_temp (read-path demo without live LLM)
    insight_summary = (
        "Analysis of 500 Cure Temperature samples reveals a subtle but significant "
        "process shift around sample 310, consistent with gradual heater element "
        "degradation. The process was corrected at sample 350 and has since returned "
        "to stable operation with improved variability."
    )
    patterns = json.dumps([
        "Mean shift of +0.4°C detected starting at sample 310, exceeding 2σ threshold",
        "Increased variability during shift period (σ rose from 0.30°C to 0.35°C)",
        "Process returned to baseline after corrective action at sample 350",
        "Post-correction shows tighter control (σ=0.28°C vs pre-shift σ=0.30°C)",
    ])
    risks = json.dumps([
        "Heater element degradation consistent with early-stage thermal fatigue",
        "Without intervention, projected 5% OOS rate within 200 additional samples",
        "Similar degradation observed in literature for autoclave systems at 2000-hr intervals",
    ])
    recommendations = json.dumps([
        "Schedule preventive heater element replacement during next maintenance window",
        "Implement tighter EWMA monitoring (λ=0.1) for earlier drift detection",
        "Consider adding a redundant thermocouple for real-time cross-validation",
        "Review maintenance logs to establish optimal heater replacement interval",
    ])
    cur.execute("""INSERT INTO ai_insight
        (characteristic_id, provider_type, model_name, context_hash,
         summary, patterns, risks, recommendations,
         tokens_used, latency_ms, generated_at)
        VALUES (?, 'claude', 'claude-sonnet-4-20250514', ?,
                ?, ?, ?, ?, 1842, 3200, ?)""",
        (IDS["cure_temp"],
         hashlib.sha256(f"cure_temp:500".encode()).hexdigest(),
         insight_summary, patterns, risks, recommendations, now))

    # AI config for RTP as well
    cur.execute("""INSERT INTO ai_provider_config
        (plant_id, provider_type, api_key, model_name, max_tokens, is_enabled,
         created_at, updated_at)
        VALUES (?, 'claude', NULL, 'claude-sonnet-4-20250514', 1024, 0, ?, ?)""",
        (IDS["rtp_plant"], now, now))

    # ── Additional Anomaly Configs for Correlated Characteristics ────────

    for char_key, pelt, iforest, ks in [
        ("tablet_hardness", True, True, True),
        ("cure_pressure", False, False, True),
        ("assay_pct", True, True, True),
    ]:
        cur.execute("""INSERT INTO anomaly_detector_config
            (char_id, is_enabled,
             pelt_enabled, pelt_model, pelt_penalty, pelt_min_segment,
             iforest_enabled, iforest_contamination, iforest_n_estimators,
             iforest_min_training, iforest_retrain_interval,
             ks_enabled, ks_reference_window, ks_test_window, ks_alpha,
             notify_on_changepoint, notify_on_anomaly_score,
             notify_on_distribution_shift, anomaly_score_threshold,
             created_at, updated_at)
            VALUES (?, 1,
                    ?, 'rbf', 'bic', 25,
                    ?, 0.05, 100, 50, 100,
                    ?, 100, 50, 0.05,
                    ?, ?, ?,
                    0.7, ?, ?)""",
            (IDS[char_key],
             1 if pelt else 0, 1 if iforest else 0, 1 if ks else 0,
             1 if pelt else 0, 1 if iforest else 0, 1 if ks else 0,
             now, now))


_log = logging.getLogger("seed_showcase")


def seed_dummy_server() -> None:
    """Configure the dummy server at localhost:3000 for live data generation.
    Fails gracefully if the server is unavailable."""
    _log.info("Configuring dummy server at %s ...", DUMMY_SERVER_URL)

    ok, msg = api_call("GET", "/status")
    if not ok:
        _log.warning("Dummy server not reachable at %s (%s)", DUMMY_SERVER_URL, msg)
        _log.info("SQLite seed is complete. Start the dummy server later for live connectivity.")
        return

    _log.info("Dummy server reachable. Pushing configuration...")

    # ── Project config (matches ProjectConfig schema) ─────────────────
    # OPC-UA nodes as tree: folder → variable children
    opcua_nodes = [
        {"id": "Detroit", "name": "Detroit", "type": "folder", "children": [
            {"id": "Detroit.BearingOD", "name": "BearingOD", "type": "variable", "dataType": "Double", "initialValue": 25.000},
            {"id": "Detroit.SurfaceFinish", "name": "SurfaceFinish", "type": "variable", "dataType": "Double", "initialValue": 1.200},
            {"id": "Detroit.BoreDiameter", "name": "BoreDiameter", "type": "variable", "dataType": "Double", "initialValue": 50.000},
            {"id": "Detroit.PinHeight", "name": "PinHeight", "type": "variable", "dataType": "Double", "initialValue": 12.700},
        ]},
        {"id": "Wichita", "name": "Wichita", "type": "folder", "children": [
            {"id": "Wichita.CureTemp", "name": "CureTemp", "type": "variable", "dataType": "Double", "initialValue": 177.0},
            {"id": "Wichita.BladeProfile", "name": "BladeProfile", "type": "variable", "dataType": "Double", "initialValue": 2.150},
            {"id": "Wichita.RivetGrip", "name": "RivetGrip", "type": "variable", "dataType": "Double", "initialValue": 6.350},
        ]},
        {"id": "RTP", "name": "RTP", "type": "folder", "children": [
            {"id": "RTP.APIConcentration", "name": "APIConcentration", "type": "variable", "dataType": "Double", "initialValue": 99.50},
            {"id": "RTP.TabletWeight", "name": "TabletWeight", "type": "variable", "dataType": "Double", "initialValue": 200.0},
            {"id": "RTP.FillVolume", "name": "FillVolume", "type": "variable", "dataType": "Double", "initialValue": 5.000},
        ]},
    ]

    # MQTT topics as typed objects with payload schema
    mqtt_topic_defs = [
        {"id": "det-machining", "topic": "detroit/machining/measurements",
         "payloadSchema": [{"key": "value", "type": "number"}], "qos": 0, "publishOnChange": False},
        {"id": "det-assembly", "topic": "detroit/assembly/measurements",
         "payloadSchema": [{"key": "value", "type": "number"}], "qos": 0, "publishOnChange": False},
        {"id": "det-paint", "topic": "detroit/paint/measurements",
         "payloadSchema": [{"key": "value", "type": "number"}], "qos": 0, "publishOnChange": False},
        {"id": "ict-composite", "topic": "wichita/composite/measurements",
         "payloadSchema": [{"key": "value", "type": "number"}], "qos": 0, "publishOnChange": False},
        {"id": "ict-ndt", "topic": "wichita/ndt/measurements",
         "payloadSchema": [{"key": "value", "type": "number"}], "qos": 0, "publishOnChange": False},
        {"id": "rtp-api-mfg", "topic": "rtp/api-mfg/measurements",
         "payloadSchema": [{"key": "value", "type": "number"}], "qos": 0, "publishOnChange": False},
        {"id": "rtp-formulation", "topic": "rtp/formulation/measurements",
         "payloadSchema": [{"key": "value", "type": "number"}], "qos": 0, "publishOnChange": False},
        {"id": "rtp-packaging", "topic": "rtp/packaging/measurements",
         "payloadSchema": [{"key": "value", "type": "number"}], "qos": 0, "publishOnChange": False},
        {"id": "rtp-qc-lab", "topic": "rtp/qc-lab/measurements",
         "payloadSchema": [{"key": "value", "type": "number"}], "qos": 0, "publishOnChange": False},
    ]

    config = {
        "name": "cassini-showcase",
        "opcua": {"port": 4840, "nodes": opcua_nodes},
        "mqtt": {"port": 1883, "topics": mqtt_topic_defs},
        "metadata": {
            "partIdPattern": "PART-{seq:0000}",
            "machineId": "SHOWCASE-001",
            "operatorId": "OP-001",
            "customFields": {},
        },
    }
    ok, msg = api_call("PUT", "/config/current", config)
    if ok:
        _log.info("Configuration pushed to dummy server.")
    else:
        _log.warning("Config push failed: %s", msg)
        return

    # ── OPC-UA generators (one call per node) ─────────────────────────
    opcua_gens = [
        ("Detroit.BearingOD", {"mode": "drift", "nominal": 25.000, "stdDev": 0.008, "rateMs": 2000}),
        ("Detroit.SurfaceFinish", {"mode": "normal", "nominal": 1.200, "stdDev": 0.050, "rateMs": 2000}),
        ("Detroit.BoreDiameter", {"mode": "normal", "nominal": 50.000, "stdDev": 0.005, "rateMs": 2000}),
        ("Detroit.PinHeight", {"mode": "normal", "nominal": 12.700, "stdDev": 0.010, "rateMs": 2000}),
        ("Wichita.CureTemp", {"mode": "drift", "nominal": 177.0, "stdDev": 0.30, "rateMs": 3000}),
        ("Wichita.BladeProfile", {"mode": "normal", "nominal": 2.150, "stdDev": 0.015, "rateMs": 2000}),
        ("Wichita.RivetGrip", {"mode": "normal", "nominal": 6.350, "stdDev": 0.010, "rateMs": 2000}),
        ("RTP.APIConcentration", {"mode": "normal", "nominal": 99.50, "stdDev": 0.15, "rateMs": 2000}),
        ("RTP.TabletWeight", {"mode": "normal", "nominal": 200.0, "stdDev": 0.50, "rateMs": 2000}),
        ("RTP.FillVolume", {"mode": "sine", "nominal": 5.000, "stdDev": 0.015, "rateMs": 2000}),
    ]

    opcua_ok, opcua_fail = 0, 0
    for node_id, gen_config in opcua_gens:
        ok, msg = api_call("POST", "/opcua/generate/start", {"nodeId": node_id, "config": gen_config})
        if ok:
            opcua_ok += 1
        else:
            opcua_fail += 1
            _log.warning("OPC-UA generator %s failed: %s", node_id, msg)
    _log.info("OPC-UA generators: %d started, %d failed", opcua_ok, opcua_fail)

    # ── MQTT generators (one call per topic) ──────────────────────────
    # topicId references the "id" from mqtt_topic_defs above
    mqtt_gens = [
        ("det-machining", {"mode": "normal", "nominal": 25.000, "stdDev": 0.008, "rateMs": 2000}),
        ("det-assembly", {"mode": "normal", "nominal": 35.0, "stdDev": 0.5, "rateMs": 2000}),
        ("det-paint", {"mode": "normal", "nominal": 2.5, "stdDev": 0.3, "rateMs": 3000}),
        ("ict-composite", {"mode": "normal", "nominal": 0.125, "stdDev": 0.003, "rateMs": 2000}),
        ("ict-ndt", {"mode": "normal", "nominal": 1.5, "stdDev": 0.2, "rateMs": 3000}),
        ("rtp-api-mfg", {"mode": "normal", "nominal": 99.50, "stdDev": 0.15, "rateMs": 2000}),
        ("rtp-formulation", {"mode": "normal", "nominal": 200.0, "stdDev": 0.50, "rateMs": 2000}),
        ("rtp-packaging", {"mode": "normal", "nominal": 5.000, "stdDev": 0.015, "rateMs": 2000}),
        ("rtp-qc-lab", {"mode": "normal", "nominal": 99.0, "stdDev": 0.3, "rateMs": 3000}),
    ]

    mqtt_ok, mqtt_fail = 0, 0
    for topic_id, gen_config in mqtt_gens:
        ok, msg = api_call("POST", "/mqtt/generate/start", {"topicId": topic_id, "config": gen_config})
        if ok:
            mqtt_ok += 1
        else:
            mqtt_fail += 1
            _log.warning("MQTT generator %s failed: %s", topic_id, msg)
    _log.info("MQTT generators: %d started, %d failed", mqtt_ok, mqtt_fail)
    _log.info("Dummy server configuration complete!")


# ── Finalize: run engines on raw seed data ────────────────────────────────


def finalize_calculations(cur: sqlite3.Cursor) -> None:
    """Run the real calculation engines on seeded raw data.

    Finds all studies/analyses in 'pending_calc' status, loads their raw
    data from the DB, runs the same engines the API uses, and stores the
    computed results.  This guarantees stored values always match what
    Show Your Work will recalculate.
    """
    import math

    now = utcnow()

    # ── Characteristic UCL/LCL ────────────────────────────────────────
    # Recompute from stored_sigma + stored_center_line + subgroup_size
    # so they match the explain endpoint's recalculation exactly.
    # Only for standard Shewhart charts (skip CUSUM/EWMA which compute
    # their own limits, and attribute charts which have no stored sigma).

    cur.execute(
        "SELECT id, subgroup_size, stored_sigma, stored_center_line, chart_type "
        "FROM characteristic "
        "WHERE stored_sigma IS NOT NULL AND stored_center_line IS NOT NULL "
        "AND data_type='variable'"
    )
    for char_id, n, sigma, center, chart_type in cur.fetchall():
        if chart_type in ("cusum", "ewma"):
            continue
        n = n or 1
        sigma_for_limits = sigma / math.sqrt(n) if n > 1 else sigma
        ucl = center + 3 * sigma_for_limits
        lcl = center - 3 * sigma_for_limits
        cur.execute(
            "UPDATE characteristic SET ucl=?, lcl=? WHERE id=?",
            (ucl, lcl, char_id),
        )

    # ── MSA studies ──────────────────────────────────────────────────────

    engine = GageRREngine()
    attr_engine = AttributeMSAEngine()

    cur.execute(
        "SELECT id, study_type, num_operators, num_parts, num_replicates, tolerance "
        "FROM msa_study WHERE status='pending_calc'"
    )
    pending_msa = cur.fetchall()

    for sid, stype, n_ops, n_parts, n_reps, tolerance in pending_msa:
        # Load operator/part IDs in sequence order
        cur.execute(
            "SELECT id FROM msa_operator WHERE study_id=? ORDER BY sequence_order",
            (sid,),
        )
        op_ids = [r[0] for r in cur.fetchall()]
        cur.execute(
            "SELECT id FROM msa_part WHERE study_id=? ORDER BY sequence_order",
            (sid,),
        )
        part_ids = [r[0] for r in cur.fetchall()]

        op_index = {oid: i for i, oid in enumerate(op_ids)}
        part_index = {pid: i for i, pid in enumerate(part_ids)}

        if stype in ("crossed_anova", "range_method", "nested_anova"):
            # Variable study — build float 3D array
            data_3d: list[list[list[float | None]]] = [
                [[None] * n_reps for _ in range(n_parts)]
                for _ in range(n_ops)
            ]
            cur.execute(
                "SELECT operator_id, part_id, replicate_num, value "
                "FROM msa_measurement WHERE study_id=?",
                (sid,),
            )
            for oid, pid, rep, val in cur.fetchall():
                oi, pi = op_index.get(oid), part_index.get(pid)
                if oi is not None and pi is not None:
                    data_3d[oi][pi][rep - 1] = val

            if stype == "crossed_anova":
                result = engine.calculate_crossed_anova(data_3d, tolerance)  # type: ignore[arg-type]
            elif stype == "range_method":
                result = engine.calculate_range_method(data_3d, tolerance)  # type: ignore[arg-type]
            else:
                result = engine.calculate_nested_anova(data_3d, tolerance)  # type: ignore[arg-type]

            cur.execute(
                "UPDATE msa_study SET status='complete', completed_at=?, results_json=? "
                "WHERE id=?",
                (now, json.dumps(asdict(result)), sid),
            )

        elif stype == "attribute_agreement":
            # Attribute study — build string 3D array
            attr_3d: list[list[list[str | None]]] = [
                [[None] * n_reps for _ in range(n_parts)]
                for _ in range(n_ops)
            ]
            cur.execute(
                "SELECT operator_id, part_id, replicate_num, attribute_value "
                "FROM msa_measurement WHERE study_id=?",
                (sid,),
            )
            for oid, pid, rep, val in cur.fetchall():
                oi, pi = op_index.get(oid), part_index.get(pid)
                if oi is not None and pi is not None:
                    attr_3d[oi][pi][rep - 1] = val

            cur.execute(
                "SELECT name FROM msa_operator WHERE study_id=? ORDER BY sequence_order",
                (sid,),
            )
            op_names = [r[0] for r in cur.fetchall()]

            result = attr_engine.calculate(attr_3d, operator_names=op_names)  # type: ignore[arg-type]

            cur.execute(
                "UPDATE msa_study SET status='complete', completed_at=?, results_json=? "
                "WHERE id=?",
                (now, json.dumps(asdict(result)), sid),
            )

    # ── DOE analyses ─────────────────────────────────────────────────────

    import numpy as np
    from cassini.core.doe.analysis import (
        compute_anova,
        compute_interactions,
        compute_main_effects,
    )
    from itertools import combinations

    cur.execute(
        "SELECT id, design_type FROM doe_study WHERE status='pending_calc'"
    )
    pending_doe = cur.fetchall()

    for study_id, design_type in pending_doe:
        # Load factor definitions
        cur.execute(
            "SELECT name, low_level, high_level, center_point "
            "FROM doe_factor WHERE study_id=? ORDER BY display_order",
            (study_id,),
        )
        factors = cur.fetchall()
        if not factors:
            continue
        factor_names = [f[0] for f in factors]
        factor_defs = [
            {"name": f[0], "low_level": f[1], "high_level": f[2], "center_point": f[3]}
            for f in factors
        ]

        # Load runs with responses
        cur.execute(
            "SELECT factor_values, response_value FROM doe_run "
            "WHERE study_id=? AND response_value IS NOT NULL "
            "ORDER BY standard_order",
            (study_id,),
        )
        runs = cur.fetchall()
        if not runs:
            continue

        # Build design matrix by converting actual values → coded
        # (mirrors DOEEngine.analyze)
        design_rows = []
        response_vals = []
        for fv_json, resp in runs:
            fv = json.loads(fv_json)
            row = []
            for fdef in factor_defs:
                low = fdef["low_level"]
                high = fdef["high_level"]
                center = fdef["center_point"] or (low + high) / 2.0
                half_range = (high - low) / 2.0
                if half_range > 0:
                    actual_val = fv.get(fdef["name"], center)
                    row.append((actual_val - center) / half_range)
                else:
                    row.append(0.0)
            design_rows.append(row)
            response_vals.append(float(resp))

        design_mat = np.array(design_rows)
        response_arr = np.array(response_vals)
        grand_mean = float(np.mean(response_arr))

        # Compute full-model MSE (same as DOEEngine.analyze)
        n_obs, k = design_mat.shape
        int_pairs = list(combinations(range(k), 2))
        cols = [np.ones(n_obs)]
        for c in range(k):
            cols.append(design_mat[:, c])
        for i, j in int_pairs:
            cols.append(design_mat[:, i] * design_mat[:, j])
        X_full = np.column_stack(cols)
        df_resid_full = n_obs - X_full.shape[1]

        beta = np.linalg.lstsq(X_full, response_arr, rcond=None)[0]
        resid = response_arr - X_full @ beta
        ss_resid = float(np.sum(resid ** 2))
        mse_full = ss_resid / df_resid_full if df_resid_full > 0 else max(ss_resid, 1e-30)

        effects = compute_main_effects(
            design_mat, response_arr, factor_names,
            mse_override=mse_full, df_resid_override=df_resid_full,
        )
        interactions = compute_interactions(
            design_mat, response_arr, factor_names,
            mse_override=mse_full, df_resid_override=df_resid_full,
        )
        anova = compute_anova(design_mat, response_arr, factor_names)

        anova_json = json.dumps([
            {"source": row.source, "df": row.df,
             "sum_of_squares": row.sum_of_squares,
             "mean_square": row.mean_square,
             "f_value": row.f_value, "p_value": row.p_value}
            for row in anova.rows
        ])
        effects_json = json.dumps([
            {"factor_name": e.factor_name, "effect": e.effect,
             "coefficient": e.coefficient,
             "sum_of_squares": e.sum_of_squares,
             "t_statistic": e.t_statistic,
             "p_value": e.p_value, "significant": e.significant}
            for e in effects
        ])
        interactions_json = json.dumps([
            {"factors": list(ix.factors), "effect": ix.effect,
             "coefficient": ix.coefficient,
             "sum_of_squares": ix.sum_of_squares,
             "t_statistic": ix.t_statistic,
             "p_value": ix.p_value, "significant": ix.significant}
            for ix in interactions
        ])

        cur.execute("""INSERT INTO doe_analysis
            (study_id, anova_table, effects, interactions, r_squared, adj_r_squared,
             regression_model, optimal_settings, grand_mean, computed_at)
            VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)""",
            (study_id, anova_json, effects_json, interactions_json,
             anova.r_squared, anova.adj_r_squared, grand_mean, now))

        cur.execute(
            "UPDATE doe_study SET status='analyzed', updated_at=? WHERE id=?",
            (now, study_id),
        )


# ── Async entry point (DevTools page) ─────────────────────────────────────

async def seed() -> None:
    """Entry point for DevTools page. Wipes cassini.db and re-seeds."""
    db_path = backend_dir / "cassini.db"

    # Drop all existing tables in-place (avoids Windows file-lock on unlink)
    if db_path.exists():
        _conn = sqlite3.connect(str(db_path))
        _cur = _conn.cursor()
        _cur.execute("PRAGMA foreign_keys=OFF")
        _cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
        for (tbl,) in _cur.fetchall():
            _cur.execute(f"DROP TABLE IF EXISTS [{tbl}]")
        _conn.commit()
        _conn.close()

    # Run alembic migrations in subprocess (needs sync driver URL)
    print("Running Alembic migrations...")
    env = {**os.environ, "CASSINI_DATABASE_URL": f"sqlite:///{db_path.resolve()}"}
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=str(backend_dir),
        capture_output=True, text=True,
        env=env,
    )
    if result.returncode != 0:
        raise RuntimeError(f"Alembic migration failed: {result.stderr}")
    print("Migrations complete.")

    conn = sqlite3.connect(str(db_path))
    cur = conn.cursor()
    cur.execute("PRAGMA journal_mode=WAL")
    cur.execute("PRAGMA synchronous=NORMAL")
    cur.execute("PRAGMA foreign_keys=ON")

    # Remove "Default Plant" created by Alembic migration
    cur.execute("DELETE FROM hierarchy WHERE plant_id IN (SELECT id FROM plant WHERE code='DEFAULT')")
    cur.execute("DELETE FROM user_plant_role WHERE plant_id IN (SELECT id FROM plant WHERE code='DEFAULT')")
    cur.execute("DELETE FROM plant WHERE code='DEFAULT'")

    print("Seeding foundation (plants, hierarchy, users)...")
    seed_foundation(cur)
    print("Seeding characteristics...")
    seed_characteristics(cur)
    print("Seeding rule presets...")
    seed_rules(cur)
    print("Seeding variable samples...")
    seed_variable_samples(cur)
    print("Seeding attribute samples...")
    seed_attribute_samples(cur)
    print("Seeding narrative arcs...")
    seed_narrative_arcs(cur)
    print("Applying correlated data overrides (4 groups, 7 chars)...")
    seed_correlated_overrides(cur)
    print("Replaying SPC engine for organic violations...")
    replay_spc_violations(cur)
    print("Seeding capability history and annotations...")
    seed_capability_and_annotations(cur)
    print("Seeding connectivity (MQTT, OPC-UA, data sources)...")
    seed_connectivity(cur)
    print("Seeding gage bridges...")
    seed_gage_bridges(cur)
    print("Seeding anomaly detection...")
    seed_anomaly(cur)
    print("Seeding electronic signatures...")
    seed_signatures(cur)
    print("Seeding MSA studies...")
    seed_msa(cur)
    print("Seeding FAI reports...")
    seed_fai(cur)
    print("Seeding compliance (notifications, ERP, retention, audit)...")
    seed_compliance(cur)
    print("Seeding analytics (multivariate, predictions, DOE, AI)...")
    seed_analytics(cur)
    print("Finalizing calculations (running engines on raw data)...")
    finalize_calculations(cur)

    conn.commit()
    conn.close()

    # Configure dummy server for live MQTT/OPC-UA data (fails gracefully)
    seed_dummy_server()

    print("Showcase seed complete. Login with any user / password: password")


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

    # Remove "Default Plant" created by Alembic migration
    cur.execute("DELETE FROM hierarchy WHERE plant_id IN (SELECT id FROM plant WHERE code='DEFAULT')")
    cur.execute("DELETE FROM user_plant_role WHERE plant_id IN (SELECT id FROM plant WHERE code='DEFAULT')")
    cur.execute("DELETE FROM plant WHERE code='DEFAULT'")

    print("Seeding foundation (plants, hierarchy, users)...")
    seed_foundation(cur)
    print("Seeding characteristics...")
    seed_characteristics(cur)
    print("Seeding rule presets...")
    seed_rules(cur)
    print("Seeding variable samples...")
    seed_variable_samples(cur)
    print("Seeding attribute samples...")
    seed_attribute_samples(cur)
    print("Seeding narrative arcs...")
    seed_narrative_arcs(cur)
    print("Applying correlated data overrides (4 groups, 7 chars)...")
    seed_correlated_overrides(cur)
    print("Replaying SPC engine for organic violations...")
    replay_spc_violations(cur)
    print("Seeding capability history and annotations...")
    seed_capability_and_annotations(cur)
    print("Seeding connectivity (MQTT, OPC-UA, data sources)...")
    seed_connectivity(cur)
    print("Seeding gage bridges...")
    seed_gage_bridges(cur)
    print("Seeding anomaly detection...")
    seed_anomaly(cur)
    print("Seeding electronic signatures...")
    seed_signatures(cur)
    print("Seeding MSA studies...")
    seed_msa(cur)
    print("Seeding FAI reports...")
    seed_fai(cur)
    print("Seeding compliance (notifications, ERP, retention, audit)...")
    seed_compliance(cur)
    print("Seeding analytics (multivariate, predictions, DOE, AI)...")
    seed_analytics(cur)
    print("Finalizing calculations (running engines on raw data)...")
    finalize_calculations(cur)

    conn.commit()

    # Print summary
    tables = [
        "plant", "hierarchy", "user", "user_plant_role", "password_policy",
        "characteristic", "characteristic_rules", "sample", "measurement",
        "violation", "annotation", "capability_history", "rule_preset",
        "mqtt_broker", "opcua_server", "data_source", "gage_bridge", "gage_port",
        "anomaly_detector_config", "anomaly_event",
        "signature_meaning", "signature_workflow", "signature_workflow_step",
        "signature_workflow_instance", "electronic_signature",
        "msa_study", "msa_operator", "msa_part", "msa_measurement",
        "fai_report", "fai_item",
        "smtp_config", "webhook_config", "notification_preference",
        "erp_connector", "erp_field_mapping", "erp_sync_schedule", "erp_sync_log",
        "retention_policy", "audit_log",
        "multivariate_group", "multivariate_group_member",
        "prediction_config", "prediction_model", "forecast",
        "doe_study", "doe_factor", "doe_run", "doe_analysis",
        "ai_provider_config", "ai_insight",
    ]
    print("\n=== Summary ===")
    for t in tables:
        cur.execute(f"SELECT COUNT(*) FROM {t}")
        print(f"  {t}: {cur.fetchone()[0]}")

    conn.close()

    # Dummy server (optional, fails gracefully)
    if not args.skip_dummy_server:
        seed_dummy_server()

    print(f"\nShowcase DB created: {db_path}")
    print("Login with any user / password: password")


if __name__ == "__main__":
    main()
