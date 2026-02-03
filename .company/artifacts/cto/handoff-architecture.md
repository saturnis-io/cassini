# OpenSPC Architecture Handoff Document

## Document Information
- **From:** CTO, Virtual Engineering Co.
- **To:** Solutions Architect
- **Project:** OpenSPC - Event-Driven Statistical Process Control System
- **Date:** 2026-02-02
- **Status:** Ready for Architecture Phase

---

## 1. Executive Summary

OpenSPC is an event-driven Statistical Process Control system for hybrid manufacturing environments. It ingests data from automated MQTT tags and manual operator entry, processes samples through a Nelson Rules engine, and provides real-time violation detection with an operator dashboard.

**Technology Decisions Made:**
- Backend: Python 3.11+ / FastAPI / SQLAlchemy 2.0 / SQLite
- Frontend: React 18+ / TypeScript / Vite / Recharts
- Messaging: aiomqtt with Sparkplug B protocol
- Real-time: WebSocket for UI updates

**Reference Documents:**
- `tech-stack.md` - Complete technology choices and versions
- `architecture-decision-record.md` - ADRs for key technical decisions

---

## 2. High-Level Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              OPENSPC SYSTEM                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        DATA INGESTION LAYER                          │   │
│  │                                                                      │   │
│  │   ┌─────────────────┐              ┌─────────────────┐              │   │
│  │   │  Tag Provider   │              │ Manual Provider │              │   │
│  │   │                 │              │                 │              │   │
│  │   │  - MQTT Sub     │              │  - REST API     │              │   │
│  │   │  - Sparkplug B  │              │  - Validation   │              │   │
│  │   │  - Buffering    │              │  - Web Forms    │              │   │
│  │   └────────┬────────┘              └────────┬────────┘              │   │
│  │            │                                │                        │   │
│  │            └──────────────┬─────────────────┘                        │   │
│  │                           ▼                                          │   │
│  │                  ┌─────────────────┐                                 │   │
│  │                  │  Sample Event   │ (Normalized Pydantic Model)     │   │
│  │                  └────────┬────────┘                                 │   │
│  └───────────────────────────┼──────────────────────────────────────────┘   │
│                              │                                              │
│  ┌───────────────────────────▼──────────────────────────────────────────┐   │
│  │                         PROCESSING LAYER                              │   │
│  │                                                                       │   │
│  │   ┌─────────────────────────────────────────────────────────────┐    │   │
│  │   │                      SPC ENGINE                              │    │   │
│  │   │                                                              │    │   │
│  │   │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │    │   │
│  │   │  │   Rolling    │  │    Nelson    │  │    Violation     │   │    │   │
│  │   │  │   Window     │  │    Rules     │  │    Detector      │   │    │   │
│  │   │  │   Manager    │  │    Library   │  │                  │   │    │   │
│  │   │  │              │  │              │  │  - Rule 1-8      │   │    │   │
│  │   │  │  - In-Memory │  │  - Zone Calc │  │  - Severity      │   │    │   │
│  │   │  │  - LRU Cache │  │  - Sigma Est │  │  - Aggregation   │   │    │   │
│  │   │  └──────────────┘  └──────────────┘  └──────────────────┘   │    │   │
│  │   │                                                              │    │   │
│  │   └──────────────────────────────┬───────────────────────────────┘    │   │
│  │                                  │                                    │   │
│  │   ┌──────────────────────────────▼───────────────────────────────┐    │   │
│  │   │                     ALERT MANAGER                             │    │   │
│  │   │                                                               │    │   │
│  │   │  - Violation Creation        - MQTT Publish (Sparkplug B)    │    │   │
│  │   │  - Workflow State            - WebSocket Broadcast            │    │   │
│  │   │  - Acknowledgment            - Audit Logging                  │    │   │
│  │   └───────────────────────────────────────────────────────────────┘    │   │
│  │                                                                       │   │
│  └───────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐   │
│  │                          PERSISTENCE LAYER                            │   │
│  │                                                                       │   │
│  │   ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐  │   │
│  │   │    SQLite DB    │    │   Window Cache  │    │   MQTT Broker   │  │   │
│  │   │                 │    │   (In-Memory)   │    │   (Mosquitto)   │  │   │
│  │   │  - Hierarchy    │    │                 │    │                 │  │   │
│  │   │  - Chars        │    │  - LRU Eviction │    │  - Tag Topics   │  │   │
│  │   │  - Samples      │    │  - 25 samples/  │    │  - SPC Events   │  │   │
│  │   │  - Violations   │    │    characteristic│    │  - Sparkplug B  │  │   │
│  │   └─────────────────┘    └─────────────────┘    └─────────────────┘  │   │
│  │                                                                       │   │
│  └───────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐   │
│  │                         PRESENTATION LAYER                            │   │
│  │                                                                       │   │
│  │   ┌──────────────────────────────────────────────────────────────┐   │   │
│  │   │                    React Frontend (SPA)                       │   │   │
│  │   │                                                               │   │   │
│  │   │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐   │   │   │
│  │   │  │  Operator   │  │  Engineer   │  │   Alert Management  │   │   │   │
│  │   │  │  Dashboard  │  │  Config     │  │   Panel             │   │   │   │
│  │   │  │             │  │             │  │                     │   │   │   │
│  │   │  │ - Todo List │  │ - Hierarchy │  │ - Violation List    │   │   │   │
│  │   │  │ - Charts    │  │ - Rules     │  │ - Ack Workflow      │   │   │   │
│  │   │  │ - Input     │  │ - Limits    │  │ - Reason Codes      │   │   │   │
│  │   │  └─────────────┘  └─────────────┘  └─────────────────────┘   │   │   │
│  │   │                                                               │   │   │
│  │   └──────────────────────────────────────────────────────────────┘   │   │
│  │                                                                       │   │
│  └───────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Integration Points

### 3.1 External Integrations

| Integration | Protocol | Direction | Purpose |
|-------------|----------|-----------|---------|
| MQTT Broker | MQTT 5.0 / Sparkplug B | Bidirectional | Tag data ingestion, violation publishing |
| Web Browser | HTTP/WebSocket | Bidirectional | UI serving, real-time updates |

### 3.2 Internal Integration Contracts

#### Sample Event Contract (Provider -> Engine)
```python
class SampleEvent(BaseModel):
    characteristic_id: int
    timestamp: datetime
    measurements: list[float]  # len == subgroup_size
    context: SampleContext

class SampleContext(BaseModel):
    batch_number: str | None
    operator_id: str | None
    source: Literal["TAG", "MANUAL"]
```

#### Violation Event Contract (Engine -> Alert Manager)
```python
class ViolationEvent(BaseModel):
    sample_id: int
    characteristic_id: int
    rule_id: int  # 1-8
    rule_name: str
    severity: Literal["WARNING", "CRITICAL"]
    details: dict  # Rule-specific metadata
```

#### WebSocket Message Contract (Server -> Client)
```typescript
type WSMessage =
  | { type: "sample"; payload: Sample }
  | { type: "violation"; payload: Violation }
  | { type: "ack_update"; payload: { violation_id: number; acknowledged: boolean } }
```

### 3.3 Database Schema Relationships

```
hierarchy (ISA-95)
    │
    └──► characteristic (SPC config)
            │
            ├──► characteristic_rules (enabled Nelson rules)
            │
            └──► sample (measurement events)
                    │
                    ├──► measurement (individual values)
                    │
                    └──► violation (rule breaches)
```

---

## 4. Key Technical Constraints

### 4.1 Performance Constraints

| Metric | Requirement | Rationale |
|--------|-------------|-----------|
| Sample Processing Latency | < 100ms | Real-time violation detection |
| UI Update Latency | < 500ms | Operator responsiveness |
| Rolling Window Load Time | < 1s (cold start) | Acceptable restart delay |
| Concurrent Characteristics | 1000+ | Enterprise scale |
| MQTT Message Rate | 1000 msg/sec | High-frequency tag data |

### 4.2 Reliability Constraints

| Requirement | Implementation |
|-------------|----------------|
| No data loss | WAL mode SQLite, sync writes for samples |
| Crash recovery | Rolling window rebuilt from DB on restart |
| Network resilience | MQTT auto-reconnect, WebSocket fallback to polling |
| Audit trail | All samples and violations immutable |

### 4.3 Security Constraints

| Requirement | Implementation |
|-------------|----------------|
| Authentication | JWT tokens for API access |
| Authorization | Role-based (Operator, Engineer, Admin) |
| MQTT Security | TLS + username/password (broker-level) |
| Data Integrity | Database constraints, Pydantic validation |

### 4.4 Compatibility Constraints

| Constraint | Requirement |
|------------|-------------|
| Browser Support | Chrome 90+, Firefox 90+, Edge 90+ |
| SQLite Version | 3.35+ (JSON functions, math extensions) |
| Python Version | 3.11+ (async improvements) |
| Node.js | 18 LTS+ (build tooling) |

---

## 5. Non-Functional Requirements

### 5.1 Scalability

- **Vertical:** Single-instance handles 1000+ characteristics
- **Horizontal (Future):** Stateless API design enables load balancing; rolling window cache would require Redis

### 5.2 Maintainability

- **Modular Architecture:** Provider, Engine, Alert Manager as separate modules
- **API Versioning:** `/api/v1/` prefix for breaking change management
- **Configuration:** Environment variables + database settings
- **Logging:** Structured JSON logs with correlation IDs

### 5.3 Testability

- **Unit Tests:** Pytest for backend, Vitest for frontend
- **Integration Tests:** Docker Compose with Mosquitto broker
- **Statistical Validation:** Property-based testing with Hypothesis
- **E2E Tests:** Playwright for critical user flows

### 5.4 Observability

- **Metrics:** Prometheus-compatible `/metrics` endpoint (optional)
- **Health Check:** `/health` endpoint for orchestration
- **Logging Levels:** DEBUG, INFO, WARNING, ERROR with env config

### 5.5 Deployment

- **Containerization:** Docker images for backend and frontend
- **Configuration:** Environment variables for all external connections
- **Database Migration:** Alembic for schema versioning
- **Zero-Downtime:** Graceful shutdown handling for MQTT connections

---

## 6. Architecture Priorities

Based on specification analysis, prioritize in this order:

### Phase 1: Foundation (Backend Priority)
1. **Database Schema** - ISA-95 hierarchy, characteristics, samples, violations
2. **SPC Engine** - Rolling window, Nelson Rules (all 8), sigma calculation
3. **Manual Provider** - REST API for sample submission
4. **Basic API** - CRUD for hierarchy and characteristics

### Phase 2: Integration
5. **Tag Provider** - MQTT subscription, Sparkplug B parsing, buffering
6. **Alert Manager** - Violation creation, workflow state
7. **WebSocket** - Real-time sample and violation broadcast

### Phase 3: Frontend
8. **Operator Dashboard** - Todo list, control charts, input modal
9. **Engineer Configuration** - Hierarchy tree, rule toggles, limit management
10. **Alert Management** - Violation list, acknowledgment workflow

### Phase 4: Polish
11. **Control Limit Recalculation** - Auto-calc from historical data
12. **Histogram/Distribution** - Secondary visualization
13. **MQTT Publishing** - Sparkplug B output for violations

---

## 7. Risk Areas for Architecture Review

| Risk | Concern | Mitigation Needed |
|------|---------|-------------------|
| Nelson Rule Correctness | Mathematical implementation errors | Define test cases with known results |
| MQTT Reliability | Message loss under high load | Design buffering and QoS strategy |
| Rolling Window Consistency | Exclusion handling complexity | Clear state machine for window updates |
| WebSocket Scale | Connection limits under load | Define connection pooling strategy |
| SQLite Concurrency | Write contention with high-frequency tags | Consider WAL tuning or connection pooling |

---

## 8. Deliverables Expected from Architect

1. **Detailed Component Design** - Class diagrams for core modules
2. **API Specification** - OpenAPI schema for all endpoints
3. **Database Schema Finalization** - Indexes, constraints, migrations
4. **Sequence Diagrams** - Sample processing, violation workflow, acknowledgment
5. **Deployment Architecture** - Container structure, networking
6. **Testing Strategy** - Unit, integration, E2E coverage plan

---

## 9. Reference Materials

### Specification Files
- `initial prompt.txt` - Full OpenSPC specification
- Architecture Overview (Section 1)
- Database Schema SQL (Section 2)
- Nelson Rules Spec (Section 3)
- UNS Payload Spec (Section 4)
- Frontend Requirements (Section 5)

### CTO Artifacts
- `tech-stack.md` - Technology choices and versions
- `architecture-decision-record.md` - ADRs 001-006

### External References
- ASTM E2587 - Control Chart Constants (d2, c4 tables)
- Sparkplug B Specification v3.0
- ISA-95 Part 1 - Enterprise-Control Integration

---

## 10. Open Questions for Architect

1. **Multi-tenancy:** Should the system support multiple organizations, or is it single-tenant?

2. **Batch Mode:** Should there be a batch import API for historical data migration?

3. **Reporting:** Are there requirements for historical reports beyond the dashboard?

4. **Mobile:** Should the operator dashboard be mobile-responsive or is it desktop-only?

5. **Offline Mode:** Should manual entry work offline and sync when connected?

---

*Handoff complete. Architect to proceed with detailed design based on this guidance and referenced documents.*
