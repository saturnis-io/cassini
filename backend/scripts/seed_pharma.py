"""Pharmaceutical / Life Sciences + FDA 21 CFR Part 11 seed script.

Creates 3 GMP sites with realistic ISA-95 hierarchy, characteristics, brokers,
tag mappings, users with role assignments, ~6 months of sample data with
realistic process behavior (shifts, trends, outliers, seasonal drift), plus
full FDA compliance features: electronic signatures, anomaly detection,
non-normal distributions, MSA studies, retention policies, ERP/LIMS
integration, push subscriptions, and OIDC account linking.

Sites:
  1. BOS  - Boston API Manufacturing (sterile injectables)
  2. RTP  - Research Triangle Solid Dose (tablets/capsules)
  3. SFO  - San Francisco Biologics (cell culture / bioreactor)

Uses raw sqlite3 for speed (same pattern as seed_showcase.py).

Run:
    python backend/scripts/seed_pharma.py --force          # Create cassini.db
    python backend/scripts/seed_pharma.py --db-path foo.db # Custom path
    python backend/scripts/seed_pharma.py --dry-run        # Test generators only
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
DB_PATH = backend_dir / "data" / "cassini.db"
IDS: dict[str, int] = {}

RANDOM_SEED = 2026
NUM_MONTHS = 6          # how far back samples go
SAMPLES_PER_DAY = 8     # ~3-hour intervals per characteristic

# Reproducible random data
random.seed(RANDOM_SEED)

_log = logging.getLogger("seed_pharma")

# ── Users (password for all: "password") ─────────────────────────────────
USERS = [
    # (username, email, full_name, role_map: {site_code: role})
    ("admin",     "admin@openspc.local",     "Admin User",       {"BOS": "admin",    "RTP": "admin",    "SFO": "admin"}),
    ("jchen",     "j.chen@pharma.local",     "James Chen",       {"BOS": "engineer", "RTP": "engineer"}),
    ("mgarcia",   "m.garcia@pharma.local",   "Maria Garcia",     {"RTP": "engineer", "SFO": "engineer"}),
    ("asingh",    "a.singh@pharma.local",    "Aisha Singh",      {"SFO": "engineer"}),
    ("kpatel",    "k.patel@pharma.local",    "Kiran Patel",      {"BOS": "supervisor"}),
    ("twright",   "t.wright@pharma.local",   "Thomas Wright",    {"RTP": "supervisor"}),
    ("lwilson",   "l.wilson@pharma.local",   "Linda Wilson",     {"SFO": "supervisor"}),
    ("rjohnson",  "r.johnson@pharma.local",  "Robert Johnson",   {"BOS": "operator"}),
    ("slee",      "s.lee@pharma.local",      "Sarah Lee",        {"RTP": "operator"}),
    ("dnguyen",   "d.nguyen@pharma.local",   "David Nguyen",     {"SFO": "operator"}),
    ("bmartin",   "b.martin@pharma.local",   "Beth Martin",      {"BOS": "operator", "RTP": "operator"}),
    ("ekim",      "e.kim@pharma.local",      "Eric Kim",         {"SFO": "operator"}),
]

OPERATORS = {
    "BOS": ["rjohnson", "bmartin", "kpatel"],
    "RTP": ["slee", "bmartin", "twright"],
    "SFO": ["dnguyen", "ekim", "lwilson"],
}

BATCH_PREFIXES = {
    "BOS": "BOS",
    "RTP": "RTP",
    "SFO": "SFO",
}


# ── Insert helpers (copied from seed_showcase.py) ────────────────────────

def insert_plant(cur: sqlite3.Cursor, name: str, code: str, settings: dict | None = None) -> int:
    cur.execute(
        "INSERT INTO plant (name, code, is_active, settings, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)",
        (name, code, json.dumps(settings) if settings else None, utcnow(), utcnow()),
    )
    return cur.lastrowid


def insert_hierarchy(cur: sqlite3.Cursor, plant_id: int, name: str, htype: str,
                     parent_id: int | None = None) -> int:
    cur.execute(
        "INSERT INTO hierarchy (plant_id, name, type, parent_id) VALUES (?, ?, ?, ?)",
        (plant_id, name, htype, parent_id),
    )
    return cur.lastrowid


def insert_user(cur: sqlite3.Cursor, username: str, password: str,
                email: str | None = None, full_name: str | None = None) -> int:
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
    cur.execute(
        "INSERT INTO user_plant_role (user_id, plant_id, role, created_at) VALUES (?, ?, ?, ?)",
        (user_id, plant_id, role, utcnow()),
    )


def insert_char(cur: sqlite3.Cursor, hierarchy_id: int, name: str, **kwargs) -> int:
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
            hierarchy_id, name,
            defaults["description"], defaults["subgroup_size"],
            defaults["target_value"], defaults["usl"], defaults["lsl"],
            defaults["ucl"], defaults["lcl"],
            defaults["subgroup_mode"], defaults["min_measurements"],
            defaults["stored_sigma"], defaults["stored_center_line"],
            defaults["data_type"], defaults["attribute_chart_type"],
            defaults["default_sample_size"],
            defaults["chart_type"], defaults["cusum_target"],
            defaults["cusum_k"], defaults["cusum_h"],
            defaults["ewma_lambda"], defaults["ewma_l"],
            defaults["decimal_precision"], defaults["distribution_method"],
            defaults["box_cox_lambda"], defaults["distribution_params"],
            defaults["use_laney_correction"], defaults["short_run_mode"],
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


def insert_nelson_rules(cur: sqlite3.Cursor, char_id: int,
                        rules: list[tuple[int, bool, bool]] | None = None) -> None:
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
        cur.execute(
            """INSERT INTO characteristic_rules
            (char_id, rule_id, is_enabled, require_acknowledgement, parameters)
            VALUES (?, ?, ?, ?, NULL)""",
            (char_id, rule_id, 1 if is_enabled else 0, 1 if require_ack else 0),
        )


def insert_capability(cur: sqlite3.Cursor, char_id: int, cp: float, cpk: float,
                      pp: float, ppk: float, cpm: float | None = None,
                      sample_count: int = 100, p_value: float | None = None,
                      calc_by: str = "system") -> int:
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


# ── Site / hierarchy / characteristic definitions ────────────────────────

SITES = [
    {
        "name": "Boston API Manufacturing",
        "code": "BOS",
        "settings": {"timezone": "America/New_York", "gmp_classification": "Class A/B"},
        "broker": {
            "name": "BOS MQTT Gateway",
            "host": "mqtt-bos.pharma.local",
            "port": 8883,
            "use_tls": True,
            "client_id": "openspc-bos",
        },
        "hierarchy": {
            "name": "Boston Campus",
            "type": "Enterprise",
            "children": [
                {
                    "name": "Building 100 - Sterile Manufacturing",
                    "type": "Area",
                    "children": [
                        {
                            "name": "Formulation Suite",
                            "type": "Cell",
                            "characteristics": [
                                {
                                    "name": "pH",
                                    "description": "Solution pH during formulation",
                                    "subgroup_size": 3,
                                    "target": 7.40, "usl": 7.60, "lsl": 7.20,
                                    "ucl": 7.52, "lcl": 7.28,
                                    "provider": "TAG",
                                    "topic": "spBv1.0/BOS/DDATA/form-suite/pH-meter",
                                    "metric": "pH_Value",
                                    "rules": [1, 2, 3, 4, 5],
                                    "data": {"mean": 7.40, "std": 0.04, "shift_start": 0.65, "shift_delta": 0.08},
                                },
                                {
                                    "name": "Conductivity",
                                    "description": "WFI conductivity (uS/cm)",
                                    "subgroup_size": 1,
                                    "target": 1.00, "usl": 1.30, "lsl": 0.50,
                                    "ucl": 1.20, "lcl": 0.60,
                                    "provider": "TAG",
                                    "topic": "spBv1.0/BOS/DDATA/form-suite/conductivity",
                                    "metric": "Conductivity_uScm",
                                    "rules": [1, 2],
                                    "data": {"mean": 1.00, "std": 0.10, "outlier_at": 0.70, "outlier_value": 1.35},
                                },
                            ],
                        },
                        {
                            "name": "Filling Line FL-01",
                            "type": "Equipment",
                            "characteristics": [
                                {
                                    "name": "Fill Volume",
                                    "description": "Vial fill volume (mL)",
                                    "subgroup_size": 5,
                                    "target": 10.00, "usl": 10.50, "lsl": 9.50,
                                    "ucl": 10.30, "lcl": 9.70,
                                    "provider": "TAG",
                                    "topic": "spBv1.0/BOS/DDATA/FL01/checkweigher",
                                    "metric": "Fill_Volume_mL",
                                    "rules": [1, 2, 3, 4, 5, 6],
                                    "data": {"mean": 10.00, "std": 0.08, "trend_start": 0.80, "trend_rate": 0.003},
                                },
                                {
                                    "name": "Stopper Insertion Force",
                                    "description": "Stopper insertion force (N)",
                                    "subgroup_size": 5,
                                    "target": 45.0, "usl": 55.0, "lsl": 35.0,
                                    "ucl": 51.0, "lcl": 39.0,
                                    "provider": "TAG",
                                    "topic": "spBv1.0/BOS/DDATA/FL01/stopper-station",
                                    "metric": "Insertion_Force_N",
                                    "rules": [1, 2, 3],
                                    "data": {"mean": 45.0, "std": 2.0},
                                },
                            ],
                        },
                        {
                            "name": "Lyophilizer LYO-01",
                            "type": "Equipment",
                            "characteristics": [
                                {
                                    "name": "Shelf Temperature",
                                    "description": "Lyophilizer shelf temperature (C)",
                                    "subgroup_size": 1,
                                    "target": -40.0, "usl": -38.0, "lsl": -42.0,
                                    "ucl": -38.5, "lcl": -41.5,
                                    "provider": "TAG",
                                    "topic": "spBv1.0/BOS/DDATA/LYO01/shelf-temp",
                                    "metric": "Shelf_Temp_C",
                                    "rules": [1, 2, 5, 6],
                                    "data": {"mean": -40.0, "std": 0.5, "shift_start": 0.45, "shift_delta": -1.0},
                                },
                                {
                                    "name": "Chamber Vacuum",
                                    "description": "Lyophilizer chamber vacuum (mTorr)",
                                    "subgroup_size": 1,
                                    "target": 100.0, "usl": 150.0, "lsl": 50.0,
                                    "ucl": 130.0, "lcl": 70.0,
                                    "provider": "TAG",
                                    "topic": "spBv1.0/BOS/DDATA/LYO01/vacuum",
                                    "metric": "Chamber_Vacuum_mTorr",
                                    "rules": [1, 2],
                                    "data": {"mean": 100.0, "std": 10.0},
                                },
                            ],
                        },
                    ],
                },
                {
                    "name": "QC Laboratory",
                    "type": "Area",
                    "children": [
                        {
                            "name": "Analytical Lab",
                            "type": "Cell",
                            "characteristics": [
                                {
                                    "name": "Assay Potency",
                                    "description": "API assay potency (% label claim)",
                                    "subgroup_size": 3,
                                    "target": 100.0, "usl": 105.0, "lsl": 95.0,
                                    "ucl": 103.0, "lcl": 97.0,
                                    "provider": "MANUAL",
                                    "rules": [1, 2, 3, 4],
                                    "data": {"mean": 100.0, "std": 1.2},
                                },
                                {
                                    "name": "Endotoxin",
                                    "description": "Bacterial endotoxin (EU/mL)",
                                    "subgroup_size": 2,
                                    "target": 0.10, "usl": 0.25, "lsl": None,
                                    "ucl": 0.20, "lcl": 0.02,
                                    "provider": "MANUAL",
                                    "rules": [1, 2],
                                    "data": {"mean": 0.10, "std": 0.03, "outlier_at": 0.55, "outlier_value": 0.24},
                                },
                            ],
                        },
                    ],
                },
            ],
        },
    },
    {
        "name": "Research Triangle Solid Dose",
        "code": "RTP",
        "settings": {"timezone": "America/New_York", "gmp_classification": "OSD"},
        "broker": {
            "name": "RTP MQTT Gateway",
            "host": "mqtt-rtp.pharma.local",
            "port": 8883,
            "use_tls": True,
            "client_id": "openspc-rtp",
        },
        "hierarchy": {
            "name": "RTP Campus",
            "type": "Enterprise",
            "children": [
                {
                    "name": "Building 200 - Oral Solid Dosage",
                    "type": "Area",
                    "children": [
                        {
                            "name": "Granulation Suite GR-01",
                            "type": "Cell",
                            "characteristics": [
                                {
                                    "name": "Granule Moisture",
                                    "description": "Fluid bed dryer LOD (%)",
                                    "subgroup_size": 3,
                                    "target": 2.50, "usl": 3.50, "lsl": 1.50,
                                    "ucl": 3.10, "lcl": 1.90,
                                    "provider": "TAG",
                                    "topic": "spBv1.0/RTP/DDATA/GR01/NIR-probe",
                                    "metric": "Moisture_LOD_Pct",
                                    "rules": [1, 2, 3, 4, 5, 6],
                                    "data": {"mean": 2.50, "std": 0.20, "trend_start": 0.70, "trend_rate": 0.005},
                                },
                                {
                                    "name": "Inlet Air Temperature",
                                    "description": "Fluid bed dryer inlet air temp (C)",
                                    "subgroup_size": 1,
                                    "target": 60.0, "usl": 65.0, "lsl": 55.0,
                                    "ucl": 63.0, "lcl": 57.0,
                                    "provider": "TAG",
                                    "topic": "spBv1.0/RTP/DDATA/GR01/inlet-temp",
                                    "metric": "Inlet_Air_Temp_C",
                                    "rules": [1, 2],
                                    "data": {"mean": 60.0, "std": 1.2},
                                },
                            ],
                        },
                        {
                            "name": "Tablet Press TP-01",
                            "type": "Equipment",
                            "characteristics": [
                                {
                                    "name": "Tablet Weight",
                                    "description": "Individual tablet weight (mg)",
                                    "subgroup_size": 10,
                                    "target": 500.0, "usl": 525.0, "lsl": 475.0,
                                    "ucl": 515.0, "lcl": 485.0,
                                    "provider": "TAG",
                                    "topic": "spBv1.0/RTP/DDATA/TP01/checkweigher",
                                    "metric": "Tablet_Weight_mg",
                                    "rules": [1, 2, 3, 4, 5, 6, 7, 8],
                                    "data": {"mean": 500.0, "std": 5.0, "shift_start": 0.55, "shift_delta": 6.0},
                                },
                                {
                                    "name": "Tablet Hardness",
                                    "description": "Tablet breaking force (kP)",
                                    "subgroup_size": 10,
                                    "target": 12.0, "usl": 16.0, "lsl": 8.0,
                                    "ucl": 14.5, "lcl": 9.5,
                                    "provider": "TAG",
                                    "topic": "spBv1.0/RTP/DDATA/TP01/hardness-tester",
                                    "metric": "Hardness_kP",
                                    "rules": [1, 2, 3, 4],
                                    "data": {"mean": 12.0, "std": 1.0},
                                },
                                {
                                    "name": "Tablet Thickness",
                                    "description": "Tablet thickness (mm)",
                                    "subgroup_size": 10,
                                    "target": 5.50, "usl": 5.80, "lsl": 5.20,
                                    "ucl": 5.70, "lcl": 5.30,
                                    "provider": "TAG",
                                    "topic": "spBv1.0/RTP/DDATA/TP01/thickness-gauge",
                                    "metric": "Thickness_mm",
                                    "rules": [1, 2, 3],
                                    "data": {"mean": 5.50, "std": 0.06},
                                },
                                {
                                    "name": "Compression Force",
                                    "description": "Main compression force (kN)",
                                    "subgroup_size": 1,
                                    "target": 15.0, "usl": 20.0, "lsl": 10.0,
                                    "ucl": 18.0, "lcl": 12.0,
                                    "provider": "TAG",
                                    "topic": "spBv1.0/RTP/DDATA/TP01/force-sensor",
                                    "metric": "Compression_Force_kN",
                                    "rules": [1, 2],
                                    "data": {"mean": 15.0, "std": 1.5},
                                },
                            ],
                        },
                        {
                            "name": "Coating Pan CP-01",
                            "type": "Equipment",
                            "characteristics": [
                                {
                                    "name": "Coating Weight Gain",
                                    "description": "Film coating weight gain (%)",
                                    "subgroup_size": 5,
                                    "target": 3.00, "usl": 4.00, "lsl": 2.00,
                                    "ucl": 3.60, "lcl": 2.40,
                                    "provider": "MANUAL",
                                    "rules": [1, 2, 3, 4],
                                    "data": {"mean": 3.00, "std": 0.20},
                                },
                            ],
                        },
                    ],
                },
                {
                    "name": "IPC Laboratory",
                    "type": "Area",
                    "children": [
                        {
                            "name": "In-Process Testing",
                            "type": "Cell",
                            "characteristics": [
                                {
                                    "name": "Dissolution",
                                    "description": "Dissolution at 30 min (% released)",
                                    "subgroup_size": 6,
                                    "target": 85.0, "usl": None, "lsl": 75.0,
                                    "ucl": 95.0, "lcl": 78.0,
                                    "provider": "MANUAL",
                                    "rules": [1, 2, 3],
                                    "data": {"mean": 85.0, "std": 3.0, "shift_start": 0.80, "shift_delta": -4.0},
                                    # Non-normal: Weibull distribution for dissolution profile
                                    "distribution_method": "weibull",
                                },
                                {
                                    "name": "Content Uniformity",
                                    "description": "Assay of individual tablets (% LC)",
                                    "subgroup_size": 10,
                                    "target": 100.0, "usl": 105.0, "lsl": 95.0,
                                    "ucl": 103.5, "lcl": 96.5,
                                    "provider": "MANUAL",
                                    "rules": [1, 2, 3, 4, 5, 6],
                                    "data": {"mean": 100.0, "std": 1.5},
                                },
                                {
                                    "name": "Particle Size D50",
                                    "description": "Particle size D50 (um)",
                                    "subgroup_size": 3,
                                    "target": 150.0, "usl": 200.0, "lsl": 100.0,
                                    "ucl": 185.0, "lcl": 115.0,
                                    "provider": "MANUAL",
                                    "rules": [1, 2, 3],
                                    "data": {"mean": 150.0, "std": 15.0},
                                    # Non-normal: Box-Cox transformation for particle size
                                    "distribution_method": "box_cox",
                                    "box_cox_lambda": 0.3,
                                },
                            ],
                        },
                    ],
                },
            ],
        },
    },
    {
        "name": "San Francisco Biologics",
        "code": "SFO",
        "settings": {"timezone": "America/Los_Angeles", "gmp_classification": "Biologics"},
        "broker": {
            "name": "SFO MQTT Gateway",
            "host": "mqtt-sfo.pharma.local",
            "port": 8883,
            "use_tls": True,
            "client_id": "openspc-sfo",
        },
        "hierarchy": {
            "name": "SFO Campus",
            "type": "Enterprise",
            "children": [
                {
                    "name": "Building 300 - Upstream Processing",
                    "type": "Area",
                    "children": [
                        {
                            "name": "Bioreactor BR-2000L",
                            "type": "Equipment",
                            "characteristics": [
                                {
                                    "name": "Dissolved Oxygen",
                                    "description": "Bioreactor dissolved O2 (%)",
                                    "subgroup_size": 1,
                                    "target": 40.0, "usl": 60.0, "lsl": 20.0,
                                    "ucl": 52.0, "lcl": 28.0,
                                    "provider": "TAG",
                                    "topic": "spBv1.0/SFO/DDATA/BR2000/DO-probe",
                                    "metric": "DO_Pct",
                                    "rules": [1, 2, 5, 6],
                                    "data": {"mean": 40.0, "std": 4.0, "seasonal_amplitude": 3.0, "seasonal_period": 50},
                                },
                                {
                                    "name": "Bioreactor pH",
                                    "description": "Culture medium pH",
                                    "subgroup_size": 1,
                                    "target": 7.00, "usl": 7.20, "lsl": 6.80,
                                    "ucl": 7.12, "lcl": 6.88,
                                    "provider": "TAG",
                                    "topic": "spBv1.0/SFO/DDATA/BR2000/pH-probe",
                                    "metric": "Culture_pH",
                                    "rules": [1, 2, 3, 4],
                                    "data": {"mean": 7.00, "std": 0.04},
                                },
                                {
                                    "name": "Bioreactor Temperature",
                                    "description": "Culture temperature (C)",
                                    "subgroup_size": 1,
                                    "target": 37.0, "usl": 37.5, "lsl": 36.5,
                                    "ucl": 37.3, "lcl": 36.7,
                                    "provider": "TAG",
                                    "topic": "spBv1.0/SFO/DDATA/BR2000/temp-sensor",
                                    "metric": "Culture_Temp_C",
                                    "rules": [1, 2, 3, 4, 5, 6, 7, 8],
                                    "data": {"mean": 37.0, "std": 0.10, "trend_start": 0.85, "trend_rate": 0.002},
                                },
                                {
                                    "name": "Agitation Speed",
                                    "description": "Impeller speed (RPM)",
                                    "subgroup_size": 1,
                                    "target": 150.0, "usl": 170.0, "lsl": 130.0,
                                    "ucl": 162.0, "lcl": 138.0,
                                    "provider": "TAG",
                                    "topic": "spBv1.0/SFO/DDATA/BR2000/agitator",
                                    "metric": "Agitation_RPM",
                                    "rules": [1, 2],
                                    "data": {"mean": 150.0, "std": 4.0},
                                },
                            ],
                        },
                        {
                            "name": "Cell Culture Lab",
                            "type": "Cell",
                            "characteristics": [
                                {
                                    "name": "Viable Cell Density",
                                    "description": "VCD (x10^6 cells/mL)",
                                    "subgroup_size": 3,
                                    "target": 8.0, "usl": 12.0, "lsl": 4.0,
                                    "ucl": 10.5, "lcl": 5.5,
                                    "provider": "MANUAL",
                                    "rules": [1, 2, 3],
                                    "data": {"mean": 8.0, "std": 1.2, "shift_start": 0.40, "shift_delta": 1.5},
                                },
                                {
                                    "name": "Cell Viability",
                                    "description": "Cell viability (%)",
                                    "subgroup_size": 3,
                                    "target": 95.0, "usl": None, "lsl": 80.0,
                                    "ucl": 98.0, "lcl": 88.0,
                                    "provider": "MANUAL",
                                    "rules": [1, 2],
                                    "data": {"mean": 95.0, "std": 2.0},
                                },
                            ],
                        },
                    ],
                },
                {
                    "name": "Building 310 - Downstream Processing",
                    "type": "Area",
                    "children": [
                        {
                            "name": "Chromatography Skid CHR-01",
                            "type": "Equipment",
                            "characteristics": [
                                {
                                    "name": "Column Pressure",
                                    "description": "Protein A column pressure (bar)",
                                    "subgroup_size": 1,
                                    "target": 3.0, "usl": 5.0, "lsl": 1.0,
                                    "ucl": 4.2, "lcl": 1.8,
                                    "provider": "TAG",
                                    "topic": "spBv1.0/SFO/DDATA/CHR01/pressure",
                                    "metric": "Column_Pressure_bar",
                                    "rules": [1, 2, 5, 6],
                                    "data": {"mean": 3.0, "std": 0.5, "trend_start": 0.60, "trend_rate": 0.004},
                                },
                                {
                                    "name": "UV Absorbance",
                                    "description": "UV280 absorbance (mAU)",
                                    "subgroup_size": 1,
                                    "target": 1200.0, "usl": 1500.0, "lsl": 900.0,
                                    "ucl": 1400.0, "lcl": 1000.0,
                                    "provider": "TAG",
                                    "topic": "spBv1.0/SFO/DDATA/CHR01/UV280",
                                    "metric": "UV280_mAU",
                                    "rules": [1, 2, 3],
                                    "data": {"mean": 1200.0, "std": 60.0},
                                },
                            ],
                        },
                        {
                            "name": "UF/DF Skid TFF-01",
                            "type": "Equipment",
                            "characteristics": [
                                {
                                    "name": "Permeate Flux",
                                    "description": "TFF permeate flux (LMH)",
                                    "subgroup_size": 1,
                                    "target": 30.0, "usl": 45.0, "lsl": 15.0,
                                    "ucl": 40.0, "lcl": 20.0,
                                    "provider": "TAG",
                                    "topic": "spBv1.0/SFO/DDATA/TFF01/flow-meter",
                                    "metric": "Permeate_Flux_LMH",
                                    "rules": [1, 2],
                                    "data": {"mean": 30.0, "std": 4.0},
                                },
                                {
                                    "name": "TMP",
                                    "description": "Trans-membrane pressure (psi)",
                                    "subgroup_size": 1,
                                    "target": 20.0, "usl": 30.0, "lsl": 10.0,
                                    "ucl": 26.0, "lcl": 14.0,
                                    "provider": "TAG",
                                    "topic": "spBv1.0/SFO/DDATA/TFF01/TMP-sensor",
                                    "metric": "TMP_psi",
                                    "rules": [1, 2],
                                    "data": {"mean": 20.0, "std": 2.5},
                                },
                            ],
                        },
                    ],
                },
                {
                    "name": "QC Biologics Lab",
                    "type": "Area",
                    "children": [
                        {
                            "name": "Analytical Testing",
                            "type": "Cell",
                            "characteristics": [
                                {
                                    "name": "Protein Concentration",
                                    "description": "Product titer (g/L)",
                                    "subgroup_size": 2,
                                    "target": 5.0, "usl": 7.0, "lsl": 3.0,
                                    "ucl": 6.2, "lcl": 3.8,
                                    "provider": "MANUAL",
                                    "rules": [1, 2, 3, 4],
                                    "data": {"mean": 5.0, "std": 0.5, "outlier_at": 0.30, "outlier_value": 6.5},
                                },
                                {
                                    "name": "Aggregate Level",
                                    "description": "SEC-HPLC aggregate (%)",
                                    "subgroup_size": 2,
                                    "target": 1.0, "usl": 2.0, "lsl": None,
                                    "ucl": 1.8, "lcl": 0.3,
                                    "provider": "MANUAL",
                                    "rules": [1, 2],
                                    "data": {"mean": 1.0, "std": 0.25},
                                },
                            ],
                        },
                    ],
                },
            ],
        },
    },
]


# ── Sample data generation ───────────────────────────────────────────────

def generate_value(cfg: dict, sample_index: int, total_samples: int, rng: random.Random) -> float:
    """Generate a single measurement value with realistic process behavior."""
    d = cfg["data"]
    mean = d["mean"]
    std = d["std"]
    frac = sample_index / max(total_samples - 1, 1)

    # Shift
    if "shift_start" in d and frac >= d["shift_start"]:
        mean += d["shift_delta"]

    # Trend
    if "trend_start" in d and frac >= d["trend_start"]:
        progress = (frac - d["trend_start"]) / (1.0 - d["trend_start"])
        mean += d["trend_rate"] * total_samples * progress

    # Seasonal
    if "seasonal_amplitude" in d:
        period = d.get("seasonal_period", 60)
        mean += d["seasonal_amplitude"] * math.sin(2 * math.pi * sample_index / period)

    # Outlier (one-time spike)
    if "outlier_at" in d and abs(frac - d["outlier_at"]) < (1.0 / total_samples):
        return round(d["outlier_value"], 4)

    value = rng.gauss(mean, std)

    # Clamp to physically sensible range
    if cfg.get("lsl") is not None:
        value = max(value, cfg["lsl"] - 3 * std)
    if cfg.get("usl") is not None:
        value = min(value, cfg["usl"] + 3 * std)

    return round(value, 4)


# ── Foundation: Plants, Hierarchy, Users, Roles ──────────────────────────

def seed_foundation(cur: sqlite3.Cursor) -> None:
    """Create 3 plants, full hierarchies, 12 users, and role assignments."""

    # ── Plants ───────────────────────────────────────────────────────────
    plant_map: dict[str, int] = {}
    for site_def in SITES:
        plant_id = insert_plant(cur, site_def["name"], site_def["code"], site_def.get("settings"))
        plant_map[site_def["code"]] = plant_id
        IDS[f"{site_def['code'].lower()}_plant"] = plant_id

    # ── Users & Roles ────────────────────────────────────────────────────
    for username, email, full_name, role_map in USERS:
        user_id = insert_user(cur, username, "password", email, full_name)
        IDS[f"user_{username}"] = user_id
        for site_code, role_name in role_map.items():
            insert_role(cur, user_id, plant_map[site_code], role_name)

    # ── Password Policy: RTP (strict 21 CFR Part 11) ────────────────────
    cur.execute(
        """INSERT INTO password_policy
        (plant_id, password_expiry_days, max_failed_attempts, lockout_duration_minutes,
         min_password_length, require_uppercase, require_lowercase, require_digit,
         require_special, password_history_count, session_timeout_minutes,
         signature_timeout_minutes, updated_at)
        VALUES (?, 90, 3, 30, 12, 1, 1, 1, 1, 12, 480, 15, ?)""",
        (IDS["rtp_plant"], utcnow()),
    )


# ── Brokers & Connectivity ───────────────────────────────────────────────

def seed_connectivity(cur: sqlite3.Cursor) -> None:
    """Create MQTT brokers and data sources for TAG characteristics."""
    now = utcnow()

    broker_map: dict[str, int] = {}
    for site_def in SITES:
        b_def = site_def["broker"]
        cur.execute(
            """INSERT INTO mqtt_broker
            (plant_id, name, host, port, use_tls, tls_insecure, client_id, keepalive, max_reconnect_delay,
             is_active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 0, ?, 60, 300, 1, ?, ?)""",
            (
                IDS[f"{site_def['code'].lower()}_plant"],
                b_def["name"], b_def["host"], b_def.get("port", 1883),
                1 if b_def.get("use_tls", False) else 0,
                b_def.get("client_id", "openspc-client"),
                now, now,
            ),
        )
        broker_map[site_def["code"]] = cur.lastrowid

    # Create MQTT data sources for TAG characteristics
    # We need to query all characteristics that have TAG providers
    # But since we know the mapping from the SITES definition, we iterate
    for site_def in SITES:
        site_code = site_def["code"]
        broker_id = broker_map[site_code]

        def _walk_chars(node_def: dict):
            for c_def in node_def.get("characteristics", []):
                if c_def.get("provider") == "TAG" and c_def.get("topic"):
                    char_key = _char_key(site_code, c_def["name"])
                    char_id = IDS.get(char_key)
                    if char_id:
                        trigger_tag = c_def.get("trigger_tag")
                        cur.execute(
                            """INSERT INTO data_source
                            (characteristic_id, type, is_active)
                            VALUES (?, 'mqtt', 1)""",
                            (char_id,),
                        )
                        ds_id = cur.lastrowid
                        cur.execute(
                            """INSERT INTO mqtt_data_source
                            (id, broker_id, topic, metric_name, trigger_tag)
                            VALUES (?, ?, ?, ?, ?)""",
                            (
                                ds_id, broker_id, c_def["topic"],
                                c_def.get("metric"), trigger_tag,
                            ),
                        )
            for child in node_def.get("children", []):
                _walk_chars(child)

        _walk_chars(site_def["hierarchy"])


def _char_key(site_code: str, char_name: str) -> str:
    """Generate a stable IDS key for a characteristic."""
    return f"char_{site_code}_{char_name.lower().replace(' ', '_')}"


# ── Characteristics & Samples ────────────────────────────────────────────

def seed_characteristics_and_samples(cur: sqlite3.Cursor) -> None:
    """Create hierarchy nodes, characteristics, and sample data."""
    rng = random.Random(RANDOM_SEED)
    now = datetime.now(timezone.utc)
    start_date = now - timedelta(days=NUM_MONTHS * 30)
    total_samples = NUM_MONTHS * 30 * SAMPLES_PER_DAY  # ~1440 per characteristic

    stats = {"nodes": 0, "chars": 0, "samples": 0, "measurements": 0, "violations": 0}

    for site_def in SITES:
        site_code = site_def["code"]
        plant_id = IDS[f"{site_code.lower()}_plant"]

        def create_tree(node_def: dict, parent_id: int | None, depth: int = 0):
            indent = "  " + "  " * depth
            node_id = insert_hierarchy(cur, plant_id, node_def["name"], node_def["type"], parent_id)
            stats["nodes"] += 1
            print(f"{indent}[{node_def['type']}] {node_def['name']} (ID {node_id})")

            # Create characteristics on this node
            for c_def in node_def.get("characteristics", []):
                char_kwargs = {
                    "description": c_def.get("description"),
                    "subgroup_size": c_def["subgroup_size"],
                    "target_value": c_def.get("target"),
                    "usl": c_def.get("usl"),
                    "lsl": c_def.get("lsl"),
                    "ucl": c_def.get("ucl"),
                    "lcl": c_def.get("lcl"),
                }

                # Non-normal distribution support
                if c_def.get("distribution_method"):
                    char_kwargs["distribution_method"] = c_def["distribution_method"]
                if c_def.get("box_cox_lambda") is not None:
                    char_kwargs["box_cox_lambda"] = c_def["box_cox_lambda"]

                char_id = insert_char(cur, node_id, c_def["name"], **char_kwargs)
                stats["chars"] += 1

                # Store char ID for later reference
                char_key = _char_key(site_code, c_def["name"])
                IDS[char_key] = char_id

                provider = c_def.get("provider", "MANUAL")
                print(f"{indent}  * {c_def['name']} (n={c_def['subgroup_size']}, provider={provider})")

                # Nelson rules
                enabled_rules = c_def.get("rules", [1, 2])
                rule_tuples = [(r, True, True) for r in enabled_rules]
                insert_nelson_rules(cur, char_id, rule_tuples)

                # Generate samples with inline Nelson rules checking
                operators = OPERATORS[site_code]
                prefix = BATCH_PREFIXES[site_code]

                nelson_checker = None
                if c_def.get("ucl") is not None and c_def.get("lcl") is not None:
                    nelson_checker = InlineNelsonChecker(
                        cl=c_def["target"],
                        ucl=c_def["ucl"],
                        lcl=c_def["lcl"],
                        enabled_rules=enabled_rules,
                    )

                # Track sample IDs for anomaly event references
                sample_ids: list[int] = []

                for s_idx in range(total_samples):
                    sample_time = start_date + timedelta(hours=s_idx * (24 / SAMPLES_PER_DAY))
                    batch_day = s_idx // SAMPLES_PER_DAY
                    batch_num = f"{prefix}-{batch_day + 1:04d}"

                    measurement_values = []
                    for _ in range(c_def["subgroup_size"]):
                        val = generate_value(c_def, s_idx, total_samples, rng)
                        measurement_values.append(val)

                    sample_id = insert_sample(
                        cur, char_id,
                        sample_time.isoformat(),
                        values=measurement_values,
                        batch=batch_num,
                        operator=operators[s_idx % len(operators)],
                    )
                    sample_ids.append(sample_id)
                    stats["samples"] += 1
                    stats["measurements"] += len(measurement_values)

                    # Check Nelson rules on the sample mean
                    if nelson_checker is not None:
                        sample_mean = sum(measurement_values) / len(measurement_values)
                        triggered_rules = nelson_checker.check(sample_mean)
                        for rule_id in triggered_rules:
                            severity = "CRITICAL" if rule_id == 1 else "WARNING"
                            insert_violation(
                                cur, sample_id, char_id,
                                rule_id=rule_id,
                                rule_name=NELSON_RULE_NAMES.get(rule_id, f"Rule {rule_id}"),
                                severity=severity,
                            )
                            stats["violations"] += 1

                    # Flush periodically to avoid huge memory pressure
                    if s_idx % 500 == 0 and s_idx > 0:
                        cur.connection.commit()

                # Store sample IDs for potential anomaly event references
                IDS[f"{char_key}_samples"] = sample_ids

            # Recurse into children
            for child_def in node_def.get("children", []):
                create_tree(child_def, node_id, depth + 1)

        h_def = site_def["hierarchy"]
        print(f"\n--- {site_code}: {site_def['name']} ---")
        create_tree(h_def, None, 0)

    print(f"\n  Nodes: {stats['nodes']}, Chars: {stats['chars']}, "
          f"Samples: {stats['samples']:,}, Measurements: {stats['measurements']:,}, "
          f"Violations: {stats['violations']:,}")


# ── Capability History ───────────────────────────────────────────────────

def seed_capability(cur: sqlite3.Cursor) -> None:
    """Insert capability snapshots for key characteristics."""
    # BOS: Fill Volume — good process
    fv_key = _char_key("BOS", "Fill Volume")
    if fv_key in IDS:
        insert_capability(cur, IDS[fv_key], cp=1.67, cpk=1.55, pp=1.60, ppk=1.48,
                          cpm=1.50, sample_count=1440, p_value=0.72)

    # RTP: Tablet Weight — shifted process, lower Cpk
    tw_key = _char_key("RTP", "Tablet Weight")
    if tw_key in IDS:
        insert_capability(cur, IDS[tw_key], cp=1.67, cpk=0.89, pp=1.50, ppk=0.78,
                          cpm=0.85, sample_count=1440, p_value=0.45)

    # RTP: Dissolution — non-normal (Weibull)
    diss_key = _char_key("RTP", "Dissolution")
    if diss_key in IDS:
        insert_capability(cur, IDS[diss_key], cp=1.33, cpk=1.12, pp=1.25, ppk=1.05,
                          sample_count=1440, p_value=0.03)

    # SFO: Bioreactor Temperature — tight process
    bt_key = _char_key("SFO", "Bioreactor Temperature")
    if bt_key in IDS:
        insert_capability(cur, IDS[bt_key], cp=3.33, cpk=3.10, pp=3.20, ppk=2.95,
                          cpm=3.00, sample_count=1440, p_value=0.88)

    # SFO: Column Pressure — trending, moderate capability
    cp_key = _char_key("SFO", "Column Pressure")
    if cp_key in IDS:
        insert_capability(cur, IDS[cp_key], cp=1.33, cpk=1.15, pp=1.20, ppk=1.00,
                          sample_count=1440, p_value=0.55)


# ══════════════════════════════════════════════════════════════════════════
# FDA Demo Features
# ══════════════════════════════════════════════════════════════════════════


# ── Electronic Signatures (RTP) ──────────────────────────────────────────

def seed_signatures(cur: sqlite3.Cursor) -> None:
    """Electronic signatures — meanings, workflows, instances, individual signatures."""
    now = utcnow()
    rtp_plant = IDS["rtp_plant"]

    # ── Signature Meanings ──
    meanings = [
        ("batch_release", "Batch Release Approval", "Approves batch for release to market", True),
        ("spec_change", "Specification Change", "Approves changes to specification limits", True),
        ("data_purge", "Data Purge Authorization", "Authorizes deletion of historical data", True),
    ]
    for code, display, desc, req_comment in meanings:
        cur.execute(
            """INSERT INTO signature_meaning
            (plant_id, code, display_name, description, requires_comment, is_active, sort_order)
            VALUES (?, ?, ?, ?, ?, 1, ?)""",
            (rtp_plant, code, display, desc, 1 if req_comment else 0,
             meanings.index((code, display, desc, req_comment)) + 1),
        )

    # ── Workflow 1: Batch Release (2 steps) ──
    cur.execute(
        """INSERT INTO signature_workflow
        (plant_id, name, resource_type, is_active, is_required, description, created_at, updated_at)
        VALUES (?, 'Batch Release', 'sample', 1, 1,
                'Two-step batch release: QA review then QA Director approval', ?, ?)""",
        (rtp_plant, now, now),
    )
    wf1 = cur.lastrowid
    cur.execute(
        """INSERT INTO signature_workflow_step
        (workflow_id, step_order, name, min_role, meaning_code, is_required, allow_self_sign, timeout_hours)
        VALUES (?, 1, 'QA Review', 'engineer', 'batch_release', 1, 0, 48)""",
        (wf1,),
    )
    wf1_step1 = cur.lastrowid
    cur.execute(
        """INSERT INTO signature_workflow_step
        (workflow_id, step_order, name, min_role, meaning_code, is_required, allow_self_sign, timeout_hours)
        VALUES (?, 2, 'QA Director Approval', 'supervisor', 'batch_release', 1, 0, 72)""",
        (wf1,),
    )
    wf1_step2 = cur.lastrowid

    # ── Workflow 2: Spec Change (3 steps) ──
    cur.execute(
        """INSERT INTO signature_workflow
        (plant_id, name, resource_type, is_active, is_required, description, created_at, updated_at)
        VALUES (?, 'Spec Change Approval', 'characteristic', 1, 1,
                'Three-step spec change: Engineer submit, Supervisor review, QA Director approve', ?, ?)""",
        (rtp_plant, now, now),
    )
    wf2 = cur.lastrowid
    cur.execute(
        """INSERT INTO signature_workflow_step
        (workflow_id, step_order, name, min_role, meaning_code, is_required, allow_self_sign, timeout_hours)
        VALUES (?, 1, 'Engineer Submit', 'engineer', 'spec_change', 1, 1, 24)""",
        (wf2,),
    )
    wf2_step1 = cur.lastrowid
    cur.execute(
        """INSERT INTO signature_workflow_step
        (workflow_id, step_order, name, min_role, meaning_code, is_required, allow_self_sign, timeout_hours)
        VALUES (?, 2, 'Supervisor Review', 'supervisor', 'spec_change', 1, 0, 48)""",
        (wf2,),
    )
    wf2_step2 = cur.lastrowid
    cur.execute(
        """INSERT INTO signature_workflow_step
        (workflow_id, step_order, name, min_role, meaning_code, is_required, allow_self_sign, timeout_hours)
        VALUES (?, 3, 'QA Director Approval', 'admin', 'spec_change', 1, 0, 72)""",
        (wf2,),
    )
    wf2_step3 = cur.lastrowid

    # ── Resource hash helpers ──
    def resource_hash(rtype, rid, content=""):
        return hashlib.sha256(f"{rtype}:{rid}:{content}".encode()).hexdigest()

    def sig_hash(user_id, meaning, ts, rhash):
        return hashlib.sha256(f"{user_id}:{meaning}:{ts}:{rhash}".encode()).hexdigest()

    admin_id = IDS["user_admin"]
    jchen_id = IDS["user_jchen"]      # BOS+RTP engineer
    mgarcia_id = IDS["user_mgarcia"]  # RTP+SFO engineer
    twright_id = IDS["user_twright"]   # RTP supervisor

    # ── Instance 1: APPROVED — Tablet Weight spec update ──
    tw_id = IDS.get(_char_key("RTP", "Tablet Weight"), 1)
    r_hash = resource_hash("characteristic", tw_id, "spec_update_ucl_515")
    cur.execute(
        """INSERT INTO signature_workflow_instance
        (workflow_id, resource_type, resource_id, status, current_step, initiated_by, initiated_at, completed_at, expires_at)
        VALUES (?, 'characteristic', ?, 'completed', 3, ?, ?, ?, NULL)""",
        (wf2, tw_id, jchen_id, ts_offset(BASE_TIME, days=-10), now),
    )
    inst1 = cur.lastrowid
    ts1 = ts_offset(BASE_TIME, days=-10)
    sh1 = sig_hash(jchen_id, "spec_change", ts1, r_hash)
    cur.execute(
        """INSERT INTO electronic_signature
        (user_id, username, full_name, timestamp, meaning_code, meaning_display, resource_type, resource_id,
         resource_hash, signature_hash, ip_address, workflow_step_id, comment, is_valid)
        VALUES (?, 'jchen', 'James Chen', ?, 'spec_change', 'Specification Change', 'characteristic', ?,
                ?, ?, '10.10.1.50', ?, 'Spec limits verified against process capability data', 1)""",
        (jchen_id, ts1, tw_id, r_hash, sh1, wf2_step1),
    )
    ts2 = ts_offset(BASE_TIME, days=-9)
    sh2 = sig_hash(twright_id, "spec_change", ts2, r_hash)
    cur.execute(
        """INSERT INTO electronic_signature
        (user_id, username, full_name, timestamp, meaning_code, meaning_display, resource_type, resource_id,
         resource_hash, signature_hash, ip_address, workflow_step_id, comment, is_valid)
        VALUES (?, 'twright', 'Thomas Wright', ?, 'spec_change', 'Specification Change', 'characteristic', ?,
                ?, ?, '10.10.1.51', ?, 'Reviewed — limits consistent with process capability', 1)""",
        (twright_id, ts2, tw_id, r_hash, sh2, wf2_step2),
    )
    ts3 = ts_offset(BASE_TIME, days=-8)
    sh3 = sig_hash(admin_id, "spec_change", ts3, r_hash)
    cur.execute(
        """INSERT INTO electronic_signature
        (user_id, username, full_name, timestamp, meaning_code, meaning_display, resource_type, resource_id,
         resource_hash, signature_hash, ip_address, workflow_step_id, comment, is_valid)
        VALUES (?, 'admin', 'Admin User', ?, 'spec_change', 'Specification Change', 'characteristic', ?,
                ?, ?, '10.10.1.1', ?, 'Approved per CAPA-2026-003', 1)""",
        (admin_id, ts3, tw_id, r_hash, sh3, wf2_step3),
    )

    # ── Instance 2: REJECTED — Content Uniformity wider limits ──
    cu_id = IDS.get(_char_key("RTP", "Content Uniformity"), 2)
    r_hash2 = resource_hash("characteristic", cu_id, "widen_limits_cu")
    cur.execute(
        """INSERT INTO signature_workflow_instance
        (workflow_id, resource_type, resource_id, status, current_step, initiated_by, initiated_at, completed_at, expires_at)
        VALUES (?, 'characteristic', ?, 'rejected', 2, ?, ?, ?, NULL)""",
        (wf2, cu_id, mgarcia_id, ts_offset(BASE_TIME, days=-5), now),
    )
    inst2 = cur.lastrowid
    ts4 = ts_offset(BASE_TIME, days=-5)
    sh4 = sig_hash(mgarcia_id, "spec_change", ts4, r_hash2)
    cur.execute(
        """INSERT INTO electronic_signature
        (user_id, username, full_name, timestamp, meaning_code, meaning_display, resource_type, resource_id,
         resource_hash, signature_hash, ip_address, workflow_step_id, comment, is_valid)
        VALUES (?, 'mgarcia', 'Maria Garcia', ?, 'spec_change', 'Specification Change', 'characteristic', ?,
                ?, ?, '10.10.1.52', ?, 'Requesting wider CU limits for new formulation', 1)""",
        (mgarcia_id, ts4, cu_id, r_hash2, sh4, wf2_step1),
    )
    ts5 = ts_offset(BASE_TIME, days=-4)
    sh5 = sig_hash(twright_id, "spec_change", ts5, r_hash2)
    cur.execute(
        """INSERT INTO electronic_signature
        (user_id, username, full_name, timestamp, meaning_code, meaning_display, resource_type, resource_id,
         resource_hash, signature_hash, ip_address, workflow_step_id, comment, is_valid)
        VALUES (?, 'twright', 'Thomas Wright', ?, 'spec_change', 'Specification Change', 'characteristic', ?,
                ?, ?, '10.10.1.51', ?, 'Rejected — limits too wide for FDA validation requirements', 1)""",
        (twright_id, ts5, cu_id, r_hash2, sh5, wf2_step2),
    )

    # ── Instance 3: PENDING — Batch Release (awaiting QA review) ──
    cur.execute(
        """INSERT INTO signature_workflow_instance
        (workflow_id, resource_type, resource_id, status, current_step, initiated_by, initiated_at, completed_at, expires_at)
        VALUES (?, 'sample', 1, 'pending', 1, ?, ?, NULL, NULL)""",
        (wf1, mgarcia_id, now),
    )

    # ── Instance 4: EXPIRED — Old data purge request ──
    expired_at = ts_offset(BASE_TIME, days=-30)
    initiated_at = ts_offset(BASE_TIME, days=-35)
    cur.execute(
        """INSERT INTO signature_workflow_instance
        (workflow_id, resource_type, resource_id, status, current_step, initiated_by, initiated_at, completed_at, expires_at)
        VALUES (?, 'characteristic', ?, 'expired', 1, ?, ?, NULL, ?)""",
        (wf2, cu_id, jchen_id, initiated_at, expired_at),
    )


# ── Anomaly Detection (RTP) ─────────────────────────────────────────────

def seed_anomaly(cur: sqlite3.Cursor) -> None:
    """Anomaly detection configs and events for 3 RTP characteristics."""
    now = utcnow()

    # Config 1: Tablet Weight — PELT + K-S (full detectors)
    tw_key = _char_key("RTP", "Tablet Weight")
    tw_id = IDS.get(tw_key)
    if tw_id:
        cur.execute(
            """INSERT INTO anomaly_detector_config
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
            (tw_id, now, now),
        )

        # Anomaly events for Tablet Weight
        tw_samples = IDS.get(f"{tw_key}_samples", [])
        if len(tw_samples) > 800:
            # PELT changepoint at ~55% (shift point)
            shift_idx = int(len(tw_samples) * 0.55)
            cur.execute(
                """INSERT INTO anomaly_event
                (char_id, detector_type, event_type, severity, details, sample_id, window_start_id, window_end_id,
                 is_acknowledged, is_dismissed, summary, detected_at)
                VALUES (?, 'pelt', 'changepoint', 'high', ?, ?, NULL, NULL,
                        1, 0, 'PELT detected mean shift in tablet weight at 55% through production run', ?)""",
                (tw_id, json.dumps({"change_point_index": shift_idx, "segment_means": [500.0, 506.0]}),
                 tw_samples[shift_idx], now),
            )
            # K-S distribution shift after changepoint
            cur.execute(
                """INSERT INTO anomaly_event
                (char_id, detector_type, event_type, severity, details, sample_id, window_start_id, window_end_id,
                 is_acknowledged, is_dismissed, summary, detected_at)
                VALUES (?, 'ks_test', 'distribution_shift', 'medium', ?, ?, ?, ?,
                        0, 0, 'K-S test detected distribution shift (p=0.001) after weight increase', ?)""",
                (tw_id, json.dumps({"ks_statistic": 0.234, "p_value": 0.001, "alpha": 0.05}),
                 tw_samples[shift_idx + 10],
                 tw_samples[shift_idx - 50], tw_samples[shift_idx + 50], now),
            )

    # Config 2: Granule Moisture — PELT only
    gm_key = _char_key("RTP", "Granule Moisture")
    gm_id = IDS.get(gm_key)
    if gm_id:
        cur.execute(
            """INSERT INTO anomaly_detector_config
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
            (gm_id, now, now),
        )

        gm_samples = IDS.get(f"{gm_key}_samples", [])
        if len(gm_samples) > 1100:
            # Trend detection at ~70%
            trend_idx = int(len(gm_samples) * 0.72)
            cur.execute(
                """INSERT INTO anomaly_event
                (char_id, detector_type, event_type, severity, details, sample_id, window_start_id, window_end_id,
                 is_acknowledged, is_dismissed, summary, detected_at)
                VALUES (?, 'pelt', 'changepoint', 'medium', ?, ?, NULL, NULL,
                        0, 0, 'PELT detected gradual moisture drift starting at sample ~1030', ?)""",
                (gm_id, json.dumps({"change_point_index": trend_idx, "segment_means": [2.50, 2.65]}),
                 gm_samples[trend_idx], now),
            )
            cur.execute(
                """INSERT INTO anomaly_event
                (char_id, detector_type, event_type, severity, details, sample_id, window_start_id, window_end_id,
                 is_acknowledged, is_dismissed, summary, detected_at)
                VALUES (?, 'pelt', 'changepoint', 'low', ?, ?, NULL, NULL,
                        0, 0, 'Variance increase detected in moisture readings', ?)""",
                (gm_id, json.dumps({"variance_ratio": 1.35, "segment_stds": [0.20, 0.27]}),
                 gm_samples[trend_idx + 50], now),
            )

    # Config 3: Dissolution — K-S only (non-normal characteristic)
    diss_key = _char_key("RTP", "Dissolution")
    diss_id = IDS.get(diss_key)
    if diss_id:
        cur.execute(
            """INSERT INTO anomaly_detector_config
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
            (diss_id, now, now),
        )

        diss_samples = IDS.get(f"{diss_key}_samples", [])
        if len(diss_samples) > 1200:
            shift_idx = int(len(diss_samples) * 0.82)
            cur.execute(
                """INSERT INTO anomaly_event
                (char_id, detector_type, event_type, severity, details, sample_id, window_start_id, window_end_id,
                 is_acknowledged, is_dismissed, summary, detected_at)
                VALUES (?, 'ks_test', 'distribution_shift', 'high', ?, ?, ?, ?,
                        0, 0, 'K-S detected dissolution shift — coating thickness variability suspected', ?)""",
                (diss_id, json.dumps({"ks_statistic": 0.312, "p_value": 0.0003, "alpha": 0.05}),
                 diss_samples[shift_idx],
                 diss_samples[shift_idx - 50], diss_samples[shift_idx + 50], now),
            )
            cur.execute(
                """INSERT INTO anomaly_event
                (char_id, detector_type, event_type, severity, details, sample_id, window_start_id, window_end_id,
                 is_acknowledged, is_dismissed, summary, detected_at)
                VALUES (?, 'ks_test', 'distribution_shift', 'medium', ?, ?, ?, ?,
                        0, 0, 'Dissolution distribution shift continuing after initial detection', ?)""",
                (diss_id, json.dumps({"ks_statistic": 0.289, "p_value": 0.0008, "alpha": 0.05}),
                 diss_samples[shift_idx + 30],
                 diss_samples[shift_idx], diss_samples[min(shift_idx + 80, len(diss_samples) - 1)], now),
            )


# ── MSA Studies ──────────────────────────────────────────────────────────

def seed_msa(cur: sqlite3.Cursor) -> None:
    """2 MSA studies: 1 collecting, 1 complete."""
    now = utcnow()
    rtp_plant = IDS["rtp_plant"]

    # ── Study 1: USP Dissolution Uniformity GR&R (collecting) ──
    diss_id = IDS.get(_char_key("RTP", "Dissolution"))
    cur.execute(
        """INSERT INTO msa_study
        (plant_id, name, study_type, characteristic_id, num_operators, num_parts, num_replicates,
         tolerance, status, created_by, created_at, completed_at, results_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, NULL, NULL)""",
        (rtp_plant, "USP Dissolution Uniformity GR&R", "crossed_anova", diss_id,
         3, 10, 3, "collecting", IDS["user_mgarcia"], now),
    )
    study1 = cur.lastrowid

    # 3 operators defined
    ops1 = []
    for i, name in enumerate(["Sarah Lee", "Beth Martin", "Maria Garcia"]):
        cur.execute(
            "INSERT INTO msa_operator (study_id, name, sequence_order) VALUES (?, ?, ?)",
            (study1, name, i + 1),
        )
        ops1.append(cur.lastrowid)

    # 10 parts defined, NO measurements yet
    for i in range(10):
        cur.execute(
            "INSERT INTO msa_part (study_id, name, reference_value, sequence_order) VALUES (?, ?, NULL, ?)",
            (study1, f"Batch-{i + 1:02d}", i + 1),
        )

    # ── Study 2: Tablet Weight GR&R (complete) ──
    tw_id = IDS.get(_char_key("RTP", "Tablet Weight"))
    cur.execute(
        """INSERT INTO msa_study
        (plant_id, name, study_type, characteristic_id, num_operators, num_parts, num_replicates,
         tolerance, status, created_by, created_at, completed_at, results_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (rtp_plant, "Tablet Weight GR&R", "crossed_anova", tw_id,
         3, 10, 3, 50.0, "complete", IDS["user_jchen"], now, now,
         json.dumps({
             "grr_percent": 9.8, "ndc": 10, "repeatability": 6.5, "reproducibility": 7.3,
             "part_variation": 99.5, "total_variation": 100.0,
             "anova_table": {
                 "source": ["Operator", "Part", "Operator*Part", "Repeatability", "Total"],
                 "df": [2, 9, 18, 60, 89],
                 "ss": [12.5, 2450.0, 8.3, 85.2, 2556.0],
                 "ms": [6.25, 272.2, 0.46, 1.42],
                 "f": [13.6, 591.7, 0.32],
             },
         })),
    )
    study2 = cur.lastrowid

    # 3 operators
    ops2 = []
    for i, name in enumerate(["Sarah Lee", "Beth Martin", "Thomas Wright"]):
        cur.execute(
            "INSERT INTO msa_operator (study_id, name, sequence_order) VALUES (?, ?, ?)",
            (study2, name, i + 1),
        )
        ops2.append(cur.lastrowid)

    # 10 parts spread around 500mg
    parts2 = []
    part_refs = [500.0 + 2.5 * (i - 5) for i in range(10)]  # 487.5 to 512.5
    for i in range(10):
        cur.execute(
            "INSERT INTO msa_part (study_id, name, reference_value, sequence_order) VALUES (?, ?, ?, ?)",
            (study2, f"Tab-{i + 1:02d}", part_refs[i], i + 1),
        )
        parts2.append(cur.lastrowid)

    # 3 ops x 10 parts x 3 reps = 90 measurements
    random.seed(99)
    for op_idx, op_id in enumerate(ops2):
        for part_idx, part_id in enumerate(parts2):
            for rep in range(3):
                base = part_refs[part_idx]
                op_bias = [-0.5, 0.0, 0.3][op_idx]
                error = random.gauss(0, 0.8)
                value = round(base + op_bias + error, 2)
                cur.execute(
                    """INSERT INTO msa_measurement
                    (study_id, operator_id, part_id, replicate_num, value, attribute_value, timestamp)
                    VALUES (?, ?, ?, ?, ?, NULL, ?)""",
                    (study2, op_id, part_id, rep + 1, value, now),
                )
    random.seed(RANDOM_SEED)  # restore


# ── Retention Policy ─────────────────────────────────────────────────────

def seed_retention(cur: sqlite3.Cursor) -> None:
    """ICH Q10 5-year global retention policy."""
    now = utcnow()

    # Global 5-year policy (ICH Q10)
    cur.execute(
        """INSERT INTO retention_policy
        (plant_id, scope, hierarchy_id, characteristic_id, retention_type, retention_value, retention_unit, created_at, updated_at)
        VALUES (?, 'global', NULL, NULL, 'time_delta', 1825, 'days', ?, ?)""",
        (IDS["rtp_plant"], now, now),
    )

    # BOS: 7-year for sterile injectables
    cur.execute(
        """INSERT INTO retention_policy
        (plant_id, scope, hierarchy_id, characteristic_id, retention_type, retention_value, retention_unit, created_at, updated_at)
        VALUES (?, 'global', NULL, NULL, 'time_delta', 2555, 'days', ?, ?)""",
        (IDS["bos_plant"], now, now),
    )

    # SFO: forever (biologics — no deletion)
    cur.execute(
        """INSERT INTO retention_policy
        (plant_id, scope, hierarchy_id, characteristic_id, retention_type, retention_value, retention_unit, created_at, updated_at)
        VALUES (?, 'global', NULL, NULL, 'forever', NULL, NULL, ?, ?)""",
        (IDS["sfo_plant"], now, now),
    )


# ── ERP Connector (LIMS) ────────────────────────────────────────────────

def seed_erp(cur: sqlite3.Cursor) -> None:
    """LIMS integration for RTP with 3 field mappings."""
    now = utcnow()

    cur.execute(
        """INSERT INTO erp_connector
        (plant_id, name, connector_type, base_url, auth_type, auth_config, headers, is_active, status,
         last_sync_at, last_error, created_at, updated_at)
        VALUES (?, 'LIMS Integration \u2014 RTP', 'generic_webhook',
                'https://lims.bioverde-pharma.local/api/v2',
                'api_key', '{}', '{}', 1, 'active',
                ?, NULL, ?, ?)""",
        (IDS["rtp_plant"], ts_offset(BASE_TIME, hours=-2), now, now),
    )
    lims_conn = cur.lastrowid

    # 3 field mappings
    mappings = [
        ("Lab Result Inbound", "inbound", "LabResult", "test_value", "sample", "value"),
        ("Certificate Inbound", "inbound", "Certificate", "batch_id", "sample", "batch_number"),
        ("Violation Alert Outbound", "outbound", "ViolationAlert", "alert_payload", "violation", "rule_name"),
    ]
    for name, direction, erp_entity, erp_field, openspc_entity, openspc_field in mappings:
        cur.execute(
            """INSERT INTO erp_field_mapping
            (connector_id, name, direction, erp_entity, erp_field_path, openspc_entity, openspc_field, transform, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 1)""",
            (lims_conn, name, direction, erp_entity, erp_field, openspc_entity, openspc_field),
        )

    # Sync schedule
    cur.execute(
        """INSERT INTO erp_sync_schedule
        (connector_id, direction, cron_expression, is_active, last_run_at, next_run_at)
        VALUES (?, 'inbound', '0 */4 * * *', 1, ?, ?)""",
        (lims_conn, ts_offset(BASE_TIME, hours=-4), ts_offset(BASE_TIME, hours=0)),
    )

    # 2 sync logs
    cur.execute(
        """INSERT INTO erp_sync_log
        (connector_id, direction, status, records_processed, records_failed, started_at, completed_at, error_message, detail)
        VALUES (?, 'inbound', 'success', 18, 0, ?, ?, NULL, NULL)""",
        (lims_conn, ts_offset(BASE_TIME, hours=-4), ts_offset(BASE_TIME, hours=-3, minutes=-58)),
    )
    cur.execute(
        """INSERT INTO erp_sync_log
        (connector_id, direction, status, records_processed, records_failed, started_at, completed_at, error_message, detail)
        VALUES (?, 'inbound', 'success', 22, 0, ?, ?, NULL, NULL)""",
        (lims_conn, ts_offset(BASE_TIME, hours=-8), ts_offset(BASE_TIME, hours=-7, minutes=-57)),
    )


# ── Push Subscriptions ───────────────────────────────────────────────────

def seed_push(cur: sqlite3.Cursor) -> None:
    """Push subscriptions for admin and QA Director (twright)."""
    now = utcnow()

    # Admin push subscription
    cur.execute(
        """INSERT INTO push_subscription
        (user_id, endpoint, p256dh_key, auth_key, created_at)
        VALUES (?, ?, ?, ?, ?)""",
        (IDS["user_admin"],
         "https://fcm.googleapis.com/fcm/send/pR4xM7nQ2wK:APA91bH_pharma_admin_push_sub_001",
         "BIjWxE3F0VmTk5hR9yL4oPqDsMcN6wA2bKfGjH8uYvXzW1eS0dP3iO7nM5lJ4kT6rQ9sU2vC8xB0aE",
         "tR7uW3xY9zA1bC5dE8fG",
         now),
    )

    # QA Director (twright) push subscription
    cur.execute(
        """INSERT INTO push_subscription
        (user_id, endpoint, p256dh_key, auth_key, created_at)
        VALUES (?, ?, ?, ?, ?)""",
        (IDS["user_twright"],
         "https://fcm.googleapis.com/fcm/send/qS5yN8oR3xL:APA91bH_pharma_twright_push_sub_002",
         "BGkZpE8F1VnUl6iS0yM5pPrEtNdO7xB3cLfHkI9uZwX2eT1dQ4jO8nN6mK5lJ7kU3rS9tV2wD0aF",
         "hJ4kL7mN0pQ3rS6tU9w",
         now),
    )


# ── OIDC Account Link ───────────────────────────────────────────────────

def seed_oidc(cur: sqlite3.Cursor) -> None:
    """OIDC config and account link for admin -> Azure AD."""
    now = utcnow()

    # OIDC provider config
    cur.execute(
        """INSERT INTO oidc_config
        (name, issuer_url, client_id, client_secret_encrypted, scopes, role_mapping,
         auto_provision, default_role, claim_mapping, end_session_endpoint, post_logout_redirect_uri,
         allowed_redirect_uris, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)""",
        ("BioVerde Pharma Azure AD",
         "https://login.microsoftonline.com/bioverde-pharma/v2.0",
         "f1a2b3c4-d5e6-7890-abcd-bioverde01234",
         "gAAAAABn_encrypted_placeholder_for_pharma_seed_demo_only",
         '["openid", "profile", "email", "groups"]',
         json.dumps({
             "SPC-QA-Directors": {"*": "admin"},
             "SPC-Engineers": {"*": "engineer"},
             "SPC-Supervisors": {"*": "supervisor"},
             "SPC-Operators": {"*": "operator"},
         }),
         1, "operator",
         json.dumps({"email": "preferred_username", "name": "name", "groups": "groups"}),
         "https://login.microsoftonline.com/bioverde-pharma/oauth2/v2.0/logout",
         "http://localhost:5173",
         '["http://localhost:5173/auth/callback", "https://cassini.bioverde-pharma.com/auth/callback"]',
         now, now),
    )
    oidc_provider_id = cur.lastrowid

    # Link admin user to Azure AD
    cur.execute(
        """INSERT INTO oidc_account_link
        (user_id, provider_id, oidc_subject, linked_at)
        VALUES (?, ?, ?, ?)""",
        (IDS["user_admin"], oidc_provider_id, "00000000-aaaa-bbbb-cccc-bioverde00042", now),
    )


# ── Notification Preferences ─────────────────────────────────────────────

def seed_notifications(cur: sqlite3.Cursor) -> None:
    """SMTP config, webhook config, and notification preferences."""
    now = utcnow()

    # SMTP config
    cur.execute(
        """INSERT INTO smtp_config
        (server, port, username, password, use_tls, from_address, is_active, created_at, updated_at)
        VALUES ('smtp.bioverde-pharma.local', 587, 'cassini-notify', NULL, 1, 'cassini@bioverde-pharma.local', 0, ?, ?)""",
        (now, now),
    )

    # Webhook for LIMS alerts
    cur.execute(
        """INSERT INTO webhook_config
        (name, url, secret, is_active, retry_count, events_filter, created_at, updated_at)
        VALUES ('LIMS Quality Alerts', 'https://lims.bioverde-pharma.local/webhooks/quality',
                'whsec_pharma_lims_secret_001', 1, 3, 'violation,anomaly', ?, ?)""",
        (now, now),
    )

    # Notification preferences
    prefs = [
        # Engineers: violation + anomaly + capability
        (IDS["user_jchen"], "violation", "email", 1, "all"),
        (IDS["user_jchen"], "anomaly", "email", 1, "all"),
        (IDS["user_jchen"], "capability", "email", 1, "all"),
        (IDS["user_mgarcia"], "violation", "email", 1, "all"),
        (IDS["user_mgarcia"], "anomaly", "email", 1, "all"),
        # Supervisors: violation + signature
        (IDS["user_twright"], "violation", "email", 1, "warning"),
        (IDS["user_twright"], "signature", "email", 1, "all"),
        (IDS["user_kpatel"], "violation", "email", 1, "warning"),
        # Admin: everything
        (IDS["user_admin"], "violation", "email", 1, "all"),
        (IDS["user_admin"], "anomaly", "email", 1, "all"),
        (IDS["user_admin"], "capability", "email", 1, "all"),
        (IDS["user_admin"], "signature", "email", 1, "all"),
        (IDS["user_admin"], "system", "email", 1, "all"),
        (IDS["user_admin"], "violation", "webhook", 1, "all"),
    ]

    for user_id, event_type, channel, enabled, severity in prefs:
        cur.execute(
            """INSERT INTO notification_preference
            (user_id, event_type, channel, is_enabled, severity_filter, created_at)
            VALUES (?, ?, ?, ?, ?, ?)""",
            (user_id, event_type, channel, enabled, severity, now),
        )


# ── Audit Trail ──────────────────────────────────────────────────────────

def seed_audit(cur: sqlite3.Cursor) -> None:
    """Audit log entries for recent activity."""
    # Login events
    users_info = [
        ("admin", "Admin User", IDS["user_admin"]),
        ("jchen", "James Chen", IDS["user_jchen"]),
        ("mgarcia", "Maria Garcia", IDS["user_mgarcia"]),
        ("twright", "Thomas Wright", IDS["user_twright"]),
        ("slee", "Sarah Lee", IDS["user_slee"]),
        ("rjohnson", "Robert Johnson", IDS["user_rjohnson"]),
    ]

    for username, full_name, user_id in users_info:
        for days_ago in random.sample(range(1, 8), min(3, 7)):
            ts = ts_offset(BASE_TIME, days=-days_ago, hours=-random.randint(0, 12))
            cur.execute(
                """INSERT INTO audit_log
                (user_id, username, action, resource_type, resource_id, detail, ip_address, user_agent, timestamp)
                VALUES (?, ?, 'login', 'session', NULL, ?, ?, ?, ?)""",
                (user_id, username, json.dumps({"method": "password"}),
                 f"10.10.{random.randint(1, 3)}.{random.randint(10, 250)}",
                 "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0", ts),
            )

    # Spec change approval events
    tw_id = IDS.get(_char_key("RTP", "Tablet Weight"), 1)
    ts = ts_offset(BASE_TIME, days=-8)
    cur.execute(
        """INSERT INTO audit_log
        (user_id, username, action, resource_type, resource_id, detail, ip_address, user_agent, timestamp)
        VALUES (?, ?, 'sign', 'characteristic', ?, ?, ?, ?, ?)""",
        (IDS["user_admin"], "admin", tw_id,
         json.dumps({"meaning": "spec_change", "workflow": "Spec Change Approval"}),
         "10.10.1.1", "Mozilla/5.0 Chrome/122.0", ts),
    )

    # Config changes by admin
    config_changes = [
        ("update", "password_policy", 1, {"field": "min_password_length", "old": 8, "new": 12}),
        ("create", "erp_connector", 1, {"name": "LIMS Integration"}),
        ("update", "retention_policy", 1, {"scope": "global", "plant": "RTP"}),
    ]
    for action, rtype, rid, detail in config_changes:
        ts = ts_offset(BASE_TIME, days=-random.randint(1, 14))
        cur.execute(
            """INSERT INTO audit_log
            (user_id, username, action, resource_type, resource_id, detail, ip_address, user_agent, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (IDS["user_admin"], "admin", action, rtype, rid,
             json.dumps(detail), "10.10.1.1", "Mozilla/5.0 Chrome/122.0", ts),
        )


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

    print("Seeding foundation (plants, hierarchy, users, password policy)...")
    seed_foundation(cur)
    print("Seeding characteristics and samples (~37,000 samples)...")
    seed_characteristics_and_samples(cur)
    print("Seeding connectivity (MQTT brokers, data sources)...")
    seed_connectivity(cur)
    print("Seeding capability history...")
    seed_capability(cur)
    print("Seeding electronic signatures (21 CFR Part 11)...")
    seed_signatures(cur)
    print("Seeding anomaly detection...")
    seed_anomaly(cur)
    print("Seeding MSA studies...")
    seed_msa(cur)
    print("Seeding retention policies (ICH Q10)...")
    seed_retention(cur)
    print("Seeding ERP/LIMS connector...")
    seed_erp(cur)
    print("Seeding push subscriptions...")
    seed_push(cur)
    print("Seeding OIDC config and account link...")
    seed_oidc(cur)
    print("Seeding notifications...")
    seed_notifications(cur)
    print("Seeding audit trail...")
    seed_audit(cur)

    conn.commit()

    # Print summary
    tables = [
        "plant", "hierarchy", "user", "user_plant_role", "password_policy",
        "characteristic", "characteristic_rules", "sample", "measurement",
        "violation", "capability_history",
        "mqtt_broker", "data_source", "mqtt_data_source",
        "anomaly_detector_config", "anomaly_event",
        "signature_meaning", "signature_workflow", "signature_workflow_step",
        "signature_workflow_instance", "electronic_signature",
        "msa_study", "msa_operator", "msa_part", "msa_measurement",
        "retention_policy",
        "erp_connector", "erp_field_mapping", "erp_sync_schedule", "erp_sync_log",
        "smtp_config", "webhook_config", "notification_preference",
        "push_subscription", "oidc_config", "oidc_account_link",
        "audit_log",
    ]

    print("\n" + "=" * 60)
    print("  PHARMA + FDA SEED COMPLETE")
    print("=" * 60)
    for tbl in tables:
        try:
            cur.execute(f"SELECT COUNT(*) FROM [{tbl}]")
            count = cur.fetchone()[0]
            if count > 0:
                print(f"  {tbl:40s} {count:>8,}")
        except sqlite3.OperationalError:
            pass  # Table may not exist in this schema version
    print("=" * 60)
    print(f"  DB File: {db_path}")
    print(f"\nAll users have password: 'password'")
    print(f"Admin user: admin / password")

    conn.close()


# ── Main ─────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Seed Cassini with pharma + FDA 21 CFR Part 11 demo data")
    parser.add_argument("--db-path", default=str(DB_PATH))
    parser.add_argument("--dry-run", action="store_true", help="Test imports only")
    parser.add_argument("--force", action="store_true", help="Overwrite existing DB")
    args = parser.parse_args()

    if args.dry_run:
        print("=== Dry Run -- Testing imports ===")
        print(f"Password hash OK: {len(hash_password('test')) > 0}")
        print(f"InlineNelsonChecker OK: {InlineNelsonChecker is not None}")
        print(f"NELSON_RULE_NAMES: {len(NELSON_RULE_NAMES)} rules")
        print(f"Sites: {len(SITES)}")
        print(f"Users: {len(USERS)}")
        total_chars = 0
        for site in SITES:
            def _count_chars(node):
                nonlocal total_chars
                total_chars += len(node.get("characteristics", []))
                for c in node.get("children", []):
                    _count_chars(c)
            _count_chars(site["hierarchy"])
        print(f"Characteristics: {total_chars}")
        print(f"Samples per char: {NUM_MONTHS * 30 * SAMPLES_PER_DAY}")
        print(f"Est. total samples: {total_chars * NUM_MONTHS * 30 * SAMPLES_PER_DAY:,}")
        print("=== All imports OK ===")
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

    print("Seeding foundation (plants, hierarchy, users, password policy)...")
    seed_foundation(cur)
    print("Seeding characteristics and samples (~37,000 samples)...")
    seed_characteristics_and_samples(cur)
    print("Seeding connectivity (MQTT brokers, data sources)...")
    seed_connectivity(cur)
    print("Seeding capability history...")
    seed_capability(cur)
    print("Seeding electronic signatures (21 CFR Part 11)...")
    seed_signatures(cur)
    print("Seeding anomaly detection...")
    seed_anomaly(cur)
    print("Seeding MSA studies...")
    seed_msa(cur)
    print("Seeding retention policies (ICH Q10)...")
    seed_retention(cur)
    print("Seeding ERP/LIMS connector...")
    seed_erp(cur)
    print("Seeding push subscriptions...")
    seed_push(cur)
    print("Seeding OIDC config and account link...")
    seed_oidc(cur)
    print("Seeding notifications...")
    seed_notifications(cur)
    print("Seeding audit trail...")
    seed_audit(cur)

    conn.commit()

    # Print summary
    tables = [
        "plant", "hierarchy", "user", "user_plant_role", "password_policy",
        "characteristic", "characteristic_rules", "sample", "measurement",
        "violation", "capability_history",
        "mqtt_broker", "data_source", "mqtt_data_source",
        "anomaly_detector_config", "anomaly_event",
        "signature_meaning", "signature_workflow", "signature_workflow_step",
        "signature_workflow_instance", "electronic_signature",
        "msa_study", "msa_operator", "msa_part", "msa_measurement",
        "retention_policy",
        "erp_connector", "erp_field_mapping", "erp_sync_schedule", "erp_sync_log",
        "smtp_config", "webhook_config", "notification_preference",
        "push_subscription", "oidc_config", "oidc_account_link",
        "audit_log",
    ]

    print("\n" + "=" * 60)
    print("  PHARMA + FDA SEED COMPLETE")
    print("=" * 60)
    for tbl in tables:
        try:
            cur.execute(f"SELECT COUNT(*) FROM [{tbl}]")
            count = cur.fetchone()[0]
            if count > 0:
                print(f"  {tbl:40s} {count:>8,}")
        except sqlite3.OperationalError:
            pass
    print("=" * 60)
    print(f"  DB File: {db_path}")
    print(f"\nAll users have password: 'password'")
    print(f"Admin user: admin / password")

    conn.close()


if __name__ == "__main__":
    main()
