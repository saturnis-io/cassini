"""Aerospace Manufacturing seed script — turbine blades, composites, fastener assemblies.

Creates 1 plant (Cascade Aerospace — Portland) with 3 production cells,
14 characteristics covering X-bar R, I-MR, attribute (p/np), short-run,
non-normal distributions (Weibull, Beta), plus MSA, FAI, and gage bridge data.

Uses raw sqlite3 for speed (same pattern as seed_showcase.py).

Usage:
    python scripts/seed_aerospace.py --dry-run        # Test generators only
    python scripts/seed_aerospace.py --force           # Create aerospace.db
    python scripts/seed_aerospace.py --db-path foo.db  # Custom path
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
DB_PATH = backend_dir / "aerospace.db"
IDS: dict[str, int] = {}

# Reproducible random data
random.seed(2026)

SPAN_DAYS = 120  # 120 days of data
TOTAL_SAMPLES_TARGET = 5000  # ~5000 total spread across chars


# ── Data generators ──────────────────────────────────────────────────────

def gen_normal(n: int, mean: float, std: float) -> list[float]:
    """Generate n normally distributed values."""
    return [random.gauss(mean, std) for _ in range(n)]


def gen_drift(n: int, mean: float, std: float, drift_per_sample: float) -> list[float]:
    """Generate n values with a linear mean drift (tool wear)."""
    return [random.gauss(mean + i * drift_per_sample, std) for i in range(n)]


def gen_weibull(n: int, shape: float, scale: float) -> list[float]:
    """Generate n Weibull-distributed values via inverse CDF."""
    return [scale * (-math.log(1 - random.random())) ** (1 / shape) for _ in range(n)]


def gen_beta(n: int, alpha: float, beta: float) -> list[float]:
    """Generate n Beta-distributed values."""
    return [random.betavariate(alpha, beta) for _ in range(n)]


def gen_lot_shift(n: int, mean: float, std: float, lot_size: int, shift_std: float) -> list[float]:
    """Generate n values with step shifts every lot_size samples (material lot variation)."""
    result = []
    lot_mean = mean
    for i in range(n):
        if i % lot_size == 0:
            lot_mean = mean + random.gauss(0, shift_std)
        result.append(random.gauss(lot_mean, std))
    return result


def gen_binomial(n: int, trials: int, prob: float) -> list[int]:
    """Generate n binomial-distributed values."""
    return [sum(1 for _ in range(trials) if random.random() < prob) for _ in range(n)]


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


# ── Foundation: Plant, Hierarchy, Users, Roles ───────────────────────────

def seed_foundation(cur: sqlite3.Cursor) -> None:
    """Create 1 plant, hierarchy, 4 users, and role assignments."""

    # ── Plant ─────────────────────────────────────────────────────────────
    IDS["cap_plant"] = insert_plant(cur, "Cascade Aerospace \u2014 Portland", "CAP")

    # ── CNC Machining Center ──────────────────────────────────────────────
    IDS["cnc_area"] = insert_hierarchy(cur, IDS["cap_plant"], "CNC Machining Center", "Area")
    IDS["cnc_5axis"] = insert_hierarchy(cur, IDS["cap_plant"], "5-Axis CNC", "Cell", IDS["cnc_area"])

    # ── Composite Layup ───────────────────────────────────────────────────
    IDS["comp_area"] = insert_hierarchy(cur, IDS["cap_plant"], "Composite Layup", "Area")
    IDS["layup_room"] = insert_hierarchy(cur, IDS["cap_plant"], "Layup Room", "Cell", IDS["comp_area"])

    # ── Final Assembly ────────────────────────────────────────────────────
    IDS["assy_area"] = insert_hierarchy(cur, IDS["cap_plant"], "Final Assembly", "Area")
    IDS["assy_cell"] = insert_hierarchy(cur, IDS["cap_plant"], "Assembly Cell", "Cell", IDS["assy_area"])
    IDS["final_insp"] = insert_hierarchy(cur, IDS["cap_plant"], "Final Inspection", "Cell", IDS["assy_area"])

    # ── Users ─────────────────────────────────────────────────────────────
    IDS["admin"] = insert_user(cur, "admin", "password",
                               email="admin@cascade-aero.com", full_name="Karen Yamamoto")
    IDS["engineer"] = insert_user(cur, "mfg.engineer", "password",
                                   email="ravi@cascade-aero.com", full_name="Ravi Chandrasekaran")
    IDS["cmm_op"] = insert_user(cur, "cmm.operator", "password",
                                 email="jenny@cascade-aero.com", full_name="Jenny Nguyen")
    IDS["assembler"] = insert_user(cur, "assembler", "password",
                                    email="carlos@cascade-aero.com", full_name="Carlos Mendez")

    # ── Role assignments ──────────────────────────────────────────────────
    insert_role(cur, IDS["admin"], IDS["cap_plant"], "admin")
    insert_role(cur, IDS["engineer"], IDS["cap_plant"], "engineer")
    insert_role(cur, IDS["cmm_op"], IDS["cap_plant"], "operator")
    insert_role(cur, IDS["assembler"], IDS["cap_plant"], "operator")


# ── Characteristics ──────────────────────────────────────────────────────

def seed_characteristics(cur: sqlite3.Cursor) -> None:
    """Create 14 characteristics across 3 production cells."""

    # ══════════════════════════════════════════════════════════════════════
    # CNC Machining Center — 5-Axis CNC (4 characteristics)
    # ══════════════════════════════════════════════════════════════════════

    # 1. Blade Root Width (X-bar R, n=5, SHORT-RUN DEVIATION MODE, tool wear drift)
    IDS["blade_root_width"] = insert_char(cur, IDS["cnc_5axis"], "Blade Root Width",
        description="Fir tree root width on turbine blade — deviation chart for mixed part numbers",
        subgroup_size=5, target_value=28.000, usl=28.050, lsl=27.950,
        ucl=28.030, lcl=27.970, stored_sigma=0.008, stored_center_line=28.000,
        short_run_mode="deviation", decimal_precision=4)

    # 2. Airfoil Chord Length (X-bar R, n=5, tool wear drift)
    IDS["airfoil_chord"] = insert_char(cur, IDS["cnc_5axis"], "Airfoil Chord Length",
        description="Chord measurement at 50% span station",
        subgroup_size=5, target_value=42.500, usl=42.750, lsl=42.250,
        ucl=42.650, lcl=42.350, stored_sigma=0.060, stored_center_line=42.500,
        decimal_precision=4)

    # 3. Fir Tree Slot Depth (I-MR, n=1, tool wear drift)
    IDS["fir_tree_slot"] = insert_char(cur, IDS["cnc_5axis"], "Fir Tree Slot Depth",
        description="Depth of fir tree locking slot on turbine disk",
        subgroup_size=1, target_value=15.240, usl=15.340, lsl=15.140,
        ucl=15.300, lcl=15.180, stored_sigma=0.025, stored_center_line=15.240,
        decimal_precision=4)

    # 4. Surface Finish Ra (I-MR, n=1, tool wear drift)
    IDS["surface_finish"] = insert_char(cur, IDS["cnc_5axis"], "Surface Finish Ra",
        description="Arithmetic average roughness on machined airfoil surface",
        subgroup_size=1, target_value=0.800, usl=1.600, lsl=None,
        ucl=1.400, lcl=0.200, stored_sigma=0.250, stored_center_line=0.800,
        decimal_precision=3)

    # ══════════════════════════════════════════════════════════════════════
    # Composite Layup — Layup Room (4 characteristics)
    # ══════════════════════════════════════════════════════════════════════

    # 5. Ply Thickness (X-bar R, n=5, material lot variation)
    IDS["ply_thickness"] = insert_char(cur, IDS["layup_room"], "Ply Thickness",
        description="Individual ply thickness measured at 5 stations across panel",
        subgroup_size=5, target_value=0.250, usl=0.270, lsl=0.230,
        ucl=0.262, lcl=0.238, stored_sigma=0.005, stored_center_line=0.250,
        decimal_precision=4)

    # 6. Fiber Volume Fraction (I-MR, n=1, Weibull distribution)
    IDS["fiber_volume"] = insert_char(cur, IDS["layup_room"], "Fiber Volume Fraction",
        description="Fiber volume % from acid digestion test — Weibull distributed",
        subgroup_size=1, target_value=60.0, usl=65.0, lsl=55.0,
        ucl=63.0, lcl=57.0, stored_sigma=1.5, stored_center_line=60.0,
        distribution_method="weibull",
        distribution_params='{"shape": 12.0, "scale": 0.62}',
        decimal_precision=1)

    # 7. Cure Temperature (I-MR, n=1, material lot variation)
    IDS["cure_temp"] = insert_char(cur, IDS["layup_room"], "Cure Temperature",
        description="Autoclave cure temperature at thermocouple T1",
        subgroup_size=1, target_value=177.0, usl=180.0, lsl=174.0,
        ucl=178.5, lcl=175.5, stored_sigma=0.50, stored_center_line=177.0,
        decimal_precision=1)

    # 8. Void Content % (I-MR, n=1, Beta distribution)
    IDS["void_content"] = insert_char(cur, IDS["layup_room"], "Void Content %",
        description="Void percentage from ultrasonic C-scan — Beta distributed",
        subgroup_size=1, target_value=1.0, usl=2.0, lsl=None,
        ucl=1.8, lcl=0.2, stored_sigma=0.40, stored_center_line=1.0,
        distribution_method="beta",
        distribution_params='{"alpha": 2.0, "beta": 20.0}',
        decimal_precision=2)

    # ══════════════════════════════════════════════════════════════════════
    # Final Assembly — Assembly Cell (4 variable characteristics)
    # ══════════════════════════════════════════════════════════════════════

    # 9. Rivet Grip Length (X-bar R, n=5, tight tolerance)
    IDS["rivet_grip"] = insert_char(cur, IDS["assy_cell"], "Rivet Grip Length",
        description="Grip length of Hi-Lok rivets on skin panel splice",
        subgroup_size=5, target_value=6.350, usl=6.500, lsl=6.200,
        ucl=6.440, lcl=6.260, stored_sigma=0.030, stored_center_line=6.350,
        decimal_precision=4)

    # 10. Hole Diameter (I-MR, n=1, tight tolerance)
    IDS["hole_diameter"] = insert_char(cur, IDS["assy_cell"], "Hole Diameter",
        description="Drilled hole diameter for Hi-Lok fastener installation",
        subgroup_size=1, target_value=4.826, usl=4.876, lsl=4.776,
        ucl=4.862, lcl=4.790, stored_sigma=0.012, stored_center_line=4.826,
        decimal_precision=4)

    # 11. Fastener Torque (I-MR, n=1, tight tolerance)
    IDS["fastener_torque"] = insert_char(cur, IDS["assy_cell"], "Fastener Torque",
        description="Installation torque on Hi-Lok collar",
        subgroup_size=1, target_value=25.0, usl=28.0, lsl=22.0,
        ucl=26.5, lcl=23.5, stored_sigma=0.80, stored_center_line=25.0,
        decimal_precision=1)

    # 12. Skin Panel Gap (I-MR, n=1, tight tolerance)
    IDS["panel_gap"] = insert_char(cur, IDS["assy_cell"], "Skin Panel Gap",
        description="Gap measurement between mating skin panels at splice line",
        subgroup_size=1, target_value=0.050, usl=0.150, lsl=0.000,
        ucl=0.120, lcl=0.000, stored_sigma=0.025, stored_center_line=0.050,
        decimal_precision=3)

    # ══════════════════════════════════════════════════════════════════════
    # Final Assembly — Final Inspection (2 attribute characteristics)
    # ══════════════════════════════════════════════════════════════════════

    # 13. Visual Defect Rate (p-chart, sample_size=50)
    IDS["visual_defect_rate"] = insert_char(cur, IDS["final_insp"], "Visual Defect Rate",
        description="Proportion of units with visual defects per inspection lot",
        data_type="attribute", attribute_chart_type="p", default_sample_size=50,
        decimal_precision=4)

    # 14. Rejected Units per Lot (np-chart, sample_size=100)
    IDS["rejected_units"] = insert_char(cur, IDS["final_insp"], "Rejected Units per Lot",
        description="Count of rejected units per production lot",
        data_type="attribute", attribute_chart_type="np", default_sample_size=100,
        decimal_precision=0)


# ── Nelson Rules ─────────────────────────────────────────────────────────

def seed_rules(cur: sqlite3.Cursor) -> None:
    """Assign Nelson rules to all variable characteristics (rules 1-4 minimum)."""

    variable_chars = [
        "blade_root_width", "airfoil_chord", "fir_tree_slot", "surface_finish",
        "ply_thickness", "fiber_volume", "cure_temp", "void_content",
        "rivet_grip", "hole_diameter", "fastener_torque", "panel_gap",
    ]

    for key in variable_chars:
        insert_nelson_rules(cur, IDS[key])

    # Attribute chars get rules 1-4 only (rules 5-8 not applicable)
    attr_rules = [
        (1, True, True),
        (2, True, True),
        (3, True, False),
        (4, True, False),
    ]
    for key in ("visual_defect_rate", "rejected_units"):
        insert_nelson_rules(cur, IDS[key], rules=attr_rules)


# ── Variable Samples ─────────────────────────────────────────────────────

def seed_variable_samples(cur: sqlite3.Cursor) -> None:
    """Generate ~4,500 variable samples across 12 characteristics.

    Data patterns:
    - CNC chars: slow tool wear drift (0.0002mm/sample)
    - Composite chars: material lot step shifts every ~200 samples
    - Assembly chars: tight tolerance precision data
    """

    # ── 1. Blade Root Width (X-bar R, n=5, deviation mode, tool wear drift) ──
    n_samples = 400
    timestamps = make_timestamps(n_samples, span_days=SPAN_DAYS)
    drift_rate = 0.0002  # mm/sample tool wear
    for i in range(n_samples):
        center = 28.000 + i * drift_rate
        values = gen_normal(5, center, 0.006)
        mean_val = sum(values) / 5
        insert_sample(cur, IDS["blade_root_width"], timestamps[i], values=values)
    IDS["brw_count"] = n_samples

    # ── 2. Airfoil Chord Length (X-bar R, n=5, tool wear drift) ──────────
    n_samples = 400
    timestamps = make_timestamps(n_samples, span_days=SPAN_DAYS)
    for i in range(n_samples):
        center = 42.500 + i * 0.0002
        values = gen_normal(5, center, 0.040)
        insert_sample(cur, IDS["airfoil_chord"], timestamps[i], values=values)

    # ── 3. Fir Tree Slot Depth (I-MR, tool wear drift) ───────────────────
    n_samples = 400
    timestamps = make_timestamps(n_samples, span_days=SPAN_DAYS)
    raw_vals = gen_drift(n_samples, 15.240, 0.018, 0.0002)
    for i in range(n_samples):
        insert_sample(cur, IDS["fir_tree_slot"], timestamps[i], values=[raw_vals[i]])

    # ── 4. Surface Finish Ra (I-MR, tool wear drift — surface degrades) ──
    n_samples = 400
    timestamps = make_timestamps(n_samples, span_days=SPAN_DAYS)
    raw_vals = gen_drift(n_samples, 0.800, 0.150, 0.0003)
    for i in range(n_samples):
        val = max(0.05, raw_vals[i])  # roughness can't be zero
        insert_sample(cur, IDS["surface_finish"], timestamps[i], values=[val])

    # ── 5. Ply Thickness (X-bar R, n=5, material lot variation) ──────────
    n_samples = 400
    timestamps = make_timestamps(n_samples, span_days=SPAN_DAYS)
    raw_vals = gen_lot_shift(n_samples * 5, 0.250, 0.003, 200 * 5, 0.004)
    for i in range(n_samples):
        values = raw_vals[i * 5:(i + 1) * 5]
        insert_sample(cur, IDS["ply_thickness"], timestamps[i], values=values)

    # ── 6. Fiber Volume Fraction (I-MR, Weibull shape=12, scale=0.62) ────
    # Weibull generates values around 0.59-0.63 range; scale to percentage
    n_samples = 350
    timestamps = make_timestamps(n_samples, span_days=SPAN_DAYS)
    raw_vals = gen_weibull(n_samples, shape=12.0, scale=0.62)
    for i in range(n_samples):
        # Scale from fraction (0.5-0.7) to percentage (50-70)
        val = raw_vals[i] * 100.0
        insert_sample(cur, IDS["fiber_volume"], timestamps[i], values=[val])

    # ── 7. Cure Temperature (I-MR, material lot variation) ───────────────
    n_samples = 350
    timestamps = make_timestamps(n_samples, span_days=SPAN_DAYS)
    raw_vals = gen_lot_shift(n_samples, 177.0, 0.35, 200, 0.30)
    for i in range(n_samples):
        insert_sample(cur, IDS["cure_temp"], timestamps[i], values=[raw_vals[i]])

    # ── 8. Void Content % (I-MR, Beta alpha=2, beta=20) ─────────────────
    n_samples = 350
    timestamps = make_timestamps(n_samples, span_days=SPAN_DAYS)
    raw_vals = gen_beta(n_samples, alpha=2.0, beta=20.0)
    for i in range(n_samples):
        # Beta(2,20) has mean ~0.091; scale to 0-5% range for void content
        val = raw_vals[i] * 10.0  # roughly 0-2% range
        insert_sample(cur, IDS["void_content"], timestamps[i], values=[val])

    # ── 9. Rivet Grip Length (X-bar R, n=5, tight tolerance) ─────────────
    n_samples = 350
    timestamps = make_timestamps(n_samples, span_days=SPAN_DAYS)
    for i in range(n_samples):
        values = gen_normal(5, 6.350, 0.020)
        insert_sample(cur, IDS["rivet_grip"], timestamps[i], values=values)

    # ── 10. Hole Diameter (I-MR, tight tolerance) ────────────────────────
    n_samples = 350
    timestamps = make_timestamps(n_samples, span_days=SPAN_DAYS)
    raw_vals = gen_normal(n_samples, 4.826, 0.008)
    for i in range(n_samples):
        insert_sample(cur, IDS["hole_diameter"], timestamps[i], values=[raw_vals[i]])

    # ── 11. Fastener Torque (I-MR, tight tolerance) ──────────────────────
    n_samples = 350
    timestamps = make_timestamps(n_samples, span_days=SPAN_DAYS)
    raw_vals = gen_normal(n_samples, 25.0, 0.60)
    for i in range(n_samples):
        insert_sample(cur, IDS["fastener_torque"], timestamps[i], values=[raw_vals[i]])

    # ── 12. Skin Panel Gap (I-MR, tight tolerance, bounded at 0) ────────
    n_samples = 350
    timestamps = make_timestamps(n_samples, span_days=SPAN_DAYS)
    raw_vals = gen_normal(n_samples, 0.050, 0.018)
    for i in range(n_samples):
        val = max(0.0, raw_vals[i])  # gap can't be negative
        insert_sample(cur, IDS["panel_gap"], timestamps[i], values=[val])


# ── Attribute Samples ────────────────────────────────────────────────────

def seed_attribute_samples(cur: sqlite3.Cursor) -> None:
    """Generate ~500 attribute samples for the 2 attribute characteristics."""

    # ── Visual Defect Rate (p-chart, sample_size=50) ──────────────────────
    n_samples = 250
    timestamps = make_timestamps(n_samples, span_days=SPAN_DAYS)
    defect_counts = gen_binomial(n_samples, 50, 0.04)
    for i in range(n_samples):
        insert_sample(cur, IDS["visual_defect_rate"], timestamps[i],
                      defect_count=defect_counts[i], sample_size=50)

    # ── Rejected Units per Lot (np-chart, sample_size=100) ────────────────
    n_samples = 250
    timestamps = make_timestamps(n_samples, span_days=SPAN_DAYS)
    defect_counts = gen_binomial(n_samples, 100, 0.03)
    for i in range(n_samples):
        insert_sample(cur, IDS["rejected_units"], timestamps[i],
                      defect_count=defect_counts[i], sample_size=100)


# ── SPC Violation Replay ─────────────────────────────────────────────────

def replay_spc_violations(cur: sqlite3.Cursor) -> None:
    """Replay seeded samples through Nelson rule checker to generate organic violations."""

    total_violations = 0

    # Load all variable characteristics with control limits
    cur.execute("""
        SELECT id, name, data_type, subgroup_size, ucl, lcl, stored_sigma, stored_center_line
        FROM characteristic
        WHERE data_type = 'variable' AND ucl IS NOT NULL AND lcl IS NOT NULL
    """)
    chars = cur.fetchall()

    for char_row in chars:
        char_id, name, _, subgroup_size, ucl, lcl, sigma, cl = char_row

        if ucl is None or lcl is None or cl is None:
            continue

        # Load enabled rules
        cur.execute("""
            SELECT rule_id FROM characteristic_rules
            WHERE char_id = ? AND is_enabled = 1
        """, (char_id,))
        enabled_rules = [r[0] for r in cur.fetchall()]
        if not enabled_rules:
            continue

        checker = InlineNelsonChecker(cl, ucl, lcl, enabled_rules)

        # Load samples with measurements
        cur.execute("""
            SELECT s.id, s.actual_n FROM sample s
            WHERE s.char_id = ? AND s.is_excluded = 0
            ORDER BY s.timestamp
        """, (char_id,))
        samples = cur.fetchall()

        for sample_id, actual_n in samples:
            cur.execute("SELECT value FROM measurement WHERE sample_id = ?", (sample_id,))
            meas = [r[0] for r in cur.fetchall()]
            if not meas:
                continue

            sample_mean = sum(meas) / len(meas)
            triggered = checker.check(sample_mean)

            for rule_id in triggered:
                severity = "CRITICAL" if rule_id == 1 else "WARNING"
                rule_name = NELSON_RULE_NAMES.get(rule_id, f"Rule {rule_id}")
                insert_violation(cur, sample_id, char_id,
                                 rule_id=rule_id, rule_name=rule_name, severity=severity)
                total_violations += 1

    print(f"  Generated {total_violations} organic violations via Nelson rules")


# ── Capability History ───────────────────────────────────────────────────

def seed_capability(cur: sqlite3.Cursor) -> None:
    """Insert capability snapshots for key characteristics."""

    # CNC — Blade Root Width: good capability, slight drift concern
    insert_capability(cur, IDS["blade_root_width"],
                      cp=1.82, cpk=1.65, pp=1.75, ppk=1.58,
                      sample_count=400, p_value=0.42, calc_by="mfg.engineer")

    # CNC — Airfoil Chord: strong capability
    insert_capability(cur, IDS["airfoil_chord"],
                      cp=1.95, cpk=1.88, pp=1.90, ppk=1.82,
                      sample_count=400, p_value=0.68, calc_by="mfg.engineer")

    # Composite — Ply Thickness: material lot variation reduces Ppk
    insert_capability(cur, IDS["ply_thickness"],
                      cp=1.60, cpk=1.52, pp=1.35, ppk=1.28,
                      sample_count=400, p_value=0.31, calc_by="mfg.engineer")

    # Assembly — Rivet Grip: tight tolerance, high capability
    insert_capability(cur, IDS["rivet_grip"],
                      cp=2.10, cpk=2.00, pp=2.05, ppk=1.95,
                      sample_count=350, p_value=0.55, calc_by="mfg.engineer")

    # Assembly — Hole Diameter: tight tolerance, measured by CMM
    insert_capability(cur, IDS["hole_diameter"],
                      cp=1.72, cpk=1.68, pp=1.70, ppk=1.65,
                      sample_count=350, p_value=0.61, calc_by="cmm.operator")

    # Assembly — Fastener Torque: good capability
    insert_capability(cur, IDS["fastener_torque"],
                      cp=2.50, cpk=2.40, pp=2.45, ppk=2.35,
                      sample_count=350, p_value=0.73, calc_by="mfg.engineer")


# ── Annotations ──────────────────────────────────────────────────────────

def seed_annotations(cur: sqlite3.Cursor) -> None:
    """Add chart annotations for significant events."""

    # Tool change on CNC at sample ~200
    cur.execute("SELECT id FROM sample WHERE char_id = ? ORDER BY timestamp LIMIT 1 OFFSET 199",
                (IDS["blade_root_width"],))
    row = cur.fetchone()
    if row:
        insert_annotation(cur, IDS["blade_root_width"], "point",
                          "Tool insert replaced — carbide grade change to KC5010",
                          color="#2563eb", sample_id=row[0], created_by="mfg.engineer")

    # Material lot change on composites at sample ~200
    cur.execute("SELECT id FROM sample WHERE char_id = ? ORDER BY timestamp LIMIT 1 OFFSET 199",
                (IDS["ply_thickness"],))
    row = cur.fetchone()
    if row:
        insert_annotation(cur, IDS["ply_thickness"], "point",
                          "New prepreg lot received — Lot 2026-W14 (Toray T800H/3900-2)",
                          color="#d97706", sample_id=row[0], created_by="mfg.engineer")

    # Period annotation for fixture recalibration
    cur.execute("SELECT id FROM sample WHERE char_id = ? ORDER BY timestamp LIMIT 1 OFFSET 149",
                (IDS["rivet_grip"],))
    start_row = cur.fetchone()
    cur.execute("SELECT id FROM sample WHERE char_id = ? ORDER BY timestamp LIMIT 1 OFFSET 159",
                (IDS["rivet_grip"],))
    end_row = cur.fetchone()
    if start_row and end_row:
        insert_annotation(cur, IDS["rivet_grip"], "period",
                          "Assembly fixture recalibration — 4-hour maintenance window",
                          color="#059669", start_sid=start_row[0], end_sid=end_row[0],
                          created_by="mfg.engineer")


# ── Connectivity: MQTT Broker ────────────────────────────────────────────

def seed_connectivity(cur: sqlite3.Cursor) -> None:
    """Create MQTT broker for gage bridge connectivity."""
    now = utcnow()

    cur.execute("""INSERT INTO mqtt_broker
        (plant_id, name, host, port, username, password, client_id, keepalive, max_reconnect_delay,
         use_tls, is_active, payload_format, outbound_enabled, outbound_topic_prefix, outbound_format,
         outbound_rate_limit, created_at, updated_at)
        VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, ?, 0, 1, ?, 1, ?, ?, ?, ?, ?)""",
        (IDS["cap_plant"], "Portland Shop Floor MQTT", "localhost", 1883,
         "cassini-portland", 60, 30,
         "json", "cassini/portland/outbound/", "json", 10.0, now, now))
    IDS["cap_broker"] = cur.lastrowid


# ── Gage Bridge + Ports ──────────────────────────────────────────────────

def seed_gage_bridges(cur: sqlite3.Cursor) -> None:
    """Create 1 gage bridge with 2 serial ports."""
    now = utcnow()

    # CMM Bridge Portland
    api_key = "aero-portland-cmm-bridge-key-001"
    cur.execute("""INSERT INTO gage_bridge
        (plant_id, name, api_key_hash, mqtt_broker_id, status, last_heartbeat_at, registered_by, created_at)
        VALUES (?, ?, ?, ?, 'online', ?, ?, ?)""",
        (IDS["cap_plant"], "CMM Bridge Portland",
         hashlib.sha256(api_key.encode()).hexdigest(),
         IDS["cap_broker"], now, IDS["engineer"], now))
    bridge_id = cur.lastrowid

    # Port 1: COM3, Mitutoyo caliper, mapped to Hole Diameter
    cur.execute("""INSERT INTO gage_port
        (bridge_id, port_name, baud_rate, data_bits, parity, stop_bits, protocol_profile,
         parse_pattern, mqtt_topic, characteristic_id, is_active, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 1, ?)""",
        (bridge_id, "COM3", 9600, 8, "none", 1.0, "mitutoyo_digimatic",
         "portland/assembly/measurements", IDS["hole_diameter"], now))

    # Port 2: COM4, Starrett micrometer (generic regex), mapped to Blade Root Width
    cur.execute("""INSERT INTO gage_port
        (bridge_id, port_name, baud_rate, data_bits, parity, stop_bits, protocol_profile,
         parse_pattern, mqtt_topic, characteristic_id, is_active, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)""",
        (bridge_id, "COM4", 115200, 8, "none", 1.0, "generic_regex",
         r"(?P<value>[\d.]+)\s*mm", "portland/cnc/measurements", IDS["blade_root_width"], now))


# ── MSA Study ────────────────────────────────────────────────────────────

def seed_msa(cur: sqlite3.Cursor) -> None:
    """1 complete crossed_anova MSA study: CMM Bore Measurement GR&R."""
    now = utcnow()

    # 3 operators x 10 parts x 3 reps = 90 measurements
    cur.execute("""INSERT INTO msa_study
        (plant_id, name, study_type, characteristic_id, num_operators, num_parts, num_replicates,
         tolerance, status, created_by, created_at, completed_at, results_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (IDS["cap_plant"], "CMM Bore Measurement GR&R", "crossed_anova", IDS["hole_diameter"],
         3, 10, 3, 0.050, "complete", IDS["engineer"], now, now,
         json.dumps({
             "grr_percent": 14.8,
             "ndc": 7,
             "repeatability": 10.2,
             "reproducibility": 10.7,
             "part_variation": 98.9,
             "total_variation": 100.0,
             "anova_table": {
                 "source": ["Operator", "Part", "Operator*Part", "Repeatability", "Total"],
                 "df": [2, 9, 18, 60, 89],
                 "ss": [0.00008, 0.00452, 0.00005, 0.00098, 0.00563],
                 "ms": [0.00004, 0.00050, 0.000003, 0.000016],
                 "f": [14.3, 178.6, 0.18],
             },
         })))
    study_id = cur.lastrowid

    # Operators
    operator_names = ["Jenny Nguyen", "Carlos Mendez", "Ravi Chandrasekaran"]
    op_ids = []
    for i, name in enumerate(operator_names):
        cur.execute("INSERT INTO msa_operator (study_id, name, sequence_order) VALUES (?, ?, ?)",
            (study_id, name, i + 1))
        op_ids.append(cur.lastrowid)

    # Parts — spread around nominal 4.826mm
    part_ids = []
    part_refs = [4.826 + 0.003 * (i - 5) for i in range(10)]
    for i in range(10):
        cur.execute("INSERT INTO msa_part (study_id, name, reference_value, sequence_order) VALUES (?, ?, ?, ?)",
            (study_id, f"Part-{i+1:02d}", part_refs[i], i + 1))
        part_ids.append(cur.lastrowid)

    # Measurements: 3 ops x 10 parts x 3 reps = 90
    for op_idx, op_id in enumerate(op_ids):
        for part_idx, part_id in enumerate(part_ids):
            for rep in range(3):
                base = part_refs[part_idx]
                op_bias = [-0.0005, 0.0000, 0.0005][op_idx]
                error = random.gauss(0, 0.002)
                value = round(base + op_bias + error, 4)
                cur.execute("""INSERT INTO msa_measurement
                    (study_id, operator_id, part_id, replicate_num, value, attribute_value, timestamp)
                    VALUES (?, ?, ?, ?, ?, NULL, ?)""",
                    (study_id, op_id, part_id, rep + 1, value, now))


# ── FAI Reports ──────────────────────────────────────────────────────────

def seed_fai(cur: sqlite3.Cursor) -> None:
    """2 FAI reports: 1 approved (Turbine Blade), 1 draft (Composite Panel)."""
    now = utcnow()

    # ── Report 1: Turbine Blade — AS9102 Rev C, approved ─────────────────
    cur.execute("""INSERT INTO fai_report
        (plant_id, part_number, part_name, revision, serial_number, lot_number, drawing_number,
         organization_name, supplier, purchase_order, reason_for_inspection,
         material_supplier, material_spec, special_processes, functional_test_results,
         status, created_by, created_at, submitted_by, submitted_at, approved_by, approved_at, rejection_reason)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)""",
        (IDS["cap_plant"], "TB-2026-PDX-001", "Turbine Blade Stage 1 HPT", "C", "SN-TB-0117",
         "LOT-2026-P08", "DWG-TB-2026-001-C",
         "Cascade Aerospace Inc.", "PCC Airfoils LLC", "PO-2026-CAP-0042", "new_production",
         "Allegheny Technologies", "AMS 5596 Inconel 718", "Heat treat (AMS 2774), FPI (ASTM E1417), Shot peen (AMS 2430)",
         "All functional tests passed per ATP-TB-001 Rev D",
         "approved", IDS["engineer"], now, IDS["engineer"], now, IDS["admin"], now))
    fai1 = cur.lastrowid

    # 12 FAI items: 11 pass, 1 rework
    blade_items = [
        (1, "Blade Root Width", 28.000, 28.050, 27.950, 28.012, "mm", "CMM", True, "pass"),
        (2, "Airfoil Chord Length", 42.500, 42.750, 42.250, 42.485, "mm", "CMM", True, "pass"),
        (3, "Fir Tree Slot Depth", 15.240, 15.340, 15.140, 15.252, "mm", "CMM", True, "pass"),
        (4, "Surface Finish Ra", 0.800, 1.600, None, 0.920, "um", "Profilometer", False, "pass"),
        (5, "Blade Span", 185.000, 185.500, 184.500, 184.980, "mm", "CMM", True, "pass"),
        (6, "Tip Thickness", 1.200, 1.300, 1.100, 1.215, "mm", "Micrometer", True, "pass"),
        (7, "Leading Edge Radius", 0.800, 0.900, 0.700, 0.815, "mm", "Optical CMM", True, "pass"),
        (8, "Trailing Edge Thickness", 0.500, 0.600, 0.400, 0.490, "mm", "Micrometer", True, "pass"),
        (9, "Platform Height", 12.000, 12.150, 11.850, 12.075, "mm", "CMM", True, "pass"),
        (10, "Dovetail Width", 18.500, 18.600, 18.400, 18.520, "mm", "CMM", True, "pass"),
        (11, "Cooling Hole Diameter", 0.800, 0.850, 0.750, 0.740, "mm", "Pin Gauge", True, "rework"),
        (12, "Weight", 148.0, 155.0, 140.0, 149.2, "g", "Analytical Balance", False, "pass"),
    ]

    for balloon, name, nom, usl, lsl, actual, unit, tools, designed, result in blade_items:
        deviation = "Cooling hole 0.740mm below min 0.750mm \u2014 reworked per NCR-2026-PDX-018" if result == "rework" else None
        cur.execute("""INSERT INTO fai_item
            (report_id, balloon_number, characteristic_name, nominal, usl, lsl, actual_value,
             unit, tools_used, designed_char, result, deviation_reason, characteristic_id, sequence_order)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)""",
            (fai1, balloon, name, nom, usl, lsl, actual, unit, tools,
             1 if designed else 0, result, deviation, balloon))

    # ── Report 2: Composite Panel — draft, 8 items (6 pass, 2 pending) ───
    cur.execute("""INSERT INTO fai_report
        (plant_id, part_number, part_name, revision, serial_number, lot_number, drawing_number,
         organization_name, supplier, purchase_order, reason_for_inspection,
         material_supplier, material_spec, special_processes, functional_test_results,
         status, created_by, created_at, submitted_by, submitted_at, approved_by, approved_at, rejection_reason)
        VALUES (?, ?, ?, ?, NULL, ?, ?,
                ?, NULL, NULL, ?,
                ?, ?, ?, NULL,
                'draft', ?, ?, NULL, NULL, NULL, NULL, NULL)""",
        (IDS["cap_plant"], "CP-2026-PDX-003", "Composite Skin Panel Assy", "B",
         "LOT-2026-P11", "DWG-CP-2026-003-B",
         "Cascade Aerospace Inc.", "new_production",
         "Toray Composite Materials America", "Toray T800H/3900-2 per BMS 8-276",
         "Autoclave cure (BAC 5010), NDT ultrasonic (ASTM E2580)",
         IDS["engineer"], now))
    fai2 = cur.lastrowid

    panel_items = [
        (1, "Ply Thickness", 0.250, 0.270, 0.230, 0.252, "mm", "Micrometer", True, "pass"),
        (2, "Fiber Volume Fraction", 60.0, 65.0, 55.0, 61.2, "%", "Acid Digestion", True, "pass"),
        (3, "Void Content", 1.0, 2.0, None, 0.85, "%", "Ultrasonic C-scan", True, "pass"),
        (4, "Cure Temperature Peak", 177.0, 180.0, 174.0, 177.3, "C", "Thermocouple", True, "pass"),
        (5, "Panel Flatness", 0.000, 0.500, None, 0.180, "mm", "CMM", True, "pass"),
        (6, "Skin Thickness Total", 3.000, 3.100, 2.900, 3.015, "mm", "Micrometer", True, "pass"),
        (7, "Edge Trim Perpendicularity", 0.000, 0.200, None, None, "mm", "CMM", True, "pending"),
        (8, "Interlaminar Shear Strength", 85.0, None, 75.0, None, "MPa", "Short Beam Shear", True, "pending"),
    ]

    for balloon, name, nom, usl, lsl, actual, unit, tools, designed, result in panel_items:
        cur.execute("""INSERT INTO fai_item
            (report_id, balloon_number, characteristic_name, nominal, usl, lsl, actual_value,
             unit, tools_used, designed_char, result, deviation_reason, characteristic_id, sequence_order)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)""",
            (fai2, balloon, name, nom, usl, lsl, actual, unit, tools,
             1 if designed else 0, result, balloon))


# ── Logging ──────────────────────────────────────────────────────────────

_log = logging.getLogger("seed_aerospace")


# ── Async entry point (DevTools page) ────────────────────────────────────

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

    _seed_all(cur)

    conn.commit()
    conn.close()
    print("Aerospace seed complete. Login with any user / password: password")


def _seed_all(cur: sqlite3.Cursor) -> None:
    """Run all seed functions in order."""
    print("Seeding foundation (plant, hierarchy, users)...")
    seed_foundation(cur)
    print("Seeding characteristics (14 total)...")
    seed_characteristics(cur)
    print("Seeding Nelson rules...")
    seed_rules(cur)
    print("Seeding variable samples (~4,500)...")
    seed_variable_samples(cur)
    print("Seeding attribute samples (~500)...")
    seed_attribute_samples(cur)
    print("Replaying SPC engine for organic violations...")
    replay_spc_violations(cur)
    print("Seeding capability history...")
    seed_capability(cur)
    print("Seeding annotations...")
    seed_annotations(cur)
    print("Seeding connectivity (MQTT broker)...")
    seed_connectivity(cur)
    print("Seeding gage bridges...")
    seed_gage_bridges(cur)
    print("Seeding MSA study...")
    seed_msa(cur)
    print("Seeding FAI reports...")
    seed_fai(cur)


# ── Main ─────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Seed Cassini aerospace manufacturing database")
    parser.add_argument("--db-path", default=str(DB_PATH))
    parser.add_argument("--dry-run", action="store_true", help="Test imports and generators only")
    parser.add_argument("--force", action="store_true", help="Overwrite existing DB")
    args = parser.parse_args()

    if args.dry_run:
        print("=== Dry Run -- Testing imports and generators ===")
        print(f"Password hash OK: {len(hash_password('test')) > 0}")
        print(f"gen_normal(5): {gen_normal(5, 10, 1)}")
        print(f"gen_weibull(5): {gen_weibull(5, 12.0, 0.62)}")
        print(f"gen_beta(5): {gen_beta(5, 2.0, 20.0)}")
        print(f"gen_drift(5): {gen_drift(5, 28.0, 0.008, 0.0002)}")
        print(f"gen_lot_shift(10): {gen_lot_shift(10, 177.0, 0.35, 5, 0.30)}")
        print(f"gen_binomial(5): {gen_binomial(5, 50, 0.04)}")
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

    _seed_all(cur)

    conn.commit()

    # Print summary
    tables = [
        "plant", "hierarchy", "user", "user_plant_role",
        "characteristic", "characteristic_rules", "sample", "measurement",
        "violation", "annotation", "capability_history",
        "mqtt_broker", "gage_bridge", "gage_port",
        "msa_study", "msa_operator", "msa_part", "msa_measurement",
        "fai_report", "fai_item",
    ]
    print("\n=== Summary ===")
    for t in tables:
        try:
            cur.execute(f"SELECT COUNT(*) FROM {t}")
            print(f"  {t}: {cur.fetchone()[0]}")
        except sqlite3.OperationalError:
            print(f"  {t}: (table not found)")

    conn.close()
    print(f"\nAerospace DB created: {db_path}")
    print("Login with any user / password: password")


if __name__ == "__main__":
    main()
