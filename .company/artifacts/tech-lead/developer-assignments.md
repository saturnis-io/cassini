# OpenSPC Developer Assignments

## Document Information
- **Project:** OpenSPC - Event-Driven Statistical Process Control System
- **Author:** Tech Lead, Virtual Engineering Co.
- **Date:** 2026-02-02
- **Status:** Ready for Team Kickoff

---

## 1. Team Structure Recommendation

### Optimal Team Size: 3 Developers

| Role | Focus Area | Skills Required |
|------|------------|-----------------|
| **Backend Developer 1** | Core SPC Engine, Database | Python, SQLAlchemy, Statistics, pytest |
| **Backend Developer 2** | API, Integration | Python, FastAPI, MQTT, WebSocket |
| **Frontend Developer** | UI Components, Dashboard | React, TypeScript, Recharts, Tailwind |

### Alternative: 2 Developer Team

| Role | Focus Area | Trade-offs |
|------|------------|------------|
| **Full-Stack 1** | Backend + API | Less parallelism, sequential API work |
| **Full-Stack 2** | Frontend + Integration | WebSocket integration bridges both |

---

## 2. Assignment by Phase

### Phase 1: Foundation (Weeks 1-2)

#### Backend Developer 1 (BE-DEV-1)
| Week | Task | Est. Days | Notes |
|------|------|-----------|-------|
| W1 | BE-001 Database Schema | 2 | Priority: Critical path |
| W1 | BE-002 Repository Pattern | 2 | Start after BE-001 Day 1 |
| W1 | BE-003 Statistics Constants | 1 | Parallel with BE-001 |
| W2 | BE-004 Rolling Window Manager | 3 | Blocking for Nelson Rules |
| W2 | BE-005 Nelson Rules (1-4) | 2.5 | Rules 1-4 first |

#### Backend Developer 2 (BE-DEV-2)
| Week | Task | Est. Days | Notes |
|------|------|-----------|-------|
| W1 | BE-020 Event Bus | 1 | Simple, parallel work |
| W1 | Support BE-001 | 2 | Pair on schema design |
| W1 | Test fixtures setup | 2 | Factory Boy patterns |
| W2 | BE-005 Nelson Rules (5-8) | 2.5 | After Rules 1-4 interface |
| W2 | BE-006 SPC Engine Core | 2 | Integration work |

#### Frontend Developer (FE-DEV)
| Week | Task | Est. Days | Notes |
|------|------|-----------|-------|
| W1-W2 | Research & Design Prep | 5 | Study designs, prototype charts |
| W1 | Recharts zone prototypes | 2 | Early chart experimentation |
| W2 | UI component inventory | 3 | Catalog shadcn/ui needs |

---

### Phase 2: API Layer (Weeks 3-4)

#### Backend Developer 1 (BE-DEV-1)
| Week | Task | Est. Days | Notes |
|------|------|-----------|-------|
| W3 | BE-008 Pydantic Schemas | 2 | Foundation for endpoints |
| W3 | BE-009 Hierarchy Endpoints | 2 | CRUD + tree operations |
| W3 | BE-014 Control Limit Service | 1 | Uses statistics utils |
| W4 | BE-011 Sample Endpoints | 2 | Critical: triggers engine |
| W4 | Code review & bug fixes | 2 | Quality checkpoint |

#### Backend Developer 2 (BE-DEV-2)
| Week | Task | Est. Days | Notes |
|------|------|-----------|-------|
| W3 | BE-010 Characteristic Endpoints | 3 | Most complex CRUD |
| W3 | BE-012 Violation Endpoints | 2 | After BE-010 patterns |
| W4 | BE-007 Manual Provider | 1 | Simple wrapper |
| W4 | BE-013 Alert Manager | 2 | Notification orchestration |
| W4 | Integration tests | 2 | API flow coverage |

#### Frontend Developer (FE-DEV)
| Week | Task | Est. Days | Notes |
|------|------|-----------|-------|
| W3 | FE-001 Project Scaffolding | 1 | Vite + TypeScript + Tailwind |
| W3 | FE-002 Zustand Store Setup | 1 | Dashboard + Config stores |
| W3 | FE-003 TanStack Query Setup | 2 | API client hooks |
| W3 | FE-008 ChartZones Component | 1 | Background bands |
| W4 | FE-009 CustomDot Component | 2 | Interactive points |
| W4 | FE-013 NelsonRulesGrid | 1 | Simple checkbox grid |
| W4 | FE-005 Layout Components | 2 | Header, footer, shell |

---

### Phase 3: Integration (Weeks 5-6)

#### Backend Developer 1 (BE-DEV-1)
| Week | Task | Est. Days | Notes |
|------|------|-----------|-------|
| W5 | BE-015 MQTT Client Wrapper | 2 | aiomqtt integration |
| W5 | BE-016 Tag Provider | 3 | Buffer logic complex |
| W6 | BE-017 Sparkplug B | 2 | Protobuf decoding |
| W6 | Integration testing | 3 | MQTT flow validation |

#### Backend Developer 2 (BE-DEV-2)
| Week | Task | Est. Days | Notes |
|------|------|-----------|-------|
| W5 | BE-018 WebSocket Infrastructure | 2 | Connection manager |
| W5 | BE-019 Real-Time Broadcasting | 3 | Event distribution |
| W6 | WebSocket + REST integration | 2 | Event bus wiring |
| W6 | Performance baseline | 3 | Load testing setup |

#### Frontend Developer (FE-DEV)
| Week | Task | Est. Days | Notes |
|------|------|-----------|-------|
| W5 | FE-004 WebSocket Hook | 2 | Reconnection logic |
| W5 | FE-010 ControlChart | 3 | Main chart component |
| W6 | FE-011 DistributionHistogram | 2 | Bell curve rendering |
| W6 | FE-006 TodoList & TodoCard | 2 | Status-colored cards |
| W6 | WebSocket integration | 1 | Connect to backend |

---

### Phase 4: Frontend (Weeks 7-9)

#### Backend Developer 1 (BE-DEV-1)
| Week | Task | Est. Days | Notes |
|------|------|-----------|-------|
| W7-8 | Bug fixes & optimization | 5 | Support FE integration |
| W8-9 | API refinements | 3 | Based on FE feedback |
| W9 | Documentation | 2 | OpenAPI enhancements |

#### Backend Developer 2 (BE-DEV-2)
| Week | Task | Est. Days | Notes |
|------|------|-----------|-------|
| W7 | Load testing | 3 | 1000 characteristic scale |
| W8 | Memory profiling | 2 | Rolling window optimization |
| W8-9 | INT-002 Performance Testing | 3 | Formal benchmarks |
| W9 | Support E2E tests | 2 | Backend test doubles |

#### Frontend Developer (FE-DEV)
| Week | Task | Est. Days | Notes |
|------|------|-----------|-------|
| W7 | FE-007 MeasurementInput & Modal | 3 | Large input, validation |
| W7 | FE-012 HierarchyTree | 2 | Tree navigation |
| W8 | FE-014 CharacteristicForm | 3 | Full config form |
| W8 | FE-015 ViolationToast | 1 | Sonner integration |
| W8 | FE-016 AckDialog | 2 | Acknowledgment modal |
| W9 | FE-017 OperatorDashboard | 3 | Assemble components |
| W9 | FE-018 ConfigurationView | 2 | Assemble config page |

---

### Phase 5: Polish (Week 10)

#### Backend Developer 1 (BE-DEV-1)
| Task | Est. Days | Notes |
|------|-----------|-------|
| DEV-001 Docker Backend | 2 | Multi-stage Dockerfile |
| Production config | 1 | Environment variables |
| Health checks | 1 | Liveness/readiness |
| Documentation | 1 | Deployment guide |

#### Backend Developer 2 (BE-DEV-2)
| Task | Est. Days | Notes |
|------|-----------|-------|
| INT-001 E2E Tests (backend) | 2 | API test cases |
| Docker Compose | 1 | Full stack orchestration |
| CI/CD pipeline | 1 | GitHub Actions |
| Bug fixes | 1 | Final issues |

#### Frontend Developer (FE-DEV)
| Task | Est. Days | Notes |
|------|-----------|-------|
| FE-019 Dark Mode | 2 | Theme toggle |
| FE-020 Responsive Tablet | 2 | 768px breakpoint |
| INT-001 E2E Tests (frontend) | 1 | Playwright scenarios |

---

## 3. Integration Points Requiring Coordination

### Critical Handoffs

| From | To | Integration Point | Coordination Need |
|------|----|--------------------|-------------------|
| BE-DEV-1 | BE-DEV-2 | BE-005 (Nelson Rules) | Interface contract for rules 5-8 |
| BE-DEV-1 | BE-DEV-2 | BE-004 (Rolling Window) | Window API for engine integration |
| BE-DEV-2 | FE-DEV | BE-008 (Schemas) | TypeScript types generation |
| BE-DEV-2 | FE-DEV | BE-019 (WebSocket) | Message format specification |
| FE-DEV | BE-DEV-2 | FE-004 (WebSocket Hook) | Connection protocol |
| All | All | INT-001 (E2E Tests) | Test data fixtures |

### Daily Sync Topics by Week

| Week | Key Sync Topics |
|------|-----------------|
| W1 | Schema review, repository interfaces |
| W2 | Nelson rule interfaces, window API |
| W3 | Pydantic schema review, API contracts |
| W4 | Sample flow integration, alert events |
| W5 | MQTT message format, WebSocket protocol |
| W6 | Real-time event format, chart data shape |
| W7 | API response refinements, chart integration |
| W8 | Form validation rules, config flow |
| W9 | E2E test scenarios, bug triage |
| W10 | Deployment checklist, final testing |

---

## 4. Code Review Checkpoints

### Backend Code Reviews

| Milestone | Reviewer | Focus Areas |
|-----------|----------|-------------|
| BE-002 done | Tech Lead | Repository patterns, async correctness |
| BE-005 done | Tech Lead + BE-DEV-2 | Nelson rule mathematical correctness |
| BE-006 done | Tech Lead | SPC pipeline integration |
| BE-013 done | BE-DEV-1 | Alert workflow completeness |
| BE-019 done | Tech Lead | WebSocket security, connection handling |

### Frontend Code Reviews

| Milestone | Reviewer | Focus Areas |
|-----------|----------|-------------|
| FE-004 done | Tech Lead | WebSocket reconnection robustness |
| FE-010 done | Tech Lead | Chart performance, accessibility |
| FE-017 done | Tech Lead + BE-DEV | Dashboard flow, state management |
| FE-018 done | Tech Lead | Configuration persistence |

### Cross-Team Reviews

| Checkpoint | Participants | Purpose |
|------------|--------------|---------|
| Week 2 End | All | Foundation architecture review |
| Week 4 End | All | API contract finalization |
| Week 6 End | All | Integration demo and testing |
| Week 9 End | All | Pre-release review |

---

## 5. Workload Distribution by Complexity

### Backend Developer 1 (Primary: Core SPC)

| Complexity | Count | Features |
|------------|-------|----------|
| S | 2 | BE-003, BE-007 |
| M | 5 | BE-001, BE-002, BE-008, BE-009, BE-015 |
| L | 2 | BE-004, BE-016 |
| XL | 1 | BE-005 (partial) |
| **Total Points** | ~32 | (S=1, M=2, L=4, XL=8) |

### Backend Developer 2 (Primary: API/Integration)

| Complexity | Count | Features |
|------------|-------|----------|
| S | 2 | BE-020, BE-007 |
| M | 7 | BE-010, BE-011, BE-012, BE-013, BE-014, BE-017, BE-018, BE-019 |
| L | 1 | BE-005 (partial) |
| **Total Points** | ~24 | |

### Frontend Developer (Primary: UI)

| Complexity | Count | Features |
|------------|-------|----------|
| S | 5 | FE-001, FE-002, FE-005, FE-008, FE-013, FE-015 |
| M | 9 | FE-003, FE-004, FE-006, FE-007, FE-009, FE-011, FE-012, FE-016, FE-018, FE-019, FE-020 |
| L | 3 | FE-010, FE-014, FE-017 |
| **Total Points** | ~35 | |

---

## 6. Risk Mitigation Assignments

### High-Risk Features

| Feature | Risk | Owner | Mitigation Partner |
|---------|------|-------|-------------------|
| BE-005 Nelson Rules | Mathematical errors | BE-DEV-1 | BE-DEV-2 peer review |
| BE-016 Tag Provider | Buffer race conditions | BE-DEV-1 | Tech Lead async review |
| FE-010 ControlChart | Performance with large datasets | FE-DEV | BE-DEV-2 data pagination |
| BE-019 WebSocket | Connection scaling | BE-DEV-2 | BE-DEV-1 load testing |

### Backup Assignments

| Primary Owner | Backup | Features Covered |
|---------------|--------|------------------|
| BE-DEV-1 | BE-DEV-2 | BE-004, BE-005, BE-016 |
| BE-DEV-2 | BE-DEV-1 | BE-013, BE-018, BE-019 |
| FE-DEV | Tech Lead | FE-010, FE-017 |

---

## 7. Communication Channels

### Recommended Meetings

| Meeting | Frequency | Duration | Participants |
|---------|-----------|----------|--------------|
| Daily Standup | Daily | 15 min | All developers |
| Sprint Planning | Weekly (Mon) | 1 hour | All + Tech Lead |
| Code Review | As needed | 30 min | Relevant pair |
| Demo | End of phase | 30 min | All + Stakeholders |

### Documentation Requirements

| Developer | Documentation Deliverables |
|-----------|---------------------------|
| BE-DEV-1 | Nelson Rules test cases, Statistics module docstrings |
| BE-DEV-2 | API examples, WebSocket message schema |
| FE-DEV | Component Storybook, State flow diagrams |

---

## 8. Onboarding Checklist

### Day 1 - All Developers

- [ ] Clone repository and run `docker compose up`
- [ ] Review architecture documents in `.company/artifacts/architect/`
- [ ] Review UI designs in `.company/artifacts/ui-designer/`
- [ ] Set up development environment per tech-stack.md
- [ ] Run existing tests (if any)

### Day 1 - Backend Developers

- [ ] Review data-model.md DDL
- [ ] Review api-contracts.md endpoints
- [ ] Set up Python environment with uv
- [ ] Run database migrations locally

### Day 1 - Frontend Developer

- [ ] Review component-specs.md
- [ ] Review design-system.md tokens
- [ ] Set up Node.js environment
- [ ] Install shadcn/ui components

---

*Developer assignments complete. Ready for sprint kickoff.*
