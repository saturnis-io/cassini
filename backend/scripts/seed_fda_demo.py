"""FDA pharma demo seed script for OpenSPC P12/P13 features.

Creates a realistic PharmaCorp solid dosage manufacturing scenario with:
- ISA-95 hierarchy (Area > Line > 4 Cells > 9 Characteristics)
- 5 users with pharma roles (QA Director, Process Engineer, etc.)
- 200 samples per characteristic with anomaly patterns (drift, shift, variance)
- Anomaly detection configs and pre-seeded anomaly events
- Electronic signature meanings, workflows, instances, and signatures
- FDA-strict password policy (21 CFR Part 11 compliance)

Run:
    python backend/scripts/seed_fda_demo.py
"""

import asyncio
import hashlib
import json
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
from openspc.db.models.anomaly import AnomalyDetectorConfig, AnomalyEvent
from openspc.db.models.api_key import APIKey  # noqa: F401 — registers model
from openspc.db.models.plant import Plant
from openspc.db.models.signature import (
    ElectronicSignature,
    PasswordPolicy,
    SignatureMeaning,
    SignatureWorkflow,
    SignatureWorkflowInstance,
    SignatureWorkflowStep,
)
from openspc.db.models.user import User, UserPlantRole, UserRole

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

RANDOM_SEED = 42
BASE_TIME = datetime(2026, 2, 4, 6, 0, 0, tzinfo=timezone.utc)
SAMPLE_INTERVAL = timedelta(minutes=48)
NUM_SAMPLES = 200
BATCH_SIZE = 30  # ~30 samples per batch

USERS = [
    # (username, password, full_name, role)
    ("admin", "password", "System Administrator", "admin"),
    ("dr.chen", "QaDirector2026!", "Dr. Sarah Chen", "admin"),
    ("m.rodriguez", "ProcEng2026!", "Maria Rodriguez", "engineer"),
    ("j.thompson", "ProdSuper2026!", "James Thompson", "supervisor"),
    ("a.patel", "LabTech2026!", "Aisha Patel", "operator"),
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
# ISA-95 hierarchy + characteristics definition
# ---------------------------------------------------------------------------

HIERARCHY = {
    "name": "Solid Dosage Manufacturing",
    "type": "Area",
    "children": [
        {
            "name": "Tablet Production Line 1",
            "type": "Line",
            "children": [
                {
                    "name": "Granulation",
                    "type": "Cell",
                    "characteristics": [
                        {
                            "key": "moisture",
                            "name": "Moisture Content (%)",
                            "subgroup_size": 5,
                            "target": 2.5, "usl": 3.5, "lsl": 1.5,
                            "ucl": 3.25, "lcl": 1.75,
                            "sigma": 0.25, "decimal_precision": 2,
                            "generator": "stable",
                        },
                        {
                            "key": "particle_size",
                            "name": "Particle Size (um)",
                            "subgroup_size": 5,
                            "target": 150.0, "usl": 200.0, "lsl": 100.0,
                            "ucl": 186.0, "lcl": 114.0,
                            "sigma": 12.0, "decimal_precision": 1,
                            "generator": "stable",
                        },
                    ],
                },
                {
                    "name": "Compression",
                    "type": "Cell",
                    "characteristics": [
                        {
                            "key": "tablet_weight",
                            "name": "Tablet Weight (mg)",
                            "subgroup_size": 5,
                            "target": 250.0, "usl": 255.0, "lsl": 245.0,
                            "ucl": 253.6, "lcl": 246.4,
                            "sigma": 1.2, "decimal_precision": 1,
                            "generator": "drift",
                            "drift_start": 150, "drift_rate": 0.008,
                        },
                        {
                            "key": "hardness",
                            "name": "Hardness (kP)",
                            "subgroup_size": 5,
                            "target": 8.0, "usl": 10.0, "lsl": 6.0,
                            "ucl": 9.5, "lcl": 6.5,
                            "sigma": 0.5, "decimal_precision": 2,
                            "generator": "shift",
                            "shift_at": 120, "shift_amount": 1.2,
                        },
                        {
                            "key": "thickness",
                            "name": "Thickness (mm)",
                            "subgroup_size": 5,
                            "target": 4.0, "usl": 4.5, "lsl": 3.5,
                            "ucl": 4.3, "lcl": 3.7,
                            "sigma": 0.1, "decimal_precision": 3,
                            "generator": "stable",
                        },
                        {
                            "key": "dissolution",
                            "name": "Dissolution Rate (%)",
                            "subgroup_size": 1,
                            "target": 85.0, "usl": 95.0, "lsl": 75.0,
                            "sigma": 2.0, "decimal_precision": 1,
                            "chart_type": "cusum",
                            "cusum_target": 85.0, "cusum_k": 0.5, "cusum_h": 5.0,
                            "generator": "stable",
                        },
                    ],
                },
                {
                    "name": "Coating",
                    "type": "Cell",
                    "characteristics": [
                        {
                            "key": "coating_weight",
                            "name": "Coating Weight Gain (%)",
                            "subgroup_size": 5,
                            "target": 3.0, "usl": 4.0, "lsl": 2.0,
                            "ucl": 3.75, "lcl": 2.25,
                            "sigma": 0.25, "decimal_precision": 2,
                            "generator": "variance",
                            "change_at": 100, "multiplier": 2.4,
                        },
                        {
                            "key": "film_thickness",
                            "name": "Film Thickness (um)",
                            "subgroup_size": 5,
                            "target": 50.0, "usl": 60.0, "lsl": 40.0,
                            "ucl": 57.5, "lcl": 42.5,
                            "sigma": 2.5, "decimal_precision": 1,
                            "generator": "stable",
                        },
                    ],
                },
                {
                    "name": "Packaging",
                    "type": "Cell",
                    "characteristics": [
                        {
                            "key": "seal_strength",
                            "name": "Seal Strength",
                            "subgroup_size": 50,
                            "data_type": "attribute",
                            "attribute_chart_type": "u",
                            "default_sample_size": 50,
                            "decimal_precision": 2,
                            "generator": "poisson",
                            "base_rate": 0.06, "trend_start": 100, "trend_rate": 0.03,
                        },
                    ],
                },
            ],
        },
    ],
}

# ---------------------------------------------------------------------------
# Data generators
# ---------------------------------------------------------------------------


def generate_stable(rng: random.Random, n: int, target: float, sigma: float, subgroup: int, **_kw) -> list[list[float]]:
    """Generate n subgroups of stable process data with occasional outliers."""
    result = []
    for _i in range(n):
        sg = [round(rng.gauss(target, sigma), 4) for _ in range(subgroup)]
        if rng.random() < 0.02:
            idx = rng.randint(0, subgroup - 1)
            direction = rng.choice([-1, 1])
            sg[idx] = round(target + direction * sigma * 2.8, 4)
        result.append(sg)
    return result


def generate_drift(
    rng: random.Random, n: int, target: float, sigma: float, subgroup: int,
    drift_start: int = 150, drift_rate: float = 0.008, **_kw,
) -> list[list[float]]:
    """Generate data with gradual upward drift starting at drift_start."""
    result = []
    for i in range(n):
        mean = target if i < drift_start else target + drift_rate * (i - drift_start)
        sg = [round(rng.gauss(mean, sigma), 4) for _ in range(subgroup)]
        result.append(sg)
    return result


def generate_shift(
    rng: random.Random, n: int, target: float, sigma: float, subgroup: int,
    shift_at: int = 120, shift_amount: float = 1.2, **_kw,
) -> list[list[float]]:
    """Generate data with abrupt mean shift at shift_at."""
    result = []
    for i in range(n):
        mean = target if i < shift_at else target + shift_amount
        sg = [round(rng.gauss(mean, sigma), 4) for _ in range(subgroup)]
        result.append(sg)
    return result


def generate_variance(
    rng: random.Random, n: int, target: float, sigma: float, subgroup: int,
    change_at: int = 100, multiplier: float = 2.4, **_kw,
) -> list[list[float]]:
    """Generate data with variance increase at change_at."""
    result = []
    for i in range(n):
        s = sigma if i < change_at else sigma * math.sqrt(multiplier)
        sg = [round(rng.gauss(target, s), 4) for _ in range(subgroup)]
        result.append(sg)
    return result


def generate_poisson(
    rng: random.Random, n: int, sample_size: int = 50,
    base_rate: float = 0.06, trend_start: int = 100, trend_rate: float = 0.03,
    **_kw,
) -> list[tuple[int, int, int]]:
    """Generate u-chart data (defect_count, sample_size, units_inspected)."""
    result = []
    for i in range(n):
        rate = base_rate if i < trend_start else base_rate + trend_rate * (i - trend_start)
        count = rng.randint(0, max(1, int(rng.expovariate(1 / (rate * sample_size)))))
        count = min(count, sample_size * 2)
        result.append((count, sample_size, sample_size))
    return result


GENERATORS = {
    "stable": generate_stable,
    "drift": generate_drift,
    "shift": generate_shift,
    "variance": generate_variance,
}

# ---------------------------------------------------------------------------
# Hash computation (matches core/signature_engine.py exactly)
# ---------------------------------------------------------------------------


def compute_resource_hash(resource_type: str, resource_data: dict) -> str:
    canonical = json.dumps(
        {"type": resource_type, **resource_data},
        sort_keys=True, separators=(",", ":"), default=str,
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def compute_signature_hash(
    user_id: int, timestamp: datetime, meaning_code: str, resource_hash: str,
) -> str:
    canonical = json.dumps(
        {
            "user_id": user_id,
            "timestamp": timestamp.isoformat(),
            "meaning_code": meaning_code,
            "resource_hash": resource_hash,
        },
        sort_keys=True, separators=(",", ":"),
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


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
            return n >= 1 and self._zone(vals[-1]) in ("BEYOND_UCL", "BEYOND_LCL")
        elif rule_id == 2:
            if n < 9:
                return False
            last9 = vals[-9:]
            return all(v > self.cl for v in last9) or all(v < self.cl for v in last9)
        elif rule_id == 3:
            if n < 6:
                return False
            last6 = vals[-6:]
            return (all(last6[i] < last6[i + 1] for i in range(5)) or
                    all(last6[i] > last6[i + 1] for i in range(5)))
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
            zones = [self._zone(v) for v in vals[-3:]]
            upper_a = sum(1 for z in zones if z in ("ZONE_A_UPPER", "BEYOND_UCL"))
            lower_a = sum(1 for z in zones if z in ("ZONE_A_LOWER", "BEYOND_LCL"))
            return upper_a >= 2 or lower_a >= 2
        elif rule_id == 6:
            if n < 5:
                return False
            zones = [self._zone(v) for v in vals[-5:]]
            upper_b = sum(1 for z in zones if z in ("ZONE_B_UPPER", "ZONE_A_UPPER", "BEYOND_UCL"))
            lower_b = sum(1 for z in zones if z in ("ZONE_B_LOWER", "ZONE_A_LOWER", "BEYOND_LCL"))
            return upper_b >= 4 or lower_b >= 4
        elif rule_id == 7:
            if n < 15:
                return False
            return all(self._zone(v).startswith("ZONE_C") for v in vals[-15:])
        elif rule_id == 8:
            if n < 8:
                return False
            return all(not self._zone(v).startswith("ZONE_C") for v in vals[-8:])
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

    stats = {
        "nodes": 0, "chars": 0, "samples": 0, "measurements": 0,
        "users": 0, "violations": 0, "anomaly_events": 0, "signatures": 0,
    }

    async with db_config.session() as session:
        # ── 1. Plant ──────────────────────────────────────────────────
        plant = Plant(name="PharmaCorp Solid Dosage - Building 7", code="PHARMA7", is_active=True)
        session.add(plant)
        await session.flush()
        print(f"  Plant: {plant.name} [{plant.code}] (ID {plant.id})")

        # ── 2. Users ──────────────────────────────────────────────────
        print("\nCreating users...")
        user_ids = {}  # username -> User
        for username, password, full_name, role_name in USERS:
            hashed_pw = hash_password(password)
            user = User(
                username=username, hashed_password=hashed_pw,
                is_active=True, full_name=full_name,
                password_changed_at=now, failed_login_count=0,
            )
            session.add(user)
            await session.flush()
            upr = UserPlantRole(user_id=user.id, plant_id=plant.id, role=UserRole(role_name))
            session.add(upr)
            user_ids[username] = user
            stats["users"] += 1
            print(f"  User: {username} ({role_name}) — {full_name}")

        # ── 3. Hierarchy + Characteristics + Samples ──────────────────
        print("\nCreating hierarchy, characteristics, and samples...")

        char_models = {}   # key -> Characteristic ORM instance
        sample_lists = {}  # key -> list[Sample ORM instances]
        enabled_rules = [1, 2, 3, 4, 5, 6]

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
                key = c_def["key"]
                is_attribute = c_def.get("data_type") == "attribute"

                char_kwargs = dict(
                    hierarchy_id=node.id,
                    name=c_def["name"],
                    subgroup_size=c_def["subgroup_size"],
                    decimal_precision=c_def.get("decimal_precision", 3),
                )

                if is_attribute:
                    char_kwargs.update(
                        data_type="attribute",
                        attribute_chart_type=c_def.get("attribute_chart_type"),
                        default_sample_size=c_def.get("default_sample_size"),
                    )
                else:
                    char_kwargs.update(
                        target_value=c_def.get("target"),
                        usl=c_def.get("usl"),
                        lsl=c_def.get("lsl"),
                        ucl=c_def.get("ucl"),
                        lcl=c_def.get("lcl"),
                        stored_sigma=c_def.get("sigma"),
                        stored_center_line=c_def.get("target"),
                    )
                    if c_def.get("chart_type"):
                        char_kwargs.update(
                            chart_type=c_def["chart_type"],
                            cusum_target=c_def.get("cusum_target"),
                            cusum_k=c_def.get("cusum_k"),
                            cusum_h=c_def.get("cusum_h"),
                        )

                char = Characteristic(**char_kwargs)
                session.add(char)
                await session.flush()
                char_models[key] = char
                stats["chars"] += 1
                print(f"{indent}  * {c_def['name']} (n={c_def['subgroup_size']}, {NUM_SAMPLES} samples)")

                # Nelson rules (all 8)
                for rule_id in range(1, 9):
                    session.add(CharacteristicRule(
                        char_id=char.id, rule_id=rule_id,
                        is_enabled=True,
                        require_acknowledgement=(rule_id <= 2),
                    ))

                # Nelson checker for violation generation
                nelson_checker = None
                if not is_attribute and c_def.get("ucl") is not None and c_def.get("lcl") is not None:
                    nelson_checker = InlineNelsonChecker(
                        cl=c_def["target"], ucl=c_def["ucl"], lcl=c_def["lcl"],
                        enabled_rules=enabled_rules,
                    )

                # Generate samples
                sample_lists[key] = []

                if is_attribute:
                    # Attribute (u-chart) data
                    attr_data = generate_poisson(
                        rng, NUM_SAMPLES,
                        sample_size=c_def.get("default_sample_size", 50),
                        base_rate=c_def.get("base_rate", 0.06),
                        trend_start=c_def.get("trend_start", 100),
                        trend_rate=c_def.get("trend_rate", 0.03),
                    )
                    for s_idx, (defects, sz, ui) in enumerate(attr_data):
                        sample_time = BASE_TIME + SAMPLE_INTERVAL * s_idx
                        batch_idx = min(s_idx // BATCH_SIZE, 6)
                        sample = Sample(
                            char_id=char.id,
                            timestamp=sample_time,
                            actual_n=1,
                            is_excluded=False,
                            defect_count=defects,
                            sample_size=sz,
                            units_inspected=ui,
                            batch_number=f"BATCH-2026-{batch_idx + 1:03d}",
                            operator_id="a.patel",
                        )
                        session.add(sample)
                        await session.flush()
                        sample_lists[key].append(sample)
                        stats["samples"] += 1
                else:
                    # Variable data
                    gen_name = c_def["generator"]
                    gen_func = GENERATORS[gen_name]
                    subgroup_data = gen_func(
                        rng, NUM_SAMPLES,
                        target=c_def["target"], sigma=c_def["sigma"],
                        subgroup=c_def["subgroup_size"],
                        **{k: c_def[k] for k in (
                            "drift_start", "drift_rate", "shift_at", "shift_amount",
                            "change_at", "multiplier",
                        ) if k in c_def},
                    )
                    for s_idx, sg_values in enumerate(subgroup_data):
                        sample_time = BASE_TIME + SAMPLE_INTERVAL * s_idx
                        batch_idx = min(s_idx // BATCH_SIZE, 6)
                        sample = Sample(
                            char_id=char.id,
                            timestamp=sample_time,
                            actual_n=len(sg_values),
                            is_excluded=False,
                            batch_number=f"BATCH-2026-{batch_idx + 1:03d}",
                            operator_id="a.patel",
                        )
                        session.add(sample)
                        await session.flush()
                        sample_lists[key].append(sample)
                        stats["samples"] += 1

                        for val in sg_values:
                            session.add(Measurement(sample_id=sample.id, value=val))
                            stats["measurements"] += 1

                        # Nelson rules check
                        if nelson_checker is not None:
                            sample_mean = sum(sg_values) / len(sg_values)
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

            for child_def in node_def.get("children", []):
                await create_tree(child_def, node.id, depth + 1)

        await create_tree(HIERARCHY, None, 0)

        # ── 4. Anomaly detection configs ──────────────────────────────
        print("\nCreating anomaly detection configs...")
        anomaly_chars = {
            "tablet_weight": {"pelt_model": "l2"},
            "hardness": {"pelt_model": "l2"},
            "coating_weight": {"pelt_model": "rbf"},
        }
        for key, cfg in anomaly_chars.items():
            session.add(AnomalyDetectorConfig(
                char_id=char_models[key].id,
                is_enabled=True,
                pelt_enabled=True, pelt_model=cfg["pelt_model"],
                pelt_penalty="auto", pelt_min_segment=5,
                ks_enabled=True, ks_reference_window=200,
                ks_test_window=50, ks_alpha=0.05,
                iforest_enabled=False,
                notify_on_changepoint=True,
                notify_on_distribution_shift=True,
            ))
            print(f"  Config: {key} (PELT {cfg['pelt_model']} + K-S)")

        await session.flush()

        # ── 5. Pre-seeded anomaly events ──────────────────────────────
        print("\nCreating anomaly events...")

        # Event 1: PELT changepoint on Hardness at ~sample 120
        h_samples = sample_lists["hardness"]
        session.add(AnomalyEvent(
            char_id=char_models["hardness"].id,
            detector_type="pelt", event_type="changepoint", severity="CRITICAL",
            details={
                "changepoint_index": 120,
                "before_mean": 8.01, "after_mean": 9.19,
                "shift_magnitude": 1.18, "confidence": 0.97, "model": "l2",
            },
            sample_id=h_samples[120].id,
            window_start_id=h_samples[115].id,
            window_end_id=h_samples[125].id,
            summary="PELT detected mean shift of +1.18 kP in Hardness at sample 120. "
                    "Process mean shifted from 8.01 to 9.19 kP, approaching USL (10.0 kP).",
            detected_at=BASE_TIME + SAMPLE_INTERVAL * 125,
        ))
        stats["anomaly_events"] += 1

        # Event 2: K-S distribution shift on Tablet Weight
        tw_samples = sample_lists["tablet_weight"]
        session.add(AnomalyEvent(
            char_id=char_models["tablet_weight"].id,
            detector_type="ks_test", event_type="distribution_shift", severity="WARNING",
            details={
                "ks_statistic": 0.32, "p_value": 0.0021,
                "reference_mean": 250.01, "test_mean": 250.38,
                "reference_std": 1.19, "test_std": 1.22,
            },
            window_start_id=tw_samples[150].id,
            window_end_id=tw_samples[199].id,
            summary="K-S test detected gradual distribution shift in Tablet Weight. "
                    "Mean drifted from 250.01 to 250.38 mg (p=0.002).",
            detected_at=BASE_TIME + SAMPLE_INTERVAL * 199,
        ))
        stats["anomaly_events"] += 1

        # Event 3: PELT variance change on Coating Weight Gain at ~sample 100
        cw_samples = sample_lists["coating_weight"]
        session.add(AnomalyEvent(
            char_id=char_models["coating_weight"].id,
            detector_type="pelt", event_type="changepoint", severity="CRITICAL",
            details={
                "changepoint_index": 100,
                "before_variance": 0.063, "after_variance": 0.150,
                "variance_ratio": 2.38, "model": "rbf",
            },
            sample_id=cw_samples[100].id,
            window_start_id=cw_samples[95].id,
            window_end_id=cw_samples[105].id,
            summary="PELT detected 2.4x variance increase in Coating Weight Gain at sample 100. "
                    "Process variability increased significantly, risk of out-of-spec coating.",
            detected_at=BASE_TIME + SAMPLE_INTERVAL * 105,
        ))
        stats["anomaly_events"] += 1

        # Event 4: K-S distribution shape change on Coating Weight Gain
        session.add(AnomalyEvent(
            char_id=char_models["coating_weight"].id,
            detector_type="ks_test", event_type="distribution_shift", severity="WARNING",
            details={
                "ks_statistic": 0.28, "p_value": 0.0087,
                "reference_mean": 3.00, "test_mean": 2.98,
                "reference_std": 0.25, "test_std": 0.39,
            },
            window_start_id=cw_samples[100].id,
            window_end_id=cw_samples[149].id,
            summary="K-S test detected distribution shape change in Coating Weight Gain. "
                    "Variance increased from 0.25 to 0.39 (p=0.009), mean stable at 2.98%.",
            detected_at=BASE_TIME + SAMPLE_INTERVAL * 149,
        ))
        stats["anomaly_events"] += 1

        await session.flush()

        # ── 6. Signature meanings ─────────────────────────────────────
        print("\nCreating signature meanings...")
        meaning_defs = [
            ("reviewed", "Reviewed", "Document or record has been reviewed for accuracy and completeness.", False, 1),
            ("approved", "Approved", "Record approved per GMP requirements. Confirms data integrity.", False, 2),
            ("released", "Released", "Batch or report released for the next process step or distribution.", False, 3),
            ("rejected", "Rejected", "Record rejected. Requires corrective action before re-submission.", True, 4),
            ("corrective_action", "Corrective Action Required", "Investigation and CAPA required before process can continue.", True, 5),
        ]
        for code, display, desc, req_comment, sort in meaning_defs:
            session.add(SignatureMeaning(
                plant_id=plant.id, code=code, display_name=display,
                description=desc, requires_comment=req_comment,
                is_active=True, sort_order=sort,
            ))
            print(f"  Meaning: {display}")
        await session.flush()

        # ── 7. Signature workflows ────────────────────────────────────
        print("\nCreating signature workflows...")

        # Workflow 1: Sample Approval (2-step)
        wf_sample = SignatureWorkflow(
            plant_id=plant.id, name="Sample Approval",
            resource_type="sample_approval", is_active=True, is_required=True,
            description="Two-step approval for production samples. Supervisor reviews, then QA admin approves.",
        )
        session.add(wf_sample)
        await session.flush()

        wf_sample_step1 = SignatureWorkflowStep(
            workflow_id=wf_sample.id, step_order=1, name="Supervisor Review",
            min_role="supervisor", meaning_code="reviewed",
            is_required=True, allow_self_sign=False, timeout_hours=24,
        )
        wf_sample_step2 = SignatureWorkflowStep(
            workflow_id=wf_sample.id, step_order=2, name="QA Approval",
            min_role="admin", meaning_code="approved",
            is_required=True, allow_self_sign=False, timeout_hours=48,
        )
        session.add_all([wf_sample_step1, wf_sample_step2])
        await session.flush()
        print(f"  Workflow: Sample Approval (2-step) — ID {wf_sample.id}")

        # Workflow 2: Limit Change Approval (2-step)
        wf_limit = SignatureWorkflow(
            plant_id=plant.id, name="Limit Change Approval",
            resource_type="limit_change", is_active=True, is_required=True,
            description="Two-step approval for control or spec limit changes. Engineer reviews, QA releases.",
        )
        session.add(wf_limit)
        await session.flush()

        session.add_all([
            SignatureWorkflowStep(
                workflow_id=wf_limit.id, step_order=1, name="Engineering Review",
                min_role="engineer", meaning_code="reviewed",
                is_required=True, allow_self_sign=False, timeout_hours=48,
            ),
            SignatureWorkflowStep(
                workflow_id=wf_limit.id, step_order=2, name="QA Release",
                min_role="admin", meaning_code="released",
                is_required=True, allow_self_sign=False, timeout_hours=72,
            ),
        ])
        await session.flush()
        print(f"  Workflow: Limit Change Approval (2-step) — ID {wf_limit.id}")

        # Workflow 3: Report Release (1-step)
        wf_report = SignatureWorkflow(
            plant_id=plant.id, name="Report Release",
            resource_type="report_release", is_active=True, is_required=True,
            description="Single-step release for finalized SPC reports.",
        )
        session.add(wf_report)
        await session.flush()

        wf_report_step1 = SignatureWorkflowStep(
            workflow_id=wf_report.id, step_order=1, name="QA Release",
            min_role="admin", meaning_code="released",
            is_required=True, allow_self_sign=True, timeout_hours=72,
        )
        session.add(wf_report_step1)
        await session.flush()
        print(f"  Workflow: Report Release (1-step) — ID {wf_report.id}")

        # ── 8. Pre-seeded signature instances ─────────────────────────
        print("\nCreating signature instances...")

        # Instance 1: Sample approval for Tablet Weight sample #50 — completed
        target_sample = tw_samples[49]
        inst1 = SignatureWorkflowInstance(
            workflow_id=wf_sample.id,
            resource_type="sample_approval", resource_id=target_sample.id,
            status="completed", current_step=2,
            initiated_by=user_ids["a.patel"].id,
            completed_at=now,
        )
        session.add(inst1)
        await session.flush()

        # Sig 1a: j.thompson reviewed
        sig1_ts = datetime(2026, 2, 6, 14, 30, 0, tzinfo=timezone.utc)
        sig1_res_hash = compute_resource_hash("sample_approval", {"resource_id": target_sample.id})
        sig1_hash = compute_signature_hash(user_ids["j.thompson"].id, sig1_ts, "reviewed", sig1_res_hash)
        session.add(ElectronicSignature(
            user_id=user_ids["j.thompson"].id,
            username="j.thompson", full_name="James Thompson",
            timestamp=sig1_ts, meaning_code="reviewed", meaning_display="Reviewed",
            resource_type="sample_approval", resource_id=target_sample.id,
            resource_hash=sig1_res_hash, signature_hash=sig1_hash,
            ip_address="10.0.7.42",
            workflow_step_id=wf_sample_step1.id,
            comment="Tablet weight within specification. Process stable at this point.",
            is_valid=True,
        ))
        stats["signatures"] += 1

        # Sig 1b: dr.chen approved
        sig2_ts = datetime(2026, 2, 6, 16, 45, 0, tzinfo=timezone.utc)
        sig2_hash = compute_signature_hash(user_ids["dr.chen"].id, sig2_ts, "approved", sig1_res_hash)
        session.add(ElectronicSignature(
            user_id=user_ids["dr.chen"].id,
            username="dr.chen", full_name="Dr. Sarah Chen",
            timestamp=sig2_ts, meaning_code="approved", meaning_display="Approved",
            resource_type="sample_approval", resource_id=target_sample.id,
            resource_hash=sig1_res_hash, signature_hash=sig2_hash,
            ip_address="10.0.7.15",
            workflow_step_id=wf_sample_step2.id,
            comment="Approved. Granulation and compression parameters nominal.",
            is_valid=True,
        ))
        stats["signatures"] += 1
        print(f"  Instance 1: Sample approval for Tablet Weight #50 — 2 signatures")

        # Instance 2: Report release — completed, signed by dr.chen
        inst2 = SignatureWorkflowInstance(
            workflow_id=wf_report.id,
            resource_type="report_release", resource_id=1,
            status="completed", current_step=1,
            initiated_by=user_ids["dr.chen"].id,
            completed_at=now,
        )
        session.add(inst2)
        await session.flush()

        sig3_ts = datetime(2026, 2, 7, 9, 0, 0, tzinfo=timezone.utc)
        sig3_res_hash = compute_resource_hash("report_release", {"resource_id": 1})
        sig3_hash = compute_signature_hash(user_ids["dr.chen"].id, sig3_ts, "released", sig3_res_hash)
        session.add(ElectronicSignature(
            user_id=user_ids["dr.chen"].id,
            username="dr.chen", full_name="Dr. Sarah Chen",
            timestamp=sig3_ts, meaning_code="released", meaning_display="Released",
            resource_type="report_release", resource_id=1,
            resource_hash=sig3_res_hash, signature_hash=sig3_hash,
            ip_address="10.0.7.15",
            workflow_step_id=wf_report_step1.id,
            comment="Weekly SPC summary report released. All characteristics within control.",
            is_valid=True,
        ))
        stats["signatures"] += 1
        print(f"  Instance 2: Report release — 1 signature")

        # ── 9. Password policy (FDA-strict) ───────────────────────────
        print("\nCreating FDA-strict password policy...")
        session.add(PasswordPolicy(
            plant_id=plant.id,
            password_expiry_days=90,
            max_failed_attempts=5,
            lockout_duration_minutes=30,
            min_password_length=12,
            require_uppercase=True,
            require_lowercase=True,
            require_digit=True,
            require_special=True,
            password_history_count=12,
            session_timeout_minutes=30,
            signature_timeout_minutes=5,
        ))
        print("  Policy: 90d expiry, 12-char min, all complexity, 5 attempts, 30min lockout")

        # ── 10. Commit ────────────────────────────────────────────────
        print("\nCommitting to database...")
        await session.commit()

    await db_config.dispose()

    print("\n" + "=" * 60)
    print("  FDA PHARMA DEMO SEED COMPLETE")
    print("=" * 60)
    print(f"  Plant:           PharmaCorp Solid Dosage - Building 7 (PHARMA7)")
    print(f"  Users:           {stats['users']}")
    print(f"  Hierarchy Nodes: {stats['nodes']}")
    print(f"  Characteristics: {stats['chars']}")
    print(f"  Samples:         {stats['samples']:,}")
    print(f"  Measurements:    {stats['measurements']:,}")
    print(f"  Violations:      {stats['violations']:,}")
    print(f"  Anomaly Events:  {stats['anomaly_events']}")
    print(f"  Signatures:      {stats['signatures']}")
    print("=" * 60)
    print("\nUser credentials:")
    for username, password, full_name, role in USERS:
        print(f"  {username:15s} {role:12s} {password}")


def main() -> None:
    asyncio.run(seed())


if __name__ == "__main__":
    main()
