"""Dialect-agnostic E2E seed library for the Cassini SPC platform.

Replaces the SQLite-only ``seed_e2e.py`` and the psycopg2-only
``seed_e2e_pg.py`` with a single SQLAlchemy Core path that handles
SQLite, PostgreSQL, MySQL, and MSSQL.

The script accepts any SQLAlchemy URL (sync or async driver — async
drivers are auto-converted to their sync counterparts because seeding
runs once at process startup and does not benefit from async I/O).
Schema is defined by the existing ORM models, so we reference column
names through ``Model.__table__`` rather than hand-rolling SQL.

Idempotency is achieved with check-then-insert on every entity that has
a natural unique key (plants, hierarchies, characteristics, users, roles,
materials, brokers, signature workflows). Sample-level rows
(``sample``, ``measurement``, ``violation``, ``audit_log``,
``msa_measurement``, etc.) have no natural key, so re-running adds new
rows. The Playwright global-setup deletes the SQLite file before
re-seeding and skips re-seeding entirely on external databases when a
manifest already exists, so duplicate samples are not encountered in
practice. This works on every supported dialect without relying on
``ON CONFLICT`` / ``MERGE`` syntax that varies between backends.

Usage::

    python scripts/seed_e2e_unified.py --db-url sqlite+aiosqlite:///./test-e2e.db
    python scripts/seed_e2e_unified.py --db-url postgresql+asyncpg://cassini:cassini@localhost:5432/cassini_test
    python scripts/seed_e2e_unified.py --db-url mysql+aiomysql://cassini:cassini@localhost:3306/cassini_test
    python scripts/seed_e2e_unified.py --db-url "mssql+aioodbc://sa:CassiniTest1!@localhost:1433/cassini_test?driver=ODBC+Driver+18+for+SQL+Server"
    DATABASE_URL=postgresql+asyncpg://... python scripts/seed_e2e_unified.py
"""

from __future__ import annotations

import argparse
import json
import os
import random
import sys
from dataclasses import asdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

# Add backend/src to path so we can import cassini packages.
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir / "src"))

from sqlalchemy import (
    Connection,
    create_engine,
    insert,
    select,
    update,
)
from sqlalchemy.engine import Engine, make_url

from cassini.core.auth.passwords import hash_password
from cassini.core.msa.engine import GageRREngine
from cassini.db.models import (
    AuditLog,
    Characteristic,
    CharacteristicRule,
    DOEAnalysis,
    DOEFactor,
    DOERun,
    DOEStudy,
    FAIItem,
    FAIReport,
    Hierarchy,
    Material,
    MaterialClass,
    MaterialLimitOverride,
    Measurement,
    MQTTBroker,
    MSAMeasurement,
    MSAOperator,
    MSAPart,
    MSAStudy,
    Plant,
    RetentionPolicy,
    Sample,
    SignatureMeaning,
    SignatureWorkflow,
    SignatureWorkflowStep,
    User,
    UserPlantRole,
    Violation,
    WebhookConfig,
)
from cassini.db.models.sop_doc import SopChunk, SopDoc


# ── URL helpers ──────────────────────────────────────────────────────────


_ASYNC_TO_SYNC = {
    "sqlite+aiosqlite": "sqlite",
    "postgresql+asyncpg": "postgresql+psycopg2",
    "postgresql+psycopg": "postgresql+psycopg2",
    "mysql+aiomysql": "mysql+pymysql",
    "mssql+aioodbc": "mssql+pyodbc",
}


def async_to_sync_url(url: str) -> str:
    """Convert an async SQLAlchemy URL to a sync driver URL.

    Seeding is a one-shot synchronous operation, so we use sync drivers
    to avoid pulling in the asyncio event loop. URLs that already use a
    sync driver pass through unchanged.
    """
    for async_prefix, sync_prefix in _ASYNC_TO_SYNC.items():
        if url.startswith(async_prefix + ":"):
            return url.replace(async_prefix, sync_prefix, 1)
    return url


# ── Timestamp helpers ────────────────────────────────────────────────────


_SEED_BASE_TIME = datetime.now(timezone.utc)
_seed_counter = 0


def utcnow() -> datetime:
    """Timezone-aware UTC now. SQLAlchemy DateTime(timezone=True) handles
    the dialect-specific binding."""
    return datetime.now(timezone.utc)


def seed_ts(hours_back: float | None = None) -> datetime:
    """Generate a realistic timestamp for seed data spread one hour apart.

    Returns a timezone-aware datetime so SQLAlchemy can bind it correctly
    on every dialect (PostgreSQL TIMESTAMPTZ, MySQL DATETIME, MSSQL
    DATETIMEOFFSET, SQLite ISO string).
    """
    global _seed_counter
    if hours_back is not None:
        return _SEED_BASE_TIME - timedelta(hours=hours_back)
    _seed_counter += 1
    return _SEED_BASE_TIME - timedelta(hours=200 - _seed_counter)


# ── Idempotent insert helpers (Core, dialect-agnostic) ───────────────────


def _scalar_or_none(conn: Connection, stmt) -> Optional[int]:
    """Execute a SELECT and return the first scalar (or None)."""
    return conn.execute(stmt).scalar_one_or_none()


def insert_returning_id(conn: Connection, table, values: dict[str, Any]) -> int:
    """Insert a row and return the autoincrement primary key.

    Uses ``insert().returning(id)`` on dialects that support it
    (PostgreSQL, MSSQL, SQLite >= 3.35) and falls back to
    ``CursorResult.inserted_primary_key`` on MySQL.
    """
    pk_col = table.c.id
    if conn.dialect.name == "mysql":
        # MySQL/MariaDB don't support RETURNING — use cursor.lastrowid.
        result = conn.execute(insert(table), values)
        if result.inserted_primary_key is not None:
            return int(result.inserted_primary_key[0])
        # Fall back to a SELECT on whatever unique key was just inserted.
        raise RuntimeError("MySQL insert did not return a primary key")
    # PostgreSQL, SQLite (>=3.35), MSSQL all support RETURNING.
    stmt = insert(table).values(**values).returning(pk_col)
    return int(conn.execute(stmt).scalar_one())


def get_or_insert_plant(conn: Connection, name: str, code: str) -> int:
    table = Plant.__table__
    existing = _scalar_or_none(conn, select(table.c.id).where(table.c.code == code))
    if existing is not None:
        return existing
    return insert_returning_id(
        conn,
        table,
        {
            "name": name,
            "code": code,
            "is_active": True,
            "created_at": utcnow(),
            "updated_at": utcnow(),
        },
    )


def get_or_insert_hierarchy(
    conn: Connection,
    plant_id: int,
    name: str,
    htype: str,
    parent_id: Optional[int] = None,
) -> int:
    table = Hierarchy.__table__
    where = [table.c.plant_id == plant_id, table.c.name == name]
    if parent_id is None:
        where.append(table.c.parent_id.is_(None))
    else:
        where.append(table.c.parent_id == parent_id)
    existing = _scalar_or_none(conn, select(table.c.id).where(*where))
    if existing is not None:
        return existing
    return insert_returning_id(
        conn,
        table,
        {
            "plant_id": plant_id,
            "name": name,
            "type": htype,
            "parent_id": parent_id,
        },
    )


_CHAR_DEFAULTS: dict[str, Any] = {
    "subgroup_size": 1,
    "data_type": "variable",
    "subgroup_mode": "NOMINAL_TOLERANCE",
    "min_measurements": 1,
    "decimal_precision": 3,
}


def get_or_insert_characteristic(
    conn: Connection, hierarchy_id: int, name: str, **kwargs: Any
) -> int:
    table = Characteristic.__table__
    existing = _scalar_or_none(
        conn,
        select(table.c.id).where(
            table.c.hierarchy_id == hierarchy_id, table.c.name == name
        ),
    )
    if existing is not None:
        return existing

    values = dict(_CHAR_DEFAULTS)
    values.update(kwargs)
    values["hierarchy_id"] = hierarchy_id
    values["name"] = name
    # Drop unknown keys so we never blow up if the caller passes a stray.
    valid_cols = {c.name for c in table.columns}
    values = {k: v for k, v in values.items() if k in valid_cols}
    return insert_returning_id(conn, table, values)


_NELSON_DEFAULTS: tuple[tuple[int, bool, bool], ...] = (
    (1, True, True),
    (2, True, True),
    (3, True, False),
    (4, True, False),
    (5, True, False),
    (6, True, False),
    (7, True, False),
    (8, True, False),
)


def insert_nelson_rules(conn: Connection, char_id: int) -> None:
    """Idempotently install the default Nelson rule configuration."""
    table = CharacteristicRule.__table__
    existing_rules = {
        row[0]
        for row in conn.execute(
            select(table.c.rule_id).where(table.c.char_id == char_id)
        )
    }
    rows = [
        {
            "char_id": char_id,
            "rule_id": rule_id,
            "is_enabled": is_enabled,
            "require_acknowledgement": req_ack,
        }
        for (rule_id, is_enabled, req_ack) in _NELSON_DEFAULTS
        if rule_id not in existing_rules
    ]
    if rows:
        conn.execute(insert(table), rows)


def insert_variable_sample(
    conn: Connection,
    char_id: int,
    value: float,
    ts: Optional[datetime] = None,
    material_id: Optional[int] = None,
    source: str = "MANUAL",
) -> int:
    sample_id = insert_returning_id(
        conn,
        Sample.__table__,
        {
            "char_id": char_id,
            "timestamp": ts or seed_ts(),
            "actual_n": 1,
            "is_excluded": False,
            "is_undersized": False,
            "is_modified": False,
            "material_id": material_id,
            "source": source,
        },
    )
    conn.execute(
        insert(Measurement.__table__),
        [{"sample_id": sample_id, "value": value}],
    )
    return sample_id


def insert_attribute_sample(
    conn: Connection,
    char_id: int,
    defect_count: int,
    sample_size: Optional[int] = None,
    units_inspected: Optional[int] = None,
    ts: Optional[datetime] = None,
    source: str = "MANUAL",
) -> int:
    return insert_returning_id(
        conn,
        Sample.__table__,
        {
            "char_id": char_id,
            "timestamp": ts or seed_ts(),
            "actual_n": 1,
            "is_excluded": False,
            "is_undersized": False,
            "is_modified": False,
            "defect_count": defect_count,
            "sample_size": sample_size,
            "units_inspected": units_inspected,
            "source": source,
        },
    )


def insert_violation(
    conn: Connection,
    sample_id: int,
    char_id: int,
    rule_id: int = 1,
    rule_name: str = "Beyond Control Limits",
    severity: str = "CRITICAL",
    requires_ack: bool = True,
) -> int:
    return insert_returning_id(
        conn,
        Violation.__table__,
        {
            "sample_id": sample_id,
            "char_id": char_id,
            "rule_id": rule_id,
            "rule_name": rule_name,
            "severity": severity,
            "acknowledged": False,
            "requires_acknowledgement": requires_ack,
            "created_at": utcnow(),
        },
    )


def get_or_insert_user(
    conn: Connection,
    username: str,
    password: str,
    must_change: bool = False,
) -> int:
    table = User.__table__
    existing = _scalar_or_none(
        conn, select(table.c.id).where(table.c.username == username)
    )
    if existing is not None:
        return existing
    return insert_returning_id(
        conn,
        table,
        {
            "username": username,
            "hashed_password": hash_password(password),
            "is_active": True,
            "must_change_password": must_change,
            "created_at": utcnow(),
            "updated_at": utcnow(),
        },
    )


def grant_role(conn: Connection, user_id: int, plant_id: int, role: str) -> None:
    table = UserPlantRole.__table__
    existing = _scalar_or_none(
        conn,
        select(table.c.id).where(
            table.c.user_id == user_id, table.c.plant_id == plant_id
        ),
    )
    if existing is not None:
        return
    conn.execute(
        insert(table),
        [{"user_id": user_id, "plant_id": plant_id, "role": role}],
    )


def get_or_insert_material_class(
    conn: Connection,
    plant_id: int,
    name: str,
    code: str,
    parent_id: Optional[int] = None,
    parent_path: str = "/",
    depth: int = 0,
    description: Optional[str] = None,
) -> tuple[int, str]:
    table = MaterialClass.__table__
    row = conn.execute(
        select(table.c.id, table.c.path).where(
            table.c.plant_id == plant_id, table.c.code == code
        )
    ).one_or_none()
    if row is not None:
        return int(row[0]), str(row[1])

    now = utcnow()
    class_id = insert_returning_id(
        conn,
        table,
        {
            "plant_id": plant_id,
            "parent_id": parent_id,
            "name": name,
            "code": code,
            "path": "/",
            "depth": depth,
            "description": description,
            "created_at": now,
            "updated_at": now,
        },
    )
    new_path = f"{parent_path}{class_id}/"
    conn.execute(
        update(table).where(table.c.id == class_id).values(path=new_path)
    )
    return class_id, new_path


def get_or_insert_material(
    conn: Connection,
    plant_id: int,
    class_id: Optional[int],
    name: str,
    code: str,
    description: Optional[str] = None,
) -> int:
    table = Material.__table__
    existing = _scalar_or_none(
        conn,
        select(table.c.id).where(
            table.c.plant_id == plant_id, table.c.code == code
        ),
    )
    if existing is not None:
        return existing
    now = utcnow()
    return insert_returning_id(
        conn,
        table,
        {
            "plant_id": plant_id,
            "class_id": class_id,
            "name": name,
            "code": code,
            "description": description,
            "created_at": now,
            "updated_at": now,
        },
    )


def insert_material_limit_override(
    conn: Connection,
    char_id: int,
    *,
    material_id: Optional[int] = None,
    class_id: Optional[int] = None,
    **kwargs: Any,
) -> int:
    table = MaterialLimitOverride.__table__
    where = [table.c.characteristic_id == char_id]
    if material_id is not None:
        where.append(table.c.material_id == material_id)
        where.append(table.c.class_id.is_(None))
    else:
        where.append(table.c.class_id == class_id)
        where.append(table.c.material_id.is_(None))
    existing = _scalar_or_none(conn, select(table.c.id).where(*where))
    if existing is not None:
        return existing
    now = utcnow()
    return insert_returning_id(
        conn,
        table,
        {
            "characteristic_id": char_id,
            "material_id": material_id,
            "class_id": class_id,
            "ucl": kwargs.get("ucl"),
            "lcl": kwargs.get("lcl"),
            "stored_sigma": kwargs.get("stored_sigma"),
            "stored_center_line": kwargs.get("stored_center_line"),
            "target_value": kwargs.get("target_value"),
            "usl": kwargs.get("usl"),
            "lsl": kwargs.get("lsl"),
            "created_at": now,
            "updated_at": now,
        },
    )


def seed_standard_hierarchy(
    conn: Connection, plant_name: str, plant_code: str
) -> dict[str, int]:
    """Create plant + Area > Line > Cell + a default characteristic with limits."""
    pid = get_or_insert_plant(conn, plant_name, plant_code)
    dept = get_or_insert_hierarchy(conn, pid, "Test Dept", "Area")
    line = get_or_insert_hierarchy(conn, pid, "Test Line", "Line", dept)
    station = get_or_insert_hierarchy(conn, pid, "Test Station", "Cell", line)
    char_id = get_or_insert_characteristic(
        conn,
        station,
        "Test Char",
        target_value=10.0,
        usl=12.0,
        lsl=8.0,
        ucl=11.5,
        lcl=8.5,
        stored_sigma=0.5,
        stored_center_line=10.0,
    )
    insert_nelson_rules(conn, char_id)
    return {
        "plant_id": pid,
        "dept_id": dept,
        "line_id": line,
        "station_id": station,
        "char_id": char_id,
    }


# ── Seed value sets (verbatim from seed_e2e.py) ──────────────────────────


NORMAL_VALUES = [10.1, 9.9, 10.2, 9.8, 10.0, 10.3, 9.7, 10.1, 9.9, 10.0]
KIOSK_NORMAL = [
    10.0, 10.1, 9.9, 10.0, 10.2, 9.8, 10.1, 9.9, 10.0, 10.1,
    10.0, 10.1, 9.9, 10.0, 10.2, 9.8, 10.1, 9.9, 10.0, 10.1,
    10.0, 10.1, 9.9, 10.0, 10.2,
]
CUSUM_EWMA_VALUES = [
    10.0, 10.1, 9.9, 10.0, 10.2, 9.8, 10.1, 9.9, 10.0, 10.1,
    10.0, 9.9, 10.2, 9.8, 10.1, 10.0, 10.1, 9.9, 10.0, 10.2,
    9.8, 10.1, 9.9, 10.0, 10.1,
]


# ── Main seed routine ────────────────────────────────────────────────────


def seed(
    url: str,
    *,
    minimal: bool = False,
    profile: str = "default",
) -> dict[str, Any]:
    """Seed the database at ``url`` with E2E fixtures.

    Args:
        url: SQLAlchemy URL (sync or async driver).
        minimal: If True, only seed the minimum (admin user + dashboard plant).
        profile: Seed profile. ``"default"`` runs the existing E2E fixtures
            (used by Playwright global-setup, multi-DB CI, screenshot-tour).
            ``"feature-tour"`` runs the feature-highlight dataset described
            in ``apps/cassini/docs/feature-audit/SEED_SPEC.md``.

    Returns:
        Manifest dict mapping fixture keys to created IDs.
    """
    sync_url = async_to_sync_url(url)
    engine: Engine = create_engine(sync_url, future=True)

    manifest: dict[str, Any] = {}

    try:
        if profile == "feature-tour":
            # Feature-tour profile is opt-in. It runs every section in
            # SEED_SPEC.md, all inside a single transaction to keep
            # idempotency tight. Existing default-profile fixtures are
            # not touched by this code path.
            #
            # Import lazily and via a path-based loader so this works
            # whether ``seed_e2e_unified.py`` is run as a script
            # (``python scripts/seed_e2e_unified.py``) or imported as a
            # module (``python -m scripts.seed_e2e_unified``).
            import importlib.util

            spec = importlib.util.spec_from_file_location(
                "_seed_feature_tour",
                Path(__file__).parent / "seed_feature_tour.py",
            )
            assert spec is not None and spec.loader is not None
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)

            with engine.begin() as conn:
                manifest = module.seed_feature_tour(conn)
            return manifest

        with engine.begin() as conn:
            # 1. Admin user — always seeded.
            admin_id = get_or_insert_user(conn, "admin", "admin", must_change=False)
            manifest["admin_user_id"] = admin_id

            if minimal:
                # Just one plant + a default char, useful for quick smoke tests.
                ids = seed_standard_hierarchy(conn, "Dashboard Plant", "DSHBRD")
                manifest["dashboard"] = ids
                grant_role(conn, admin_id, ids["plant_id"], "admin")
                return manifest

            # 2. Standard plants (seedFullHierarchy pattern).
            standard_plants = {
                "dashboard":    ("Dashboard Plant",    "DSHBRD"),
                "annotations":  ("Annotations Plant",  "ANNPLNT"),
                "data_entry":   ("Data Entry Plant",   "DATAENT"),
                "violations":   ("Violations Plant",   "VIOLATN"),
                "reports":      ("Reports Plant",      "RPTPLNT"),
                "sample_mgmt":  ("Sample Mgmt Plant",  "SAMPLEM"),
                "config":       ("Config Plant",       "CONFIGP"),
                "inspector":    ("Inspector Plant",    "INSPCTR"),
                "csv_import":   ("CSV Import Plant",   "CSVIMPO"),
            }
            for key, (name, code) in standard_plants.items():
                ids = seed_standard_hierarchy(conn, name, code)
                manifest[key] = ids

                if key in (
                    "dashboard", "annotations", "violations", "reports",
                    "sample_mgmt", "config", "inspector", "data_entry",
                ):
                    for val in NORMAL_VALUES:
                        insert_variable_sample(conn, ids["char_id"], val)
                if key in ("dashboard", "violations", "inspector"):
                    ooc1 = insert_variable_sample(conn, ids["char_id"], 15.0)
                    ooc2 = insert_variable_sample(conn, ids["char_id"], 16.0)
                    insert_violation(conn, ooc1, ids["char_id"])
                    insert_violation(conn, ooc2, ids["char_id"])

            # 3. RBAC plant + role-specific users.
            rbac = seed_standard_hierarchy(conn, "RBAC Plant", "RBACPLA")
            for val in NORMAL_VALUES:
                insert_variable_sample(conn, rbac["char_id"], val)
            rbac_ooc1 = insert_variable_sample(conn, rbac["char_id"], 15.0)
            rbac_ooc2 = insert_variable_sample(conn, rbac["char_id"], 16.0)
            insert_violation(conn, rbac_ooc1, rbac["char_id"])
            insert_violation(conn, rbac_ooc2, rbac["char_id"])

            rbac_users = {
                "operator": ("rbac-operator", "RbacOper123!"),
                "supervisor": ("rbac-supervisor", "RbacSuper123!"),
                "engineer": ("rbac-engineer", "RbacEng123!"),
                "admin2": ("rbac-admin2", "RbacAdmin123!"),
            }
            rbac_user_ids: dict[str, int] = {}
            for role_key, (username, password) in rbac_users.items():
                uid = get_or_insert_user(conn, username, password)
                role = "admin" if role_key == "admin2" else role_key
                grant_role(conn, uid, rbac["plant_id"], role)
                rbac_user_ids[role_key] = uid
            rbac["user_ids"] = rbac_user_ids
            manifest["rbac"] = rbac

            # Admin gets every plant.
            all_plant_ids = [
                int(row[0])
                for row in conn.execute(select(Plant.__table__.c.id))
            ]
            for pid in all_plant_ids:
                grant_role(conn, admin_id, pid, "admin")

            # 4. Kiosk plant — two characteristics, 25 samples each + OOC.
            kiosk = seed_standard_hierarchy(conn, "Kiosk Plant", "KIOSKPL")
            kiosk_char2 = get_or_insert_characteristic(
                conn,
                kiosk["station_id"],
                "Kiosk Char 2",
                target_value=10.0, usl=12.0, lsl=8.0,
                ucl=11.5, lcl=8.5, stored_sigma=0.5, stored_center_line=10.0,
            )
            insert_nelson_rules(conn, kiosk_char2)
            for val in KIOSK_NORMAL:
                insert_variable_sample(conn, kiosk["char_id"], val)
                insert_variable_sample(conn, kiosk_char2, val)
            insert_variable_sample(conn, kiosk["char_id"], 15.0)
            insert_variable_sample(conn, kiosk_char2, 16.0)
            kiosk["char_id_2"] = kiosk_char2
            manifest["kiosk"] = kiosk

            # 5. CUSUM/EWMA plant.
            ce_plant = get_or_insert_plant(conn, "CUSUM EWMA Plant", "CUSUMEWMA")
            ce_dept = get_or_insert_hierarchy(conn, ce_plant, "CE Dept", "Area")
            ce_line = get_or_insert_hierarchy(conn, ce_plant, "CE Line", "Line", ce_dept)
            ce_station = get_or_insert_hierarchy(conn, ce_plant, "CE Station", "Cell", ce_line)
            cusum_char = get_or_insert_characteristic(
                conn, ce_station, "CUSUM Diameter",
                chart_type="cusum", cusum_target=10.0, cusum_k=0.5, cusum_h=5.0,
                ucl=10.5, lcl=9.5, stored_sigma=0.15, stored_center_line=10.0,
            )
            ewma_char = get_or_insert_characteristic(
                conn, ce_station, "EWMA Pressure",
                chart_type="ewma", ewma_lambda=0.2, ewma_l=2.7,
                target_value=10.0,
                ucl=10.5, lcl=9.5, stored_sigma=0.15, stored_center_line=10.0,
            )
            insert_nelson_rules(conn, cusum_char)
            insert_nelson_rules(conn, ewma_char)
            for val in CUSUM_EWMA_VALUES:
                insert_variable_sample(conn, cusum_char, val)
                insert_variable_sample(conn, ewma_char, val)
            manifest["cusum_ewma"] = {
                "plant_id": ce_plant, "station_id": ce_station,
                "cusum_char_id": cusum_char, "ewma_char_id": ewma_char,
            }
            grant_role(conn, admin_id, ce_plant, "admin")

            # 6. Attribute Charts plant.
            attr_plant = get_or_insert_plant(conn, "Attribute Charts Plant", "ATTRCHRT")
            attr_dept = get_or_insert_hierarchy(conn, attr_plant, "Attr Dept", "Area")
            attr_line = get_or_insert_hierarchy(conn, attr_plant, "Attr Line", "Line", attr_dept)
            attr_station = get_or_insert_hierarchy(conn, attr_plant, "Attr Station", "Cell", attr_line)

            p_char = get_or_insert_characteristic(
                conn, attr_station, "Proportion Defectives",
                data_type="attribute", attribute_chart_type="p", default_sample_size=100,
            )
            np_char = get_or_insert_characteristic(
                conn, attr_station, "Number Defectives",
                data_type="attribute", attribute_chart_type="np", default_sample_size=50,
            )
            c_char = get_or_insert_characteristic(
                conn, attr_station, "Total Defects",
                data_type="attribute", attribute_chart_type="c", default_sample_size=100,
            )
            u_char = get_or_insert_characteristic(
                conn, attr_station, "Defects Per Unit",
                data_type="attribute", attribute_chart_type="u", default_sample_size=10,
            )
            for cid in (p_char, np_char, c_char, u_char):
                insert_nelson_rules(conn, cid)

            for count in [3, 5, 2, 4, 6, 3, 7]:
                insert_attribute_sample(conn, p_char, count, sample_size=100)
            for count in [2, 3, 1, 4, 2, 5, 3]:
                insert_attribute_sample(conn, np_char, count, sample_size=50)
            for count in [8, 12, 5, 10, 7, 14, 9]:
                insert_attribute_sample(conn, c_char, count, sample_size=100)
            for count in [3, 5, 2, 6, 4, 7, 3]:
                insert_attribute_sample(
                    conn, u_char, count, sample_size=10, units_inspected=10
                )
            manifest["attribute_charts"] = {
                "plant_id": attr_plant, "station_id": attr_station,
                "p_char_id": p_char, "np_char_id": np_char,
                "c_char_id": c_char, "u_char_id": u_char,
            }
            grant_role(conn, admin_id, attr_plant, "admin")

            # 7. Material Limits plant.
            ml = seed_standard_hierarchy(conn, "Material Limits Plant", "MATLIM")
            raw_cls_id, raw_path = get_or_insert_material_class(
                conn, ml["plant_id"], "Raw Materials", "RAW",
                description="Raw material inputs",
            )
            metals_cls_id, metals_path = get_or_insert_material_class(
                conn, ml["plant_id"], "Metals", "MTL",
                parent_id=raw_cls_id, parent_path=raw_path, depth=1,
                description="Metal alloys",
            )
            mat_a_id = get_or_insert_material(
                conn, ml["plant_id"], metals_cls_id,
                "Test Material A", "MAT-A", "First test material",
            )
            mat_b_id = get_or_insert_material(
                conn, ml["plant_id"], metals_cls_id,
                "Test Material B", "MAT-B", "Second test material",
            )
            for val in NORMAL_VALUES:
                insert_variable_sample(conn, ml["char_id"], val)
            for val in [10.2, 10.3, 10.4, 10.5]:
                insert_variable_sample(conn, ml["char_id"], val, material_id=mat_a_id)
            for val in [9.8, 9.9, 10.0, 10.1]:
                insert_variable_sample(conn, ml["char_id"], val, material_id=mat_b_id)
            insert_material_limit_override(
                conn, ml["char_id"], material_id=mat_a_id,
                ucl=13.0, lcl=9.0, stored_sigma=0.6, stored_center_line=10.5,
                target_value=10.0,
            )
            insert_material_limit_override(
                conn, ml["char_id"], material_id=mat_b_id,
                ucl=11.0, lcl=9.5,
            )
            grant_role(conn, admin_id, ml["plant_id"], "admin")
            manifest["material_limits"] = ml

            # 8. Simple plants (no hierarchy or samples — just need to exist).
            simple_plants = {
                "connectivity": ("Connectivity Test Plant", "CTP"),
                "navigation":   ("Nav Test Plant",          "NAV"),
                "hierarchy":    ("Hierarchy Test Plant",    "HTP"),
                "mobile":       ("Mobile Test Plant",       "MOBPLNT"),
                "users":        ("Users Test Plant",        "UTP"),
                "settings":     ("Settings Test Plant",     "STP"),
            }
            for key, (name, code) in simple_plants.items():
                pid = get_or_insert_plant(conn, name, code)
                grant_role(conn, admin_id, pid, "admin")
                manifest[key] = {"plant_id": pid}

            # 8b. Notifications seed webhook (idempotent on name).
            wc_table = WebhookConfig.__table__
            wc_existing = _scalar_or_none(
                conn,
                select(wc_table.c.id).where(wc_table.c.name == "E2E Seed Hook"),
            )
            if wc_existing is None:
                webhook_id = insert_returning_id(
                    conn,
                    wc_table,
                    {
                        "name": "E2E Seed Hook",
                        "url": "https://httpbin.org/post",
                        "is_active": True,
                        "retry_count": 3,
                        "created_at": utcnow(),
                        "updated_at": utcnow(),
                    },
                )
            else:
                webhook_id = wc_existing
            manifest["notifications"] = {"webhook_id": webhook_id}

            # 9. Screenshot Tour plant — commercial feature data.
            tour = seed_standard_hierarchy(conn, "Screenshot Tour Plant", "SCRNTOUR")
            grant_role(conn, admin_id, tour["plant_id"], "admin")
            tour_char_id = tour["char_id"]
            tour_plant_id = tour["plant_id"]

            rng = random.Random(42)
            for _ in range(40):
                val = round(rng.gauss(10.0, 0.4), 3)
                insert_variable_sample(conn, tour_char_id, val)
            for _ in range(7):
                val = round(
                    rng.choice(
                        [rng.uniform(11.0, 11.4), rng.uniform(8.6, 9.0)]
                    ),
                    3,
                )
                insert_variable_sample(conn, tour_char_id, val)

            ooc_values = [12.8, 7.2, 13.1]
            ooc_sample_ids: list[int] = []
            for val in ooc_values:
                sid = insert_variable_sample(conn, tour_char_id, val)
                ooc_sample_ids.append(sid)
            v1 = insert_violation(conn, ooc_sample_ids[0], tour_char_id)
            insert_violation(conn, ooc_sample_ids[1], tour_char_id)
            now = utcnow()
            conn.execute(
                update(Violation.__table__)
                .where(Violation.__table__.c.id == v1)
                .values(
                    acknowledged=True,
                    ack_user="admin",
                    ack_reason="Expected process adjustment",
                    ack_timestamp=now,
                )
            )

            # 9a. MSA Gage R&R study (gate by plant_id + name).
            msa_n_ops = 3
            msa_n_parts = 10
            msa_n_reps = 3
            msa_tolerance = 4.0
            msa_table = MSAStudy.__table__
            msa_study_existing = _scalar_or_none(
                conn,
                select(msa_table.c.id).where(
                    msa_table.c.plant_id == tour_plant_id,
                    msa_table.c.name == "Bore Diameter Gage R&R",
                ),
            )
            if msa_study_existing is not None:
                msa_study_id = msa_study_existing
                _seed_msa_full = False
            else:
                _seed_msa_full = True
                msa_study_id = insert_returning_id(
                    conn,
                    msa_table,
                    {
                        "plant_id": tour_plant_id,
                        "name": "Bore Diameter Gage R&R",
                        "study_type": "crossed_anova",
                        "characteristic_id": tour_char_id,
                        "num_operators": msa_n_ops,
                        "num_parts": msa_n_parts,
                        "num_replicates": msa_n_reps,
                        "tolerance": msa_tolerance,
                        "status": "complete",
                        "created_by": admin_id,
                        "created_at": now,
                        "completed_at": now,
                        "results_json": None,
                    },
                )

            if _seed_msa_full:
                operator_ids: list[int] = []
                for seq, opname in enumerate(["Alice", "Bob", "Carlos"]):
                    operator_ids.append(
                        insert_returning_id(
                            conn,
                            MSAOperator.__table__,
                            {
                                "study_id": msa_study_id,
                                "name": opname,
                                "sequence_order": seq,
                            },
                        )
                    )

                part_ids: list[int] = []
                rng_msa = random.Random(42)
                ref_values: list[float] = []
                for seq in range(msa_n_parts):
                    ref_val = round(10.0 + rng_msa.uniform(-1.5, 1.5), 3)
                    ref_values.append(ref_val)
                    part_ids.append(
                        insert_returning_id(
                            conn,
                            MSAPart.__table__,
                            {
                                "study_id": msa_study_id,
                                "name": f"Part {seq + 1}",
                                "reference_value": ref_val,
                                "sequence_order": seq,
                            },
                        )
                    )

                measurements_3d: list[list[list[float]]] = []
                for op_id in operator_ids:
                    op_measurements: list[list[float]] = []
                    for part_idx, part_id in enumerate(part_ids):
                        ref = ref_values[part_idx]
                        rep_measurements: list[float] = []
                        for rep in range(1, msa_n_reps + 1):
                            val = round(ref + rng_msa.gauss(0, 0.15), 4)
                            rep_measurements.append(val)
                            conn.execute(
                                insert(MSAMeasurement.__table__),
                                [
                                    {
                                        "study_id": msa_study_id,
                                        "operator_id": op_id,
                                        "part_id": part_id,
                                        "replicate_num": rep,
                                        "value": val,
                                        "timestamp": now,
                                    }
                                ],
                            )
                        op_measurements.append(rep_measurements)
                    measurements_3d.append(op_measurements)

                grr_engine = GageRREngine()
                grr_result = grr_engine.calculate_crossed_anova(
                    measurements_3d, tolerance=msa_tolerance,
                )
                conn.execute(
                    update(MSAStudy.__table__)
                    .where(MSAStudy.__table__.c.id == msa_study_id)
                    .values(results_json=json.dumps(asdict(grr_result)))
                )

            # 9b. FAI Report (gate by plant_id + part_number + serial_number).
            fai_table = FAIReport.__table__
            fai_existing = _scalar_or_none(
                conn,
                select(fai_table.c.id).where(
                    fai_table.c.plant_id == tour_plant_id,
                    fai_table.c.part_number == "PN-2026-001",
                    fai_table.c.serial_number == "SN-00042",
                ),
            )
            if fai_existing is not None:
                fai_report_id = fai_existing
                _seed_fai_items = False
            else:
                _seed_fai_items = True
                fai_report_id = insert_returning_id(
                    conn,
                    fai_table,
                    {
                        "plant_id": tour_plant_id,
                        "part_number": "PN-2026-001",
                        "part_name": "Turbine Housing",
                        "revision": "Rev C",
                        "serial_number": "SN-00042",
                        "drawing_number": "DWG-TH-100",
                        "organization_name": "Saturnis Manufacturing",
                        "supplier": "Apex Precision Parts",
                        "reason_for_inspection": "new_part",
                        "status": "submitted",
                        "created_by": admin_id,
                        "created_at": now,
                        "submitted_by": admin_id,
                        "submitted_at": now,
                    },
                )
            fai_items = [
                (1, "Bore Diameter",     25.000, 25.050, 24.950, 25.012, "mm",  "Bore Micrometer",  True,  "pass"),
                (2, "Overall Length",    100.000, 100.100, 99.900, 100.045, "mm", "Caliper",        False, "pass"),
                (3, "Surface Roughness",  0.800,   1.600,  None,   0.920, "Ra",  "Profilometer",     True,  "pass"),
                (4, "Thread Pitch",       1.500,   1.520,  1.480,  1.505, "mm",  "Thread Gauge",     False, "pass"),
                (5, "Hardness",          58.000,  62.000, 55.000, 59.200, "HRC", "Rockwell Tester",  True,  "pass"),
                (6, "Concentricity",      0.000,   0.025,  None,   0.032, "mm",  "CMM",              True,  "fail"),
            ]
            if _seed_fai_items:
                for seq, (
                    balloon, item_name, nom, usl, lsl, actual, unit, tool, designed, result,
                ) in enumerate(fai_items):
                    conn.execute(
                        insert(FAIItem.__table__),
                        [
                            {
                                "report_id": fai_report_id,
                                "balloon_number": balloon,
                                "characteristic_name": item_name,
                                "nominal": nom,
                                "usl": usl,
                                "lsl": lsl,
                                "actual_value": actual,
                                "unit": unit,
                                "tools_used": tool,
                                "designed_char": designed,
                                "result": result,
                                "sequence_order": seq,
                            }
                        ],
                    )

            # 9c. DOE Study (gate by plant_id + name).
            doe_table = DOEStudy.__table__
            doe_existing = _scalar_or_none(
                conn,
                select(doe_table.c.id).where(
                    doe_table.c.plant_id == tour_plant_id,
                    doe_table.c.name == "Surface Finish Optimization",
                ),
            )
            if doe_existing is not None:
                doe_study_id = doe_existing
                _seed_doe_full = False
            else:
                _seed_doe_full = True
                doe_study_id = insert_returning_id(
                    conn,
                    doe_table,
                    {
                        "plant_id": tour_plant_id,
                        "name": "Surface Finish Optimization",
                        "design_type": "full_factorial",
                        "status": "analyzed",
                        "response_name": "Surface Roughness",
                        "response_unit": "Ra",
                        "notes": "2-factor full factorial study to optimize machining parameters",
                        "created_by": admin_id,
                        "created_at": now,
                        "updated_at": now,
                    },
                )
                conn.execute(
                    insert(DOEFactor.__table__),
                    [
                        {
                            "study_id": doe_study_id,
                            "name": "Temperature",
                            "low_level": 150.0,
                            "high_level": 250.0,
                            "center_point": 200.0,
                            "unit": "C",
                            "display_order": 0,
                        },
                        {
                            "study_id": doe_study_id,
                            "name": "Cutting Speed",
                            "low_level": 500.0,
                            "high_level": 1500.0,
                            "center_point": 1000.0,
                            "unit": "RPM",
                            "display_order": 1,
                        },
                    ],
                )

            rng_doe = random.Random(42)
            doe_runs = [
                (1,  1,  150.0,  500.0, False, 1),
                (2,  2,  250.0,  500.0, False, 1),
                (3,  3,  150.0, 1500.0, False, 1),
                (4,  4,  250.0, 1500.0, False, 1),
                (5,  5,  200.0, 1000.0, True,  1),
                (6,  6,  200.0, 1000.0, True,  2),
                (7,  1,  150.0,  500.0, False, 2),
                (8,  2,  250.0,  500.0, False, 2),
                (9,  3,  150.0, 1500.0, False, 2),
                (10, 4,  250.0, 1500.0, False, 2),
            ]
            if _seed_doe_full:
                for run_order, std_order, temp, speed, is_center, replicate in doe_runs:
                    temp_coded = (temp - 200.0) / 50.0
                    speed_coded = (speed - 1000.0) / 500.0
                    response = round(
                        2.0
                        - 0.3 * temp_coded
                        - 0.5 * speed_coded
                        + 0.2 * temp_coded * speed_coded
                        + rng_doe.gauss(0, 0.1),
                        3,
                    )
                    factor_vals = json.dumps(
                        {"Temperature": temp, "Cutting Speed": speed}
                    )
                    conn.execute(
                        insert(DOERun.__table__),
                        [
                            {
                                "study_id": doe_study_id,
                                "run_order": run_order,
                                "standard_order": std_order,
                                "factor_values": factor_vals,
                                "factor_actuals": factor_vals,
                                "response_value": response,
                                "is_center_point": is_center,
                                "replicate": replicate,
                                "completed_at": now,
                            }
                        ],
                    )

                conn.execute(
                    insert(DOEAnalysis.__table__),
                    [
                        {
                            "study_id": doe_study_id,
                            "anova_table": json.dumps(
                                [
                                    {"source": "Temperature", "df": 1, "ss": 0.72, "ms": 0.72, "f_value": 14.4, "p_value": 0.005},
                                    {"source": "Cutting Speed", "df": 1, "ss": 2.0, "ms": 2.0, "f_value": 40.0, "p_value": 0.0002},
                                    {"source": "Temperature*Speed", "df": 1, "ss": 0.32, "ms": 0.32, "f_value": 6.4, "p_value": 0.035},
                                    {"source": "Residual", "df": 6, "ss": 0.30, "ms": 0.05, "f_value": None, "p_value": None},
                                ]
                            ),
                            "effects": json.dumps(
                                {"Temperature": -0.3, "Cutting Speed": -0.5}
                            ),
                            "interactions": json.dumps(
                                {"Temperature*Cutting Speed": 0.2}
                            ),
                            "r_squared": 0.91,
                            "adj_r_squared": 0.87,
                            "regression_model": json.dumps(
                                {
                                    "intercept": 2.0,
                                    "Temperature": -0.3,
                                    "Cutting Speed": -0.5,
                                    "Temperature*Cutting Speed": 0.2,
                                }
                            ),
                            "optimal_settings": json.dumps(
                                {
                                    "Temperature": 250.0,
                                    "Cutting Speed": 1500.0,
                                    "predicted_response": 1.0,
                                }
                            ),
                            "computed_at": now,
                        }
                    ],
                )

            # 9d. MQTT broker (idempotent on plant_id + name).
            mb_table = MQTTBroker.__table__
            mb_existing = _scalar_or_none(
                conn,
                select(mb_table.c.id).where(
                    mb_table.c.plant_id == tour_plant_id,
                    mb_table.c.name == "Shop Floor Broker",
                ),
            )
            if mb_existing is None:
                tour_broker_id = insert_returning_id(
                    conn,
                    mb_table,
                    {
                        "plant_id": tour_plant_id,
                        "name": "Shop Floor Broker",
                        "host": "localhost",
                        "port": 1883,
                        "client_id": "cassini-tour-001",
                        "keepalive": 60,
                        "max_reconnect_delay": 300,
                        "use_tls": False,
                        "tls_insecure": False,
                        "is_active": True,
                        "payload_format": "json",
                        "outbound_enabled": False,
                        "outbound_topic_prefix": "cassini",
                        "outbound_format": "json",
                        "outbound_rate_limit": 1.0,
                        "created_at": now,
                        "updated_at": now,
                    },
                )
            else:
                tour_broker_id = mb_existing

            # 9e. Signature Workflow + steps (idempotent on plant_id + resource_type).
            sw_table = SignatureWorkflow.__table__
            sw_existing = _scalar_or_none(
                conn,
                select(sw_table.c.id).where(
                    sw_table.c.plant_id == tour_plant_id,
                    sw_table.c.resource_type == "sample_approval",
                ),
            )
            if sw_existing is None:
                tour_workflow_id = insert_returning_id(
                    conn,
                    sw_table,
                    {
                        "plant_id": tour_plant_id,
                        "name": "Sample Approval Workflow",
                        "resource_type": "sample_approval",
                        "is_active": True,
                        "is_required": True,
                        "description": "Two-step approval for critical sample data",
                        "created_at": now,
                        "updated_at": now,
                    },
                )
                conn.execute(
                    insert(SignatureWorkflowStep.__table__),
                    [
                        {
                            "workflow_id": tour_workflow_id,
                            "step_order": 1,
                            "name": "Engineering Review",
                            "min_role": "engineer",
                            "meaning_code": "reviewed",
                            "is_required": True,
                            "allow_self_sign": False,
                            "timeout_hours": 48,
                        },
                        {
                            "workflow_id": tour_workflow_id,
                            "step_order": 2,
                            "name": "Quality Approval",
                            "min_role": "supervisor",
                            "meaning_code": "approved",
                            "is_required": True,
                            "allow_self_sign": False,
                            "timeout_hours": 24,
                        },
                    ],
                )
            else:
                tour_workflow_id = sw_existing

            # Signature meanings (idempotent on (plant_id, code)).
            sm_table = SignatureMeaning.__table__
            for sort_order, (code, display, desc, req_comment) in enumerate(
                [
                    ("reviewed", "Reviewed", "Content has been technically reviewed", False),
                    ("approved", "Approved", "Content has been approved for release", False),
                    ("rejected", "Rejected", "Content has been rejected -- requires rework", True),
                ]
            ):
                exists = _scalar_or_none(
                    conn,
                    select(sm_table.c.id).where(
                        sm_table.c.plant_id == tour_plant_id,
                        sm_table.c.code == code,
                    ),
                )
                if exists is None:
                    conn.execute(
                        insert(sm_table),
                        [
                            {
                                "plant_id": tour_plant_id,
                                "code": code,
                                "display_name": display,
                                "description": desc,
                                "requires_comment": req_comment,
                                "is_active": True,
                                "sort_order": sort_order,
                            }
                        ],
                    )

            # 9f. Retention Policy (7 years).
            rp_table = RetentionPolicy.__table__
            rp_exists = _scalar_or_none(
                conn,
                select(rp_table.c.id).where(
                    rp_table.c.plant_id == tour_plant_id,
                    rp_table.c.scope == "global",
                ),
            )
            if rp_exists is None:
                conn.execute(
                    insert(rp_table),
                    [
                        {
                            "plant_id": tour_plant_id,
                            "scope": "global",
                            "hierarchy_id": None,
                            "characteristic_id": None,
                            "retention_type": "time_delta",
                            "retention_value": 7,
                            "retention_unit": "years",
                            "created_at": now,
                            "updated_at": now,
                        }
                    ],
                )

            # 9g. Audit Log entries.
            audit_entries = [
                (admin_id, "admin", "login",                  None,             None,              {"method": "password"},         "192.168.1.100"),
                (admin_id, "admin", "create_plant",           "plant",          tour_plant_id,     {"name": "Screenshot Tour Plant"}, "192.168.1.100"),
                (admin_id, "admin", "create_characteristic",  "characteristic", tour_char_id,      {"name": "Test Char"},          "192.168.1.100"),
                (admin_id, "admin", "submit_sample",          "sample",         ooc_sample_ids[0], {"value": 12.8},                "192.168.1.100"),
                (admin_id, "admin", "acknowledge_violation",  "violation",      v1,                {"reason": "Expected process adjustment"}, "192.168.1.100"),
                (admin_id, "admin", "export_report",          "report",         None,              {"format": "pdf", "type": "capability"}, "192.168.1.100"),
            ]
            audit_rows = [
                {
                    "user_id": user_id,
                    "username": uname,
                    "action": action,
                    "resource_type": res_type,
                    "resource_id": res_id,
                    "detail": detail,
                    "ip_address": ip,
                    "timestamp": now,
                }
                for (user_id, uname, action, res_type, res_id, detail, ip) in audit_entries
            ]
            conn.execute(insert(AuditLog.__table__), audit_rows)

            # 9h. SOP-RAG corpus: one indexed document with three chunks so
            # the SOP-RAG screenshot tour can show a populated corpus.
            # The actual Q/A flow requires ANTHROPIC_API_KEY at runtime —
            # the screenshot test mocks the /query endpoint with page.route.
            sd_table = SopDoc.__table__
            sop_doc_existing = _scalar_or_none(
                conn,
                select(sd_table.c.id).where(
                    sd_table.c.plant_id == tour_plant_id,
                    sd_table.c.title == "M6 Bolt Assembly Procedure",
                ),
            )
            if sop_doc_existing is None:
                tour_sop_doc_id = insert_returning_id(
                    conn,
                    sd_table,
                    {
                        "plant_id": tour_plant_id,
                        "title": "M6 Bolt Assembly Procedure",
                        "filename": "m6-bolt-assembly.md",
                        "content_type": "text/markdown",
                        "storage_path": f"seed/sop/{tour_plant_id}/m6-bolt-assembly.md",
                        "byte_size": 612,
                        "char_count": 612,
                        "chunk_count": 3,
                        "embedding_model": "local",
                        "status": "ready",
                        "status_message": None,
                        "pii_warning": False,
                        "pii_match_summary": None,
                        "uploaded_by": admin_id,
                        "created_at": now,
                        "updated_at": now,
                    },
                )
                sop_chunks = [
                    (
                        0,
                        "Tighten the M6 bolt to 12 Nm using the calibrated torque "
                        "wrench. Apply Loctite 243 to the threads before assembly. "
                        "Verify torque after 24 hours of cure time.",
                        "section 1 / page 1",
                    ),
                    (
                        1,
                        "After the cure period the operator must sign the inspection "
                        "sheet in section 3-B. Operator ID is logged with timestamp.",
                        "section 3-B / page 2",
                    ),
                    (
                        2,
                        "Loctite 243 has a shelf life of 24 months from the manufacture "
                        "date. Refrigerated storage extends this to 30 months.",
                        "appendix A / page 3",
                    ),
                ]
                for chunk_index, text, label in sop_chunks:
                    conn.execute(
                        insert(SopChunk.__table__),
                        [
                            {
                                "doc_id": tour_sop_doc_id,
                                "plant_id": tour_plant_id,
                                "chunk_index": chunk_index,
                                "text": text,
                                "token_count": len(text.split()),
                                "paragraph_label": label,
                                "embedding": None,
                                "embedding_dim": None,
                                "created_at": now,
                            }
                        ],
                    )

            manifest["screenshot_tour"] = {
                **tour,
                "msa_study_id": msa_study_id,
                "fai_report_id": fai_report_id,
                "doe_study_id": doe_study_id,
                "broker_id": tour_broker_id,
                "workflow_id": tour_workflow_id,
            }

            # 10. Test Plant.
            s13_plant = get_or_insert_plant(conn, "Tests", "EXTENDED")
            s13_dept = get_or_insert_hierarchy(conn, s13_plant, "S13 Dept", "Area")
            s13_line = get_or_insert_hierarchy(conn, s13_plant, "S13 Line", "Line", s13_dept)
            s13_station = get_or_insert_hierarchy(
                conn, s13_plant, "S13 Station", "Cell", s13_line
            )
            grant_role(conn, admin_id, s13_plant, "admin")

            s13_char = get_or_insert_characteristic(
                conn, s13_station, "S13 Variable",
                target_value=10.0, usl=12.0, lsl=8.0,
                ucl=11.5, lcl=8.5, stored_sigma=0.5, stored_center_line=10.0,
            )
            insert_nelson_rules(conn, s13_char)

            rng_s13 = random.Random(1337)
            for _ in range(100):
                val = round(rng_s13.gauss(10.0, 0.5), 3)
                insert_variable_sample(conn, s13_char, val)

            ooc_vals_s13 = [14.0, 6.0, 13.5, 5.5, 14.5]
            s13_violation_ids: list[int] = []
            for val in ooc_vals_s13:
                sid = insert_variable_sample(conn, s13_char, val)
                vid = insert_violation(conn, sid, s13_char)
                s13_violation_ids.append(vid)

            s13_pooled_char = get_or_insert_characteristic(
                conn, s13_station, "S13 Pooled",
                target_value=10.0, usl=15.0, lsl=5.0,
                ucl=13.0, lcl=7.0, stored_sigma=0.8, stored_center_line=10.0,
                sigma_method="pooled",
            )
            insert_nelson_rules(conn, s13_pooled_char)

            s13_raw_cls_id, _s13_raw_path = get_or_insert_material_class(
                conn, s13_plant, "S13 Materials", "S13MAT",
                description="test materials",
            )
            s13_mat_a = get_or_insert_material(
                conn, s13_plant, s13_raw_cls_id, "S13 Material A", "S13-MAT-A"
            )
            s13_mat_b = get_or_insert_material(
                conn, s13_plant, s13_raw_cls_id, "S13 Material B", "S13-MAT-B"
            )

            insert_material_limit_override(
                conn, s13_pooled_char, material_id=s13_mat_a,
                target_value=10.0, stored_sigma=0.8, stored_center_line=10.0,
            )
            insert_material_limit_override(
                conn, s13_pooled_char, material_id=s13_mat_b,
                target_value=11.0, stored_sigma=0.9, stored_center_line=11.0,
            )

            for _ in range(30):
                val = round(rng_s13.gauss(10.0, 0.8), 3)
                insert_variable_sample(
                    conn, s13_pooled_char, val, material_id=s13_mat_a
                )
            for _ in range(30):
                val = round(rng_s13.gauss(11.0, 0.9), 3)
                insert_variable_sample(
                    conn, s13_pooled_char, val, material_id=s13_mat_b
                )

            s13_phase_char = get_or_insert_characteristic(
                conn, s13_station, "S13 Phase",
                target_value=10.0, usl=20.0, lsl=0.0,
                ucl=13.0, lcl=7.0, stored_sigma=1.0, stored_center_line=10.0,
            )
            insert_nelson_rules(conn, s13_phase_char)
            for _ in range(50):
                val = round(rng_s13.gauss(10.0, 1.0), 3)
                insert_variable_sample(conn, s13_phase_char, val)

            s13_locked_user = get_or_insert_user(
                conn, "s13-locked", "S13Locked123!"
            )
            grant_role(conn, s13_locked_user, s13_plant, "operator")
            conn.execute(
                update(User.__table__)
                .where(User.__table__.c.id == s13_locked_user)
                .values(
                    failed_login_count=10,
                    locked_until=_SEED_BASE_TIME + timedelta(hours=24),
                )
            )

            s13_deactivated_user = get_or_insert_user(
                conn, "s13-deactivated", "S13Deact123!"
            )
            grant_role(conn, s13_deactivated_user, s13_plant, "operator")
            conn.execute(
                update(User.__table__)
                .where(User.__table__.c.id == s13_deactivated_user)
                .values(is_active=False)
            )

            for action, summary in [
                ("freeze", "Control limits frozen for 'S13 Phase' (Phase II)"),
                ("unfreeze", "Control limits unfrozen for 'S13 Phase' (back to Phase I)"),
            ]:
                conn.execute(
                    insert(AuditLog.__table__),
                    [
                        {
                            "user_id": admin_id,
                            "username": "admin",
                            "action": action,
                            "resource_type": "characteristic",
                            "resource_id": s13_phase_char,
                            "detail": {"summary": summary},
                            "ip_address": "192.168.1.100",
                            "timestamp": utcnow(),
                        }
                    ],
                )

            manifest["extended"] = {
                "plant_id": s13_plant,
                "dept_id": s13_dept,
                "line_id": s13_line,
                "station_id": s13_station,
                "char_id": s13_char,
                "pooled_char_id": s13_pooled_char,
                "phase_char_id": s13_phase_char,
                "locked_user_id": s13_locked_user,
                "deactivated_user_id": s13_deactivated_user,
                "mat_a_id": s13_mat_a,
                "mat_b_id": s13_mat_b,
            }

    finally:
        engine.dispose()

    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Seed E2E test database — works on SQLite, PostgreSQL, MySQL, MSSQL."
    )
    parser.add_argument(
        "--db-url",
        default=os.environ.get("DATABASE_URL"),
        help="SQLAlchemy URL (sync or async driver). Defaults to DATABASE_URL env var.",
    )
    parser.add_argument(
        "--manifest",
        default=str(backend_dir / "e2e-manifest.json"),
        help="Path to write the ID manifest JSON.",
    )
    parser.add_argument(
        "--minimal",
        action="store_true",
        help="Seed only the admin user + dashboard plant (smoke test).",
    )
    parser.add_argument(
        "--profile",
        choices=["default", "feature-tour"],
        default="default",
        help=(
            "Seed profile. 'default' runs the existing E2E fixtures used by "
            "Playwright global-setup and multi-DB CI. 'feature-tour' runs "
            "the feature-highlight dataset (SEED_SPEC.md)."
        ),
    )
    args = parser.parse_args()

    if not args.db_url:
        print(
            "ERROR: --db-url is required (or set DATABASE_URL env var).",
            file=sys.stderr,
        )
        sys.exit(2)

    # Validate the URL parses before we open the engine.
    try:
        parsed = make_url(args.db_url)
    except Exception as exc:
        print(f"ERROR: Invalid database URL: {exc}", file=sys.stderr)
        sys.exit(2)

    manifest = seed(args.db_url, minimal=args.minimal, profile=args.profile)

    with open(args.manifest, "w") as f:
        json.dump(manifest, f, indent=2, default=str)

    if args.profile == "feature-tour":
        print(f"Seeded {parsed.get_backend_name()} (profile=feature-tour) successfully.")
        print(f"Manifest written to {args.manifest}")
        print(f"  Plants: {len(manifest.get('plants', {}))}")
        print(f"  Users: {len(manifest.get('users', {}))}")
        print(f"  Characteristics: {len(manifest.get('characteristics', {}))}")
        print(f"  Samples seeded: {manifest.get('sample_count', 0)}")
        print(f"  Violations seeded: {manifest.get('violations_seeded', 0)}")
        print(f"  MSA studies: {len(manifest.get('msa_studies', {}))}")
        print(f"  DOE studies: {len(manifest.get('doe_studies', {}))}")
        print(f"  FAI reports: {len(manifest.get('fai_reports', {}))}")
        print(f"  CEP rules: {len(manifest.get('cep_rules', {}))}")
        print(f"  SOP docs: {len(manifest.get('sop_rag', {}).get('docs', {}))}")
    else:
        plant_count = sum(
            1
            for v in manifest.values()
            if isinstance(v, dict) and "plant_id" in v
        )
        print(f"Seeded {parsed.get_backend_name()} successfully.")
        print(f"Manifest written to {args.manifest}")
        print(f"  Plants: {plant_count}")
        print(f"  Admin user ID: {manifest.get('admin_user_id')}")


if __name__ == "__main__":
    main()
