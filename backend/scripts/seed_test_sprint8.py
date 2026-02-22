"""Sprint 8: Enterprise Integration seed script for OpenSPC.

Creates 3 plants scaffolding ERP/LIMS/mobile integration scenarios:
  - D1: ERP Integration    (6 chars, ~360 samples, ~1800 measurements)
  - D2: LIMS Lab Data      (5 chars, ~400 samples)
  - D3: Mobile Entry        (4 chars, ~120 samples, ~180 measurements)

Estimated total: ~880 samples

Run:
    python backend/scripts/seed_test_sprint8.py
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

from openspc.core.auth.passwords import hash_password
from openspc.db import (
    Characteristic,
    CharacteristicRule,
    DatabaseConfig,
    Hierarchy,
    Measurement,
    Sample,
    Violation,
)
from openspc.db.models.api_key import APIKey  # noqa: F401
from openspc.db.models.broker import MQTTBroker  # noqa: F401
from openspc.db.models.characteristic_config import CharacteristicConfig  # noqa: F401
from openspc.db.models.plant import Plant
from openspc.db.models.user import User, UserPlantRole, UserRole

logger = logging.getLogger(__name__)
RANDOM_SEED = 42

USERS = [
    ("admin",    "admin@openspc.local",    "admin"),
    ("operator", "operator@openspc.local", "operator"),
]

# ---------------------------------------------------------------------------
# Plant definitions
# ---------------------------------------------------------------------------

PLANTS = [
    {
        "name": "D1: ERP Integration",
        "code": "ERP",
        "hierarchy": {
            "name": "SAP Production",
            "type": "Area",
            "children": [
                {
                    "name": "Assembly Line 1",
                    "type": "Line",
                    "children": [
                        {
                            "name": "Station A",
                            "type": "Cell",
                            "characteristics": [
                                {
                                    "name": "PN-4521-A Shaft OD",
                                    "description": "Shaft outer diameter (mm)",
                                    "subgroup_size": 5,
                                    "target": 25.000, "usl": 25.050, "lsl": 24.950,
                                    "ucl": 25.030, "lcl": 24.970,
                                    "rules": [1, 2, 3],
                                    "samples": 60,
                                    "data": {"mean": 25.000, "std": 0.008},
                                    "batch_style": "erp",
                                },
                                {
                                    "name": "PN-4521-A Shaft Length",
                                    "description": "Shaft overall length (mm)",
                                    "subgroup_size": 5,
                                    "target": 150.000, "usl": 150.200, "lsl": 149.800,
                                    "ucl": 150.120, "lcl": 149.880,
                                    "rules": [1, 2, 3],
                                    "samples": 60,
                                    "data": {"mean": 150.000, "std": 0.030},
                                    "batch_style": "erp",
                                },
                            ],
                        },
                        {
                            "name": "Station B",
                            "type": "Cell",
                            "characteristics": [
                                {
                                    "name": "PN-8903-B Housing Bore",
                                    "description": "Housing bore diameter (mm)",
                                    "subgroup_size": 5,
                                    "target": 50.000, "usl": 50.025, "lsl": 49.975,
                                    "ucl": 50.015, "lcl": 49.985,
                                    "rules": [1, 2, 3],
                                    "samples": 60,
                                    "data": {"mean": 50.000, "std": 0.005},
                                    "batch_style": "erp",
                                },
                                {
                                    "name": "PN-8903-B Housing Depth",
                                    "description": "Housing bore depth (mm)",
                                    "subgroup_size": 5,
                                    "target": 30.000, "usl": 30.100, "lsl": 29.900,
                                    "ucl": 30.060, "lcl": 29.940,
                                    "rules": [1, 2, 3],
                                    "samples": 60,
                                    "data": {"mean": 30.000, "std": 0.015},
                                    "batch_style": "erp",
                                },
                            ],
                        },
                    ],
                },
                {
                    "name": "Assembly Line 2",
                    "type": "Line",
                    "children": [
                        {
                            "name": "Station C",
                            "type": "Cell",
                            "characteristics": [
                                {
                                    "name": "PN-2210-C Gear Tooth Width",
                                    "description": "Gear tooth width (mm)",
                                    "subgroup_size": 5,
                                    "target": 3.200, "usl": 3.250, "lsl": 3.150,
                                    "ucl": 3.230, "lcl": 3.170,
                                    "rules": [1, 2, 3],
                                    "samples": 60,
                                    "data": {"mean": 3.200, "std": 0.012},
                                    "batch_style": "erp",
                                },
                                {
                                    "name": "PN-2210-C Gear Runout",
                                    "description": "Gear runout TIR (mm)",
                                    "subgroup_size": 5,
                                    "target": 0.010, "usl": 0.025, "lsl": 0.000,
                                    "ucl": 0.019, "lcl": 0.001,
                                    "rules": [1, 2, 3],
                                    "samples": 60,
                                    "data": {"mean": 0.010, "std": 0.003},
                                    "batch_style": "erp",
                                },
                            ],
                        },
                    ],
                },
            ],
        },
    },
    {
        "name": "D2: LIMS Lab Data",
        "code": "LIMS",
        "hierarchy": {
            "name": "Quality Lab",
            "type": "Area",
            "children": [
                {
                    "name": "Wet Chemistry",
                    "type": "Cell",
                    "characteristics": [
                        {
                            "name": "pH Analysis",
                            "description": "pH measurement of aqueous sample",
                            "subgroup_size": 1,
                            "target": 7.00, "usl": 7.50, "lsl": 6.50,
                            "ucl": 7.30, "lcl": 6.70,
                            "rules": [1, 2],
                            "samples": 80,
                            "data": {"mean": 7.00, "std": 0.08},
                            "batch_style": "lims",
                        },
                        {
                            "name": "Moisture Content (%)",
                            "description": "Moisture content by Karl Fischer titration",
                            "subgroup_size": 1,
                            "target": 2.50, "usl": 3.50, "lsl": 1.50,
                            "ucl": 3.10, "lcl": 1.90,
                            "rules": [1, 2],
                            "samples": 80,
                            "data": {"mean": 2.50, "std": 0.20},
                            "batch_style": "lims",
                        },
                    ],
                },
                {
                    "name": "Spectroscopy",
                    "type": "Cell",
                    "characteristics": [
                        {
                            "name": "Absorbance (420nm)",
                            "description": "UV-Vis absorbance at 420 nm",
                            "subgroup_size": 1,
                            "target": 0.850, "usl": 1.000, "lsl": 0.700,
                            "ucl": 0.950, "lcl": 0.750,
                            "rules": [1, 2],
                            "samples": 80,
                            "data": {"mean": 0.850, "std": 0.030},
                            "batch_style": "lims",
                        },
                    ],
                },
                {
                    "name": "Microbiology",
                    "type": "Cell",
                    "characteristics": [
                        {
                            "name": "Total Plate Count (CFU/mL)",
                            "description": "Aerobic plate count per mL",
                            "subgroup_size": 1,
                            "target": 50.0, "usl": 100.0, "lsl": 0.0,
                            "ucl": 80.0, "lcl": 20.0,
                            "rules": [1, 2],
                            "samples": 80,
                            "data": {"mean": 50.0, "std": 10.0},
                            "batch_style": "lims",
                        },
                        {
                            "name": "Endotoxin (EU/mL)",
                            "description": "Endotoxin level by LAL assay",
                            "subgroup_size": 1,
                            "target": 0.100, "usl": 0.250, "lsl": 0.000,
                            "ucl": 0.200, "lcl": 0.000,
                            "rules": [1, 2],
                            "samples": 80,
                            "data": {"mean": 0.100, "std": 0.030},
                            "batch_style": "lims",
                        },
                    ],
                },
            ],
        },
    },
    {
        "name": "D3: Mobile Entry",
        "code": "MOB",
        "hierarchy": {
            "name": "Field Operations",
            "type": "Area",
            "children": [
                {
                    "name": "Receiving Inspection",
                    "type": "Cell",
                    "characteristics": [
                        {
                            "name": "Incoming Material Thickness",
                            "description": "Incoming material sheet thickness (mm)",
                            "subgroup_size": 1,
                            "target": 2.000, "usl": 2.100, "lsl": 1.900,
                            "ucl": 2.060, "lcl": 1.940,
                            "rules": [1, 2],
                            "samples": 30,
                            "data": {"mean": 2.000, "std": 0.015},
                            "batch_style": "mobile",
                        },
                        {
                            "name": "Incoming Hardness (HRC)",
                            "description": "Rockwell hardness C scale",
                            "subgroup_size": 1,
                            "target": 58.0, "usl": 62.0, "lsl": 54.0,
                            "ucl": 60.5, "lcl": 55.5,
                            "rules": [1, 2],
                            "samples": 30,
                            "data": {"mean": 58.0, "std": 1.0},
                            "batch_style": "mobile",
                        },
                    ],
                },
                {
                    "name": "In-Process Check",
                    "type": "Cell",
                    "characteristics": [
                        {
                            "name": "Weld Bead Width",
                            "description": "Weld bead width measurement (mm)",
                            "subgroup_size": 3,
                            "target": 5.00, "usl": 6.00, "lsl": 4.00,
                            "ucl": 5.60, "lcl": 4.40,
                            "rules": [1, 2],
                            "samples": 30,
                            "data": {"mean": 5.00, "std": 0.20},
                            "batch_style": "mobile",
                        },
                        {
                            "name": "Paint Thickness (um)",
                            "description": "Dry film paint thickness",
                            "subgroup_size": 3,
                            "target": 75.0, "usl": 100.0, "lsl": 50.0,
                            "ucl": 90.0, "lcl": 60.0,
                            "rules": [1, 2],
                            "samples": 30,
                            "data": {"mean": 75.0, "std": 5.0},
                            "batch_style": "mobile",
                        },
                    ],
                },
            ],
        },
    },
]

# ---------------------------------------------------------------------------
# Data generation
# ---------------------------------------------------------------------------


def generate_value(cfg: dict, sample_index: int, total_samples: int, rng: random.Random) -> float:
    """Generate a single measurement with realistic process behavior."""
    d = cfg["data"]
    mean = d["mean"]
    std = d["std"]

    value = rng.gauss(mean, std)

    if cfg.get("lsl") is not None:
        value = max(value, cfg["lsl"] - 3 * std)
    if cfg.get("usl") is not None:
        value = min(value, cfg["usl"] + 3 * std)

    return round(value, 4)


def make_batch_number(style: str, sample_index: int) -> str:
    """Generate batch number based on plant style."""
    if style == "erp":
        batch = sample_index // 10
        return f"WO-2026-{batch:04d}"
    elif style == "lims":
        return f"CERT-{sample_index + 1:06d}"
    elif style == "mobile":
        return f"M-{sample_index + 1:03d}"
    else:
        return f"S-{sample_index + 1:04d}"


# ---------------------------------------------------------------------------
# Inline Nelson checker
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

    stats = {"plants": 0, "nodes": 0, "chars": 0, "samples": 0, "measurements": 0, "users": 0, "violations": 0}

    async with db_config.session() as session:
        # 1. Create all plants first
        plant_objs: list[Plant] = []
        for plant_def in PLANTS:
            plant = Plant(name=plant_def["name"], code=plant_def["code"], is_active=True)
            session.add(plant)
            await session.flush()
            plant_objs.append(plant)
            stats["plants"] += 1
            print(f"  Plant: {plant.name} [{plant.code}] (ID {plant.id})")

        # 2. Users (assigned to all plants)
        print("\nCreating users...")
        hashed_pw = hash_password("password")
        for username, email, role_name in USERS:
            user = User(username=username, email=email, hashed_password=hashed_pw, is_active=True)
            session.add(user)
            await session.flush()
            for plant in plant_objs:
                upr = UserPlantRole(user_id=user.id, plant_id=plant.id, role=UserRole(role_name))
                session.add(upr)
            stats["users"] += 1
            print(f"  User: {username} ({role_name}) -> all {len(plant_objs)} plants")

        # 3. Hierarchy + Characteristics + Samples per plant
        print("\nCreating hierarchy, characteristics, and samples...")

        async def create_tree(node_def: dict, parent_id: int | None, plant_id: int, depth: int = 0):
            indent = "  " + "  " * depth
            node = Hierarchy(
                name=node_def["name"],
                type=node_def["type"],
                parent_id=parent_id,
                plant_id=plant_id,
            )
            session.add(node)
            await session.flush()
            stats["nodes"] += 1
            print(f"{indent}[{node_def['type']}] {node_def['name']} (ID {node.id})")

            for c_def in node_def.get("characteristics", []):
                nominal_n = c_def["subgroup_size"]
                total_samples = c_def.get("samples", 60)
                batch_style = c_def.get("batch_style", "erp")

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
                chart_hint = "I-MR" if nominal_n == 1 else f"Xbar-R (n={nominal_n})"
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
                start_date = now - timedelta(hours=total_samples * 3)

                for s_idx in range(total_samples):
                    sample_time = start_date + timedelta(hours=s_idx * 3)
                    batch_number = make_batch_number(batch_style, s_idx)

                    sample = Sample(
                        char_id=char.id,
                        timestamp=sample_time,
                        batch_number=batch_number,
                        operator_id="operator",
                        is_excluded=False,
                        actual_n=nominal_n,
                    )
                    session.add(sample)
                    await session.flush()
                    stats["samples"] += 1

                    # Measurements
                    measurement_values = []
                    for m_idx in range(nominal_n):
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
                                char_id=char.id,
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
                await create_tree(child_def, node.id, plant_id, depth + 1)

        for plant_obj, plant_def in zip(plant_objs, PLANTS):
            print(f"\n--- {plant_def['name']} ---")
            await create_tree(plant_def["hierarchy"], None, plant_obj.id, 0)

        print("\nCommitting to database...")
        await session.commit()

    await db_config.dispose()

    print("\n" + "=" * 60)
    print("  SPRINT 8 TEST SEED COMPLETE")
    print("=" * 60)
    print(f"  Plants:          {stats['plants']}")
    print(f"  Hierarchy Nodes: {stats['nodes']}")
    print(f"  Users:           {stats['users']}")
    print(f"  Characteristics: {stats['chars']}")
    print(f"  Samples:         {stats['samples']:,}")
    print(f"  Measurements:    {stats['measurements']:,}")
    print(f"  Violations:      {stats['violations']:,}")
    print(f"  Estimated:       ~880")
    print(f"  DB File:         {db_path}")
    print("=" * 60)
    print("\nAll users have password: 'password'")
    print("Admin: admin / password")
    print("Operator: operator / password")


def main() -> None:
    asyncio.run(seed())


if __name__ == "__main__":
    main()
