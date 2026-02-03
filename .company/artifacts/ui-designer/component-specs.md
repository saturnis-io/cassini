# OpenSPC Component Specifications

## Document Information
- **Project:** OpenSPC - Event-Driven Statistical Process Control System
- **Author:** UI/UX Designer, Virtual Engineering Co.
- **Date:** 2026-02-02
- **Status:** Design Specification

---

## 1. Page Components

### 1.1 OperatorDashboard

**Purpose:** Primary view for operators to enter measurements and monitor process health.

**File:** `src/pages/OperatorDashboard.tsx`

**Props:**
```typescript
interface OperatorDashboardProps {
  plantId?: string;  // Optional filter by plant
}
```

**State (Zustand Store):**
```typescript
interface DashboardState {
  selectedCharacteristic: Characteristic | null;
  isInputModalOpen: boolean;
  chartType: 'xbar' | 'imr';
  timeRange: '1h' | '8h' | '24h' | '7d';
}
```

**Layout:**
```
+--------------------------------------------------+
| Header (AppHeader component)                     |
+--------------------------------------------------+
| Split Layout (ResizablePanels)                   |
|  +------------------+  +------------------------+|
|  | TodoList         |  | CharacteristicView     ||
|  | (left panel)     |  | (right panel)          ||
|  | w: 320px fixed   |  | w: flex-1              ||
|  +------------------+  +------------------------+|
+--------------------------------------------------+
| Footer (ConnectionStatus)                        |
+--------------------------------------------------+
```

**Behavior:**
- On mount: Subscribe to WebSocket for real-time updates
- On characteristic select: Load samples, update chart
- On unmount: Cleanup WebSocket subscriptions

**Sub-components:**
- `<TodoList />` - Left panel
- `<CharacteristicView />` - Right panel (chart + histogram)
- `<InputModal />` - Overlay dialog
- `<ViolationToast />` - Corner notifications

---

### 1.2 ConfigurationView

**Purpose:** Engineer interface for managing hierarchy and characteristic settings.

**File:** `src/pages/ConfigurationView.tsx`

**Props:**
```typescript
interface ConfigurationViewProps {
  initialNodeId?: number;  // Pre-select node in tree
}
```

**State:**
```typescript
interface ConfigState {
  selectedNode: HierarchyNode | null;
  selectedCharacteristic: Characteristic | null;
  expandedNodes: Set<number>;
  isDirty: boolean;
}
```

**Layout:**
```
+--------------------------------------------------+
| Header (AppHeader)                               |
+--------------------------------------------------+
| Split Layout                                     |
|  +------------------+  +------------------------+|
|  | HierarchyTree    |  | CharacteristicForm     ||
|  | w: 280px         |  | w: flex-1              ||
|  |                  |  |                        ||
|  | QuickActions     |  | (or EmptyState if      ||
|  | (below tree)     |  |  nothing selected)     ||
|  +------------------+  +------------------------+|
+--------------------------------------------------+
```

**Behavior:**
- Tree selection updates form panel
- Form changes set `isDirty` flag
- Unsaved changes warning on navigation
- Optimistic UI updates with rollback on error

---

## 2. List Components

### 2.1 TodoList

**Purpose:** Scrollable list of manual characteristics requiring attention.

**File:** `src/components/operator/TodoList.tsx`

**Props:**
```typescript
interface TodoListProps {
  characteristics: Characteristic[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onEnterMeasurement: (id: number) => void;
}
```

**Rendering Logic:**
```typescript
// Sort order: Red (OOC) first, then Yellow (due), then Grey
const sortedCharacteristics = useMemo(() => {
  return [...characteristics].sort((a, b) => {
    const statusOrder = { ooc: 0, due: 1, ok: 2 };
    return statusOrder[a.status] - statusOrder[b.status];
  });
}, [characteristics]);
```

**Structure:**
```tsx
<ScrollArea className="h-full">
  <div className="space-y-3 p-4">
    {sortedCharacteristics.map(char => (
      <TodoCard
        key={char.id}
        characteristic={char}
        isSelected={char.id === selectedId}
        onClick={() => onSelect(char.id)}
        onEnter={() => onEnterMeasurement(char.id)}
      />
    ))}
  </div>
</ScrollArea>
```

---

### 2.2 TodoCard

**Purpose:** Individual card showing characteristic status in the to-do list.

**File:** `src/components/operator/TodoCard.tsx`

**Props:**
```typescript
interface TodoCardProps {
  characteristic: {
    id: number;
    name: string;
    machineName: string;
    status: 'ok' | 'due' | 'ooc';
    lastSampleTime: Date | null;
    nextDueTime: Date | null;
    lastViolation?: Violation;
  };
  isSelected: boolean;
  onClick: () => void;
  onEnter: () => void;
}
```

**Status-Based Styling:**
```typescript
const statusStyles = {
  ok: {
    bg: 'bg-gray-50',
    border: 'border-gray-200',
    icon: null,
    text: 'text-gray-600',
  },
  due: {
    bg: 'bg-yellow-100',
    border: 'border-yellow-600',
    icon: <Clock className="text-yellow-600" />,
    text: 'text-yellow-700',
  },
  ooc: {
    bg: 'bg-red-100',
    border: 'border-red-600',
    icon: <AlertTriangle className="text-red-600" />,
    text: 'text-red-700',
  },
};
```

**Structure:**
```tsx
<Card
  className={cn(
    'cursor-pointer transition-all duration-200',
    statusStyles[status].bg,
    statusStyles[status].border,
    isSelected && 'ring-2 ring-blue-500'
  )}
  onClick={onClick}
>
  <CardHeader className="p-4 pb-2">
    <div className="flex items-start justify-between">
      <div className="flex items-center gap-2">
        {statusStyles[status].icon}
        <CardTitle className="text-base">{name}</CardTitle>
      </div>
      {status === 'ooc' && (
        <Badge variant="destructive" className="animate-violation-pulse">
          OOC
        </Badge>
      )}
    </div>
  </CardHeader>
  <CardContent className="p-4 pt-0">
    <p className="text-sm text-gray-600">Machine: {machineName}</p>
    <p className={cn('text-sm', statusStyles[status].text)}>
      {status === 'due' && `Due: ${formatDueTime(nextDueTime)}`}
      {status === 'ooc' && `Violation: Rule ${lastViolation?.ruleId}`}
      {status === 'ok' && `Due in: ${formatTimeUntil(nextDueTime)}`}
    </p>
    <p className="text-xs text-gray-400 mt-1">
      Last: {formatRelativeTime(lastSampleTime)}
    </p>
  </CardContent>
</Card>
```

---

## 3. Modal Components

### 3.1 InputModal

**Purpose:** Large measurement entry dialog with live validation.

**File:** `src/components/operator/InputModal.tsx`

**Props:**
```typescript
interface InputModalProps {
  characteristic: Characteristic;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (measurement: MeasurementSubmission) => Promise<void>;
}

interface MeasurementSubmission {
  value: number;
  comment?: string;
  batchNumber?: string;
}
```

**Internal State:**
```typescript
const [value, setValue] = useState<string>('');
const [comment, setComment] = useState<string>('');
const [validationState, setValidationState] = useState<'valid' | 'warning' | 'error'>('valid');
const [isSubmitting, setIsSubmitting] = useState(false);
```

**Validation Logic:**
```typescript
const validateValue = useCallback((val: number) => {
  const { usl, lsl } = characteristic.specLimits;

  if (val > usl || val < lsl) {
    return 'error';  // Out of spec
  }

  // Warning if within 10% of limits
  const range = usl - lsl;
  const warningThreshold = range * 0.1;
  if (val > usl - warningThreshold || val < lsl + warningThreshold) {
    return 'warning';
  }

  return 'valid';
}, [characteristic]);
```

**Structure:**
```tsx
<Dialog open={isOpen} onOpenChange={onClose}>
  <DialogContent className="sm:max-w-[500px]">
    <DialogHeader>
      <DialogTitle>Enter Measurement</DialogTitle>
      <DialogDescription>
        {characteristic.name} - {characteristic.machineName}
      </DialogDescription>
    </DialogHeader>

    {/* Spec info */}
    <div className="text-sm text-gray-600">
      Specification: {formatSpec(characteristic.target, characteristic.tolerance)}
    </div>

    {/* Large numeric input */}
    <MeasurementInput
      value={value}
      onChange={setValue}
      validationState={validationState}
      usl={characteristic.usl}
      lsl={characteristic.lsl}
    />

    {/* Visual position indicator */}
    <SpecPositionIndicator
      value={parseFloat(value) || 0}
      lsl={characteristic.lsl}
      target={characteristic.target}
      usl={characteristic.usl}
    />

    {/* Comment field */}
    <div className="space-y-2">
      <Label>Add Comment (optional)</Label>
      <Textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Enter any notes about this measurement..."
        rows={2}
      />
    </div>

    {/* Batch/Operator info (read-only) */}
    <div className="flex gap-4 text-sm text-gray-500">
      <span>Batch: {currentBatch}</span>
      <span>Operator: {currentUser.name}</span>
    </div>

    <DialogFooter>
      <Button variant="outline" onClick={onClose}>Cancel</Button>
      <Button
        onClick={handleSubmit}
        disabled={!value || validationState === 'error' || isSubmitting}
      >
        {isSubmitting ? 'Submitting...' : 'Submit'}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

---

### 3.2 MeasurementInput

**Purpose:** Large, accessible numeric input for measurement entry.

**File:** `src/components/operator/MeasurementInput.tsx`

**Props:**
```typescript
interface MeasurementInputProps {
  value: string;
  onChange: (value: string) => void;
  validationState: 'valid' | 'warning' | 'error';
  usl: number;
  lsl: number;
  decimalPlaces?: number;
  autoFocus?: boolean;
}
```

**Structure:**
```tsx
<div className="relative">
  <Input
    type="text"
    inputMode="decimal"
    value={value}
    onChange={(e) => handleChange(e.target.value)}
    className={cn(
      'text-5xl font-mono font-medium h-20 text-center',
      validationState === 'valid' && 'border-green-500 focus:ring-green-500',
      validationState === 'warning' && 'border-amber-500 focus:ring-amber-500',
      validationState === 'error' && 'border-red-500 focus:ring-red-500 animate-shake'
    )}
    autoFocus={autoFocus}
  />

  {/* Validation message */}
  <div className={cn(
    'absolute -bottom-6 left-0 right-0 text-center text-sm',
    validationState === 'valid' && 'text-green-600',
    validationState === 'warning' && 'text-amber-600',
    validationState === 'error' && 'text-red-600'
  )}>
    {validationState === 'valid' && <span><CheckCircle className="inline h-4 w-4" /> Within specification</span>}
    {validationState === 'warning' && <span><AlertTriangle className="inline h-4 w-4" /> Approaching limit</span>}
    {validationState === 'error' && <span><AlertCircle className="inline h-4 w-4" /> {getErrorMessage()}</span>}
  </div>
</div>
```

---

### 3.3 AckDialog

**Purpose:** Acknowledgment dialog for violations with reason code selection.

**File:** `src/components/alerts/AckDialog.tsx`

**Props:**
```typescript
interface AckDialogProps {
  violation: Violation;
  isOpen: boolean;
  onClose: () => void;
  onAcknowledge: (data: AcknowledgmentData) => Promise<void>;
}

interface AcknowledgmentData {
  reasonCode: string;
  correctiveAction: string;
  excludeFromCalc: boolean;
}
```

**Reason Code Options:**
```typescript
const REASON_CODES = [
  { value: 'tool_wear', label: 'Tool wear' },
  { value: 'material_variation', label: 'Material variation' },
  { value: 'operator_adjustment', label: 'Operator adjustment' },
  { value: 'machine_calibration', label: 'Machine calibration' },
  { value: 'environmental', label: 'Environmental factors' },
  { value: 'measurement_error', label: 'Measurement error' },
  { value: 'process_change', label: 'Process change (expected)' },
  { value: 'investigation', label: 'Unknown / Under investigation' },
];
```

**Structure:**
```tsx
<Dialog open={isOpen} onOpenChange={onClose}>
  <DialogContent className="sm:max-w-[500px]">
    <DialogHeader>
      <DialogTitle>Acknowledge Violation</DialogTitle>
    </DialogHeader>

    {/* Violation details */}
    <Card className="bg-red-50 border-red-200">
      <CardContent className="p-4">
        <h4 className="font-semibold">Rule {violation.ruleId}: {violation.ruleName}</h4>
        <p className="text-sm text-gray-600 mt-1">
          Value: {violation.value} | Limit: {violation.limit}
        </p>
        <p className="text-xs text-gray-500 mt-1">
          {formatDateTime(violation.timestamp)}
        </p>
      </CardContent>
    </Card>

    {/* Reason code selector */}
    <div className="space-y-2">
      <Label>Reason Code *</Label>
      <Select value={reasonCode} onValueChange={setReasonCode}>
        <SelectTrigger>
          <SelectValue placeholder="Select a reason..." />
        </SelectTrigger>
        <SelectContent>
          {REASON_CODES.map(code => (
            <SelectItem key={code.value} value={code.value}>
              {code.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>

    {/* Corrective action */}
    <div className="space-y-2">
      <Label>Corrective Action</Label>
      <Textarea
        value={correctiveAction}
        onChange={(e) => setCorrectiveAction(e.target.value)}
        placeholder="Describe any corrective actions taken..."
        rows={3}
      />
    </div>

    {/* Exclude checkbox */}
    <div className="flex items-center space-x-2">
      <Checkbox
        id="exclude"
        checked={excludeFromCalc}
        onCheckedChange={setExcludeFromCalc}
      />
      <Label htmlFor="exclude" className="text-sm">
        Exclude this sample from control limit calculations
      </Label>
    </div>

    <DialogFooter>
      <Button variant="outline" onClick={onClose}>Cancel</Button>
      <Button
        onClick={handleAcknowledge}
        disabled={!reasonCode || isSubmitting}
      >
        Acknowledge
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

---

## 4. Chart Components

### 4.1 ControlChart

**Purpose:** X-Bar or I-MR control chart with zone bands and interactive points.

**File:** `src/components/charts/ControlChart.tsx`

**Props:**
```typescript
interface ControlChartProps {
  samples: Sample[];
  controlLimits: ControlLimits;
  specLimits: SpecLimits;
  violations: Violation[];
  chartType: 'xbar' | 'imr';
  onPointClick: (sample: Sample) => void;
  selectedSampleId?: number;
}

interface ControlLimits {
  ucl: number;
  cl: number;
  lcl: number;
}

interface SpecLimits {
  usl: number;
  target: number;
  lsl: number;
}
```

**Recharts Composition:**
```tsx
<ResponsiveContainer width="100%" height={400}>
  <ComposedChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
    {/* Zone bands (background) */}
    <ChartZones
      ucl={controlLimits.ucl}
      cl={controlLimits.cl}
      lcl={controlLimits.lcl}
    />

    {/* Spec limit bands (if outside control limits) */}
    {specLimits.usl > controlLimits.ucl && (
      <ReferenceArea
        y1={controlLimits.ucl}
        y2={specLimits.usl}
        fill="#FEE2E2"
        fillOpacity={0.2}
      />
    )}

    {/* Grid */}
    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />

    {/* Axes */}
    <XAxis
      dataKey="sampleNumber"
      tick={{ fontSize: 12 }}
      label={{ value: 'Sample Number', position: 'bottom', offset: 0 }}
    />
    <YAxis
      domain={[yMin, yMax]}
      tick={{ fontSize: 12 }}
      tickFormatter={(v) => v.toFixed(2)}
    />

    {/* Control limit lines */}
    <ReferenceLine y={controlLimits.ucl} stroke="#EF4444" strokeWidth={2} label="UCL" />
    <ReferenceLine y={controlLimits.cl} stroke="#2563EB" strokeWidth={2} label="CL" />
    <ReferenceLine y={controlLimits.lcl} stroke="#EF4444" strokeWidth={2} label="LCL" />

    {/* Spec limit lines (dashed) */}
    <ReferenceLine y={specLimits.usl} stroke="#DC2626" strokeDasharray="5 5" label="USL" />
    <ReferenceLine y={specLimits.lsl} stroke="#DC2626" strokeDasharray="5 5" label="LSL" />

    {/* Data line */}
    <Line
      type="monotone"
      dataKey="value"
      stroke="#2563EB"
      strokeWidth={2}
      dot={<CustomDot violations={violations} onPointClick={onPointClick} />}
      activeDot={<ActiveDot />}
    />

    {/* Tooltip */}
    <Tooltip content={<ChartTooltip />} />
  </ComposedChart>
</ResponsiveContainer>
```

---

### 4.2 ChartZones

**Purpose:** Render background zone bands for control chart.

**File:** `src/components/charts/ChartZones.tsx`

**Props:**
```typescript
interface ChartZonesProps {
  ucl: number;
  cl: number;
  lcl: number;
}
```

**Implementation:**
```tsx
export const ChartZones: React.FC<ChartZonesProps> = ({ ucl, cl, lcl }) => {
  const sigma = (ucl - cl) / 3;

  return (
    <>
      {/* +3 to +2 sigma (Red zone) */}
      <ReferenceArea
        y1={cl + 2 * sigma}
        y2={ucl}
        fill="#FEE2E2"
        fillOpacity={0.4}
      />

      {/* +2 to +1 sigma (Yellow zone) */}
      <ReferenceArea
        y1={cl + sigma}
        y2={cl + 2 * sigma}
        fill="#FEF3C7"
        fillOpacity={0.4}
      />

      {/* +1 to -1 sigma (Green zone) */}
      <ReferenceArea
        y1={cl - sigma}
        y2={cl + sigma}
        fill="#DCFCE7"
        fillOpacity={0.3}
      />

      {/* -1 to -2 sigma (Yellow zone) */}
      <ReferenceArea
        y1={cl - 2 * sigma}
        y2={cl - sigma}
        fill="#FEF3C7"
        fillOpacity={0.4}
      />

      {/* -2 to -3 sigma (Red zone) */}
      <ReferenceArea
        y1={lcl}
        y2={cl - 2 * sigma}
        fill="#FEE2E2"
        fillOpacity={0.4}
      />
    </>
  );
};
```

---

### 4.3 CustomDot (Chart Point)

**Purpose:** Custom dot component for chart points with violation styling.

**File:** `src/components/charts/CustomDot.tsx`

**Props:**
```typescript
interface CustomDotProps {
  cx: number;
  cy: number;
  payload: ChartDataPoint;
  violations: Violation[];
  onPointClick: (sample: Sample) => void;
}
```

**Implementation:**
```tsx
export const CustomDot: React.FC<CustomDotProps> = ({
  cx, cy, payload, violations, onPointClick
}) => {
  const isViolation = violations.some(v => v.sampleId === payload.sampleId);
  const isAcknowledged = violations.find(v => v.sampleId === payload.sampleId)?.acknowledged;

  return (
    <g onClick={() => onPointClick(payload.sample)} style={{ cursor: 'pointer' }}>
      {isViolation && !isAcknowledged && (
        // Pulsing outer ring for unacknowledged violations
        <circle
          cx={cx}
          cy={cy}
          r={12}
          fill="none"
          stroke="#EF4444"
          strokeWidth={2}
          className="animate-violation-pulse"
        />
      )}
      <circle
        cx={cx}
        cy={cy}
        r={6}
        fill={isViolation ? '#EF4444' : '#2563EB'}
        stroke={isViolation ? '#DC2626' : '#1D4ED8'}
        strokeWidth={2}
      />
      {isAcknowledged && (
        // Checkmark for acknowledged
        <circle cx={cx} cy={cy} r={4} fill="#22C55E" />
      )}
    </g>
  );
};
```

---

### 4.4 DistributionHistogram

**Purpose:** Bell curve histogram showing distribution vs specification limits.

**File:** `src/components/charts/DistributionHistogram.tsx`

**Props:**
```typescript
interface DistributionHistogramProps {
  samples: Sample[];
  specLimits: SpecLimits;
  bins?: number;
}
```

**Implementation:**
```tsx
export const DistributionHistogram: React.FC<DistributionHistogramProps> = ({
  samples,
  specLimits,
  bins = 20
}) => {
  const histogramData = useMemo(() => computeHistogram(samples, bins), [samples, bins]);
  const stats = useMemo(() => computeStats(samples, specLimits), [samples, specLimits]);

  return (
    <div className="space-y-2">
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={histogramData}>
          {/* LSL reference */}
          <ReferenceLine x={specLimits.lsl} stroke="#DC2626" strokeWidth={2} label="LSL" />

          {/* Target reference */}
          <ReferenceLine x={specLimits.target} stroke="#2563EB" strokeDasharray="5 5" />

          {/* USL reference */}
          <ReferenceLine x={specLimits.usl} stroke="#DC2626" strokeWidth={2} label="USL" />

          <XAxis dataKey="bin" tick={{ fontSize: 10 }} />
          <YAxis hide />

          <Bar
            dataKey="count"
            fill="#2563EB"
            radius={[2, 2, 0, 0]}
          />

          {/* Normal curve overlay */}
          <Line
            type="monotone"
            dataKey="normalCurve"
            stroke="#1D4ED8"
            strokeWidth={2}
            dot={false}
          />
        </BarChart>
      </ResponsiveContainer>

      {/* Statistics row */}
      <div className="flex justify-between text-sm text-gray-600 px-4">
        <span>Cp: {stats.cp.toFixed(2)}</span>
        <span>Cpk: {stats.cpk.toFixed(2)}</span>
        <span>n: {samples.length}</span>
      </div>
    </div>
  );
};
```

---

## 5. Tree Components

### 5.1 HierarchyTree

**Purpose:** ISA-95 hierarchy navigation tree.

**File:** `src/components/config/HierarchyTree.tsx`

**Props:**
```typescript
interface HierarchyTreeProps {
  nodes: HierarchyNode[];
  selectedId: number | null;
  expandedIds: Set<number>;
  onSelect: (node: HierarchyNode) => void;
  onToggle: (nodeId: number) => void;
  onAddChild: (parentId: number) => void;
}
```

**Implementation:**
```tsx
export const HierarchyTree: React.FC<HierarchyTreeProps> = ({
  nodes,
  selectedId,
  expandedIds,
  onSelect,
  onToggle,
  onAddChild
}) => {
  const renderNode = (node: HierarchyNode, depth: number = 0) => (
    <div key={node.id}>
      <div
        className={cn(
          'flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-gray-100',
          selectedId === node.id && 'bg-blue-100 hover:bg-blue-100'
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => onSelect(node)}
      >
        {/* Expand/collapse toggle */}
        {node.children?.length > 0 ? (
          <button
            onClick={(e) => { e.stopPropagation(); onToggle(node.id); }}
            className="p-0.5 hover:bg-gray-200 rounded"
          >
            {expandedIds.has(node.id) ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        ) : (
          <span className="w-5" />
        )}

        {/* Icon based on type */}
        <NodeIcon type={node.type} />

        {/* Name */}
        <span className="text-sm flex-1 truncate">{node.name}</span>

        {/* Characteristic count badge */}
        {node.characteristicCount > 0 && (
          <Badge variant="secondary" className="text-xs">
            {node.characteristicCount}
          </Badge>
        )}
      </div>

      {/* Children */}
      {expandedIds.has(node.id) && node.children?.map(child =>
        renderNode(child, depth + 1)
      )}
    </div>
  );

  return (
    <ScrollArea className="h-full">
      <div className="p-2">
        {nodes.map(node => renderNode(node))}
      </div>
    </ScrollArea>
  );
};
```

---

### 5.2 NodeIcon

**Purpose:** Icon component for hierarchy node types.

**File:** `src/components/config/NodeIcon.tsx`

```tsx
const iconMap = {
  Site: Building2,
  Area: LayoutGrid,
  Line: GitBranch,
  Cell: Server,
  Unit: Cpu,
  Characteristic: CircleDot,
};

export const NodeIcon: React.FC<{ type: string }> = ({ type }) => {
  const Icon = iconMap[type] || Folder;
  return <Icon className="h-4 w-4 text-gray-500" />;
};
```

---

## 6. Form Components

### 6.1 CharacteristicForm

**Purpose:** Configuration form for characteristic settings.

**File:** `src/components/config/CharacteristicForm.tsx`

**Props:**
```typescript
interface CharacteristicFormProps {
  characteristic: Characteristic;
  onSave: (data: CharacteristicUpdate) => Promise<void>;
  onDelete: () => void;
  onRecalculateLimits: () => void;
}
```

**Sections:**
1. **Data Provider** - Radio group (Manual/Tag) + Tag browser button
2. **Specification Limits** - Target, USL, LSL inputs
3. **Control Limits** - UCL, CL, LCL (calculated, with recalculate button)
4. **Nelson Rules** - Grid of checkboxes (Rules 1-8)
5. **Sampling Configuration** - Subgroup size, interval, window size

**Structure:**
```tsx
<form onSubmit={handleSubmit} className="space-y-6">
  {/* Provider Section */}
  <Card>
    <CardHeader>
      <CardTitle className="text-base">Data Provider</CardTitle>
    </CardHeader>
    <CardContent className="space-y-4">
      <RadioGroup value={provider} onValueChange={setProvider}>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="manual" id="manual" />
          <Label htmlFor="manual">Manual Entry</Label>
        </div>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="tag" id="tag" />
          <Label htmlFor="tag">Tag (Automated)</Label>
        </div>
      </RadioGroup>

      {provider === 'tag' && (
        <div className="space-y-2">
          <Label>MQTT Topic</Label>
          <div className="flex gap-2">
            <Input value={mqttTopic} readOnly className="flex-1 font-mono text-sm" />
            <Button variant="outline" onClick={openTagBrowser}>Browse...</Button>
          </div>
        </div>
      )}
    </CardContent>
  </Card>

  {/* Spec Limits Section */}
  <Card>
    <CardHeader>
      <CardTitle className="text-base">Specification Limits</CardTitle>
    </CardHeader>
    <CardContent className="grid grid-cols-3 gap-4">
      <div>
        <Label>Target</Label>
        <Input type="number" step="any" value={target} onChange={...} />
      </div>
      <div>
        <Label>USL</Label>
        <Input type="number" step="any" value={usl} onChange={...} />
      </div>
      <div>
        <Label>LSL</Label>
        <Input type="number" step="any" value={lsl} onChange={...} />
      </div>
    </CardContent>
  </Card>

  {/* Control Limits Section */}
  <Card>
    <CardHeader className="flex flex-row items-center justify-between">
      <CardTitle className="text-base">Control Limits</CardTitle>
      <Button variant="outline" size="sm" onClick={onRecalculateLimits}>
        <RefreshCw className="h-4 w-4 mr-2" />
        Recalculate
      </Button>
    </CardHeader>
    <CardContent className="grid grid-cols-3 gap-4">
      <div>
        <Label>UCL (calculated)</Label>
        <Input value={ucl.toFixed(4)} readOnly className="bg-gray-50" />
      </div>
      <div>
        <Label>CL (calculated)</Label>
        <Input value={cl.toFixed(4)} readOnly className="bg-gray-50" />
      </div>
      <div>
        <Label>LCL (calculated)</Label>
        <Input value={lcl.toFixed(4)} readOnly className="bg-gray-50" />
      </div>
    </CardContent>
  </Card>

  {/* Nelson Rules Section */}
  <Card>
    <CardHeader className="flex flex-row items-center justify-between">
      <CardTitle className="text-base">Nelson Rules</CardTitle>
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" onClick={enableAllRules}>Enable All</Button>
        <Button variant="ghost" size="sm" onClick={disableAllRules}>Disable All</Button>
      </div>
    </CardHeader>
    <CardContent>
      <NelsonRulesGrid rules={rules} onToggle={toggleRule} />
    </CardContent>
  </Card>

  {/* Footer */}
  <div className="flex justify-between">
    <Button variant="destructive" onClick={onDelete}>Delete</Button>
    <Button type="submit" disabled={!isDirty}>Save Changes</Button>
  </div>
</form>
```

---

### 6.2 NelsonRulesGrid

**Purpose:** Grid of checkbox toggles for Nelson Rules 1-8.

**File:** `src/components/config/NelsonRulesGrid.tsx`

**Implementation:**
```tsx
const NELSON_RULES = [
  { id: 1, name: 'Point beyond 3-sigma', description: 'Single point outside control limits' },
  { id: 2, name: '9 points same side', description: '9 consecutive points on same side of center' },
  { id: 3, name: '6 points trending', description: '6 consecutive points steadily increasing/decreasing' },
  { id: 4, name: '14 points alternating', description: '14 consecutive points alternating up and down' },
  { id: 5, name: '2 of 3 beyond 2-sigma', description: '2 out of 3 points beyond 2-sigma on same side' },
  { id: 6, name: '4 of 5 beyond 1-sigma', description: '4 out of 5 points beyond 1-sigma on same side' },
  { id: 7, name: '15 points within 1-sigma', description: '15 consecutive points within 1-sigma (stratification)' },
  { id: 8, name: '8 points beyond 1-sigma', description: '8 consecutive points beyond 1-sigma on both sides' },
];

export const NelsonRulesGrid: React.FC<{
  rules: Record<number, boolean>;
  onToggle: (ruleId: number) => void;
}> = ({ rules, onToggle }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
    {NELSON_RULES.map(rule => (
      <div key={rule.id} className="flex items-start space-x-3 p-2 rounded hover:bg-gray-50">
        <Checkbox
          id={`rule-${rule.id}`}
          checked={rules[rule.id] ?? false}
          onCheckedChange={() => onToggle(rule.id)}
        />
        <div className="flex-1">
          <Label htmlFor={`rule-${rule.id}`} className="text-sm font-medium cursor-pointer">
            Rule {rule.id}: {rule.name}
          </Label>
          <p className="text-xs text-gray-500">{rule.description}</p>
        </div>
      </div>
    ))}
  </div>
);
```

---

## 7. Alert Components

### 7.1 ViolationToast

**Purpose:** Toast notification for new violations.

**File:** `src/components/alerts/ViolationToast.tsx`

**Usage with Sonner:**
```typescript
import { toast } from 'sonner';

export const showViolationToast = (violation: Violation) => {
  toast.custom(
    (t) => (
      <ViolationToastContent
        violation={violation}
        onView={() => { navigateToChart(violation.characteristicId); toast.dismiss(t); }}
        onAcknowledge={() => { openAckDialog(violation); toast.dismiss(t); }}
        onDismiss={() => toast.dismiss(t)}
      />
    ),
    {
      duration: 10000,
      position: 'top-right',
    }
  );
};
```

**Toast Content:**
```tsx
const ViolationToastContent: React.FC<{
  violation: Violation;
  onView: () => void;
  onAcknowledge: () => void;
  onDismiss: () => void;
}> = ({ violation, onView, onAcknowledge, onDismiss }) => (
  <div className="bg-white border border-red-200 rounded-lg shadow-lg p-4 w-96">
    <div className="flex items-start gap-3">
      <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
      <div className="flex-1">
        <h4 className="font-semibold text-red-700">Nelson Rule Violation</h4>
        <p className="text-sm text-gray-600 mt-1">
          {violation.characteristicName}
        </p>
        <p className="text-sm text-gray-500">
          Rule {violation.ruleId}: {violation.ruleName}
        </p>
        <p className="text-xs text-gray-400 mt-1">
          Value: {violation.value}
        </p>
      </div>
      <button onClick={onDismiss} className="text-gray-400 hover:text-gray-600">
        <X className="h-4 w-4" />
      </button>
    </div>
    <div className="flex gap-2 mt-3">
      <Button size="sm" variant="outline" onClick={onView}>View Chart</Button>
      <Button size="sm" onClick={onAcknowledge}>Acknowledge</Button>
    </div>
  </div>
);
```

---

## 8. Layout Components

### 8.1 AppHeader

**Purpose:** Top navigation bar with plant selector and user menu.

**File:** `src/components/layout/AppHeader.tsx`

```tsx
export const AppHeader: React.FC = () => {
  const { user } = useAuth();
  const { currentPlant, plants, setPlant } = usePlant();

  return (
    <header className="h-14 border-b bg-white px-4 flex items-center justify-between">
      {/* Left: Logo + Nav */}
      <div className="flex items-center gap-6">
        <Logo />
        <nav className="flex items-center gap-1">
          <NavLink to="/dashboard">Dashboard</NavLink>
          <NavLink to="/configuration">Configuration</NavLink>
          <NavLink to="/alerts" badge={unackCount}>Alerts</NavLink>
        </nav>
      </div>

      {/* Right: Plant + User */}
      <div className="flex items-center gap-4">
        <Select value={currentPlant?.id} onValueChange={setPlant}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Select plant..." />
          </SelectTrigger>
          <SelectContent>
            {plants.map(p => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <UserMenu user={user} />
      </div>
    </header>
  );
};
```

---

### 8.2 ConnectionStatus

**Purpose:** Footer showing WebSocket connection state.

**File:** `src/components/layout/ConnectionStatus.tsx`

```tsx
export const ConnectionStatus: React.FC = () => {
  const { isConnected, reconnectAttempts } = useWebSocket();

  return (
    <footer className="h-8 border-t bg-gray-50 px-4 flex items-center justify-between text-xs text-gray-500">
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1.5">
          <span className={cn(
            'w-2 h-2 rounded-full',
            isConnected ? 'bg-green-500' : 'bg-red-500 animate-pulse'
          )} />
          {isConnected ? 'Connected' : `Reconnecting... (${reconnectAttempts})`}
        </span>
      </div>
      <div className="flex items-center gap-4">
        <span>Active Characteristics: {activeCount}</span>
        <span>Pending Alerts: {pendingAlerts}</span>
      </div>
    </footer>
  );
};
```

---

## 9. Component File Structure

```
src/
  components/
    layout/
      AppHeader.tsx
      ConnectionStatus.tsx
      NavLink.tsx
      UserMenu.tsx
    operator/
      TodoList.tsx
      TodoCard.tsx
      InputModal.tsx
      MeasurementInput.tsx
      SpecPositionIndicator.tsx
    charts/
      ControlChart.tsx
      ChartZones.tsx
      CustomDot.tsx
      ChartTooltip.tsx
      DistributionHistogram.tsx
      ChartTypeSelector.tsx
    config/
      HierarchyTree.tsx
      NodeIcon.tsx
      CharacteristicForm.tsx
      NelsonRulesGrid.tsx
      TagBrowserModal.tsx
    alerts/
      ViolationToast.tsx
      AckDialog.tsx
      AlertHistory.tsx
    common/
      EmptyState.tsx
      LoadingSkeleton.tsx
      ErrorBoundary.tsx
  pages/
    OperatorDashboard.tsx
    ConfigurationView.tsx
    AlertsPage.tsx
```

---

*End of Component Specifications Document*
