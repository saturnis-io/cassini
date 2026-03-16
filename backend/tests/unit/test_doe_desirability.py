"""Tests for DOE multi-response desirability optimization.

Verifies individual desirability functions (maximize, minimize, target),
overall desirability computation (geometric weighted mean), edge cases,
and Show Your Work integration.

Reference: Derringer, G. & Suich, R. (1980). Simultaneous Optimization
of Several Response Variables. JQT, 12(4), 214-219.
"""
from __future__ import annotations

import math

import numpy as np
import pytest

from cassini.core.doe.analysis import (
    DesirabilityConfig,
    DesirabilityResult,
    compute_individual_desirability,
    compute_overall_desirability,
)
from cassini.core.explain import ExplanationCollector


# ---------------------------------------------------------------------------
# Maximize desirability
# ---------------------------------------------------------------------------


class TestDesirabilityMaximize:
    """d=0 if y<=L; d=((y-L)/(T-L))^r if L<y<T; d=1 if y>=T."""

    def _config(self, r: float = 1.0) -> DesirabilityConfig:
        return DesirabilityConfig(
            name="yield",
            direction="maximize",
            lower=50.0,
            target=100.0,
            upper=100.0,
            shape=r,
        )

    def test_below_lower_returns_zero(self):
        assert compute_individual_desirability(30.0, self._config()) == 0.0

    def test_at_lower_returns_zero(self):
        assert compute_individual_desirability(50.0, self._config()) == 0.0

    def test_at_target_returns_one(self):
        assert compute_individual_desirability(100.0, self._config()) == 1.0

    def test_above_target_returns_one(self):
        assert compute_individual_desirability(120.0, self._config()) == 1.0

    def test_midpoint_linear(self):
        """Linear shape (r=1): midpoint should give 0.5."""
        d = compute_individual_desirability(75.0, self._config(r=1.0))
        assert abs(d - 0.5) < 1e-10

    def test_midpoint_concave(self):
        """Concave shape (r=2): midpoint should give 0.25."""
        d = compute_individual_desirability(75.0, self._config(r=2.0))
        assert abs(d - 0.25) < 1e-10

    def test_midpoint_convex(self):
        """Convex shape (r=0.5): midpoint should give sqrt(0.5)."""
        d = compute_individual_desirability(75.0, self._config(r=0.5))
        assert abs(d - math.sqrt(0.5)) < 1e-10

    def test_near_target(self):
        d = compute_individual_desirability(99.0, self._config(r=1.0))
        expected = (99.0 - 50.0) / (100.0 - 50.0)
        assert abs(d - expected) < 1e-10


# ---------------------------------------------------------------------------
# Minimize desirability
# ---------------------------------------------------------------------------


class TestDesirabilityMinimize:
    """d=1 if y<=T; d=((U-y)/(U-T))^r if T<y<U; d=0 if y>=U."""

    def _config(self, r: float = 1.0) -> DesirabilityConfig:
        return DesirabilityConfig(
            name="defects",
            direction="minimize",
            lower=0.0,
            target=0.0,
            upper=10.0,
            shape=r,
        )

    def test_at_target_returns_one(self):
        assert compute_individual_desirability(0.0, self._config()) == 1.0

    def test_below_target_returns_one(self):
        assert compute_individual_desirability(-5.0, self._config()) == 1.0

    def test_at_upper_returns_zero(self):
        assert compute_individual_desirability(10.0, self._config()) == 0.0

    def test_above_upper_returns_zero(self):
        assert compute_individual_desirability(15.0, self._config()) == 0.0

    def test_midpoint_linear(self):
        """Linear shape (r=1): midpoint should give 0.5."""
        d = compute_individual_desirability(5.0, self._config(r=1.0))
        assert abs(d - 0.5) < 1e-10

    def test_midpoint_concave(self):
        """Concave shape (r=2): midpoint should give 0.25."""
        d = compute_individual_desirability(5.0, self._config(r=2.0))
        assert abs(d - 0.25) < 1e-10

    def test_near_target(self):
        d = compute_individual_desirability(1.0, self._config(r=1.0))
        expected = (10.0 - 1.0) / (10.0 - 0.0)
        assert abs(d - expected) < 1e-10


# ---------------------------------------------------------------------------
# Target desirability
# ---------------------------------------------------------------------------


class TestDesirabilityTarget:
    """d=((y-L)/(T-L))^s if L<=y<=T; d=((U-y)/(U-T))^t if T<y<=U; d=0 else."""

    def _config(
        self, s: float = 1.0, t: float | None = None,
    ) -> DesirabilityConfig:
        return DesirabilityConfig(
            name="viscosity",
            direction="target",
            lower=80.0,
            target=100.0,
            upper=120.0,
            shape=s,
            shape_upper=t,
        )

    def test_at_target_returns_one(self):
        d = compute_individual_desirability(100.0, self._config())
        assert abs(d - 1.0) < 1e-10

    def test_at_lower_returns_zero(self):
        """At L boundary, d = ((L-L)/(T-L))^s = 0."""
        d = compute_individual_desirability(80.0, self._config())
        assert abs(d - 0.0) < 1e-10

    def test_at_upper_returns_zero(self):
        """At U boundary, d = ((U-U)/(U-T))^t = 0."""
        d = compute_individual_desirability(120.0, self._config())
        assert abs(d - 0.0) < 1e-10

    def test_below_lower_returns_zero(self):
        assert compute_individual_desirability(70.0, self._config()) == 0.0

    def test_above_upper_returns_zero(self):
        assert compute_individual_desirability(130.0, self._config()) == 0.0

    def test_left_midpoint_linear(self):
        """y=90 (midpoint of L-T), linear: d = 0.5."""
        d = compute_individual_desirability(90.0, self._config(s=1.0))
        assert abs(d - 0.5) < 1e-10

    def test_right_midpoint_linear(self):
        """y=110 (midpoint of T-U), linear: d = 0.5."""
        d = compute_individual_desirability(110.0, self._config(s=1.0))
        assert abs(d - 0.5) < 1e-10

    def test_asymmetric_shape(self):
        """Different shapes for left (s) and right (t) sides."""
        cfg = self._config(s=1.0, t=2.0)
        # Left side: y=90 -> d = ((90-80)/(100-80))^1 = 0.5
        d_left = compute_individual_desirability(90.0, cfg)
        assert abs(d_left - 0.5) < 1e-10
        # Right side: y=110 -> d = ((120-110)/(120-100))^2 = 0.25
        d_right = compute_individual_desirability(110.0, cfg)
        assert abs(d_right - 0.25) < 1e-10


# ---------------------------------------------------------------------------
# Overall desirability (geometric weighted mean)
# ---------------------------------------------------------------------------


class TestOverallDesirability:
    """D = (prod(di^wi))^(1/sum(wi))."""

    def _configs(self) -> list[DesirabilityConfig]:
        return [
            DesirabilityConfig(
                name="yield",
                direction="maximize",
                lower=50.0,
                target=100.0,
                upper=100.0,
                weight=1.0,
            ),
            DesirabilityConfig(
                name="purity",
                direction="maximize",
                lower=90.0,
                target=99.0,
                upper=99.0,
                weight=1.0,
            ),
        ]

    def test_all_at_target(self):
        """All responses at target -> D = 1.0."""
        result = compute_overall_desirability(
            {"yield": 100.0, "purity": 99.0},
            self._configs(),
        )
        assert abs(result.overall_desirability - 1.0) < 1e-10

    def test_one_at_zero(self):
        """Any response with d=0 -> D = 0."""
        result = compute_overall_desirability(
            {"yield": 30.0, "purity": 99.0},  # yield below lower
            self._configs(),
        )
        assert result.overall_desirability == 0.0

    def test_geometric_mean(self):
        """With equal weights, D = (d1*d2)^(1/2)."""
        # yield=75 -> d1 = (75-50)/(100-50) = 0.5
        # purity=94.5 -> d2 = (94.5-90)/(99-90) = 0.5
        result = compute_overall_desirability(
            {"yield": 75.0, "purity": 94.5},
            self._configs(),
        )
        expected = math.sqrt(0.5 * 0.5)
        assert abs(result.overall_desirability - expected) < 1e-10

    def test_weighted_geometric_mean(self):
        """With different weights, D = (d1^w1 * d2^w2)^(1/(w1+w2))."""
        configs = [
            DesirabilityConfig(
                name="yield",
                direction="maximize",
                lower=50.0,
                target=100.0,
                upper=100.0,
                weight=2.0,  # double importance
            ),
            DesirabilityConfig(
                name="purity",
                direction="maximize",
                lower=90.0,
                target=99.0,
                upper=99.0,
                weight=1.0,
            ),
        ]
        # d1 = 0.5, d2 = 0.5
        result = compute_overall_desirability(
            {"yield": 75.0, "purity": 94.5},
            configs,
        )
        # D = (0.5^2 * 0.5^1)^(1/3) = (0.125)^(1/3)
        expected = (0.5 ** 2 * 0.5 ** 1) ** (1.0 / 3.0)
        assert abs(result.overall_desirability - expected) < 1e-10

    def test_missing_response_gives_zero(self):
        """Missing response value -> d = 0 -> D = 0."""
        result = compute_overall_desirability(
            {"yield": 100.0},  # purity missing
            self._configs(),
        )
        assert result.overall_desirability == 0.0

    def test_individual_desirabilities_stored(self):
        """Individual desirabilities should be in the result."""
        result = compute_overall_desirability(
            {"yield": 75.0, "purity": 94.5},
            self._configs(),
        )
        assert "yield" in result.individual_desirabilities
        assert "purity" in result.individual_desirabilities
        assert abs(result.individual_desirabilities["yield"] - 0.5) < 1e-10
        assert abs(result.individual_desirabilities["purity"] - 0.5) < 1e-10

    def test_response_values_stored(self):
        """Input response values should be in the result."""
        result = compute_overall_desirability(
            {"yield": 75.0, "purity": 94.5},
            self._configs(),
        )
        assert result.response_values["yield"] == 75.0
        assert result.response_values["purity"] == 94.5


# ---------------------------------------------------------------------------
# Mixed directions
# ---------------------------------------------------------------------------


class TestMixedDirections:
    """Test desirability with mixed maximize/minimize/target responses."""

    def test_maximize_and_minimize(self):
        """Combine maximize + minimize responses."""
        configs = [
            DesirabilityConfig(
                name="strength",
                direction="maximize",
                lower=100.0,
                target=200.0,
                upper=200.0,
            ),
            DesirabilityConfig(
                name="cost",
                direction="minimize",
                lower=0.0,
                target=0.0,
                upper=50.0,
            ),
        ]
        result = compute_overall_desirability(
            {"strength": 150.0, "cost": 25.0},
            configs,
        )
        # strength: d = (150-100)/(200-100) = 0.5
        # cost: d = (50-25)/(50-0) = 0.5
        expected = math.sqrt(0.5 * 0.5)
        assert abs(result.overall_desirability - expected) < 1e-10

    def test_all_three_directions(self):
        """Combine maximize + minimize + target."""
        configs = [
            DesirabilityConfig(
                name="strength",
                direction="maximize",
                lower=100.0,
                target=200.0,
                upper=200.0,
            ),
            DesirabilityConfig(
                name="cost",
                direction="minimize",
                lower=0.0,
                target=0.0,
                upper=50.0,
            ),
            DesirabilityConfig(
                name="viscosity",
                direction="target",
                lower=80.0,
                target=100.0,
                upper=120.0,
            ),
        ]
        result = compute_overall_desirability(
            {"strength": 200.0, "cost": 0.0, "viscosity": 100.0},
            configs,
        )
        # All at optimal -> D = 1.0
        assert abs(result.overall_desirability - 1.0) < 1e-10


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------


class TestDesirabilityEdgeCases:
    """Test edge cases and boundary conditions."""

    def test_zero_range_maximize(self):
        """T == L for maximize: should return 0 for in-between values."""
        cfg = DesirabilityConfig(
            name="x", direction="maximize",
            lower=100.0, target=100.0, upper=100.0,
        )
        assert compute_individual_desirability(100.0, cfg) == 1.0
        assert compute_individual_desirability(99.0, cfg) == 0.0

    def test_zero_range_minimize(self):
        """T == U for minimize: should return 0 for in-between values."""
        cfg = DesirabilityConfig(
            name="x", direction="minimize",
            lower=0.0, target=100.0, upper=100.0,
        )
        assert compute_individual_desirability(100.0, cfg) == 1.0
        assert compute_individual_desirability(101.0, cfg) == 0.0

    def test_invalid_direction_raises(self):
        with pytest.raises(ValueError, match="direction"):
            DesirabilityConfig(
                name="x", direction="invalid",
                lower=0.0, target=50.0, upper=100.0,
            )

    def test_negative_weight_raises(self):
        with pytest.raises(ValueError, match="weight"):
            DesirabilityConfig(
                name="x", direction="maximize",
                lower=0.0, target=100.0, upper=100.0,
                weight=-1.0,
            )

    def test_zero_weight_raises(self):
        with pytest.raises(ValueError, match="weight"):
            DesirabilityConfig(
                name="x", direction="maximize",
                lower=0.0, target=100.0, upper=100.0,
                weight=0.0,
            )

    def test_negative_shape_raises(self):
        with pytest.raises(ValueError, match="shape"):
            DesirabilityConfig(
                name="x", direction="maximize",
                lower=0.0, target=100.0, upper=100.0,
                shape=-1.0,
            )

    def test_empty_configs(self):
        """No configs -> D = 0 (no responses to optimize)."""
        result = compute_overall_desirability({}, [])
        assert result.overall_desirability == 0.0


# ---------------------------------------------------------------------------
# Show Your Work integration
# ---------------------------------------------------------------------------


class TestDesirabilityShowYourWork:
    """Verify SYW collector integration for desirability."""

    def test_collector_receives_steps(self):
        configs = [
            DesirabilityConfig(
                name="yield", direction="maximize",
                lower=50.0, target=100.0, upper=100.0,
            ),
            DesirabilityConfig(
                name="purity", direction="minimize",
                lower=0.0, target=0.0, upper=10.0,
            ),
        ]
        collector = ExplanationCollector()

        compute_overall_desirability(
            {"yield": 75.0, "purity": 5.0},
            configs,
            collector=collector,
        )

        # Should have 2 individual steps + 1 overall step
        assert len(collector.steps) == 3

    def test_collector_cites_derringer_suich(self):
        configs = [
            DesirabilityConfig(
                name="x", direction="maximize",
                lower=0.0, target=100.0, upper=100.0,
            ),
        ]
        collector = ExplanationCollector()

        compute_overall_desirability(
            {"x": 50.0},
            configs,
            collector=collector,
        )

        # Check that Derringer & Suich citation is in the note
        assert any(
            "Derringer" in (s.note or "") for s in collector.steps
        )

    def test_no_collector_no_error(self):
        """Without collector, computation should still work."""
        configs = [
            DesirabilityConfig(
                name="x", direction="maximize",
                lower=0.0, target=100.0, upper=100.0,
            ),
        ]
        result = compute_overall_desirability(
            {"x": 50.0},
            configs,
            collector=None,
        )
        assert result.overall_desirability > 0


# ---------------------------------------------------------------------------
# Schema validation (ResponseColumnConfig)
# ---------------------------------------------------------------------------


class TestResponseColumnConfigSchema:
    """Verify schema validation for response column configs."""

    def test_maximize_requires_lower_lt_target(self):
        from cassini.api.schemas.doe import ResponseColumnConfig

        with pytest.raises(ValueError, match="lower must be < target"):
            ResponseColumnConfig(
                name="x", direction="maximize",
                lower=100.0, target=50.0, upper=100.0,
            )

    def test_minimize_requires_target_lt_upper(self):
        from cassini.api.schemas.doe import ResponseColumnConfig

        with pytest.raises(ValueError, match="target must be < upper"):
            ResponseColumnConfig(
                name="x", direction="minimize",
                lower=0.0, target=100.0, upper=50.0,
            )

    def test_target_requires_order(self):
        from cassini.api.schemas.doe import ResponseColumnConfig

        with pytest.raises(ValueError, match="lower <= target <= upper"):
            ResponseColumnConfig(
                name="x", direction="target",
                lower=50.0, target=30.0, upper=100.0,
            )

    def test_valid_config_accepted(self):
        from cassini.api.schemas.doe import ResponseColumnConfig

        cfg = ResponseColumnConfig(
            name="x", direction="maximize",
            lower=0.0, target=100.0, upper=200.0,
            weight=2.0, shape=1.5,
        )
        assert cfg.name == "x"
        assert cfg.weight == 2.0
