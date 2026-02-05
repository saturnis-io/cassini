# Cross-Chart Highlighting Implementation Plan

## Status: IMPLEMENTED

## Problem (Solved)
Current implementation uses array indices for hover synchronization, which fails because:
1. MR chart has N-1 data points (different array length than primary chart)
2. Histogram bins contain multiple samples
3. Array indices don't provide a stable identifier across chart types

## Solution: Use Sample IDs

Each `ChartDataPoint` already has a `sample_id: number` field from the backend. This is a stable, unique identifier that exists across all data representations.

## Architecture

### Broadcast Message Format
```typescript
interface HoveredSamples {
  characteristicId: number
  sampleIds: Set<number>  // Set of sample_id values being hovered
}
```

### Pub/Sub Flow
1. **Publisher** (chart being hovered):
   - Collects sample_id(s) for hovered element
   - Calls `broadcastHover(characteristicId, sampleIds)`

2. **Subscriber** (all charts for same characteristic):
   - Receives hovered sample IDs via context
   - Each data point checks: `hoveredSampleIds.has(myDataPoint.sample_id)`
   - Highlights if match found

## Implementation Steps

### 1. Update ChartHoverContext.tsx ✅
- Change state from `sampleIndex: number` to `sampleIds: Set<number>`
- Update `broadcastHover(characteristicId, sampleIds: number[])`
- Update `getHoveredSampleIds(characteristicId): Set<number> | null`
- Memoize Set for stable reference

### 2. Update ControlChart.tsx (X-bar / Individuals chart) ✅
- **On hover**: `onHoverSample(point.sample_id)`
- **On render dot**: `hoveredSampleIds?.has(payload.sample_id)`
- Data source: `chartData.data_points[i].sample_id`

### 3. Update RangeChart.tsx (R / S / MR chart) ✅
- **R/S charts**: Same sample_id as corresponding X-bar point
  - Data source: Same `data_points` array, use `sample_id` directly
- **MR chart**: Each MR value is computed from two consecutive samples
  - Store both sample IDs: `{ sample_id, sample_id_from }`
  - Highlight if either sample is in hoveredSampleIds
  - On hover: broadcast both sample IDs

### 4. Update DistributionHistogram.tsx ✅
- **On bar hover**: Collect all sample_ids in that bin, broadcast all
- **On render bar**: Check if ANY sample in bin is in hoveredSampleIds
- Track which samples fall into each bin via `sampleIds: number[]` in HistogramBin

### 5. Update BoxWhiskerChart.tsx ✅
- Each box represents one sample group
- **On hover**: broadcast the sample_id for that box
- **On render**: check if sample_id is in hoveredSampleIds

## Data Flow Example

### Scenario: User hovers Sample #5 on X-bar chart
1. X-bar chart broadcasts: `{ characteristicId: 42, sampleIds: Set([105]) }` (105 is the actual sample_id)
2. All charts receive update via context:
   - **Range chart**: Point with `sample_id: 105` highlights
   - **Histogram**: Bar containing sample 105's value highlights
   - **Box-whisker**: Box for sample 105 highlights

### Scenario: User hovers histogram bar (value range 10.2-10.4)
1. Histogram broadcasts: `{ characteristicId: 42, sampleIds: Set([102, 105, 108]) }` (all samples in that bin)
2. All charts receive update:
   - **X-bar chart**: Points with sample_ids 102, 105, 108 highlight
   - **Range chart**: Points with sample_ids 102, 105, 108 highlight
   - **Box-whisker**: Boxes for those samples highlight

## Key Benefits
- **Stable identifiers**: sample_id doesn't change regardless of chart type or array position
- **Multi-sample support**: Histogram can broadcast multiple samples per bin
- **MR chart alignment**: Uses actual sample_ids, not array indices
- **No forced re-renders**: Just check membership in Set

## Files to Modify
1. `frontend/src/contexts/ChartHoverContext.tsx` - Core context
2. `frontend/src/components/ControlChart.tsx` - Primary chart
3. `frontend/src/components/charts/RangeChart.tsx` - Secondary chart
4. `frontend/src/components/DistributionHistogram.tsx` - Histogram
5. `frontend/src/components/charts/BoxWhiskerChart.tsx` - Box plots
