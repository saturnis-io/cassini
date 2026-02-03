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

from openspc.core.engine.rolling_window import RollingWindow, WindowSample, Zone


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
    """

    rule_id = 1
    rule_name = "Outlier"
    min_samples_required = 1
    severity = Severity.CRITICAL

    def check(self, window: RollingWindow) -> RuleResult | None:
        """Check for points beyond control limits."""
        samples = window.get_samples()
        if len(samples) < self.min_samples_required:
            return None

        latest = samples[-1]

        if latest.zone in (Zone.BEYOND_UCL, Zone.BEYOND_LCL):
            return RuleResult(
                rule_id=self.rule_id,
                rule_name=self.rule_name,
                triggered=True,
                severity=self.severity,
                involved_sample_ids=[latest.sample_id],
                message=f"Point at {latest.value:.4f} is beyond 3sigma from center"
            )
        return None


class Rule2Shift:
    """Rule 2: Nine points in a row on the same side of the center line.

    Indicates a shift in the process mean. The counter resets when a point
    crosses the center line.
    """

    rule_id = 2
    rule_name = "Shift"
    min_samples_required = 9
    severity = Severity.WARNING

    def check(self, window: RollingWindow) -> RuleResult | None:
        """Check for 9 consecutive points on same side of center."""
        samples = window.get_samples()
        if len(samples) < self.min_samples_required:
            return None

        # Check last 9 points
        last_9 = samples[-9:]

        # Check if all are on the upper side
        all_upper = all(p.zone in (Zone.ZONE_C_UPPER, Zone.ZONE_B_UPPER,
                                    Zone.ZONE_A_UPPER, Zone.BEYOND_UCL)
                       for p in last_9)

        # Check if all are on the lower side
        all_lower = all(p.zone in (Zone.ZONE_C_LOWER, Zone.ZONE_B_LOWER,
                                    Zone.ZONE_A_LOWER, Zone.BEYOND_LCL)
                       for p in last_9)

        if all_upper or all_lower:
            side = "above" if all_upper else "below"
            return RuleResult(
                rule_id=self.rule_id,
                rule_name=self.rule_name,
                triggered=True,
                severity=self.severity,
                involved_sample_ids=[p.sample_id for p in last_9],
                message=f"9 consecutive points {side} center line"
            )
        return None


class Rule3Trend:
    """Rule 3: Six points in a row, all increasing OR all decreasing.

    Indicates a trend in the process, such as tool wear, temperature drift,
    or gradual degradation.
    """

    rule_id = 3
    rule_name = "Trend"
    min_samples_required = 6
    severity = Severity.WARNING

    def check(self, window: RollingWindow) -> RuleResult | None:
        """Check for 6 consecutive points monotonically increasing or decreasing."""
        samples = window.get_samples()
        if len(samples) < self.min_samples_required:
            return None

        # Check last 6 points
        last_6 = samples[-6:]
        values = [p.value for p in last_6]

        # Check for strictly increasing
        all_increasing = all(values[i] < values[i+1] for i in range(5))

        # Check for strictly decreasing
        all_decreasing = all(values[i] > values[i+1] for i in range(5))

        if all_increasing or all_decreasing:
            direction = "increasing" if all_increasing else "decreasing"
            return RuleResult(
                rule_id=self.rule_id,
                rule_name=self.rule_name,
                triggered=True,
                severity=self.severity,
                involved_sample_ids=[p.sample_id for p in last_6],
                message=f"6 consecutive points {direction}"
            )
        return None


class Rule4Alternator:
    """Rule 4: Fourteen points alternating up and down.

    Indicates systematic variation, such as alternating between two machines,
    operators, or measurement systems.
    """

    rule_id = 4
    rule_name = "Alternator"
    min_samples_required = 14
    severity = Severity.WARNING

    def check(self, window: RollingWindow) -> RuleResult | None:
        """Check for 14 consecutive points alternating direction."""
        samples = window.get_samples()
        if len(samples) < self.min_samples_required:
            return None

        # Check last 14 points
        last_14 = samples[-14:]
        values = [p.value for p in last_14]

        # Check alternating pattern (13 direction changes)
        alternating = True
        for i in range(12):
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
                involved_sample_ids=[p.sample_id for p in last_14],
                message="14 consecutive points alternating up and down"
            )
        return None


class Rule5ZoneA:
    """Rule 5: Two out of three consecutive points in Zone A or beyond, same side.

    Indicates the process mean may be shifting or there's increased variation.
    """

    rule_id = 5
    rule_name = "Zone A Warning"
    min_samples_required = 3
    severity = Severity.WARNING

    def check(self, window: RollingWindow) -> RuleResult | None:
        """Check for 2 of 3 points in Zone A or beyond, same side."""
        samples = window.get_samples()
        if len(samples) < self.min_samples_required:
            return None

        # Check last 3 points
        last_3 = samples[-3:]

        # Count points in Zone A or beyond on upper side
        upper_count = sum(1 for p in last_3
                         if p.zone in (Zone.ZONE_A_UPPER, Zone.BEYOND_UCL))

        # Count points in Zone A or beyond on lower side
        lower_count = sum(1 for p in last_3
                         if p.zone in (Zone.ZONE_A_LOWER, Zone.BEYOND_LCL))

        if upper_count >= 2 or lower_count >= 2:
            side = "upper" if upper_count >= 2 else "lower"
            involved = [p for p in last_3
                       if (upper_count >= 2 and p.zone in (Zone.ZONE_A_UPPER, Zone.BEYOND_UCL))
                       or (lower_count >= 2 and p.zone in (Zone.ZONE_A_LOWER, Zone.BEYOND_LCL))]
            return RuleResult(
                rule_id=self.rule_id,
                rule_name=self.rule_name,
                triggered=True,
                severity=self.severity,
                involved_sample_ids=[p.sample_id for p in involved],
                message=f"2 of 3 consecutive points in Zone A or beyond ({side} side)"
            )
        return None


class Rule6ZoneB:
    """Rule 6: Four out of five consecutive points in Zone B or beyond, same side.

    Indicates the process mean may be shifting or there's increased variation,
    though less severe than Rule 5.
    """

    rule_id = 6
    rule_name = "Zone B Warning"
    min_samples_required = 5
    severity = Severity.WARNING

    def check(self, window: RollingWindow) -> RuleResult | None:
        """Check for 4 of 5 points in Zone B or beyond, same side."""
        samples = window.get_samples()
        if len(samples) < self.min_samples_required:
            return None

        # Check last 5 points
        last_5 = samples[-5:]

        # Count points in Zone B or beyond on upper side
        upper_count = sum(1 for p in last_5
                         if p.zone in (Zone.ZONE_B_UPPER, Zone.ZONE_A_UPPER, Zone.BEYOND_UCL))

        # Count points in Zone B or beyond on lower side
        lower_count = sum(1 for p in last_5
                         if p.zone in (Zone.ZONE_B_LOWER, Zone.ZONE_A_LOWER, Zone.BEYOND_LCL))

        if upper_count >= 4 or lower_count >= 4:
            side = "upper" if upper_count >= 4 else "lower"
            involved = [p for p in last_5
                       if (upper_count >= 4 and p.zone in (Zone.ZONE_B_UPPER, Zone.ZONE_A_UPPER, Zone.BEYOND_UCL))
                       or (lower_count >= 4 and p.zone in (Zone.ZONE_B_LOWER, Zone.ZONE_A_LOWER, Zone.BEYOND_LCL))]
            return RuleResult(
                rule_id=self.rule_id,
                rule_name=self.rule_name,
                triggered=True,
                severity=self.severity,
                involved_sample_ids=[p.sample_id for p in involved],
                message=f"4 of 5 consecutive points in Zone B or beyond ({side} side)"
            )
        return None


class Rule7Stratification:
    """Rule 7: Fifteen consecutive points within Zone C (both sides).

    Indicates stratification - control limits may be too wide or data is
    being smoothed/averaged inappropriately.
    """

    rule_id = 7
    rule_name = "Stratification"
    min_samples_required = 15
    severity = Severity.WARNING

    def check(self, window: RollingWindow) -> RuleResult | None:
        """Check for 15 consecutive points in Zone C."""
        samples = window.get_samples()
        if len(samples) < self.min_samples_required:
            return None

        # Check last 15 points
        last_15 = samples[-15:]

        # All points must be in Zone C (upper or lower)
        all_in_zone_c = all(p.zone in (Zone.ZONE_C_UPPER, Zone.ZONE_C_LOWER)
                           for p in last_15)

        if all_in_zone_c:
            return RuleResult(
                rule_id=self.rule_id,
                rule_name=self.rule_name,
                triggered=True,
                severity=self.severity,
                involved_sample_ids=[p.sample_id for p in last_15],
                message="15 consecutive points within Zone C (hugging mean)"
            )
        return None


class Rule8Mixture:
    """Rule 8: Eight consecutive points with none in Zone C.

    Indicates mixture - two or more processes or populations mixed together,
    or control limits calculated from mixed data.
    """

    rule_id = 8
    rule_name = "Mixture"
    min_samples_required = 8
    severity = Severity.WARNING

    def check(self, window: RollingWindow) -> RuleResult | None:
        """Check for 8 consecutive points outside Zone C."""
        samples = window.get_samples()
        if len(samples) < self.min_samples_required:
            return None

        # Check last 8 points
        last_8 = samples[-8:]

        # None of the points should be in Zone C
        none_in_zone_c = all(p.zone not in (Zone.ZONE_C_UPPER, Zone.ZONE_C_LOWER)
                            for p in last_8)

        if none_in_zone_c:
            return RuleResult(
                rule_id=self.rule_id,
                rule_name=self.rule_name,
                triggered=True,
                severity=self.severity,
                involved_sample_ids=[p.sample_id for p in last_8],
                message="8 consecutive points outside Zone C (mixture pattern)"
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
