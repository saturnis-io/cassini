# Technical Proposal: Polymorphic Characteristic Configuration & Ingestion Layer

**Proposal ID:** 1738700000
**Type:** Architecture Design
**From Role:** System Architect
**Date:** 2026-02-04
**Status:** Pending CEO Approval

---

## Executive Summary

This proposal defines the **Polymorphic Configuration** architecture using the Strategy Pattern for OpenSPC's Characteristic configuration and ingestion layer. The design supports both human-driven (Manual) and machine-driven (Automated/Tag) data collection strategies while normalizing all data into the existing `Sample` → `SPCEngine.process_sample()` pipeline.

---

## 1. Data Model Specifications (Strategy Pattern)

### 1.1 Core Discriminated Union: CharacteristicConfig

The `CharacteristicConfig` model uses a **discriminated union** pattern with `config_type` as the discriminator field.

```python
# backend/src/openspc/api/schemas/characteristic_config.py

from datetime import datetime, time
from decimal import Decimal
from enum import Enum
from typing import Annotated, Literal, Optional, Union
from pydantic import BaseModel, Field, field_validator

# ============================================================
# ENUMS
# ============================================================

class ConfigType(str, Enum):
    """Discriminator for configuration strategy"""
    MANUAL = "MANUAL"
    TAG = "TAG"

class ScheduleType(str, Enum):
    """Schedule pattern types for manual data collection"""
    INTERVAL = "INTERVAL"       # Every N hours/minutes
    SHIFT = "SHIFT"             # Per shift start
    CRON = "CRON"               # Cron expression for complex schedules
    BATCH_START = "BATCH_START" # On batch change event

class TriggerType(str, Enum):
    """Trigger strategies for automated tag data"""
    ON_UPDATE = "ON_UPDATE"         # Throttled update
    ON_EVENT = "ON_EVENT"           # Boolean tag edge trigger
    ON_VALUE_CHANGE = "ON_VALUE_CHANGE"  # Deadband change

class EdgeType(str, Enum):
    """Edge detection for boolean triggers"""
    RISING = "RISING"     # 0→1 transition
    FALLING = "FALLING"   # 1→0 transition
    BOTH = "BOTH"         # Any transition

# ============================================================
# SCHEDULE DEFINITIONS (for ManualConfig)
# ============================================================

class IntervalSchedule(BaseModel):
    """Fixed interval scheduling (e.g., every 2 hours)"""
    schedule_type: Literal[ScheduleType.INTERVAL] = ScheduleType.INTERVAL
    interval_minutes: int = Field(..., ge=1, le=10080, description="Interval in minutes (max 7 days)")
    start_time: Optional[time] = Field(None, description="Optional start time for alignment")

class ShiftSchedule(BaseModel):
    """Shift-based scheduling"""
    schedule_type: Literal[ScheduleType.SHIFT] = ScheduleType.SHIFT
    shifts_per_day: int = Field(3, ge=1, le=4, description="Number of shifts per day")
    shift_start_times: list[time] = Field(
        default_factory=lambda: [time(6, 0), time(14, 0), time(22, 0)],
        description="Start time of each shift"
    )
    samples_per_shift: int = Field(1, ge=1, le=10, description="Number of samples per shift")

class CronSchedule(BaseModel):
    """Cron-based scheduling for complex patterns"""
    schedule_type: Literal[ScheduleType.CRON] = ScheduleType.CRON
    cron_expression: str = Field(..., description="Cron expression (minute hour day month weekday)")
    timezone: str = Field("UTC", description="Timezone for cron evaluation")

class BatchStartSchedule(BaseModel):
    """Triggered on batch number change"""
    schedule_type: Literal[ScheduleType.BATCH_START] = ScheduleType.BATCH_START
    batch_tag_path: str = Field(..., description="MQTT topic for batch number changes")
    delay_minutes: int = Field(0, ge=0, le=60, description="Delay after batch start")

# Union of all schedule types
Schedule = Annotated[
    Union[IntervalSchedule, ShiftSchedule, CronSchedule, BatchStartSchedule],
    Field(discriminator="schedule_type")
]

# ============================================================
# TRIGGER DEFINITIONS (for TagConfig)
# ============================================================

class OnUpdateTrigger(BaseModel):
    """Throttled update trigger - fire on any value update with throttle"""
    trigger_type: Literal[TriggerType.ON_UPDATE] = TriggerType.ON_UPDATE
    throttle_seconds: int = Field(60, ge=1, le=86400, description="Minimum seconds between samples")
    require_change: bool = Field(False, description="If true, only trigger if value actually changed")

class OnEventTrigger(BaseModel):
    """Boolean tag edge trigger - fire on specific edge transitions"""
    trigger_type: Literal[TriggerType.ON_EVENT] = TriggerType.ON_EVENT
    trigger_tag_path: str = Field(..., description="Boolean tag that triggers sampling")
    edge: EdgeType = Field(EdgeType.RISING, description="Edge type to detect")
    debounce_ms: int = Field(100, ge=0, le=10000, description="Debounce period in milliseconds")

class OnValueChangeTrigger(BaseModel):
    """Deadband-based trigger - fire when value changes beyond threshold"""
    trigger_type: Literal[TriggerType.ON_VALUE_CHANGE] = TriggerType.ON_VALUE_CHANGE
    deadband: Decimal = Field(..., ge=0, description="Minimum change to trigger")
    deadband_type: Literal["ABSOLUTE", "PERCENT"] = Field("ABSOLUTE")
    min_interval_seconds: int = Field(1, ge=1, description="Minimum seconds between triggers")

# Union of all trigger types
TriggerStrategy = Annotated[
    Union[OnUpdateTrigger, OnEventTrigger, OnValueChangeTrigger],
    Field(discriminator="trigger_type")
]

# ============================================================
# STRATEGY A: ManualConfig
# ============================================================

class ManualConfig(BaseModel):
    """
    Configuration for human operator data entry.
    Designed for UI generation and task scheduling.
    """
    config_type: Literal[ConfigType.MANUAL] = ConfigType.MANUAL

    # UI Generation Fields
    instructions: str = Field(
        ...,
        max_length=2000,
        description="Instructions displayed to operator during data entry"
    )
    input_mask: int = Field(
        2,
        ge=0,
        le=10,
        description="Decimal precision for input validation and display"
    )
    require_batch_number: bool = Field(True, description="Require batch number entry")
    require_operator_id: bool = Field(True, description="Require operator identification")

    # Scheduling
    schedule: Schedule = Field(..., description="When measurements are due")

    # Grace period for late entries
    grace_period_minutes: int = Field(
        30,
        ge=0,
        le=480,
        description="Minutes after due time before marking as overdue"
    )

    # Escalation
    escalate_overdue_minutes: int = Field(
        60,
        ge=0,
        description="Minutes overdue before escalation (0 = no escalation)"
    )

# ============================================================
# STRATEGY B: TagConfig
# ============================================================

class TagConfig(BaseModel):
    """
    Configuration for automated MQTT/PLC data ingestion.
    Designed for machine-driven sampling.
    """
    config_type: Literal[ConfigType.TAG] = ConfigType.TAG

    # Source Tag
    source_tag_path: str = Field(
        ...,
        description="MQTT topic path for value (e.g., 'spBv1.0/MyGroup/DDATA/Edge1/Device1/Metrics/Temperature')"
    )

    # Trigger Strategy
    trigger: TriggerStrategy = Field(..., description="When to capture a sample")

    # Optional context tags
    batch_tag_path: Optional[str] = Field(
        None,
        description="MQTT topic for batch number (auto-populated context)"
    )
    operator_tag_path: Optional[str] = Field(
        None,
        description="MQTT topic for operator ID (auto-populated context)"
    )

    # Multi-measurement support (for subgroup_size > 1)
    measurement_tags: Optional[list[str]] = Field(
        None,
        description="Additional tag paths for multi-measurement samples (subgroup_size > 1)"
    )

    # Data validation
    min_valid_value: Optional[Decimal] = Field(None, description="Reject values below this")
    max_valid_value: Optional[Decimal] = Field(None, description="Reject values above this")
    reject_stale_seconds: int = Field(
        300,
        ge=0,
        description="Reject data older than N seconds (0 = no check)"
    )

# ============================================================
# DISCRIMINATED UNION: CharacteristicConfig
# ============================================================

CharacteristicConfig = Annotated[
    Union[ManualConfig, TagConfig],
    Field(discriminator="config_type")
]

# ============================================================
# DATABASE STORAGE MODEL
# ============================================================

class CharacteristicConfigDB(BaseModel):
    """
    Database storage wrapper - stores config as JSON blob.
    Maintains backward compatibility with existing Characteristic model.
    """
    characteristic_id: int
    config: CharacteristicConfig
    is_active: bool = True
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
```

---

### 1.2 JSON Structure Examples

#### Example A: Manual Configuration (Interval Schedule)

```json
{
  "characteristic_id": 101,
  "config": {
    "config_type": "MANUAL",
    "instructions": "Measure the outer diameter at three points around the circumference. Record the average value. Ensure caliper is zeroed before measurement.",
    "input_mask": 3,
    "require_batch_number": true,
    "require_operator_id": true,
    "schedule": {
      "schedule_type": "INTERVAL",
      "interval_minutes": 120,
      "start_time": "06:00:00"
    },
    "grace_period_minutes": 30,
    "escalate_overdue_minutes": 60
  },
  "is_active": true,
  "created_at": "2026-02-04T10:00:00Z",
  "updated_at": "2026-02-04T10:00:00Z"
}
```

#### Example B: Manual Configuration (Shift Schedule)

```json
{
  "characteristic_id": 102,
  "config": {
    "config_type": "MANUAL",
    "instructions": "Visual inspection of surface finish. Rate 1-5 scale.",
    "input_mask": 0,
    "require_batch_number": true,
    "require_operator_id": true,
    "schedule": {
      "schedule_type": "SHIFT",
      "shifts_per_day": 3,
      "shift_start_times": ["06:00:00", "14:00:00", "22:00:00"],
      "samples_per_shift": 2
    },
    "grace_period_minutes": 45,
    "escalate_overdue_minutes": 90
  },
  "is_active": true
}
```

#### Example C: Tag Configuration (OnUpdate Trigger)

```json
{
  "characteristic_id": 201,
  "config": {
    "config_type": "TAG",
    "source_tag_path": "spBv1.0/Plant1/DDATA/Line2/Oven1/Temperature",
    "trigger": {
      "trigger_type": "ON_UPDATE",
      "throttle_seconds": 60,
      "require_change": false
    },
    "batch_tag_path": "spBv1.0/Plant1/DDATA/Line2/BatchNumber",
    "operator_tag_path": null,
    "measurement_tags": null,
    "min_valid_value": -50.0,
    "max_valid_value": 500.0,
    "reject_stale_seconds": 300
  },
  "is_active": true
}
```

#### Example D: Tag Configuration (OnEvent Trigger)

```json
{
  "characteristic_id": 202,
  "config": {
    "config_type": "TAG",
    "source_tag_path": "spBv1.0/Plant1/DDATA/Line2/Press1/Pressure",
    "trigger": {
      "trigger_type": "ON_EVENT",
      "trigger_tag_path": "spBv1.0/Plant1/DDATA/Line2/Press1/CycleComplete",
      "edge": "RISING",
      "debounce_ms": 500
    },
    "batch_tag_path": "spBv1.0/Plant1/DDATA/Line2/BatchNumber",
    "min_valid_value": 0,
    "max_valid_value": 10000,
    "reject_stale_seconds": 60
  },
  "is_active": true
}
```

#### Example E: Tag Configuration (OnValueChange/Deadband Trigger)

```json
{
  "characteristic_id": 203,
  "config": {
    "config_type": "TAG",
    "source_tag_path": "spBv1.0/Plant1/DDATA/Line2/Mixer/Viscosity",
    "trigger": {
      "trigger_type": "ON_VALUE_CHANGE",
      "deadband": 0.5,
      "deadband_type": "PERCENT",
      "min_interval_seconds": 30
    },
    "measurement_tags": [
      "spBv1.0/Plant1/DDATA/Line2/Mixer/Viscosity_A",
      "spBv1.0/Plant1/DDATA/Line2/Mixer/Viscosity_B",
      "spBv1.0/Plant1/DDATA/Line2/Mixer/Viscosity_C"
    ],
    "min_valid_value": 100,
    "max_valid_value": 5000,
    "reject_stale_seconds": 120
  },
  "is_active": true
}
```

---

## 2. Ingestion Logic (The Normalizer)

### 2.1 IngestionCoordinator Service Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     IngestionCoordinator                            │
├─────────────────────────────────────────────────────────────────────┤
│  Responsibilities:                                                  │
│  1. Load and manage CharacteristicConfig for all characteristics    │
│  2. Route to appropriate handler based on config_type               │
│  3. Manage lifecycle of schedulers and listeners                    │
│  4. Normalize all incoming data to SampleEvent                      │
│  5. Hand off to SPCEngine.process_sample()                          │
└─────────────────────────────────────────────────────────────────────┘
          │                                    │
          ▼                                    ▼
┌─────────────────────┐            ┌─────────────────────────┐
│  ManualScheduler    │            │    TagSubscriber        │
├─────────────────────┤            ├─────────────────────────┤
│ - APScheduler jobs  │            │ - MQTT subscriptions    │
│ - Due task manager  │            │ - Trigger evaluator     │
│ - Overdue tracker   │            │ - Value cache           │
└─────────────────────┘            └─────────────────────────┘
          │                                    │
          ▼                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        SampleNormalizer                             │
├─────────────────────────────────────────────────────────────────────┤
│  Input: Raw data from any source                                    │
│  Output: SampleEvent { characteristic_id, measurements,             │
│                        timestamp, context }                         │
└─────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│              SPCEngine.process_sample(sample_event)                 │
│              (Existing - DO NOT MODIFY)                             │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Pseudo-code Implementation

```python
# backend/src/openspc/core/ingestion/coordinator.py

from datetime import datetime, timezone
from typing import Dict, Optional
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from openspc.api.schemas.characteristic_config import (
    CharacteristicConfig, ManualConfig, TagConfig,
    ConfigType, ScheduleType, TriggerType, EdgeType
)
from openspc.core.providers.protocol import SampleEvent, SampleContext
from openspc.core.engine.spc_engine import SPCEngine
from openspc.db.repositories.characteristic_config import CharacteristicConfigRepository

# ============================================================
# DUE TASK MODEL (for Manual Dashboard)
# ============================================================

@dataclass
class DueTask:
    """Represents a pending manual measurement task"""
    characteristic_id: int
    characteristic_name: str
    hierarchy_path: str
    due_at: datetime
    instructions: str
    input_mask: int
    require_batch_number: bool
    require_operator_id: bool
    grace_period_minutes: int
    status: str  # "PENDING", "DUE", "OVERDUE", "ESCALATED"

    @property
    def is_overdue(self) -> bool:
        return datetime.now(timezone.utc) > self.due_at + timedelta(minutes=self.grace_period_minutes)

# ============================================================
# INGESTION COORDINATOR
# ============================================================

class IngestionCoordinator:
    """
    Central coordinator for all data ingestion strategies.
    Manages manual schedulers and automated tag subscribers.
    """

    def __init__(
        self,
        config_repo: CharacteristicConfigRepository,
        spc_engine: SPCEngine,
        mqtt_client: MQTTClient,
        event_bus: EventBus
    ):
        self.config_repo = config_repo
        self.spc_engine = spc_engine
        self.mqtt_client = mqtt_client
        self.event_bus = event_bus

        # Schedulers and subscribers
        self.scheduler = AsyncIOScheduler()
        self.tag_subscribers: Dict[int, TagSubscriber] = {}
        self.due_tasks: Dict[int, DueTask] = {}

        # Value cache for tag triggers
        self.tag_value_cache: Dict[str, TagValueState] = {}

    async def start(self):
        """Initialize all ingestion handlers based on stored configs"""
        configs = await self.config_repo.get_all_active()

        for config_db in configs:
            await self._register_config(config_db.characteristic_id, config_db.config)

        self.scheduler.start()
        logger.info(f"IngestionCoordinator started with {len(configs)} characteristics")

    async def stop(self):
        """Gracefully stop all handlers"""
        self.scheduler.shutdown(wait=True)
        for subscriber in self.tag_subscribers.values():
            await subscriber.stop()
        logger.info("IngestionCoordinator stopped")

    async def _register_config(self, char_id: int, config: CharacteristicConfig):
        """Register appropriate handler based on config type"""
        if config.config_type == ConfigType.MANUAL:
            await self._setup_manual_scheduler(char_id, config)
        elif config.config_type == ConfigType.TAG:
            await self._setup_tag_subscriber(char_id, config)

    # ========================================================
    # MANUAL SCHEDULER SETUP
    # ========================================================

    async def _setup_manual_scheduler(self, char_id: int, config: ManualConfig):
        """Set up scheduled due tasks for manual characteristics"""

        # Get characteristic metadata for DueTask
        char = await self.char_repo.get_by_id(char_id)

        # Create scheduler job based on schedule type
        if config.schedule.schedule_type == ScheduleType.INTERVAL:
            trigger = IntervalTrigger(
                minutes=config.schedule.interval_minutes,
                start_date=self._align_start_time(config.schedule.start_time)
            )
        elif config.schedule.schedule_type == ScheduleType.SHIFT:
            # Create multiple jobs, one for each shift
            for i, shift_time in enumerate(config.schedule.shift_start_times):
                trigger = CronTrigger(
                    hour=shift_time.hour,
                    minute=shift_time.minute,
                    timezone=config.schedule.timezone if hasattr(config.schedule, 'timezone') else 'UTC'
                )
                self.scheduler.add_job(
                    self._create_due_task,
                    trigger=trigger,
                    args=[char_id, config, char],
                    id=f"manual_{char_id}_shift_{i}"
                )
            return  # Skip single job creation
        elif config.schedule.schedule_type == ScheduleType.CRON:
            trigger = CronTrigger.from_crontab(
                config.schedule.cron_expression,
                timezone=config.schedule.timezone
            )
        elif config.schedule.schedule_type == ScheduleType.BATCH_START:
            # Subscribe to batch tag changes
            await self._setup_batch_trigger(char_id, config)
            return

        self.scheduler.add_job(
            self._create_due_task,
            trigger=trigger,
            args=[char_id, config, char],
            id=f"manual_{char_id}"
        )

    async def _create_due_task(self, char_id: int, config: ManualConfig, char):
        """Create a new due task and broadcast to connected clients"""
        due_task = DueTask(
            characteristic_id=char_id,
            characteristic_name=char.name,
            hierarchy_path=await self._get_hierarchy_path(char.hierarchy_id),
            due_at=datetime.now(timezone.utc),
            instructions=config.instructions,
            input_mask=config.input_mask,
            require_batch_number=config.require_batch_number,
            require_operator_id=config.require_operator_id,
            grace_period_minutes=config.grace_period_minutes,
            status="DUE"
        )

        self.due_tasks[char_id] = due_task

        # Broadcast to frontend
        await self.event_bus.publish(DueTaskCreatedEvent(due_task))

        # Schedule overdue check
        if config.escalate_overdue_minutes > 0:
            self.scheduler.add_job(
                self._check_overdue,
                trigger='date',
                run_date=due_task.due_at + timedelta(minutes=config.escalate_overdue_minutes),
                args=[char_id],
                id=f"overdue_{char_id}_{due_task.due_at.isoformat()}"
            )

    async def _check_overdue(self, char_id: int):
        """Check if task is overdue and escalate if needed"""
        if char_id in self.due_tasks:
            task = self.due_tasks[char_id]
            if task.status == "DUE":
                task.status = "ESCALATED"
                await self.event_bus.publish(TaskEscalatedEvent(task))

    # ========================================================
    # TAG SUBSCRIBER SETUP
    # ========================================================

    async def _setup_tag_subscriber(self, char_id: int, config: TagConfig):
        """Set up MQTT subscription with trigger evaluation"""

        subscriber = TagSubscriber(
            char_id=char_id,
            config=config,
            mqtt_client=self.mqtt_client,
            on_sample_ready=self._on_tag_sample_ready
        )

        await subscriber.start()
        self.tag_subscribers[char_id] = subscriber

    async def _on_tag_sample_ready(self, char_id: int, measurements: list[float], context: dict):
        """Callback when tag trigger fires and data is ready"""

        # Normalize to SampleEvent
        sample_event = SampleEvent(
            characteristic_id=char_id,
            measurements=measurements,
            timestamp=datetime.now(timezone.utc),
            context=SampleContext(
                batch_number=context.get('batch_number'),
                operator_id=context.get('operator_id'),
                source="TAG"
            )
        )

        # Hand off to existing engine
        result = await self.spc_engine.process_sample(sample_event)

        # Log and broadcast
        logger.info(f"TAG sample processed for char {char_id}: mean={result.mean}, violations={len(result.violations)}")

    # ========================================================
    # MANUAL SAMPLE SUBMISSION (from API)
    # ========================================================

    async def submit_manual_sample(
        self,
        char_id: int,
        measurements: list[float],
        batch_number: Optional[str] = None,
        operator_id: Optional[str] = None
    ) -> ProcessingResult:
        """
        Handle manual sample submission from frontend.
        Validates against config requirements and normalizes to SampleEvent.
        """

        # Get config and validate
        config_db = await self.config_repo.get_by_characteristic(char_id)
        if not config_db or config_db.config.config_type != ConfigType.MANUAL:
            raise ValueError(f"Characteristic {char_id} is not configured for manual entry")

        config: ManualConfig = config_db.config

        # Validate requirements
        if config.require_batch_number and not batch_number:
            raise ValueError("Batch number is required")
        if config.require_operator_id and not operator_id:
            raise ValueError("Operator ID is required")

        # Normalize to SampleEvent
        sample_event = SampleEvent(
            characteristic_id=char_id,
            measurements=measurements,
            timestamp=datetime.now(timezone.utc),
            context=SampleContext(
                batch_number=batch_number,
                operator_id=operator_id,
                source="MANUAL"
            )
        )

        # Clear due task if exists
        if char_id in self.due_tasks:
            del self.due_tasks[char_id]
            await self.event_bus.publish(DueTaskCompletedEvent(char_id))

        # Hand off to existing engine
        return await self.spc_engine.process_sample(sample_event)

    # ========================================================
    # DUE TASK QUERIES (for Dashboard)
    # ========================================================

    def get_due_tasks(
        self,
        hierarchy_id: Optional[int] = None,
        status_filter: Optional[list[str]] = None
    ) -> list[DueTask]:
        """
        Get due tasks for dashboard display.
        Supports filtering by hierarchy and status.
        """
        tasks = list(self.due_tasks.values())

        if hierarchy_id:
            tasks = [t for t in tasks if self._is_under_hierarchy(t.characteristic_id, hierarchy_id)]

        if status_filter:
            tasks = [t for t in tasks if t.status in status_filter]

        # Sort by due_at (oldest first)
        tasks.sort(key=lambda t: t.due_at)

        return tasks

    def get_overdue_count(self, hierarchy_id: Optional[int] = None) -> int:
        """Get count of overdue tasks for alert badges"""
        tasks = self.get_due_tasks(hierarchy_id, status_filter=["OVERDUE", "ESCALATED"])
        return len(tasks)


# ============================================================
# TAG SUBSCRIBER (Trigger Evaluator)
# ============================================================

@dataclass
class TagValueState:
    """State for deadband and throttle evaluation"""
    last_value: Optional[float] = None
    last_trigger_time: Optional[datetime] = None
    last_event_state: Optional[bool] = None


class TagSubscriber:
    """
    Manages MQTT subscriptions and trigger evaluation for a single characteristic.
    """

    def __init__(
        self,
        char_id: int,
        config: TagConfig,
        mqtt_client: MQTTClient,
        on_sample_ready: Callable
    ):
        self.char_id = char_id
        self.config = config
        self.mqtt_client = mqtt_client
        self.on_sample_ready = on_sample_ready

        # State
        self.value_state = TagValueState()
        self.context_cache: Dict[str, any] = {}
        self.pending_values: Dict[str, float] = {}

    async def start(self):
        """Subscribe to required MQTT topics"""

        # Primary value subscription
        await self.mqtt_client.subscribe(
            self.config.source_tag_path,
            self._on_value_update
        )

        # Multi-measurement tags (if subgroup_size > 1)
        if self.config.measurement_tags:
            for tag in self.config.measurement_tags:
                await self.mqtt_client.subscribe(tag, self._on_measurement_update)

        # Context tags
        if self.config.batch_tag_path:
            await self.mqtt_client.subscribe(
                self.config.batch_tag_path,
                self._on_batch_update
            )
        if self.config.operator_tag_path:
            await self.mqtt_client.subscribe(
                self.config.operator_tag_path,
                self._on_operator_update
            )

        # Event trigger tag (separate from value tag)
        if self.config.trigger.trigger_type == TriggerType.ON_EVENT:
            await self.mqtt_client.subscribe(
                self.config.trigger.trigger_tag_path,
                self._on_event_tag_update
            )

    async def stop(self):
        """Unsubscribe from all topics"""
        await self.mqtt_client.unsubscribe(self.config.source_tag_path)
        if self.config.measurement_tags:
            for tag in self.config.measurement_tags:
                await self.mqtt_client.unsubscribe(tag)

    async def _on_value_update(self, topic: str, value: float, timestamp: datetime):
        """Handle value tag updates"""

        # Validate value
        if not self._validate_value(value, timestamp):
            return

        # Evaluate trigger
        should_trigger = await self._evaluate_trigger(value, timestamp)

        if should_trigger:
            await self._fire_sample(value, timestamp)

    async def _on_event_tag_update(self, topic: str, value: bool, timestamp: datetime):
        """Handle event trigger tag updates (for ON_EVENT trigger type)"""
        trigger: OnEventTrigger = self.config.trigger

        # Edge detection
        prev_state = self.value_state.last_event_state
        self.value_state.last_event_state = value

        if prev_state is None:
            return  # First value, can't detect edge

        edge_detected = False
        if trigger.edge == EdgeType.RISING and not prev_state and value:
            edge_detected = True
        elif trigger.edge == EdgeType.FALLING and prev_state and not value:
            edge_detected = True
        elif trigger.edge == EdgeType.BOTH and prev_state != value:
            edge_detected = True

        if edge_detected:
            # Debounce check
            if self.value_state.last_trigger_time:
                elapsed_ms = (timestamp - self.value_state.last_trigger_time).total_seconds() * 1000
                if elapsed_ms < trigger.debounce_ms:
                    return

            # Capture current value and fire
            current_value = self.pending_values.get(self.config.source_tag_path)
            if current_value is not None:
                await self._fire_sample(current_value, timestamp)

    async def _evaluate_trigger(self, value: float, timestamp: datetime) -> bool:
        """Evaluate whether trigger conditions are met"""
        trigger = self.config.trigger

        if trigger.trigger_type == TriggerType.ON_UPDATE:
            return self._evaluate_on_update(value, timestamp, trigger)

        elif trigger.trigger_type == TriggerType.ON_VALUE_CHANGE:
            return self._evaluate_deadband(value, timestamp, trigger)

        elif trigger.trigger_type == TriggerType.ON_EVENT:
            # ON_EVENT is handled by _on_event_tag_update
            # Here we just cache the value
            self.pending_values[self.config.source_tag_path] = value
            return False

        return False

    def _evaluate_on_update(self, value: float, timestamp: datetime, trigger: OnUpdateTrigger) -> bool:
        """Evaluate throttled update trigger"""

        # Throttle check
        if self.value_state.last_trigger_time:
            elapsed = (timestamp - self.value_state.last_trigger_time).total_seconds()
            if elapsed < trigger.throttle_seconds:
                return False

        # Change check (if required)
        if trigger.require_change:
            if self.value_state.last_value is not None and value == self.value_state.last_value:
                return False

        return True

    def _evaluate_deadband(self, value: float, timestamp: datetime, trigger: OnValueChangeTrigger) -> bool:
        """Evaluate deadband trigger"""

        # First value always triggers
        if self.value_state.last_value is None:
            return True

        # Minimum interval check
        if self.value_state.last_trigger_time:
            elapsed = (timestamp - self.value_state.last_trigger_time).total_seconds()
            if elapsed < trigger.min_interval_seconds:
                return False

        # Deadband check
        change = abs(value - self.value_state.last_value)

        if trigger.deadband_type == "PERCENT":
            if self.value_state.last_value != 0:
                change_percent = (change / abs(self.value_state.last_value)) * 100
                if change_percent < float(trigger.deadband):
                    return False
        else:  # ABSOLUTE
            if change < float(trigger.deadband):
                return False

        return True

    def _validate_value(self, value: float, timestamp: datetime) -> bool:
        """Validate value against config constraints"""

        # Range validation
        if self.config.min_valid_value is not None and value < float(self.config.min_valid_value):
            logger.warning(f"Value {value} below min for char {self.char_id}")
            return False

        if self.config.max_valid_value is not None and value > float(self.config.max_valid_value):
            logger.warning(f"Value {value} above max for char {self.char_id}")
            return False

        # Stale check
        if self.config.reject_stale_seconds > 0:
            age = (datetime.now(timezone.utc) - timestamp).total_seconds()
            if age > self.config.reject_stale_seconds:
                logger.warning(f"Stale data rejected for char {self.char_id}: {age}s old")
                return False

        return True

    async def _fire_sample(self, value: float, timestamp: datetime):
        """Collect measurements and fire sample callback"""

        # Collect measurements
        measurements = [value]

        if self.config.measurement_tags:
            for tag in self.config.measurement_tags:
                if tag in self.pending_values:
                    measurements.append(self.pending_values[tag])

        # Build context
        context = {
            'batch_number': self.context_cache.get('batch_number'),
            'operator_id': self.context_cache.get('operator_id')
        }

        # Update state
        self.value_state.last_value = value
        self.value_state.last_trigger_time = timestamp

        # Fire callback
        await self.on_sample_ready(self.char_id, measurements, context)

    async def _on_batch_update(self, topic: str, value: str, timestamp: datetime):
        """Update batch number context"""
        self.context_cache['batch_number'] = value

    async def _on_operator_update(self, topic: str, value: str, timestamp: datetime):
        """Update operator ID context"""
        self.context_cache['operator_id'] = value

    async def _on_measurement_update(self, topic: str, value: float, timestamp: datetime):
        """Cache measurement for multi-measurement samples"""
        self.pending_values[topic] = value
```

---

## 3. Dashboard Integration for Due Tasks

### 3.1 API Endpoints for Due Task Dashboard

```python
# backend/src/openspc/api/v1/due_tasks.py

from fastapi import APIRouter, Query
from typing import Optional, List

router = APIRouter(prefix="/due-tasks", tags=["Due Tasks"])

@router.get("/", response_model=List[DueTaskResponse])
async def get_due_tasks(
    hierarchy_id: Optional[int] = Query(None, description="Filter by hierarchy node"),
    status: Optional[List[str]] = Query(None, description="Filter by status: PENDING, DUE, OVERDUE, ESCALATED"),
    coordinator: IngestionCoordinator = Depends(get_coordinator)
):
    """
    Get all due manual measurement tasks.
    Used by dashboard to show pending operator actions.
    """
    return coordinator.get_due_tasks(hierarchy_id, status)

@router.get("/count")
async def get_due_task_counts(
    hierarchy_id: Optional[int] = Query(None),
    coordinator: IngestionCoordinator = Depends(get_coordinator)
):
    """
    Get counts by status for dashboard badges.
    """
    tasks = coordinator.get_due_tasks(hierarchy_id)
    return {
        "total": len(tasks),
        "due": len([t for t in tasks if t.status == "DUE"]),
        "overdue": len([t for t in tasks if t.status == "OVERDUE"]),
        "escalated": len([t for t in tasks if t.status == "ESCALATED"])
    }

@router.post("/{char_id}/complete")
async def complete_due_task(
    char_id: int,
    submission: ManualSampleSubmission,
    coordinator: IngestionCoordinator = Depends(get_coordinator)
):
    """
    Submit manual measurement and mark task complete.
    Normalizes data and hands off to SPCEngine.
    """
    result = await coordinator.submit_manual_sample(
        char_id=char_id,
        measurements=submission.measurements,
        batch_number=submission.batch_number,
        operator_id=submission.operator_id
    )
    return result
```

### 3.2 Frontend Types

```typescript
// frontend/src/types/due-tasks.ts

export interface DueTask {
  characteristic_id: number;
  characteristic_name: string;
  hierarchy_path: string;
  due_at: string;  // ISO datetime
  instructions: string;
  input_mask: number;
  require_batch_number: boolean;
  require_operator_id: boolean;
  grace_period_minutes: number;
  status: 'PENDING' | 'DUE' | 'OVERDUE' | 'ESCALATED';
}

export interface DueTaskCounts {
  total: number;
  due: number;
  overdue: number;
  escalated: number;
}
```

### 3.3 WebSocket Events

```python
# Real-time events for dashboard updates

class DueTaskCreatedEvent(BaseEvent):
    event_type = "due_task.created"
    task: DueTask

class DueTaskCompletedEvent(BaseEvent):
    event_type = "due_task.completed"
    characteristic_id: int

class TaskEscalatedEvent(BaseEvent):
    event_type = "due_task.escalated"
    task: DueTask
```

---

## 4. Database Migration

```python
# backend/alembic/versions/20260205_add_characteristic_config.py

"""Add characteristic_config table for polymorphic configuration

Revision ID: 007
Revises: 006
Create Date: 2026-02-05
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

def upgrade():
    op.create_table(
        'characteristic_config',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('characteristic_id', sa.Integer(), sa.ForeignKey('characteristic.id', ondelete='CASCADE'), unique=True, nullable=False),
        sa.Column('config', JSONB, nullable=False),  # Stores discriminated union as JSON
        sa.Column('is_active', sa.Boolean(), default=True, nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
    )

    op.create_index('ix_characteristic_config_active', 'characteristic_config', ['is_active'])

def downgrade():
    op.drop_table('characteristic_config')
```

---

## 5. Integration Points Summary

| Component | Integration Point | Description |
|-----------|------------------|-------------|
| **SPCEngine** | `process_sample(sample_event)` | Existing entry point - NO CHANGES |
| **SampleEvent** | Normalized data structure | Used by both Manual and Tag strategies |
| **SampleContext** | `batch_number`, `operator_id`, `source` | Context travels with all samples |
| **EventBus** | Real-time notifications | Due tasks, violations, escalations |
| **WebSocket** | Dashboard updates | Push due task changes to connected clients |
| **Characteristic** | Foreign key relationship | Config linked 1:1 to characteristic |

---

## 6. Approval Checklist

- [ ] Data model design (Strategy Pattern with discriminated unions)
- [ ] ManualConfig with schedule types
- [ ] TagConfig with trigger strategies
- [ ] IngestionCoordinator pseudo-code
- [ ] Due task management for dashboard
- [ ] Database migration plan
- [ ] API endpoints for due tasks
- [ ] WebSocket event definitions

---

## CEO Decision Required

**Question:** Approve this architecture for implementation?

**Options:**
1. **Approve** - Proceed with implementation
2. **Revise** - Request specific changes (describe in reply)
3. **Defer** - Need more information

---

*Proposal submitted by System Architect*
