"""Tests for Collection Plans / Check Sheets feature."""
import pytest

from cassini.api.schemas.collection_plan import (
    CollectionPlanCreate,
    CollectionPlanExecutionCreate,
    CollectionPlanItemCreate,
    CollectionPlanItemResponse,
    CollectionPlanResponse,
    CollectionPlanUpdate,
    ExecutionStartResponse,
    StaleItemInfo,
)


class TestCollectionPlanSchemas:
    """Test Pydantic schema validation for collection plans."""

    def test_plan_create_valid(self):
        data = CollectionPlanCreate(
            name="Daily Check Sheet",
            plant_id=1,
            description="Morning QC checks",
            items=[
                CollectionPlanItemCreate(
                    characteristic_id=10,
                    sequence_order=0,
                    instructions="Measure bore diameter",
                    required=True,
                ),
                CollectionPlanItemCreate(
                    characteristic_id=20,
                    sequence_order=1,
                    instructions="Measure surface roughness",
                    required=False,
                ),
            ],
        )
        assert data.name == "Daily Check Sheet"
        assert data.plant_id == 1
        assert len(data.items) == 2
        assert data.items[0].required is True
        assert data.items[1].required is False

    def test_plan_create_rejects_empty_items(self):
        with pytest.raises(Exception):
            CollectionPlanCreate(
                name="Empty Plan",
                plant_id=1,
                items=[],
            )

    def test_plan_create_name_max_length(self):
        # 255 chars should be fine
        data = CollectionPlanCreate(
            name="A" * 255,
            plant_id=1,
            items=[
                CollectionPlanItemCreate(
                    characteristic_id=1,
                    sequence_order=0,
                ),
            ],
        )
        assert len(data.name) == 255

        # 256 chars should fail
        with pytest.raises(Exception):
            CollectionPlanCreate(
                name="A" * 256,
                plant_id=1,
                items=[
                    CollectionPlanItemCreate(
                        characteristic_id=1,
                        sequence_order=0,
                    ),
                ],
            )

    def test_item_create_defaults(self):
        item = CollectionPlanItemCreate(
            characteristic_id=5,
            sequence_order=0,
        )
        assert item.required is True
        assert item.instructions is None

    def test_item_create_negative_sequence_rejected(self):
        with pytest.raises(Exception):
            CollectionPlanItemCreate(
                characteristic_id=5,
                sequence_order=-1,
            )

    def test_plan_update_partial(self):
        update = CollectionPlanUpdate(name="Updated Name")
        assert update.name == "Updated Name"
        assert update.description is None
        assert update.is_active is None
        assert update.items is None

    def test_plan_update_with_items(self):
        update = CollectionPlanUpdate(
            items=[
                CollectionPlanItemCreate(
                    characteristic_id=10,
                    sequence_order=0,
                ),
            ],
        )
        assert update.items is not None
        assert len(update.items) == 1

    def test_execution_create_valid_completed(self):
        data = CollectionPlanExecutionCreate(
            items_completed=5,
            items_skipped=1,
            status="completed",
        )
        assert data.status == "completed"
        assert data.items_completed == 5
        assert data.items_skipped == 1

    def test_execution_create_valid_abandoned(self):
        data = CollectionPlanExecutionCreate(
            items_completed=2,
            items_skipped=0,
            status="abandoned",
        )
        assert data.status == "abandoned"

    def test_execution_create_rejects_invalid_status(self):
        with pytest.raises(Exception):
            CollectionPlanExecutionCreate(
                items_completed=5,
                items_skipped=0,
                status="invalid_status",
            )

    def test_execution_create_rejects_negative_counts(self):
        with pytest.raises(Exception):
            CollectionPlanExecutionCreate(
                items_completed=-1,
                items_skipped=0,
                status="completed",
            )

    def test_plan_response_model(self):
        resp = CollectionPlanResponse(
            id=1,
            plant_id=1,
            name="Test Plan",
            description="A test",
            is_active=True,
            created_by=1,
            created_at="2026-01-01T00:00:00",
            updated_at=None,
            item_count=3,
        )
        assert resp.id == 1
        assert resp.item_count == 3

    def test_item_response_with_specs(self):
        resp = CollectionPlanItemResponse(
            id=1,
            characteristic_id=10,
            characteristic_name="Bore Diameter",
            hierarchy_path="Plant 1 > Line 2 > Station 3",
            sequence_order=0,
            instructions="Use gage #42",
            required=True,
            usl=10.05,
            lsl=9.95,
            target_value=10.0,
            subgroup_size=5,
        )
        assert resp.characteristic_name == "Bore Diameter"
        assert resp.usl == 10.05
        assert resp.lsl == 9.95
        assert resp.target_value == 10.0

    def test_stale_item_info(self):
        info = StaleItemInfo(
            characteristic_id=99,
            characteristic_name="Deleted Char",
            reason="Characteristic has been deleted",
        )
        assert info.characteristic_id == 99

    def test_execution_start_response(self):
        resp = ExecutionStartResponse(
            execution_id=1,
            plan_id=1,
            started_at="2026-01-01T00:00:00",
            items=[],
        )
        assert resp.execution_id == 1


class TestCollectionPlanModel:
    """Test SQLAlchemy model structure."""

    def test_model_imports(self):
        """Verify models can be imported from the package."""
        from cassini.db.models.collection_plan import (
            CollectionPlan,
            CollectionPlanExecution,
            CollectionPlanItem,
        )
        assert CollectionPlan.__tablename__ == "collection_plan"
        assert CollectionPlanItem.__tablename__ == "collection_plan_item"
        assert CollectionPlanExecution.__tablename__ == "collection_plan_execution"

    def test_model_in_package_init(self):
        """Verify models are exported from the models package."""
        from cassini.db.models import (
            CollectionPlan,
            CollectionPlanExecution,
            CollectionPlanItem,
        )
        assert CollectionPlan is not None
        assert CollectionPlanExecution is not None
        assert CollectionPlanItem is not None

    def test_item_fk_restrict(self):
        """Verify CollectionPlanItem uses ON DELETE RESTRICT for characteristic FK."""
        from cassini.db.models.collection_plan import CollectionPlanItem
        import sqlalchemy as sa

        char_fk = None
        for col in CollectionPlanItem.__table__.columns:
            if col.name == "characteristic_id":
                for fk in col.foreign_keys:
                    char_fk = fk
                    break

        assert char_fk is not None
        assert char_fk.ondelete == "RESTRICT"

    def test_execution_default_status(self):
        """Verify CollectionPlanExecution defaults to 'in_progress'."""
        from cassini.db.models.collection_plan import CollectionPlanExecution

        col = CollectionPlanExecution.__table__.c.status
        assert col.default.arg == "in_progress"


class TestAuditIntegration:
    """Test audit trail integration for collection plans."""

    def test_resource_pattern_exists(self):
        """Verify collection-plans has a _RESOURCE_PATTERNS entry."""
        from cassini.core.audit import _parse_resource

        resource_type, resource_id = _parse_resource("/api/v1/collection-plans/5")
        assert resource_type == "collection_plan"
        assert resource_id == 5

    def test_resource_pattern_list(self):
        """Verify list endpoint resolves."""
        from cassini.core.audit import _parse_resource

        resource_type, _ = _parse_resource("/api/v1/collection-plans")
        assert resource_type == "collection_plan"

    def test_resource_pattern_execute(self):
        """Verify execute endpoint resolves."""
        from cassini.core.audit import _parse_resource

        resource_type, resource_id = _parse_resource(
            "/api/v1/collection-plans/3/execute"
        )
        assert resource_type == "collection_plan"
        assert resource_id == 3

    def test_resource_pattern_executions(self):
        """Verify executions sub-resource resolves."""
        from cassini.core.audit import _parse_resource

        resource_type, resource_id = _parse_resource(
            "/api/v1/collection-plans/3/executions/7"
        )
        assert resource_type == "collection_plan"
        assert resource_id == 3

    def test_execute_action_mapping(self):
        """Verify 'execute' maps to action 'execute'."""
        from cassini.core.audit import _method_to_action

        assert _method_to_action("POST", "/api/v1/collection-plans/3/execute") == "execute"

    def test_execute_does_not_shadow_submit(self):
        """Verify /submit still maps correctly."""
        from cassini.core.audit import _method_to_action

        assert _method_to_action("POST", "/api/v1/data-entry/submit") == "submit"


class TestRouterRegistration:
    """Test that the router is properly registered."""

    def test_router_prefix(self):
        """Verify router prefix follows convention."""
        from cassini.api.v1.collection_plans import router

        assert router.prefix == "/api/v1/collection-plans"

    def test_router_has_crud_endpoints(self):
        """Verify CRUD + execution endpoints exist."""
        from cassini.api.v1.collection_plans import router

        paths = [route.path for route in router.routes]
        prefix = "/api/v1/collection-plans"
        # CRUD
        assert prefix in paths
        assert f"{prefix}/{{plan_id}}" in paths
        # Execution
        assert f"{prefix}/{{plan_id}}/execute" in paths
        assert f"{prefix}/{{plan_id}}/executions/{{execution_id}}" in paths
        assert f"{prefix}/{{plan_id}}/executions" in paths
