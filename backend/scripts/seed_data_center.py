"""Seed Cassini with a hyperscale data center vertical.

Creates 1 plant (Meridian Data Center — Ashburn) with 3 zones, 4 users,
and 13 characteristics covering environmental monitoring, power, cooling,
and network. Features CUSUM (fouling detection), EWMA (PUE tracking),
autocorrelated temperature data with day/night cycling, step changes,
and anomaly detection events.

Uses raw sqlite3 for speed (same pattern as seed_showcase.py).

Usage:
    python scripts/seed_data_center.py --dry-run        # Test generators only
    python scripts/seed_data_center.py --force           # Create data_center.db
    python scripts/seed_data_center.py --db-path foo.db  # Custom path
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
from datetime import datetime, timedelta, timezone
from pathlib import Path

# ── Path setup ───────────────────────────────────────────────────────────
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir / "src"))
sys.path.insert(0, str(backend_dir))

from cassini.core.auth.passwords import hash_password
from scripts.seed_utils import (
    InlineNelsonChecker,
    NELSON_RULE_NAMES,
    make_timestamps,
    utcnow,
    ts_offset,
    BASE_TIME,
)

# ── Constants ────────────────────────────────────────────────────────────
DB_PATH = backend_dir / "data_center.db"
IDS: dict[str, int] = {}

# Reproducible random data
random.seed(77)

_log = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")


# ── Data generators ──────────────────────────────────────────────────────

def gen_autocorrelated(
    n: int,
    nominal: float,
    std: float,
    alpha: float,
    *,
    day_night_amplitude: float = 0.0,
    step_index: int | None = None,
    step_delta: float = 0.0,
    span_days: int = 120,
    seed: int | None = None,
) -> list[float]:
    """Generate autocorrelated values with optional day/night cycling and step change.

    value[i] = alpha * value[i-1] + (1-alpha) * nominal + noise
    + amplitude * sin(2*pi*(hour_of_day - 6)/24)    # peak at noon
    + step_delta (after step_index)
    """
    if seed is not None:
        random.seed(seed)

    values: list[float] = []
    hours_per_sample = (span_days * 24) / n
    prev = nominal

    for i in range(n):
        # Autocorrelation
        base = alpha * prev + (1 - alpha) * nominal + random.gauss(0, std * math.sqrt(1 - alpha ** 2))

        # Day/night cycling
        if day_night_amplitude > 0:
            hour_of_day = (i * hours_per_sample) % 24
            base += day_night_amplitude * math.sin(2 * math.pi * (hour_of_day - 6) / 24)

        # Step change
        if step_index is not None and i >= step_index:
            base += step_delta

        values.append(base)
        prev = base

    return values


def gen_fouling_drift(
    n: int,
    nominal: float,
    std: float,
    drift_rate: float,
    *,
    seed: int | None = None,
) -> list[float]:
    """Generate values simulating gradual fouling/degradation drift."""
    if seed is not None:
        random.seed(seed)
    return [random.gauss(nominal + i * drift_rate, std) for i in range(n)]


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
    """Insert a sample with optional measurement rows."""
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
    """Insert Nelson rules for a characteristic."""
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
        try:
            cur.execute(
                "UPDATE characteristic SET rule_preset_id = ? WHERE id = ?",
                (preset_id, char_id),
            )
        except sqlite3.OperationalError:
            pass


# ══════════════════════════════════════════════════════════════════════════
# Foundation: Plant, Hierarchy, Users, Roles
# ══════════════════════════════════════════════════════════════════════════

def seed_foundation(cur: sqlite3.Cursor) -> None:
    """Create 1 plant, full hierarchy, 4 users, and role assignments."""

    # ── Plant ────────────────────────────────────────────────────────────
    IDS["mdc_plant"] = insert_plant(
        cur,
        "Meridian Data Center \u2014 Ashburn",
        "MDC",
        settings={"timezone": "America/New_York", "industry": "data_center"},
    )

    # ── Zone: Server Hall A ──────────────────────────────────────────────
    IDS["server_hall_a"] = insert_hierarchy(cur, IDS["mdc_plant"], "Server Hall A", "Area")
    IDS["row_a1"] = insert_hierarchy(cur, IDS["mdc_plant"], "Row A1", "Line", IDS["server_hall_a"])

    # ── Zone: Cooling Plant ──────────────────────────────────────────────
    IDS["cooling_plant"] = insert_hierarchy(cur, IDS["mdc_plant"], "Cooling Plant", "Area")
    IDS["chiller_1"] = insert_hierarchy(cur, IDS["mdc_plant"], "Chiller 1", "Line", IDS["cooling_plant"])

    # ── Zone: Power Distribution ─────────────────────────────────────────
    IDS["power_dist"] = insert_hierarchy(cur, IDS["mdc_plant"], "Power Distribution", "Area")
    IDS["main_ups"] = insert_hierarchy(cur, IDS["mdc_plant"], "Main UPS", "Line", IDS["power_dist"])
    IDS["ats"] = insert_hierarchy(cur, IDS["mdc_plant"], "ATS", "Line", IDS["power_dist"])
    IDS["network"] = insert_hierarchy(cur, IDS["mdc_plant"], "Network", "Line", IDS["power_dist"])

    # ── Users ────────────────────────────────────────────────────────────
    IDS["admin"] = insert_user(cur, "admin", "password", "admin@meridiandc.local", "Sarah Chen")
    IDS["facility_mgr"] = insert_user(cur, "facility.mgr", "password", "fmgr@meridiandc.local", "Marcus Rivera")
    IDS["noc_operator"] = insert_user(cur, "noc.operator", "password", "noc@meridiandc.local", "Priya Kapoor")
    IDS["cooling_tech"] = insert_user(cur, "cooling.tech", "password", "cooling@meridiandc.local", "James Okonkwo")

    # ── Role Assignments ─────────────────────────────────────────────────
    insert_role(cur, IDS["admin"], IDS["mdc_plant"], "admin")
    insert_role(cur, IDS["facility_mgr"], IDS["mdc_plant"], "engineer")
    insert_role(cur, IDS["noc_operator"], IDS["mdc_plant"], "operator")
    insert_role(cur, IDS["cooling_tech"], IDS["mdc_plant"], "supervisor")


# ══════════════════════════════════════════════════════════════════════════
# Characteristics
# ══════════════════════════════════════════════════════════════════════════

def seed_characteristics(cur: sqlite3.Cursor) -> None:
    """Create 13 characteristics across 3 zones."""

    # ── Server Hall A / Row A1 ───────────────────────────────────────────
    IDS["inlet_temp"] = insert_char(
        cur, IDS["row_a1"], "Inlet Temperature",
        description="Server rack cold-aisle inlet air temperature",
        target_value=20.0, usl=27.0, lsl=18.0,
        stored_sigma=1.4, stored_center_line=20.0,
        decimal_precision=2,
    )
    IDS["outlet_temp"] = insert_char(
        cur, IDS["row_a1"], "Outlet Temperature",
        description="Server rack hot-aisle outlet air temperature",
        target_value=35.0, usl=40.0, lsl=30.0,
        stored_sigma=2.0, stored_center_line=35.0,
        decimal_precision=2,
    )
    IDS["humidity"] = insert_char(
        cur, IDS["row_a1"], "Humidity %",
        description="Relative humidity in cold aisle",
        target_value=45.0, usl=60.0, lsl=20.0,
        stored_sigma=4.0, stored_center_line=45.0,
        decimal_precision=1,
    )
    IDS["diff_pressure"] = insert_char(
        cur, IDS["row_a1"], "Differential Pressure",
        description="Cold/hot aisle differential pressure (Pa)",
        target_value=5.0, usl=10.0, lsl=1.0,
        stored_sigma=1.0, stored_center_line=5.0,
        decimal_precision=2,
    )

    # ── Cooling Plant / Chiller 1 ────────────────────────────────────────
    IDS["chiller_supply_temp"] = insert_char(
        cur, IDS["chiller_1"], "Chiller Supply Temperature",
        description="Chilled water supply temperature",
        target_value=7.0, usl=10.0, lsl=5.0,
        stored_sigma=0.5, stored_center_line=7.0,
        decimal_precision=2,
    )
    IDS["chiller_return_temp"] = insert_char(
        cur, IDS["chiller_1"], "Chiller Return Temperature",
        description="Chilled water return temperature",
        target_value=12.0, usl=15.0, lsl=9.0,
        stored_sigma=0.8, stored_center_line=12.0,
        decimal_precision=2,
    )
    IDS["cooling_approach"] = insert_char(
        cur, IDS["chiller_1"], "Cooling Tower Approach",
        description="Approach temperature to wet bulb (CUSUM for fouling)",
        chart_type="cusum",
        target_value=4.0, usl=8.0, lsl=2.0,
        cusum_target=4.0, cusum_k=0.5, cusum_h=5.0,
        stored_sigma=0.6, stored_center_line=4.0,
        decimal_precision=2,
    )
    IDS["pue"] = insert_char(
        cur, IDS["chiller_1"], "PUE",
        description="Power Usage Effectiveness (EWMA for subtle drift)",
        chart_type="ewma",
        target_value=1.35, usl=1.60, lsl=1.10,
        ewma_lambda=0.15, ewma_l=3.0,
        stored_sigma=0.02, stored_center_line=1.35,
        decimal_precision=4,
    )

    # ── Power Distribution / Main UPS ────────────────────────────────────
    IDS["ups_load"] = insert_char(
        cur, IDS["main_ups"], "UPS Load %",
        description="Main UPS load percentage",
        target_value=60.0, usl=85.0, lsl=30.0,
        stored_sigma=9.0, stored_center_line=60.0,
        decimal_precision=1,
    )
    IDS["pdu_current"] = insert_char(
        cur, IDS["main_ups"], "PDU Current",
        description="Power distribution unit current draw (A)",
        target_value=120.0, usl=160.0, lsl=80.0,
        stored_sigma=12.0, stored_center_line=120.0,
        decimal_precision=1,
    )
    IDS["gen_fuel"] = insert_char(
        cur, IDS["main_ups"], "Generator Fuel Level %",
        description="Diesel generator fuel tank level",
        target_value=75.0, usl=100.0, lsl=25.0,
        stored_sigma=15.0, stored_center_line=75.0,
        decimal_precision=1,
    )

    # ── Power Distribution / ATS ─────────────────────────────────────────
    IDS["ats_response"] = insert_char(
        cur, IDS["ats"], "Transfer Switch Response Time",
        description="Automatic transfer switch response time (ms)",
        target_value=10.0, usl=20.0, lsl=4.0,
        stored_sigma=1.5, stored_center_line=10.0,
        decimal_precision=1,
    )

    # ── Power Distribution / Network ─────────────────────────────────────
    IDS["network_latency"] = insert_char(
        cur, IDS["network"], "Network Latency",
        description="Core switch round-trip latency (ms)",
        target_value=0.5, usl=2.0, lsl=0.1,
        stored_sigma=0.15, stored_center_line=0.5,
        decimal_precision=3,
    )

    # ── Nelson rules for all characteristics ─────────────────────────────
    all_char_keys = [
        "inlet_temp", "outlet_temp", "humidity", "diff_pressure",
        "chiller_supply_temp", "chiller_return_temp", "cooling_approach", "pue",
        "ups_load", "pdu_current", "gen_fuel",
        "ats_response", "network_latency",
    ]
    for char_key in all_char_keys:
        insert_nelson_rules(cur, IDS[char_key])


# ══════════════════════════════════════════════════════════════════════════
# Custom Rule Preset
# ══════════════════════════════════════════════════════════════════════════

def seed_rule_preset(cur: sqlite3.Cursor) -> None:
    """Create 'Data Center Critical' custom rule preset."""
    dc_rules = json.dumps({
        "rules": [
            {"rule_id": 1, "is_enabled": True, "require_acknowledgement": True,
             "parameters": {"k": 2.5}},
            {"rule_id": 2, "is_enabled": True, "require_acknowledgement": True},
            {"rule_id": 5, "is_enabled": True, "require_acknowledgement": True},
        ]
    })
    cur.execute(
        """INSERT INTO rule_preset (name, description, is_builtin, rules_config, created_at, plant_id)
        VALUES (?, ?, 0, ?, ?, ?)""",
        ("Data Center Critical",
         "Custom rules for critical DC infrastructure — tight 2.5sigma + zone A detection",
         dc_rules, utcnow(), IDS["mdc_plant"]))
    IDS["dc_preset"] = cur.lastrowid

    # Apply the custom preset to inlet_temp (most critical measurement)
    cur.execute("DELETE FROM characteristic_rules WHERE char_id = ?", (IDS["inlet_temp"],))
    insert_nelson_rules(
        cur, IDS["inlet_temp"],
        rules=[
            (1, True, True),
            (2, True, True),
            (3, False, False),
            (4, False, False),
            (5, True, True),
            (6, False, False),
            (7, False, False),
            (8, False, False),
        ],
        preset_id=IDS["dc_preset"],
        params={1: json.dumps({"k": 2.5})},
    )


# ══════════════════════════════════════════════════════════════════════════
# Samples (~8,000 total, 120 days)
# ══════════════════════════════════════════════════════════════════════════

SPAN_DAYS = 120
SAMPLES_PER_CHAR = 615  # ~8000 / 13 ≈ 615


def seed_samples(cur: sqlite3.Cursor) -> None:
    """Generate ~8,000 samples across all 13 characteristics."""

    # ── Inlet Temperature (autocorrelated, day/night, step change at ~5000 total ≈ sample 385) ──
    n = SAMPLES_PER_CHAR
    timestamps = make_timestamps(n, span_days=SPAN_DAYS)
    step_idx = int(n * 5000 / 8000)  # proportional to 5000/8000 of total
    raw_vals = gen_autocorrelated(
        n, nominal=20.0, std=0.8, alpha=0.90,
        day_night_amplitude=1.2, step_index=step_idx, step_delta=0.5,
        span_days=SPAN_DAYS, seed=101,
    )
    inlet_sample_ids = []
    for i in range(n):
        sid = insert_sample(cur, IDS["inlet_temp"], timestamps[i], values=[raw_vals[i]])
        inlet_sample_ids.append(sid)
    IDS["inlet_temp_samples"] = inlet_sample_ids

    # ── Outlet Temperature (autocorrelated, day/night, tracks inlet with ~15C delta) ──
    timestamps = make_timestamps(n, span_days=SPAN_DAYS)
    raw_vals = gen_autocorrelated(
        n, nominal=35.0, std=1.2, alpha=0.88,
        day_night_amplitude=1.8, step_index=step_idx, step_delta=0.3,
        span_days=SPAN_DAYS, seed=102,
    )
    for i in range(n):
        insert_sample(cur, IDS["outlet_temp"], timestamps[i], values=[raw_vals[i]])

    # ── Humidity % (autocorrelated, moderate) ────────────────────────────
    timestamps = make_timestamps(n, span_days=SPAN_DAYS)
    raw_vals = gen_autocorrelated(
        n, nominal=45.0, std=3.0, alpha=0.85,
        day_night_amplitude=2.0,
        span_days=SPAN_DAYS, seed=103,
    )
    for i in range(n):
        insert_sample(cur, IDS["humidity"], timestamps[i], values=[raw_vals[i]])

    # ── Differential Pressure (mild autocorrelation) ─────────────────────
    timestamps = make_timestamps(n, span_days=SPAN_DAYS)
    raw_vals = gen_autocorrelated(
        n, nominal=5.0, std=0.8, alpha=0.80,
        span_days=SPAN_DAYS, seed=104,
    )
    for i in range(n):
        insert_sample(cur, IDS["diff_pressure"], timestamps[i], values=[raw_vals[i]])

    # ── Chiller Supply Temperature (strongly autocorrelated) ─────────────
    timestamps = make_timestamps(n, span_days=SPAN_DAYS)
    raw_vals = gen_autocorrelated(
        n, nominal=7.0, std=0.4, alpha=0.92,
        day_night_amplitude=0.3,
        span_days=SPAN_DAYS, seed=105,
    )
    for i in range(n):
        insert_sample(cur, IDS["chiller_supply_temp"], timestamps[i], values=[raw_vals[i]])

    # ── Chiller Return Temperature (tracks supply with ~5C delta) ────────
    timestamps = make_timestamps(n, span_days=SPAN_DAYS)
    raw_vals = gen_autocorrelated(
        n, nominal=12.0, std=0.6, alpha=0.90,
        day_night_amplitude=0.5,
        span_days=SPAN_DAYS, seed=106,
    )
    for i in range(n):
        insert_sample(cur, IDS["chiller_return_temp"], timestamps[i], values=[raw_vals[i]])

    # ── Cooling Tower Approach (CUSUM — slow fouling drift) ──────────────
    timestamps = make_timestamps(n, span_days=SPAN_DAYS)
    raw_vals = gen_fouling_drift(n, nominal=4.0, std=0.5, drift_rate=0.002, seed=107)
    target = 4.0
    sigma = 0.6
    k_val = 0.5 * sigma  # cusum_k=0.5 is sigma multiplier
    h_val = 5.0 * sigma  # cusum_h=5.0 is sigma multiplier
    cusum_h = 0.0
    cusum_l = 0.0
    for i in range(n):
        cusum_h = max(0.0, cusum_h + (raw_vals[i] - target) - k_val)
        cusum_l = min(0.0, cusum_l + (raw_vals[i] - target) + k_val)
        insert_sample(cur, IDS["cooling_approach"], timestamps[i], values=[raw_vals[i]],
                      cusum_high=cusum_h, cusum_low=cusum_l)

    # ── PUE (EWMA — very tight, subtle seasonal drift) ──────────────────
    timestamps = make_timestamps(n, span_days=SPAN_DAYS)
    hours_per_sample = (SPAN_DAYS * 24) / n
    random.seed(108)
    raw_pue_vals = []
    for i in range(n):
        # Seasonal effect: PUE slightly worse in summer months
        day_of_year = (i * hours_per_sample / 24) % 365
        seasonal = 0.01 * math.sin(2 * math.pi * (day_of_year - 90) / 365)
        val = 1.35 + seasonal + random.gauss(0, 0.02)
        raw_pue_vals.append(val)

    ewma = 1.35
    lam = 0.15
    pue_sample_ids = []
    for i in range(n):
        ewma = lam * raw_pue_vals[i] + (1 - lam) * ewma
        sid = insert_sample(cur, IDS["pue"], timestamps[i], values=[raw_pue_vals[i]],
                            ewma_value=ewma)
        pue_sample_ids.append(sid)
    IDS["pue_samples"] = pue_sample_ids

    # ── UPS Load % (day/night cycling, moderate autocorrelation) ─────────
    timestamps = make_timestamps(n, span_days=SPAN_DAYS)
    raw_vals = gen_autocorrelated(
        n, nominal=60.0, std=5.0, alpha=0.85,
        day_night_amplitude=8.0,
        span_days=SPAN_DAYS, seed=109,
    )
    for i in range(n):
        # Clamp to 0-100 range
        val = max(5.0, min(99.0, raw_vals[i]))
        insert_sample(cur, IDS["ups_load"], timestamps[i], values=[val])

    # ── PDU Current (tracks UPS load pattern loosely) ────────────────────
    timestamps = make_timestamps(n, span_days=SPAN_DAYS)
    raw_vals = gen_autocorrelated(
        n, nominal=120.0, std=8.0, alpha=0.82,
        day_night_amplitude=12.0,
        span_days=SPAN_DAYS, seed=110,
    )
    for i in range(n):
        insert_sample(cur, IDS["pdu_current"], timestamps[i], values=[raw_vals[i]])

    # ── Generator Fuel Level % (slow sawtooth — drain + refill) ──────────
    timestamps = make_timestamps(n, span_days=SPAN_DAYS)
    random.seed(111)
    fuel_vals = []
    fuel = 95.0
    for i in range(n):
        fuel -= random.uniform(0.03, 0.08)  # slow drain from weekly tests
        if fuel < 40.0:  # refill threshold
            fuel = 95.0 + random.gauss(0, 1.0)
        fuel_vals.append(max(25.0, min(100.0, fuel + random.gauss(0, 1.5))))
    for i in range(n):
        insert_sample(cur, IDS["gen_fuel"], timestamps[i], values=[fuel_vals[i]])

    # ── ATS Response Time (light-tailed, occasional spikes) ──────────────
    timestamps = make_timestamps(n, span_days=SPAN_DAYS)
    random.seed(112)
    for i in range(n):
        base = random.gauss(10.0, 1.2)
        # ~2% chance of a slow transfer (15-18ms)
        if random.random() < 0.02:
            base = random.gauss(16.0, 1.0)
        insert_sample(cur, IDS["ats_response"], timestamps[i], values=[max(2.0, base)])

    # ── Network Latency (mostly tight, rare micro-bursts) ────────────────
    timestamps = make_timestamps(n, span_days=SPAN_DAYS)
    random.seed(113)
    for i in range(n):
        base = random.gauss(0.5, 0.12)
        # ~1% chance of micro-burst (1-3ms)
        if random.random() < 0.01:
            base = random.uniform(1.0, 3.0)
        insert_sample(cur, IDS["network_latency"], timestamps[i], values=[max(0.05, base)])


# ══════════════════════════════════════════════════════════════════════════
# Replay SPC Violations
# ══════════════════════════════════════════════════════════════════════════

def replay_spc_violations(cur: sqlite3.Cursor) -> None:
    """Replay seeded samples through Nelson rules + CUSUM/EWMA to generate organic violations."""
    from cassini.core.engine.nelson_rules import NelsonRuleLibrary
    from cassini.core.engine.rolling_window import (
        RollingWindow, ZoneBoundaries as RWZoneBoundaries, WindowSample,
    )
    from cassini.core.engine.ewma_engine import calculate_ewma_limits

    total_violations = 0

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
        chart_type = c["chart_type"]

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

        # ── CUSUM ────────────────────────────────────────────────────
        if chart_type == "cusum":
            target = c["cusum_target"]
            sigma = c["stored_sigma"]
            k_mult = c["cusum_k"] or 0.5
            h_mult = c["cusum_h"] or 5.0

            if target is None or not sigma or sigma <= 0:
                continue

            k_val = k_mult * sigma
            h_val = h_mult * sigma

            cur.execute("""
                SELECT s.id, m.value FROM sample s
                JOIN measurement m ON m.sample_id = s.id
                WHERE s.char_id = ? AND s.is_excluded = 0
                ORDER BY s.timestamp
            """, (char_id,))

            ch, cl_v = 0.0, 0.0
            for sid, val in cur.fetchall():
                ch = max(0.0, ch + (val - target - k_val))
                cl_v = max(0.0, cl_v + (target - val - k_val))
                if ch > h_val:
                    insert_violation(cur, sid, char_id, 1, "CUSUM+ Shift", "CRITICAL")
                    n_viol += 1
                if cl_v > h_val:
                    insert_violation(cur, sid, char_id, 1, "CUSUM- Shift", "CRITICAL")
                    n_viol += 1

        # ── EWMA ─────────────────────────────────────────────────────
        elif chart_type == "ewma":
            lam = c["ewma_lambda"] or 0.2
            l_mult = c["ewma_l"] or 3.0
            target = c["target_value"] or c["stored_center_line"]
            sigma = c["stored_sigma"]

            if target is None or not sigma or sigma <= 0:
                continue

            cur.execute("""
                SELECT s.id, s.ewma_value FROM sample s
                WHERE s.char_id = ? AND s.is_excluded = 0
                ORDER BY s.timestamp
            """, (char_id,))

            for idx, (sid, ewma_val) in enumerate(cur.fetchall()):
                if ewma_val is None:
                    continue
                i = idx + 1
                ewma_sigma = sigma * math.sqrt(
                    (lam / (2.0 - lam)) * (1.0 - (1.0 - lam) ** (2 * i))
                )
                ewma_ucl = target + l_mult * ewma_sigma
                ewma_lcl = target - l_mult * ewma_sigma
                if ewma_val > ewma_ucl or ewma_val < ewma_lcl:
                    insert_violation(cur, sid, char_id, 1, "EWMA Limit Breach", "CRITICAL")
                    n_viol += 1

        # ── Standard I-MR Nelson rules ───────────────────────────────
        else:
            cl = c["stored_center_line"]
            sigma = c["stored_sigma"]
            if cl is None or not sigma or sigma <= 0:
                continue

            ucl = cl + 3 * sigma
            lcl = cl - 3 * sigma
            checker = InlineNelsonChecker(cl, ucl, lcl, list(enabled_rules))

            cur.execute("""
                SELECT s.id, m.value FROM sample s
                JOIN measurement m ON m.sample_id = s.id
                WHERE s.char_id = ? AND s.is_excluded = 0
                ORDER BY s.timestamp
            """, (char_id,))

            for sid, val in cur.fetchall():
                triggered = checker.check(val)
                for rule_id in triggered:
                    severity = "CRITICAL" if rule_id == 1 else "WARNING"
                    insert_violation(
                        cur, sid, char_id, rule_id,
                        NELSON_RULE_NAMES.get(rule_id, f"Rule {rule_id}"),
                        severity,
                    )
                    n_viol += 1

        if n_viol > 0:
            total_violations += n_viol
            _log.info("  %s: %d violations", c["name"], n_viol)

    _log.info("Total violations generated: %d", total_violations)


# ══════════════════════════════════════════════════════════════════════════
# Capability History & Annotations
# ══════════════════════════════════════════════════════════════════════════

def seed_capability_and_annotations(cur: sqlite3.Cursor) -> None:
    """Capability snapshots and chart annotations for key characteristics."""
    now = utcnow()

    # Capability snapshots
    insert_capability(cur, IDS["inlet_temp"], cp=1.80, cpk=1.65, pp=1.72, ppk=1.58,
                      cpm=1.60, sample_count=615, p_value=0.42, calc_by="facility.mgr")
    insert_capability(cur, IDS["outlet_temp"], cp=1.40, cpk=1.25, pp=1.35, ppk=1.20,
                      sample_count=615, p_value=0.31, calc_by="facility.mgr")
    insert_capability(cur, IDS["pue"], cp=2.50, cpk=2.30, pp=2.40, ppk=2.20,
                      cpm=2.25, sample_count=615, p_value=0.55, calc_by="system")
    insert_capability(cur, IDS["cooling_approach"], cp=1.67, cpk=1.45, pp=1.55, ppk=1.35,
                      sample_count=615, p_value=0.28, calc_by="cooling.tech")
    insert_capability(cur, IDS["ups_load"], cp=1.10, cpk=0.95, pp=1.05, ppk=0.90,
                      sample_count=615, p_value=0.18, calc_by="system")
    insert_capability(cur, IDS["network_latency"], cp=2.00, cpk=1.85, pp=1.90, ppk=1.75,
                      sample_count=615, p_value=0.08, calc_by="system")

    # Annotations
    inlet_samples = IDS["inlet_temp_samples"]

    # Point annotation on the step change
    step_idx = int(SAMPLES_PER_CHAR * 5000 / 8000)
    insert_annotation(
        cur, IDS["inlet_temp"], "point",
        "Hot aisle containment breach — Row A1 blanking panels removed for maintenance",
        color="#ef4444", sample_id=inlet_samples[step_idx],
        created_by="facility.mgr",
    )

    # Period annotation for HVAC trip
    hvac_trip_idx = int(SAMPLES_PER_CHAR * 3000 / 8000)
    insert_annotation(
        cur, IDS["inlet_temp"], "period",
        "CRAH Unit 3 compressor trip — 45 min recovery",
        color="#f59e0b",
        start_sid=inlet_samples[max(0, hvac_trip_idx - 5)],
        end_sid=inlet_samples[min(len(inlet_samples) - 1, hvac_trip_idx + 10)],
        created_by="cooling.tech",
    )

    # PUE annotation
    pue_samples = IDS["pue_samples"]
    insert_annotation(
        cur, IDS["pue"], "point",
        "Chiller 2 offline for condenser cleaning — PUE temporarily elevated",
        color="#3b82f6", sample_id=pue_samples[int(n * 0.65)] if (n := len(pue_samples)) > 0 else None,
        created_by="cooling.tech",
    )


# ══════════════════════════════════════════════════════════════════════════
# Anomaly Detection
# ══════════════════════════════════════════════════════════════════════════

def seed_anomaly(cur: sqlite3.Cursor) -> None:
    """Anomaly detection configs and events."""
    now = utcnow()

    # ── Config 1: PELT on Inlet Temperature (changepoint detection) ──────
    cur.execute("""INSERT INTO anomaly_detector_config
        (char_id, is_enabled, pelt_enabled, pelt_model, pelt_penalty, pelt_min_segment,
         iforest_enabled, iforest_contamination, iforest_n_estimators, iforest_min_training, iforest_retrain_interval,
         ks_enabled, ks_reference_window, ks_test_window, ks_alpha,
         notify_on_changepoint, notify_on_anomaly_score, notify_on_distribution_shift,
         anomaly_score_threshold, created_at, updated_at)
        VALUES (?, 1, 1, 'rbf', 'bic', 30,
                0, 0.05, 100, 50, 100,
                0, 100, 50, 0.05,
                1, 0, 0,
                0.7, ?, ?)""",
        (IDS["inlet_temp"], now, now))

    # ── Config 2: Isolation Forest on PUE (multivariate anomaly) ─────────
    cur.execute("""INSERT INTO anomaly_detector_config
        (char_id, is_enabled, pelt_enabled, pelt_model, pelt_penalty, pelt_min_segment,
         iforest_enabled, iforest_contamination, iforest_n_estimators, iforest_min_training, iforest_retrain_interval,
         ks_enabled, ks_reference_window, ks_test_window, ks_alpha,
         notify_on_changepoint, notify_on_anomaly_score, notify_on_distribution_shift,
         anomaly_score_threshold, created_at, updated_at)
        VALUES (?, 1, 0, 'rbf', 'bic', 25,
                1, 0.03, 150, 60, 120,
                0, 100, 50, 0.05,
                0, 1, 0,
                0.65, ?, ?)""",
        (IDS["pue"], now, now))

    # ── Anomaly Events ───────────────────────────────────────────────────
    inlet_samples = IDS["inlet_temp_samples"]
    pue_samples = IDS["pue_samples"]
    n = len(inlet_samples)

    # Map proportional indices to sample IDs
    idx_3000 = int(n * 3000 / 8000)
    idx_5000 = int(n * 5000 / 8000)
    idx_4000 = int(n * 4000 / 8000)
    idx_2000 = int(n * 2000 / 8000)

    # Event 1: PELT changepoint on Inlet Temp at ~sample 3000 (HVAC trip)
    cur.execute("""INSERT INTO anomaly_event
        (char_id, detector_type, event_type, severity, details, sample_id, window_start_id, window_end_id,
         is_acknowledged, is_dismissed, summary, detected_at)
        VALUES (?, 'pelt', 'changepoint', 'critical', ?, ?, NULL, NULL,
                1, 0, 'PELT detected CRAH Unit 3 compressor trip — mean shift +1.8C', ?)""",
        (IDS["inlet_temp"],
         json.dumps({"change_point_index": idx_3000, "segment_means": [20.0, 21.8],
                      "cause": "CRAH compressor failure"}),
         inlet_samples[idx_3000], now))

    # Event 2: PELT changepoint on Inlet Temp at ~sample 5000 (containment breach)
    cur.execute("""INSERT INTO anomaly_event
        (char_id, detector_type, event_type, severity, details, sample_id, window_start_id, window_end_id,
         is_acknowledged, is_dismissed, summary, detected_at)
        VALUES (?, 'pelt', 'changepoint', 'high', ?, ?, NULL, NULL,
                0, 0, 'PELT detected hot aisle containment breach — sustained +0.5C shift', ?)""",
        (IDS["inlet_temp"],
         json.dumps({"change_point_index": idx_5000, "segment_means": [20.0, 20.5],
                      "cause": "Blanking panels removed for rack deployment"}),
         inlet_samples[idx_5000], now))

    # Event 3: Isolation Forest anomaly on PUE at ~sample 4000 (chiller degradation)
    cur.execute("""INSERT INTO anomaly_event
        (char_id, detector_type, event_type, severity, details, sample_id, window_start_id, window_end_id,
         is_acknowledged, is_dismissed, summary, detected_at)
        VALUES (?, 'isolation_forest', 'outlier', 'medium', ?, ?, NULL, NULL,
                0, 0, 'Unusual pattern — chiller condenser fouling suspected', ?)""",
        (IDS["pue"],
         json.dumps({"anomaly_score": 0.78, "threshold": 0.65,
                      "contributing_features": ["chiller_supply_temp", "outdoor_wet_bulb"]}),
         pue_samples[idx_4000], now))

    # Event 4: Isolation Forest false positive on PUE at ~sample 2000 (dismissed)
    cur.execute("""INSERT INTO anomaly_event
        (char_id, detector_type, event_type, severity, details, sample_id, window_start_id, window_end_id,
         is_acknowledged, is_dismissed, dismissed_by, dismissed_reason, summary, detected_at)
        VALUES (?, 'isolation_forest', 'outlier', 'low', ?, ?, NULL, NULL,
                0, 1, 'facility.mgr', 'Normal variation during weekend low-load period',
                'Low anomaly score — within normal variation during weekend', ?)""",
        (IDS["pue"],
         json.dumps({"anomaly_score": 0.52, "threshold": 0.65}),
         pue_samples[idx_2000], now))


# ══════════════════════════════════════════════════════════════════════════
# Compliance: Push Subscriptions, ERP Connector, Notifications, Retention
# ══════════════════════════════════════════════════════════════════════════

def seed_compliance(cur: sqlite3.Cursor) -> None:
    """Push subscriptions, ERP connector, notification preferences, retention."""
    now = utcnow()

    # ── Push Subscriptions ───────────────────────────────────────────────

    # Facility manager push subscription
    cur.execute("""INSERT INTO push_subscription
        (user_id, endpoint, p256dh_key, auth_key, created_at)
        VALUES (?, ?, ?, ?, ?)""",
        (IDS["facility_mgr"],
         "https://push.meridiandc.local/sub/facility-mgr-001",
         "BHkR4vT7wU2xY5zA8bC3dE6fG9hI0jK1lM4nO7pQ2rS5tV8wX1yZ0aB3cD6eF9gH2iJ5kL8mN1oP4qR",
         "xK3mN7pQ1rS5tV8wY2z",
         now))

    # NOC operator push subscription
    cur.execute("""INSERT INTO push_subscription
        (user_id, endpoint, p256dh_key, auth_key, created_at)
        VALUES (?, ?, ?, ?, ?)""",
        (IDS["noc_operator"],
         "https://push.meridiandc.local/sub/noc-op-001",
         "BGnZ8eF2VpUm7iT1yN6qPsEuOdR3xC4bLgHkJ0wZxY9fA5dQ8jS2mK6lI3nV7tW1aE4rB0cU5hG9oM",
         "jP5rT8vW2xZ4aB7cE0f",
         now))

    # ── Notification Preferences ─────────────────────────────────────────
    prefs = [
        # NOC operator: violations only, critical
        (IDS["noc_operator"], "violation", "email", 1, "critical"),
        (IDS["noc_operator"], "violation", "push", 1, "critical"),
        # Facility manager: violation + anomaly + capability
        (IDS["facility_mgr"], "violation", "email", 1, "all"),
        (IDS["facility_mgr"], "anomaly", "email", 1, "all"),
        (IDS["facility_mgr"], "capability", "email", 1, "all"),
        (IDS["facility_mgr"], "violation", "push", 1, "warning"),
        (IDS["facility_mgr"], "anomaly", "push", 1, "all"),
        # Cooling tech: violation + anomaly on cooling chars
        (IDS["cooling_tech"], "violation", "email", 1, "all"),
        (IDS["cooling_tech"], "anomaly", "email", 1, "all"),
        # Admin: everything
        (IDS["admin"], "violation", "email", 1, "all"),
        (IDS["admin"], "anomaly", "email", 1, "all"),
        (IDS["admin"], "capability", "email", 1, "all"),
        (IDS["admin"], "system", "email", 1, "all"),
    ]

    for user_id, event_type, channel, enabled, severity in prefs:
        cur.execute("""INSERT INTO notification_preference
            (user_id, event_type, channel, is_enabled, severity_filter, created_at)
            VALUES (?, ?, ?, ?, ?, ?)""",
            (user_id, event_type, channel, enabled, severity, now))

    # ── SMTP Config ──────────────────────────────────────────────────────
    cur.execute("""INSERT INTO smtp_config
        (server, port, username, password, use_tls, from_address, is_active, created_at, updated_at)
        VALUES ('smtp.meridiandc.local', 587, 'cassini-alerts', NULL, 1, 'alerts@meridiandc.local', 0, ?, ?)""",
        (now, now))

    # ── Webhook Config ───────────────────────────────────────────────────
    cur.execute("""INSERT INTO webhook_config
        (name, url, secret, is_active, retry_count, events_filter, created_at, updated_at)
        VALUES ('DCIM Quality Webhook', 'https://dcim.meridiandc.local/api/webhooks/quality',
                'whsec_mdc_dcim_webhook_001', 1, 3, 'violation,anomaly', ?, ?)""",
        (now, now))

    # ── ERP Connector (Generic Webhook to DCIM) ─────────────────────────
    cur.execute("""INSERT INTO erp_connector
        (plant_id, name, connector_type, base_url, auth_type, auth_config, headers, is_active, status,
         last_sync_at, last_error, created_at, updated_at)
        VALUES (?, 'DCIM Webhook \u2014 Meridian', 'generic_webhook',
                'https://dcim.meridiandc.local/api/webhooks/quality',
                'api_key', '{}', '{}', 1, 'active',
                ?, NULL, ?, ?)""",
        (IDS["mdc_plant"], ts_offset(BASE_TIME, hours=-1), now, now))
    dcim_conn = cur.lastrowid

    # ERP field mappings
    cur.execute("""INSERT INTO erp_field_mapping
        (connector_id, name, direction, erp_entity, erp_field_path, openspc_entity, openspc_field, transform, is_active)
        VALUES (?, 'Sensor Reading', 'outbound', 'SensorEvent', 'reading_value', 'sample', 'value', NULL, 1)""",
        (dcim_conn,))
    cur.execute("""INSERT INTO erp_field_mapping
        (connector_id, name, direction, erp_entity, erp_field_path, openspc_entity, openspc_field, transform, is_active)
        VALUES (?, 'Alarm Status', 'outbound', 'AlarmEvent', 'severity', 'violation', 'severity', NULL, 1)""",
        (dcim_conn,))

    # ERP sync schedule
    cur.execute("""INSERT INTO erp_sync_schedule
        (connector_id, direction, cron_expression, is_active, last_run_at, next_run_at)
        VALUES (?, 'outbound', '*/5 * * * *', 1, ?, ?)""",
        (dcim_conn, ts_offset(BASE_TIME, minutes=-5), ts_offset(BASE_TIME, minutes=0)))

    # ERP sync logs
    cur.execute("""INSERT INTO erp_sync_log
        (connector_id, direction, status, records_processed, records_failed, started_at, completed_at, error_message, detail)
        VALUES (?, 'outbound', 'success', 87, 0, ?, ?, NULL, NULL)""",
        (dcim_conn, ts_offset(BASE_TIME, minutes=-5), ts_offset(BASE_TIME, minutes=-4)))
    cur.execute("""INSERT INTO erp_sync_log
        (connector_id, direction, status, records_processed, records_failed, started_at, completed_at, error_message, detail)
        VALUES (?, 'outbound', 'success', 92, 0, ?, ?, NULL, NULL)""",
        (dcim_conn, ts_offset(BASE_TIME, minutes=-10), ts_offset(BASE_TIME, minutes=-9)))

    # ── Retention Policy ─────────────────────────────────────────────────
    # MDC global: 1-year (365 days) — data center compliance
    cur.execute("""INSERT INTO retention_policy
        (plant_id, scope, hierarchy_id, characteristic_id, retention_type, retention_value, retention_unit, created_at, updated_at)
        VALUES (?, 'global', NULL, NULL, 'time_delta', 365, 'days', ?, ?)""",
        (IDS["mdc_plant"], now, now))

    # Per-char: PUE forever (energy audit requirement)
    cur.execute("""INSERT INTO retention_policy
        (plant_id, scope, hierarchy_id, characteristic_id, retention_type, retention_value, retention_unit, created_at, updated_at)
        VALUES (?, 'characteristic', NULL, ?, 'forever', NULL, NULL, ?, ?)""",
        (IDS["mdc_plant"], IDS["pue"], now, now))


# ══════════════════════════════════════════════════════════════════════════
# Audit Trail
# ══════════════════════════════════════════════════════════════════════════

def seed_audit_trail(cur: sqlite3.Cursor) -> None:
    """Seed realistic audit log entries."""
    users_info = [
        ("admin", "Sarah Chen", IDS["admin"]),
        ("facility.mgr", "Marcus Rivera", IDS["facility_mgr"]),
        ("noc.operator", "Priya Kapoor", IDS["noc_operator"]),
        ("cooling.tech", "James Okonkwo", IDS["cooling_tech"]),
    ]

    # Login events (past 7 days)
    for username, full_name, user_id in users_info:
        for days_ago in random.sample(range(1, 8), min(3, 7)):
            ts = ts_offset(BASE_TIME, days=-days_ago, hours=-random.randint(0, 12))
            cur.execute("""INSERT INTO audit_log
                (user_id, username, action, resource_type, resource_id, detail, ip_address, user_agent, timestamp)
                VALUES (?, ?, 'login', 'session', NULL, ?, ?, ?, ?)""",
                (user_id, username, json.dumps({"method": "password"}),
                 f"10.10.{random.randint(1,3)}.{random.randint(10,250)}",
                 "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0", ts))

    # Characteristic config changes by facility manager
    for char_key in ["inlet_temp", "pue", "cooling_approach"]:
        ts = ts_offset(BASE_TIME, days=-3)
        cur.execute("""INSERT INTO audit_log
            (user_id, username, action, resource_type, resource_id, detail, ip_address, user_agent, timestamp)
            VALUES (?, ?, 'update', 'characteristic', ?, ?, ?, ?, ?)""",
            (IDS["facility_mgr"], "facility.mgr", IDS[char_key],
             json.dumps({"field": "usl", "change": "spec limit reviewed"}),
             "10.10.1.50", "Mozilla/5.0 Chrome/122.0", ts))

    # Sample submissions by NOC operator
    for i in range(5):
        ts = ts_offset(BASE_TIME, days=-random.randint(1, 5))
        cur.execute("""INSERT INTO audit_log
            (user_id, username, action, resource_type, resource_id, detail, ip_address, user_agent, timestamp)
            VALUES (?, ?, 'create', 'sample', ?, NULL, ?, ?, ?)""",
            (IDS["noc_operator"], "noc.operator", random.randint(1, 100),
             f"10.10.{random.randint(1,3)}.{random.randint(10,250)}",
             "Mozilla/5.0 Chrome/122.0", ts))

    # Admin config changes
    config_changes = [
        ("create", "webhook_config", 1, {"name": "DCIM Quality Webhook"}),
        ("create", "erp_connector", 1, {"name": "DCIM Webhook — Meridian"}),
        ("update", "retention_policy", 1, {"scope": "global", "plant": "MDC"}),
    ]

    for action, rtype, rid, detail in config_changes:
        ts = ts_offset(BASE_TIME, days=-random.randint(1, 14))
        cur.execute("""INSERT INTO audit_log
            (user_id, username, action, resource_type, resource_id, detail, ip_address, user_agent, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (IDS["admin"], "admin", action, rtype, rid,
             json.dumps(detail), "10.10.1.1", "Mozilla/5.0 Chrome/122.0", ts))


# ══════════════════════════════════════════════════════════════════════════
# Async entry point (DevTools page)
# ══════════════════════════════════════════════════════════════════════════

async def seed() -> None:
    """Entry point for DevTools page. Wipes cassini.db and re-seeds."""
    db_path = backend_dir / "data" / "cassini.db"

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

    # Run alembic migrations in subprocess
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

    print("Seeding foundation (plant, hierarchy, users)...")
    seed_foundation(cur)
    print("Seeding characteristics...")
    seed_characteristics(cur)
    print("Seeding custom rule preset...")
    seed_rule_preset(cur)
    print("Seeding samples (~8,000)...")
    seed_samples(cur)
    print("Replaying SPC engine for organic violations...")
    replay_spc_violations(cur)
    print("Seeding capability history and annotations...")
    seed_capability_and_annotations(cur)
    print("Seeding anomaly detection...")
    seed_anomaly(cur)
    print("Seeding compliance (push, ERP, notifications, retention)...")
    seed_compliance(cur)
    print("Seeding audit trail...")
    seed_audit_trail(cur)

    conn.commit()
    conn.close()

    print("Data Center seed complete. Login with any user / password: password")


# ══════════════════════════════════════════════════════════════════════════
# CLI Main
# ══════════════════════════════════════════════════════════════════════════

def main() -> None:
    parser = argparse.ArgumentParser(description="Seed Cassini data center database")
    parser.add_argument("--db-path", default=str(DB_PATH))
    parser.add_argument("--dry-run", action="store_true", help="Test imports and generators only")
    parser.add_argument("--force", action="store_true", help="Overwrite existing DB")
    args = parser.parse_args()

    if args.dry_run:
        print("=== Dry Run -- Testing imports and generators ===")
        print(f"Password hash OK: {len(hash_password('test')) > 0}")
        print(f"gen_autocorrelated(5): {gen_autocorrelated(5, 20.0, 0.8, 0.9)}")
        print(f"gen_fouling_drift(5): {gen_fouling_drift(5, 4.0, 0.5, 0.002)}")
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

    print("Seeding foundation (plant, hierarchy, users)...")
    seed_foundation(cur)
    print("Seeding characteristics...")
    seed_characteristics(cur)
    print("Seeding custom rule preset...")
    seed_rule_preset(cur)
    print("Seeding samples (~8,000)...")
    seed_samples(cur)
    print("Replaying SPC engine for organic violations...")
    replay_spc_violations(cur)
    print("Seeding capability history and annotations...")
    seed_capability_and_annotations(cur)
    print("Seeding anomaly detection...")
    seed_anomaly(cur)
    print("Seeding compliance (push, ERP, notifications, retention)...")
    seed_compliance(cur)
    print("Seeding audit trail...")
    seed_audit_trail(cur)

    conn.commit()

    # Print summary
    tables = [
        "plant", "hierarchy", "user", "user_plant_role",
        "characteristic", "characteristic_rules", "sample", "measurement",
        "violation", "annotation", "capability_history", "rule_preset",
        "anomaly_detector_config", "anomaly_event",
        "notification_preference", "push_subscription",
        "smtp_config", "webhook_config",
        "erp_connector", "erp_field_mapping", "erp_sync_schedule", "erp_sync_log",
        "retention_policy", "audit_log",
    ]
    print("\n=== Summary ===")
    for t in tables:
        try:
            cur.execute(f"SELECT COUNT(*) FROM {t}")
            print(f"  {t}: {cur.fetchone()[0]}")
        except sqlite3.OperationalError:
            print(f"  {t}: (table not found)")

    conn.close()

    print(f"\nData Center DB created: {db_path}")
    print("Login with any user / password: password")


if __name__ == "__main__":
    main()
