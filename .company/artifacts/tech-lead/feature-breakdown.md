# OpenSPC Feature Breakdown

## Document Information
- **Project:** OpenSPC - Event-Driven Statistical Process Control System
- **Author:** Tech Lead, Virtual Engineering Co.
- **Date:** 2026-02-02
- **Status:** Ready for Sprint Planning

---

## Feature Inventory

### Milestone 1: Foundation (Weeks 1-2)

#### BE-001: Database Schema & ORM Models
- **Description:** Implement SQLite database with SQLAlchemy 2.0 ORM models for Hierarchy, Characteristic, Sample, Measurement, Violation, and CharacteristicRules tables.
- **Scope:**
  - DDL scripts with indexes and constraints
  - SQLAlchemy model classes with relationships
  - Alembic initial migration
  - Database seeding script for development
- **Acceptance Criteria:**
  - [ ] All 8 tables created with proper foreign keys
  - [ ] WAL mode enabled for concurrent access
  - [ ] Migrations run successfully via `alembic upgrade head`
  - [ ] Seeding script populates test hierarchy with 2+ characteristics
  - [ ] Unit tests pass for model CRUD operations
- **Dependencies:** None
- **Complexity:** M
- **Layer:** Backend

#### BE-002: Repository Pattern Implementation
- **Description:** Implement base repository with CRUD operations and specialized repositories for each entity.
- **Scope:**
  - BaseRepository with get_by_id, get_all, create, update, delete
  - HierarchyRepository with tree operations (get_tree, get_descendants, get_ancestors)
  - CharacteristicRepository with filter by hierarchy
  - SampleRepository with rolling window query
  - ViolationRepository with unacknowledged filter
- **Acceptance Criteria:**
  - [ ] BaseRepository handles pagination (offset/limit)
  - [ ] HierarchyRepository.get_tree() returns nested structure
  - [ ] SampleRepository.get_rolling_window() returns last N samples in chronological order
  - [ ] ViolationRepository.get_unacknowledged() filters correctly
  - [ ] All repository methods have async unit tests
- **Dependencies:** BE-001
- **Complexity:** M
- **Layer:** Backend

#### BE-003: Statistical Constants & Utilities
- **Description:** Implement statistical constants (d2, c4, A2, D3, D4) and utility functions for SPC calculations.
- **Scope:**
  - Constants lookup tables for subgroup sizes 1-25
  - Sigma estimation functions (R-bar/d2, S/c4, moving range)
  - Control limit calculation functions
- **Acceptance Criteria:**
  - [ ] d2/c4 constants match ASTM E2587 tables
  - [ ] Sigma estimation matches manual calculation for test data
  - [ ] Moving range method works for n=1 (I-MR charts)
  - [ ] R-bar/d2 method works for n=2-10 (X-bar R charts)
  - [ ] S/c4 method works for n>10 (X-bar S charts)
- **Dependencies:** None
- **Complexity:** S
- **Layer:** Backend

#### BE-004: Rolling Window Manager
- **Description:** Implement in-memory rolling window manager with LRU eviction and database lazy loading.
- **Scope:**
  - RollingWindow data structure with configurable size
  - WindowSample model for cached samples
  - Zone calculation (A, B, C, Beyond)
  - RollingWindowManager with caching and invalidation
- **Acceptance Criteria:**
  - [ ] Rolling window maintains FIFO order
  - [ ] Zone boundaries calculated correctly (1, 2, 3 sigma)
  - [ ] Window loads from database on first access
  - [ ] LRU eviction triggers when cache exceeds max_cached
  - [ ] Sample exclusion invalidates and rebuilds window
  - [ ] Thread-safe with asyncio.Lock
- **Dependencies:** BE-002, BE-003
- **Complexity:** L
- **Layer:** Backend

#### BE-005: Nelson Rules Implementation
- **Description:** Implement all 8 Nelson Rules as pluggable rule classes.
- **Scope:**
  - NelsonRule protocol with check() method
  - Rule 1: Point beyond 3-sigma
  - Rule 2: 9 points same side of center
  - Rule 3: 6 points trending up/down
  - Rule 4: 14 points alternating
  - Rule 5: 2 of 3 beyond 2-sigma (same side)
  - Rule 6: 4 of 5 beyond 1-sigma (same side)
  - Rule 7: 15 points within 1-sigma (stratification)
  - Rule 8: 8 points beyond 1-sigma (both sides)
  - NelsonRuleLibrary aggregator
- **Acceptance Criteria:**
  - [ ] Each rule has min_samples_required check
  - [ ] Rule 1 returns CRITICAL, Rules 2-8 return WARNING
  - [ ] Rules return involved_sample_ids in result
  - [ ] Property-based tests with Hypothesis generate edge cases
  - [ ] Known test vectors from NIST/ASTM pass
- **Dependencies:** BE-004
- **Complexity:** XL
- **Layer:** Backend

#### BE-006: SPC Engine Core
- **Description:** Implement SPCEngine orchestrator that processes samples through the SPC pipeline.
- **Scope:**
  - SPCEngine class with process_sample() method
  - Sample persistence with measurements
  - Rule evaluation against rolling window
  - ProcessingResult model with statistics and violations
- **Acceptance Criteria:**
  - [ ] process_sample() persists sample and measurements
  - [ ] Rolling window updated after persistence
  - [ ] Enabled rules evaluated against window
  - [ ] Violations created for triggered rules
  - [ ] Processing time tracked in result
  - [ ] Integration test covers full pipeline
- **Dependencies:** BE-004, BE-005
- **Complexity:** L
- **Layer:** Backend

#### BE-007: Manual Provider
- **Description:** Implement ManualProvider for REST API sample submission.
- **Scope:**
  - DataProvider protocol definition
  - ManualProvider with submit_sample() method
  - SampleEvent and SampleContext models
  - Validation of measurement count vs subgroup_size
- **Acceptance Criteria:**
  - [ ] Provider validates characteristic exists
  - [ ] Provider validates measurement count matches subgroup_size
  - [ ] Provider creates SampleEvent with context
  - [ ] Callback invoked with SampleEvent
  - [ ] Provider rejects TAG-type characteristics
- **Dependencies:** BE-006
- **Complexity:** S
- **Layer:** Backend

---

### Milestone 2: API Layer (Weeks 3-4)

#### BE-008: Pydantic Schemas
- **Description:** Implement all request/response Pydantic schemas for REST API.
- **Scope:**
  - Common schemas (pagination, response envelope, errors)
  - Hierarchy schemas (create, update, response, tree)
  - Characteristic schemas (create, update, response, summary)
  - Sample schemas (create, response, chart data)
  - Violation schemas (response, acknowledge, stats)
- **Acceptance Criteria:**
  - [ ] All schemas have proper field validation
  - [ ] from_attributes=True for ORM model conversion
  - [ ] Spec/control limit schemas have cross-field validation
  - [ ] Tag provider config validated when provider_type=TAG
  - [ ] JSON Schema generated for OpenAPI docs
- **Dependencies:** BE-001
- **Complexity:** M
- **Layer:** Backend

#### BE-009: Hierarchy REST Endpoints
- **Description:** Implement /api/v1/hierarchy/* endpoints.
- **Scope:**
  - GET /hierarchy - tree view
  - POST /hierarchy - create node
  - GET /hierarchy/{id} - get node
  - PATCH /hierarchy/{id} - update node
  - DELETE /hierarchy/{id} - delete node
  - GET /hierarchy/{id}/characteristics - list under node
- **Acceptance Criteria:**
  - [ ] Tree view returns nested children
  - [ ] Create validates parent exists
  - [ ] Delete returns 409 if has children
  - [ ] Characteristics endpoint recursive under subtree
  - [ ] All endpoints have OpenAPI docs
- **Dependencies:** BE-002, BE-008
- **Complexity:** M
- **Layer:** Backend

#### BE-010: Characteristic REST Endpoints
- **Description:** Implement /api/v1/characteristics/* endpoints.
- **Scope:**
  - GET /characteristics - list with filtering
  - POST /characteristics - create
  - GET /characteristics/{id} - get with details
  - PATCH /characteristics/{id} - update
  - DELETE /characteristics/{id} - delete (or archive)
  - GET /characteristics/{id}/chart-data - chart rendering data
  - POST /characteristics/{id}/recalculate-limits - trigger recalculation
  - GET/PUT /characteristics/{id}/rules - Nelson rule config
- **Acceptance Criteria:**
  - [ ] List supports hierarchy_id, provider_type, in_control filters
  - [ ] Create validates tag_config when provider_type=TAG
  - [ ] Delete returns 409 if has samples
  - [ ] Chart-data includes zone boundaries
  - [ ] Recalculate-limits returns before/after values
- **Dependencies:** BE-002, BE-008
- **Complexity:** L
- **Layer:** Backend

#### BE-011: Sample REST Endpoints
- **Description:** Implement /api/v1/samples/* endpoints.
- **Scope:**
  - GET /samples - list with filtering
  - POST /samples - submit manual sample
  - GET /samples/{id} - get with measurements
  - PATCH /samples/{id}/exclude - mark excluded
  - POST /samples/batch - batch import
- **Acceptance Criteria:**
  - [ ] POST triggers SPC engine processing
  - [ ] POST returns violations in response
  - [ ] Exclude triggers rolling window rebuild
  - [ ] Batch import supports skip_rule_evaluation flag
  - [ ] List filters by characteristic_id, date range
- **Dependencies:** BE-006, BE-007, BE-008
- **Complexity:** M
- **Layer:** Backend

#### BE-012: Violation REST Endpoints
- **Description:** Implement /api/v1/violations/* endpoints.
- **Scope:**
  - GET /violations - list with filtering
  - GET /violations/stats - dashboard statistics
  - GET /violations/{id} - get details
  - POST /violations/{id}/acknowledge - acknowledge
  - POST /violations/batch-acknowledge - bulk acknowledge
- **Acceptance Criteria:**
  - [ ] List filters by acknowledged, severity, rule_id, date range
  - [ ] Stats returns counts by rule and characteristic
  - [ ] Acknowledge requires reason and user
  - [ ] Acknowledge returns 409 if already acknowledged
  - [ ] Batch acknowledge handles partial success
- **Dependencies:** BE-002, BE-008
- **Complexity:** M
- **Layer:** Backend

#### BE-013: Alert Manager
- **Description:** Implement AlertManager for violation creation and acknowledgment workflow.
- **Scope:**
  - AlertManager service class
  - Violation creation from RuleResult list
  - Acknowledgment workflow with reason codes
  - Integration with AlertNotifier
- **Acceptance Criteria:**
  - [ ] create_violations() persists violation records
  - [ ] acknowledge() validates violation exists
  - [ ] acknowledge() updates ack_user, ack_reason, ack_timestamp
  - [ ] Notifier called on new violations
  - [ ] Notifier called on acknowledgment
- **Dependencies:** BE-002, BE-006
- **Complexity:** M
- **Layer:** Backend

#### BE-014: Control Limit Calculation Service
- **Description:** Implement control limit calculation and recalculation service.
- **Scope:**
  - Automatic calculation on sample threshold
  - Manual recalculation trigger
  - Exclusion of OOC samples option
  - Method selection based on subgroup size
- **Acceptance Criteria:**
  - [ ] R-bar/d2 used for n=2-10
  - [ ] Moving range used for n=1
  - [ ] S/c4 used for n>10
  - [ ] OOC sample exclusion works correctly
  - [ ] Recalculation persists new limits
  - [ ] Rolling window invalidated after recalculation
- **Dependencies:** BE-003, BE-004
- **Complexity:** M
- **Layer:** Backend

---

### Milestone 3: Integration (Weeks 5-6)

#### BE-015: MQTT Client Wrapper
- **Description:** Implement aiomqtt client wrapper with connection lifecycle management.
- **Scope:**
  - MQTTClient class with connect/disconnect
  - Automatic reconnection with exponential backoff
  - Topic subscription management
  - Message callback registration
- **Acceptance Criteria:**
  - [ ] Client connects to configurable broker
  - [ ] Reconnection attempts with exponential backoff
  - [ ] Maximum reconnection delay of 30 seconds
  - [ ] Subscription restored after reconnection
  - [ ] Clean disconnect on application shutdown
- **Dependencies:** None
- **Complexity:** M
- **Layer:** Backend

#### BE-016: Tag Provider Implementation
- **Description:** Implement TagProvider for automated MQTT data collection.
- **Scope:**
  - TagProvider class implementing DataProvider protocol
  - SubgroupBuffer for accumulating readings
  - Topic to characteristic mapping
  - Trigger strategy handlers (ON_CHANGE, ON_TRIGGER, ON_TIMER)
  - Buffer timeout handling
- **Acceptance Criteria:**
  - [ ] Provider subscribes to configured topics
  - [ ] Buffer accumulates values until subgroup_size reached
  - [ ] Buffer timeout flushes partial subgroups
  - [ ] ON_CHANGE triggers on each message
  - [ ] ON_TRIGGER waits for trigger tag
  - [ ] Callback invoked with complete SampleEvent
- **Dependencies:** BE-006, BE-015
- **Complexity:** L
- **Layer:** Backend

#### BE-017: Sparkplug B Integration
- **Description:** Implement Sparkplug B payload encoding/decoding.
- **Scope:**
  - Sparkplug B protobuf message parsing
  - NBIRTH/NDATA/NCMD message handling
  - Metric extraction from payloads
  - Violation event publishing
- **Acceptance Criteria:**
  - [ ] NDATA payloads decoded to metric values
  - [ ] Timestamp extracted from Sparkplug message
  - [ ] Violation events published as Sparkplug metrics
  - [ ] Birth certificate handled for session awareness
- **Dependencies:** BE-015
- **Complexity:** M
- **Layer:** Backend

#### BE-018: WebSocket Infrastructure
- **Description:** Implement FastAPI WebSocket endpoint with connection management.
- **Scope:**
  - /ws/samples endpoint for real-time updates
  - /ws/alerts endpoint for violation notifications
  - Connection manager with subscription tracking
  - Heartbeat/ping-pong keep-alive
- **Acceptance Criteria:**
  - [ ] Clients can subscribe to characteristic IDs
  - [ ] Subscriptions filter outbound messages
  - [ ] Connection timeout after missed heartbeats
  - [ ] Multiple clients supported per characteristic
  - [ ] Clean disconnect handling
- **Dependencies:** None
- **Complexity:** M
- **Layer:** Backend

#### BE-019: Real-Time Broadcasting
- **Description:** Implement event broadcasting for samples, violations, and acknowledgments.
- **Scope:**
  - Sample event broadcast to subscribed clients
  - Violation event broadcast
  - Acknowledgment update broadcast
  - Control limit update broadcast
  - AlertNotifier integration with WebSocket and MQTT
- **Acceptance Criteria:**
  - [ ] New samples broadcast to subscribed clients
  - [ ] New violations broadcast with severity
  - [ ] Acknowledgment updates broadcast to all
  - [ ] Control limit changes broadcast
  - [ ] Message batching within 100ms window
- **Dependencies:** BE-013, BE-018
- **Complexity:** M
- **Layer:** Backend

#### BE-020: Event Bus
- **Description:** Implement internal event bus for decoupled component communication.
- **Scope:**
  - EventBus class with publish/subscribe
  - Event models (SampleProcessed, ViolationCreated, ViolationAcknowledged)
  - Async event handlers
- **Acceptance Criteria:**
  - [ ] Publishers decoupled from subscribers
  - [ ] Multiple subscribers per event type
  - [ ] Async handlers don't block publisher
  - [ ] Error in one handler doesn't affect others
- **Dependencies:** None
- **Complexity:** S
- **Layer:** Backend

---

### Milestone 4: Frontend (Weeks 7-9)

#### FE-001: Project Scaffolding
- **Description:** Set up React + TypeScript + Vite project with dependencies.
- **Scope:**
  - Vite project initialization
  - TypeScript configuration
  - Tailwind CSS setup
  - shadcn/ui installation
  - React Router configuration
  - ESLint + Prettier setup
- **Acceptance Criteria:**
  - [ ] `npm run dev` starts development server
  - [ ] `npm run build` produces production bundle
  - [ ] TypeScript strict mode enabled
  - [ ] Tailwind classes work in components
  - [ ] Router navigates between pages
- **Dependencies:** None
- **Complexity:** S
- **Layer:** Frontend

#### FE-002: Zustand Store Setup
- **Description:** Implement Zustand stores for dashboard and configuration state.
- **Scope:**
  - dashboardStore for operator view state
  - configStore for configuration view state
  - Store subscriptions for real-time updates
- **Acceptance Criteria:**
  - [ ] dashboardStore manages selected characteristic
  - [ ] dashboardStore manages input modal state
  - [ ] configStore manages tree selection
  - [ ] configStore tracks form dirty state
  - [ ] DevTools integration works
- **Dependencies:** FE-001
- **Complexity:** S
- **Layer:** Frontend

#### FE-003: TanStack Query Setup
- **Description:** Configure TanStack Query with API client hooks.
- **Scope:**
  - QueryClient configuration
  - API client with typed fetch functions
  - Query hooks for all REST endpoints
  - Mutation hooks with optimistic updates
- **Acceptance Criteria:**
  - [ ] useCharacteristics() returns typed data
  - [ ] useSamples() supports pagination
  - [ ] useSubmitSample() has optimistic update
  - [ ] Query invalidation on mutations
  - [ ] Loading and error states accessible
- **Dependencies:** FE-001
- **Complexity:** M
- **Layer:** Frontend

#### FE-004: WebSocket Hook
- **Description:** Implement useWebSocket hook with reconnection and subscription management.
- **Scope:**
  - WebSocket connection management
  - Automatic reconnection with backoff
  - Subscribe/unsubscribe functions
  - Message handlers for sample, violation, ack_update
  - Integration with Zustand and TanStack Query
- **Acceptance Criteria:**
  - [ ] isConnected state reflects connection
  - [ ] Reconnection attempts with exponential backoff
  - [ ] Subscriptions restored after reconnection
  - [ ] Messages update Zustand store
  - [ ] Messages update TanStack Query cache
- **Dependencies:** FE-002, FE-003
- **Complexity:** M
- **Layer:** Frontend

#### FE-005: Layout Components
- **Description:** Implement AppHeader, ConnectionStatus, and page shell.
- **Scope:**
  - AppHeader with navigation and plant selector
  - ConnectionStatus footer with WebSocket indicator
  - Page layout with sidebar/main split
  - NavLink component with active state
- **Acceptance Criteria:**
  - [ ] Header shows current plant
  - [ ] Navigation highlights active route
  - [ ] Connection status shows green/red indicator
  - [ ] Reconnection attempts displayed
  - [ ] Layout responsive to 1024px minimum
- **Dependencies:** FE-001, FE-004
- **Complexity:** S
- **Layer:** Frontend

#### FE-006: TodoList & TodoCard
- **Description:** Implement operator to-do list with status-colored cards.
- **Scope:**
  - TodoList component with sorting
  - TodoCard with status styling (grey/yellow/red)
  - Click handling for selection
  - Violation badge with pulse animation
- **Acceptance Criteria:**
  - [ ] Cards sorted by status (OOC > due > ok)
  - [ ] Status colors match design system
  - [ ] Selected card has ring highlight
  - [ ] OOC cards show pulsing badge
  - [ ] Last sample time displayed
- **Dependencies:** FE-002, FE-003
- **Complexity:** M
- **Layer:** Frontend

#### FE-007: MeasurementInput & InputModal
- **Description:** Implement measurement entry modal with validation.
- **Scope:**
  - MeasurementInput with large numeric display
  - Live validation against spec limits
  - SpecPositionIndicator visual bar
  - InputModal dialog with submit flow
  - Shake animation on validation error
- **Acceptance Criteria:**
  - [ ] Input validates against USL/LSL
  - [ ] Green/yellow/red states displayed
  - [ ] Position indicator shows value on spec range
  - [ ] Submit disabled when invalid
  - [ ] Modal closes on successful submission
  - [ ] Optimistic UI update before server response
- **Dependencies:** FE-003, FE-006
- **Complexity:** M
- **Layer:** Frontend

#### FE-008: ChartZones Component
- **Description:** Implement zone band rendering for control charts.
- **Scope:**
  - ReferenceArea components for sigma zones
  - Color coding (green/yellow/red)
  - Correct zone boundary calculation
- **Acceptance Criteria:**
  - [ ] Zone C (green) spans +/- 1 sigma
  - [ ] Zone B (yellow) spans 1-2 sigma
  - [ ] Zone A (red) spans 2-3 sigma
  - [ ] Zones render behind data line
  - [ ] Zones scale with chart dimensions
- **Dependencies:** FE-001
- **Complexity:** S
- **Layer:** Frontend

#### FE-009: CustomDot Component
- **Description:** Implement interactive chart points with violation styling.
- **Scope:**
  - Normal point rendering
  - Violation point with pulsing ring
  - Acknowledged point with checkmark
  - Click handler for point selection
- **Acceptance Criteria:**
  - [ ] Violation points are red
  - [ ] Unacknowledged violations pulse
  - [ ] Acknowledged points show green indicator
  - [ ] Click triggers onPointClick callback
  - [ ] Tooltip shows on hover
- **Dependencies:** FE-001
- **Complexity:** M
- **Layer:** Frontend

#### FE-010: ControlChart Component
- **Description:** Implement main X-Bar/I-MR control chart.
- **Scope:**
  - Recharts ComposedChart setup
  - Control limit reference lines (UCL, CL, LCL)
  - Spec limit dashed lines (USL, LSL)
  - Data line with CustomDot
  - ChartZones integration
  - ChartTooltip component
- **Acceptance Criteria:**
  - [ ] Chart renders 50+ samples smoothly
  - [ ] Control limits labeled on right side
  - [ ] Spec limits rendered as dashed lines
  - [ ] Zones visible behind data
  - [ ] Real-time updates animate smoothly
  - [ ] Point click selects sample
- **Dependencies:** FE-008, FE-009
- **Complexity:** L
- **Layer:** Frontend

#### FE-011: DistributionHistogram
- **Description:** Implement bell curve histogram with spec limit markers.
- **Scope:**
  - Histogram bar calculation
  - Normal distribution overlay
  - Spec limit reference lines
  - Cp/Cpk statistics display
- **Acceptance Criteria:**
  - [ ] Histogram bins calculated from samples
  - [ ] Normal curve fits histogram shape
  - [ ] USL/LSL lines visible
  - [ ] Cp/Cpk values displayed below chart
  - [ ] n (sample count) displayed
- **Dependencies:** FE-001
- **Complexity:** M
- **Layer:** Frontend

#### FE-012: HierarchyTree Component
- **Description:** Implement ISA-95 hierarchy navigation tree.
- **Scope:**
  - Recursive tree node rendering
  - Expand/collapse state management
  - Selection highlighting
  - NodeIcon component for type-based icons
  - Characteristic count badges
- **Acceptance Criteria:**
  - [ ] Tree expands/collapses on click
  - [ ] Selected node highlighted
  - [ ] Icons match hierarchy type (Site, Area, Line, etc.)
  - [ ] Characteristic count shown as badge
  - [ ] Tree state persisted in store
- **Dependencies:** FE-002, FE-003
- **Complexity:** M
- **Layer:** Frontend

#### FE-013: NelsonRulesGrid Component
- **Description:** Implement checkbox grid for Nelson Rule configuration.
- **Scope:**
  - Grid layout (2 columns on desktop)
  - Checkbox for each rule with description
  - Enable All / Disable All buttons
- **Acceptance Criteria:**
  - [ ] All 8 rules displayed with descriptions
  - [ ] Checkboxes toggle individual rules
  - [ ] Enable All/Disable All work correctly
  - [ ] Changes tracked in form dirty state
- **Dependencies:** FE-001
- **Complexity:** S
- **Layer:** Frontend

#### FE-014: CharacteristicForm Component
- **Description:** Implement full characteristic configuration form.
- **Scope:**
  - Provider type radio group
  - Spec limits inputs (Target, USL, LSL)
  - Control limits display (read-only)
  - NelsonRulesGrid integration
  - Tag browser button (MQTT topic picker)
  - Save/Delete buttons
- **Acceptance Criteria:**
  - [ ] Form loads characteristic data
  - [ ] Provider type shows tag config when TAG
  - [ ] Control limits show calculated values
  - [ ] Recalculate button triggers API call
  - [ ] Save button disabled when not dirty
  - [ ] Delete shows confirmation
- **Dependencies:** FE-003, FE-013
- **Complexity:** L
- **Layer:** Frontend

#### FE-015: ViolationToast Component
- **Description:** Implement toast notification for violations.
- **Scope:**
  - Toast content with violation details
  - View Chart button
  - Acknowledge button
  - Dismiss button
  - Sonner integration
- **Acceptance Criteria:**
  - [ ] Toast appears on violation WebSocket event
  - [ ] Toast auto-dismisses after 10 seconds
  - [ ] View Chart navigates to chart view
  - [ ] Acknowledge opens AckDialog
  - [ ] Multiple toasts stack correctly
- **Dependencies:** FE-004
- **Complexity:** S
- **Layer:** Frontend

#### FE-016: AckDialog Component
- **Description:** Implement acknowledgment dialog with reason codes.
- **Scope:**
  - Violation details display
  - Reason code dropdown
  - Corrective action textarea
  - Exclude from calculation checkbox
  - Submit button with loading state
- **Acceptance Criteria:**
  - [ ] Violation details shown clearly
  - [ ] Reason code required
  - [ ] Submit calls API
  - [ ] Dialog closes on success
  - [ ] Error displayed on failure
- **Dependencies:** FE-003
- **Complexity:** M
- **Layer:** Frontend

#### FE-017: OperatorDashboard Page
- **Description:** Implement main operator dashboard page.
- **Scope:**
  - Split layout (TodoList | Chart+Histogram)
  - WebSocket subscription management
  - InputModal integration
  - Real-time chart updates
- **Acceptance Criteria:**
  - [ ] Page loads characteristics
  - [ ] Selecting card shows chart
  - [ ] Real-time samples update chart
  - [ ] Violations trigger toast
  - [ ] Input modal opens on card action
- **Dependencies:** FE-005, FE-006, FE-007, FE-010, FE-011, FE-015
- **Complexity:** L
- **Layer:** Frontend

#### FE-018: ConfigurationView Page
- **Description:** Implement engineer configuration page.
- **Scope:**
  - Split layout (Tree | Form)
  - Tree selection loads form
  - Unsaved changes warning
  - Add characteristic button
- **Acceptance Criteria:**
  - [ ] Tree shows hierarchy
  - [ ] Selecting node shows form
  - [ ] Form save updates tree
  - [ ] Navigation blocked with dirty form
  - [ ] Add creates new characteristic
- **Dependencies:** FE-005, FE-012, FE-014
- **Complexity:** M
- **Layer:** Frontend

---

### Milestone 5: Polish & Deployment (Week 10)

#### FE-019: Dark Mode Support
- **Description:** Implement dark mode toggle and styling.
- **Scope:**
  - Theme toggle in header
  - Tailwind dark mode classes
  - Chart color adjustments
- **Acceptance Criteria:**
  - [ ] Toggle switches theme
  - [ ] Theme persisted in localStorage
  - [ ] All components readable in dark mode
  - [ ] Charts have adjusted colors
- **Dependencies:** FE-005
- **Complexity:** M
- **Layer:** Frontend

#### FE-020: Responsive Tablet Layout
- **Description:** Optimize layout for tablet devices (768px-1024px).
- **Scope:**
  - Collapsible sidebar
  - Stacked layout option
  - Touch-friendly interactions
- **Acceptance Criteria:**
  - [ ] Sidebar collapses to icons at 1024px
  - [ ] Minimum touch target 44px
  - [ ] Charts scale to fit viewport
  - [ ] Modals center correctly
- **Dependencies:** FE-017, FE-018
- **Complexity:** M
- **Layer:** Frontend

#### INT-001: End-to-End Integration Testing
- **Description:** Implement Playwright E2E tests for critical paths.
- **Scope:**
  - Manual sample submission flow
  - Violation acknowledgment flow
  - Configuration update flow
  - Real-time WebSocket update verification
- **Acceptance Criteria:**
  - [ ] 5+ critical path tests pass
  - [ ] Tests run in CI pipeline
  - [ ] Visual regression captured
  - [ ] Test report generated
- **Dependencies:** All FE features
- **Complexity:** L
- **Layer:** Full-stack

#### INT-002: Performance Testing
- **Description:** Load test with target scale (1000 characteristics).
- **Scope:**
  - Concurrent WebSocket connections
  - Sample submission throughput
  - Database query performance
  - Memory usage monitoring
- **Acceptance Criteria:**
  - [ ] 100 concurrent WebSocket connections
  - [ ] 50 samples/second sustained
  - [ ] P95 API latency < 200ms
  - [ ] Memory stable over 1 hour
- **Dependencies:** All BE features
- **Complexity:** M
- **Layer:** Full-stack

#### DEV-001: Docker Deployment Package
- **Description:** Create production-ready Docker images and Compose configuration.
- **Scope:**
  - Backend Dockerfile (multi-stage)
  - Frontend Dockerfile (nginx)
  - Docker Compose for full stack
  - Environment variable configuration
  - Health check endpoints
- **Acceptance Criteria:**
  - [ ] `docker compose up` starts full stack
  - [ ] Health checks pass
  - [ ] Logs accessible via Docker
  - [ ] Volume mounts for database persistence
  - [ ] Environment variables documented
- **Dependencies:** All features
- **Complexity:** M
- **Layer:** DevOps

---

## Summary by Layer

| Layer | Count | S | M | L | XL |
|-------|-------|---|---|---|-----|
| Backend | 20 | 3 | 11 | 4 | 1 |
| Frontend | 20 | 4 | 10 | 5 | 0 |
| Full-stack | 2 | 0 | 1 | 1 | 0 |
| DevOps | 1 | 0 | 1 | 0 | 0 |
| **Total** | **43** | **7** | **23** | **10** | **1** |

---

*Feature breakdown complete. Ready for task graph and sprint planning.*
