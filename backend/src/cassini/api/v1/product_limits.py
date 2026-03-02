"""Product limit REST endpoints for per-product-code control limit overrides.

Provides CRUD for product-specific control limits on characteristics,
plus a utility endpoint to list distinct product codes from samples.
"""

import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from cassini.api.deps import (
    check_plant_role,
    get_current_user,
    get_current_engineer,
    get_db_session,
    resolve_plant_id_for_characteristic,
)
from cassini.api.schemas.product_limit import (
    ProductLimitCreate,
    ProductLimitResponse,
    ProductLimitUpdate,
)
from cassini.db.models.characteristic import Characteristic
from cassini.db.models.sample import Sample
from cassini.db.models.user import User
from cassini.db.repositories.product_limit import ProductLimitRepository

logger = structlog.get_logger(__name__)

router = APIRouter(
    prefix="/api/v1/characteristics",
    tags=["product-limits"],
)


# ---------------------------------------------------------------------------
# List distinct product codes from samples (read-only, any user)
# ---------------------------------------------------------------------------
@router.get("/{char_id}/product-codes")
async def list_product_codes(
    char_id: int,
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_user),
) -> list[str]:
    """List distinct product codes that have been submitted for this characteristic."""
    # Verify characteristic exists
    char = await session.get(Characteristic, char_id)
    if char is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Characteristic {char_id} not found",
        )

    stmt = (
        select(Sample.product_code)
        .where(Sample.char_id == char_id, Sample.product_code.isnot(None))
        .distinct()
        .order_by(Sample.product_code)
    )
    result = await session.execute(stmt)
    return [row[0] for row in result.all()]


# ---------------------------------------------------------------------------
# Product limit CRUD (engineer+ required)
# ---------------------------------------------------------------------------
@router.get("/{char_id}/product-limits", response_model=list[ProductLimitResponse])
async def list_product_limits(
    char_id: int,
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_user),
) -> list[ProductLimitResponse]:
    """List all product limit overrides for a characteristic."""
    char = await session.get(Characteristic, char_id)
    if char is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Characteristic {char_id} not found",
        )

    repo = ProductLimitRepository(session)
    limits = await repo.list_by_characteristic(char_id)
    return [ProductLimitResponse.model_validate(pl) for pl in limits]


@router.post("/{char_id}/product-limits", response_model=ProductLimitResponse, status_code=status.HTTP_201_CREATED)
async def create_product_limit(
    char_id: int,
    body: ProductLimitCreate,
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_engineer),
) -> ProductLimitResponse:
    """Create or upsert a product limit override for a characteristic."""
    char = await session.get(Characteristic, char_id)
    if char is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Characteristic {char_id} not found",
        )

    plant_id = await resolve_plant_id_for_characteristic(char_id, session)
    check_plant_role(_user, plant_id, "engineer")

    repo = ProductLimitRepository(session)
    data = body.model_dump(exclude={"product_code"})
    limit = await repo.upsert(char_id, body.product_code, data)
    await session.commit()

    return ProductLimitResponse.model_validate(limit)


@router.get("/{char_id}/product-limits/{product_code}", response_model=ProductLimitResponse)
async def get_product_limit(
    char_id: int,
    product_code: str,
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_user),
) -> ProductLimitResponse:
    """Get a specific product limit override."""
    repo = ProductLimitRepository(session)
    limit = await repo.get_by_char_and_code(char_id, product_code)
    if limit is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No product limit for code '{product_code}' on characteristic {char_id}",
        )
    return ProductLimitResponse.model_validate(limit)


@router.put("/{char_id}/product-limits/{product_code}", response_model=ProductLimitResponse)
async def update_product_limit(
    char_id: int,
    product_code: str,
    body: ProductLimitUpdate,
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_engineer),
) -> ProductLimitResponse:
    """Update an existing product limit override."""
    plant_id = await resolve_plant_id_for_characteristic(char_id, session)
    check_plant_role(_user, plant_id, "engineer")

    repo = ProductLimitRepository(session)
    existing = await repo.get_by_char_and_code(char_id, product_code)
    if existing is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No product limit for code '{product_code}' on characteristic {char_id}",
        )

    data = body.model_dump()
    for key, value in data.items():
        if hasattr(existing, key):
            setattr(existing, key, value)

    await session.flush()
    await session.refresh(existing)
    await session.commit()

    return ProductLimitResponse.model_validate(existing)


@router.delete("/{char_id}/product-limits/{product_code}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product_limit(
    char_id: int,
    product_code: str,
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_engineer),
) -> None:
    """Delete a product limit override."""
    plant_id = await resolve_plant_id_for_characteristic(char_id, session)
    check_plant_role(_user, plant_id, "engineer")

    repo = ProductLimitRepository(session)
    deleted = await repo.delete_by_char_and_code(char_id, product_code)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No product limit for code '{product_code}' on characteristic {char_id}",
        )
    await session.commit()
