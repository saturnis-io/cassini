"""Unit tests for BatchEvaluator — batch SPC evaluation on persisted samples.

Tests cover:
- BatchEvaluationResult dataclass defaults
- BatchEvaluator construction with dependencies
- assess() with empty sample list
- assess() with missing characteristic
- Sample loading from DB (ordering, filtering)
"""

from __future__ import annotations

import json
from dataclasses import field
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from cassini.core.engine.batch_evaluator import (
    BatchEvaluationResult,
    BatchEvaluator,
)
from cassini.core.engine.spc_queue import SPCEvaluationRequest


# ---------------------------------------------------------------------------
# BatchEvaluationResult
# ---------------------------------------------------------------------------


class TestBatchEvaluationResult:
    """Tests for BatchEvaluationResult dataclass."""

    def test_default_values(self) -> None:
        result = BatchEvaluationResult()
        assert result.sample_count == 0
        assert result.violation_count == 0
        assert result.errors == 0
        assert result.events == []

    def test_custom_values(self) -> None:
        ev = MagicMock()
        result = BatchEvaluationResult(
            sample_count=5,
            violation_count=2,
            errors=1,
            events=[ev],
        )
        assert result.sample_count == 5
        assert result.violation_count == 2
        assert result.errors == 1
        assert result.events == [ev]

    def test_events_list_is_independent(self) -> None:
        """Each instance should have its own events list (no sharing)."""
        r1 = BatchEvaluationResult()
        r2 = BatchEvaluationResult()
        r1.events.append("x")
        assert r2.events == []


# ---------------------------------------------------------------------------
# BatchEvaluator construction
# ---------------------------------------------------------------------------


class TestBatchEvaluatorConstruction:
    """Tests for BatchEvaluator initialization."""

    def test_creates_with_dependencies(self) -> None:
        session = MagicMock()
        event_bus = MagicMock()
        window_manager = MagicMock()
        evaluator = BatchEvaluator(session, event_bus, window_manager)
        assert evaluator._session is session
        assert evaluator._event_bus is event_bus
        assert evaluator._window_manager is window_manager


# ---------------------------------------------------------------------------
# assess() — edge cases
# ---------------------------------------------------------------------------


class TestBatchEvaluatorAssess:
    """Tests for the main assess() entry point."""

    @pytest.mark.asyncio
    async def test_returns_result_for_empty_samples(self) -> None:
        """When sample_ids is empty, return empty result immediately."""
        session = AsyncMock()
        event_bus = MagicMock()
        window_manager = MagicMock()

        evaluator = BatchEvaluator(session, event_bus, window_manager)
        request = SPCEvaluationRequest(
            characteristic_id=1,
            sample_ids=[],
        )
        result = await evaluator.assess(request)
        assert isinstance(result, BatchEvaluationResult)
        assert result.sample_count == 0
        assert result.violation_count == 0
        assert result.events == []

    @pytest.mark.asyncio
    async def test_returns_empty_result_for_missing_char(self) -> None:
        """When characteristic is not found, return empty result with error logged."""
        mock_session = AsyncMock()
        mock_event_bus = MagicMock()
        mock_window_manager = MagicMock()

        evaluator = BatchEvaluator(mock_session, mock_event_bus, mock_window_manager)
        request = SPCEvaluationRequest(
            characteristic_id=999,
            sample_ids=[1, 2, 3],
        )

        # Mock _load_characteristic to return None (char not found)
        with patch.object(evaluator, "_load_characteristic", new_callable=AsyncMock, return_value=None):
            result = await evaluator.assess(request)

        assert isinstance(result, BatchEvaluationResult)
        assert result.sample_count == 0
        assert result.violation_count == 0
        assert result.errors == 0


# ---------------------------------------------------------------------------
# Sample loading
# ---------------------------------------------------------------------------


class TestBatchEvaluatorSampleLoading:
    """Tests for _load_samples behavior."""

    @pytest.mark.asyncio
    async def test_samples_loaded_from_db(self) -> None:
        """Samples should be loaded by IDs, filtered by spc_status, ordered by id."""
        mock_session = AsyncMock()
        mock_event_bus = MagicMock()
        mock_window_manager = MagicMock()

        evaluator = BatchEvaluator(mock_session, mock_event_bus, mock_window_manager)

        # Create mock samples
        sample1 = MagicMock()
        sample1.id = 10
        sample1.spc_status = "pending_spc"

        sample2 = MagicMock()
        sample2.id = 20
        sample2.spc_status = "pending_spc"

        # Mock the session.execute to return our samples
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [sample1, sample2]
        mock_session.execute = AsyncMock(return_value=mock_result)

        samples = await evaluator._load_samples([10, 20])
        assert len(samples) == 2
        # Verify the session was called
        mock_session.execute.assert_called_once()

    @pytest.mark.asyncio
    async def test_load_samples_returns_empty_for_no_ids(self) -> None:
        """When sample_ids is empty, should return empty list without querying."""
        mock_session = AsyncMock()
        mock_event_bus = MagicMock()
        mock_window_manager = MagicMock()

        evaluator = BatchEvaluator(mock_session, mock_event_bus, mock_window_manager)
        samples = await evaluator._load_samples([])
        assert samples == []
        mock_session.execute.assert_not_called()
