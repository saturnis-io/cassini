"""Annotation REST endpoints for OpenSPC.

Provides CRUD endpoints for chart annotations (point and period types),
scoped under characteristics.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from openspc.api.deps import get_current_user, get_db_session, require_role
from openspc.api.schemas.annotation import (
    AnnotationCreate,
    AnnotationResponse,
    AnnotationUpdate,
)
from openspc.db.models.annotation import Annotation
from openspc.db.models.characteristic import Characteristic
from openspc.db.models.sample import Sample
from openspc.db.models.user import User

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

    # Validate sample references belong to this characteristic
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

    if data.annotation_type == "period":
        for sample_id, label in [
            (data.start_sample_id, "start"),
            (data.end_sample_id, "end"),
        ]:
            if sample_id is not None:
                sample_result = await session.execute(
                    select(Sample).where(
                        Sample.id == sample_id,
                        Sample.char_id == characteristic_id,
                    )
                )
                if sample_result.scalar_one_or_none() is None:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"{label.capitalize()} sample {sample_id} does not belong to characteristic {characteristic_id}",
                    )

    annotation = Annotation(
        characteristic_id=characteristic_id,
        annotation_type=data.annotation_type,
        text=data.text,
        color=data.color,
        sample_id=data.sample_id,
        start_sample_id=data.start_sample_id,
        end_sample_id=data.end_sample_id,
        created_by=user.username,
    )
    session.add(annotation)
    await session.commit()
    await session.refresh(annotation)

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
    _user: User = Depends(require_role("supervisor")),
) -> AnnotationResponse:
    """Update an annotation's text or color.

    Supervisor+ role required.

    Args:
        characteristic_id: ID of the characteristic
        annotation_id: ID of the annotation to update
        data: Fields to update
        session: Database session dependency

    Returns:
        Updated annotation
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

    if data.text is not None:
        annotation.text = data.text
    if data.color is not None:
        annotation.color = data.color

    await session.commit()
    await session.refresh(annotation)

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
