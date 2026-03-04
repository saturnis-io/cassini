"""Seed Cassini with Semiconductor Fab demo data.

Creates 1 plant (Pacific Semiconductor — Hillsboro) with 3 fab areas,
14 characteristics covering photolithography, CVD, etching, and metrology.
Showcases Laney p'/u' charts, non-normal distributions (lognormal, gamma,
Box-Cox), CUSUM with chamber drift, and multivariate correlation groups.

Uses raw sqlite3 for speed (same pattern as seed_showcase.py).

Usage:
    python scripts/seed_semiconductor.py --dry-run        # Test generators only
    python scripts/seed_semiconductor.py --force           # Create semiconductor.db
    python scripts/seed_semiconductor.py --db-path foo.db  # Custom path
"""

import argparse
import json
import math
import os
import random
import sqlite3
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

# -- Path setup ---------------------------------------------------------------
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

# -- Constants ----------------------------------------------------------------
DB_PATH = backend_dir / "semiconductor.db"
IDS: dict[str, int] = {}

# Reproducible random data
random.seed(2026)

# -- Data generators ----------------------------------------------------------

def gen_normal(n: int, mean: float, std: float, seed: int | None = None) -> list[float]:
    """Generate n normally distributed values."""
    if seed is not None:
        random.seed(seed)
    return [random.gauss(mean, std) for _ in range(n)]


def gen_lognormal(n: int, mu: float, sigma: float, seed: int | None = None) -> list[float]:
    """Generate n log-normally distributed values."""
    if seed is not None:
        random.seed(seed)
    return [random.lognormvariate(mu, sigma) for _ in range(n)]


def gen_gamma(n: int, shape: float, scale: float, seed: int | None = None) -> list[float]:
    """Generate n Gamma-distributed values."""
    if seed is not None:
        random.seed(seed)
    return [random.gammavariate(shape, scale) for _ in range(n)]


def gen_drift(n: int, mean: float, std: float, drift_per_sample: float,
              seed: int | None = None) -> list[float]:
    """Generate n values with a linear mean drift."""
    if seed is not None:
        random.seed(seed)
    return [random.gauss(mean + i * drift_per_sample, std) for i in range(n)]


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


def gen_chamber_drift(n: int, nominal: float, std: float, pm_interval: int,
                      drift_per_sample: float) -> list[float]:
    """Generate values with slow drift between PM (preventive maintenance) cycles.

    Every pm_interval samples, the mean resets to nominal (PM event), then drifts
    linearly until the next PM.
    """
    result = []
    for i in range(n):
        samples_since_pm = i % pm_interval
        current_mean = nominal + samples_since_pm * drift_per_sample
        result.append(random.gauss(current_mean, std))
    return result


# -- Insert helpers -----------------------------------------------------------

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
        try:
            cur.execute(
                "UPDATE characteristic SET rule_preset_id = ? WHERE id = ?",
                (preset_id, char_id),
            )
        except sqlite3.OperationalError:
            pass


# =============================================================================
#  Foundation: Plant, Hierarchy, Users, Roles
# =============================================================================

def seed_foundation(cur: sqlite3.Cursor) -> None:
    """Create 1 plant, 3 fab area hierarchies, 4 users, and role assignments."""

    # -- Plant ----------------------------------------------------------------
    IDS["psh_plant"] = insert_plant(
        cur, "Pacific Semiconductor \u2014 Hillsboro", "PSH",
        settings={"timezone": "America/Los_Angeles", "default_chart_points": 100},
    )

    # -- Photolithography Bay -------------------------------------------------
    IDS["litho_bay"] = insert_hierarchy(cur, IDS["psh_plant"], "Photolithography Bay", "Area")
    IDS["scanner"] = insert_hierarchy(cur, IDS["psh_plant"], "Scanner", "Equipment", IDS["litho_bay"])

    # -- Deposition & Etch ----------------------------------------------------
    IDS["dep_etch"] = insert_hierarchy(cur, IDS["psh_plant"], "Deposition & Etch", "Area")
    IDS["cvd_chamber"] = insert_hierarchy(cur, IDS["psh_plant"], "CVD Chamber", "Equipment", IDS["dep_etch"])
    IDS["etch_tool"] = insert_hierarchy(cur, IDS["psh_plant"], "Etch Tool", "Equipment", IDS["dep_etch"])

    # -- Metrology & Test -----------------------------------------------------
    IDS["metro_test"] = insert_hierarchy(cur, IDS["psh_plant"], "Metrology & Test", "Area")
    IDS["probe_station"] = insert_hierarchy(cur, IDS["psh_plant"], "Probe Station", "Equipment", IDS["metro_test"])
    IDS["final_test"] = insert_hierarchy(cur, IDS["psh_plant"], "Final Test", "Equipment", IDS["metro_test"])

    # -- Users ----------------------------------------------------------------
    IDS["admin"] = insert_user(cur, "admin", "password",
                               "admin@pacific-semi.local", "Sarah Chen")
    IDS["proc_eng"] = insert_user(cur, "proc.engineer", "password",
                                   "proc.engineer@pacific-semi.local", "Marcus Tanaka")
    IDS["fab_tech"] = insert_user(cur, "fab.tech", "password",
                                   "fab.tech@pacific-semi.local", "Elena Vasquez")
    IDS["metro_tech"] = insert_user(cur, "metro.tech", "password",
                                     "metro.tech@pacific-semi.local", "James Park")

    # -- Roles ----------------------------------------------------------------
    insert_role(cur, IDS["admin"], IDS["psh_plant"], "admin")
    insert_role(cur, IDS["proc_eng"], IDS["psh_plant"], "engineer")
    insert_role(cur, IDS["fab_tech"], IDS["psh_plant"], "operator")
    insert_role(cur, IDS["metro_tech"], IDS["psh_plant"], "operator")


# =============================================================================
#  Characteristics (14 total)
# =============================================================================

def seed_characteristics(cur: sqlite3.Cursor) -> None:
    """Create 14 characteristics across 3 fab areas."""

    # =========================================================================
    # Photolithography Bay > Scanner
    # =========================================================================

    # 1. Overlay Accuracy X (n=5, X-bar R)
    IDS["overlay_x"] = insert_char(
        cur, IDS["scanner"], "Overlay Accuracy X",
        description="X-axis overlay registration error across wafer (nm)",
        subgroup_size=5, target_value=0.0, usl=3.0, lsl=-3.0,
        stored_sigma=0.8, stored_center_line=0.0,
        decimal_precision=2,
    )

    # 2. Overlay Accuracy Y (n=5, X-bar R)
    IDS["overlay_y"] = insert_char(
        cur, IDS["scanner"], "Overlay Accuracy Y",
        description="Y-axis overlay registration error across wafer (nm)",
        subgroup_size=5, target_value=0.0, usl=3.0, lsl=-3.0,
        stored_sigma=0.8, stored_center_line=0.0,
        decimal_precision=2,
    )

    # 3. CD Critical Dimension (n=5, X-bar R, CUSUM for small-shift detection)
    IDS["cd_critical"] = insert_char(
        cur, IDS["scanner"], "CD Critical Dimension",
        description="Critical dimension linewidth at 5 wafer sites (um)",
        subgroup_size=5, target_value=0.180, usl=0.190, lsl=0.170,
        stored_sigma=0.003, stored_center_line=0.180,
        chart_type="cusum", cusum_target=0.180, cusum_k=0.5, cusum_h=5.0,
        decimal_precision=4,
    )

    # 4. Resist Thickness (n=1, I-MR)
    IDS["resist_thick"] = insert_char(
        cur, IDS["scanner"], "Resist Thickness",
        description="Photoresist film thickness center measurement (nm)",
        subgroup_size=1, target_value=500.0, usl=520.0, lsl=480.0,
        stored_sigma=5.0, stored_center_line=500.0,
        decimal_precision=1,
    )

    # =========================================================================
    # Deposition & Etch > CVD Chamber
    # =========================================================================

    # 5. Film Thickness Oxide (n=5, X-bar R, Box-Cox)
    IDS["film_oxide"] = insert_char(
        cur, IDS["cvd_chamber"], "Film Thickness Oxide",
        description="Oxide film thickness across 5 wafer sites (angstroms)",
        subgroup_size=5, target_value=1000.0, usl=1050.0, lsl=950.0,
        stored_sigma=15.0, stored_center_line=1000.0,
        distribution_method="box_cox", box_cox_lambda=0.5,
        decimal_precision=1,
    )

    # 6. Film Thickness Nitride (n=1, I-MR)
    IDS["film_nitride"] = insert_char(
        cur, IDS["cvd_chamber"], "Film Thickness Nitride",
        description="Silicon nitride film thickness center measurement (angstroms)",
        subgroup_size=1, target_value=750.0, usl=780.0, lsl=720.0,
        stored_sigma=8.0, stored_center_line=750.0,
        decimal_precision=1,
    )

    # 7. Chamber Pressure (n=1, I-MR)
    IDS["chamber_pressure"] = insert_char(
        cur, IDS["cvd_chamber"], "Chamber Pressure",
        description="CVD chamber process pressure (mTorr)",
        subgroup_size=1, target_value=200.0, usl=210.0, lsl=190.0,
        stored_sigma=2.5, stored_center_line=200.0,
        decimal_precision=1,
    )

    # =========================================================================
    # Deposition & Etch > Etch Tool
    # =========================================================================

    # 8. Etch Depth (n=1, I-MR, Gamma distribution)
    # Gamma(shape=1600, scale=0.0025) -> mean=4.0, std=0.10
    IDS["etch_depth"] = insert_char(
        cur, IDS["etch_tool"], "Etch Depth",
        description="Plasma etch depth measurement (um)",
        subgroup_size=1, target_value=4.0, usl=4.5, lsl=3.5,
        stored_sigma=0.10, stored_center_line=4.0,
        distribution_method="gamma",
        distribution_params=json.dumps({"shape": 1600.0, "scale": 0.0025}),
        decimal_precision=3,
    )

    # 9. Etch Uniformity % (n=1, I-MR)
    IDS["etch_uniform"] = insert_char(
        cur, IDS["etch_tool"], "Etch Uniformity %",
        description="Within-wafer etch uniformity percentage",
        subgroup_size=1, target_value=2.0, usl=5.0, lsl=0.0,
        stored_sigma=0.6, stored_center_line=2.0,
        decimal_precision=2,
    )

    # =========================================================================
    # Metrology & Test > Probe Station
    # =========================================================================

    # 10. Sheet Resistance (n=5, X-bar R)
    IDS["sheet_resist"] = insert_char(
        cur, IDS["probe_station"], "Sheet Resistance",
        description="Sheet resistance across 5 wafer sites (ohms/sq)",
        subgroup_size=5, target_value=450.0, usl=470.0, lsl=430.0,
        stored_sigma=5.0, stored_center_line=450.0,
        decimal_precision=1,
    )

    # 11. Particle Count (n=1, Lognormal, Laney u-chart)
    IDS["particle_count"] = insert_char(
        cur, IDS["probe_station"], "Particle Count",
        description="Wafer surface particle count per inspection area",
        subgroup_size=1,
        data_type="attribute", attribute_chart_type="u",
        use_laney_correction=1, default_sample_size=50,
        distribution_method="lognormal",
        distribution_params=json.dumps({"mu": 1.5, "sigma": 0.8}),
        decimal_precision=0,
    )

    # 12. Wafer Bow (n=1, I-MR)
    IDS["wafer_bow"] = insert_char(
        cur, IDS["probe_station"], "Wafer Bow",
        description="Wafer bow/warp measurement (um)",
        subgroup_size=1, target_value=0.0, usl=25.0, lsl=-25.0,
        stored_sigma=5.0, stored_center_line=0.0,
        decimal_precision=1,
    )

    # =========================================================================
    # Metrology & Test > Final Test
    # =========================================================================

    # 13. Electrical Yield % (attribute Laney p-chart)
    IDS["elec_yield"] = insert_char(
        cur, IDS["final_test"], "Electrical Yield %",
        description="Wafer-level electrical test yield (defective die count / total die)",
        subgroup_size=1,
        data_type="attribute", attribute_chart_type="p",
        use_laney_correction=1, default_sample_size=500,
        decimal_precision=4,
    )

    # 14. Die Sort Defect Count (attribute u-chart)
    IDS["die_sort_defects"] = insert_char(
        cur, IDS["final_test"], "Die Sort Defect Count",
        description="Defect count per wafer at die sort",
        subgroup_size=1,
        data_type="attribute", attribute_chart_type="u",
        default_sample_size=200,
        decimal_precision=0,
    )


# =============================================================================
#  Nelson Rules
# =============================================================================

def seed_rules(cur: sqlite3.Cursor) -> None:
    """Assign Nelson rules to all characteristics."""

    # Variable characteristics: all 8 rules (1-4 ack required, 5-8 optional)
    variable_chars = [
        "overlay_x", "overlay_y", "cd_critical", "resist_thick",
        "film_oxide", "film_nitride", "chamber_pressure",
        "etch_depth", "etch_uniform",
        "sheet_resist", "wafer_bow",
    ]
    for key in variable_chars:
        insert_nelson_rules(cur, IDS[key])

    # Attribute characteristics: rules 1-4 only (5-8 not applicable)
    attr_rules = [
        (1, True, True),
        (2, True, True),
        (3, True, False),
        (4, True, False),
    ]
    for key in ["particle_count", "elec_yield", "die_sort_defects"]:
        insert_nelson_rules(cur, IDS[key], rules=attr_rules)


# =============================================================================
#  Variable Samples (~4,200 total)
# =============================================================================

def seed_variable_samples(cur: sqlite3.Cursor) -> None:
    """Generate variable data samples across all variable characteristics."""

    N = 500  # samples per characteristic
    SPAN = 120  # days

    # -- Overlay Accuracy X (n=5, X-bar R, correlated with Y) -----------------
    # Seeded independently first; overridden with correlated data later
    timestamps = make_timestamps(N, span_days=SPAN)
    for i in range(N):
        values = gen_normal(5, 0.0, 0.8)
        insert_sample(cur, IDS["overlay_x"], timestamps[i], values=values,
                      batch=f"LOT-{2600 + i // 10:04d}")

    # -- Overlay Accuracy Y (n=5, X-bar R, correlated with X) -----------------
    timestamps = make_timestamps(N, span_days=SPAN)
    for i in range(N):
        values = gen_normal(5, 0.0, 0.8)
        insert_sample(cur, IDS["overlay_y"], timestamps[i], values=values,
                      batch=f"LOT-{2600 + i // 10:04d}")

    # -- CD Critical Dimension (n=5, CUSUM, drift between PM cycles) ----------
    timestamps = make_timestamps(N, span_days=SPAN)
    # PM every 200 samples; very subtle drift 0.000008 um/sample between PMs
    cd_vals = gen_chamber_drift(N, 0.180, 0.002, 200, 0.000008)
    target = 0.180
    k = 0.5 * 0.003  # cusum_k * stored_sigma
    cusum_h_stat = 0.0
    cusum_l_stat = 0.0
    for i in range(N):
        # 5 measurement sites around the drifting mean
        site_vals = [cd_vals[i] + random.gauss(0, 0.001) for _ in range(5)]
        subgroup_mean = sum(site_vals) / len(site_vals)
        cusum_h_stat = max(0.0, cusum_h_stat + (subgroup_mean - target) - k)
        cusum_l_stat = min(0.0, cusum_l_stat + (subgroup_mean - target) + k)
        insert_sample(cur, IDS["cd_critical"], timestamps[i], values=site_vals,
                      batch=f"LOT-{2600 + i // 10:04d}",
                      cusum_high=cusum_h_stat, cusum_low=cusum_l_stat)

    # -- Resist Thickness (n=1, I-MR, step shift at sample 350) ---------------
    timestamps = make_timestamps(N, span_days=SPAN)
    resist_vals = gen_shift(N, 500.0, 4.0, 350, 503.0, 4.5)
    for i in range(N):
        insert_sample(cur, IDS["resist_thick"], timestamps[i], values=[resist_vals[i]],
                      batch=f"LOT-{2600 + i // 10:04d}")

    # -- Film Thickness Oxide (n=5, Box-Cox, chamber drift) -------------------
    # Slightly right-skewed: normal with small lognormal perturbation
    timestamps = make_timestamps(N, span_days=SPAN)
    drift_means = gen_chamber_drift(N, 1000.0, 0.0, 200, 0.03)
    for i in range(N):
        # Generate 5 sites with slight right skew (Box-Cox candidate)
        site_vals = [drift_means[i] + random.gauss(0, 10) + random.lognormvariate(0.5, 0.3) - 1.8
                     for _ in range(5)]
        insert_sample(cur, IDS["film_oxide"], timestamps[i], values=site_vals,
                      batch=f"LOT-{2600 + i // 10:04d}")

    # -- Film Thickness Nitride (n=1, I-MR, stable process) -------------------
    timestamps = make_timestamps(N, span_days=SPAN)
    nitride_vals = gen_normal(N, 750.0, 7.0)
    for i in range(N):
        insert_sample(cur, IDS["film_nitride"], timestamps[i], values=[nitride_vals[i]],
                      batch=f"LOT-{2600 + i // 10:04d}")

    # -- Chamber Pressure (n=1, I-MR, drift between PM cycles) ----------------
    timestamps = make_timestamps(N, span_days=SPAN)
    pressure_vals = gen_chamber_drift(N, 200.0, 2.0, 200, 0.008)
    for i in range(N):
        insert_sample(cur, IDS["chamber_pressure"], timestamps[i], values=[pressure_vals[i]],
                      batch=f"LOT-{2600 + i // 10:04d}")

    # -- Etch Depth (n=1, I-MR, Gamma distribution) ---------------------------
    timestamps = make_timestamps(N, span_days=SPAN)
    etch_vals = gen_gamma(N, 1600.0, 0.0025)
    for i in range(N):
        insert_sample(cur, IDS["etch_depth"], timestamps[i], values=[etch_vals[i]],
                      batch=f"LOT-{2600 + i // 10:04d}")

    # -- Etch Uniformity % (n=1, I-MR, stable with occasional outliers) -------
    timestamps = make_timestamps(N, span_days=SPAN)
    uniform_vals = gen_normal(N, 2.0, 0.5)
    # Inject 5 outliers (tool excursions)
    outlier_indices = random.sample(range(N), 5)
    for idx in outlier_indices:
        uniform_vals[idx] = random.uniform(4.0, 5.5)
    for i in range(N):
        val = max(0.0, uniform_vals[i])
        insert_sample(cur, IDS["etch_uniform"], timestamps[i], values=[val],
                      batch=f"LOT-{2600 + i // 10:04d}")

    # -- Sheet Resistance (n=5, X-bar R, lot-to-lot variation) ----------------
    timestamps = make_timestamps(N, span_days=SPAN)
    # Step shifts every ~100 samples to simulate lot-to-lot variation
    lot_means = [450.0, 448.0, 451.5, 449.0, 452.0]
    for i in range(N):
        lot_idx = min(i // 100, len(lot_means) - 1)
        values = gen_normal(5, lot_means[lot_idx], 4.0)
        insert_sample(cur, IDS["sheet_resist"], timestamps[i], values=values,
                      batch=f"LOT-{2600 + i // 10:04d}")

    # -- Wafer Bow (n=1, I-MR, slow drift) ------------------------------------
    timestamps = make_timestamps(N, span_days=SPAN)
    bow_vals = gen_drift(N, 0.0, 4.0, 0.005)
    for i in range(N):
        insert_sample(cur, IDS["wafer_bow"], timestamps[i], values=[bow_vals[i]],
                      batch=f"LOT-{2600 + i // 10:04d}")


# =============================================================================
#  Attribute Samples (~1,800 total)
# =============================================================================

def seed_attribute_samples(cur: sqlite3.Cursor) -> None:
    """Generate attribute data for Particle Count, Electrical Yield, and Die Sort Defects."""

    SPAN = 120

    # -- Particle Count (Laney u-chart, overdispersed Poisson via varying lambda) --
    # Lognormal-shaped defect rate: lambda varies per lot
    timestamps = make_timestamps(600, span_days=SPAN)
    for i in range(600):
        units = random.randint(30, 70)  # inspection area units per wafer
        # Overdispersion: lambda varies per lot (lognormal rate)
        lam_per_unit = random.lognormvariate(1.5, 0.8) / units
        defects = sum(1 for _ in range(units) if random.random() < min(lam_per_unit * 2, 0.8))
        # Alternative: direct negative-binomial-like via varying Poisson lambda
        lot_lambda = max(0.5, random.lognormvariate(1.5, 0.8))
        defects = gen_poisson(1, lot_lambda)[0]
        insert_sample(cur, IDS["particle_count"], timestamps[i],
                      defect_count=defects, units_inspected=units,
                      batch=f"LOT-{2600 + i // 10:04d}")

    # -- Electrical Yield % (Laney p-chart, overdispersed binomial) -----------
    timestamps = make_timestamps(600, span_days=SPAN)
    for i in range(600):
        sample_size = random.randint(450, 550)  # die count varies slightly per wafer
        # Overdispersion: defect probability varies per lot
        p_lot = max(0.001, min(0.10, random.gauss(0.03, 0.012)))
        defects = sum(1 for _ in range(sample_size) if random.random() < p_lot)
        defects = min(defects, sample_size)
        insert_sample(cur, IDS["elec_yield"], timestamps[i],
                      defect_count=defects, sample_size=sample_size,
                      batch=f"LOT-{2600 + i // 10:04d}")

    # -- Die Sort Defect Count (u-chart, Poisson with cyclic pattern) ---------
    timestamps = make_timestamps(600, span_days=SPAN)
    for i in range(600):
        units = random.randint(180, 220)
        # Cyclic pattern: tool wear creates sinusoidal variation
        lam = max(0.5, 3.0 + 1.0 * math.sin(2 * math.pi * i / 80))
        defects = gen_poisson(1, lam)[0]
        insert_sample(cur, IDS["die_sort_defects"], timestamps[i],
                      defect_count=defects, units_inspected=units,
                      batch=f"LOT-{2600 + i // 10:04d}")


# =============================================================================
#  Correlated Data Overrides
# =============================================================================

def seed_correlated_overrides(cur: sqlite3.Cursor) -> None:
    """Replace independently-generated Overlay X/Y with correlated data.

    Overlay X and Y are physically correlated (scanner stage positioning).
    Resist Thickness is weakly correlated with overlay (focus effects).
    """

    def _delete_samples(char_id: int) -> None:
        cur.execute(
            "DELETE FROM measurement WHERE sample_id IN "
            "(SELECT id FROM sample WHERE char_id = ?)", (char_id,))
        cur.execute("DELETE FROM sample WHERE char_id = ?", (char_id,))

    def _read_anchor_subgroup(char_id: int) -> list[tuple[str, str | None, list[float]]]:
        """Read (timestamp, batch, [values]) for a subgroup-based anchor."""
        cur.execute("""
            SELECT s.id, s.timestamp, s.batch_number
            FROM sample s WHERE s.char_id = ? AND s.is_excluded = 0
            ORDER BY s.timestamp
        """, (char_id,))
        samples = cur.fetchall()
        result = []
        for sid, ts, batch in samples:
            cur.execute("SELECT value FROM measurement WHERE sample_id = ?", (sid,))
            vals = [r[0] for r in cur.fetchall()]
            result.append((ts, batch, vals))
        return result

    # Read overlay X as anchor
    x_rows = _read_anchor_subgroup(IDS["overlay_x"])
    if not x_rows:
        return

    _delete_samples(IDS["overlay_y"])

    # Overlay X -> Y correlation: r = 0.60 (scanner stage coupling)
    x_mean, x_std = 0.0, 0.8
    y_mean, y_std, r_xy = 0.0, 0.8, 0.60
    rho_xy = math.sqrt(1 - r_xy ** 2)

    for ts, batch, x_vals in x_rows:
        x_subgroup_mean = sum(x_vals) / len(x_vals)
        z_x = (x_subgroup_mean - x_mean) / max(x_std, 1e-10)
        # Generate correlated Y subgroup
        y_subgroup = [
            y_mean + y_std * (r_xy * z_x + rho_xy * random.gauss(0, 1))
            for _ in range(len(x_vals))
        ]
        insert_sample(cur, IDS["overlay_y"], ts, values=y_subgroup, batch=batch)

    print("  Correlated overrides applied for Overlay X/Y")


# =============================================================================
#  Replay SPC Violations (organic violation generation)
# =============================================================================

def replay_spc_violations(cur: sqlite3.Cursor) -> None:
    """Replay seeded samples through real SPC engine logic to generate organic violations.

    Runs Nelson rules, CUSUM thresholds, and attribute rules on seeded data
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

        # Load enabled rules
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

        # =====================================================================
        # CUSUM characteristics
        # =====================================================================
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
                SELECT s.id FROM sample s
                WHERE s.char_id = ? AND s.is_excluded = 0
                ORDER BY s.timestamp
            """, (char_id,))
            sample_ids = [r[0] for r in cur.fetchall()]

            ch, cl_stat = 0.0, 0.0
            for sid in sample_ids:
                cur.execute("SELECT AVG(value) FROM measurement WHERE sample_id = ?", (sid,))
                row = cur.fetchone()
                if row is None or row[0] is None:
                    continue
                val = row[0]
                ch = max(0.0, ch + (val - target - k_val))
                cl_stat = max(0.0, cl_stat + (target - val - k_val))
                if ch > h_val:
                    insert_violation(cur, sid, char_id, 1, "CUSUM+ Shift", "CRITICAL")
                    n_viol += 1
                if cl_stat > h_val:
                    insert_violation(cur, sid, char_id, 1, "CUSUM- Shift", "CRITICAL")
                    n_viol += 1

        # =====================================================================
        # Variable (non-CUSUM, non-EWMA) characteristics — Nelson rules
        # =====================================================================
        elif data_type == "variable" and chart_type not in ("cusum", "ewma"):
            ucl = c["ucl"]
            lcl_val = c["lcl"]
            sigma = c["stored_sigma"]
            cl = c["stored_center_line"]
            n_size = c["subgroup_size"] or 1

            if ucl is None or lcl_val is None or sigma is None or cl is None:
                # Compute from data if not stored
                if sigma and cl:
                    sigma_xbar = sigma / math.sqrt(n_size) if n_size > 1 else sigma
                    ucl = cl + 3 * sigma_xbar
                    lcl_val = cl - 3 * sigma_xbar
                else:
                    continue

            checker = InlineNelsonChecker(cl, ucl, lcl_val, list(enabled_rules))

            cur.execute("""
                SELECT s.id FROM sample s
                WHERE s.char_id = ? AND s.is_excluded = 0
                ORDER BY s.timestamp
            """, (char_id,))
            sample_ids = [r[0] for r in cur.fetchall()]

            for sid in sample_ids:
                cur.execute("SELECT AVG(value) FROM measurement WHERE sample_id = ?", (sid,))
                row = cur.fetchone()
                if row is None or row[0] is None:
                    continue
                mean_val = row[0]
                triggered = checker.check(mean_val)
                for rule_id in triggered:
                    sev = "CRITICAL" if rule_id <= 2 else "WARNING"
                    insert_violation(cur, sid, char_id, rule_id,
                                     NELSON_RULE_NAMES.get(rule_id, f"Rule {rule_id}"), sev)
                    n_viol += 1

        # =====================================================================
        # Attribute characteristics — basic limit checks
        # =====================================================================
        elif data_type == "attribute":
            attr_type = c["attribute_chart_type"]
            use_laney = c["use_laney_correction"]

            cur.execute("""
                SELECT id, defect_count, sample_size, units_inspected
                FROM sample WHERE char_id = ? AND is_excluded = 0
                ORDER BY timestamp
            """, (char_id,))
            attr_samples = cur.fetchall()

            if not attr_samples:
                continue

            # Compute overall p-bar or u-bar for limits
            if attr_type in ("p", "np"):
                total_d = sum(r[1] or 0 for r in attr_samples)
                total_n = sum(r[2] or 1 for r in attr_samples)
                p_bar = total_d / max(total_n, 1)
                for sid, dc, ss, ui in attr_samples:
                    ss = ss or 1
                    dc = dc or 0
                    p_val = dc / max(ss, 1)
                    p_ucl = p_bar + 3 * math.sqrt(p_bar * (1 - p_bar) / max(ss, 1))
                    p_lcl = max(0.0, p_bar - 3 * math.sqrt(p_bar * (1 - p_bar) / max(ss, 1)))
                    if p_val > p_ucl or p_val < p_lcl:
                        insert_violation(cur, sid, char_id, 1, "Beyond 3\u03c3", "CRITICAL")
                        n_viol += 1

            elif attr_type in ("u", "c"):
                total_d = sum(r[1] or 0 for r in attr_samples)
                total_u = sum(r[3] or 1 for r in attr_samples)
                u_bar = total_d / max(total_u, 1)
                for sid, dc, ss, ui in attr_samples:
                    ui = ui or 1
                    dc = dc or 0
                    u_val = dc / max(ui, 1)
                    u_ucl = u_bar + 3 * math.sqrt(u_bar / max(ui, 1))
                    u_lcl = max(0.0, u_bar - 3 * math.sqrt(u_bar / max(ui, 1)))
                    if u_val > u_ucl or u_val < u_lcl:
                        insert_violation(cur, sid, char_id, 1, "Beyond 3\u03c3", "CRITICAL")
                        n_viol += 1

        if n_viol > 0:
            total_violations += n_viol
            print(f"  {c['name']}: {n_viol} violations")

    print(f"  Total organic violations: {total_violations}")


# =============================================================================
#  Capability History & Annotations
# =============================================================================

def seed_capability_and_annotations(cur: sqlite3.Cursor) -> None:
    """Insert capability snapshots and chart annotations for key characteristics."""

    # -- Capability snapshots -------------------------------------------------

    # Overlay X — well-controlled
    insert_capability(cur, IDS["overlay_x"], cp=1.80, cpk=1.72, pp=1.75, ppk=1.68,
                      cpm=1.65, sample_count=500, p_value=0.42, calc_by="proc.engineer")

    # Overlay Y — well-controlled
    insert_capability(cur, IDS["overlay_y"], cp=1.78, cpk=1.70, pp=1.73, ppk=1.65,
                      cpm=1.62, sample_count=500, p_value=0.38, calc_by="proc.engineer")

    # CD Critical Dimension — tight process
    insert_capability(cur, IDS["cd_critical"], cp=1.60, cpk=1.45, pp=1.55, ppk=1.40,
                      sample_count=500, p_value=0.15, calc_by="proc.engineer")

    # Film Thickness Oxide — non-normal (Box-Cox)
    insert_capability(cur, IDS["film_oxide"], cp=1.35, cpk=1.20, pp=1.30, ppk=1.15,
                      sample_count=500, p_value=0.002, calc_by="proc.engineer")

    # Etch Depth — Gamma, lower capability
    insert_capability(cur, IDS["etch_depth"], cp=1.15, cpk=1.05, pp=1.10, ppk=1.00,
                      sample_count=500, p_value=0.001, calc_by="proc.engineer")

    # Sheet Resistance — lot-to-lot variation
    insert_capability(cur, IDS["sheet_resist"], cp=1.40, cpk=1.25, pp=1.30, ppk=1.10,
                      sample_count=500, p_value=0.35, calc_by="proc.engineer")

    # Resist Thickness — degraded after shift
    insert_capability(cur, IDS["resist_thick"], cp=1.50, cpk=1.35, pp=1.20, ppk=0.95,
                      sample_count=500, p_value=0.28, calc_by="proc.engineer")

    # -- Annotations ----------------------------------------------------------

    # PM event annotations on CVD Chamber characteristics
    for pm_num in range(3):
        sample_offset = pm_num * 200
        # Find the sample ID around that offset for Film Oxide
        cur.execute("""
            SELECT id FROM sample WHERE char_id = ? AND is_excluded = 0
            ORDER BY timestamp LIMIT 1 OFFSET ?
        """, (IDS["film_oxide"], sample_offset))
        row = cur.fetchone()
        if row:
            insert_annotation(cur, IDS["film_oxide"], "point",
                              f"PM Cycle #{pm_num + 1} - Chamber clean & recalibration",
                              color="#2563eb", sample_id=row[0],
                              created_by="fab.tech")

    # CD drift annotation (period covering drift region)
    cur.execute("""
        SELECT id FROM sample WHERE char_id = ? AND is_excluded = 0
        ORDER BY timestamp LIMIT 1 OFFSET 180
    """, (IDS["cd_critical"],))
    drift_start = cur.fetchone()
    cur.execute("""
        SELECT id FROM sample WHERE char_id = ? AND is_excluded = 0
        ORDER BY timestamp LIMIT 1 OFFSET 195
    """, (IDS["cd_critical"],))
    drift_end = cur.fetchone()
    if drift_start and drift_end:
        insert_annotation(cur, IDS["cd_critical"], "period",
                          "CD drift detected — scanner focus degradation suspected",
                          color="#dc2626",
                          start_sid=drift_start[0], end_sid=drift_end[0],
                          created_by="proc.engineer")

    # Resist thickness shift annotation
    cur.execute("""
        SELECT id FROM sample WHERE char_id = ? AND is_excluded = 0
        ORDER BY timestamp LIMIT 1 OFFSET 350
    """, (IDS["resist_thick"],))
    shift_sample = cur.fetchone()
    if shift_sample:
        insert_annotation(cur, IDS["resist_thick"], "point",
                          "Resist lot change — new supplier batch (mean shift observed)",
                          color="#f59e0b", sample_id=shift_sample[0],
                          created_by="proc.engineer")

    # Etch tool excursion annotation
    cur.execute("""
        SELECT id FROM sample WHERE char_id = ? AND is_excluded = 0
        ORDER BY timestamp LIMIT 1 OFFSET 250
    """, (IDS["etch_uniform"],))
    excursion_sample = cur.fetchone()
    if excursion_sample:
        insert_annotation(cur, IDS["etch_uniform"], "point",
                          "Etch chamber RF power excursion — maintenance ticket #ET-4521",
                          color="#dc2626", sample_id=excursion_sample[0],
                          created_by="fab.tech")

    # Sheet resistance lot-to-lot annotation
    cur.execute("""
        SELECT id FROM sample WHERE char_id = ? AND is_excluded = 0
        ORDER BY timestamp LIMIT 1 OFFSET 100
    """, (IDS["sheet_resist"],))
    lot_start = cur.fetchone()
    cur.execute("""
        SELECT id FROM sample WHERE char_id = ? AND is_excluded = 0
        ORDER BY timestamp LIMIT 1 OFFSET 199
    """, (IDS["sheet_resist"],))
    lot_end = cur.fetchone()
    if lot_start and lot_end:
        insert_annotation(cur, IDS["sheet_resist"], "period",
                          "Implant dose adjustment — lot mean shifted down 2 ohms/sq",
                          color="#8b5cf6",
                          start_sid=lot_start[0], end_sid=lot_end[0],
                          created_by="proc.engineer")


# =============================================================================
#  Compliance: Notifications, ERP, Retention, Audit
# =============================================================================

def seed_compliance(cur: sqlite3.Cursor) -> None:
    """Seed notifications, ERP connector, retention policy, and audit trail."""
    now = utcnow()

    # -- SMTP Config ----------------------------------------------------------
    cur.execute("""INSERT INTO smtp_config
        (server, port, username, password, use_tls, from_address, is_active, created_at, updated_at)
        VALUES ('smtp.pacific-semi.local', 587, 'cassini-fab', NULL, 1,
                'cassini@pacific-semi.local', 0, ?, ?)""",
        (now, now))

    # -- Webhook Config -------------------------------------------------------
    cur.execute("""INSERT INTO webhook_config
        (name, url, secret, is_active, retry_count, events_filter, created_at, updated_at)
        VALUES ('Fab OOC Alerts', 'https://hooks.slack-mock.local/fab-ooc',
                'whsec_semi_slack_001', 1, 3, 'violation,anomaly', ?, ?)""",
        (now, now))

    # -- Notification Preferences ---------------------------------------------
    prefs = [
        # Fab tech: violations only, critical
        (IDS["fab_tech"], "violation", "email", 1, "critical"),
        # Metro tech: violations only, critical
        (IDS["metro_tech"], "violation", "email", 1, "critical"),
        # Process engineer: everything
        (IDS["proc_eng"], "violation", "email", 1, "all"),
        (IDS["proc_eng"], "anomaly", "email", 1, "all"),
        (IDS["proc_eng"], "capability", "email", 1, "all"),
        # Admin: everything + webhook
        (IDS["admin"], "violation", "email", 1, "all"),
        (IDS["admin"], "anomaly", "email", 1, "all"),
        (IDS["admin"], "capability", "email", 1, "all"),
        (IDS["admin"], "system", "email", 1, "all"),
        (IDS["admin"], "violation", "webhook", 1, "all"),
    ]
    for user_id, event_type, channel, enabled, severity in prefs:
        cur.execute("""INSERT INTO notification_preference
            (user_id, event_type, channel, is_enabled, severity_filter, created_at)
            VALUES (?, ?, ?, ?, ?, ?)""",
            (user_id, event_type, channel, enabled, severity, now))

    # -- ERP Connector: MES Integration ---------------------------------------
    cur.execute("""INSERT INTO erp_connector
        (plant_id, name, connector_type, base_url, auth_type, auth_config, headers, is_active, status,
         last_sync_at, last_error, created_at, updated_at)
        VALUES (?, 'Fab MES Integration', 'generic_lims',
                'https://mes.pacific-semi.local/api/v1/wafer-data',
                'api_key', '{}', '{}', 1, 'active',
                ?, NULL, ?, ?)""",
        (IDS["psh_plant"], ts_offset(BASE_TIME, hours=-4), now, now))
    mes_conn = cur.lastrowid

    cur.execute("""INSERT INTO erp_field_mapping
        (connector_id, name, direction, erp_entity, erp_field_path, openspc_entity, openspc_field, transform, is_active)
        VALUES (?, 'Lot Number', 'inbound', 'WaferLot', 'lot_id', 'sample', 'batch_number', NULL, 1)""",
        (mes_conn,))
    cur.execute("""INSERT INTO erp_field_mapping
        (connector_id, name, direction, erp_entity, erp_field_path, openspc_entity, openspc_field, transform, is_active)
        VALUES (?, 'Measurement Value', 'inbound', 'WaferLot', 'measurement', 'sample', 'value', NULL, 1)""",
        (mes_conn,))

    cur.execute("""INSERT INTO erp_sync_schedule
        (connector_id, direction, cron_expression, is_active, last_run_at, next_run_at)
        VALUES (?, 'inbound', '*/30 * * * *', 1, ?, ?)""",
        (mes_conn, ts_offset(BASE_TIME, hours=-1), ts_offset(BASE_TIME, hours=0)))

    cur.execute("""INSERT INTO erp_sync_log
        (connector_id, direction, status, records_processed, records_failed, started_at, completed_at, error_message, detail)
        VALUES (?, 'inbound', 'success', 85, 0, ?, ?, NULL, NULL)""",
        (mes_conn, ts_offset(BASE_TIME, hours=-4), ts_offset(BASE_TIME, hours=-3, minutes=-58)))
    cur.execute("""INSERT INTO erp_sync_log
        (connector_id, direction, status, records_processed, records_failed, started_at, completed_at, error_message, detail)
        VALUES (?, 'inbound', 'success', 72, 0, ?, ?, NULL, NULL)""",
        (mes_conn, ts_offset(BASE_TIME, hours=-8), ts_offset(BASE_TIME, hours=-7, minutes=-57)))

    # -- Retention Policies ---------------------------------------------------

    # Plant-wide: 3-year equipment qualification retention
    cur.execute("""INSERT INTO retention_policy
        (plant_id, scope, hierarchy_id, characteristic_id, retention_type, retention_value, retention_unit, created_at, updated_at)
        VALUES (?, 'global', NULL, NULL, 'time_delta', 1095, 'days', ?, ?)""",
        (IDS["psh_plant"], now, now))

    # Metrology area: 5-year (regulatory)
    cur.execute("""INSERT INTO retention_policy
        (plant_id, scope, hierarchy_id, characteristic_id, retention_type, retention_value, retention_unit, created_at, updated_at)
        VALUES (?, 'hierarchy', ?, NULL, 'time_delta', 1825, 'days', ?, ?)""",
        (IDS["psh_plant"], IDS["metro_test"], now, now))

    # -- Audit Trail ----------------------------------------------------------

    users_info = [
        ("admin", "Sarah Chen", IDS["admin"]),
        ("proc.engineer", "Marcus Tanaka", IDS["proc_eng"]),
        ("fab.tech", "Elena Vasquez", IDS["fab_tech"]),
        ("metro.tech", "James Park", IDS["metro_tech"]),
    ]

    # Login events
    for username, full_name, user_id in users_info:
        for days_ago in random.sample(range(1, 8), min(3, 7)):
            ts = ts_offset(BASE_TIME, days=-days_ago, hours=-random.randint(0, 12))
            cur.execute("""INSERT INTO audit_log
                (user_id, username, action, resource_type, resource_id, detail, ip_address, user_agent, timestamp)
                VALUES (?, ?, 'login', 'session', NULL, ?, ?, ?, ?)""",
                (user_id, username, json.dumps({"method": "password"}),
                 f"10.1.{random.randint(1, 5)}.{random.randint(10, 250)}",
                 "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0", ts))

    # Characteristic edits by process engineer
    for char_key in ["overlay_x", "cd_critical", "film_oxide"]:
        ts = ts_offset(BASE_TIME, days=-3)
        cur.execute("""INSERT INTO audit_log
            (user_id, username, action, resource_type, resource_id, detail, ip_address, user_agent, timestamp)
            VALUES (?, ?, 'update', 'characteristic', ?, ?, ?, ?, ?)""",
            (IDS["proc_eng"], "proc.engineer", IDS[char_key],
             json.dumps({"field": "ucl", "old_value": "3.0", "new_value": "2.8"}),
             "10.1.2.50", "Mozilla/5.0 Chrome/122.0", ts))

    # Sample submissions by technicians
    for i in range(5):
        ts = ts_offset(BASE_TIME, days=-random.randint(1, 5))
        tech = random.choice([("fab.tech", IDS["fab_tech"]), ("metro.tech", IDS["metro_tech"])])
        cur.execute("""INSERT INTO audit_log
            (user_id, username, action, resource_type, resource_id, detail, ip_address, user_agent, timestamp)
            VALUES (?, ?, 'create', 'sample', ?, NULL, ?, ?, ?)""",
            (tech[1], tech[0], random.randint(1, 100),
             f"10.1.{random.randint(1, 5)}.{random.randint(10, 250)}",
             "Mozilla/5.0 Chrome/122.0", ts))

    # Admin config changes
    config_changes = [
        ("update", "smtp_config", 1, {"field": "is_active", "old": False, "new": True}),
        ("create", "webhook_config", 1, {"name": "Fab OOC Alerts"}),
        ("create", "erp_connector", 1, {"name": "Fab MES Integration"}),
        ("update", "retention_policy", 1, {"scope": "global", "plant": "Hillsboro"}),
    ]
    for action, rtype, rid, detail in config_changes:
        ts = ts_offset(BASE_TIME, days=-random.randint(1, 14))
        cur.execute("""INSERT INTO audit_log
            (user_id, username, action, resource_type, resource_id, detail, ip_address, user_agent, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (IDS["admin"], "admin", action, rtype, rid,
             json.dumps(detail), "10.1.1.1", "Mozilla/5.0 Chrome/122.0", ts))


# =============================================================================
#  Analytics: Multivariate Group
# =============================================================================

def seed_analytics(cur: sqlite3.Cursor) -> None:
    """Seed multivariate group for correlated Overlay X + Y + Resist Thickness."""
    now = utcnow()

    # Multivariate group: Overlay + Resist trio
    cur.execute("""INSERT INTO multivariate_group
        (plant_id, name, description, chart_type, lambda_param, alpha, phase,
         min_samples, is_active, created_at, updated_at)
        VALUES (?, 'Scanner Overlay Monitor',
                'Monitors X/Y overlay accuracy and resist thickness correlations on litho scanner',
                't_squared', 0.1, 0.0027, 'phase_ii', 30, 1, ?, ?)""",
        (IDS["psh_plant"], now, now))
    mv_group = cur.lastrowid

    for i, key in enumerate(["overlay_x", "overlay_y", "resist_thick"]):
        cur.execute("""INSERT INTO multivariate_group_member
            (group_id, characteristic_id, display_order)
            VALUES (?, ?, ?)""", (mv_group, IDS[key], i))

    # Second group: CVD Chamber trio (Film Oxide + Film Nitride + Chamber Pressure)
    cur.execute("""INSERT INTO multivariate_group
        (plant_id, name, description, chart_type, lambda_param, alpha, phase,
         min_samples, is_active, created_at, updated_at)
        VALUES (?, 'CVD Chamber Monitor',
                'Monitors oxide/nitride thickness and pressure correlations in CVD chamber',
                't_squared', 0.1, 0.0027, 'phase_ii', 30, 1, ?, ?)""",
        (IDS["psh_plant"], now, now))
    mv_group2 = cur.lastrowid

    for i, key in enumerate(["film_oxide", "film_nitride", "chamber_pressure"]):
        cur.execute("""INSERT INTO multivariate_group_member
            (group_id, characteristic_id, display_order)
            VALUES (?, ?, ?)""", (mv_group2, IDS[key], i))


# =============================================================================
#  DevTools entry point (async def seed)
# =============================================================================

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
    print("Seeding characteristics (14 total)...")
    seed_characteristics(cur)
    print("Seeding Nelson rules...")
    seed_rules(cur)
    print("Seeding variable samples...")
    seed_variable_samples(cur)
    print("Seeding attribute samples...")
    seed_attribute_samples(cur)
    print("Applying correlated data overrides (Overlay X/Y)...")
    seed_correlated_overrides(cur)
    print("Replaying SPC engine for organic violations...")
    replay_spc_violations(cur)
    print("Seeding capability history and annotations...")
    seed_capability_and_annotations(cur)
    print("Seeding compliance (notifications, ERP, retention, audit)...")
    seed_compliance(cur)
    print("Seeding analytics (multivariate groups)...")
    seed_analytics(cur)

    conn.commit()
    conn.close()

    print("Semiconductor Fab seed complete. Login with any user / password: password")


# =============================================================================
#  CLI entry point
# =============================================================================

def main() -> None:
    parser = argparse.ArgumentParser(description="Seed Cassini semiconductor fab database")
    parser.add_argument("--db-path", default=str(DB_PATH))
    parser.add_argument("--dry-run", action="store_true", help="Test imports and generators only")
    parser.add_argument("--force", action="store_true", help="Overwrite existing DB")
    args = parser.parse_args()

    if args.dry_run:
        print("=== Dry Run -- Testing imports and generators ===")
        print(f"Password hash OK: {len(hash_password('test')) > 0}")
        print(f"gen_normal(5): {gen_normal(5, 10, 1)}")
        print(f"gen_lognormal(5): {gen_lognormal(5, 1.5, 0.8)}")
        print(f"gen_gamma(5): {gen_gamma(5, 8.0, 0.5)}")
        print(f"gen_drift(5): {gen_drift(5, 10, 1, 0.1)}")
        print(f"gen_shift(10): {gen_shift(10, 10, 1, 5, 12, 1)}")
        print(f"gen_poisson(5): {gen_poisson(5, 4)}")
        print(f"gen_binomial(5): {gen_binomial(5, 100, 0.03)}")
        print(f"gen_chamber_drift(10): {gen_chamber_drift(10, 200.0, 2.0, 5, 0.1)}")
        print(f"gen_correlated_pairs(3): {gen_correlated_pairs(3, 0, 1, 0, 1, 0.7)}")
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
    print("Seeding characteristics (14 total)...")
    seed_characteristics(cur)
    print("Seeding Nelson rules...")
    seed_rules(cur)
    print("Seeding variable samples...")
    seed_variable_samples(cur)
    print("Seeding attribute samples...")
    seed_attribute_samples(cur)
    print("Applying correlated data overrides (Overlay X/Y)...")
    seed_correlated_overrides(cur)
    print("Replaying SPC engine for organic violations...")
    replay_spc_violations(cur)
    print("Seeding capability history and annotations...")
    seed_capability_and_annotations(cur)
    print("Seeding compliance (notifications, ERP, retention, audit)...")
    seed_compliance(cur)
    print("Seeding analytics (multivariate groups)...")
    seed_analytics(cur)

    conn.commit()

    # Print summary
    tables = [
        "plant", "hierarchy", "user", "user_plant_role",
        "characteristic", "characteristic_rules", "sample", "measurement",
        "violation", "annotation", "capability_history",
        "smtp_config", "webhook_config", "notification_preference",
        "erp_connector", "erp_field_mapping", "erp_sync_schedule", "erp_sync_log",
        "retention_policy", "audit_log",
        "multivariate_group", "multivariate_group_member",
    ]
    print("\n=== Summary ===")
    for t in tables:
        try:
            cur.execute(f"SELECT COUNT(*) FROM {t}")
            print(f"  {t}: {cur.fetchone()[0]}")
        except sqlite3.OperationalError:
            print(f"  {t}: (table not found)")

    conn.close()

    print(f"\nSemiconductor Fab DB created: {db_path}")
    print("Login with any user / password: password")


if __name__ == "__main__":
    main()
