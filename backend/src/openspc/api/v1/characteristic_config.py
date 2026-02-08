"""API endpoints for characteristic configuration."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from openspc.api.deps import (
    get_characteristic_repo as get_char_repo,
    get_current_user,
    get_current_engineer,
    get_db_session,
)
from openspc.db.models.user import User
from openspc.api.schemas.characteristic_config import (
    CharacteristicConfigResponse,
    CharacteristicConfigUpdate,
)
from openspc.db.repositories.characteristic import CharacteristicRepository
from openspc.db.repositories.characteristic_config import CharacteristicConfigRepository

router = APIRouter(prefix="/api/v1/characteristics", tags=["characteristic-config"])


async def get_config_repo(
    session: AsyncSession = Depends(get_db_session),
) -> CharacteristicConfigRepository:
    """Get characteristic config repository instance."""
    return CharacteristicConfigRepository(session)


@router.get("/{char_id}/config", response_model=CharacteristicConfigResponse | None)
async def get_characteristic_config(
    char_id: int,
    config_repo: CharacteristicConfigRepository = Depends(get_config_repo),
    char_repo: CharacteristicRepository = Depends(get_char_repo),
    _user: User = Depends(get_current_user),
):
    """Get configuration for a characteristic.

    Args:
        char_id: ID of the characteristic

    Returns:
        CharacteristicConfigResponse if config exists, None otherwise

    Raises:
        HTTPException 404: If characteristic not found
    """
    # Verify characteristic exists
    char = await char_repo.get_by_id(char_id)
    if char is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Characteristic {char_id} not found",
        )

    db_config = await config_repo.get_by_characteristic(char_id)
    if db_config is None:
        return None

    config = await config_repo.get_config_parsed(char_id)

    return CharacteristicConfigResponse(
        characteristic_id=char_id,
        config=config,
        is_active=db_config.is_active,
    )


@router.put("/{char_id}/config", response_model=CharacteristicConfigResponse)
async def update_characteristic_config(
    char_id: int,
    data: CharacteristicConfigUpdate,
    session: AsyncSession = Depends(get_db_session),
    config_repo: CharacteristicConfigRepository = Depends(get_config_repo),
    char_repo: CharacteristicRepository = Depends(get_char_repo),
    _user: User = Depends(get_current_engineer),
):
    """Create or update configuration for a characteristic.

    Args:
        char_id: ID of the characteristic
        data: CharacteristicConfigUpdate with the new config

    Returns:
        CharacteristicConfigResponse with the saved config

    Raises:
        HTTPException 404: If characteristic not found
        HTTPException 400: If config_type doesn't match provider_type
    """
    # Verify characteristic exists
    char = await char_repo.get_by_id(char_id)
    if char is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Characteristic {char_id} not found",
        )

    # Validate config type matches characteristic provider type
    config = data.config
    if char.provider_type == "MANUAL" and config.config_type != "MANUAL":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="MANUAL characteristic requires ManualConfig",
        )
    if char.provider_type == "TAG" and config.config_type != "TAG":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="TAG characteristic requires TagConfig",
        )

    db_config = await config_repo.upsert(char_id, config)
    await session.commit()

    return CharacteristicConfigResponse(
        characteristic_id=char_id,
        config=config,
        is_active=db_config.is_active,
    )


@router.delete("/{char_id}/config", status_code=status.HTTP_204_NO_CONTENT)
async def delete_characteristic_config(
    char_id: int,
    session: AsyncSession = Depends(get_db_session),
    config_repo: CharacteristicConfigRepository = Depends(get_config_repo),
    _user: User = Depends(get_current_engineer),
):
    """Delete configuration for a characteristic.

    Args:
        char_id: ID of the characteristic

    Raises:
        HTTPException 404: If config not found
    """
    db_config = await config_repo.get_by_characteristic(char_id)
    if db_config is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Config for characteristic {char_id} not found",
        )

    await session.delete(db_config)
    await session.commit()
