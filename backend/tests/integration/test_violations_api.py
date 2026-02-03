"""Integration tests for Violation REST API endpoints."""

from datetime import datetime, timedelta

import pytest
import pytest_asyncio
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from openspc.api.v1.violations import (
    acknowledge_violation,
    batch_acknowledge,
    get_reason_codes,
    get_violation,
    get_violation_stats,
    list_violations,
)
from openspc.api.schemas.violation import BatchAcknowledgeRequest, ViolationAcknowledge
from openspc.core.alerts.manager import AlertManager
from openspc.db.models.characteristic import Characteristic, ProviderType
from openspc.db.models.hierarchy import Hierarchy
from openspc.db.models.sample import Measurement, Sample
from openspc.db.models.violation import Violation
from openspc.db.repositories.sample import SampleRepository
from openspc.db.repositories.violation import ViolationRepository


@pytest_asyncio.fixture
async def hierarchy(async_session: AsyncSession) -> Hierarchy:
    """Create test hierarchy."""
    hierarchy = Hierarchy(
        name="Test Factory",
        type="Site",
        parent_id=None,
    )
    async_session.add(hierarchy)
    await async_session.flush()
    return hierarchy


@pytest_asyncio.fixture
async def sample_data(async_session: AsyncSession, hierarchy: Hierarchy) -> dict:
    """Create sample test data."""
    # Create a characteristic
    char = Characteristic(
        hierarchy_id=hierarchy.id,
        name="Test Characteristic",
        provider_type=ProviderType.MANUAL,
        target_value=100.0,
        usl=110.0,
        lsl=90.0,
        subgroup_size=1,
    )
    async_session.add(char)
    await async_session.flush()

    # Create samples with measurements
    now = datetime.utcnow()
    samples = []
    for i in range(5):
        sample = Sample(
            char_id=char.id,
            timestamp=now - timedelta(hours=5 - i),
            batch_number=f"BATCH{i:03d}",
            operator_id="operator1",
            is_excluded=False,
        )
        async_session.add(sample)
        await async_session.flush()

        measurement = Measurement(sample_id=sample.id, value=100.0 + i)
        async_session.add(measurement)
        samples.append(sample)

    await async_session.flush()

    # Create violations with different properties
    violations = [
        Violation(
            sample_id=samples[0].id,
            rule_id=1,
            rule_name="Outlier",
            severity="CRITICAL",
            acknowledged=False,
        ),
        Violation(
            sample_id=samples[1].id,
            rule_id=2,
            rule_name="Trend",
            severity="WARNING",
            acknowledged=False,
        ),
        Violation(
            sample_id=samples[2].id,
            rule_id=1,
            rule_name="Outlier",
            severity="CRITICAL",
            acknowledged=True,
            ack_user="test_user",
            ack_reason="Tool Change",
            ack_timestamp=now - timedelta(hours=1),
        ),
        Violation(
            sample_id=samples[3].id,
            rule_id=3,
            rule_name="Shift",
            severity="WARNING",
            acknowledged=False,
        ),
        Violation(
            sample_id=samples[4].id,
            rule_id=1,
            rule_name="Outlier",
            severity="CRITICAL",
            acknowledged=False,
        ),
    ]

    for violation in violations:
        async_session.add(violation)

    await async_session.commit()

    return {
        "characteristic": char,
        "samples": samples,
        "violations": violations,
    }


@pytest.mark.asyncio
async def test_list_violations_no_filter(async_session: AsyncSession, sample_data: dict):
    """Test listing all violations without filters."""
    repo = ViolationRepository(async_session)
    result = await list_violations(repo=repo)

    assert result.total == 5
    assert len(result.items) == 5
    assert result.offset == 0
    assert result.limit == 100


@pytest.mark.asyncio
async def test_list_violations_filter_acknowledged(async_session: AsyncSession, sample_data: dict):
    """Test filtering violations by acknowledgment status."""
    repo = ViolationRepository(async_session)

    # Get unacknowledged
    result = await list_violations(acknowledged=False, repo=repo)
    assert result.total == 4
    assert all(not item.acknowledged for item in result.items)

    # Get acknowledged
    result = await list_violations(acknowledged=True, repo=repo)
    assert result.total == 1
    assert all(item.acknowledged for item in result.items)


@pytest.mark.asyncio
async def test_list_violations_filter_severity(async_session: AsyncSession, sample_data: dict):
    """Test filtering violations by severity."""
    repo = ViolationRepository(async_session)

    # Get CRITICAL
    result = await list_violations(severity="CRITICAL", repo=repo)
    assert result.total == 3
    assert all(item.severity == "CRITICAL" for item in result.items)

    # Get WARNING
    result = await list_violations(severity="WARNING", repo=repo)
    assert result.total == 2
    assert all(item.severity == "WARNING" for item in result.items)


@pytest.mark.asyncio
async def test_list_violations_filter_rule_id(async_session: AsyncSession, sample_data: dict):
    """Test filtering violations by rule ID."""
    repo = ViolationRepository(async_session)
    result = await list_violations(rule_id=1, repo=repo)

    assert result.total == 3
    assert all(item.rule_id == 1 for item in result.items)


@pytest.mark.asyncio
async def test_list_violations_filter_characteristic(async_session: AsyncSession, sample_data: dict):
    """Test filtering violations by characteristic ID."""
    repo = ViolationRepository(async_session)
    char_id = sample_data["characteristic"].id

    result = await list_violations(characteristic_id=char_id, repo=repo)
    assert result.total == 5


@pytest.mark.asyncio
async def test_list_violations_filter_sample(async_session: AsyncSession, sample_data: dict):
    """Test filtering violations by sample ID."""
    repo = ViolationRepository(async_session)
    sample_id = sample_data["samples"][0].id

    result = await list_violations(sample_id=sample_id, repo=repo)
    assert result.total == 1
    assert result.items[0].sample_id == sample_id


@pytest.mark.asyncio
async def test_list_violations_pagination(async_session: AsyncSession, sample_data: dict):
    """Test pagination of violations list."""
    repo = ViolationRepository(async_session)

    # First page
    result = await list_violations(offset=0, limit=2, repo=repo)
    assert result.total == 5
    assert len(result.items) == 2
    assert result.offset == 0
    assert result.limit == 2

    # Second page
    result = await list_violations(offset=2, limit=2, repo=repo)
    assert result.total == 5
    assert len(result.items) == 2
    assert result.offset == 2


@pytest.mark.asyncio
async def test_list_violations_combined_filters(async_session: AsyncSession, sample_data: dict):
    """Test combining multiple filters."""
    repo = ViolationRepository(async_session)
    result = await list_violations(acknowledged=False, severity="CRITICAL", repo=repo)

    assert result.total == 2
    assert all(not item.acknowledged for item in result.items)
    assert all(item.severity == "CRITICAL" for item in result.items)


@pytest.mark.asyncio
async def test_get_violation_stats(async_session: AsyncSession, sample_data: dict):
    """Test getting violation statistics."""
    violation_repo = ViolationRepository(async_session)
    sample_repo = SampleRepository(async_session)
    manager = AlertManager(violation_repo, sample_repo)

    result = await get_violation_stats(manager=manager)

    assert result.total == 5
    assert result.unacknowledged == 4
    assert result.by_rule == {1: 3, 2: 1, 3: 1}
    assert result.by_severity == {"CRITICAL": 3, "WARNING": 2}


@pytest.mark.asyncio
async def test_get_violation_stats_with_filters(async_session: AsyncSession, sample_data: dict):
    """Test getting filtered violation statistics."""
    violation_repo = ViolationRepository(async_session)
    sample_repo = SampleRepository(async_session)
    manager = AlertManager(violation_repo, sample_repo)
    char_id = sample_data["characteristic"].id

    result = await get_violation_stats(characteristic_id=char_id, manager=manager)

    assert result.total == 5
    assert result.unacknowledged == 4


@pytest.mark.asyncio
async def test_get_reason_codes():
    """Test getting standard reason codes."""
    result = await get_reason_codes()

    assert isinstance(result, list)
    assert "Tool Change" in result
    assert "Raw Material Change" in result
    assert "Other" in result
    assert len(result) == 11


@pytest.mark.asyncio
async def test_get_violation(async_session: AsyncSession, sample_data: dict):
    """Test getting a single violation."""
    repo = ViolationRepository(async_session)
    violation_id = sample_data["violations"][0].id

    result = await get_violation(violation_id=violation_id, repo=repo)

    assert result.id == violation_id
    assert result.rule_id == 1
    assert result.severity == "CRITICAL"
    assert not result.acknowledged


@pytest.mark.asyncio
async def test_get_violation_not_found(async_session: AsyncSession):
    """Test getting a non-existent violation."""
    repo = ViolationRepository(async_session)

    with pytest.raises(HTTPException) as exc_info:
        await get_violation(violation_id=9999, repo=repo)

    assert exc_info.value.status_code == 404
    assert "not found" in exc_info.value.detail.lower()


@pytest.mark.asyncio
async def test_acknowledge_violation(async_session: AsyncSession, sample_data: dict):
    """Test acknowledging a violation."""
    violation_repo = ViolationRepository(async_session)
    sample_repo = SampleRepository(async_session)
    manager = AlertManager(violation_repo, sample_repo)
    violation_id = sample_data["violations"][0].id

    data = ViolationAcknowledge(
        user="test_user",
        reason="Tool Change",
        exclude_sample=False,
    )

    result = await acknowledge_violation(
        violation_id=violation_id,
        data=data,
        manager=manager,
    )

    assert result.id == violation_id
    assert result.acknowledged
    assert result.ack_user == "test_user"
    assert result.ack_reason == "Tool Change"
    assert result.ack_timestamp is not None


@pytest.mark.asyncio
async def test_acknowledge_violation_with_exclude(
    async_session: AsyncSession, sample_data: dict
):
    """Test acknowledging a violation with sample exclusion."""
    violation_repo = ViolationRepository(async_session)
    sample_repo = SampleRepository(async_session)
    manager = AlertManager(violation_repo, sample_repo)
    violation_id = sample_data["violations"][0].id
    sample_id = sample_data["samples"][0].id

    data = ViolationAcknowledge(
        user="test_user",
        reason="Measurement Error",
        exclude_sample=True,
    )

    result = await acknowledge_violation(
        violation_id=violation_id,
        data=data,
        manager=manager,
    )

    assert result.acknowledged

    # Verify sample is excluded
    await async_session.refresh(sample_data["samples"][0])
    assert sample_data["samples"][0].is_excluded


@pytest.mark.asyncio
async def test_acknowledge_violation_not_found(async_session: AsyncSession):
    """Test acknowledging a non-existent violation."""
    violation_repo = ViolationRepository(async_session)
    sample_repo = SampleRepository(async_session)
    manager = AlertManager(violation_repo, sample_repo)

    data = ViolationAcknowledge(
        user="test_user",
        reason="Tool Change",
        exclude_sample=False,
    )

    with pytest.raises(HTTPException) as exc_info:
        await acknowledge_violation(violation_id=9999, data=data, manager=manager)

    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_acknowledge_violation_already_acknowledged(async_session: AsyncSession, sample_data: dict):
    """Test acknowledging an already acknowledged violation."""
    violation_repo = ViolationRepository(async_session)
    sample_repo = SampleRepository(async_session)
    manager = AlertManager(violation_repo, sample_repo)
    violation_id = sample_data["violations"][2].id  # Already acknowledged

    data = ViolationAcknowledge(
        user="test_user",
        reason="Tool Change",
        exclude_sample=False,
    )

    with pytest.raises(HTTPException) as exc_info:
        await acknowledge_violation(violation_id=violation_id, data=data, manager=manager)

    assert exc_info.value.status_code == 409
    assert "already acknowledged" in exc_info.value.detail.lower()


@pytest.mark.asyncio
async def test_batch_acknowledge_success(async_session: AsyncSession, sample_data: dict):
    """Test batch acknowledgment of multiple violations."""
    violation_repo = ViolationRepository(async_session)
    sample_repo = SampleRepository(async_session)
    manager = AlertManager(violation_repo, sample_repo)

    request = BatchAcknowledgeRequest(
        violation_ids=[
            sample_data["violations"][0].id,
            sample_data["violations"][1].id,
            sample_data["violations"][3].id,
        ],
        user="batch_user",
        reason="Process Adjustment",
        exclude_sample=False,
    )

    result = await batch_acknowledge(request=request, manager=manager)

    assert result.total == 3
    assert result.successful == 3
    assert result.failed == 0
    assert len(result.results) == 3
    assert all(item.success for item in result.results)


@pytest.mark.asyncio
async def test_batch_acknowledge_partial_success(async_session: AsyncSession, sample_data: dict):
    """Test batch acknowledgment with partial success."""
    violation_repo = ViolationRepository(async_session)
    sample_repo = SampleRepository(async_session)
    manager = AlertManager(violation_repo, sample_repo)

    request = BatchAcknowledgeRequest(
        violation_ids=[
            sample_data["violations"][0].id,
            sample_data["violations"][2].id,  # Already acknowledged
            sample_data["violations"][3].id,
            9999,  # Non-existent
        ],
        user="batch_user",
        reason="Process Adjustment",
        exclude_sample=False,
    )

    result = await batch_acknowledge(request=request, manager=manager)

    assert result.total == 4
    assert result.successful == 2
    assert result.failed == 2

    # Check that successful ones have no error
    successful_results = [r for r in result.results if r.success]
    assert len(successful_results) == 2
    assert all(r.error is None for r in successful_results)

    # Check that failed ones have error messages
    failed_results = [r for r in result.results if not r.success]
    assert len(failed_results) == 2
    assert all(r.error is not None for r in failed_results)


@pytest.mark.asyncio
async def test_batch_acknowledge_with_exclude(
    async_session: AsyncSession, sample_data: dict
):
    """Test batch acknowledgment with sample exclusion."""
    violation_repo = ViolationRepository(async_session)
    sample_repo = SampleRepository(async_session)
    manager = AlertManager(violation_repo, sample_repo)

    request = BatchAcknowledgeRequest(
        violation_ids=[
            sample_data["violations"][0].id,
            sample_data["violations"][1].id,
        ],
        user="batch_user",
        reason="Measurement Error",
        exclude_sample=True,
    )

    result = await batch_acknowledge(request=request, manager=manager)

    assert result.successful == 2

    # Verify samples are excluded
    await async_session.refresh(sample_data["samples"][0])
    await async_session.refresh(sample_data["samples"][1])
    assert sample_data["samples"][0].is_excluded
    assert sample_data["samples"][1].is_excluded
