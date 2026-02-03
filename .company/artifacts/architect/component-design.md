# OpenSPC Component Design

## Document Information
- **Project:** OpenSPC - Event-Driven Statistical Process Control System
- **Author:** Solutions Architect, Virtual Engineering Co.
- **Date:** 2026-02-02
- **Status:** Design Complete

---

## 1. Python Module Structure

```
src/
└── openspc/
    ├── __init__.py
    ├── main.py                      # FastAPI application entry point
    ├── config.py                    # Settings and configuration
    │
    ├── api/                         # REST API Layer
    │   ├── __init__.py
    │   ├── dependencies.py          # FastAPI dependency injection
    │   ├── v1/
    │   │   ├── __init__.py
    │   │   ├── router.py            # API v1 router aggregation
    │   │   ├── hierarchy.py         # /api/v1/hierarchy/* endpoints
    │   │   ├── characteristics.py   # /api/v1/characteristics/* endpoints
    │   │   ├── samples.py           # /api/v1/samples/* endpoints
    │   │   ├── violations.py        # /api/v1/violations/* endpoints
    │   │   └── websocket.py         # /ws/* WebSocket handlers
    │   └── schemas/
    │       ├── __init__.py
    │       ├── hierarchy.py         # Hierarchy Pydantic models
    │       ├── characteristic.py    # Characteristic Pydantic models
    │       ├── sample.py            # Sample/Measurement Pydantic models
    │       ├── violation.py         # Violation Pydantic models
    │       └── common.py            # Shared schemas (pagination, errors)
    │
    ├── core/                        # Business Logic Layer
    │   ├── __init__.py
    │   ├── engine/
    │   │   ├── __init__.py
    │   │   ├── spc_engine.py        # Main SPC processing orchestrator
    │   │   ├── rolling_window.py    # Rolling window manager
    │   │   ├── nelson_rules.py      # Nelson Rules implementations
    │   │   └── statistics.py        # Sigma estimation, control limits
    │   ├── providers/
    │   │   ├── __init__.py
    │   │   ├── protocol.py          # Provider Protocol definition
    │   │   ├── manual_provider.py   # Manual data entry provider
    │   │   ├── tag_provider.py      # MQTT tag provider
    │   │   └── buffer.py            # Subgroup buffering logic
    │   ├── alerts/
    │   │   ├── __init__.py
    │   │   ├── alert_manager.py     # Alert orchestration
    │   │   ├── notifier.py          # Notification dispatch (WS, MQTT)
    │   │   └── workflow.py          # Acknowledgment workflow
    │   └── events/
    │       ├── __init__.py
    │       ├── event_bus.py         # Internal event dispatcher
    │       └── models.py            # Event Pydantic models
    │
    ├── db/                          # Data Access Layer
    │   ├── __init__.py
    │   ├── database.py              # SQLAlchemy engine and session
    │   ├── models/
    │   │   ├── __init__.py
    │   │   ├── hierarchy.py         # Hierarchy ORM model
    │   │   ├── characteristic.py    # Characteristic ORM model
    │   │   ├── sample.py            # Sample/Measurement ORM models
    │   │   └── violation.py         # Violation ORM model
    │   └── repositories/
    │       ├── __init__.py
    │       ├── base.py              # Base repository with CRUD
    │       ├── hierarchy_repo.py    # Hierarchy repository
    │       ├── characteristic_repo.py
    │       ├── sample_repo.py
    │       └── violation_repo.py
    │
    ├── mqtt/                        # MQTT Integration Layer
    │   ├── __init__.py
    │   ├── client.py                # aiomqtt client wrapper
    │   ├── sparkplug.py             # Sparkplug B encode/decode
    │   └── publisher.py             # SPC event publishing
    │
    └── utils/
        ├── __init__.py
        ├── constants.py             # Statistical constants (d2, c4)
        └── logging.py               # Structured logging setup
```

---

## 2. Class Diagrams

### 2.1 Provider Protocol

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            «Protocol»                                        │
│                          DataProvider                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│ + start() -> Awaitable[None]                                                │
│ + stop() -> Awaitable[None]                                                 │
│ + on_sample(callback: Callable[[SampleEvent], Awaitable[None]]) -> None     │
│ + is_running: bool                                                          │
└─────────────────────────────────────────────────────────────────────────────┘
                                      △
                                      │
                    ┌─────────────────┴─────────────────┐
                    │                                   │
    ┌───────────────┴───────────────┐   ┌──────────────┴────────────────┐
    │        ManualProvider         │   │         TagProvider           │
    ├───────────────────────────────┤   ├───────────────────────────────┤
    │ - _callback: Callable         │   │ - _client: aiomqtt.Client     │
    │ - _running: bool              │   │ - _callback: Callable         │
    ├───────────────────────────────┤   │ - _buffers: dict[int, Buffer] │
    │ + start() -> None             │   │ - _subscriptions: set[str]    │
    │ + stop() -> None              │   │ - _running: bool              │
    │ + submit_sample(              │   ├───────────────────────────────┤
    │     char_id: int,             │   │ + start() -> None             │
    │     measurements: list[float],│   │ + stop() -> None              │
    │     context: SampleContext    │   │ + subscribe(topic: str) -> None│
    │   ) -> SampleEvent            │   │ + unsubscribe(topic: str) -> None│
    │ + on_sample(callback) -> None │   │ + on_sample(callback) -> None │
    └───────────────────────────────┘   │ - _handle_message(msg) -> None│
                                        │ - _process_buffer(char_id) -> None│
                                        └───────────────────────────────┘
                                                        │
                                                        │ uses
                                                        ▼
                                        ┌───────────────────────────────┐
                                        │       SubgroupBuffer          │
                                        ├───────────────────────────────┤
                                        │ - char_id: int                │
                                        │ - subgroup_size: int          │
                                        │ - values: list[float]         │
                                        │ - timestamps: list[datetime]  │
                                        │ - timeout_seconds: float      │
                                        │ - last_value: float | None    │
                                        ├───────────────────────────────┤
                                        │ + add_value(v: float, ts: datetime)│
                                        │ + is_complete() -> bool       │
                                        │ + is_timed_out() -> bool      │
                                        │ + flush() -> list[float]      │
                                        │ + clear() -> None             │
                                        └───────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────────────┐
│                             SampleEvent                                      │
│                         (Pydantic BaseModel)                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│ + characteristic_id: int                                                    │
│ + timestamp: datetime                                                       │
│ + measurements: list[float]    # len == subgroup_size                       │
│ + context: SampleContext                                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│ + subgroup_mean() -> float                                                  │
│ + subgroup_range() -> float                                                 │
│ + subgroup_std() -> float                                                   │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                            SampleContext                                     │
│                         (Pydantic BaseModel)                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│ + batch_number: str | None                                                  │
│ + operator_id: str | None                                                   │
│ + source: Literal["TAG", "MANUAL"]                                          │
│ + metadata: dict[str, Any] = {}                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 SPC Engine

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SPCEngine                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│ - _window_manager: RollingWindowManager                                     │
│ - _rule_library: NelsonRuleLibrary                                          │
│ - _alert_manager: AlertManager                                              │
│ - _char_repo: CharacteristicRepository                                      │
│ - _sample_repo: SampleRepository                                            │
├─────────────────────────────────────────────────────────────────────────────┤
│ + process_sample(event: SampleEvent) -> ProcessingResult                    │
│ - _persist_sample(event: SampleEvent) -> Sample                             │
│ - _evaluate_rules(char: Characteristic, window: RollingWindow) -> list[Violation]│
│ - _handle_violations(violations: list[ViolationEvent]) -> None              │
└─────────────────────────────────────────────────────────────────────────────┘
           │                    │                    │
           │ uses               │ uses               │ uses
           ▼                    ▼                    ▼
┌──────────────────┐  ┌───────────────────┐  ┌──────────────────┐
│RollingWindowManager│ │ NelsonRuleLibrary │  │   AlertManager   │
└──────────────────┘  └───────────────────┘  └──────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                          ProcessingResult                                    │
│                         (Pydantic BaseModel)                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│ + sample_id: int                                                            │
│ + characteristic_id: int                                                    │
│ + in_control: bool                                                          │
│ + violations: list[ViolationSummary]                                        │
│ + statistics: SampleStatistics                                              │
│ + processing_time_ms: float                                                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Rolling Window Manager

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         RollingWindowManager                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│ - _windows: dict[int, RollingWindow]    # char_id -> window                 │
│ - _access_order: OrderedDict[int, float] # LRU tracking                     │
│ - _max_cached: int = 1000                                                   │
│ - _sample_repo: SampleRepository                                            │
│ - _lock: asyncio.Lock                                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│ + get_window(char_id: int, window_size: int = 25) -> RollingWindow          │
│ + append_sample(char_id: int, sample: WindowSample) -> None                 │
│ + invalidate(char_id: int) -> None                                          │
│ + rebuild_window(char_id: int) -> RollingWindow                             │
│ - _evict_lru() -> None                                                      │
│ - _load_from_db(char_id: int, size: int) -> list[WindowSample]              │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ manages
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            RollingWindow                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│ - _samples: deque[WindowSample]     # maxlen = window_size                  │
│ - _window_size: int                                                         │
│ - _center_line: float | None        # Cached X-bar                          │
│ - _sigma: float | None              # Cached sigma estimate                 │
│ - _dirty: bool                      # Stats need recalculation              │
├─────────────────────────────────────────────────────────────────────────────┤
│ + append(sample: WindowSample) -> WindowSample | None  # Returns evicted    │
│ + get_samples(exclude_marked: bool = True) -> list[WindowSample]            │
│ + get_zone(value: float) -> Zone                                            │
│ + mark_excluded(sample_id: int) -> None                                     │
│ + recalculate_stats() -> None                                               │
│ + center_line: float                                                        │
│ + sigma: float                                                              │
│ + ucl: float                                                                │
│ + lcl: float                                                                │
│ + zone_boundaries: ZoneBoundaries                                           │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                            WindowSample                                      │
│                         (Pydantic BaseModel)                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│ + sample_id: int                                                            │
│ + timestamp: datetime                                                       │
│ + value: float              # Subgroup mean (X-bar) or individual (I)       │
│ + range_value: float | None # Subgroup range (R) or moving range (MR)       │
│ + is_excluded: bool = False                                                 │
└─────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────┐
│           Zone             │
│          (Enum)            │
├────────────────────────────┤
│ ZONE_C = "C"  # Within 1σ  │
│ ZONE_B = "B"  # 1σ to 2σ   │
│ ZONE_A = "A"  # 2σ to 3σ   │
│ BEYOND = "X"  # Beyond 3σ  │
└────────────────────────────┘
```

### 2.4 Nelson Rules Library

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          NelsonRuleLibrary                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│ - _rules: dict[int, NelsonRule]                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│ + evaluate(window: RollingWindow, enabled_rules: set[int]) -> list[RuleViolation]│
│ + get_rule(rule_id: int) -> NelsonRule                                      │
│ + register_rule(rule: NelsonRule) -> None                                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ contains
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        «Protocol» NelsonRule                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│ + rule_id: int                                                              │
│ + name: str                                                                 │
│ + description: str                                                          │
│ + severity: Literal["WARNING", "CRITICAL"]                                  │
│ + min_samples_required: int                                                 │
│ + check(window: RollingWindow) -> RuleResult | None                         │
└─────────────────────────────────────────────────────────────────────────────┘
                                      △
                                      │
    ┌─────────────────┬───────────────┼───────────────┬─────────────────┐
    │                 │               │               │                 │
┌───┴───┐  ┌─────────┴────┐  ┌───────┴───────┐  ┌───┴────┐    (8 rules)
│Rule1  │  │   Rule2      │  │    Rule3      │  │ Rule4  │    ...
│Outlier│  │   Shift      │  │    Trend      │  │Alternator│
└───────┘  └──────────────┘  └───────────────┘  └────────┘

# Example Rule Implementation Structure:

class Rule1Outlier:
    rule_id = 1
    name = "Outlier"
    description = "One point beyond Zone A (> 3σ from Mean)"
    severity = "CRITICAL"
    min_samples_required = 1

    def check(self, window: RollingWindow) -> RuleResult | None:
        """Check if latest sample is beyond 3 sigma"""
        ...

class Rule2Shift:
    rule_id = 2
    name = "Shift"
    description = "9 points in a row on same side of center line"
    severity = "WARNING"
    min_samples_required = 9

    def check(self, window: RollingWindow) -> RuleResult | None:
        """Check for 9 consecutive points on same side"""
        ...

┌─────────────────────────────────────────────────────────────────────────────┐
│                             RuleResult                                       │
│                         (Pydantic BaseModel)                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│ + rule_id: int                                                              │
│ + rule_name: str                                                            │
│ + severity: Literal["WARNING", "CRITICAL"]                                  │
│ + triggered_at_index: int          # Position in window                     │
│ + involved_sample_ids: list[int]   # All samples that triggered rule        │
│ + details: dict[str, Any]          # Rule-specific metadata                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.5 Alert Manager

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            AlertManager                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│ - _violation_repo: ViolationRepository                                      │
│ - _notifier: AlertNotifier                                                  │
│ - _event_bus: EventBus                                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│ + create_violations(sample_id: int, rules: list[RuleResult]) -> list[Violation]│
│ + acknowledge(violation_id: int, user: str, reason: str) -> Violation       │
│ + get_active_violations(char_id: int | None = None) -> list[Violation]      │
│ + get_violation_history(char_id: int, limit: int = 100) -> list[Violation]  │
└─────────────────────────────────────────────────────────────────────────────┘
                      │                           │
                      │ uses                      │ uses
                      ▼                           ▼
    ┌─────────────────────────────┐   ┌─────────────────────────────┐
    │       AlertNotifier         │   │         EventBus            │
    ├─────────────────────────────┤   ├─────────────────────────────┤
    │ - _ws_manager: WSManager    │   │ - _subscribers: dict        │
    │ - _mqtt_publisher: Publisher│   ├─────────────────────────────┤
    ├─────────────────────────────┤   │ + publish(event: Event)     │
    │ + notify_violation(v: V)    │   │ + subscribe(type, callback) │
    │ + notify_ack(v: V)          │   │ + unsubscribe(type, callback)│
    │ + broadcast_sample(s: S)    │   └─────────────────────────────┘
    └─────────────────────────────┘
```

---

## 3. Service Layer Design with Dependency Injection

### 3.1 Dependency Container

```python
# src/openspc/api/dependencies.py

from functools import lru_cache
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession

from openspc.db.database import async_session_factory
from openspc.db.repositories import (
    HierarchyRepository,
    CharacteristicRepository,
    SampleRepository,
    ViolationRepository,
)
from openspc.core.engine import SPCEngine, RollingWindowManager, NelsonRuleLibrary
from openspc.core.alerts import AlertManager, AlertNotifier
from openspc.core.providers import ManualProvider, TagProvider


# Database Session Dependency
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Yield database session with automatic cleanup"""
    async with async_session_factory() as session:
        try:
            yield session
        finally:
            await session.close()


# Repository Dependencies
async def get_hierarchy_repo(
    db: AsyncSession = Depends(get_db)
) -> HierarchyRepository:
    return HierarchyRepository(db)


async def get_characteristic_repo(
    db: AsyncSession = Depends(get_db)
) -> CharacteristicRepository:
    return CharacteristicRepository(db)


async def get_sample_repo(
    db: AsyncSession = Depends(get_db)
) -> SampleRepository:
    return SampleRepository(db)


async def get_violation_repo(
    db: AsyncSession = Depends(get_db)
) -> ViolationRepository:
    return ViolationRepository(db)


# Service Layer Singletons (Application Lifespan)
@lru_cache()
def get_rolling_window_manager() -> RollingWindowManager:
    """Singleton: Manages in-memory rolling windows"""
    return RollingWindowManager(max_cached=1000)


@lru_cache()
def get_nelson_rule_library() -> NelsonRuleLibrary:
    """Singleton: All 8 Nelson Rules registered"""
    library = NelsonRuleLibrary()
    library.register_default_rules()
    return library


@lru_cache()
def get_alert_notifier() -> AlertNotifier:
    """Singleton: WebSocket + MQTT notification dispatcher"""
    return AlertNotifier()


# Composed Services
async def get_alert_manager(
    violation_repo: ViolationRepository = Depends(get_violation_repo),
    notifier: AlertNotifier = Depends(get_alert_notifier),
) -> AlertManager:
    return AlertManager(
        violation_repo=violation_repo,
        notifier=notifier,
    )


async def get_spc_engine(
    char_repo: CharacteristicRepository = Depends(get_characteristic_repo),
    sample_repo: SampleRepository = Depends(get_sample_repo),
    window_manager: RollingWindowManager = Depends(get_rolling_window_manager),
    rule_library: NelsonRuleLibrary = Depends(get_nelson_rule_library),
    alert_manager: AlertManager = Depends(get_alert_manager),
) -> SPCEngine:
    return SPCEngine(
        char_repo=char_repo,
        sample_repo=sample_repo,
        window_manager=window_manager,
        rule_library=rule_library,
        alert_manager=alert_manager,
    )
```

### 3.2 Application Lifespan Management

```python
# src/openspc/main.py

from contextlib import asynccontextmanager
from fastapi import FastAPI

from openspc.db.database import init_db, close_db
from openspc.mqtt.client import MQTTClient
from openspc.core.providers import TagProvider
from openspc.api.dependencies import get_rolling_window_manager


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: startup and shutdown"""

    # Startup
    await init_db()

    # Initialize MQTT client
    mqtt_client = MQTTClient()
    await mqtt_client.connect()
    app.state.mqtt_client = mqtt_client

    # Initialize Tag Provider with MQTT
    tag_provider = TagProvider(mqtt_client)
    await tag_provider.start()
    app.state.tag_provider = tag_provider

    # Warm up rolling windows for active characteristics
    window_manager = get_rolling_window_manager()
    await window_manager.warm_up_active_windows()

    yield

    # Shutdown
    await tag_provider.stop()
    await mqtt_client.disconnect()
    await close_db()


app = FastAPI(
    title="OpenSPC API",
    version="1.0.0",
    lifespan=lifespan,
)
```

### 3.3 Service Layer Interfaces

```python
# src/openspc/core/services/protocols.py

from typing import Protocol
from datetime import datetime


class ISPCEngine(Protocol):
    """SPC Engine service interface"""

    async def process_sample(self, event: SampleEvent) -> ProcessingResult:
        """Process a sample through the SPC pipeline"""
        ...


class IRollingWindowManager(Protocol):
    """Rolling window manager interface"""

    async def get_window(self, char_id: int, window_size: int = 25) -> RollingWindow:
        """Get or load rolling window for characteristic"""
        ...

    async def append_sample(self, char_id: int, sample: WindowSample) -> None:
        """Append sample to window"""
        ...


class IAlertManager(Protocol):
    """Alert manager interface"""

    async def create_violations(
        self, sample_id: int, rules: list[RuleResult]
    ) -> list[Violation]:
        """Create violation records from rule results"""
        ...

    async def acknowledge(
        self, violation_id: int, user: str, reason: str
    ) -> Violation:
        """Acknowledge a violation"""
        ...
```

---

## 4. Repository Pattern for Database Access

### 4.1 Base Repository

```python
# src/openspc/db/repositories/base.py

from typing import TypeVar, Generic, Type, Sequence
from sqlalchemy import select, update, delete
from sqlalchemy.ext.asyncio import AsyncSession

from openspc.db.models.base import Base

ModelT = TypeVar("ModelT", bound=Base)


class BaseRepository(Generic[ModelT]):
    """Base repository with standard CRUD operations"""

    def __init__(self, session: AsyncSession, model: Type[ModelT]):
        self._session = session
        self._model = model

    async def get_by_id(self, id: int) -> ModelT | None:
        """Get entity by primary key"""
        return await self._session.get(self._model, id)

    async def get_all(
        self,
        offset: int = 0,
        limit: int = 100
    ) -> Sequence[ModelT]:
        """Get all entities with pagination"""
        stmt = select(self._model).offset(offset).limit(limit)
        result = await self._session.execute(stmt)
        return result.scalars().all()

    async def create(self, entity: ModelT) -> ModelT:
        """Create new entity"""
        self._session.add(entity)
        await self._session.flush()
        await self._session.refresh(entity)
        return entity

    async def update(self, id: int, **kwargs) -> ModelT | None:
        """Update entity by ID"""
        stmt = (
            update(self._model)
            .where(self._model.id == id)
            .values(**kwargs)
            .returning(self._model)
        )
        result = await self._session.execute(stmt)
        await self._session.commit()
        return result.scalar_one_or_none()

    async def delete(self, id: int) -> bool:
        """Delete entity by ID"""
        stmt = delete(self._model).where(self._model.id == id)
        result = await self._session.execute(stmt)
        await self._session.commit()
        return result.rowcount > 0
```

### 4.2 Specialized Repositories

```python
# src/openspc/db/repositories/sample_repo.py

from datetime import datetime
from typing import Sequence
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload

from openspc.db.models import Sample, Measurement
from openspc.db.repositories.base import BaseRepository


class SampleRepository(BaseRepository[Sample]):
    """Repository for Sample and Measurement entities"""

    def __init__(self, session: AsyncSession):
        super().__init__(session, Sample)

    async def get_rolling_window(
        self,
        char_id: int,
        window_size: int = 25,
        exclude_excluded: bool = True,
    ) -> Sequence[Sample]:
        """Get samples for rolling window calculation"""
        stmt = (
            select(Sample)
            .options(selectinload(Sample.measurements))
            .where(Sample.char_id == char_id)
        )

        if exclude_excluded:
            stmt = stmt.where(Sample.is_excluded == False)

        stmt = (
            stmt
            .order_by(Sample.timestamp.desc())
            .limit(window_size)
        )

        result = await self._session.execute(stmt)
        samples = result.scalars().all()

        # Return in chronological order
        return list(reversed(samples))

    async def get_samples_for_period(
        self,
        char_id: int,
        start: datetime,
        end: datetime,
    ) -> Sequence[Sample]:
        """Get samples within a time range"""
        stmt = (
            select(Sample)
            .options(selectinload(Sample.measurements))
            .where(
                and_(
                    Sample.char_id == char_id,
                    Sample.timestamp >= start,
                    Sample.timestamp <= end,
                )
            )
            .order_by(Sample.timestamp.asc())
        )

        result = await self._session.execute(stmt)
        return result.scalars().all()

    async def create_with_measurements(
        self,
        char_id: int,
        timestamp: datetime,
        values: list[float],
        batch_number: str | None = None,
        operator_id: str | None = None,
    ) -> Sample:
        """Create sample with measurements in single transaction"""
        sample = Sample(
            char_id=char_id,
            timestamp=timestamp,
            batch_number=batch_number,
            operator_id=operator_id,
        )
        self._session.add(sample)
        await self._session.flush()

        for value in values:
            measurement = Measurement(
                sample_id=sample.id,
                value=value,
            )
            self._session.add(measurement)

        await self._session.commit()
        await self._session.refresh(sample, ["measurements"])

        return sample

    async def mark_excluded(self, sample_id: int, excluded: bool = True) -> Sample:
        """Mark sample as excluded from calculations"""
        return await self.update(sample_id, is_excluded=excluded)

    async def count_for_characteristic(self, char_id: int) -> int:
        """Count total samples for a characteristic"""
        from sqlalchemy import func
        stmt = select(func.count(Sample.id)).where(Sample.char_id == char_id)
        result = await self._session.execute(stmt)
        return result.scalar() or 0
```

```python
# src/openspc/db/repositories/violation_repo.py

from typing import Sequence
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload

from openspc.db.models import Violation, Sample
from openspc.db.repositories.base import BaseRepository


class ViolationRepository(BaseRepository[Violation]):
    """Repository for Violation entities"""

    def __init__(self, session: AsyncSession):
        super().__init__(session, Violation)

    async def get_unacknowledged(
        self,
        char_id: int | None = None,
    ) -> Sequence[Violation]:
        """Get all unacknowledged violations"""
        stmt = (
            select(Violation)
            .options(selectinload(Violation.sample))
            .where(Violation.acknowledged == False)
        )

        if char_id is not None:
            stmt = stmt.join(Sample).where(Sample.char_id == char_id)

        stmt = stmt.order_by(Violation.id.desc())

        result = await self._session.execute(stmt)
        return result.scalars().all()

    async def get_by_sample(self, sample_id: int) -> Sequence[Violation]:
        """Get all violations for a sample"""
        stmt = (
            select(Violation)
            .where(Violation.sample_id == sample_id)
            .order_by(Violation.rule_id)
        )
        result = await self._session.execute(stmt)
        return result.scalars().all()

    async def acknowledge(
        self,
        violation_id: int,
        user: str,
        reason: str,
    ) -> Violation | None:
        """Acknowledge a violation with reason"""
        from datetime import datetime
        return await self.update(
            violation_id,
            acknowledged=True,
            ack_user=user,
            ack_reason=reason,
            ack_timestamp=datetime.utcnow(),
        )

    async def get_history(
        self,
        char_id: int,
        limit: int = 100,
        include_acknowledged: bool = True,
    ) -> Sequence[Violation]:
        """Get violation history for a characteristic"""
        stmt = (
            select(Violation)
            .join(Sample)
            .options(selectinload(Violation.sample))
            .where(Sample.char_id == char_id)
        )

        if not include_acknowledged:
            stmt = stmt.where(Violation.acknowledged == False)

        stmt = stmt.order_by(Violation.id.desc()).limit(limit)

        result = await self._session.execute(stmt)
        return result.scalars().all()
```

```python
# src/openspc/db/repositories/hierarchy_repo.py

from typing import Sequence
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from openspc.db.models import Hierarchy
from openspc.db.repositories.base import BaseRepository


class HierarchyRepository(BaseRepository[Hierarchy]):
    """Repository for ISA-95 Hierarchy entities"""

    def __init__(self, session: AsyncSession):
        super().__init__(session, Hierarchy)

    async def get_tree(self) -> Sequence[Hierarchy]:
        """Get full hierarchy tree"""
        stmt = (
            select(Hierarchy)
            .options(selectinload(Hierarchy.children))
            .where(Hierarchy.parent_id == None)
            .order_by(Hierarchy.name)
        )
        result = await self._session.execute(stmt)
        return result.scalars().all()

    async def get_descendants(self, node_id: int) -> Sequence[Hierarchy]:
        """Get all descendants of a node using materialized path"""
        node = await self.get_by_id(node_id)
        if not node:
            return []

        stmt = (
            select(Hierarchy)
            .where(Hierarchy.path.like(f"{node.path}%"))
            .where(Hierarchy.id != node_id)
            .order_by(Hierarchy.depth, Hierarchy.name)
        )
        result = await self._session.execute(stmt)
        return result.scalars().all()

    async def get_ancestors(self, node_id: int) -> Sequence[Hierarchy]:
        """Get all ancestors of a node (path to root)"""
        node = await self.get_by_id(node_id)
        if not node or not node.path:
            return []

        # Parse path "/1/2/3/" -> [1, 2, 3]
        ancestor_ids = [int(x) for x in node.path.strip("/").split("/") if x]
        ancestor_ids.remove(node_id)

        if not ancestor_ids:
            return []

        stmt = (
            select(Hierarchy)
            .where(Hierarchy.id.in_(ancestor_ids))
            .order_by(Hierarchy.depth)
        )
        result = await self._session.execute(stmt)
        return result.scalars().all()

    async def create_node(
        self,
        name: str,
        type: str,
        parent_id: int | None = None,
    ) -> Hierarchy:
        """Create hierarchy node with path calculation"""
        if parent_id:
            parent = await self.get_by_id(parent_id)
            if not parent:
                raise ValueError(f"Parent {parent_id} not found")
            path_prefix = parent.path
            depth = parent.depth + 1
        else:
            path_prefix = "/"
            depth = 0

        node = Hierarchy(
            name=name,
            type=type,
            parent_id=parent_id,
            depth=depth,
            path="",  # Will be updated after ID is assigned
        )

        await self.create(node)

        # Update path with actual ID
        node.path = f"{path_prefix}{node.id}/"
        await self._session.commit()

        return node
```

---

## 5. Component Interaction Summary

### Service Dependencies Graph

```
                         ┌─────────────────┐
                         │    FastAPI      │
                         │   Application   │
                         └────────┬────────┘
                                  │
              ┌───────────────────┼───────────────────┐
              │                   │                   │
              ▼                   ▼                   ▼
    ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
    │ REST Endpoints  │  │WebSocket Handler│  │ MQTT Subscriber │
    └────────┬────────┘  └────────┬────────┘  └────────┬────────┘
             │                    │                    │
             └────────────────────┼────────────────────┘
                                  │
                                  ▼
                         ┌─────────────────┐
                         │   SPCEngine     │
                         └────────┬────────┘
                                  │
              ┌───────────────────┼───────────────────┐
              │                   │                   │
              ▼                   ▼                   ▼
    ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
    │ RollingWindow   │  │  NelsonRule     │  │  AlertManager   │
    │    Manager      │  │   Library       │  │                 │
    └────────┬────────┘  └─────────────────┘  └────────┬────────┘
             │                                         │
             │                                         ▼
             │                               ┌─────────────────┐
             │                               │  AlertNotifier  │
             │                               └────────┬────────┘
             │                                        │
             │                        ┌───────────────┼───────────────┐
             │                        │               │               │
             │                        ▼               ▼               ▼
             │              ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
             │              │ WSManager   │  │MQTTPublisher│  │  EventBus   │
             │              └─────────────┘  └─────────────┘  └─────────────┘
             │
             ▼
    ┌─────────────────────────────────────────────────────────────────────────┐
    │                           Repository Layer                               │
    ├─────────────────┬─────────────────┬─────────────────┬───────────────────┤
    │ HierarchyRepo   │CharacteristicRepo│  SampleRepo    │  ViolationRepo    │
    └────────┬────────┴────────┬────────┴────────┬────────┴─────────┬─────────┘
             │                 │                 │                  │
             └─────────────────┴─────────────────┴──────────────────┘
                                        │
                                        ▼
                               ┌─────────────────┐
                               │    SQLite DB    │
                               └─────────────────┘
```

---

*Document complete. Ready for implementation handoff.*
