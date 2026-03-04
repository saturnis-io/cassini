"""Alcohol Distillery seed script for Cassini SPC.

Creates a large multi-spirit distillery with realistic ISA-95 hierarchy
across 5 spirit lines (Whiskey, Vodka, Rum, Tequila, Gin) plus shared
QC Lab and Barrel Aging. Designed to exercise Sprints 5-9 features:

  - Sprint 5: Non-normal distributions (lognormal ABV, Weibull aging, Gamma color),
              custom Nelson rule presets, Laney p'/u' charts
  - Sprint 6: Short-run charts (seasonal small-batch), Gage R&R data,
              FAI-style batch release
  - Sprint 7: Gage connectivity (refractometer, hydrometer, GC, pH meter)
  - Sprint 8: ERP-style batch IDs, LIMS lab certificates, mobile entry
  - Sprint 9: Correlated multivariate (temp/humidity/ABV loss), predictive drift,
              CUSUM/EWMA for slow-moving processes

Plants:
  1. HSD  - Highland Spirits Distillery (Whiskey + Barrel Aging)
  2. CVD  - Crystal Valley Distillery (Vodka + Gin)
  3. TRD  - Tropicana Rum Distillery (Rum + specialty)
  4. AGA  - Agave Azul Distillery (Tequila + Mezcal)
  5. QCL  - Central QC Laboratory (cross-plant lab testing)

Run:
    python backend/scripts/seed_distillery.py
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

import numpy as np
from scipy import stats as sp_stats

backend_dir = Path(__file__).parent.parent
src_dir = backend_dir / "src"
scripts_dir = Path(__file__).parent
sys.path.insert(0, str(src_dir))
sys.path.insert(0, str(scripts_dir))

from seed_utils import InlineNelsonChecker, NELSON_RULE_NAMES, reset_and_migrate

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
from cassini.db.models.broker import MQTTBroker
from cassini.db.models.characteristic_config import CharacteristicConfig  # noqa: F401
from cassini.db.models.erp_connector import ERPConnector, ERPFieldMapping
from cassini.db.models.gage import GageBridge, GagePort
from cassini.db.models.plant import Plant
from cassini.db.models.rule_preset import RulePreset
from cassini.db.models.user import User, UserPlantRole, UserRole

logger = logging.getLogger(__name__)
RANDOM_SEED = 1776  # Spirit of independence


# ---------------------------------------------------------------------------
# Data generation helpers
# ---------------------------------------------------------------------------


def generate_value(mean: float, std: float, sample_index: int, total_samples: int,
                   rng: random.Random, **kwargs) -> float:
    """Generate a measurement with realistic process behavior."""
    frac = sample_index / max(total_samples - 1, 1)
    m = mean

    # Process shift
    if "shift_start" in kwargs and frac >= kwargs["shift_start"]:
        m += kwargs["shift_delta"]

    # Gradual trend/drift
    if "trend_start" in kwargs and frac >= kwargs["trend_start"]:
        progress = (frac - kwargs["trend_start"]) / (1.0 - kwargs["trend_start"])
        m += kwargs["trend_rate"] * total_samples * progress

    # Seasonal (temperature cycles, seasonal production)
    if "seasonal_amplitude" in kwargs:
        period = kwargs.get("seasonal_period", 60)
        m += kwargs["seasonal_amplitude"] * math.sin(2 * math.pi * sample_index / period)

    # Single outlier spike
    if "outlier_at" in kwargs and abs(frac - kwargs["outlier_at"]) < (1.0 / total_samples):
        return round(kwargs["outlier_value"], 4)

    value = rng.gauss(m, std)

    # Clamp to physical range
    if "floor" in kwargs:
        value = max(value, kwargs["floor"])
    if "ceil" in kwargs:
        value = min(value, kwargs["ceil"])

    return round(value, 4)


# ---------------------------------------------------------------------------
# Main seed logic
# ---------------------------------------------------------------------------


async def seed() -> None:
    db_path = reset_and_migrate()
    db_config = DatabaseConfig(
        database_url=f"sqlite+aiosqlite:///{db_path}",
        echo=False,
    )

    rng_np = np.random.RandomState(RANDOM_SEED)
    rng = random.Random(RANDOM_SEED)
    now = datetime.now(timezone.utc)

    stats = {
        "plants": 0, "nodes": 0, "chars": 0, "samples": 0,
        "measurements": 0, "violations": 0, "users": 0, "presets": 0,
        "gage_bridges": 0, "gage_ports": 0, "erp_connectors": 0,
    }

    async with db_config.session() as session:
        # ---------------------------------------------------------------
        # Users - distillery staff
        # ---------------------------------------------------------------
        print("Creating users...")
        hashed_pw = hash_password("password")

        users_config = [
            ("admin", "admin@highlandspirits.com", True),
            ("master_distiller", "jack@highlandspirits.com", False),
            ("head_blender", "mary@highlandspirits.com", False),
            ("qc_manager", "raj@highlandspirits.com", False),
            ("cellar_master", "carlos@highlandspirits.com", False),
            ("operator1", "op1@highlandspirits.com", False),
            ("operator2", "op2@highlandspirits.com", False),
            ("lab_tech", "lab@highlandspirits.com", False),
        ]

        user_objs = {}
        for uname, email, _ in users_config:
            u = User(username=uname, email=email, hashed_password=hashed_pw, is_active=True)
            session.add(u)
            await session.flush()
            user_objs[uname] = u
            stats["users"] += 1
            print(f"  User: {uname}")

        plant_ids: list[int] = []

        # ===============================================================
        # Helper to create characteristics with samples
        # ===============================================================

        async def create_variable_char(
            hierarchy_id: int,
            name: str,
            description: str,
            subgroup_size: int,
            target: float,
            usl: float | None,
            lsl: float | None,
            ucl: float,
            lcl: float,
            rules: list[int],
            num_samples: int,
            data_kwargs: dict,
            *,
            chart_type: str | None = None,
            cusum_target: float | None = None,
            cusum_k: float | None = None,
            cusum_h: float | None = None,
            ewma_lambda: float | None = None,
            ewma_l: float | None = None,
            distribution_method: str | None = None,
            box_cox_lambda: float | None = None,
            distribution_params: str | None = None,
            short_run_mode: str | None = None,
            batch_prefix: str = "BATCH",
            operators: list[str] | None = None,
        ) -> int:
            """Create a variable characteristic with generated samples and violations."""
            char = Characteristic(
                hierarchy_id=hierarchy_id,
                name=name,
                description=description,
                subgroup_size=subgroup_size,
                target_value=target,
                usl=usl,
                lsl=lsl,
                ucl=ucl,
                lcl=lcl,
                chart_type=chart_type,
                cusum_target=cusum_target,
                cusum_k=cusum_k,
                cusum_h=cusum_h,
                ewma_lambda=ewma_lambda,
                ewma_l=ewma_l,
                distribution_method=distribution_method,
                box_cox_lambda=box_cox_lambda,
                distribution_params=distribution_params,
                short_run_mode=short_run_mode,
            )
            session.add(char)
            await session.flush()
            stats["chars"] += 1

            for rule_id in rules:
                session.add(CharacteristicRule(
                    char_id=char.id, rule_id=rule_id,
                    is_enabled=True, require_acknowledgement=True,
                ))

            nelson = InlineNelsonChecker(cl=target, ucl=ucl, lcl=lcl, enabled_rules=rules)
            ops = operators or ["operator1", "operator2"]

            start_date = now - timedelta(hours=num_samples * 4)
            viol_count = 0

            for s_idx in range(num_samples):
                ts = start_date + timedelta(hours=s_idx * 4)
                values = []
                for _ in range(subgroup_size):
                    v = generate_value(
                        data_kwargs["mean"], data_kwargs["std"],
                        s_idx, num_samples, rng,
                        **{k: v for k, v in data_kwargs.items() if k not in ("mean", "std")},
                    )
                    values.append(v)

                sample = Sample(
                    char_id=char.id,
                    timestamp=ts,
                    batch_number=f"{batch_prefix}-{s_idx + 1:04d}",
                    operator_id=ops[s_idx % len(ops)],
                    is_excluded=False,
                    actual_n=subgroup_size,
                )
                session.add(sample)
                await session.flush()
                stats["samples"] += 1

                for v in values:
                    session.add(Measurement(sample_id=sample.id, value=v))
                    stats["measurements"] += 1

                sample_mean = sum(values) / len(values)
                triggered = nelson.check(sample_mean)
                for rid in triggered:
                    session.add(Violation(
                        sample_id=sample.id, char_id=char.id, rule_id=rid,
                        rule_name=NELSON_RULE_NAMES.get(rid, f"Rule {rid}"),
                        severity="CRITICAL" if rid == 1 else "WARNING",
                        acknowledged=False, requires_acknowledgement=True,
                    ))
                    stats["violations"] += 1
                    viol_count += 1

                if s_idx % 50 == 0 and s_idx > 0:
                    await session.flush()

            await session.flush()
            print(f"    * {name} (n={subgroup_size}) - {num_samples} samples, {viol_count} violations")
            return char.id

        async def create_attribute_char(
            hierarchy_id: int,
            name: str,
            description: str,
            chart_type: str,
            use_laney: bool,
            default_sample_size: int,
            samples_data: list[dict],
            *,
            batch_prefix: str = "ATTR",
        ) -> int:
            """Create an attribute characteristic with pre-generated sample data."""
            char = Characteristic(
                hierarchy_id=hierarchy_id,
                name=name,
                description=description,
                subgroup_size=1,
                data_type="attribute",
                attribute_chart_type=chart_type,
                default_sample_size=default_sample_size,
                use_laney_correction=use_laney,
            )
            session.add(char)
            await session.flush()
            stats["chars"] += 1

            for rid in [1, 2, 3, 4]:
                session.add(CharacteristicRule(
                    char_id=char.id, rule_id=rid,
                    is_enabled=True, require_acknowledgement=True,
                ))

            start_date = now - timedelta(hours=len(samples_data) * 4)
            for s_idx, sd in enumerate(samples_data):
                ts = start_date + timedelta(hours=s_idx * 4)
                sample = Sample(
                    char_id=char.id, timestamp=ts,
                    batch_number=f"{batch_prefix}-{s_idx + 1:04d}",
                    operator_id="operator1", is_excluded=False, actual_n=1,
                    defect_count=sd.get("defect_count"),
                    sample_size=sd.get("sample_size"),
                    units_inspected=sd.get("units_inspected"),
                )
                session.add(sample)
                stats["samples"] += 1

                if s_idx % 50 == 0 and s_idx > 0:
                    await session.flush()

            await session.flush()
            tag = "Laney" if use_laney else "Standard"
            print(f"    * {name} ({chart_type}-chart, {tag}) - {len(samples_data)} samples")
            return char.id

        # ===============================================================
        # PLANT 1 - Highland Spirits Distillery (Whiskey + Barrel Aging)
        # ===============================================================
        print("\n" + "=" * 65)
        print("  PLANT 1: Highland Spirits Distillery - Whiskey & Barrel Aging")
        print("=" * 65)

        plant1 = Plant(name="Highland Spirits Distillery", code="HSD", is_active=True)
        session.add(plant1)
        await session.flush()
        stats["plants"] += 1
        plant_ids.append(plant1.id)

        # --- Hierarchy ---
        hsd_enterprise = Hierarchy(name="Highland Spirits Campus", type="Enterprise", parent_id=None, plant_id=plant1.id)
        session.add(hsd_enterprise)
        await session.flush()
        stats["nodes"] += 1

        # Mash House
        mash_area = Hierarchy(name="Mash House", type="Area", parent_id=hsd_enterprise.id, plant_id=plant1.id)
        session.add(mash_area)
        await session.flush()
        stats["nodes"] += 1

        mash_tun = Hierarchy(name="Mash Tun MT-01", type="Equipment", parent_id=mash_area.id, plant_id=plant1.id)
        session.add(mash_tun)
        await session.flush()
        stats["nodes"] += 1

        # Distillation
        still_area = Hierarchy(name="Still House", type="Area", parent_id=hsd_enterprise.id, plant_id=plant1.id)
        session.add(still_area)
        await session.flush()
        stats["nodes"] += 1

        pot_still = Hierarchy(name="Copper Pot Still PS-01", type="Equipment", parent_id=still_area.id, plant_id=plant1.id)
        session.add(pot_still)
        await session.flush()
        stats["nodes"] += 1

        column_still = Hierarchy(name="Column Still CS-01", type="Equipment", parent_id=still_area.id, plant_id=plant1.id)
        session.add(column_still)
        await session.flush()
        stats["nodes"] += 1

        # Barrel Aging
        barrel_area = Hierarchy(name="Barrel Warehouse", type="Area", parent_id=hsd_enterprise.id, plant_id=plant1.id)
        session.add(barrel_area)
        await session.flush()
        stats["nodes"] += 1

        rick_house_a = Hierarchy(name="Rick House A - Bourbon", type="Cell", parent_id=barrel_area.id, plant_id=plant1.id)
        session.add(rick_house_a)
        await session.flush()
        stats["nodes"] += 1

        rick_house_b = Hierarchy(name="Rick House B - Scotch-Style", type="Cell", parent_id=barrel_area.id, plant_id=plant1.id)
        session.add(rick_house_b)
        await session.flush()
        stats["nodes"] += 1

        # Bottling
        bottling_area = Hierarchy(name="Bottling Line", type="Area", parent_id=hsd_enterprise.id, plant_id=plant1.id)
        session.add(bottling_area)
        await session.flush()
        stats["nodes"] += 1

        bottling_line = Hierarchy(name="Bottling Line BL-01", type="Equipment", parent_id=bottling_area.id, plant_id=plant1.id)
        session.add(bottling_line)
        await session.flush()
        stats["nodes"] += 1

        print("  Hierarchy: Mash House -> Still House -> Barrel Warehouse -> Bottling Line")

        # --- Plant 1 Characteristics ---
        print("\n  Creating characteristics...")

        # Mash Tun - temperature, pH, specific gravity
        await create_variable_char(
            mash_tun.id, "Mash Temperature", "Mash-in temperature (°F)", 3,
            target=152.0, usl=158.0, lsl=146.0, ucl=156.0, lcl=148.0,
            rules=[1, 2, 3, 4, 5], num_samples=200,
            data_kwargs={"mean": 152.0, "std": 1.5, "seasonal_amplitude": 1.0, "seasonal_period": 40},
            batch_prefix="MASH", operators=["operator1", "cellar_master"],
        )

        await create_variable_char(
            mash_tun.id, "Mash pH", "Mash pH for enzyme activity", 1,
            target=5.30, usl=5.60, lsl=5.00, ucl=5.50, lcl=5.10,
            rules=[1, 2, 3], num_samples=200,
            data_kwargs={"mean": 5.30, "std": 0.06, "shift_start": 0.75, "shift_delta": -0.10},
            batch_prefix="MASH",
        )

        # Sprint 5: Non-normal - specific gravity is lognormal
        await create_variable_char(
            mash_tun.id, "Original Gravity", "Pre-fermentation specific gravity (SG)",  1,
            target=1.065, usl=1.080, lsl=1.050, ucl=1.075, lcl=1.055,
            rules=[1, 2], num_samples=150,
            data_kwargs={"mean": 1.065, "std": 0.004, "floor": 1.040, "ceil": 1.090},
            distribution_method="box_cox", box_cox_lambda=0.3,
            batch_prefix="MASH",
        )

        # Pot Still - distillation temp, ABV off still, heads/tails cut
        await create_variable_char(
            pot_still.id, "Pot Still Head Temp", "Vapor temperature at still head (°F)", 1,
            target=173.0, usl=180.0, lsl=168.0, ucl=177.0, lcl=169.0,
            rules=[1, 2, 3, 5, 6], num_samples=180,
            data_kwargs={"mean": 173.0, "std": 1.2, "trend_start": 0.70, "trend_rate": 0.005},
            batch_prefix="STILL",
        )

        # Sprint 5: Non-normal - ABV off still is Weibull-distributed
        await create_variable_char(
            pot_still.id, "New Make ABV", "Alcohol by volume off the still (%)", 3,
            target=70.0, usl=78.0, lsl=62.0, ucl=75.0, lcl=65.0,
            rules=[1, 2, 5], num_samples=150,
            data_kwargs={"mean": 70.0, "std": 2.0, "floor": 55.0, "ceil": 85.0},
            distribution_method="distribution_fit",
            distribution_params=json.dumps({"family": "weibull", "shape": 8.0, "scale": 72.0}),
            batch_prefix="STILL", operators=["master_distiller", "operator1"],
        )

        # Sprint 9: CUSUM for slow drift in congener levels
        await create_variable_char(
            pot_still.id, "Congener Index", "Total congener concentration (mg/L)", 1,
            target=450.0, usl=600.0, lsl=300.0, ucl=550.0, lcl=350.0,
            rules=[1, 2], num_samples=250,
            data_kwargs={"mean": 450.0, "std": 25.0, "trend_start": 0.60, "trend_rate": 0.008},
            chart_type="cusum", cusum_target=450.0, cusum_k=0.5, cusum_h=5.0,
            batch_prefix="CONG",
        )

        # Column still - higher precision, tighter control
        await create_variable_char(
            column_still.id, "Column Reflux Ratio", "Reflux ratio (dimensionless)", 1,
            target=3.50, usl=4.50, lsl=2.50, ucl=4.10, lcl=2.90,
            rules=[1, 2, 3, 4], num_samples=200,
            data_kwargs={"mean": 3.50, "std": 0.20},
            batch_prefix="COL",
        )

        # Sprint 9: EWMA for column purity monitoring
        await create_variable_char(
            column_still.id, "Column Distillate Purity", "Ethanol purity from column (%)", 1,
            target=95.0, usl=96.5, lsl=93.5, ucl=95.8, lcl=94.2,
            rules=[1, 2], num_samples=300,
            data_kwargs={"mean": 95.0, "std": 0.30, "shift_start": 0.80, "shift_delta": -0.4},
            chart_type="ewma", ewma_lambda=0.2, ewma_l=3.0,
            batch_prefix="COL",
        )

        # Barrel Warehouse A - temperature, humidity, angel's share (correlated multivariate)
        # Sprint 9: Correlated - temp/humidity/ABV loss track together
        await create_variable_char(
            rick_house_a.id, "Warehouse A Temperature", "Ambient temperature (°F)", 1,
            target=65.0, usl=85.0, lsl=45.0, ucl=78.0, lcl=52.0,
            rules=[1, 2, 7, 8], num_samples=365,
            data_kwargs={"mean": 65.0, "std": 5.0, "seasonal_amplitude": 12.0, "seasonal_period": 90},
            batch_prefix="WHA",
        )

        await create_variable_char(
            rick_house_a.id, "Warehouse A Humidity", "Relative humidity (%RH)", 1,
            target=65.0, usl=80.0, lsl=50.0, ucl=75.0, lcl=55.0,
            rules=[1, 2, 5, 6], num_samples=365,
            data_kwargs={"mean": 65.0, "std": 4.0, "seasonal_amplitude": 8.0, "seasonal_period": 90},
            batch_prefix="WHA",
        )

        # Sprint 5: Non-normal - angel's share (ABV loss) is gamma-distributed
        await create_variable_char(
            rick_house_a.id, "Angel's Share (ABV Loss)", "Annual ABV loss rate (%/yr)", 1,
            target=2.5, usl=5.0, lsl=0.5, ucl=4.0, lcl=1.0,
            rules=[1, 2], num_samples=200,
            data_kwargs={"mean": 2.5, "std": 0.6, "floor": 0.1, "ceil": 7.0},
            distribution_method="percentile",
            batch_prefix="WHA",
        )

        # Sprint 5: Non-normal - barrel color development is lognormal
        await create_variable_char(
            rick_house_a.id, "Color Development", "Spectrophotometric color (SRM units)", 3,
            target=12.0, usl=25.0, lsl=3.0, ucl=20.0, lcl=5.0,
            rules=[1, 2, 3], num_samples=120,
            data_kwargs={"mean": 12.0, "std": 2.5, "trend_start": 0.0, "trend_rate": 0.015, "floor": 1.0},
            distribution_method="box_cox", box_cox_lambda=0.4,
            batch_prefix="CLR",
        )

        # Rick House B - Scotch-style, longer aging
        await create_variable_char(
            rick_house_b.id, "Warehouse B Temperature", "Ambient temperature (°F)", 1,
            target=55.0, usl=70.0, lsl=40.0, ucl=65.0, lcl=45.0,
            rules=[1, 2, 3], num_samples=365,
            data_kwargs={"mean": 55.0, "std": 3.5, "seasonal_amplitude": 8.0, "seasonal_period": 90},
            batch_prefix="WHB",
        )

        # Sprint 6: Short-run - limited edition single barrel
        await create_variable_char(
            rick_house_b.id, "Single Barrel Proof", "Barrel-entry proof (US proof)", 1,
            target=125.0, usl=135.0, lsl=115.0, ucl=131.0, lcl=119.0,
            rules=[1, 2], num_samples=30,
            data_kwargs={"mean": 125.0, "std": 2.0},
            short_run_mode="deviation",
            batch_prefix="SBL",
        )

        # Bottling - fill volume, cap torque, label placement
        await create_variable_char(
            bottling_line.id, "Bottle Fill Volume", "Fill volume (mL)", 5,
            target=750.0, usl=760.0, lsl=740.0, ucl=756.0, lcl=744.0,
            rules=[1, 2, 3, 4, 5, 6], num_samples=250,
            data_kwargs={"mean": 750.0, "std": 2.0, "shift_start": 0.85, "shift_delta": 3.0},
            batch_prefix="BTL", operators=["operator1", "operator2"],
        )

        await create_variable_char(
            bottling_line.id, "Cap Torque", "Closure torque (in-lbs)", 5,
            target=18.0, usl=24.0, lsl=12.0, ucl=22.0, lcl=14.0,
            rules=[1, 2, 3], num_samples=250,
            data_kwargs={"mean": 18.0, "std": 1.5},
            batch_prefix="BTL",
        )

        # Sprint 5: Laney p-chart - bottle visual inspection (overdispersed)
        p1_visual_data = []
        for i in range(100):
            defects = int(sp_stats.betabinom.rvs(500, 2, 18, random_state=rng_np))
            p1_visual_data.append({"defect_count": defects, "sample_size": 500})

        await create_attribute_char(
            bottling_line.id, "Bottle Visual Defects",
            "Visual inspection defect rate (label, fill, cap). Overdispersed - Laney p' correction.",
            "p", True, 500, p1_visual_data, batch_prefix="VIS",
        )

        # np-chart - case-pack count defects
        p1_case_data = []
        for i in range(80):
            defects = int(rng_np.binomial(24, 0.04))
            p1_case_data.append({"defect_count": defects, "sample_size": 24})

        await create_attribute_char(
            bottling_line.id, "Case Pack Defects",
            "Defective bottles per 24-bottle case (np-chart).",
            "np", False, 24, p1_case_data, batch_prefix="CASE",
        )

        # ===============================================================
        # PLANT 2 - Crystal Valley Distillery (Vodka + Gin)
        # ===============================================================
        print("\n" + "=" * 65)
        print("  PLANT 2: Crystal Valley Distillery - Vodka & Gin")
        print("=" * 65)

        plant2 = Plant(name="Crystal Valley Distillery", code="CVD", is_active=True)
        session.add(plant2)
        await session.flush()
        stats["plants"] += 1
        plant_ids.append(plant2.id)

        cvd_enterprise = Hierarchy(name="Crystal Valley Campus", type="Enterprise", parent_id=None, plant_id=plant2.id)
        session.add(cvd_enterprise)
        await session.flush()
        stats["nodes"] += 1

        # Grain processing
        grain_area = Hierarchy(name="Grain Processing", type="Area", parent_id=cvd_enterprise.id, plant_id=plant2.id)
        session.add(grain_area)
        await session.flush()
        stats["nodes"] += 1

        grain_mill = Hierarchy(name="Roller Mill RM-01", type="Equipment", parent_id=grain_area.id, plant_id=plant2.id)
        session.add(grain_mill)
        await session.flush()
        stats["nodes"] += 1

        # Fermentation
        ferm_area = Hierarchy(name="Fermentation Hall", type="Area", parent_id=cvd_enterprise.id, plant_id=plant2.id)
        session.add(ferm_area)
        await session.flush()
        stats["nodes"] += 1

        ferm_tank = Hierarchy(name="Fermenter FV-5000L", type="Equipment", parent_id=ferm_area.id, plant_id=plant2.id)
        session.add(ferm_tank)
        await session.flush()
        stats["nodes"] += 1

        # Vodka column distillation (multiple passes)
        vodka_area = Hierarchy(name="Vodka Distillation", type="Area", parent_id=cvd_enterprise.id, plant_id=plant2.id)
        session.add(vodka_area)
        await session.flush()
        stats["nodes"] += 1

        vodka_column = Hierarchy(name="Multi-Column Still MCS-01", type="Equipment", parent_id=vodka_area.id, plant_id=plant2.id)
        session.add(vodka_column)
        await session.flush()
        stats["nodes"] += 1

        # Gin botanical infusion
        gin_area = Hierarchy(name="Gin Botanical Suite", type="Area", parent_id=cvd_enterprise.id, plant_id=plant2.id)
        session.add(gin_area)
        await session.flush()
        stats["nodes"] += 1

        gin_still = Hierarchy(name="Carter-Head Still GS-01", type="Equipment", parent_id=gin_area.id, plant_id=plant2.id)
        session.add(gin_still)
        await session.flush()
        stats["nodes"] += 1

        # Filtration & proofing
        filt_area = Hierarchy(name="Filtration & Proofing", type="Area", parent_id=cvd_enterprise.id, plant_id=plant2.id)
        session.add(filt_area)
        await session.flush()
        stats["nodes"] += 1

        carbon_filter = Hierarchy(name="Carbon Filter CF-01", type="Cell", parent_id=filt_area.id, plant_id=plant2.id)
        session.add(carbon_filter)
        await session.flush()
        stats["nodes"] += 1

        print("  Hierarchy: Grain Processing -> Fermentation -> Vodka/Gin Distillation -> Filtration")

        print("\n  Creating characteristics...")

        # Grain processing
        await create_variable_char(
            grain_mill.id, "Grain Particle Size", "Average particle size after milling (mm)", 5,
            target=1.20, usl=1.80, lsl=0.60, ucl=1.60, lcl=0.80,
            rules=[1, 2, 3], num_samples=150,
            data_kwargs={"mean": 1.20, "std": 0.15},
            batch_prefix="GRN",
        )

        await create_variable_char(
            grain_mill.id, "Grain Moisture", "Moisture content (%)", 3,
            target=12.0, usl=14.0, lsl=10.0, ucl=13.5, lcl=10.5,
            rules=[1, 2], num_samples=150,
            data_kwargs={"mean": 12.0, "std": 0.5, "seasonal_amplitude": 0.8, "seasonal_period": 60},
            batch_prefix="GRN",
        )

        # Fermentation
        await create_variable_char(
            ferm_tank.id, "Fermentation Temperature", "Active fermentation temp (°F)", 1,
            target=80.0, usl=86.0, lsl=74.0, ucl=84.0, lcl=76.0,
            rules=[1, 2, 3, 5], num_samples=180,
            data_kwargs={"mean": 80.0, "std": 1.2},
            batch_prefix="FERM",
        )

        await create_variable_char(
            ferm_tank.id, "Wash ABV", "Post-fermentation alcohol (%)", 1,
            target=8.5, usl=10.0, lsl=7.0, ucl=9.5, lcl=7.5,
            rules=[1, 2, 3], num_samples=180,
            data_kwargs={"mean": 8.5, "std": 0.4, "shift_start": 0.60, "shift_delta": 0.3},
            batch_prefix="FERM",
        )

        # Vodka - ultra-pure, very tight tolerances
        await create_variable_char(
            vodka_column.id, "Vodka Purity", "Final distillate purity (%)", 1,
            target=96.0, usl=96.8, lsl=95.2, ucl=96.5, lcl=95.5,
            rules=[1, 2, 3, 4, 5, 6, 7, 8], num_samples=300,
            data_kwargs={"mean": 96.0, "std": 0.15, "shift_start": 0.90, "shift_delta": -0.15},
            batch_prefix="VOD", operators=["master_distiller", "operator1"],
        )

        # Sprint 9: CUSUM for vodka methanol (ppm) - critical safety, slow drift detection
        await create_variable_char(
            vodka_column.id, "Methanol Content", "Methanol in distillate (ppm)", 1,
            target=15.0, usl=40.0, lsl=0.0, ucl=30.0, lcl=2.0,
            rules=[1, 2], num_samples=300,
            data_kwargs={"mean": 15.0, "std": 3.0, "trend_start": 0.70, "trend_rate": 0.006, "floor": 0.0},
            chart_type="cusum", cusum_target=15.0, cusum_k=0.5, cusum_h=5.0,
            batch_prefix="METH",
        )

        # Gin botanicals - complex flavor profile monitoring
        await create_variable_char(
            gin_still.id, "Juniper Oil Concentration", "Primary botanical terpene (mg/L)", 3,
            target=120.0, usl=160.0, lsl=80.0, ucl=145.0, lcl=95.0,
            rules=[1, 2, 3, 5], num_samples=100,
            data_kwargs={"mean": 120.0, "std": 8.0, "outlier_at": 0.55, "outlier_value": 165.0},
            batch_prefix="GIN",
        )

        await create_variable_char(
            gin_still.id, "Citrus Peel Extract", "Citrus terpene concentration (mg/L)", 3,
            target=45.0, usl=65.0, lsl=25.0, ucl=58.0, lcl=32.0,
            rules=[1, 2], num_samples=100,
            data_kwargs={"mean": 45.0, "std": 4.5},
            batch_prefix="GIN",
        )

        # Sprint 6: Short-run - limited-edition seasonal gin
        await create_variable_char(
            gin_still.id, "Seasonal Botanical Blend", "Specialty botanical terpene mix (mg/L)", 1,
            target=85.0, usl=110.0, lsl=60.0, ucl=102.0, lcl=68.0,
            rules=[1, 2], num_samples=25,
            data_kwargs={"mean": 85.0, "std": 5.0},
            short_run_mode="standardized",
            batch_prefix="SGIN",
        )

        # Filtration - charcoal filtration effectiveness
        # Sprint 9: EWMA for slow turbidity drift
        await create_variable_char(
            carbon_filter.id, "Post-Filter Turbidity", "Turbidity after carbon filtration (NTU)", 1,
            target=0.10, usl=0.50, lsl=0.00, ucl=0.35, lcl=0.00,
            rules=[1, 2], num_samples=250,
            data_kwargs={"mean": 0.10, "std": 0.04, "trend_start": 0.65, "trend_rate": 0.004, "floor": 0.0},
            chart_type="ewma", ewma_lambda=0.15, ewma_l=2.7,
            batch_prefix="FILT",
        )

        await create_variable_char(
            carbon_filter.id, "Final Proof", "Bottling proof (US proof)", 5,
            target=80.0, usl=82.0, lsl=78.0, ucl=81.2, lcl=78.8,
            rules=[1, 2, 3, 4, 5, 6], num_samples=200,
            data_kwargs={"mean": 80.0, "std": 0.4},
            batch_prefix="PROOF",
        )

        # Sprint 5: Laney u-chart - taste panel defects (overdispersed)
        p2_taste_data = []
        for i in range(80):
            defects = int(sp_stats.nbinom.rvs(3, 0.4, random_state=rng_np)) + 1
            p2_taste_data.append({"defect_count": defects, "units_inspected": 30})

        await create_attribute_char(
            carbon_filter.id, "Taste Panel Defects",
            "Off-flavor defects per sensory panel batch. Negative binomial overdispersion - Laney u'.",
            "u", True, 30, p2_taste_data, batch_prefix="TASTE",
        )

        # ===============================================================
        # PLANT 3 - Tropicana Rum Distillery
        # ===============================================================
        print("\n" + "=" * 65)
        print("  PLANT 3: Tropicana Rum Distillery - Rum & Specialty")
        print("=" * 65)

        plant3 = Plant(name="Tropicana Rum Distillery", code="TRD", is_active=True)
        session.add(plant3)
        await session.flush()
        stats["plants"] += 1
        plant_ids.append(plant3.id)

        trd_enterprise = Hierarchy(name="Tropicana Campus", type="Enterprise", parent_id=None, plant_id=plant3.id)
        session.add(trd_enterprise)
        await session.flush()
        stats["nodes"] += 1

        # Molasses processing
        molasses_area = Hierarchy(name="Molasses Prep", type="Area", parent_id=trd_enterprise.id, plant_id=plant3.id)
        session.add(molasses_area)
        await session.flush()
        stats["nodes"] += 1

        molasses_tank = Hierarchy(name="Dilution Tank DT-01", type="Equipment", parent_id=molasses_area.id, plant_id=plant3.id)
        session.add(molasses_tank)
        await session.flush()
        stats["nodes"] += 1

        # Rum fermentation
        rum_ferm = Hierarchy(name="Rum Fermentation", type="Area", parent_id=trd_enterprise.id, plant_id=plant3.id)
        session.add(rum_ferm)
        await session.flush()
        stats["nodes"] += 1

        rum_fermenter = Hierarchy(name="Open-Top Fermenter OTF-01", type="Equipment", parent_id=rum_ferm.id, plant_id=plant3.id)
        session.add(rum_fermenter)
        await session.flush()
        stats["nodes"] += 1

        # Rum distillation
        rum_dist = Hierarchy(name="Rum Distillation", type="Area", parent_id=trd_enterprise.id, plant_id=plant3.id)
        session.add(rum_dist)
        await session.flush()
        stats["nodes"] += 1

        rum_still = Hierarchy(name="Hybrid Still HS-01", type="Equipment", parent_id=rum_dist.id, plant_id=plant3.id)
        session.add(rum_still)
        await session.flush()
        stats["nodes"] += 1

        # Aging & blending
        rum_aging = Hierarchy(name="Tropical Aging Warehouse", type="Area", parent_id=trd_enterprise.id, plant_id=plant3.id)
        session.add(rum_aging)
        await session.flush()
        stats["nodes"] += 1

        rum_barrels = Hierarchy(name="Oak Barrel Storage", type="Cell", parent_id=rum_aging.id, plant_id=plant3.id)
        session.add(rum_barrels)
        await session.flush()
        stats["nodes"] += 1

        blend_room = Hierarchy(name="Blending Room", type="Cell", parent_id=rum_aging.id, plant_id=plant3.id)
        session.add(blend_room)
        await session.flush()
        stats["nodes"] += 1

        print("  Hierarchy: Molasses Prep -> Fermentation -> Distillation -> Aging & Blending")

        print("\n  Creating characteristics...")

        # Molasses
        await create_variable_char(
            molasses_tank.id, "Molasses Brix", "Sugar concentration (°Brix)", 3,
            target=82.0, usl=88.0, lsl=76.0, ucl=86.0, lcl=78.0,
            rules=[1, 2, 3], num_samples=120,
            data_kwargs={"mean": 82.0, "std": 1.8, "seasonal_amplitude": 2.0, "seasonal_period": 50},
            batch_prefix="MOL",
        )

        await create_variable_char(
            molasses_tank.id, "Dilution Water pH", "Water pH for molasses dilution", 1,
            target=6.80, usl=7.50, lsl=6.00, ucl=7.20, lcl=6.40,
            rules=[1, 2], num_samples=120,
            data_kwargs={"mean": 6.80, "std": 0.12},
            batch_prefix="MOL",
        )

        # Rum fermentation - tropical temps, longer fermentation
        await create_variable_char(
            rum_fermenter.id, "Rum Wash Temperature", "Fermentation temperature (°F)", 1,
            target=90.0, usl=98.0, lsl=82.0, ucl=95.0, lcl=85.0,
            rules=[1, 2, 3, 5, 6], num_samples=150,
            data_kwargs={"mean": 90.0, "std": 1.8, "seasonal_amplitude": 2.5, "seasonal_period": 45},
            batch_prefix="RFERM",
        )

        # Sprint 5: Non-normal - ester production follows gamma distribution
        await create_variable_char(
            rum_fermenter.id, "Ester Production", "Total esters in wash (mg/L)", 1,
            target=180.0, usl=350.0, lsl=60.0, ucl=300.0, lcl=80.0,
            rules=[1, 2], num_samples=150,
            data_kwargs={"mean": 180.0, "std": 35.0, "floor": 20.0},
            distribution_method="distribution_fit",
            distribution_params=json.dumps({"family": "gamma", "shape": 5.0, "scale": 36.0}),
            batch_prefix="RFERM",
        )

        # Rum still
        await create_variable_char(
            rum_still.id, "Rum New Make ABV", "New make spirit ABV (%)", 3,
            target=75.0, usl=82.0, lsl=68.0, ucl=79.0, lcl=71.0,
            rules=[1, 2, 3, 5], num_samples=120,
            data_kwargs={"mean": 75.0, "std": 1.8},
            batch_prefix="RSTL",
        )

        await create_variable_char(
            rum_still.id, "Dunder Acidity", "Dunder/backset acidity (g/L acetic)", 1,
            target=4.5, usl=7.0, lsl=2.0, ucl=6.0, lcl=3.0,
            rules=[1, 2, 3], num_samples=120,
            data_kwargs={"mean": 4.5, "std": 0.6, "shift_start": 0.70, "shift_delta": 0.8},
            batch_prefix="RSTL",
        )

        # Tropical aging - high angel's share, fast maturation
        await create_variable_char(
            rum_barrels.id, "Tropical Warehouse Temp", "Ambient temperature (°F)", 1,
            target=85.0, usl=100.0, lsl=70.0, ucl=95.0, lcl=75.0,
            rules=[1, 2, 7, 8], num_samples=365,
            data_kwargs={"mean": 85.0, "std": 4.0, "seasonal_amplitude": 6.0, "seasonal_period": 90},
            batch_prefix="TROP",
        )

        # Sprint 5: Non-normal - tropical angel's share is more extreme
        await create_variable_char(
            rum_barrels.id, "Tropical Angel's Share", "Annual volume loss (% per year)", 1,
            target=6.0, usl=12.0, lsl=1.0, ucl=10.0, lcl=2.0,
            rules=[1, 2], num_samples=200,
            data_kwargs={"mean": 6.0, "std": 1.5, "floor": 0.5},
            distribution_method="auto",
            batch_prefix="TROP",
        )

        # Blending - final product consistency
        await create_variable_char(
            blend_room.id, "Blend ABV", "Final blend alcohol (%)", 5,
            target=40.0, usl=41.0, lsl=39.0, ucl=40.6, lcl=39.4,
            rules=[1, 2, 3, 4, 5, 6], num_samples=150,
            data_kwargs={"mean": 40.0, "std": 0.15},
            batch_prefix="BLD",
        )

        # Sprint 6: Short-run - aged reserve (very limited batches)
        await create_variable_char(
            blend_room.id, "Reserve Blend Color", "Color depth (SRM) for aged reserve", 3,
            target=22.0, usl=30.0, lsl=14.0, ucl=27.0, lcl=17.0,
            rules=[1, 2], num_samples=20,
            data_kwargs={"mean": 22.0, "std": 2.0},
            short_run_mode="deviation",
            batch_prefix="RSV",
        )

        # c-chart - barrel cooperage defects
        p3_cooper_data = []
        for i in range(80):
            defects = int(rng_np.poisson(3.5))
            p3_cooper_data.append({"defect_count": defects, "units_inspected": 1})

        await create_attribute_char(
            rum_barrels.id, "Barrel Cooperage Defects",
            "Defect count per barrel inspection (leaks, char inconsistency, hoop looseness).",
            "c", False, 1, p3_cooper_data, batch_prefix="COOP",
        )

        # ===============================================================
        # PLANT 4 - Agave Azul Distillery (Tequila + Mezcal)
        # ===============================================================
        print("\n" + "=" * 65)
        print("  PLANT 4: Agave Azul Distillery - Tequila & Mezcal")
        print("=" * 65)

        plant4 = Plant(name="Agave Azul Distillery", code="AGA", is_active=True)
        session.add(plant4)
        await session.flush()
        stats["plants"] += 1
        plant_ids.append(plant4.id)

        aga_enterprise = Hierarchy(name="Agave Azul Campus", type="Enterprise", parent_id=None, plant_id=plant4.id)
        session.add(aga_enterprise)
        await session.flush()
        stats["nodes"] += 1

        # Agave processing
        agave_area = Hierarchy(name="Agave Processing", type="Area", parent_id=aga_enterprise.id, plant_id=plant4.id)
        session.add(agave_area)
        await session.flush()
        stats["nodes"] += 1

        horno = Hierarchy(name="Stone Oven (Horno) HO-01", type="Equipment", parent_id=agave_area.id, plant_id=plant4.id)
        session.add(horno)
        await session.flush()
        stats["nodes"] += 1

        tahona = Hierarchy(name="Tahona Crusher TC-01", type="Equipment", parent_id=agave_area.id, plant_id=plant4.id)
        session.add(tahona)
        await session.flush()
        stats["nodes"] += 1

        # Tequila distillation
        teq_dist = Hierarchy(name="Tequila Distillation", type="Area", parent_id=aga_enterprise.id, plant_id=plant4.id)
        session.add(teq_dist)
        await session.flush()
        stats["nodes"] += 1

        teq_still = Hierarchy(name="Copper Alembic CA-01", type="Equipment", parent_id=teq_dist.id, plant_id=plant4.id)
        session.add(teq_still)
        await session.flush()
        stats["nodes"] += 1

        # Tequila aging
        teq_aging = Hierarchy(name="Tequila Aging Cellar", type="Area", parent_id=aga_enterprise.id, plant_id=plant4.id)
        session.add(teq_aging)
        await session.flush()
        stats["nodes"] += 1

        reposado_rack = Hierarchy(name="Reposado Racks", type="Cell", parent_id=teq_aging.id, plant_id=plant4.id)
        session.add(reposado_rack)
        await session.flush()
        stats["nodes"] += 1

        anejo_rack = Hierarchy(name="Anejo Racks", type="Cell", parent_id=teq_aging.id, plant_id=plant4.id)
        session.add(anejo_rack)
        await session.flush()
        stats["nodes"] += 1

        # Mezcal pit
        mezcal_area = Hierarchy(name="Mezcal Production", type="Area", parent_id=aga_enterprise.id, plant_id=plant4.id)
        session.add(mezcal_area)
        await session.flush()
        stats["nodes"] += 1

        mezcal_pit = Hierarchy(name="Earth Pit Oven EP-01", type="Equipment", parent_id=mezcal_area.id, plant_id=plant4.id)
        session.add(mezcal_pit)
        await session.flush()
        stats["nodes"] += 1

        print("  Hierarchy: Agave Processing -> Distillation -> Aging -> Mezcal")

        print("\n  Creating characteristics...")

        # Agave processing
        await create_variable_char(
            horno.id, "Horno Core Temperature", "Cooking temperature at piña center (°F)", 1,
            target=185.0, usl=200.0, lsl=170.0, ucl=195.0, lcl=175.0,
            rules=[1, 2, 3, 5], num_samples=120,
            data_kwargs={"mean": 185.0, "std": 3.5, "shift_start": 0.80, "shift_delta": 5.0},
            batch_prefix="HRN",
        )

        await create_variable_char(
            horno.id, "Cook Time", "Total oven cooking time (hours)", 1,
            target=48.0, usl=72.0, lsl=36.0, ucl=60.0, lcl=40.0,
            rules=[1, 2], num_samples=120,
            data_kwargs={"mean": 48.0, "std": 4.0},
            batch_prefix="HRN",
        )

        await create_variable_char(
            tahona.id, "Agave Sugar Content", "Brix of crushed agave juice", 3,
            target=24.0, usl=30.0, lsl=18.0, ucl=28.0, lcl=20.0,
            rules=[1, 2, 3], num_samples=120,
            data_kwargs={"mean": 24.0, "std": 1.5, "seasonal_amplitude": 2.0, "seasonal_period": 60},
            batch_prefix="TAH",
        )

        # Tequila distillation - double distillation
        await create_variable_char(
            teq_still.id, "Ordinario ABV", "First distillation ABV (%)", 1,
            target=25.0, usl=30.0, lsl=20.0, ucl=28.0, lcl=22.0,
            rules=[1, 2, 3], num_samples=120,
            data_kwargs={"mean": 25.0, "std": 1.2},
            batch_prefix="ORD",
        )

        await create_variable_char(
            teq_still.id, "Tequila ABV", "Final distillation ABV (%)", 3,
            target=55.0, usl=60.0, lsl=50.0, ucl=58.0, lcl=52.0,
            rules=[1, 2, 3, 4, 5, 6], num_samples=120,
            data_kwargs={"mean": 55.0, "std": 1.2, "outlier_at": 0.40, "outlier_value": 61.5},
            batch_prefix="TEQ", operators=["master_distiller"],
        )

        # Sprint 9: EWMA for slow fusel oil accumulation
        await create_variable_char(
            teq_still.id, "Fusel Oil Content", "Higher alcohols in tequila (mg/100mL)", 1,
            target=200.0, usl=350.0, lsl=80.0, ucl=300.0, lcl=100.0,
            rules=[1, 2], num_samples=200,
            data_kwargs={"mean": 200.0, "std": 25.0, "trend_start": 0.50, "trend_rate": 0.010},
            chart_type="ewma", ewma_lambda=0.25, ewma_l=3.0,
            batch_prefix="FUS",
        )

        # Reposado aging (2-12 months)
        await create_variable_char(
            reposado_rack.id, "Reposado Color", "Color development (SRM)", 3,
            target=5.0, usl=10.0, lsl=1.5, ucl=8.0, lcl=2.5,
            rules=[1, 2, 3], num_samples=80,
            data_kwargs={"mean": 5.0, "std": 1.0, "trend_start": 0.0, "trend_rate": 0.010},
            batch_prefix="REPO",
        )

        # Anejo aging (1-3 years) - Sprint 6: Short-run for ultra-premium
        await create_variable_char(
            anejo_rack.id, "Anejo Proof", "Barrel proof during aging (US proof)", 1,
            target=100.0, usl=115.0, lsl=85.0, ucl=110.0, lcl=90.0,
            rules=[1, 2], num_samples=24,
            data_kwargs={"mean": 100.0, "std": 3.0, "trend_start": 0.0, "trend_rate": -0.005},
            short_run_mode="deviation",
            batch_prefix="ANJ",
        )

        # Mezcal - artisanal process, high variability
        # Sprint 5: Non-normal - smokiness is lognormal
        await create_variable_char(
            mezcal_pit.id, "Smoke Phenol Content", "Total phenols from pit roast (ppm)", 1,
            target=15.0, usl=40.0, lsl=3.0, ucl=30.0, lcl=5.0,
            rules=[1, 2], num_samples=80,
            data_kwargs={"mean": 15.0, "std": 4.0, "floor": 1.0},
            distribution_method="box_cox", box_cox_lambda=0.35,
            batch_prefix="MEZ",
        )

        await create_variable_char(
            mezcal_pit.id, "Mezcal ABV", "Mezcal distillate ABV (%)", 1,
            target=48.0, usl=55.0, lsl=40.0, ucl=52.0, lcl=44.0,
            rules=[1, 2, 3], num_samples=80,
            data_kwargs={"mean": 48.0, "std": 1.8},
            batch_prefix="MEZ",
        )

        # Sprint 5: Laney p-chart - agave piña quality (overdispersed)
        p4_agave_data = []
        for i in range(70):
            defects = int(sp_stats.betabinom.rvs(100, 1.5, 12, random_state=rng_np))
            p4_agave_data.append({"defect_count": defects, "sample_size": 100})

        await create_attribute_char(
            tahona.id, "Agave Piña Defects",
            "Disease/pest defects per piña batch (over/under-ripe, rot, plague). Overdispersed - Laney p'.",
            "p", True, 100, p4_agave_data, batch_prefix="PINA",
        )

        # u-chart - cork/closure defects per case
        p4_cork_data = []
        for i in range(90):
            defects = int(rng_np.poisson(2.2))
            p4_cork_data.append({"defect_count": defects, "units_inspected": 12})

        await create_attribute_char(
            reposado_rack.id, "Cork Closure Defects",
            "TCA-taint and physical cork defects per 12-bottle case.",
            "u", False, 12, p4_cork_data, batch_prefix="CORK",
        )

        # ===============================================================
        # PLANT 5 - Central QC Laboratory
        # ===============================================================
        print("\n" + "=" * 65)
        print("  PLANT 5: Central QC Laboratory - Cross-Plant Testing")
        print("=" * 65)

        plant5 = Plant(name="Central QC Laboratory", code="QCL", is_active=True)
        session.add(plant5)
        await session.flush()
        stats["plants"] += 1
        plant_ids.append(plant5.id)

        qcl_enterprise = Hierarchy(name="QC Lab Campus", type="Enterprise", parent_id=None, plant_id=plant5.id)
        session.add(qcl_enterprise)
        await session.flush()
        stats["nodes"] += 1

        # Analytical lab
        analytical = Hierarchy(name="Analytical Chemistry Lab", type="Area", parent_id=qcl_enterprise.id, plant_id=plant5.id)
        session.add(analytical)
        await session.flush()
        stats["nodes"] += 1

        gc_station = Hierarchy(name="GC-MS Station GC-01", type="Equipment", parent_id=analytical.id, plant_id=plant5.id)
        session.add(gc_station)
        await session.flush()
        stats["nodes"] += 1

        hplc_station = Hierarchy(name="HPLC Station HP-01", type="Equipment", parent_id=analytical.id, plant_id=plant5.id)
        session.add(hplc_station)
        await session.flush()
        stats["nodes"] += 1

        # Sensory panel
        sensory = Hierarchy(name="Sensory Evaluation Lab", type="Area", parent_id=qcl_enterprise.id, plant_id=plant5.id)
        session.add(sensory)
        await session.flush()
        stats["nodes"] += 1

        tasting_room = Hierarchy(name="Tasting Panel Room", type="Cell", parent_id=sensory.id, plant_id=plant5.id)
        session.add(tasting_room)
        await session.flush()
        stats["nodes"] += 1

        # Physical testing
        physical = Hierarchy(name="Physical Testing Lab", type="Area", parent_id=qcl_enterprise.id, plant_id=plant5.id)
        session.add(physical)
        await session.flush()
        stats["nodes"] += 1

        density_station = Hierarchy(name="Density/Proof Station", type="Cell", parent_id=physical.id, plant_id=plant5.id)
        session.add(density_station)
        await session.flush()
        stats["nodes"] += 1

        print("  Hierarchy: Analytical Chemistry -> Sensory Evaluation -> Physical Testing")

        print("\n  Creating characteristics...")

        # GC-MS - congener profiling (multiple compounds)
        gc_acetaldehyde_id = await create_variable_char(
            gc_station.id, "Acetaldehyde", "Acetaldehyde by GC-MS (mg/100mL)", 1,
            target=25.0, usl=50.0, lsl=5.0, ucl=40.0, lcl=10.0,
            rules=[1, 2, 3], num_samples=200,
            data_kwargs={"mean": 25.0, "std": 5.0, "floor": 0.0},
            batch_prefix="GC",
        )

        await create_variable_char(
            gc_station.id, "Ethyl Acetate", "Ethyl acetate by GC-MS (mg/100mL)", 1,
            target=60.0, usl=120.0, lsl=15.0, ucl=100.0, lcl=25.0,
            rules=[1, 2], num_samples=200,
            data_kwargs={"mean": 60.0, "std": 12.0, "floor": 0.0},
            batch_prefix="GC",
        )

        # Sprint 5: Non-normal - furfural follows Weibull (from barrel aging)
        await create_variable_char(
            gc_station.id, "Furfural", "Furfural from wood aging by GC-MS (mg/L)", 1,
            target=8.0, usl=25.0, lsl=0.5, ucl=20.0, lcl=1.0,
            rules=[1, 2], num_samples=200,
            data_kwargs={"mean": 8.0, "std": 3.0, "floor": 0.0},
            distribution_method="distribution_fit",
            distribution_params=json.dumps({"family": "weibull", "shape": 2.0, "scale": 9.0}),
            batch_prefix="GC",
        )

        # Sprint 9: CUSUM for methanol trending (lab confirmation of plant data)
        await create_variable_char(
            gc_station.id, "Methanol (Lab Confirm)", "Methanol confirmation by GC-MS (ppm)", 1,
            target=20.0, usl=50.0, lsl=0.0, ucl=40.0, lcl=2.0,
            rules=[1, 2], num_samples=250,
            data_kwargs={"mean": 20.0, "std": 4.0, "trend_start": 0.65, "trend_rate": 0.005, "floor": 0.0},
            chart_type="cusum", cusum_target=20.0, cusum_k=0.5, cusum_h=5.0,
            batch_prefix="GCMETH",
        )

        # HPLC - sugar and organic acid profiling
        hplc_residual_sugar_id = await create_variable_char(
            hplc_station.id, "Residual Sugar", "Reducing sugars by HPLC (g/L)", 1,
            target=2.0, usl=5.0, lsl=0.0, ucl=4.0, lcl=0.2,
            rules=[1, 2], num_samples=150,
            data_kwargs={"mean": 2.0, "std": 0.5, "floor": 0.0},
            batch_prefix="HPLC",
        )

        await create_variable_char(
            hplc_station.id, "Acetic Acid", "Volatile acidity by HPLC (g/L)", 1,
            target=0.40, usl=1.00, lsl=0.05, ucl=0.80, lcl=0.10,
            rules=[1, 2, 3], num_samples=150,
            data_kwargs={"mean": 0.40, "std": 0.10, "shift_start": 0.80, "shift_delta": 0.15, "floor": 0.0},
            batch_prefix="HPLC",
        )

        # Sensory panel scores - attribute data
        # Sprint 5: Laney p-chart - sensory pass/fail (underdispersed, tight panel)
        p5_sensory_data = []
        for i in range(100):
            raw = int(sp_stats.binom.rvs(20, 0.08, random_state=rng_np))
            defects = int(np.clip(raw, 0, 5))
            p5_sensory_data.append({"defect_count": defects, "sample_size": 20})

        await create_attribute_char(
            tasting_room.id, "Sensory Reject Rate",
            "Samples failing blind sensory panel (off-notes, harshness). Underdispersed - Laney p'.",
            "p", True, 20, p5_sensory_data, batch_prefix="SENS",
        )

        # Density/proof - Gage R&R style measurements (Sprint 6 ready)
        await create_variable_char(
            density_station.id, "Proof by Hydrometer", "US proof by manual hydrometer", 1,
            target=80.0, usl=82.0, lsl=78.0, ucl=81.2, lcl=78.8,
            rules=[1, 2, 3, 4, 5, 6], num_samples=200,
            data_kwargs={"mean": 80.0, "std": 0.30},
            batch_prefix="PROOF", operators=["lab_tech", "qc_manager", "operator1"],
        )

        await create_variable_char(
            density_station.id, "Proof by Digital Densitometer", "US proof by Anton Paar DMA", 1,
            target=80.0, usl=81.5, lsl=78.5, ucl=81.0, lcl=79.0,
            rules=[1, 2, 3, 4], num_samples=200,
            data_kwargs={"mean": 80.0, "std": 0.15},
            batch_prefix="DPROOF", operators=["lab_tech", "qc_manager"],
        )

        # Sprint 6: Short-run - special release proof verification
        await create_variable_char(
            density_station.id, "Special Release Proof", "Limited edition proof verification", 1,
            target=92.0, usl=94.0, lsl=90.0, ucl=93.2, lcl=90.8,
            rules=[1, 2], num_samples=15,
            data_kwargs={"mean": 92.0, "std": 0.4},
            short_run_mode="standardized",
            batch_prefix="SPEC",
        )

        # ---------------------------------------------------------------
        # Rule Presets (Plant-scoped for QCL)
        # ---------------------------------------------------------------
        print("\n  Creating rule presets...")

        preset_distillery = RulePreset(
            name="Distillery Standard",
            description="Rules 1-6 enabled, Rules 7-8 disabled (noisy for batch processes)",
            is_builtin=False, plant_id=plant5.id,
            rules_config=json.dumps([
                {"rule_id": rid, "is_enabled": rid <= 6, "parameters": None}
                for rid in range(1, 9)
            ]),
        )
        session.add(preset_distillery)
        stats["presets"] += 1

        preset_aging = RulePreset(
            name="Barrel Aging Monitor",
            description="Rules 1, 2, 7, 8 - catch shifts and stratification in slow processes",
            is_builtin=False, plant_id=plant5.id,
            rules_config=json.dumps([
                {"rule_id": 1, "is_enabled": True, "parameters": None},
                {"rule_id": 2, "is_enabled": True, "parameters": {"consecutive_count": 7}},
                {"rule_id": 3, "is_enabled": False, "parameters": None},
                {"rule_id": 4, "is_enabled": False, "parameters": None},
                {"rule_id": 5, "is_enabled": False, "parameters": None},
                {"rule_id": 6, "is_enabled": False, "parameters": None},
                {"rule_id": 7, "is_enabled": True, "parameters": None},
                {"rule_id": 8, "is_enabled": True, "parameters": None},
            ]),
        )
        session.add(preset_aging)
        stats["presets"] += 1

        preset_bottling = RulePreset(
            name="Bottling Line Strict",
            description="All 8 rules, Rule 1 with 2.5σ, Rule 2 with 7 consecutive",
            is_builtin=False, plant_id=plant5.id,
            rules_config=json.dumps([
                {"rule_id": 1, "is_enabled": True, "parameters": {"sigma_multiplier": 2.5}},
                {"rule_id": 2, "is_enabled": True, "parameters": {"consecutive_count": 7}},
                *[{"rule_id": rid, "is_enabled": True, "parameters": None} for rid in range(3, 9)],
            ]),
        )
        session.add(preset_bottling)
        stats["presets"] += 1

        preset_sensory = RulePreset(
            name="Sensory Panel",
            description="Rules 1-4 only - appropriate for attribute/sensory data",
            is_builtin=False, plant_id=plant5.id,
            rules_config=json.dumps([
                {"rule_id": rid, "is_enabled": rid <= 4, "parameters": None}
                for rid in range(1, 9)
            ]),
        )
        session.add(preset_sensory)
        stats["presets"] += 1

        for p in [preset_distillery, preset_aging, preset_bottling, preset_sensory]:
            print(f"    Preset: {p.name}")

        await session.flush()

        # ---------------------------------------------------------------
        # Gage Bridge + Ports (QCL - Lab Instruments)
        # ---------------------------------------------------------------
        print("\n  Creating gage bridge...")

        # QCL needs an MQTT broker for the gage bridge
        qcl_broker = MQTTBroker(
            plant_id=plant5.id,
            name="QC Lab Broker",
            host="mqtt.qclab.local",
            port=1883,
            client_id="cassini-qcl-broker",
            is_active=True,
        )
        session.add(qcl_broker)
        await session.flush()

        api_key_raw = "distillery-qcl-lab-bridge-key-001"
        bridge = GageBridge(
            plant_id=plant5.id,
            name="Lab Instruments Bridge",
            api_key_hash=hashlib.sha256(api_key_raw.encode()).hexdigest(),
            mqtt_broker_id=qcl_broker.id,
            status="online",
            last_heartbeat_at=now,
            registered_by=user_objs["qc_manager"].id,
        )
        session.add(bridge)
        await session.flush()

        # Port 1: COM3 — GC-MS (gas chromatograph), linked to Acetaldehyde char
        port_gcms = GagePort(
            bridge_id=bridge.id,
            port_name="COM3",
            baud_rate=9600,
            data_bits=8,
            parity="none",
            stop_bits=1.0,
            protocol_profile="generic_regex",
            parse_pattern=r"(?P<value>[\d.]+)\s*mg",
            mqtt_topic="qclab/gcms/measurements",
            characteristic_id=gc_acetaldehyde_id,
            is_active=True,
        )
        session.add(port_gcms)

        # Port 2: COM5 — HPLC, linked to Residual Sugar char
        port_hplc = GagePort(
            bridge_id=bridge.id,
            port_name="COM5",
            baud_rate=115200,
            data_bits=8,
            parity="none",
            stop_bits=1.0,
            protocol_profile="generic_regex",
            parse_pattern=r"RESULT:\s*(?P<value>[\d.]+)",
            mqtt_topic="qclab/hplc/measurements",
            characteristic_id=hplc_residual_sugar_id,
            is_active=True,
        )
        session.add(port_hplc)
        await session.flush()

        stats["gage_bridges"] += 1
        stats["gage_ports"] += 2
        print(f"    Bridge: {bridge.name} (2 ports: COM3 GC-MS, COM5 HPLC)")

        # ---------------------------------------------------------------
        # ERP Connector (HSD - Batch Tracking Webhook)
        # ---------------------------------------------------------------
        print("\n  Creating ERP connector...")

        erp_connector = ERPConnector(
            plant_id=plant1.id,
            name="Batch Tracking Webhook \u2014 HSD",
            connector_type="generic_webhook",
            base_url="https://erp.highland-spirits.local/api/webhooks/batch-quality",
            auth_type="api_key",
            auth_config="{}",
            headers="{}",
            is_active=True,
            status="active",
        )
        session.add(erp_connector)
        await session.flush()

        # Inbound mapping: ERP batch_id -> sample batch field
        mapping_inbound = ERPFieldMapping(
            connector_id=erp_connector.id,
            name="Batch ID Inbound",
            direction="inbound",
            erp_entity="batch",
            erp_field_path="$.batch_id",
            openspc_entity="sample",
            openspc_field="batch_number",
            is_active=True,
        )
        session.add(mapping_inbound)

        # Outbound mapping: violation -> alert
        mapping_outbound = ERPFieldMapping(
            connector_id=erp_connector.id,
            name="Violation Alert Outbound",
            direction="outbound",
            erp_entity="quality_alert",
            erp_field_path="$.alerts",
            openspc_entity="violation",
            openspc_field="rule_name",
            is_active=True,
        )
        session.add(mapping_outbound)
        await session.flush()

        stats["erp_connectors"] += 1
        print(f"    Connector: {erp_connector.name} (2 field mappings)")

        # ---------------------------------------------------------------
        # Assign users to plants with appropriate roles
        # ---------------------------------------------------------------
        print("\n  Assigning users to plants...")

        role_map = {
            "admin": {pid: "admin" for pid in plant_ids},
            "master_distiller": {plant_ids[0]: "engineer", plant_ids[1]: "engineer", plant_ids[2]: "engineer", plant_ids[3]: "engineer", plant_ids[4]: "engineer"},
            "head_blender": {plant_ids[0]: "engineer", plant_ids[2]: "engineer", plant_ids[4]: "supervisor"},
            "qc_manager": {plant_ids[4]: "engineer", plant_ids[0]: "supervisor", plant_ids[1]: "supervisor"},
            "cellar_master": {plant_ids[0]: "supervisor", plant_ids[2]: "supervisor", plant_ids[3]: "supervisor"},
            "operator1": {pid: "operator" for pid in plant_ids},
            "operator2": {plant_ids[0]: "operator", plant_ids[1]: "operator", plant_ids[2]: "operator"},
            "lab_tech": {plant_ids[4]: "operator", plant_ids[0]: "operator"},
        }

        for uname, roles in role_map.items():
            for pid, role_str in roles.items():
                session.add(UserPlantRole(
                    user_id=user_objs[uname].id,
                    plant_id=pid,
                    role=UserRole(role_str),
                ))

        # ---------------------------------------------------------------
        # Final commit
        # ---------------------------------------------------------------
        print("\nCommitting to database...")
        await session.commit()

    await db_config.dispose()

    print("\n" + "=" * 65)
    print("  DISTILLERY SEED COMPLETE")
    print("=" * 65)
    print(f"  Plants:          {stats['plants']}")
    print(f"  Hierarchy Nodes: {stats['nodes']}")
    print(f"  Users:           {stats['users']}")
    print(f"  Characteristics: {stats['chars']}")
    print(f"  Samples:         {stats['samples']:,}")
    print(f"  Measurements:    {stats['measurements']:,}")
    print(f"  Violations:      {stats['violations']:,}")
    print(f"  Rule Presets:    {stats['presets']}")
    print(f"  Gage Bridges:    {stats['gage_bridges']}")
    print(f"  Gage Ports:      {stats['gage_ports']}")
    print(f"  ERP Connectors:  {stats['erp_connectors']}")
    print(f"  DB File:         {db_path}")
    print("=" * 65)
    print()
    print("  Feature coverage:")
    print("    Sprint 5: Non-normal (box_cox, weibull, gamma, percentile, auto)")
    print("              Laney p'/u' (overdispersed + underdispersed)")
    print("              Custom rule presets (4 presets)")
    print("    Sprint 6: Short-run (deviation + standardized, 4 chars)")
    print("              Gage R&R ready (3-operator proof data)")
    print("    Sprint 7: Gage bridge (QCL, 2 ports: GC-MS + HPLC)")
    print("    Sprint 8: ERP webhook connector (HSD, 2 field mappings)")
    print("    Sprint 9: CUSUM (3 chars), EWMA (3 chars)")
    print("              Correlated multivariate (temp/humidity/ABV)")
    print("              Predictive drift patterns")
    print()
    print("  All users have password: 'password'")
    print("  Key accounts:")
    print("    admin / password            - full admin access")
    print("    master_distiller / password  - engineer across all plants")
    print("    qc_manager / password        - QC lab engineer")
    print("    operator1 / password         - operator across all plants")


def main() -> None:
    asyncio.run(seed())


if __name__ == "__main__":
    main()
