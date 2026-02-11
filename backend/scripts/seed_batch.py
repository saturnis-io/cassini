"""Craft Brewery batch-process seed script for OpenSPC.

Creates a brewery plant with ISA-95 hierarchy and 11 characteristics
demonstrating batch-process SPC patterns:
  - Between-batch variability (raw material lot differences)
  - Within-batch drift (biological processes)
  - Step changes (supplier changes)
  - Tight packaging-line control

Hierarchy (Site > Area > Equipment):
  Heritage Brewing Co
    Brewhouse
      Mash Tun           -> Mash Temperature (n=1), Wort Gravity (n=1)
      Lauter Tun         -> Sparge Water pH (n=1)
    Fermentation Cellar
      Fermenter Bank     -> Fermentation Temp (n=1), Dissolved CO2 (n=1)
      Lab Analysis       -> Final Gravity (n=1), ABV (n=1)
    Packaging Hall
      Filler Line        -> Fill Volume (n=5), Headspace Pressure (n=3)
      Quality Check      -> Dissolved O2 (n=1), Label Offset (n=1)

Run:
    python backend/scripts/seed_batch.py
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
    ("admin",        "admin@heritagebrewing.local",      "admin"),
    ("operator",     "operator@heritagebrewing.local",   "operator"),
    ("supervisor",   "supervisor@heritagebrewing.local", "supervisor"),
]

# Operators assigned by area
OPERATORS = {
    "Brewhouse": "T.Brewmaster",
    "Fermentation Cellar": "S.LabTech",
    "Packaging Hall": "M.PackTech",
}

# Beer styles that rotate through batches
BEER_STYLES = ["IPA", "STOUT", "PALE", "WHEAT"]

HIERARCHY = {
    "name": "Heritage Brewing Co",
    "type": "Site",
    "children": [
        {
            "name": "Brewhouse",
            "type": "Area",
            "children": [
                {
                    "name": "Mash Tun",
                    "type": "Equipment",
                    "characteristics": [
                        {
                            "name": "Mash Temperature",
                            "description": "Mash rest temperature (°C)",
                            "subgroup_size": 1,
                            "target": 66.0, "usl": 69.0, "lsl": 63.0,
                            "ucl": 68.0, "lcl": 64.0,
                            "rules": [1, 2, 3, 5, 6],
                            "samples": 500,
                            "operator": "T.Brewmaster",
                            "data": {
                                "mean": 66.0, "std": 0.5,
                                "batch_variation": 0.4,
                                "within_batch_drift": 0.15,
                            },
                        },
                        {
                            "name": "Wort Gravity",
                            "description": "Pre-boil wort gravity (°Plato)",
                            "subgroup_size": 1,
                            "target": 12.5, "usl": 14.0, "lsl": 11.0,
                            "ucl": 13.5, "lcl": 11.5,
                            "rules": [1, 2, 3, 5, 6],
                            "samples": 500,
                            "operator": "T.Brewmaster",
                            "data": {
                                "mean": 12.5, "std": 0.25,
                                "batch_variation": 0.35,
                                "step_change_at": 0.65,
                                "step_change_delta": 0.6,
                            },
                        },
                    ],
                },
                {
                    "name": "Lauter Tun",
                    "type": "Equipment",
                    "characteristics": [
                        {
                            "name": "Sparge Water pH",
                            "description": "Sparge water pH after acid adjustment",
                            "subgroup_size": 1,
                            "target": 5.80, "usl": 6.20, "lsl": 5.40,
                            "ucl": 6.05, "lcl": 5.55,
                            "rules": [1, 2, 3, 5, 6],
                            "samples": 500,
                            "operator": "T.Brewmaster",
                            "data": {
                                "mean": 5.80, "std": 0.07,
                                "batch_variation": 0.12,
                            },
                        },
                    ],
                },
            ],
        },
        {
            "name": "Fermentation Cellar",
            "type": "Area",
            "children": [
                {
                    "name": "Fermenter Bank",
                    "type": "Equipment",
                    "characteristics": [
                        {
                            "name": "Fermentation Temp",
                            "description": "Active fermentation temperature (°C)",
                            "subgroup_size": 1,
                            "target": 18.0, "usl": 21.0, "lsl": 15.0,
                            "ucl": 20.0, "lcl": 16.0,
                            "rules": [1, 2, 3, 5, 6],
                            "samples": 600,
                            "operator": "S.LabTech",
                            "data": {
                                "mean": 18.0, "std": 0.35,
                                "batch_variation": 0.25,
                                "within_batch_drift": 0.3,
                            },
                        },
                        {
                            "name": "Dissolved CO2",
                            "description": "Dissolved carbon dioxide (g/L)",
                            "subgroup_size": 1,
                            "target": 4.5, "usl": 5.5, "lsl": 3.5,
                            "ucl": 5.2, "lcl": 3.8,
                            "rules": [1, 2, 3, 5, 6],
                            "samples": 600,
                            "operator": "S.LabTech",
                            "data": {
                                "mean": 4.5, "std": 0.15,
                                "batch_variation": 0.2,
                            },
                        },
                    ],
                },
                {
                    "name": "Lab Analysis",
                    "type": "Equipment",
                    "characteristics": [
                        {
                            "name": "Final Gravity",
                            "description": "Post-fermentation gravity (°Plato)",
                            "subgroup_size": 1,
                            "target": 3.0, "usl": 4.0, "lsl": 2.0,
                            "ucl": 3.6, "lcl": 2.4,
                            "rules": [1, 2, 3, 5, 6],
                            "samples": 500,
                            "operator": "S.LabTech",
                            "data": {
                                "mean": 3.0, "std": 0.12,
                                "batch_variation": 0.15,
                            },
                        },
                        {
                            "name": "ABV",
                            "description": "Alcohol by volume (%)",
                            "subgroup_size": 1,
                            "target": 5.2, "usl": 6.0, "lsl": 4.4,
                            "ucl": 5.7, "lcl": 4.7,
                            "rules": [1, 2, 3, 5, 6],
                            "samples": 500,
                            "operator": "S.LabTech",
                            "data": {
                                "mean": 5.2, "std": 0.10,
                                "batch_variation": 0.12,
                                "step_change_at": 0.65,
                                "step_change_delta": 0.25,
                            },
                        },
                    ],
                },
            ],
        },
        {
            "name": "Packaging Hall",
            "type": "Area",
            "children": [
                {
                    "name": "Filler Line",
                    "type": "Equipment",
                    "characteristics": [
                        {
                            "name": "Fill Volume",
                            "description": "Bottle fill volume (mL) — tight packaging control",
                            "subgroup_size": 5,
                            "target": 330.0, "usl": 332.0, "lsl": 328.0,
                            "ucl": 331.0, "lcl": 329.0,
                            "rules": [1, 2, 3, 4, 5, 6],
                            "samples": 500,
                            "operator": "M.PackTech",
                            "data": {
                                "mean": 330.0, "std": 0.25,
                                "batch_variation": 0.05,
                            },
                        },
                        {
                            "name": "Headspace Pressure",
                            "description": "Bottle headspace pressure (psi)",
                            "subgroup_size": 3,
                            "target": 14.0, "usl": 16.0, "lsl": 12.0,
                            "ucl": 15.2, "lcl": 12.8,
                            "rules": [1, 2, 3, 5, 6],
                            "samples": 500,
                            "operator": "M.PackTech",
                            "data": {
                                "mean": 14.0, "std": 0.30,
                                "batch_variation": 0.15,
                            },
                        },
                    ],
                },
                {
                    "name": "Quality Check",
                    "type": "Equipment",
                    "characteristics": [
                        {
                            "name": "Dissolved O2",
                            "description": "Dissolved oxygen at packaging (ppb)",
                            "subgroup_size": 1,
                            "target": 50.0, "usl": 100.0, "lsl": 0.0,
                            "ucl": 80.0, "lcl": 20.0,
                            "rules": [1, 2, 3, 5, 6],
                            "samples": 500,
                            "operator": "M.PackTech",
                            "data": {
                                "mean": 50.0, "std": 8.0,
                                "batch_variation": 5.0,
                                "step_change_at": 0.70,
                                "step_change_delta": 20.0,
                            },
                        },
                        {
                            "name": "Label Offset",
                            "description": "Label placement offset from nominal (mm)",
                            "subgroup_size": 1,
                            "target": 0.0, "usl": 2.0, "lsl": -2.0,
                            "ucl": 1.5, "lcl": -1.5,
                            "rules": [1, 2, 3, 5, 6],
                            "samples": 500,
                            "operator": "M.PackTech",
                            "data": {
                                "mean": 0.0, "std": 0.30,
                                "batch_variation": 0.10,
                            },
                        },
                    ],
                },
            ],
        },
    ],
}

# ---------------------------------------------------------------------------
# Batch number generation
# ---------------------------------------------------------------------------

class BatchTracker:
    """Generates rotating beer-style batch numbers."""

    def __init__(self, styles: list[str], rng: random.Random):
        self.styles = styles
        self.rng = rng
        self.style_counters = {s: 0 for s in styles}
        self.current_style_idx = 0
        self.current_batch_number: str | None = None
        self.samples_in_batch = 0
        self.batch_size = 0

    def next_sample(self) -> str:
        """Return the batch number for the next sample, rotating styles."""
        if self.current_batch_number is None or self.samples_in_batch >= self.batch_size:
            # Start a new batch
            style = self.styles[self.current_style_idx % len(self.styles)]
            self.current_style_idx += 1
            self.style_counters[style] += 1
            seq = self.style_counters[style]
            self.current_batch_number = f"{style}-2026-{seq:03d}"
            self.samples_in_batch = 0
            self.batch_size = self.rng.randint(20, 40)

        self.samples_in_batch += 1
        return self.current_batch_number

    @property
    def batch_index(self) -> int:
        """Current batch sequential index (0-based)."""
        return sum(self.style_counters.values()) - 1


# ---------------------------------------------------------------------------
# Data generation
# ---------------------------------------------------------------------------


def generate_value(
    cfg: dict,
    sample_index: int,
    total_samples: int,
    rng: random.Random,
    batch_offset: float = 0.0,
    within_batch_progress: float = 0.0,
) -> float:
    """Generate a single measurement with realistic batch-process behavior.

    Args:
        cfg: Characteristic config dict with "data" sub-dict.
        sample_index: 0-based index of the current sample.
        total_samples: Total samples for this characteristic.
        rng: Seeded random instance.
        batch_offset: Random offset for the current batch (between-batch variation).
        within_batch_progress: 0.0-1.0 progress through the current batch.
    """
    d = cfg["data"]
    mean = d["mean"]
    std = d["std"]
    frac = sample_index / max(total_samples - 1, 1)

    # Between-batch variation (random offset per batch, passed in)
    mean += batch_offset

    # Within-batch drift (gradual drift that resets at batch boundaries)
    if "within_batch_drift" in d:
        mean += d["within_batch_drift"] * within_batch_progress

    # Step change (permanent shift, e.g. malt supplier change)
    if "step_change_at" in d and frac >= d["step_change_at"]:
        mean += d["step_change_delta"]

    # Mean shift
    if "shift_start" in d and frac >= d["shift_start"]:
        mean += d["shift_delta"]

    # Zone bias (sustained offset)
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
        plant = Plant(name="Heritage Brewing Co", code="HBC", is_active=True)
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
                chart_hint = "I-MR" if nominal_n == 1 else f"X\u0304-S (n={nominal_n})"
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

                # Batch tracker for this characteristic
                batch_tracker = BatchTracker(BEER_STYLES, rng)
                operator = c_def.get("operator", "T.Brewmaster")
                batch_variation_mag = c_def["data"].get("batch_variation", 0.0)

                # Pre-generate batch offsets: one per batch
                # We generate them lazily as new batches start
                current_batch_offset = 0.0
                last_batch_index = -1

                # Generate samples
                start_date = now - timedelta(hours=total_samples * 2)  # ~2-hour intervals

                for s_idx in range(total_samples):
                    sample_time = start_date + timedelta(hours=s_idx * 2)
                    actual_n = nominal_n

                    # Get batch number and track batch boundaries
                    batch_number = batch_tracker.next_sample()
                    batch_idx = batch_tracker.batch_index

                    # New batch -> new random offset
                    if batch_idx != last_batch_index:
                        if batch_variation_mag > 0:
                            current_batch_offset = rng.gauss(0, batch_variation_mag)
                        else:
                            current_batch_offset = 0.0
                        last_batch_index = batch_idx

                    # Within-batch progress (0.0 to 1.0)
                    within_progress = (
                        batch_tracker.samples_in_batch / max(batch_tracker.batch_size, 1)
                    )

                    sample = Sample(
                        char_id=char.id,
                        timestamp=sample_time,
                        batch_number=batch_number,
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
                        val = generate_value(
                            c_def, s_idx, total_samples, rng,
                            batch_offset=current_batch_offset,
                            within_batch_progress=within_progress,
                        )
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
    print("  HERITAGE BREWING BATCH SEED COMPLETE")
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
    print("Admin:      admin / password")
    print("Operator:   operator / password")
    print("Supervisor: supervisor / password")


def main() -> None:
    asyncio.run(seed())


if __name__ == "__main__":
    main()
