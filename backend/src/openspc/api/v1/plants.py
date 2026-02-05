"""Plant REST API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from openspc.api.schemas.plant import PlantCreate, PlantResponse, PlantUpdate
from openspc.db.database import get_session
from openspc.db.repositories.plant import PlantRepository

router = APIRouter(prefix="/api/v1/plants", tags=["plants"])


async def get_plant_repo(
    session: AsyncSession = Depends(get_session),
) -> PlantRepository:
    """Dependency to get PlantRepository instance."""
    return PlantRepository(session)


@router.get("/", response_model=list[PlantResponse])
async def list_plants(
    active_only: bool = Query(False, description="Only return active plants"),
    repo: PlantRepository = Depends(get_plant_repo),
) -> list[PlantResponse]:
    """List all plants.

    Returns all plants in the system, optionally filtered to only active ones.
    """
    plants = await repo.get_all(active_only=active_only)
    return [PlantResponse.model_validate(p) for p in plants]


@router.post("/", response_model=PlantResponse, status_code=status.HTTP_201_CREATED)
async def create_plant(
    data: PlantCreate,
    repo: PlantRepository = Depends(get_plant_repo),
) -> PlantResponse:
    """Create a new plant.

    Creates a new plant/site for data isolation. The code is automatically
    uppercased and must be unique.
    """
    try:
        plant = await repo.create(
            name=data.name,
            code=data.code,
            is_active=data.is_active,
            settings=data.settings,
        )
        return PlantResponse.model_validate(plant)
    except IntegrityError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Plant with this name or code already exists",
        )


@router.get("/{plant_id}", response_model=PlantResponse)
async def get_plant(
    plant_id: int,
    repo: PlantRepository = Depends(get_plant_repo),
) -> PlantResponse:
    """Get a plant by ID.

    Returns details for a specific plant.
    """
    plant = await repo.get_by_id(plant_id)
    if plant is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Plant {plant_id} not found",
        )
    return PlantResponse.model_validate(plant)


@router.put("/{plant_id}", response_model=PlantResponse)
async def update_plant(
    plant_id: int,
    data: PlantUpdate,
    repo: PlantRepository = Depends(get_plant_repo),
) -> PlantResponse:
    """Update a plant.

    Updates plant details. All fields are optional; only provided fields are updated.
    """
    update_data = data.model_dump(exclude_unset=True)
    if not update_data:
        plant = await repo.get_by_id(plant_id)
        if plant is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Plant {plant_id} not found",
            )
        return PlantResponse.model_validate(plant)

    try:
        plant = await repo.update(plant_id, **update_data)
        if plant is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Plant {plant_id} not found",
            )
        return PlantResponse.model_validate(plant)
    except IntegrityError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Plant with this name or code already exists",
        )


@router.delete("/{plant_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_plant(
    plant_id: int,
    repo: PlantRepository = Depends(get_plant_repo),
) -> None:
    """Delete a plant.

    Deletes a plant. The Default plant cannot be deleted.
    """
    # Check if it's the Default plant
    plant = await repo.get_by_id(plant_id)
    if plant is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Plant {plant_id} not found",
        )

    if plant.code == "DEFAULT":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete the Default plant",
        )

    success = await repo.delete(plant_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Plant {plant_id} not found",
        )
