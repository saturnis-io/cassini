"""Verify _get_char_and_values does NOT mutate the Characteristic ORM object.

Audit C13: Lines 119-121 of api/v1/capability.py used to assign material-
specific override values directly onto the loaded Characteristic ORM
instance.  Because the session was open and SQLAlchemy auto-flush was
active, those mutations could be persisted to the database, silently
overwriting the canonical USL/LSL/target_value with a material-specific
override.  The fix returns effective values via a NamedTuple instead.
"""

from __future__ import annotations

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from cassini.api.v1.capability import _get_char_and_values
from cassini.db.models.characteristic import Characteristic
from cassini.db.models.hierarchy import Hierarchy
from cassini.db.models.material import Material
from cassini.db.models.material_limit_override import MaterialLimitOverride
from cassini.db.models.plant import Plant
from cassini.db.models.sample import Measurement, Sample


@pytest_asyncio.fixture
async def char_with_material_override(async_session: AsyncSession):
    """Seed a plant, characteristic, material, and per-material limit override."""
    plant = Plant(name="Test Plant", code="TEST")
    async_session.add(plant)
    await async_session.flush()

    hierarchy = Hierarchy(
        name="Test Site", type="Site", parent_id=None, plant_id=plant.id
    )
    async_session.add(hierarchy)
    await async_session.flush()

    char = Characteristic(
        hierarchy_id=hierarchy.id,
        name="ORM Mutation Test",
        subgroup_size=1,
        target_value=100.0,
        usl=110.0,
        lsl=90.0,
    )
    async_session.add(char)
    await async_session.flush()

    material = Material(plant_id=plant.id, name="Material A", code="MAT-A")
    async_session.add(material)
    await async_session.flush()

    override = MaterialLimitOverride(
        characteristic_id=char.id,
        material_id=material.id,
        usl=120.0,
        lsl=80.0,
        target_value=105.0,
    )
    async_session.add(override)

    # Need at least 2 samples so _get_char_and_values does not raise
    for value in [99.0, 101.0]:
        sample = Sample(char_id=char.id, material_id=material.id)
        async_session.add(sample)
        await async_session.flush()
        m = Measurement(sample_id=sample.id, value=value)
        async_session.add(m)

    await async_session.commit()
    return char, material


class TestNoOrmMutationOnMaterialOverride:
    """The Characteristic ORM object MUST keep its original USL/LSL/target."""

    @pytest.mark.asyncio
    async def test_capability_with_material_override_does_not_mutate_char(
        self,
        async_session: AsyncSession,
        char_with_material_override: tuple[Characteristic, Material],
    ) -> None:
        """Calling _get_char_and_values with a material override returns the
        material-specific effective limits BUT the characteristic ORM object
        retains its canonical (non-overridden) limits."""
        char, material = char_with_material_override
        original_usl = char.usl
        original_lsl = char.lsl
        original_target = char.target_value

        data = await _get_char_and_values(
            char_id=char.id,
            session=async_session,
            window_size=100,
            material_id=material.id,
        )

        # Effective values reflect the override
        assert data.eff_usl == 120.0, "effective USL should pick up override"
        assert data.eff_lsl == 80.0, "effective LSL should pick up override"
        assert data.eff_target == 105.0, "effective target should pick up override"

        # The characteristic ORM is UNTOUCHED
        assert data.characteristic.usl == original_usl == 110.0, (
            "Characteristic.usl must remain 110.0 (the canonical spec); "
            "mutating to the material override would corrupt the global spec."
        )
        assert data.characteristic.lsl == original_lsl == 90.0
        assert data.characteristic.target_value == original_target == 100.0

    @pytest.mark.asyncio
    async def test_no_material_override_returns_canonical_specs(
        self,
        async_session: AsyncSession,
        char_with_material_override: tuple[Characteristic, Material],
    ) -> None:
        """Without material_id, the effective spec values match the
        characteristic's own USL/LSL/target."""
        char, _material = char_with_material_override

        data = await _get_char_and_values(
            char_id=char.id, session=async_session, window_size=100,
        )

        assert data.eff_usl == char.usl
        assert data.eff_lsl == char.lsl
        assert data.eff_target == char.target_value

    @pytest.mark.asyncio
    async def test_session_flush_after_call_does_not_overwrite_specs(
        self,
        async_session: AsyncSession,
        char_with_material_override: tuple[Characteristic, Material],
    ) -> None:
        """After _get_char_and_values returns, an explicit session flush must
        NOT push any spec-limit changes to the DB."""
        char, material = char_with_material_override

        await _get_char_and_values(
            char_id=char.id,
            session=async_session,
            window_size=100,
            material_id=material.id,
        )

        # Flush — a smoking-gun test that no pending mutations exist
        await async_session.flush()
        await async_session.commit()

        # Reload from DB
        await async_session.refresh(char)
        assert char.usl == 110.0
        assert char.lsl == 90.0
        assert char.target_value == 100.0
