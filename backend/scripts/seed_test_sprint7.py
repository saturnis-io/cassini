"""Sprint 7 test seed script for OpenSPC.

Shop Floor Connectivity scaffolding — 1 plant simulating RS-232/USB
gage integration with 4 gage types:

  1. Caliper - Digital (Mitutoyo)    — RS-232, 100 samples, n=1
  2. Micrometer - Outside (Starrett) — USB HID, 100 samples, n=1
  3. CMM - Bore Position (Hexagon)   — RS-232, 50 samples, n=3
  4. Surface Roughness (Mahr)        — USB, 80 samples, n=1

Run:
    python backend/scripts/seed_test_sprint7.py
"""

import asyncio
import hashlib
import logging
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
from openspc.db.models.broker import MQTTBroker
from openspc.db.models.characteristic_config import CharacteristicConfig  # noqa: F401
from openspc.db.models.gage import GageBridge, GagePort
from openspc.db.models.plant import Plant
from openspc.db.models.user import User, UserPlantRole, UserRole

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

RANDOM_SEED = 42

USERS = [
    ("admin",     "admin@openspc.local",     "admin"),
    ("engineer1", "engineer1@openspc.local", "engineer"),
    ("operator",  "operator@openspc.local",  "operator"),
]

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

# ---------------------------------------------------------------------------
# Gage characteristic definitions
# ---------------------------------------------------------------------------

GAGES = [
    {
        "name": "Caliper - Digital (Mitutoyo)",
        "description": "Mitutoyo 500-196-30 digital caliper, RS-232 SPC output, resolution 0.01mm",
        "subgroup_size": 1,
        "num_samples": 100,
        "target": 12.700,
        "usl": 12.750,
        "lsl": 12.650,
        "ucl": 12.730,
        "lcl": 12.670,
        "rules": [1, 2, 3],
        "data_mean": 12.700,
        "data_std": 0.008,
        "resolution": 0.01,
        "interval_minutes": 2,
    },
    {
        "name": "Micrometer - Outside (Starrett)",
        "description": "Starrett 733 digital micrometer, USB HID, resolution 0.001mm",
        "subgroup_size": 1,
        "num_samples": 100,
        "target": 6.350,
        "usl": 6.360,
        "lsl": 6.340,
        "ucl": 6.356,
        "lcl": 6.344,
        "rules": [1, 2, 3],
        "data_mean": 6.350,
        "data_std": 0.002,
        "resolution": 0.001,
        "interval_minutes": 3,
    },
    {
        "name": "CMM - Bore Position (Hexagon)",
        "description": "Hexagon TIGO SF CMM, RS-232 output, resolution 0.001mm, position deviation",
        "subgroup_size": 3,
        "num_samples": 50,
        "target": 0.000,
        "usl": 0.050,
        "lsl": -0.050,
        "ucl": 0.030,
        "lcl": -0.030,
        "rules": [1, 2, 3],
        "data_mean": 0.002,
        "data_std": 0.008,
        "resolution": 0.001,
        "interval_minutes": 10,
    },
    {
        "name": "Surface Roughness (Mahr)",
        "description": "Mahr MarSurf PS10, USB, resolution 0.01um, Ra parameter",
        "subgroup_size": 1,
        "num_samples": 80,
        "target": 0.800,
        "usl": 1.600,
        "lsl": 0.000,
        "ucl": 1.200,
        "lcl": 0.400,
        "rules": [1, 2, 3],
        "data_mean": 0.800,
        "data_std": 0.150,
        "resolution": 0.01,
        "interval_minutes": 5,
        "force_positive": True,
    },
]


# ---------------------------------------------------------------------------
# Inline Nelson checker (from seed_chart_showcase.py)
# ---------------------------------------------------------------------------


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

    stats = {"plants": 0, "nodes": 0, "chars": 0, "samples": 0, "measurements": 0, "users": 0, "violations": 0, "bridges": 0, "ports": 0}

    async with db_config.session() as session:
        # ── 1. Plant ──────────────────────────────────────────────────
        plant = Plant(name="C1: Gage Integration", code="C1-GAGE", is_active=True)
        session.add(plant)
        await session.flush()
        stats["plants"] += 1
        print(f"  Plant: {plant.name} [{plant.code}] (ID {plant.id})")

        # ── 2. Users ─────────────────────────────────────────────────
        print("\nCreating users...")
        hashed_pw = hash_password("password")
        admin_user = None
        for username, email, role_name in USERS:
            user = User(username=username, email=email, hashed_password=hashed_pw, is_active=True)
            session.add(user)
            await session.flush()
            upr = UserPlantRole(user_id=user.id, plant_id=plant.id, role=UserRole(role_name))
            session.add(upr)
            stats["users"] += 1
            print(f"  User: {username} ({role_name})")
            if role_name == "admin":
                admin_user = user

        # ── 3. Hierarchy ─────────────────────────────────────────────
        print("\nCreating hierarchy and characteristics...")
        area = Hierarchy(name="Production Floor", type="Area", parent_id=None, plant_id=plant.id)
        session.add(area)
        await session.flush()
        stats["nodes"] += 1
        print(f"  [Area] {area.name} (ID {area.id})")

        cell = Hierarchy(name="Measurement Station", type="Cell", parent_id=area.id, plant_id=plant.id)
        session.add(cell)
        await session.flush()
        stats["nodes"] += 1
        print(f"    [Cell] {cell.name} (ID {cell.id})")

        # ── 4. Gage Characteristics + Samples ────────────────────────
        char_objects: list[Characteristic] = []
        for gage in GAGES:
            char = Characteristic(
                hierarchy_id=cell.id,
                name=gage["name"],
                description=gage["description"],
                subgroup_size=gage["subgroup_size"],
                target_value=gage["target"],
                usl=gage["usl"],
                lsl=gage["lsl"],
                ucl=gage["ucl"],
                lcl=gage["lcl"],
            )
            session.add(char)
            await session.flush()
            stats["chars"] += 1
            char_objects.append(char)

            # Nelson rules
            for rule_id in gage.get("rules", [1, 2, 3]):
                session.add(CharacteristicRule(
                    char_id=char.id,
                    rule_id=rule_id,
                    is_enabled=True,
                    require_acknowledgement=True,
                ))

            # Nelson checker
            nelson_checker = InlineNelsonChecker(
                cl=gage["target"],
                ucl=gage["ucl"],
                lcl=gage["lcl"],
                enabled_rules=gage.get("rules", [1, 2, 3]),
            )

            num_samples = gage["num_samples"]
            subgroup_size = gage["subgroup_size"]
            interval = timedelta(minutes=gage["interval_minutes"])
            resolution = gage["resolution"]
            force_positive = gage.get("force_positive", False)

            start_date = now - (interval * num_samples)

            chart_hint = "I-MR" if subgroup_size == 1 else f"X-bar (n={subgroup_size})"
            print(f"    * {gage['name']} ({chart_hint}, {num_samples} samples, {interval.total_seconds() / 60:.0f}min interval)")

            for s_idx in range(num_samples):
                sample_time = start_date + (interval * s_idx)

                sample = Sample(
                    char_id=char.id,
                    timestamp=sample_time,
                    batch_number=f"GAGE-{s_idx + 1:04d}",
                    operator_id="operator",
                    is_excluded=False,
                    actual_n=subgroup_size,
                )
                session.add(sample)
                await session.flush()
                stats["samples"] += 1

                # Generate measurements
                measurement_values = []
                for m_idx in range(subgroup_size):
                    raw = rng.gauss(gage["data_mean"], gage["data_std"])
                    if force_positive:
                        raw = abs(raw)
                    # Round to gage resolution
                    val = round(round(raw / resolution) * resolution, 6)
                    session.add(Measurement(sample_id=sample.id, value=val))
                    stats["measurements"] += 1
                    measurement_values.append(val)

                # Nelson check on sample mean
                sample_mean = sum(measurement_values) / len(measurement_values)
                triggered = nelson_checker.check(sample_mean)
                for rule_id in triggered:
                    session.add(Violation(
                        sample_id=sample.id,
                        char_id=char.id,
                        rule_id=rule_id,
                        rule_name=NELSON_RULE_NAMES.get(rule_id, f"Rule {rule_id}"),
                        severity="CRITICAL" if rule_id == 1 else "WARNING",
                        acknowledged=False,
                        requires_acknowledgement=True,
                    ))
                    stats["violations"] += 1

                if s_idx % 50 == 0 and s_idx > 0:
                    await session.flush()

            await session.flush()

        # ── 5. Gage Bridge + Ports ─────────────────────────────────
        print("\nCreating gage bridge infrastructure...")
        caliper_char, micrometer_char, cmm_char, surface_char = char_objects

        # MQTT broker for bridge communication
        broker = MQTTBroker(
            plant_id=plant.id,
            name="Shop Floor MQTT",
            host="localhost",
            port=1883,
            is_active=True,
        )
        session.add(broker)
        await session.flush()
        print(f"  Broker: {broker.name} (ID {broker.id})")

        # Gage bridge with hashed API key
        test_api_key = "test-bridge-key-sprint7"
        api_key_hash = hashlib.sha256(test_api_key.encode()).hexdigest()

        bridge = GageBridge(
            plant_id=plant.id,
            name="Shop Floor Bridge 1",
            api_key_hash=api_key_hash,
            mqtt_broker_id=broker.id,
            status="online",
            last_heartbeat_at=datetime.now(timezone.utc),
            registered_by=admin_user.id,
        )
        session.add(bridge)
        await session.flush()
        stats["bridges"] = 1
        print(f"  Bridge: {bridge.name} (ID {bridge.id}, status={bridge.status})")

        # Gage ports — one per characteristic
        gage_port_configs = [
            {"port_name": "COM3", "baud_rate": 9600, "protocol_profile": "mitutoyo_digimatic", "char": caliper_char},
            {"port_name": "COM4", "baud_rate": 9600, "protocol_profile": "mitutoyo_digimatic", "char": micrometer_char},
            {"port_name": "COM5", "baud_rate": 115200, "protocol_profile": "generic",
             "parse_pattern": r"(?P<value>[+-]?\d+\.?\d*)", "char": cmm_char},
            {"port_name": "COM6", "baud_rate": 9600, "protocol_profile": "generic",
             "parse_pattern": r"Ra\s*=\s*(?P<value>\d+\.?\d*)", "char": surface_char},
        ]

        for gc in gage_port_configs:
            port = GagePort(
                bridge_id=bridge.id,
                port_name=gc["port_name"],
                baud_rate=gc["baud_rate"],
                protocol_profile=gc["protocol_profile"],
                parse_pattern=gc.get("parse_pattern"),
                mqtt_topic=f"openspc/gage/{bridge.id}/{gc['port_name']}/value",
                characteristic_id=gc["char"].id,
                is_active=True,
            )
            session.add(port)
            print(f"    Port: {gc['port_name']} -> {gc['char'].name} ({gc['protocol_profile']})")

        await session.flush()
        stats["ports"] = len(gage_port_configs)

        print("\nCommitting to database...")
        await session.commit()

    await db_config.dispose()

    print("\n" + "=" * 60)
    print("  SPRINT 7 TEST SEED COMPLETE")
    print("=" * 60)
    print(f"  Plants:          {stats['plants']}")
    print(f"  Hierarchy Nodes: {stats['nodes']}")
    print(f"  Users:           {stats['users']}")
    print(f"  Characteristics: {stats['chars']}")
    print(f"  Samples:         {stats['samples']:,}")
    print(f"  Measurements:    {stats['measurements']:,}")
    print(f"  Violations:      {stats['violations']:,}")
    print(f"  Gage Bridges:    {stats['bridges']}")
    print(f"  Gage Ports:      {stats['ports']}")
    print(f"  DB File:         {db_path}")
    print("=" * 60)
    print("\nAll users have password: 'password'")
    print("Admin: admin / password")
    print("Engineer: engineer1 / password")
    print("Operator: operator / password")
    print(f"\nTest bridge API key: test-bridge-key-sprint7")


def main() -> None:
    asyncio.run(seed())


if __name__ == "__main__":
    main()
