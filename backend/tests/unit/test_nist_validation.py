"""NIST Reference Validation Tests
===================================

Validates Cassini's SPC engines against certified reference values from:
- NIST Statistical Reference Datasets (StRD)
- NIST/SEMATECH e-Handbook of Statistical Methods
- Montgomery "Introduction to Statistical Quality Control"
- R qcc package v2.7

These tests serve as regression anchors: if a code change shifts any
certified value beyond the published tolerance, the test fails immediately.
"""

from __future__ import annotations

import numpy as np
import pytest

from cassini.reference.datasets import (
	ATTRIBUTE_DATASETS,
	CAPABILITY_DATASETS,
	IMR_DATASETS_WITH_LIMITS,
	NIST_STRD_DATASETS,
	SUBGROUP_DATASETS,
	AttributeDataset,
	IndividualsDataset,
	SubgroupDataset,
)
from cassini.utils.statistics import (
	calculate_imr_limits,
	calculate_xbar_r_limits,
	estimate_sigma_rbar,
)
from cassini.core.capability import calculate_capability
from cassini.core.engine.attribute_engine import calculate_attribute_limits

# Import adapters from the reference conftest
from tests.reference.conftest import (
	attribute_to_samples,
	flatten_subgroups,
	subgroups_to_means_ranges,
)

pytestmark = [pytest.mark.nist, pytest.mark.validation]


def _tol(certified_value: float, precision: int) -> dict:
	"""Build pytest.approx tolerance kwargs for a certified reference value.

	Reference values are rounded to `precision` significant digits (NIST StRD)
	or `precision` decimal places (textbook). We use the tighter of:
	  - rel = 10^(-precision+1)  (one digit of slack for rounding)
	  - abs = 0.5 * 10^(-decimal_places)  where decimal_places is inferred
	    from the certified value string representation

	For zero values, only abs tolerance is meaningful.
	"""
	if certified_value == 0.0:
		return {"abs": 1e-10}

	# Relative tolerance: one decade looser than precision field to
	# accommodate rounding in published tables
	rel = 10 ** -(precision - 1)

	# Absolute tolerance: half a unit in the last decimal place of the
	# certified value. This handles textbook values rounded to few places
	# (e.g., Cp = 1.70 has abs_tol = 0.005).
	s = f"{certified_value:.15g}"
	if "." in s:
		decimal_places = len(s.rstrip("0").split(".")[1])
	else:
		decimal_places = 0
	abs_tol = 0.5 * 10 ** -decimal_places

	return {"rel": rel, "abs": abs_tol}


# ---------------------------------------------------------------------------
# 1. NIST Data Integrity
# ---------------------------------------------------------------------------


class TestNISTDataIntegrity:
	"""Validate transcription of NIST StRD datasets.

	Uses numpy to verify that the raw data arrays match NIST-certified
	sample statistics (mean and standard deviation). This validates that
	the data was transcribed correctly, NOT that Cassini computes anything.
	"""

	@pytest.mark.parametrize(
		"dataset",
		NIST_STRD_DATASETS,
		ids=lambda d: d.name,
	)
	def test_certified_mean(self, dataset: IndividualsDataset) -> None:
		computed = float(np.mean(dataset.values))
		assert computed == pytest.approx(
			dataset.certified_mean, **_tol(dataset.certified_mean, dataset.precision)
		)

	@pytest.mark.parametrize(
		"dataset",
		NIST_STRD_DATASETS,
		ids=lambda d: d.name,
	)
	def test_certified_std_dev(self, dataset: IndividualsDataset) -> None:
		computed = float(np.std(dataset.values, ddof=1))
		assert computed == pytest.approx(
			dataset.certified_std, **_tol(dataset.certified_std, dataset.precision)
		)

	@pytest.mark.parametrize(
		"dataset",
		NIST_STRD_DATASETS,
		ids=lambda d: d.name,
	)
	def test_observation_count(self, dataset: IndividualsDataset) -> None:
		assert len(dataset.values) > 0


# ---------------------------------------------------------------------------
# 2. I-MR Control Limits
# ---------------------------------------------------------------------------


class TestIMRControlLimits:
	"""Validate I-MR chart limits against NIST e-Handbook certified values."""

	@pytest.mark.parametrize(
		"dataset",
		IMR_DATASETS_WITH_LIMITS,
		ids=lambda d: d.name,
	)
	def test_i_chart_center_line(self, dataset: IndividualsDataset) -> None:
		result = calculate_imr_limits(list(dataset.values))
		assert result.xbar_limits.center_line == pytest.approx(
			dataset.certified_i_chart.center_line,
			**_tol(dataset.certified_i_chart.center_line, dataset.precision),
		)

	@pytest.mark.parametrize(
		"dataset",
		IMR_DATASETS_WITH_LIMITS,
		ids=lambda d: d.name,
	)
	def test_i_chart_ucl(self, dataset: IndividualsDataset) -> None:
		result = calculate_imr_limits(list(dataset.values))
		assert result.xbar_limits.ucl == pytest.approx(
			dataset.certified_i_chart.ucl,
			**_tol(dataset.certified_i_chart.ucl, dataset.precision),
		)

	@pytest.mark.parametrize(
		"dataset",
		IMR_DATASETS_WITH_LIMITS,
		ids=lambda d: d.name,
	)
	def test_i_chart_lcl(self, dataset: IndividualsDataset) -> None:
		result = calculate_imr_limits(list(dataset.values))
		assert result.xbar_limits.lcl == pytest.approx(
			dataset.certified_i_chart.lcl,
			**_tol(dataset.certified_i_chart.lcl, dataset.precision),
		)

	@pytest.mark.parametrize(
		"dataset",
		IMR_DATASETS_WITH_LIMITS,
		ids=lambda d: d.name,
	)
	def test_mr_chart_center_line(self, dataset: IndividualsDataset) -> None:
		result = calculate_imr_limits(list(dataset.values))
		assert result.r_limits.center_line == pytest.approx(
			dataset.certified_mr_chart.center_line,
			**_tol(dataset.certified_mr_chart.center_line, dataset.precision),
		)

	@pytest.mark.parametrize(
		"dataset",
		IMR_DATASETS_WITH_LIMITS,
		ids=lambda d: d.name,
	)
	def test_mr_chart_ucl(self, dataset: IndividualsDataset) -> None:
		result = calculate_imr_limits(list(dataset.values))
		assert result.r_limits.ucl == pytest.approx(
			dataset.certified_mr_chart.ucl,
			**_tol(dataset.certified_mr_chart.ucl, dataset.precision),
		)

	@pytest.mark.parametrize(
		"dataset",
		IMR_DATASETS_WITH_LIMITS,
		ids=lambda d: d.name,
	)
	def test_mr_chart_lcl(self, dataset: IndividualsDataset) -> None:
		result = calculate_imr_limits(list(dataset.values))
		assert result.r_limits.lcl == pytest.approx(
			dataset.certified_mr_chart.lcl,
			**_tol(dataset.certified_mr_chart.lcl, dataset.precision),
		)


# ---------------------------------------------------------------------------
# 3. X-bar/R Control Limits
# ---------------------------------------------------------------------------


class TestXbarRControlLimits:
	"""Validate X-bar/R chart limits against Montgomery/qcc certified values."""

	@pytest.mark.parametrize(
		"dataset",
		SUBGROUP_DATASETS,
		ids=lambda d: d.name,
	)
	def test_xbar_center_line(self, dataset: SubgroupDataset) -> None:
		means, ranges = subgroups_to_means_ranges(dataset.phase1_subgroups)
		result = calculate_xbar_r_limits(means, ranges, dataset.subgroup_size)
		assert result.xbar_limits.center_line == pytest.approx(
			dataset.certified_xbar_chart.center_line,
			**_tol(dataset.certified_xbar_chart.center_line, dataset.precision),
		)

	@pytest.mark.parametrize(
		"dataset",
		SUBGROUP_DATASETS,
		ids=lambda d: d.name,
	)
	def test_xbar_ucl(self, dataset: SubgroupDataset) -> None:
		means, ranges = subgroups_to_means_ranges(dataset.phase1_subgroups)
		result = calculate_xbar_r_limits(means, ranges, dataset.subgroup_size)
		assert result.xbar_limits.ucl == pytest.approx(
			dataset.certified_xbar_chart.ucl,
			**_tol(dataset.certified_xbar_chart.ucl, dataset.precision),
		)

	@pytest.mark.parametrize(
		"dataset",
		SUBGROUP_DATASETS,
		ids=lambda d: d.name,
	)
	def test_xbar_lcl(self, dataset: SubgroupDataset) -> None:
		means, ranges = subgroups_to_means_ranges(dataset.phase1_subgroups)
		result = calculate_xbar_r_limits(means, ranges, dataset.subgroup_size)
		assert result.xbar_limits.lcl == pytest.approx(
			dataset.certified_xbar_chart.lcl,
			**_tol(dataset.certified_xbar_chart.lcl, dataset.precision),
		)

	@pytest.mark.parametrize(
		"dataset",
		SUBGROUP_DATASETS,
		ids=lambda d: d.name,
	)
	def test_r_chart_center_line(self, dataset: SubgroupDataset) -> None:
		means, ranges = subgroups_to_means_ranges(dataset.phase1_subgroups)
		result = calculate_xbar_r_limits(means, ranges, dataset.subgroup_size)
		assert result.r_limits.center_line == pytest.approx(
			dataset.certified_r_chart.center_line,
			**_tol(dataset.certified_r_chart.center_line, dataset.precision),
		)

	@pytest.mark.parametrize(
		"dataset",
		SUBGROUP_DATASETS,
		ids=lambda d: d.name,
	)
	def test_r_chart_ucl(self, dataset: SubgroupDataset) -> None:
		means, ranges = subgroups_to_means_ranges(dataset.phase1_subgroups)
		result = calculate_xbar_r_limits(means, ranges, dataset.subgroup_size)
		assert result.r_limits.ucl == pytest.approx(
			dataset.certified_r_chart.ucl,
			**_tol(dataset.certified_r_chart.ucl, dataset.precision),
		)


# ---------------------------------------------------------------------------
# 4. Capability Indices
# ---------------------------------------------------------------------------


class TestCapabilityIndices:
	"""Validate Cp/Cpk against Montgomery certified values."""

	@pytest.mark.parametrize(
		"dataset",
		CAPABILITY_DATASETS,
		ids=lambda d: d.name,
	)
	def test_cp(self, dataset: SubgroupDataset) -> None:
		_, ranges = subgroups_to_means_ranges(dataset.phase1_subgroups)
		sigma_within = estimate_sigma_rbar(ranges, dataset.subgroup_size)
		values = flatten_subgroups(dataset.phase1_subgroups)

		result = calculate_capability(
			values=values,
			usl=dataset.spec_limits.usl,
			lsl=dataset.spec_limits.lsl,
			target=dataset.spec_limits.target,
			sigma_within=sigma_within,
		)
		assert result.cp == pytest.approx(
			dataset.certified_capability.cp,
			**_tol(dataset.certified_capability.cp, dataset.precision),
		)

	@pytest.mark.parametrize(
		"dataset",
		CAPABILITY_DATASETS,
		ids=lambda d: d.name,
	)
	def test_cpk(self, dataset: SubgroupDataset) -> None:
		_, ranges = subgroups_to_means_ranges(dataset.phase1_subgroups)
		sigma_within = estimate_sigma_rbar(ranges, dataset.subgroup_size)
		values = flatten_subgroups(dataset.phase1_subgroups)

		result = calculate_capability(
			values=values,
			usl=dataset.spec_limits.usl,
			lsl=dataset.spec_limits.lsl,
			target=dataset.spec_limits.target,
			sigma_within=sigma_within,
		)
		assert result.cpk == pytest.approx(
			dataset.certified_capability.cpk,
			**_tol(dataset.certified_capability.cpk, dataset.precision),
		)


# ---------------------------------------------------------------------------
# 5. Attribute Chart Limits
# ---------------------------------------------------------------------------


class TestAttributeChartLimits:
	"""Validate attribute chart limits against NIST/Montgomery/qcc certified values."""

	@pytest.mark.parametrize(
		"dataset",
		ATTRIBUTE_DATASETS,
		ids=lambda d: d.name,
	)
	def test_center_line(self, dataset: AttributeDataset) -> None:
		samples = attribute_to_samples(dataset)
		result = calculate_attribute_limits(dataset.chart_type, samples)
		assert result.center_line == pytest.approx(
			dataset.certified_center,
			**_tol(dataset.certified_center, dataset.precision),
		)

	@pytest.mark.parametrize(
		"dataset",
		ATTRIBUTE_DATASETS,
		ids=lambda d: d.name,
	)
	def test_ucl(self, dataset: AttributeDataset) -> None:
		samples = attribute_to_samples(dataset)
		result = calculate_attribute_limits(dataset.chart_type, samples)
		assert result.ucl == pytest.approx(
			dataset.certified_ucl,
			**_tol(dataset.certified_ucl, dataset.precision),
		)

	@pytest.mark.parametrize(
		"dataset",
		ATTRIBUTE_DATASETS,
		ids=lambda d: d.name,
	)
	def test_lcl(self, dataset: AttributeDataset) -> None:
		samples = attribute_to_samples(dataset)
		result = calculate_attribute_limits(dataset.chart_type, samples)
		assert result.lcl == pytest.approx(
			dataset.certified_lcl,
			**_tol(dataset.certified_lcl, dataset.precision),
		)
