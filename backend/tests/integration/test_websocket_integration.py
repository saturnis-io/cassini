"""Integration tests for WebSocket notification helpers.

Tests the notification helper functions with a database backend.
"""

from datetime import datetime

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession
from unittest.mock import AsyncMock, patch

from openspc.api.v1.websocket import (
    manager,
    notify_sample,
    notify_violation,
    notify_acknowledgment,
)
from openspc.db.models.characteristic import Characteristic, ProviderType
from openspc.db.models.hierarchy import Hierarchy
from openspc.db.models.sample import Sample, Measurement
from openspc.db.models.violation import Violation


@pytest_asyncio.fixture
async def hierarchy(async_session: AsyncSession) -> Hierarchy:
    """Create test hierarchy node."""
    hierarchy = Hierarchy(
        name="Test Plant",
        type="Site",
        parent_id=None,
    )
    async_session.add(hierarchy)
    await async_session.commit()
    await async_session.refresh(hierarchy)
    return hierarchy


@pytest_asyncio.fixture
async def characteristic(async_session: AsyncSession, hierarchy: Hierarchy) -> Characteristic:
    """Create test characteristic."""
    char = Characteristic(
        hierarchy_id=hierarchy.id,
        name="Test Characteristic",
        description="Test measurement",
        subgroup_size=3,
        target_value=10.0,
        usl=12.0,
        lsl=8.0,
        provider_type=ProviderType.MANUAL,
    )
    async_session.add(char)
    await async_session.commit()
    await async_session.refresh(char)
    return char


@pytest_asyncio.fixture
async def sample(async_session: AsyncSession, characteristic: Characteristic) -> Sample:
    """Create test sample with measurements."""
    sample = Sample(
        char_id=characteristic.id,
        timestamp=datetime.utcnow(),
        batch_number="BATCH-001",
        operator_id="OP123",
    )
    async_session.add(sample)
    await async_session.flush()

    # Add measurements
    for value in [10.1, 10.2, 10.0]:
        measurement = Measurement(sample_id=sample.id, value=value)
        async_session.add(measurement)

    await async_session.commit()
    await async_session.refresh(sample)
    return sample


@pytest_asyncio.fixture
async def violation(async_session: AsyncSession, sample: Sample) -> Violation:
    """Create test violation."""
    violation = Violation(
        sample_id=sample.id,
        rule_id=1,
        rule_name="One point beyond 3 sigma",
        severity="CRITICAL",
    )
    async_session.add(violation)
    await async_session.commit()
    await async_session.refresh(violation)
    return violation


class TestWebSocketNotifications:
    """Integration tests for WebSocket notification helpers."""

    @pytest.mark.asyncio
    async def test_notify_sample(self, characteristic: Characteristic, sample: Sample):
        """Test notify_sample broadcasts correctly."""
        # Mock the manager's broadcast method
        with patch.object(manager, 'broadcast_to_characteristic', new=AsyncMock()) as mock_broadcast:
            await notify_sample(
                char_id=characteristic.id,
                sample_id=sample.id,
                timestamp=sample.timestamp,
                value=10.1,
                zone="zone_c_upper",
                in_control=True,
            )

            # Verify broadcast was called with correct parameters
            mock_broadcast.assert_called_once()
            call_args = mock_broadcast.call_args
            assert call_args[0][0] == characteristic.id  # char_id

            message = call_args[0][1]
            assert message["type"] == "sample"
            assert message["payload"]["sample_id"] == sample.id
            assert message["payload"]["characteristic_id"] == characteristic.id
            assert message["payload"]["value"] == 10.1
            assert message["payload"]["zone"] == "zone_c_upper"
            assert message["payload"]["in_control"] is True

    @pytest.mark.asyncio
    async def test_notify_violation(
        self,
        characteristic: Characteristic,
        sample: Sample,
        violation: Violation,
    ):
        """Test notify_violation broadcasts correctly."""
        with patch.object(manager, 'broadcast_to_characteristic', new=AsyncMock()) as mock_broadcast:
            await notify_violation(
                char_id=characteristic.id,
                violation_id=violation.id,
                sample_id=sample.id,
                rule_id=violation.rule_id,
                rule_name=violation.rule_name,
                severity=violation.severity,
            )

            # Verify broadcast was called
            mock_broadcast.assert_called_once()
            call_args = mock_broadcast.call_args
            assert call_args[0][0] == characteristic.id

            message = call_args[0][1]
            assert message["type"] == "violation"
            assert message["payload"]["violation_id"] == violation.id
            assert message["payload"]["characteristic_id"] == characteristic.id
            assert message["payload"]["sample_id"] == sample.id
            assert message["payload"]["rule_id"] == violation.rule_id
            assert message["payload"]["severity"] == violation.severity

    @pytest.mark.asyncio
    async def test_notify_acknowledgment(
        self,
        characteristic: Characteristic,
        violation: Violation,
    ):
        """Test notify_acknowledgment broadcasts correctly."""
        with patch.object(manager, 'broadcast_to_characteristic', new=AsyncMock()) as mock_broadcast:
            await notify_acknowledgment(
                char_id=characteristic.id,
                violation_id=violation.id,
                acknowledged=True,
                ack_user="operator1",
                ack_reason="Process adjusted",
            )

            # Verify broadcast was called
            mock_broadcast.assert_called_once()
            call_args = mock_broadcast.call_args
            assert call_args[0][0] == characteristic.id

            message = call_args[0][1]
            assert message["type"] == "ack_update"
            assert message["payload"]["violation_id"] == violation.id
            assert message["payload"]["characteristic_id"] == characteristic.id
            assert message["payload"]["acknowledged"] is True
            assert message["payload"]["ack_user"] == "operator1"
            assert message["payload"]["ack_reason"] == "Process adjusted"

    @pytest.mark.asyncio
    async def test_notify_acknowledgment_unack(
        self,
        characteristic: Characteristic,
        violation: Violation,
    ):
        """Test notify_acknowledgment for un-acknowledging."""
        with patch.object(manager, 'broadcast_to_characteristic', new=AsyncMock()) as mock_broadcast:
            await notify_acknowledgment(
                char_id=characteristic.id,
                violation_id=violation.id,
                acknowledged=False,
            )

            mock_broadcast.assert_called_once()
            call_args = mock_broadcast.call_args
            message = call_args[0][1]

            assert message["payload"]["acknowledged"] is False
            assert message["payload"]["ack_user"] is None
            assert message["payload"]["ack_reason"] is None

    @pytest.mark.asyncio
    async def test_connection_manager_integration(self):
        """Test that the connection manager is properly initialized."""
        # Verify manager is available
        assert manager is not None
        assert hasattr(manager, 'connect')
        assert hasattr(manager, 'disconnect')
        assert hasattr(manager, 'subscribe')
        assert hasattr(manager, 'broadcast_to_characteristic')

        # Verify initial state
        assert manager.get_connection_count() >= 0  # May have connections from other tests
