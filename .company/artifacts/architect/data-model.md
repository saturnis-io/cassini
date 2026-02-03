# OpenSPC Data Model

## Document Information
- **Project:** OpenSPC - Event-Driven Statistical Process Control System
- **Author:** Solutions Architect, Virtual Engineering Co.
- **Date:** 2026-02-02
- **Database:** SQLite 3.40+ with WAL mode
- **ORM:** SQLAlchemy 2.0+

---

## 1. Complete Database Schema (DDL)

### 1.1 Core Tables

```sql
-- ============================================================================
-- OpenSPC Database Schema
-- SQLite 3.40+ Compatible with WAL Mode
-- ============================================================================

-- Enable WAL mode for concurrent reads during writes
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

-- ============================================================================
-- 1. ISA-95 HIERARCHY
-- Implements adjacency list with materialized path for efficient queries
-- ============================================================================
CREATE TABLE hierarchy (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id INTEGER,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('Site', 'Area', 'Line', 'Cell', 'Unit')),

    -- Materialized path for efficient subtree queries
    -- Format: "/1/2/5/" where numbers are ancestor IDs
    path TEXT NOT NULL DEFAULT '/',
    depth INTEGER NOT NULL DEFAULT 0,

    -- Metadata
    description TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (parent_id) REFERENCES hierarchy(id) ON DELETE RESTRICT,

    -- Constraints
    CONSTRAINT valid_depth CHECK (depth >= 0 AND depth <= 5),
    CONSTRAINT valid_path CHECK (path LIKE '/%/' OR path = '/')
);

-- Indexes for hierarchy queries
CREATE INDEX idx_hierarchy_parent ON hierarchy(parent_id);
CREATE INDEX idx_hierarchy_path ON hierarchy(path);
CREATE INDEX idx_hierarchy_type ON hierarchy(type);
CREATE UNIQUE INDEX idx_hierarchy_name_parent ON hierarchy(parent_id, name);


-- ============================================================================
-- 2. CHARACTERISTIC DEFINITION
-- The SPC configuration for a measurement point
-- ============================================================================
CREATE TABLE characteristic (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hierarchy_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,

    -- SPC Parameters
    subgroup_size INTEGER NOT NULL DEFAULT 1 CHECK (subgroup_size >= 1 AND subgroup_size <= 25),
    target_value REAL,

    -- Specification Limits (Voice of Customer)
    usl REAL,  -- Upper Spec Limit
    lsl REAL,  -- Lower Spec Limit

    -- Control Limits (Voice of Process) - NULL if auto-calculated
    ucl REAL,  -- Upper Control Limit
    lcl REAL,  -- Lower Control Limit
    center_line REAL,  -- Process center (X-bar)
    sigma REAL,  -- Process sigma estimate

    -- Control limit calculation metadata
    limit_calc_method TEXT CHECK (limit_calc_method IN ('R_BAR_D2', 'S_C4', 'MOVING_RANGE', 'MANUAL')),
    limit_calc_samples INTEGER,  -- Number of samples used in calculation
    limit_calc_at DATETIME,  -- When limits were last calculated

    -- Data Provider Configuration
    provider_type TEXT NOT NULL CHECK (provider_type IN ('MANUAL', 'TAG')),

    -- TAG Provider specific config (NULL if MANUAL)
    mqtt_topic TEXT,
    trigger_tag TEXT,
    trigger_strategy TEXT CHECK (trigger_strategy IN ('ON_CHANGE', 'ON_TRIGGER', 'ON_TIMER')),
    buffer_timeout_seconds REAL DEFAULT 60.0,

    -- Status
    is_active BOOLEAN NOT NULL DEFAULT 1,

    -- Metadata
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (hierarchy_id) REFERENCES hierarchy(id) ON DELETE RESTRICT,

    -- Constraints
    CONSTRAINT valid_spec_limits CHECK (usl IS NULL OR lsl IS NULL OR usl > lsl),
    CONSTRAINT valid_control_limits CHECK (ucl IS NULL OR lcl IS NULL OR ucl > lcl),
    CONSTRAINT tag_requires_topic CHECK (provider_type != 'TAG' OR mqtt_topic IS NOT NULL)
);

-- Indexes for characteristic queries
CREATE INDEX idx_characteristic_hierarchy ON characteristic(hierarchy_id);
CREATE INDEX idx_characteristic_provider ON characteristic(provider_type);
CREATE INDEX idx_characteristic_active ON characteristic(is_active);
CREATE INDEX idx_characteristic_topic ON characteristic(mqtt_topic) WHERE mqtt_topic IS NOT NULL;
CREATE UNIQUE INDEX idx_characteristic_name_hierarchy ON characteristic(hierarchy_id, name);


-- ============================================================================
-- 3. NELSON RULES CONFIGURATION
-- Which rules are enabled per characteristic
-- ============================================================================
CREATE TABLE characteristic_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    char_id INTEGER NOT NULL,
    rule_id INTEGER NOT NULL CHECK (rule_id >= 1 AND rule_id <= 8),
    is_enabled BOOLEAN NOT NULL DEFAULT 1,

    FOREIGN KEY (char_id) REFERENCES characteristic(id) ON DELETE CASCADE,
    UNIQUE (char_id, rule_id)
);

-- Index for rule lookup
CREATE INDEX idx_char_rules_char ON characteristic_rules(char_id);


-- ============================================================================
-- 4. SAMPLE (Measurement Event)
-- A distinct sampling event containing 1+ measurements
-- ============================================================================
CREATE TABLE sample (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    char_id INTEGER NOT NULL,
    timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Context information
    batch_number TEXT,
    operator_id TEXT,
    comment TEXT,
    source TEXT NOT NULL CHECK (source IN ('MANUAL', 'TAG')) DEFAULT 'MANUAL',

    -- Calculated values (denormalized for performance)
    mean REAL NOT NULL,  -- Subgroup mean (X-bar)
    range_value REAL,  -- Subgroup range (R) - NULL for n=1
    std_dev REAL,  -- Subgroup std dev (S) - NULL for n=1

    -- Control status
    in_control BOOLEAN NOT NULL DEFAULT 1,
    is_excluded BOOLEAN NOT NULL DEFAULT 0,
    exclude_reason TEXT,

    -- Metadata
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (char_id) REFERENCES characteristic(id) ON DELETE RESTRICT
);

-- Indexes for sample queries
CREATE INDEX idx_sample_char ON sample(char_id);
CREATE INDEX idx_sample_timestamp ON sample(timestamp);
CREATE INDEX idx_sample_char_timestamp ON sample(char_id, timestamp DESC);
CREATE INDEX idx_sample_in_control ON sample(in_control) WHERE in_control = 0;
CREATE INDEX idx_sample_excluded ON sample(is_excluded) WHERE is_excluded = 1;

-- Rolling window query optimization
CREATE INDEX idx_sample_rolling_window ON sample(char_id, is_excluded, timestamp DESC);


-- ============================================================================
-- 5. MEASUREMENT (Individual Values)
-- Individual readings within a sample (for subgroup_size > 1)
-- ============================================================================
CREATE TABLE measurement (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sample_id INTEGER NOT NULL,
    sequence INTEGER NOT NULL DEFAULT 0,  -- Order within subgroup
    value REAL NOT NULL,

    -- Metadata (optional per-measurement context)
    metadata_json TEXT,  -- JSON blob for additional context

    FOREIGN KEY (sample_id) REFERENCES sample(id) ON DELETE CASCADE,
    UNIQUE (sample_id, sequence)
);

-- Index for measurement retrieval
CREATE INDEX idx_measurement_sample ON measurement(sample_id);


-- ============================================================================
-- 6. VIOLATION (Nelson Rule Breaches)
-- Records of rule violations linked to samples
-- ============================================================================
CREATE TABLE violation (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sample_id INTEGER NOT NULL,
    rule_id INTEGER NOT NULL CHECK (rule_id >= 1 AND rule_id <= 8),
    rule_name TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('WARNING', 'CRITICAL')),

    -- Rule-specific details (JSON for flexibility)
    details_json TEXT,  -- e.g., {"involved_sample_ids": [1,2,3], "direction": "up"}

    -- Workflow state
    acknowledged BOOLEAN NOT NULL DEFAULT 0,
    ack_user TEXT,
    ack_reason TEXT,
    ack_timestamp DATETIME,

    -- Metadata
    detected_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (sample_id) REFERENCES sample(id) ON DELETE CASCADE
);

-- Indexes for violation queries
CREATE INDEX idx_violation_sample ON violation(sample_id);
CREATE INDEX idx_violation_acknowledged ON violation(acknowledged);
CREATE INDEX idx_violation_severity ON violation(severity);
CREATE INDEX idx_violation_rule ON violation(rule_id);
CREATE INDEX idx_violation_detected ON violation(detected_at DESC);

-- Unacknowledged violations query optimization
CREATE INDEX idx_violation_unack ON violation(acknowledged, severity, detected_at DESC)
    WHERE acknowledged = 0;


-- ============================================================================
-- 7. AUDIT LOG (Optional - for compliance)
-- Track important system events
-- ============================================================================
CREATE TABLE audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL,  -- 'sample', 'violation', 'characteristic', etc.
    entity_id INTEGER NOT NULL,
    action TEXT NOT NULL,  -- 'create', 'update', 'delete', 'acknowledge'
    user_id TEXT,
    changes_json TEXT,  -- JSON diff of changes
    timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_timestamp ON audit_log(timestamp DESC);


-- ============================================================================
-- 8. REASON CODES (Acknowledgment Standardization)
-- Pre-defined reasons for violation acknowledgment
-- ============================================================================
CREATE TABLE reason_code (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL,
    category TEXT,  -- 'EQUIPMENT', 'MATERIAL', 'OPERATOR', 'ENVIRONMENT', 'FALSE_ALARM'
    is_active BOOLEAN NOT NULL DEFAULT 1,
    display_order INTEGER NOT NULL DEFAULT 0
);

-- Seed standard reason codes
INSERT INTO reason_code (code, description, category, display_order) VALUES
    ('TOOL_CHANGE', 'Tool change or adjustment', 'EQUIPMENT', 1),
    ('RAW_MATERIAL', 'Raw material variation', 'MATERIAL', 2),
    ('CALIBRATION', 'Measurement calibration issue', 'EQUIPMENT', 3),
    ('OPERATOR_ERROR', 'Operator entry error', 'OPERATOR', 4),
    ('TEMP_VARIATION', 'Temperature/environment change', 'ENVIRONMENT', 5),
    ('STARTUP', 'Process startup - expected variation', 'PROCESS', 6),
    ('KNOWN_ISSUE', 'Known issue - under investigation', 'OTHER', 7),
    ('FALSE_ALARM', 'False alarm - no action needed', 'FALSE_ALARM', 8);


-- ============================================================================
-- 9. TRIGGERS FOR UPDATED_AT
-- ============================================================================
CREATE TRIGGER trg_hierarchy_updated
    AFTER UPDATE ON hierarchy
    FOR EACH ROW
BEGIN
    UPDATE hierarchy SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER trg_characteristic_updated
    AFTER UPDATE ON characteristic
    FOR EACH ROW
BEGIN
    UPDATE characteristic SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;


-- ============================================================================
-- 10. VIEWS FOR COMMON QUERIES
-- ============================================================================

-- Characteristic summary with violation counts
CREATE VIEW v_characteristic_summary AS
SELECT
    c.id,
    c.name,
    c.hierarchy_id,
    h.name as hierarchy_name,
    h.path as hierarchy_path,
    c.provider_type,
    c.subgroup_size,
    c.ucl,
    c.lcl,
    c.center_line,
    c.is_active,
    (SELECT COUNT(*) FROM sample s WHERE s.char_id = c.id) as sample_count,
    (SELECT MAX(timestamp) FROM sample s WHERE s.char_id = c.id) as last_sample_at,
    (SELECT in_control FROM sample s WHERE s.char_id = c.id ORDER BY timestamp DESC LIMIT 1) as in_control,
    (SELECT COUNT(*) FROM violation v
        JOIN sample s ON v.sample_id = s.id
        WHERE s.char_id = c.id AND v.acknowledged = 0) as unacknowledged_violations
FROM characteristic c
JOIN hierarchy h ON c.hierarchy_id = h.id;

-- Active violations with characteristic info
CREATE VIEW v_active_violations AS
SELECT
    v.id as violation_id,
    v.sample_id,
    v.rule_id,
    v.rule_name,
    v.severity,
    v.detected_at,
    s.char_id as characteristic_id,
    c.name as characteristic_name,
    h.name as hierarchy_name,
    s.timestamp as sample_timestamp,
    s.mean as sample_mean,
    s.batch_number,
    s.operator_id
FROM violation v
JOIN sample s ON v.sample_id = s.id
JOIN characteristic c ON s.char_id = c.id
JOIN hierarchy h ON c.hierarchy_id = h.id
WHERE v.acknowledged = 0
ORDER BY v.severity DESC, v.detected_at DESC;
```

---

## 2. SQLAlchemy ORM Model Definitions

### 2.1 Base Model Configuration

```python
# src/openspc/db/models/base.py

from datetime import datetime
from typing import Any
from sqlalchemy import MetaData
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

# Naming convention for constraints (Alembic compatibility)
convention = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s"
}

metadata = MetaData(naming_convention=convention)


class Base(DeclarativeBase):
    """Base class for all ORM models"""
    metadata = metadata

    # Common columns
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    def to_dict(self) -> dict[str, Any]:
        """Convert model to dictionary"""
        return {c.name: getattr(self, c.name) for c in self.__table__.columns}
```

### 2.2 Hierarchy Model

```python
# src/openspc/db/models/hierarchy.py

from datetime import datetime
from typing import TYPE_CHECKING, Optional
from sqlalchemy import String, Integer, ForeignKey, DateTime, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from openspc.db.models.base import Base

if TYPE_CHECKING:
    from openspc.db.models.characteristic import Characteristic


class Hierarchy(Base):
    """ISA-95 Hierarchy Node"""
    __tablename__ = "hierarchy"

    # Columns
    parent_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("hierarchy.id", ondelete="RESTRICT"),
        nullable=True
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    type: Mapped[str] = mapped_column(String(20), nullable=False)
    path: Mapped[str] = mapped_column(String(255), nullable=False, default="/")
    depth: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relationships
    parent: Mapped[Optional["Hierarchy"]] = relationship(
        "Hierarchy",
        remote_side="Hierarchy.id",
        back_populates="children"
    )
    children: Mapped[list["Hierarchy"]] = relationship(
        "Hierarchy",
        back_populates="parent",
        cascade="all, delete-orphan"
    )
    characteristics: Mapped[list["Characteristic"]] = relationship(
        "Characteristic",
        back_populates="hierarchy",
        cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Hierarchy(id={self.id}, name='{self.name}', type='{self.type}')>"
```

### 2.3 Characteristic Model

```python
# src/openspc/db/models/characteristic.py

from datetime import datetime
from typing import TYPE_CHECKING, Optional
from sqlalchemy import String, Integer, Float, Boolean, ForeignKey, DateTime, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from openspc.db.models.base import Base

if TYPE_CHECKING:
    from openspc.db.models.hierarchy import Hierarchy
    from openspc.db.models.sample import Sample


class Characteristic(Base):
    """SPC Characteristic Definition"""
    __tablename__ = "characteristic"

    # Core fields
    hierarchy_id: Mapped[int] = mapped_column(
        ForeignKey("hierarchy.id", ondelete="RESTRICT"),
        nullable=False
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # SPC Parameters
    subgroup_size: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    target_value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Specification Limits
    usl: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    lsl: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Control Limits
    ucl: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    lcl: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    center_line: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    sigma: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Limit calculation metadata
    limit_calc_method: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    limit_calc_samples: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    limit_calc_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Provider Configuration
    provider_type: Mapped[str] = mapped_column(String(10), nullable=False, default="MANUAL")
    mqtt_topic: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    trigger_tag: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    trigger_strategy: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    buffer_timeout_seconds: Mapped[float] = mapped_column(Float, nullable=False, default=60.0)

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # Metadata
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relationships
    hierarchy: Mapped["Hierarchy"] = relationship(
        "Hierarchy", back_populates="characteristics"
    )
    rules: Mapped[list["CharacteristicRule"]] = relationship(
        "CharacteristicRule",
        back_populates="characteristic",
        cascade="all, delete-orphan"
    )
    samples: Mapped[list["Sample"]] = relationship(
        "Sample",
        back_populates="characteristic",
        cascade="all, delete-orphan"
    )

    @property
    def enabled_rule_ids(self) -> list[int]:
        """Get list of enabled Nelson rule IDs"""
        return [r.rule_id for r in self.rules if r.is_enabled]

    def __repr__(self) -> str:
        return f"<Characteristic(id={self.id}, name='{self.name}')>"


class CharacteristicRule(Base):
    """Nelson Rule Enable/Disable per Characteristic"""
    __tablename__ = "characteristic_rules"

    char_id: Mapped[int] = mapped_column(
        ForeignKey("characteristic.id", ondelete="CASCADE"),
        nullable=False
    )
    rule_id: Mapped[int] = mapped_column(Integer, nullable=False)
    is_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # Relationship
    characteristic: Mapped["Characteristic"] = relationship(
        "Characteristic", back_populates="rules"
    )

    def __repr__(self) -> str:
        return f"<CharacteristicRule(char_id={self.char_id}, rule_id={self.rule_id})>"
```

### 2.4 Sample and Measurement Models

```python
# src/openspc/db/models/sample.py

from datetime import datetime
from typing import TYPE_CHECKING, Optional
from sqlalchemy import String, Integer, Float, Boolean, ForeignKey, DateTime, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from openspc.db.models.base import Base

if TYPE_CHECKING:
    from openspc.db.models.characteristic import Characteristic
    from openspc.db.models.violation import Violation


class Sample(Base):
    """Measurement Sample Event"""
    __tablename__ = "sample"

    # Core fields
    char_id: Mapped[int] = mapped_column(
        ForeignKey("characteristic.id", ondelete="RESTRICT"),
        nullable=False
    )
    timestamp: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )

    # Context
    batch_number: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    operator_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    comment: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    source: Mapped[str] = mapped_column(String(10), nullable=False, default="MANUAL")

    # Calculated values (denormalized)
    mean: Mapped[float] = mapped_column(Float, nullable=False)
    range_value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    std_dev: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Control status
    in_control: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_excluded: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    exclude_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Metadata
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )

    # Relationships
    characteristic: Mapped["Characteristic"] = relationship(
        "Characteristic", back_populates="samples"
    )
    measurements: Mapped[list["Measurement"]] = relationship(
        "Measurement",
        back_populates="sample",
        cascade="all, delete-orphan",
        order_by="Measurement.sequence"
    )
    violations: Mapped[list["Violation"]] = relationship(
        "Violation",
        back_populates="sample",
        cascade="all, delete-orphan"
    )

    @property
    def values(self) -> list[float]:
        """Get measurement values in order"""
        return [m.value for m in self.measurements]

    def __repr__(self) -> str:
        return f"<Sample(id={self.id}, char_id={self.char_id}, mean={self.mean})>"


class Measurement(Base):
    """Individual Measurement Value within a Sample"""
    __tablename__ = "measurement"

    sample_id: Mapped[int] = mapped_column(
        ForeignKey("sample.id", ondelete="CASCADE"),
        nullable=False
    )
    sequence: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    value: Mapped[float] = mapped_column(Float, nullable=False)
    metadata_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationship
    sample: Mapped["Sample"] = relationship("Sample", back_populates="measurements")

    def __repr__(self) -> str:
        return f"<Measurement(id={self.id}, value={self.value})>"
```

### 2.5 Violation Model

```python
# src/openspc/db/models/violation.py

from datetime import datetime
from typing import TYPE_CHECKING, Optional
from sqlalchemy import String, Integer, Boolean, ForeignKey, DateTime, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from openspc.db.models.base import Base

if TYPE_CHECKING:
    from openspc.db.models.sample import Sample


class Violation(Base):
    """Nelson Rule Violation Record"""
    __tablename__ = "violation"

    # Core fields
    sample_id: Mapped[int] = mapped_column(
        ForeignKey("sample.id", ondelete="CASCADE"),
        nullable=False
    )
    rule_id: Mapped[int] = mapped_column(Integer, nullable=False)
    rule_name: Mapped[str] = mapped_column(String(50), nullable=False)
    severity: Mapped[str] = mapped_column(String(10), nullable=False)

    # Details (JSON for flexibility)
    details_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Workflow
    acknowledged: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    ack_user: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    ack_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ack_timestamp: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Metadata
    detected_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )

    # Relationship
    sample: Mapped["Sample"] = relationship("Sample", back_populates="violations")

    def __repr__(self) -> str:
        return f"<Violation(id={self.id}, rule={self.rule_name}, severity={self.severity})>"
```

---

## 3. Alembic Migration Strategy

### 3.1 Directory Structure

```
alembic/
├── alembic.ini
├── env.py
├── script.py.mako
└── versions/
    ├── 001_initial_schema.py
    ├── 002_add_reason_codes.py
    └── 003_add_audit_log.py
```

### 3.2 Migration Configuration

```python
# alembic/env.py

import asyncio
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context

from openspc.db.models.base import Base
from openspc.db.models import hierarchy, characteristic, sample, violation
from openspc.config import settings

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

config.set_main_option("sqlalchemy.url", settings.database_url)


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True,  # Required for SQLite ALTER TABLE
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        render_as_batch=True,  # Required for SQLite
    )

    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Run migrations in 'online' mode."""
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
```

### 3.3 Example Migration

```python
# alembic/versions/001_initial_schema.py

"""Initial schema

Revision ID: 001
Revises:
Create Date: 2026-02-02 12:00:00.000000
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Hierarchy table
    op.create_table(
        'hierarchy',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('parent_id', sa.Integer(), nullable=True),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('type', sa.String(20), nullable=False),
        sa.Column('path', sa.String(255), nullable=False, server_default='/'),
        sa.Column('depth', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['parent_id'], ['hierarchy.id'], ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_hierarchy_parent', 'hierarchy', ['parent_id'])
    op.create_index('idx_hierarchy_path', 'hierarchy', ['path'])
    op.create_index('idx_hierarchy_type', 'hierarchy', ['type'])

    # Characteristic table
    op.create_table(
        'characteristic',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('hierarchy_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('subgroup_size', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('target_value', sa.Float(), nullable=True),
        sa.Column('usl', sa.Float(), nullable=True),
        sa.Column('lsl', sa.Float(), nullable=True),
        sa.Column('ucl', sa.Float(), nullable=True),
        sa.Column('lcl', sa.Float(), nullable=True),
        sa.Column('center_line', sa.Float(), nullable=True),
        sa.Column('sigma', sa.Float(), nullable=True),
        sa.Column('limit_calc_method', sa.String(20), nullable=True),
        sa.Column('limit_calc_samples', sa.Integer(), nullable=True),
        sa.Column('limit_calc_at', sa.DateTime(), nullable=True),
        sa.Column('provider_type', sa.String(10), nullable=False, server_default='MANUAL'),
        sa.Column('mqtt_topic', sa.String(255), nullable=True),
        sa.Column('trigger_tag', sa.String(255), nullable=True),
        sa.Column('trigger_strategy', sa.String(20), nullable=True),
        sa.Column('buffer_timeout_seconds', sa.Float(), nullable=False, server_default='60.0'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='1'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['hierarchy_id'], ['hierarchy.id'], ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_characteristic_hierarchy', 'characteristic', ['hierarchy_id'])
    op.create_index('idx_characteristic_provider', 'characteristic', ['provider_type'])

    # Additional tables...


def downgrade() -> None:
    op.drop_table('characteristic')
    op.drop_table('hierarchy')
```

---

## 4. Query Patterns

### 4.1 Rolling Window Query

```python
async def get_rolling_window(
    session: AsyncSession,
    char_id: int,
    window_size: int = 25,
    exclude_excluded: bool = True
) -> list[Sample]:
    """
    Efficiently retrieve samples for rolling window.
    Uses compound index on (char_id, is_excluded, timestamp DESC)
    """
    stmt = (
        select(Sample)
        .options(
            selectinload(Sample.measurements),
            selectinload(Sample.violations)
        )
        .where(Sample.char_id == char_id)
    )

    if exclude_excluded:
        stmt = stmt.where(Sample.is_excluded == False)

    stmt = (
        stmt
        .order_by(Sample.timestamp.desc())
        .limit(window_size)
    )

    result = await session.execute(stmt)
    samples = list(result.scalars().all())

    # Return in chronological order
    return list(reversed(samples))
```

### 4.2 Violation History Query

```python
async def get_violation_history(
    session: AsyncSession,
    char_id: int | None = None,
    acknowledged: bool | None = None,
    severity: str | None = None,
    from_date: datetime | None = None,
    to_date: datetime | None = None,
    limit: int = 100,
    offset: int = 0
) -> tuple[list[Violation], int]:
    """
    Retrieve violations with flexible filtering.
    Returns (violations, total_count) for pagination.
    """
    # Base query
    stmt = (
        select(Violation)
        .join(Sample)
        .options(selectinload(Violation.sample))
    )

    # Apply filters
    conditions = []

    if char_id is not None:
        conditions.append(Sample.char_id == char_id)

    if acknowledged is not None:
        conditions.append(Violation.acknowledged == acknowledged)

    if severity is not None:
        conditions.append(Violation.severity == severity)

    if from_date is not None:
        conditions.append(Violation.detected_at >= from_date)

    if to_date is not None:
        conditions.append(Violation.detected_at <= to_date)

    if conditions:
        stmt = stmt.where(and_(*conditions))

    # Count total
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = await session.scalar(count_stmt) or 0

    # Apply pagination and ordering
    stmt = (
        stmt
        .order_by(Violation.detected_at.desc())
        .offset(offset)
        .limit(limit)
    )

    result = await session.execute(stmt)
    violations = list(result.scalars().all())

    return violations, total
```

### 4.3 Characteristic Summary with Aggregates

```python
async def get_characteristic_summaries(
    session: AsyncSession,
    hierarchy_id: int | None = None
) -> list[dict]:
    """
    Get characteristic summaries with computed aggregates.
    Uses window functions for efficiency.
    """
    # Subquery for latest sample
    latest_sample = (
        select(
            Sample.char_id,
            Sample.in_control,
            Sample.timestamp.label('last_sample_at'),
            func.row_number().over(
                partition_by=Sample.char_id,
                order_by=Sample.timestamp.desc()
            ).label('rn')
        )
        .subquery()
    )

    # Subquery for violation count
    violation_count = (
        select(
            Sample.char_id,
            func.count(Violation.id).label('unack_violations')
        )
        .join(Violation, Sample.id == Violation.sample_id)
        .where(Violation.acknowledged == False)
        .group_by(Sample.char_id)
        .subquery()
    )

    # Main query
    stmt = (
        select(
            Characteristic,
            Hierarchy.name.label('hierarchy_name'),
            Hierarchy.path.label('hierarchy_path'),
            latest_sample.c.in_control,
            latest_sample.c.last_sample_at,
            func.coalesce(violation_count.c.unack_violations, 0).label('unack_violations')
        )
        .join(Hierarchy, Characteristic.hierarchy_id == Hierarchy.id)
        .outerjoin(
            latest_sample,
            and_(
                Characteristic.id == latest_sample.c.char_id,
                latest_sample.c.rn == 1
            )
        )
        .outerjoin(
            violation_count,
            Characteristic.id == violation_count.c.char_id
        )
    )

    if hierarchy_id is not None:
        # Get hierarchy node to find descendants
        hierarchy = await session.get(Hierarchy, hierarchy_id)
        if hierarchy:
            stmt = stmt.where(Hierarchy.path.like(f"{hierarchy.path}%"))

    stmt = stmt.order_by(Hierarchy.path, Characteristic.name)

    result = await session.execute(stmt)
    return [
        {
            'characteristic': row[0],
            'hierarchy_name': row[1],
            'hierarchy_path': row[2],
            'in_control': row[3],
            'last_sample_at': row[4],
            'unacknowledged_violations': row[5]
        }
        for row in result.all()
    ]
```

### 4.4 Batch Sample Insert

```python
async def batch_insert_samples(
    session: AsyncSession,
    char_id: int,
    samples_data: list[dict]
) -> list[int]:
    """
    Efficiently insert multiple samples with measurements.
    Uses bulk insert for performance.
    """
    sample_ids = []

    # Insert samples in batches
    for sample_data in samples_data:
        sample = Sample(
            char_id=char_id,
            timestamp=sample_data['timestamp'],
            batch_number=sample_data.get('batch_number'),
            operator_id=sample_data.get('operator_id'),
            source=sample_data.get('source', 'MANUAL'),
            mean=sample_data['mean'],
            range_value=sample_data.get('range_value'),
            std_dev=sample_data.get('std_dev'),
            in_control=sample_data.get('in_control', True)
        )
        session.add(sample)
        await session.flush()

        # Add measurements
        for seq, value in enumerate(sample_data['measurements']):
            measurement = Measurement(
                sample_id=sample.id,
                sequence=seq,
                value=value
            )
            session.add(measurement)

        sample_ids.append(sample.id)

    await session.commit()
    return sample_ids
```

---

## 5. Database Maintenance

### 5.1 Index Recommendations

```sql
-- Analyze query patterns and add covering indexes as needed
ANALYZE;

-- Periodic maintenance
PRAGMA optimize;
VACUUM;
REINDEX;
```

### 5.2 Data Retention

```python
async def cleanup_old_samples(
    session: AsyncSession,
    char_id: int,
    retain_count: int = 1000,
    retain_days: int = 365
) -> int:
    """
    Remove old samples beyond retention limits.
    Keeps samples with violations or exclusions.
    """
    cutoff_date = datetime.utcnow() - timedelta(days=retain_days)

    # Find samples to delete
    subquery = (
        select(Sample.id)
        .where(Sample.char_id == char_id)
        .where(Sample.timestamp < cutoff_date)
        .where(Sample.in_control == True)  # Keep OOC samples
        .where(Sample.is_excluded == False)  # Keep excluded samples
        .order_by(Sample.timestamp.desc())
        .offset(retain_count)
    )

    stmt = delete(Sample).where(Sample.id.in_(subquery))
    result = await session.execute(stmt)
    await session.commit()

    return result.rowcount
```

---

*Data model specification complete. Ready for implementation.*
