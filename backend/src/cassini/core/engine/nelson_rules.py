"""Nelson Rules implementation for SPC violation detection.

This module provides all 8 Nelson Rules as pluggable rule classes for detecting
non-random patterns in control charts. Each rule is implemented as a standalone
class following the NelsonRule protocol.

References:
    - Lloyd S. Nelson, "The Shewhart Control Chart - Tests for Special Causes" (1984)
    - AIAG SPC Manual, 2nd Edition
"""

from dataclasses import dataclass
from enum import Enum
from typing import Protocol

from cassini.core.engine.rolling_window import RollingWindow, WindowSample, Zone

# All 8 standard Nelson Rule IDs
NELSON_RULE_IDS = list(range(1, 9))


class Severity(Enum):
    """Violation severity levels."""
    WARNING = "WARNING"
    CRITICAL = "CRITICAL"


@dataclass
class RuleResult:
    """Result of checking a Nelson Rule.

    Attributes:
        rule_id: Nelson Rule number (1-8)
        rule_name: Human-readable rule name
        triggered: bool
        severity: Severity level (WARNING or CRITICAL)
        involved_sample_ids: Sample IDs that caused the violation
        message: Human-readable description of the violation
    """
    rule_id: int
    rule_name: str
    triggered: bool
    severity: Severity
    involved_sample_ids: list[int]
    message: str


class NelsonRule(Protocol):
    """Protocol for Nelson Rule implementations.

    Each rule must implement these properties and the check method.
    """

    @property
    def rule_id(self) -> int:
        """Rule number (1-8)."""
        ...

    @property
    def rule_name(self) -> str:
        """Human-readable rule name."""
        ...

    @property
    def min_samples_required(self) -> int:
        """Minimum number of samples needed to evaluate this rule."""
        ...

    @property
    def severity(self) -> Severity:
        """Severity level for violations of this rule."""
        ...

    def check(self, window: RollingWindow) -> RuleResult | None:
        """Check rule against window.

        Args:
            window: Rolling window of chart points

        Returns:
            RuleResult if violated, None otherwise
        """
        ...


class Rule1Outlier:
    """Rule 1: One point beyond 3 sigma (Zone A boundary).

    This is the most severe violation - a point beyond the control limits.
    Indicates a special cause or out-of-control condition.

    Parameters:
        sigma_multiplier (float): Sigma distance for outlier detection (default 3.0).
            When != 3.0, uses manual computation instead of Zone enum.
    """

    rule_id = 1
    rule_name = "Outlier"
    min_samples_required = 1
    severity = Severity.CRITICAL

    def __init__(self, params: dict | None = None):
        self._params = params or {}
        self._sigma_multiplier = self._params.get("sigma_multiplier", 3.0)
        if self._sigma_multiplier <= 0:
            self._sigma_multiplier = 3.0

    def check(self, window: RollingWindow) -> RuleResult | None:
        """Check for points beyond control limits."""
        samples = window.get_samples()
        if len(samples) < self.min_samples_required:
            return None

        latest = samples[-1]

        if self._sigma_multiplier == 3.0:
            # Default: use Zone classification
            if latest.zone in (Zone.BEYOND_UCL, Zone.BEYOND_LCL):
                return RuleResult(
                    rule_id=self.rule_id,
                    rule_name=self.rule_name,
                    triggered=True,
                    severity=self.severity,
                    involved_sample_ids=[latest.sample_id],
                    message=f"Point at {latest.value:.4f} is beyond 3sigma from center"
                )
        else:
            # Custom sigma multiplier: use pre-computed sigma_distance
            if latest.sigma_distance > self._sigma_multiplier:
                return RuleResult(
                    rule_id=self.rule_id,
                    rule_name=self.rule_name,
                    triggered=True,
                    severity=self.severity,
                    involved_sample_ids=[latest.sample_id],
                    message=f"Point at {latest.value:.4f} is beyond {self._sigma_multiplier}sigma from center"
                )
        return None


class Rule2Shift:
    """Rule 2: Nine points in a row on the same side of the center line.

    Indicates a shift in the process mean. The counter resets when a point
    crosses the center line.

    Parameters:
        consecutive_count (int): Number of consecutive points required (default 9).
    """

    rule_id = 2
    rule_name = "Shift"
    severity = Severity.WARNING

    def __init__(self, params: dict | None = None):
        self._params = params or {}
        self._consecutive = self._params.get("consecutive_count", 9)
        if self._consecutive < 2:
            self._consecutive = 9  # Guard: count < 2 is vacuous or dangerous

    @property
    def min_samples_required(self) -> int:
        return self._consecutive

    def check(self, window: RollingWindow) -> RuleResult | None:
        """Check for consecutive points on same side of center."""
        samples = window.get_samples()
        if len(samples) < self._consecutive:
            return None

        last_n = samples[-self._consecutive:]

        # Check if all are on the upper side
        all_upper = all(p.zone in (Zone.ZONE_C_UPPER, Zone.ZONE_B_UPPER,
                                    Zone.ZONE_A_UPPER, Zone.BEYOND_UCL)
                       for p in last_n)

        # Check if all are on the lower side
        all_lower = all(p.zone in (Zone.ZONE_C_LOWER, Zone.ZONE_B_LOWER,
                                    Zone.ZONE_A_LOWER, Zone.BEYOND_LCL)
                       for p in last_n)

        if all_upper or all_lower:
            side = "above" if all_upper else "below"
            return RuleResult(
                rule_id=self.rule_id,
                rule_name=self.rule_name,
                triggered=True,
                severity=self.severity,
                involved_sample_ids=[p.sample_id for p in last_n],
                message=f"{self._consecutive} consecutive points {side} center line"
            )
        return None


class Rule3Trend:
    """Rule 3: Six points in a row, all increasing OR all decreasing.

    Indicates a trend in the process, such as tool wear, temperature drift,
    or gradual degradation.

    Note: Uses **strict** comparisons (``<`` / ``>``). Equal consecutive values
    break the trend. This matches Nelson (1984) "all increasing or all
    decreasing" and the majority of commercial SPC software. For data with
    limited measurement resolution (e.g. rounded to 0.001"), plateaus of
    equal values will not be counted as part of a trend.

    Parameters:
        consecutive_count (int): Number of consecutive points required (default 6).
    """

    rule_id = 3
    rule_name = "Trend"
    severity = Severity.WARNING

    def __init__(self, params: dict | None = None):
        self._params = params or {}
        self._consecutive = self._params.get("consecutive_count", 6)
        if self._consecutive < 2:
            self._consecutive = 6  # Guard: need at least 2 points for a trend

    @property
    def min_samples_required(self) -> int:
        return self._consecutive

    def check(self, window: RollingWindow) -> RuleResult | None:
        """Check for consecutive points monotonically increasing or decreasing."""
        samples = window.get_samples()
        if len(samples) < self._consecutive:
            return None

        last_n = samples[-self._consecutive:]
        values = [p.value for p in last_n]

        comparisons = self._consecutive - 1

        # Check for strictly increasing
        all_increasing = all(values[i] < values[i+1] for i in range(comparisons))

        # Check for strictly decreasing
        all_decreasing = all(values[i] > values[i+1] for i in range(comparisons))

        if all_increasing or all_decreasing:
            direction = "increasing" if all_increasing else "decreasing"
            return RuleResult(
                rule_id=self.rule_id,
                rule_name=self.rule_name,
                triggered=True,
                severity=self.severity,
                involved_sample_ids=[p.sample_id for p in last_n],
                message=f"{self._consecutive} consecutive points {direction}"
            )
        return None


class Rule4Alternator:
    """Rule 4: Fourteen points alternating up and down.

    Indicates systematic variation, such as alternating between two machines,
    operators, or measurement systems.

    Note: Equal consecutive values (``dir == 0``) break the alternation pattern
    because ``dir1 * dir2 >= 0`` evaluates True when either direction is zero.
    This is the standard strict interpretation matching most commercial SPC tools.

    Parameters:
        consecutive_count (int): Number of consecutive points required (default 14).
    """

    rule_id = 4
    rule_name = "Alternator"
    severity = Severity.WARNING

    def __init__(self, params: dict | None = None):
        self._params = params or {}
        self._consecutive = self._params.get("consecutive_count", 14)
        if self._consecutive < 3:
            self._consecutive = 14  # Guard: need at least 3 points for alternation

    @property
    def min_samples_required(self) -> int:
        return self._consecutive

    def check(self, window: RollingWindow) -> RuleResult | None:
        """Check for consecutive points alternating direction."""
        samples = window.get_samples()
        if len(samples) < self._consecutive:
            return None

        last_n = samples[-self._consecutive:]
        values = [p.value for p in last_n]

        # Check alternating pattern (n-2 direction changes)
        alternating = True
        for i in range(self._consecutive - 2):
            # Direction from i to i+1
            dir1 = values[i+1] - values[i]
            # Direction from i+1 to i+2
            dir2 = values[i+2] - values[i+1]
            # Must alternate (opposite signs)
            if dir1 * dir2 >= 0:  # Same sign or zero
                alternating = False
                break

        if alternating:
            return RuleResult(
                rule_id=self.rule_id,
                rule_name=self.rule_name,
                triggered=True,
                severity=self.severity,
                involved_sample_ids=[p.sample_id for p in last_n],
                message=f"{self._consecutive} consecutive points alternating up and down"
            )
        return None


class Rule5ZoneA:
    """Rule 5: Two out of three consecutive points in Zone A or beyond, same side.

    Indicates the process mean may be shifting or there's increased variation.

    Parameters:
        count (int): Number of points required in zone (default 2).
        window (int): Window size to check (default 3).
    """

    rule_id = 5
    rule_name = "Zone A Warning"
    severity = Severity.WARNING

    def __init__(self, params: dict | None = None):
        self._params = params or {}
        self._count = self._params.get("count", 2)
        self._window = self._params.get("window", 3)
        # Guard: count must be >= 1 and <= window (impossible condition otherwise)
        if self._count < 1:
            self._count = 2
        if self._window < 1:
            self._window = 3
        if self._count > self._window:
            self._count = 2
            self._window = 3

    @property
    def min_samples_required(self) -> int:
        return self._window

    def check(self, window: RollingWindow) -> RuleResult | None:
        """Check for count of window points in Zone A or beyond, same side."""
        samples = window.get_samples()
        if len(samples) < self._window:
            return None

        last_n = samples[-self._window:]

        # Count points in Zone A or beyond on upper side
        upper_count = sum(1 for p in last_n
                         if p.zone in (Zone.ZONE_A_UPPER, Zone.BEYOND_UCL))

        # Count points in Zone A or beyond on lower side
        lower_count = sum(1 for p in last_n
                         if p.zone in (Zone.ZONE_A_LOWER, Zone.BEYOND_LCL))

        if upper_count >= self._count or lower_count >= self._count:
            side = "upper" if upper_count >= self._count else "lower"
            involved = [p for p in last_n
                       if (upper_count >= self._count and p.zone in (Zone.ZONE_A_UPPER, Zone.BEYOND_UCL))
                       or (lower_count >= self._count and p.zone in (Zone.ZONE_A_LOWER, Zone.BEYOND_LCL))]
            return RuleResult(
                rule_id=self.rule_id,
                rule_name=self.rule_name,
                triggered=True,
                severity=self.severity,
                involved_sample_ids=[p.sample_id for p in involved],
                message=f"{self._count} of {self._window} consecutive points in Zone A or beyond ({side} side)"
            )
        return None


class Rule6ZoneB:
    """Rule 6: Four out of five consecutive points in Zone B or beyond, same side.

    Indicates the process mean may be shifting or there's increased variation,
    though less severe than Rule 5.

    Parameters:
        count (int): Number of points required in zone (default 4).
        window (int): Window size to check (default 5).
    """

    rule_id = 6
    rule_name = "Zone B Warning"
    severity = Severity.WARNING

    def __init__(self, params: dict | None = None):
        self._params = params or {}
        self._count = self._params.get("count", 4)
        self._window = self._params.get("window", 5)
        # Guard: count must be >= 1 and <= window
        if self._count < 1:
            self._count = 4
        if self._window < 1:
            self._window = 5
        if self._count > self._window:
            self._count = 4
            self._window = 5

    @property
    def min_samples_required(self) -> int:
        return self._window

    def check(self, window: RollingWindow) -> RuleResult | None:
        """Check for count of window points in Zone B or beyond, same side."""
        samples = window.get_samples()
        if len(samples) < self._window:
            return None

        last_n = samples[-self._window:]

        # Count points in Zone B or beyond on upper side
        upper_count = sum(1 for p in last_n
                         if p.zone in (Zone.ZONE_B_UPPER, Zone.ZONE_A_UPPER, Zone.BEYOND_UCL))

        # Count points in Zone B or beyond on lower side
        lower_count = sum(1 for p in last_n
                         if p.zone in (Zone.ZONE_B_LOWER, Zone.ZONE_A_LOWER, Zone.BEYOND_LCL))

        if upper_count >= self._count or lower_count >= self._count:
            side = "upper" if upper_count >= self._count else "lower"
            involved = [p for p in last_n
                       if (upper_count >= self._count and p.zone in (Zone.ZONE_B_UPPER, Zone.ZONE_A_UPPER, Zone.BEYOND_UCL))
                       or (lower_count >= self._count and p.zone in (Zone.ZONE_B_LOWER, Zone.ZONE_A_LOWER, Zone.BEYOND_LCL))]
            return RuleResult(
                rule_id=self.rule_id,
                rule_name=self.rule_name,
                triggered=True,
                severity=self.severity,
                involved_sample_ids=[p.sample_id for p in involved],
                message=f"{self._count} of {self._window} consecutive points in Zone B or beyond ({side} side)"
            )
        return None


class Rule7Stratification:
    """Rule 7: Fifteen consecutive points within Zone C (both sides).

    Indicates stratification - control limits may be too wide or data is
    being smoothed/averaged inappropriately.

    Parameters:
        consecutive_count (int): Number of consecutive points required (default 15).
    """

    rule_id = 7
    rule_name = "Stratification"
    severity = Severity.WARNING

    def __init__(self, params: dict | None = None):
        self._params = params or {}
        self._consecutive = self._params.get("consecutive_count", 15)
        if self._consecutive < 2:
            self._consecutive = 15

    @property
    def min_samples_required(self) -> int:
        return self._consecutive

    def check(self, window: RollingWindow) -> RuleResult | None:
        """Check for consecutive points in Zone C."""
        samples = window.get_samples()
        if len(samples) < self._consecutive:
            return None

        last_n = samples[-self._consecutive:]

        # All points must be in Zone C (upper or lower)
        all_in_zone_c = all(p.zone in (Zone.ZONE_C_UPPER, Zone.ZONE_C_LOWER)
                           for p in last_n)

        if all_in_zone_c:
            return RuleResult(
                rule_id=self.rule_id,
                rule_name=self.rule_name,
                triggered=True,
                severity=self.severity,
                involved_sample_ids=[p.sample_id for p in last_n],
                message=f"{self._consecutive} consecutive points within Zone C (hugging mean)"
            )
        return None


class Rule8Mixture:
    """Rule 8: Eight consecutive points with none in Zone C.

    Indicates mixture - two or more processes or populations mixed together,
    or control limits calculated from mixed data.

    Parameters:
        consecutive_count (int): Number of consecutive points required (default 8).
    """

    rule_id = 8
    rule_name = "Mixture"
    severity = Severity.WARNING

    def __init__(self, params: dict | None = None):
        self._params = params or {}
        self._consecutive = self._params.get("consecutive_count", 8)
        if self._consecutive < 2:
            self._consecutive = 8

    @property
    def min_samples_required(self) -> int:
        return self._consecutive

    def check(self, window: RollingWindow) -> RuleResult | None:
        """Check for consecutive points outside Zone C."""
        samples = window.get_samples()
        if len(samples) < self._consecutive:
            return None

        last_n = samples[-self._consecutive:]

        # None of the points should be in Zone C
        none_in_zone_c = all(p.zone not in (Zone.ZONE_C_UPPER, Zone.ZONE_C_LOWER)
                            for p in last_n)

        if none_in_zone_c:
            # Must have points on BOTH sides of center (mixture = bimodal pattern).
            # Without this check, a sustained shift into Zone B/A on one side
            # would falsely trigger Rule 8 in addition to Rule 2/6.
            has_upper = any(p.zone in (Zone.ZONE_B_UPPER, Zone.ZONE_A_UPPER, Zone.BEYOND_UCL)
                           for p in last_n)
            has_lower = any(p.zone in (Zone.ZONE_B_LOWER, Zone.ZONE_A_LOWER, Zone.BEYOND_LCL)
                           for p in last_n)
            if not (has_upper and has_lower):
                return None

            return RuleResult(
                rule_id=self.rule_id,
                rule_name=self.rule_name,
                triggered=True,
                severity=self.severity,
                involved_sample_ids=[p.sample_id for p in last_n],
                message=f"{self._consecutive} consecutive points outside Zone C on both sides (mixture pattern)"
            )
        return None


class NelsonRuleLibrary:
    """Aggregates and manages all Nelson Rules.

    Provides a central registry for all 8 Nelson Rules and methods to check
    them individually or collectively.
    """

    def __init__(self):
        """Initialize the library with all 8 Nelson Rules."""
        self._rules: dict[int, NelsonRule] = {}
        self._register_default_rules()

    def _register_default_rules(self) -> None:
        """Register all 8 standard Nelson Rules."""
        rules = [
            Rule1Outlier(),
            Rule2Shift(),
            Rule3Trend(),
            Rule4Alternator(),
            Rule5ZoneA(),
            Rule6ZoneB(),
            Rule7Stratification(),
            Rule8Mixture(),
        ]
        for rule in rules:
            self._rules[rule.rule_id] = rule

    def create_from_config(self, rule_configs: list[dict]) -> None:
        """Rebuild rules from per-rule config.

        Each item: {"rule_id": int, "is_enabled": bool, "parameters": dict | None}
        Only enabled rules are registered; disabled rules are removed.
        """
        rule_classes: dict[int, type] = {
            1: Rule1Outlier,
            2: Rule2Shift,
            3: Rule3Trend,
            4: Rule4Alternator,
            5: Rule5ZoneA,
            6: Rule6ZoneB,
            7: Rule7Stratification,
            8: Rule8Mixture,
        }
        self._rules.clear()
        for cfg in rule_configs:
            if not cfg.get("is_enabled", True):
                continue
            cls = rule_classes.get(cfg["rule_id"])
            if cls:
                self._rules[cfg["rule_id"]] = cls(params=cfg.get("parameters"))

    def check_all(
        self,
        window: RollingWindow,
        enabled_rules: set[int] | None = None
    ) -> list[RuleResult]:
        """Check all enabled rules and return violations.

        Args:
            window: Rolling window of chart points
            enabled_rules: Set of rule IDs to check (None = check all)

        Returns:
            List of RuleResult objects for violated rules
        """
        if enabled_rules is None:
            enabled_rules = set(self._rules.keys())

        violations = []
        for rule_id in enabled_rules:
            if rule_id in self._rules:
                result = self.check_single(window, rule_id)
                if result is not None and result.triggered:
                    violations.append(result)

        return violations

    def check_single(self, window: RollingWindow, rule_id: int) -> RuleResult | None:
        """Check a single rule.

        Args:
            window: Rolling window of chart points
            rule_id: ID of the rule to check

        Returns:
            RuleResult if rule exists and was checked, None otherwise
        """
        rule = self._rules.get(rule_id)
        if rule is None:
            return None
        return rule.check(window)

    def get_rule(self, rule_id: int) -> NelsonRule | None:
        """Get rule by ID.

        Args:
            rule_id: ID of the rule to retrieve

        Returns:
            NelsonRule instance if found, None otherwise
        """
        return self._rules.get(rule_id)
