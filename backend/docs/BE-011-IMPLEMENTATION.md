# BE-011: Sample REST Endpoints Implementation

## Overview
This document describes the implementation of the `/api/v1/samples/*` REST endpoints for manual sample submission and management in OpenSPC.

## Files Created

### 1. API Endpoints
**File:** `backend/src/openspc/api/v1/samples.py`

Implements all required REST endpoints for sample operations:
- `POST /api/v1/samples/` - Submit manual sample for SPC processing
- `GET /api/v1/samples/` - List samples with filtering and pagination
- `GET /api/v1/samples/{sample_id}` - Get sample details
- `PATCH /api/v1/samples/{sample_id}/exclude` - Toggle sample exclusion
- `POST /api/v1/samples/batch` - Batch import samples

### 2. Integration Tests
**File:** `backend/tests/integration/test_samples_api.py`

Comprehensive integration tests covering:
- Valid sample submission (subgroups and individuals)
- Validation error handling
- List filtering (characteristic, date range, exclusion)
- Pagination
- Sample retrieval
- Exclusion toggling
- Batch import (with and without rule evaluation)

### 3. Router Export
**File:** `backend/src/openspc/api/v1/__init__.py`

Updated to export the samples router for inclusion in the main application.

## API Endpoints

### POST /api/v1/samples/
Submit a manual sample for SPC processing.

**Request Body:**
```json
{
  "characteristic_id": 1,
  "measurements": [100.1, 100.2, 99.9, 100.0, 100.3],
  "batch_number": "BATCH-001",
  "operator_id": "OPR-123"
}
```

**Response (201 Created):**
```json
{
  "sample_id": 42,
  "timestamp": "2025-02-03T10:30:00Z",
  "mean": 100.1,
  "range_value": 0.4,
  "zone": "zone_c_upper",
  "in_control": true,
  "violations": [],
  "processing_time_ms": 12.5
}
```

**Features:**
- Full SPC processing through the engine
- Nelson Rule evaluation
- Returns violations immediately
- Atomic transaction handling
- Comprehensive error handling

### GET /api/v1/samples/
List samples with filtering and pagination.

**Query Parameters:**
- `characteristic_id` (optional) - Filter by characteristic
- `start_date` (optional) - Filter by start date (inclusive)
- `end_date` (optional) - Filter by end date (inclusive)
- `include_excluded` (default: false) - Include excluded samples
- `offset` (default: 0) - Pagination offset
- `limit` (default: 100, max: 1000) - Page size

**Response (200 OK):**
```json
{
  "items": [
    {
      "id": 42,
      "char_id": 1,
      "timestamp": "2025-02-03T10:30:00Z",
      "batch_number": "BATCH-001",
      "operator_id": "OPR-123",
      "is_excluded": false,
      "measurements": [100.1, 100.2, 99.9, 100.0, 100.3],
      "mean": 100.1,
      "range_value": 0.4
    }
  ],
  "total": 150,
  "offset": 0,
  "limit": 100
}
```

### GET /api/v1/samples/{sample_id}
Get detailed information about a specific sample.

**Response (200 OK):**
```json
{
  "id": 42,
  "char_id": 1,
  "timestamp": "2025-02-03T10:30:00Z",
  "batch_number": "BATCH-001",
  "operator_id": "OPR-123",
  "is_excluded": false,
  "measurements": [100.1, 100.2, 99.9, 100.0, 100.3],
  "mean": 100.1,
  "range_value": 0.4
}
```

**Errors:**
- 404 Not Found - Sample doesn't exist

### PATCH /api/v1/samples/{sample_id}/exclude
Toggle sample exclusion status.

**Request Body:**
```json
{
  "is_excluded": true,
  "reason": "Outlier due to equipment malfunction"
}
```

**Response (200 OK):**
```json
{
  "id": 42,
  "char_id": 1,
  "timestamp": "2025-02-03T10:30:00Z",
  "batch_number": "BATCH-001",
  "operator_id": "OPR-123",
  "is_excluded": true,
  "measurements": [100.1, 100.2, 99.9, 100.0, 100.3],
  "mean": 100.1,
  "range_value": 0.4
}
```

**Side Effects:**
- Invalidates the rolling window cache for the characteristic
- Forces recalculation on next sample submission

**Errors:**
- 404 Not Found - Sample doesn't exist

### POST /api/v1/samples/batch
Batch import samples for historical data migration.

**Query Parameters:**
- `skip_rule_evaluation` (default: false) - Skip Nelson Rule checks for performance

**Request Body:**
```json
[
  {
    "characteristic_id": 1,
    "measurements": [100.1, 100.2, 99.9, 100.0, 100.3],
    "batch_number": "BATCH-001"
  },
  {
    "characteristic_id": 1,
    "measurements": [100.2, 100.3, 100.0, 100.1, 100.4],
    "batch_number": "BATCH-002"
  }
]
```

**Response (200 OK):**
```json
{
  "total": 100,
  "successful": 98,
  "failed": 2,
  "errors": [
    "Sample 5: Expected 5 measurements for characteristic 1, got 3",
    "Sample 23: Characteristic 999 not found"
  ]
}
```

**Features:**
- Continues processing on errors (best-effort)
- Returns detailed error messages
- Optional skip of rule evaluation for performance
- Atomic transaction (all or nothing)

## Architecture

### Dependency Injection
The API uses FastAPI's dependency injection for:
- Database sessions
- Repository instances
- SPC engine with all dependencies
- Manual provider

This ensures:
- Clean separation of concerns
- Easy testing with mock dependencies
- Proper resource management
- Transaction handling

### SPC Processing Flow
1. Validate request data (Pydantic schemas)
2. Create sample and measurements in database
3. Calculate statistics (mean, range)
4. Update rolling window with zone classification
5. Evaluate enabled Nelson Rules
6. Create violation records for triggered rules
7. Return comprehensive result

### Error Handling
- **400 Bad Request** - Validation errors (wrong measurement count, invalid characteristic)
- **404 Not Found** - Sample or characteristic doesn't exist
- **500 Internal Server Error** - Unexpected errors

All errors include descriptive messages for debugging.

## Testing

### Integration Tests
The test suite covers:
- ✅ Valid sample submission (subgroups and individuals)
- ✅ Invalid measurement count validation
- ✅ Non-existent characteristic handling
- ✅ List filtering by characteristic
- ✅ List filtering by date range
- ✅ Exclusion filtering
- ✅ Pagination
- ✅ Sample retrieval
- ✅ Exclusion toggling
- ✅ Batch import with rule evaluation
- ✅ Batch import without rule evaluation
- ✅ Partial batch failures

### Running Tests
```bash
# Run all sample API tests
pytest backend/tests/integration/test_samples_api.py -v

# Run specific test class
pytest backend/tests/integration/test_samples_api.py::TestSubmitSample -v

# Run with coverage
pytest backend/tests/integration/test_samples_api.py --cov=openspc.api.v1.samples
```

## Usage Examples

### Submit a Single Sample
```python
import httpx

async with httpx.AsyncClient() as client:
    response = await client.post(
        "http://localhost:8000/api/v1/samples/",
        json={
            "characteristic_id": 1,
            "measurements": [100.1, 100.2, 99.9, 100.0, 100.3],
            "batch_number": "BATCH-001",
            "operator_id": "OPR-123"
        }
    )
    result = response.json()
    print(f"Sample {result['sample_id']}: In control = {result['in_control']}")
```

### List Recent Samples
```python
async with httpx.AsyncClient() as client:
    response = await client.get(
        "http://localhost:8000/api/v1/samples/",
        params={
            "characteristic_id": 1,
            "limit": 25,
            "offset": 0
        }
    )
    data = response.json()
    print(f"Total samples: {data['total']}")
    for sample in data['items']:
        print(f"  {sample['timestamp']}: {sample['mean']}")
```

### Exclude an Outlier Sample
```python
async with httpx.AsyncClient() as client:
    response = await client.patch(
        "http://localhost:8000/api/v1/samples/42/exclude",
        json={
            "is_excluded": True,
            "reason": "Equipment calibration in progress"
        }
    )
    result = response.json()
    print(f"Sample excluded: {result['is_excluded']}")
```

### Batch Import Historical Data
```python
async with httpx.AsyncClient() as client:
    samples = [
        {
            "characteristic_id": 1,
            "measurements": [100.0 + i, 100.1 + i, 99.9 + i, 100.0 + i, 100.2 + i]
        }
        for i in range(1000)
    ]

    response = await client.post(
        "http://localhost:8000/api/v1/samples/batch",
        params={"skip_rule_evaluation": True},  # For performance
        json=samples
    )
    result = response.json()
    print(f"Imported {result['successful']}/{result['total']} samples")
```

## Performance Considerations

1. **Batch Import**: Use `skip_rule_evaluation=true` for large historical imports
2. **Pagination**: Default limit is 100, max is 1000 to prevent memory issues
3. **Rolling Window Cache**: Invalidated on exclusion to maintain accuracy
4. **Transaction Size**: Batch imports are atomic but large batches may impact memory

## Future Enhancements

- Add support for async batch processing with task queues
- Implement sample update/delete endpoints
- Add export functionality (CSV, Excel)
- Support for multiple exclusion reasons with audit trail
- Webhook notifications for violations
- Real-time WebSocket updates for sample submissions

## Acceptance Criteria Status

- ✅ POST /samples triggers full SPC processing
- ✅ POST returns violations in response
- ✅ Exclude toggle triggers rolling window rebuild
- ✅ Batch import supports skip_rule_evaluation
- ✅ List filters by characteristic_id, date range
- ✅ Proper validation of measurement count

All acceptance criteria have been met and tested.
