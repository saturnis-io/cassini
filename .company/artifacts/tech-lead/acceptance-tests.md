# OpenSPC Acceptance Tests

## Document Information
- **Project:** OpenSPC - Event-Driven Statistical Process Control System
- **Author:** Tech Lead, Virtual Engineering Co.
- **Date:** 2026-02-02
- **Status:** Ready for Development

---

## Test Strategy Overview

### Test Pyramid

```
                    /\
                   /  \
                  / E2E \         5 critical paths
                 /--------\
                /Integration\     20+ API flows
               /--------------\
              /   Unit Tests    \  200+ functions
             /--------------------\
```

### Coverage Targets

| Layer | Target | Focus |
|-------|--------|-------|
| Unit | 80%+ | Business logic, calculations |
| Integration | Key flows | API endpoints, database |
| E2E | Critical paths | User journeys |

---

## 1. Backend Unit Tests

### BE-001: Database Schema & ORM Models

#### Test: Hierarchy Model CRUD
```python
# test_db/test_models/test_hierarchy.py

async def test_create_hierarchy_node():
    """Create a hierarchy node with valid data"""
    node = Hierarchy(name="Test_Site", type="Site")
    session.add(node)
    await session.commit()
    assert node.id is not None
    assert node.depth == 0
    assert node.path == f"/{node.id}/"

async def test_hierarchy_parent_child_relationship():
    """Child node references parent correctly"""
    parent = await create_hierarchy(name="Parent", type="Site")
    child = await create_hierarchy(name="Child", type="Area", parent_id=parent.id)
    assert child.parent_id == parent.id
    assert child.depth == parent.depth + 1
    assert child.path.startswith(parent.path)

async def test_hierarchy_cascade_delete_restricted():
    """Cannot delete node with children"""
    parent = await create_hierarchy(name="Parent", type="Site")
    child = await create_hierarchy(name="Child", type="Area", parent_id=parent.id)
    with pytest.raises(IntegrityError):
        await session.delete(parent)
        await session.commit()
```

#### Test: Characteristic Model Constraints
```python
async def test_characteristic_subgroup_size_validation():
    """Subgroup size must be 1-25"""
    with pytest.raises(IntegrityError):
        char = Characteristic(name="Test", subgroup_size=26, hierarchy_id=1)
        session.add(char)
        await session.commit()

async def test_characteristic_tag_requires_topic():
    """TAG provider requires mqtt_topic"""
    with pytest.raises(IntegrityError):
        char = Characteristic(
            name="Test",
            provider_type="TAG",
            mqtt_topic=None,  # Should fail
            hierarchy_id=1
        )
        session.add(char)
        await session.commit()
```

### BE-002: Repository Pattern Implementation

#### Test: SampleRepository Rolling Window
```python
# test_db/test_repositories/test_sample_repo.py

async def test_get_rolling_window_returns_chronological_order():
    """Rolling window samples returned oldest-first"""
    char = await create_characteristic()
    samples = [
        await create_sample(char_id=char.id, timestamp=datetime(2026, 1, i+1))
        for i in range(30)
    ]

    window = await sample_repo.get_rolling_window(char.id, window_size=25)

    assert len(window) == 25
    assert window[0].timestamp < window[-1].timestamp  # Chronological

async def test_get_rolling_window_excludes_excluded_samples():
    """Excluded samples not in rolling window by default"""
    char = await create_characteristic()
    s1 = await create_sample(char_id=char.id, is_excluded=False)
    s2 = await create_sample(char_id=char.id, is_excluded=True)
    s3 = await create_sample(char_id=char.id, is_excluded=False)

    window = await sample_repo.get_rolling_window(char.id, window_size=10)

    assert len(window) == 2
    assert s2.id not in [s.id for s in window]
```

### BE-003: Statistical Constants & Utilities

#### Test: d2 Constants Match ASTM E2587
```python
# test_core/test_statistics.py

@pytest.mark.parametrize("n,expected_d2", [
    (2, 1.128),
    (3, 1.693),
    (4, 2.059),
    (5, 2.326),
    (6, 2.534),
    (7, 2.704),
    (8, 2.847),
    (9, 2.970),
    (10, 3.078),
])
def test_d2_constant_matches_astm_e2587(n: int, expected_d2: float):
    """d2 constants match ASTM E2587 table values"""
    assert d2(n) == pytest.approx(expected_d2, rel=1e-3)

def test_sigma_estimation_rbar_d2_method():
    """R-bar/d2 sigma estimation for n=5 subgroups"""
    # Known data with sigma = 1.0
    samples = [
        [9.8, 10.2, 10.0, 9.9, 10.1],  # R = 0.4
        [10.1, 9.9, 10.0, 10.2, 9.8],  # R = 0.4
        [10.0, 10.1, 9.9, 10.0, 10.0], # R = 0.2
    ]

    sigma = estimate_sigma_rbar_d2(samples)

    # R-bar = 0.333, d2(5) = 2.326
    # sigma = 0.333 / 2.326 = 0.143
    assert sigma == pytest.approx(0.143, rel=0.05)
```

### BE-004: Rolling Window Manager

#### Test: Zone Calculation
```python
# test_core/test_rolling_window.py

def test_zone_boundaries_calculated_correctly():
    """Zone boundaries at 1, 2, 3 sigma from center"""
    window = RollingWindow(center_line=100.0, sigma=10.0)

    assert window.zone_boundaries.zone_a_upper == pytest.approx(130.0)
    assert window.zone_boundaries.zone_a_lower == pytest.approx(70.0)
    assert window.zone_boundaries.zone_b_upper == pytest.approx(120.0)
    assert window.zone_boundaries.zone_b_lower == pytest.approx(80.0)
    assert window.zone_boundaries.zone_c_upper == pytest.approx(110.0)
    assert window.zone_boundaries.zone_c_lower == pytest.approx(90.0)

def test_get_zone_returns_correct_zone():
    """get_zone() returns correct zone for value"""
    window = RollingWindow(center_line=100.0, sigma=10.0)

    assert window.get_zone(100.0) == Zone.ZONE_C  # Center
    assert window.get_zone(105.0) == Zone.ZONE_C  # Within 1 sigma
    assert window.get_zone(115.0) == Zone.ZONE_B  # 1-2 sigma
    assert window.get_zone(125.0) == Zone.ZONE_A  # 2-3 sigma
    assert window.get_zone(135.0) == Zone.BEYOND  # Beyond 3 sigma
```

### BE-005: Nelson Rules Implementation

#### Test: Rule 1 - Outlier Detection
```python
# test_core/test_nelson_rules.py

def test_rule1_detects_point_above_ucl():
    """Rule 1: Point beyond +3 sigma triggers"""
    window = create_window(center=10.0, sigma=1.0, samples=[
        10.0, 10.1, 9.9, 10.0, 13.5  # Last point > UCL (13.0)
    ])

    result = Rule1Outlier().check(window)

    assert result is not None
    assert result.rule_id == 1
    assert result.severity == "CRITICAL"
    assert len(result.involved_sample_ids) == 1

def test_rule1_no_violation_within_limits():
    """Rule 1: Points within limits don't trigger"""
    window = create_window(center=10.0, sigma=1.0, samples=[
        10.0, 10.1, 9.9, 12.9  # All within UCL (13.0)
    ])

    result = Rule1Outlier().check(window)

    assert result is None
```

#### Test: Rule 2 - Shift Detection
```python
def test_rule2_detects_nine_above_center():
    """Rule 2: 9 consecutive points above center line"""
    window = create_window(center=10.0, sigma=1.0, samples=[
        10.5, 10.3, 10.8, 10.2, 10.6, 10.1, 10.4, 10.7, 10.9
    ])  # All 9 above 10.0

    result = Rule2Shift().check(window)

    assert result is not None
    assert result.rule_id == 2
    assert len(result.involved_sample_ids) == 9

def test_rule2_no_violation_with_eight_same_side():
    """Rule 2: Only 8 points same side doesn't trigger"""
    window = create_window(center=10.0, sigma=1.0, samples=[
        10.5, 10.3, 10.8, 10.2, 10.6, 10.1, 10.4, 10.7
    ])  # Only 8 above

    result = Rule2Shift().check(window)

    assert result is None
```

#### Test: Rule 3 - Trend Detection
```python
def test_rule3_detects_six_increasing():
    """Rule 3: 6 consecutive points increasing"""
    window = create_window(center=10.0, sigma=1.0, samples=[
        9.5, 9.7, 9.9, 10.1, 10.3, 10.5
    ])  # Strictly increasing

    result = Rule3Trend().check(window)

    assert result is not None
    assert result.rule_id == 3

def test_rule3_no_violation_with_plateau():
    """Rule 3: Plateau breaks trend"""
    window = create_window(center=10.0, sigma=1.0, samples=[
        9.5, 9.7, 9.9, 9.9, 10.1, 10.3  # Plateau at position 3
    ])

    result = Rule3Trend().check(window)

    assert result is None
```

#### Property-Based Tests with Hypothesis
```python
from hypothesis import given, strategies as st

@given(st.lists(st.floats(min_value=0, max_value=100), min_size=25, max_size=100))
def test_rule1_never_triggers_within_limits(values):
    """Rule 1 should never trigger for values within 3 sigma"""
    center = sum(values) / len(values)
    sigma = max(abs(v - center) for v in values) / 2.9  # Ensure all within 3 sigma

    window = create_window(center=center, sigma=sigma, samples=values)
    result = Rule1Outlier().check(window)

    assert result is None
```

### BE-006: SPC Engine Core

#### Test: Full Processing Pipeline
```python
# test_core/test_spc_engine.py

async def test_process_sample_persists_and_evaluates():
    """Sample processing persists data and evaluates rules"""
    engine = create_spc_engine()
    char = await create_characteristic(
        subgroup_size=1,
        center_line=10.0,
        ucl=13.0,
        lcl=7.0,
        enabled_rules=[1, 2, 3]
    )

    # Submit normal sample
    result = await engine.process_sample(SampleEvent(
        characteristic_id=char.id,
        measurements=[10.5],
        timestamp=datetime.utcnow(),
    ))

    assert result.sample_id is not None
    assert result.in_control is True
    assert len(result.violations) == 0

async def test_process_sample_creates_violation():
    """Out-of-control sample creates violation record"""
    engine = create_spc_engine()
    char = await create_characteristic(ucl=13.0, enabled_rules=[1])

    # Submit OOC sample
    result = await engine.process_sample(SampleEvent(
        characteristic_id=char.id,
        measurements=[14.0],  # Above UCL
        timestamp=datetime.utcnow(),
    ))

    assert result.in_control is False
    assert len(result.violations) == 1
    assert result.violations[0].rule_id == 1
```

---

## 2. Backend Integration Tests

### API Endpoint Tests

#### Test: POST /api/v1/samples
```python
# test_api/test_samples.py

async def test_submit_sample_returns_processing_result(client: AsyncClient):
    """POST /samples returns sample with violations"""
    char = await create_characteristic(provider_type="MANUAL", subgroup_size=1)

    response = await client.post("/api/v1/samples", json={
        "characteristic_id": char.id,
        "measurements": [10.5],
        "context": {"batch_number": "BATCH-001"}
    })

    assert response.status_code == 201
    data = response.json()["data"]
    assert data["id"] is not None
    assert data["mean"] == 10.5
    assert "in_control" in data
    assert "violations" in data

async def test_submit_sample_validates_measurement_count(client: AsyncClient):
    """POST /samples rejects wrong measurement count"""
    char = await create_characteristic(subgroup_size=5)  # Expects 5 measurements

    response = await client.post("/api/v1/samples", json={
        "characteristic_id": char.id,
        "measurements": [10.5, 10.6, 10.4],  # Only 3
    })

    assert response.status_code == 400
    assert "MEASUREMENT_COUNT_MISMATCH" in response.json()["error"]["code"]

async def test_submit_sample_rejects_tag_characteristic(client: AsyncClient):
    """POST /samples rejects TAG provider characteristics"""
    char = await create_characteristic(provider_type="TAG")

    response = await client.post("/api/v1/samples", json={
        "characteristic_id": char.id,
        "measurements": [10.5],
    })

    assert response.status_code == 409
    assert "PROVIDER_TYPE_MISMATCH" in response.json()["error"]["code"]
```

#### Test: POST /api/v1/violations/{id}/acknowledge
```python
async def test_acknowledge_violation_updates_record(client: AsyncClient):
    """POST /violations/{id}/acknowledge updates violation"""
    violation = await create_violation(acknowledged=False)

    response = await client.post(f"/api/v1/violations/{violation.id}/acknowledge", json={
        "user": "J.Smith",
        "reason": "Calibration adjusted"
    })

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["acknowledged"] is True
    assert data["ack_user"] == "J.Smith"
    assert data["ack_timestamp"] is not None

async def test_acknowledge_already_acknowledged_returns_409(client: AsyncClient):
    """Cannot acknowledge already acknowledged violation"""
    violation = await create_violation(acknowledged=True)

    response = await client.post(f"/api/v1/violations/{violation.id}/acknowledge", json={
        "user": "J.Smith",
        "reason": "Duplicate"
    })

    assert response.status_code == 409
    assert "ALREADY_ACKNOWLEDGED" in response.json()["error"]["code"]
```

#### Test: WebSocket Sample Stream
```python
async def test_websocket_receives_sample_events():
    """WebSocket client receives sample events after subscription"""
    async with websockets.connect("ws://localhost:8000/ws/samples") as ws:
        # Subscribe
        await ws.send(json.dumps({
            "type": "subscribe",
            "characteristic_ids": [1]
        }))

        # Submit sample via REST
        await client.post("/api/v1/samples", json={
            "characteristic_id": 1,
            "measurements": [10.5]
        })

        # Receive broadcast
        message = json.loads(await asyncio.wait_for(ws.recv(), timeout=5.0))

        assert message["type"] == "sample"
        assert message["payload"]["characteristic_id"] == 1
```

---

## 3. Frontend Unit Tests

### Component Tests with Vitest + React Testing Library

#### Test: TodoCard Status Styling
```typescript
// src/components/operator/__tests__/TodoCard.test.tsx

describe('TodoCard', () => {
  it('renders grey styling for ok status', () => {
    render(<TodoCard characteristic={mockOkCharacteristic} />);

    const card = screen.getByTestId('todo-card');
    expect(card).toHaveClass('bg-gray-50');
    expect(card).toHaveClass('border-gray-200');
  });

  it('renders yellow styling for due status', () => {
    render(<TodoCard characteristic={mockDueCharacteristic} />);

    const card = screen.getByTestId('todo-card');
    expect(card).toHaveClass('bg-yellow-100');
    expect(card).toHaveClass('border-yellow-600');
  });

  it('renders red styling with pulsing badge for ooc status', () => {
    render(<TodoCard characteristic={mockOocCharacteristic} />);

    const card = screen.getByTestId('todo-card');
    expect(card).toHaveClass('bg-red-100');

    const badge = screen.getByText('OOC');
    expect(badge).toHaveClass('animate-violation-pulse');
  });

  it('shows ring highlight when selected', () => {
    render(<TodoCard characteristic={mockCharacteristic} isSelected={true} />);

    const card = screen.getByTestId('todo-card');
    expect(card).toHaveClass('ring-2');
    expect(card).toHaveClass('ring-blue-500');
  });
});
```

#### Test: MeasurementInput Validation
```typescript
// src/components/operator/__tests__/MeasurementInput.test.tsx

describe('MeasurementInput', () => {
  const defaultProps = {
    value: '',
    onChange: vi.fn(),
    usl: 100,
    lsl: 90,
  };

  it('shows valid state for value within spec', () => {
    render(<MeasurementInput {...defaultProps} value="95" />);

    const input = screen.getByRole('textbox');
    expect(input).toHaveClass('border-green-500');
    expect(screen.getByText('Within specification')).toBeInTheDocument();
  });

  it('shows warning state for value near limit', () => {
    render(<MeasurementInput {...defaultProps} value="99" />);  // Within 10% of USL

    const input = screen.getByRole('textbox');
    expect(input).toHaveClass('border-amber-500');
    expect(screen.getByText('Approaching limit')).toBeInTheDocument();
  });

  it('shows error state for value outside spec', () => {
    render(<MeasurementInput {...defaultProps} value="105" />);  // Above USL

    const input = screen.getByRole('textbox');
    expect(input).toHaveClass('border-red-500');
    expect(screen.getByText(/Above USL/)).toBeInTheDocument();
  });

  it('applies shake animation on error', async () => {
    const { rerender } = render(<MeasurementInput {...defaultProps} value="95" />);

    rerender(<MeasurementInput {...defaultProps} value="105" />);

    const input = screen.getByRole('textbox');
    expect(input).toHaveClass('animate-shake');
  });
});
```

#### Test: ControlChart Zone Rendering
```typescript
// src/components/charts/__tests__/ChartZones.test.tsx

describe('ChartZones', () => {
  const defaultProps = {
    ucl: 130,
    cl: 100,
    lcl: 70,
  };

  it('calculates correct zone boundaries', () => {
    const { container } = render(
      <ResponsiveContainer>
        <ComposedChart>
          <ChartZones {...defaultProps} />
        </ComposedChart>
      </ResponsiveContainer>
    );

    // Sigma = (130 - 100) / 3 = 10
    const areas = container.querySelectorAll('rect[fill]');

    // Zone C (green): 90-110
    // Zone B (yellow): 80-90, 110-120
    // Zone A (red): 70-80, 120-130
    expect(areas).toHaveLength(5);
  });
});
```

#### Test: WebSocket Hook Reconnection
```typescript
// src/hooks/__tests__/useWebSocket.test.tsx

describe('useWebSocket', () => {
  it('sets isConnected true on open', async () => {
    const mockWs = new MockWebSocket();
    vi.spyOn(global, 'WebSocket').mockImplementation(() => mockWs);

    const { result } = renderHook(() => useWebSocket());

    mockWs.simulateOpen();

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });
  });

  it('attempts reconnection with backoff on close', async () => {
    vi.useFakeTimers();
    const mockWs = new MockWebSocket();
    vi.spyOn(global, 'WebSocket').mockImplementation(() => mockWs);

    const { result } = renderHook(() => useWebSocket());

    mockWs.simulateOpen();
    mockWs.simulateClose();

    expect(result.current.isConnected).toBe(false);
    expect(result.current.reconnectAttempts).toBe(0);

    // First reconnect after 1s
    vi.advanceTimersByTime(1000);
    expect(result.current.reconnectAttempts).toBe(1);

    // Second reconnect after 2s
    mockWs.simulateClose();
    vi.advanceTimersByTime(2000);
    expect(result.current.reconnectAttempts).toBe(2);

    vi.useRealTimers();
  });

  it('restores subscriptions after reconnection', async () => {
    const mockWs = new MockWebSocket();
    vi.spyOn(global, 'WebSocket').mockImplementation(() => mockWs);

    const { result } = renderHook(() => useWebSocket());

    mockWs.simulateOpen();
    act(() => {
      result.current.subscribe([1, 2, 3]);
    });

    // Simulate disconnect and reconnect
    mockWs.simulateClose();
    mockWs.simulateOpen();

    // Check that subscribe was called again
    expect(mockWs.sentMessages).toContainEqual({
      type: 'subscribe',
      characteristicIds: [1, 2, 3]
    });
  });
});
```

---

## 4. End-to-End Tests (Playwright)

### E2E-001: Manual Sample Submission Flow
```typescript
// e2e/manual-sample-flow.spec.ts

test.describe('Manual Sample Submission', () => {
  test('operator can submit valid measurement', async ({ page }) => {
    // Navigate to dashboard
    await page.goto('/dashboard');

    // Select a characteristic card
    await page.click('[data-testid="todo-card-due"]');

    // Click Enter Measurement button
    await page.click('[data-testid="enter-measurement-btn"]');

    // Verify modal opened
    await expect(page.locator('[data-testid="input-modal"]')).toBeVisible();

    // Enter valid measurement
    await page.fill('[data-testid="measurement-input"]', '25.05');

    // Verify valid state
    await expect(page.locator('[data-testid="validation-message"]'))
      .toContainText('Within specification');

    // Submit
    await page.click('[data-testid="submit-btn"]');

    // Verify modal closed
    await expect(page.locator('[data-testid="input-modal"]')).not.toBeVisible();

    // Verify toast success
    await expect(page.locator('.sonner-toast'))
      .toContainText('Measurement saved');

    // Verify chart updated (new point visible)
    const chartPoints = await page.locator('[data-testid="chart-point"]').count();
    expect(chartPoints).toBeGreaterThan(0);
  });

  test('operator sees warning for value near limit', async ({ page }) => {
    await page.goto('/dashboard');
    await page.click('[data-testid="todo-card"]');
    await page.click('[data-testid="enter-measurement-btn"]');

    // Enter value near USL (assuming USL is 26.0)
    await page.fill('[data-testid="measurement-input"]', '25.9');

    // Verify warning state
    await expect(page.locator('[data-testid="validation-message"]'))
      .toContainText('Approaching limit');
    await expect(page.locator('[data-testid="measurement-input"]'))
      .toHaveClass(/border-amber-500/);
  });

  test('submit button disabled for out-of-spec value', async ({ page }) => {
    await page.goto('/dashboard');
    await page.click('[data-testid="todo-card"]');
    await page.click('[data-testid="enter-measurement-btn"]');

    // Enter out-of-spec value
    await page.fill('[data-testid="measurement-input"]', '30.0');

    // Verify error state
    await expect(page.locator('[data-testid="validation-message"]'))
      .toContainText('Above USL');

    // Verify submit disabled
    await expect(page.locator('[data-testid="submit-btn"]')).toBeDisabled();
  });
});
```

### E2E-002: Violation Acknowledgment Flow
```typescript
// e2e/violation-ack-flow.spec.ts

test.describe('Violation Acknowledgment', () => {
  test('operator can acknowledge violation from toast', async ({ page }) => {
    // Setup: Create characteristic with OOC sample
    await setupOocCharacteristic();

    await page.goto('/dashboard');

    // Wait for violation toast
    await expect(page.locator('.violation-toast')).toBeVisible({ timeout: 10000 });

    // Click Acknowledge button on toast
    await page.click('[data-testid="toast-ack-btn"]');

    // Verify ack dialog opened
    await expect(page.locator('[data-testid="ack-dialog"]')).toBeVisible();

    // Select reason code
    await page.click('[data-testid="reason-select"]');
    await page.click('text=Tool wear');

    // Enter corrective action
    await page.fill('[data-testid="corrective-action"]', 'Replaced cutting tool');

    // Submit acknowledgment
    await page.click('[data-testid="ack-submit-btn"]');

    // Verify dialog closed
    await expect(page.locator('[data-testid="ack-dialog"]')).not.toBeVisible();

    // Verify chart point no longer pulsing
    await expect(page.locator('[data-testid="violation-point"].animate-violation-pulse'))
      .not.toBeVisible();
  });

  test('operator can acknowledge from chart point click', async ({ page }) => {
    await setupOocCharacteristic();
    await page.goto('/dashboard');

    // Click on violation point in chart
    await page.click('[data-testid="violation-point"]');

    // Verify ack dialog opened with violation details
    await expect(page.locator('[data-testid="ack-dialog"]')).toBeVisible();
    await expect(page.locator('[data-testid="violation-details"]'))
      .toContainText('Rule 1');
  });
});
```

### E2E-003: Configuration Update Flow
```typescript
// e2e/configuration-flow.spec.ts

test.describe('Characteristic Configuration', () => {
  test('engineer can update spec limits', async ({ page }) => {
    await page.goto('/configuration');

    // Expand hierarchy tree
    await page.click('[data-testid="tree-node-expand-Site1"]');
    await page.click('[data-testid="tree-node-expand-Line1"]');

    // Select characteristic
    await page.click('[data-testid="tree-node-Characteristic1"]');

    // Verify form loaded
    await expect(page.locator('[data-testid="characteristic-form"]')).toBeVisible();

    // Update USL
    await page.fill('[data-testid="input-usl"]', '27.0');

    // Save changes
    await page.click('[data-testid="save-btn"]');

    // Verify success toast
    await expect(page.locator('.sonner-toast')).toContainText('Saved');

    // Reload and verify persisted
    await page.reload();
    await page.click('[data-testid="tree-node-Characteristic1"]');
    await expect(page.locator('[data-testid="input-usl"]')).toHaveValue('27.0');
  });

  test('unsaved changes warning on navigation', async ({ page }) => {
    await page.goto('/configuration');
    await selectCharacteristic(page);

    // Make change
    await page.fill('[data-testid="input-target"]', '25.5');

    // Try to navigate away
    await page.click('[data-testid="nav-dashboard"]');

    // Verify warning dialog
    await expect(page.locator('[data-testid="unsaved-warning"]')).toBeVisible();

    // Cancel navigation
    await page.click('[data-testid="warning-cancel"]');

    // Verify still on configuration page
    expect(page.url()).toContain('/configuration');
  });
});
```

### E2E-004: Real-Time WebSocket Updates
```typescript
// e2e/realtime-updates.spec.ts

test.describe('Real-Time Updates', () => {
  test('chart updates when new sample received via WebSocket', async ({ page }) => {
    await page.goto('/dashboard');
    await selectCharacteristic(page);

    // Count initial points
    const initialCount = await page.locator('[data-testid="chart-point"]').count();

    // Simulate WebSocket message (via API injection or actual sample submission)
    await submitSampleViaApi(characteristicId, 25.1);

    // Wait for chart update
    await expect(async () => {
      const newCount = await page.locator('[data-testid="chart-point"]').count();
      expect(newCount).toBe(initialCount + 1);
    }).toPass({ timeout: 5000 });
  });

  test('connection status shows reconnecting state', async ({ page }) => {
    await page.goto('/dashboard');

    // Verify connected state
    await expect(page.locator('[data-testid="connection-status"]'))
      .toContainText('Connected');

    // Simulate disconnect (requires backend cooperation or mock)
    await simulateWebSocketDisconnect();

    // Verify reconnecting state
    await expect(page.locator('[data-testid="connection-status"]'))
      .toContainText('Reconnecting');

    // Restore connection
    await simulateWebSocketReconnect();

    // Verify connected again
    await expect(page.locator('[data-testid="connection-status"]'))
      .toContainText('Connected');
  });
});
```

### E2E-005: Control Limit Recalculation
```typescript
// e2e/control-limit-recalc.spec.ts

test.describe('Control Limit Recalculation', () => {
  test('engineer can trigger recalculation', async ({ page }) => {
    await page.goto('/configuration');
    await selectCharacteristic(page);

    // Note current limits
    const oldUcl = await page.locator('[data-testid="input-ucl"]').inputValue();

    // Click recalculate
    await page.click('[data-testid="recalculate-btn"]');

    // Verify confirmation dialog
    await expect(page.locator('[data-testid="recalc-confirm"]')).toBeVisible();

    // Confirm
    await page.click('[data-testid="recalc-confirm-btn"]');

    // Verify new limits displayed
    await expect(async () => {
      const newUcl = await page.locator('[data-testid="input-ucl"]').inputValue();
      expect(newUcl).not.toBe(oldUcl);
    }).toPass({ timeout: 5000 });

    // Verify success message shows method and samples used
    await expect(page.locator('[data-testid="recalc-result"]'))
      .toContainText('25 samples');
  });
});
```

---

## 5. Performance Tests

### Load Test: Concurrent WebSocket Connections
```python
# test_performance/test_websocket_scale.py

@pytest.mark.performance
async def test_100_concurrent_websocket_connections():
    """System handles 100 concurrent WebSocket connections"""
    connections = []

    async def connect_and_subscribe():
        ws = await websockets.connect("ws://localhost:8000/ws/samples")
        await ws.send(json.dumps({
            "type": "subscribe",
            "characteristic_ids": list(range(1, 11))  # Subscribe to 10 each
        }))
        return ws

    # Connect 100 clients
    connections = await asyncio.gather(*[
        connect_and_subscribe() for _ in range(100)
    ])

    assert len(connections) == 100

    # All connections should be open
    for ws in connections:
        assert ws.open

    # Cleanup
    await asyncio.gather(*[ws.close() for ws in connections])
```

### Load Test: Sample Submission Throughput
```python
@pytest.mark.performance
async def test_50_samples_per_second_sustained():
    """System processes 50 samples/second for 60 seconds"""
    char = await create_characteristic()

    start = time.time()
    sample_count = 0
    errors = 0
    latencies = []

    while time.time() - start < 60:
        batch_start = time.time()

        # Submit 50 samples in 1 second
        tasks = [
            submit_sample(char.id) for _ in range(50)
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        for r in results:
            if isinstance(r, Exception):
                errors += 1
            else:
                sample_count += 1
                latencies.append(r.processing_time_ms)

        # Sleep remaining time in second
        elapsed = time.time() - batch_start
        if elapsed < 1.0:
            await asyncio.sleep(1.0 - elapsed)

    # Assertions
    assert sample_count >= 2900  # 97% success rate
    assert errors < 100
    assert statistics.percentile(latencies, 95) < 200  # P95 < 200ms
```

---

## 6. Test Data Fixtures

### Factory Functions
```python
# tests/factories.py

from factory import Factory, Faker, SubFactory, LazyAttribute
from factory.alchemy import SQLAlchemyModelFactory

class HierarchyFactory(SQLAlchemyModelFactory):
    class Meta:
        model = Hierarchy

    name = Faker('word')
    type = 'Site'
    path = LazyAttribute(lambda o: f"/{o.id}/")
    depth = 0

class CharacteristicFactory(SQLAlchemyModelFactory):
    class Meta:
        model = Characteristic

    name = Faker('word')
    hierarchy = SubFactory(HierarchyFactory)
    subgroup_size = 1
    provider_type = 'MANUAL'
    ucl = 13.0
    lcl = 7.0
    center_line = 10.0
    sigma = 1.0

class SampleFactory(SQLAlchemyModelFactory):
    class Meta:
        model = Sample

    characteristic = SubFactory(CharacteristicFactory)
    timestamp = Faker('date_time_this_month')
    mean = Faker('pyfloat', min_value=8.0, max_value=12.0)
    in_control = True
    is_excluded = False
```

---

*Acceptance tests specification complete. Ready for test-driven development.*
