"""Alert management for SPC violations.

This module provides AlertManager for handling violation creation,
acknowledgment workflow, and notification broadcasting.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

from openspc.core.engine.nelson_rules import RuleResult
from openspc.db.models.violation import Violation
from openspc.db.repositories.sample import SampleRepository
from openspc.db.repositories.violation import ViolationRepository


# Standard reason codes for acknowledging violations
REASON_CODES = [
    "Tool Change",
    "Raw Material Change",
    "Setup Adjustment",
    "Measurement Error",
    "Process Adjustment",
    "Environmental Factor",
    "Operator Error",
    "Equipment Malfunction",
    "False Alarm",
    "Under Investigation",
    "Other",
]


@dataclass
class ViolationCreated:
    """Event when a new violation is created.

    This event is broadcast to all registered notifiers when a violation
    is detected and persisted to the database.

    Attributes:
        violation_id: Database ID of the violation
        sample_id: ID of the sample that triggered the violation
        characteristic_id: ID of the characteristic being monitored
        rule_id: Nelson Rule number (1-8)
        rule_name: Human-readable rule name
        severity: Severity level (WARNING or CRITICAL)
        timestamp: When the violation occurred
    """

    violation_id: int
    sample_id: int
    characteristic_id: int
    rule_id: int
    rule_name: str
    severity: str
    timestamp: datetime


@dataclass
class ViolationAcknowledged:
    """Event when a violation is acknowledged.

    This event is broadcast to all registered notifiers when a user
    acknowledges a violation.

    Attributes:
        violation_id: Database ID of the violation
        user: User who acknowledged the violation
        reason: Reason code or description
        timestamp: When the acknowledgment occurred
    """

    violation_id: int
    user: str
    reason: str
    timestamp: datetime


@dataclass
class ViolationStats:
    """Statistics about violations.

    Provides aggregate statistics for dashboard display and reporting.

    Attributes:
        total: Total number of violations
        unacknowledged: Count of unacknowledged violations that require acknowledgement
        informational: Count of unacknowledged violations that don't require acknowledgement
        by_rule: Counts grouped by rule ID (rule_id -> count)
        by_severity: Counts grouped by severity (severity -> count)
    """

    total: int
    unacknowledged: int
    informational: int
    by_rule: dict[int, int]
    by_severity: dict[str, int]


class AlertNotifier(Protocol):
    """Protocol for broadcasting alert events.

    Implementations can broadcast via WebSocket, MQTT, email, etc.
    """

    async def notify_violation_created(self, event: ViolationCreated) -> None:
        """Broadcast new violation to interested parties.

        Args:
            event: ViolationCreated event with violation details
        """
        ...

    async def notify_violation_acknowledged(self, event: ViolationAcknowledged) -> None:
        """Broadcast acknowledgment to interested parties.

        Args:
            event: ViolationAcknowledged event with acknowledgment details
        """
        ...


class AlertManager:
    """Manages violation alerts and acknowledgment workflow.

    The AlertManager is responsible for:
    - Creating violation records from rule evaluation results
    - Managing the acknowledgment workflow
    - Broadcasting events to registered notifiers
    - Providing violation statistics

    Example:
        >>> manager = AlertManager(violation_repo, sample_repo)
        >>> manager.add_notifier(websocket_notifier)
        >>>
        >>> # Create violations from rule results
        >>> violations = await manager.create_violations(
        ...     sample_id=42,
        ...     characteristic_id=1,
        ...     rule_results=rule_results
        ... )
        >>>
        >>> # Acknowledge a violation
        >>> await manager.acknowledge(
        ...     violation_id=1,
        ...     user="john.doe",
        ...     reason="Tool Change"
        ... )
    """

    def __init__(
        self,
        violation_repo: ViolationRepository,
        sample_repo: SampleRepository,
        notifiers: list[AlertNotifier] | None = None,
    ):
        """Initialize alert manager.

        Args:
            violation_repo: Repository for violation operations
            sample_repo: Repository for sample operations
            notifiers: Optional list of notifiers for event broadcasting
        """
        self._violation_repo = violation_repo
        self._sample_repo = sample_repo
        self._notifiers = notifiers or []

    def add_notifier(self, notifier: AlertNotifier) -> None:
        """Add a notifier for alert broadcasting.

        Args:
            notifier: Notifier instance implementing AlertNotifier protocol
        """
        self._notifiers.append(notifier)

    async def create_violations(
        self,
        sample_id: int,
        characteristic_id: int,
        rule_results: list[RuleResult],
    ) -> list[Violation]:
        """Create violation records for triggered rules.

        Only creates violations for rules where triggered=True.
        Notifies all registered notifiers for each violation created.

        Args:
            sample_id: ID of the sample that triggered violations
            characteristic_id: ID of the characteristic being monitored
            rule_results: List of rule evaluation results

        Returns:
            List of created Violation records

        Example:
            >>> violations = await manager.create_violations(
            ...     sample_id=42,
            ...     characteristic_id=1,
            ...     rule_results=[
            ...         RuleResult(
            ...             rule_id=1,
            ...             rule_name="Outlier",
            ...             triggered=True,
            ...             severity=Severity.CRITICAL,
            ...             involved_sample_ids=[42],
            ...             message="Point beyond 3 sigma"
            ...         )
            ...     ]
            ... )
        """
        violations = []

        # Get sample to access timestamp
        sample = await self._sample_repo.get_by_id(sample_id)
        if sample is None:
            raise ValueError(f"Sample {sample_id} not found")

        for result in rule_results:
            # Only create violations for triggered rules
            if not result.triggered:
                continue

            # Create violation record
            violation = Violation(
                sample_id=sample_id,
                rule_id=result.rule_id,
                rule_name=result.rule_name,
                severity=result.severity.value,
                acknowledged=False,
            )
            self._violation_repo.session.add(violation)
            await self._violation_repo.session.flush()
            await self._violation_repo.session.refresh(violation)

            violations.append(violation)

            # Broadcast event to all notifiers
            event = ViolationCreated(
                violation_id=violation.id,
                sample_id=sample_id,
                characteristic_id=characteristic_id,
                rule_id=result.rule_id,
                rule_name=result.rule_name,
                severity=result.severity.value,
                timestamp=sample.timestamp,
            )

            for notifier in self._notifiers:
                await notifier.notify_violation_created(event)

        return violations

    async def acknowledge(
        self,
        violation_id: int,
        user: str,
        reason: str,
        exclude_sample: bool = False,
    ) -> Violation:
        """Acknowledge a violation.

        Updates the violation with acknowledgment information and optionally
        marks the associated sample as excluded from control limit calculations.

        Args:
            violation_id: ID of violation to acknowledge
            user: User performing acknowledgment
            reason: Reason code or description
            exclude_sample: If True, mark the associated sample as excluded

        Returns:
            Updated Violation record

        Raises:
            ValueError: If violation not found
            ValueError: If already acknowledged

        Example:
            >>> violation = await manager.acknowledge(
            ...     violation_id=1,
            ...     user="john.doe",
            ...     reason="Tool Change",
            ...     exclude_sample=True
            ... )
        """
        # Get the violation
        violation = await self._violation_repo.get_by_id(violation_id)
        if violation is None:
            raise ValueError(f"Violation {violation_id} not found")

        # Check if already acknowledged
        if violation.acknowledged:
            raise ValueError(f"Violation {violation_id} is already acknowledged")

        # Update violation
        violation.acknowledged = True
        violation.ack_user = user
        violation.ack_reason = reason
        violation.ack_timestamp = datetime.utcnow()

        await self._violation_repo.session.flush()
        await self._violation_repo.session.refresh(violation)

        # Optionally exclude the sample
        if exclude_sample:
            sample = await self._sample_repo.get_by_id(violation.sample_id)
            if sample is not None:
                sample.is_excluded = True
                await self._sample_repo.session.flush()

        # Broadcast acknowledgment event
        event = ViolationAcknowledged(
            violation_id=violation_id,
            user=user,
            reason=reason,
            timestamp=violation.ack_timestamp,
        )

        for notifier in self._notifiers:
            await notifier.notify_violation_acknowledged(event)

        return violation

    async def get_unacknowledged_count(
        self, characteristic_id: int | None = None
    ) -> int:
        """Get count of unacknowledged violations.

        Args:
            characteristic_id: Optional ID to filter by characteristic

        Returns:
            Count of unacknowledged violations

        Example:
            >>> # Get total unacknowledged across all characteristics
            >>> count = await manager.get_unacknowledged_count()
            >>>
            >>> # Get unacknowledged for specific characteristic
            >>> count = await manager.get_unacknowledged_count(characteristic_id=1)
        """
        violations = await self._violation_repo.get_unacknowledged(char_id=characteristic_id)
        return len(violations)

    async def get_violation_stats(
        self,
        characteristic_id: int | None = None,
        start_date: datetime | None = None,
        end_date: datetime | None = None,
    ) -> ViolationStats:
        """Get violation statistics for dashboard.

        Provides aggregate statistics including total violations,
        unacknowledged count, and breakdowns by rule and severity.

        Args:
            characteristic_id: Optional ID to filter by characteristic
            start_date: Optional start of date range
            end_date: Optional end of date range

        Returns:
            ViolationStats with aggregated statistics

        Example:
            >>> stats = await manager.get_violation_stats(characteristic_id=1)
            >>> print(f"Total: {stats.total}, Unacknowledged: {stats.unacknowledged}")
            >>> print(f"By severity: {stats.by_severity}")
        """
        from openspc.db.models.sample import Sample
        from sqlalchemy import and_, select

        # Build query
        stmt = select(Violation).join(Sample, Violation.sample_id == Sample.id)

        # Apply filters
        filters = []
        if characteristic_id is not None:
            filters.append(Sample.char_id == characteristic_id)
        if start_date is not None:
            filters.append(Sample.timestamp >= start_date)
        if end_date is not None:
            filters.append(Sample.timestamp <= end_date)

        if filters:
            stmt = stmt.where(and_(*filters))

        # Execute query
        result = await self._violation_repo.session.execute(stmt)
        violations = list(result.scalars().all())

        # Calculate statistics
        total = len(violations)
        # Unacknowledged = requires acknowledgement AND not acknowledged
        unacknowledged = sum(
            1 for v in violations
            if not v.acknowledged and v.requires_acknowledgement
        )
        # Informational = does NOT require acknowledgement AND not acknowledged
        informational = sum(
            1 for v in violations
            if not v.acknowledged and not v.requires_acknowledgement
        )

        # Group by rule
        by_rule: dict[int, int] = {}
        for v in violations:
            by_rule[v.rule_id] = by_rule.get(v.rule_id, 0) + 1

        # Group by severity
        by_severity: dict[str, int] = {}
        for v in violations:
            by_severity[v.severity] = by_severity.get(v.severity, 0) + 1

        return ViolationStats(
            total=total,
            unacknowledged=unacknowledged,
            informational=informational,
            by_rule=by_rule,
            by_severity=by_severity,
        )

    @staticmethod
    def get_reason_codes() -> list[str]:
        """Get list of standard reason codes.

        Returns:
            List of predefined reason codes for violation acknowledgment

        Example:
            >>> codes = AlertManager.get_reason_codes()
            >>> print(codes)
            ['Tool Change', 'Raw Material Change', ...]
        """
        return REASON_CODES.copy()
