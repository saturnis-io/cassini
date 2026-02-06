---
phase: plant-scoped-config
plan: 3
type: execute
wave: 2
depends_on: [1, 2]
files_modified:
  - backend/src/openspc/db/repositories/hierarchy.py
  - backend/src/openspc/db/repositories/broker.py
  - backend/src/openspc/api/v1/hierarchy.py
  - backend/src/openspc/api/v1/brokers.py
  - backend/src/openspc/main.py
autonomous: true
must_haves:
  truths:
    - "User can GET /api/v1/plants/{plantId}/hierarchies to list plant's hierarchies"
    - "User can POST /api/v1/plants/{plantId}/hierarchies to create hierarchy in plant"
    - "User can GET /api/v1/plants/{plantId}/brokers to list plant's brokers"
    - "User can POST /api/v1/plants/{plantId}/brokers to create broker in plant"
    - "Legacy endpoints still work for backward compatibility"
  artifacts:
    - "backend/src/openspc/api/v1/hierarchy.py has plant-scoped endpoints"
    - "backend/src/openspc/api/v1/brokers.py has plant-scoped endpoints"
  key_links:
    - "HierarchyRepository.get_tree accepts optional plant_id filter"
    - "BrokerRepository methods accept optional plant_id filter"
---

# Phase plant-scoped-config - Plan 3: Plant-Scoped Hierarchy and Broker Endpoints

## Objective
Refactor hierarchy and broker endpoints to support plant-scoped paths while maintaining backward compatibility with legacy global endpoints.

## Tasks

<task type="auto">
  <name>Task 1: Update HierarchyRepository for Plant Filtering</name>
  <files>backend/src/openspc/db/repositories/hierarchy.py</files>
  <action>
    Update `backend/src/openspc/db/repositories/hierarchy.py` to support plant filtering:

    1. Update `get_tree()` method to accept optional `plant_id`:
       ```python
       async def get_tree(self, plant_id: Optional[int] = None) -> list[HierarchyNode]:
           """Get full hierarchy as nested tree structure, optionally filtered by plant."""
           stmt = select(Hierarchy).where(Hierarchy.parent_id.is_(None))
           if plant_id is not None:
               stmt = stmt.where(Hierarchy.plant_id == plant_id)
           # ... rest of existing implementation
       ```

    2. Update `create()` method to accept `plant_id`:
       ```python
       async def create(
           self,
           parent_id: Optional[int],
           name: str,
           type: str,
           plant_id: Optional[int] = None,
       ) -> Hierarchy:
           """Create a new hierarchy node."""
           node = Hierarchy(
               parent_id=parent_id,
               name=name,
               type=type,
               plant_id=plant_id,
           )
           # ... rest of implementation
       ```

    3. If parent_id is provided, inherit plant_id from parent:
       ```python
       if parent_id is not None:
           parent = await self.get_by_id(parent_id)
           if parent and parent.plant_id:
               node.plant_id = parent.plant_id
       ```

    4. Add method to get hierarchies by plant:
       ```python
       async def get_by_plant(self, plant_id: int) -> Sequence[Hierarchy]:
           """Get all hierarchies for a plant."""
           stmt = select(Hierarchy).where(Hierarchy.plant_id == plant_id)
           result = await self.session.execute(stmt)
           return result.scalars().all()
       ```
  </action>
  <verify>
    ```bash
    # Plant filtering in get_tree
    grep -q "plant_id" backend/src/openspc/db/repositories/hierarchy.py

    # Python syntax valid
    cd backend && python -c "from openspc.db.repositories.hierarchy import HierarchyRepository; print('OK')"
    ```
  </verify>
  <done>
    - get_tree() accepts optional plant_id filter
    - create() accepts plant_id parameter
    - Child nodes inherit plant_id from parent
    - get_by_plant() method added
  </done>
</task>

<task type="auto">
  <name>Task 2: Update BrokerRepository for Plant Filtering</name>
  <files>backend/src/openspc/db/repositories/broker.py</files>
  <action>
    Update `backend/src/openspc/db/repositories/broker.py` to support plant filtering:

    1. Update `get_all()` to accept optional `plant_id`:
       ```python
       async def get_all(
           self,
           active_only: bool = False,
           plant_id: Optional[int] = None,
       ) -> Sequence[MQTTBroker]:
           """Get all brokers, optionally filtered by active status and plant."""
           stmt = select(MQTTBroker)
           if active_only:
               stmt = stmt.where(MQTTBroker.is_active == True)
           if plant_id is not None:
               stmt = stmt.where(MQTTBroker.plant_id == plant_id)
           result = await self.session.execute(stmt)
           return result.scalars().all()
       ```

    2. Update `create()` to accept `plant_id`:
       ```python
       async def create(
           self,
           name: str,
           host: str,
           port: int = 1883,
           plant_id: Optional[int] = None,
           **kwargs,
       ) -> MQTTBroker:
           """Create a new MQTT broker configuration."""
           broker = MQTTBroker(
               name=name,
               host=host,
               port=port,
               plant_id=plant_id,
               **kwargs,
           )
           # ... rest of implementation
       ```

    3. Add method `get_by_plant()`:
       ```python
       async def get_by_plant(
           self,
           plant_id: int,
           active_only: bool = False,
       ) -> Sequence[MQTTBroker]:
           """Get all brokers for a plant."""
           return await self.get_all(active_only=active_only, plant_id=plant_id)
       ```
  </action>
  <verify>
    ```bash
    # Plant filtering in broker repo
    grep -q "plant_id" backend/src/openspc/db/repositories/broker.py

    # Python syntax valid
    cd backend && python -c "from openspc.db.repositories.broker import BrokerRepository; print('OK')"
    ```
  </verify>
  <done>
    - get_all() accepts optional plant_id filter
    - create() accepts plant_id parameter
    - get_by_plant() method added
  </done>
</task>

<task type="auto">
  <name>Task 3: Add Plant-Scoped Hierarchy Endpoints</name>
  <files>backend/src/openspc/api/v1/hierarchy.py, backend/src/openspc/main.py</files>
  <action>
    Update `backend/src/openspc/api/v1/hierarchy.py` to add plant-scoped endpoints:

    1. Create a new router for plant-scoped hierarchy:
       ```python
       plant_hierarchy_router = APIRouter(tags=["hierarchy"])
       ```

    2. Add plant validation dependency:
       ```python
       async def validate_plant(
           plant_id: int,
           session: AsyncSession = Depends(get_session),
       ) -> int:
           """Validate plant exists and return plant_id."""
           from openspc.db.repositories.plant import PlantRepository
           repo = PlantRepository(session)
           plant = await repo.get_by_id(plant_id)
           if plant is None:
               raise HTTPException(
                   status_code=status.HTTP_404_NOT_FOUND,
                   detail=f"Plant {plant_id} not found",
               )
           return plant_id
       ```

    3. Add plant-scoped GET hierarchy tree:
       ```python
       @plant_hierarchy_router.get("/", response_model=list[HierarchyTreeNode])
       async def get_plant_hierarchy_tree(
           plant_id: int = Depends(validate_plant),
           repo: HierarchyRepository = Depends(get_hierarchy_repo),
           session: AsyncSession = Depends(get_session),
       ) -> list[HierarchyTreeNode]:
           """Get hierarchy tree for a specific plant."""
           tree = await repo.get_tree(plant_id=plant_id)
           # ... same tree building logic
       ```

    4. Add plant-scoped POST create hierarchy:
       ```python
       @plant_hierarchy_router.post("/", response_model=HierarchyResponse, status_code=status.HTTP_201_CREATED)
       async def create_plant_hierarchy_node(
           data: HierarchyCreate,
           plant_id: int = Depends(validate_plant),
           repo: HierarchyRepository = Depends(get_hierarchy_repo),
       ) -> HierarchyResponse:
           """Create a hierarchy node in a specific plant."""
           node = await repo.create(
               parent_id=data.parent_id,
               name=data.name,
               type=data.type,
               plant_id=plant_id,
           )
           return HierarchyResponse.model_validate(node)
       ```

    5. Export both routers from the module.

    Update `backend/src/openspc/main.py`:
    - Import plant_hierarchy_router
    - Register at: `app.include_router(plant_hierarchy_router, prefix="/api/v1/plants/{plant_id}/hierarchies")`
    - Keep existing hierarchy_router at `/api/v1/hierarchy` for backward compatibility
  </action>
  <verify>
    ```bash
    # Plant hierarchy router exists
    grep -q "plant_hierarchy_router" backend/src/openspc/api/v1/hierarchy.py

    # Registered in main
    grep -q "plant_hierarchy_router" backend/src/openspc/main.py

    # Python syntax valid
    cd backend && python -c "from openspc.api.v1.hierarchy import router, plant_hierarchy_router; print('OK')"
    ```
  </verify>
  <done>
    - Plant-scoped hierarchy endpoints at /api/v1/plants/{plantId}/hierarchies
    - Plant validation dependency
    - GET tree, POST create endpoints
    - Legacy endpoints preserved at /api/v1/hierarchy
    - Router registered in main.py
  </done>
</task>

## Completion Criteria

Plan is complete when:
- [ ] HierarchyRepository supports plant filtering
- [ ] BrokerRepository supports plant filtering
- [ ] Plant-scoped hierarchy endpoints functional
- [ ] Legacy endpoints still work
- [ ] Atomic commit created
