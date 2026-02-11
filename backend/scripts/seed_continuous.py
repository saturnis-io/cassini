"""Continuous Process (Oil Refinery) seed script for OpenSPC.

Creates a Gulf Coast Refinery plant with 3 process units and 15 characteristics
demonstrating continuous-process SPC patterns:
  - All n=1 (I-MR charts) — continuous process, no batches
  - Strong autocorrelation (alpha=0.7-0.9)
  - Cyclic/seasonal patterns (day/night temperature swings)
  - Slow drift (catalyst degradation)
  - Process upsets (feed quality change, sudden spike + recovery)
  - 3-shift operators (Shift-A, Shift-B, Shift-C)

Run:
    python backend/scripts/seed_continuous.py
"""

import asyncio
import logging
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
)
from openspc.db.models.broker import MQTTBroker
from openspc.db.models.characteristic_config import CharacteristicConfig  # noqa: F401
from openspc.db.models.plant import Plant
from openspc.db.models.sample import Measurement, Sample
from openspc.db.models.user import User, UserPlantRole, UserRole
from openspc.db.models.violation import Violation
from openspc.db.models.api_key import APIKey  # noqa: F401

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

RANDOM_SEED = 42

USERS = [
    ("admin",     "admin@gulfcoast.local",     "admin"),
    ("shift_a_1", "shifta1@gulfcoast.local",   "operator"),
    ("shift_b_1", "shiftb1@gulfcoast.local",   "operator"),
    ("shift_c_1", "shiftc1@gulfcoast.local",   "operator"),
    ("p_engineer", "engineer@gulfcoast.local",  "engineer"),
]

# Shift operators rotate: 8-hour shifts (Shift-A: 06-14, Shift-B: 14-22, Shift-C: 22-06)
SHIFT_OPERATORS = ["Shift-A", "Shift-B", "Shift-C"]

HIERARCHY = {
    "name": "Gulf Coast Refinery",
    "type": "Site",
    "children": [
        {
            "name": "Crude Distillation Unit (CDU-1)",
            "type": "Unit",
            "children": [
                {
                    "name": "Atmospheric Column",
                    "type": "Equipment",
                    "characteristics": [
                        {
                            "name": "Column Top Temperature",
                            "description": "Atmospheric column overhead temperature (°C)",
                            "subgroup_size": 1,
                            "target": 120.0, "usl": 130.0, "lsl": 110.0,
                            "ucl": 125.0, "lcl": 115.0,
                            "rules": [1, 2, 3, 5, 6],
                            "samples": 600,
                            "interval_minutes": 15,
                            "data": {
                                "mean": 120.0, "std": 1.5,
                                "autocorrelation": 0.85,
                                "seasonal_amplitude": 1.2, "seasonal_period": 96,
                            },
                        },
                        {
                            "name": "Column Bottom Temperature",
                            "description": "Atmospheric column bottoms temperature (°C)",
                            "subgroup_size": 1,
                            "target": 350.0, "usl": 360.0, "lsl": 340.0,
                            "ucl": 355.0, "lcl": 345.0,
                            "rules": [1, 2, 3, 5, 6],
                            "samples": 600,
                            "interval_minutes": 15,
                            "data": {
                                "mean": 350.0, "std": 1.8,
                                "autocorrelation": 0.88,
                                "upset_at": 0.45, "upset_duration": 0.03, "upset_magnitude": 8.0,
                            },
                        },
                        {
                            "name": "Feed Flow Rate",
                            "description": "Crude oil feed flow rate (m³/h)",
                            "subgroup_size": 1,
                            "target": 450.0, "usl": 480.0, "lsl": 420.0,
                            "ucl": 470.0, "lcl": 430.0,
                            "rules": [1, 2, 3, 5, 6],
                            "samples": 600,
                            "interval_minutes": 15,
                            "data": {
                                "mean": 450.0, "std": 5.0,
                                "autocorrelation": 0.80,
                            },
                        },
                        {
                            "name": "Reflux Ratio",
                            "description": "Column reflux ratio (dimensionless)",
                            "subgroup_size": 1,
                            "target": 3.5, "usl": 4.2, "lsl": 2.8,
                            "ucl": 4.0, "lcl": 3.0,
                            "rules": [1, 2, 3, 5, 6],
                            "samples": 500,
                            "interval_minutes": 20,
                            "data": {
                                "mean": 3.5, "std": 0.12,
                                "autocorrelation": 0.75,
                            },
                        },
                        {
                            "name": "Column Pressure",
                            "description": "Atmospheric column operating pressure (kPa)",
                            "subgroup_size": 1,
                            "target": 105.0, "usl": 115.0, "lsl": 95.0,
                            "ucl": 110.0, "lcl": 100.0,
                            "rules": [1, 2, 3, 5, 6],
                            "samples": 600,
                            "interval_minutes": 15,
                            "data": {
                                "mean": 105.0, "std": 1.2,
                                "autocorrelation": 0.82,
                                "seasonal_amplitude": 0.6, "seasonal_period": 96,
                            },
                        },
                    ],
                },
            ],
        },
        {
            "name": "Fluid Catalytic Cracker (FCC-2)",
            "type": "Unit",
            "children": [
                {
                    "name": "Reactor / Regenerator",
                    "type": "Equipment",
                    "characteristics": [
                        {
                            "name": "Reactor Temperature",
                            "description": "FCC reactor riser outlet temperature (°C)",
                            "subgroup_size": 1,
                            "target": 525.0, "usl": 540.0, "lsl": 510.0,
                            "ucl": 535.0, "lcl": 515.0,
                            "rules": [1, 2, 3, 5, 6],
                            "samples": 500,
                            "interval_minutes": 20,
                            "data": {
                                "mean": 525.0, "std": 2.5,
                                "autocorrelation": 0.90,
                                "trend_start": 0.65, "trend_rate": 0.006,
                            },
                        },
                        {
                            "name": "Product Density",
                            "description": "FCC gasoline product density (kg/m³)",
                            "subgroup_size": 1,
                            "target": 735.0, "usl": 745.0, "lsl": 725.0,
                            "ucl": 741.0, "lcl": 729.0,
                            "rules": [1, 2, 3, 5, 6],
                            "samples": 400,
                            "interval_minutes": 30,
                            "data": {
                                "mean": 735.0, "std": 1.5,
                                "autocorrelation": 0.78,
                                "trend_start": 0.70, "trend_rate": 0.003,
                            },
                        },
                        {
                            "name": "Product Octane Number",
                            "description": "FCC gasoline RON (Research Octane Number)",
                            "subgroup_size": 1,
                            "target": 92.0, "usl": 95.0, "lsl": 89.0,
                            "ucl": 94.0, "lcl": 90.0,
                            "rules": [1, 2, 3, 5, 6],
                            "samples": 400,
                            "interval_minutes": 30,
                            "data": {
                                "mean": 92.0, "std": 0.5,
                                "autocorrelation": 0.75,
                                "trend_start": 0.60, "trend_rate": -0.002,
                            },
                        },
                        {
                            "name": "Viscosity",
                            "description": "Feed slurry viscosity (cP)",
                            "subgroup_size": 1,
                            "target": 12.0, "usl": 16.0, "lsl": 8.0,
                            "ucl": 14.5, "lcl": 9.5,
                            "rules": [1, 2, 3, 5, 6],
                            "samples": 400,
                            "interval_minutes": 30,
                            "data": {
                                "mean": 12.0, "std": 0.6,
                                "autocorrelation": 0.72,
                                "upset_at": 0.30, "upset_duration": 0.04, "upset_magnitude": 3.5,
                            },
                        },
                    ],
                },
            ],
        },
        {
            "name": "Hydrogen Treating Unit (HTU-3)",
            "type": "Unit",
            "children": [
                {
                    "name": "Hydrotreater",
                    "type": "Equipment",
                    "characteristics": [
                        {
                            "name": "Sulfur Content",
                            "description": "Product sulfur content (ppm)",
                            "subgroup_size": 1,
                            "target": 15.0, "usl": 25.0, "lsl": 5.0,
                            "ucl": 22.0, "lcl": 8.0,
                            "rules": [1, 2, 3, 5, 6],
                            "samples": 400,
                            "interval_minutes": 30,
                            "data": {
                                "mean": 15.0, "std": 1.8,
                                "autocorrelation": 0.80,
                                "trend_start": 0.50, "trend_rate": 0.005,
                            },
                        },
                        {
                            "name": "Hydrogen Purity",
                            "description": "Hydrogen recycle gas purity (%)",
                            "subgroup_size": 1,
                            "target": 95.0, "usl": 99.0, "lsl": 91.0,
                            "ucl": 97.5, "lcl": 92.5,
                            "rules": [1, 2, 3, 5, 6],
                            "samples": 400,
                            "interval_minutes": 30,
                            "data": {
                                "mean": 95.0, "std": 0.6,
                                "autocorrelation": 0.83,
                            },
                        },
                        {
                            "name": "pH",
                            "description": "Sour water stripper pH",
                            "subgroup_size": 1,
                            "target": 7.0, "usl": 8.5, "lsl": 5.5,
                            "ucl": 8.0, "lcl": 6.0,
                            "rules": [1, 2, 3, 5, 6],
                            "samples": 500,
                            "interval_minutes": 20,
                            "data": {
                                "mean": 7.0, "std": 0.25,
                                "autocorrelation": 0.77,
                                "upset_at": 0.70, "upset_duration": 0.05, "upset_magnitude": -1.2,
                            },
                        },
                        {
                            "name": "Dissolved O2",
                            "description": "Boiler feedwater dissolved oxygen (ppm)",
                            "subgroup_size": 1,
                            "target": 0.007, "usl": 0.020, "lsl": 0.001,
                            "ucl": 0.015, "lcl": 0.002,
                            "rules": [1, 2, 3, 5, 6],
                            "samples": 500,
                            "interval_minutes": 20,
                            "data": {
                                "mean": 0.007, "std": 0.0015,
                                "autocorrelation": 0.70,
                            },
                        },
                    ],
                },
                {
                    "name": "Utilities",
                    "type": "Equipment",
                    "characteristics": [
                        {
                            "name": "Cooling Water Temperature",
                            "description": "Cooling tower return water temperature (°C)",
                            "subgroup_size": 1,
                            "target": 30.0, "usl": 36.0, "lsl": 24.0,
                            "ucl": 34.0, "lcl": 26.0,
                            "rules": [1, 2, 3, 5, 6],
                            "samples": 600,
                            "interval_minutes": 15,
                            "data": {
                                "mean": 30.0, "std": 1.0,
                                "autocorrelation": 0.85,
                                "seasonal_amplitude": 2.5, "seasonal_period": 96,
                            },
                        },
                        {
                            "name": "Steam Pressure",
                            "description": "High-pressure steam header pressure (kPa)",
                            "subgroup_size": 1,
                            "target": 4200.0, "usl": 4500.0, "lsl": 3900.0,
                            "ucl": 4400.0, "lcl": 4000.0,
                            "rules": [1, 2, 3, 5, 6],
                            "samples": 600,
                            "interval_minutes": 15,
                            "data": {
                                "mean": 4200.0, "std": 40.0,
                                "autocorrelation": 0.87,
                                "upset_at": 0.55, "upset_duration": 0.02, "upset_magnitude": -250.0,
                            },
                        },
                    ],
                },
            ],
        },
    ],
}

# ---------------------------------------------------------------------------
# Data generation
# ---------------------------------------------------------------------------

# Persistent state for autocorrelation across calls (keyed by characteristic name)
_prev_values: dict[str, float] = {}


def generate_value(cfg: dict, sample_index: int, total_samples: int, rng: random.Random) -> float:
    """Generate a single measurement with realistic continuous-process behavior.

    Extended from chart showcase to support:
    - autocorrelation: next value = alpha * prev + (1-alpha) * gauss(mean, std)
    - upset_at / upset_duration / upset_magnitude: temporary process upset
    """
    d = cfg["data"]
    mean = d["mean"]
    std = d["std"]
    frac = sample_index / max(total_samples - 1, 1)

    # Mean shift
    if "shift_start" in d and frac >= d["shift_start"]:
        mean += d["shift_delta"]

    # Zone bias (sustained offset, like Rule 2 trigger)
    if "bias_start" in d and frac >= d["bias_start"]:
        mean += d["bias_delta"]

    # Trend (slow drift — e.g., catalyst degradation)
    if "trend_start" in d and frac >= d["trend_start"]:
        progress = (frac - d["trend_start"]) / max(1.0 - d["trend_start"], 0.001)
        mean += d["trend_rate"] * total_samples * progress

    # Seasonal oscillation (e.g., day/night temperature swings)
    if "seasonal_amplitude" in d:
        period = d.get("seasonal_period", 24)
        mean += d["seasonal_amplitude"] * math.sin(2 * math.pi * sample_index / period)

    # Process upset: sudden spike that lasts for upset_duration fraction, then recovers
    upset_offset = 0.0
    if "upset_at" in d:
        upset_start = d["upset_at"]
        upset_end = upset_start + d.get("upset_duration", 0.03)
        if upset_start <= frac < upset_end:
            # Ramp up quickly, ramp down slowly within the upset window
            upset_progress = (frac - upset_start) / max(upset_end - upset_start, 0.0001)
            # Bell-shaped upset: peaks in middle of window
            envelope = math.sin(math.pi * upset_progress)
            upset_offset = d.get("upset_magnitude", 0.0) * envelope

    # Single outlier spike
    if "outlier_at" in d and abs(frac - d["outlier_at"]) < (1.0 / total_samples):
        return round(d["outlier_value"], 4)

    # Generate raw random value with autocorrelation
    char_name = cfg["name"]
    alpha = d.get("autocorrelation", 0.0)

    if alpha > 0.0 and char_name in _prev_values:
        # Autocorrelated: new = alpha * prev + (1-alpha) * gauss(mean, std)
        innovation = rng.gauss(mean, std)
        value = alpha * _prev_values[char_name] + (1.0 - alpha) * innovation
    else:
        value = rng.gauss(mean, std)

    # Apply upset offset after autocorrelation
    value += upset_offset

    # Clamp to realistic bounds
    if cfg.get("lsl") is not None:
        value = max(value, cfg["lsl"] - 3 * std)
    if cfg.get("usl") is not None:
        value = min(value, cfg["usl"] + 3 * std)

    # Store for next autocorrelation step
    _prev_values[char_name] = value

    return round(value, 4)


def get_shift_operator(timestamp: datetime) -> str:
    """Return the shift operator based on time of day (8-hour shifts)."""
    hour = timestamp.hour
    if 6 <= hour < 14:
        return "Shift-A"
    elif 14 <= hour < 22:
        return "Shift-B"
    else:
        return "Shift-C"


# ---------------------------------------------------------------------------
# Inline Nelson checker (reused from pharma seed)
# ---------------------------------------------------------------------------

NELSON_RULE_NAMES = {
    1: "Beyond 3\u03c3",
    2: "9 points same side",
    3: "6 points trending",
    4: "14 points alternating",
    5: "2 of 3 in Zone A",
    6: "4 of 5 in Zone B+",
    7: "15 points in Zone C",
    8: "8 points outside Zone C",
}


class InlineNelsonChecker:
    """Lightweight Nelson rules evaluator for seed-time violation detection."""

    def __init__(self, cl: float, ucl: float, lcl: float, enabled_rules: list[int]):
        self.cl = cl
        self.ucl = ucl
        self.lcl = lcl
        self.sigma = (ucl - cl) / 3.0
        self.enabled_rules = set(enabled_rules)
        self.means: list[float] = []

    def _zone(self, value: float) -> str:
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
            if n < 1:
                return False
            z = self._zone(vals[-1])
            return z in ("BEYOND_UCL", "BEYOND_LCL")

        elif rule_id == 2:
            if n < 9:
                return False
            last9 = vals[-9:]
            return all(v > self.cl for v in last9) or all(v < self.cl for v in last9)

        elif rule_id == 3:
            if n < 6:
                return False
            last6 = vals[-6:]
            increasing = all(last6[i] < last6[i + 1] for i in range(5))
            decreasing = all(last6[i] > last6[i + 1] for i in range(5))
            return increasing or decreasing

        elif rule_id == 4:
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
            if n < 3:
                return False
            last3 = vals[-3:]
            zones = [self._zone(v) for v in last3]
            upper_a = sum(1 for z in zones if z in ("ZONE_A_UPPER", "BEYOND_UCL"))
            lower_a = sum(1 for z in zones if z in ("ZONE_A_LOWER", "BEYOND_LCL"))
            return upper_a >= 2 or lower_a >= 2

        elif rule_id == 6:
            if n < 5:
                return False
            last5 = vals[-5:]
            zones = [self._zone(v) for v in last5]
            upper_b = sum(1 for z in zones if z in ("ZONE_B_UPPER", "ZONE_A_UPPER", "BEYOND_UCL"))
            lower_b = sum(1 for z in zones if z in ("ZONE_B_LOWER", "ZONE_A_LOWER", "BEYOND_LCL"))
            return upper_b >= 4 or lower_b >= 4

        elif rule_id == 7:
            if n < 15:
                return False
            last15 = vals[-15:]
            return all(self._zone(v).startswith("ZONE_C") for v in last15)

        elif rule_id == 8:
            if n < 8:
                return False
            last8 = vals[-8:]
            return all(not self._zone(v).startswith("ZONE_C") for v in last8)

        return False


# ---------------------------------------------------------------------------
# Main seed logic
# ---------------------------------------------------------------------------


async def seed() -> None:
    db_path = backend_dir / "openspc.db"
    db_config = DatabaseConfig(
        database_url=f"sqlite+aiosqlite:///{db_path}",
        echo=False,
    )

    print("Dropping all tables...")
    await db_config.drop_tables()
    print("Creating fresh schema...")
    await db_config.create_tables()

    rng = random.Random(RANDOM_SEED)
    now = datetime.now(timezone.utc)

    # Clear autocorrelation state
    _prev_values.clear()

    stats = {"nodes": 0, "chars": 0, "samples": 0, "measurements": 0, "users": 0, "violations": 0}

    async with db_config.session() as session:
        # 1. Plant
        plant = Plant(name="Gulf Coast Refinery", code="GCR", is_active=True)
        session.add(plant)
        await session.flush()
        print(f"  Plant: {plant.name} [{plant.code}] (ID {plant.id})")

        # 2. Users
        print("\nCreating users...")
        hashed_pw = hash_password("password")
        for username, email, role_name in USERS:
            user = User(username=username, email=email, hashed_password=hashed_pw, is_active=True)
            session.add(user)
            await session.flush()
            upr = UserPlantRole(user_id=user.id, plant_id=plant.id, role=UserRole(role_name))
            session.add(upr)
            stats["users"] += 1
            print(f"  User: {username} ({role_name})")

        # 3. Hierarchy + Characteristics + Samples
        print("\nCreating hierarchy, characteristics, and samples...")

        async def create_tree(node_def: dict, parent_id: int | None, depth: int = 0):
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

            for c_def in node_def.get("characteristics", []):
                nominal_n = c_def["subgroup_size"]
                variable_n = c_def.get("variable_n", False)
                total_samples = c_def.get("samples", 80)
                interval_min = c_def.get("interval_minutes", 15)

                char = Characteristic(
                    hierarchy_id=node.id,
                    name=c_def["name"],
                    description=c_def.get("description"),
                    subgroup_size=nominal_n,
                    target_value=c_def.get("target"),
                    usl=c_def.get("usl"),
                    lsl=c_def.get("lsl"),
                    ucl=c_def.get("ucl"),
                    lcl=c_def.get("lcl"),
                )
                session.add(char)
                await session.flush()
                stats["chars"] += 1
                chart_hint = "X\u0304-R (variable n)" if variable_n else (
                    "I-MR" if nominal_n == 1 else f"X\u0304-S (n={nominal_n})"
                )
                print(f"{indent}  * {c_def['name']} (n={nominal_n}, {chart_hint}, {total_samples} samples, {interval_min}min)")

                # Nelson rules
                for rule_id in c_def.get("rules", [1, 2]):
                    session.add(CharacteristicRule(
                        char_id=char.id,
                        rule_id=rule_id,
                        is_enabled=True,
                        require_acknowledgement=True,
                    ))

                # Nelson checker
                nelson_checker = None
                if c_def.get("ucl") is not None and c_def.get("lcl") is not None:
                    nelson_checker = InlineNelsonChecker(
                        cl=c_def["target"],
                        ucl=c_def["ucl"],
                        lcl=c_def["lcl"],
                        enabled_rules=c_def.get("rules", [1, 2]),
                    )

                # Generate samples — continuous process, no batch numbers
                start_date = now - timedelta(minutes=total_samples * interval_min)

                for s_idx in range(total_samples):
                    sample_time = start_date + timedelta(minutes=s_idx * interval_min)

                    # Determine actual subgroup size
                    if variable_n:
                        if s_idx % 7 == 0 and s_idx > 0:
                            actual_n = 4
                        elif s_idx % 4 == 0 and s_idx > 0:
                            actual_n = 3
                        else:
                            actual_n = nominal_n
                    else:
                        actual_n = nominal_n

                    is_undersized = actual_n < nominal_n

                    # Shift-based operator assignment
                    operator = get_shift_operator(sample_time)

                    sample = Sample(
                        char_id=char.id,
                        timestamp=sample_time,
                        batch_number=None,
                        operator_id=operator,
                        is_excluded=False,
                        actual_n=actual_n,
                    )
                    session.add(sample)
                    await session.flush()
                    stats["samples"] += 1

                    # Measurements
                    measurement_values = []
                    for m_idx in range(actual_n):
                        val = generate_value(c_def, s_idx, total_samples, rng)
                        session.add(Measurement(sample_id=sample.id, value=val))
                        stats["measurements"] += 1
                        measurement_values.append(val)

                    # Nelson rules check
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

                    if s_idx % 50 == 0 and s_idx > 0:
                        await session.flush()

                await session.flush()

            for child_def in node_def.get("children", []):
                await create_tree(child_def, node.id, depth + 1)

        await create_tree(HIERARCHY, None, 0)

        print("\nCommitting to database...")
        await session.commit()

    await db_config.dispose()

    print("\n" + "=" * 60)
    print("  CONTINUOUS PROCESS (REFINERY) SEED COMPLETE")
    print("=" * 60)
    print(f"  Hierarchy Nodes: {stats['nodes']}")
    print(f"  Users:           {stats['users']}")
    print(f"  Characteristics: {stats['chars']}")
    print(f"  Samples:         {stats['samples']:,}")
    print(f"  Measurements:    {stats['measurements']:,}")
    print(f"  Violations:      {stats['violations']:,}")
    print(f"  DB File:         {db_path}")
    print("=" * 60)
    print("\nAll users have password: 'password'")
    print("Admin:    admin / password")
    print("Shift-A:  shift_a_1 / password")
    print("Shift-B:  shift_b_1 / password")
    print("Shift-C:  shift_c_1 / password")
    print("Engineer: p_engineer / password")


def main() -> None:
    asyncio.run(seed())


if __name__ == "__main__":
    main()
