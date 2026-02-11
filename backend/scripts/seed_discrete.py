"""Discrete Manufacturing seed script for OpenSPC.

Creates an automotive parts manufacturing plant with 3 production lines
and 10 characteristics demonstrating realistic process behaviors:
  - Engine Block Line: Bore Diameter (n=5), Surface Roughness (n=5), Rockwell Hardness (n=1)
  - Transmission Shaft Line: Shaft OD (n=5, variable), Overall Length (n=5), Torque Spec (n=1)
  - Brake Rotor Line: Rotor Thickness (n=3, variable), Runout (n=1)
  - Fastener Line: Thread Pitch (n=5), Part Weight (n=1)

Data patterns include stable processes, tool-wear drift, material lot shift,
high variability (loose fixture), and thermal seasonal effects.

Run:
    python backend/scripts/seed_discrete.py
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
    ("admin",      "admin@autoparts.local",      "admin"),
    ("operator",   "operator@autoparts.local",   "operator"),
    ("supervisor", "supervisor@autoparts.local", "supervisor"),
]

OPERATORS = ["J.Martinez", "K.Chen", "R.Okafor"]

HIERARCHY = {
    "name": "AutoParts Midwest Facility",
    "type": "Site",
    "children": [
        {
            "name": "Powertrain Area",
            "type": "Area",
            "children": [
                {
                    "name": "Engine Block Line",
                    "type": "Line",
                    "children": [
                        {
                            "name": "CNC Boring Cell",
                            "type": "Cell",
                            "characteristics": [
                                {
                                    # Bore Diameter: n=5, X-bar R, stable with late mean shift (material lot change)
                                    "name": "Bore Diameter",
                                    "description": "Cylinder bore inner diameter (mm)",
                                    "subgroup_size": 5,
                                    "target": 82.000, "usl": 82.050, "lsl": 81.950,
                                    "ucl": 82.030, "lcl": 81.970,
                                    "rules": [1, 2, 3, 5, 6],
                                    "samples": 400,
                                    "data": {
                                        "mean": 82.000, "std": 0.008,
                                        "shift_start": 0.75, "shift_delta": 0.022,
                                    },
                                },
                                {
                                    # Surface Roughness: n=5, X-bar R, gradual drift (tool wear)
                                    "name": "Surface Roughness Ra",
                                    "description": "Bore surface roughness Ra (μm)",
                                    "subgroup_size": 5,
                                    "target": 0.800, "usl": 1.200, "lsl": 0.400,
                                    "ucl": 0.960, "lcl": 0.640,
                                    "rules": [1, 2, 3, 5, 6],
                                    "samples": 400,
                                    "data": {
                                        "mean": 0.790, "std": 0.030,
                                        "trend_start": 0.50, "trend_rate": 0.0008,
                                    },
                                },
                            ],
                        },
                        {
                            "name": "Heat Treat Cell",
                            "type": "Cell",
                            "characteristics": [
                                {
                                    # Rockwell Hardness: n=1, I-MR, stable process
                                    "name": "Rockwell Hardness",
                                    "description": "Surface hardness after heat treatment (HRC)",
                                    "subgroup_size": 1,
                                    "target": 58.0, "usl": 62.0, "lsl": 54.0,
                                    "ucl": 60.5, "lcl": 55.5,
                                    "rules": [1, 2, 3, 5, 6],
                                    "samples": 350,
                                    "data": {
                                        "mean": 58.0, "std": 0.7,
                                    },
                                },
                            ],
                        },
                    ],
                },
                {
                    "name": "Transmission Shaft Line",
                    "type": "Line",
                    "children": [
                        {
                            "name": "CNC Turning Cell",
                            "type": "Cell",
                            "characteristics": [
                                {
                                    # Shaft OD: n=5, variable (3-5), X-bar R, stable
                                    "name": "Shaft OD",
                                    "description": "Output shaft outer diameter (mm)",
                                    "subgroup_size": 5,
                                    "variable_n": True,
                                    "target": 25.000, "usl": 25.040, "lsl": 24.960,
                                    "ucl": 25.025, "lcl": 24.975,
                                    "rules": [1, 2, 3, 4, 5, 6],
                                    "samples": 450,
                                    "data": {
                                        "mean": 25.001, "std": 0.006,
                                    },
                                },
                                {
                                    # Overall Length: n=5, X-bar R, seasonal pattern (thermal expansion)
                                    "name": "Overall Length",
                                    "description": "Shaft overall length (mm)",
                                    "subgroup_size": 5,
                                    "target": 310.00, "usl": 310.15, "lsl": 309.85,
                                    "ucl": 310.10, "lcl": 309.90,
                                    "rules": [1, 2, 3, 5, 6],
                                    "samples": 400,
                                    "data": {
                                        "mean": 310.00, "std": 0.018,
                                        "seasonal_amplitude": 0.035, "seasonal_period": 30,
                                    },
                                },
                            ],
                        },
                        {
                            "name": "Assembly & Test Cell",
                            "type": "Cell",
                            "characteristics": [
                                {
                                    # Torque Spec: n=1, I-MR, high variability (loose fixture)
                                    "name": "Torque Spec",
                                    "description": "Assembly tightening torque (Nm)",
                                    "subgroup_size": 1,
                                    "target": 85.0, "usl": 95.0, "lsl": 75.0,
                                    "ucl": 91.0, "lcl": 79.0,
                                    "rules": [1, 2, 3, 5, 6],
                                    "samples": 500,
                                    "data": {
                                        "mean": 85.0, "std": 2.8,
                                    },
                                },
                            ],
                        },
                    ],
                },
            ],
        },
        {
            "name": "Chassis Area",
            "type": "Area",
            "children": [
                {
                    "name": "Brake Rotor Line",
                    "type": "Line",
                    "children": [
                        {
                            "name": "Machining Cell",
                            "type": "Cell",
                            "characteristics": [
                                {
                                    # Rotor Thickness: n=3, variable (2-3), gradual drift (tool wear)
                                    "name": "Rotor Thickness",
                                    "description": "Brake rotor disc thickness (mm)",
                                    "subgroup_size": 3,
                                    "variable_n": True,
                                    "target": 28.000, "usl": 28.100, "lsl": 27.900,
                                    "ucl": 28.060, "lcl": 27.940,
                                    "rules": [1, 2, 3, 5, 6],
                                    "samples": 400,
                                    "data": {
                                        "mean": 27.995, "std": 0.010,
                                        "trend_start": 0.60, "trend_rate": 0.0005,
                                    },
                                },
                                {
                                    # Runout: n=1, I-MR, stable
                                    "name": "Runout",
                                    "description": "Lateral runout measured at outer edge (μm)",
                                    "subgroup_size": 1,
                                    "target": 15.0, "usl": 30.0, "lsl": 0.0,
                                    "ucl": 25.0, "lcl": 5.0,
                                    "rules": [1, 2, 3, 5, 6],
                                    "samples": 350,
                                    "data": {
                                        "mean": 15.0, "std": 2.5,
                                    },
                                },
                            ],
                        },
                    ],
                },
                {
                    "name": "Fastener Line",
                    "type": "Line",
                    "children": [
                        {
                            "name": "Thread Rolling Cell",
                            "type": "Cell",
                            "characteristics": [
                                {
                                    # Thread Pitch: n=5, X-bar R, stable
                                    "name": "Thread Pitch",
                                    "description": "M10x1.5 thread pitch distance (mm)",
                                    "subgroup_size": 5,
                                    "target": 1.5000, "usl": 1.5060, "lsl": 1.4940,
                                    "ucl": 1.5040, "lcl": 1.4960,
                                    "rules": [1, 2, 3, 5, 6],
                                    "samples": 400,
                                    "data": {
                                        "mean": 1.5000, "std": 0.0008,
                                    },
                                },
                            ],
                        },
                        {
                            "name": "Weighing & Inspection Cell",
                            "type": "Cell",
                            "characteristics": [
                                {
                                    # Part Weight: n=1, I-MR, stable with mild bias
                                    "name": "Part Weight",
                                    "description": "Individual fastener weight (g)",
                                    "subgroup_size": 1,
                                    "target": 48.50, "usl": 49.50, "lsl": 47.50,
                                    "ucl": 49.10, "lcl": 47.90,
                                    "rules": [1, 2, 3, 5, 6],
                                    "samples": 350,
                                    "data": {
                                        "mean": 48.55, "std": 0.15,
                                    },
                                },
                            ],
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


def generate_value(cfg: dict, sample_index: int, total_samples: int, rng: random.Random) -> float:
    """Generate a single measurement with realistic process behavior."""
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

    # Trend
    if "trend_start" in d and frac >= d["trend_start"]:
        progress = (frac - d["trend_start"]) / max(1.0 - d["trend_start"], 0.001)
        mean += d["trend_rate"] * total_samples * progress

    # Seasonal oscillation
    if "seasonal_amplitude" in d:
        period = d.get("seasonal_period", 24)
        mean += d["seasonal_amplitude"] * math.sin(2 * math.pi * sample_index / period)

    # Single outlier spike
    if "outlier_at" in d and abs(frac - d["outlier_at"]) < (1.0 / total_samples):
        return round(d["outlier_value"], 4)

    value = rng.gauss(mean, std)

    if cfg.get("lsl") is not None:
        value = max(value, cfg["lsl"] - 3 * std)
    if cfg.get("usl") is not None:
        value = min(value, cfg["usl"] + 3 * std)

    return round(value, 4)


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

    stats = {"nodes": 0, "chars": 0, "samples": 0, "measurements": 0, "users": 0, "violations": 0}

    async with db_config.session() as session:
        # 1. Plant
        plant = Plant(name="AutoParts Midwest", code="APM", is_active=True)
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
                chart_hint = "X-bar R (variable n)" if variable_n else (
                    "I-MR" if nominal_n == 1 else f"X-bar R (n={nominal_n})"
                )
                print(f"{indent}  * {c_def['name']} (n={nominal_n}, {chart_hint}, {total_samples} samples)")

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

                # Generate samples
                start_date = now - timedelta(hours=total_samples * 2)  # ~2-hour intervals

                for s_idx in range(total_samples):
                    sample_time = start_date + timedelta(hours=s_idx * 2)

                    # Determine actual subgroup size
                    if variable_n:
                        if s_idx % 7 == 0 and s_idx > 0:
                            actual_n = nominal_n - 1
                        elif s_idx % 11 == 0 and s_idx > 0:
                            actual_n = max(nominal_n - 2, 1)
                        else:
                            actual_n = nominal_n
                    else:
                        actual_n = nominal_n

                    is_undersized = actual_n < nominal_n

                    # Cycle through operators
                    operator_name = OPERATORS[s_idx % len(OPERATORS)]

                    # Shift-based batch numbers: A=day(0-7h), B=swing(8-15h), C=night(16-23h)
                    hour_of_day = sample_time.hour
                    if hour_of_day < 8:
                        shift_letter = "A"
                    elif hour_of_day < 16:
                        shift_letter = "B"
                    else:
                        shift_letter = "C"

                    sample = Sample(
                        char_id=char.id,
                        timestamp=sample_time,
                        batch_number=f"SHIFT-{shift_letter}-{s_idx + 1:04d}",
                        operator_id=operator_name,
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
    print("  DISCRETE MANUFACTURING SEED COMPLETE")
    print("=" * 60)
    print(f"  Plant:           AutoParts Midwest [APM]")
    print(f"  Hierarchy Nodes: {stats['nodes']}")
    print(f"  Users:           {stats['users']}")
    print(f"  Characteristics: {stats['chars']}")
    print(f"  Samples:         {stats['samples']:,}")
    print(f"  Measurements:    {stats['measurements']:,}")
    print(f"  Violations:      {stats['violations']:,}")
    print(f"  DB File:         {db_path}")
    print("=" * 60)
    print("\nAll users have password: 'password'")
    print("Admin:      admin / password")
    print("Operator:   operator / password")
    print("Supervisor: supervisor / password")


def main() -> None:
    asyncio.run(seed())


if __name__ == "__main__":
    main()
