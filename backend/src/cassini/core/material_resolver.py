"""Material limit cascade resolution service."""

from dataclasses import dataclass, field
from typing import Optional

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from cassini.db.models.material import Material
from cassini.db.models.material_class import MaterialClass
from cassini.db.models.material_limit_override import MaterialLimitOverride


OVERRIDE_FIELDS = ("ucl", "lcl", "stored_sigma", "stored_center_line", "target_value", "usl", "lsl")


@dataclass
class ResolvedField:
	"""A single resolved limit field with provenance."""
	value: float | None
	source_type: str  # "material", "class", "characteristic"
	source_name: str
	source_id: int | None = None


@dataclass
class EffectiveLimits:
	"""Fully resolved limits with provenance for each field."""
	ucl: ResolvedField = field(default_factory=lambda: ResolvedField(None, "characteristic", ""))
	lcl: ResolvedField = field(default_factory=lambda: ResolvedField(None, "characteristic", ""))
	stored_sigma: ResolvedField = field(default_factory=lambda: ResolvedField(None, "characteristic", ""))
	stored_center_line: ResolvedField = field(default_factory=lambda: ResolvedField(None, "characteristic", ""))
	target_value: ResolvedField = field(default_factory=lambda: ResolvedField(None, "characteristic", ""))
	usl: ResolvedField = field(default_factory=lambda: ResolvedField(None, "characteristic", ""))
	lsl: ResolvedField = field(default_factory=lambda: ResolvedField(None, "characteristic", ""))


class MaterialResolver:
	"""Resolves effective limits by walking the material class hierarchy.

	Per-field cascade: for each limit field, the deepest non-null value wins.
	Priority: material override > deepest class > parent class > ... > root class > characteristic default
	"""

	def __init__(self, session: AsyncSession):
		self._session = session

	async def resolve(
		self,
		char_id: int,
		material_id: int,
		char_defaults: dict[str, float | None],
		char_name: str = "",
	) -> EffectiveLimits:
		"""Resolve effective limits with full provenance."""
		# 1. Load material with class
		stmt = (
			select(Material)
			.where(Material.id == material_id)
			.options(selectinload(Material.material_class))
		)
		result = await self._session.execute(stmt)
		material = result.scalar_one_or_none()
		if material is None:
			raise ValueError(f"Material {material_id} not found")

		# 2. Build ancestor chain from materialized path
		ancestor_ids: list[int] = []
		if material.material_class:
			ancestor_ids = material.material_class.ancestor_ids()

		# 3. Fetch all relevant overrides in one query
		conditions = [
			MaterialLimitOverride.characteristic_id == char_id,
		]
		or_conditions = [MaterialLimitOverride.material_id == material_id]
		if ancestor_ids:
			or_conditions.append(MaterialLimitOverride.class_id.in_(ancestor_ids))
		conditions.append(or_(*or_conditions))

		override_stmt = (
			select(MaterialLimitOverride)
			.where(*conditions)
			.options(selectinload(MaterialLimitOverride.material_class))
		)
		override_result = await self._session.execute(override_stmt)
		overrides = list(override_result.scalars().all())

		# 4. Sort by priority: material first, then classes deepest-first
		depth_map = {cid: idx for idx, cid in enumerate(ancestor_ids)}  # 0=deepest

		def sort_key(o: MaterialLimitOverride) -> tuple[int, int]:
			if o.material_id is not None:
				return (0, 0)  # highest priority
			return (1, depth_map.get(o.class_id, 999))  # classes by depth (lower=deeper=higher priority)

		sorted_overrides = sorted(overrides, key=sort_key)

		# 5. Per-field cascade
		resolved = {}
		for fld in OVERRIDE_FIELDS:
			resolved_field = None
			for override in sorted_overrides:
				val = getattr(override, fld)
				if val is not None:
					if override.material_id is not None:
						resolved_field = ResolvedField(val, "material", material.name, material.id)
					else:
						cls_name = override.material_class.name if override.material_class else "Unknown"
						resolved_field = ResolvedField(val, "class", cls_name, override.class_id)
					break
			if resolved_field is None:
				resolved_field = ResolvedField(
					char_defaults.get(fld), "characteristic", char_name
				)
			resolved[fld] = resolved_field

		return EffectiveLimits(**resolved)

	async def resolve_flat(
		self,
		char_id: int,
		material_id: int,
		char_defaults: dict[str, float | None],
	) -> dict[str, float | None]:
		"""Resolve limits as a flat dict (no provenance). Used by SPC engine."""
		effective = await self.resolve(char_id, material_id, char_defaults, "")
		return {fld: getattr(effective, fld).value for fld in OVERRIDE_FIELDS}
