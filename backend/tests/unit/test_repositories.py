"""Unit tests for repository pattern implementation."""

from datetime import datetime, timedelta

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from openspc.db.models.characteristic import Characteristic, CharacteristicRule
from openspc.db.models.hierarchy import Hierarchy
from openspc.db.models.sample import Measurement, Sample
from openspc.db.models.violation import Violation
from openspc.db.repositories import (
    CharacteristicRepository,
    HierarchyRepository,
    SampleRepository,
    ViolationRepository,
)


class TestBaseRepository:
    """Tests for BaseRepository CRUD operations."""

    @pytest.mark.asyncio
    async def test_create(self, async_session: AsyncSession) -> None:
        """Test creating a new hierarchy node."""
        repo = HierarchyRepository(async_session)

        hierarchy = await repo.create(name="Test Site", type="Site", parent_id=None)

        assert hierarchy.id is not None
        assert hierarchy.name == "Test Site"
        assert hierarchy.type == "Site"
        assert hierarchy.parent_id is None

    @pytest.mark.asyncio
    async def test_get_by_id(self, async_session: AsyncSession) -> None:
        """Test retrieving a record by ID."""
        repo = HierarchyRepository(async_session)

        created = await repo.create(name="Test Site", type="Site", parent_id=None)
        retrieved = await repo.get_by_id(created.id)

        assert retrieved is not None
        assert retrieved.id == created.id
        assert retrieved.name == "Test Site"

    @pytest.mark.asyncio
    async def test_get_by_id_not_found(self, async_session: AsyncSession) -> None:
        """Test retrieving a non-existent record returns None."""
        repo = HierarchyRepository(async_session)

        result = await repo.get_by_id(999)

        assert result is None

    @pytest.mark.asyncio
    async def test_get_all_with_pagination(self, async_session: AsyncSession) -> None:
        """Test retrieving all records with offset and limit."""
        repo = HierarchyRepository(async_session)

        # Create test data
        for i in range(15):
            await repo.create(name=f"Site {i}", type="Site", parent_id=None)

        # Test first page
        page1 = await repo.get_all(offset=0, limit=5)
        assert len(page1) == 5

        # Test second page
        page2 = await repo.get_all(offset=5, limit=5)
        assert len(page2) == 5

        # Ensure pages don't overlap
        page1_ids = {h.id for h in page1}
        page2_ids = {h.id for h in page2}
        assert page1_ids.isdisjoint(page2_ids)

    @pytest.mark.asyncio
    async def test_update(self, async_session: AsyncSession) -> None:
        """Test updating an existing record."""
        repo = HierarchyRepository(async_session)

        created = await repo.create(name="Old Name", type="Site", parent_id=None)
        updated = await repo.update(created.id, name="New Name")

        assert updated is not None
        assert updated.id == created.id
        assert updated.name == "New Name"
        assert updated.type == "Site"  # Unchanged field

    @pytest.mark.asyncio
    async def test_update_not_found(self, async_session: AsyncSession) -> None:
        """Test updating a non-existent record returns None."""
        repo = HierarchyRepository(async_session)

        result = await repo.update(999, name="New Name")

        assert result is None

    @pytest.mark.asyncio
    async def test_delete(self, async_session: AsyncSession) -> None:
        """Test deleting a record."""
        repo = HierarchyRepository(async_session)

        created = await repo.create(name="To Delete", type="Site", parent_id=None)
        deleted = await repo.delete(created.id)

        assert deleted is True

        # Verify it's gone
        retrieved = await repo.get_by_id(created.id)
        assert retrieved is None

    @pytest.mark.asyncio
    async def test_delete_not_found(self, async_session: AsyncSession) -> None:
        """Test deleting a non-existent record returns False."""
        repo = HierarchyRepository(async_session)

        result = await repo.delete(999)

        assert result is False

    @pytest.mark.asyncio
    async def test_count(self, async_session: AsyncSession) -> None:
        """Test counting total records."""
        repo = HierarchyRepository(async_session)

        # Initially empty
        assert await repo.count() == 0

        # Create some records
        await repo.create(name="Site 1", type="Site", parent_id=None)
        await repo.create(name="Site 2", type="Site", parent_id=None)
        await repo.create(name="Site 3", type="Site", parent_id=None)

        assert await repo.count() == 3


class TestHierarchyRepository:
    """Tests for HierarchyRepository tree operations."""

    @pytest.mark.asyncio
    async def test_get_children_root_level(self, async_session: AsyncSession) -> None:
        """Test getting direct children at root level."""
        repo = HierarchyRepository(async_session)

        # Create root nodes
        await repo.create(name="Site A", type="Site", parent_id=None)
        await repo.create(name="Site B", type="Site", parent_id=None)

        children = await repo.get_children(parent_id=None)

        assert len(children) == 2
        assert {c.name for c in children} == {"Site A", "Site B"}

    @pytest.mark.asyncio
    async def test_get_children_nested(self, async_session: AsyncSession) -> None:
        """Test getting direct children of a node."""
        repo = HierarchyRepository(async_session)

        # Create hierarchy: Site -> Area1, Area2
        site = await repo.create(name="Site A", type="Site", parent_id=None)
        await repo.create(name="Area 1", type="Area", parent_id=site.id)
        await repo.create(name="Area 2", type="Area", parent_id=site.id)

        children = await repo.get_children(site.id)

        assert len(children) == 2
        assert {c.name for c in children} == {"Area 1", "Area 2"}

    @pytest.mark.asyncio
    async def test_get_tree_simple(self, async_session: AsyncSession) -> None:
        """Test getting tree structure with one level."""
        repo = HierarchyRepository(async_session)

        # Create simple tree: Site -> Area1, Area2
        site = await repo.create(name="Site A", type="Site", parent_id=None)
        await repo.create(name="Area 1", type="Area", parent_id=site.id)
        await repo.create(name="Area 2", type="Area", parent_id=site.id)

        tree = await repo.get_tree()

        assert len(tree) == 1
        assert tree[0].name == "Site A"
        assert len(tree[0].children) == 2
        assert {c.name for c in tree[0].children} == {"Area 1", "Area 2"}

    @pytest.mark.asyncio
    async def test_get_tree_nested(self, async_session: AsyncSession) -> None:
        """Test getting nested tree structure."""
        repo = HierarchyRepository(async_session)

        # Create nested tree:
        # Site
        #   Area
        #     Line
        #       Cell
        site = await repo.create(name="Site A", type="Site", parent_id=None)
        area = await repo.create(name="Area 1", type="Area", parent_id=site.id)
        line = await repo.create(name="Line 1", type="Line", parent_id=area.id)
        await repo.create(name="Cell 1", type="Cell", parent_id=line.id)

        tree = await repo.get_tree()

        assert len(tree) == 1
        assert tree[0].name == "Site A"
        assert len(tree[0].children) == 1
        assert tree[0].children[0].name == "Area 1"
        assert len(tree[0].children[0].children) == 1
        assert tree[0].children[0].children[0].name == "Line 1"
        assert len(tree[0].children[0].children[0].children) == 1
        assert tree[0].children[0].children[0].children[0].name == "Cell 1"

    @pytest.mark.asyncio
    async def test_get_descendants(self, async_session: AsyncSession) -> None:
        """Test getting all descendants recursively."""
        repo = HierarchyRepository(async_session)

        # Create hierarchy: Site -> Area -> Line -> Cell
        site = await repo.create(name="Site A", type="Site", parent_id=None)
        area = await repo.create(name="Area 1", type="Area", parent_id=site.id)
        line = await repo.create(name="Line 1", type="Line", parent_id=area.id)
        cell = await repo.create(name="Cell 1", type="Cell", parent_id=line.id)

        descendants = await repo.get_descendants(site.id)

        assert len(descendants) == 3
        assert {d.name for d in descendants} == {"Area 1", "Line 1", "Cell 1"}

    @pytest.mark.asyncio
    async def test_get_ancestors(self, async_session: AsyncSession) -> None:
        """Test getting all ancestors up to root."""
        repo = HierarchyRepository(async_session)

        # Create hierarchy: Site -> Area -> Line -> Cell
        site = await repo.create(name="Site A", type="Site", parent_id=None)
        area = await repo.create(name="Area 1", type="Area", parent_id=site.id)
        line = await repo.create(name="Line 1", type="Line", parent_id=area.id)
        cell = await repo.create(name="Cell 1", type="Cell", parent_id=line.id)

        ancestors = await repo.get_ancestors(cell.id)

        assert len(ancestors) == 3
        # Should be ordered from parent to root
        assert ancestors[0].name == "Line 1"
        assert ancestors[1].name == "Area 1"
        assert ancestors[2].name == "Site A"


class TestCharacteristicRepository:
    """Tests for CharacteristicRepository filtering operations."""

    @pytest.mark.asyncio
    async def test_get_by_hierarchy_direct(self, async_session: AsyncSession) -> None:
        """Test getting characteristics for a specific hierarchy."""
        h_repo = HierarchyRepository(async_session)
        c_repo = CharacteristicRepository(async_session)

        # Create hierarchies and characteristics
        site = await h_repo.create(name="Site A", type="Site", parent_id=None)
        area = await h_repo.create(name="Area 1", type="Area", parent_id=site.id)

        await c_repo.create(
            hierarchy_id=site.id,
            name="Site Char",
            provider_type="MANUAL",
            subgroup_size=1,
        )
        await c_repo.create(
            hierarchy_id=area.id,
            name="Area Char",
            provider_type="MANUAL",
            subgroup_size=1,
        )

        # Get only site characteristics
        site_chars = await c_repo.get_by_hierarchy(site.id, include_descendants=False)

        assert len(site_chars) == 1
        assert site_chars[0].name == "Site Char"

    @pytest.mark.asyncio
    async def test_get_by_hierarchy_with_descendants(
        self, async_session: AsyncSession
    ) -> None:
        """Test getting characteristics including descendants."""
        h_repo = HierarchyRepository(async_session)
        c_repo = CharacteristicRepository(async_session)

        # Create hierarchy
        site = await h_repo.create(name="Site A", type="Site", parent_id=None)
        area = await h_repo.create(name="Area 1", type="Area", parent_id=site.id)
        line = await h_repo.create(name="Line 1", type="Line", parent_id=area.id)

        # Create characteristics at each level
        await c_repo.create(
            hierarchy_id=site.id,
            name="Site Char",
            provider_type="MANUAL",
            subgroup_size=1,
        )
        await c_repo.create(
            hierarchy_id=area.id,
            name="Area Char",
            provider_type="MANUAL",
            subgroup_size=1,
        )
        await c_repo.create(
            hierarchy_id=line.id,
            name="Line Char",
            provider_type="MANUAL",
            subgroup_size=1,
        )

        # Get all characteristics under site
        all_chars = await c_repo.get_by_hierarchy(site.id, include_descendants=True)

        assert len(all_chars) == 3
        assert {c.name for c in all_chars} == {"Site Char", "Area Char", "Line Char"}

    @pytest.mark.asyncio
    async def test_get_by_provider_type(self, async_session: AsyncSession) -> None:
        """Test filtering characteristics by provider type."""
        h_repo = HierarchyRepository(async_session)
        c_repo = CharacteristicRepository(async_session)

        site = await h_repo.create(name="Site A", type="Site", parent_id=None)

        # Create characteristics with different provider types
        await c_repo.create(
            hierarchy_id=site.id,
            name="Manual Char",
            provider_type="MANUAL",
            subgroup_size=1,
        )
        await c_repo.create(
            hierarchy_id=site.id,
            name="Tag Char",
            provider_type="TAG",
            subgroup_size=1,
            mqtt_topic="test/topic",
        )

        manual_chars = await c_repo.get_by_provider_type("MANUAL")
        tag_chars = await c_repo.get_by_provider_type("TAG")

        assert len(manual_chars) == 1
        assert manual_chars[0].name == "Manual Char"
        assert len(tag_chars) == 1
        assert tag_chars[0].name == "Tag Char"

    @pytest.mark.asyncio
    async def test_get_with_rules(self, async_session: AsyncSession) -> None:
        """Test eager loading of characteristic rules."""
        h_repo = HierarchyRepository(async_session)
        c_repo = CharacteristicRepository(async_session)

        site = await h_repo.create(name="Site A", type="Site", parent_id=None)
        char = await c_repo.create(
            hierarchy_id=site.id,
            name="Test Char",
            provider_type="MANUAL",
            subgroup_size=1,
        )

        # Create rules
        rule1 = CharacteristicRule(char_id=char.id, rule_id=1, is_enabled=True)
        rule2 = CharacteristicRule(char_id=char.id, rule_id=2, is_enabled=False)
        async_session.add_all([rule1, rule2])
        await async_session.flush()

        # Load with rules
        char_with_rules = await c_repo.get_with_rules(char.id)

        assert char_with_rules is not None
        assert len(char_with_rules.rules) == 2
        assert {r.rule_id for r in char_with_rules.rules} == {1, 2}


class TestSampleRepository:
    """Tests for SampleRepository time-series operations."""

    @pytest.mark.asyncio
    async def test_get_rolling_window(self, async_session: AsyncSession) -> None:
        """Test getting rolling window of samples."""
        h_repo = HierarchyRepository(async_session)
        c_repo = CharacteristicRepository(async_session)
        s_repo = SampleRepository(async_session)

        # Create characteristic
        site = await h_repo.create(name="Site A", type="Site", parent_id=None)
        char = await c_repo.create(
            hierarchy_id=site.id,
            name="Test Char",
            provider_type="MANUAL",
            subgroup_size=1,
        )

        # Create 30 samples
        base_time = datetime.utcnow() - timedelta(days=30)
        for i in range(30):
            sample = Sample(
                char_id=char.id,
                timestamp=base_time + timedelta(days=i),
                is_excluded=False,
            )
            async_session.add(sample)
        await async_session.flush()

        # Get last 25 samples
        samples = await s_repo.get_rolling_window(char.id, window_size=25)

        assert len(samples) == 25
        # Verify chronological order (oldest to newest)
        for i in range(len(samples) - 1):
            assert samples[i].timestamp <= samples[i + 1].timestamp

    @pytest.mark.asyncio
    async def test_get_rolling_window_exclude_excluded(
        self, async_session: AsyncSession
    ) -> None:
        """Test rolling window excludes excluded samples."""
        h_repo = HierarchyRepository(async_session)
        c_repo = CharacteristicRepository(async_session)
        s_repo = SampleRepository(async_session)

        site = await h_repo.create(name="Site A", type="Site", parent_id=None)
        char = await c_repo.create(
            hierarchy_id=site.id,
            name="Test Char",
            provider_type="MANUAL",
            subgroup_size=1,
        )

        # Create samples with some excluded
        base_time = datetime.utcnow() - timedelta(days=10)
        for i in range(10):
            sample = Sample(
                char_id=char.id,
                timestamp=base_time + timedelta(days=i),
                is_excluded=(i % 2 == 0),  # Exclude every other sample
            )
            async_session.add(sample)
        await async_session.flush()

        # Get non-excluded samples
        samples = await s_repo.get_rolling_window(
            char.id, window_size=10, exclude_excluded=True
        )
        assert len(samples) == 5
        assert all(not s.is_excluded for s in samples)

        # Get all samples
        all_samples = await s_repo.get_rolling_window(
            char.id, window_size=10, exclude_excluded=False
        )
        assert len(all_samples) == 10

    @pytest.mark.asyncio
    async def test_get_by_characteristic_date_range(
        self, async_session: AsyncSession
    ) -> None:
        """Test getting samples by date range."""
        h_repo = HierarchyRepository(async_session)
        c_repo = CharacteristicRepository(async_session)
        s_repo = SampleRepository(async_session)

        site = await h_repo.create(name="Site A", type="Site", parent_id=None)
        char = await c_repo.create(
            hierarchy_id=site.id,
            name="Test Char",
            provider_type="MANUAL",
            subgroup_size=1,
        )

        # Create samples across multiple days
        base_time = datetime(2025, 1, 1)
        for i in range(10):
            sample = Sample(
                char_id=char.id,
                timestamp=base_time + timedelta(days=i),
                is_excluded=False,
            )
            async_session.add(sample)
        await async_session.flush()

        # Get samples for specific range
        start = datetime(2025, 1, 3)
        end = datetime(2025, 1, 7)
        samples = await s_repo.get_by_characteristic(char.id, start_date=start, end_date=end)

        assert len(samples) == 5
        for sample in samples:
            assert start <= sample.timestamp <= end

    @pytest.mark.asyncio
    async def test_create_with_measurements_single(
        self, async_session: AsyncSession
    ) -> None:
        """Test creating sample with single measurement."""
        h_repo = HierarchyRepository(async_session)
        c_repo = CharacteristicRepository(async_session)
        s_repo = SampleRepository(async_session)

        site = await h_repo.create(name="Site A", type="Site", parent_id=None)
        char = await c_repo.create(
            hierarchy_id=site.id,
            name="Test Char",
            provider_type="MANUAL",
            subgroup_size=1,
        )

        sample = await s_repo.create_with_measurements(
            char_id=char.id,
            values=[10.5],
            batch_number="BATCH-001",
            operator_id="OPR-123",
        )

        assert sample.id is not None
        assert sample.char_id == char.id
        assert sample.batch_number == "BATCH-001"
        assert sample.operator_id == "OPR-123"

        # Verify measurement was created
        measurements = await async_session.execute(
            async_session.query(Measurement).filter(Measurement.sample_id == sample.id)
        )
        # Note: Using execute for SQLAlchemy 2.0 compatibility
        from sqlalchemy import select as sql_select

        stmt = sql_select(Measurement).where(Measurement.sample_id == sample.id)
        result = await async_session.execute(stmt)
        measurements_list = list(result.scalars().all())
        assert len(measurements_list) == 1
        assert measurements_list[0].value == 10.5

    @pytest.mark.asyncio
    async def test_create_with_measurements_multiple(
        self, async_session: AsyncSession
    ) -> None:
        """Test creating sample with multiple measurements."""
        h_repo = HierarchyRepository(async_session)
        c_repo = CharacteristicRepository(async_session)
        s_repo = SampleRepository(async_session)

        site = await h_repo.create(name="Site A", type="Site", parent_id=None)
        char = await c_repo.create(
            hierarchy_id=site.id,
            name="Test Char",
            provider_type="MANUAL",
            subgroup_size=5,
        )

        values = [10.1, 10.2, 10.0, 10.3, 10.1]
        sample = await s_repo.create_with_measurements(
            char_id=char.id, values=values, batch_number="BATCH-002"
        )

        # Verify all measurements were created
        from sqlalchemy import select as sql_select

        stmt = sql_select(Measurement).where(Measurement.sample_id == sample.id)
        result = await async_session.execute(stmt)
        measurements_list = list(result.scalars().all())

        assert len(measurements_list) == 5
        measurement_values = [m.value for m in measurements_list]
        assert sorted(measurement_values) == sorted(values)


class TestViolationRepository:
    """Tests for ViolationRepository acknowledgment operations."""

    @pytest.mark.asyncio
    async def test_get_unacknowledged_all(self, async_session: AsyncSession) -> None:
        """Test getting all unacknowledged violations."""
        h_repo = HierarchyRepository(async_session)
        c_repo = CharacteristicRepository(async_session)
        s_repo = SampleRepository(async_session)
        v_repo = ViolationRepository(async_session)

        # Create test data
        site = await h_repo.create(name="Site A", type="Site", parent_id=None)
        char = await c_repo.create(
            hierarchy_id=site.id,
            name="Test Char",
            provider_type="MANUAL",
            subgroup_size=1,
        )
        sample = await s_repo.create_with_measurements(char_id=char.id, values=[10.5])

        # Create violations
        await v_repo.create(
            sample_id=sample.id,
            rule_id=1,
            rule_name="Rule 1",
            severity="WARNING",
            acknowledged=False,
        )
        await v_repo.create(
            sample_id=sample.id,
            rule_id=2,
            rule_name="Rule 2",
            severity="CRITICAL",
            acknowledged=True,
        )

        unacked = await v_repo.get_unacknowledged()

        assert len(unacked) == 1
        assert unacked[0].rule_id == 1
        assert unacked[0].acknowledged is False

    @pytest.mark.asyncio
    async def test_get_unacknowledged_by_characteristic(
        self, async_session: AsyncSession
    ) -> None:
        """Test filtering unacknowledged violations by characteristic."""
        h_repo = HierarchyRepository(async_session)
        c_repo = CharacteristicRepository(async_session)
        s_repo = SampleRepository(async_session)
        v_repo = ViolationRepository(async_session)

        site = await h_repo.create(name="Site A", type="Site", parent_id=None)
        char1 = await c_repo.create(
            hierarchy_id=site.id,
            name="Char 1",
            provider_type="MANUAL",
            subgroup_size=1,
        )
        char2 = await c_repo.create(
            hierarchy_id=site.id,
            name="Char 2",
            provider_type="MANUAL",
            subgroup_size=1,
        )

        sample1 = await s_repo.create_with_measurements(char_id=char1.id, values=[10.5])
        sample2 = await s_repo.create_with_measurements(char_id=char2.id, values=[20.5])

        await v_repo.create(
            sample_id=sample1.id,
            rule_id=1,
            severity="WARNING",
            acknowledged=False,
        )
        await v_repo.create(
            sample_id=sample2.id,
            rule_id=1,
            severity="WARNING",
            acknowledged=False,
        )

        # Get violations for char1 only
        char1_violations = await v_repo.get_unacknowledged(char_id=char1.id)

        assert len(char1_violations) == 1
        assert char1_violations[0].sample.char_id == char1.id

    @pytest.mark.asyncio
    async def test_get_by_sample(self, async_session: AsyncSession) -> None:
        """Test getting violations for a specific sample."""
        h_repo = HierarchyRepository(async_session)
        c_repo = CharacteristicRepository(async_session)
        s_repo = SampleRepository(async_session)
        v_repo = ViolationRepository(async_session)

        site = await h_repo.create(name="Site A", type="Site", parent_id=None)
        char = await c_repo.create(
            hierarchy_id=site.id,
            name="Test Char",
            provider_type="MANUAL",
            subgroup_size=1,
        )
        sample = await s_repo.create_with_measurements(char_id=char.id, values=[10.5])

        # Create multiple violations for the sample
        await v_repo.create(
            sample_id=sample.id, rule_id=1, severity="WARNING", acknowledged=False
        )
        await v_repo.create(
            sample_id=sample.id, rule_id=2, severity="CRITICAL", acknowledged=False
        )

        violations = await v_repo.get_by_sample(sample.id)

        assert len(violations) == 2
        assert {v.rule_id for v in violations} == {1, 2}

    @pytest.mark.asyncio
    async def test_acknowledge(self, async_session: AsyncSession) -> None:
        """Test acknowledging a violation."""
        h_repo = HierarchyRepository(async_session)
        c_repo = CharacteristicRepository(async_session)
        s_repo = SampleRepository(async_session)
        v_repo = ViolationRepository(async_session)

        site = await h_repo.create(name="Site A", type="Site", parent_id=None)
        char = await c_repo.create(
            hierarchy_id=site.id,
            name="Test Char",
            provider_type="MANUAL",
            subgroup_size=1,
        )
        sample = await s_repo.create_with_measurements(char_id=char.id, values=[10.5])

        violation = await v_repo.create(
            sample_id=sample.id, rule_id=1, severity="WARNING", acknowledged=False
        )

        # Acknowledge the violation
        acked = await v_repo.acknowledge(
            violation.id,
            user="john.doe",
            reason="False positive - calibration in progress",
        )

        assert acked is not None
        assert acked.acknowledged is True
        assert acked.ack_user == "john.doe"
        assert acked.ack_reason == "False positive - calibration in progress"
        assert acked.ack_timestamp is not None

    @pytest.mark.asyncio
    async def test_acknowledge_not_found(self, async_session: AsyncSession) -> None:
        """Test acknowledging a non-existent violation returns None."""
        v_repo = ViolationRepository(async_session)

        result = await v_repo.acknowledge(999, user="john.doe", reason="test")

        assert result is None
