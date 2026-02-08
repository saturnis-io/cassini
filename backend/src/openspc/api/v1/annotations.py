"""Annotation REST endpoints for OpenSPC.

Provides CRUD endpoints for chart annotations (point and period types),
scoped under characteristics.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from openspc.api.deps import get_current_user, get_db_session, require_role
from openspc.api.schemas.annotation import (
    AnnotationCreate,
    AnnotationResponse,
    AnnotationUpdate,
)
from openspc.db.models.annotation import Annotation, AnnotationHistory
from openspc.db.models.characteristic import Characteristic
from openspc.db.models.sample import Sample
from openspc.db.models.user import User

# TODO: This router shares the /api/v1/characteristics prefix with the main
# characteristics router. Consider moving annotation routes to a dedicated
# /api/v1/annotations prefix to avoid potential confusion.
router = APIRouter(
    prefix="/api/v1/characteristics",
    tags=["annotations"],
)


@router.get(
    "/{characteristic_id}/annotations",
    response_model=list[AnnotationResponse],
)
async def list_annotations(
    characteristic_id: int,
    annotation_type: str | None = Query(None, description="Filter by annotation type (point or period)"),
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_user),
) -> list[AnnotationResponse]:
    """List annotations for a characteristic.

    Args:
        characteristic_id: ID of the characteristic
        annotation_type: Optional filter by type ('point' or 'period')
        session: Database session dependency

    Returns:
        List of annotations ordered by created_at desc
    """
    # Verify characteristic exists
    char_result = await session.execute(
        select(Characteristic).where(Characteristic.id == characteristic_id)
    )
    if char_result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Characteristic {characteristic_id} not found",
        )

    stmt = (
        select(Annotation)
        .options(selectinload(Annotation.history))
        .where(Annotation.characteristic_id == characteristic_id)
        .order_by(Annotation.created_at.desc())
    )

    if annotation_type is not None:
        stmt = stmt.where(Annotation.annotation_type == annotation_type)

    result = await session.execute(stmt)
    annotations = result.scalars().all()

    return [AnnotationResponse.model_validate(a) for a in annotations]


@router.post(
    "/{characteristic_id}/annotations",
    response_model=AnnotationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_annotation(
    characteristic_id: int,
    data: AnnotationCreate,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(require_role("supervisor")),
) -> AnnotationResponse:
    """Create an annotation for a characteristic.

    Supervisor+ role required to create annotations.

    Args:
        characteristic_id: ID of the characteristic
        data: Annotation creation data
        session: Database session dependency
        user: Current user (supervisor+)

    Returns:
        Created annotation
    """
    # Verify characteristic exists
    char_result = await session.execute(
        select(Characteristic).where(Characteristic.id == characteristic_id)
    )
    if char_result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Characteristic {characteristic_id} not found",
        )

    # Validate sample reference for point annotations
    if data.annotation_type == "point" and data.sample_id is not None:
        sample_result = await session.execute(
            select(Sample).where(
                Sample.id == data.sample_id,
                Sample.char_id == characteristic_id,
            )
        )
        if sample_result.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Sample {data.sample_id} does not belong to characteristic {characteristic_id}",
            )

    # Period annotations use time range — no sample validation needed

    # Point annotations: upsert — one annotation per sample.
    # If an annotation already exists for this sample, update it (saving old text to history).
    if data.annotation_type == "point" and data.sample_id is not None:
        existing_result = await session.execute(
            select(Annotation)
            .options(selectinload(Annotation.history))
            .where(
                Annotation.characteristic_id == characteristic_id,
                Annotation.annotation_type == "point",
                Annotation.sample_id == data.sample_id,
            )
        )
        existing = existing_result.scalar_one_or_none()

        if existing is not None:
            # Save old text to history if it changed
            if existing.text != data.text:
                history_entry = AnnotationHistory(
                    annotation_id=existing.id,
                    previous_text=existing.text,
                    changed_by=user.username,
                )
                session.add(history_entry)
                existing.text = data.text
            if data.color is not None:
                existing.color = data.color
            await session.commit()
            await session.refresh(existing, attribute_names=["history"])
            return AnnotationResponse.model_validate(existing)

    annotation = Annotation(
        characteristic_id=characteristic_id,
        annotation_type=data.annotation_type,
        text=data.text,
        color=data.color,
        sample_id=data.sample_id,
        start_time=data.start_time,
        end_time=data.end_time,
        created_by=user.username,
    )
    session.add(annotation)
    await session.commit()
    await session.refresh(annotation, attribute_names=["history"])

    return AnnotationResponse.model_validate(annotation)


@router.put(
    "/{characteristic_id}/annotations/{annotation_id}",
    response_model=AnnotationResponse,
)
async def update_annotation(
    characteristic_id: int,
    annotation_id: int,
    data: AnnotationUpdate,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(require_role("supervisor")),
) -> AnnotationResponse:
    """Update an annotation's text or color.

    Supervisor+ role required. When text is changed, the previous value
    is saved to annotation_history for audit trail.

    Args:
        characteristic_id: ID of the characteristic
        annotation_id: ID of the annotation to update
        data: Fields to update
        session: Database session dependency
        user: Current user (supervisor+)

    Returns:
        Updated annotation with history
    """
    result = await session.execute(
        select(Annotation)
        .options(selectinload(Annotation.history))
        .where(
            Annotation.id == annotation_id,
            Annotation.characteristic_id == characteristic_id,
        )
    )
    annotation = result.scalar_one_or_none()

    if annotation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Annotation {annotation_id} not found for characteristic {characteristic_id}",
        )

    # Save old text to history before updating
    if data.text is not None and data.text != annotation.text:
        history_entry = AnnotationHistory(
            annotation_id=annotation.id,
            previous_text=annotation.text,
            changed_by=user.username,
        )
        session.add(history_entry)
        annotation.text = data.text

    if data.color is not None:
        annotation.color = data.color

    await session.commit()
    await session.refresh(annotation, attribute_names=["history"])

    return AnnotationResponse.model_validate(annotation)


@router.delete(
    "/{characteristic_id}/annotations/{annotation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_annotation(
    characteristic_id: int,
    annotation_id: int,
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(require_role("supervisor")),
) -> None:
    """Delete an annotation.

    Supervisor+ role required.

    Args:
        characteristic_id: ID of the characteristic
        annotation_id: ID of the annotation to delete
        session: Database session dependency
    """
    result = await session.execute(
        select(Annotation).where(
            Annotation.id == annotation_id,
            Annotation.characteristic_id == characteristic_id,
        )
    )
    annotation = result.scalar_one_or_none()

    if annotation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Annotation {annotation_id} not found for characteristic {characteristic_id}",
        )

    await session.delete(annotation)
    await session.commit()
