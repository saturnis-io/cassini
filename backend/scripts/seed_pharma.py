"""Pharmaceutical / Life Sciences seed script for OpenSPC.

Creates 3 sites with realistic ISA-95 hierarchy, characteristics, brokers,
tag mappings, users with role assignments, and ~6 months of sample data
with realistic process behavior (shifts, trends, outliers, seasonal drift).

Sites:
  1. BOS  - Boston API Manufacturing (sterile injectables)
  2. RTP  - Research Triangle Solid Dose (tablets/capsules)
  3. SFO  - San Francisco Biologics (cell culture / bioreactor)

Run:
    python backend/scripts/seed_pharma.py          # full reset + seed
    python backend/scripts/seed_pharma.py --keep    # seed only (skip wipe)
"""

import asyncio
import math
import random
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

backend_dir = Path(__file__).parent.parent
src_dir = backend_dir / "src"
sys.path.insert(0, str(src_dir))

from sqlalchemy import select

from openspc.core.auth.passwords import hash_password
from openspc.db import (
    Characteristic,
    CharacteristicRule,
    DatabaseConfig,
    Hierarchy,
    HierarchyType,
    MQTTDataSource,
)
from openspc.db.models.broker import MQTTBroker
from openspc.db.models.characteristic_config import CharacteristicConfig  # noqa: F401 — registers model
from openspc.db.models.plant import Plant
from openspc.db.models.sample import Measurement, Sample
from openspc.db.models.user import User, UserPlantRole, UserRole
from openspc.db.models.violation import Violation
from openspc.db.models.api_key import APIKey  # noqa: F401 — registers model


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

RANDOM_SEED = 2026
NUM_MONTHS = 6          # how far back samples go
SAMPLES_PER_DAY = 8     # ~3-hour intervals per characteristic

# Users (password for all: "password")
USERS = [
    # (username, email, role_map: {site_code: role})
    ("admin",     "admin@openspc.local",     {"BOS": "admin",    "RTP": "admin",    "SFO": "admin"}),
    ("jchen",     "j.chen@pharma.local",     {"BOS": "engineer", "RTP": "engineer"}),
    ("mgarcia",   "m.garcia@pharma.local",   {"RTP": "engineer", "SFO": "engineer"}),
    ("asingh",    "a.singh@pharma.local",    {"SFO": "engineer"}),
    ("kpatel",    "k.patel@pharma.local",    {"BOS": "supervisor"}),
    ("twright",   "t.wright@pharma.local",   {"RTP": "supervisor"}),
    ("lwilson",   "l.wilson@pharma.local",   {"SFO": "supervisor"}),
    ("rjohnson",  "r.johnson@pharma.local",  {"BOS": "operator"}),
    ("slee",      "s.lee@pharma.local",      {"RTP": "operator"}),
    ("dnguyen",   "d.nguyen@pharma.local",   {"SFO": "operator"}),
    ("bmartin",   "b.martin@pharma.local",   {"BOS": "operator", "RTP": "operator"}),
    ("ekim",      "e.kim@pharma.local",      {"SFO": "operator"}),
]

# ---------------------------------------------------------------------------
# Site / hierarchy / characteristic definitions
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Sample data generation
# ---------------------------------------------------------------------------

def generate_value(cfg: dict, sample_index: int, total_samples: int, rng: random.Random) -> float:
    """Generate a single measurement value with realistic process behavior.

    Supported behaviors (via cfg["data"] keys):
      - base gaussian:  mean + N(0, std)
      - shift_start/shift_delta: mean shift partway through
      - trend_start/trend_rate: gradual drift
      - seasonal_amplitude/seasonal_period: sinusoidal oscillation
      - outlier_at/outlier_value: single spike
    """
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

    # Clamp to physically sensible range (e.g., percentages 0-100, pH 0-14)
    if cfg.get("lsl") is not None:
        value = max(value, cfg["lsl"] - 3 * std)
    if cfg.get("usl") is not None:
        value = min(value, cfg["usl"] + 3 * std)

    return round(value, 4)


NELSON_RULE_NAMES = {
    1: "Beyond 3σ",
    2: "9 points same side",
    3: "6 points trending",
    4: "14 points alternating",
    5: "2 of 3 in Zone A",
    6: "4 of 5 in Zone B+",
    7: "15 points in Zone C",
    8: "8 points outside Zone C",
}


class InlineNelsonChecker:
    """Lightweight Nelson rules evaluator for seed-time violation detection.

    Tracks a rolling window of sample means and checks all 8 rules
    as samples are generated, without requiring the full SPC engine.
    """

    def __init__(self, cl: float, ucl: float, lcl: float, enabled_rules: list[int]):
        self.cl = cl
        self.ucl = ucl
        self.lcl = lcl
        self.sigma = (ucl - cl) / 3.0
        self.enabled_rules = set(enabled_rules)
        self.means: list[float] = []

    def _zone(self, value: float) -> str:
        """Classify a value into a zone relative to the center line."""
        dist = abs(value - self.cl)
        above = value >= self.cl
        if dist > 3 * self.sigma:
            return "BEYOND_UCL" if above else "BEYOND_LCL"
        elif dist > 2 * self.sigma:
            return "ZONE_A_UPPER" if above else "ZONE_A_LOWER"
        elif dist > 1 * self.sigma:
            return "ZONE_B_UPPER" if above else "ZONE_B_LOWER"
        else:
            return "ZONE_C_UPPER" if above else "ZONE_C_LOWER"

    def check(self, sample_mean: float) -> list[int]:
        """Add a sample mean and return list of triggered rule IDs."""
        self.means.append(sample_mean)
        triggered = []

        for rule_id in self.enabled_rules:
            if self._check_rule(rule_id):
                triggered.append(rule_id)

        return triggered

    def _check_rule(self, rule_id: int) -> bool:
        vals = self.means
        n = len(vals)

        if rule_id == 1:
            # Rule 1: latest point beyond 3σ
            if n < 1:
                return False
            z = self._zone(vals[-1])
            return z in ("BEYOND_UCL", "BEYOND_LCL")

        elif rule_id == 2:
            # Rule 2: 9 consecutive points on same side
            if n < 9:
                return False
            last9 = vals[-9:]
            return all(v > self.cl for v in last9) or all(v < self.cl for v in last9)

        elif rule_id == 3:
            # Rule 3: 6 consecutive points trending (all increasing or all decreasing)
            if n < 6:
                return False
            last6 = vals[-6:]
            increasing = all(last6[i] < last6[i + 1] for i in range(5))
            decreasing = all(last6[i] > last6[i + 1] for i in range(5))
            return increasing or decreasing

        elif rule_id == 4:
            # Rule 4: 14 points alternating up/down
            if n < 14:
                return False
            last14 = vals[-14:]
            alternations = 0
            for i in range(1, 13):
                prev_dir = last14[i] - last14[i - 1]
                next_dir = last14[i + 1] - last14[i]
                if prev_dir != 0 and next_dir != 0 and (prev_dir > 0) != (next_dir > 0):
                    alternations += 1
            return alternations >= 12

        elif rule_id == 5:
            # Rule 5: 2 of 3 in Zone A or beyond, same side
            if n < 3:
                return False
            last3 = vals[-3:]
            zones = [self._zone(v) for v in last3]
            upper_a = sum(1 for z in zones if z in ("ZONE_A_UPPER", "BEYOND_UCL"))
            lower_a = sum(1 for z in zones if z in ("ZONE_A_LOWER", "BEYOND_LCL"))
            return upper_a >= 2 or lower_a >= 2

        elif rule_id == 6:
            # Rule 6: 4 of 5 in Zone B or beyond, same side
            if n < 5:
                return False
            last5 = vals[-5:]
            zones = [self._zone(v) for v in last5]
            upper_b = sum(1 for z in zones if z in ("ZONE_B_UPPER", "ZONE_A_UPPER", "BEYOND_UCL"))
            lower_b = sum(1 for z in zones if z in ("ZONE_B_LOWER", "ZONE_A_LOWER", "BEYOND_LCL"))
            return upper_b >= 4 or lower_b >= 4

        elif rule_id == 7:
            # Rule 7: 15 consecutive points within Zone C
            if n < 15:
                return False
            last15 = vals[-15:]
            return all(self._zone(v).startswith("ZONE_C") for v in last15)

        elif rule_id == 8:
            # Rule 8: 8 consecutive points none in Zone C
            if n < 8:
                return False
            last8 = vals[-8:]
            return all(not self._zone(v).startswith("ZONE_C") for v in last8)

        return False


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


# ---------------------------------------------------------------------------
# Main seed logic
# ---------------------------------------------------------------------------

async def seed(keep_existing: bool = False) -> None:
    db_path = backend_dir / "openspc.db"
    db_config = DatabaseConfig(
        database_url=f"sqlite+aiosqlite:///{db_path}",
        echo=False,
    )

    if not keep_existing:
        print("Dropping all tables...")
        await db_config.drop_tables()
        print("Creating fresh schema...")
        await db_config.create_tables()
    else:
        print("Keeping existing schema (--keep mode)")

    rng = random.Random(RANDOM_SEED)
    now = datetime.now(timezone.utc)
    start_date = now - timedelta(days=NUM_MONTHS * 30)
    total_samples = NUM_MONTHS * 30 * SAMPLES_PER_DAY  # ~1440 per characteristic

    stats = {"plants": 0, "nodes": 0, "chars": 0, "samples": 0, "measurements": 0, "users": 0, "brokers": 0, "violations": 0}

    async with db_config.session() as session:
        # ------------------------------------------------------------------
        # 1. Plants
        # ------------------------------------------------------------------
        plant_map: dict[str, Plant] = {}
        for site_def in SITES:
            plant = Plant(
                name=site_def["name"],
                code=site_def["code"],
                is_active=True,
                settings=site_def.get("settings"),
            )
            session.add(plant)
            await session.flush()
            plant_map[site_def["code"]] = plant
            stats["plants"] += 1
            print(f"  Plant: {plant.name} [{plant.code}] (ID {plant.id})")

        # ------------------------------------------------------------------
        # 2. Users & roles
        # ------------------------------------------------------------------
        print("\nCreating users...")
        hashed_pw = hash_password("password")
        for username, email, role_map in USERS:
            user = User(username=username, email=email, hashed_password=hashed_pw, is_active=True)
            session.add(user)
            await session.flush()
            for site_code, role_name in role_map.items():
                plant = plant_map[site_code]
                upr = UserPlantRole(
                    user_id=user.id,
                    plant_id=plant.id,
                    role=UserRole(role_name),
                )
                session.add(upr)
            stats["users"] += 1
            print(f"  User: {username} ({', '.join(f'{c}:{r}' for c, r in role_map.items())})")

        # ------------------------------------------------------------------
        # 3. Brokers
        # ------------------------------------------------------------------
        print("\nCreating brokers...")
        broker_map: dict[str, MQTTBroker] = {}
        for site_def in SITES:
            b_def = site_def["broker"]
            broker = MQTTBroker(
                plant_id=plant_map[site_def["code"]].id,
                name=b_def["name"],
                host=b_def["host"],
                port=b_def.get("port", 1883),
                use_tls=b_def.get("use_tls", False),
                client_id=b_def.get("client_id", "openspc-client"),
                is_active=True,
            )
            session.add(broker)
            await session.flush()
            broker_map[site_def["code"]] = broker
            stats["brokers"] += 1
            print(f"  Broker: {broker.name} -> {broker.host}:{broker.port} (plant={site_def['code']})")

        # ------------------------------------------------------------------
        # 4. Hierarchy + Characteristics + Samples
        # ------------------------------------------------------------------
        print("\nCreating hierarchy, characteristics, and samples...")

        for site_def in SITES:
            site_code = site_def["code"]
            plant = plant_map[site_code]
            broker = broker_map[site_code]

            def _build_node(node_def: dict, parent_id: int | None) -> list[dict]:
                """Recursively build hierarchy and collect characteristic defs."""
                char_defs = []
                return char_defs  # placeholder — real impl below

            async def create_tree(node_def: dict, parent_id: int | None, depth: int = 0):
                """Recursively create hierarchy nodes and characteristics."""
                indent = "  " + "  " * depth
                node = Hierarchy(
                    name=node_def["name"],
                    type=node_def["type"],
                    parent_id=parent_id,
                    plant_id=plant.id,
                )
                session.add(node)
                await session.flush()
                stats["nodes"] += 1
                print(f"{indent}[{node_def['type']}] {node_def['name']} (ID {node.id})")

                # Create characteristics on this node
                for c_def in node_def.get("characteristics", []):
                    char = Characteristic(
                        hierarchy_id=node.id,
                        name=c_def["name"],
                        description=c_def.get("description"),
                        subgroup_size=c_def["subgroup_size"],
                        target_value=c_def.get("target"),
                        usl=c_def.get("usl"),
                        lsl=c_def.get("lsl"),
                        ucl=c_def.get("ucl"),
                        lcl=c_def.get("lcl"),
                    )
                    session.add(char)
                    await session.flush()
                    stats["chars"] += 1

                    provider = c_def.get("provider", "MANUAL")
                    print(f"{indent}  * {c_def['name']} (n={c_def['subgroup_size']}, provider={provider})")

                    # Create MQTT data source for TAG characteristics
                    if provider == "TAG" and c_def.get("topic"):
                        trigger_tag = c_def.get("trigger_tag")
                        source = MQTTDataSource(
                            characteristic_id=char.id,
                            broker_id=broker.id,
                            topic=c_def["topic"],
                            metric_name=c_def.get("metric"),
                            trigger_tag=trigger_tag,
                            trigger_strategy="on_trigger" if trigger_tag else "on_change",
                            is_active=True,
                        )
                        session.add(source)
                        await session.flush()

                    # Nelson rules
                    for rule_id in c_def.get("rules", [1, 2]):
                        session.add(CharacteristicRule(
                            char_id=char.id,
                            rule_id=rule_id,
                            is_enabled=True,
                            require_acknowledgement=True,
                        ))

                    # Generate samples with inline Nelson rules checking
                    operators = OPERATORS[site_code]
                    prefix = BATCH_PREFIXES[site_code]
                    batch_counter = 0

                    # Set up violation detection if control limits are defined
                    nelson_checker = None
                    if c_def.get("ucl") is not None and c_def.get("lcl") is not None:
                        nelson_checker = InlineNelsonChecker(
                            cl=c_def["target"],
                            ucl=c_def["ucl"],
                            lcl=c_def["lcl"],
                            enabled_rules=c_def.get("rules", [1, 2]),
                        )

                    for s_idx in range(total_samples):
                        sample_time = start_date + timedelta(hours=s_idx * (24 / SAMPLES_PER_DAY))
                        # Batch changes daily
                        batch_day = s_idx // SAMPLES_PER_DAY
                        batch_num = f"{prefix}-{batch_day + 1:04d}"

                        sample = Sample(
                            char_id=char.id,
                            timestamp=sample_time,
                            batch_number=batch_num,
                            operator_id=operators[s_idx % len(operators)],
                            is_excluded=False,
                            actual_n=c_def["subgroup_size"],
                        )
                        session.add(sample)
                        await session.flush()
                        stats["samples"] += 1

                        # Measurements — collect values for mean calculation
                        measurement_values = []
                        for m_idx in range(c_def["subgroup_size"]):
                            val = generate_value(c_def, s_idx, total_samples, rng)
                            session.add(Measurement(sample_id=sample.id, value=val))
                            stats["measurements"] += 1
                            measurement_values.append(val)

                        # Check Nelson rules on the sample mean
                        if nelson_checker is not None:
                            sample_mean = sum(measurement_values) / len(measurement_values)
                            triggered_rules = nelson_checker.check(sample_mean)
                            for rule_id in triggered_rules:
                                severity = "CRITICAL" if rule_id == 1 else "WARNING"
                                session.add(Violation(
                                    sample_id=sample.id,
                                    rule_id=rule_id,
                                    rule_name=NELSON_RULE_NAMES.get(rule_id, f"Rule {rule_id}"),
                                    severity=severity,
                                    acknowledged=False,
                                    requires_acknowledgement=True,
                                ))
                                stats["violations"] += 1

                        # Flush in batches to avoid huge memory pressure
                        if s_idx % 200 == 0 and s_idx > 0:
                            await session.flush()

                    await session.flush()

                # Recurse into children
                for child_def in node_def.get("children", []):
                    await create_tree(child_def, node.id, depth + 1)

            h_def = site_def["hierarchy"]
            print(f"\n--- {site_code}: {site_def['name']} ---")
            await create_tree(h_def, None, 0)

        # ------------------------------------------------------------------
        # 5. Commit
        # ------------------------------------------------------------------
        print("\nCommitting to database...")
        await session.commit()

    await db_config.dispose()

    # ------------------------------------------------------------------
    # Summary
    # ------------------------------------------------------------------
    print("\n" + "=" * 60)
    print("  SEED COMPLETE")
    print("=" * 60)
    print(f"  Sites:           {stats['plants']}")
    print(f"  Users:           {stats['users']}")
    print(f"  Brokers:         {stats['brokers']}")
    print(f"  Hierarchy Nodes: {stats['nodes']}")
    print(f"  Characteristics: {stats['chars']}")
    print(f"  Samples:         {stats['samples']:,}")
    print(f"  Measurements:    {stats['measurements']:,}")
    print(f"  Violations:      {stats['violations']:,}")
    print(f"  DB File:         {backend_dir / 'openspc.db'}")
    print("=" * 60)
    print(f"\nAll users have password: 'password'")
    print(f"Admin user: admin / password")


def main() -> None:
    import argparse
    parser = argparse.ArgumentParser(description="Seed OpenSPC with pharma/life-sciences demo data")
    parser.add_argument("--keep", action="store_true", help="Keep existing schema, don't wipe")
    args = parser.parse_args()
    asyncio.run(seed(keep_existing=args.keep))


if __name__ == "__main__":
    main()
