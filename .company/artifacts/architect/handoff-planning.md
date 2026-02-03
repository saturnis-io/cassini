# OpenSPC Implementation Handoff

## Document Information
- **Project:** OpenSPC - Event-Driven Statistical Process Control System
- **From:** Solutions Architect, Virtual Engineering Co.
- **To:** Tech Lead
- **Date:** 2026-02-02
- **Status:** Ready for Implementation

---

## 1. Executive Summary

This document provides the Tech Lead with implementation guidance for OpenSPC based on the completed architectural design. The system is a Python/FastAPI backend with a React frontend for Statistical Process Control in manufacturing environments.

### Key Design Documents
| Document | Purpose |
|----------|---------|
| `component-design.md` | Module structure, class diagrams, DI patterns |
| `api-contracts.md` | REST/WebSocket API specifications with Pydantic schemas |
| `data-model.md` | Database DDL, SQLAlchemy models, query patterns |
| `sequence-diagrams.md` | Key operational flows with timing |

---

## 2. Recommended Implementation Order

### Phase 1: Foundation (Weeks 1-2)

The goal is to have a working SPC engine with manual data entry.

```
Week 1:
├── Day 1-2: Project scaffolding
│   ├── Python package structure (src/openspc/)
│   ├── FastAPI application skeleton
│   ├── Alembic configuration
│   ├── pytest setup with fixtures
│   └── Development environment (Docker Compose)
│
├── Day 3-4: Database layer
│   ├── SQLAlchemy models (hierarchy, characteristic, sample, measurement, violation)
│   ├── Base repository with CRUD
│   ├── Initial Alembic migration
│   └── Database seeding script
│
└── Day 5: Repository implementations
    ├── HierarchyRepository
    ├── CharacteristicRepository
    ├── SampleRepository
    └── ViolationRepository

Week 2:
├── Day 1-2: SPC Engine core
│   ├── RollingWindow data structure
│   ├── WindowSample model
│   ├── Zone calculation logic
│   └── Unit tests with known values
│
├── Day 3-4: Nelson Rules
│   ├── Rule protocol/interface
│   ├── Rules 1-4 implementation
│   ├── Rules 5-8 implementation
│   ├── NelsonRuleLibrary aggregator
│   └── Extensive unit tests (property-based with Hypothesis)
│
└── Day 5: SPCEngine integration
    ├── Sample processing pipeline
    ├── ProcessingResult model
    ├── Integration tests
    └── Manual Provider stub
```

### Phase 2: API Layer (Weeks 3-4)

Expose functionality via REST API and add alert management.

```
Week 3:
├── Day 1-2: Core API endpoints
│   ├── Hierarchy CRUD (/api/v1/hierarchy/*)
│   ├── Characteristic CRUD (/api/v1/characteristics/*)
│   ├── Pydantic request/response schemas
│   └── Dependency injection setup
│
├── Day 3-4: Sample endpoints
│   ├── POST /api/v1/samples (manual submission)
│   ├── GET /api/v1/samples with filtering
│   ├── Sample exclusion endpoint
│   └── Chart data endpoint
│
└── Day 5: Violation endpoints
    ├── GET /api/v1/violations with filtering
    ├── Violation statistics endpoint
    └── API tests with pytest

Week 4:
├── Day 1-2: Alert Manager
│   ├── AlertManager service
│   ├── Violation creation workflow
│   ├── Acknowledgment workflow
│   └── Reason codes management
│
├── Day 3-4: Control limit calculation
│   ├── Statistics module (sigma estimation)
│   ├── R-bar/d2 method implementation
│   ├── Moving range method for n=1
│   ├── Recalculation endpoint
│   └── Statistical validation tests
│
└── Day 5: RollingWindowManager
    ├── In-memory cache with LRU eviction
    ├── Lazy loading from database
    ├── Window invalidation on exclusion
    └── Memory management tests
```

### Phase 3: Integration (Weeks 5-6)

Add MQTT integration and real-time WebSocket updates.

```
Week 5:
├── Day 1-2: MQTT client setup
│   ├── aiomqtt client wrapper
│   ├── Connection lifecycle management
│   ├── Reconnection handling
│   └── Docker Compose with Mosquitto
│
├── Day 3-4: Tag Provider
│   ├── TagProvider implementation
│   ├── SubgroupBuffer with timeout
│   ├── Topic to characteristic mapping
│   └── Trigger strategy handlers
│
└── Day 5: Sparkplug B integration
    ├── Payload decoding
    ├── Violation event publishing
    └── Integration tests with mock broker

Week 6:
├── Day 1-2: WebSocket infrastructure
│   ├── FastAPI WebSocket endpoint
│   ├── Connection manager
│   ├── Subscription handling
│   └── Heartbeat/ping-pong
│
├── Day 3-4: Real-time broadcasting
│   ├── Sample event broadcast
│   ├── Violation event broadcast
│   ├── Acknowledgment updates
│   ├── Control limit updates
│   └── Frontend subscription API
│
└── Day 5: End-to-end integration
    ├── Full flow testing
    ├── Performance benchmarking
    └── Documentation update
```

### Phase 4: Frontend (Weeks 7-9)

React application with operator and engineer views.

```
Week 7:
├── Day 1-2: Frontend scaffolding
│   ├── Vite + React + TypeScript setup
│   ├── Tailwind CSS + shadcn/ui
│   ├── Zustand store setup
│   ├── TanStack Query configuration
│   └── WebSocket hook
│
├── Day 3-4: API client layer
│   ├── Type-safe API client
│   ├── React Query hooks for all endpoints
│   ├── WebSocket message handlers
│   └── Error handling patterns
│
└── Day 5: Routing and layout
    ├── React Router setup
    ├── Layout components
    ├── Navigation sidebar
    └── Authentication placeholder

Week 8:
├── Day 1-2: Control charts
│   ├── Recharts configuration
│   ├── I-MR chart component
│   ├── X-bar R chart component
│   ├── Zone coloring (background bands)
│   └── Point interactivity (click to select)
│
├── Day 3-4: Operator Dashboard
│   ├── Characteristic card list
│   ├── Card status coloring (grey/yellow/red)
│   ├── Sample input modal
│   ├── Live validation against spec limits
│   └── Real-time chart updates
│
└── Day 5: Violation handling
    ├── Toast notifications
    ├── Pulsing violation points on chart
    ├── Violation list panel
    └── Acknowledgment modal

Week 9:
├── Day 1-2: Engineer Configuration
│   ├── Hierarchy tree view
│   ├── Characteristic detail form
│   ├── Nelson rule toggle grid
│   └── Provider configuration
│
├── Day 3-4: Limit management
│   ├── Spec limit inputs
│   ├── Control limit display
│   ├── Recalculation trigger
│   └── Calculation result display
│
└── Day 5: Polish
    ├── Dark mode support
    ├── Mobile responsiveness (tablet)
    ├── Loading states
    └── Error boundaries
```

### Phase 5: Polish and Deployment (Week 10)

Final integration, testing, and deployment preparation.

```
Week 10:
├── Day 1-2: Histogram/distribution view
│   ├── Histogram chart component
│   ├── Normal distribution overlay
│   ├── Spec limit markers
│   └── Cpk calculation display
│
├── Day 3-4: End-to-end testing
│   ├── Playwright E2E tests
│   ├── Critical path coverage
│   ├── Performance testing
│   └── Load testing (1000 characteristics)
│
└── Day 5: Deployment
    ├── Docker images (backend + frontend)
    ├── Docker Compose production config
    ├── Environment configuration
    └── Deployment documentation
```

---

## 3. Module Dependencies

### Dependency Graph

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        APPLICATION ENTRY                                 │
│                          (main.py)                                       │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
         ▼                   ▼                   ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   API Layer     │  │  MQTT Layer     │  │  WebSocket      │
│  (api/v1/*.py)  │  │  (mqtt/*.py)    │  │  (api/v1/ws.py) │
└────────┬────────┘  └────────┬────────┘  └────────┬────────┘
         │                    │                    │
         └────────────────────┼────────────────────┘
                              │
                              ▼
         ┌────────────────────────────────────────┐
         │           CORE LAYER                    │
         │                                         │
         │  ┌─────────────┐  ┌─────────────────┐  │
         │  │ SPCEngine   │──│ AlertManager    │  │
         │  └──────┬──────┘  └─────────────────┘  │
         │         │                              │
         │  ┌──────┴──────┐  ┌─────────────────┐  │
         │  │RollingWindow│  │ NelsonRules     │  │
         │  │  Manager    │  │   Library       │  │
         │  └─────────────┘  └─────────────────┘  │
         │                                         │
         │  ┌─────────────────────────────────┐   │
         │  │        Providers                 │   │
         │  │  ManualProvider | TagProvider   │   │
         │  └─────────────────────────────────┘   │
         └────────────────────┬───────────────────┘
                              │
                              ▼
         ┌────────────────────────────────────────┐
         │         DATA ACCESS LAYER              │
         │                                         │
         │  ┌─────────────────────────────────┐   │
         │  │          Repositories            │   │
         │  │  Hierarchy | Characteristic      │   │
         │  │  Sample    | Violation           │   │
         │  └──────────────┬──────────────────┘   │
         │                 │                       │
         │  ┌──────────────┴──────────────────┐   │
         │  │        SQLAlchemy Models         │   │
         │  └──────────────┬──────────────────┘   │
         │                 │                       │
         │  ┌──────────────┴──────────────────┐   │
         │  │         Database Session         │   │
         │  └─────────────────────────────────┘   │
         └────────────────────────────────────────┘
```

### Implementation Order by Dependency

1. **utils/** - Constants (d2, c4 tables), logging setup
2. **db/models/** - ORM models (no external dependencies)
3. **db/database.py** - Engine and session factory
4. **db/repositories/** - Data access (depends on models)
5. **core/engine/statistics.py** - Pure functions, no dependencies
6. **core/engine/nelson_rules.py** - Rule implementations
7. **core/engine/rolling_window.py** - Window management
8. **core/engine/spc_engine.py** - Orchestration
9. **core/alerts/** - Alert management
10. **core/providers/** - Data providers
11. **api/schemas/** - Pydantic models
12. **api/v1/** - REST endpoints
13. **mqtt/** - MQTT client and Sparkplug
14. **api/v1/websocket.py** - Real-time updates

---

## 4. Testing Checkpoints

### Checkpoint 1: Database Layer (End of Week 1)
- [ ] All migrations run successfully
- [ ] Models can be created, read, updated, deleted
- [ ] Foreign key constraints work correctly
- [ ] Indexes exist for common query patterns
- [ ] Repository methods have unit tests

### Checkpoint 2: SPC Engine (End of Week 2)
- [ ] Rolling window maintains correct size
- [ ] Zone calculation matches manual verification
- [ ] All 8 Nelson rules pass test cases with known outcomes
- [ ] Rule 1 (Outlier) detects 3-sigma violations
- [ ] Rule 2 (Shift) detects 9 same-side points
- [ ] Rule 3 (Trend) detects 6 increasing/decreasing points
- [ ] ProcessingResult correctly reports violations

### Checkpoint 3: API Layer (End of Week 3)
- [ ] All CRUD endpoints return correct status codes
- [ ] Validation errors return 400 with details
- [ ] Pagination works for list endpoints
- [ ] Sample submission triggers SPC processing
- [ ] Violations created in database

### Checkpoint 4: Control Limits (End of Week 4)
- [ ] I-MR chart limits match manual calculation
- [ ] R-bar/d2 method matches reference values
- [ ] Recalculation excludes OOC samples when requested
- [ ] Rolling window cache invalidates correctly

### Checkpoint 5: MQTT Integration (End of Week 5)
- [ ] Tag provider subscribes to configured topics
- [ ] Subgroup buffer accumulates correct number of readings
- [ ] Buffer timeout flushes partial subgroups
- [ ] Sparkplug B payloads decoded correctly

### Checkpoint 6: Real-Time Updates (End of Week 6)
- [ ] WebSocket connections established successfully
- [ ] Subscriptions filter messages correctly
- [ ] Sample events broadcast to subscribed clients
- [ ] Violation events trigger toast notifications
- [ ] Acknowledgment updates broadcast to all

### Checkpoint 7: Operator Dashboard (End of Week 8)
- [ ] Control charts render with correct zones
- [ ] Sample input validates against spec limits
- [ ] Violations pulse on chart
- [ ] Acknowledgment workflow completes
- [ ] Real-time updates appear without refresh

### Checkpoint 8: Engineer Config (End of Week 9)
- [ ] Hierarchy tree displays correctly
- [ ] Characteristic CRUD works from UI
- [ ] Nelson rule toggles persist
- [ ] Control limit recalculation triggers from UI

### Checkpoint 9: End-to-End (End of Week 10)
- [ ] Manual sample -> SPC -> Violation -> Ack flow works
- [ ] MQTT tag -> SPC -> WebSocket -> UI update flow works
- [ ] 1000 characteristics load within performance targets
- [ ] Application starts/stops gracefully

---

## 5. Risk Areas and Mitigation

### Risk 1: Nelson Rule Mathematical Errors
**Concern:** Incorrect implementation leads to false positives/negatives.

**Mitigation:**
- Use reference datasets with known outcomes (NIST, ASTM examples)
- Property-based testing with Hypothesis to generate edge cases
- Peer review of rule implementations
- Validation against commercial SPC software outputs

**Test Cases Required:**
```python
# Example: Rule 2 (Shift) test case
def test_rule2_nine_above_center():
    window = create_window(center_line=10.0)
    # 9 points all above 10.0
    samples = [10.5, 10.3, 10.8, 10.2, 10.6, 10.1, 10.4, 10.7, 10.9]
    for s in samples:
        window.append(create_sample(value=s))
    result = rule2.check(window)
    assert result is not None
    assert result.rule_id == 2
```

### Risk 2: MQTT Message Loss Under Load
**Concern:** High-frequency tags may overwhelm the system.

**Mitigation:**
- Implement message buffering in Tag Provider
- Use QoS 1 for critical topics
- Add configurable rate limiting per topic
- Monitor queue depth with metrics

**Configuration:**
```python
# Configurable per-topic settings
class TopicConfig:
    qos: int = 1
    max_buffer_size: int = 1000
    rate_limit_per_second: float = 100.0
    backpressure_strategy: Literal["drop_oldest", "block"] = "drop_oldest"
```

### Risk 3: Rolling Window Consistency
**Concern:** Exclusion handling creates inconsistent window state.

**Mitigation:**
- Atomic operations for window modifications
- Clear state machine for window lifecycle
- Async lock for concurrent access
- Database as source of truth (cache can be rebuilt)

**State Machine:**
```
EMPTY -> LOADING (async DB query)
LOADING -> READY (cache populated)
READY -> UPDATING (append sample)
UPDATING -> READY (sample added)
READY -> INVALIDATING (exclusion change)
INVALIDATING -> LOADING (rebuild from DB)
```

### Risk 4: WebSocket Scale
**Concern:** Many connected clients may exhaust resources.

**Mitigation:**
- Connection limits per client (max 5 concurrent)
- Subscription batching (don't broadcast per-sample)
- Heartbeat timeout to cleanup stale connections
- Message compression for large payloads

**Connection Manager:**
```python
class ConnectionManager:
    MAX_CONNECTIONS_PER_IP = 10
    HEARTBEAT_INTERVAL = 30  # seconds
    HEARTBEAT_TIMEOUT = 90  # seconds
    BATCH_WINDOW = 100  # ms
```

### Risk 5: SQLite Write Contention
**Concern:** High-frequency writes may cause lock contention.

**Mitigation:**
- WAL mode for concurrent reads during writes
- Write batching for sample inserts
- Connection pooling with appropriate timeout
- Consider PostgreSQL for high-scale deployments

**SQLite Configuration:**
```python
# Optimal SQLite settings for SPC workload
PRAGMAS = {
    "journal_mode": "WAL",
    "busy_timeout": 5000,
    "synchronous": "NORMAL",
    "cache_size": -64000,  # 64MB
    "foreign_keys": True,
}
```

---

## 6. Environment Configuration

### Required Environment Variables

```bash
# Database
DATABASE_URL=sqlite+aiosqlite:///./openspc.db

# MQTT
MQTT_BROKER_HOST=localhost
MQTT_BROKER_PORT=1883
MQTT_USERNAME=
MQTT_PASSWORD=
MQTT_CLIENT_ID=openspc-server

# Server
SERVER_HOST=0.0.0.0
SERVER_PORT=8000
LOG_LEVEL=INFO

# Security (future)
JWT_SECRET_KEY=your-secret-key
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=60

# Performance
ROLLING_WINDOW_CACHE_SIZE=1000
SAMPLE_BATCH_SIZE=100
WEBSOCKET_HEARTBEAT_SECONDS=30
```

### Docker Compose (Development)

```yaml
version: '3.8'
services:
  backend:
    build: ./backend
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=sqlite+aiosqlite:///./data/openspc.db
      - MQTT_BROKER_HOST=mosquitto
    volumes:
      - ./data:/app/data
    depends_on:
      - mosquitto

  frontend:
    build: ./frontend
    ports:
      - "5173:5173"
    depends_on:
      - backend

  mosquitto:
    image: eclipse-mosquitto:2
    ports:
      - "1883:1883"
      - "9001:9001"
    volumes:
      - ./mosquitto/config:/mosquitto/config
```

---

## 7. Definition of Done

A feature is complete when:

1. **Code Complete**
   - Implementation matches specification
   - Type hints on all public functions
   - Docstrings on classes and complex functions

2. **Tests Pass**
   - Unit tests with >80% coverage
   - Integration tests for API endpoints
   - All existing tests still pass

3. **Code Quality**
   - Ruff linting passes
   - mypy type checking passes
   - Code reviewed by peer

4. **Documentation**
   - API endpoint documented in OpenAPI
   - Complex logic has inline comments
   - README updated if applicable

5. **Deployed**
   - Migrations run successfully
   - Feature works in Docker environment
   - No regressions in staging

---

## 8. Communication Plan

### Daily Standups
- What was completed
- What's planned
- Any blockers

### Weekly Demos
- End of each phase: demo to stakeholders
- Phase 1: Show manual sample -> violation detection
- Phase 2: Show API in Swagger, alert workflow
- Phase 3: Show MQTT integration, real-time updates
- Phase 4: Show full UI with operator dashboard
- Phase 5: Show production deployment

### Escalation Path
- Technical blockers: Escalate to Architect within 4 hours
- Design questions: Refer to specification documents first
- Out-of-scope requests: Document and defer to next phase

---

## 9. Reference Links

### Internal Documents
- `component-design.md` - Class diagrams and module structure
- `api-contracts.md` - REST API specification
- `data-model.md` - Database schema and queries
- `sequence-diagrams.md` - Operational flows

### External References
- [ASTM E2587](https://www.astm.org/e2587-16.html) - Control Chart Constants
- [Sparkplug B Spec](https://sparkplug.eclipse.org/) - MQTT Payload Format
- [ISA-95](https://www.isa.org/isa95) - Manufacturing Hierarchy

### Technology Documentation
- [FastAPI](https://fastapi.tiangolo.com/)
- [SQLAlchemy 2.0](https://docs.sqlalchemy.org/en/20/)
- [aiomqtt](https://sbtinstruments.github.io/aiomqtt/)
- [Recharts](https://recharts.org/)
- [Zustand](https://docs.pmnd.rs/zustand/getting-started/introduction)

---

*Handoff complete. Implementation can begin immediately.*

**Next Action:** Tech Lead to review and schedule kick-off meeting with development team.
