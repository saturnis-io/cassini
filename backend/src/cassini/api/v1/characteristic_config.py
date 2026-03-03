"""API endpoints for characteristic configuration."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from cassini.api.deps import (
    check_plant_role,
    get_characteristic_repo as get_char_repo,
    get_current_user,
    get_current_engineer,
    get_db_session,
    resolve_plant_id_for_characteristic,
)
from cassini.db.models.user import User
from cassini.api.schemas.characteristic_config import (
    CharacteristicConfigResponse,
    CharacteristicConfigUpdate,
)
from cassini.db.repositories.characteristic import CharacteristicRepository
from cassini.db.repositories.characteristic_config import CharacteristicConfigRepository

router = APIRouter(prefix="/api/v1/characteristics", tags=["characteristic-config"])


async def get_config_repo(
    session: AsyncSession = Depends(get_db_session),
) -> CharacteristicConfigRepository:
    """Get characteristic config repository instance."""
    return CharacteristicConfigRepository(session)


@router.get("/{char_id}/config", response_model=CharacteristicConfigResponse | None)
async def get_characteristic_config(
    char_id: int,
    session: AsyncSession = Depends(get_db_session),
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
    # Plant-scoped authorization
    plant_id = await resolve_plant_id_for_characteristic(char_id, session)
    check_plant_role(_user, plant_id, "operator")

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
    # Plant-scoped authorization
    plant_id = await resolve_plant_id_for_characteristic(char_id, session)
    check_plant_role(_user, plant_id, "engineer")

    # Verify characteristic exists (with data_source loaded)
    char = await char_repo.get_with_data_source(char_id)
    if char is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Characteristic {char_id} not found",
        )

    # Validate config type matches characteristic data source
    config = data.config
    has_data_source = char.data_source is not None
    if not has_data_source and config.config_type != "MANUAL":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Manual characteristic requires ManualConfig",
        )
    if has_data_source and config.config_type != "TAG":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Data source characteristic requires TagConfig",
        )

    db_config = await config_repo.upsert(char_id, config)
    await session.commit()

    return CharacteristicConfigResponse(
        characteristic_id=char_id,
        config=config,
        is_active=db_config.is_active,
    )


@router.delete("/{char_id}/config", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
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
    # Plant-scoped authorization
    plant_id = await resolve_plant_id_for_characteristic(char_id, session)
    check_plant_role(_user, plant_id, "engineer")

    db_config = await config_repo.get_by_characteristic(char_id)
    if db_config is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Config for characteristic {char_id} not found",
        )

    await session.delete(db_config)
    await session.commit()
