"""Unit tests for multi-part short-run charts using MaterialLimitOverride system.

Tests cover:
- Deviation mode with material-specific targets
- Standardized mode with material-specific target + sigma
- Rejection when material has no configured baseline
- Material changeover logging
- Correct target selection (stored_center_line for multi-part, target_value for single-part)
"""

import math
import pytest
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

from cassini.core.engine.rolling_window import (
	RollingWindow,
	RollingWindowManager,
	WindowSample,
	Zone,
	ZoneBoundaries,
)
from cassini.core.engine.spc_engine import (
	ProcessingResult,
	SPCEngine,
)
from cassini.core.events import EventBus
from cassini.core.providers.protocol import SampleContext


def _make_char_data(
	*,
	short_run_mode=None,
	stored_center_line=None,
	stored_sigma=None,
	target_value=None,
	ucl=110.0,
	lcl=90.0,
):
	"""Build a minimal char_data dict for process_sample."""
	return {
		"id": 1,
		"subgroup_mode": "NOMINAL_TOLERANCE",
		"subgroup_size": 1,
		"min_measurements": 1,
		"warn_below_count": None,
		"ucl": ucl,
		"lcl": lcl,
		"usl": None,
		"lsl": None,
		"stored_sigma": stored_sigma,
		"stored_center_line": stored_center_line,
		"short_run_mode": short_run_mode,
		"target_value": target_value,
		"rules": [
			{
				"rule_id": 1,
				"is_enabled": True,
				"require_acknowledgement": True,
				"parameters": None,
			}
		],
	}


def _make_window_sample(sample_id=1, value=100.0):
	"""Build a WindowSample with placeholder zone info."""
	return WindowSample(
		sample_id=sample_id,
		timestamp=datetime(2026, 3, 15, 12, 0, 0),
		value=value,
		range_value=None,
		zone=Zone.ZONE_C_UPPER,
		is_above_center=True,
		sigma_distance=0.0,
	)


def _make_boundaries(center=0.0, sigma=1.0):
	"""Build ZoneBoundaries."""
	return ZoneBoundaries(
		center_line=center,
		sigma=sigma,
		plus_1_sigma=center + sigma,
		plus_2_sigma=center + 2 * sigma,
		plus_3_sigma=center + 3 * sigma,
		minus_1_sigma=center - sigma,
		minus_2_sigma=center - 2 * sigma,
		minus_3_sigma=center - 3 * sigma,
	)


@pytest.fixture
def mock_sample_repo():
	repo = AsyncMock()
	repo.session = AsyncMock()
	sample = MagicMock()
	sample.id = 1
	sample.timestamp = datetime(2026, 3, 15, 12, 0, 0)
	repo.create_with_measurements.return_value = sample
	return repo


@pytest.fixture
def mock_char_repo():
	repo = AsyncMock()
	repo.session = AsyncMock()
	return repo


@pytest.fixture
def mock_violation_repo():
	repo = AsyncMock()
	repo.session = MagicMock()
	repo.session.flush = AsyncMock()
	return repo


@pytest.fixture
def mock_window_manager():
	manager = AsyncMock()
	manager.get_cached_limits = MagicMock(return_value=None)
	manager.put_cached_limits = MagicMock()
	manager.increment_limit_counter = MagicMock()
	manager.get_last_material_id = MagicMock(return_value=None)
	manager.set_last_material_id = MagicMock()
	return manager


@pytest.fixture
def spc_engine(mock_sample_repo, mock_char_repo, mock_violation_repo, mock_window_manager):
	from cassini.core.engine.nelson_rules import NelsonRuleLibrary

	event_bus = EventBus()
	rule_library = NelsonRuleLibrary()
	return SPCEngine(
		sample_repo=mock_sample_repo,
		char_repo=mock_char_repo,
		violation_repo=mock_violation_repo,
		window_manager=mock_window_manager,
		rule_library=rule_library,
		event_bus=event_bus,
	)


def _setup_window_manager(mock_window_manager, value=0.0):
	"""Configure mock window manager to return a working window."""
	window_sample = _make_window_sample(value=value)
	mock_window_manager.add_sample.return_value = window_sample

	window = RollingWindow(max_size=25)
	boundaries = _make_boundaries(center=0.0, sigma=1.0)
	window.set_boundaries(boundaries)
	window.append(window_sample)
	mock_window_manager.get_window.return_value = window


class TestMultiPartDeviationMode:
	"""Multi-part short-run with deviation transformation."""

	@pytest.mark.asyncio
	async def test_deviation_mode_uses_material_stored_center_line(
		self, spc_engine, mock_sample_repo, mock_window_manager, mock_char_repo
	):
		"""Deviation mode with material_id uses stored_center_line as target."""
		_setup_window_manager(mock_window_manager)

		# Material A has stored_center_line=50.0 (its process center)
		resolved_flat = {
			"ucl": None,
			"lcl": None,
			"stored_sigma": 2.0,
			"stored_center_line": 50.0,
			"target_value": 55.0,  # spec nominal -- should NOT be used
			"usl": None,
			"lsl": None,
		}

		char_data = _make_char_data(
			short_run_mode="deviation",
			stored_center_line=100.0,  # char default
			stored_sigma=3.0,
			target_value=100.0,  # char target -- NOT used in multi-part
		)

		context = SampleContext(material_id=42)

		with patch(
			"cassini.core.material_resolver.MaterialResolver.resolve_flat",
			new_callable=AsyncMock,
			return_value=resolved_flat,
		):
			result = await spc_engine.process_sample(
				characteristic_id=1,
				measurements=[52.0],
				context=context,
				char_data=char_data,
			)

		assert isinstance(result, ProcessingResult)
		# Mean should be 52.0 - 50.0 = 2.0 (deviation from material center)
		assert abs(result.mean - 2.0) < 1e-9

	@pytest.mark.asyncio
	async def test_deviation_mode_single_part_uses_target_value(
		self, spc_engine, mock_sample_repo, mock_window_manager
	):
		"""Without material_id, deviation mode uses target_value (existing behavior)."""
		_setup_window_manager(mock_window_manager)

		char_data = _make_char_data(
			short_run_mode="deviation",
			stored_center_line=100.0,
			stored_sigma=3.0,
			target_value=95.0,
		)

		context = SampleContext()  # no material_id

		result = await spc_engine.process_sample(
			characteristic_id=1,
			measurements=[100.0],
			context=context,
			char_data=char_data,
		)

		assert isinstance(result, ProcessingResult)
		# Mean should be 100.0 - 95.0 = 5.0 (deviation from target_value)
		assert abs(result.mean - 5.0) < 1e-9


class TestMultiPartStandardizedMode:
	"""Multi-part short-run with standardized (Z-score) transformation."""

	@pytest.mark.asyncio
	async def test_standardized_mode_uses_material_params(
		self, spc_engine, mock_sample_repo, mock_window_manager, mock_char_repo
	):
		"""Standardized mode with material_id uses stored_center_line/stored_sigma."""
		_setup_window_manager(mock_window_manager)

		# Material B: center=25.0, sigma=1.5
		resolved_flat = {
			"ucl": None,
			"lcl": None,
			"stored_sigma": 1.5,
			"stored_center_line": 25.0,
			"target_value": None,
			"usl": None,
			"lsl": None,
		}

		char_data = _make_char_data(
			short_run_mode="standardized",
			stored_center_line=100.0,
			stored_sigma=3.0,
		)

		context = SampleContext(material_id=99)

		with patch(
			"cassini.core.material_resolver.MaterialResolver.resolve_flat",
			new_callable=AsyncMock,
			return_value=resolved_flat,
		):
			result = await spc_engine.process_sample(
				characteristic_id=1,
				measurements=[27.25],
				context=context,
				char_data=char_data,
			)

		assert isinstance(result, ProcessingResult)
		# n=1, so sigma_xbar = sigma = 1.5
		# mean = (27.25 - 25.0) / 1.5 = 1.5
		expected = (27.25 - 25.0) / 1.5
		assert abs(result.mean - expected) < 1e-9

	@pytest.mark.asyncio
	async def test_standardized_mode_subgroup_gt_1(
		self, spc_engine, mock_sample_repo, mock_window_manager, mock_char_repo
	):
		"""Standardized mode with subgroup_size > 1 uses sigma_xbar = sigma/sqrt(n)."""
		_setup_window_manager(mock_window_manager)

		resolved_flat = {
			"ucl": None,
			"lcl": None,
			"stored_sigma": 2.0,
			"stored_center_line": 30.0,
			"target_value": None,
			"usl": None,
			"lsl": None,
		}

		char_data = _make_char_data(
			short_run_mode="standardized",
			stored_center_line=100.0,
			stored_sigma=3.0,
		)
		char_data["subgroup_size"] = 4

		context = SampleContext(material_id=99)

		measurements = [31.0, 32.0, 33.0, 34.0]
		subgroup_mean = sum(measurements) / len(measurements)  # 32.5

		with patch(
			"cassini.core.material_resolver.MaterialResolver.resolve_flat",
			new_callable=AsyncMock,
			return_value=resolved_flat,
		):
			result = await spc_engine.process_sample(
				characteristic_id=1,
				measurements=measurements,
				context=context,
				char_data=char_data,
			)

		# sigma_xbar = 2.0 / sqrt(4) = 1.0
		# mean = (32.5 - 30.0) / 1.0 = 2.5
		expected = (subgroup_mean - 30.0) / (2.0 / math.sqrt(4))
		assert abs(result.mean - expected) < 1e-9


class TestMultiPartMissingBaseline:
	"""Reject materials without configured baselines."""

	@pytest.mark.asyncio
	async def test_deviation_mode_rejects_missing_center_line(
		self, spc_engine, mock_char_repo
	):
		"""Deviation mode rejects material with no stored_center_line."""
		# Material resolver returns None for stored_center_line
		resolved_flat = {
			"ucl": None,
			"lcl": None,
			"stored_sigma": None,
			"stored_center_line": None,
			"target_value": None,
			"usl": None,
			"lsl": None,
		}

		char_data = _make_char_data(
			short_run_mode="deviation",
			stored_center_line=None,  # also None at char level
			stored_sigma=None,
		)

		context = SampleContext(material_id=42)

		with patch(
			"cassini.core.material_resolver.MaterialResolver.resolve_flat",
			new_callable=AsyncMock,
			return_value=resolved_flat,
		):
			with pytest.raises(ValueError, match="no configured target"):
				await spc_engine.process_sample(
					characteristic_id=1,
					measurements=[100.0],
					context=context,
					char_data=char_data,
				)

	@pytest.mark.asyncio
	async def test_standardized_mode_rejects_missing_sigma(
		self, spc_engine, mock_char_repo
	):
		"""Standardized mode rejects material with no stored_sigma."""
		resolved_flat = {
			"ucl": None,
			"lcl": None,
			"stored_sigma": None,
			"stored_center_line": 50.0,  # target is OK
			"target_value": None,
			"usl": None,
			"lsl": None,
		}

		char_data = _make_char_data(
			short_run_mode="standardized",
			stored_center_line=None,
			stored_sigma=None,
		)

		context = SampleContext(material_id=42)

		with patch(
			"cassini.core.material_resolver.MaterialResolver.resolve_flat",
			new_callable=AsyncMock,
			return_value=resolved_flat,
		):
			with pytest.raises(ValueError, match="no configured sigma"):
				await spc_engine.process_sample(
					characteristic_id=1,
					measurements=[55.0],
					context=context,
					char_data=char_data,
				)

	@pytest.mark.asyncio
	async def test_standardized_mode_rejects_zero_sigma(
		self, spc_engine, mock_char_repo
	):
		"""Standardized mode rejects material with sigma = 0."""
		resolved_flat = {
			"ucl": None,
			"lcl": None,
			"stored_sigma": 0.0,
			"stored_center_line": 50.0,
			"target_value": None,
			"usl": None,
			"lsl": None,
		}

		char_data = _make_char_data(
			short_run_mode="standardized",
			stored_center_line=None,
			stored_sigma=None,
		)

		context = SampleContext(material_id=42)

		with patch(
			"cassini.core.material_resolver.MaterialResolver.resolve_flat",
			new_callable=AsyncMock,
			return_value=resolved_flat,
		):
			with pytest.raises(ValueError, match="no configured sigma"):
				await spc_engine.process_sample(
					characteristic_id=1,
					measurements=[55.0],
					context=context,
					char_data=char_data,
				)


class TestMaterialChangeover:
	"""Material changeover detection and logging."""

	@pytest.mark.asyncio
	async def test_changeover_logs_warning(
		self, spc_engine, mock_sample_repo, mock_window_manager, mock_char_repo
	):
		"""Changeover from material A to B logs a warning."""
		_setup_window_manager(mock_window_manager)
		# Previous material was 10
		mock_window_manager.get_last_material_id.return_value = 10

		resolved_flat = {
			"ucl": None,
			"lcl": None,
			"stored_sigma": 2.0,
			"stored_center_line": 50.0,
			"target_value": None,
			"usl": None,
			"lsl": None,
		}

		char_data = _make_char_data(
			short_run_mode="deviation",
			stored_center_line=100.0,
			stored_sigma=3.0,
		)

		context = SampleContext(material_id=20)  # different from 10

		with patch(
			"cassini.core.material_resolver.MaterialResolver.resolve_flat",
			new_callable=AsyncMock,
			return_value=resolved_flat,
		) as _, patch(
			"cassini.core.engine.spc_engine.logger"
		) as mock_logger:
			await spc_engine.process_sample(
				characteristic_id=1,
				measurements=[52.0],
				context=context,
				char_data=char_data,
			)

			# Should log changeover warning
			mock_logger.warning.assert_any_call(
				"material_changeover_detected",
				characteristic_id=1,
				previous_material_id=10,
				new_material_id=20,
				short_run_mode="deviation",
				hint=(
					"Nelson Rule run-test violations near changeover points "
					"may be artifacts of the material switch, not true "
					"process shifts."
				),
			)

	@pytest.mark.asyncio
	async def test_no_changeover_when_same_material(
		self, spc_engine, mock_sample_repo, mock_window_manager, mock_char_repo
	):
		"""Same material as last time does NOT log a warning."""
		_setup_window_manager(mock_window_manager)
		mock_window_manager.get_last_material_id.return_value = 20

		resolved_flat = {
			"ucl": None,
			"lcl": None,
			"stored_sigma": 2.0,
			"stored_center_line": 50.0,
			"target_value": None,
			"usl": None,
			"lsl": None,
		}

		char_data = _make_char_data(
			short_run_mode="deviation",
			stored_center_line=100.0,
			stored_sigma=3.0,
		)

		context = SampleContext(material_id=20)

		with patch(
			"cassini.core.material_resolver.MaterialResolver.resolve_flat",
			new_callable=AsyncMock,
			return_value=resolved_flat,
		) as _, patch(
			"cassini.core.engine.spc_engine.logger"
		) as mock_logger:
			await spc_engine.process_sample(
				characteristic_id=1,
				measurements=[52.0],
				context=context,
				char_data=char_data,
			)

			# Should NOT have changeover warning
			for call_args in mock_logger.warning.call_args_list:
				assert call_args[0][0] != "material_changeover_detected"

	@pytest.mark.asyncio
	async def test_set_last_material_id_called_after_processing(
		self, spc_engine, mock_sample_repo, mock_window_manager, mock_char_repo
	):
		"""After processing, set_last_material_id is called with current material."""
		_setup_window_manager(mock_window_manager)

		resolved_flat = {
			"ucl": None,
			"lcl": None,
			"stored_sigma": 2.0,
			"stored_center_line": 50.0,
			"target_value": None,
			"usl": None,
			"lsl": None,
		}

		char_data = _make_char_data(
			short_run_mode="deviation",
			stored_center_line=100.0,
			stored_sigma=3.0,
		)

		context = SampleContext(material_id=42)

		with patch(
			"cassini.core.material_resolver.MaterialResolver.resolve_flat",
			new_callable=AsyncMock,
			return_value=resolved_flat,
		):
			await spc_engine.process_sample(
				characteristic_id=1,
				measurements=[52.0],
				context=context,
				char_data=char_data,
			)

		mock_window_manager.set_last_material_id.assert_called_once_with(1, 42)


class TestMultiPartWithNoShortRunMode:
	"""Material override resolution still works without short_run_mode."""

	@pytest.mark.asyncio
	async def test_material_override_without_short_run_is_fine(
		self, spc_engine, mock_sample_repo, mock_window_manager, mock_char_repo
	):
		"""Material override without short_run_mode works normally (no transformation)."""
		_setup_window_manager(mock_window_manager, value=100.0)

		resolved_flat = {
			"ucl": 115.0,
			"lcl": 85.0,
			"stored_sigma": 5.0,
			"stored_center_line": 100.0,
			"target_value": None,
			"usl": None,
			"lsl": None,
		}

		char_data = _make_char_data(
			short_run_mode=None,  # no short-run mode
			stored_center_line=100.0,
			stored_sigma=3.0,
		)

		context = SampleContext(material_id=42)

		with patch(
			"cassini.core.material_resolver.MaterialResolver.resolve_flat",
			new_callable=AsyncMock,
			return_value=resolved_flat,
		):
			result = await spc_engine.process_sample(
				characteristic_id=1,
				measurements=[102.0],
				context=context,
				char_data=char_data,
			)

		# No transformation applied — raw mean
		assert abs(result.mean - 102.0) < 1e-9


class TestRollingWindowManagerChangeover:
	"""Test the RollingWindowManager changeover tracking methods."""

	def test_get_last_material_id_returns_none_initially(self):
		"""No material seen yet returns None."""
		mgr = RollingWindowManager()
		assert mgr.get_last_material_id(1) is None

	def test_set_and_get_last_material_id(self):
		"""Set and retrieve last material."""
		mgr = RollingWindowManager()
		mgr.set_last_material_id(1, 42)
		assert mgr.get_last_material_id(1) == 42

	def test_set_overwrites_previous(self):
		"""Setting a new material overwrites the previous."""
		mgr = RollingWindowManager()
		mgr.set_last_material_id(1, 10)
		mgr.set_last_material_id(1, 20)
		assert mgr.get_last_material_id(1) == 20

	def test_per_characteristic_isolation(self):
		"""Different characteristics have independent last-material tracking."""
		mgr = RollingWindowManager()
		mgr.set_last_material_id(1, 10)
		mgr.set_last_material_id(2, 20)
		assert mgr.get_last_material_id(1) == 10
		assert mgr.get_last_material_id(2) == 20
