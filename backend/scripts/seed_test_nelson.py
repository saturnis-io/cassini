"""Nelson Rules Test Seed for OpenSPC.

Creates 2 plants with 10 characteristics designed to trigger all 8 Nelson rules.
Uses deterministic data with explicit violation patterns at known sample indices
for UI and statistical engine verification.

Plants:
  1. Nelson Alpha (NRA) — "Single Rule Tests" department (Rules 1-4)
  2. Nelson Beta  (NRB) — "Zone Pattern Tests" + "Combined Tests" (Rules 5-8, combo, stable)

Run:
    python backend/scripts/seed_test_nelson.py
"""

import asyncio
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
    HierarchyType,
)
from openspc.db.models.characteristic_config import CharacteristicConfig  # noqa: F401
from openspc.db.models.plant import Plant
from openspc.db.models.sample import Measurement, Sample
from openspc.db.models.user import User, UserPlantRole, UserRole
from openspc.db.models.violation import Violation
from openspc.db.models.broker import MQTTBroker  # noqa: F401
from openspc.db.models.api_key import APIKey  # noqa: F401

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

RANDOM_SEED = 42
NUM_SAMPLES = 100  # per single-rule characteristic
NUM_SAMPLES_COMBINED = 200  # for combined and stable

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

# Users (password: "password")
USERS = [
    ("admin",    "admin@openspc.local",    {"NRA": "admin",    "NRB": "admin"}),
    ("engineer", "engineer@openspc.local", {"NRA": "engineer", "NRB": "engineer"}),
    ("operator", "operator@openspc.local", {"NRA": "operator", "NRB": "operator"}),
]

# ---------------------------------------------------------------------------
# Characteristic definitions
# ---------------------------------------------------------------------------

# All single-rule chars: n=1, CL=100, UCL=106, LCL=94, sigma=2
SINGLE_DEFAULTS = {
    "subgroup_size": 1,
    "target": 100.0,
    "ucl": 106.0,
    "lcl": 94.0,
    # sigma = (UCL - CL) / 3 = 2.0
}

CHARS = [
    # --- Plant 1: Nelson Alpha — Single Rule Tests ---
    {
        "plant": "NRA",
        "department": "Single Rule Tests",
        "name": "Rule 1 - Outlier",
        "description": "Points beyond 3 sigma. Outliers injected at indices 25, 55.",
        **SINGLE_DEFAULTS,
        "rules": [1],
        "num_samples": NUM_SAMPLES,
        "overrides": {
            25: 108.0,   # > UCL (106)
            55: 93.0,    # < LCL (94)
        },
        # Violations: each override point triggers Rule 1
        "violations": {25: [1], 55: [1]},
    },
    {
        "plant": "NRA",
        "department": "Single Rule Tests",
        "name": "Rule 2 - Shift",
        "description": "9 consecutive points on same side of CL. Indices 30-38: all above CL.",
        **SINGLE_DEFAULTS,
        "rules": [2],
        "num_samples": NUM_SAMPLES,
        "overrides": {i: 102.0 + (i - 30) * 0.1 for i in range(30, 39)},
        # Rule 2 triggers on the 9th consecutive point (index 38)
        "violations": {38: [2]},
    },
    {
        "plant": "NRA",
        "department": "Single Rule Tests",
        "name": "Rule 3 - Trend",
        "description": "6 consecutive points steadily increasing. Indices 25-30.",
        **SINGLE_DEFAULTS,
        "rules": [3],
        "num_samples": NUM_SAMPLES,
        "overrides": {
            25: 97.0,
            26: 99.0,
            27: 101.0,
            28: 103.0,
            29: 104.5,
            30: 105.5,
        },
        # Rule 3 triggers on the 6th consecutive trending point (index 30)
        "violations": {30: [3]},
    },
    {
        "plant": "NRA",
        "department": "Single Rule Tests",
        "name": "Rule 4 - Alternation",
        "description": "14 consecutive points alternating up/down. Indices 30-43.",
        **SINGLE_DEFAULTS,
        "rules": [4],
        "num_samples": NUM_SAMPLES,
        "overrides": {
            i: 103.0 if (i - 30) % 2 == 0 else 97.0
            for i in range(30, 44)
        },
        # Rule 4 triggers on the 14th consecutive alternating point (index 43)
        "violations": {43: [4]},
    },
    # --- Plant 2: Nelson Beta — Zone Pattern Tests ---
    {
        "plant": "NRB",
        "department": "Zone Pattern Tests",
        "name": "Rule 5 - Zone A",
        "description": "2 of 3 points in Zone A (>2 sigma). Indices 25-27.",
        **SINGLE_DEFAULTS,
        "rules": [5],
        "num_samples": NUM_SAMPLES,
        "overrides": {
            25: 105.0,   # Zone A (>CL+2sigma = >104)
            26: 100.0,   # Center (not zone A)
            27: 105.0,   # Zone A again — triggers rule
        },
        "violations": {27: [5]},
    },
    {
        "plant": "NRB",
        "department": "Zone Pattern Tests",
        "name": "Rule 6 - Zone B",
        "description": "4 of 5 points in Zone B or beyond (>1 sigma). Indices 25-29.",
        **SINGLE_DEFAULTS,
        "rules": [6],
        "num_samples": NUM_SAMPLES,
        "overrides": {
            25: 103.0,   # Zone B (>CL+1sigma = >102)
            26: 103.5,   # Zone B
            27: 103.0,   # Zone B
            28: 100.0,   # Center (not zone B)
            29: 103.5,   # Zone B — 4 of 5 triggers rule
        },
        "violations": {29: [6]},
    },
    {
        "plant": "NRB",
        "department": "Zone Pattern Tests",
        "name": "Rule 7 - Stratification",
        "description": "15 consecutive points within 1 sigma of CL. Indices 30-44.",
        **SINGLE_DEFAULTS,
        "rules": [7],
        "num_samples": NUM_SAMPLES,
        "overrides": {
            i: 100.0 + ((i - 30) % 5) * 0.2 - 0.4
            for i in range(30, 45)
        },
        # Rule 7 triggers on the 15th consecutive point in zone C (index 44)
        "violations": {44: [7]},
    },
    {
        "plant": "NRB",
        "department": "Zone Pattern Tests",
        "name": "Rule 8 - Mixture",
        "description": "8 consecutive points > 1 sigma from CL (both sides). Indices 30-37.",
        **SINGLE_DEFAULTS,
        "rules": [8],
        "num_samples": NUM_SAMPLES,
        "overrides": {
            30: 96.0,   # Below -1sigma (< 98)
            31: 104.0,  # Above +1sigma (> 102)
            32: 97.0,
            33: 103.0,
            34: 96.0,
            35: 104.0,
            36: 97.0,
            37: 103.0,  # 8 consecutive points all beyond 1 sigma
        },
        # Rule 8 triggers on the 8th consecutive point outside zone C (index 37)
        "violations": {37: [8]},
    },
    # --- Plant 2: Nelson Beta — Combined Tests ---
    {
        "plant": "NRB",
        "department": "Combined Tests",
        "name": "All Rules Combined",
        "description": "All 8 rules enabled with multiple violation patterns embedded.",
        "subgroup_size": 5,
        "target": 100.0,
        "ucl": 106.0,
        "lcl": 94.0,
        "rules": [1, 2, 3, 4, 5, 6, 7, 8],
        "num_samples": NUM_SAMPLES_COMBINED,
        "overrides": {
            # Rule 1 outliers
            20: 108.0,
            120: 92.0,
            # Rule 2 shift (9 points above CL) at indices 40-48
            **{i: 102.5 + (i - 40) * 0.05 for i in range(40, 49)},
            # Rule 3 trend at indices 70-75
            70: 97.0, 71: 98.5, 72: 100.0, 73: 101.5, 74: 103.0, 75: 104.5,
            # Rule 5 zone A at indices 150-152
            150: 105.0, 151: 100.0, 152: 105.0,
        },
        "violations": {
            20: [1],
            120: [1],
            48: [2],
            75: [3],
            152: [5],
        },
    },
    {
        "plant": "NRB",
        "department": "Combined Tests",
        "name": "Stable Process",
        "description": "Normal gaussian process, no injected violations. Baseline reference.",
        "subgroup_size": 5,
        "target": 100.0,
        "ucl": 106.0,
        "lcl": 94.0,
        "rules": [1, 2, 3, 4, 5, 6, 7, 8],
        "num_samples": NUM_SAMPLES_COMBINED,
        "overrides": {},
        "violations": {},
    },
]


# ---------------------------------------------------------------------------
# Data generation
# ---------------------------------------------------------------------------

def generate_baseline(mean: float, std: float, rng: random.Random) -> float:
    """Generate a single normally-distributed value."""
    return round(rng.gauss(mean, std), 4)


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
        # ---------------------------------------------------------------
        # 1. Plants
        # ---------------------------------------------------------------
        plant_map: dict[str, Plant] = {}
        for code, name in [("NRA", "Nelson Alpha"), ("NRB", "Nelson Beta")]:
            plant = Plant(name=name, code=code, is_active=True)
            session.add(plant)
            await session.flush()
            plant_map[code] = plant
            stats["plants"] += 1
            print(f"  Plant: {name} [{code}] (ID {plant.id})")

        # ---------------------------------------------------------------
        # 2. Users & roles
        # ---------------------------------------------------------------
        print("\nCreating users...")
        hashed_pw = hash_password("password")
        for username, email, role_map in USERS:
            user = User(username=username, email=email, hashed_password=hashed_pw, is_active=True)
            session.add(user)
            await session.flush()
            for site_code, role_name in role_map.items():
                plant = plant_map[site_code]
                session.add(UserPlantRole(
                    user_id=user.id,
                    plant_id=plant.id,
                    role=UserRole(role_name),
                ))
            stats["users"] += 1
            print(f"  User: {username} ({', '.join(f'{c}:{r}' for c, r in role_map.items())})")

        # ---------------------------------------------------------------
        # 3. Hierarchy + Characteristics + Samples + Violations
        # ---------------------------------------------------------------
        print("\nCreating hierarchy, characteristics, and samples...")

        # Group characteristics by plant and department
        plant_chars: dict[str, dict[str, list[dict]]] = {}
        for c_def in CHARS:
            pc = plant_chars.setdefault(c_def["plant"], {})
            dc = pc.setdefault(c_def["department"], [])
            dc.append(c_def)

        for plant_code, departments in plant_chars.items():
            plant = plant_map[plant_code]
            print(f"\n--- {plant_code}: {plant.name} ---")

            # Root hierarchy node
            root = Hierarchy(
                name=f"{plant.name} Site",
                type="Enterprise",
                parent_id=None,
                plant_id=plant.id,
            )
            session.add(root)
            await session.flush()
            stats["nodes"] += 1
            print(f"  [Enterprise] {root.name}")

            for dept_name, char_list in departments.items():
                # Department node
                dept = Hierarchy(
                    name=dept_name,
                    type="Area",
                    parent_id=root.id,
                    plant_id=plant.id,
                )
                session.add(dept)
                await session.flush()
                stats["nodes"] += 1
                print(f"    [Area] {dept_name}")

                for c_def in char_list:
                    char = Characteristic(
                        hierarchy_id=dept.id,
                        name=c_def["name"],
                        description=c_def.get("description"),
                        subgroup_size=c_def["subgroup_size"],
                        target_value=c_def.get("target"),
                        ucl=c_def.get("ucl"),
                        lcl=c_def.get("lcl"),
                    )
                    session.add(char)
                    await session.flush()
                    stats["chars"] += 1
                    print(f"      * {c_def['name']} (n={c_def['subgroup_size']}, rules={c_def['rules']})")

                    # Nelson rules
                    for rule_id in c_def.get("rules", []):
                        session.add(CharacteristicRule(
                            char_id=char.id,
                            rule_id=rule_id,
                            is_enabled=True,
                            require_acknowledgement=True,
                        ))

                    # Generate samples
                    n_samples = c_def["num_samples"]
                    overrides = c_def.get("overrides", {})
                    violation_map = c_def.get("violations", {})
                    mean = c_def["target"]
                    baseline_std = 1.0

                    for s_idx in range(n_samples):
                        sample_time = now - timedelta(hours=(n_samples - s_idx) * 3)

                        sample = Sample(
                            char_id=char.id,
                            timestamp=sample_time,
                            batch_number=f"{plant_code}-{s_idx // 10 + 1:04d}",
                            operator_id="operator",
                            is_excluded=False,
                            actual_n=c_def["subgroup_size"],
                        )
                        session.add(sample)
                        await session.flush()
                        stats["samples"] += 1

                        for m_idx in range(c_def["subgroup_size"]):
                            if s_idx in overrides:
                                val = overrides[s_idx] + (m_idx * 0.01 if c_def["subgroup_size"] > 1 else 0)
                            else:
                                val = generate_baseline(mean, baseline_std, rng)
                            session.add(Measurement(sample_id=sample.id, value=round(val, 4)))
                            stats["measurements"] += 1

                        # Create violations for this sample if specified
                        if s_idx in violation_map:
                            for rule_id in violation_map[s_idx]:
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

                        if s_idx % 100 == 0 and s_idx > 0:
                            await session.flush()

                    await session.flush()

        # ---------------------------------------------------------------
        # 4. Commit
        # ---------------------------------------------------------------
        print("\nCommitting to database...")
        await session.commit()

    await db_config.dispose()

    # ---------------------------------------------------------------
    # Summary
    # ---------------------------------------------------------------
    print("\n" + "=" * 60)
    print("  NELSON RULES TEST SEED COMPLETE")
    print("=" * 60)
    print(f"  Plants:           {stats['plants']}")
    print(f"  Users:            {stats['users']}")
    print(f"  Hierarchy Nodes:  {stats['nodes']}")
    print(f"  Characteristics:  {stats['chars']}")
    print(f"  Samples:          {stats['samples']:,}")
    print(f"  Measurements:     {stats['measurements']:,}")
    print(f"  Violations:       {stats['violations']}")
    print(f"  DB File:          {backend_dir / 'openspc.db'}")
    print("=" * 60)
    print(f"\nAll users have password: 'password'")
    print(f"Admin user: admin / password")


def main() -> None:
    asyncio.run(seed())


if __name__ == "__main__":
    main()
