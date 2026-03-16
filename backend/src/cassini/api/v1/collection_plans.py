"""Collection Plans (Check Sheets) REST endpoints.

Provides CRUD for collection plans with guided measurement workflows.
Plans group characteristics into sequenced check sheets for operators.
"""

from datetime import datetime, timezone

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func as sa_func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from cassini.api.deps import (
    check_plant_role,
    get_current_user,
    get_db_session,
)
from cassini.api.schemas.collection_plan import (
    CollectionPlanCreate,
    CollectionPlanDetailResponse,
    CollectionPlanExecutionCreate,
    CollectionPlanExecutionResponse,
    CollectionPlanItemResponse,
    CollectionPlanResponse,
    CollectionPlanUpdate,
    ExecutionStartResponse,
    StaleItemInfo,
)
from cassini.db.models.characteristic import Characteristic
from cassini.db.models.collection_plan import (
    CollectionPlan,
    CollectionPlanExecution,
    CollectionPlanItem,
)
from cassini.db.models.hierarchy import Hierarchy
from cassini.db.models.user import User

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/v1/collection-plans", tags=["collection-plans"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _resolve_hierarchy_path(session: AsyncSession, hierarchy_id: int) -> str:
    """Build hierarchy path string like 'Line 2 > Cell 3'."""
    parts: list[str] = []
    current_id: int | None = hierarchy_id
    depth = 0
    while current_id is not None and depth < 50:
        row = (
            await session.execute(
                select(Hierarchy.name, Hierarchy.parent_id).where(
                    Hierarchy.id == current_id
                )
            )
        ).first()
        if row is None:
            break
        parts.insert(0, row.name)
        current_id = row.parent_id
        depth += 1
    return " > ".join(parts) if parts else ""


async def _build_item_response(
    session: AsyncSession, item: CollectionPlanItem
) -> CollectionPlanItemResponse:
    """Build a CollectionPlanItemResponse with characteristic details."""
    char_row = (
        await session.execute(
            select(
                Characteristic.name,
                Characteristic.hierarchy_id,
                Characteristic.usl,
                Characteristic.lsl,
                Characteristic.target_value,
                Characteristic.subgroup_size,
            ).where(Characteristic.id == item.characteristic_id)
        )
    ).first()

    char_name = None
    hierarchy_path = None
    usl = None
    lsl = None
    target_value = None
    subgroup_size = 1

    if char_row:
        char_name = char_row.name
        hierarchy_path = await _resolve_hierarchy_path(session, char_row.hierarchy_id)
        usl = char_row.usl
        lsl = char_row.lsl
        target_value = char_row.target_value
        subgroup_size = char_row.subgroup_size

    return CollectionPlanItemResponse(
        id=item.id,
        characteristic_id=item.characteristic_id,
        characteristic_name=char_name,
        hierarchy_path=hierarchy_path,
        sequence_order=item.sequence_order,
        instructions=item.instructions,
        required=item.required,
        usl=usl,
        lsl=lsl,
        target_value=target_value,
        subgroup_size=subgroup_size,
    )


async def _get_plan_or_404(
    session: AsyncSession,
    plan_id: int,
    *,
    load_items: bool = False,
) -> CollectionPlan:
    """Fetch a collection plan by ID."""
    stmt = select(CollectionPlan).where(CollectionPlan.id == plan_id)
    if load_items:
        stmt = stmt.options(selectinload(CollectionPlan.items))
    result = await session.execute(stmt)
    plan = result.scalar_one_or_none()
    if plan is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Collection plan not found",
        )
    return plan


async def _validate_cross_plant(
    session: AsyncSession,
    plant_id: int,
    characteristic_ids: list[int],
) -> list[StaleItemInfo]:
    """Validate all characteristics belong to the same plant.

    Uses a recursive CTE to resolve each characteristic's plant_id
    via the hierarchy chain.

    Returns a list of stale items that don't match the plan's plant.
    """
    from sqlalchemy import text

    stale: list[StaleItemInfo] = []
    for char_id in characteristic_ids:
        # Check characteristic exists
        char_row = (
            await session.execute(
                select(Characteristic.name, Characteristic.hierarchy_id).where(
                    Characteristic.id == char_id
                )
            )
        ).first()

        if char_row is None:
            stale.append(
                StaleItemInfo(
                    characteristic_id=char_id,
                    characteristic_name=None,
                    reason="Characteristic not found",
                )
            )
            continue

        # Resolve plant_id via hierarchy CTE
        cte_sql = text("""
            WITH RECURSIVE ancestors AS (
                SELECT id, parent_id, plant_id, 1 AS depth
                FROM hierarchy
                WHERE id = :start_id
                UNION ALL
                SELECT h.id, h.parent_id, h.plant_id, a.depth + 1
                FROM hierarchy h
                JOIN ancestors a ON h.id = a.parent_id
                WHERE a.depth < 50
            )
            SELECT plant_id FROM ancestors WHERE plant_id IS NOT NULL LIMIT 1
        """)
        result = await session.execute(cte_sql, {"start_id": char_row.hierarchy_id})
        resolved_plant_id = result.scalar_one_or_none()

        if resolved_plant_id != plant_id:
            stale.append(
                StaleItemInfo(
                    characteristic_id=char_id,
                    characteristic_name=char_row.name,
                    reason=f"Characteristic belongs to plant {resolved_plant_id}, not {plant_id}",
                )
            )

    return stale


# ---------------------------------------------------------------------------
# CRUD Endpoints
# ---------------------------------------------------------------------------


@router.get(
    "",
    response_model=list[CollectionPlanResponse],
    summary="List collection plans",
)
async def list_plans(
    plant_id: int = Query(..., description="Filter by plant ID"),
    is_active: bool | None = Query(None, description="Filter by active status"),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> list[CollectionPlanResponse]:
    """List collection plans for a plant."""
    check_plant_role(user, plant_id, "operator")

    stmt = select(CollectionPlan).where(CollectionPlan.plant_id == plant_id)
    if is_active is not None:
        stmt = stmt.where(CollectionPlan.is_active == is_active)
    stmt = stmt.order_by(CollectionPlan.name)

    # Load item counts via subquery
    item_count_sub = (
        select(
            CollectionPlanItem.plan_id,
            sa_func.count(CollectionPlanItem.id).label("item_count"),
        )
        .group_by(CollectionPlanItem.plan_id)
        .subquery()
    )

    result = await session.execute(stmt)
    plans = result.scalars().all()

    # Get item counts
    plan_ids = [p.id for p in plans]
    if plan_ids:
        count_result = await session.execute(
            select(
                item_count_sub.c.plan_id,
                item_count_sub.c.item_count,
            ).where(item_count_sub.c.plan_id.in_(plan_ids))
        )
        count_map = {row.plan_id: row.item_count for row in count_result}
    else:
        count_map = {}

    return [
        CollectionPlanResponse(
            id=p.id,
            plant_id=p.plant_id,
            name=p.name,
            description=p.description,
            is_active=p.is_active,
            created_by=p.created_by,
            created_at=p.created_at,
            updated_at=p.updated_at,
            item_count=count_map.get(p.id, 0),
        )
        for p in plans
    ]


@router.get(
    "/{plan_id}",
    response_model=CollectionPlanDetailResponse,
    summary="Get collection plan detail",
)
async def get_plan(
    plan_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> CollectionPlanDetailResponse:
    """Get a collection plan with its items."""
    plan = await _get_plan_or_404(session, plan_id, load_items=True)
    check_plant_role(user, plan.plant_id, "operator")

    items = [await _build_item_response(session, item) for item in plan.items]

    return CollectionPlanDetailResponse(
        id=plan.id,
        plant_id=plan.plant_id,
        name=plan.name,
        description=plan.description,
        is_active=plan.is_active,
        created_by=plan.created_by,
        created_at=plan.created_at,
        updated_at=plan.updated_at,
        item_count=len(items),
        items=items,
    )


@router.post(
    "",
    response_model=CollectionPlanDetailResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create collection plan",
)
async def create_plan(
    request: Request,
    data: CollectionPlanCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> CollectionPlanDetailResponse:
    """Create a new collection plan."""
    check_plant_role(user, data.plant_id, "engineer")

    # Validate cross-plant constraint
    char_ids = [item.characteristic_id for item in data.items]
    stale = await _validate_cross_plant(session, data.plant_id, char_ids)
    if stale:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": "Some characteristics do not belong to the specified plant",
                "stale_items": [s.model_dump() for s in stale],
            },
        )

    plan = CollectionPlan(
        plant_id=data.plant_id,
        name=data.name,
        description=data.description,
        created_by=user.id,
    )
    session.add(plan)
    await session.flush()

    for item_data in data.items:
        item = CollectionPlanItem(
            plan_id=plan.id,
            characteristic_id=item_data.characteristic_id,
            sequence_order=item_data.sequence_order,
            instructions=item_data.instructions,
            required=item_data.required,
        )
        session.add(item)

    await session.flush()

    # Reload with items
    plan = await _get_plan_or_404(session, plan.id, load_items=True)
    items = [await _build_item_response(session, item) for item in plan.items]

    await session.commit()

    request.state.audit_context = {
        "resource_type": "collection_plan",
        "resource_id": plan.id,
        "action": "create",
        "summary": f"Created collection plan '{plan.name}' with {len(items)} items",
        "fields": {
            "plan_name": plan.name,
            "plant_id": plan.plant_id,
            "item_count": len(items),
        },
    }

    return CollectionPlanDetailResponse(
        id=plan.id,
        plant_id=plan.plant_id,
        name=plan.name,
        description=plan.description,
        is_active=plan.is_active,
        created_by=plan.created_by,
        created_at=plan.created_at,
        updated_at=plan.updated_at,
        item_count=len(items),
        items=items,
    )


@router.put(
    "/{plan_id}",
    response_model=CollectionPlanDetailResponse,
    summary="Update collection plan",
)
async def update_plan(
    plan_id: int,
    request: Request,
    data: CollectionPlanUpdate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> CollectionPlanDetailResponse:
    """Update a collection plan's metadata and/or items."""
    plan = await _get_plan_or_404(session, plan_id, load_items=True)
    check_plant_role(user, plan.plant_id, "engineer")

    if data.name is not None:
        plan.name = data.name
    if data.description is not None:
        plan.description = data.description
    if data.is_active is not None:
        plan.is_active = data.is_active
    plan.updated_at = datetime.now(timezone.utc)

    if data.items is not None:
        # Validate cross-plant constraint for new items
        char_ids = [item.characteristic_id for item in data.items]
        stale = await _validate_cross_plant(session, plan.plant_id, char_ids)
        if stale:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "message": "Some characteristics do not belong to the plan's plant",
                    "stale_items": [s.model_dump() for s in stale],
                },
            )

        # Replace items: delete old, add new
        for existing_item in plan.items:
            await session.delete(existing_item)
        await session.flush()

        for item_data in data.items:
            item = CollectionPlanItem(
                plan_id=plan.id,
                characteristic_id=item_data.characteristic_id,
                sequence_order=item_data.sequence_order,
                instructions=item_data.instructions,
                required=item_data.required,
            )
            session.add(item)

    await session.flush()

    # Reload with items
    plan = await _get_plan_or_404(session, plan.id, load_items=True)
    items = [await _build_item_response(session, item) for item in plan.items]

    await session.commit()

    request.state.audit_context = {
        "resource_type": "collection_plan",
        "resource_id": plan.id,
        "action": "update",
        "summary": f"Updated collection plan '{plan.name}'",
        "fields": {"plan_name": plan.name},
    }

    return CollectionPlanDetailResponse(
        id=plan.id,
        plant_id=plan.plant_id,
        name=plan.name,
        description=plan.description,
        is_active=plan.is_active,
        created_by=plan.created_by,
        created_at=plan.created_at,
        updated_at=plan.updated_at,
        item_count=len(items),
        items=items,
    )


@router.delete(
    "/{plan_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete collection plan",
)
async def delete_plan(
    plan_id: int,
    request: Request,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> None:
    """Delete a collection plan and all its items."""
    plan = await _get_plan_or_404(session, plan_id)
    check_plant_role(user, plan.plant_id, "engineer")

    plan_name = plan.name

    await session.delete(plan)
    await session.commit()

    request.state.audit_context = {
        "resource_type": "collection_plan",
        "resource_id": plan_id,
        "action": "delete",
        "summary": f"Deleted collection plan '{plan_name}'",
        "fields": {"plan_name": plan_name},
    }


# ---------------------------------------------------------------------------
# Execution Endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/{plan_id}/execute",
    response_model=ExecutionStartResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Start plan execution",
)
async def start_execution(
    plan_id: int,
    request: Request,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> ExecutionStartResponse:
    """Start executing a collection plan.

    Validates ALL items have active, accessible characteristics before starting.
    Returns 409 with a list of stale items if any are deactivated or deleted.
    """
    plan = await _get_plan_or_404(session, plan_id, load_items=True)
    check_plant_role(user, plan.plant_id, "operator")

    if not plan.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot execute an inactive plan",
        )

    if not plan.items:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Plan has no items",
        )

    # Validate all characteristics are still accessible
    stale_items: list[StaleItemInfo] = []
    for item in plan.items:
        char_row = (
            await session.execute(
                select(Characteristic.id, Characteristic.name).where(
                    Characteristic.id == item.characteristic_id
                )
            )
        ).first()

        if char_row is None:
            stale_items.append(
                StaleItemInfo(
                    characteristic_id=item.characteristic_id,
                    characteristic_name=None,
                    reason="Characteristic has been deleted",
                )
            )

    if stale_items:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": "Some characteristics are no longer available",
                "stale_items": [s.model_dump() for s in stale_items],
            },
        )

    # Cross-plant re-validation (characteristics may have moved)
    char_ids = [item.characteristic_id for item in plan.items]
    cross_plant_stale = await _validate_cross_plant(session, plan.plant_id, char_ids)
    if cross_plant_stale:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": "Some characteristics no longer belong to this plant",
                "stale_items": [s.model_dump() for s in cross_plant_stale],
            },
        )

    # Create execution record
    execution = CollectionPlanExecution(
        plan_id=plan.id,
        executed_by=user.id,
        status="in_progress",
    )
    session.add(execution)
    await session.flush()

    # Build item responses
    items = [await _build_item_response(session, item) for item in plan.items]

    await session.commit()

    request.state.audit_context = {
        "resource_type": "collection_plan",
        "resource_id": plan.id,
        "action": "execute",
        "summary": f"Started execution of plan '{plan.name}'",
        "fields": {
            "execution_id": execution.id,
            "plan_name": plan.name,
            "item_count": len(items),
        },
    }

    return ExecutionStartResponse(
        execution_id=execution.id,
        plan_id=plan.id,
        started_at=execution.started_at,
        items=items,
    )


@router.put(
    "/{plan_id}/executions/{execution_id}",
    response_model=CollectionPlanExecutionResponse,
    summary="Complete or abandon plan execution",
)
async def complete_execution(
    plan_id: int,
    execution_id: int,
    request: Request,
    data: CollectionPlanExecutionCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> CollectionPlanExecutionResponse:
    """Complete or abandon a plan execution with summary counts."""
    plan = await _get_plan_or_404(session, plan_id)
    check_plant_role(user, plan.plant_id, "operator")

    result = await session.execute(
        select(CollectionPlanExecution).where(
            CollectionPlanExecution.id == execution_id,
            CollectionPlanExecution.plan_id == plan_id,
        )
    )
    execution = result.scalar_one_or_none()
    if execution is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Execution not found",
        )

    if execution.status != "in_progress":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Execution is already finalized",
        )

    execution.status = data.status
    execution.items_completed = data.items_completed
    execution.items_skipped = data.items_skipped
    execution.completed_at = datetime.now(timezone.utc)

    await session.commit()

    request.state.audit_context = {
        "resource_type": "collection_plan",
        "resource_id": plan.id,
        "action": "execute",
        "summary": f"Execution {data.status}: {data.items_completed} completed, {data.items_skipped} skipped",
        "fields": {
            "execution_id": execution.id,
            "status": data.status,
            "items_completed": data.items_completed,
            "items_skipped": data.items_skipped,
        },
    }

    return CollectionPlanExecutionResponse(
        id=execution.id,
        plan_id=execution.plan_id,
        executed_by=execution.executed_by,
        started_at=execution.started_at,
        completed_at=execution.completed_at,
        status=execution.status,
        items_completed=execution.items_completed,
        items_skipped=execution.items_skipped,
    )


@router.get(
    "/{plan_id}/executions",
    response_model=list[CollectionPlanExecutionResponse],
    summary="List plan executions",
)
async def list_executions(
    plan_id: int,
    limit: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> list[CollectionPlanExecutionResponse]:
    """List execution history for a plan."""
    plan = await _get_plan_or_404(session, plan_id)
    check_plant_role(user, plan.plant_id, "operator")

    result = await session.execute(
        select(CollectionPlanExecution)
        .where(CollectionPlanExecution.plan_id == plan_id)
        .order_by(CollectionPlanExecution.started_at.desc())
        .limit(limit)
    )
    executions = result.scalars().all()

    return [
        CollectionPlanExecutionResponse(
            id=e.id,
            plan_id=e.plan_id,
            executed_by=e.executed_by,
            started_at=e.started_at,
            completed_at=e.completed_at,
            status=e.status,
            items_completed=e.items_completed,
            items_skipped=e.items_skipped,
        )
        for e in executions
    ]
