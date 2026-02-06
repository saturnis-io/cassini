---
phase: plant-scoped-config
plan: 2
type: execute
wave: 1
depends_on: [1]
files_modified:
  - backend/src/openspc/api/schemas/plant.py
  - backend/src/openspc/api/schemas/__init__.py
  - backend/src/openspc/db/repositories/plant.py
  - backend/src/openspc/db/repositories/__init__.py
  - backend/src/openspc/api/v1/plants.py
  - backend/src/openspc/main.py
autonomous: true
must_haves:
  truths:
    - "User can GET /api/v1/plants to list all plants"
    - "User can POST /api/v1/plants to create a new plant"
    - "User can GET /api/v1/plants/{plantId} to get plant details"
    - "User can PUT /api/v1/plants/{plantId} to update a plant"
    - "User can DELETE /api/v1/plants/{plantId} to delete a plant"
  artifacts:
    - "backend/src/openspc/api/schemas/plant.py exists with PlantCreate, PlantUpdate, PlantResponse"
    - "backend/src/openspc/db/repositories/plant.py exists with PlantRepository"
    - "backend/src/openspc/api/v1/plants.py exists with CRUD endpoints"
  key_links:
    - "Plants router registered in main.py"
    - "PlantRepository uses AsyncSession"
---

# Phase plant-scoped-config - Plan 2: Plant CRUD API

## Objective
Implement Plant CRUD endpoints with repository pattern, enabling creation and management of plants.

## Tasks

<task type="auto">
  <name>Task 1: Create Plant Schemas</name>
  <files>backend/src/openspc/api/schemas/plant.py, backend/src/openspc/api/schemas/__init__.py</files>
  <action>
    Create Pydantic schemas in `backend/src/openspc/api/schemas/plant.py`:

    ```python
    """Plant API schemas."""
    from datetime import datetime
    from typing import Any, Optional

    from pydantic import BaseModel, Field


    class PlantCreate(BaseModel):
        """Schema for creating a new plant."""
        name: str = Field(..., min_length=1, max_length=100)
        code: str = Field(..., min_length=1, max_length=10, pattern=r'^[A-Z0-9_-]+$')
        is_active: bool = True
        settings: Optional[dict[str, Any]] = None


    class PlantUpdate(BaseModel):
        """Schema for updating a plant."""
        name: Optional[str] = Field(None, min_length=1, max_length=100)
        code: Optional[str] = Field(None, min_length=1, max_length=10, pattern=r'^[A-Z0-9_-]+$')
        is_active: Optional[bool] = None
        settings: Optional[dict[str, Any]] = None


    class PlantResponse(BaseModel):
        """Schema for plant response."""
        id: int
        name: str
        code: str
        is_active: bool
        settings: Optional[dict[str, Any]] = None
        created_at: datetime
        updated_at: datetime

        model_config = {"from_attributes": True}
    ```

    Update `backend/src/openspc/api/schemas/__init__.py`:
    - Add imports for PlantCreate, PlantUpdate, PlantResponse
  </action>
  <verify>
    ```bash
    # File exists with schemas
    grep -q "class PlantCreate" backend/src/openspc/api/schemas/plant.py
    grep -q "class PlantResponse" backend/src/openspc/api/schemas/plant.py

    # Python syntax valid
    cd backend && python -c "from openspc.api.schemas.plant import PlantCreate, PlantUpdate, PlantResponse; print('OK')"
    ```
  </verify>
  <done>
    - PlantCreate schema with name, code, is_active, settings
    - PlantUpdate schema with optional fields
    - PlantResponse schema with all fields including timestamps
    - Exports added to __init__.py
  </done>
</task>

<task type="auto">
  <name>Task 2: Create Plant Repository</name>
  <files>backend/src/openspc/db/repositories/plant.py, backend/src/openspc/db/repositories/__init__.py</files>
  <action>
    Create repository in `backend/src/openspc/db/repositories/plant.py`:

    ```python
    """Plant repository for database operations."""
    from typing import Optional, Sequence

    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import AsyncSession

    from openspc.db.models.plant import Plant


    class PlantRepository:
        """Repository for Plant CRUD operations."""

        def __init__(self, session: AsyncSession):
            self.session = session

        async def get_all(self, active_only: bool = False) -> Sequence[Plant]:
            """Get all plants, optionally filtered by active status."""
            stmt = select(Plant)
            if active_only:
                stmt = stmt.where(Plant.is_active == True)
            stmt = stmt.order_by(Plant.name)
            result = await self.session.execute(stmt)
            return result.scalars().all()

        async def get_by_id(self, plant_id: int) -> Optional[Plant]:
            """Get a plant by ID."""
            stmt = select(Plant).where(Plant.id == plant_id)
            result = await self.session.execute(stmt)
            return result.scalar_one_or_none()

        async def get_by_code(self, code: str) -> Optional[Plant]:
            """Get a plant by code."""
            stmt = select(Plant).where(Plant.code == code)
            result = await self.session.execute(stmt)
            return result.scalar_one_or_none()

        async def create(
            self,
            name: str,
            code: str,
            is_active: bool = True,
            settings: Optional[dict] = None,
        ) -> Plant:
            """Create a new plant."""
            plant = Plant(
                name=name,
                code=code.upper(),
                is_active=is_active,
                settings=settings,
            )
            self.session.add(plant)
            await self.session.commit()
            await self.session.refresh(plant)
            return plant

        async def update(self, plant_id: int, **kwargs) -> Optional[Plant]:
            """Update a plant."""
            plant = await self.get_by_id(plant_id)
            if plant is None:
                return None

            for key, value in kwargs.items():
                if hasattr(plant, key) and value is not None:
                    if key == 'code':
                        value = value.upper()
                    setattr(plant, key, value)

            await self.session.commit()
            await self.session.refresh(plant)
            return plant

        async def delete(self, plant_id: int) -> bool:
            """Delete a plant. Returns True if deleted, False if not found."""
            plant = await self.get_by_id(plant_id)
            if plant is None:
                return False

            await self.session.delete(plant)
            await self.session.commit()
            return True
    ```

    Update `backend/src/openspc/db/repositories/__init__.py`:
    - Add import and export for PlantRepository
  </action>
  <verify>
    ```bash
    # Repository exists
    grep -q "class PlantRepository" backend/src/openspc/db/repositories/plant.py

    # Exported
    grep -q "PlantRepository" backend/src/openspc/db/repositories/__init__.py

    # Python syntax valid
    cd backend && python -c "from openspc.db.repositories.plant import PlantRepository; print('OK')"
    ```
  </verify>
  <done>
    - PlantRepository with get_all, get_by_id, get_by_code, create, update, delete
    - Repository exported from __init__.py
    - Follows existing repository patterns
  </done>
</task>

<task type="auto">
  <name>Task 3: Create Plant API Endpoints</name>
  <files>backend/src/openspc/api/v1/plants.py, backend/src/openspc/main.py</files>
  <action>
    Create endpoints in `backend/src/openspc/api/v1/plants.py`:

    ```python
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
        """List all plants."""
        plants = await repo.get_all(active_only=active_only)
        return [PlantResponse.model_validate(p) for p in plants]


    @router.post("/", response_model=PlantResponse, status_code=status.HTTP_201_CREATED)
    async def create_plant(
        data: PlantCreate,
        repo: PlantRepository = Depends(get_plant_repo),
    ) -> PlantResponse:
        """Create a new plant."""
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
        """Get a plant by ID."""
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
        """Update a plant."""
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
        """Delete a plant."""
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
    ```

    Update `backend/src/openspc/main.py`:
    - Import plants router: `from openspc.api.v1.plants import router as plants_router`
    - Register router: `app.include_router(plants_router)`
  </action>
  <verify>
    ```bash
    # Endpoints file exists
    grep -q "@router.get" backend/src/openspc/api/v1/plants.py

    # Router registered in main
    grep -q "plants_router" backend/src/openspc/main.py

    # Start server briefly to test
    cd backend && timeout 5 python -m uvicorn openspc.main:app --port 8099 || true

    # Or just validate imports
    cd backend && python -c "from openspc.api.v1.plants import router; print('OK')"
    ```
  </verify>
  <done>
    - Plant CRUD endpoints at /api/v1/plants
    - GET / - List plants
    - POST / - Create plant
    - GET /{plant_id} - Get plant
    - PUT /{plant_id} - Update plant
    - DELETE /{plant_id} - Delete plant (except Default)
    - Router registered in main.py
  </done>
</task>

## Completion Criteria

Plan is complete when:
- [ ] Plant schemas created with validation
- [ ] PlantRepository implements CRUD operations
- [ ] Plant API endpoints functional
- [ ] Router registered in main.py
- [ ] Cannot delete Default plant
- [ ] Atomic commit created
