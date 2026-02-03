# OpenSPC UI Design Handoff

## Document Information
- **From:** UI/UX Designer, Virtual Engineering Co.
- **To:** Tech Lead / Frontend Developer
- **Project:** OpenSPC - Event-Driven Statistical Process Control System
- **Date:** 2026-02-02
- **Status:** Ready for Implementation

---

## 1. Executive Summary

This document provides a comprehensive handoff of UI/UX design specifications for the OpenSPC frontend application. The design follows a **desktop-first approach** optimized for factory floor environments while maintaining usability on tablets.

### Design Documents Delivered

| Document | Purpose |
|----------|---------|
| `ui-wireframes.md` | ASCII wireframes for all major views |
| `design-system.md` | Colors, typography, spacing, component inventory |
| `component-specs.md` | Detailed React component specifications |
| `responsive-spec.md` | Responsive behavior and breakpoints |
| `handoff-ui-design.md` | This summary and implementation guidance |

---

## 2. Component Implementation Order

Implement components in this order to enable incremental integration and testing:

### Phase 1: Foundation (Week 1)
1. **Layout Components**
   - `AppHeader` - Navigation and plant selector
   - `ConnectionStatus` - WebSocket status footer
   - Basic page shell with routing

2. **Common Components**
   - `EmptyState` - Placeholder for no data
   - `LoadingSkeleton` - Loading states
   - shadcn/ui setup and configuration

### Phase 2: Operator Dashboard (Week 2)
3. **Todo List Components**
   - `TodoCard` - Status-colored cards
   - `TodoList` - Scrollable card container
   - Status sorting logic

4. **Input Components**
   - `MeasurementInput` - Large numeric input
   - `SpecPositionIndicator` - Visual spec bar
   - `InputModal` - Full measurement entry dialog

### Phase 3: Charts (Week 3)
5. **Chart Components**
   - `ChartZones` - Zone band rendering
   - `CustomDot` - Interactive chart points
   - `ControlChart` - Main X-Bar/I-MR chart
   - `DistributionHistogram` - Bell curve view

6. **Chart Integration**
   - Tooltip behavior
   - Point selection
   - Violation highlighting

### Phase 4: Configuration (Week 4)
7. **Tree Components**
   - `NodeIcon` - Type-based icons
   - `HierarchyTree` - Expandable tree
   - Tree state management

8. **Form Components**
   - `NelsonRulesGrid` - Rule checkboxes
   - `CharacteristicForm` - Full config form
   - `TagBrowserModal` - MQTT topic picker

### Phase 5: Alerts (Week 5)
9. **Alert Components**
   - `ViolationToast` - Toast notifications
   - `AckDialog` - Acknowledgment modal
   - `AlertHistory` - Optional history drawer

---

## 3. State Management Patterns

### 3.1 Zustand Store Structure

```typescript
// stores/dashboardStore.ts
interface DashboardStore {
  // Selection state
  selectedCharacteristic: Characteristic | null;
  setSelectedCharacteristic: (char: Characteristic | null) => void;

  // Modal state
  isInputModalOpen: boolean;
  openInputModal: (charId: number) => void;
  closeInputModal: () => void;

  // Chart preferences
  chartType: 'xbar' | 'imr';
  setChartType: (type: 'xbar' | 'imr') => void;
  timeRange: '1h' | '8h' | '24h' | '7d';
  setTimeRange: (range: string) => void;

  // Real-time data (updated via WebSocket)
  samples: Map<number, Sample[]>;
  addSample: (charId: number, sample: Sample) => void;
  violations: Violation[];
  addViolation: (violation: Violation) => void;
}
```

### 3.2 TanStack Query Integration

```typescript
// hooks/useCharacteristics.ts
export const useCharacteristics = (plantId: string) => {
  return useQuery({
    queryKey: ['characteristics', plantId],
    queryFn: () => api.getCharacteristics(plantId),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

// hooks/useSamples.ts
export const useSamples = (charId: number) => {
  return useQuery({
    queryKey: ['samples', charId],
    queryFn: () => api.getSamples(charId, { limit: 100 }),
    refetchOnWindowFocus: false, // WebSocket handles updates
  });
};

// Optimistic update for manual submission
export const useSubmitSample = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: api.submitSample,
    onMutate: async (newSample) => {
      await queryClient.cancelQueries(['samples', newSample.charId]);
      const previous = queryClient.getQueryData(['samples', newSample.charId]);
      queryClient.setQueryData(['samples', newSample.charId], (old) => [
        ...old,
        { ...newSample, id: 'temp-' + Date.now() },
      ]);
      return { previous };
    },
    onError: (err, newSample, context) => {
      queryClient.setQueryData(['samples', newSample.charId], context.previous);
    },
    onSettled: (data, error, variables) => {
      queryClient.invalidateQueries(['samples', variables.charId]);
    },
  });
};
```

### 3.3 Configuration Store

```typescript
// stores/configStore.ts
interface ConfigStore {
  // Tree state
  selectedNode: HierarchyNode | null;
  expandedNodes: Set<number>;
  toggleNode: (nodeId: number) => void;

  // Form state
  selectedCharacteristic: Characteristic | null;
  formDirty: boolean;
  setFormDirty: (dirty: boolean) => void;

  // Tag browser
  isTagBrowserOpen: boolean;
  openTagBrowser: () => void;
  closeTagBrowser: () => void;
}
```

---

## 4. WebSocket Event Handling

### 4.1 WebSocket Hook

```typescript
// hooks/useWebSocket.ts
interface WSMessage {
  type: 'sample' | 'violation' | 'ack_update' | 'control_limits';
  payload: unknown;
}

export const useWebSocket = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const socketRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    const ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      setIsConnected(true);
      setReconnectAttempts(0);
      // Re-subscribe to active characteristics
      const store = useDashboardStore.getState();
      if (store.selectedCharacteristic) {
        ws.send(JSON.stringify({
          type: 'subscribe',
          characteristicIds: [store.selectedCharacteristic.id],
        }));
      }
    };

    ws.onmessage = (event) => {
      const message: WSMessage = JSON.parse(event.data);
      handleMessage(message);
    };

    ws.onclose = () => {
      setIsConnected(false);
      // Exponential backoff reconnection
      const delay = Math.min(1000 * 2 ** reconnectAttempts, 30000);
      setTimeout(() => {
        setReconnectAttempts((n) => n + 1);
        connect();
      }, delay);
    };

    socketRef.current = ws;
  }, [reconnectAttempts]);

  // Message handlers
  const handleMessage = (message: WSMessage) => {
    const store = useDashboardStore.getState();
    const queryClient = useQueryClient();

    switch (message.type) {
      case 'sample':
        // Update samples in store and query cache
        store.addSample(message.payload.characteristicId, message.payload);
        queryClient.setQueryData(
          ['samples', message.payload.characteristicId],
          (old: Sample[]) => [...(old || []), message.payload].slice(-100)
        );
        break;

      case 'violation':
        // Add violation and show toast
        store.addViolation(message.payload);
        showViolationToast(message.payload);
        break;

      case 'ack_update':
        // Update violation acknowledgment status
        queryClient.invalidateQueries(['violations']);
        break;

      case 'control_limits':
        // Refetch characteristic details
        queryClient.invalidateQueries(['characteristic', message.payload.id]);
        break;
    }
  };

  // Subscribe/unsubscribe functions
  const subscribe = (characteristicIds: number[]) => {
    socketRef.current?.send(JSON.stringify({
      type: 'subscribe',
      characteristicIds,
    }));
  };

  const unsubscribe = (characteristicIds: number[]) => {
    socketRef.current?.send(JSON.stringify({
      type: 'unsubscribe',
      characteristicIds,
    }));
  };

  return { isConnected, reconnectAttempts, subscribe, unsubscribe };
};
```

### 4.2 Integration in Dashboard

```typescript
// pages/OperatorDashboard.tsx
const OperatorDashboard: React.FC = () => {
  const { selectedCharacteristic, setSelectedCharacteristic } = useDashboardStore();
  const { isConnected, subscribe, unsubscribe } = useWebSocket();
  const { data: characteristics } = useCharacteristics(plantId);

  // Subscribe to all manual characteristics on mount
  useEffect(() => {
    if (characteristics) {
      const manualIds = characteristics
        .filter((c) => c.providerType === 'MANUAL')
        .map((c) => c.id);
      subscribe(manualIds);
      return () => unsubscribe(manualIds);
    }
  }, [characteristics, subscribe, unsubscribe]);

  // Subscribe to selected characteristic for detailed data
  useEffect(() => {
    if (selectedCharacteristic) {
      subscribe([selectedCharacteristic.id]);
      return () => unsubscribe([selectedCharacteristic.id]);
    }
  }, [selectedCharacteristic, subscribe, unsubscribe]);

  // ...rest of component
};
```

---

## 5. Key Interactions and Animations

### 5.1 Violation Pulse Animation

**CSS (or Tailwind plugin):**
```css
@keyframes violation-pulse {
  0%, 100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.3);
    opacity: 0.7;
  }
}

.animate-violation-pulse {
  animation: violation-pulse 1.5s ease-in-out infinite;
}
```

**Usage in CustomDot:**
```tsx
{isViolation && !isAcknowledged && (
  <circle
    cx={cx}
    cy={cy}
    r={14}
    fill="none"
    stroke="#EF4444"
    strokeWidth={2}
    className="animate-violation-pulse"
  />
)}
```

### 5.2 Card Status Transitions

```tsx
<Card
  className={cn(
    'transition-all duration-200 ease-in-out',
    'hover:shadow-md hover:-translate-y-0.5',
    statusStyles[status].bg,
    statusStyles[status].border,
    isSelected && 'ring-2 ring-blue-500 ring-offset-2'
  )}
>
```

### 5.3 Modal Enter/Exit

Using shadcn/ui Dialog with Radix primitives:
```tsx
<Dialog open={isOpen} onOpenChange={setOpen}>
  <DialogContent className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
    {/* Content */}
  </DialogContent>
</Dialog>
```

### 5.4 Toast Slide-In

Using Sonner for toasts:
```typescript
import { toast } from 'sonner';

// Sonner handles animations automatically
toast.custom(
  (t) => <ViolationToastContent {...props} />,
  { position: 'top-right', duration: 10000 }
);
```

### 5.5 Input Validation Shake

```css
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-8px); }
  75% { transform: translateX(8px); }
}

.animate-shake {
  animation: shake 0.3s ease-in-out;
}
```

**Trigger on validation error:**
```tsx
const [shouldShake, setShouldShake] = useState(false);

useEffect(() => {
  if (validationState === 'error') {
    setShouldShake(true);
    const timer = setTimeout(() => setShouldShake(false), 300);
    return () => clearTimeout(timer);
  }
}, [validationState]);

<Input className={cn(shouldShake && 'animate-shake')} />
```

---

## 6. Recharts Configuration

### 6.1 Common Chart Setup

```typescript
// utils/chartConfig.ts
export const CHART_MARGINS = {
  top: 20,
  right: 30,
  left: 60,
  bottom: 40,
};

export const AXIS_STYLE = {
  fontSize: 12,
  fill: '#6B7280', // gray-500
  fontFamily: 'Inter, system-ui, sans-serif',
};

export const GRID_STYLE = {
  strokeDasharray: '3 3',
  stroke: '#E5E7EB', // gray-200
};

export const LINE_STYLE = {
  stroke: '#2563EB', // blue-600
  strokeWidth: 2,
};
```

### 6.2 Reference Line Labels

```tsx
<ReferenceLine
  y={controlLimits.ucl}
  stroke="#EF4444"
  strokeWidth={2}
  label={{
    value: `UCL: ${controlLimits.ucl.toFixed(2)}`,
    position: 'right',
    fill: '#EF4444',
    fontSize: 11,
  }}
/>
```

### 6.3 Custom Tooltip

```tsx
const ChartTooltip: React.FC<TooltipProps<number, string>> = ({ active, payload }) => {
  if (!active || !payload?.[0]) return null;

  const data = payload[0].payload;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm">
      <p className="font-medium">Sample #{data.sampleNumber}</p>
      <p className="text-gray-600">{formatDateTime(data.timestamp)}</p>
      <p className="text-gray-600">Value: {data.value.toFixed(4)}</p>
      {data.violation && (
        <p className="text-red-600 mt-1">
          Violation: Rule {data.violation.ruleId}
        </p>
      )}
    </div>
  );
};
```

---

## 7. Accessibility Checklist

| Requirement | Implementation |
|-------------|----------------|
| Focus visible | `focus-visible:ring-2 focus-visible:ring-blue-500` |
| Keyboard navigation | Tab order, Enter/Space for actions |
| Screen reader labels | `aria-label`, `aria-describedby` on charts |
| Color contrast | AA compliant (4.5:1 for text) |
| Touch targets | 44px minimum on touch devices |
| Motion preferences | Check `prefers-reduced-motion` |
| Error announcements | `aria-live="polite"` for validation |

### Chart Accessibility

```tsx
<div
  role="img"
  aria-label="X-Bar control chart for Shaft Diameter showing 30 samples"
  aria-describedby="chart-summary"
>
  <ResponsiveContainer>
    <ComposedChart>{/* ... */}</ComposedChart>
  </ResponsiveContainer>
  <div id="chart-summary" className="sr-only">
    Control chart displaying process measurements. Current value is 25.02,
    center line is 25.00, upper control limit is 25.12, lower control limit is 24.88.
    There is 1 violation at sample 30.
  </div>
</div>
```

---

## 8. Error Handling Patterns

### 8.1 API Error Boundary

```tsx
// components/common/ErrorBoundary.tsx
export const QueryErrorBoundary: React.FC<{
  children: React.ReactNode;
  fallback?: React.ReactNode;
}> = ({ children, fallback }) => {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <ErrorBoundary
          onReset={reset}
          fallbackRender={({ error, resetErrorBoundary }) => (
            fallback || (
              <div className="p-6 text-center">
                <AlertCircle className="h-10 w-10 text-red-500 mx-auto mb-4" />
                <h3 className="text-lg font-medium">Something went wrong</h3>
                <p className="text-gray-500 mt-1">{error.message}</p>
                <Button onClick={resetErrorBoundary} className="mt-4">
                  Try again
                </Button>
              </div>
            )
          )}
        >
          {children}
        </ErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  );
};
```

### 8.2 Form Validation Errors

```tsx
// Display inline validation errors
<div className="space-y-2">
  <Label htmlFor="usl" className={cn(errors.usl && 'text-red-500')}>
    USL
  </Label>
  <Input
    id="usl"
    type="number"
    value={usl}
    onChange={(e) => setUsl(e.target.value)}
    className={cn(errors.usl && 'border-red-500')}
    aria-invalid={!!errors.usl}
    aria-describedby={errors.usl ? 'usl-error' : undefined}
  />
  {errors.usl && (
    <p id="usl-error" className="text-sm text-red-500">
      {errors.usl}
    </p>
  )}
</div>
```

### 8.3 WebSocket Disconnection

```tsx
// Visual indicator in ConnectionStatus
{!isConnected && (
  <Alert variant="warning" className="fixed bottom-16 left-4 right-4 md:left-auto md:w-80">
    <AlertTriangle className="h-4 w-4" />
    <AlertTitle>Connection Lost</AlertTitle>
    <AlertDescription>
      Attempting to reconnect... ({reconnectAttempts})
      <br />
      Data may not be up to date.
    </AlertDescription>
  </Alert>
)}
```

---

## 9. Testing Notes

### 9.1 Component Testing Priority

| Component | Test Priority | Key Test Cases |
|-----------|---------------|----------------|
| TodoCard | High | Status colors, click handling |
| MeasurementInput | High | Validation states, numeric input |
| ControlChart | High | Zone rendering, point interaction |
| InputModal | High | Submit flow, validation |
| HierarchyTree | Medium | Expand/collapse, selection |
| AckDialog | Medium | Form submission, reason codes |

### 9.2 Visual Regression Tests

Capture screenshots for:
- Empty states (no data)
- Loading states
- Error states
- Chart with various violation patterns
- All card status colors
- Modal open/closed states

### 9.3 Interaction Tests (Playwright)

```typescript
test('operator can submit measurement', async ({ page }) => {
  await page.goto('/dashboard');

  // Click on due card
  await page.click('[data-testid="todo-card-due"]');

  // Enter measurement
  await page.fill('[data-testid="measurement-input"]', '25.08');

  // Verify validation state
  await expect(page.locator('[data-testid="validation-message"]')).toContainText('Within specification');

  // Submit
  await page.click('[data-testid="submit-button"]');

  // Verify modal closes and toast appears
  await expect(page.locator('[data-testid="input-modal"]')).not.toBeVisible();
  await expect(page.locator('.sonner-toast')).toContainText('Measurement saved');
});
```

---

## 10. Design Reference Links

### 10.1 Document Locations

All design artifacts are located in:
```
C:\Users\djbra\Projects\SPC-client\.company\artifacts\ui-designer\
  ui-wireframes.md       # ASCII wireframes for all views
  design-system.md       # Colors, typography, component inventory
  component-specs.md     # Detailed React component specs
  responsive-spec.md     # Responsive behavior
  handoff-ui-design.md   # This document
```

### 10.2 External References

- **shadcn/ui:** https://ui.shadcn.com/
- **Recharts:** https://recharts.org/en-US/
- **Tailwind CSS:** https://tailwindcss.com/
- **Lucide Icons:** https://lucide.dev/
- **Sonner (Toasts):** https://sonner.emilkowal.ski/

---

## 11. Open Questions for Tech Lead

1. **Dark Mode Priority:** Should dark mode be implemented in Phase 1 or deferred?

2. **Offline Support:** Any requirements for offline measurement caching?

3. **Print Styles:** Are printable chart views needed for quality reports?

4. **Localization:** Are there plans for multi-language support affecting text lengths?

5. **Chart Export:** What formats are needed (PNG, SVG, PDF)?

6. **Keyboard Shortcuts:** Should we implement keyboard shortcuts for power users?

---

## 12. Sign-Off

**UI/UX Design Phase Complete**

- [ ] Wireframes reviewed and approved
- [ ] Design system documented
- [ ] Component specifications complete
- [ ] Responsive behavior defined
- [ ] Handoff documentation provided

**Ready for Frontend Implementation**

---

*Design handoff complete. Contact UI/UX Designer for clarifications during implementation.*
