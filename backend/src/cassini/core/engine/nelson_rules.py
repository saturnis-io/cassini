"""Nelson Rules implementation for SPC violation detection.

PURPOSE:
    Implements all 8 Nelson Rules as pluggable, parameterizable rule classes
    for detecting non-random (special cause) patterns in Shewhart control
    charts. Each rule targets a specific type of process disturbance.

STANDARDS:
    - Nelson, L.S. (1984), "The Shewhart Control Chart -- Tests for Special
      Causes", Journal of Quality Technology, 16(4), pp.237-239.
      This is the DEFINITIVE reference for the 8 rules. Nelson formalized
      the zone tests that had been used informally since the Western Electric
      Statistical Quality Control Handbook (1956).
    - Western Electric Co. (1956), "Statistical Quality Control Handbook",
      pp.25-28 -- original zone tests (Rules 1-4 substantially similar)
    - AIAG SPC Manual, 2nd Ed. (2005), Chapter II -- recommends Rules 1-4
      as minimum; Rules 5-8 as supplementary
    - Montgomery (2019), "Introduction to Statistical Quality Control",
      8th Ed., Section 6.3.3 -- provides run rules table

ARCHITECTURE:
    Each rule is a standalone class implementing the NelsonRule Protocol.
    Rules are registered in NelsonRuleLibrary, which provides:
      - create_from_config(): rebuild rules with custom parameters from DB
      - check_all(): evaluate all enabled rules against a RollingWindow
      - check_single(): evaluate one rule
    The library is stateless between calls -- all state lives in the
    RollingWindow passed to check().

    Rule evaluation is always performed on the MOST RECENT samples in the
    window (tail evaluation). This is correct for real-time SPC: we want
    to detect if the LATEST point is part of a pattern, not scan the
    entire history.

KEY DECISIONS:
    - All rules support custom parameters (e.g., consecutive_count,
      sigma_multiplier) via the params dict. This allows per-characteristic
      tuning while maintaining the standard defaults.
    - Guard clauses reset parameters to defaults if invalid (e.g.,
      consecutive_count < 2 for Rule 2).
    - Rule 3 (Trend) uses STRICT comparisons (< / >). Equal consecutive
      values break the trend. This matches Nelson (1984) "all increasing
      or all decreasing" and the majority of commercial SPC software.
    - Rule 8 (Mixture) requires points on BOTH sides of center line to
      distinguish true mixture patterns from sustained shifts (which are
      caught by Rule 2/6).
    - Rules 5-8 are zone-based and assume approximate normality. They are
      NOT applied to attribute charts (see attribute_engine.py).

RULE SUMMARY:
    Rule 1 (Outlier):       1 point beyond 3-sigma      [CRITICAL]
    Rule 2 (Shift):         9 consecutive same side      [WARNING]
    Rule 3 (Trend):         6 consecutive monotonic       [WARNING]
    Rule 4 (Alternator):    14 consecutive alternating    [WARNING]
    Rule 5 (Zone A):        2 of 3 in Zone A, same side  [WARNING]
    Rule 6 (Zone B):        4 of 5 in Zone B+, same side [WARNING]
    Rule 7 (Stratification): 15 consecutive in Zone C    [WARNING]
    Rule 8 (Mixture):       8 consecutive outside Zone C  [WARNING]
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
    """Rule 1: One point beyond 3 sigma (beyond control limits).

    The most fundamental Shewhart test. Under normality, the probability
    of a single point exceeding 3-sigma limits by chance is 0.27% (1 in 370).
    A point beyond the limits is strong evidence of a special cause.

    Ref: Nelson (1984), Rule 1; AIAG SPC Manual 2nd Ed., Chapter II;
         Montgomery (2019), Section 6.3.3, Table 6.3.

    Parameters:
        sigma_multiplier (float): Sigma distance for outlier detection (default 3.0).
            When != 3.0, uses pre-computed sigma_distance instead of Zone enum
            classification. Allows tighter limits (e.g., 2.5-sigma warning limits)
            or wider limits for high-volume processes.
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

    Detects a sustained shift in the process mean. Under normality with a
    centered process, the probability of 9 consecutive points on the same
    side is (0.5)^9 = 0.00195 (approximately 1 in 512).

    A value exactly AT the center line is classified as "above" (Zone C upper),
    consistent with the >= convention in zone classification throughout the
    Cassini engine. This means a sequence of values all exactly at the center
    line would register as "all above" -- a correct interpretation since it
    indicates zero variation, which is itself a special pattern.

    Ref: Nelson (1984), Rule 2; AIAG SPC Manual 2nd Ed., Chapter II;
         Montgomery (2019), Section 6.3.3.

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

    Detects early warning of a process mean shift. Under normality, the
    probability of a single point in Zone A (>2sigma) on one side is
    ~2.14%. Two out of three on the same side has a probability of
    ~0.0069 (approximately 1 in 145).

    "Zone A or beyond" includes both Zone A and Beyond UCL/LCL, so a
    point that exceeds the control limit also counts toward this rule.

    Ref: Nelson (1984), Rule 5; Western Electric (1956), p.27;
         Montgomery (2019), Section 6.3.3.

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

    Detects a smaller but persistent process shift. Under normality, the
    probability of a point being in Zone B or beyond (>1sigma) on one side
    is ~15.73%. Four out of five on the same side is a strong signal of
    a shifted mean.

    "Zone B or beyond" includes Zone B, Zone A, and Beyond UCL/LCL.

    Ref: Nelson (1984), Rule 6; Western Electric (1956), p.27;
         Montgomery (2019), Section 6.3.3.

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

    Detects stratification -- the data clusters too tightly around the center
    line, suggesting the control limits are too wide. Common causes:
      - Limits calculated from mixed populations (e.g., two machines combined)
      - Data being excessively smoothed or averaged
      - Incorrect subgroup size used for limit calculation

    Under normality, the probability of a point in Zone C (either side) is
    ~68.26%. Fifteen consecutive: (0.6826)^15 = ~0.0047 (1 in 213).

    Ref: Nelson (1984), Rule 7; Montgomery (2019), Section 6.3.3.

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
    """Rule 8: Eight consecutive points with none in Zone C, on BOTH sides.

    Detects mixture -- two or more distinct populations are being combined
    into one chart, producing a bimodal distribution that avoids the center.
    Common causes:
      - Two machines with different means feeding one chart
      - Two operators with systematically different results
      - Control limits calculated from mixed/heterogeneous data

    Under normality, the probability of a point outside Zone C is ~31.74%.
    Eight consecutive outside Zone C: (0.3174)^8 = ~0.0001 (1 in 10000).

    IMPORTANT: This implementation requires points on BOTH sides of the
    center line. Without this check, a sustained shift into Zone B/A on
    one side would falsely trigger Rule 8 in addition to Rule 2/6. The
    "both sides" requirement is the distinguishing characteristic of
    mixture vs. shift patterns.

    Ref: Nelson (1984), Rule 8; Montgomery (2019), Section 6.3.3.

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
