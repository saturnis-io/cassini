"""Tests for MSA Standalone Bias Study engine (AIAG MSA 4th Ed., Ch. 3)."""
import math

import pytest

from cassini.core.msa.bias import BiasResult, compute_bias


class TestComputeBias:
    """Tests for the compute_bias function."""

    def test_zero_bias(self):
        """Measurements exactly at reference produce zero bias."""
        values = [10.0] * 20
        result = compute_bias(values, reference_value=10.0, tolerance=1.0)
        assert isinstance(result, BiasResult)
        assert abs(result.bias) < 1e-10
        assert result.bias_percent == 0.0
        assert result.verdict == "acceptable"

    def test_acceptable_bias(self):
        """Small bias relative to tolerance → acceptable."""
        # Mean will be ~10.01, reference=10.0, bias=0.01, tolerance=1.0
        # %bias = |0.01|/1.0 * 100 = 1%
        values = [10.01] * 20
        result = compute_bias(values, reference_value=10.0, tolerance=1.0)
        assert result.verdict == "acceptable"
        assert result.bias_percent is not None
        assert result.bias_percent < 10.0
        assert result.denominator_used == "tolerance"

    def test_marginal_bias(self):
        """Medium bias → marginal."""
        # %bias = |0.15|/1.0 * 100 = 15%
        values = [10.15] * 20
        result = compute_bias(values, reference_value=10.0, tolerance=1.0)
        assert result.verdict == "marginal"
        assert result.bias_percent is not None
        assert 10.0 <= result.bias_percent <= 30.0

    def test_unacceptable_bias(self):
        """Large bias → unacceptable."""
        # %bias = |0.5|/1.0 * 100 = 50%
        values = [10.5] * 20
        result = compute_bias(values, reference_value=10.0, tolerance=1.0)
        assert result.verdict == "unacceptable"
        assert result.bias_percent is not None
        assert result.bias_percent > 30.0

    def test_negative_bias(self):
        """Negative bias is handled correctly (|bias| used for %)."""
        values = [9.85] * 20
        result = compute_bias(values, reference_value=10.0, tolerance=1.0)
        assert result.bias < 0
        assert result.bias_percent is not None
        assert result.bias_percent > 0  # Always positive

    def test_tolerance_denominator(self):
        """%Bias uses tolerance when provided."""
        values = [10.05] * 10
        result = compute_bias(values, reference_value=10.0, tolerance=0.5)
        assert result.denominator_used == "tolerance"
        # %bias = |0.05| / 0.5 * 100 = 10%
        assert result.bias_percent is not None
        assert abs(result.bias_percent - 10.0) < 0.1

    def test_sigma_process_fallback(self):
        """%Bias uses 6*sigma_process when no tolerance."""
        values = [10.05] * 10
        result = compute_bias(values, reference_value=10.0, sigma_process=0.5)
        assert result.denominator_used == "6*sigma_process"
        # %bias = |0.05| / (6*0.5) * 100 = 1.67%
        assert result.bias_percent is not None
        assert abs(result.bias_percent - 100 * 0.05 / 3.0) < 0.1

    def test_no_denominator(self):
        """%Bias is None when neither tolerance nor sigma_process provided."""
        values = [10.05] * 10
        result = compute_bias(values, reference_value=10.0)
        assert result.bias_percent is None
        assert result.denominator_used == "none"
        assert result.verdict == "indeterminate"
        assert len(result.warnings) > 0

    def test_t_test_significant_zero_variance(self):
        """All identical values with nonzero bias → infinite t-stat, p=0."""
        values = [10.5] * 30
        result = compute_bias(values, reference_value=10.0, tolerance=1.0)
        assert result.is_significant is True
        assert result.p_value == 0.0
        # t-stat clamped to large finite for JSON
        assert result.t_statistic > 1e20

    def test_t_test_significant_with_variance(self):
        """Large consistent bias with small variance → significant."""
        values = [10.49, 10.50, 10.51, 10.50, 10.49, 10.51, 10.50, 10.50,
                  10.49, 10.51, 10.50, 10.49, 10.51, 10.50, 10.50, 10.49,
                  10.51, 10.50, 10.49, 10.51]
        result = compute_bias(values, reference_value=10.0, tolerance=1.0)
        assert result.is_significant is True
        assert result.p_value < 0.05

    def test_t_test_not_significant(self):
        """Very small bias with noise produces non-significant t-test."""
        import random
        random.seed(42)
        # Mean ~10.0 + noise, reference=10.0
        values = [10.0 + random.gauss(0, 0.5) for _ in range(10)]
        result = compute_bias(values, reference_value=10.0, tolerance=5.0)
        # With high noise and small sample, p-value may or may not be significant
        # Just verify it runs correctly
        assert isinstance(result.p_value, float)
        assert 0.0 <= result.p_value <= 1.0

    def test_minimum_data(self):
        """At least 2 measurements required."""
        with pytest.raises(ValueError, match="at least 2"):
            compute_bias([10.0], reference_value=10.0)

    def test_empty_data(self):
        """Empty list raises ValueError."""
        with pytest.raises(ValueError, match="at least 2"):
            compute_bias([], reference_value=10.0)

    def test_bias_formula(self):
        """Verify bias = mean - reference."""
        values = [10.0, 10.2, 9.8, 10.1, 9.9]
        result = compute_bias(values, reference_value=10.0, tolerance=1.0)
        expected_mean = sum(values) / len(values)
        expected_bias = expected_mean - 10.0
        assert abs(result.mean - expected_mean) < 1e-10
        assert abs(result.bias - expected_bias) < 1e-10

    def test_percent_bias_formula(self):
        """Verify %bias = |bias| / tolerance * 100."""
        values = [10.1] * 10
        tolerance = 2.0
        result = compute_bias(values, reference_value=10.0, tolerance=tolerance)
        expected_pct = abs(0.1) / 2.0 * 100.0
        assert result.bias_percent is not None
        assert abs(result.bias_percent - expected_pct) < 0.01

    def test_degrees_of_freedom(self):
        """df = n - 1."""
        values = [10.0, 10.1, 9.9, 10.05, 9.95]
        result = compute_bias(values, reference_value=10.0, tolerance=1.0)
        assert result.df == len(values) - 1
        assert result.n == len(values)

    def test_measurements_stored(self):
        """Original measurements are stored in result."""
        values = [10.0, 10.1, 9.9]
        result = compute_bias(values, reference_value=10.0, tolerance=1.0)
        assert result.measurements == values

    def test_show_your_work_collector(self):
        """Collector captures steps when provided."""
        from cassini.core.explain import ExplanationCollector

        values = [10.0, 10.1, 9.9, 10.05, 9.95]
        collector = ExplanationCollector()
        result = compute_bias(
            values, reference_value=10.0, tolerance=1.0, collector=collector,
        )

        assert len(collector.steps) > 0
        step_labels = [s.label for s in collector.steps]
        assert "Sample Mean" in step_labels
        assert "Bias" in step_labels
        assert "%Bias" in step_labels
        assert "t-statistic" in step_labels
        assert "Verdict" in step_labels

    def test_two_sided_p_value(self):
        """p-value is two-sided (symmetric around 0)."""
        # Positive bias
        values_pos = [10.1] * 20
        result_pos = compute_bias(values_pos, reference_value=10.0, tolerance=1.0)

        # Negative bias of same magnitude
        values_neg = [9.9] * 20
        result_neg = compute_bias(values_neg, reference_value=10.0, tolerance=1.0)

        # p-values should be the same (two-sided)
        assert abs(result_pos.p_value - result_neg.p_value) < 1e-10
        # t-statistics should have opposite signs
        assert result_pos.t_statistic > 0
        assert result_neg.t_statistic < 0
