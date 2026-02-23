"""Sprint 6 test seed: Gage R&R, Short-Run SPC, FAI (AS9102).

Exercises the Sprint 6 compliance-gate features with realistic data:

  Plant 1 — "B1: Gage R&R Study"     (1 char + MSA study: 10 parts × 3 ops × 3 trials)
  Plant 2 — "B2: Short-Run SPC"      (5 chars with short_run_mode, 8-15 samples each)
  Plant 3 — "B3: FAI Verification"   (3 chars + 2 FAI reports with inspection items)

Run:
    python backend/scripts/seed_test_sprint6.py
"""

import asyncio
import json
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
    FAIItem,
    FAIReport,
    Hierarchy,
    MSAMeasurement,
    MSAOperator,
    MSAPart,
    MSAStudy,
    Measurement,
    Sample,
    Violation,
)
from openspc.db.models.api_key import APIKey  # noqa: F401
from openspc.db.models.broker import MQTTBroker  # noqa: F401
from openspc.db.models.characteristic_config import CharacteristicConfig  # noqa: F401
from openspc.db.models.plant import Plant
from openspc.db.models.user import User, UserPlantRole, UserRole

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

RANDOM_SEED = 42

USERS = [
    ("admin",     "admin@openspc.local",     "admin"),
    ("engineer1", "engineer1@openspc.local",  "engineer"),
    ("engineer2", "engineer2@openspc.local",  "engineer"),
    ("operator",  "operator@openspc.local",   "operator"),
]

NELSON_RULE_NAMES = {
    1: "Beyond 3\u03c3", 2: "9 points same side", 3: "6 points trending",
    4: "14 points alternating", 5: "2 of 3 in Zone A", 6: "4 of 5 in Zone B+",
    7: "15 points in Zone C", 8: "8 points outside Zone C",
}

# ── MSA Study Configuration ───────────────────────────────────────────
# 10 parts spanning the tolerance range (±0.100 around 25.000)
MSA_PART_TRUE_VALUES = [
    24.970, 24.976, 24.983, 24.990, 24.997,
    25.003, 25.010, 25.017, 25.024, 25.030,
]
MSA_OPERATORS = [
    ("Alice",   0.000),   # no bias
    ("Bob",     0.005),   # slight positive bias
    ("Charlie", -0.003),  # slight negative bias
]
MSA_REPEATABILITY_SIGMA = 0.005  # within-operator σ
MSA_TOLERANCE = 0.200            # USL - LSL = 25.100 - 24.900

# ── Short-Run Configuration ──────────────────────────────────────────
SHORT_RUNS = [
    # (letter, nominal_mm, num_samples, short_run_mode)
    ("A", 10.0,  8,  "standardized"),
    ("B", 25.0,  10, "standardized"),
    ("C", 50.0,  12, "standardized"),
    ("D", 8.0,   15, "deviation"),
    ("E", 100.0, 11, "deviation"),
]

# ── FAI Configuration ────────────────────────────────────────────────
FAI_CHARS = [
    {
        "name": "Bore Diameter (Balloon #1)",
        "balloon": 1,
        "target": 12.700, "usl": 12.720, "lsl": 12.680,
        "ucl": 12.715, "lcl": 12.685,
        "tools_used": "Mitutoyo Bore Gage, SN: BG-4521",
        "mean": 12.700, "std": 0.004,
    },
    {
        "name": "Length (Balloon #2)",
        "balloon": 2,
        "target": 45.000, "usl": 45.050, "lsl": 44.950,
        "ucl": 45.040, "lcl": 44.960,
        "tools_used": "Starrett Digital Caliper, SN: DC-1187",
        "mean": 45.000, "std": 0.010,
    },
    {
        "name": "Surface Finish (Balloon #3)",
        "balloon": 3,
        "target": 0.800, "usl": 1.200, "lsl": 0.400,
        "ucl": 1.000, "lcl": 0.600,
        "tools_used": "Mahr MarSurf PS10, SN: SF-0893",
        "mean": 0.800, "std": 0.050,
    },
]


# ---------------------------------------------------------------------------
# Inline Nelson checker (lightweight for seed-time violation detection)
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
            return (all(last6[i] < last6[i + 1] for i in range(5))
                    or all(last6[i] > last6[i + 1] for i in range(5)))
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
        "plants": 0, "nodes": 0, "chars": 0, "samples": 0,
        "measurements": 0, "users": 0, "violations": 0,
        "msa_studies": 0, "msa_measurements": 0,
        "fai_reports": 0, "fai_items": 0,
    }

    async with db_config.session() as session:
        # ── 1. Create plants ──────────────────────────────────────────
        p1 = Plant(name="B1: Gage R&R Study", code="B1-GRR", is_active=True)
        p2 = Plant(name="B2: Short-Run SPC", code="B2-SR", is_active=True)
        p3 = Plant(name="B3: FAI Verification", code="B3-FAI", is_active=True)
        session.add_all([p1, p2, p3])
        await session.flush()
        stats["plants"] = 3
        plants = [p1, p2, p3]
        for p in plants:
            print(f"  Plant: {p.name} [{p.code}] (ID {p.id})")

        # ── 2. Create users ───────────────────────────────────────────
        print("\nCreating users...")
        hashed_pw = hash_password("password")
        user_map: dict[str, User] = {}
        for username, email, role_name in USERS:
            user = User(username=username, email=email, hashed_password=hashed_pw, is_active=True)
            session.add(user)
            await session.flush()
            user_map[username] = user
            for p in plants:
                session.add(UserPlantRole(user_id=user.id, plant_id=p.id, role=UserRole(role_name)))
            stats["users"] += 1
            print(f"  User: {username} ({role_name}) -> all 3 plants")

        engineer1 = user_map["engineer1"]
        engineer2 = user_map["engineer2"]

        # ==================================================================
        # Plant 1: Gage R&R Study
        # ==================================================================
        print("\n--- Plant 1: Gage R&R Study ---")

        area1 = Hierarchy(name="Gage Lab", type="Area", parent_id=None, plant_id=p1.id)
        session.add(area1)
        await session.flush()
        stats["nodes"] += 1

        cell1 = Hierarchy(name="Caliper Station", type="Cell", parent_id=area1.id, plant_id=p1.id)
        session.add(cell1)
        await session.flush()
        stats["nodes"] += 1

        # One characteristic for SPC charting
        grr_char = Characteristic(
            hierarchy_id=cell1.id,
            name="Reference Diameter",
            description="25.000 mm nominal, tolerance ±0.100 mm, Gage R&R study target",
            subgroup_size=1,
            target_value=25.000,
            usl=25.100,
            lsl=24.900,
            ucl=25.060,
            lcl=24.940,
        )
        session.add(grr_char)
        await session.flush()
        stats["chars"] += 1

        for rule_id in [1, 2]:
            session.add(CharacteristicRule(
                char_id=grr_char.id, rule_id=rule_id,
                is_enabled=True, require_acknowledgement=True,
            ))

        # 20 SPC samples for chart display
        nelson = InlineNelsonChecker(cl=25.000, ucl=25.060, lcl=24.940, enabled_rules=[1, 2])
        start = now - timedelta(hours=40)
        for i in range(20):
            sample = Sample(
                char_id=grr_char.id, timestamp=start + timedelta(hours=i * 2),
                batch_number=f"GRR-{i + 1:03d}", operator_id="engineer1",
                is_excluded=False, actual_n=1,
            )
            session.add(sample)
            await session.flush()
            stats["samples"] += 1
            val = round(rng.gauss(25.000, 0.012), 4)
            session.add(Measurement(sample_id=sample.id, value=val))
            stats["measurements"] += 1
            for rid in nelson.check(val):
                session.add(Violation(
                    sample_id=sample.id, char_id=grr_char.id,
                    rule_id=rid, rule_name=NELSON_RULE_NAMES[rid],
                    severity="CRITICAL" if rid == 1 else "WARNING",
                    acknowledged=False, requires_acknowledgement=True,
                ))
                stats["violations"] += 1

        print(f"  [SPC] Reference Diameter: 20 samples")

        # ── MSA Study ──────────────────────────────────────────────
        study = MSAStudy(
            plant_id=p1.id,
            name="Caliper Gage R&R — Reference Diameter",
            study_type="crossed_anova",
            characteristic_id=grr_char.id,
            num_operators=3,
            num_parts=10,
            num_replicates=3,
            tolerance=MSA_TOLERANCE,
            status="collecting",
            created_by=engineer1.id,
        )
        session.add(study)
        await session.flush()
        stats["msa_studies"] += 1

        # Create operators
        msa_ops = []
        for seq, (op_name, _bias) in enumerate(MSA_OPERATORS):
            op = MSAOperator(study_id=study.id, name=op_name, sequence_order=seq)
            session.add(op)
            await session.flush()
            msa_ops.append(op)

        # Create parts
        msa_parts = []
        for seq, true_val in enumerate(MSA_PART_TRUE_VALUES):
            part = MSAPart(
                study_id=study.id, name=f"Part-{seq + 1:02d}",
                reference_value=true_val, sequence_order=seq,
            )
            session.add(part)
            await session.flush()
            msa_parts.append(part)

        # Create measurements (10 parts × 3 operators × 3 replicates = 90)
        meas_time = now - timedelta(hours=10)
        for part_obj, true_val in zip(msa_parts, MSA_PART_TRUE_VALUES):
            for op_obj, (_op_name, bias) in zip(msa_ops, MSA_OPERATORS):
                for rep in range(1, 4):
                    val = round(rng.gauss(true_val + bias, MSA_REPEATABILITY_SIGMA), 4)
                    session.add(MSAMeasurement(
                        study_id=study.id,
                        operator_id=op_obj.id,
                        part_id=part_obj.id,
                        replicate_num=rep,
                        value=val,
                        timestamp=meas_time,
                    ))
                    stats["msa_measurements"] += 1
                    meas_time += timedelta(minutes=2)

        await session.flush()
        print(f"  [MSA] Study '{study.name}' — {stats['msa_measurements']} measurements (ready to calculate)")

        # ==================================================================
        # Plant 2: Short-Run SPC
        # ==================================================================
        print("\n--- Plant 2: Short-Run SPC ---")

        area2 = Hierarchy(name="Job Shop", type="Area", parent_id=None, plant_id=p2.id)
        session.add(area2)
        await session.flush()
        stats["nodes"] += 1

        cell2 = Hierarchy(name="CNC Cell 1", type="Cell", parent_id=area2.id, plant_id=p2.id)
        session.add(cell2)
        await session.flush()
        stats["nodes"] += 1

        for letter, nom, num_s, sr_mode in SHORT_RUNS:
            sigma = nom * 0.0002  # 0.02% of nominal
            char = Characteristic(
                hierarchy_id=cell2.id,
                name=f"Run-{letter} (Nom={nom}mm)",
                description=f"Nominal: {nom} mm, short-run mode: {sr_mode}",
                subgroup_size=5,
                target_value=nom,
                usl=nom * 1.01,
                lsl=nom * 0.99,
                ucl=nom * 1.003,
                lcl=nom * 0.997,
                short_run_mode=sr_mode,
                stored_sigma=sigma,
                stored_center_line=nom,
            )
            session.add(char)
            await session.flush()
            stats["chars"] += 1

            for rule_id in [1, 2, 3]:
                session.add(CharacteristicRule(
                    char_id=char.id, rule_id=rule_id,
                    is_enabled=True, require_acknowledgement=True,
                ))

            nelson = InlineNelsonChecker(
                cl=nom, ucl=nom * 1.003, lcl=nom * 0.997, enabled_rules=[1, 2, 3],
            )
            start = now - timedelta(hours=num_s * 2)
            for s_idx in range(num_s):
                sample = Sample(
                    char_id=char.id, timestamp=start + timedelta(hours=s_idx * 2),
                    batch_number=f"SR-{letter}-{s_idx + 1:03d}",
                    operator_id="operator", is_excluded=False, actual_n=5,
                )
                session.add(sample)
                await session.flush()
                stats["samples"] += 1

                vals = []
                for _ in range(5):
                    val = round(rng.gauss(nom, sigma), 4)
                    session.add(Measurement(sample_id=sample.id, value=val))
                    stats["measurements"] += 1
                    vals.append(val)

                mean = sum(vals) / len(vals)
                for rid in nelson.check(mean):
                    session.add(Violation(
                        sample_id=sample.id, char_id=char.id,
                        rule_id=rid, rule_name=NELSON_RULE_NAMES[rid],
                        severity="CRITICAL" if rid == 1 else "WARNING",
                        acknowledged=False, requires_acknowledgement=True,
                    ))
                    stats["violations"] += 1

            print(f"  Run-{letter}: {num_s} samples, mode={sr_mode}")

        await session.flush()

        # ==================================================================
        # Plant 3: FAI Verification
        # ==================================================================
        print("\n--- Plant 3: FAI Verification ---")

        area3 = Hierarchy(name="Inspection Bay", type="Area", parent_id=None, plant_id=p3.id)
        session.add(area3)
        await session.flush()
        stats["nodes"] += 1

        cell3 = Hierarchy(name="CMM Station", type="Cell", parent_id=area3.id, plant_id=p3.id)
        session.add(cell3)
        await session.flush()
        stats["nodes"] += 1

        # Create characteristics + SPC samples
        fai_char_ids: list[int] = []
        for fc in FAI_CHARS:
            char = Characteristic(
                hierarchy_id=cell3.id,
                name=fc["name"],
                description=f"AS9102 Form 3, Balloon #{fc['balloon']}",
                subgroup_size=1,
                target_value=fc["target"],
                usl=fc["usl"],
                lsl=fc["lsl"],
                ucl=fc["ucl"],
                lcl=fc["lcl"],
            )
            session.add(char)
            await session.flush()
            stats["chars"] += 1
            fai_char_ids.append(char.id)

            for rule_id in [1, 2]:
                session.add(CharacteristicRule(
                    char_id=char.id, rule_id=rule_id,
                    is_enabled=True, require_acknowledgement=True,
                ))

            nelson = InlineNelsonChecker(
                cl=fc["target"], ucl=fc["ucl"], lcl=fc["lcl"], enabled_rules=[1, 2],
            )
            start = now - timedelta(hours=5)
            for s_idx in range(5):
                sample = Sample(
                    char_id=char.id, timestamp=start + timedelta(hours=s_idx),
                    batch_number="FAI-001", operator_id="engineer1",
                    is_excluded=False, actual_n=1,
                )
                session.add(sample)
                await session.flush()
                stats["samples"] += 1

                val = round(rng.gauss(fc["mean"], fc["std"]), 4)
                val = max(fc["lsl"], min(fc["usl"], val))
                val = round(val, 4)
                session.add(Measurement(sample_id=sample.id, value=val))
                stats["measurements"] += 1

                for rid in nelson.check(val):
                    session.add(Violation(
                        sample_id=sample.id, char_id=char.id,
                        rule_id=rid, rule_name=NELSON_RULE_NAMES[rid],
                        severity="CRITICAL" if rid == 1 else "WARNING",
                        acknowledged=False, requires_acknowledgement=True,
                    ))
                    stats["violations"] += 1

            print(f"  [SPC] {fc['name']}: 5 samples")

        await session.flush()

        # ── FAI Report 1: Draft (all pass) ────────────────────────
        report1 = FAIReport(
            plant_id=p3.id,
            part_number="PN-7891-A",
            part_name="Turbine Bearing Housing",
            revision="C",
            serial_number="SN-2026-001",
            lot_number="LOT-4500",
            drawing_number="DWG-7891",
            organization_name="OpenSPC Aerospace",
            supplier="PrecisionCast Ltd.",
            purchase_order="PO-2026-001",
            reason_for_inspection="initial",
            material_supplier="MetalPro Inc.",
            material_spec="AMS 5662 (Inconel 718)",
            special_processes=json.dumps([
                "Heat Treatment per AMS 2774",
                "NDT per ASTM E1444",
            ]),
            functional_test_results=None,
            status="draft",
            created_by=engineer1.id,
        )
        session.add(report1)
        await session.flush()
        stats["fai_reports"] += 1

        # Report 1 items — all pass
        r1_actuals = [12.705, 45.010, 0.780]
        for seq, (fc, char_id, actual) in enumerate(zip(FAI_CHARS, fai_char_ids, r1_actuals)):
            session.add(FAIItem(
                report_id=report1.id,
                balloon_number=fc["balloon"],
                characteristic_name=fc["name"],
                nominal=fc["target"],
                usl=fc["usl"],
                lsl=fc["lsl"],
                actual_value=actual,
                unit="mm" if fc["balloon"] <= 2 else "Ra \u00b5m",
                tools_used=fc["tools_used"],
                designed_char=fc["balloon"] == 1,  # bore is a designed characteristic
                result="pass",
                deviation_reason=None,
                characteristic_id=char_id,
                sequence_order=seq + 1,
            ))
            stats["fai_items"] += 1

        await session.flush()
        print(f"  [FAI] Report 1 '{report1.part_number}' — draft, 3 items (all pass)")

        # ── FAI Report 2: Submitted (2 pass, 1 deviation) ─────────
        report2 = FAIReport(
            plant_id=p3.id,
            part_number="PN-2345-B",
            part_name="Fuel Nozzle Assembly",
            revision="A",
            serial_number="SN-2026-042",
            lot_number="LOT-4501",
            drawing_number="DWG-2345",
            organization_name="OpenSPC Aerospace",
            supplier="AeroMachine Corp.",
            purchase_order="PO-2026-002",
            reason_for_inspection="change",
            material_supplier="TitaniumSource LLC",
            material_spec="AMS 4911 (Ti-6Al-4V)",
            special_processes=json.dumps([
                "EDM per AMS 2460",
                "Passivation per AMS 2700",
            ]),
            functional_test_results=json.dumps({
                "flow_rate_test": "PASS",
                "pressure_test": "PASS",
            }),
            status="submitted",
            created_by=engineer1.id,
            submitted_by=engineer1.id,
            submitted_at=now - timedelta(hours=2),
        )
        session.add(report2)
        await session.flush()
        stats["fai_reports"] += 1

        # Report 2 items — 2 pass, 1 deviation (surface finish exceeds USL)
        r2_items = [
            {"actual": 12.710, "result": "pass", "deviation": None},
            {"actual": 45.020, "result": "pass", "deviation": None},
            {"actual": 1.250, "result": "deviation",
             "deviation": "Surface finish exceeds USL (1.200 Ra \u00b5m). "
                          "Root cause: tool wear on finishing pass. "
                          "Corrective action: tool replaced, re-inspection scheduled."},
        ]
        for seq, (fc, char_id, item_data) in enumerate(zip(FAI_CHARS, fai_char_ids, r2_items)):
            session.add(FAIItem(
                report_id=report2.id,
                balloon_number=fc["balloon"],
                characteristic_name=fc["name"],
                nominal=fc["target"],
                usl=fc["usl"],
                lsl=fc["lsl"],
                actual_value=item_data["actual"],
                unit="mm" if fc["balloon"] <= 2 else "Ra \u00b5m",
                tools_used=fc["tools_used"],
                designed_char=fc["balloon"] == 1,
                result=item_data["result"],
                deviation_reason=item_data["deviation"],
                characteristic_id=char_id,
                sequence_order=seq + 1,
            ))
            stats["fai_items"] += 1

        await session.flush()
        print(f"  [FAI] Report 2 '{report2.part_number}' — submitted, 3 items (2 pass, 1 deviation)")

        # ── Commit ────────────────────────────────────────────────
        print("\nCommitting to database...")
        await session.commit()

    await db_config.dispose()

    print("\n" + "=" * 60)
    print("  SPRINT 6 TEST SEED COMPLETE")
    print("=" * 60)
    print(f"  Plants:            {stats['plants']}")
    print(f"  Hierarchy Nodes:   {stats['nodes']}")
    print(f"  Users:             {stats['users']}")
    print(f"  Characteristics:   {stats['chars']}")
    print(f"  SPC Samples:       {stats['samples']:,}")
    print(f"  SPC Measurements:  {stats['measurements']:,}")
    print(f"  Violations:        {stats['violations']:,}")
    print(f"  MSA Studies:       {stats['msa_studies']}")
    print(f"  MSA Measurements:  {stats['msa_measurements']}")
    print(f"  FAI Reports:       {stats['fai_reports']}")
    print(f"  FAI Items:         {stats['fai_items']}")
    print(f"  DB File:           {db_path}")
    print("=" * 60)
    print("\nAll users have password: 'password'")
    print("  admin     / password  (admin role)")
    print("  engineer1 / password  (engineer role)")
    print("  engineer2 / password  (engineer role, use to approve FAI)")
    print("  operator  / password  (operator role)")
    print("\nVerification steps:")
    print("  1. MSA: Go to /msa, select B1 plant, open study, click Calculate")
    print("  2. Short-Run: Go to B2 plant, open Run-A chart, verify Z-score axis")
    print("  3. FAI: Go to /fai, select B3 plant, open reports, check Form 1/2/3")
    print("  4. FAI: Log in as engineer2, approve submitted report (separation of duties)")


def main() -> None:
    asyncio.run(seed())


if __name__ == "__main__":
    main()
