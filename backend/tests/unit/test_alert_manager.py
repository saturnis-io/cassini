"""Unit tests for AlertManager."""

from datetime import datetime, timedelta
from unittest.mock import AsyncMock, Mock

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from openspc.core.alerts.manager import (
    REASON_CODES,
    AlertManager,
    AlertNotifier,
    ViolationAcknowledged,
    ViolationCreated,
    ViolationStats,
)
from openspc.core.engine.nelson_rules import RuleResult, Severity
from openspc.db.models.characteristic import Characteristic
from openspc.db.models.hierarchy import Hierarchy
from openspc.db.models.sample import Sample
from openspc.db.models.violation import Violation
from openspc.db.repositories import SampleRepository, ViolationRepository


class MockNotifier:
    """Mock notifier for testing."""

    def __init__(self):
        self.created_events: list[ViolationCreated] = []
        self.acknowledged_events: list[ViolationAcknowledged] = []

    async def notify_violation_created(self, event: ViolationCreated) -> None:
        """Record created event."""
        self.created_events.append(event)

    async def notify_violation_acknowledged(self, event: ViolationAcknowledged) -> None:
        """Record acknowledged event."""
        self.acknowledged_events.append(event)


@pytest.fixture
async def test_hierarchy(async_session: AsyncSession) -> Hierarchy:
    """Create test hierarchy node."""
    hierarchy = Hierarchy(name="Test Site", type="Site", parent_id=None)
    async_session.add(hierarchy)
    await async_session.flush()
    return hierarchy


@pytest.fixture
async def test_characteristic(
    async_session: AsyncSession, test_hierarchy: Hierarchy
) -> Characteristic:
    """Create test characteristic."""
    char = Characteristic(
        name="Test Char",
        hierarchy_id=test_hierarchy.id,
        subgroup_size=1,
        ucl=103.0,
        lcl=97.0,
        provider_type="MANUAL",
    )
    async_session.add(char)
    await async_session.flush()
    return char


@pytest.fixture
async def test_sample(
    async_session: AsyncSession, test_characteristic: Characteristic
) -> Sample:
    """Create test sample."""
    sample = Sample(
        char_id=test_characteristic.id,
        timestamp=datetime.utcnow(),
        batch_number="BATCH-001",
        operator_id="OPR-123",
        is_excluded=False,
    )
    async_session.add(sample)
    await async_session.flush()
    return sample


@pytest.fixture
def violation_repo(async_session: AsyncSession) -> ViolationRepository:
    """Create violation repository."""
    return ViolationRepository(async_session)


@pytest.fixture
def sample_repo(async_session: AsyncSession) -> SampleRepository:
    """Create sample repository."""
    return SampleRepository(async_session)


@pytest.fixture
def alert_manager(
    violation_repo: ViolationRepository, sample_repo: SampleRepository
) -> AlertManager:
    """Create alert manager."""
    return AlertManager(violation_repo, sample_repo)


class TestAlertManagerCreation:
    """Tests for violation creation."""

    @pytest.mark.asyncio
    async def test_create_violations_from_rule_results(
        self,
        alert_manager: AlertManager,
        test_sample: Sample,
        test_characteristic: Characteristic,
        async_session: AsyncSession,
    ) -> None:
        """Test creating violations from rule results."""
        # Create rule results with one triggered
        rule_results = [
            RuleResult(
                rule_id=1,
                rule_name="Outlier",
                triggered=True,
                severity=Severity.CRITICAL,
                involved_sample_ids=[test_sample.id],
                message="Point beyond 3 sigma",
            ),
            RuleResult(
                rule_id=2,
                rule_name="Nine Points One Side",
                triggered=False,
                severity=Severity.WARNING,
                involved_sample_ids=[],
                message="",
            ),
        ]

        violations = await alert_manager.create_violations(
            sample_id=test_sample.id,
            characteristic_id=test_characteristic.id,
            rule_results=rule_results,
        )

        # Should only create violation for triggered rule
        assert len(violations) == 1
        assert violations[0].sample_id == test_sample.id
        assert violations[0].rule_id == 1
        assert violations[0].rule_name == "Outlier"
        assert violations[0].severity == "CRITICAL"
        assert violations[0].acknowledged is False

    @pytest.mark.asyncio
    async def test_create_violations_only_processes_triggered_rules(
        self,
        alert_manager: AlertManager,
        test_sample: Sample,
        test_characteristic: Characteristic,
        violation_repo: ViolationRepository,
    ) -> None:
        """Test that only triggered rules create violations."""
        # All rules not triggered
        rule_results = [
            RuleResult(
                rule_id=1,
                rule_name="Outlier",
                triggered=False,
                severity=Severity.CRITICAL,
                involved_sample_ids=[],
                message="",
            ),
            RuleResult(
                rule_id=2,
                rule_name="Nine Points One Side",
                triggered=False,
                severity=Severity.WARNING,
                involved_sample_ids=[],
                message="",
            ),
        ]

        violations = await alert_manager.create_violations(
            sample_id=test_sample.id,
            characteristic_id=test_characteristic.id,
            rule_results=rule_results,
        )

        # Should create no violations
        assert len(violations) == 0

        # Verify nothing in database
        db_violations = await violation_repo.get_by_sample(test_sample.id)
        assert len(db_violations) == 0

    @pytest.mark.asyncio
    async def test_create_violations_multiple_triggered(
        self,
        alert_manager: AlertManager,
        test_sample: Sample,
        test_characteristic: Characteristic,
    ) -> None:
        """Test creating multiple violations when multiple rules trigger."""
        rule_results = [
            RuleResult(
                rule_id=1,
                rule_name="Outlier",
                triggered=True,
                severity=Severity.CRITICAL,
                involved_sample_ids=[test_sample.id],
                message="Point beyond 3 sigma",
            ),
            RuleResult(
                rule_id=2,
                rule_name="Nine Points One Side",
                triggered=True,
                severity=Severity.WARNING,
                involved_sample_ids=[test_sample.id],
                message="Nine consecutive points on one side",
            ),
        ]

        violations = await alert_manager.create_violations(
            sample_id=test_sample.id,
            characteristic_id=test_characteristic.id,
            rule_results=rule_results,
        )

        assert len(violations) == 2
        assert violations[0].rule_id == 1
        assert violations[1].rule_id == 2

    @pytest.mark.asyncio
    async def test_create_violations_notifies_listeners(
        self,
        alert_manager: AlertManager,
        test_sample: Sample,
        test_characteristic: Characteristic,
    ) -> None:
        """Test that notifiers are called when violations are created."""
        notifier = MockNotifier()
        alert_manager.add_notifier(notifier)

        rule_results = [
            RuleResult(
                rule_id=1,
                rule_name="Outlier",
                triggered=True,
                severity=Severity.CRITICAL,
                involved_sample_ids=[test_sample.id],
                message="Point beyond 3 sigma",
            ),
        ]

        violations = await alert_manager.create_violations(
            sample_id=test_sample.id,
            characteristic_id=test_characteristic.id,
            rule_results=rule_results,
        )

        # Verify notifier was called
        assert len(notifier.created_events) == 1
        event = notifier.created_events[0]
        assert event.violation_id == violations[0].id
        assert event.sample_id == test_sample.id
        assert event.characteristic_id == test_characteristic.id
        assert event.rule_id == 1
        assert event.rule_name == "Outlier"
        assert event.severity == "CRITICAL"

    @pytest.mark.asyncio
    async def test_create_violations_sample_not_found(
        self,
        alert_manager: AlertManager,
        test_characteristic: Characteristic,
    ) -> None:
        """Test that creating violations for non-existent sample raises error."""
        rule_results = [
            RuleResult(
                rule_id=1,
                rule_name="Outlier",
                triggered=True,
                severity=Severity.CRITICAL,
                involved_sample_ids=[999],
                message="Point beyond 3 sigma",
            ),
        ]

        with pytest.raises(ValueError, match="Sample 999 not found"):
            await alert_manager.create_violations(
                sample_id=999,
                characteristic_id=test_characteristic.id,
                rule_results=rule_results,
            )


class TestAlertManagerAcknowledgment:
    """Tests for violation acknowledgment."""

    @pytest.mark.asyncio
    async def test_acknowledge_violation(
        self,
        alert_manager: AlertManager,
        test_sample: Sample,
        async_session: AsyncSession,
    ) -> None:
        """Test acknowledging a violation updates fields correctly."""
        # Create a violation
        violation = Violation(
            sample_id=test_sample.id,
            rule_id=1,
            rule_name="Outlier",
            severity="CRITICAL",
            acknowledged=False,
        )
        async_session.add(violation)
        await async_session.flush()

        # Acknowledge it
        result = await alert_manager.acknowledge(
            violation_id=violation.id,
            user="john.doe",
            reason="Tool Change",
        )

        assert result.acknowledged is True
        assert result.ack_user == "john.doe"
        assert result.ack_reason == "Tool Change"
        assert result.ack_timestamp is not None

    @pytest.mark.asyncio
    async def test_acknowledge_already_acknowledged_raises_error(
        self,
        alert_manager: AlertManager,
        test_sample: Sample,
        async_session: AsyncSession,
    ) -> None:
        """Test that acknowledging an already acknowledged violation raises error."""
        # Create an acknowledged violation
        violation = Violation(
            sample_id=test_sample.id,
            rule_id=1,
            rule_name="Outlier",
            severity="CRITICAL",
            acknowledged=True,
            ack_user="jane.doe",
            ack_reason="Already done",
            ack_timestamp=datetime.utcnow(),
        )
        async_session.add(violation)
        await async_session.flush()

        # Try to acknowledge again
        with pytest.raises(ValueError, match="is already acknowledged"):
            await alert_manager.acknowledge(
                violation_id=violation.id,
                user="john.doe",
                reason="Tool Change",
            )

    @pytest.mark.asyncio
    async def test_acknowledge_not_found_raises_error(
        self,
        alert_manager: AlertManager,
    ) -> None:
        """Test that acknowledging non-existent violation raises error."""
        with pytest.raises(ValueError, match="Violation 999 not found"):
            await alert_manager.acknowledge(
                violation_id=999,
                user="john.doe",
                reason="Tool Change",
            )

    @pytest.mark.asyncio
    async def test_acknowledge_with_exclude_sample(
        self,
        alert_manager: AlertManager,
        test_sample: Sample,
        sample_repo: SampleRepository,
        async_session: AsyncSession,
    ) -> None:
        """Test that exclude_sample option marks sample as excluded."""
        # Create a violation
        violation = Violation(
            sample_id=test_sample.id,
            rule_id=1,
            rule_name="Outlier",
            severity="CRITICAL",
            acknowledged=False,
        )
        async_session.add(violation)
        await async_session.flush()

        # Verify sample not excluded initially
        assert test_sample.is_excluded is False

        # Acknowledge with exclude_sample
        await alert_manager.acknowledge(
            violation_id=violation.id,
            user="john.doe",
            reason="Measurement Error",
            exclude_sample=True,
        )

        # Verify sample is now excluded
        updated_sample = await sample_repo.get_by_id(test_sample.id)
        assert updated_sample.is_excluded is True

    @pytest.mark.asyncio
    async def test_acknowledge_notifies_listeners(
        self,
        alert_manager: AlertManager,
        test_sample: Sample,
        async_session: AsyncSession,
    ) -> None:
        """Test that notifiers are called when violation is acknowledged."""
        notifier = MockNotifier()
        alert_manager.add_notifier(notifier)

        # Create a violation
        violation = Violation(
            sample_id=test_sample.id,
            rule_id=1,
            rule_name="Outlier",
            severity="CRITICAL",
            acknowledged=False,
        )
        async_session.add(violation)
        await async_session.flush()

        # Acknowledge it
        await alert_manager.acknowledge(
            violation_id=violation.id,
            user="john.doe",
            reason="Tool Change",
        )

        # Verify notifier was called
        assert len(notifier.acknowledged_events) == 1
        event = notifier.acknowledged_events[0]
        assert event.violation_id == violation.id
        assert event.user == "john.doe"
        assert event.reason == "Tool Change"
        assert event.timestamp is not None


class TestAlertManagerStatistics:
    """Tests for violation statistics."""

    @pytest.mark.asyncio
    async def test_get_unacknowledged_count_all(
        self,
        alert_manager: AlertManager,
        test_sample: Sample,
        async_session: AsyncSession,
    ) -> None:
        """Test getting total unacknowledged count."""
        # Create violations
        v1 = Violation(
            sample_id=test_sample.id,
            rule_id=1,
            rule_name="Outlier",
            severity="CRITICAL",
            acknowledged=False,
        )
        v2 = Violation(
            sample_id=test_sample.id,
            rule_id=2,
            rule_name="Nine Points",
            severity="WARNING",
            acknowledged=True,
            ack_user="john.doe",
            ack_reason="Fixed",
            ack_timestamp=datetime.utcnow(),
        )
        v3 = Violation(
            sample_id=test_sample.id,
            rule_id=1,
            rule_name="Outlier",
            severity="CRITICAL",
            acknowledged=False,
        )
        async_session.add_all([v1, v2, v3])
        await async_session.flush()

        count = await alert_manager.get_unacknowledged_count()
        assert count == 2

    @pytest.mark.asyncio
    async def test_get_unacknowledged_count_by_characteristic(
        self,
        alert_manager: AlertManager,
        test_characteristic: Characteristic,
        test_hierarchy: Hierarchy,
        async_session: AsyncSession,
    ) -> None:
        """Test getting unacknowledged count filtered by characteristic."""
        # Create second characteristic
        char2 = Characteristic(
            name="Test Char 2",
            hierarchy_id=test_hierarchy.id,
            subgroup_size=1,
            ucl=103.0,
            lcl=97.0,
            provider_type="MANUAL",
        )
        async_session.add(char2)
        await async_session.flush()

        # Create samples
        sample1 = Sample(char_id=test_characteristic.id, timestamp=datetime.utcnow())
        sample2 = Sample(char_id=char2.id, timestamp=datetime.utcnow())
        async_session.add_all([sample1, sample2])
        await async_session.flush()

        # Create violations
        v1 = Violation(
            sample_id=sample1.id,
            rule_id=1,
            rule_name="Outlier",
            severity="CRITICAL",
            acknowledged=False,
        )
        v2 = Violation(
            sample_id=sample2.id,
            rule_id=1,
            rule_name="Outlier",
            severity="CRITICAL",
            acknowledged=False,
        )
        async_session.add_all([v1, v2])
        await async_session.flush()

        # Get count for first characteristic
        count = await alert_manager.get_unacknowledged_count(
            characteristic_id=test_characteristic.id
        )
        assert count == 1

    @pytest.mark.asyncio
    async def test_get_violation_stats(
        self,
        alert_manager: AlertManager,
        test_sample: Sample,
        async_session: AsyncSession,
    ) -> None:
        """Test getting violation statistics."""
        # Create violations with different rules and severities
        violations = [
            Violation(
                sample_id=test_sample.id,
                rule_id=1,
                rule_name="Outlier",
                severity="CRITICAL",
                acknowledged=False,
            ),
            Violation(
                sample_id=test_sample.id,
                rule_id=1,
                rule_name="Outlier",
                severity="CRITICAL",
                acknowledged=True,
                ack_user="john.doe",
                ack_reason="Fixed",
                ack_timestamp=datetime.utcnow(),
            ),
            Violation(
                sample_id=test_sample.id,
                rule_id=2,
                rule_name="Nine Points",
                severity="WARNING",
                acknowledged=False,
            ),
            Violation(
                sample_id=test_sample.id,
                rule_id=2,
                rule_name="Nine Points",
                severity="WARNING",
                acknowledged=False,
            ),
        ]
        async_session.add_all(violations)
        await async_session.flush()

        stats = await alert_manager.get_violation_stats(
            characteristic_id=test_sample.char_id
        )

        assert stats.total == 4
        assert stats.unacknowledged == 3
        assert stats.by_rule[1] == 2
        assert stats.by_rule[2] == 2
        assert stats.by_severity["CRITICAL"] == 2
        assert stats.by_severity["WARNING"] == 2

    @pytest.mark.asyncio
    async def test_get_violation_stats_with_date_range(
        self,
        alert_manager: AlertManager,
        test_characteristic: Characteristic,
        async_session: AsyncSession,
    ) -> None:
        """Test getting violation statistics with date filtering."""
        now = datetime.utcnow()
        old_date = now - timedelta(days=10)
        recent_date = now - timedelta(days=2)

        # Create samples at different times
        old_sample = Sample(
            char_id=test_characteristic.id,
            timestamp=old_date,
        )
        recent_sample = Sample(
            char_id=test_characteristic.id,
            timestamp=recent_date,
        )
        async_session.add_all([old_sample, recent_sample])
        await async_session.flush()

        # Create violations
        v1 = Violation(
            sample_id=old_sample.id,
            rule_id=1,
            rule_name="Outlier",
            severity="CRITICAL",
            acknowledged=False,
        )
        v2 = Violation(
            sample_id=recent_sample.id,
            rule_id=1,
            rule_name="Outlier",
            severity="CRITICAL",
            acknowledged=False,
        )
        async_session.add_all([v1, v2])
        await async_session.flush()

        # Get stats for last 5 days
        stats = await alert_manager.get_violation_stats(
            characteristic_id=test_characteristic.id,
            start_date=now - timedelta(days=5),
        )

        # Should only include recent violation
        assert stats.total == 1
        assert stats.unacknowledged == 1


class TestAlertManagerReasonCodes:
    """Tests for reason codes."""

    def test_get_reason_codes(self) -> None:
        """Test getting list of reason codes."""
        codes = AlertManager.get_reason_codes()

        assert isinstance(codes, list)
        assert len(codes) > 0
        assert "Tool Change" in codes
        assert "Measurement Error" in codes
        assert "Other" in codes

    def test_get_reason_codes_returns_copy(self) -> None:
        """Test that get_reason_codes returns a copy, not the original."""
        codes1 = AlertManager.get_reason_codes()
        codes2 = AlertManager.get_reason_codes()

        # Modify one
        codes1.append("Custom Reason")

        # Verify they're independent
        assert len(codes1) != len(codes2)
        assert "Custom Reason" in codes1
        assert "Custom Reason" not in codes2

    def test_reason_codes_constant(self) -> None:
        """Test that REASON_CODES constant is available."""
        assert isinstance(REASON_CODES, list)
        assert len(REASON_CODES) == 11
        assert REASON_CODES[0] == "Tool Change"
        assert REASON_CODES[-1] == "Other"


class TestAlertManagerNotifierManagement:
    """Tests for notifier management."""

    def test_add_notifier(
        self, alert_manager: AlertManager
    ) -> None:
        """Test adding notifiers."""
        notifier1 = MockNotifier()
        notifier2 = MockNotifier()

        alert_manager.add_notifier(notifier1)
        alert_manager.add_notifier(notifier2)

        # Verify both are in the list
        assert len(alert_manager._notifiers) == 2

    @pytest.mark.asyncio
    async def test_multiple_notifiers_all_called(
        self,
        alert_manager: AlertManager,
        test_sample: Sample,
        test_characteristic: Characteristic,
    ) -> None:
        """Test that all notifiers are called."""
        notifier1 = MockNotifier()
        notifier2 = MockNotifier()
        alert_manager.add_notifier(notifier1)
        alert_manager.add_notifier(notifier2)

        rule_results = [
            RuleResult(
                rule_id=1,
                rule_name="Outlier",
                triggered=True,
                severity=Severity.CRITICAL,
                involved_sample_ids=[test_sample.id],
                message="Point beyond 3 sigma",
            ),
        ]

        await alert_manager.create_violations(
            sample_id=test_sample.id,
            characteristic_id=test_characteristic.id,
            rule_results=rule_results,
        )

        # Verify both notifiers were called
        assert len(notifier1.created_events) == 1
        assert len(notifier2.created_events) == 1
