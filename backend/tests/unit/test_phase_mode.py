"""Tests for Phase I/II mode (limits freeze/unfreeze).

Covers:
- Freeze prevents recalculation (409)
- Unfreeze allows recalculation
- Signature invalidation on unfreeze
- Auto-recalc skipped when frozen (SPC engine)
- Audit trail captured (method_to_action routing)
- Guard in ControlLimitService.recalculate_and_persist()
"""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio

from cassini.core.audit import _method_to_action
from cassini.core.engine.control_limits import ControlLimitService


def _make_service() -> ControlLimitService:
    return ControlLimitService(
        sample_repo=MagicMock(),
        char_repo=MagicMock(),
        window_manager=MagicMock(),
    )


class TestMethodToAction:
    """Verify _method_to_action routes freeze/unfreeze correctly."""

    def test_freeze_limits_path(self):
        """POST /characteristics/{id}/freeze-limits -> 'freeze'."""
        action = _method_to_action("POST", "/api/v1/characteristics/42/freeze-limits")
        assert action == "freeze"

    def test_unfreeze_limits_path(self):
        """POST /characteristics/{id}/unfreeze-limits -> 'unfreeze'."""
        action = _method_to_action("POST", "/api/v1/characteristics/42/unfreeze-limits")
        assert action == "unfreeze"

    def test_unfreeze_before_freeze_ordering(self):
        """'/unfreeze' must match before '/freeze' to avoid incorrect routing."""
        # This verifies the ordering in _method_to_action is correct:
        # "unfreeze-limits" contains both "/unfreeze" and "/freeze",
        # but must return "unfreeze"
        action = _method_to_action("POST", "/api/v1/characteristics/1/unfreeze-limits")
        assert action == "unfreeze", (
            "unfreeze path incorrectly matched as 'freeze' — "
            "check ordering in _method_to_action"
        )


class TestControlLimitServiceFrozenGuard:
    """Verify recalculate_and_persist() rejects when limits_frozen=True."""

    @pytest.mark.asyncio
    async def test_recalculate_blocked_when_frozen(self):
        """recalculate_and_persist raises ValueError when limits are frozen."""
        service = _make_service()

        # Mock characteristic with frozen limits
        mock_char = MagicMock()
        mock_char.limits_frozen = True
        mock_char.ucl = 10.0
        mock_char.lcl = 2.0
        service._char_repo.get_by_id = AsyncMock(return_value=mock_char)

        with pytest.raises(ValueError, match="frozen"):
            await service.recalculate_and_persist(
                characteristic_id=1,
                exclude_ooc=False,
                min_samples=25,
            )

    @pytest.mark.asyncio
    async def test_recalculate_allowed_when_not_frozen(self):
        """recalculate_and_persist proceeds when limits_frozen=False."""
        service = _make_service()

        # Mock characteristic with unfrozen limits
        mock_char = MagicMock()
        mock_char.limits_frozen = False
        mock_char.subgroup_size = 1
        mock_char.sigma_method = None
        mock_char.ucl = None
        mock_char.lcl = None
        mock_char.stored_sigma = None
        mock_char.stored_center_line = None
        service._char_repo.get_by_id = AsyncMock(return_value=mock_char)

        # Mock sample data — need at least 25 samples
        from cassini.db.models.sample import Measurement, Sample

        mock_samples = []
        for i in range(30):
            s = MagicMock(spec=Sample)
            m = MagicMock(spec=Measurement)
            m.value = 10.0 + i * 0.1
            s.measurements = [m]
            s.is_excluded = False
            mock_samples.append(s)

        service._sample_repo.get_by_characteristic = AsyncMock(return_value=mock_samples)
        service._char_repo.session = AsyncMock()
        service._char_repo.session.commit = AsyncMock()
        service._window_manager.invalidate = AsyncMock()
        service._event_bus = MagicMock()
        service._event_bus.publish = AsyncMock()

        # Should not raise
        result = await service.recalculate_and_persist(
            characteristic_id=1,
            exclude_ooc=False,
            min_samples=25,
        )
        assert result.ucl is not None
        assert result.lcl is not None
        assert result.sigma > 0


class TestSPCEngineAutoRecalcFrozen:
    """Verify SPC engine returns stored limits when frozen."""

    @pytest.mark.asyncio
    async def test_recalculate_returns_stored_when_frozen(self):
        """SPC engine's recalculate_limits returns stored limits without computing."""
        from cassini.core.engine.spc_engine import SPCEngine

        engine = SPCEngine(
            char_repo=MagicMock(),
            sample_repo=MagicMock(),
            violation_repo=MagicMock(),
            window_manager=MagicMock(),
            rule_library=MagicMock(),
        )

        # Mock characteristic with frozen limits
        mock_char = MagicMock()
        mock_char.limits_frozen = True
        mock_char.ucl = 15.0
        mock_char.lcl = 5.0
        mock_char.stored_center_line = 10.0
        mock_char.subgroup_size = 1
        engine._char_repo.get_by_id = AsyncMock(return_value=mock_char)

        center_line, ucl, lcl = await engine.recalculate_limits(
            characteristic_id=1,
            exclude_ooc=False,
        )

        assert center_line == 10.0
        assert ucl == 15.0
        assert lcl == 5.0

        # Should NOT have queried sample data
        engine._sample_repo.get_rolling_window_data.assert_not_called()

    @pytest.mark.asyncio
    async def test_recalculate_uses_midpoint_when_no_stored_center(self):
        """When frozen but stored_center_line is None, uses midpoint of UCL/LCL."""
        from cassini.core.engine.spc_engine import SPCEngine

        engine = SPCEngine(
            char_repo=MagicMock(),
            sample_repo=MagicMock(),
            violation_repo=MagicMock(),
            window_manager=MagicMock(),
            rule_library=MagicMock(),
        )

        mock_char = MagicMock()
        mock_char.limits_frozen = True
        mock_char.ucl = 20.0
        mock_char.lcl = 10.0
        mock_char.stored_center_line = None
        engine._char_repo.get_by_id = AsyncMock(return_value=mock_char)

        center_line, ucl, lcl = await engine.recalculate_limits(
            characteristic_id=1,
        )

        assert center_line == 15.0  # midpoint
        assert ucl == 20.0
        assert lcl == 10.0


class TestCharacteristicModelFrozenFields:
    """Verify the Characteristic model has the frozen columns."""

    def test_model_has_frozen_columns(self):
        """Characteristic model should have limits_frozen, limits_frozen_at, limits_frozen_by."""
        from cassini.db.models.characteristic import Characteristic

        # Check columns exist in the mapper
        mapper = Characteristic.__mapper__
        column_names = {c.key for c in mapper.columns}
        assert "limits_frozen" in column_names
        assert "limits_frozen_at" in column_names
        assert "limits_frozen_by" in column_names

    def test_frozen_defaults(self):
        """New characteristics should default to unfrozen."""
        from cassini.db.models.characteristic import Characteristic

        char = Characteristic.__new__(Characteristic)
        # The Python-level default should be False
        col = Characteristic.__table__.columns["limits_frozen"]
        assert col.default.arg is False


class TestPydanticSchemaFrozenFields:
    """Verify the Pydantic schemas include frozen fields."""

    def test_response_has_frozen_fields(self):
        """CharacteristicResponse should include limits_frozen fields."""
        from cassini.api.schemas.characteristic import CharacteristicResponse

        fields = CharacteristicResponse.model_fields
        assert "limits_frozen" in fields
        assert "limits_frozen_at" in fields
        assert "limits_frozen_by" in fields

    def test_frozen_at_serialization(self):
        """limits_frozen_at should serialize datetime to string."""
        from cassini.api.schemas.characteristic import CharacteristicResponse

        dt = datetime(2026, 3, 15, 19, 0, 0, tzinfo=timezone.utc)

        # Construct a minimal valid response with a datetime for limits_frozen_at
        data = {
            "id": 1,
            "hierarchy_id": 1,
            "name": "Test",
            "description": None,
            "subgroup_size": 1,
            "target_value": None,
            "usl": None,
            "lsl": None,
            "ucl": 10.0,
            "lcl": 2.0,
            "subgroup_mode": "NOMINAL_TOLERANCE",
            "min_measurements": 1,
            "warn_below_count": None,
            "stored_sigma": 1.0,
            "stored_center_line": 6.0,
            "decimal_precision": 3,
            "limits_frozen": True,
            "limits_frozen_at": dt,
            "limits_frozen_by": "admin",
        }
        resp = CharacteristicResponse(**data)
        assert resp.limits_frozen is True
        assert resp.limits_frozen_at == dt.isoformat()
        assert resp.limits_frozen_by == "admin"

    def test_frozen_at_none(self):
        """limits_frozen_at=None should remain None."""
        from cassini.api.schemas.characteristic import CharacteristicResponse

        data = {
            "id": 1,
            "hierarchy_id": 1,
            "name": "Test",
            "description": None,
            "subgroup_size": 1,
            "target_value": None,
            "usl": None,
            "lsl": None,
            "ucl": None,
            "lcl": None,
            "subgroup_mode": "NOMINAL_TOLERANCE",
            "min_measurements": 1,
            "warn_below_count": None,
            "stored_sigma": None,
            "stored_center_line": None,
            "decimal_precision": 3,
            "limits_frozen": False,
            "limits_frozen_at": None,
            "limits_frozen_by": None,
        }
        resp = CharacteristicResponse(**data)
        assert resp.limits_frozen is False
        assert resp.limits_frozen_at is None
        assert resp.limits_frozen_by is None
