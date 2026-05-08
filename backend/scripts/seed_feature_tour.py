"""Feature-tour seed profile — produces the 380-state UI showcase dataset.

This module implements the SEED_SPEC.md (apps/cassini/docs/feature-audit/) and
is invoked from ``seed_e2e_unified.py --profile feature-tour``.

It builds on the helpers in ``seed_e2e_unified``:

- ``insert_returning_id`` — RETURNING-aware multi-dialect insert
- ``get_or_insert_*`` — natural-key idempotent inserters
- ``insert_variable_sample`` / ``insert_attribute_sample``
- ``insert_violation`` / ``insert_nelson_rules``
- ``utcnow`` / ``seed_ts`` — UTC-aware timestamps

Seed sections (one helper per spec section):

1.  Plants (3): Aerospace Forge, Pharma Fill, Auto Stamping
2.  Users (7): admin + 6 RBAC matrix rows
3.  Hierarchies + characteristics (~17 chars across the 3 plants)
4.  Sample histories (3-phase, 90-day, ~120-160 rows per char)
5.  Violations (~20-25, mixed states)
6.  Annotations (point + period)
7.  Capability snapshots
8.  MSA studies (4 study types)
9.  DOE studies (4 designs)
10. FAI reports (4, full lifecycle)
11. Materials + collection plans
12. Connectivity (MQTT, OPC-UA, gage bridges, ERP)
13. Audit log (50+ entries)
14. Electronic signatures + workflows
15. Retention policies + 1 purge run
16. Analytics (multivariate, predictions, AI insights, correlation, anomaly)
17. Enterprise features (CEP rules, SOP-RAG, lakehouse export run)
18. Reports (1 schedule + 4 runs)
19. API/integration surface (API keys, OIDC, push, SMTP)

Idempotency rules (per SEED_SPEC.md section 22):
- Configuration entities use natural keys (plant.code, char (hierarchy_id,name),
  user.username, study (plant_id,name), CEP (plant_id,name), SOP doc
  (plant_id,title), etc.). Re-running skips on existing key.
- Sample-level rows (samples, measurements, violations, audit log entries,
  signature instances, MSA measurements, anomaly events) accumulate. The
  single-shot playground manifest gates re-runs in practice.
"""
from __future__ import annotations

import hashlib
import json
import random
import secrets
from dataclasses import asdict
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from sqlalchemy import Connection, insert, select, update

from cassini.core.auth.passwords import hash_password
from cassini.core.msa.engine import GageRREngine
from cassini.db.models import (
    AIInsight,
    AIProviderConfig,
    AnomalyEvent,
    APIKey,
    Annotation,
    AuditLog,
    CapabilityHistory,
    CepRule,
    Characteristic,
    CollectionPlan,
    CollectionPlanItem,
    CorrelationResult,
    DOEAnalysis,
    DOEFactor,
    DOERun,
    DOEStudy,
    ElectronicSignature,
    ERPConnector,
    ERPSyncSchedule,
    ERPSyncLog,
    FAIItem,
    FAIReport,
    Forecast,
    GageBridge,
    GagePort,
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
    MultivariateGroup,
    MultivariateGroupMember,
    MultivariateSample,
    OIDCConfig,
    OPCUAServer,
    Plant,
    PredictionConfig,
    PredictionModel,
    PurgeHistory,
    PushSubscription,
    ReportRun,
    ReportSchedule,
    RetentionPolicy,
    Sample,
    SignatureMeaning,
    SignatureWorkflow,
    SignatureWorkflowInstance,
    SignatureWorkflowStep,
    SmtpConfig,
    SopChunk,
    SopDoc,
    SopRagBudget,
    User,
    UserPlantRole,
    Violation,
    WebhookConfig,
)
from cassini.db.models.data_source import MQTTDataSource, OPCUADataSource


# ── Constants for the spec ───────────────────────────────────────────────


PLANTS_SPEC: list[dict[str, Any]] = [
    {
        "code": "AERO-FORGE",
        "name": "Aerospace Forge",
        "tier": "enterprise",
        "industry": "Aerospace forging — turbine housings & shafts",
    },
    {
        "code": "PHARMA-FILL",
        "name": "Pharma Fill",
        "tier": "pro",
        "industry": "Sterile fill-finish line",
    },
    {
        "code": "AUTO-STAMP",
        "name": "Auto Stamping",
        "tier": "open",
        "industry": "High-volume sheet-metal stamping",
    },
]


USERS_SPEC: list[dict[str, Any]] = [
    {
        "username": "admin",
        "password": "admin",
        "full_name": "Cassini Admin",
        "must_change_password": True,
        "global_role": "admin",  # All plants
    },
    {
        "username": "engineer.aero",
        "password": "seed-pass-1",
        "full_name": "Eve Engineer (Aerospace)",
        "plant_roles": [("AERO-FORGE", "engineer")],
    },
    {
        "username": "supervisor.pharma",
        "password": "seed-pass-1",
        "full_name": "Sam Supervisor (Pharma)",
        "plant_roles": [("PHARMA-FILL", "supervisor")],
    },
    {
        "username": "operator.auto",
        "password": "seed-pass-1",
        "full_name": "Otis Operator (Auto)",
        "plant_roles": [("AUTO-STAMP", "operator")],
    },
    {
        "username": "locked.user",
        "password": "seed-pass-1",
        "full_name": "Locked Lou",
        "plant_roles": [("AUTO-STAMP", "operator")],
        "failed_login_count": 6,  # >= 5 → locked
    },
    {
        "username": "inactive.user",
        "password": "seed-pass-1",
        "full_name": "Iris Inactive",
        "plant_roles": [("PHARMA-FILL", "operator")],
        "is_active": False,
    },
    {
        "username": "multi.role",
        "password": "seed-pass-1",
        "full_name": "Marty Multi-role",
        "plant_roles": [
            ("AERO-FORGE", "engineer"),
            ("AUTO-STAMP", "supervisor"),
        ],
    },
]


# Per-characteristic configuration (everything we'll create in section 3).
# Key: (plant_code, char_name). Used by all downstream sections that need
# the char_id by friendly name.
CHARS_SPEC: list[dict[str, Any]] = [
    # Aerospace Forge
    {
        "plant_code": "AERO-FORGE",
        "name": "Bore Diameter OD-A",
        "hierarchy_path": ["Forge Area", "Press Line A", "Station 1: Turbine Housing"],
        "subgroup_size": 5,
        "target_value": 10.0,
        "usl": 12.0,
        "lsl": 8.0,
        "stored_sigma": 0.4,
        "decimal_precision": 3,
        "data_type": "variable",
    },
    {
        "plant_code": "AERO-FORGE",
        "name": "Wall Thickness",
        "hierarchy_path": ["Forge Area", "Press Line A", "Station 1: Turbine Housing"],
        "subgroup_size": 1,
        "target_value": 5.0,
        "usl": 5.5,
        "lsl": 4.5,
        "stored_sigma": 0.1,
        "decimal_precision": 3,
        "data_type": "variable",
    },
    {
        "plant_code": "AERO-FORGE",
        "name": "Mating Surface Flatness",
        "hierarchy_path": ["Forge Area", "Press Line A", "Station 1: Turbine Housing"],
        "subgroup_size": 1,
        "target_value": 0.02,
        "usl": 0.05,
        "lsl": 0.0,
        "stored_sigma": 0.005,
        "decimal_precision": 4,
        "data_type": "variable",
        "chart_type": "cusum",
        "cusum_target": 0.02,
        "cusum_k": 0.5,
        "cusum_h": 4.0,
    },
    {
        "plant_code": "AERO-FORGE",
        "name": "Shaft OD",
        "hierarchy_path": ["Forge Area", "Press Line A", "Station 2: Compressor Shaft"],
        "subgroup_size": 5,
        "target_value": 25.00,
        "usl": 25.05,
        "lsl": 24.95,
        "stored_sigma": 0.012,
        "decimal_precision": 4,
        "data_type": "variable",
        "sigma_method": "pooled",
    },
    {
        "plant_code": "AERO-FORGE",
        "name": "Surface Roughness Ra",
        "hierarchy_path": ["Forge Area", "Press Line A", "Station 2: Compressor Shaft"],
        "subgroup_size": 1,
        "target_value": 0.8,
        "usl": 1.6,
        "lsl": 0.0,
        "stored_sigma": 0.15,
        "decimal_precision": 3,
        "data_type": "variable",
        "chart_type": "ewma",
        "ewma_lambda": 0.2,
        "ewma_l": 2.7,
    },
    {
        "plant_code": "AERO-FORGE",
        "name": "Coolant Temp",
        "hierarchy_path": ["Forge Area", "Heat Treat Line", "Furnace 1"],
        "subgroup_size": 1,
        "target_value": 65.0,
        "usl": 75.0,
        "lsl": 55.0,
        "stored_sigma": 1.6,
        "decimal_precision": 1,
        "data_type": "variable",
    },
    {
        "plant_code": "AERO-FORGE",
        "name": "Hole Position True Position",
        "hierarchy_path": ["Inspection Area", "CMM Station"],
        "subgroup_size": 1,
        "target_value": 0.0,
        "usl": 0.05,
        "lsl": -0.05,
        "stored_sigma": 0.01,
        "decimal_precision": 4,
        "data_type": "variable",
        "short_run_mode": "deviation",
    },
    # Pharma Fill
    {
        "plant_code": "PHARMA-FILL",
        "name": "Fill Volume",
        "hierarchy_path": ["Aseptic Fill Area", "Fill Line 1", "Filler 1"],
        "subgroup_size": 5,
        "target_value": 10.0,
        "usl": 10.5,
        "lsl": 9.5,
        "stored_sigma": 0.12,
        "decimal_precision": 2,
        "data_type": "variable",
    },
    {
        "plant_code": "PHARMA-FILL",
        "name": "Particulate Count",
        "hierarchy_path": ["Aseptic Fill Area", "Fill Line 1", "Filler 1"],
        "data_type": "attribute",
        "attribute_chart_type": "c",
        "default_sample_size": 100,
    },
    {
        "plant_code": "PHARMA-FILL",
        "name": "Seal Defects",
        "hierarchy_path": ["Aseptic Fill Area", "Fill Line 1", "Sealing Station"],
        "data_type": "attribute",
        "attribute_chart_type": "np",
        "default_sample_size": 100,
    },
    {
        "plant_code": "PHARMA-FILL",
        "name": "Reject Rate",
        "hierarchy_path": ["Aseptic Fill Area", "Fill Line 1", "Visual Inspection"],
        "data_type": "attribute",
        "attribute_chart_type": "p",
        "default_sample_size": 200,
    },
    {
        "plant_code": "PHARMA-FILL",
        "name": "Fill Volume",  # Duplicate name, different hierarchy → compare-plants demo
        "hierarchy_path": ["Aseptic Fill Area", "Fill Line 2", "Filler 2"],
        "subgroup_size": 5,
        "target_value": 10.0,
        "usl": 10.5,
        "lsl": 9.5,
        "stored_sigma": 0.10,
        "decimal_precision": 2,
        "data_type": "variable",
    },
    # Auto Stamping
    {
        "plant_code": "AUTO-STAMP",
        "name": "Blank Hole Position OD",
        "hierarchy_path": ["Stamping Area", "Press Line 1", "Press 1"],
        "subgroup_size": 5,
        "target_value": 12.000,
        "usl": 12.05,
        "lsl": 11.95,
        "stored_sigma": 0.012,
        "decimal_precision": 4,
        "data_type": "variable",
    },
    {
        "plant_code": "AUTO-STAMP",
        "name": "Trim Length",
        "hierarchy_path": ["Stamping Area", "Press Line 1", "Press 1"],
        "subgroup_size": 1,
        "target_value": 200.0,
        "usl": 200.5,
        "lsl": 199.5,
        "stored_sigma": 0.10,
        "decimal_precision": 2,
        "data_type": "variable",
    },
    {
        "plant_code": "AUTO-STAMP",
        "name": "Spring Force",
        "hierarchy_path": ["Stamping Area", "Press Line 1", "Press 1"],
        "subgroup_size": 5,
        "target_value": 50.0,
        "usl": 53.0,
        "lsl": 47.0,
        "stored_sigma": 0.6,
        "decimal_precision": 2,
        "data_type": "variable",
    },
    {
        "plant_code": "AUTO-STAMP",
        "name": "Punch Wear",
        "hierarchy_path": ["Stamping Area", "Press Line 1", "Press 2"],
        "subgroup_size": 1,
        "target_value": 1.0,
        "usl": 2.0,
        "lsl": 0.0,
        "stored_sigma": 0.30,
        "decimal_precision": 3,
        "data_type": "variable",
        "chart_type": "ewma",
        "ewma_lambda": 0.2,
        "ewma_l": 2.7,
    },
    {
        "plant_code": "AUTO-STAMP",
        "name": "Defect Count",
        "hierarchy_path": ["Stamping Area", "Press Line 1", "Press 2"],
        "data_type": "attribute",
        "attribute_chart_type": "c",
        "default_sample_size": 100,
    },
    {
        "plant_code": "AUTO-STAMP",
        "name": "Surface Defect Rate",
        "hierarchy_path": ["Stamping Area", "Final Inspection"],
        "data_type": "attribute",
        "attribute_chart_type": "u",
        "default_sample_size": 50,
    },
    {
        "plant_code": "AUTO-STAMP",
        "name": "Box-Whisker Demo Char",
        "hierarchy_path": ["Stamping Area", "Final Inspection"],
        "subgroup_size": 5,
        "target_value": 100.0,
        "usl": 110.0,
        "lsl": 90.0,
        "stored_sigma": 2.5,
        "decimal_precision": 1,
        "data_type": "variable",
        "chart_type": "box-whisker",
    },
]


_NELSON_DEFAULTS = (
    (1, True, True),
    (2, True, True),
    (3, True, False),
    (4, True, False),
    (5, True, False),
    (6, True, False),
    (7, True, False),
    (8, True, False),
)


# Hierarchy types per ISA-95 level depth (root → leaf)
_HIERARCHY_TYPES = ["Area", "Line", "Cell", "Equipment"]


# ── Utilities ────────────────────────────────────────────────────────────


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _scalar_or_none(conn: Connection, stmt) -> Optional[Any]:
    return conn.execute(stmt).scalar_one_or_none()


def _insert_returning_id(conn: Connection, table, values: dict[str, Any]) -> int:
    """Replicates ``seed_e2e_unified.insert_returning_id``.

    Duplicated here to keep this module importable even if circular-import
    constraints arise.
    """
    pk_col = table.c.id
    if conn.dialect.name == "mysql":
        result = conn.execute(insert(table), values)
        if result.inserted_primary_key is not None:
            return int(result.inserted_primary_key[0])
        raise RuntimeError("MySQL insert did not return a primary key")
    stmt = insert(table).values(**values).returning(pk_col)
    return int(conn.execute(stmt).scalar_one())


def _filter_to_columns(table, values: dict[str, Any]) -> dict[str, Any]:
    """Drop unknown keys so callers can pass extra config without errors."""
    valid = {c.name for c in table.columns}
    return {k: v for k, v in values.items() if k in valid}


# ── Section 1: Plants ────────────────────────────────────────────────────


def seed_plants(conn: Connection) -> dict[str, int]:
    """Insert the 3 feature-tour plants (or look up existing ones)."""
    plant_table = Plant.__table__
    out: dict[str, int] = {}
    now = _utcnow()
    for spec in PLANTS_SPEC:
        existing = _scalar_or_none(
            conn,
            select(plant_table.c.id).where(plant_table.c.code == spec["code"]),
        )
        if existing is not None:
            out[spec["code"]] = existing
            # Refresh settings so the tier display is consistent on re-runs.
            conn.execute(
                update(plant_table)
                .where(plant_table.c.id == existing)
                .values(
                    settings={
                        "display_tier": spec["tier"],
                        "industry_slant": spec["industry"],
                    }
                )
            )
            continue
        out[spec["code"]] = _insert_returning_id(
            conn,
            plant_table,
            {
                "name": spec["name"],
                "code": spec["code"],
                "is_active": True,
                "settings": {
                    "display_tier": spec["tier"],
                    "industry_slant": spec["industry"],
                },
                "created_at": now,
                "updated_at": now,
            },
        )
    return out


# ── Section 2: Users ─────────────────────────────────────────────────────


def seed_users(conn: Connection, plant_ids: dict[str, int]) -> dict[str, int]:
    """Create the 7-user RBAC matrix."""
    user_table = User.__table__
    role_table = UserPlantRole.__table__
    out: dict[str, int] = {}
    now = _utcnow()
    for spec in USERS_SPEC:
        username = spec["username"]
        existing = _scalar_or_none(
            conn,
            select(user_table.c.id).where(user_table.c.username == username),
        )
        if existing is not None:
            uid = existing
        else:
            uid = _insert_returning_id(
                conn,
                user_table,
                {
                    "username": username,
                    "hashed_password": hash_password(spec["password"]),
                    "is_active": spec.get("is_active", True),
                    "must_change_password": spec.get("must_change_password", False),
                    "full_name": spec.get("full_name"),
                    "failed_login_count": spec.get("failed_login_count", 0),
                    "locked_until": (
                        now + timedelta(hours=24)
                        if spec.get("failed_login_count", 0) >= 5
                        else None
                    ),
                    "created_at": now,
                    "updated_at": now,
                },
            )
        out[username] = uid

        # Grant per-plant roles. Admin gets every plant; others the listed ones.
        if spec.get("global_role") == "admin":
            for code, pid in plant_ids.items():
                _grant_role(conn, uid, pid, "admin")
        else:
            for code, role in spec.get("plant_roles", []):
                if code in plant_ids:
                    _grant_role(conn, uid, plant_ids[code], role)

        # On re-runs make sure failed_login_count / is_active reflect spec.
        # (Helps the locked.user / inactive.user states stay correct.)
        conn.execute(
            update(user_table)
            .where(user_table.c.id == uid)
            .values(
                is_active=spec.get("is_active", True),
                failed_login_count=spec.get("failed_login_count", 0),
                locked_until=(
                    now + timedelta(hours=24)
                    if spec.get("failed_login_count", 0) >= 5
                    else None
                ),
                full_name=spec.get("full_name"),
            )
        )
    return out


def _grant_role(conn: Connection, user_id: int, plant_id: int, role: str) -> None:
    role_table = UserPlantRole.__table__
    existing = _scalar_or_none(
        conn,
        select(role_table.c.id).where(
            role_table.c.user_id == user_id, role_table.c.plant_id == plant_id
        ),
    )
    if existing is not None:
        # Update the role to the spec value (handles role changes on re-run).
        conn.execute(
            update(role_table)
            .where(role_table.c.id == existing)
            .values(role=role)
        )
        return
    conn.execute(
        insert(role_table),
        [{"user_id": user_id, "plant_id": plant_id, "role": role}],
    )


# ── Section 3: Hierarchies + characteristics ─────────────────────────────


def seed_hierarchies_and_chars(
    conn: Connection, plant_ids: dict[str, int]
) -> dict[tuple[str, str, str], int]:
    """Build hierarchy trees + characteristics. Returns {(plant_code, hier_path_str, char_name): char_id}."""
    hier_table = Hierarchy.__table__
    char_table = Characteristic.__table__
    rule_table = __import__(
        "cassini.db.models.characteristic", fromlist=["CharacteristicRule"]
    ).CharacteristicRule.__table__

    char_ids: dict[tuple[str, str, str], int] = {}

    # First, ensure every plant has a "Site" root so the path is full ISA-95.
    site_ids: dict[str, int] = {}
    for code, pid in plant_ids.items():
        site_name = next(p["name"] for p in PLANTS_SPEC if p["code"] == code) + " Site"
        site_id = _get_or_insert_hierarchy(conn, pid, site_name, "Site", parent_id=None)
        site_ids[code] = site_id

    for spec in CHARS_SPEC:
        code = spec["plant_code"]
        pid = plant_ids[code]
        parent_id = site_ids[code]
        for level_idx, hname in enumerate(spec["hierarchy_path"]):
            htype = _HIERARCHY_TYPES[min(level_idx, len(_HIERARCHY_TYPES) - 1)]
            parent_id = _get_or_insert_hierarchy(conn, pid, hname, htype, parent_id)
        # Insert characteristic
        char_id = _get_or_insert_char(conn, parent_id, spec)
        # Install Nelson rules
        existing_rules = {
            row[0]
            for row in conn.execute(
                select(rule_table.c.rule_id).where(rule_table.c.char_id == char_id)
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
            conn.execute(insert(rule_table), rows)

        path_str = " > ".join(spec["hierarchy_path"])
        char_ids[(code, path_str, spec["name"])] = char_id

    return char_ids


def _get_or_insert_hierarchy(
    conn: Connection,
    plant_id: int,
    name: str,
    htype: str,
    parent_id: Optional[int],
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
    return _insert_returning_id(
        conn,
        table,
        {
            "plant_id": plant_id,
            "name": name,
            "type": htype,
            "parent_id": parent_id,
        },
    )


def _get_or_insert_char(
    conn: Connection, hierarchy_id: int, spec: dict[str, Any]
) -> int:
    table = Characteristic.__table__
    existing = _scalar_or_none(
        conn,
        select(table.c.id).where(
            table.c.hierarchy_id == hierarchy_id, table.c.name == spec["name"]
        ),
    )
    if existing is not None:
        return existing

    # Compute UCL/LCL from sigma if provided (Xbar-R standard ±3σ form).
    target = spec.get("target_value")
    sigma = spec.get("stored_sigma")
    n = spec.get("subgroup_size", 1)
    ucl = lcl = None
    if target is not None and sigma is not None:
        # Variable Xbar limits: ±3σ/√n (rough approximation for seed display).
        # The real engine recomputes when limits aren't frozen — these values
        # just keep the dashboards looking sensible until the first SPC run.
        adj = sigma / max(1, n) ** 0.5
        ucl = target + 3 * adj
        lcl = target - 3 * adj

    values = {
        "hierarchy_id": hierarchy_id,
        "name": spec["name"],
        "subgroup_size": spec.get("subgroup_size", 1),
        "subgroup_mode": "NOMINAL_TOLERANCE",
        "min_measurements": 1,
        "decimal_precision": spec.get("decimal_precision", 3),
        "target_value": target,
        "usl": spec.get("usl"),
        "lsl": spec.get("lsl"),
        "ucl": ucl,
        "lcl": lcl,
        "stored_sigma": sigma,
        "stored_center_line": target,
        "data_type": spec.get("data_type", "variable"),
        "attribute_chart_type": spec.get("attribute_chart_type"),
        "default_sample_size": spec.get("default_sample_size"),
        "chart_type": spec.get("chart_type"),
        "cusum_target": spec.get("cusum_target"),
        "cusum_k": spec.get("cusum_k"),
        "cusum_h": spec.get("cusum_h"),
        "ewma_lambda": spec.get("ewma_lambda"),
        "ewma_l": spec.get("ewma_l"),
        "sigma_method": spec.get("sigma_method"),
        "short_run_mode": spec.get("short_run_mode"),
    }
    return _insert_returning_id(conn, table, _filter_to_columns(table, values))


# ── Section 4: Sample histories (90 days, 3 phases) ──────────────────────


def seed_sample_histories(
    conn: Connection,
    char_ids: dict[tuple[str, str, str], int],
    rng: random.Random,
) -> dict[int, dict[str, Any]]:
    """For every characteristic, insert 120-160 samples in 3 phases.

    Returns a map char_id → {samples: [sample_id...], values: [...], timestamps: [...]}.
    """
    histories: dict[int, dict[str, Any]] = {}

    # Skip re-seeding sample histories if we already have any sample for the char.
    # Sample-level rows are designed to accumulate per spec section 22, but we
    # still want re-runs to be cheap; if a char already has 100+ samples, we
    # treat it as already seeded.
    for key, char_id in char_ids.items():
        plant_code, path_str, char_name = key
        spec = next(
            (
                c
                for c in CHARS_SPEC
                if c["plant_code"] == plant_code
                and c["name"] == char_name
                and " > ".join(c["hierarchy_path"]) == path_str
            ),
            None,
        )
        if spec is None:
            continue

        existing_count = conn.execute(
            select(Sample.__table__.c.id).where(Sample.__table__.c.char_id == char_id)
        ).all()
        # Threshold differs by data type because attribute charts use fewer
        # samples (~64 across the 3 phases) than variable charts (~130).
        is_attribute = spec.get("data_type", "variable") == "attribute"
        threshold = 50 if is_attribute else 100
        if len(existing_count) >= threshold:
            histories[char_id] = {
                "samples": [int(r[0]) for r in existing_count],
                "values": [],
                "timestamps": [],
                "spec": spec,
            }
            continue

        if spec.get("data_type", "variable") == "variable":
            sample_ids, values, timestamps = _seed_variable_history(
                conn, char_id, spec, rng
            )
        else:
            sample_ids, values, timestamps = _seed_attribute_history(
                conn, char_id, spec, rng
            )
        histories[char_id] = {
            "samples": sample_ids,
            "values": values,
            "timestamps": timestamps,
            "spec": spec,
        }
    return histories


def _seed_variable_history(
    conn: Connection, char_id: int, spec: dict[str, Any], rng: random.Random
) -> tuple[list[int], list[float], list[datetime]]:
    """3-phase variable sample history: in-control → drift → excursion."""
    target = float(spec.get("target_value", 0.0))
    sigma = float(spec.get("stored_sigma", 0.5))
    n = int(spec.get("subgroup_size", 1))
    decimals = int(spec.get("decimal_precision", 3))

    # Phase totals per spec: 80 / 25 / 25 = 130
    phase_counts = [80, 25, 25]
    phase_days = [60, 15, 15]
    base_time = _utcnow() - timedelta(days=90)

    sample_ids: list[int] = []
    sample_values: list[float] = []
    timestamps: list[datetime] = []
    cursor = base_time
    for phase_idx, count in enumerate(phase_counts):
        phase_start = cursor
        phase_end = cursor + timedelta(days=phase_days[phase_idx])
        for i in range(count):
            ts = phase_start + (phase_end - phase_start) * (i / max(1, count - 1))
            if phase_idx == 0:
                # In control: ~±0.5σ
                center = target
                sd = sigma * 0.5
            elif phase_idx == 1:
                # Drift: linear ramp +1.5σ
                ramp = 1.5 * sigma * (i / max(1, count - 1))
                center = target + ramp
                sd = sigma * 0.5
            else:
                # Phase III: visible problem - intermittent OOS spikes
                if i % 4 == 3:
                    # Out-of-spec spike
                    center = target + (spec.get("usl", target + 3 * sigma) - target) * 1.05
                else:
                    center = target + 1.0 * sigma  # still drifted
                sd = sigma * 0.8

            measurements = []
            for _ in range(n):
                v = rng.gauss(center, sd)
                measurements.append(round(v, decimals))
            mean_val = sum(measurements) / len(measurements)
            sample_id = _insert_returning_id(
                conn,
                Sample.__table__,
                {
                    "char_id": char_id,
                    "timestamp": ts.replace(tzinfo=timezone.utc),
                    "actual_n": n,
                    "is_excluded": False,
                    "is_undersized": False,
                    "is_modified": False,
                    "source": "MANUAL",
                },
            )
            conn.execute(
                insert(Measurement.__table__),
                [{"sample_id": sample_id, "value": v} for v in measurements],
            )
            sample_ids.append(sample_id)
            sample_values.append(mean_val)
            timestamps.append(ts.replace(tzinfo=timezone.utc))
        cursor = phase_end
    return sample_ids, sample_values, timestamps


def _seed_attribute_history(
    conn: Connection, char_id: int, spec: dict[str, Any], rng: random.Random
) -> tuple[list[int], list[float], list[datetime]]:
    """3-phase attribute sample history."""
    chart = spec.get("attribute_chart_type", "p")
    sample_size = int(spec.get("default_sample_size", 100))
    base_time = _utcnow() - timedelta(days=90)

    phase_counts = [40, 12, 12]   # smaller for attribute (one batch / shift)
    phase_days = [60, 15, 15]
    base_rate = 0.02 if chart in ("p", "np") else 4.0  # defects per unit for c/u

    sample_ids: list[int] = []
    sample_values: list[float] = []
    timestamps: list[datetime] = []
    cursor = base_time
    for phase_idx, count in enumerate(phase_counts):
        phase_start = cursor
        phase_end = cursor + timedelta(days=phase_days[phase_idx])
        for i in range(count):
            ts = phase_start + (phase_end - phase_start) * (i / max(1, count - 1))
            if phase_idx == 0:
                multiplier = 1.0
            elif phase_idx == 1:
                multiplier = 1.0 + 0.6 * (i / max(1, count - 1))
            else:
                multiplier = 2.5 if i % 3 == 2 else 1.6

            if chart in ("p", "np"):
                p = max(0.0, min(0.5, base_rate * multiplier))
                # Binomial draw approximation
                defects = sum(1 for _ in range(sample_size) if rng.random() < p)
                size = sample_size
                units = None
                value = defects / sample_size if sample_size else 0.0
            elif chart == "c":
                lam = base_rate * multiplier
                defects = max(0, int(round(rng.gauss(lam, max(1.0, lam ** 0.5)))))
                size = sample_size
                units = None
                value = float(defects)
            else:  # 'u'
                units_inspected = max(1, int(round(rng.uniform(40, 80))))
                lam = base_rate * multiplier * (units_inspected / 50.0)
                defects = max(0, int(round(rng.gauss(lam, max(1.0, lam ** 0.5)))))
                size = None
                units = units_inspected
                value = defects / units_inspected
            sample_id = _insert_returning_id(
                conn,
                Sample.__table__,
                {
                    "char_id": char_id,
                    "timestamp": ts.replace(tzinfo=timezone.utc),
                    "actual_n": 1,
                    "is_excluded": False,
                    "is_undersized": False,
                    "is_modified": False,
                    "defect_count": defects,
                    "sample_size": size,
                    "units_inspected": units,
                    "source": "MANUAL",
                },
            )
            sample_ids.append(sample_id)
            sample_values.append(value)
            timestamps.append(ts.replace(tzinfo=timezone.utc))
        cursor = phase_end
    return sample_ids, sample_values, timestamps


# ── Section 5: Violations (mixed states, every Nelson rule) ──────────────


def seed_violations(
    conn: Connection,
    char_ids: dict[tuple[str, str, str], int],
    histories: dict[int, dict[str, Any]],
    user_ids: dict[str, int],
) -> list[int]:
    """Insert 20-25 violations spanning Nelson rules 1-8 in mixed states."""
    if conn.execute(select(Violation.__table__.c.id).limit(1)).first() is not None:
        # Violations already exist — keep idempotent re-run cheap.
        return []

    plan: list[tuple[str, str, int, str, dict[str, Any]]] = [
        # (plant_code, char_name, rule_id, severity, ack_state)
        # Aerospace: ~10
        ("AERO-FORGE", "Bore Diameter OD-A", 1, "CRITICAL", {"ack": "pending_required"}),
        ("AERO-FORGE", "Bore Diameter OD-A", 2, "WARNING", {"ack": "pending_info"}),
        ("AERO-FORGE", "Bore Diameter OD-A", 3, "WARNING", {"ack": "acknowledged_reason"}),
        ("AERO-FORGE", "Bore Diameter OD-A", 5, "WARNING", {"ack": "acknowledged_corrective"}),
        ("AERO-FORGE", "Wall Thickness", 4, "WARNING", {"ack": "pending_info"}),
        ("AERO-FORGE", "Wall Thickness", 6, "WARNING", {"ack": "pending_info"}),
        ("AERO-FORGE", "Wall Thickness", 7, "WARNING", {"ack": "acknowledged_reason"}),
        ("AERO-FORGE", "Wall Thickness", 8, "WARNING", {"ack": "pending_info"}),
        ("AERO-FORGE", "Shaft OD", 1, "CRITICAL", {"ack": "acknowledged_corrective"}),
        ("AERO-FORGE", "Shaft OD", 2, "WARNING", {"ack": "repeat"}),
        # Auto Stamping: ~7
        ("AUTO-STAMP", "Trim Length", 1, "CRITICAL", {"ack": "pending_required"}),
        ("AUTO-STAMP", "Trim Length", 2, "WARNING", {"ack": "acknowledged_reason"}),
        ("AUTO-STAMP", "Trim Length", 3, "WARNING", {"ack": "repeat"}),
        ("AUTO-STAMP", "Punch Wear", 1, "CRITICAL", {"ack": "pending_required"}),
        ("AUTO-STAMP", "Punch Wear", 5, "WARNING", {"ack": "pending_info"}),
        ("AUTO-STAMP", "Punch Wear", 6, "WARNING", {"ack": "acknowledged_reason"}),
        ("AUTO-STAMP", "Punch Wear", 8, "WARNING", {"ack": "repeat"}),
        # Pharma: ~6
        ("PHARMA-FILL", "Particulate Count", 1, "CRITICAL", {"ack": "pending_required"}),
        ("PHARMA-FILL", "Particulate Count", 2, "WARNING", {"ack": "pending_info"}),
        ("PHARMA-FILL", "Seal Defects", 1, "CRITICAL", {"ack": "acknowledged_reason"}),
        ("PHARMA-FILL", "Seal Defects", 4, "WARNING", {"ack": "pending_info"}),
        ("PHARMA-FILL", "Reject Rate", 5, "WARNING", {"ack": "acknowledged_corrective"}),
        ("PHARMA-FILL", "Reject Rate", 6, "WARNING", {"ack": "pending_info"}),
    ]

    # Resolve char_ids by name (Pharma has 2 "Fill Volume" — we want the
    # primary on Filler 1, but for these violations every name is unique).
    name_to_id: dict[tuple[str, str], int] = {}
    for (plant_code, _path, name), cid in char_ids.items():
        name_to_id.setdefault((plant_code, name), cid)

    rule_names = {
        1: "Beyond 3σ",
        2: "9 points same side",
        3: "6 points trending",
        4: "14 points alternating",
        5: "2 of 3 in Zone A",
        6: "4 of 5 in Zone B+",
        7: "15 points in Zone C",
        8: "8 points outside Zone C",
    }

    violation_ids: list[int] = []
    now = _utcnow()
    for plant_code, char_name, rule_id, severity, opts in plan:
        cid = name_to_id.get((plant_code, char_name))
        if cid is None:
            continue
        history = histories.get(cid)
        if not history or not history["samples"]:
            continue
        # Pick a sample from the late part of the history so the violation
        # lines up with the "drift" or "excursion" phases.
        target_idx = max(0, len(history["samples"]) - 5 - rule_id)
        target_sample_id = history["samples"][target_idx]

        ack_state = opts["ack"]
        ack_user = None
        ack_reason = None
        ack_ts = None
        acknowledged = False
        requires_ack = severity == "CRITICAL"

        if ack_state == "pending_required":
            requires_ack = True
        elif ack_state == "pending_info":
            requires_ack = False
        elif ack_state == "acknowledged_reason":
            acknowledged = True
            ack_user = "engineer.aero" if plant_code == "AERO-FORGE" else "supervisor.pharma"
            ack_reason = "Tool wear noted; retraining operator on bore inspection."
            ack_ts = now - timedelta(days=2)
        elif ack_state == "acknowledged_corrective":
            acknowledged = True
            ack_user = "engineer.aero" if plant_code == "AERO-FORGE" else "operator.auto"
            ack_reason = "Corrective action: replaced cutting insert (CA-2026-0012)."
            ack_ts = now - timedelta(days=1)
        elif ack_state == "repeat":
            # Insert two violations: original (acknowledged) + recent (pending).
            old_id = _insert_returning_id(
                conn,
                Violation.__table__,
                {
                    "sample_id": history["samples"][max(0, target_idx - 10)],
                    "char_id": cid,
                    "rule_id": rule_id,
                    "rule_name": rule_names.get(rule_id),
                    "severity": severity,
                    "acknowledged": True,
                    "requires_acknowledgement": False,
                    "ack_user": "operator.auto",
                    "ack_reason": "First occurrence noted.",
                    "ack_timestamp": now - timedelta(days=10),
                    "created_at": now - timedelta(days=10),
                },
            )
            violation_ids.append(old_id)

        vid = _insert_returning_id(
            conn,
            Violation.__table__,
            {
                "sample_id": target_sample_id,
                "char_id": cid,
                "rule_id": rule_id,
                "rule_name": rule_names.get(rule_id),
                "severity": severity,
                "acknowledged": acknowledged,
                "requires_acknowledgement": requires_ack,
                "ack_user": ack_user,
                "ack_reason": ack_reason,
                "ack_timestamp": ack_ts,
                "created_at": now,
            },
        )
        violation_ids.append(vid)

    return violation_ids


# ── Section 6: Annotations ───────────────────────────────────────────────


def seed_annotations(
    conn: Connection,
    char_ids: dict[tuple[str, str, str], int],
    histories: dict[int, dict[str, Any]],
) -> int:
    """6 point annotations (Bore Diameter), 3 period annotations (Trim Length)."""
    table = Annotation.__table__
    if conn.execute(select(table.c.id).limit(1)).first() is not None:
        return 0

    name_to_id: dict[tuple[str, str], int] = {}
    for (plant_code, _path, name), cid in char_ids.items():
        name_to_id.setdefault((plant_code, name), cid)

    inserted = 0
    bore_id = name_to_id.get(("AERO-FORGE", "Bore Diameter OD-A"))
    if bore_id is not None and histories.get(bore_id, {}).get("samples"):
        bore_samples = histories[bore_id]["samples"]
        bore_timestamps = histories[bore_id]["timestamps"]
        point_specs = [
            (10, "Tool change", "Replaced bore micrometer; recalibrated against reference standard."),
            (35, "Operator handoff", "Shift change — Operator B → Operator C, brief overlap noted."),
            (60, "Material lot change", "Lot 4340-A → 4340-B transition. Sigma may shift slightly."),
            (85, "Tool change", "Insert tip wear detected; replaced before next batch."),
            (105, "Operator handoff", "Lunch coverage by trainee operator; supervisor monitoring."),
            (120, "Material lot change", "Inconel 718 batch swap for next housing run."),
        ]
        for idx, label, text in point_specs:
            idx = min(idx, len(bore_samples) - 1)
            conn.execute(
                insert(table),
                [
                    {
                        "characteristic_id": bore_id,
                        "annotation_type": "point",
                        "text": f"{label}: {text}",
                        "color": "#3b82f6",
                        "sample_id": bore_samples[idx],
                        "created_by": "engineer.aero",
                    }
                ],
            )
            inserted += 1

    trim_id = name_to_id.get(("AUTO-STAMP", "Trim Length"))
    if trim_id is not None and histories.get(trim_id, {}).get("samples"):
        trim_samples = histories[trim_id]["samples"]
        trim_timestamps = histories[trim_id]["timestamps"]
        period_specs = [
            (15, 25, "Maintenance window", "Press 1 PM — die alignment verified."),
            (45, 60, "PM scheduled", "Quarterly preventive maintenance on stamping line."),
            (90, 100, "Tooling worn — replaced", "Trim die replaced; trim length variation expected to drop."),
        ]
        for start_idx, end_idx, label, text in period_specs:
            start_idx = min(start_idx, len(trim_samples) - 1)
            end_idx = min(end_idx, len(trim_samples) - 1)
            conn.execute(
                insert(table),
                [
                    {
                        "characteristic_id": trim_id,
                        "annotation_type": "period",
                        "text": f"{label}: {text}",
                        "color": "#f59e0b",
                        "start_sample_id": trim_samples[start_idx],
                        "end_sample_id": trim_samples[end_idx],
                        "start_time": trim_timestamps[start_idx],
                        "end_time": trim_timestamps[end_idx],
                        "created_by": "operator.auto",
                    }
                ],
            )
            inserted += 1
    return inserted


# ── Section 7: Capability snapshots ──────────────────────────────────────


def seed_capability_snapshots(
    conn: Connection,
    char_ids: dict[tuple[str, str, str], int],
) -> int:
    """Monthly capability snapshots over the 90-day period."""
    table = CapabilityHistory.__table__
    if conn.execute(select(table.c.id).limit(1)).first() is not None:
        return 0

    plans = [
        # (plant, name, regime — produces the labelled Cpk band)
        ("AERO-FORGE", "Bore Diameter OD-A", 1.05, 6),
        ("AERO-FORGE", "Wall Thickness", 1.67, 4),
        ("AERO-FORGE", "Shaft OD", 0.92, 3),
        ("PHARMA-FILL", "Fill Volume", 1.33, 6),
        ("AUTO-STAMP", "Punch Wear", 0.85, 3),  # skewed → Box-Cox path
    ]
    name_to_id: dict[tuple[str, str], int] = {}
    for (plant_code, _path, name), cid in char_ids.items():
        name_to_id.setdefault((plant_code, name), cid)

    now = _utcnow()
    inserted = 0
    for plant_code, char_name, cpk_target, n_snapshots in plans:
        cid = name_to_id.get((plant_code, char_name))
        if cid is None:
            continue
        for i in range(n_snapshots):
            offset_days = 90 - i * (90 // max(1, n_snapshots))
            snap_ts = now - timedelta(days=offset_days)
            jitter = (i - n_snapshots / 2) * 0.05
            cpk = cpk_target + jitter
            cp = cpk + 0.10
            conn.execute(
                insert(table),
                [
                    {
                        "characteristic_id": cid,
                        "cp": round(cp, 3),
                        "cpk": round(cpk, 3),
                        "pp": round(cp - 0.04, 3),
                        "ppk": round(cpk - 0.04, 3),
                        "cpm": round(cpk - 0.02, 3),
                        "sample_count": 80 + i * 10,
                        "normality_p_value": 0.21 if char_name != "Punch Wear" else 0.018,
                        "normality_test": "shapiro_wilk",
                        "calculated_at": snap_ts,
                        "calculated_by": "engineer.aero",
                    }
                ],
            )
            inserted += 1
    return inserted


# ── Section 8: MSA studies (4 study types, 7 studies) ────────────────────


def seed_msa_studies(
    conn: Connection,
    plant_ids: dict[str, int],
    user_ids: dict[str, int],
    char_ids: dict[tuple[str, str, str], int],
    rng: random.Random,
) -> dict[str, int]:
    name_to_id: dict[tuple[str, str], int] = {}
    for (plant_code, _path, name), cid in char_ids.items():
        name_to_id.setdefault((plant_code, name), cid)

    studies: dict[str, int] = {}
    study_specs = [
        {
            "name": "Bore Diameter Gage R&R",
            "plant": "AERO-FORGE",
            "study_type": "crossed_anova",
            "char_name": "Bore Diameter OD-A",
            "n_ops": 3, "n_parts": 10, "n_reps": 3,
            "tolerance": 4.0,
            "status": "complete",
            "noise_sd": 0.12,
        },
        {
            "name": "Shaft OD Gage R&R",
            "plant": "AERO-FORGE",
            "study_type": "crossed_anova",
            "char_name": "Shaft OD",
            "n_ops": 3, "n_parts": 10, "n_reps": 3,
            "tolerance": 0.10,
            "status": "complete",
            "noise_sd": 0.018,  # %GRR > 30% → "Unacceptable" band per AIAG
        },
        {
            "name": "Wall Thickness Range",
            "plant": "AERO-FORGE",
            "study_type": "range_method",
            "char_name": "Wall Thickness",
            "n_ops": 2, "n_parts": 5, "n_reps": 2,
            "tolerance": 1.0,
            "status": "data_collection",
            "noise_sd": 0.04,
        },
        {
            "name": "Fill Volume Nested",
            "plant": "PHARMA-FILL",
            "study_type": "nested_anova",
            "char_name": "Fill Volume",
            "n_ops": 3, "n_parts": 8, "n_reps": 3,
            "tolerance": 1.0,
            "status": "complete",
            "noise_sd": 0.04,
        },
        {
            "name": "Particulate Attribute",
            "plant": "PHARMA-FILL",
            "study_type": "attribute_agreement",
            "char_name": "Particulate Count",
            "n_ops": 3, "n_parts": 30, "n_reps": 2,
            "tolerance": None,
            "status": "complete",
        },
        {
            "name": "Caliper Linearity",
            "plant": "AERO-FORGE",
            "study_type": "linearity",
            "char_name": "Bore Diameter OD-A",
            "n_ops": 1, "n_parts": 5, "n_reps": 5,
            "tolerance": None,
            "status": "complete",
        },
        {
            "name": "Trim Length Bias",
            "plant": "AUTO-STAMP",
            "study_type": "bias",
            "char_name": "Trim Length",
            "n_ops": 1, "n_parts": 1, "n_reps": 10,
            "tolerance": None,
            "status": "draft",
        },
    ]

    msa_table = MSAStudy.__table__
    op_table = MSAOperator.__table__
    part_table = MSAPart.__table__
    meas_table = MSAMeasurement.__table__
    admin_id = user_ids.get("admin")
    now = _utcnow()

    for spec in study_specs:
        plant_id = plant_ids[spec["plant"]]
        char_id = name_to_id.get((spec["plant"], spec["char_name"]))
        existing = _scalar_or_none(
            conn,
            select(msa_table.c.id).where(
                msa_table.c.plant_id == plant_id, msa_table.c.name == spec["name"]
            ),
        )
        if existing is not None:
            studies[spec["name"]] = existing
            continue

        study_id = _insert_returning_id(
            conn,
            msa_table,
            {
                "plant_id": plant_id,
                "name": spec["name"],
                "study_type": spec["study_type"],
                "characteristic_id": char_id,
                "num_operators": spec["n_ops"],
                "num_parts": spec["n_parts"],
                "num_replicates": spec["n_reps"],
                "tolerance": spec["tolerance"],
                "status": spec["status"],
                "created_by": admin_id,
                "created_at": now,
                "completed_at": now if spec["status"] == "complete" else None,
                "results_json": None,
            },
        )
        studies[spec["name"]] = study_id

        if spec["status"] in ("draft",):
            continue

        # Create operators
        op_names_pool = ["Alice", "Bob", "Carlos", "Dana", "Eli"]
        operator_ids: list[int] = []
        for i in range(spec["n_ops"]):
            opname = op_names_pool[i] if i < len(op_names_pool) else f"Op{i+1}"
            operator_ids.append(
                _insert_returning_id(
                    conn,
                    op_table,
                    {"study_id": study_id, "name": opname, "sequence_order": i},
                )
            )
        # Create parts
        part_ids: list[int] = []
        ref_values: list[float] = []
        char_target = float(
            next(
                (c.get("target_value", 10.0) for c in CHARS_SPEC if c["name"] == spec["char_name"]),
                10.0,
            )
        )
        char_sigma = float(
            next(
                (c.get("stored_sigma", 0.5) for c in CHARS_SPEC if c["name"] == spec["char_name"]),
                0.5,
            )
        )
        for i in range(spec["n_parts"]):
            ref_val = round(char_target + rng.uniform(-char_sigma * 3, char_sigma * 3), 4)
            ref_values.append(ref_val)
            part_ids.append(
                _insert_returning_id(
                    conn,
                    part_table,
                    {
                        "study_id": study_id,
                        "name": f"Part {i+1}",
                        "reference_value": ref_val,
                        "sequence_order": i,
                    },
                )
            )

        # Different study types need different measurement structures.
        if spec["study_type"] in ("crossed_anova", "nested_anova", "range_method"):
            measurements_3d: list[list[list[float]]] = []
            noise_sd = float(spec.get("noise_sd", 0.15))
            for op_id in operator_ids:
                op_block: list[list[float]] = []
                op_bias = rng.gauss(0, noise_sd * 0.3)
                for p_idx, part_id in enumerate(part_ids):
                    rep_block: list[float] = []
                    for rep in range(1, spec["n_reps"] + 1):
                        v = ref_values[p_idx] + op_bias + rng.gauss(0, noise_sd)
                        v = round(v, 4)
                        rep_block.append(v)
                        conn.execute(
                            insert(meas_table),
                            [
                                {
                                    "study_id": study_id,
                                    "operator_id": op_id,
                                    "part_id": part_id,
                                    "replicate_num": rep,
                                    "value": v,
                                    "timestamp": now,
                                }
                            ],
                        )
                    op_block.append(rep_block)
                measurements_3d.append(op_block)

            if spec["study_type"] == "crossed_anova" and spec["status"] == "complete":
                engine = GageRREngine()
                result = engine.calculate_crossed_anova(
                    measurements_3d,
                    tolerance=spec["tolerance"],
                )
                conn.execute(
                    update(msa_table)
                    .where(msa_table.c.id == study_id)
                    .values(results_json=json.dumps(asdict(result), default=str))
                )

        elif spec["study_type"] == "attribute_agreement":
            # Each appraiser scores each part against a reference
            for op_id in operator_ids:
                for p_idx, part_id in enumerate(part_ids):
                    for rep in range(1, spec["n_reps"] + 1):
                        # 85%+ agreement
                        ref_decision = "Pass" if p_idx % 3 != 0 else "Fail"
                        agree = rng.random() < 0.88
                        decision = ref_decision if agree else (
                            "Fail" if ref_decision == "Pass" else "Pass"
                        )
                        conn.execute(
                            insert(meas_table),
                            [
                                {
                                    "study_id": study_id,
                                    "operator_id": op_id,
                                    "part_id": part_id,
                                    "replicate_num": rep,
                                    "value": 1.0 if decision == "Pass" else 0.0,
                                    "attribute_value": decision,
                                    "timestamp": now,
                                }
                            ],
                        )
            # Pre-compute an attribute agreement summary
            conn.execute(
                update(msa_table)
                .where(msa_table.c.id == study_id)
                .values(
                    results_json=json.dumps(
                        {
                            "study_type": "attribute_agreement",
                            "kappa_within": 0.86,
                            "kappa_between": 0.85,
                            "kappa_vs_reference": 0.88,
                            "classification": "substantial_agreement",
                            "agreement_within_pct": 92.4,
                            "agreement_between_pct": 89.1,
                            "agreement_vs_reference_pct": 94.0,
                        }
                    )
                )
            )

        elif spec["study_type"] == "linearity":
            # 1 operator, 5 parts spanning the range, 5 measurements each
            for p_idx, part_id in enumerate(part_ids):
                for rep in range(1, spec["n_reps"] + 1):
                    bias = 0.05 * ref_values[p_idx]  # 5% bias
                    v = round(ref_values[p_idx] + bias + rng.gauss(0, 0.02), 4)
                    conn.execute(
                        insert(meas_table),
                        [
                            {
                                "study_id": study_id,
                                "operator_id": operator_ids[0],
                                "part_id": part_id,
                                "replicate_num": rep,
                                "value": v,
                                "timestamp": now,
                            }
                        ],
                    )
            conn.execute(
                update(msa_table)
                .where(msa_table.c.id == study_id)
                .values(
                    results_json=json.dumps(
                        {
                            "study_type": "linearity",
                            "intercept": 0.05,
                            "slope": 0.0009,
                            "r_squared": 0.991,
                            "linearity_pct": 5.0,
                        }
                    )
                )
            )

    return studies


# ── Section 9: DOE studies ───────────────────────────────────────────────


def seed_doe_studies(
    conn: Connection,
    plant_ids: dict[str, int],
    user_ids: dict[str, int],
    rng: random.Random,
) -> dict[str, int]:
    studies: dict[str, int] = {}
    admin_id = user_ids.get("admin")
    now = _utcnow()

    doe_specs = [
        {
            "name": "Press Force Optimization",
            "plant": "AERO-FORGE",
            "design_type": "full_factorial",
            "factors": [("Force", 100.0, 200.0, "kN"), ("Temperature", 800.0, 1000.0, "C"), ("Time", 30.0, 90.0, "s")],
            "n_runs": 8,
            "status": "analyzed",
            "response_name": "Forging Quality",
        },
        {
            "name": "Punch Geometry",
            "plant": "AUTO-STAMP",
            "design_type": "fractional_factorial",
            "resolution": 3,
            "factors": [
                ("ToolMaterial", 0.0, 1.0, ""),
                ("PunchAngle", 5.0, 15.0, "deg"),
                ("Lubrication", 0.0, 1.0, ""),
                ("FeedRate", 50.0, 150.0, "mm/s"),
                ("HoldTime", 0.5, 2.0, "s"),
            ],
            "n_runs": 8,
            "status": "data_collection",
            "response_name": "Punch Wear",
        },
        {
            "name": "Coolant Mix Plackett-Burman",
            "plant": "AERO-FORGE",
            "design_type": "plackett_burman",
            "factors": [
                (f"Factor_{i+1}", 0.0, 1.0, "") for i in range(7)
            ],
            "n_runs": 12,
            "status": "design",
            "response_name": "Cooling Efficiency",
        },
        {
            "name": "Fill Speed CCD",
            "plant": "PHARMA-FILL",
            "design_type": "central_composite",
            "factors": [
                ("FillSpeed", 50.0, 150.0, "mL/s"),
                ("HoldTime", 0.5, 2.0, "s"),
                ("Temperature", 4.0, 25.0, "C"),
            ],
            "n_runs": 20,
            "status": "analyzed",
            "response_name": "Fill Volume Variation",
        },
    ]

    doe_table = DOEStudy.__table__
    factor_table = DOEFactor.__table__
    run_table = DOERun.__table__
    analysis_table = DOEAnalysis.__table__

    for spec in doe_specs:
        plant_id = plant_ids[spec["plant"]]
        existing = _scalar_or_none(
            conn,
            select(doe_table.c.id).where(
                doe_table.c.plant_id == plant_id, doe_table.c.name == spec["name"]
            ),
        )
        if existing is not None:
            studies[spec["name"]] = existing
            continue

        study_id = _insert_returning_id(
            conn,
            doe_table,
            {
                "plant_id": plant_id,
                "name": spec["name"],
                "design_type": spec["design_type"],
                "resolution": spec.get("resolution"),
                "n_runs": spec["n_runs"],
                "status": spec["status"],
                "response_name": spec["response_name"],
                "response_unit": "",
                "notes": f"{spec['design_type']} study seeded for feature tour.",
                "created_by": admin_id,
                "created_at": now,
                "updated_at": now,
            },
        )
        studies[spec["name"]] = study_id

        for idx, (fname, low, high, unit) in enumerate(spec["factors"]):
            conn.execute(
                insert(factor_table),
                [
                    {
                        "study_id": study_id,
                        "name": fname,
                        "low_level": low,
                        "high_level": high,
                        "center_point": (low + high) / 2,
                        "unit": unit,
                        "display_order": idx,
                    }
                ],
            )

        # Generate runs only for studies past `design`
        if spec["status"] in ("analyzed", "data_collection"):
            n_runs = spec["n_runs"]
            for run_i in range(n_runs):
                # Coded ±1 from binary representation
                factor_values: dict[str, float] = {}
                for f_idx, (fname, low, high, _) in enumerate(spec["factors"]):
                    if spec["design_type"] in ("full_factorial", "fractional_factorial"):
                        coded = 1 if (run_i >> f_idx) & 1 else -1
                        factor_values[fname] = low if coded < 0 else high
                    else:
                        factor_values[fname] = low if run_i % 2 == 0 else high
                response = rng.gauss(50.0, 8.0)
                if spec["status"] == "data_collection":
                    response_value = response if run_i < n_runs // 2 else None
                else:
                    response_value = round(response, 3)
                conn.execute(
                    insert(run_table),
                    [
                        {
                            "study_id": study_id,
                            "run_order": run_i + 1,
                            "standard_order": run_i + 1,
                            "factor_values": json.dumps(factor_values),
                            "factor_actuals": json.dumps(factor_values),
                            "response_value": response_value,
                            "is_center_point": False,
                            "replicate": 1,
                            "completed_at": now if response_value is not None else None,
                        }
                    ],
                )

        if spec["status"] == "analyzed":
            # Insert canned ANOVA analysis
            anova = [
                {"source": spec["factors"][0][0], "df": 1, "ss": 12.4, "ms": 12.4, "f_value": 22.1, "p_value": 0.003},
                {"source": spec["factors"][1][0], "df": 1, "ss": 5.2, "ms": 5.2, "f_value": 9.3, "p_value": 0.018},
                {"source": "Residual", "df": max(1, spec["n_runs"] - 4), "ss": 3.2, "ms": 0.46, "f_value": None, "p_value": None},
            ]
            effects = {f[0]: round(rng.uniform(-2.0, 2.0), 3) for f in spec["factors"]}
            optimal = {f[0]: f[2] for f in spec["factors"]}
            conn.execute(
                insert(analysis_table),
                [
                    {
                        "study_id": study_id,
                        "anova_table": json.dumps(anova),
                        "effects": json.dumps(effects),
                        "interactions": json.dumps({}),
                        "r_squared": 0.91,
                        "adj_r_squared": 0.87,
                        "regression_model": json.dumps(
                            {"intercept": 50.0, **effects}
                        ),
                        "optimal_settings": json.dumps(
                            {**optimal, "predicted_response": 95.4}
                        ),
                        "computed_at": now,
                    }
                ],
            )

    return studies


# ── Section 10: FAI reports ──────────────────────────────────────────────


def seed_fai_reports(
    conn: Connection,
    plant_ids: dict[str, int],
    user_ids: dict[str, int],
) -> dict[str, int]:
    fai_table = FAIReport.__table__
    item_table = FAIItem.__table__
    out: dict[str, int] = {}
    admin_id = user_ids.get("admin")
    eng_id = user_ids.get("engineer.aero")
    sup_id = user_ids.get("supervisor.pharma")
    now = _utcnow()

    reports = [
        {
            "key": "fai-001",
            "plant": "AERO-FORGE",
            "part_number": "PN-2026-001",
            "part_name": "Turbine Housing",
            "serial_number": "SN-00001",
            "status": "approved",
            "submitted_by": eng_id,
            "approved_by": admin_id,
            "items_complete": True,
        },
        {
            "key": "fai-002",
            "plant": "AERO-FORGE",
            "part_number": "PN-2026-002",
            "part_name": "Compressor Shaft",
            "serial_number": "SN-00002",
            "status": "submitted",
            "submitted_by": eng_id,
            "items_complete": True,
        },
        {
            "key": "fai-003",
            "plant": "AERO-FORGE",
            "part_number": "PN-2026-003",
            "part_name": "Hole Position Test",
            "serial_number": "SN-00003",
            "status": "draft",
            "items_complete": False,
        },
        {
            "key": "fai-004",
            "plant": "PHARMA-FILL",
            "part_number": "PN-2026-FILL-A",
            "part_name": "Sterile Vial Fill Run A",
            "serial_number": "SN-FILL-001",
            "status": "rejected",
            "submitted_by": eng_id,
            "rejection_reason": "Documentation gap: missing material cert in Form 2.",
            "items_complete": True,
        },
    ]

    base_items = [
        (1, "Bore Diameter", 25.000, 25.050, 24.950, 25.012, "mm", "Bore Micrometer", True, "pass"),
        (2, "Overall Length", 100.000, 100.100, 99.900, 100.045, "mm", "Caliper", False, "pass"),
        (3, "Surface Roughness", 0.800, 1.600, None, 0.920, "Ra", "Profilometer", True, "pass"),
        (4, "Thread Pitch", 1.500, 1.520, 1.480, 1.505, "mm", "Thread Gauge", False, "pass"),
        (5, "Hardness", 58.000, 62.000, 55.000, 59.200, "HRC", "Rockwell Tester", True, "pass"),
        (6, "Concentricity", 0.000, 0.025, None, 0.022, "mm", "CMM", True, "pass"),
    ]

    for r in reports:
        plant_id = plant_ids[r["plant"]]
        existing = _scalar_or_none(
            conn,
            select(fai_table.c.id).where(
                fai_table.c.plant_id == plant_id,
                fai_table.c.part_number == r["part_number"],
                fai_table.c.serial_number == r["serial_number"],
            ),
        )
        if existing is not None:
            out[r["key"]] = existing
            continue

        report_id = _insert_returning_id(
            conn,
            fai_table,
            {
                "plant_id": plant_id,
                "part_number": r["part_number"],
                "part_name": r["part_name"],
                "revision": "Rev A",
                "serial_number": r["serial_number"],
                "drawing_number": f"DWG-{r['part_number']}",
                "organization_name": "Saturnis Manufacturing",
                "supplier": "Apex Precision Parts",
                "reason_for_inspection": "new_part",
                "status": r["status"],
                "created_by": admin_id,
                "created_at": now,
                "submitted_by": r.get("submitted_by"),
                "submitted_at": now if r.get("submitted_by") else None,
                "approved_by": r.get("approved_by"),
                "approved_at": now if r.get("approved_by") else None,
                "rejection_reason": r.get("rejection_reason"),
            },
        )
        out[r["key"]] = report_id

        item_count = len(base_items) if r["items_complete"] else 2
        for seq, item in enumerate(base_items[:item_count]):
            balloon, name, nom, usl, lsl, actual, unit, tool, designed, result = item
            conn.execute(
                insert(item_table),
                [
                    {
                        "report_id": report_id,
                        "balloon_number": balloon,
                        "characteristic_name": name,
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

    return out


# ── Section 11: Materials + collection plans ─────────────────────────────


def seed_materials_and_plans(
    conn: Connection,
    plant_ids: dict[str, int],
    char_ids: dict[tuple[str, str, str], int],
    user_ids: dict[str, int],
) -> dict[str, Any]:
    mc_table = MaterialClass.__table__
    m_table = Material.__table__
    plan_table = CollectionPlan.__table__
    item_table = CollectionPlanItem.__table__
    mlo_table = MaterialLimitOverride.__table__
    out: dict[str, Any] = {"classes": {}, "materials": {}, "plans": {}}

    aero_id = plant_ids["AERO-FORGE"]
    pharma_id = plant_ids["PHARMA-FILL"]
    auto_id = plant_ids["AUTO-STAMP"]
    now = _utcnow()

    # Aerospace material classes
    classes = [
        ("AISI 4340 Steel", "AISI-4340"),
        ("Inconel 718", "INCO-718"),
    ]
    for name, code in classes:
        existing = conn.execute(
            select(mc_table.c.id, mc_table.c.path).where(
                mc_table.c.plant_id == aero_id, mc_table.c.code == code
            )
        ).one_or_none()
        if existing is None:
            cid = _insert_returning_id(
                conn,
                mc_table,
                {
                    "plant_id": aero_id,
                    "parent_id": None,
                    "name": name,
                    "code": code,
                    "path": "/",
                    "depth": 0,
                    "description": f"Material class for {name}",
                    "created_at": now,
                    "updated_at": now,
                },
            )
            new_path = f"/{cid}/"
            conn.execute(
                update(mc_table).where(mc_table.c.id == cid).values(path=new_path)
            )
        else:
            cid = int(existing[0])
        out["classes"][code] = cid

    # Aerospace materials (lots)
    aisi_class_id = out["classes"]["AISI-4340"]
    inco_class_id = out["classes"]["INCO-718"]
    materials = [
        ("4340 Lot A", "4340-LOT-A", aisi_class_id, aero_id),
        ("4340 Lot B", "4340-LOT-B", aisi_class_id, aero_id),
        ("Inconel 718 Batch X1", "INCO-X1", inco_class_id, aero_id),
    ]
    for name, code, class_id, plant_id in materials:
        existing = _scalar_or_none(
            conn,
            select(m_table.c.id).where(
                m_table.c.plant_id == plant_id, m_table.c.code == code
            ),
        )
        if existing is None:
            mid = _insert_returning_id(
                conn,
                m_table,
                {
                    "plant_id": plant_id,
                    "class_id": class_id,
                    "name": name,
                    "code": code,
                    "description": None,
                    "created_at": now,
                    "updated_at": now,
                },
            )
        else:
            mid = existing
        out["materials"][code] = mid

    # Material limit overrides on Bore Diameter for the two 4340 lots
    name_to_id: dict[tuple[str, str], int] = {}
    for (plant_code, _path, name), cid in char_ids.items():
        name_to_id.setdefault((plant_code, name), cid)
    bore_id = name_to_id.get(("AERO-FORGE", "Bore Diameter OD-A"))
    rough_id = name_to_id.get(("AERO-FORGE", "Surface Roughness Ra"))
    if bore_id is not None:
        for code, ucl, lcl in [
            ("4340-LOT-A", 11.6, 8.4),
            ("4340-LOT-B", 11.4, 8.6),
        ]:
            mid = out["materials"][code]
            existing = _scalar_or_none(
                conn,
                select(mlo_table.c.id).where(
                    mlo_table.c.characteristic_id == bore_id,
                    mlo_table.c.material_id == mid,
                ),
            )
            if existing is None:
                conn.execute(
                    insert(mlo_table),
                    [
                        {
                            "characteristic_id": bore_id,
                            "material_id": mid,
                            "ucl": ucl,
                            "lcl": lcl,
                            "stored_sigma": (ucl - lcl) / 6,
                            "stored_center_line": 10.0,
                            "target_value": 10.0,
                            "usl": 12.0,
                            "lsl": 8.0,
                        }
                    ],
                )
    if rough_id is not None:
        existing = _scalar_or_none(
            conn,
            select(mlo_table.c.id).where(
                mlo_table.c.characteristic_id == rough_id,
                mlo_table.c.class_id == inco_class_id,
            ),
        )
        if existing is None:
            conn.execute(
                insert(mlo_table),
                [
                    {
                        "characteristic_id": rough_id,
                        "class_id": inco_class_id,
                        "ucl": 1.2,
                        "lcl": 0.0,
                        "stored_sigma": 0.10,
                        "stored_center_line": 0.6,
                        "target_value": 0.6,
                        "usl": 1.2,
                        "lsl": 0.0,
                    }
                ],
            )

    # Collection plans
    plans_spec = [
        {
            "name": "Press Line A — Hourly",
            "plant_id": aero_id,
            "items": [("AERO-FORGE", "Bore Diameter OD-A"), ("AERO-FORGE", "Wall Thickness")],
        },
        {
            "name": "Pharma Fill — Per-Batch",
            "plant_id": pharma_id,
            "items": [("PHARMA-FILL", "Fill Volume"), ("PHARMA-FILL", "Particulate Count")],
        },
        {
            "name": "End-of-shift inspection",
            "plant_id": auto_id,
            "items": [
                ("AUTO-STAMP", "Trim Length"),
                ("AUTO-STAMP", "Punch Wear"),
                ("AUTO-STAMP", "Defect Count"),
            ],
        },
    ]
    admin_id = user_ids.get("admin")
    for spec in plans_spec:
        existing = _scalar_or_none(
            conn,
            select(plan_table.c.id).where(
                plan_table.c.plant_id == spec["plant_id"],
                plan_table.c.name == spec["name"],
            ),
        )
        if existing is None:
            plan_id = _insert_returning_id(
                conn,
                plan_table,
                {
                    "plant_id": spec["plant_id"],
                    "name": spec["name"],
                    "description": f"Auto-seeded for feature tour: {spec['name']}",
                    "is_active": True,
                    "created_by": admin_id,
                    "created_at": now,
                },
            )
        else:
            plan_id = existing
        out["plans"][spec["name"]] = plan_id
        # Items (idempotent on plan_id+sequence)
        existing_seq = {
            int(r[0])
            for r in conn.execute(
                select(item_table.c.sequence_order).where(item_table.c.plan_id == plan_id)
            )
        }
        for seq, (plant_code, char_name) in enumerate(spec["items"]):
            if seq in existing_seq:
                continue
            cid = name_to_id.get((plant_code, char_name))
            if cid is None:
                continue
            conn.execute(
                insert(item_table),
                [
                    {
                        "plan_id": plan_id,
                        "characteristic_id": cid,
                        "sequence_order": seq,
                        "instructions": f"Measure {char_name} per SOP.",
                        "required": True,
                    }
                ],
            )
    return out


# ── Section 12: Connectivity (MQTT + OPC-UA + Gage Bridges + ERP) ────────


def seed_connectivity(
    conn: Connection,
    plant_ids: dict[str, int],
    char_ids: dict[tuple[str, str, str], int],
    user_ids: dict[str, int],
) -> dict[str, Any]:
    mb_table = MQTTBroker.__table__
    opcua_table = OPCUAServer.__table__
    gb_table = GageBridge.__table__
    gp_table = GagePort.__table__
    erp_table = ERPConnector.__table__
    schedule_table = ERPSyncSchedule.__table__
    sync_log_table = ERPSyncLog.__table__
    out: dict[str, Any] = {}

    aero_id = plant_ids["AERO-FORGE"]
    auto_id = plant_ids["AUTO-STAMP"]
    now = _utcnow()

    # MQTT brokers
    brokers = [
        {
            "plant_id": aero_id,
            "name": "Aerospace Floor Broker",
            "host": "mqtt-aero.local",
            "port": 1883,
        },
        {
            "plant_id": auto_id,
            "name": "Stamping Floor Broker",
            "host": "mqtt-auto.local",
            "port": 1883,
        },
    ]
    broker_ids: dict[str, int] = {}
    for spec in brokers:
        existing = _scalar_or_none(
            conn,
            select(mb_table.c.id).where(
                mb_table.c.plant_id == spec["plant_id"],
                mb_table.c.name == spec["name"],
            ),
        )
        if existing is None:
            bid = _insert_returning_id(
                conn,
                mb_table,
                {
                    "plant_id": spec["plant_id"],
                    "name": spec["name"],
                    "host": spec["host"],
                    "port": spec["port"],
                    "client_id": f"cassini-{spec['name'].lower().replace(' ', '-')}",
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
            bid = existing
        broker_ids[spec["name"]] = bid
    out["brokers"] = broker_ids

    # OPC-UA server (Aerospace)
    opcua_existing = _scalar_or_none(
        conn,
        select(opcua_table.c.id).where(
            opcua_table.c.plant_id == aero_id,
            opcua_table.c.name == "Aerospace OPC-UA Master",
        ),
    )
    if opcua_existing is None:
        opcua_id = _insert_returning_id(
            conn,
            opcua_table,
            {
                "plant_id": aero_id,
                "name": "Aerospace OPC-UA Master",
                "endpoint_url": "opc.tcp://opcua-aero.local:4840/UA/Server",
                "auth_mode": "anonymous",
                "security_policy": "None",
                "security_mode": "None",
                "tls_insecure": False,
                "is_active": True,
                "session_timeout": 30000,
                "publishing_interval": 1000,
                "sampling_interval": 250,
                "created_at": now,
                "updated_at": now,
            },
        )
    else:
        opcua_id = opcua_existing
    out["opcua_id"] = opcua_id

    # Wire two OPC-UA tag mappings
    name_to_id: dict[tuple[str, str], int] = {}
    for (plant_code, _path, name), cid in char_ids.items():
        name_to_id.setdefault((plant_code, name), cid)

    ds_table = __import__(
        "cassini.db.models.data_source", fromlist=["DataSource"]
    ).DataSource.__table__
    mqtt_ds_table = MQTTDataSource.__table__
    opcua_ds_table = OPCUADataSource.__table__

    def _wire_data_source(ds_type: str, char_id: int, **child) -> None:
        existing = _scalar_or_none(
            conn,
            select(ds_table.c.id).where(ds_table.c.characteristic_id == char_id),
        )
        if existing is not None:
            return
        ds_id = _insert_returning_id(
            conn,
            ds_table,
            {
                "type": ds_type,
                "characteristic_id": char_id,
                "trigger_strategy": "on_change",
                "is_active": True,
            },
        )
        if ds_type == "mqtt":
            conn.execute(
                insert(mqtt_ds_table),
                [{"id": ds_id, **child}],
            )
        else:
            conn.execute(
                insert(opcua_ds_table),
                [{"id": ds_id, **child}],
            )

    # OPC-UA mapped chars
    coolant_id = name_to_id.get(("AERO-FORGE", "Coolant Temp"))
    shaft_id = name_to_id.get(("AERO-FORGE", "Shaft OD"))
    if coolant_id is not None:
        _wire_data_source(
            "opcua",
            coolant_id,
            server_id=opcua_id,
            node_id="ns=2;s=HeatTreat.Furnace1.CoolantTemp",
        )
    if shaft_id is not None:
        _wire_data_source(
            "opcua",
            shaft_id,
            server_id=opcua_id,
            node_id="ns=2;s=Compressor.Station2.ShaftOD",
        )

    # MQTT mapped chars (Aerospace and Auto)
    bore_id = name_to_id.get(("AERO-FORGE", "Bore Diameter OD-A"))
    wall_id = name_to_id.get(("AERO-FORGE", "Wall Thickness"))
    if bore_id is not None:
        _wire_data_source(
            "mqtt",
            bore_id,
            broker_id=broker_ids.get("Aerospace Floor Broker"),
            topic="aero/forge/press-line-a/station1/bore-diameter",
            metric_name="bore_diameter",
        )
    if wall_id is not None:
        _wire_data_source(
            "mqtt",
            wall_id,
            broker_id=broker_ids.get("Aerospace Floor Broker"),
            topic="aero/forge/press-line-a/station1/wall-thickness",
            metric_name="wall_thickness",
        )

    trim_id = name_to_id.get(("AUTO-STAMP", "Trim Length"))
    spring_id = name_to_id.get(("AUTO-STAMP", "Spring Force"))
    if trim_id is not None:
        _wire_data_source(
            "mqtt",
            trim_id,
            broker_id=broker_ids.get("Stamping Floor Broker"),
            topic="auto/stamp/press-1/trim-length",
            metric_name="trim_length",
        )
    if spring_id is not None:
        _wire_data_source(
            "mqtt",
            spring_id,
            broker_id=broker_ids.get("Stamping Floor Broker"),
            topic="auto/stamp/press-1/spring-force",
            metric_name="spring_force",
        )

    # Gage bridge
    admin_id = user_ids.get("admin")
    gb_existing = _scalar_or_none(
        conn,
        select(gb_table.c.id).where(
            gb_table.c.plant_id == aero_id,
            gb_table.c.name == "Inspection Bay PC",
        ),
    )
    if gb_existing is None:
        gb_id = _insert_returning_id(
            conn,
            gb_table,
            {
                "plant_id": aero_id,
                "name": "Inspection Bay PC",
                # Hashed placeholder API key (not validated by feature-tour)
                "api_key_hash": hashlib.sha256(b"feature-tour-gage-bridge").hexdigest(),
                "mqtt_broker_id": broker_ids.get("Aerospace Floor Broker"),
                "status": "online",
                "last_heartbeat_at": now,
                "registered_by": admin_id,
                "created_at": now,
            },
        )
        # One Mitutoyo gage attached
        gp_existing = _scalar_or_none(
            conn,
            select(gp_table.c.id).where(
                gp_table.c.bridge_id == gb_id, gp_table.c.port_name == "COM3"
            ),
        )
        if gp_existing is None:
            conn.execute(
                insert(gp_table),
                [
                    {
                        "bridge_id": gb_id,
                        "port_name": "COM3",
                        "baud_rate": 9600,
                        "data_bits": 8,
                        "parity": "none",
                        "stop_bits": 1.0,
                        "protocol_profile": "mitutoyo",
                        "parse_pattern": None,
                        "mqtt_topic": "aero/forge/gage/mitutoyo/COM3",
                        "characteristic_id": bore_id,
                        "is_active": True,
                        "created_at": now,
                    }
                ],
            )

    # ERP connector (Aerospace) — stubbed SAP
    erp_existing = _scalar_or_none(
        conn,
        select(erp_table.c.id).where(
            erp_table.c.plant_id == aero_id,
            erp_table.c.name == "SAP QM (stub)",
        ),
    )
    if erp_existing is None:
        erp_id = _insert_returning_id(
            conn,
            erp_table,
            {
                "plant_id": aero_id,
                "name": "SAP QM (stub)",
                "connector_type": "sap_qm",
                "base_url": "https://sap-stub.aerospace.invalid/odata/v4/QM",
                "auth_type": "oauth2_client_credentials",
                "auth_config": "{}",
                "headers": "{}",
                "is_active": True,
                "status": "connected",
                "last_sync_at": now - timedelta(hours=2),
                "created_at": now,
                "updated_at": now,
            },
        )
        conn.execute(
            insert(schedule_table),
            [
                {
                    "connector_id": erp_id,
                    "direction": "inbound",
                    "cron_expression": "0 */4 * * *",  # every 4 hours
                    "is_active": True,
                    "last_run_at": now - timedelta(hours=2),
                    "next_run_at": now + timedelta(hours=2),
                }
            ],
        )
        conn.execute(
            insert(sync_log_table),
            [
                {
                    "connector_id": erp_id,
                    "direction": "inbound",
                    "status": "success",
                    "records_processed": 142,
                    "records_failed": 0,
                    "started_at": now - timedelta(hours=2),
                    "completed_at": now - timedelta(hours=2, seconds=-30),
                    "error_message": None,
                    "detail": None,
                }
            ],
        )
        out["erp_id"] = erp_id

    return out


# ── Section 13: Audit log ────────────────────────────────────────────────


def seed_audit_log(
    conn: Connection,
    plant_ids: dict[str, int],
    user_ids: dict[str, int],
    char_ids: dict[tuple[str, str, str], int],
    fai_reports: dict[str, int],
    msa_studies: dict[str, int],
) -> int:
    """Insert a diverse 50+ entry audit log spanning all 3 plants."""
    table = AuditLog.__table__
    # Audit log accumulates by spec section 22 (sample-level rows do too).
    # We use a sentinel "feature_tour_seed_marker" entry to detect re-runs and
    # skip the bulk insert. This keeps entries >= 50 on first run while
    # avoiding unbounded growth on subsequent runs.
    marker = _scalar_or_none(
        conn,
        select(table.c.id).where(
            table.c.action == "feature_tour_seed_marker"
        ),
    )
    if marker is not None:
        return 0

    name_to_id: dict[tuple[str, str], int] = {}
    for (plant_code, _path, name), cid in char_ids.items():
        name_to_id.setdefault((plant_code, name), cid)

    aero_id = plant_ids["AERO-FORGE"]
    pharma_id = plant_ids["PHARMA-FILL"]
    auto_id = plant_ids["AUTO-STAMP"]
    admin_id = user_ids.get("admin")
    eng_id = user_ids.get("engineer.aero")
    sup_id = user_ids.get("supervisor.pharma")
    op_id = user_ids.get("operator.auto")
    multi_id = user_ids.get("multi.role")
    now = _utcnow()

    entries: list[dict[str, Any]] = []

    def add(user_id, username, action, resource_type, resource_id, plant_id, detail, ip, hours_back):
        entries.append(
            {
                "user_id": user_id,
                "username": username,
                "action": action,
                "resource_type": resource_type,
                "resource_id": resource_id,
                "plant_id": plant_id,
                "detail": detail,
                "ip_address": ip,
                "user_agent": "Mozilla/5.0 (Cassini Feature Tour)",
                "timestamp": now - timedelta(hours=hours_back),
            }
        )

    # User login events
    for uid, uname, hours in [
        (admin_id, "admin", 0.5),
        (admin_id, "admin", 24),
        (admin_id, "admin", 48),
        (eng_id, "engineer.aero", 1),
        (eng_id, "engineer.aero", 25),
        (sup_id, "supervisor.pharma", 2),
        (sup_id, "supervisor.pharma", 26),
        (op_id, "operator.auto", 3),
        (op_id, "operator.auto", 27),
        (multi_id, "multi.role", 4),
    ]:
        add(uid, uname, "login", None, None, None, {"method": "password"}, "192.168.10.1", hours)

    # Failed logins (locked.user)
    for h in (0.1, 0.2, 0.3, 0.4, 0.5, 0.6):
        add(None, "locked.user", "failed_login", "user", None, None, {"reason": "wrong_password"}, "192.168.10.99", h + 5)

    # Plant + characteristic events
    add(admin_id, "admin", "create_plant", "plant", aero_id, aero_id, {"name": "Aerospace Forge"}, "192.168.10.1", 100)
    add(admin_id, "admin", "create_plant", "plant", pharma_id, pharma_id, {"name": "Pharma Fill"}, "192.168.10.1", 99)
    add(admin_id, "admin", "create_plant", "plant", auto_id, auto_id, {"name": "Auto Stamping"}, "192.168.10.1", 98)
    bore_id = name_to_id.get(("AERO-FORGE", "Bore Diameter OD-A"))
    if bore_id:
        add(eng_id, "engineer.aero", "create_characteristic", "characteristic", bore_id, aero_id,
            {"name": "Bore Diameter OD-A"}, "192.168.20.5", 90)
        add(eng_id, "engineer.aero", "update_characteristic", "characteristic", bore_id, aero_id,
            {"changed": ["usl", "lsl"]}, "192.168.20.5", 85)

    # Sample submissions
    for cnt in range(8):
        add(op_id, "operator.auto", "submit_sample", "sample", None, auto_id,
            {"value": 200.04 + cnt * 0.05}, "192.168.30.10", 20 + cnt)

    # Violation acknowledgements
    add(eng_id, "engineer.aero", "acknowledge_violation", "violation", None, aero_id,
        {"reason": "Tool wear", "rule_id": 1}, "192.168.20.5", 15)
    add(sup_id, "supervisor.pharma", "acknowledge_violation", "violation", None, pharma_id,
        {"reason": "Sample collection mishap", "rule_id": 2}, "192.168.40.7", 10)

    # FAI signatures
    fai001 = fai_reports.get("fai-001")
    if fai001:
        add(eng_id, "engineer.aero", "sign", "fai_report", fai001, aero_id,
            {"meaning": "reviewed"}, "192.168.20.5", 12)
        add(admin_id, "admin", "sign", "fai_report", fai001, aero_id,
            {"meaning": "approved"}, "192.168.10.1", 11)
    fai002 = fai_reports.get("fai-002")
    if fai002:
        add(eng_id, "engineer.aero", "sign", "fai_report", fai002, aero_id,
            {"meaning": "reviewed"}, "192.168.20.5", 8)

    # Workflow + retention + exports
    add(admin_id, "admin", "create_signature_workflow", "signature_workflow", None, aero_id,
        {"name": "FAI approval"}, "192.168.10.1", 70)
    add(admin_id, "admin", "update_retention_policy", "retention_policy", None, aero_id,
        {"retention_value": 10, "retention_unit": "years"}, "192.168.10.1", 65)
    add(admin_id, "admin", "purge_run", "retention_policy", None, auto_id,
        {"deleted": 320, "kept": 5680}, "192.168.10.1", 30 * 24)
    add(admin_id, "admin", "export_report", "report", None, aero_id,
        {"format": "pdf", "type": "capability"}, "192.168.10.1", 6)
    add(admin_id, "admin", "schedule_report", "report_schedule", None, aero_id,
        {"frequency": "weekly"}, "192.168.10.1", 14 * 24)
    add(admin_id, "admin", "create_api_key", "api_key", None, None,
        {"name": "RW global key"}, "192.168.10.1", 7 * 24)
    add(admin_id, "admin", "update_oidc_config", "oidc_config", None, None,
        {"name": "Corp SSO"}, "192.168.10.1", 14 * 24)
    add(admin_id, "admin", "ai_provider_configured", "ai_provider_config", None, aero_id,
        {"provider": "claude"}, "192.168.10.1", 5 * 24)

    # MSA lifecycle
    msa_bore = msa_studies.get("Bore Diameter Gage R&R")
    if msa_bore:
        add(eng_id, "engineer.aero", "create_msa_study", "msa_study", msa_bore, aero_id,
            {"name": "Bore Diameter Gage R&R"}, "192.168.20.5", 35)
        add(eng_id, "engineer.aero", "complete_msa_study", "msa_study", msa_bore, aero_id,
            {"name": "Bore Diameter Gage R&R", "pct_grr": 13.2}, "192.168.20.5", 33)

    # CEP rule events
    add(admin_id, "admin", "create_cep_rule", "cep_rule", None, aero_id,
        {"name": "cross-station-drift"}, "192.168.10.1", 48)
    add(admin_id, "admin", "create_cep_rule", "cep_rule", None, aero_id,
        {"name": "coolant-and-shaft"}, "192.168.10.1", 47)
    add(admin_id, "admin", "disable_cep_rule", "cep_rule", None, aero_id,
        {"name": "legacy-rule", "reason": "deprecated"}, "192.168.10.1", 46)

    # SOP-RAG events
    add(admin_id, "admin", "upload_sop_doc", "sop_doc", None, aero_id,
        {"title": "Press Line A — Operating Procedures"}, "192.168.10.1", 50)
    add(admin_id, "admin", "upload_sop_doc", "sop_doc", None, aero_id,
        {"title": "Tool Change SOP"}, "192.168.10.1", 49)
    add(eng_id, "engineer.aero", "sop_query", "sop_doc", None, aero_id,
        {"question": "What is the torque spec?", "cited_chunks": 3}, "192.168.20.5", 5)

    # Anomaly acknowledgements
    add(eng_id, "engineer.aero", "acknowledge_anomaly", "anomaly_event", None, auto_id,
        {"detector": "pelt", "summary": "Mean shift on Punch Wear"}, "192.168.20.5", 9)

    # Sentinel marker so re-runs detect a previous seed. Required by 21 CFR
    # Part 11 — audit_log rows can never be deleted, only inserted; the
    # marker idempotency mirrors that constraint.
    add(admin_id, "admin", "feature_tour_seed_marker", None, None, None,
        {"profile": "feature-tour"}, "127.0.0.1", 200)

    rows = [
        {**e, "detail": e.get("detail")} for e in entries
    ]
    conn.execute(insert(table), rows)
    return len(rows)


# ── Section 14: Electronic signatures + workflows ────────────────────────


def seed_signatures(
    conn: Connection,
    plant_ids: dict[str, int],
    user_ids: dict[str, int],
    fai_reports: dict[str, int],
) -> dict[str, Any]:
    sw_table = SignatureWorkflow.__table__
    sws_table = SignatureWorkflowStep.__table__
    swi_table = SignatureWorkflowInstance.__table__
    sig_table = ElectronicSignature.__table__
    sm_table = SignatureMeaning.__table__
    out: dict[str, Any] = {}

    aero_id = plant_ids["AERO-FORGE"]
    admin_id = user_ids.get("admin")
    eng_id = user_ids.get("engineer.aero")
    now = _utcnow()

    # Two workflows: FAI approval + retention purge
    wf_specs = [
        {
            "key": "fai_approval",
            "name": "FAI Approval Workflow",
            "resource_type": "fai_report",
            "is_required": True,
            "steps": [
                ("Engineering Review", "engineer", "reviewed", 48),
                ("Final Approval", "admin", "approved", 24),
            ],
        },
        {
            "key": "retention_purge",
            "name": "Retention Purge Approval",
            "resource_type": "retention_purge",
            "is_required": True,
            "steps": [("Admin Approval", "admin", "approved", 72)],
        },
    ]
    workflow_ids: dict[str, int] = {}
    for spec in wf_specs:
        existing = _scalar_or_none(
            conn,
            select(sw_table.c.id).where(
                sw_table.c.plant_id == aero_id,
                sw_table.c.resource_type == spec["resource_type"],
            ),
        )
        if existing is not None:
            workflow_ids[spec["key"]] = existing
            continue
        wf_id = _insert_returning_id(
            conn,
            sw_table,
            {
                "plant_id": aero_id,
                "name": spec["name"],
                "resource_type": spec["resource_type"],
                "is_active": True,
                "is_required": spec["is_required"],
                "description": f"Auto-seeded {spec['name']}",
                "created_at": now,
                "updated_at": now,
            },
        )
        workflow_ids[spec["key"]] = wf_id
        for idx, (step_name, role, meaning, hours) in enumerate(spec["steps"]):
            conn.execute(
                insert(sws_table),
                [
                    {
                        "workflow_id": wf_id,
                        "step_order": idx + 1,
                        "name": step_name,
                        "min_role": role,
                        "meaning_code": meaning,
                        "is_required": True,
                        "allow_self_sign": False,
                        "timeout_hours": hours,
                    }
                ],
            )
    out["workflows"] = workflow_ids

    # Signature meanings (Aerospace)
    meanings = [
        ("reviewed", "Reviewed", "Content technically reviewed", False),
        ("approved", "Approved", "Approved for release", False),
        ("rejected", "Rejected", "Rejected — requires rework", True),
    ]
    for sort_idx, (code, name, desc, requires_comment) in enumerate(meanings):
        existing = _scalar_or_none(
            conn,
            select(sm_table.c.id).where(
                sm_table.c.plant_id == aero_id, sm_table.c.code == code
            ),
        )
        if existing is None:
            conn.execute(
                insert(sm_table),
                [
                    {
                        "plant_id": aero_id,
                        "code": code,
                        "display_name": name,
                        "description": desc,
                        "requires_comment": requires_comment,
                        "is_active": True,
                        "sort_order": sort_idx,
                    }
                ],
            )

    # Signatures: FAI #001 (both signed), FAI #002 (engineer only), retention purge from 30d ago
    sig_count = conn.execute(select(sig_table.c.id).limit(1)).first()
    if sig_count is not None:
        return out

    fai_step_id = _scalar_or_none(
        conn,
        select(sws_table.c.id).where(
            sws_table.c.workflow_id == workflow_ids["fai_approval"],
            sws_table.c.step_order == 1,
        ),
    )
    fai_step2_id = _scalar_or_none(
        conn,
        select(sws_table.c.id).where(
            sws_table.c.workflow_id == workflow_ids["fai_approval"],
            sws_table.c.step_order == 2,
        ),
    )
    purge_step_id = _scalar_or_none(
        conn,
        select(sws_table.c.id).where(
            sws_table.c.workflow_id == workflow_ids["retention_purge"],
            sws_table.c.step_order == 1,
        ),
    )

    fai001 = fai_reports.get("fai-001")
    fai002 = fai_reports.get("fai-002")

    def make_sig(user_id, username, full_name, meaning_code, meaning_display,
                 res_type, res_id, step_id, comment, hours_back):
        body = f"{username}|{meaning_code}|{res_type}|{res_id}|{hours_back}"
        return {
            "user_id": user_id,
            "username": username,
            "full_name": full_name,
            "timestamp": now - timedelta(hours=hours_back),
            "meaning_code": meaning_code,
            "meaning_display": meaning_display,
            "resource_type": res_type,
            "resource_id": res_id,
            "resource_hash": hashlib.sha256(body.encode()).hexdigest(),
            "signature_hash": hashlib.sha256((body + secrets.token_hex(8)).encode()).hexdigest(),
            "ip_address": "192.168.20.5",
            "user_agent": "Mozilla/5.0 (Cassini Feature Tour)",
            "workflow_step_id": step_id,
            "comment": comment,
            "is_valid": True,
        }

    sig_rows = []
    if fai001 and fai_step_id and fai_step2_id:
        sig_rows.append(make_sig(eng_id, "engineer.aero", "Eve Engineer (Aerospace)",
                                 "reviewed", "Reviewed", "fai_report", fai001,
                                 fai_step_id, "All measurements pass tolerance.", 13))
        sig_rows.append(make_sig(admin_id, "admin", "Cassini Admin",
                                 "approved", "Approved", "fai_report", fai001,
                                 fai_step2_id, "Approved for production release.", 12))
    if fai002 and fai_step_id:
        sig_rows.append(make_sig(eng_id, "engineer.aero", "Eve Engineer (Aerospace)",
                                 "reviewed", "Reviewed", "fai_report", fai002,
                                 fai_step_id, "Awaiting supervisor for final sign-off.", 8))

    # Retention purge sig 30d ago
    if purge_step_id:
        sig_rows.append(make_sig(admin_id, "admin", "Cassini Admin",
                                 "approved", "Approved", "retention_purge", 1,
                                 purge_step_id, "Approved 30-day purge of Auto Stamping line samples.", 30 * 24))
    if sig_rows:
        conn.execute(insert(sig_table), sig_rows)

    # Workflow instance: FAI #002 has a pending step 2
    if fai002:
        existing = _scalar_or_none(
            conn,
            select(swi_table.c.id).where(
                swi_table.c.workflow_id == workflow_ids["fai_approval"],
                swi_table.c.resource_type == "fai_report",
                swi_table.c.resource_id == fai002,
            ),
        )
        if existing is None:
            conn.execute(
                insert(swi_table),
                [
                    {
                        "workflow_id": workflow_ids["fai_approval"],
                        "resource_type": "fai_report",
                        "resource_id": fai002,
                        "status": "pending",
                        "current_step": 2,
                        "initiated_by": eng_id,
                        "initiated_at": now - timedelta(hours=8),
                    }
                ],
            )

    return out


# ── Section 15: Retention policies + purge run ───────────────────────────


def seed_retention(
    conn: Connection, plant_ids: dict[str, int]
) -> dict[str, Any]:
    rp_table = RetentionPolicy.__table__
    purge_table = PurgeHistory.__table__

    aero_id = plant_ids["AERO-FORGE"]
    pharma_id = plant_ids["PHARMA-FILL"]
    auto_id = plant_ids["AUTO-STAMP"]
    now = _utcnow()
    out: dict[str, Any] = {}

    policies = [
        # (plant_id, scope, hierarchy_id, characteristic_id, retention_value, retention_unit)
        (aero_id, "global", None, None, 10, "years"),    # Aerospace 10y
        (pharma_id, "global", None, None, 25, "years"),  # Pharma 25y
        (auto_id, "global", None, None, 7, "years"),     # Auto 7y
    ]
    for plant_id, scope, hier_id, char_id, val, unit in policies:
        existing = _scalar_or_none(
            conn,
            select(rp_table.c.id).where(
                rp_table.c.plant_id == plant_id,
                rp_table.c.scope == scope,
                rp_table.c.hierarchy_id.is_(hier_id),
                rp_table.c.characteristic_id.is_(char_id),
            ),
        )
        if existing is None:
            _insert_returning_id(
                conn,
                rp_table,
                {
                    "plant_id": plant_id,
                    "scope": scope,
                    "hierarchy_id": hier_id,
                    "characteristic_id": char_id,
                    "retention_type": "time_delta",
                    "retention_value": val,
                    "retention_unit": unit,
                },
            )

    # Purge run from 30 days ago (Auto Stamping line)
    existing_purge = _scalar_or_none(
        conn,
        select(purge_table.c.id).where(
            purge_table.c.plant_id == auto_id,
            purge_table.c.status == "complete",
        ),
    )
    if existing_purge is None:
        _insert_returning_id(
            conn,
            purge_table,
            {
                "plant_id": auto_id,
                "started_at": now - timedelta(days=30),
                "completed_at": now - timedelta(days=30, seconds=-180),
                "status": "complete",
                "samples_deleted": 320,
                "violations_deleted": 8,
                "characteristics_processed": 4,
                "error_message": None,
            },
        )
    return out


# ── Section 16: Analytics (multivariate, predictions, AI, correlation, anomaly) ──


def seed_analytics(
    conn: Connection,
    plant_ids: dict[str, int],
    char_ids: dict[tuple[str, str, str], int],
    histories: dict[int, dict[str, Any]],
    rng: random.Random,
) -> dict[str, Any]:
    out: dict[str, Any] = {}
    name_to_id: dict[tuple[str, str], int] = {}
    for (plant_code, _path, name), cid in char_ids.items():
        name_to_id.setdefault((plant_code, name), cid)
    aero_id = plant_ids["AERO-FORGE"]
    auto_id = plant_ids["AUTO-STAMP"]
    now = _utcnow()

    # Multivariate groups (Aerospace)
    mv_table = MultivariateGroup.__table__
    mv_member_table = MultivariateGroupMember.__table__
    mv_sample_table = MultivariateSample.__table__

    def _mv_group(name, members, phase, chart_type="t_squared", method="classical"):
        existing = _scalar_or_none(
            conn,
            select(mv_table.c.id).where(
                mv_table.c.plant_id == aero_id, mv_table.c.name == name
            ),
        )
        if existing is not None:
            return existing
        gid = _insert_returning_id(
            conn,
            mv_table,
            {
                "plant_id": aero_id,
                "name": name,
                "description": f"{name} multivariate analysis",
                "chart_type": chart_type,
                "covariance_method": method,
                "phase": phase,
                "min_samples": 30,
                "is_active": True,
                "reference_mean": json.dumps([10.0, 25.0]),
                "reference_covariance": json.dumps([[0.16, 0.02], [0.02, 0.014]]),
                "created_at": now,
            },
        )
        for idx, char_name in enumerate(members):
            mid = name_to_id.get(("AERO-FORGE", char_name))
            if mid is None:
                continue
            existing_member = _scalar_or_none(
                conn,
                select(mv_member_table.c.id).where(
                    mv_member_table.c.group_id == gid,
                    mv_member_table.c.characteristic_id == mid,
                ),
            )
            if existing_member is None:
                conn.execute(
                    insert(mv_member_table),
                    [
                        {
                            "group_id": gid,
                            "characteristic_id": mid,
                            "display_order": idx,
                        }
                    ],
                )
        return gid

    shaft_geom_id = _mv_group(
        "Shaft Geometry",
        ["Shaft OD", "Surface Roughness Ra"],
        phase="phase_ii",
    )
    press_coupling_id = _mv_group(
        "Press Coupling",
        ["Coolant Temp", "Shaft OD"],
        phase="phase_i",
    )
    out["mv_groups"] = {
        "Shaft Geometry": shaft_geom_id,
        "Press Coupling": press_coupling_id,
    }

    # MCD covariance variant on Shaft Geometry
    _mv_group(
        "Shaft Geometry (MCD)",
        ["Shaft OD", "Surface Roughness Ra"],
        phase="phase_ii",
        method="mcd",
    )

    # Add 70 multivariate samples with 2 OOC for "Shaft Geometry"
    if shaft_geom_id and conn.execute(
        select(mv_sample_table.c.id).where(mv_sample_table.c.group_id == shaft_geom_id).limit(1)
    ).first() is None:
        ucl = 11.5  # T² UCL for ~p=2, alpha=0.0027
        for i in range(70):
            ts = now - timedelta(days=70 - i)
            t2 = abs(rng.gauss(2.0, 1.5))
            in_control = t2 < ucl
            if i in (50, 65):  # 2 OOC points
                t2 = 14.0 + i * 0.1
                in_control = False
            conn.execute(
                insert(mv_sample_table),
                [
                    {
                        "group_id": shaft_geom_id,
                        "t_squared": round(t2, 4),
                        "ucl": ucl,
                        "in_control": in_control,
                        "decomposition": json.dumps(
                            {"Shaft OD": round(t2 * 0.6, 3), "Surface Roughness Ra": round(t2 * 0.4, 3)}
                        ),
                        "raw_values": json.dumps([round(rng.uniform(24.95, 25.05), 4),
                                                  round(rng.uniform(0.6, 1.0), 3)]),
                        "sample_timestamp": ts,
                        "computed_at": now,
                    }
                ],
            )

    # Predictions: Punch Wear + Fill Volume
    pc_table = PredictionConfig.__table__
    pm_table = PredictionModel.__table__
    fc_table = Forecast.__table__
    pred_models: dict[str, int] = {}
    for char_name, model_type, plant in [
        ("Punch Wear", "exponential_smoothing", "AUTO-STAMP"),
        ("Fill Volume", "arima", "PHARMA-FILL"),
    ]:
        cid = name_to_id.get((plant, char_name))
        if cid is None:
            continue
        # Config
        existing_cfg = _scalar_or_none(
            conn,
            select(pc_table.c.id).where(pc_table.c.characteristic_id == cid),
        )
        if existing_cfg is None:
            _insert_returning_id(
                conn,
                pc_table,
                {
                    "characteristic_id": cid,
                    "is_enabled": True,
                    "model_type": model_type,
                    "forecast_horizon": 10 if char_name == "Punch Wear" else 5,
                    "refit_interval": 50,
                    "confidence_levels": "[0.8, 0.95]",
                    "created_at": now,
                },
            )
        existing_model = _scalar_or_none(
            conn,
            select(pm_table.c.id).where(
                pm_table.c.characteristic_id == cid, pm_table.c.is_current == True  # noqa: E712
            ),
        )
        if existing_model is None:
            params = (
                {"alpha": 0.3, "beta": 0.1, "gamma": 0.0}
                if model_type == "exponential_smoothing"
                else {"order": [1, 0, 1], "ar": [0.85], "ma": [-0.42]}
            )
            mid = _insert_returning_id(
                conn,
                pm_table,
                {
                    "characteristic_id": cid,
                    "model_type": model_type,
                    "model_params": json.dumps(params),
                    "aic": -220.8 if char_name == "Punch Wear" else -118.2,
                    "training_samples": 160 if char_name == "Punch Wear" else 130,
                    "fitted_at": now,
                    "is_current": True,
                },
            )
            pred_models[char_name] = mid
            # Insert forecasts
            history = histories.get(cid)
            if history and history["values"]:
                last_value = history["values"][-1]
                horizon = 10 if char_name == "Punch Wear" else 5
                for step in range(1, horizon + 1):
                    drift = 0.02 * step if char_name == "Punch Wear" else 0.0
                    pv = last_value + drift + rng.gauss(0, 0.02)
                    width80 = 0.10 * (step ** 0.5)
                    width95 = 0.18 * (step ** 0.5)
                    predicted_ooc = (
                        char_name == "Punch Wear" and step >= 7 and pv > 1.7
                    )
                    conn.execute(
                        insert(fc_table),
                        [
                            {
                                "model_id": mid,
                                "characteristic_id": cid,
                                "step": step,
                                "predicted_value": round(pv, 4),
                                "lower_80": round(pv - width80, 4),
                                "upper_80": round(pv + width80, 4),
                                "lower_95": round(pv - width95, 4),
                                "upper_95": round(pv + width95, 4),
                                "predicted_ooc": predicted_ooc,
                                "generated_at": now,
                            }
                        ],
                    )
    out["pred_models"] = pred_models

    # AI provider config (Aerospace) + cached insight
    apc_table = AIProviderConfig.__table__
    ai_existing = _scalar_or_none(
        conn,
        select(apc_table.c.id).where(apc_table.c.plant_id == aero_id),
    )
    if ai_existing is None:
        _insert_returning_id(
            conn,
            apc_table,
            {
                "plant_id": aero_id,
                "provider_type": "claude",
                "api_key": None,  # Will be configured by skill via mocking
                "model_name": "claude-sonnet-4-20250514",
                "max_tokens": 4096,
                "is_enabled": True,
                "created_at": now,
            },
        )
    ai_table = AIInsight.__table__
    bore_id = name_to_id.get(("AERO-FORGE", "Bore Diameter OD-A"))
    if bore_id and conn.execute(
        select(ai_table.c.id).where(ai_table.c.characteristic_id == bore_id).limit(1)
    ).first() is None:
        conn.execute(
            insert(ai_table),
            [
                {
                    "characteristic_id": bore_id,
                    "provider_type": "claude",
                    "model_name": "claude-sonnet-4-20250514",
                    "context_hash": hashlib.sha256(b"feature-tour-bore-diameter-v1").hexdigest()[:16],
                    "summary": (
                        "Bore Diameter OD-A is currently in Phase II monitoring. "
                        "Recent samples show a +1.5σ drift over the last 15 days. "
                        "Cpk has decreased from 1.21 to 1.05, approaching the marginal threshold."
                    ),
                    "patterns": json.dumps([
                        {"name": "Mean drift", "severity": "medium", "evidence": "9 consecutive points above center."},
                        {"name": "Material lot transition", "severity": "low", "evidence": "Annotation: '4340 Lot A → Lot B' coincides with drift onset."},
                    ]),
                    "risks": json.dumps([
                        {"name": "Spec excursion likely within 5 days", "severity": "medium"},
                    ]),
                    "recommendations": json.dumps([
                        "Investigate fixture wear on Press Line A",
                        "Verify material certs for new 4340 Lot B",
                    ]),
                    "tokens_used": 1850,
                    "latency_ms": 4200,
                    "tool_calls_made": 0,
                    "generated_at": now - timedelta(hours=1),
                }
            ],
        )

    # Correlation (Aerospace bore line: 3 chars)
    corr_table = CorrelationResult.__table__
    bore_chars = [
        name_to_id.get(("AERO-FORGE", "Bore Diameter OD-A")),
        name_to_id.get(("AERO-FORGE", "Wall Thickness")),
        name_to_id.get(("AERO-FORGE", "Mating Surface Flatness")),
    ]
    bore_chars = [c for c in bore_chars if c is not None]
    if len(bore_chars) == 3:
        existing = _scalar_or_none(
            conn,
            select(corr_table.c.id).where(corr_table.c.plant_id == aero_id),
        )
        if existing is None:
            conn.execute(
                insert(corr_table),
                [
                    {
                        "plant_id": aero_id,
                        "characteristic_ids": json.dumps(bore_chars),
                        "method": "pearson",
                        "matrix": json.dumps(
                            [[1.00, 0.42, 0.18], [0.42, 1.00, 0.31], [0.18, 0.31, 1.00]]
                        ),
                        "p_values": json.dumps(
                            [[0.0, 0.001, 0.05], [0.001, 0.0, 0.012], [0.05, 0.012, 0.0]]
                        ),
                        "sample_count": 130,
                        "computed_at": now,
                    }
                ],
            )

    # Spearman for non-normal pair
    punch_id = name_to_id.get(("AUTO-STAMP", "Punch Wear"))
    defect_id = name_to_id.get(("AUTO-STAMP", "Defect Count"))
    if punch_id and defect_id:
        existing = _scalar_or_none(
            conn,
            select(corr_table.c.id).where(
                corr_table.c.plant_id == auto_id, corr_table.c.method == "spearman"
            ),
        )
        if existing is None:
            conn.execute(
                insert(corr_table),
                [
                    {
                        "plant_id": auto_id,
                        "characteristic_ids": json.dumps([punch_id, defect_id]),
                        "method": "spearman",
                        "matrix": json.dumps([[1.0, 0.61], [0.61, 1.0]]),
                        "p_values": json.dumps([[0.0, 0.0001], [0.0001, 0.0]]),
                        "sample_count": 120,
                        "computed_at": now,
                    }
                ],
            )

    # Anomaly detection events
    ae_table = AnomalyEvent.__table__
    if punch_id:
        # PELT changepoints (3) on Punch Wear
        existing_count = conn.execute(
            select(ae_table.c.id).where(ae_table.c.char_id == punch_id).limit(1)
        ).first()
        if existing_count is None:
            for i, segment_idx in enumerate([30, 60, 100]):
                conn.execute(
                    insert(ae_table),
                    [
                        {
                            "char_id": punch_id,
                            "detector_type": "pelt",
                            "event_type": "changepoint",
                            "severity": "medium" if i < 2 else "high",
                            "details": {
                                "segment_index": segment_idx,
                                "magnitude": 0.45 + i * 0.10,
                                "before_mean": 1.05,
                                "after_mean": 1.05 + 0.20 * (i + 1),
                            },
                            "summary": f"Mean shifted upward at sample index {segment_idx}",
                            "is_acknowledged": i == 0,
                            "is_dismissed": False,
                            "detected_at": now - timedelta(days=10 - i * 3),
                        }
                    ],
                )
    trim_id = name_to_id.get(("AUTO-STAMP", "Trim Length"))
    if trim_id:
        existing = conn.execute(
            select(ae_table.c.id).where(
                ae_table.c.char_id == trim_id, ae_table.c.detector_type == "ks"
            ).limit(1)
        ).first()
        if existing is None:
            conn.execute(
                insert(ae_table),
                [
                    {
                        "char_id": trim_id,
                        "detector_type": "ks",
                        "event_type": "distribution_shift",
                        "severity": "medium",
                        "details": {"ks_statistic": 0.42, "p_value": 0.0007},
                        "summary": "Distribution shift detected (K-S p=0.0007)",
                        "is_acknowledged": False,
                        "is_dismissed": False,
                        "detected_at": now - timedelta(days=4),
                    }
                ],
            )
    if bore_id:
        # 5 Isolation Forest outliers on Bore Diameter
        existing = conn.execute(
            select(ae_table.c.id).where(
                ae_table.c.char_id == bore_id, ae_table.c.detector_type == "isolation_forest"
            ).limit(1)
        ).first()
        if existing is None:
            for i in range(5):
                conn.execute(
                    insert(ae_table),
                    [
                        {
                            "char_id": bore_id,
                            "detector_type": "isolation_forest",
                            "event_type": "outlier",
                            "severity": "low",
                            "details": {"anomaly_score": -0.62 - i * 0.05, "feature_idx": i},
                            "summary": f"Isolation Forest outlier (score=-{0.62 + i * 0.05:.2f})",
                            "is_acknowledged": False,
                            "is_dismissed": False,
                            "detected_at": now - timedelta(days=7 - i),
                        }
                    ],
                )

    return out


# ── Section 17: Enterprise features (CEP, SOP-RAG) ───────────────────────


_CEP_RULES = [
    {
        "name": "cross-station-drift",
        "enabled": True,
        "yaml_text": (
            "name: cross-station-drift\n"
            "description: Bore Diameter trending up + Wall Thickness trending down inside 5min window\n"
            "window: 5m\n"
            "conditions:\n"
            "  - characteristic: \"Press Line A.Bore Diameter OD-A\"\n"
            "    rule: increasing\n"
            "    count: 5\n"
            "  - characteristic: \"Press Line A.Wall Thickness\"\n"
            "    rule: decreasing\n"
            "    count: 5\n"
            "action:\n"
            "  violation: CROSS_STATION_DRIFT\n"
            "  severity: high\n"
            "  message: Cross-station drift on Press Line A - investigate fixture wear\n"
        ),
    },
    {
        "name": "coolant-and-shaft",
        "enabled": True,
        "yaml_text": (
            "name: coolant-and-shaft\n"
            "description: Coolant Temp drift above threshold + Shaft OD same-side run\n"
            "window: 10m\n"
            "conditions:\n"
            "  - characteristic: \"Furnace 1.Coolant Temp\"\n"
            "    rule: above_value\n"
            "    threshold: 70.0\n"
            "    count: 3\n"
            "  - characteristic: \"Press Line A.Shaft OD\"\n"
            "    rule: above_mean_consecutive\n"
            "    count: 9\n"
            "action:\n"
            "  violation: COOLANT_SHAFT_LINK\n"
            "  severity: medium\n"
            "  message: Coolant drift correlated with shaft OD trend - check heat treat process\n"
        ),
    },
    {
        "name": "legacy-rule",
        "enabled": False,
        "yaml_text": (
            "name: legacy-rule\n"
            "description: Single-stream demo for the disabled state\n"
            "window: 1m\n"
            "conditions:\n"
            "  - characteristic: \"Press Line 1.Punch Wear\"\n"
            "    rule: out_of_control\n"
            "    count: 1\n"
            "action:\n"
            "  violation: LEGACY_PUNCH_OOC\n"
            "  severity: low\n"
        ),
    },
]


def seed_cep_rules(conn: Connection, plant_ids: dict[str, int]) -> dict[str, int]:
    """3 CEP rules — 2 enabled, 1 disabled. YAML validated through the Pydantic schema."""
    table = CepRule.__table__
    aero_id = plant_ids["AERO-FORGE"]
    out: dict[str, int] = {}
    now = _utcnow()

    # Defer schema import so this module is importable without an event loop.
    from cassini.api.schemas.cep import CepRuleSpec
    import yaml as _yaml

    for spec in _CEP_RULES:
        existing = _scalar_or_none(
            conn,
            select(table.c.id).where(
                table.c.plant_id == aero_id, table.c.name == spec["name"]
            ),
        )
        if existing is not None:
            out[spec["name"]] = existing
            continue
        try:
            parsed = CepRuleSpec.model_validate(_yaml.safe_load(spec["yaml_text"]))
            parsed_json = parsed.model_dump_json()
            description = parsed.description
        except Exception as exc:
            # If validation fails (schema change), still seed with raw text so
            # the engineer can fix it through the UI.
            parsed_json = "{}"
            description = f"Seed validation failed: {exc!s}"
        rid = _insert_returning_id(
            conn,
            table,
            {
                "plant_id": aero_id,
                "name": spec["name"],
                "description": description,
                "yaml_text": spec["yaml_text"],
                "parsed_json": parsed_json,
                "enabled": spec["enabled"],
                "created_at": now,
                "updated_at": now,
            },
        )
        out[spec["name"]] = rid
    return out


def seed_sop_rag(
    conn: Connection,
    plant_ids: dict[str, int],
    user_ids: dict[str, int],
) -> dict[str, Any]:
    """3 SOP docs (1 ready, 1 ready, 1 indexing) + budget."""
    sd_table = SopDoc.__table__
    chunk_table = SopChunk.__table__
    budget_table = SopRagBudget.__table__
    out: dict[str, Any] = {}
    aero_id = plant_ids["AERO-FORGE"]
    admin_id = user_ids.get("admin")
    now = _utcnow()

    docs_spec = [
        {
            "title": "Press Line A — Operating Procedures",
            "filename": "press-line-a-operating-procedures.pdf",
            "content_type": "application/pdf",
            "byte_size": 2_184_300,
            "char_count": 24_500,
            "chunk_count": 47,
            "status": "ready",
            "chunks": [
                "Section 1.1 Press Line A is the primary forging line for turbine housings and compressor shafts. Operating temperature range: 800–1000 °C.",
                "Section 2.3 Bore Diameter inspection: every 10 housings, measure with calibrated bore micrometer; record on collection plan PLA-HRLY-001.",
                "Section 3.4 In case of bore diameter drift > 2σ, halt production, document on CA form, and escalate to the engineer on shift.",
            ] + [f"Section {i//5 + 4}.{i%5 + 1} (page {i + 5}) Routine paragraph about press operation." for i in range(44)],
        },
        {
            "title": "Tool Change SOP",
            "filename": "tool-change-sop.docx",
            "content_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "byte_size": 312_400,
            "char_count": 4_080,
            "chunk_count": 8,
            "status": "ready",
            "chunks": [
                "Tool changes on Press Line A must be logged via annotation with category 'Tool change'.",
                "Verify torque on the new insert at 12 Nm using calibrated torque wrench.",
                "Reset CUSUM after every tool change to clear residual signal.",
            ] + [f"Tool change appendix paragraph {i}" for i in range(5)],
        },
        {
            "title": "Quality Sampling Plan",
            "filename": "quality-sampling-plan.txt",
            "content_type": "text/plain",
            "byte_size": 18_220,
            "char_count": 2_100,
            "chunk_count": 4,  # status=indexing → only partial chunks present
            "status": "indexing",
            "chunks": [
                "Sampling cadence: Press Line A — every hour during production. Pharma Fill — per batch.",
                "Critical characteristics: Bore Diameter, Wall Thickness, Mating Surface Flatness, Fill Volume, Particulate Count.",
            ],
        },
    ]

    out["docs"] = {}
    for spec in docs_spec:
        existing = _scalar_or_none(
            conn,
            select(sd_table.c.id).where(
                sd_table.c.plant_id == aero_id, sd_table.c.title == spec["title"]
            ),
        )
        if existing is not None:
            out["docs"][spec["title"]] = existing
            continue
        doc_id = _insert_returning_id(
            conn,
            sd_table,
            {
                "plant_id": aero_id,
                "title": spec["title"],
                "filename": spec["filename"],
                "content_type": spec["content_type"],
                "storage_path": f"seed/sop/{aero_id}/{spec['filename']}",
                "byte_size": spec["byte_size"],
                "char_count": spec["char_count"],
                "chunk_count": spec["chunk_count"],
                "embedding_model": "local",
                "status": spec["status"],
                "status_message": "Indexing in progress" if spec["status"] == "indexing" else None,
                "pii_warning": False,
                "pii_match_summary": None,
                "uploaded_by": admin_id,
                "created_at": now - timedelta(days=2),
                "updated_at": now,
            },
        )
        out["docs"][spec["title"]] = doc_id
        for idx, text in enumerate(spec["chunks"]):
            conn.execute(
                insert(chunk_table),
                [
                    {
                        "doc_id": doc_id,
                        "plant_id": aero_id,
                        "chunk_index": idx,
                        "text": text,
                        "token_count": max(1, len(text.split())),
                        "paragraph_label": f"section {idx + 1}",
                        "embedding": None,
                        "embedding_dim": None,
                        "created_at": now,
                    }
                ],
            )

    # Budget (current month)
    year_month = now.strftime("%Y-%m")
    existing_budget = _scalar_or_none(
        conn,
        select(budget_table.c.id).where(
            budget_table.c.plant_id == aero_id,
            budget_table.c.year_month == year_month,
        ),
    )
    if existing_budget is None:
        _insert_returning_id(
            conn,
            budget_table,
            {
                "plant_id": aero_id,
                "year_month": year_month,
                "monthly_cap_usd": 50.0,
                "cost_usd": 0.32,
                "query_count": 6,
                "updated_at": now,
            },
        )
    return out


# ── Section 18: Reports (1 schedule + 4 runs) ─────────────────────────────


def seed_reports(
    conn: Connection,
    plant_ids: dict[str, int],
    user_ids: dict[str, int],
) -> dict[str, int]:
    sched_table = ReportSchedule.__table__
    run_table = ReportRun.__table__
    aero_id = plant_ids["AERO-FORGE"]
    eng_id = user_ids.get("engineer.aero")
    now = _utcnow()
    out: dict[str, int] = {}

    existing = _scalar_or_none(
        conn,
        select(sched_table.c.id).where(
            sched_table.c.plant_id == aero_id,
            sched_table.c.name == "Weekly Capability — Aerospace",
        ),
    )
    if existing is None:
        sched_id = _insert_returning_id(
            conn,
            sched_table,
            {
                "plant_id": aero_id,
                "name": "Weekly Capability — Aerospace",
                "template_id": "capability_evidence",
                "scope_type": "plant",
                "scope_id": aero_id,
                "frequency": "weekly",
                "hour": 6,
                "day_of_week": 1,  # Monday
                "day_of_month": None,
                "recipients": json.dumps(["engineer.aero"]),
                "window_days": 7,
                "is_active": True,
                "last_run_at": now - timedelta(days=7),
                "created_by": eng_id,
                "created_at": now - timedelta(days=60),
                "updated_at": now,
            },
        )

        # 4 runs: 2 success, 1 failed, 1 skipped
        runs = [
            ("success", "completed", -7, 487_120),
            ("success", "completed", -14, 432_700),
            ("failed", "PDF generator timed out (5min limit exceeded)", -21, None),
            ("skipped", "No data in window", -28, None),
        ]
        for status, message, days_ago, size in runs:
            started = now + timedelta(days=days_ago)
            conn.execute(
                insert(run_table),
                [
                    {
                        "schedule_id": sched_id,
                        "started_at": started,
                        "completed_at": started + timedelta(minutes=2 if status == "success" else 5),
                        "status": status,
                        "error_message": message if status != "success" else None,
                        "recipients_count": 1,
                        "pdf_size_bytes": size,
                    }
                ],
            )
        out["weekly_capability_id"] = sched_id
    else:
        out["weekly_capability_id"] = existing
    return out


# ── Section 19: API + integration surface ────────────────────────────────


def seed_api_integrations(
    conn: Connection,
    plant_ids: dict[str, int],
    user_ids: dict[str, int],
) -> dict[str, Any]:
    api_table = APIKey.__table__
    oidc_table = OIDCConfig.__table__
    push_table = PushSubscription.__table__
    smtp_table = SmtpConfig.__table__
    webhook_table = WebhookConfig.__table__
    out: dict[str, Any] = {}
    aero_id = plant_ids["AERO-FORGE"]
    admin_id = user_ids.get("admin")
    eng_id = user_ids.get("engineer.aero")
    now = _utcnow()

    # API keys (3 — read-only/Aerospace, RW global, expired)
    api_specs = [
        {
            "id": "feature-tour-api-key-aero-ro",
            "name": "Aerospace RO Key",
            "scope": "read-only",
            "plant_ids": [aero_id],
            "rate_limit_per_minute": 60,
            "is_active": True,
            "expires_at": None,
        },
        {
            "id": "feature-tour-api-key-global-rw",
            "name": "Global RW Key",
            "scope": "read-write",
            "plant_ids": None,
            "rate_limit_per_minute": 600,
            "is_active": True,
            "expires_at": None,
        },
        {
            "id": "feature-tour-api-key-expired",
            "name": "Expired Maintenance Key",
            "scope": "read-write",
            "plant_ids": None,
            "rate_limit_per_minute": 60,
            "is_active": True,
            "expires_at": now - timedelta(days=10),
        },
    ]
    for spec in api_specs:
        existing = _scalar_or_none(
            conn, select(api_table.c.id).where(api_table.c.id == spec["id"])
        )
        if existing is not None:
            continue
        # We never store the plaintext API key in the DB; the hash is stable.
        plaintext = f"feature-tour-{spec['id']}"
        key_hash = hashlib.sha256(plaintext.encode()).hexdigest()
        conn.execute(
            insert(api_table),
            [
                {
                    "id": spec["id"],
                    "name": spec["name"],
                    "key_hash": key_hash,
                    "key_prefix": plaintext[:12],
                    "created_at": now,
                    "expires_at": spec["expires_at"],
                    "permissions": {"characteristics": "all"},
                    "rate_limit_per_minute": spec["rate_limit_per_minute"],
                    "is_active": spec["is_active"],
                    "last_used_at": now - timedelta(days=1)
                    if spec["scope"] == "read-write"
                    else None,
                    "scope": spec["scope"],
                    "plant_ids": spec["plant_ids"],
                }
            ],
        )

    # OIDC providers (2)
    oidc_specs = [
        {
            "name": "Corp SSO",
            "issuer_url": "https://sso.example-corp.invalid/realms/saturnis",
            "client_id": "cassini-feature-tour",
            "is_active": True,
        },
        {
            "name": "Test IdP",
            "issuer_url": "https://idp.test.invalid",
            "client_id": "cassini-test",
            "is_active": False,
        },
    ]
    for spec in oidc_specs:
        existing = _scalar_or_none(
            conn,
            select(oidc_table.c.id).where(oidc_table.c.name == spec["name"]),
        )
        if existing is not None:
            continue
        # client_secret is required by schema; for the seed we store a stable
        # pseudo-encrypted placeholder (seed runs never invoke OIDC flow).
        placeholder = "sealed:feature-tour-placeholder"
        _insert_returning_id(
            conn,
            oidc_table,
            {
                "name": spec["name"],
                "issuer_url": spec["issuer_url"],
                "client_id": spec["client_id"],
                "client_secret_encrypted": placeholder,
                "scopes": '["openid", "profile", "email"]',
                "role_mapping": '{"engineer": "engineer.aero", "admin": "admin"}',
                "auto_provision": True,
                "default_role": "operator",
                "claim_mapping": "{}",
                "allowed_redirect_uris": '["https://cassini.example-corp.invalid/auth/callback"]',
                "sso_only": False,
                "is_active": spec["is_active"],
                "created_at": now,
                "updated_at": now,
            },
        )

    # Push subscriptions
    push_specs = [
        ("violation_subscription_engineer", eng_id),
        ("fai_status_subscription_admin", admin_id),
    ]
    for endpoint_seed, uid in push_specs:
        if uid is None:
            continue
        endpoint = f"https://push.example-vendor.invalid/{endpoint_seed}"
        existing = _scalar_or_none(
            conn,
            select(push_table.c.id).where(push_table.c.endpoint == endpoint),
        )
        if existing is not None:
            continue
        _insert_returning_id(
            conn,
            push_table,
            {
                "user_id": uid,
                "endpoint": endpoint,
                "p256dh_key": secrets.token_urlsafe(64),
                "auth_key": secrets.token_urlsafe(16),
                "created_at": now,
            },
        )

    # SMTP (singleton)
    smtp_existing = _scalar_or_none(conn, select(smtp_table.c.id).limit(1))
    if smtp_existing is None:
        _insert_returning_id(
            conn,
            smtp_table,
            {
                "server": "smtp.example-corp.invalid",
                "port": 587,
                "username": "cassini-notifications",
                "password": None,
                "use_tls": True,
                "from_address": "cassini@example-corp.invalid",
                "is_active": True,
            },
        )

    # Webhook for violation events
    wh_existing = _scalar_or_none(
        conn,
        select(webhook_table.c.id).where(webhook_table.c.name == "Feature Tour Violations Hook"),
    )
    if wh_existing is None:
        _insert_returning_id(
            conn,
            webhook_table,
            {
                "name": "Feature Tour Violations Hook",
                "url": "https://hooks.example-corp.invalid/cassini/violations",
                "secret": secrets.token_hex(16),
                "is_active": True,
                "retry_count": 3,
                "events_filter": json.dumps(["violation.created", "violation.acknowledged"]),
            },
        )
    return out


# ── Top-level driver ─────────────────────────────────────────────────────


def seed_feature_tour(conn: Connection) -> dict[str, Any]:
    """Run every section in spec order and return a manifest.

    The caller (``seed_e2e_unified.seed``) opens the connection inside an
    ``engine.begin()`` block, so all inserts share a single transaction.
    """
    rng = random.Random(2026)  # deterministic RNG for repeatable seeds
    manifest: dict[str, Any] = {"profile": "feature-tour"}

    print("[feature-tour] 1. Plants")
    plant_ids = seed_plants(conn)
    manifest["plants"] = plant_ids

    print("[feature-tour] 2. Users")
    user_ids = seed_users(conn, plant_ids)
    manifest["users"] = user_ids

    print("[feature-tour] 3. Hierarchies + characteristics")
    char_ids_tuple = seed_hierarchies_and_chars(conn, plant_ids)
    # Stringify for JSON
    manifest["characteristics"] = {
        f"{plant_code}::{path}::{name}": cid
        for (plant_code, path, name), cid in char_ids_tuple.items()
    }

    print("[feature-tour] 4. Sample histories (90-day, 3-phase)")
    histories = seed_sample_histories(conn, char_ids_tuple, rng)
    manifest["sample_count"] = sum(len(h["samples"]) for h in histories.values())

    print("[feature-tour] 5. Violations")
    violations = seed_violations(conn, char_ids_tuple, histories, user_ids)
    manifest["violations_seeded"] = len(violations)

    print("[feature-tour] 6. Annotations")
    ann_count = seed_annotations(conn, char_ids_tuple, histories)
    manifest["annotations_seeded"] = ann_count

    print("[feature-tour] 7. Capability snapshots")
    snap_count = seed_capability_snapshots(conn, char_ids_tuple)
    manifest["capability_snapshots_seeded"] = snap_count

    print("[feature-tour] 8. MSA studies")
    msa_studies = seed_msa_studies(conn, plant_ids, user_ids, char_ids_tuple, rng)
    manifest["msa_studies"] = msa_studies

    print("[feature-tour] 9. DOE studies")
    doe_studies = seed_doe_studies(conn, plant_ids, user_ids, rng)
    manifest["doe_studies"] = doe_studies

    print("[feature-tour] 10. FAI reports")
    fai_reports = seed_fai_reports(conn, plant_ids, user_ids)
    manifest["fai_reports"] = fai_reports

    print("[feature-tour] 11. Materials + collection plans")
    materials = seed_materials_and_plans(conn, plant_ids, char_ids_tuple, user_ids)
    manifest["materials"] = materials

    print("[feature-tour] 12. Connectivity")
    connectivity = seed_connectivity(conn, plant_ids, char_ids_tuple, user_ids)
    manifest["connectivity"] = connectivity

    print("[feature-tour] 13. Audit log")
    audit_count = seed_audit_log(
        conn, plant_ids, user_ids, char_ids_tuple, fai_reports, msa_studies
    )
    manifest["audit_log_seeded"] = audit_count

    print("[feature-tour] 14. Electronic signatures")
    signatures = seed_signatures(conn, plant_ids, user_ids, fai_reports)
    manifest["signatures"] = signatures

    print("[feature-tour] 15. Retention policies + purge run")
    retention = seed_retention(conn, plant_ids)
    manifest["retention"] = retention

    print("[feature-tour] 16. Analytics (multivariate, predictions, AI, correlation, anomaly)")
    analytics = seed_analytics(conn, plant_ids, char_ids_tuple, histories, rng)
    manifest["analytics"] = analytics

    print("[feature-tour] 17a. CEP rules")
    cep_rules = seed_cep_rules(conn, plant_ids)
    manifest["cep_rules"] = cep_rules

    print("[feature-tour] 17b. SOP-RAG corpus")
    sop = seed_sop_rag(conn, plant_ids, user_ids)
    manifest["sop_rag"] = sop

    print("[feature-tour] 18. Reports (schedule + runs)")
    reports = seed_reports(conn, plant_ids, user_ids)
    manifest["reports"] = reports

    print("[feature-tour] 19. API/integration surface")
    api_int = seed_api_integrations(conn, plant_ids, user_ids)
    manifest["api_integrations"] = api_int

    return manifest
