"""Seed Cassini database with a Steel Mill vertical demo.

Creates 1 integrated steel mill plant (Great Lakes Steel) with 3 process areas
(Melt Shop, Hot Strip Mill, Cold Rolling & Annealing), 15 characteristics covering
continuous process monitoring with autocorrelated data, thermal cycling, campaign
drift, and roll wear patterns.

Uses raw sqlite3 for speed (same pattern as seed_showcase.py).

Usage:
    python scripts/seed_steel_mill.py --dry-run        # Test generators only
    python scripts/seed_steel_mill.py --force           # Create steel_mill.db
    python scripts/seed_steel_mill.py --db-path foo.db  # Custom path
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
from scripts.seed_utils import InlineNelsonChecker, NELSON_RULE_NAMES, make_timestamps, utcnow, ts_offset, BASE_TIME

# ── Constants ────────────────────────────────────────────────────────────
DB_PATH = backend_dir / "steel_mill.db"
IDS: dict[str, int] = {}

# Reproducible random data
random.seed(42)

LOG = logging.getLogger(__name__)


# ── Insert helpers (same as seed_showcase.py) ────────────────────────────

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


# ── Data generators ──────────────────────────────────────────────────────

def gen_normal(n: int, mean: float, std: float, seed: int | None = None) -> list[float]:
    """Generate n normally distributed values."""
    if seed is not None:
        random.seed(seed)
    return [random.gauss(mean, std) for _ in range(n)]


def gen_autocorrelated(n: int, target: float, std: float, alpha: float,
                       seed: int | None = None) -> list[float]:
    """Generate n autocorrelated values using AR(1) process.

    value[i] = alpha * value[i-1] + (1-alpha) * target + noise
    alpha: autocorrelation coefficient (0.7-0.9 for temperature processes)
    """
    if seed is not None:
        random.seed(seed)
    values = [target + random.gauss(0, std)]
    for i in range(1, n):
        values.append(alpha * values[i - 1] + (1 - alpha) * target + random.gauss(0, std * math.sqrt(1 - alpha ** 2)))
    return values


def gen_campaign_drift(n: int, target: float, std: float, campaign_length: int,
                       drift_per_sample: float, seed: int | None = None) -> list[float]:
    """Generate n values with campaign-based drift (resets after campaign_length samples).

    Models refractory lining wear in EAF — slow drift within a campaign, then
    sharp reset when refractory is replaced.
    """
    if seed is not None:
        random.seed(seed)
    values = []
    for i in range(n):
        campaign_pos = i % campaign_length
        drift = campaign_pos * drift_per_sample
        values.append(random.gauss(target + drift, std))
    return values


def gen_roll_wear(n: int, target: float, std: float, campaign_length: int,
                  wear_per_sample: float, seed: int | None = None) -> list[float]:
    """Generate n values with roll wear pattern (sawtooth drift on thickness).

    Models gradual thickness increase from roll crown flattening, then reset
    after roll change.
    """
    if seed is not None:
        random.seed(seed)
    values = []
    for i in range(n):
        campaign_pos = i % campaign_length
        wear = campaign_pos * wear_per_sample
        values.append(random.gauss(target + wear, std))
    return values


def add_thermal_cycling(values: list[float], timestamps: list[str],
                        amplitude: float = 2.0) -> list[float]:
    """Add day/night thermal cycling to temperature data.

    Adds amplitude * sin(2*pi*hour/24) sinusoidal variation based on the
    hour-of-day extracted from each timestamp.
    """
    result = []
    for i, ts in enumerate(timestamps):
        dt = datetime.fromisoformat(ts)
        hour = dt.hour + dt.minute / 60.0
        cycle = amplitude * math.sin(2 * math.pi * hour / 24.0)
        result.append(values[i] + cycle)
    return result


def get_shift_operator(ts: str) -> str:
    """Determine which shift operator based on timestamp hour.

    Shift-A: 06:00-14:00
    Shift-B: 14:00-22:00
    Shift-C: 22:00-06:00
    """
    dt = datetime.fromisoformat(ts)
    hour = dt.hour
    if 6 <= hour < 14:
        return "shift_a"
    elif 14 <= hour < 22:
        return "shift_b"
    else:
        return "shift_c"


# ── Foundation: Plant, Hierarchy, Users, Roles ───────────────────────────

def seed_foundation(cur: sqlite3.Cursor) -> None:
    """Create 1 steel mill plant, ISA-95 hierarchy, 5 users, and role assignments."""

    # ── Plant ─────────────────────────────────────────────────────────────
    IDS["gls_plant"] = insert_plant(cur, "Great Lakes Steel", "GLS")

    # ── Melt Shop ─────────────────────────────────────────────────────────
    IDS["melt_shop"] = insert_hierarchy(cur, IDS["gls_plant"], "Melt Shop", "Area")
    IDS["eaf"] = insert_hierarchy(cur, IDS["gls_plant"], "Electric Arc Furnace", "Line", IDS["melt_shop"])
    IDS["ladle"] = insert_hierarchy(cur, IDS["gls_plant"], "Ladle Metallurgy", "Line", IDS["melt_shop"])

    # ── Hot Strip Mill ────────────────────────────────────────────────────
    IDS["hot_strip"] = insert_hierarchy(cur, IDS["gls_plant"], "Hot Strip Mill", "Area")
    IDS["roughing"] = insert_hierarchy(cur, IDS["gls_plant"], "Roughing Mill", "Line", IDS["hot_strip"])
    IDS["finishing"] = insert_hierarchy(cur, IDS["gls_plant"], "Finishing Mill", "Line", IDS["hot_strip"])

    # ── Cold Rolling & Annealing ──────────────────────────────────────────
    IDS["cold_anneal"] = insert_hierarchy(cur, IDS["gls_plant"], "Cold Rolling & Annealing", "Area")
    IDS["cold_mill"] = insert_hierarchy(cur, IDS["gls_plant"], "Cold Mill", "Line", IDS["cold_anneal"])
    IDS["cont_anneal"] = insert_hierarchy(cur, IDS["gls_plant"], "Continuous Annealing", "Line", IDS["cold_anneal"])

    # ── Users ─────────────────────────────────────────────────────────────
    IDS["admin"] = insert_user(cur, "admin", "password",
                               email="admin@greatlakessteel.com", full_name="Robert Kowalski")
    IDS["process_engineer"] = insert_user(cur, "process_engineer", "password",
                                           email="jchen@greatlakessteel.com", full_name="Jun Chen")
    IDS["shift_a"] = insert_user(cur, "shift_a", "password",
                                  email="mgarcia@greatlakessteel.com", full_name="Miguel Garcia")
    IDS["shift_b"] = insert_user(cur, "shift_b", "password",
                                  email="dthompson@greatlakessteel.com", full_name="Diane Thompson")
    IDS["shift_c"] = insert_user(cur, "shift_c", "password",
                                  email="asingh@greatlakessteel.com", full_name="Arun Singh")

    # ── Role assignments ──────────────────────────────────────────────────
    insert_role(cur, IDS["admin"], IDS["gls_plant"], "admin")
    insert_role(cur, IDS["process_engineer"], IDS["gls_plant"], "engineer")
    insert_role(cur, IDS["shift_a"], IDS["gls_plant"], "operator")
    insert_role(cur, IDS["shift_b"], IDS["gls_plant"], "operator")
    insert_role(cur, IDS["shift_c"], IDS["gls_plant"], "operator")


# ── Characteristics ──────────────────────────────────────────────────────

def seed_characteristics(cur: sqlite3.Cursor) -> None:
    """Create all 15 characteristics across 3 process areas."""

    # ══════════════════════════════════════════════════════════════════════
    # MELT SHOP (5 characteristics)
    # ══════════════════════════════════════════════════════════════════════

    # 1. EAF Temperature (I-MR, campaign drift + thermal cycling)
    #    Tap temperature for liquid steel — drifts as refractory degrades
    IDS["eaf_temp"] = insert_char(cur, IDS["eaf"], "EAF Temperature",
        description="Electric Arc Furnace tap temperature",
        subgroup_size=1, target_value=1650.0, usl=1680.0, lsl=1620.0,
        ucl=1665.0, lcl=1635.0, stored_sigma=5.0, stored_center_line=1650.0,
        decimal_precision=1)

    # 2. Tap-to-Tap Time (I-MR)
    #    Cycle time in minutes — operational efficiency metric
    IDS["tap_time"] = insert_char(cur, IDS["eaf"], "Tap-to-Tap Time",
        description="EAF heat cycle duration in minutes",
        subgroup_size=1, target_value=55.0, usl=65.0, lsl=45.0,
        ucl=61.0, lcl=49.0, stored_sigma=2.0, stored_center_line=55.0,
        decimal_precision=1)

    # 3. Slag FeO Content (I-MR)
    #    Percentage of FeO in slag — too high means iron loss
    IDS["slag_feo"] = insert_char(cur, IDS["eaf"], "Slag FeO Content",
        description="Slag iron oxide percentage",
        subgroup_size=1, target_value=22.0, usl=28.0, lsl=16.0,
        ucl=26.0, lcl=18.0, stored_sigma=1.5, stored_center_line=22.0,
        decimal_precision=1)

    # 4. Steel Temperature (I-MR, autocorrelated + thermal cycling)
    #    Ladle furnace holding temperature
    IDS["steel_temp"] = insert_char(cur, IDS["ladle"], "Steel Temperature",
        description="Ladle Metallurgy Furnace steel temperature",
        subgroup_size=1, target_value=1580.0, usl=1600.0, lsl=1560.0,
        ucl=1593.0, lcl=1567.0, stored_sigma=4.5, stored_center_line=1580.0,
        decimal_precision=1)

    # 5. Alloy Addition Weight (I-MR)
    #    Weight of alloy additions per heat in kg
    IDS["alloy_weight"] = insert_char(cur, IDS["ladle"], "Alloy Addition Weight",
        description="Alloy addition per heat in kg",
        subgroup_size=1, target_value=250.0, usl=265.0, lsl=235.0,
        ucl=260.0, lcl=240.0, stored_sigma=3.5, stored_center_line=250.0,
        decimal_precision=1)

    # ══════════════════════════════════════════════════════════════════════
    # HOT STRIP MILL (6 characteristics)
    # ══════════════════════════════════════════════════════════════════════

    # 6. Entry Temperature (I-MR, autocorrelated + thermal cycling)
    #    Temperature at roughing mill entry
    IDS["entry_temp"] = insert_char(cur, IDS["roughing"], "Entry Temperature",
        description="Roughing mill entry temperature",
        subgroup_size=1, target_value=1150.0, usl=1180.0, lsl=1120.0,
        ucl=1168.0, lcl=1132.0, stored_sigma=6.0, stored_center_line=1150.0,
        decimal_precision=1)

    # 7. Strip Thickness (CUSUM, roll wear sawtooth)
    #    Critical dimension — uses CUSUM to detect small shifts from roll wear
    IDS["strip_thick"] = insert_char(cur, IDS["roughing"], "Strip Thickness",
        description="Hot-rolled strip thickness at roughing mill exit",
        subgroup_size=1, target_value=2.500, usl=2.550, lsl=2.450,
        stored_sigma=0.008, stored_center_line=2.500,
        chart_type="cusum", cusum_target=2.500, cusum_k=0.5, cusum_h=5.0,
        decimal_precision=4)

    # 8. Rolling Force (I-MR)
    #    Force in tonnes applied by work rolls
    IDS["roll_force"] = insert_char(cur, IDS["roughing"], "Rolling Force",
        description="Roughing mill rolling force in tonnes",
        subgroup_size=1, target_value=3200.0, usl=3500.0, lsl=2900.0,
        ucl=3400.0, lcl=3000.0, stored_sigma=65.0, stored_center_line=3200.0,
        decimal_precision=0)

    # 9. Exit Temperature (I-MR, autocorrelated + thermal cycling)
    #    Finishing mill exit temperature — critical for metallurgy
    IDS["exit_temp"] = insert_char(cur, IDS["finishing"], "Exit Temperature",
        description="Finishing mill exit temperature",
        subgroup_size=1, target_value=870.0, usl=900.0, lsl=840.0,
        ucl=890.0, lcl=850.0, stored_sigma=6.5, stored_center_line=870.0,
        decimal_precision=1)

    # 10. Strip Speed (I-MR)
    #     Finishing mill strip speed in m/min
    IDS["strip_speed"] = insert_char(cur, IDS["finishing"], "Strip Speed",
        description="Finishing mill strip speed in m/min",
        subgroup_size=1, target_value=600.0, usl=650.0, lsl=550.0,
        ucl=635.0, lcl=565.0, stored_sigma=12.0, stored_center_line=600.0,
        decimal_precision=0)

    # 11. Crown Profile (I-MR)
    #     Strip cross-section convexity in micrometers
    IDS["crown"] = insert_char(cur, IDS["finishing"], "Crown Profile",
        description="Strip crown (center-edge thickness difference) in micrometers",
        subgroup_size=1, target_value=40.0, usl=60.0, lsl=20.0,
        ucl=54.0, lcl=26.0, stored_sigma=4.5, stored_center_line=40.0,
        decimal_precision=1)

    # ══════════════════════════════════════════════════════════════════════
    # COLD ROLLING & ANNEALING (4 characteristics)
    # ══════════════════════════════════════════════════════════════════════

    # 12. Cold Roll Thickness (I-MR, roll wear)
    #     Final gauge after cold reduction
    IDS["cold_thick"] = insert_char(cur, IDS["cold_mill"], "Cold Roll Thickness",
        description="Cold-rolled final gauge thickness in mm",
        subgroup_size=1, target_value=0.800, usl=0.820, lsl=0.780,
        ucl=0.812, lcl=0.788, stored_sigma=0.004, stored_center_line=0.800,
        decimal_precision=4)

    # 13. Surface Roughness Ra (I-MR)
    #     Surface finish after cold rolling in micrometers
    IDS["surface_ra"] = insert_char(cur, IDS["cold_mill"], "Surface Roughness Ra",
        description="Surface roughness Ra in micrometers",
        subgroup_size=1, target_value=0.60, usl=0.90, lsl=0.30,
        ucl=0.80, lcl=0.40, stored_sigma=0.07, stored_center_line=0.60,
        decimal_precision=3)

    # 14. Annealing Temperature (EWMA, autocorrelated)
    #     Continuous annealing furnace temperature — uses EWMA for process inertia
    IDS["anneal_temp"] = insert_char(cur, IDS["cont_anneal"], "Annealing Temperature",
        description="Continuous annealing furnace temperature",
        subgroup_size=1, target_value=720.0, usl=740.0, lsl=700.0,
        stored_sigma=3.0, stored_center_line=720.0,
        chart_type="ewma", ewma_lambda=0.2, ewma_l=3.0,
        decimal_precision=1)

    # 15. Tensile Strength (I-MR)
    #     Mechanical property of annealed strip in MPa
    IDS["tensile"] = insert_char(cur, IDS["cont_anneal"], "Tensile Strength",
        description="Tensile strength of annealed product in MPa",
        subgroup_size=1, target_value=350.0, usl=380.0, lsl=320.0,
        ucl=370.0, lcl=330.0, stored_sigma=6.5, stored_center_line=350.0,
        decimal_precision=0)

    # 16. Yield Strength (I-MR)
    #     Yield strength of annealed strip in MPa
    IDS["yield_str"] = insert_char(cur, IDS["cont_anneal"], "Yield Strength",
        description="Yield strength of annealed product in MPa",
        subgroup_size=1, target_value=250.0, usl=280.0, lsl=220.0,
        ucl=268.0, lcl=232.0, stored_sigma=6.0, stored_center_line=250.0,
        decimal_precision=0)

    # ── Nelson rules for all characteristics ──────────────────────────────
    all_char_keys = [
        # Melt Shop (5)
        "eaf_temp", "tap_time", "slag_feo", "steel_temp", "alloy_weight",
        # Hot Strip Mill (6)
        "entry_temp", "strip_thick", "roll_force", "exit_temp", "strip_speed", "crown",
        # Cold Rolling & Annealing (5)
        "cold_thick", "surface_ra", "anneal_temp", "tensile", "yield_str",
    ]
    for char_key in all_char_keys:
        insert_nelson_rules(cur, IDS[char_key])


# ── Rule Presets ─────────────────────────────────────────────────────────

def seed_rules(cur: sqlite3.Cursor) -> None:
    """Create 'Mill Strict' custom rule preset and assign to key characteristics."""
    mill_rules = json.dumps({
        "rules": [
            {"rule_id": 1, "is_enabled": True, "require_acknowledgement": True,
             "parameters": {"sigma_multiplier": 2.75}},
            {"rule_id": 2, "is_enabled": True, "require_acknowledgement": True,
             "parameters": {"consecutive_count": 8}},
            {"rule_id": 3, "is_enabled": True, "require_acknowledgement": True},
            {"rule_id": 4, "is_enabled": False, "require_acknowledgement": False},
            {"rule_id": 5, "is_enabled": False, "require_acknowledgement": False},
            {"rule_id": 6, "is_enabled": False, "require_acknowledgement": False},
            {"rule_id": 7, "is_enabled": False, "require_acknowledgement": False},
            {"rule_id": 8, "is_enabled": False, "require_acknowledgement": False},
        ]
    })
    cur.execute(
        """INSERT INTO rule_preset (name, description, is_builtin, rules_config, created_at, plant_id)
        VALUES (?, ?, 0, ?, ?, ?)""",
        ("Mill Strict", "Steel mill rules — Rules 1+2+3, Rule 1 at 2.75 sigma, Rule 2 consecutive=8",
         mill_rules, utcnow(), IDS["gls_plant"]))
    mill_preset_id = cur.lastrowid

    # Apply "Mill Strict" preset to EAF Temperature, Strip Thickness, Annealing Temperature
    for char_key in ["eaf_temp", "strip_thick", "anneal_temp"]:
        cur.execute("DELETE FROM characteristic_rules WHERE char_id = ?", (IDS[char_key],))
        # Rule 1: 2.75 sigma
        cur.execute(
            """INSERT INTO characteristic_rules (char_id, rule_id, is_enabled, require_acknowledgement, parameters)
            VALUES (?, 1, 1, 1, ?)""",
            (IDS[char_key], json.dumps({"sigma_multiplier": 2.75})))
        # Rule 2: consecutive=8
        cur.execute(
            """INSERT INTO characteristic_rules (char_id, rule_id, is_enabled, require_acknowledgement, parameters)
            VALUES (?, 2, 1, 1, ?)""",
            (IDS[char_key], json.dumps({"consecutive_count": 8})))
        # Rule 3: enabled, default params
        cur.execute(
            """INSERT INTO characteristic_rules (char_id, rule_id, is_enabled, require_acknowledgement)
            VALUES (?, 3, 1, 1)""",
            (IDS[char_key],))
        # Rules 4-8: disabled
        for rule_id in range(4, 9):
            cur.execute(
                """INSERT INTO characteristic_rules (char_id, rule_id, is_enabled, require_acknowledgement)
                VALUES (?, ?, 0, 0)""",
                (IDS[char_key], rule_id))

        # Link to preset
        try:
            cur.execute("UPDATE characteristic SET rule_preset_id = ? WHERE id = ?",
                        (mill_preset_id, IDS[char_key]))
        except sqlite3.OperationalError:
            pass


# ── Sample Generation ────────────────────────────────────────────────────

def seed_samples(cur: sqlite3.Cursor) -> None:
    """Generate ~7,500 samples across 16 characteristics over 90 days.

    Data patterns:
    - Temperature chars: autocorrelation + day/night thermal cycling
    - EAF Temperature: campaign-based drift (refractory wear, 500-sample campaigns)
    - Strip Thickness: roll wear sawtooth drift (CUSUM)
    - Annealing Temperature: autocorrelated (EWMA)
    - Mechanical properties: correlated (tensile ~ yield)
    """
    N = 500  # samples per characteristic

    # Map operator user IDs for shift assignment
    operator_map = {
        "shift_a": IDS["shift_a"],
        "shift_b": IDS["shift_b"],
        "shift_c": IDS["shift_c"],
    }

    # ══════════════════════════════════════════════════════════════════════
    # MELT SHOP
    # ══════════════════════════════════════════════════════════════════════

    # 1. EAF Temperature — campaign drift + thermal cycling
    #    500-sample campaigns, drift 0.015 degC per sample, then reset
    timestamps = make_timestamps(N, span_days=90)
    raw_vals = gen_campaign_drift(N, target=1650.0, std=3.5, campaign_length=500,
                                  drift_per_sample=0.015)
    vals_with_cycle = add_thermal_cycling(raw_vals, timestamps, amplitude=2.0)
    eaf_samples = []
    for i in range(N):
        op = get_shift_operator(timestamps[i])
        sid = insert_sample(cur, IDS["eaf_temp"], timestamps[i], values=[vals_with_cycle[i]],
                            operator=operator_map[op])
        eaf_samples.append(sid)
    IDS["eaf_temp_samples"] = eaf_samples

    # 2. Tap-to-Tap Time — normal with slight positive skew
    timestamps = make_timestamps(N, span_days=90)
    for i in range(N):
        val = max(40.0, random.gauss(55.0, 1.5) + abs(random.gauss(0, 0.5)))
        op = get_shift_operator(timestamps[i])
        insert_sample(cur, IDS["tap_time"], timestamps[i], values=[val],
                      operator=operator_map[op])

    # 3. Slag FeO Content — normal
    timestamps = make_timestamps(N, span_days=90)
    for i in range(N):
        val = random.gauss(22.0, 1.2)
        op = get_shift_operator(timestamps[i])
        insert_sample(cur, IDS["slag_feo"], timestamps[i], values=[val],
                      operator=operator_map[op])

    # 4. Steel Temperature — autocorrelated + thermal cycling
    timestamps = make_timestamps(N, span_days=90)
    raw_vals = gen_autocorrelated(N, target=1580.0, std=3.0, alpha=0.8)
    vals_with_cycle = add_thermal_cycling(raw_vals, timestamps, amplitude=1.5)
    for i in range(N):
        op = get_shift_operator(timestamps[i])
        insert_sample(cur, IDS["steel_temp"], timestamps[i], values=[vals_with_cycle[i]],
                      operator=operator_map[op])

    # 5. Alloy Addition Weight — normal with batch variation
    timestamps = make_timestamps(N, span_days=90)
    for i in range(N):
        # Slight batch-to-batch variation (every ~50 samples)
        batch_offset = 1.5 * math.sin(2 * math.pi * i / 50)
        val = random.gauss(250.0 + batch_offset, 2.8)
        op = get_shift_operator(timestamps[i])
        batch_num = f"H-{(i // 5) + 1:04d}"
        insert_sample(cur, IDS["alloy_weight"], timestamps[i], values=[val],
                      operator=operator_map[op], batch=batch_num)

    # ══════════════════════════════════════════════════════════════════════
    # HOT STRIP MILL
    # ══════════════════════════════════════════════════════════════════════

    # 6. Entry Temperature — autocorrelated + thermal cycling
    timestamps = make_timestamps(N, span_days=90)
    raw_vals = gen_autocorrelated(N, target=1150.0, std=4.0, alpha=0.85)
    vals_with_cycle = add_thermal_cycling(raw_vals, timestamps, amplitude=2.5)
    for i in range(N):
        op = get_shift_operator(timestamps[i])
        insert_sample(cur, IDS["entry_temp"], timestamps[i], values=[vals_with_cycle[i]],
                      operator=operator_map[op])

    # 7. Strip Thickness — CUSUM with roll wear sawtooth pattern
    #    500-sample campaigns, +0.0001mm per sample from roll wear
    timestamps = make_timestamps(N, span_days=90)
    raw_vals = gen_roll_wear(N, target=2.500, std=0.005, campaign_length=500,
                             wear_per_sample=0.0001)
    target = 2.500
    sigma = 0.008
    k_val = 0.5 * sigma  # k = 0.5 * sigma = 0.004
    cusum_h = 0.0
    cusum_l = 0.0
    strip_samples = []
    for i in range(N):
        cusum_h = max(0.0, cusum_h + (raw_vals[i] - target) - k_val)
        cusum_l = min(0.0, cusum_l + (raw_vals[i] - target) + k_val)
        op = get_shift_operator(timestamps[i])
        sid = insert_sample(cur, IDS["strip_thick"], timestamps[i], values=[raw_vals[i]],
                            cusum_high=cusum_h, cusum_low=cusum_l,
                            operator=operator_map[op])
        strip_samples.append(sid)
    IDS["strip_thick_samples"] = strip_samples

    # 8. Rolling Force — normal with slight autocorrelation from material consistency
    timestamps = make_timestamps(N, span_days=90)
    raw_vals = gen_autocorrelated(N, target=3200.0, std=45.0, alpha=0.5)
    for i in range(N):
        op = get_shift_operator(timestamps[i])
        insert_sample(cur, IDS["roll_force"], timestamps[i], values=[raw_vals[i]],
                      operator=operator_map[op])

    # 9. Exit Temperature — autocorrelated + thermal cycling
    timestamps = make_timestamps(N, span_days=90)
    raw_vals = gen_autocorrelated(N, target=870.0, std=4.5, alpha=0.9)
    vals_with_cycle = add_thermal_cycling(raw_vals, timestamps, amplitude=2.0)
    for i in range(N):
        op = get_shift_operator(timestamps[i])
        insert_sample(cur, IDS["exit_temp"], timestamps[i], values=[vals_with_cycle[i]],
                      operator=operator_map[op])

    # 10. Strip Speed — normal with occasional step changes (speed adjustments)
    timestamps = make_timestamps(N, span_days=90)
    for i in range(N):
        # Speed adjustments every ~200 samples
        if i < 200:
            base = 600.0
        elif i < 400:
            base = 605.0  # slight speed increase
        else:
            base = 598.0  # corrected back down
        val = random.gauss(base, 8.0)
        op = get_shift_operator(timestamps[i])
        insert_sample(cur, IDS["strip_speed"], timestamps[i], values=[val],
                      operator=operator_map[op])

    # 11. Crown Profile — normal with thermal crown variation
    timestamps = make_timestamps(N, span_days=90)
    for i in range(N):
        # Thermal crown builds up during campaigns
        campaign_pos = i % 300
        thermal_crown = 1.5 * (campaign_pos / 300.0)
        val = random.gauss(40.0 + thermal_crown, 3.5)
        op = get_shift_operator(timestamps[i])
        insert_sample(cur, IDS["crown"], timestamps[i], values=[val],
                      operator=operator_map[op])

    # ══════════════════════════════════════════════════════════════════════
    # COLD ROLLING & ANNEALING
    # ══════════════════════════════════════════════════════════════════════

    # 12. Cold Roll Thickness — roll wear pattern (tighter tolerance)
    timestamps = make_timestamps(N, span_days=90)
    raw_vals = gen_roll_wear(N, target=0.800, std=0.0025, campaign_length=400,
                             wear_per_sample=0.00002)
    for i in range(N):
        op = get_shift_operator(timestamps[i])
        insert_sample(cur, IDS["cold_thick"], timestamps[i], values=[raw_vals[i]],
                      operator=operator_map[op])

    # 13. Surface Roughness Ra — normal with slight right skew
    timestamps = make_timestamps(N, span_days=90)
    for i in range(N):
        val = max(0.15, random.gauss(0.60, 0.05) + abs(random.gauss(0, 0.01)))
        op = get_shift_operator(timestamps[i])
        insert_sample(cur, IDS["surface_ra"], timestamps[i], values=[val],
                      operator=operator_map[op])

    # 14. Annealing Temperature — EWMA with autocorrelation
    timestamps = make_timestamps(N, span_days=90)
    raw_vals = gen_autocorrelated(N, target=720.0, std=2.0, alpha=0.7)
    vals_with_cycle = add_thermal_cycling(raw_vals, timestamps, amplitude=1.0)
    ewma = 720.0
    lam = 0.2
    anneal_samples = []
    for i in range(N):
        ewma = lam * vals_with_cycle[i] + (1 - lam) * ewma
        op = get_shift_operator(timestamps[i])
        sid = insert_sample(cur, IDS["anneal_temp"], timestamps[i], values=[vals_with_cycle[i]],
                            ewma_value=ewma, operator=operator_map[op])
        anneal_samples.append(sid)
    IDS["anneal_temp_samples"] = anneal_samples

    # 15 & 16. Tensile Strength & Yield Strength — correlated (r=0.85)
    #          Higher annealing temp tends to lower both, so slight negative
    #          correlation with annealing temp but strong positive between them
    timestamps = make_timestamps(N, span_days=90)
    z1 = [random.gauss(0, 1) for _ in range(N)]
    z2 = [random.gauss(0, 1) for _ in range(N)]
    r = 0.85
    rho_comp = math.sqrt(1 - r ** 2)

    tensile_vals = [350.0 + 6.5 * z for z in z1]
    yield_vals = [250.0 + 6.0 * (r * z1[i] + rho_comp * z2[i]) for i in range(N)]

    for i in range(N):
        op = get_shift_operator(timestamps[i])
        insert_sample(cur, IDS["tensile"], timestamps[i], values=[tensile_vals[i]],
                      operator=operator_map[op])
        insert_sample(cur, IDS["yield_str"], timestamps[i], values=[yield_vals[i]],
                      operator=operator_map[op])


# ── Violations via SPC Replay ────────────────────────────────────────────

def replay_spc_violations(cur: sqlite3.Cursor) -> None:
    """Replay seeded samples through real SPC engine logic to generate organic violations.

    Runs the actual Nelson rules, CUSUM thresholds, and EWMA limits on the
    seeded data to produce only violations that would naturally occur.
    """
    from collections import defaultdict
    from cassini.core.engine.nelson_rules import NelsonRuleLibrary
    from cassini.core.engine.rolling_window import (
        RollingWindow, ZoneBoundaries as RWZoneBoundaries, WindowSample,
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

        # ═══════════════════════════════════════════════════════════════
        # CUSUM characteristics
        # ═══════════════════════════════════════════════════════════════
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

        # ═══════════════════════════════════════════════════════════════
        # EWMA characteristics
        # ═══════════════════════════════════════════════════════════════
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

        # ═══════════════════════════════════════════════════════════════
        # Variable characteristics (Shewhart I-MR)
        # ═══════════════════════════════════════════════════════════════
        elif data_type == "variable" and chart_type is None:
            sigma = c["stored_sigma"]
            center_line = c["stored_center_line"]
            short_run = c["short_run_mode"]
            target_val = c["target_value"]

            if not sigma or sigma <= 0 or center_line is None:
                continue

            # Zone boundaries
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

    # ── Post-replay: Acknowledge some violations on EAF Temperature ──────
    if "eaf_temp_samples" in IDS:
        eaf_samples = IDS["eaf_temp_samples"]
        # Find violations in the campaign drift region (last 100 samples)
        if len(eaf_samples) > 100:
            drift_sids = eaf_samples[-100:]
            placeholders = ",".join("?" * len(drift_sids))
            cur.execute(
                f"SELECT id FROM violation "
                f"WHERE char_id = ? AND sample_id IN ({placeholders}) ORDER BY id",
                [IDS["eaf_temp"]] + drift_sids,
            )
            drift_viols = [row[0] for row in cur.fetchall()]

            ack_data = [
                ("process_engineer", "Refractory wear approaching end-of-campaign threshold"),
                ("process_engineer", "Scheduled reline initiated — campaign 1 complete"),
            ]
            for i, vid in enumerate(drift_viols[:len(ack_data)]):
                user, reason = ack_data[i]
                cur.execute(
                    "UPDATE violation SET acknowledged = 1, ack_user = ?, "
                    "ack_reason = ?, ack_timestamp = ? WHERE id = ?",
                    (user, reason, utcnow(), vid),
                )


# ── Capability History & Annotations ────────────────────────────────────

def seed_capability_and_annotations(cur: sqlite3.Cursor) -> None:
    """Add capability snapshots and annotations for key characteristics."""

    # 2 capability snapshots per characteristic
    cap_data = {
        "eaf_temp": [(1.40, 1.32, 1.35, 1.28, 250), (1.35, 1.25, 1.30, 1.20, 500)],
        "tap_time": [(1.55, 1.48, 1.50, 1.42, 250), (1.60, 1.52, 1.55, 1.48, 500)],
        "slag_feo": [(1.45, 1.38, 1.40, 1.32, 250), (1.50, 1.42, 1.45, 1.38, 500)],
        "steel_temp": [(1.30, 1.22, 1.25, 1.18, 250), (1.35, 1.28, 1.30, 1.22, 500)],
        "alloy_weight": [(1.50, 1.42, 1.45, 1.38, 250), (1.55, 1.48, 1.50, 1.42, 500)],
        "entry_temp": [(1.35, 1.28, 1.30, 1.22, 250), (1.40, 1.32, 1.35, 1.28, 500)],
        "strip_thick": [(1.60, 1.52, 1.55, 1.48, 250), (1.45, 1.35, 1.40, 1.30, 500)],
        "roll_force": [(1.50, 1.45, 1.48, 1.42, 250), (1.55, 1.48, 1.52, 1.45, 500)],
        "exit_temp": [(1.30, 1.20, 1.25, 1.15, 250), (1.35, 1.25, 1.30, 1.20, 500)],
        "strip_speed": [(1.45, 1.38, 1.40, 1.33, 250), (1.50, 1.42, 1.45, 1.38, 500)],
        "crown": [(1.35, 1.28, 1.30, 1.22, 250), (1.40, 1.33, 1.35, 1.28, 500)],
        "cold_thick": [(1.55, 1.48, 1.50, 1.42, 250), (1.50, 1.40, 1.45, 1.35, 500)],
        "surface_ra": [(1.40, 1.32, 1.35, 1.28, 250), (1.45, 1.38, 1.40, 1.33, 500)],
        "anneal_temp": [(1.35, 1.28, 1.30, 1.22, 250), (1.40, 1.32, 1.35, 1.28, 500)],
        "tensile": [(1.50, 1.42, 1.45, 1.38, 250), (1.55, 1.48, 1.50, 1.42, 500)],
        "yield_str": [(1.45, 1.38, 1.40, 1.32, 250), (1.50, 1.42, 1.45, 1.38, 500)],
    }

    for char_key, snapshots in cap_data.items():
        for cp, cpk, pp, ppk, count in snapshots:
            p_val = round(random.uniform(0.10, 0.85), 3)
            insert_capability(cur, IDS[char_key], cp, cpk, pp, ppk,
                              sample_count=count, p_value=p_val, calc_by="process_engineer")

    # ── Annotations ───────────────────────────────────────────────────────

    # EAF: Refractory reline annotation
    cur.execute("SELECT id FROM sample WHERE char_id = ? ORDER BY timestamp LIMIT 1 OFFSET 400",
                (IDS["eaf_temp"],))
    row = cur.fetchone()
    if row:
        insert_annotation(cur, IDS["eaf_temp"], "point",
                          "Refractory lining inspection — approaching end-of-campaign",
                          color="#e67e22", sample_id=row[0], created_by="process_engineer")

    # Strip Thickness: Roll change annotation
    cur.execute("SELECT id FROM sample WHERE char_id = ? ORDER BY timestamp LIMIT 1 OFFSET 250",
                (IDS["strip_thick"],))
    start_row = cur.fetchone()
    cur.execute("SELECT id FROM sample WHERE char_id = ? ORDER BY timestamp LIMIT 1 OFFSET 260",
                (IDS["strip_thick"],))
    end_row = cur.fetchone()
    if start_row and end_row:
        insert_annotation(cur, IDS["strip_thick"], "period",
                          "Roll change — work rolls replaced per schedule",
                          color="#27ae60", start_sid=start_row[0], end_sid=end_row[0],
                          created_by="process_engineer")

    # Annealing Temperature: Furnace zone calibration
    cur.execute("SELECT id FROM sample WHERE char_id = ? ORDER BY timestamp LIMIT 1 OFFSET 300",
                (IDS["anneal_temp"],))
    start_row = cur.fetchone()
    cur.execute("SELECT id FROM sample WHERE char_id = ? ORDER BY timestamp LIMIT 1 OFFSET 310",
                (IDS["anneal_temp"],))
    end_row = cur.fetchone()
    if start_row and end_row:
        insert_annotation(cur, IDS["anneal_temp"], "period",
                          "Furnace zone 3 thermocouple recalibration",
                          color="#3498db", start_sid=start_row[0], end_sid=end_row[0],
                          created_by="process_engineer")

    # Cold Roll Thickness: New coil lot
    cur.execute("SELECT id FROM sample WHERE char_id = ? ORDER BY timestamp LIMIT 1 OFFSET 200",
                (IDS["cold_thick"],))
    row = cur.fetchone()
    if row:
        insert_annotation(cur, IDS["cold_thick"], "point",
                          "New coil lot — incoming material variance higher than spec",
                          color="#e74c3c", sample_id=row[0], created_by="process_engineer")

    # Exit Temperature: Cooling system maintenance
    cur.execute("SELECT id FROM sample WHERE char_id = ? ORDER BY timestamp LIMIT 1 OFFSET 350",
                (IDS["exit_temp"],))
    start_row = cur.fetchone()
    cur.execute("SELECT id FROM sample WHERE char_id = ? ORDER BY timestamp LIMIT 1 OFFSET 365",
                (IDS["exit_temp"],))
    end_row = cur.fetchone()
    if start_row and end_row:
        insert_annotation(cur, IDS["exit_temp"], "period",
                          "Laminar cooling bank 3 nozzle maintenance",
                          color="#9b59b6", start_sid=start_row[0], end_sid=end_row[0],
                          created_by="shift_a")


# ── Async DevTools Entry Point ───────────────────────────────────────────

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

    print("Seeding foundation (plant, hierarchy, users)...")
    seed_foundation(cur)
    print("Seeding characteristics...")
    seed_characteristics(cur)
    print("Seeding rule presets (Mill Strict)...")
    seed_rules(cur)
    print("Seeding samples (~7,500 across 16 characteristics)...")
    seed_samples(cur)
    print("Replaying SPC engine for organic violations...")
    replay_spc_violations(cur)
    print("Seeding capability history and annotations...")
    seed_capability_and_annotations(cur)

    conn.commit()
    conn.close()

    print("Steel Mill seed complete. Login with any user / password: password")


# ── Main ─────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Seed Cassini steel mill database")
    parser.add_argument("--db-path", default=str(DB_PATH))
    parser.add_argument("--dry-run", action="store_true", help="Test imports and generators only")
    parser.add_argument("--force", action="store_true", help="Overwrite existing DB")
    args = parser.parse_args()

    if args.dry_run:
        print("=== Dry Run -- Testing imports and generators ===")
        print(f"Password hash OK: {len(hash_password('test')) > 0}")
        print(f"gen_normal(5): {gen_normal(5, 10, 1)}")
        print(f"gen_autocorrelated(5): {gen_autocorrelated(5, 100, 5, 0.8)}")
        print(f"gen_campaign_drift(10): {gen_campaign_drift(10, 1650, 5, 5, 0.1)}")
        print(f"gen_roll_wear(10): {gen_roll_wear(10, 2.5, 0.005, 5, 0.001)}")
        ts = make_timestamps(5, span_days=1)
        vals = [100.0, 101.0, 99.0, 100.5, 101.5]
        print(f"add_thermal_cycling(5): {add_thermal_cycling(vals, ts, 2.0)}")
        print(f"get_shift_operator: {get_shift_operator(ts[0])}")
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
    print("Seeding rule presets (Mill Strict)...")
    seed_rules(cur)
    print("Seeding samples (~7,500 across 16 characteristics)...")
    seed_samples(cur)
    print("Replaying SPC engine for organic violations...")
    replay_spc_violations(cur)
    print("Seeding capability history and annotations...")
    seed_capability_and_annotations(cur)

    conn.commit()

    # Print summary
    tables = [
        "plant", "hierarchy", "user", "user_plant_role",
        "characteristic", "characteristic_rules", "rule_preset",
        "sample", "measurement", "violation",
        "annotation", "capability_history",
    ]
    print("\n=== Summary ===")
    for t in tables:
        cur.execute(f"SELECT COUNT(*) FROM {t}")
        print(f"  {t}: {cur.fetchone()[0]}")

    conn.close()

    print(f"\nSteel Mill DB created: {db_path}")
    print("Login with any user / password: password")


if __name__ == "__main__":
    main()
