# Material Management Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace freeform `product_code` with structured, hierarchical Material/MaterialClass entities with per-field cascading limit overrides per characteristic.

**Architecture:** Three new tables (material_class, material, material_limit_override) with materialized path for ancestor lookups. Single polymorphic override table keyed by material_id XOR class_id. Resolution walks the class tree per-field, deepest non-null wins. Clean break — drops product_limit table and product_code column entirely.

**Tech Stack:** SQLAlchemy async (backend), Alembic (migration), FastAPI (API), React 19 + TanStack Query (frontend), Zustand (state), Tailwind CSS v4 (styling)

**Design Doc:** `docs/plans/2026-03-06-material-management-design.md`

---

## Task 1: Database Migration

**Files:**
- Create: `backend/alembic/versions/20260306_material_management.py`

**Step 1: Generate migration shell**

```bash
cd backend && alembic revision -m "material management"
```

**Step 2: Write migration**

The migration must:
1. Create `material_class` table (id, plant_id FK, parent_id self-FK, name, code, path, depth, description, timestamps)
2. Create `material` table (id, plant_id FK, class_id FK nullable, name, code, description, properties JSON, timestamps)
3. Create `material_limit_override` table (id, characteristic_id FK cascade, material_id FK cascade nullable, class_id FK cascade nullable, ucl, lcl, stored_sigma, stored_center_line, target_value, usl, lsl, timestamps)
4. Add `material_id` FK column to `sample` (nullable, SET NULL on delete)
5. Drop `product_limit` table
6. Drop `product_code` column from `sample`

Constraints:
- `material_class`: UniqueConstraint(plant_id, code), Index(plant_id, parent_id)
- `material`: UniqueConstraint(plant_id, code), Index(plant_id, class_id)
- `material_limit_override`: CHECK(exactly one of material_id/class_id is non-null), UniqueConstraint(characteristic_id, material_id), UniqueConstraint(characteristic_id, class_id), Index(characteristic_id)

Use `batch_alter_table` for SQLite compatibility on sample column changes. Use naming convention dict for FK recreation.

**Step 3: Run migration**

```bash
cd backend && alembic upgrade head
```

Expected: Migration applies cleanly, no errors.

**Step 4: Commit**

```bash
git add backend/alembic/versions/20260306_material_management.py
git commit -m "feat: add material management migration (create 3 tables, alter sample, drop product_limit)"
```

---

## Task 2: Backend Models

**Files:**
- Create: `backend/src/cassini/db/models/material_class.py`
- Create: `backend/src/cassini/db/models/material.py`
- Create: `backend/src/cassini/db/models/material_limit_override.py`
- Modify: `backend/src/cassini/db/models/sample.py:62-63` — replace product_code with material_id
- Modify: `backend/src/cassini/db/models/__init__.py:44,89` — remove ProductLimit, add new models
- Delete: `backend/src/cassini/db/models/product_limit.py`

**Step 1: Create MaterialClass model**

File: `backend/src/cassini/db/models/material_class.py`

```python
"""MaterialClass model for hierarchical material grouping."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from cassini.db.models.hierarchy import Base

if TYPE_CHECKING:
    from cassini.db.models.plant import Plant


class MaterialClass(Base):
    """Hierarchical material class with materialized path.

    Supports arbitrary nesting (e.g., Raw Materials > Metals > Aluminum > 6000 Series).
    Path stores ancestor chain from root: "/1/5/12/" for efficient ancestor lookups.
    """

    __tablename__ = "material_class"
    __table_args__ = (
        UniqueConstraint("plant_id", "code", name="uq_material_class_plant_code"),
        Index("ix_material_class_plant_parent", "plant_id", "parent_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    plant_id: Mapped[int] = mapped_column(
        ForeignKey("plant.id", ondelete="CASCADE"), nullable=False
    )
    parent_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("material_class.id", ondelete="CASCADE"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    code: Mapped[str] = mapped_column(String(100), nullable=False)
    path: Mapped[str] = mapped_column(String(1000), nullable=False, default="/")
    depth: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    # Relationships
    plant: Mapped["Plant"] = relationship("Plant")
    parent: Mapped[Optional["MaterialClass"]] = relationship(
        "MaterialClass", remote_side="MaterialClass.id", back_populates="children"
    )
    children: Mapped[list["MaterialClass"]] = relationship(
        "MaterialClass", back_populates="parent", cascade="all, delete-orphan"
    )
    materials: Mapped[list["Material"]] = relationship(
        "Material", back_populates="material_class", cascade="all, delete-orphan"
    )

    def ancestor_ids(self) -> list[int]:
        """Parse path into ancestor IDs, deepest first."""
        parts = [int(p) for p in self.path.strip("/").split("/") if p]
        parts.reverse()
        return parts

    def __repr__(self) -> str:
        return f"<MaterialClass(id={self.id}, code='{self.code}', depth={self.depth})>"
```

**Step 2: Create Material model**

File: `backend/src/cassini/db/models/material.py`

```python
"""Material model for individual materials/products."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, Index, JSON, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from cassini.db.models.hierarchy import Base

if TYPE_CHECKING:
    from cassini.db.models.material_class import MaterialClass
    from cassini.db.models.plant import Plant


class Material(Base):
    """Individual material/product entity.

    Belongs to an optional MaterialClass for hierarchical grouping.
    Referenced by samples and material limit overrides.
    """

    __tablename__ = "material"
    __table_args__ = (
        UniqueConstraint("plant_id", "code", name="uq_material_plant_code"),
        Index("ix_material_plant_class", "plant_id", "class_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    plant_id: Mapped[int] = mapped_column(
        ForeignKey("plant.id", ondelete="CASCADE"), nullable=False
    )
    class_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("material_class.id", ondelete="SET NULL"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    code: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    properties: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    # Relationships
    plant: Mapped["Plant"] = relationship("Plant")
    material_class: Mapped[Optional["MaterialClass"]] = relationship(
        "MaterialClass", back_populates="materials"
    )

    def __repr__(self) -> str:
        return f"<Material(id={self.id}, code='{self.code}')>"
```

**Step 3: Create MaterialLimitOverride model**

File: `backend/src/cassini/db/models/material_limit_override.py`

```python
"""MaterialLimitOverride model for per-characteristic limit overrides."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import CheckConstraint, DateTime, Float, ForeignKey, Index, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from cassini.db.models.hierarchy import Base

if TYPE_CHECKING:
    from cassini.db.models.characteristic import Characteristic
    from cassini.db.models.material import Material
    from cassini.db.models.material_class import MaterialClass


class MaterialLimitOverride(Base):
    """Per-characteristic limit overrides for a material or material class.

    Exactly one of material_id or class_id must be set (polymorphic key).
    Non-null limit fields override the characteristic defaults; null fields
    inherit from the next level up in the cascade chain:
    material -> class -> parent class -> ... -> characteristic default.
    """

    __tablename__ = "material_limit_override"
    __table_args__ = (
        CheckConstraint(
            "(material_id IS NOT NULL AND class_id IS NULL) OR "
            "(material_id IS NULL AND class_id IS NOT NULL)",
            name="ck_material_limit_override_exactly_one",
        ),
        UniqueConstraint("characteristic_id", "material_id", name="uq_mlo_char_material"),
        UniqueConstraint("characteristic_id", "class_id", name="uq_mlo_char_class"),
        Index("ix_material_limit_override_char", "characteristic_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    characteristic_id: Mapped[int] = mapped_column(
        ForeignKey("characteristic.id", ondelete="CASCADE"), nullable=False
    )
    material_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("material.id", ondelete="CASCADE"), nullable=True
    )
    class_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("material_class.id", ondelete="CASCADE"), nullable=True
    )

    # Limit overrides (null = inherit from next level up)
    ucl: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    lcl: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    stored_sigma: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    stored_center_line: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    target_value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    usl: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    lsl: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    # Relationships
    characteristic: Mapped["Characteristic"] = relationship("Characteristic")
    material: Mapped[Optional["Material"]] = relationship("Material")
    material_class: Mapped[Optional["MaterialClass"]] = relationship("MaterialClass")

    @property
    def is_material_override(self) -> bool:
        return self.material_id is not None

    @property
    def is_class_override(self) -> bool:
        return self.class_id is not None

    def __repr__(self) -> str:
        target = f"material_id={self.material_id}" if self.is_material_override else f"class_id={self.class_id}"
        return f"<MaterialLimitOverride(id={self.id}, char_id={self.characteristic_id}, {target})>"
```

**Step 4: Modify Sample model**

In `backend/src/cassini/db/models/sample.py`:
- Line 62-63: Replace `product_code` with `material_id` FK
- Add `Material` to TYPE_CHECKING imports
- Add `material` relationship

**Step 5: Update models __init__.py**

In `backend/src/cassini/db/models/__init__.py`:
- Line 44: Delete `from cassini.db.models.product_limit import ProductLimit`
- Add imports for MaterialClass, Material, MaterialLimitOverride
- Line 89: Delete `"ProductLimit",` from __all__
- Add new model names to __all__

**Step 6: Delete product_limit.py**

Delete `backend/src/cassini/db/models/product_limit.py`

**Step 7: Verify**

```bash
cd backend && python -c "from cassini.db.models import MaterialClass, Material, MaterialLimitOverride, Sample; print('Models OK')"
```

**Step 8: Commit**

```bash
git add backend/src/cassini/db/models/
git commit -m "feat: add Material, MaterialClass, MaterialLimitOverride models; remove ProductLimit"
```

---

## Task 3: Backend Repositories

**Files:**
- Create: `backend/src/cassini/db/repositories/material_class.py`
- Create: `backend/src/cassini/db/repositories/material.py`
- Create: `backend/src/cassini/db/repositories/material_limit_override.py`
- Modify: `backend/src/cassini/db/repositories/sample.py` — replace product_code with material_id
- Delete: `backend/src/cassini/db/repositories/product_limit.py`

**Step 1: Create MaterialClassRepository**

Key methods:
- `list_by_plant(plant_id) -> list[MaterialClass]` — ordered by path for tree reconstruction
- `get_by_id(id) -> MaterialClass | None` — with eager-loaded parent
- `get_subtree(class_id) -> list[MaterialClass]` — all descendants via path LIKE
- `create(plant_id, name, code, parent_id?, description?) -> MaterialClass` — computes path/depth from parent
- `update(class_id, **fields) -> MaterialClass` — if parent_id changes, recompute path for self and all descendants
- `delete(class_id) -> bool` — fails if has children or materials (raise 400)
- `has_children_or_materials(class_id) -> bool` — guard for delete

Path computation on create:
```python
if parent_id:
    parent = await self.get_by_id(parent_id)
    path = parent.path + str(new_id) + "/"
    depth = parent.depth + 1
else:
    path = "/" + str(new_id) + "/"
    depth = 0
```

Path update on reparent: query all classes where `path LIKE old_path + '%'` and update their paths.

**Step 2: Create MaterialRepository**

Key methods:
- `list_by_plant(plant_id, class_id?, search?) -> list[Material]` — filterable, with eager-loaded class
- `get_by_id(id) -> Material | None` — with eager-loaded class
- `get_by_code(plant_id, code) -> Material | None`
- `create(plant_id, name, code, class_id?, description?, properties?) -> Material`
- `update(material_id, **fields) -> Material`
- `delete(material_id) -> bool` — fails if samples reference it
- `has_samples(material_id) -> bool` — guard for delete

**Step 3: Create MaterialLimitOverrideRepository**

Key methods:
- `list_by_characteristic(char_id) -> list[MaterialLimitOverride]` — with eager-loaded material and class
- `get_overrides_for_resolution(char_id, material_id, ancestor_class_ids: list[int]) -> list[MaterialLimitOverride]` — fetches all relevant overrides in one query for cascade resolution
- `create(char_id, material_id?, class_id?, **limit_fields) -> MaterialLimitOverride`
- `update(override_id, **limit_fields) -> MaterialLimitOverride`
- `delete(override_id) -> bool`

The resolution query:
```python
stmt = select(MaterialLimitOverride).where(
    MaterialLimitOverride.characteristic_id == char_id,
    or_(
        MaterialLimitOverride.material_id == material_id,
        MaterialLimitOverride.class_id.in_(ancestor_class_ids),
    ),
)
```

**Step 4: Modify SampleRepository**

In `backend/src/cassini/db/repositories/sample.py`:
- Replace all `product_code` parameter/filter occurrences with `material_id`
- Update `get_rolling_window()` and `get_by_characteristic()` to filter by `Sample.material_id`

**Step 5: Delete product_limit.py repository**

Delete `backend/src/cassini/db/repositories/product_limit.py`

**Step 6: Commit**

```bash
git add backend/src/cassini/db/repositories/
git commit -m "feat: add material repositories; remove ProductLimitRepository"
```

---

## Task 4: Resolution Service

**Files:**
- Create: `backend/src/cassini/core/material_resolver.py`

**Step 1: Create MaterialResolver**

This is the core cascade resolution logic. Stateless service that takes a session and resolves effective limits.

```python
"""Material limit cascade resolution service."""

from dataclasses import dataclass
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from cassini.db.models.material import Material
from cassini.db.models.material_class import MaterialClass
from cassini.db.models.material_limit_override import MaterialLimitOverride
from cassini.db.repositories.material_limit_override import MaterialLimitOverrideRepository


OVERRIDE_FIELDS = ("ucl", "lcl", "stored_sigma", "stored_center_line", "target_value", "usl", "lsl")


@dataclass
class ResolvedField:
    """A single resolved limit field with provenance."""
    value: float | None
    source_type: str  # "material", "class", "characteristic"
    source_name: str  # e.g., "6061-T6", "Aluminum", "Bore Diameter"
    source_id: int | None


@dataclass
class EffectiveLimits:
    """Fully resolved limits with provenance for each field."""
    ucl: ResolvedField
    lcl: ResolvedField
    stored_sigma: ResolvedField
    stored_center_line: ResolvedField
    target_value: ResolvedField
    usl: ResolvedField
    lsl: ResolvedField


class MaterialResolver:
    """Resolves effective limits by walking the material class hierarchy."""

    def __init__(self, session: AsyncSession):
        self._session = session
        self._override_repo = MaterialLimitOverrideRepository(session)

    async def resolve(
        self, char_id: int, material_id: int, char_defaults: dict[str, float | None],
        char_name: str = "",
    ) -> EffectiveLimits:
        """Resolve effective limits for a material on a characteristic.

        Resolution chain: material override -> class override (deepest first)
        -> parent class -> ... -> root class -> characteristic default.
        """
        # 1. Load material with class
        from cassini.db.repositories.material import MaterialRepository
        mat_repo = MaterialRepository(self._session)
        material = await mat_repo.get_by_id(material_id)
        if material is None:
            raise ValueError(f"Material {material_id} not found")

        # 2. Build ancestor chain
        ancestor_ids: list[int] = []
        if material.material_class:
            ancestor_ids = material.material_class.ancestor_ids()

        # 3. Fetch all relevant overrides in one query
        overrides = await self._override_repo.get_overrides_for_resolution(
            char_id, material_id, ancestor_ids
        )

        # 4. Build priority-ordered override list
        # material override first, then classes deepest-first
        depth_map = {cid: idx for idx, cid in enumerate(ancestor_ids)}  # 0=deepest
        sorted_overrides = sorted(overrides, key=lambda o: (
            1 if o.material_id else 0,  # material overrides sort last (highest priority = processed last? No — first)
            # Actually: lower key = higher priority
            0 if o.material_id else 1,
            depth_map.get(o.class_id, 999) if o.class_id else -1,
        ))

        # 5. Per-field cascade
        resolved = {}
        for field in OVERRIDE_FIELDS:
            resolved_field = None
            for override in sorted_overrides:
                val = getattr(override, field)
                if val is not None:
                    if override.material_id:
                        source_type = "material"
                        source_name = material.name
                        source_id = material.id
                    else:
                        source_type = "class"
                        source_name = override.material_class.name if override.material_class else "Unknown"
                        source_id = override.class_id
                    resolved_field = ResolvedField(val, source_type, source_name, source_id)
                    break
            if resolved_field is None:
                resolved_field = ResolvedField(
                    char_defaults.get(field), "characteristic", char_name, None
                )
            resolved[field] = resolved_field

        return EffectiveLimits(**resolved)

    async def resolve_flat(
        self, char_id: int, material_id: int, char_defaults: dict[str, float | None],
    ) -> dict[str, float | None]:
        """Resolve limits as a flat dict (no provenance). Used by SPC engine."""
        effective = await self.resolve(char_id, material_id, char_defaults, "")
        return {field: getattr(effective, field).value for field in OVERRIDE_FIELDS}
```

**Step 2: Commit**

```bash
git add backend/src/cassini/core/material_resolver.py
git commit -m "feat: add MaterialResolver cascade resolution service"
```

---

## Task 5: Pydantic Schemas

**Files:**
- Create: `backend/src/cassini/api/schemas/material.py`
- Modify: `backend/src/cassini/api/schemas/sample.py:30-38,80` — replace product_code with material_id
- Delete: `backend/src/cassini/api/schemas/product_limit.py` (if exists)

**Step 1: Create material schemas**

File: `backend/src/cassini/api/schemas/material.py`

Schemas needed:
- `MaterialClassCreate(name, code, parent_id?, description?)`
- `MaterialClassUpdate(name?, code?, parent_id?, description?)`
- `MaterialClassResponse(id, plant_id, parent_id, name, code, path, depth, description, material_count, created_at, updated_at)`
- `MaterialClassTreeNode(MaterialClassResponse + children list + materials list)`
- `MaterialCreate(name, code, class_id?, description?, properties?)`
- `MaterialUpdate(name?, code?, class_id?, description?, properties?)`
- `MaterialResponse(id, plant_id, class_id, name, code, description, properties, class_name?, class_path?, created_at, updated_at)`
- `MaterialLimitOverrideCreate(material_id?, class_id?, ucl?, lcl?, ...limit fields)` — validator: exactly one of material_id/class_id
- `MaterialLimitOverrideUpdate(ucl?, lcl?, ...limit fields)`
- `MaterialLimitOverrideResponse(id, characteristic_id, material_id?, class_id?, material_name?, class_name?, class_path?, ...limit fields, created_at, updated_at)`
- `ResolvedLimitField(value, source_type, source_name, source_id)`
- `ResolvedLimitsResponse(ucl, lcl, stored_sigma, stored_center_line, target_value, usl, lsl)` — each field is a ResolvedLimitField

Code normalization validators: `code.strip().upper()`

**Step 2: Update sample schemas**

In `backend/src/cassini/api/schemas/sample.py`:
- Line 30: `product_code: str | None = None` → `material_id: int | None = None`
- Lines 32-38: Delete `normalize_product_code` validator
- Line 80: `product_code: str | None = None` → `material_id: int | None = None`

**Step 3: Commit**

```bash
git add backend/src/cassini/api/schemas/
git commit -m "feat: add material schemas; update sample schema (material_id replaces product_code)"
```

---

## Task 6: Backend API Routers

**Files:**
- Create: `backend/src/cassini/api/v1/material_classes.py`
- Create: `backend/src/cassini/api/v1/materials.py`
- Create: `backend/src/cassini/api/v1/material_overrides.py`
- Modify: `backend/src/cassini/main.py:44,352` — remove product_limits_router, add 3 new routers
- Delete: `backend/src/cassini/api/v1/product_limits.py`

**Step 1: Create material_classes router**

Prefix: `/api/v1/plants/{plant_id}/material-classes`

Endpoints (see design doc Section 3 for full spec):
- GET `/` — list all classes for plant, ordered by path
- POST `/` — create class, compute path/depth
- GET `/{class_id}` — get class with children
- PUT `/{class_id}` — update, handle reparent
- DELETE `/{class_id}` — guard: no children or materials
- GET `/{class_id}/tree` — full subtree

All endpoints check plant role via `resolve_plant_role()`.

**Step 2: Create materials router**

Prefix: `/api/v1/plants/{plant_id}/materials`

Endpoints:
- GET `/` — list, filterable by class_id and search query
- POST `/` — create
- GET `/{material_id}` — detail with class info
- PUT `/{material_id}` — update
- DELETE `/{material_id}` — guard: no referencing samples

**Step 3: Create material_overrides router**

Prefix: `/api/v1/characteristics/{char_id}/material-overrides`

Endpoints:
- GET `/` — list all overrides for characteristic
- POST `/` — create (material_id XOR class_id)
- GET `/{override_id}` — detail
- PUT `/{override_id}` — update limit fields
- DELETE `/{override_id}` — delete
- GET `/resolve/{material_id}` — resolve effective limits with provenance

**Step 4: Update main.py**

- Line 44: Delete `from cassini.api.v1.product_limits import router as product_limits_router`
- Add 3 new router imports
- Replace `app.include_router(product_limits_router)` with 3 new `app.include_router()` calls
- Delete `backend/src/cassini/api/v1/product_limits.py`

**Step 5: Verify**

```bash
cd backend && python -c "from cassini.main import app; print(f'{len(app.routes)} routes')"
```

**Step 6: Commit**

```bash
git add backend/src/cassini/api/v1/ backend/src/cassini/main.py
git commit -m "feat: add material-classes, materials, material-overrides API routers; remove product_limits"
```

---

## Task 7: SPC Engine Integration

**Files:**
- Modify: `backend/src/cassini/core/engine/spc_engine.py:395-413` — replace ProductLimit with MaterialResolver
- Modify: `backend/src/cassini/api/v1/characteristics.py` — replace product_code with material_id in chart-data endpoint
- Modify: `backend/src/cassini/api/v1/samples.py` — replace product_code in sample creation
- Modify: `backend/src/cassini/core/providers/protocol.py` — SampleContext: product_code -> material_id (if it exists)

**Step 1: Update SPC engine**

In `backend/src/cassini/core/engine/spc_engine.py` lines 395-413, replace the ProductLimit block:

```python
# Material limit resolution: override characteristic defaults with
# per-material cascading limits when a material_id is provided.
if context.material_id:
    from cassini.core.material_resolver import MaterialResolver
    resolver = MaterialResolver(self._char_repo.session)
    char_defaults = {
        "ucl": char_ucl, "lcl": char_lcl,
        "stored_sigma": char_stored_sigma,
        "stored_center_line": char_stored_center_line,
        "target_value": char_target_value,
        "usl": getattr(char, "usl", None),
        "lsl": getattr(char, "lsl", None),
    }
    resolved = await resolver.resolve_flat(
        characteristic_id, context.material_id, char_defaults
    )
    if resolved["ucl"] is not None:
        char_ucl = resolved["ucl"]
    if resolved["lcl"] is not None:
        char_lcl = resolved["lcl"]
    if resolved["stored_sigma"] is not None:
        char_stored_sigma = resolved["stored_sigma"]
    if resolved["stored_center_line"] is not None:
        char_stored_center_line = resolved["stored_center_line"]
    if resolved["target_value"] is not None:
        char_target_value = resolved["target_value"]
```

**Step 2: Update characteristics.py chart-data endpoint**

Replace all `product_code` query parameter usage with `material_id: int | None = Query(None)`. Update sample queries to filter by `material_id`. Update limit resolution to use MaterialResolver instead of ProductLimitRepository.

**Step 3: Update samples.py**

Replace `product_code` with `material_id` in sample creation flows.

**Step 4: Update SampleContext (protocol.py)**

If SampleContext has `product_code`, rename to `material_id`.

**Step 5: Run backend tests**

```bash
cd backend && python -m pytest tests/ -x --timeout=30
```

Fix any test failures caused by product_code references.

**Step 6: Commit**

```bash
git add backend/src/cassini/core/ backend/src/cassini/api/
git commit -m "feat: integrate MaterialResolver into SPC engine and chart-data endpoint"
```

---

## Task 8: Audit Trail Updates

**Files:**
- Modify: `backend/src/cassini/core/audit.py:22-24` — replace product_limit patterns with material patterns
- Modify: `frontend/src/components/AuditLogViewer.tsx` — update RESOURCE_LABELS and ACTION_LABELS

**Step 1: Update audit.py**

In `backend/src/cassini/core/audit.py`, replace lines 23-24:

```python
# Before:
(re.compile(r"/api/v1/characteristics/(\d+)/product-limits"), "product_limit"),
(re.compile(r"/api/v1/characteristics/(\d+)/product-codes"), "product_limit"),

# After:
(re.compile(r"/api/v1/plants/(\d+)/material-classes(?:/(\d+))?"), "material_class"),
(re.compile(r"/api/v1/plants/(\d+)/materials(?:/(\d+))?"), "material"),
(re.compile(r"/api/v1/characteristics/(\d+)/material-overrides(?:/(\d+))?"), "material_override"),
```

**Step 2: Update AuditLogViewer.tsx**

- Remove `product_limit: 'Product Limits'` from RESOURCE_LABELS
- Add: `material_class: 'Material Class'`, `material: 'Material'`, `material_override: 'Material Override'`

**Step 3: Commit**

```bash
git add backend/src/cassini/core/audit.py frontend/src/components/AuditLogViewer.tsx
git commit -m "feat: update audit trail patterns for material management"
```

---

## Task 9: Frontend Types and API Client

**Files:**
- Create: `frontend/src/api/materials.api.ts`
- Create: `frontend/src/api/hooks/materials.ts`
- Modify: `frontend/src/types/index.ts` — remove ProductLimit, add Material types
- Delete: `frontend/src/api/product-limits.api.ts`
- Delete: `frontend/src/api/hooks/productLimits.ts`

**Step 1: Update TypeScript types**

In `frontend/src/types/index.ts`, remove the ProductLimit interface and add:

```typescript
export interface MaterialClass {
  id: number
  plant_id: number
  parent_id: number | null
  name: string
  code: string
  path: string
  depth: number
  description: string | null
  material_count: number
  created_at: string
  updated_at: string
}

export interface MaterialClassTreeNode extends MaterialClass {
  children: MaterialClassTreeNode[]
  materials: Material[]
}

export interface Material {
  id: number
  plant_id: number
  class_id: number | null
  name: string
  code: string
  description: string | null
  properties: Record<string, unknown> | null
  class_name: string | null
  class_path: string | null
  created_at: string
  updated_at: string
}

export interface MaterialLimitOverride {
  id: number
  characteristic_id: number
  material_id: number | null
  class_id: number | null
  material_name: string | null
  class_name: string | null
  class_path: string | null
  ucl: number | null
  lcl: number | null
  stored_sigma: number | null
  stored_center_line: number | null
  target_value: number | null
  usl: number | null
  lsl: number | null
  created_at: string
  updated_at: string
}

export interface ResolvedLimitField {
  value: number | null
  source_type: 'material' | 'class' | 'characteristic'
  source_name: string
  source_id: number | null
}

export interface ResolvedLimits {
  ucl: ResolvedLimitField
  lcl: ResolvedLimitField
  stored_sigma: ResolvedLimitField
  stored_center_line: ResolvedLimitField
  target_value: ResolvedLimitField
  usl: ResolvedLimitField
  lsl: ResolvedLimitField
}
```

Also update Sample/ChartData types: `product_code` -> `material_id`.

**Step 2: Create materials.api.ts**

API client functions using `fetchApi` (no `/api/v1/` prefix):
- `getMaterialClasses(plantId)` → GET `plants/${plantId}/material-classes`
- `createMaterialClass(plantId, data)` → POST
- `updateMaterialClass(plantId, classId, data)` → PUT
- `deleteMaterialClass(plantId, classId)` → DELETE
- `getMaterialClassTree(plantId, classId)` → GET `.../${classId}/tree`
- `getMaterials(plantId, params?)` → GET `plants/${plantId}/materials`
- `createMaterial(plantId, data)` → POST
- `updateMaterial(plantId, materialId, data)` → PUT
- `deleteMaterial(plantId, materialId)` → DELETE
- `getMaterialOverrides(charId)` → GET `characteristics/${charId}/material-overrides`
- `createMaterialOverride(charId, data)` → POST
- `updateMaterialOverride(charId, overrideId, data)` → PUT
- `deleteMaterialOverride(charId, overrideId)` → DELETE
- `resolveMaterialLimits(charId, materialId)` → GET `characteristics/${charId}/material-overrides/resolve/${materialId}`

**Step 3: Create materials.ts hooks**

React Query hooks wrapping the API client:
- `useMaterialClasses(plantId)`
- `useMaterials(plantId, classId?, search?)`
- `useMaterialOverrides(charId)`
- `useResolvedLimits(charId, materialId)`
- `useCreateMaterialClass(plantId)` — invalidates material-classes
- `useCreateMaterial(plantId)` — invalidates materials
- `useCreateMaterialOverride(charId)` — invalidates overrides
- `useUpdateMaterialClass(plantId)`
- `useUpdateMaterial(plantId)`
- `useUpdateMaterialOverride(charId)`
- `useDeleteMaterialClass(plantId)`
- `useDeleteMaterial(plantId)`
- `useDeleteMaterialOverride(charId)`

Add query keys to the existing queryKeys object.

**Step 4: Delete old files**

- Delete `frontend/src/api/product-limits.api.ts`
- Delete `frontend/src/api/hooks/productLimits.ts`

**Step 5: Type check**

```bash
cd frontend && npx tsc --noEmit
```

Fix any type errors from product_code removal.

**Step 6: Commit**

```bash
git add frontend/src/types/ frontend/src/api/
git commit -m "feat: add material TypeScript types, API client, and React Query hooks"
```

---

## Task 10: Material Tree Manager UI (Settings Page)

**Files:**
- Create: `frontend/src/components/materials/MaterialTreeManager.tsx`
- Create: `frontend/src/components/materials/MaterialClassForm.tsx`
- Create: `frontend/src/components/materials/MaterialForm.tsx`
- Modify: `frontend/src/pages/SettingsView.tsx` — add Materials tab/section

**Step 1: Create MaterialTreeManager component**

Layout:
- Left panel: collapsible tree (use recursive component or flat list with indent by depth)
- Right panel: detail/edit form for selected node
- Toolbar: Add Class, Add Material buttons
- Search input: filters tree by name/code

Use the existing hierarchy manager pattern (Plant > Dept > Line > Station) as reference.

Tree rendering: use `useMaterialClasses(plantId)` which returns flat list ordered by path. Client-side tree reconstruction using `parent_id`. Each node shows name, code, material count badge.

**Step 2: Create MaterialClassForm**

Fields: name (required), code (required, auto-uppercased), parent class (dropdown), description.
Uses `useCreateMaterialClass` / `useUpdateMaterialClass`.

**Step 3: Create MaterialForm**

Fields: name (required), code (required, auto-uppercased), class (dropdown), description, properties (JSON editor or key-value pairs).
Uses `useCreateMaterial` / `useUpdateMaterial`.

**Step 4: Add to SettingsView**

Add a "Materials" tab/section in the plant settings area. Render `<MaterialTreeManager plantId={plantId} />`.

**Step 5: Type check and verify**

```bash
cd frontend && npx tsc --noEmit
```

**Step 6: Commit**

```bash
git add frontend/src/components/materials/ frontend/src/pages/SettingsView.tsx
git commit -m "feat: add Material Tree Manager UI in Settings"
```

---

## Task 11: Material Overrides Tab (Characteristic Config)

**Files:**
- Create: `frontend/src/components/characteristic-config/MaterialOverridesTab.tsx`
- Delete: `frontend/src/components/characteristic-config/ProductLimitsTab.tsx`
- Modify: Parent component that renders the config tabs — swap ProductLimitsTab for MaterialOverridesTab

**Step 1: Create MaterialOverridesTab**

Replaces ProductLimitsTab entirely. Layout:

- Table showing all overrides for this characteristic, grouped by type (material vs class)
- Each row: icon (material vs class), name, breadcrumb path, 7 limit fields with "Inherited" badges for nulls
- Add button → dropdown to pick material or class from plant, then set limit fields
- Quick add material button → inline mini-form (name, code, class picker)
- Resolve preview → when hovering/selecting a row, show fully resolved chain with provenance

Uses:
- `useMaterialOverrides(charId)` for the override list
- `useMaterials(plantId)` for material picker
- `useMaterialClasses(plantId)` for class picker
- `useCreateMaterialOverride(charId)` / `useUpdateMaterialOverride(charId)` / `useDeleteMaterialOverride(charId)` for CRUD
- `useResolvedLimits(charId, materialId)` for resolve preview

**Step 2: Delete ProductLimitsTab**

Delete `frontend/src/components/characteristic-config/ProductLimitsTab.tsx`

**Step 3: Update parent config component**

Find the component that renders config tabs (likely in `CharacteristicForm.tsx` or a config modal). Replace `<ProductLimitsTab>` with `<MaterialOverridesTab>`. Update the tab label from "Product Limits" to "Material Overrides".

**Step 4: Type check**

```bash
cd frontend && npx tsc --noEmit
```

**Step 5: Commit**

```bash
git add frontend/src/components/characteristic-config/
git commit -m "feat: replace ProductLimitsTab with MaterialOverridesTab"
```

---

## Task 12: Manual Entry Material Picker

**Files:**
- Modify: `frontend/src/components/ManualEntryPanel.tsx` — replace product_code input with material combobox

**Step 1: Replace product_code input**

Remove the product_code text input and autocomplete. Replace with a material combobox:

- Combobox with two sections separated by a divider:
  1. "Configured" — materials that have overrides for this characteristic (from `useMaterialOverrides`)
  2. "All Materials" — all materials in the plant (from `useMaterials`)
- Type-to-filter by name/code
- Warning badge when selecting a material with no configured overrides: yellow alert "No limit overrides configured — characteristic defaults will be used"
- Selected value sets `material_id` on the sample submission payload

**Step 2: Update sample submission**

In the submit handler, pass `material_id` instead of `product_code`.

**Step 3: Type check**

```bash
cd frontend && npx tsc --noEmit
```

**Step 4: Commit**

```bash
git add frontend/src/components/ManualEntryPanel.tsx
git commit -m "feat: replace product_code input with material picker in manual entry"
```

---

## Task 13: Chart Material Filter

**Files:**
- Modify: `frontend/src/components/ControlChart.tsx` — replace product code dropdown with material dropdown
- Modify: Chart data fetching — pass material_id instead of product_code

**Step 1: Update chart filter**

Replace the product code filter dropdown with a material dropdown:
- Shows materials that appear in the characteristic's sample data (query distinct material_ids from samples)
- Selecting a material passes `material_id` to the chart-data endpoint
- Limit lines update to show resolved overrides for the selected material

**Step 2: Update chart data API calls**

Wherever chart-data is fetched with `product_code` query param, replace with `material_id`.

**Step 3: Type check**

```bash
cd frontend && npx tsc --noEmit
```

**Step 4: Commit**

```bash
git add frontend/src/components/ControlChart.tsx
git commit -m "feat: replace product code filter with material filter in charts"
```

---

## Task 14: Seed Script Updates

**Files:**
- Modify: `backend/scripts/seed_e2e.py` — replace product_code with material system
- Modify: `backend/scripts/seed_showcase.py` — add industry-relevant materials
- Modify: Other seed scripts that reference product_code

**Step 1: Update seed_e2e.py**

- Remove all `product_code="PN-100"` etc. references
- Add material class tree creation (e.g., "Raw Materials" > "Metals" > "Aluminum")
- Add material creation (e.g., "AL-6061-T6", "AL-7075-T6")
- Add material limit overrides at both class and material level
- Create samples with `material_id` instead of `product_code`
- Demonstrate cascade: class-level USL, material-level UCL, resolved together

**Step 2: Update seed_showcase.py**

Add industry-appropriate material classes:
- Automotive: "Body Panels" > "Steel" > "HSLA-340", "Aluminum" > "6111-T4"
- Aerospace: "Alloys" > "Titanium" > "Ti-6Al-4V", "Nickel" > "Inconel-718"
- Pharma: "Excipients" > "Binders" > "HPMC-K4M", "API" > "Compound-A"

**Step 3: Update other seeds**

Grep for `product_code` in all seed scripts and update to use material_id.

**Step 4: Test seeds**

```bash
cd backend && python scripts/seed_e2e.py --force
cd backend && python scripts/seed_showcase.py --force
```

**Step 5: Commit**

```bash
git add backend/scripts/
git commit -m "feat: update seed scripts for material management system"
```

---

## Task 15: E2E Tests

**Files:**
- Delete: `frontend/e2e/product-limits.spec.ts` (if exists)
- Create: `frontend/e2e/materials.spec.ts`

**Step 1: Write E2E tests**

Test scenarios:
1. **Material class CRUD**: Create root class → create child class → verify tree structure → rename → delete
2. **Material CRUD**: Create material in class → verify listed → update → delete blocked (has samples) → delete after removing samples
3. **Material overrides**: Set class-level override → set material-level override → verify cascade resolution shows correct provenance
4. **Data entry with material**: Select material in manual entry → submit sample → verify sample shows material → verify chart uses resolved limits
5. **Unconfigured material warning**: Select material with no overrides → verify warning badge appears
6. **Chart material filter**: Enter samples with two different materials → filter by material → verify chart shows only matching samples with correct limit lines

**Step 2: Run E2E tests**

```bash
cd frontend && npx playwright test e2e/materials.spec.ts --reporter=list
```

**Step 3: Commit**

```bash
git add frontend/e2e/materials.spec.ts
git commit -m "test: add E2E tests for material management"
```

---

## Task 16: Cleanup and Verification

**Files:**
- Grep entire codebase for remaining `product_code`, `ProductLimit`, `product-limit` references
- Run full test suite

**Step 1: Grep for orphaned references**

```bash
cd /c/Users/djbra/Projects/SPC-client
grep -rn "product_code" backend/src/ frontend/src/ --include="*.py" --include="*.ts" --include="*.tsx" | grep -v "node_modules" | grep -v "__pycache__"
grep -rn "ProductLimit" backend/src/ frontend/src/ --include="*.py" --include="*.ts" --include="*.tsx"
grep -rn "product-limit" backend/src/ frontend/src/ --include="*.py" --include="*.ts" --include="*.tsx"
grep -rn "product.limit" frontend/src/ --include="*.ts" --include="*.tsx"
```

Expected: No results (or only in migration files, design docs, or comments).

**Step 2: Run full backend tests**

```bash
cd backend && python -m pytest tests/ -x --timeout=30
```

**Step 3: Run TypeScript type check**

```bash
cd frontend && npx tsc --noEmit
```

**Step 4: Run frontend build**

```bash
cd frontend && npm run build
```

**Step 5: Commit any cleanup**

```bash
git add -A && git commit -m "chore: remove all remaining product_code/ProductLimit references"
```

---

## Task 17: Adversarial Review

**Step 1: Deploy skeptic subagent**

Spawn an adversarial subagent to attack the implementation. Focus areas:
- Can the CHECK constraint be bypassed (both material_id and class_id set)?
- What happens when a class is deleted that has overrides? (Should cascade)
- What happens when a material is reparented to a different class? (Overrides should still resolve correctly)
- Infinite loop risk in ancestor_ids() if path is malformed?
- Performance: what if a class tree is 20 levels deep? (Should still be 2 queries)
- XSS in material name/code/description?
- Authorization: can an operator create materials? (Should be engineer+)
- SQLite compatibility: do the CHECK and unique constraints work?

**Step 2: Fix any issues found**

**Step 3: Final commit**

```bash
git add -A && git commit -m "fix: address skeptic review findings for material management"
```

---

## Execution Order and Parallelism

```
Task 1 (Migration) ─────────────────────────────────────────────► sequential prerequisite
Task 2 (Models) ─────────────────────────────────────────────────► depends on Task 1
Task 3 (Repositories) ──────────────┐
Task 4 (Resolver) ──────────────────┤ parallel, all depend on Task 2
Task 5 (Schemas) ───────────────────┘
Task 6 (API Routers) ───────────────────────────────────────────► depends on Tasks 3,4,5
Task 7 (SPC Engine) ────────────────────────────────────────────► depends on Task 4
Task 8 (Audit Trail) ──────────────┐
Task 9 (Frontend Types/API) ───────┤ parallel, depend on Task 6
Task 10 (Tree Manager UI) ─────────┘ depends on Task 9
Task 11 (Overrides Tab) ───────────────────────────────────────► depends on Task 9
Task 12 (Manual Entry Picker) ─────────────────────────────────► depends on Task 9
Task 13 (Chart Filter) ────────────────────────────────────────► depends on Task 9
Task 14 (Seed Scripts) ────────────────────────────────────────► depends on Task 6
Task 15 (E2E Tests) ───────────────────────────────────────────► depends on Tasks 10-14
Task 16 (Cleanup) ─────────────────────────────────────────────► depends on all above
Task 17 (Adversarial Review) ──────────────────────────────────► depends on Task 16
```

**Recommended waves:**
1. Tasks 1-2 (foundation)
2. Tasks 3-5 (parallel backend)
3. Tasks 6-7 (API integration)
4. Tasks 8-13 (parallel frontend + audit)
5. Tasks 14-15 (seeds + E2E)
6. Tasks 16-17 (cleanup + review)
