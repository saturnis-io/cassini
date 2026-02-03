"""SPC Engine - Statistical Process Control calculations."""

from .control_limits import CalculationResult, ControlLimitService
from .nelson_rules import (
    NelsonRuleLibrary,
    Rule1Outlier,
    Rule2Shift,
    Rule3Trend,
    Rule4Alternator,
    Rule5ZoneA,
    Rule6ZoneB,
    Rule7Stratification,
    Rule8Mixture,
    RuleResult,
    Severity,
)
from .rolling_window import (
    RollingWindow,
    RollingWindowManager,
    WindowSample,
    Zone,
    ZoneBoundaries,
)
from .spc_engine import (
    ProcessingResult,
    SampleContext,
    SPCEngine,
    ViolationInfo,
)

__all__ = [
    # SPC Engine
    "SPCEngine",
    "SampleContext",
    "ProcessingResult",
    "ViolationInfo",
    # Control Limits
    "ControlLimitService",
    "CalculationResult",
    # Nelson Rules
    "NelsonRuleLibrary",
    "Rule1Outlier",
    "Rule2Shift",
    "Rule3Trend",
    "Rule4Alternator",
    "Rule5ZoneA",
    "Rule6ZoneB",
    "Rule7Stratification",
    "Rule8Mixture",
    "RuleResult",
    "Severity",
    # Rolling Window
    "RollingWindow",
    "RollingWindowManager",
    "WindowSample",
    "Zone",
    "ZoneBoundaries",
]
