"""NIST Reference Data Seed for Cassini.

Creates a "NIST Reference Lab" plant with all reference datasets from
cassini.reference.datasets for visual validation in the Cassini UI.

Plant hierarchy:
  NIST Reference Lab (NIST-REF)
  └── Statistical Reference (Site)
      ├── Individuals Charts (Line)
      │   ├── NIST StRD (Area) — Michelson, Mavro, Lew
      │   └── e-Handbook (Area) — Flowrate
      ├── Subgroup Charts (Line)
      │   └── Montgomery (Area) — Piston Rings, Hard Bake
      └── Attribute Charts (Line)
          ├── Proportion Defective (Area) — Orange Juice
          ├── Defect Counts (Area) — Wafer Defects, Circuit Board
          └── Defects Per Unit (Area) — Dyed Cloth

Run:
    python backend/scripts/seed_nist_reference.py
"""

import asyncio
import sys
from datetime import datetime, timezone
from pathlib import Path

backend_dir = Path(__file__).parent.parent
src_dir = backend_dir / "src"
scripts_dir = Path(__file__).parent
sys.path.insert(0, str(src_dir))
sys.path.insert(0, str(scripts_dir))

from seed_utils import make_timestamps, reset_and_migrate

from cassini.core.auth.passwords import hash_password
from cassini.db import (
    Characteristic,
    CharacteristicRule,
    DatabaseConfig,
    Hierarchy,
    HierarchyType,
)
from cassini.db.models.characteristic_config import CharacteristicConfig  # noqa: F401
from cassini.db.models.plant import Plant
from cassini.db.models.sample import Measurement, Sample
from cassini.db.models.user import User, UserPlantRole, UserRole
from cassini.db.models.broker import MQTTBroker  # noqa: F401
from cassini.db.models.api_key import APIKey  # noqa: F401

from cassini.reference.datasets import (
    NIST_MICHELSON,
    NIST_MAVRO,
    NIST_LEW,
    HANDBOOK_FLOWRATE,
    MONTGOMERY_PISTON_RINGS,
    MONTGOMERY_HARD_BAKE,
    QCC_ORANGE_JUICE,
    HANDBOOK_WAFER_DEFECTS,
    QCC_CIRCUIT,
    QCC_DYED_CLOTH,
    IndividualsDataset,
    SubgroupDataset,
    AttributeDataset,
)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

PLANT_CODE = "NIST-REF"
PLANT_NAME = "NIST Reference Lab"

# Users (password: "password")
USERS = [
    ("admin",    "admin@nist-ref.local",    "admin"),
    ("engineer", "engineer@nist-ref.local", "engineer"),
    ("operator", "operator@nist-ref.local", "operator"),
]

# ---------------------------------------------------------------------------
# Hierarchy definition — mirrors the tree from the docstring
# ---------------------------------------------------------------------------

# Each leaf maps: (line_name, station_name) -> list of (dataset, char_kwargs)
# char_kwargs override/extend fields on the Characteristic model.

HIERARCHY = {
    # Line -> Station -> [(dataset, extra_kwargs), ...]
    "Individuals Charts": {
        "NIST StRD": [
            (NIST_MICHELSON, {"name": "Michelson Speed of Light"}),
            (NIST_MAVRO, {"name": "Mavro Transmittance"}),
            (NIST_LEW, {"name": "Lew Beam Deflection"}),
        ],
        "e-Handbook": [
            (HANDBOOK_FLOWRATE, {"name": "Flowrate"}),
        ],
    },
    "Subgroup Charts": {
        "Montgomery": [
            (MONTGOMERY_PISTON_RINGS, {
                "name": "Piston Ring Diameter",
                "lsl": 73.95,
                "usl": 74.05,
                "target_value": 74.000,
            }),
            (MONTGOMERY_HARD_BAKE, {
                "name": "Hard Bake Flow Width",
                "lsl": 1.00,
                "usl": 2.00,
                "target_value": 1.50,
            }),
        ],
    },
    "Attribute Charts": {
        "Proportion Defective": [
            (QCC_ORANGE_JUICE, {
                "name": "Orange Juice Cans",
                "data_type": "attribute",
                "attribute_chart_type": "p",
                "default_sample_size": 50,
            }),
        ],
        "Defect Counts": [
            (HANDBOOK_WAFER_DEFECTS, {
                "name": "Wafer Defects",
                "data_type": "attribute",
                "attribute_chart_type": "c",
            }),
            (QCC_CIRCUIT, {
                "name": "Circuit Board Defects",
                "data_type": "attribute",
                "attribute_chart_type": "c",
            }),
        ],
        "Defects Per Unit": [
            (QCC_DYED_CLOTH, {
                "name": "Dyed Cloth",
                "data_type": "attribute",
                "attribute_chart_type": "u",
            }),
        ],
    },
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _build_description(dataset) -> str:
    """Build a description string from the dataset source citation."""
    return f"{dataset.name}. Source: {dataset.source} ({dataset.license})"


def _seed_individuals(
    session, char: Characteristic, dataset: IndividualsDataset, timestamps: list[str],
    stats: dict,
) -> list[Sample]:
    """Create samples for an IndividualsDataset (n=1, I-MR)."""
    samples = []
    for i, value in enumerate(dataset.values):
        sample = Sample(
            char_id=char.id,
            timestamp=timestamps[i],
            operator_id="operator",
            is_excluded=False,
            actual_n=1,
        )
        session.add(sample)
        samples.append(sample)
        stats["samples"] += 1
    return samples


def _seed_subgroups(
    session, char: Characteristic, dataset: SubgroupDataset, timestamps: list[str],
    stats: dict,
) -> list[Sample]:
    """Create samples for a SubgroupDataset (n=subgroup_size, X-bar/R)."""
    samples = []
    for i, subgroup in enumerate(dataset.subgroups):
        sample = Sample(
            char_id=char.id,
            timestamp=timestamps[i],
            operator_id="operator",
            is_excluded=False,
            actual_n=dataset.subgroup_size,
        )
        session.add(sample)
        samples.append(sample)
        stats["samples"] += 1
    return samples


def _seed_attribute(
    session, char: Characteristic, dataset: AttributeDataset, timestamps: list[str],
    stats: dict,
) -> list[Sample]:
    """Create samples for an AttributeDataset (p/c/u charts)."""
    samples = []
    for i, count in enumerate(dataset.counts):
        sample_size = dataset.sample_sizes[i]
        sample = Sample(
            char_id=char.id,
            timestamp=timestamps[i],
            operator_id="operator",
            is_excluded=False,
            actual_n=sample_size,
            defect_count=count,
            sample_size=sample_size,
        )
        session.add(sample)
        samples.append(sample)
        stats["samples"] += 1
    return samples


# ---------------------------------------------------------------------------
# Main seed logic
# ---------------------------------------------------------------------------

async def seed() -> None:
    db_path = reset_and_migrate()
    db_config = DatabaseConfig(
        database_url=f"sqlite+aiosqlite:///{db_path}",
        echo=False,
    )

    stats = {
        "plants": 0, "nodes": 0, "chars": 0,
        "samples": 0, "measurements": 0, "users": 0,
    }

    async with db_config.session() as session:
        # ---------------------------------------------------------------
        # 1. Plant
        # ---------------------------------------------------------------
        plant = Plant(name=PLANT_NAME, code=PLANT_CODE, is_active=True)
        session.add(plant)
        await session.flush()
        stats["plants"] += 1
        print(f"  Plant: {PLANT_NAME} [{PLANT_CODE}] (ID {plant.id})")

        # ---------------------------------------------------------------
        # 2. Users & roles
        # ---------------------------------------------------------------
        print("\nCreating users...")
        hashed_pw = hash_password("password")
        for username, email, role_name in USERS:
            user = User(username=username, email=email, hashed_password=hashed_pw, is_active=True)
            session.add(user)
            await session.flush()
            session.add(UserPlantRole(
                user_id=user.id,
                plant_id=plant.id,
                role=UserRole(role_name),
            ))
            stats["users"] += 1
            print(f"  User: {username} ({role_name})")

        # ---------------------------------------------------------------
        # 3. Hierarchy: Site root
        # ---------------------------------------------------------------
        print("\nCreating hierarchy and seeding data...")
        site = Hierarchy(
            name="Statistical Reference",
            type=HierarchyType.SITE.value,
            parent_id=None,
            plant_id=plant.id,
        )
        session.add(site)
        await session.flush()
        stats["nodes"] += 1
        print(f"  [Site] {site.name}")

        # ---------------------------------------------------------------
        # 4. Lines -> Stations -> Characteristics -> Samples
        # ---------------------------------------------------------------
        for line_name, stations in HIERARCHY.items():
            line = Hierarchy(
                name=line_name,
                type=HierarchyType.LINE.value,
                parent_id=site.id,
                plant_id=plant.id,
            )
            session.add(line)
            await session.flush()
            stats["nodes"] += 1
            print(f"    [Line] {line_name}")

            for station_name, dataset_entries in stations.items():
                station = Hierarchy(
                    name=station_name,
                    type=HierarchyType.AREA.value,
                    parent_id=line.id,
                    plant_id=plant.id,
                )
                session.add(station)
                await session.flush()
                stats["nodes"] += 1
                print(f"      [Station] {station_name}")

                for dataset, char_kwargs in dataset_entries:
                    # Determine subgroup_size from dataset type
                    if isinstance(dataset, IndividualsDataset):
                        subgroup_size = 1
                        n_points = len(dataset.values)
                    elif isinstance(dataset, SubgroupDataset):
                        subgroup_size = dataset.subgroup_size
                        n_points = len(dataset.subgroups)
                    elif isinstance(dataset, AttributeDataset):
                        subgroup_size = 1
                        n_points = len(dataset.counts)
                    else:
                        raise ValueError(f"Unknown dataset type: {type(dataset)}")

                    # Build characteristic
                    char = Characteristic(
                        hierarchy_id=station.id,
                        name=char_kwargs.get("name", dataset.name),
                        description=_build_description(dataset),
                        subgroup_size=subgroup_size,
                        target_value=char_kwargs.get("target_value"),
                        usl=char_kwargs.get("usl"),
                        lsl=char_kwargs.get("lsl"),
                        data_type=char_kwargs.get("data_type", "variable"),
                        attribute_chart_type=char_kwargs.get("attribute_chart_type"),
                        default_sample_size=char_kwargs.get("default_sample_size"),
                    )
                    session.add(char)
                    await session.flush()
                    stats["chars"] += 1

                    chart_info = ""
                    if isinstance(dataset, AttributeDataset):
                        chart_info = f", {dataset.chart_type}-chart"
                    print(
                        f"        * {char.name} (n={subgroup_size}, "
                        f"{n_points} points{chart_info})"
                    )

                    # Enable Nelson rules for variable data
                    if char.data_type == "variable":
                        for rule_id in range(1, 9):
                            session.add(CharacteristicRule(
                                char_id=char.id,
                                rule_id=rule_id,
                                is_enabled=True,
                                require_acknowledgement=False,
                            ))

                    # Generate timestamps
                    timestamps = make_timestamps(n_points, span_days=90)

                    # Seed samples based on dataset type
                    if isinstance(dataset, IndividualsDataset):
                        samples = _seed_individuals(
                            session, char, dataset, timestamps, stats,
                        )
                        await session.flush()
                        # Add measurements (1 per sample)
                        for sample, value in zip(samples, dataset.values):
                            session.add(Measurement(
                                sample_id=sample.id,
                                value=float(value),
                            ))
                            stats["measurements"] += 1

                    elif isinstance(dataset, SubgroupDataset):
                        samples = _seed_subgroups(
                            session, char, dataset, timestamps, stats,
                        )
                        await session.flush()
                        # Add measurements (subgroup_size per sample)
                        for sample, subgroup in zip(samples, dataset.subgroups):
                            for value in subgroup:
                                session.add(Measurement(
                                    sample_id=sample.id,
                                    value=float(value),
                                ))
                                stats["measurements"] += 1

                    elif isinstance(dataset, AttributeDataset):
                        samples = _seed_attribute(
                            session, char, dataset, timestamps, stats,
                        )
                        await session.flush()
                        # Attribute charts: measurement value = defect count
                        for sample, count in zip(samples, dataset.counts):
                            session.add(Measurement(
                                sample_id=sample.id,
                                value=float(count),
                            ))
                            stats["measurements"] += 1

                    await session.flush()

        # ---------------------------------------------------------------
        # 5. Commit
        # ---------------------------------------------------------------
        print("\nCommitting to database...")
        await session.commit()

    await db_config.dispose()

    # ---------------------------------------------------------------
    # Summary
    # ---------------------------------------------------------------
    print("\n" + "=" * 60)
    print("  NIST REFERENCE DATA SEED COMPLETE")
    print("=" * 60)
    print(f"  Plants:           {stats['plants']}")
    print(f"  Users:            {stats['users']}")
    print(f"  Hierarchy Nodes:  {stats['nodes']}")
    print(f"  Characteristics:  {stats['chars']}")
    print(f"  Samples:          {stats['samples']:,}")
    print(f"  Measurements:     {stats['measurements']:,}")
    print(f"  DB File:          {backend_dir / 'cassini.db'}")
    print("=" * 60)
    print(f"\nAll users have password: 'password'")
    print(f"Admin user: admin / password")


def main() -> None:
    asyncio.run(seed())


if __name__ == "__main__":
    main()
