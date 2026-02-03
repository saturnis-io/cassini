# OpenSPC Task Dependency Graph

## Document Information
- **Project:** OpenSPC - Event-Driven Statistical Process Control System
- **Author:** Tech Lead, Virtual Engineering Co.
- **Date:** 2026-02-02
- **Status:** Ready for Sprint Planning

---

## 1. Visual Dependency Graph

### Milestone 1: Foundation (Weeks 1-2)

```
                                    START
                                      |
            +-------------------------+-------------------------+
            |                         |                         |
            v                         v                         v
        [BE-001]                  [BE-003]                  [BE-020]
        Database                  Statistics               Event Bus
        Schema                    Constants                   (S)
          (M)                        (S)
            |                         |
            v                         |
        [BE-002]                      |
        Repository                    |
        Pattern                       |
          (M)                         |
            |                         |
            +------------+------------+
                         |
                         v
                     [BE-004]
                     Rolling Window
                     Manager (L)
                         |
                         v
                     [BE-005]
                     Nelson Rules
                     Implementation (XL)
                         |
                         v
                     [BE-006]
                     SPC Engine
                     Core (L)
                         |
                         v
                     [BE-007]
                     Manual Provider
                         (S)
```

### Milestone 2: API Layer (Weeks 3-4)

```
        [BE-001]                              [BE-006]
        Database                              SPC Engine
            |                                     |
            v                                     |
        [BE-008]                                  |
        Pydantic                                  |
        Schemas (M)                               |
            |                                     |
    +-------+-------+-------+                     |
    |       |       |       |                     |
    v       v       v       v                     |
[BE-009][BE-010][BE-012][BE-014]                  |
Hierarchy Char.  Violation Control               |
Endpoints Endpoints Endpoints Limits             |
  (M)      (L)      (M)      (M)                 |
                                                  |
    +---------------------------------------------+
    |
    v
[BE-011]
Sample
Endpoints (M)
    |
    v
[BE-013]
Alert Manager
   (M)
```

### Milestone 3: Integration (Weeks 5-6)

```
                                [BE-013]
                                Alert Manager
                                     |
                     +---------------+---------------+
                     |                               |
                     v                               v
                [BE-015]                        [BE-018]
                MQTT Client                     WebSocket
                Wrapper (M)                     Infrastructure (M)
                     |                               |
          +----------+----------+                    |
          |                     |                    |
          v                     v                    v
      [BE-016]              [BE-017]            [BE-019]
      Tag Provider          Sparkplug B         Real-Time
      Implementation (L)    Integration (M)     Broadcasting (M)
```

### Milestone 4: Frontend (Weeks 7-9)

```
                                START
                                  |
                                  v
                              [FE-001]
                              Project
                              Scaffolding (S)
                                  |
            +---------------------+---------------------+
            |                     |                     |
            v                     v                     v
        [FE-002]              [FE-003]              [FE-008]
        Zustand Store         TanStack Query        ChartZones (S)
        Setup (S)             Setup (M)                 |
            |                     |                     |
            +----------+----------+                     v
                       |                            [FE-009]
                       v                            CustomDot (M)
                   [FE-004]                             |
                   WebSocket                           |
                   Hook (M)                            |
                       |                               |
            +----------+-----------------+-------------+
            |                            |
            v                            v
        [FE-005]                     [FE-010]
        Layout                       ControlChart (L)
        Components (S)                   |
            |                            |
    +-------+-------+                    v
    |               |                [FE-011]
    v               v                DistributionHistogram (M)
[FE-006]        [FE-012]
TodoList        HierarchyTree
& Card (M)      Component (M)
    |               |
    v               v
[FE-007]        [FE-013]
Measurement     NelsonRulesGrid (S)
Input (M)           |
    |               v
    |           [FE-014]
    |           CharacteristicForm (L)
    |               |
    +-------+-------+
            |
    +-------+-------+-------+
    |               |       |
    v               v       v
[FE-015]        [FE-016]  [FE-018]
Violation       AckDialog  ConfigurationView
Toast (S)         (M)      Page (M)
    |               |
    +-------+-------+
            |
            v
        [FE-017]
        OperatorDashboard
        Page (L)
```

### Milestone 5: Polish (Week 10)

```
    [FE-017]              [FE-018]
    Operator              Configuration
    Dashboard             View
        |                     |
        +----------+----------+
                   |
        +----------+----------+
        |          |          |
        v          v          v
    [FE-019]   [FE-020]   [INT-001]
    Dark Mode  Responsive  E2E Tests
      (M)      Tablet (M)     (L)
                              |
                              v
                          [INT-002]
                          Performance
                          Testing (M)
                              |
                              v
                          [DEV-001]
                          Docker
                          Deployment (M)
```

---

## 2. Parallel Execution Opportunities

### Week 1 - Maximum Parallelism
```
Track A (Backend):    BE-001 Database Schema ------------> BE-002 Repositories
Track B (Backend):    BE-003 Statistics Constants ----------------------->
Track C (Backend):    BE-020 Event Bus ---------------------------------->
                      |<------------ Can run in parallel ------------->|
```

### Week 2 - Converging Work
```
Track A: BE-004 Rolling Window Manager -----> BE-005 Nelson Rules (part 1)
Track B: BE-005 Nelson Rules (part 2) ------> BE-006 SPC Engine
         |<---- Rules 1-4 ---->|<---- Rules 5-8, integration ---->|
```

### Week 3 - API Development Parallelism
```
Track A: BE-008 Pydantic Schemas ---> BE-009 Hierarchy Endpoints
Track B:                         ---> BE-010 Characteristic Endpoints
Track C:                         ---> BE-012 Violation Endpoints
Track D:                         ---> BE-014 Control Limit Service
         |<-------------- All can parallelize after BE-008 ------------>|
```

### Week 4 - Sequential Dependencies
```
Track A: BE-011 Sample Endpoints --> BE-013 Alert Manager
         |<---- Requires BE-006 completed ---->|
```

### Week 5 - Integration Parallelism
```
Track A: BE-015 MQTT Client -------> BE-016 Tag Provider
Track B:                    -------> BE-017 Sparkplug B
Track C: BE-018 WebSocket Infrastructure --->
         |<---- All start in parallel ---->|
```

### Week 6 - Frontend Kickoff with Integration
```
Track A: FE-001 Scaffolding --> FE-002 Zustand --> FE-004 WebSocket
Track B: BE-019 Real-Time Broadcasting (completing integration)
         |<---- Frontend and backend integration can parallel ---->|
```

### Week 7 - Heavy Frontend Parallelism
```
Track A: FE-005 Layout --> FE-006 TodoList --> FE-007 Measurement Input
Track B: FE-003 TanStack --> FE-010 ControlChart --> FE-011 Histogram
Track C: FE-008 Zones --> FE-009 CustomDot ------------>
         |<---- 3 parallel frontend tracks ---->|
```

### Week 8 - UI Feature Development
```
Track A: FE-012 HierarchyTree --> FE-013 NelsonRulesGrid --> FE-014 Form
Track B: FE-015 ViolationToast --> FE-016 AckDialog --------->
         |<---- 2 parallel tracks ---->|
```

### Week 9 - Page Assembly
```
Track A: FE-017 OperatorDashboard (assembles components)
Track B: FE-018 ConfigurationView (assembles components)
         |<---- Can parallel with separate developers ---->|
```

### Week 10 - Polish and Integration Testing
```
Track A: FE-019 Dark Mode | FE-020 Responsive (parallel)
Track B: INT-001 E2E Tests --> INT-002 Performance Tests --> DEV-001 Docker
         |<---- Sequential test/deploy chain ---->|
```

---

## 3. Critical Path Analysis

### Critical Path (Longest Sequential Chain)

```
BE-001 --> BE-002 --> BE-004 --> BE-005 --> BE-006 --> BE-011 --> BE-013 -->
   2d        2d         3d         5d         3d         2d         2d

BE-019 --> FE-001 --> FE-003 --> FE-004 --> FE-010 --> FE-017 --> INT-001
   2d        1d         2d         2d         3d         3d         3d

Total Critical Path: ~30 working days
```

### Critical Path Breakdown

| Phase | Tasks | Duration | Cumulative |
|-------|-------|----------|------------|
| Foundation | BE-001 -> BE-002 -> BE-004 -> BE-005 | 12 days | 12 days |
| Engine | BE-006 -> BE-011 -> BE-013 | 7 days | 19 days |
| Integration | BE-019 | 2 days | 21 days |
| Frontend | FE-001 -> FE-003 -> FE-004 -> FE-010 -> FE-017 | 11 days | 32 days |
| Testing | INT-001 | 3 days | 35 days |

### Critical Path Risk Items

1. **BE-005 Nelson Rules (5 days)** - Most complex single feature
   - Mitigation: Start property-based test framework early
   - Mitigation: Peer review on rule implementations

2. **FE-010 ControlChart (3 days)** - Complex Recharts integration
   - Mitigation: Prototype zone rendering early
   - Mitigation: Performance test with 100+ points

3. **FE-017 OperatorDashboard (3 days)** - Many component dependencies
   - Mitigation: Interface contracts defined early
   - Mitigation: Mock components for parallel development

---

## 4. Dependency Matrix

### Backend Dependencies

| Feature | Depends On |
|---------|------------|
| BE-002 | BE-001 |
| BE-004 | BE-002, BE-003 |
| BE-005 | BE-004 |
| BE-006 | BE-004, BE-005 |
| BE-007 | BE-006 |
| BE-008 | BE-001 |
| BE-009 | BE-002, BE-008 |
| BE-010 | BE-002, BE-008 |
| BE-011 | BE-006, BE-007, BE-008 |
| BE-012 | BE-002, BE-008 |
| BE-013 | BE-002, BE-006 |
| BE-014 | BE-003, BE-004 |
| BE-016 | BE-006, BE-015 |
| BE-017 | BE-015 |
| BE-019 | BE-013, BE-018 |

### Frontend Dependencies

| Feature | Depends On |
|---------|------------|
| FE-002 | FE-001 |
| FE-003 | FE-001 |
| FE-004 | FE-002, FE-003 |
| FE-005 | FE-001, FE-004 |
| FE-006 | FE-002, FE-003 |
| FE-007 | FE-003, FE-006 |
| FE-009 | FE-001 |
| FE-010 | FE-008, FE-009 |
| FE-011 | FE-001 |
| FE-012 | FE-002, FE-003 |
| FE-013 | FE-001 |
| FE-014 | FE-003, FE-013 |
| FE-015 | FE-004 |
| FE-016 | FE-003 |
| FE-017 | FE-005, FE-006, FE-007, FE-010, FE-011, FE-015 |
| FE-018 | FE-005, FE-012, FE-014 |
| FE-019 | FE-005 |
| FE-020 | FE-017, FE-018 |

### Integration Dependencies

| Feature | Depends On |
|---------|------------|
| INT-001 | All FE features, BE-019 |
| INT-002 | All BE features |
| DEV-001 | All features |

---

## 5. Sprint Allocation by Week

### Week 1
| Task | Track | Dependencies Met? | Parallelizable With |
|------|-------|-------------------|---------------------|
| BE-001 | A | Yes (none) | BE-003, BE-020 |
| BE-003 | B | Yes (none) | BE-001, BE-020 |
| BE-020 | C | Yes (none) | BE-001, BE-003 |

### Week 2
| Task | Track | Dependencies Met? | Parallelizable With |
|------|-------|-------------------|---------------------|
| BE-002 | A | After BE-001 | BE-004 (partial) |
| BE-004 | A | After BE-002, BE-003 | - |
| BE-005 | A | After BE-004 | - |

### Week 3
| Task | Track | Dependencies Met? | Parallelizable With |
|------|-------|-------------------|---------------------|
| BE-008 | A | After BE-001 | BE-005 (completion) |
| BE-005 | B | Continuing | BE-008 |
| BE-006 | A | After BE-005 | BE-009, BE-010, BE-012 |

### Week 4
| Task | Track | Dependencies Met? | Parallelizable With |
|------|-------|-------------------|---------------------|
| BE-009 | A | After BE-008 | BE-010, BE-012, BE-014 |
| BE-010 | B | After BE-008 | BE-009, BE-012, BE-014 |
| BE-012 | C | After BE-008 | BE-009, BE-010, BE-014 |
| BE-014 | D | After BE-003, BE-004 | BE-009, BE-010, BE-012 |
| BE-011 | A | After BE-006, BE-008 | - |
| BE-013 | A | After BE-011 | - |

### Week 5
| Task | Track | Dependencies Met? | Parallelizable With |
|------|-------|-------------------|---------------------|
| BE-015 | A | None | BE-018 |
| BE-018 | B | None | BE-015 |
| BE-007 | C | After BE-006 | BE-015, BE-018 |

### Week 6
| Task | Track | Dependencies Met? | Parallelizable With |
|------|-------|-------------------|---------------------|
| BE-016 | A | After BE-015, BE-006 | BE-017, FE-001 |
| BE-017 | B | After BE-015 | BE-016, FE-001 |
| BE-019 | C | After BE-013, BE-018 | FE-001, FE-002 |
| FE-001 | D | None | BE-016, BE-017 |
| FE-002 | D | After FE-001 | BE-019 |

### Week 7
| Task | Track | Dependencies Met? | Parallelizable With |
|------|-------|-------------------|---------------------|
| FE-003 | A | After FE-001 | FE-008 |
| FE-004 | A | After FE-002, FE-003 | FE-005 |
| FE-005 | B | After FE-004 | FE-006 |
| FE-006 | B | After FE-002, FE-003 | FE-005 |
| FE-008 | C | After FE-001 | FE-003 |
| FE-009 | C | After FE-001 | FE-003 |

### Week 8
| Task | Track | Dependencies Met? | Parallelizable With |
|------|-------|-------------------|---------------------|
| FE-007 | A | After FE-006 | FE-010 |
| FE-010 | B | After FE-008, FE-009 | FE-007 |
| FE-011 | B | After FE-001 | FE-010 |
| FE-012 | C | After FE-002, FE-003 | FE-010 |
| FE-013 | C | After FE-001 | FE-012 |
| FE-015 | D | After FE-004 | All |
| FE-016 | D | After FE-003 | All |

### Week 9
| Task | Track | Dependencies Met? | Parallelizable With |
|------|-------|-------------------|---------------------|
| FE-014 | A | After FE-013 | FE-017 |
| FE-017 | B | After FE-005-FE-011, FE-015 | FE-014 |
| FE-018 | A | After FE-005, FE-012, FE-014 | - |

### Week 10
| Task | Track | Dependencies Met? | Parallelizable With |
|------|-------|-------------------|---------------------|
| FE-019 | A | After FE-005 | FE-020 |
| FE-020 | B | After FE-017, FE-018 | FE-019 |
| INT-001 | C | After all FE | INT-002 (partial) |
| INT-002 | D | After all BE | INT-001 |
| DEV-001 | D | After INT-001, INT-002 | - |

---

*Task graph complete. Use for sprint planning and resource allocation.*
