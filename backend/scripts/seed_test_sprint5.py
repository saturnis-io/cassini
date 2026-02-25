"""Sprint 5: Statistical Credibility test seed for OpenSPC.

Creates 3 plants testing non-normal capability (Box-Cox, Weibull, Gamma),
custom Nelson rule presets (4 rulesets), and Laney p'/u' charts
(overdispersion/underdispersion).

Run:
    python backend/scripts/seed_test_sprint5.py
"""

import asyncio
import json
import logging
import random
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
from scipy import stats as sp_stats

backend_dir = Path(__file__).parent.parent
src_dir = backend_dir / "src"
sys.path.insert(0, str(src_dir))

from cassini.core.auth.passwords import hash_password
from cassini.db import (
    Characteristic,
    CharacteristicRule,
    DatabaseConfig,
    Hierarchy,
    Measurement,
    Sample,
    Violation,
)
from cassini.db.models.api_key import APIKey  # noqa: F401
from cassini.db.models.broker import MQTTBroker  # noqa: F401
from cassini.db.models.characteristic_config import CharacteristicConfig  # noqa: F401
from cassini.db.models.plant import Plant
from cassini.db.models.rule_preset import RulePreset
from cassini.db.models.user import User, UserPlantRole, UserRole

logger = logging.getLogger(__name__)
RANDOM_SEED = 42

# ---------------------------------------------------------------------------
# Nelson rule metadata
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
        for rule_id in sorted(self.enabled_rules):
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
    db_path = backend_dir / "cassini.db"
    db_config = DatabaseConfig(
        database_url=f"sqlite+aiosqlite:///{db_path}",
        echo=False,
    )

    print("Dropping all tables...")
    await db_config.drop_tables()
    print("Creating fresh schema...")
    await db_config.create_tables()

    rng = np.random.RandomState(RANDOM_SEED)
    now = datetime.now(timezone.utc)

    stats = {
        "plants": 0,
        "nodes": 0,
        "chars": 0,
        "samples": 0,
        "measurements": 0,
        "users": 0,
        "violations": 0,
        "presets": 0,
    }

    async with db_config.session() as session:
        # ---------------------------------------------------------------
        # Users
        # ---------------------------------------------------------------
        print("Creating users...")
        hashed_pw = hash_password("password")

        admin_user = User(
            username="admin",
            email="admin@openspc.local",
            hashed_password=hashed_pw,
            is_active=True,
        )
        session.add(admin_user)
        await session.flush()
        stats["users"] += 1

        operator_user = User(
            username="operator",
            email="operator@openspc.local",
            hashed_password=hashed_pw,
            is_active=True,
        )
        session.add(operator_user)
        await session.flush()
        stats["users"] += 1

        print(f"  User: admin (admin)")
        print(f"  User: operator (operator)")

        # Collect plant IDs so we can assign roles after all plants are created
        plant_ids: list[int] = []

        # ===============================================================
        # PLANT 1 — A1: Distribution Fitting
        # ===============================================================
        print("\n" + "=" * 60)
        print("  PLANT 1: A1 — Distribution Fitting")
        print("=" * 60)

        plant1 = Plant(name="A1: Distribution Fitting", code="DIST", is_active=True)
        session.add(plant1)
        await session.flush()
        stats["plants"] += 1
        plant_ids.append(plant1.id)
        print(f"  Plant: {plant1.name} [{plant1.code}] (ID {plant1.id})")

        # Hierarchy: Distribution Analysis > Process Monitoring
        dist_area = Hierarchy(
            name="Distribution Analysis",
            type="Area",
            parent_id=None,
            plant_id=plant1.id,
        )
        session.add(dist_area)
        await session.flush()
        stats["nodes"] += 1

        dist_cell = Hierarchy(
            name="Process Monitoring",
            type="Cell",
            parent_id=dist_area.id,
            plant_id=plant1.id,
        )
        session.add(dist_cell)
        await session.flush()
        stats["nodes"] += 1
        print(f"  [Area] Distribution Analysis > [Cell] Process Monitoring")

        # -- Plant 1 characteristic definitions --
        p1_chars = [
            {
                "name": "Normal Baseline",
                "description": "Standard normal process (mu=50, sigma=2) — default capability",
                "target": 50.0, "usl": 56.0, "lsl": 44.0,
                "ucl": 56.0, "lcl": 44.0,
                "distribution_method": None,
                "box_cox_lambda": None,
                "distribution_params": None,
                "gen": lambda rng_: rng_.normal(50, 2, 100),
            },
            {
                "name": "Lognormal Process",
                "description": "Lognormal distribution (shape=0.5, scale=10) — Box-Cox transform",
                "target": 10.0, "usl": 25.0, "lsl": 5.0,
                "ucl": 22.0, "lcl": 5.0,
                "distribution_method": "box_cox",
                "box_cox_lambda": 0.3,
                "distribution_params": None,
                "gen": lambda rng_: sp_stats.lognorm.rvs(0.5, scale=10, size=100, random_state=rng_),
            },
            {
                "name": "Weibull Process",
                "description": "Weibull distribution (shape=2.5, scale=100) — distribution fit",
                "target": 89.0, "usl": 150.0, "lsl": 30.0,
                "ucl": 145.0, "lcl": 35.0,
                "distribution_method": "distribution_fit",
                "box_cox_lambda": None,
                "distribution_params": json.dumps({"family": "weibull", "shape": 2.5, "scale": 100}),
                "gen": lambda rng_: sp_stats.weibull_min.rvs(2.5, scale=100, size=100, random_state=rng_),
            },
            {
                "name": "Gamma Process",
                "description": "Gamma distribution (alpha=4, beta=2) — percentile fallback",
                "target": 8.0, "usl": 20.0, "lsl": 1.0,
                "ucl": 18.0, "lcl": 1.5,
                "distribution_method": "percentile",
                "box_cox_lambda": None,
                "distribution_params": None,
                "gen": lambda rng_: sp_stats.gamma.rvs(4, scale=2, size=100, random_state=rng_),
            },
            {
                "name": "Heavy-Tailed Mixed Normal",
                "description": "80% N(50,2) + 20% N(50,8) — auto-cascade test",
                "target": 50.0, "usl": 70.0, "lsl": 30.0,
                "ucl": 66.0, "lcl": 34.0,
                "distribution_method": "auto",
                "box_cox_lambda": None,
                "distribution_params": None,
                "gen": lambda rng_: np.where(
                    rng_.random(100) < 0.8,
                    rng_.normal(50, 2, 100),
                    rng_.normal(50, 8, 100),
                ),
            },
            {
                "name": "Pre-Configured Box-Cox",
                "description": "Lognormal (shape=0.4, scale=8) with pre-stored lambda=0.5",
                "target": 8.0, "usl": 20.0, "lsl": 2.0,
                "ucl": 18.0, "lcl": 2.5,
                "distribution_method": "box_cox",
                "box_cox_lambda": 0.5,
                "distribution_params": None,
                "gen": lambda rng_: sp_stats.lognorm.rvs(0.4, scale=8, size=100, random_state=rng_),
            },
        ]

        print("\n  Creating Plant 1 characteristics...")
        for c_def in p1_chars:
            char = Characteristic(
                hierarchy_id=dist_cell.id,
                name=c_def["name"],
                description=c_def["description"],
                subgroup_size=1,
                target_value=c_def["target"],
                usl=c_def["usl"],
                lsl=c_def["lsl"],
                ucl=c_def["ucl"],
                lcl=c_def["lcl"],
                distribution_method=c_def["distribution_method"],
                box_cox_lambda=c_def["box_cox_lambda"],
                distribution_params=c_def["distribution_params"],
            )
            session.add(char)
            await session.flush()
            stats["chars"] += 1

            # Nelson rules 1, 2 with default parameters
            for rule_id in [1, 2]:
                session.add(CharacteristicRule(
                    char_id=char.id,
                    rule_id=rule_id,
                    is_enabled=True,
                    require_acknowledgement=True,
                ))

            # Nelson checker for violations
            nelson = InlineNelsonChecker(
                cl=c_def["target"],
                ucl=c_def["ucl"],
                lcl=c_def["lcl"],
                enabled_rules=[1, 2],
            )

            # Generate data
            values = c_def["gen"](rng)
            total_samples = len(values)
            start_date = now - timedelta(hours=total_samples * 3)

            sample_count = 0
            meas_count = 0
            viol_count = 0

            for s_idx in range(total_samples):
                val = round(float(values[s_idx]), 4)
                sample_time = start_date + timedelta(hours=s_idx * 3)

                sample = Sample(
                    char_id=char.id,
                    timestamp=sample_time,
                    batch_number=f"DIST-{s_idx + 1:04d}",
                    operator_id="operator",
                    is_excluded=False,
                    actual_n=1,
                )
                session.add(sample)
                await session.flush()
                stats["samples"] += 1
                sample_count += 1

                session.add(Measurement(sample_id=sample.id, value=val))
                stats["measurements"] += 1
                meas_count += 1

                # Check Nelson rules
                triggered = nelson.check(val)
                for rule_id in triggered:
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
                    viol_count += 1

                if s_idx % 50 == 0 and s_idx > 0:
                    await session.flush()

            await session.flush()
            dist_hint = c_def["distribution_method"] or "normal (default)"
            print(f"    * {c_def['name']} (n=1, I-MR, {dist_hint}) "
                  f"— {sample_count} samples, {meas_count} meas, {viol_count} violations")

        # ===============================================================
        # PLANT 2 — A2: Custom Run Rules
        # ===============================================================
        print("\n" + "=" * 60)
        print("  PLANT 2: A2 — Custom Run Rules")
        print("=" * 60)

        plant2 = Plant(name="A2: Custom Run Rules", code="RULE", is_active=True)
        session.add(plant2)
        await session.flush()
        stats["plants"] += 1
        plant_ids.append(plant2.id)
        print(f"  Plant: {plant2.name} [{plant2.code}] (ID {plant2.id})")

        # Hierarchy: Rule Testing > SPC Workstation
        rule_area = Hierarchy(
            name="Rule Testing",
            type="Area",
            parent_id=None,
            plant_id=plant2.id,
        )
        session.add(rule_area)
        await session.flush()
        stats["nodes"] += 1

        rule_cell = Hierarchy(
            name="SPC Workstation",
            type="Cell",
            parent_id=rule_area.id,
            plant_id=plant2.id,
        )
        session.add(rule_cell)
        await session.flush()
        stats["nodes"] += 1
        print(f"  [Area] Rule Testing > [Cell] SPC Workstation")

        # Common parameters for Plant 2 chars
        P2_TARGET = 100.0
        P2_UCL = 106.0
        P2_LCL = 94.0
        P2_SIGMA = 2.0  # (UCL - target) / 3
        P2_SAMPLES = 80
        P2_SUBGROUP = 5

        def generate_p2_base_data(n_samples: int, subgroup_size: int, rng_: np.random.RandomState) -> list[list[float]]:
            """Generate base X-bar data: list of subgroups, each a list of measurements."""
            data = []
            for _ in range(n_samples):
                subgroup = [round(float(rng_.normal(P2_TARGET, P2_SIGMA)), 4) for _ in range(subgroup_size)]
                data.append(subgroup)
            return data

        async def create_p2_char(
            name: str,
            description: str,
            rules_config: list[dict],
            data: list[list[float]],
            char_id_out: list[int],
        ) -> None:
            """Create a Plant 2 characteristic with custom rules and pre-generated data."""
            char = Characteristic(
                hierarchy_id=rule_cell.id,
                name=name,
                description=description,
                subgroup_size=P2_SUBGROUP,
                target_value=P2_TARGET,
                usl=P2_UCL + 2,  # spec limits wider than control
                lsl=P2_LCL - 2,
                ucl=P2_UCL,
                lcl=P2_LCL,
            )
            session.add(char)
            await session.flush()
            stats["chars"] += 1
            char_id_out.append(char.id)

            # Create rules from config
            enabled_rule_ids = []
            for rc in rules_config:
                cr = CharacteristicRule(
                    char_id=char.id,
                    rule_id=rc["rule_id"],
                    is_enabled=rc["is_enabled"],
                    require_acknowledgement=rc.get("require_ack", True),
                    parameters=rc.get("parameters"),
                )
                session.add(cr)
                if rc["is_enabled"]:
                    enabled_rule_ids.append(rc["rule_id"])

            # Nelson checker with enabled rules
            nelson = InlineNelsonChecker(
                cl=P2_TARGET,
                ucl=P2_UCL,
                lcl=P2_LCL,
                enabled_rules=enabled_rule_ids,
            )

            start_date = now - timedelta(hours=len(data) * 3)
            sample_count = 0
            viol_count = 0

            for s_idx, subgroup in enumerate(data):
                sample_time = start_date + timedelta(hours=s_idx * 3)
                actual_n = len(subgroup)

                sample = Sample(
                    char_id=char.id,
                    timestamp=sample_time,
                    batch_number=f"RULE-{s_idx + 1:04d}",
                    operator_id="operator",
                    is_excluded=False,
                    actual_n=actual_n,
                )
                session.add(sample)
                await session.flush()
                stats["samples"] += 1
                sample_count += 1

                for val in subgroup:
                    session.add(Measurement(sample_id=sample.id, value=val))
                    stats["measurements"] += 1

                # Check violations using subgroup mean
                sample_mean = sum(subgroup) / len(subgroup)
                triggered = nelson.check(sample_mean)
                for rule_id in triggered:
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
                    viol_count += 1

                if s_idx % 50 == 0 and s_idx > 0:
                    await session.flush()

            await session.flush()
            print(f"    * {name} — {sample_count} samples, {viol_count} violations")

        print("\n  Creating Plant 2 characteristics...")

        # -- Char 1: Nelson Standard Preset (all 8 rules, default params) --
        # Bake in 9 consecutive same-side values at indices 40-48
        data_1 = generate_p2_base_data(P2_SAMPLES, P2_SUBGROUP, rng)
        for i in range(40, 49):
            # Force all measurements slightly above center
            data_1[i] = [round(P2_TARGET + 1.5, 4)] * P2_SUBGROUP

        rules_nelson = [
            {"rule_id": rid, "is_enabled": True, "require_ack": True, "parameters": None}
            for rid in range(1, 9)
        ]
        char1_id: list[int] = []
        await create_p2_char(
            "Nelson Standard Preset",
            "All 8 Nelson rules, default parameters. 9 same-side values baked at idx 40-48.",
            rules_nelson,
            data_1,
            char1_id,
        )

        # -- Char 2: AIAG Preset (rule 2 uses consecutive_count=7) --
        # Bake in 7 same-side values at indices 50-56
        data_2 = generate_p2_base_data(P2_SAMPLES, P2_SUBGROUP, rng)
        for i in range(50, 57):
            data_2[i] = [round(P2_TARGET + 1.5, 4)] * P2_SUBGROUP

        rules_aiag = []
        for rid in range(1, 9):
            params = None
            if rid == 2:
                params = json.dumps({"consecutive_count": 7})
            rules_aiag.append({
                "rule_id": rid, "is_enabled": True, "require_ack": True, "parameters": params,
            })
        char2_id: list[int] = []
        await create_p2_char(
            "AIAG Preset",
            "AIAG variant: Rule 2 uses consecutive_count=7. 7 same-side values at idx 50-56.",
            rules_aiag,
            data_2,
            char2_id,
        )

        # -- Char 3: Custom Sigma Rule (rule 1 with sigma_multiplier=2.5) --
        # Put a point at ~2.7 sigma above center at index 30
        data_3 = generate_p2_base_data(P2_SAMPLES, P2_SUBGROUP, rng)
        # 2.7 * (UCL-target)/3 above center = 2.7 * 2 = 5.4 above target
        data_3[30] = [round(P2_TARGET + 5.4, 4)] * P2_SUBGROUP

        rules_custom_sigma = [
            {"rule_id": 1, "is_enabled": True, "require_ack": True,
             "parameters": json.dumps({"sigma_multiplier": 2.5})},
            {"rule_id": 2, "is_enabled": True, "require_ack": True, "parameters": None},
        ]
        char3_id: list[int] = []
        await create_p2_char(
            "Custom Sigma Rule",
            "Rule 1 with sigma_multiplier=2.5. Point at 2.7 sigma above center at idx 30.",
            rules_custom_sigma,
            data_3,
            char3_id,
        )

        # -- Char 4: Custom Window Rule (rule 5 with count=3, window=4) --
        # Put 3-of-4 beyond 2 sigma at indices 60-63
        data_4 = generate_p2_base_data(P2_SAMPLES, P2_SUBGROUP, rng)
        two_sigma_val = P2_TARGET + 2.2 * P2_SIGMA  # slightly above 2-sigma
        for i in [60, 61, 63]:  # 3 of 4 beyond 2-sigma
            data_4[i] = [round(two_sigma_val, 4)] * P2_SUBGROUP
        # index 62 stays normal

        rules_custom_window = [
            {"rule_id": 1, "is_enabled": True, "require_ack": True, "parameters": None},
            {"rule_id": 5, "is_enabled": True, "require_ack": True,
             "parameters": json.dumps({"count": 3, "window": 4})},
        ]
        char4_id: list[int] = []
        await create_p2_char(
            "Custom Window Rule",
            "Rule 5 with count=3, window=4. 3-of-4 beyond 2 sigma at idx 60-63.",
            rules_custom_window,
            data_4,
            char4_id,
        )

        # -- Char 5: Selective Enable (only rule 1 enabled) --
        # Include patterns that WOULD trigger rule 2 and 3 but should NOT fire
        data_5 = generate_p2_base_data(P2_SAMPLES, P2_SUBGROUP, rng)
        # 9 same-side (would trigger rule 2 if enabled) at indices 20-28
        for i in range(20, 29):
            data_5[i] = [round(P2_TARGET + 1.2, 4)] * P2_SUBGROUP
        # 6 trending (would trigger rule 3 if enabled) at indices 50-55
        for offset, i in enumerate(range(50, 56)):
            data_5[i] = [round(P2_TARGET + 0.2 * (offset + 1), 4)] * P2_SUBGROUP

        rules_selective = [
            {"rule_id": 1, "is_enabled": True, "require_ack": True, "parameters": None},
        ]
        for rid in range(2, 9):
            rules_selective.append({
                "rule_id": rid, "is_enabled": False, "require_ack": False, "parameters": None,
            })
        char5_id: list[int] = []
        await create_p2_char(
            "Selective Enable",
            "Only Rule 1 enabled. Contains patterns that would trigger Rules 2 and 3 if enabled.",
            rules_selective,
            data_5,
            char5_id,
        )

        # -- Plant 2: Create RulePreset entries (plant-scoped) --
        print("\n  Creating rule presets...")

        preset_aiag = RulePreset(
            name="AIAG Custom (Plant 2)",
            description="AIAG variant with Rule 2 consecutive_count=7",
            is_builtin=False,
            plant_id=plant2.id,
            rules_config=json.dumps([
                {"rule_id": rid, "is_enabled": True, "parameters":
                    {"consecutive_count": 7} if rid == 2 else None}
                for rid in range(1, 9)
            ]),
        )
        session.add(preset_aiag)
        stats["presets"] += 1
        print(f"    Preset: {preset_aiag.name}")

        preset_custom_sigma = RulePreset(
            name="Custom Sigma 2.5 (Plant 2)",
            description="Rule 1 with sigma_multiplier=2.5, Rule 2 default",
            is_builtin=False,
            plant_id=plant2.id,
            rules_config=json.dumps([
                {"rule_id": 1, "is_enabled": True, "parameters": {"sigma_multiplier": 2.5}},
                {"rule_id": 2, "is_enabled": True, "parameters": None},
            ]),
        )
        session.add(preset_custom_sigma)
        stats["presets"] += 1
        print(f"    Preset: {preset_custom_sigma.name}")

        preset_custom_window = RulePreset(
            name="Custom Window 3-of-4 (Plant 2)",
            description="Rule 5 with count=3, window=4 plus Rule 1 default",
            is_builtin=False,
            plant_id=plant2.id,
            rules_config=json.dumps([
                {"rule_id": 1, "is_enabled": True, "parameters": None},
                {"rule_id": 5, "is_enabled": True, "parameters": {"count": 3, "window": 4}},
            ]),
        )
        session.add(preset_custom_window)
        stats["presets"] += 1
        print(f"    Preset: {preset_custom_window.name}")

        preset_selective = RulePreset(
            name="Rule 1 Only (Plant 2)",
            description="Only Rule 1 (beyond 3 sigma) enabled, all others disabled",
            is_builtin=False,
            plant_id=plant2.id,
            rules_config=json.dumps([
                {"rule_id": 1, "is_enabled": True, "parameters": None},
                *[{"rule_id": rid, "is_enabled": False, "parameters": None} for rid in range(2, 9)],
            ]),
        )
        session.add(preset_selective)
        stats["presets"] += 1
        print(f"    Preset: {preset_selective.name}")

        await session.flush()

        # ===============================================================
        # PLANT 3 — A3: Laney Charts
        # ===============================================================
        print("\n" + "=" * 60)
        print("  PLANT 3: A3 — Laney Charts")
        print("=" * 60)

        plant3 = Plant(name="A3: Laney Charts", code="LANY", is_active=True)
        session.add(plant3)
        await session.flush()
        stats["plants"] += 1
        plant_ids.append(plant3.id)
        print(f"  Plant: {plant3.name} [{plant3.code}] (ID {plant3.id})")

        # Hierarchy: Attribute Monitoring > Inspection Station
        laney_area = Hierarchy(
            name="Attribute Monitoring",
            type="Area",
            parent_id=None,
            plant_id=plant3.id,
        )
        session.add(laney_area)
        await session.flush()
        stats["nodes"] += 1

        laney_cell = Hierarchy(
            name="Inspection Station",
            type="Cell",
            parent_id=laney_area.id,
            plant_id=plant3.id,
        )
        session.add(laney_cell)
        await session.flush()
        stats["nodes"] += 1
        print(f"  [Area] Attribute Monitoring > [Cell] Inspection Station")

        P3_ATTR_SAMPLES = 60

        # Attribute rule config: rules 1-4 enabled
        attr_rules = [
            {"rule_id": rid, "is_enabled": True, "require_ack": True, "parameters": None}
            for rid in range(1, 5)
        ]

        async def create_attribute_char(
            name: str,
            description: str,
            chart_type: str,
            use_laney: bool,
            default_sample_sz: int,
            samples_data: list[dict],
        ) -> None:
            """Create an attribute characteristic with pre-generated sample data.

            samples_data: list of dicts with keys depending on chart type:
              p/np: {"defect_count": int, "sample_size": int}
              c/u: {"defect_count": int, "units_inspected": int}
            """
            char = Characteristic(
                hierarchy_id=laney_cell.id,
                name=name,
                description=description,
                subgroup_size=1,
                data_type="attribute",
                attribute_chart_type=chart_type,
                default_sample_size=default_sample_sz,
                use_laney_correction=use_laney,
            )
            session.add(char)
            await session.flush()
            stats["chars"] += 1

            # Attribute rules (1-4)
            for rc in attr_rules:
                session.add(CharacteristicRule(
                    char_id=char.id,
                    rule_id=rc["rule_id"],
                    is_enabled=rc["is_enabled"],
                    require_acknowledgement=rc.get("require_ack", True),
                    parameters=rc.get("parameters"),
                ))

            start_date = now - timedelta(hours=len(samples_data) * 4)
            sample_count = 0

            for s_idx, sd in enumerate(samples_data):
                sample_time = start_date + timedelta(hours=s_idx * 4)

                sample = Sample(
                    char_id=char.id,
                    timestamp=sample_time,
                    batch_number=f"LANY-{s_idx + 1:04d}",
                    operator_id="operator",
                    is_excluded=False,
                    actual_n=1,
                    defect_count=sd.get("defect_count"),
                    sample_size=sd.get("sample_size"),
                    units_inspected=sd.get("units_inspected"),
                )
                session.add(sample)
                stats["samples"] += 1
                sample_count += 1

                if s_idx % 50 == 0 and s_idx > 0:
                    await session.flush()

            await session.flush()
            laney_tag = "Laney" if use_laney else "Standard"
            print(f"    * {name} ({chart_type}-chart, {laney_tag}) — {sample_count} samples")

        print("\n  Creating Plant 3 characteristics...")

        # -- Char 1: p-chart Overdispersed (sigma_z ~ 1.8) --
        # Beta-binomial simulation: betabinom(n=200, a=2, b=8) gives p_bar ~ 0.20
        p3_c1_data = []
        for i in range(P3_ATTR_SAMPLES):
            defects = int(sp_stats.betabinom.rvs(200, 2, 8, random_state=rng))
            p3_c1_data.append({"defect_count": defects, "sample_size": 200})

        await create_attribute_char(
            "p-chart Overdispersed",
            "Beta-binomial overdispersion (sigma_z approx 1.8). Laney correction enabled.",
            "p",
            True,
            200,
            p3_c1_data,
        )

        # -- Char 2: p-chart Underdispersed (sigma_z ~ 0.6) --
        # Tight binomial with clipping to reduce variance
        p3_c2_data = []
        for i in range(P3_ATTR_SAMPLES):
            raw = int(sp_stats.binom.rvs(200, 0.10, random_state=rng))
            defects = int(np.clip(raw, 15, 25))
            p3_c2_data.append({"defect_count": defects, "sample_size": 200})

        await create_attribute_char(
            "p-chart Underdispersed",
            "Binomial with clipping for underdispersion (sigma_z approx 0.6). Laney correction enabled.",
            "p",
            True,
            200,
            p3_c2_data,
        )

        # -- Char 3: u-chart Overdispersed --
        # Negative binomial for overdispersion: nbinom(n=5, p=0.5) + 3
        p3_c3_data = []
        for i in range(P3_ATTR_SAMPLES):
            defects = int(sp_stats.nbinom.rvs(5, 0.5, random_state=rng)) + 3
            p3_c3_data.append({"defect_count": defects, "units_inspected": 50})

        await create_attribute_char(
            "u-chart Overdispersed",
            "Negative binomial overdispersion for u-chart. Laney correction enabled.",
            "u",
            True,
            50,
            p3_c3_data,
        )

        # -- Char 4: p-chart No-Laney Baseline (overdispersed, Laney OFF) --
        # Same distribution as char 1 but with different random draws and no Laney
        p3_c4_data = []
        for i in range(P3_ATTR_SAMPLES):
            defects = int(sp_stats.betabinom.rvs(200, 2, 8, random_state=rng))
            p3_c4_data.append({"defect_count": defects, "sample_size": 200})

        await create_attribute_char(
            "p-chart No-Laney Baseline",
            "Same overdispersed beta-binomial as char 1 but WITHOUT Laney correction for comparison.",
            "p",
            False,
            200,
            p3_c4_data,
        )

        # ---------------------------------------------------------------
        # Assign users to ALL plants
        # ---------------------------------------------------------------
        print("\n  Assigning users to all plants...")
        for pid in plant_ids:
            session.add(UserPlantRole(user_id=admin_user.id, plant_id=pid, role=UserRole.admin))
            session.add(UserPlantRole(user_id=operator_user.id, plant_id=pid, role=UserRole.operator))

        # ---------------------------------------------------------------
        # Final commit
        # ---------------------------------------------------------------
        print("\nCommitting to database...")
        await session.commit()

    await db_config.dispose()

    print("\n" + "=" * 60)
    print("  SPRINT 5 SEED COMPLETE")
    print("=" * 60)
    print(f"  Plants:          {stats['plants']}")
    print(f"  Hierarchy Nodes: {stats['nodes']}")
    print(f"  Users:           {stats['users']}")
    print(f"  Characteristics: {stats['chars']}")
    print(f"  Samples:         {stats['samples']:,}")
    print(f"  Measurements:    {stats['measurements']:,}")
    print(f"  Violations:      {stats['violations']:,}")
    print(f"  Rule Presets:    {stats['presets']}")
    print(f"  DB File:         {db_path}")
    print("=" * 60)
    print("\nAll users have password: 'password'")
    print("Admin: admin / password")
    print("Operator: operator / password")


def main() -> None:
    asyncio.run(seed())


if __name__ == "__main__":
    main()
