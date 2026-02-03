# OpenSPC API Contracts

## Document Information
- **Project:** OpenSPC - Event-Driven Statistical Process Control System
- **Author:** Solutions Architect, Virtual Engineering Co.
- **Date:** 2026-02-02
- **API Version:** v1
- **Base URL:** `/api/v1`

---

## 1. API Overview

### Base Configuration
```
Base URL: http://localhost:8000/api/v1
Content-Type: application/json
Authentication: Bearer JWT (future)
```

### Response Envelope
All successful responses follow this structure:
```json
{
  "data": { ... },
  "meta": {
    "timestamp": "2026-02-02T12:00:00Z",
    "request_id": "uuid"
  }
}
```

### Error Response
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human readable message",
    "details": [
      {
        "field": "field_name",
        "message": "Field-specific error"
      }
    ]
  },
  "meta": {
    "timestamp": "2026-02-02T12:00:00Z",
    "request_id": "uuid"
  }
}
```

---

## 2. Pydantic Schema Definitions

### 2.1 Common Schemas

```python
# src/openspc/api/schemas/common.py

from datetime import datetime
from typing import Generic, TypeVar, Any
from pydantic import BaseModel, Field

DataT = TypeVar("DataT")


class PaginationParams(BaseModel):
    """Query parameters for pagination"""
    offset: int = Field(default=0, ge=0, description="Number of items to skip")
    limit: int = Field(default=50, ge=1, le=500, description="Max items to return")


class PaginatedResponse(BaseModel, Generic[DataT]):
    """Paginated list response"""
    items: list[DataT]
    total: int
    offset: int
    limit: int
    has_more: bool


class ResponseMeta(BaseModel):
    """Response metadata"""
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    request_id: str | None = None


class APIResponse(BaseModel, Generic[DataT]):
    """Standard API response wrapper"""
    data: DataT
    meta: ResponseMeta = Field(default_factory=ResponseMeta)


class ErrorDetail(BaseModel):
    """Individual field error"""
    field: str
    message: str


class ErrorResponse(BaseModel):
    """Error response structure"""
    code: str
    message: str
    details: list[ErrorDetail] = []
```

### 2.2 Hierarchy Schemas

```python
# src/openspc/api/schemas/hierarchy.py

from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field


class HierarchyBase(BaseModel):
    """Base hierarchy attributes"""
    name: str = Field(..., min_length=1, max_length=100)
    type: Literal["Site", "Area", "Line", "Cell", "Unit"]


class HierarchyCreate(HierarchyBase):
    """Create hierarchy node request"""
    parent_id: int | None = Field(None, description="Parent node ID, null for root")


class HierarchyUpdate(BaseModel):
    """Update hierarchy node request"""
    name: str | None = Field(None, min_length=1, max_length=100)
    type: Literal["Site", "Area", "Line", "Cell", "Unit"] | None = None


class HierarchyResponse(HierarchyBase):
    """Hierarchy node response"""
    id: int
    parent_id: int | None
    path: str
    depth: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class HierarchyTreeNode(HierarchyResponse):
    """Hierarchy node with children for tree view"""
    children: list["HierarchyTreeNode"] = []
    characteristic_count: int = 0


class HierarchyTree(BaseModel):
    """Full hierarchy tree response"""
    roots: list[HierarchyTreeNode]
```

### 2.3 Characteristic Schemas

```python
# src/openspc/api/schemas/characteristic.py

from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field, model_validator


class ControlLimits(BaseModel):
    """Control limit values"""
    ucl: float | None = Field(None, description="Upper Control Limit")
    lcl: float | None = Field(None, description="Lower Control Limit")
    target: float | None = Field(None, description="Target value")


class SpecLimits(BaseModel):
    """Specification limits (Voice of Customer)"""
    usl: float | None = Field(None, description="Upper Spec Limit")
    lsl: float | None = Field(None, description="Lower Spec Limit")


class TagProviderConfig(BaseModel):
    """Configuration for TAG provider type"""
    mqtt_topic: str = Field(..., min_length=1)
    trigger_tag: str | None = Field(None, description="Secondary trigger tag")
    trigger_strategy: Literal["ON_CHANGE", "ON_TRIGGER", "ON_TIMER"] = "ON_CHANGE"
    buffer_timeout_seconds: float = Field(60.0, ge=1.0, le=3600.0)


class CharacteristicBase(BaseModel):
    """Base characteristic attributes"""
    name: str = Field(..., min_length=1, max_length=100)
    description: str | None = Field(None, max_length=500)
    subgroup_size: int = Field(1, ge=1, le=25, description="n for X-bar chart")
    provider_type: Literal["MANUAL", "TAG"]


class CharacteristicCreate(CharacteristicBase):
    """Create characteristic request"""
    hierarchy_id: int
    spec_limits: SpecLimits = Field(default_factory=SpecLimits)
    control_limits: ControlLimits = Field(default_factory=ControlLimits)
    tag_config: TagProviderConfig | None = None
    enabled_rules: list[int] = Field(
        default=[1, 2, 3, 4, 5, 6, 7, 8],
        description="Nelson rule IDs to enable"
    )

    @model_validator(mode="after")
    def validate_tag_config(self):
        if self.provider_type == "TAG" and not self.tag_config:
            raise ValueError("tag_config required for TAG provider")
        return self


class CharacteristicUpdate(BaseModel):
    """Update characteristic request"""
    name: str | None = Field(None, min_length=1, max_length=100)
    description: str | None = None
    subgroup_size: int | None = Field(None, ge=1, le=25)
    spec_limits: SpecLimits | None = None
    control_limits: ControlLimits | None = None
    tag_config: TagProviderConfig | None = None
    enabled_rules: list[int] | None = None


class CharacteristicResponse(CharacteristicBase):
    """Characteristic response"""
    id: int
    hierarchy_id: int
    hierarchy_path: str  # e.g., "Raleigh_Site / Bottling_Line_A"
    spec_limits: SpecLimits
    control_limits: ControlLimits
    tag_config: TagProviderConfig | None
    enabled_rules: list[int]
    sample_count: int
    last_sample_at: datetime | None
    in_control: bool  # Based on most recent sample
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CharacteristicSummary(BaseModel):
    """Lightweight characteristic for lists"""
    id: int
    name: str
    hierarchy_id: int
    hierarchy_path: str
    provider_type: Literal["MANUAL", "TAG"]
    in_control: bool
    last_sample_at: datetime | None
    unacknowledged_violations: int


class ControlLimitRecalculateRequest(BaseModel):
    """Request to recalculate control limits"""
    sample_count: int = Field(
        25,
        ge=10,
        le=100,
        description="Number of samples to use for calculation"
    )
    exclude_out_of_control: bool = Field(
        True,
        description="Exclude samples with violations from calculation"
    )


class ControlLimitRecalculateResponse(BaseModel):
    """Response from control limit recalculation"""
    previous_ucl: float | None
    previous_lcl: float | None
    new_ucl: float
    new_lcl: float
    center_line: float
    sigma: float
    samples_used: int
    method: Literal["R_BAR_D2", "S_C4", "MOVING_RANGE"]
```

### 2.4 Sample Schemas

```python
# src/openspc/api/schemas/sample.py

from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field, model_validator


class SampleContext(BaseModel):
    """Contextual information for a sample"""
    batch_number: str | None = Field(None, max_length=100)
    operator_id: str | None = Field(None, max_length=100)
    comment: str | None = Field(None, max_length=500)
    metadata: dict[str, str] = Field(default_factory=dict)


class SampleCreate(BaseModel):
    """Create sample request (Manual Provider)"""
    characteristic_id: int
    measurements: list[float] = Field(
        ...,
        min_length=1,
        max_length=25,
        description="Measurement values (count must match subgroup_size)"
    )
    timestamp: datetime | None = Field(
        None,
        description="Sample timestamp, defaults to server time"
    )
    context: SampleContext = Field(default_factory=SampleContext)

    @model_validator(mode="after")
    def validate_measurements(self):
        # Note: Actual subgroup_size validation happens in service layer
        if not self.measurements:
            raise ValueError("At least one measurement required")
        return self


class MeasurementResponse(BaseModel):
    """Individual measurement value"""
    id: int
    value: float

    class Config:
        from_attributes = True


class SampleResponse(BaseModel):
    """Sample response with measurements"""
    id: int
    characteristic_id: int
    timestamp: datetime
    measurements: list[MeasurementResponse]
    context: SampleContext
    is_excluded: bool

    # Calculated values
    mean: float  # Subgroup mean
    range: float | None  # Subgroup range (null if n=1)
    std_dev: float | None  # Subgroup std dev (null if n=1)

    # SPC status
    in_control: bool
    violations: list["ViolationSummary"] = []

    class Config:
        from_attributes = True


class SampleListItem(BaseModel):
    """Lightweight sample for chart data"""
    id: int
    timestamp: datetime
    mean: float
    range: float | None
    in_control: bool
    violation_count: int
    is_excluded: bool


class SampleExcludeRequest(BaseModel):
    """Request to exclude/include sample from calculations"""
    is_excluded: bool
    reason: str | None = Field(None, max_length=500)


class ChartData(BaseModel):
    """Data for control chart rendering"""
    characteristic_id: int
    characteristic_name: str
    subgroup_size: int
    chart_type: Literal["IMR", "XBAR_R", "XBAR_S"]

    # Control limits
    center_line: float
    ucl: float
    lcl: float

    # Zone boundaries (for coloring)
    zone_a_upper: float  # 2-3 sigma
    zone_a_lower: float
    zone_b_upper: float  # 1-2 sigma
    zone_b_lower: float

    # Spec limits (optional)
    usl: float | None
    lsl: float | None

    # Sample data points
    samples: list[SampleListItem]


class SampleBatchCreate(BaseModel):
    """Batch sample creation for historical import"""
    characteristic_id: int
    samples: list[SampleCreate] = Field(..., min_length=1, max_length=1000)
    skip_rule_evaluation: bool = Field(
        False,
        description="Skip Nelson rules for historical import"
    )
```

### 2.5 Violation Schemas

```python
# src/openspc/api/schemas/violation.py

from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field


class ViolationSummary(BaseModel):
    """Lightweight violation for embedding in sample"""
    id: int
    rule_id: int
    rule_name: str
    severity: Literal["WARNING", "CRITICAL"]
    acknowledged: bool


class ViolationResponse(BaseModel):
    """Full violation details"""
    id: int
    sample_id: int
    characteristic_id: int
    characteristic_name: str

    rule_id: int
    rule_name: str
    severity: Literal["WARNING", "CRITICAL"]

    # Timestamps
    detected_at: datetime
    acknowledged: bool
    ack_user: str | None
    ack_reason: str | None
    ack_timestamp: datetime | None

    # Sample context
    sample_timestamp: datetime
    sample_mean: float
    batch_number: str | None
    operator_id: str | None

    class Config:
        from_attributes = True


class ViolationAcknowledge(BaseModel):
    """Acknowledge violation request"""
    reason: str = Field(..., min_length=1, max_length=500)
    user: str = Field(..., min_length=1, max_length=100)


class ViolationListFilter(BaseModel):
    """Filters for violation list"""
    characteristic_id: int | None = None
    hierarchy_id: int | None = None
    acknowledged: bool | None = None
    severity: Literal["WARNING", "CRITICAL"] | None = None
    rule_id: int | None = None
    from_date: datetime | None = None
    to_date: datetime | None = None


class ViolationStats(BaseModel):
    """Violation statistics for dashboard"""
    total_unacknowledged: int
    critical_count: int
    warning_count: int
    by_rule: dict[str, int]  # rule_name -> count
    by_characteristic: list[dict]  # [{char_id, char_name, count}]
```

---

## 3. REST API Endpoints

### 3.1 Hierarchy Endpoints

#### GET /api/v1/hierarchy
Get hierarchy tree.

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| flat | bool | No | Return flat list instead of tree |
| include_characteristics | bool | No | Include characteristic counts |

**Response:** `200 OK`
```json
{
  "data": {
    "roots": [
      {
        "id": 1,
        "name": "Raleigh_Site",
        "type": "Site",
        "parent_id": null,
        "path": "/1/",
        "depth": 0,
        "children": [
          {
            "id": 2,
            "name": "Bottling_Line_A",
            "type": "Line",
            "parent_id": 1,
            "path": "/1/2/",
            "depth": 1,
            "children": [],
            "characteristic_count": 2
          }
        ],
        "characteristic_count": 0
      }
    ]
  }
}
```

#### POST /api/v1/hierarchy
Create hierarchy node.

**Request Body:**
```json
{
  "name": "Bottling_Line_B",
  "type": "Line",
  "parent_id": 1
}
```

**Response:** `201 Created`
```json
{
  "data": {
    "id": 3,
    "name": "Bottling_Line_B",
    "type": "Line",
    "parent_id": 1,
    "path": "/1/3/",
    "depth": 1,
    "created_at": "2026-02-02T12:00:00Z",
    "updated_at": "2026-02-02T12:00:00Z"
  }
}
```

#### GET /api/v1/hierarchy/{id}
Get hierarchy node by ID.

**Response:** `200 OK`

#### PATCH /api/v1/hierarchy/{id}
Update hierarchy node.

**Request Body:**
```json
{
  "name": "Bottling_Line_B_Updated"
}
```

**Response:** `200 OK`

#### DELETE /api/v1/hierarchy/{id}
Delete hierarchy node.

**Response:** `204 No Content`

**Error:** `409 Conflict` if node has children or characteristics.

#### GET /api/v1/hierarchy/{id}/characteristics
Get all characteristics under a hierarchy node (recursive).

**Response:** `200 OK`
```json
{
  "data": {
    "items": [
      {
        "id": 1,
        "name": "Product_pH",
        "provider_type": "MANUAL",
        "in_control": true,
        "unacknowledged_violations": 0
      }
    ],
    "total": 1
  }
}
```

---

### 3.2 Characteristic Endpoints

#### GET /api/v1/characteristics
List all characteristics with pagination and filtering.

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| hierarchy_id | int | No | Filter by hierarchy node |
| provider_type | string | No | Filter by "MANUAL" or "TAG" |
| in_control | bool | No | Filter by control status |
| offset | int | No | Pagination offset (default: 0) |
| limit | int | No | Pagination limit (default: 50, max: 500) |

**Response:** `200 OK`
```json
{
  "data": {
    "items": [
      {
        "id": 1,
        "name": "Product_pH",
        "hierarchy_id": 2,
        "hierarchy_path": "Raleigh_Site / Bottling_Line_A",
        "provider_type": "MANUAL",
        "subgroup_size": 1,
        "spec_limits": { "usl": 7.8, "lsl": 6.8 },
        "control_limits": { "ucl": 7.6, "lcl": 7.0, "target": 7.3 },
        "enabled_rules": [1, 2, 3],
        "sample_count": 150,
        "last_sample_at": "2026-02-02T11:30:00Z",
        "in_control": true
      }
    ],
    "total": 2,
    "offset": 0,
    "limit": 50,
    "has_more": false
  }
}
```

#### POST /api/v1/characteristics
Create new characteristic.

**Request Body:**
```json
{
  "name": "Fill_Volume_mL",
  "description": "Bottle fill volume measurement",
  "hierarchy_id": 2,
  "subgroup_size": 5,
  "provider_type": "TAG",
  "spec_limits": {
    "usl": 360.0,
    "lsl": 350.0
  },
  "control_limits": {
    "target": 355.0
  },
  "tag_config": {
    "mqtt_topic": "spc/Raleigh/BottlingA/Filler/Vol",
    "trigger_strategy": "ON_CHANGE",
    "buffer_timeout_seconds": 60
  },
  "enabled_rules": [1, 2, 3, 5, 6]
}
```

**Response:** `201 Created`

#### GET /api/v1/characteristics/{id}
Get characteristic by ID.

**Response:** `200 OK` with full `CharacteristicResponse`

#### PATCH /api/v1/characteristics/{id}
Update characteristic.

**Request Body:** Partial `CharacteristicUpdate`

**Response:** `200 OK`

#### DELETE /api/v1/characteristics/{id}
Delete characteristic.

**Response:** `204 No Content`

**Error:** `409 Conflict` if characteristic has samples (use archive instead).

#### GET /api/v1/characteristics/{id}/chart-data
Get data for control chart rendering.

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| limit | int | No | Number of samples (default: 50, max: 200) |
| from_date | datetime | No | Start of date range |
| to_date | datetime | No | End of date range |

**Response:** `200 OK`
```json
{
  "data": {
    "characteristic_id": 1,
    "characteristic_name": "Product_pH",
    "subgroup_size": 1,
    "chart_type": "IMR",
    "center_line": 7.3,
    "ucl": 7.6,
    "lcl": 7.0,
    "zone_a_upper": 7.5,
    "zone_a_lower": 7.1,
    "zone_b_upper": 7.4,
    "zone_b_lower": 7.2,
    "usl": 7.8,
    "lsl": 6.8,
    "samples": [
      {
        "id": 100,
        "timestamp": "2026-02-02T10:00:00Z",
        "mean": 7.25,
        "range": null,
        "in_control": true,
        "violation_count": 0,
        "is_excluded": false
      }
    ]
  }
}
```

#### POST /api/v1/characteristics/{id}/recalculate-limits
Recalculate control limits from historical data.

**Request Body:**
```json
{
  "sample_count": 25,
  "exclude_out_of_control": true
}
```

**Response:** `200 OK`
```json
{
  "data": {
    "previous_ucl": 7.6,
    "previous_lcl": 7.0,
    "new_ucl": 7.55,
    "new_lcl": 7.05,
    "center_line": 7.30,
    "sigma": 0.083,
    "samples_used": 25,
    "method": "MOVING_RANGE"
  }
}
```

#### GET /api/v1/characteristics/{id}/rules
Get Nelson rule configuration for characteristic.

**Response:** `200 OK`
```json
{
  "data": {
    "characteristic_id": 1,
    "rules": [
      {
        "rule_id": 1,
        "name": "Outlier",
        "description": "One point beyond Zone A (> 3 sigma from Mean)",
        "severity": "CRITICAL",
        "enabled": true
      },
      {
        "rule_id": 2,
        "name": "Shift",
        "description": "9 points in a row on same side of center line",
        "severity": "WARNING",
        "enabled": true
      }
    ]
  }
}
```

#### PUT /api/v1/characteristics/{id}/rules
Update enabled rules for characteristic.

**Request Body:**
```json
{
  "enabled_rules": [1, 2, 3, 5, 6]
}
```

**Response:** `200 OK`

---

### 3.3 Sample Endpoints

#### GET /api/v1/samples
List samples with filtering.

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| characteristic_id | int | Yes | Filter by characteristic |
| from_date | datetime | No | Start of date range |
| to_date | datetime | No | End of date range |
| in_control | bool | No | Filter by control status |
| is_excluded | bool | No | Filter by exclusion status |
| offset | int | No | Pagination offset |
| limit | int | No | Pagination limit |

**Response:** `200 OK` with paginated `SampleResponse` list

#### POST /api/v1/samples
Submit new sample (Manual Provider).

**Request Body:**
```json
{
  "characteristic_id": 1,
  "measurements": [7.35],
  "timestamp": "2026-02-02T12:00:00Z",
  "context": {
    "batch_number": "BATCH-2026-0202-001",
    "operator_id": "J.Smith",
    "comment": "Routine check"
  }
}
```

**Response:** `201 Created`
```json
{
  "data": {
    "id": 151,
    "characteristic_id": 1,
    "timestamp": "2026-02-02T12:00:00Z",
    "measurements": [{ "id": 301, "value": 7.35 }],
    "context": {
      "batch_number": "BATCH-2026-0202-001",
      "operator_id": "J.Smith",
      "comment": "Routine check"
    },
    "is_excluded": false,
    "mean": 7.35,
    "range": null,
    "std_dev": null,
    "in_control": true,
    "violations": []
  }
}
```

**Error Responses:**
- `400 Bad Request`: Measurements count doesn't match subgroup_size
- `400 Bad Request`: Value outside reasonable range
- `404 Not Found`: Characteristic not found
- `409 Conflict`: Characteristic provider_type is TAG

#### GET /api/v1/samples/{id}
Get sample by ID with full details.

**Response:** `200 OK` with `SampleResponse`

#### PATCH /api/v1/samples/{id}/exclude
Mark sample as excluded from calculations.

**Request Body:**
```json
{
  "is_excluded": true,
  "reason": "Known calibration issue"
}
```

**Response:** `200 OK`

**Note:** This triggers rolling window recalculation for affected characteristic.

#### POST /api/v1/samples/batch
Batch import samples (historical data).

**Request Body:**
```json
{
  "characteristic_id": 1,
  "samples": [
    {
      "measurements": [7.30],
      "timestamp": "2026-02-01T08:00:00Z",
      "context": { "operator_id": "J.Smith" }
    },
    {
      "measurements": [7.32],
      "timestamp": "2026-02-01T09:00:00Z",
      "context": { "operator_id": "J.Smith" }
    }
  ],
  "skip_rule_evaluation": true
}
```

**Response:** `201 Created`
```json
{
  "data": {
    "imported_count": 2,
    "sample_ids": [152, 153]
  }
}
```

---

### 3.4 Violation Endpoints

#### GET /api/v1/violations
List violations with filtering.

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| characteristic_id | int | No | Filter by characteristic |
| hierarchy_id | int | No | Filter by hierarchy (recursive) |
| acknowledged | bool | No | Filter by acknowledgment status |
| severity | string | No | Filter by "WARNING" or "CRITICAL" |
| rule_id | int | No | Filter by specific Nelson rule |
| from_date | datetime | No | Start of date range |
| to_date | datetime | No | End of date range |
| offset | int | No | Pagination offset |
| limit | int | No | Pagination limit |

**Response:** `200 OK`
```json
{
  "data": {
    "items": [
      {
        "id": 50,
        "sample_id": 150,
        "characteristic_id": 1,
        "characteristic_name": "Product_pH",
        "rule_id": 1,
        "rule_name": "Outlier",
        "severity": "CRITICAL",
        "detected_at": "2026-02-02T11:30:00Z",
        "acknowledged": false,
        "ack_user": null,
        "ack_reason": null,
        "ack_timestamp": null,
        "sample_timestamp": "2026-02-02T11:30:00Z",
        "sample_mean": 7.85,
        "batch_number": "BATCH-2026-0202-001",
        "operator_id": "J.Smith"
      }
    ],
    "total": 1,
    "offset": 0,
    "limit": 50,
    "has_more": false
  }
}
```

#### GET /api/v1/violations/stats
Get violation statistics for dashboard.

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| hierarchy_id | int | No | Filter by hierarchy (recursive) |

**Response:** `200 OK`
```json
{
  "data": {
    "total_unacknowledged": 3,
    "critical_count": 1,
    "warning_count": 2,
    "by_rule": {
      "Outlier": 1,
      "Trend": 2
    },
    "by_characteristic": [
      {
        "characteristic_id": 1,
        "characteristic_name": "Product_pH",
        "count": 2
      },
      {
        "characteristic_id": 2,
        "characteristic_name": "Fill_Volume_mL",
        "count": 1
      }
    ]
  }
}
```

#### GET /api/v1/violations/{id}
Get violation by ID.

**Response:** `200 OK` with `ViolationResponse`

#### POST /api/v1/violations/{id}/acknowledge
Acknowledge a violation.

**Request Body:**
```json
{
  "user": "J.Smith",
  "reason": "Raw material variation - corrected"
}
```

**Response:** `200 OK`
```json
{
  "data": {
    "id": 50,
    "acknowledged": true,
    "ack_user": "J.Smith",
    "ack_reason": "Raw material variation - corrected",
    "ack_timestamp": "2026-02-02T12:00:00Z"
  }
}
```

#### POST /api/v1/violations/batch-acknowledge
Acknowledge multiple violations.

**Request Body:**
```json
{
  "violation_ids": [50, 51, 52],
  "user": "J.Smith",
  "reason": "Reviewed and addressed"
}
```

**Response:** `200 OK`
```json
{
  "data": {
    "acknowledged_count": 3,
    "acknowledged_ids": [50, 51, 52]
  }
}
```

---

## 4. WebSocket Endpoints

### 4.1 /ws/samples

Real-time sample and violation stream.

#### Connection
```
ws://localhost:8000/ws/samples?token=<jwt>
```

#### Client -> Server Messages

**Subscribe to characteristics:**
```json
{
  "type": "subscribe",
  "characteristic_ids": [1, 2, 3]
}
```

**Unsubscribe from characteristics:**
```json
{
  "type": "unsubscribe",
  "characteristic_ids": [1]
}
```

**Ping (keep-alive):**
```json
{
  "type": "ping"
}
```

#### Server -> Client Messages

**New sample:**
```json
{
  "type": "sample",
  "payload": {
    "id": 152,
    "characteristic_id": 1,
    "timestamp": "2026-02-02T12:05:00Z",
    "mean": 7.28,
    "range": null,
    "in_control": true,
    "violation_count": 0
  }
}
```

**New violation:**
```json
{
  "type": "violation",
  "payload": {
    "id": 51,
    "sample_id": 152,
    "characteristic_id": 1,
    "rule_id": 3,
    "rule_name": "Trend",
    "severity": "WARNING"
  }
}
```

**Violation acknowledged:**
```json
{
  "type": "ack_update",
  "payload": {
    "violation_id": 50,
    "acknowledged": true,
    "ack_user": "J.Smith"
  }
}
```

**Control limits updated:**
```json
{
  "type": "control_limits",
  "payload": {
    "characteristic_id": 1,
    "ucl": 7.55,
    "lcl": 7.05,
    "center_line": 7.30
  }
}
```

**Pong (heartbeat response):**
```json
{
  "type": "pong",
  "server_time": "2026-02-02T12:05:00Z"
}
```

**Error:**
```json
{
  "type": "error",
  "code": "INVALID_SUBSCRIPTION",
  "message": "Characteristic 999 not found"
}
```

### 4.2 /ws/alerts

Dedicated alert stream for toast notifications (all characteristics).

#### Connection
```
ws://localhost:8000/ws/alerts?token=<jwt>
```

#### Server -> Client Messages

**Critical violation alert:**
```json
{
  "type": "critical_alert",
  "payload": {
    "violation_id": 51,
    "characteristic_id": 1,
    "characteristic_name": "Product_pH",
    "rule_name": "Outlier",
    "sample_value": 7.92,
    "message": "Product_pH: Outlier detected (7.92 > UCL 7.6)"
  }
}
```

---

## 5. Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| VALIDATION_ERROR | 400 | Request validation failed |
| MEASUREMENT_COUNT_MISMATCH | 400 | Measurements don't match subgroup_size |
| PROVIDER_TYPE_MISMATCH | 409 | Manual sample submitted for TAG characteristic |
| NOT_FOUND | 404 | Resource not found |
| HIERARCHY_HAS_CHILDREN | 409 | Cannot delete node with children |
| CHARACTERISTIC_HAS_SAMPLES | 409 | Cannot delete characteristic with samples |
| ALREADY_ACKNOWLEDGED | 409 | Violation already acknowledged |
| INTERNAL_ERROR | 500 | Unexpected server error |

---

*API specification complete. Ready for implementation.*
