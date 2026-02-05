---
phase: 2-high-priority
plan: 3
type: execute
wave: 1
depends_on: []
files_modified:
  - backend/src/openspc/db/models/api_key.py
  - backend/src/openspc/api/schemas/data_entry.py
  - backend/src/openspc/core/auth/api_key.py
  - backend/src/openspc/api/v1/data_entry.py
  - backend/src/openspc/api/v1/__init__.py
  - backend/src/openspc/db/models/__init__.py
autonomous: true
must_haves:
  truths:
    - "External systems can POST samples via /api/v1/data-entry/submit with API key"
    - "Invalid or missing API key returns 401 Unauthorized"
    - "Successful submission returns sample ID, mean, zone, violations"
    - "Batch submission endpoint accepts multiple samples"
  artifacts:
    - "backend/src/openspc/db/models/api_key.py exists with APIKey model"
    - "backend/src/openspc/api/v1/data_entry.py exists with endpoints"
    - "backend/src/openspc/core/auth/api_key.py exists with auth dependency"
    - "Router registered in __init__.py"
  key_links:
    - "Data entry uses SPCEngine.process_sample() for processing"
    - "API key auth via X-API-Key header"
    - "Response format matches existing SampleProcessingResult"
---

# Phase 2 High Priority - Plan 3: API Data Entry Endpoint

## Objective

Create a REST API endpoint for programmatic data submission with API key authentication.

## Tasks

<task type="auto">
  <name>Task 1: Create APIKey database model</name>
  <files>backend/src/openspc/db/models/api_key.py, backend/src/openspc/db/models/__init__.py</files>
  <action>
    Create the APIKey model for storing API keys:

    1. Create `backend/src/openspc/db/models/api_key.py`:
       ```python
       """API Key model for external data entry authentication."""

       from datetime import datetime
       from typing import Optional
       import uuid

       from sqlalchemy import Boolean, DateTime, Integer, String, JSON
       from sqlalchemy.dialects.postgresql import UUID
       from sqlalchemy.orm import Mapped, mapped_column

       from openspc.db.database import Base


       class APIKey(Base):
           """API key for authenticating external data entry requests.

           Attributes:
               id: Unique identifier (UUID)
               name: Human-readable name for the key
               key_hash: Bcrypt hash of the API key
               created_at: When the key was created
               expires_at: Optional expiration timestamp
               permissions: JSON list of characteristic IDs or "all"
               rate_limit_per_minute: Max requests per minute
               is_active: Whether the key is currently active
               last_used_at: When the key was last used
           """
           __tablename__ = "api_keys"

           id: Mapped[str] = mapped_column(
               String(36),
               primary_key=True,
               default=lambda: str(uuid.uuid4())
           )
           name: Mapped[str] = mapped_column(String(255), nullable=False)
           key_hash: Mapped[str] = mapped_column(String(255), nullable=False)
           created_at: Mapped[datetime] = mapped_column(
               DateTime,
               default=datetime.utcnow,
               nullable=False
           )
           expires_at: Mapped[Optional[datetime]] = mapped_column(
               DateTime,
               nullable=True
           )
           permissions: Mapped[dict] = mapped_column(
               JSON,
               default={"characteristics": "all"},
               nullable=False
           )
           rate_limit_per_minute: Mapped[int] = mapped_column(
               Integer,
               default=60,
               nullable=False
           )
           is_active: Mapped[bool] = mapped_column(
               Boolean,
               default=True,
               nullable=False
           )
           last_used_at: Mapped[Optional[datetime]] = mapped_column(
               DateTime,
               nullable=True
           )

           def is_expired(self) -> bool:
               """Check if the API key has expired."""
               if self.expires_at is None:
                   return False
               return datetime.utcnow() > self.expires_at

           def can_access_characteristic(self, char_id: int) -> bool:
               """Check if key has permission for characteristic."""
               chars = self.permissions.get("characteristics", "all")
               if chars == "all":
                   return True
               return char_id in chars
       ```

    2. Update `backend/src/openspc/db/models/__init__.py` to export APIKey:
       - Add import: `from openspc.db.models.api_key import APIKey`
       - Add to `__all__` list

    Constraints:
    - Use SQLAlchemy 2.0 mapped_column syntax
    - Store key hash, never plain key
    - JSON permissions for flexibility
    - Follow existing model patterns
  </action>
  <verify>
    ```powershell
    # Model file exists
    Test-Path "backend/src/openspc/db/models/api_key.py"

    # Contains class
    Select-String -Path "backend/src/openspc/db/models/api_key.py" -Pattern "class APIKey"

    # Exported in __init__
    Select-String -Path "backend/src/openspc/db/models/__init__.py" -Pattern "APIKey"
    ```
  </verify>
  <done>
    - File exists at backend/src/openspc/db/models/api_key.py
    - APIKey class with all required fields
    - Helper methods for expiration and permission checks
    - Exported in models __init__.py
  </done>
</task>

<task type="auto">
  <name>Task 2: Create API key authentication dependency</name>
  <files>backend/src/openspc/core/auth/api_key.py</files>
  <action>
    Create authentication module for API key validation:

    1. Create directory if needed: `backend/src/openspc/core/auth/`
    2. Create `__init__.py` in auth directory
    3. Create `api_key.py`:

       ```python
       """API key authentication for data entry endpoints."""

       from datetime import datetime
       from typing import Optional

       import bcrypt
       from fastapi import Depends, Header, HTTPException, status
       from sqlalchemy import select
       from sqlalchemy.ext.asyncio import AsyncSession

       from openspc.db.database import get_session
       from openspc.db.models.api_key import APIKey


       class APIKeyAuth:
           """API key authentication handler."""

           @staticmethod
           def hash_key(plain_key: str) -> str:
               """Hash an API key using bcrypt."""
               return bcrypt.hashpw(
                   plain_key.encode('utf-8'),
                   bcrypt.gensalt()
               ).decode('utf-8')

           @staticmethod
           def verify_key(plain_key: str, hashed_key: str) -> bool:
               """Verify a plain key against its hash."""
               return bcrypt.checkpw(
                   plain_key.encode('utf-8'),
                   hashed_key.encode('utf-8')
               )

           @staticmethod
           def generate_key() -> str:
               """Generate a new random API key."""
               import secrets
               return f"openspc_{secrets.token_urlsafe(32)}"


       async def verify_api_key(
           x_api_key: str = Header(..., alias="X-API-Key"),
           session: AsyncSession = Depends(get_session),
       ) -> APIKey:
           """FastAPI dependency to verify API key from header.

           Args:
               x_api_key: API key from X-API-Key header
               session: Database session

           Returns:
               APIKey object if valid

           Raises:
               HTTPException: 401 if key is invalid, expired, or inactive
           """
           # Query all active keys (we need to check hash against each)
           stmt = select(APIKey).where(APIKey.is_active == True)
           result = await session.execute(stmt)
           api_keys = result.scalars().all()

           # Find matching key
           matched_key: Optional[APIKey] = None
           for api_key in api_keys:
               if APIKeyAuth.verify_key(x_api_key, api_key.key_hash):
                   matched_key = api_key
                   break

           if matched_key is None:
               raise HTTPException(
                   status_code=status.HTTP_401_UNAUTHORIZED,
                   detail="Invalid API key",
                   headers={"WWW-Authenticate": "ApiKey"},
               )

           # Check expiration
           if matched_key.is_expired():
               raise HTTPException(
                   status_code=status.HTTP_401_UNAUTHORIZED,
                   detail="API key has expired",
                   headers={"WWW-Authenticate": "ApiKey"},
               )

           # Update last_used_at
           matched_key.last_used_at = datetime.utcnow()
           await session.flush()

           return matched_key


       def require_characteristic_permission(char_id: int):
           """Factory for dependency that checks characteristic permission.

           Usage:
               @router.post("/")
               async def endpoint(
                   api_key: APIKey = Depends(verify_api_key),
                   _: None = Depends(require_characteristic_permission(char_id)),
               ):
           """
           async def check_permission(api_key: APIKey = Depends(verify_api_key)):
               if not api_key.can_access_characteristic(char_id):
                   raise HTTPException(
                       status_code=status.HTTP_403_FORBIDDEN,
                       detail=f"API key does not have permission for characteristic {char_id}"
                   )
           return check_permission
       ```

    4. Create `__init__.py`:
       ```python
       from openspc.core.auth.api_key import APIKeyAuth, verify_api_key

       __all__ = ["APIKeyAuth", "verify_api_key"]
       ```

    Constraints:
    - Use bcrypt for secure hashing
    - Return 401 for auth failures
    - Update last_used_at on successful auth
    - Follow existing dependency injection patterns
  </action>
  <verify>
    ```powershell
    # Files exist
    Test-Path "backend/src/openspc/core/auth/__init__.py"
    Test-Path "backend/src/openspc/core/auth/api_key.py"

    # Contains key functions
    Select-String -Path "backend/src/openspc/core/auth/api_key.py" -Pattern "verify_api_key"
    Select-String -Path "backend/src/openspc/core/auth/api_key.py" -Pattern "APIKeyAuth"
    ```
  </verify>
  <done>
    - Auth module exists at backend/src/openspc/core/auth/
    - APIKeyAuth class with hash/verify/generate methods
    - verify_api_key dependency for FastAPI
    - Checks key validity, expiration, and permissions
  </done>
</task>

<task type="auto">
  <name>Task 3: Create data entry schemas and endpoints</name>
  <files>backend/src/openspc/api/schemas/data_entry.py, backend/src/openspc/api/v1/data_entry.py, backend/src/openspc/api/v1/__init__.py</files>
  <action>
    Create schemas and router for data entry:

    1. Create `backend/src/openspc/api/schemas/data_entry.py`:
       ```python
       """Data entry API schemas."""

       from datetime import datetime
       from typing import Optional

       from pydantic import BaseModel, Field


       class DataEntryRequest(BaseModel):
           """Request to submit a single sample via API."""
           characteristic_id: int = Field(..., description="ID of the characteristic")
           measurements: list[float] = Field(..., description="List of measurement values")
           timestamp: Optional[datetime] = Field(None, description="Sample timestamp (defaults to now)")
           batch_number: Optional[str] = Field(None, description="Batch identifier")
           operator_id: Optional[str] = Field(None, description="Operator identifier")
           metadata: Optional[dict] = Field(None, description="Additional metadata")


       class DataEntryResponse(BaseModel):
           """Response from successful sample submission."""
           sample_id: int
           characteristic_id: int
           timestamp: datetime
           mean: float
           range_value: Optional[float]
           zone: str
           in_control: bool
           violations: list[dict] = Field(default_factory=list)


       class BatchEntryRequest(BaseModel):
           """Request to submit multiple samples."""
           samples: list[DataEntryRequest]


       class BatchEntryResponse(BaseModel):
           """Response from batch submission."""
           total: int
           successful: int
           failed: int
           results: list[DataEntryResponse]
           errors: list[str]


       class SchemaResponse(BaseModel):
           """API schema information response."""
           single_sample: dict
           batch_sample: dict
           authentication: dict
       ```

    2. Create `backend/src/openspc/api/v1/data_entry.py`:
       ```python
       """Data entry REST endpoints for external systems."""

       from datetime import datetime

       from fastapi import APIRouter, Depends, HTTPException, status
       from sqlalchemy.ext.asyncio import AsyncSession

       from openspc.api.schemas.data_entry import (
           DataEntryRequest,
           DataEntryResponse,
           BatchEntryRequest,
           BatchEntryResponse,
           SchemaResponse,
       )
       from openspc.core.auth.api_key import verify_api_key
       from openspc.core.engine.nelson_rules import NelsonRuleLibrary
       from openspc.core.engine.rolling_window import RollingWindowManager
       from openspc.core.engine.spc_engine import SPCEngine
       from openspc.core.providers.protocol import SampleContext
       from openspc.db.database import get_session
       from openspc.db.models.api_key import APIKey
       from openspc.db.repositories import (
           CharacteristicRepository,
           SampleRepository,
           ViolationRepository,
       )

       router = APIRouter(prefix="/api/v1/data-entry", tags=["data-entry"])


       async def get_spc_engine(session: AsyncSession) -> SPCEngine:
           """Create SPC engine instance."""
           sample_repo = SampleRepository(session)
           char_repo = CharacteristicRepository(session)
           violation_repo = ViolationRepository(session)
           window_manager = RollingWindowManager(sample_repo)
           rule_library = NelsonRuleLibrary()
           return SPCEngine(
               sample_repo=sample_repo,
               char_repo=char_repo,
               violation_repo=violation_repo,
               window_manager=window_manager,
               rule_library=rule_library,
           )


       @router.post("/submit", response_model=DataEntryResponse, status_code=status.HTTP_201_CREATED)
       async def submit_sample(
           data: DataEntryRequest,
           api_key: APIKey = Depends(verify_api_key),
           session: AsyncSession = Depends(get_session),
       ) -> DataEntryResponse:
           """Submit a single sample from external system.

           Requires valid API key in X-API-Key header.
           """
           # Check permission for this characteristic
           if not api_key.can_access_characteristic(data.characteristic_id):
               raise HTTPException(
                   status_code=status.HTTP_403_FORBIDDEN,
                   detail=f"API key does not have permission for characteristic {data.characteristic_id}"
               )

           engine = await get_spc_engine(session)

           try:
               context = SampleContext(
                   batch_number=data.batch_number,
                   operator_id=data.operator_id,
                   source="API",
                   metadata=data.metadata,
               )

               result = await engine.process_sample(
                   characteristic_id=data.characteristic_id,
                   measurements=data.measurements,
                   context=context,
                   timestamp=data.timestamp,
               )

               await session.commit()

               # Get violations
               violation_repo = ViolationRepository(session)
               violations = await violation_repo.get_by_sample(result.sample_id)

               return DataEntryResponse(
                   sample_id=result.sample_id,
                   characteristic_id=data.characteristic_id,
                   timestamp=result.timestamp,
                   mean=result.mean,
                   range_value=result.range_value,
                   zone=result.zone,
                   in_control=result.in_control,
                   violations=[
                       {"rule_id": v.rule_id, "rule_name": v.rule_name, "severity": v.severity}
                       for v in violations
                   ],
               )

           except ValueError as e:
               await session.rollback()
               raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
           except Exception as e:
               await session.rollback()
               raise HTTPException(
                   status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                   detail=f"Failed to process sample: {str(e)}"
               )


       @router.post("/batch", response_model=BatchEntryResponse, status_code=status.HTTP_201_CREATED)
       async def submit_batch(
           data: BatchEntryRequest,
           api_key: APIKey = Depends(verify_api_key),
           session: AsyncSession = Depends(get_session),
       ) -> BatchEntryResponse:
           """Submit multiple samples in a single request.

           Requires valid API key in X-API-Key header.
           Processes each sample independently - failures don't affect other samples.
           """
           engine = await get_spc_engine(session)
           results: list[DataEntryResponse] = []
           errors: list[str] = []

           for idx, sample in enumerate(data.samples):
               # Check permission
               if not api_key.can_access_characteristic(sample.characteristic_id):
                   errors.append(f"Sample {idx}: No permission for characteristic {sample.characteristic_id}")
                   continue

               try:
                   context = SampleContext(
                       batch_number=sample.batch_number,
                       operator_id=sample.operator_id,
                       source="API",
                       metadata=sample.metadata,
                   )

                   result = await engine.process_sample(
                       characteristic_id=sample.characteristic_id,
                       measurements=sample.measurements,
                       context=context,
                       timestamp=sample.timestamp,
                   )

                   violation_repo = ViolationRepository(session)
                   violations = await violation_repo.get_by_sample(result.sample_id)

                   results.append(DataEntryResponse(
                       sample_id=result.sample_id,
                       characteristic_id=sample.characteristic_id,
                       timestamp=result.timestamp,
                       mean=result.mean,
                       range_value=result.range_value,
                       zone=result.zone,
                       in_control=result.in_control,
                       violations=[
                           {"rule_id": v.rule_id, "rule_name": v.rule_name, "severity": v.severity}
                           for v in violations
                       ],
                   ))

               except Exception as e:
                   errors.append(f"Sample {idx}: {str(e)}")

           await session.commit()

           return BatchEntryResponse(
               total=len(data.samples),
               successful=len(results),
               failed=len(errors),
               results=results,
               errors=errors,
           )


       @router.get("/schema", response_model=SchemaResponse)
       async def get_schema() -> SchemaResponse:
           """Get the expected request/response schema for data entry.

           This endpoint does not require authentication.
           """
           return SchemaResponse(
               single_sample={
                   "endpoint": "POST /api/v1/data-entry/submit",
                   "request": DataEntryRequest.model_json_schema(),
                   "response": DataEntryResponse.model_json_schema(),
               },
               batch_sample={
                   "endpoint": "POST /api/v1/data-entry/batch",
                   "request": BatchEntryRequest.model_json_schema(),
                   "response": BatchEntryResponse.model_json_schema(),
               },
               authentication={
                   "method": "API Key",
                   "header": "X-API-Key",
                   "description": "Include your API key in the X-API-Key header"
               },
           )
       ```

    3. Register router in `backend/src/openspc/api/v1/__init__.py`:
       - Add import: `from openspc.api.v1.data_entry import router as data_entry_router`
       - Add to router list or include in main router

    Constraints:
    - Follow existing samples.py patterns
    - Use same SPCEngine flow as manual entry
    - Schema endpoint doesn't require auth
    - Return meaningful error messages
  </action>
  <verify>
    ```powershell
    # Schema file exists
    Test-Path "backend/src/openspc/api/schemas/data_entry.py"

    # Router file exists
    Test-Path "backend/src/openspc/api/v1/data_entry.py"

    # Contains endpoints
    Select-String -Path "backend/src/openspc/api/v1/data_entry.py" -Pattern "submit_sample"
    Select-String -Path "backend/src/openspc/api/v1/data_entry.py" -Pattern "submit_batch"
    Select-String -Path "backend/src/openspc/api/v1/data_entry.py" -Pattern "get_schema"

    # Router registered
    Select-String -Path "backend/src/openspc/api/v1/__init__.py" -Pattern "data_entry"
    ```
  </verify>
  <done>
    - Schema file exists with request/response models
    - Router file exists with 3 endpoints
    - POST /submit endpoint for single sample
    - POST /batch endpoint for multiple samples
    - GET /schema endpoint (no auth required)
    - Router registered in __init__.py
    - All endpoints use API key authentication
  </done>
</task>

## Completion Criteria

Plan is complete when:
- [ ] All tasks marked done
- [ ] All verify commands pass
- [ ] Backend starts without import errors
- [ ] /api/v1/data-entry/schema returns schema (no auth)
- [ ] /api/v1/data-entry/submit returns 401 without API key
- [ ] Atomic commit created with message: "feat: add API data entry endpoint with key authentication"
- [ ] SUMMARY.md updated
