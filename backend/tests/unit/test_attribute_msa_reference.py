"""Tests for Attribute MSA reference decisions, miss/false alarm rates, and confusion matrix."""
from __future__ import annotations

import pytest

from cassini.core.msa.attribute_msa import AttributeMSAEngine


# Fixture: 3 operators, 10 parts, 2 replicates (binary: pass/fail)
REFERENCE_DECISIONS = [
    "pass", "fail", "pass", "pass", "fail",
    "pass", "fail", "pass", "fail", "pass",
]

OPERATOR_NAMES = ["Alice", "Bob", "Charlie"]

# Ratings: [operator][part][replicate]
# Alice: mostly matches reference
# Bob: misses some defects (calls fail as pass)
# Charlie: has some false alarms (calls pass as fail)
RATINGS_3D = [
    # Alice (accurate)
    [
        ["pass", "pass"],  # Part 0: ref=pass -> correct
        ["fail", "fail"],  # Part 1: ref=fail -> correct
        ["pass", "pass"],  # Part 2: ref=pass -> correct
        ["pass", "pass"],  # Part 3: ref=pass -> correct
        ["fail", "fail"],  # Part 4: ref=fail -> correct
        ["pass", "pass"],  # Part 5: ref=pass -> correct
        ["fail", "fail"],  # Part 6: ref=fail -> correct
        ["pass", "pass"],  # Part 7: ref=pass -> correct
        ["fail", "fail"],  # Part 8: ref=fail -> correct
        ["pass", "pass"],  # Part 9: ref=pass -> correct
    ],
    # Bob (misses defects — calls fail parts as pass)
    [
        ["pass", "pass"],  # Part 0: ref=pass -> correct
        ["pass", "pass"],  # Part 1: ref=fail -> MISS
        ["pass", "pass"],  # Part 2: ref=pass -> correct
        ["pass", "pass"],  # Part 3: ref=pass -> correct
        ["fail", "fail"],  # Part 4: ref=fail -> correct
        ["pass", "pass"],  # Part 5: ref=pass -> correct
        ["pass", "pass"],  # Part 6: ref=fail -> MISS
        ["pass", "pass"],  # Part 7: ref=pass -> correct
        ["fail", "fail"],  # Part 8: ref=fail -> correct
        ["pass", "pass"],  # Part 9: ref=pass -> correct
    ],
    # Charlie (false alarms — calls pass parts as fail)
    [
        ["fail", "fail"],  # Part 0: ref=pass -> FALSE ALARM
        ["fail", "fail"],  # Part 1: ref=fail -> correct
        ["pass", "pass"],  # Part 2: ref=pass -> correct
        ["fail", "fail"],  # Part 3: ref=pass -> FALSE ALARM
        ["fail", "fail"],  # Part 4: ref=fail -> correct
        ["pass", "pass"],  # Part 5: ref=pass -> correct
        ["fail", "fail"],  # Part 6: ref=fail -> correct
        ["pass", "pass"],  # Part 7: ref=pass -> correct
        ["fail", "fail"],  # Part 8: ref=fail -> correct
        ["pass", "pass"],  # Part 9: ref=pass -> correct
    ],
]


class TestAttributeMSAWithReference:
    def setup_method(self):
        self.engine = AttributeMSAEngine()

    def test_vs_reference_computed(self):
        result = self.engine.calculate(
            RATINGS_3D,
            reference_decisions=REFERENCE_DECISIONS,
            operator_names=OPERATOR_NAMES,
        )
        assert result.vs_reference is not None
        # Alice: 10/10 = 100%
        assert result.vs_reference["Alice"] == 100.0
        # Bob: 8/10 = 80% (misses 2 defects)
        assert abs(result.vs_reference["Bob"] - 80.0) < 0.01
        # Charlie: 8/10 = 80% (2 false alarms)
        assert abs(result.vs_reference["Charlie"] - 80.0) < 0.01

    def test_miss_rates_computed(self):
        result = self.engine.calculate(
            RATINGS_3D,
            reference_decisions=REFERENCE_DECISIONS,
            operator_names=OPERATOR_NAMES,
        )
        assert result.miss_rates is not None
        # Alice: 0 misses out of 4 defective = 0%
        assert result.miss_rates["Alice"] == 0.0
        # Bob: 2 misses out of 4 defective = 50%
        assert abs(result.miss_rates["Bob"] - 50.0) < 0.01
        # Charlie: 0 misses out of 4 defective = 0% (she catches all defects)
        assert result.miss_rates["Charlie"] == 0.0

    def test_false_alarm_rates_computed(self):
        result = self.engine.calculate(
            RATINGS_3D,
            reference_decisions=REFERENCE_DECISIONS,
            operator_names=OPERATOR_NAMES,
        )
        assert result.false_alarm_rates is not None
        # Alice: 0 false alarms out of 6 good = 0%
        assert result.false_alarm_rates["Alice"] == 0.0
        # Bob: 0 false alarms out of 6 good = 0%
        assert result.false_alarm_rates["Bob"] == 0.0
        # Charlie: 2 false alarms out of 6 good = 33.33%
        assert abs(result.false_alarm_rates["Charlie"] - 33.333) < 0.1

    def test_effectiveness_computed(self):
        result = self.engine.calculate(
            RATINGS_3D,
            reference_decisions=REFERENCE_DECISIONS,
            operator_names=OPERATOR_NAMES,
        )
        assert result.effectiveness is not None
        # Total: Alice 10 + Bob 8 + Charlie 8 = 26 correct out of 30
        assert abs(result.effectiveness - (26 / 30) * 100) < 0.01

    def test_confusion_matrix_structure(self):
        result = self.engine.calculate(
            RATINGS_3D,
            reference_decisions=REFERENCE_DECISIONS,
            operator_names=OPERATOR_NAMES,
        )
        assert result.confusion_matrix is not None
        assert "Alice" in result.confusion_matrix
        assert "Bob" in result.confusion_matrix
        assert "Charlie" in result.confusion_matrix

        # Each operator's CM should have 'fail' and 'pass' keys
        for op_name in OPERATOR_NAMES:
            cm = result.confusion_matrix[op_name]
            assert "fail" in cm
            assert "pass" in cm
            assert "fail" in cm["fail"]
            assert "pass" in cm["fail"]
            assert "fail" in cm["pass"]
            assert "pass" in cm["pass"]

    def test_confusion_matrix_alice(self):
        result = self.engine.calculate(
            RATINGS_3D,
            reference_decisions=REFERENCE_DECISIONS,
            operator_names=OPERATOR_NAMES,
        )
        cm = result.confusion_matrix["Alice"]
        # Alice is perfect: 4 fail->fail, 6 pass->pass, 0 off-diagonal
        assert cm["fail"]["fail"] == 4
        assert cm["fail"]["pass"] == 0
        assert cm["pass"]["pass"] == 6
        assert cm["pass"]["fail"] == 0

    def test_confusion_matrix_bob(self):
        result = self.engine.calculate(
            RATINGS_3D,
            reference_decisions=REFERENCE_DECISIONS,
            operator_names=OPERATOR_NAMES,
        )
        cm = result.confusion_matrix["Bob"]
        # Bob: 2 fail->pass (misses), 2 fail->fail (catches)
        assert cm["fail"]["fail"] == 2
        assert cm["fail"]["pass"] == 2  # misses
        assert cm["pass"]["pass"] == 6
        assert cm["pass"]["fail"] == 0

    def test_confusion_matrix_charlie(self):
        result = self.engine.calculate(
            RATINGS_3D,
            reference_decisions=REFERENCE_DECISIONS,
            operator_names=OPERATOR_NAMES,
        )
        cm = result.confusion_matrix["Charlie"]
        # Charlie: 2 pass->fail (false alarms)
        assert cm["fail"]["fail"] == 4
        assert cm["fail"]["pass"] == 0
        assert cm["pass"]["pass"] == 4
        assert cm["pass"]["fail"] == 2  # false alarms


class TestAttributeMSAWithoutReference:
    def setup_method(self):
        self.engine = AttributeMSAEngine()

    def test_no_reference_no_miss_rates(self):
        result = self.engine.calculate(
            RATINGS_3D,
            reference_decisions=None,
            operator_names=OPERATOR_NAMES,
        )
        assert result.miss_rates is None
        assert result.false_alarm_rates is None
        assert result.effectiveness is None
        assert result.confusion_matrix is None

    def test_no_reference_no_vs_reference(self):
        result = self.engine.calculate(
            RATINGS_3D,
            reference_decisions=None,
            operator_names=OPERATOR_NAMES,
        )
        assert result.vs_reference is None


class TestAttributeMSAMultiCategory:
    """Test with 3+ categories to exercise the non-binary path."""

    def setup_method(self):
        self.engine = AttributeMSAEngine()

    def test_multi_category_miss_rate_is_overall(self):
        # 3 categories: good, marginal, reject
        reference = ["good", "good", "marginal", "reject", "good"]
        ratings = [
            # Operator 1: 4/5 correct
            [["good"], ["good"], ["marginal"], ["reject"], ["marginal"]],
            # Operator 2: 3/5 correct
            [["good"], ["marginal"], ["good"], ["reject"], ["good"]],
        ]
        result = self.engine.calculate(
            ratings,
            reference_decisions=reference,
            operator_names=["Op1", "Op2"],
        )
        assert result.miss_rates is not None
        # Op1: 1 miss out of 5 = 20%
        assert abs(result.miss_rates["Op1"] - 20.0) < 0.01
        # Op2: 2 misses out of 5 = 40%
        assert abs(result.miss_rates["Op2"] - 40.0) < 0.01

    def test_multi_category_confusion_matrix_3x3(self):
        reference = ["good", "good", "marginal", "reject", "good"]
        ratings = [
            [["good"], ["good"], ["marginal"], ["reject"], ["good"]],
            [["good"], ["marginal"], ["good"], ["reject"], ["good"]],
        ]
        result = self.engine.calculate(
            ratings,
            reference_decisions=reference,
            operator_names=["Op1", "Op2"],
        )
        assert result.confusion_matrix is not None
        cm_op2 = result.confusion_matrix["Op2"]
        # Should have good, marginal, reject as keys
        assert "good" in cm_op2
        assert "marginal" in cm_op2
        assert "reject" in cm_op2


class TestReferenceLengthMismatch:
    def test_raises_on_length_mismatch(self):
        engine = AttributeMSAEngine()
        with pytest.raises(ValueError, match="Reference decisions length"):
            engine.calculate(
                RATINGS_3D,
                reference_decisions=["pass", "fail"],  # too short
                operator_names=OPERATOR_NAMES,
            )
