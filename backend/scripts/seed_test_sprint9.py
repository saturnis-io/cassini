"""Sprint 9: Advanced Analytics seed script for OpenSPC.

Creates 4 plants scaffolding multivariate SPC, predictive analytics,
correlation studies, and DOE scenarios:
  - E1: Multivariate Process  (3 correlated chars, ~600 samples)
  - E2: Predictive Process    (1 char with drift, ~120 samples, ~600 measurements)
  - E4: Correlation Study     (4 chars in 2 pairs, ~600 samples)
  - E5: DOE Study             (2 response chars, ~80 samples)

Estimated total: ~1,400 samples

Run:
    python backend/scripts/seed_test_sprint9.py
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
from openspc.db.models.doe import DOEFactor, DOERun, DOEStudy
from openspc.db.models.multivariate import MultivariateGroup, MultivariateGroupMember
from openspc.db.models.plant import Plant
from openspc.db.models.prediction import PredictionConfig
from openspc.db.models.user import User, UserPlantRole, UserRole

logger = logging.getLogger(__name__)
RANDOM_SEED = 42

USERS = [
    ("admin",    "admin@openspc.local",    "admin"),
    ("operator", "operator@openspc.local", "operator"),
]

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
# Multivariate normal generator (Cholesky decomposition)
# ---------------------------------------------------------------------------


def multivariate_normal(rng: random.Random, mean: list[float], cov: list[list[float]], n: int) -> list[list[float]]:
    """Generate n samples from a multivariate normal distribution.

    Uses Cholesky decomposition to correlate independent standard normals.
    """
    dim = len(mean)

    # Cholesky decomposition of covariance matrix (lower triangular L where cov = L * L^T)
    L = [[0.0] * dim for _ in range(dim)]
    for i in range(dim):
        for j in range(i + 1):
            s = sum(L[i][k] * L[j][k] for k in range(j))
            if i == j:
                L[i][j] = math.sqrt(cov[i][i] - s)
            else:
                L[i][j] = (cov[i][j] - s) / L[j][j]

    # Generate samples
    samples = []
    for _ in range(n):
        z = [rng.gauss(0, 1) for _ in range(dim)]
        x = [0.0] * dim
        for i in range(dim):
            x[i] = mean[i] + sum(L[i][j] * z[j] for j in range(i + 1))
        samples.append(x)

    return samples


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
        # Helper: create characteristic + rules + nelson checker
        # ---------------------------------------------------------------
        async def create_char(
            hierarchy_id: int, name: str, description: str,
            subgroup_size: int, target: float, usl: float, lsl: float,
            ucl: float, lcl: float, rules: list[int],
        ) -> tuple[Characteristic, InlineNelsonChecker]:
            char = Characteristic(
                hierarchy_id=hierarchy_id,
                name=name,
                description=description,
                subgroup_size=subgroup_size,
                target_value=target,
                usl=usl, lsl=lsl,
                ucl=ucl, lcl=lcl,
            )
            session.add(char)
            await session.flush()
            stats["chars"] += 1

            for rule_id in rules:
                session.add(CharacteristicRule(
                    char_id=char.id,
                    rule_id=rule_id,
                    is_enabled=True,
                    require_acknowledgement=True,
                ))

            nelson = InlineNelsonChecker(cl=target, ucl=ucl, lcl=lcl, enabled_rules=rules)
            chart_hint = "I-MR" if subgroup_size == 1 else f"Xbar-R (n={subgroup_size})"
            print(f"    * {name} (n={subgroup_size}, {chart_hint})")
            return char, nelson

        # ---------------------------------------------------------------
        # Helper: add sample with measurements + nelson check
        # ---------------------------------------------------------------
        async def add_sample(
            char: Characteristic, nelson: InlineNelsonChecker,
            values: list[float], timestamp: datetime, batch_number: str,
        ) -> None:
            actual_n = len(values)
            sample = Sample(
                char_id=char.id,
                timestamp=timestamp,
                batch_number=batch_number,
                operator_id="operator",
                is_excluded=False,
                actual_n=actual_n,
            )
            session.add(sample)
            await session.flush()
            stats["samples"] += 1

            for val in values:
                session.add(Measurement(sample_id=sample.id, value=round(val, 4)))
                stats["measurements"] += 1

            sample_mean = sum(values) / len(values)
            triggered_rules = nelson.check(sample_mean)
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

        # ---------------------------------------------------------------
        # 1. Create all plants
        # ---------------------------------------------------------------
        plant_names = [
            ("E1: Multivariate Process", "MVAR"),
            ("E2: Predictive Process", "PRED"),
            ("E4: Correlation Study", "CORR"),
            ("E5: DOE Study", "DOE"),
        ]
        plant_objs: dict[str, Plant] = {}
        for pname, pcode in plant_names:
            plant = Plant(name=pname, code=pcode, is_active=True)
            session.add(plant)
            await session.flush()
            plant_objs[pcode] = plant
            stats["plants"] += 1
            print(f"  Plant: {pname} [{pcode}] (ID {plant.id})")

        # 2. Users (assigned to all plants)
        print("\nCreating users...")
        hashed_pw = hash_password("password")
        for username, email, role_name in USERS:
            user = User(username=username, email=email, hashed_password=hashed_pw, is_active=True)
            session.add(user)
            await session.flush()
            for plant in plant_objs.values():
                upr = UserPlantRole(user_id=user.id, plant_id=plant.id, role=UserRole(role_name))
                session.add(upr)
            stats["users"] += 1
            print(f"  User: {username} ({role_name}) -> all {len(plant_objs)} plants")

        # ===============================================================
        # PLANT E1: Multivariate Process
        # ===============================================================
        print("\n--- E1: Multivariate Process ---")
        p_mvar = plant_objs["MVAR"]
        area_chem = Hierarchy(name="Chemical Processing", type="Area", parent_id=None, plant_id=p_mvar.id)
        session.add(area_chem)
        await session.flush()
        stats["nodes"] += 1
        print(f"  [Area] Chemical Processing (ID {area_chem.id})")

        cell_reactor = Hierarchy(name="Reactor 1", type="Cell", parent_id=area_chem.id, plant_id=p_mvar.id)
        session.add(cell_reactor)
        await session.flush()
        stats["nodes"] += 1
        print(f"    [Cell] Reactor 1 (ID {cell_reactor.id})")

        # 3 correlated characteristics
        char_temp, nelson_temp = await create_char(
            cell_reactor.id, "Temperature (degC)", "Reactor temperature",
            subgroup_size=1, target=180.0, usl=190.0, lsl=170.0, ucl=189.0, lcl=171.0,
            rules=[1, 2, 3],
        )
        char_pres, nelson_pres = await create_char(
            cell_reactor.id, "Pressure (kPa)", "Reactor pressure",
            subgroup_size=1, target=450.0, usl=475.0, lsl=425.0, ucl=474.0, lcl=426.0,
            rules=[1, 2, 3],
        )
        char_flow, nelson_flow = await create_char(
            cell_reactor.id, "Flow Rate (L/min)", "Inlet flow rate",
            subgroup_size=1, target=25.0, usl=28.5, lsl=21.5, ucl=28.6, lcl=21.4,
            rules=[1, 2, 3],
        )

        # Generate 200 correlated samples
        mean_e1 = [180.0, 450.0, 25.0]
        cov_e1 = [
            [9.0,   20.4,  3.06],    # rho(T,P) ~ 0.85, rho(T,F) ~ 0.85
            [20.4,  64.0,  8.16],    # rho(P,F) ~ 0.85
            [3.06,  8.16,  1.44],
        ]
        mv_data = multivariate_normal(rng, mean_e1, cov_e1, 200)
        start_date_e1 = now - timedelta(hours=200 * 2)

        chars_e1 = [(char_temp, nelson_temp), (char_pres, nelson_pres), (char_flow, nelson_flow)]
        for s_idx, row in enumerate(mv_data):
            ts = start_date_e1 + timedelta(hours=s_idx * 2)
            batch = f"RX-{s_idx + 1:04d}"
            for dim_idx, (char, nelson) in enumerate(chars_e1):
                await add_sample(char, nelson, [row[dim_idx]], ts, batch)
            if s_idx % 50 == 0 and s_idx > 0:
                await session.flush()

        await session.flush()
        print(f"    Generated 200 correlated samples x 3 chars = 600 samples")

        # ===============================================================
        # PLANT E2: Predictive Process
        # ===============================================================
        print("\n--- E2: Predictive Process ---")
        p_pred = plant_objs["PRED"]
        area_pkg = Hierarchy(name="Packaging Line", type="Area", parent_id=None, plant_id=p_pred.id)
        session.add(area_pkg)
        await session.flush()
        stats["nodes"] += 1
        print(f"  [Area] Packaging Line (ID {area_pkg.id})")

        cell_filler = Hierarchy(name="Filler Unit", type="Cell", parent_id=area_pkg.id, plant_id=p_pred.id)
        session.add(cell_filler)
        await session.flush()
        stats["nodes"] += 1
        print(f"    [Cell] Filler Unit (ID {cell_filler.id})")

        char_fill, nelson_fill = await create_char(
            cell_filler.id, "Fill Weight (g)", "Net fill weight",
            subgroup_size=5, target=500.0, usl=505.0, lsl=495.0, ucl=502.0, lcl=498.0,
            rules=[1, 2, 3],
        )

        # 120 samples with gradual drift (+0.015 per sample)
        start_date_e2 = now - timedelta(hours=120 * 2)
        for s_idx in range(120):
            ts = start_date_e2 + timedelta(hours=s_idx * 2)
            batch = f"PKG-{s_idx + 1:04d}"
            drifted_mean = 500.0 + 0.015 * s_idx
            values = [round(rng.gauss(drifted_mean, 0.5), 4) for _ in range(5)]
            await add_sample(char_fill, nelson_fill, values, ts, batch)
            if s_idx % 50 == 0 and s_idx > 0:
                await session.flush()

        await session.flush()
        print(f"    Generated 120 samples x 5 measurements = 600 measurements (drift +0.015/sample)")

        # ===============================================================
        # PLANT E4: Correlation Study
        # ===============================================================
        print("\n--- E4: Correlation Study ---")
        p_corr = plant_objs["CORR"]
        area_mach = Hierarchy(name="Machining Center", type="Area", parent_id=None, plant_id=p_corr.id)
        session.add(area_mach)
        await session.flush()
        stats["nodes"] += 1
        print(f"  [Area] Machining Center (ID {area_mach.id})")

        cell_turn = Hierarchy(name="Turning", type="Cell", parent_id=area_mach.id, plant_id=p_corr.id)
        session.add(cell_turn)
        await session.flush()
        stats["nodes"] += 1
        print(f"    [Cell] Turning (ID {cell_turn.id})")

        # High-correlation pair (rho ~ 0.90)
        char_diam, nelson_diam = await create_char(
            cell_turn.id, "Shaft Diameter (mm)", "Turned shaft OD",
            subgroup_size=1, target=20.000, usl=20.040, lsl=19.960, ucl=20.030, lcl=19.970,
            rules=[1, 2],
        )
        char_round, nelson_round = await create_char(
            cell_turn.id, "Shaft Roundness (mm)", "Shaft roundness deviation",
            subgroup_size=1, target=0.005, usl=0.011, lsl=0.000, ucl=0.011, lcl=0.000,
            rules=[1, 2],
        )

        # Low-correlation pair (rho ~ 0.10)
        char_rough, nelson_rough = await create_char(
            cell_turn.id, "Surface Roughness Ra (um)", "Surface roughness average",
            subgroup_size=1, target=0.800, usl=1.100, lsl=0.500, ucl=1.100, lcl=0.500,
            rules=[1, 2],
        )
        char_hard, nelson_hard = await create_char(
            cell_turn.id, "Hardness (HRC)", "Rockwell hardness C",
            subgroup_size=1, target=60.0, usl=64.5, lsl=55.5, ucl=64.5, lcl=55.5,
            rules=[1, 2],
        )

        # High-correlation data
        mean_hi = [20.000, 0.005]
        cov_hi = [
            [0.0001,   0.000018],
            [0.000018, 0.000004],
        ]
        data_hi = multivariate_normal(rng, mean_hi, cov_hi, 150)

        # Low-correlation data
        mean_lo = [0.800, 60.0]
        cov_lo = [
            [0.01,  0.015],
            [0.015, 2.25],
        ]
        data_lo = multivariate_normal(rng, mean_lo, cov_lo, 150)

        start_date_e4 = now - timedelta(hours=150 * 2)
        chars_hi = [(char_diam, nelson_diam), (char_round, nelson_round)]
        chars_lo = [(char_rough, nelson_rough), (char_hard, nelson_hard)]

        for s_idx in range(150):
            ts = start_date_e4 + timedelta(hours=s_idx * 2)
            batch = f"TRN-{s_idx + 1:04d}"

            # High-correlation pair
            for dim_idx, (char, nelson) in enumerate(chars_hi):
                val = data_hi[s_idx][dim_idx]
                # Clamp roundness to non-negative
                if dim_idx == 1:
                    val = max(val, 0.0)
                await add_sample(char, nelson, [val], ts, batch)

            # Low-correlation pair
            for dim_idx, (char, nelson) in enumerate(chars_lo):
                await add_sample(char, nelson, [data_lo[s_idx][dim_idx]], ts, batch)

            if s_idx % 50 == 0 and s_idx > 0:
                await session.flush()

        await session.flush()
        print(f"    Generated 150 samples x 4 chars = 600 samples (2 pairs: rho~0.90 + rho~0.10)")

        # ===============================================================
        # PLANT E5: DOE Study
        # ===============================================================
        print("\n--- E5: DOE Study ---")
        p_doe = plant_objs["DOE"]
        area_dev = Hierarchy(name="Process Development", type="Area", parent_id=None, plant_id=p_doe.id)
        session.add(area_dev)
        await session.flush()
        stats["nodes"] += 1
        print(f"  [Area] Process Development (ID {area_dev.id})")

        cell_exp = Hierarchy(name="Experiment Bay", type="Cell", parent_id=area_dev.id, plant_id=p_doe.id)
        session.add(cell_exp)
        await session.flush()
        stats["nodes"] += 1
        print(f"    [Cell] Experiment Bay (ID {cell_exp.id})")

        char_yield, nelson_yield = await create_char(
            cell_exp.id, "Yield (%)", "Process yield",
            subgroup_size=1, target=85.0, usl=95.0, lsl=75.0, ucl=90.0, lcl=80.0,
            rules=[1, 2],
        )
        char_purity, nelson_purity = await create_char(
            cell_exp.id, "Purity (%)", "Product purity",
            subgroup_size=1, target=98.0, usl=100.0, lsl=96.0, ucl=99.5, lcl=96.5,
            rules=[1, 2],
        )

        # 2^3 factorial design: 8 runs x 5 replicates = 40 samples per response
        runs = [
            (-1, -1, -1), (1, -1, -1), (-1, 1, -1), (1, 1, -1),
            (-1, -1,  1), (1, -1,  1), (-1, 1,  1), (1, 1,  1),
        ]

        start_date_e5 = now - timedelta(hours=40 * 4)
        sample_counter = 0

        for run_idx, (a, b, c) in enumerate(runs):
            for rep in range(5):
                ts = start_date_e5 + timedelta(hours=sample_counter * 4)
                batch = f"Run-{run_idx + 1:02d}-Rep-{rep + 1}"

                # Yield: baseline=85, A=+3, B=+1.5, AB=+0.8, C=+2, noise sigma=0.5
                yield_val = 85.0 + 3.0 * a + 1.5 * b + 0.8 * a * b + 2.0 * c + rng.gauss(0, 0.5)
                await add_sample(char_yield, nelson_yield, [yield_val], ts, batch)

                # Purity: baseline=98, A=-0.5, B=+0.3, C=+1.0, BC=-0.4, noise sigma=0.2
                purity_val = 98.0 - 0.5 * a + 0.3 * b + 1.0 * c - 0.4 * b * c + rng.gauss(0, 0.2)
                await add_sample(char_purity, nelson_purity, [purity_val], ts, batch)

                sample_counter += 1

        await session.flush()
        print(f"    Generated 2^3 factorial: 8 runs x 5 reps x 2 responses = 80 samples")

        # ===============================================================
        # Sprint 9 Model Data: Multivariate Groups, DOE Studies, Predictions
        # ===============================================================
        print("\n--- Sprint 9 Model Data ---")

        # ── Multivariate Group (E1 plant) ──────────────────────────────
        mv_group = MultivariateGroup(
            plant_id=p_mvar.id,
            name="Reactor Conditions",
            description="Temperature × Pressure × Flow Rate multivariate monitoring",
            chart_type="t_squared",
            lambda_param=0.1,
            alpha=0.0027,
            phase="phase_i",
            min_samples=100,
            is_active=True,
        )
        session.add(mv_group)
        await session.flush()
        stats.setdefault("mv_groups", 0)
        stats["mv_groups"] = stats.get("mv_groups", 0) + 1

        for order, char_obj in enumerate([char_temp, char_pres, char_flow]):
            session.add(MultivariateGroupMember(
                group_id=mv_group.id,
                characteristic_id=char_obj.id,
                display_order=order,
            ))
            stats.setdefault("mv_members", 0)
            stats["mv_members"] = stats.get("mv_members", 0) + 1

        await session.flush()
        print(f"  [MV] Group '{mv_group.name}' — 3 members (E1 plant)")

        # ── DOE Study (E5 plant) ───────────────────────────────────────
        doe_study = DOEStudy(
            plant_id=p_doe.id,
            name="Process Optimization — 2^3 Factorial",
            design_type="full_factorial",
            status="collecting",
            response_name="Yield",
            response_unit="%",
            notes="Full factorial design: Temperature, Pressure, Feed Rate",
        )
        session.add(doe_study)
        await session.flush()
        stats.setdefault("doe_studies", 0)
        stats["doe_studies"] = stats.get("doe_studies", 0) + 1

        # Factors
        doe_factor_defs = [
            {"name": "Temperature", "low": 160.0, "high": 200.0, "unit": "°C"},
            {"name": "Pressure",    "low": 400.0, "high": 500.0, "unit": "kPa"},
            {"name": "Feed Rate",   "low": 20.0,  "high": 30.0,  "unit": "L/min"},
        ]
        for order, f_cfg in enumerate(doe_factor_defs):
            session.add(DOEFactor(
                study_id=doe_study.id,
                name=f_cfg["name"],
                low_level=f_cfg["low"],
                high_level=f_cfg["high"],
                center_point=(f_cfg["low"] + f_cfg["high"]) / 2.0,
                unit=f_cfg["unit"],
                display_order=order,
            ))
            stats.setdefault("doe_factors", 0)
            stats["doe_factors"] = stats.get("doe_factors", 0) + 1

        await session.flush()

        # 8 runs for 2^3 factorial with response values
        import json as _json
        doe_runs = [
            (-1, -1, -1), (1, -1, -1), (-1, 1, -1), (1, 1, -1),
            (-1, -1,  1), (1, -1,  1), (-1, 1,  1), (1, 1,  1),
        ]
        doe_run_time = now - timedelta(hours=16)
        for idx, (a, b, c) in enumerate(doe_runs):
            t_val = 160.0 if a == -1 else 200.0
            p_val = 400.0 if b == -1 else 500.0
            f_val = 20.0 if c == -1 else 30.0
            factor_vals = {"Temperature": t_val, "Pressure": p_val, "Feed Rate": f_val}
            response = 85.0 + 3.0 * a + 1.5 * b + 0.8 * a * b + 2.0 * c + rng.gauss(0, 0.5)
            session.add(DOERun(
                study_id=doe_study.id,
                run_order=idx + 1,
                standard_order=idx + 1,
                factor_values=_json.dumps(factor_vals),
                factor_actuals=_json.dumps(factor_vals),
                response_value=round(response, 2),
                is_center_point=False,
                replicate=1,
                completed_at=doe_run_time,
            ))
            stats.setdefault("doe_runs", 0)
            stats["doe_runs"] = stats.get("doe_runs", 0) + 1
            doe_run_time += timedelta(hours=2)

        await session.flush()
        print(f"  [DOE] Study '{doe_study.name}' — 3 factors, 8 runs (E5 plant)")

        # ── Prediction Config (E2 plant, fill weight char) ─────────────
        pred_config = PredictionConfig(
            characteristic_id=char_fill.id,
            is_enabled=True,
            model_type="auto",
            forecast_horizon=20,
            refit_interval=50,
            confidence_levels="[0.8, 0.95]",
        )
        session.add(pred_config)
        stats.setdefault("prediction_configs", 0)
        stats["prediction_configs"] = stats.get("prediction_configs", 0) + 1
        await session.flush()
        print(f"  [PRED] Config for '{char_fill.name}' — auto model, horizon=20 (E2 plant)")

        print("\nCommitting to database...")
        await session.commit()

    await db_config.dispose()

    print("\n" + "=" * 60)
    print("  SPRINT 9 TEST SEED COMPLETE")
    print("=" * 60)
    print(f"  Plants:          {stats['plants']}")
    print(f"  Hierarchy Nodes: {stats['nodes']}")
    print(f"  Users:           {stats['users']}")
    print(f"  Characteristics: {stats['chars']}")
    print(f"  Samples:         {stats['samples']:,}")
    print(f"  Measurements:    {stats['measurements']:,}")
    print(f"  Violations:      {stats['violations']:,}")
    print(f"  MV Groups:       {stats.get('mv_groups', 0)}")
    print(f"  MV Members:      {stats.get('mv_members', 0)}")
    print(f"  DOE Studies:     {stats.get('doe_studies', 0)}")
    print(f"  DOE Factors:     {stats.get('doe_factors', 0)}")
    print(f"  DOE Runs:        {stats.get('doe_runs', 0)}")
    print(f"  Pred Configs:    {stats.get('prediction_configs', 0)}")
    print(f"  DB File:         {db_path}")
    print("=" * 60)
    print("\nAll users have password: 'password'")
    print("Admin: admin / password")
    print("Operator: operator / password")


def main() -> None:
    asyncio.run(seed())


if __name__ == "__main__":
    main()
