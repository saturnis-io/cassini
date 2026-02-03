"""Integration tests for Sample REST API endpoints.

Tests the complete sample submission workflow including:
- Manual sample submission and SPC processing
- Sample retrieval with filtering and pagination
- Sample exclusion and rolling window invalidation
- Batch import with and without rule evaluation
"""

from datetime import datetime, timedelta

import pytest
import pytest_asyncio
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from openspc.api.schemas.sample import SampleCreate, SampleExclude
from openspc.api.v1.samples import (
    batch_import,
    get_sample,
    list_samples,
    submit_sample,
    toggle_exclude,
)
from openspc.core.engine.nelson_rules import NelsonRuleLibrary
from openspc.core.engine.rolling_window import RollingWindowManager
from openspc.core.engine.spc_engine import SPCEngine
from openspc.core.providers.manual import ManualProvider
from openspc.db.models.characteristic import Characteristic, CharacteristicRule, ProviderType
from openspc.db.models.hierarchy import Hierarchy
from openspc.db.models.sample import Measurement, Sample
from openspc.db.repositories import (
    CharacteristicRepository,
    SampleRepository,
    ViolationRepository,
)


@pytest_asyncio.fixture
async def hierarchy(async_session: AsyncSession) -> Hierarchy:
    """Create test hierarchy node."""
    hierarchy = Hierarchy(
        name="Test Plant",
        hierarchy_type="PLANT",
        parent_id=None,
    )
    async_session.add(hierarchy)
    await async_session.commit()
    await async_session.refresh(hierarchy)
    return hierarchy


@pytest_asyncio.fixture
async def characteristic(async_session: AsyncSession, hierarchy: Hierarchy) -> Characteristic:
    """Create test characteristic with manual provider."""
    char = Characteristic(
        hierarchy_id=hierarchy.id,
        name="Test Dimension",
        subgroup_size=5,
        provider_type=ProviderType.MANUAL,
        target_value=100.0,
        usl=110.0,
        lsl=90.0,
        ucl=108.0,
        lcl=92.0,
    )
    async_session.add(char)
    await async_session.flush()

    # Add Nelson Rules configuration
    for rule_id in range(1, 9):
        rule = CharacteristicRule(
            char_id=char.id,
            rule_id=rule_id,
            is_enabled=True,
        )
        async_session.add(rule)

    await async_session.commit()
    await async_session.refresh(char)
    return char


@pytest_asyncio.fixture
async def characteristic_individual(
    async_session: AsyncSession, hierarchy: Hierarchy
) -> Characteristic:
    """Create test characteristic for individuals chart (n=1)."""
    char = Characteristic(
        hierarchy_id=hierarchy.id,
        name="Test Temperature",
        subgroup_size=1,
        provider_type=ProviderType.MANUAL,
        target_value=75.0,
        usl=80.0,
        lsl=70.0,
        ucl=78.0,
        lcl=72.0,
    )
    async_session.add(char)
    await async_session.flush()

    # Add Nelson Rules configuration
    for rule_id in range(1, 9):
        rule = CharacteristicRule(
            char_id=char.id,
            rule_id=rule_id,
            is_enabled=True,
        )
        async_session.add(rule)

    await async_session.commit()
    await async_session.refresh(char)
    return char


@pytest_asyncio.fixture
async def spc_engine(async_session: AsyncSession) -> SPCEngine:
    """Create SPC engine with all dependencies."""
    sample_repo = SampleRepository(async_session)
    char_repo = CharacteristicRepository(async_session)
    violation_repo = ViolationRepository(async_session)
    window_manager = RollingWindowManager(sample_repo, max_cached_windows=100, window_size=25)
    rule_library = NelsonRuleLibrary()

    return SPCEngine(
        sample_repo=sample_repo,
        char_repo=char_repo,
        violation_repo=violation_repo,
        window_manager=window_manager,
        rule_library=rule_library,
    )


@pytest_asyncio.fixture
async def manual_provider(async_session: AsyncSession) -> ManualProvider:
    """Create manual provider."""
    char_repo = CharacteristicRepository(async_session)
    return ManualProvider(char_repo)


@pytest.mark.asyncio
class TestSubmitSample:
    """Tests for submit_sample endpoint."""

    async def test_submit_valid_sample_subgroup(
        self,
        characteristic: Characteristic,
        async_session: AsyncSession,
        spc_engine: SPCEngine,
        manual_provider: ManualProvider,
    ):
        """Test submitting a valid sample with subgroup size > 1."""
        data = SampleCreate(
            characteristic_id=characteristic.id,
            measurements=[100.1, 100.2, 99.9, 100.0, 100.3],
            batch_number="BATCH-001",
            operator_id="OPR-123",
        )

        result = await submit_sample(
            data=data,
            session=async_session,
            engine=spc_engine,
            provider=manual_provider,
        )

        # Verify response structure
        assert result.sample_id > 0
        assert result.timestamp is not None
        assert result.mean == pytest.approx(100.1, abs=0.01)
        assert result.range_value == pytest.approx(0.4, abs=0.01)
        assert result.zone is not None
        assert isinstance(result.in_control, bool)
        assert isinstance(result.violations, list)
        assert result.processing_time_ms > 0

        # Verify sample was created in database
        sample_repo = SampleRepository(async_session)
        sample = await sample_repo.get_by_id(result.sample_id)
        assert sample is not None
        assert sample.char_id == characteristic.id
        assert sample.batch_number == "BATCH-001"
        assert sample.operator_id == "OPR-123"
        assert len(sample.measurements) == 5

    async def test_submit_valid_sample_individual(
        self,
        characteristic_individual: Characteristic,
        async_session: AsyncSession,
        spc_engine: SPCEngine,
        manual_provider: ManualProvider,
    ):
        """Test submitting a valid sample for individuals chart (n=1)."""
        data = SampleCreate(
            characteristic_id=characteristic_individual.id,
            measurements=[75.5],
        )

        result = await submit_sample(
            data=data,
            session=async_session,
            engine=spc_engine,
            provider=manual_provider,
        )

        # Verify response
        assert result.mean == 75.5
        assert result.range_value is None  # No range for n=1

    async def test_submit_invalid_measurement_count(
        self,
        characteristic: Characteristic,
        async_session: AsyncSession,
        spc_engine: SPCEngine,
        manual_provider: ManualProvider,
    ):
        """Test submitting sample with wrong measurement count."""
        data = SampleCreate(
            characteristic_id=characteristic.id,
            measurements=[100.1, 100.2, 99.9],  # Expects 5, got 3
        )

        with pytest.raises(HTTPException) as exc_info:
            await submit_sample(
                data=data,
                session=async_session,
                engine=spc_engine,
                provider=manual_provider,
            )

        assert exc_info.value.status_code == 400
        assert "Expected 5 measurements" in str(exc_info.value.detail)

    async def test_submit_characteristic_not_found(
        self,
        async_session: AsyncSession,
        spc_engine: SPCEngine,
        manual_provider: ManualProvider,
    ):
        """Test submitting sample for non-existent characteristic."""
        data = SampleCreate(
            characteristic_id=99999,
            measurements=[100.0],
        )

        with pytest.raises(HTTPException) as exc_info:
            await submit_sample(
                data=data,
                session=async_session,
                engine=spc_engine,
                provider=manual_provider,
            )

        assert exc_info.value.status_code == 400
        assert "not found" in str(exc_info.value.detail).lower()


@pytest.mark.asyncio
class TestListSamples:
    """Tests for list_samples endpoint."""

    async def test_list_samples_no_filter(
        self, characteristic: Characteristic, async_session: AsyncSession
    ):
        """Test listing samples without filters."""
        # Create test samples
        sample_repo = SampleRepository(async_session)
        for i in range(5):
            await sample_repo.create_with_measurements(
                char_id=characteristic.id,
                values=[100.0 + i, 100.1 + i, 99.9 + i, 100.0 + i, 100.2 + i],
            )
        await async_session.commit()

        # List samples
        result = await list_samples(
            characteristic_id=None,
            start_date=None,
            end_date=None,
            include_excluded=False,
            offset=0,
            limit=100,
            sample_repo=sample_repo,
        )

        assert result.total == 5
        assert len(result.items) == 5
        assert result.offset == 0
        assert result.limit == 100

    async def test_list_samples_filter_by_characteristic(
        self,
        characteristic: Characteristic,
        characteristic_individual: Characteristic,
        async_session: AsyncSession,
    ):
        """Test filtering samples by characteristic ID."""
        # Create samples for both characteristics
        sample_repo = SampleRepository(async_session)
        for i in range(3):
            await sample_repo.create_with_measurements(
                char_id=characteristic.id,
                values=[100.0 + i, 100.1 + i, 99.9 + i, 100.0 + i, 100.2 + i],
            )
        for i in range(2):
            await sample_repo.create_with_measurements(
                char_id=characteristic_individual.id,
                values=[75.0 + i],
            )
        await async_session.commit()

        # Filter by first characteristic
        result = await list_samples(
            characteristic_id=characteristic.id,
            start_date=None,
            end_date=None,
            include_excluded=False,
            offset=0,
            limit=100,
            sample_repo=sample_repo,
        )

        assert result.total == 3
        for item in result.items:
            assert item.char_id == characteristic.id

    async def test_list_samples_filter_by_date_range(
        self, characteristic: Characteristic, async_session: AsyncSession
    ):
        """Test filtering samples by date range."""
        # Create samples with different timestamps
        now = datetime.utcnow()

        # Old sample (10 days ago)
        old_sample = Sample(
            char_id=characteristic.id,
            timestamp=now - timedelta(days=10),
        )
        async_session.add(old_sample)
        await async_session.flush()
        for j in range(5):
            async_session.add(Measurement(sample_id=old_sample.id, value=100.0 + j * 0.1))

        # Recent samples (last 5 days)
        for i in range(3):
            recent_sample = Sample(
                char_id=characteristic.id,
                timestamp=now - timedelta(days=i),
            )
            async_session.add(recent_sample)
            await async_session.flush()
            for j in range(5):
                async_session.add(Measurement(sample_id=recent_sample.id, value=100.0 + j * 0.1))

        await async_session.commit()

        # Filter by date range (last 7 days)
        sample_repo = SampleRepository(async_session)
        start_date = now - timedelta(days=7)
        result = await list_samples(
            characteristic_id=characteristic.id,
            start_date=start_date,
            end_date=None,
            include_excluded=False,
            offset=0,
            limit=100,
            sample_repo=sample_repo,
        )

        assert result.total == 3  # Should not include the 10-day-old sample

    async def test_list_samples_exclude_excluded(
        self, characteristic: Characteristic, async_session: AsyncSession
    ):
        """Test filtering out excluded samples."""
        # Create samples, some excluded
        sample_repo = SampleRepository(async_session)
        for i in range(3):
            await sample_repo.create_with_measurements(
                char_id=characteristic.id,
                values=[100.0 + i, 100.1 + i, 99.9 + i, 100.0 + i, 100.2 + i],
                is_excluded=False,
            )
        for i in range(2):
            await sample_repo.create_with_measurements(
                char_id=characteristic.id,
                values=[100.0 + i, 100.1 + i, 99.9 + i, 100.0 + i, 100.2 + i],
                is_excluded=True,
            )
        await async_session.commit()

        # Default: exclude excluded samples
        result = await list_samples(
            characteristic_id=characteristic.id,
            start_date=None,
            end_date=None,
            include_excluded=False,
            offset=0,
            limit=100,
            sample_repo=sample_repo,
        )
        assert result.total == 3

        # Include excluded samples
        result = await list_samples(
            characteristic_id=characteristic.id,
            start_date=None,
            end_date=None,
            include_excluded=True,
            offset=0,
            limit=100,
            sample_repo=sample_repo,
        )
        assert result.total == 5

    async def test_list_samples_pagination(
        self, characteristic: Characteristic, async_session: AsyncSession
    ):
        """Test pagination of sample list."""
        # Create 10 samples
        sample_repo = SampleRepository(async_session)
        for i in range(10):
            await sample_repo.create_with_measurements(
                char_id=characteristic.id,
                values=[100.0 + i, 100.1 + i, 99.9 + i, 100.0 + i, 100.2 + i],
            )
        await async_session.commit()

        # First page
        result = await list_samples(
            characteristic_id=characteristic.id,
            start_date=None,
            end_date=None,
            include_excluded=False,
            offset=0,
            limit=5,
            sample_repo=sample_repo,
        )
        assert result.total == 10
        assert len(result.items) == 5
        assert result.offset == 0
        assert result.limit == 5

        # Second page
        result = await list_samples(
            characteristic_id=characteristic.id,
            start_date=None,
            end_date=None,
            include_excluded=False,
            offset=5,
            limit=5,
            sample_repo=sample_repo,
        )
        assert result.total == 10
        assert len(result.items) == 5
        assert result.offset == 5


@pytest.mark.asyncio
class TestGetSample:
    """Tests for get_sample endpoint."""

    async def test_get_sample_found(
        self, characteristic: Characteristic, async_session: AsyncSession
    ):
        """Test retrieving an existing sample."""
        # Create sample
        sample_repo = SampleRepository(async_session)
        sample = await sample_repo.create_with_measurements(
            char_id=characteristic.id,
            values=[100.1, 100.2, 99.9, 100.0, 100.3],
            batch_number="BATCH-001",
            operator_id="OPR-123",
        )
        await async_session.commit()

        # Get sample
        result = await get_sample(sample_id=sample.id, sample_repo=sample_repo)

        assert result.id == sample.id
        assert result.char_id == characteristic.id
        assert result.batch_number == "BATCH-001"
        assert result.operator_id == "OPR-123"
        assert len(result.measurements) == 5
        assert result.mean == pytest.approx(100.1, abs=0.01)
        assert result.range_value == pytest.approx(0.4, abs=0.01)

    async def test_get_sample_not_found(self, async_session: AsyncSession):
        """Test retrieving a non-existent sample."""
        sample_repo = SampleRepository(async_session)

        with pytest.raises(HTTPException) as exc_info:
            await get_sample(sample_id=99999, sample_repo=sample_repo)

        assert exc_info.value.status_code == 404
        assert "not found" in str(exc_info.value.detail).lower()


@pytest.mark.asyncio
class TestToggleExclude:
    """Tests for toggle_exclude endpoint."""

    async def test_exclude_sample(
        self, characteristic: Characteristic, async_session: AsyncSession
    ):
        """Test excluding a sample."""
        # Create sample
        sample_repo = SampleRepository(async_session)
        sample = await sample_repo.create_with_measurements(
            char_id=characteristic.id,
            values=[100.1, 100.2, 99.9, 100.0, 100.3],
        )
        await async_session.commit()

        assert not sample.is_excluded

        # Exclude sample
        data = SampleExclude(is_excluded=True, reason="Outlier due to equipment malfunction")
        result = await toggle_exclude(
            sample_id=sample.id,
            data=data,
            session=async_session,
            sample_repo=sample_repo,
        )

        assert result.is_excluded is True

        # Verify in database
        await async_session.refresh(sample)
        assert sample.is_excluded is True

    async def test_include_sample(
        self, characteristic: Characteristic, async_session: AsyncSession
    ):
        """Test including a previously excluded sample."""
        # Create excluded sample
        sample_repo = SampleRepository(async_session)
        sample = await sample_repo.create_with_measurements(
            char_id=characteristic.id,
            values=[100.1, 100.2, 99.9, 100.0, 100.3],
            is_excluded=True,
        )
        await async_session.commit()

        assert sample.is_excluded

        # Include sample
        data = SampleExclude(is_excluded=False)
        result = await toggle_exclude(
            sample_id=sample.id,
            data=data,
            session=async_session,
            sample_repo=sample_repo,
        )

        assert result.is_excluded is False

        # Verify in database
        await async_session.refresh(sample)
        assert sample.is_excluded is False

    async def test_exclude_sample_not_found(self, async_session: AsyncSession):
        """Test excluding a non-existent sample."""
        sample_repo = SampleRepository(async_session)
        data = SampleExclude(is_excluded=True)

        with pytest.raises(HTTPException) as exc_info:
            await toggle_exclude(
                sample_id=99999,
                data=data,
                session=async_session,
                sample_repo=sample_repo,
            )

        assert exc_info.value.status_code == 404


@pytest.mark.asyncio
class TestBatchImport:
    """Tests for batch_import endpoint."""

    async def test_batch_import_with_rule_evaluation(
        self,
        characteristic: Characteristic,
        async_session: AsyncSession,
        spc_engine: SPCEngine,
    ):
        """Test batch import with Nelson Rule evaluation."""
        # Batch import samples
        samples = [
            SampleCreate(
                characteristic_id=characteristic.id,
                measurements=[100.0 + i, 100.1 + i, 99.9 + i, 100.0 + i, 100.2 + i],
                batch_number=f"BATCH-{i:03d}",
            )
            for i in range(5)
        ]

        result = await batch_import(
            data=samples,
            skip_rule_evaluation=False,
            session=async_session,
            engine=spc_engine,
        )

        assert result.total == 5
        assert result.successful == 5
        assert result.failed == 0
        assert len(result.errors) == 0

        # Verify samples were created
        sample_repo = SampleRepository(async_session)
        db_samples = await sample_repo.get_by_characteristic(characteristic.id)
        assert len(db_samples) == 5

    async def test_batch_import_skip_rule_evaluation(
        self, characteristic: Characteristic, async_session: AsyncSession, spc_engine: SPCEngine
    ):
        """Test batch import without Nelson Rule evaluation."""
        # Batch import samples with skip_rule_evaluation
        samples = [
            SampleCreate(
                characteristic_id=characteristic.id,
                measurements=[100.0 + i, 100.1 + i, 99.9 + i, 100.0 + i, 100.2 + i],
            )
            for i in range(10)
        ]

        result = await batch_import(
            data=samples,
            skip_rule_evaluation=True,
            session=async_session,
            engine=spc_engine,
        )

        assert result.total == 10
        assert result.successful == 10
        assert result.failed == 0

    async def test_batch_import_partial_failure(
        self, characteristic: Characteristic, async_session: AsyncSession, spc_engine: SPCEngine
    ):
        """Test batch import with some invalid samples."""
        # Mix valid and invalid samples
        samples = [
            # Valid sample
            SampleCreate(
                characteristic_id=characteristic.id,
                measurements=[100.0, 100.1, 99.9, 100.0, 100.2],
            ),
            # Invalid: wrong measurement count
            SampleCreate(
                characteristic_id=characteristic.id,
                measurements=[100.0, 100.1],
            ),
            # Valid sample
            SampleCreate(
                characteristic_id=characteristic.id,
                measurements=[100.0, 100.1, 99.9, 100.0, 100.2],
            ),
            # Invalid: non-existent characteristic
            SampleCreate(
                characteristic_id=99999,
                measurements=[100.0, 100.1, 99.9, 100.0, 100.2],
            ),
        ]

        result = await batch_import(
            data=samples,
            skip_rule_evaluation=False,
            session=async_session,
            engine=spc_engine,
        )

        assert result.total == 4
        assert result.successful == 2
        assert result.failed == 2
        assert len(result.errors) == 2

    async def test_batch_import_empty_list(
        self, async_session: AsyncSession, spc_engine: SPCEngine
    ):
        """Test batch import with empty list."""
        result = await batch_import(
            data=[],
            skip_rule_evaluation=False,
            session=async_session,
            engine=spc_engine,
        )

        assert result.total == 0
        assert result.successful == 0
        assert result.failed == 0
