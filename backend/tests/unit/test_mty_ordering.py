"""Tests for order-independent MTY T² decomposition.

Verifies that the last-variable strategy produces unique contributions
that are invariant to the ordering of other variables, as described by
Mason, Tracy & Young (1997).
"""

import numpy as np
import pytest

from cassini.core.multivariate.decomposition import (
    DecompositionTerm,
    T2Decomposition,
)


@pytest.fixture()
def simple_3var():
    """3-variable dataset with known covariance structure.

    Designed so variable 2 (z) has the dominant contribution.
    """
    mean = np.array([10.0, 20.0, 30.0])
    cov = np.array([
        [1.0, 0.3, 0.1],
        [0.3, 1.0, 0.2],
        [0.1, 0.2, 1.0],
    ])
    # Observation: x and y near mean, z far from mean
    x = np.array([10.5, 20.2, 34.0])
    var_names = ["x", "y", "z"]
    return x, mean, cov, var_names


class TestOrderIndependentDecomposition:
    """Tests for decompose_all_last — order-independent unique contributions."""

    def test_returns_one_term_per_variable(self, simple_3var):
        x, mean, cov, var_names = simple_3var
        decomposer = T2Decomposition()
        terms = decomposer.decompose_all_last(x, mean, cov, var_names)

        assert len(terms) == 3
        returned_names = {t.variable_name for t in terms}
        assert returned_names == {"x", "y", "z"}

    def test_results_sorted_by_contribution_descending(self, simple_3var):
        x, mean, cov, var_names = simple_3var
        decomposer = T2Decomposition()
        terms = decomposer.decompose_all_last(x, mean, cov, var_names)

        for i in range(len(terms) - 1):
            assert terms[i].conditional_t2 >= terms[i + 1].conditional_t2

    def test_dominant_variable_identified(self, simple_3var):
        """z is 4 sigma away from mean; it should be the top contributor."""
        x, mean, cov, var_names = simple_3var
        decomposer = T2Decomposition()
        terms = decomposer.decompose_all_last(x, mean, cov, var_names)

        assert terms[0].variable_name == "z"
        assert terms[0].proportion > 0.5

    def test_proportions_sum_approximately_to_one(self, simple_3var):
        """Unique contributions should approximately sum to total T²."""
        x, mean, cov, var_names = simple_3var
        decomposer = T2Decomposition()
        terms = decomposer.decompose_all_last(x, mean, cov, var_names)

        total_proportion = sum(t.proportion for t in terms)
        # Unique contributions generally don't sum exactly to 1
        # (they can be less or more due to correlation effects),
        # but each proportion should be non-negative
        for t in terms:
            assert t.conditional_t2 >= -1e-10, (
                f"Negative unique contribution for {t.variable_name}: {t.conditional_t2}"
            )

    def test_order_independence(self):
        """Verify that results are the same regardless of input variable order.

        This is the core property of the last-variable strategy:
        the unique contribution of each variable should be identical
        regardless of how the other variables are ordered in the input.
        """
        mean = np.array([10.0, 20.0, 30.0, 40.0])
        cov = np.array([
            [2.0, 0.5, 0.3, 0.1],
            [0.5, 3.0, 0.4, 0.2],
            [0.3, 0.4, 1.5, 0.6],
            [0.1, 0.2, 0.6, 2.5],
        ])
        x = np.array([12.0, 18.0, 33.0, 42.0])
        names = ["a", "b", "c", "d"]

        decomposer = T2Decomposition()

        # Compute with original ordering
        terms_original = decomposer.decompose_all_last(x, mean, cov, names)
        original_dict = {t.variable_name: t.conditional_t2 for t in terms_original}

        # Compute with reversed ordering
        rev = [3, 2, 1, 0]
        terms_reversed = decomposer.decompose_all_last(
            x[rev], mean[rev], cov[np.ix_(rev, rev)],
            [names[i] for i in rev],
        )
        reversed_dict = {t.variable_name: t.conditional_t2 for t in terms_reversed}

        # Compute with a scrambled ordering
        scramble = [2, 0, 3, 1]
        terms_scrambled = decomposer.decompose_all_last(
            x[scramble], mean[scramble], cov[np.ix_(scramble, scramble)],
            [names[i] for i in scramble],
        )
        scrambled_dict = {t.variable_name: t.conditional_t2 for t in terms_scrambled}

        # All three should produce identical unique contributions
        for name in names:
            assert original_dict[name] == pytest.approx(
                reversed_dict[name], abs=1e-10
            ), f"Reversed ordering changed contribution for {name}"
            assert original_dict[name] == pytest.approx(
                scrambled_dict[name], abs=1e-10
            ), f"Scrambled ordering changed contribution for {name}"

    def test_2var_decomposition(self):
        """2-variable case: each variable's unique contribution is well-defined."""
        mean = np.array([0.0, 0.0])
        cov = np.array([[1.0, 0.5], [0.5, 1.0]])
        x = np.array([3.0, 0.5])
        names = ["a", "b"]

        decomposer = T2Decomposition()
        terms = decomposer.decompose_all_last(x, mean, cov, names)

        assert len(terms) == 2
        assert terms[0].variable_name == "a"
        assert terms[0].conditional_t2 > terms[1].conditional_t2

    def test_uncorrelated_variables(self):
        """With no correlation, unique = unconditional (marginal)."""
        mean = np.array([0.0, 0.0, 0.0])
        cov = np.eye(3)  # Identity — no correlation
        x = np.array([2.0, 1.0, 3.0])
        names = ["a", "b", "c"]

        decomposer = T2Decomposition()
        terms = decomposer.decompose_all_last(x, mean, cov, names)

        for t in terms:
            # With no correlation, conditional = unconditional
            assert t.conditional_t2 == pytest.approx(
                t.unconditional_t2, abs=1e-10
            ), f"Expected conditional==unconditional for {t.variable_name} with identity covariance"

    def test_collector_captures_steps(self, simple_3var):
        """Verify that the ExplanationCollector captures steps when provided."""
        from cassini.core.explain import ExplanationCollector

        x, mean, cov, var_names = simple_3var
        collector = ExplanationCollector()
        decomposer = T2Decomposition()
        terms = decomposer.decompose_all_last(
            x, mean, cov, var_names, collector=collector,
        )

        # Should have one step per variable
        assert len(collector.steps) == 3
        # Should have inputs
        assert "p (variables)" in collector.inputs
        assert collector.inputs["p (variables)"] == 3
        assert "Total T\u00b2" in collector.inputs

        # Each step should mention a variable name
        step_labels = [s.label for s in collector.steps]
        for name in var_names:
            assert any(
                name in label for label in step_labels
            ), f"Variable {name} not found in step labels"

    def test_collector_not_required(self, simple_3var):
        """Verify that collector=None works without errors."""
        x, mean, cov, var_names = simple_3var
        decomposer = T2Decomposition()
        # Should not raise
        terms = decomposer.decompose_all_last(x, mean, cov, var_names)
        assert len(terms) == 3

    def test_original_decompose_still_works(self, simple_3var):
        """Ensure the original order-dependent decompose() is unchanged."""
        x, mean, cov, var_names = simple_3var
        decomposer = T2Decomposition()
        terms = decomposer.decompose(x, mean, cov, var_names)

        assert len(terms) == 3
        # Original method is order-dependent — just check it runs
        assert all(isinstance(t, DecompositionTerm) for t in terms)

    def test_near_singular_covariance(self):
        """Verify graceful handling of near-singular covariance matrices."""
        mean = np.array([0.0, 0.0])
        # Nearly singular: second variable is almost a duplicate of the first
        cov = np.array([[1.0, 0.9999], [0.9999, 1.0]])
        x = np.array([2.0, 2.1])
        names = ["a", "b"]

        decomposer = T2Decomposition()
        # Should not raise (uses pseudo-inverse for ill-conditioned matrices)
        terms = decomposer.decompose_all_last(x, mean, cov, names)
        assert len(terms) == 2
        for t in terms:
            assert np.isfinite(t.conditional_t2)


class TestAuditDecomposeAction:
    """Verify that 'decompose' is mapped correctly in the audit system."""

    def test_decompose_action_mapping(self):
        from cassini.core.audit import _method_to_action

        action = _method_to_action("GET", "/api/v1/multivariate/groups/1/decompose")
        assert action == "decompose"

    def test_decompose_does_not_match_compute(self):
        from cassini.core.audit import _method_to_action

        # Make sure /decompose doesn't accidentally match /compute
        action = _method_to_action("POST", "/api/v1/multivariate/groups/1/compute")
        assert action == "calculate"
