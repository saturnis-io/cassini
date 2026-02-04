# Variable Subgroup Size Handling Design Document

## Executive Summary

This document details the design for implementing flexible subgroup size handling in OpenSPC. The feature allows each characteristic to be configured with one of three modes for handling variable subgroup sizes:

- **Mode A: Standardized (Z-Score) Charts** - Plot normalized Z-scores with fixed ±3 control limits
- **Mode B: Variable Control Limits** - Recalculate UCL/LCL per point based on actual sample size
- **Mode C: Nominal with Tolerance (Default)** - Use nominal subgroup size with minimum threshold enforcement

---

## 1. Database Schema Changes

### 1.1 New Enum: SubgroupMode

Create a new enum to represent the three subgroup handling modes.

**File:** `backend/src/openspc/db/models/characteristic.py`

```python
class SubgroupMode(str, Enum):
    """Subgroup size handling modes for characteristics."""

    STANDARDIZED = "STANDARDIZED"    # Mode A: Z-score normalized charts
    VARIABLE_LIMITS = "VARIABLE_LIMITS"  # Mode B: Recalculate limits per point
    NOMINAL_TOLERANCE = "NOMINAL_TOLERANCE"  # Mode C: Nominal n with min threshold
```

### 1.2 New Fields on Characteristic Model

Add the following fields to the `Characteristic` model:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `subgroup_mode` | String (Enum) | `NOMINAL_TOLERANCE` | Selected handling mode |
| `min_measurements` | Integer | 1 | Minimum measurements required per sample |
| `warn_below_count` | Integer | `subgroup_size` | Threshold to flag as undersized |
| `stored_sigma` | Float | NULL | Stored process sigma (required for Mode A & B) |
| `stored_center_line` | Float | NULL | Stored center line (required for all modes) |

**Model Changes:**
```python
class Characteristic(Base):
    # ... existing fields ...

    # Subgroup handling configuration
    subgroup_mode: Mapped[str] = mapped_column(
        String, default="NOMINAL_TOLERANCE", nullable=False
    )
    min_measurements: Mapped[int] = mapped_column(
        Integer, default=1, nullable=False
    )
    warn_below_count: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True
    )  # Defaults to subgroup_size if not set

    # Stored statistical parameters for Mode A & B
    stored_sigma: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    stored_center_line: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
```

### 1.3 New Fields on Sample Model

Add fields to track actual measurement count and undersized status.

**File:** `backend/src/openspc/db/models/sample.py`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `actual_n` | Integer | Computed | Actual number of measurements in sample |
| `is_undersized` | Boolean | False | Flag if sample is below warn_below_count |
| `effective_ucl` | Float | NULL | Point-specific UCL (Mode B only) |
| `effective_lcl` | Float | NULL | Point-specific LCL (Mode B only) |
| `z_score` | Float | NULL | Standardized value (Mode A only) |

**Model Changes:**
```python
class Sample(Base):
    # ... existing fields ...

    # Variable subgroup tracking
    actual_n: Mapped[int] = mapped_column(Integer, nullable=False)
    is_undersized: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Mode-specific computed values
    effective_ucl: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    effective_lcl: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    z_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
```

### 1.4 Database Migration

**File:** `backend/alembic/versions/YYYYMMDD_add_subgroup_modes.py`

```python
def upgrade() -> None:
    # Add columns to characteristic table
    op.add_column("characteristic",
        sa.Column("subgroup_mode", sa.String(), nullable=False,
                  server_default="NOMINAL_TOLERANCE"))
    op.add_column("characteristic",
        sa.Column("min_measurements", sa.Integer(), nullable=False, server_default="1"))
    op.add_column("characteristic",
        sa.Column("warn_below_count", sa.Integer(), nullable=True))
    op.add_column("characteristic",
        sa.Column("stored_sigma", sa.Float(), nullable=True))
    op.add_column("characteristic",
        sa.Column("stored_center_line", sa.Float(), nullable=True))

    # Add columns to sample table
    op.add_column("sample",
        sa.Column("actual_n", sa.Integer(), nullable=False, server_default="1"))
    op.add_column("sample",
        sa.Column("is_undersized", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("sample",
        sa.Column("effective_ucl", sa.Float(), nullable=True))
    op.add_column("sample",
        sa.Column("effective_lcl", sa.Float(), nullable=True))
    op.add_column("sample",
        sa.Column("z_score", sa.Float(), nullable=True))

    # Backfill actual_n from measurement count
    op.execute("""
        UPDATE sample
        SET actual_n = (SELECT COUNT(*) FROM measurement WHERE measurement.sample_id = sample.id)
    """)

def downgrade() -> None:
    # Remove columns in reverse order
    op.drop_column("sample", "z_score")
    op.drop_column("sample", "effective_lcl")
    op.drop_column("sample", "effective_ucl")
    op.drop_column("sample", "is_undersized")
    op.drop_column("sample", "actual_n")
    op.drop_column("characteristic", "stored_center_line")
    op.drop_column("characteristic", "stored_sigma")
    op.drop_column("characteristic", "warn_below_count")
    op.drop_column("characteristic", "min_measurements")
    op.drop_column("characteristic", "subgroup_mode")
```

---

## 2. API Contract Changes

### 2.1 Characteristic Schemas

**File:** `backend/src/openspc/api/schemas/characteristic.py`

#### SubgroupModeEnum:
```python
class SubgroupModeEnum(str, Enum):
    STANDARDIZED = "STANDARDIZED"
    VARIABLE_LIMITS = "VARIABLE_LIMITS"
    NOMINAL_TOLERANCE = "NOMINAL_TOLERANCE"
```

#### CharacteristicCreate Schema Updates:
```python
class CharacteristicCreate(BaseModel):
    # ... existing fields ...

    # New subgroup handling fields
    subgroup_mode: SubgroupModeEnum = Field(
        default=SubgroupModeEnum.NOMINAL_TOLERANCE,
        description="Mode for handling variable subgroup sizes"
    )
    min_measurements: int = Field(
        default=1, ge=1, le=25,
        description="Minimum measurements required per sample"
    )
    warn_below_count: int | None = Field(
        default=None,
        description="Threshold to flag samples as undersized (defaults to subgroup_size)"
    )

    @model_validator(mode="after")
    def validate_subgroup_config(self) -> Self:
        """Validate subgroup configuration is consistent."""
        if self.min_measurements > self.subgroup_size:
            raise ValueError("min_measurements cannot exceed subgroup_size")
        if self.warn_below_count is not None:
            if self.warn_below_count > self.subgroup_size:
                raise ValueError("warn_below_count cannot exceed subgroup_size")
            if self.warn_below_count < self.min_measurements:
                raise ValueError("warn_below_count must be >= min_measurements")
        return self
```

#### CharacteristicResponse Schema Updates:
```python
class CharacteristicResponse(BaseModel):
    # ... existing fields ...

    subgroup_mode: str
    min_measurements: int
    warn_below_count: int | None
    stored_sigma: float | None
    stored_center_line: float | None
```

### 2.2 Sample Schemas

**File:** `backend/src/openspc/api/schemas/sample.py`

#### SampleResponse Updates:
```python
class SampleResponse(BaseModel):
    # ... existing fields ...

    actual_n: int
    is_undersized: bool
    effective_ucl: float | None  # For Mode B
    effective_lcl: float | None  # For Mode B
    z_score: float | None  # For Mode A
```

### 2.3 ChartDataResponse Updates

**File:** `backend/src/openspc/api/schemas/characteristic.py`

```python
class ChartSample(BaseModel):
    sample_id: int
    timestamp: str
    mean: float  # Actual mean for Mode B/C, or z_score for Mode A
    range: float | None
    excluded: bool
    violation_ids: list[int]
    zone: str

    # New fields for variable subgroup handling
    actual_n: int
    is_undersized: bool
    effective_ucl: float | None  # Per-point UCL for Mode B
    effective_lcl: float | None  # Per-point LCL for Mode B
    z_score: float | None  # Standardized value for Mode A
    display_value: float  # The value to plot (z_score for Mode A, mean for B/C)

class ChartDataResponse(BaseModel):
    characteristic_id: int
    characteristic_name: str
    subgroup_mode: str  # NEW: Mode indicator for frontend rendering
    nominal_subgroup_size: int  # NEW: The configured subgroup_size
    data_points: list[ChartSample]
    control_limits: ControlLimits
    spec_limits: SpecLimits
    zone_boundaries: ZoneBoundaries
```

---

## 3. SPC Engine Changes

### 3.1 Sample Validation

**File:** `backend/src/openspc/core/engine/spc_engine.py`

```python
async def _validate_measurements(
    self,
    char: Characteristic,
    measurements: list[float]
) -> tuple[bool, bool]:
    """Validate measurements against characteristic configuration.

    Returns:
        Tuple of (is_valid, is_undersized)

    Raises:
        ValueError: If measurements don't meet minimum requirements
    """
    actual_n = len(measurements)

    # Check minimum measurements requirement (applies to all modes)
    if actual_n < char.min_measurements:
        raise ValueError(
            f"Received {actual_n} measurements, minimum required is "
            f"{char.min_measurements} for characteristic {char.id}"
        )

    # Mode-specific validation
    if char.subgroup_mode == SubgroupMode.NOMINAL_TOLERANCE:
        # Mode C: Allow up to subgroup_size, flag if below warn_below_count
        if actual_n > char.subgroup_size:
            raise ValueError(
                f"Received {actual_n} measurements, maximum is "
                f"{char.subgroup_size} for characteristic {char.id}"
            )

    warn_threshold = char.warn_below_count or char.subgroup_size
    is_undersized = actual_n < warn_threshold

    return True, is_undersized
```

### 3.2 Statistics Calculation Per Mode

```python
async def _compute_sample_statistics(
    self,
    char: Characteristic,
    measurements: list[float],
    actual_n: int,
) -> dict:
    """Compute sample statistics based on subgroup mode."""
    mean = sum(measurements) / len(measurements)
    range_value = max(measurements) - min(measurements) if actual_n > 1 else None

    result = {
        "mean": mean,
        "range_value": range_value,
        "z_score": None,
        "effective_ucl": None,
        "effective_lcl": None,
    }

    if char.subgroup_mode == SubgroupMode.STANDARDIZED:
        # Mode A: Calculate Z-score
        # Z = (X_bar - mu) / (sigma / sqrt(n))
        if char.stored_sigma is None or char.stored_center_line is None:
            raise ValueError(
                f"Mode A requires stored_sigma and stored_center_line. "
                f"Run recalculate-limits first for characteristic {char.id}"
            )
        sigma_xbar = char.stored_sigma / (actual_n ** 0.5)
        z_score = (mean - char.stored_center_line) / sigma_xbar
        result["z_score"] = z_score

    elif char.subgroup_mode == SubgroupMode.VARIABLE_LIMITS:
        # Mode B: Calculate point-specific control limits
        if char.stored_sigma is None or char.stored_center_line is None:
            raise ValueError(
                f"Mode B requires stored_sigma and stored_center_line. "
                f"Run recalculate-limits first for characteristic {char.id}"
            )
        # UCL/LCL = center_line ± 3 * (sigma / sqrt(n))
        sigma_xbar = char.stored_sigma / (actual_n ** 0.5)
        result["effective_ucl"] = char.stored_center_line + 3 * sigma_xbar
        result["effective_lcl"] = char.stored_center_line - 3 * sigma_xbar

    return result
```

### 3.3 Zone Classification Per Mode

**File:** `backend/src/openspc/core/engine/rolling_window.py`

```python
def classify_value_for_mode(
    self,
    value: float,
    mode: str,
    actual_n: int,
    sigma: float,
    center_line: float,
    effective_ucl: float | None = None,
    effective_lcl: float | None = None,
) -> tuple[Zone, bool, float]:
    """Classify a value into zone based on subgroup mode."""

    if mode == "STANDARDIZED":
        # Mode A: value IS the z_score, zones are fixed at ±1, ±2, ±3
        z = value
        is_above = z >= 0
        sigma_distance = abs(z)

        if z >= 3:
            zone = Zone.BEYOND_UCL
        elif z >= 2:
            zone = Zone.ZONE_A_UPPER
        elif z >= 1:
            zone = Zone.ZONE_B_UPPER
        elif z >= 0:
            zone = Zone.ZONE_C_UPPER
        elif z >= -1:
            zone = Zone.ZONE_C_LOWER
        elif z >= -2:
            zone = Zone.ZONE_B_LOWER
        elif z >= -3:
            zone = Zone.ZONE_A_LOWER
        else:
            zone = Zone.BEYOND_LCL

    elif mode == "VARIABLE_LIMITS":
        # Mode B: Use point-specific limits for zone boundaries
        sigma_xbar = sigma / (actual_n ** 0.5)
        is_above = value >= center_line
        sigma_distance = abs(value - center_line) / sigma_xbar

        plus_1 = center_line + sigma_xbar
        plus_2 = center_line + 2 * sigma_xbar
        minus_1 = center_line - sigma_xbar
        minus_2 = center_line - 2 * sigma_xbar

        if value >= effective_ucl:
            zone = Zone.BEYOND_UCL
        elif value >= plus_2:
            zone = Zone.ZONE_A_UPPER
        elif value >= plus_1:
            zone = Zone.ZONE_B_UPPER
        elif value >= center_line:
            zone = Zone.ZONE_C_UPPER
        elif value >= minus_1:
            zone = Zone.ZONE_C_LOWER
        elif value >= minus_2:
            zone = Zone.ZONE_B_LOWER
        elif value >= effective_lcl:
            zone = Zone.ZONE_A_LOWER
        else:
            zone = Zone.BEYOND_LCL

    else:  # NOMINAL_TOLERANCE
        # Mode C: Use nominal/stored control limits (existing behavior)
        return self.classify_value(value)

    return zone, is_above, sigma_distance
```

### 3.4 WindowSample Updates

```python
@dataclass
class WindowSample:
    sample_id: int
    timestamp: datetime
    value: float  # Mean for Mode B/C, Z-score for Mode A
    range_value: float | None
    zone: Zone
    is_above_center: bool
    sigma_distance: float
    actual_n: int  # NEW: Actual measurement count
    is_undersized: bool  # NEW: Flag for undersized samples
    effective_ucl: float | None = None  # NEW: For Mode B
    effective_lcl: float | None = None  # NEW: For Mode B
    z_score: float | None = None  # NEW: For Mode A
```

### 3.5 Control Limit Calculation Updates

**File:** `backend/src/openspc/core/engine/control_limits.py`

```python
async def recalculate_and_persist(self, characteristic_id: int, ...) -> CalculationResult:
    # ... existing calculation logic ...

    # Store sigma and center_line for Mode A & B
    characteristic.stored_sigma = result.sigma
    characteristic.stored_center_line = result.center_line

    # Calculate nominal UCL/LCL using configured subgroup_size
    if characteristic.subgroup_mode in ("STANDARDIZED", "VARIABLE_LIMITS"):
        # For Mode A & B, store limits based on nominal n for reference
        nominal_sigma_xbar = result.sigma / (characteristic.subgroup_size ** 0.5)
        characteristic.ucl = result.center_line + 3 * nominal_sigma_xbar
        characteristic.lcl = result.center_line - 3 * nominal_sigma_xbar
    else:
        # Mode C: Standard calculation
        characteristic.ucl = result.ucl
        characteristic.lcl = result.lcl
```

---

## 4. Frontend Changes

### 4.1 Type Updates

**File:** `frontend/src/types/index.ts`

```typescript
export type SubgroupMode = 'STANDARDIZED' | 'VARIABLE_LIMITS' | 'NOMINAL_TOLERANCE'

export interface Characteristic {
  // ... existing fields ...
  subgroup_mode: SubgroupMode
  min_measurements: number
  warn_below_count: number | null
  stored_sigma: number | null
  stored_center_line: number | null
}

export interface ChartDataPoint {
  // ... existing fields ...
  actual_n: number
  is_undersized: boolean
  effective_ucl: number | null
  effective_lcl: number | null
  z_score: number | null
  display_value: number
}

export interface ChartData {
  // ... existing fields ...
  subgroup_mode: SubgroupMode
  nominal_subgroup_size: number
}
```

### 4.2 Configuration UI

**File:** `frontend/src/components/CharacteristicForm.tsx`

```tsx
<div className="space-y-4">
  <h3 className="font-medium">Subgroup Size Handling</h3>

  <div>
    <label className="text-sm font-medium">Mode</label>
    <select value={formData.subgroup_mode} onChange={...}>
      <option value="NOMINAL_TOLERANCE">
        Nominal with Tolerance (Default)
      </option>
      <option value="VARIABLE_LIMITS">
        Variable Control Limits
      </option>
      <option value="STANDARDIZED">
        Standardized (Z-Score)
      </option>
    </select>
    <p className="text-xs text-muted-foreground mt-1">
      {formData.subgroup_mode === 'NOMINAL_TOLERANCE' &&
        'Uses nominal subgroup size for limits. Accepts samples with fewer measurements.'}
      {formData.subgroup_mode === 'VARIABLE_LIMITS' &&
        'Recalculates control limits per point based on actual sample size.'}
      {formData.subgroup_mode === 'STANDARDIZED' &&
        'Plots Z-scores with fixed ±3 control limits. Best for comparing across characteristics.'}
    </p>
  </div>

  <div className="grid grid-cols-2 gap-4">
    <div>
      <label>Minimum Measurements</label>
      <input type="number" min={1} max={subgroup_size} ... />
    </div>
    <div>
      <label>Warn Below</label>
      <input type="number" min={min_measurements} max={subgroup_size} ... />
    </div>
  </div>
</div>
```

### 4.3 Control Chart Rendering

**File:** `frontend/src/components/ControlChart.tsx`

Key rendering changes:
- **Mode A**: Plot z_score on Y-axis, fixed limits at ±3
- **Mode B**: Plot mean, draw variable limit lines (funnel effect)
- **Mode C**: Plot mean with fixed nominal limits (current behavior)

Visual indicators:
- Undersized samples: dashed ring around point
- Show `n=X` label near each point for Mode A/B
- Different tooltip content per mode

---

## 5. Migration Strategy

### 5.1 Default Behavior
- All existing characteristics default to `NOMINAL_TOLERANCE` mode
- `min_measurements = 1` (permissive)
- `warn_below_count = NULL` (defaults to subgroup_size)

### 5.2 Backward Compatibility
- Mode C with `min_measurements = subgroup_size` replicates strict validation
- API responses include new fields (additive, non-breaking)
- Existing clients continue to work unchanged

### 5.3 Deployment Order
1. Deploy database migration
2. Deploy backend changes
3. Deploy frontend changes
4. Enable Mode A/B per characteristic as needed

---

## 6. Summary Comparison

| Aspect | Mode A (Standardized) | Mode B (Variable Limits) | Mode C (Nominal) |
|--------|----------------------|-------------------------|------------------|
| Y-axis | Z-score | Actual value | Actual value |
| UCL/LCL | Fixed ±3 | Per-point (funnel) | Fixed nominal |
| Best for | Purists, comparisons | Visual intuition | Simplicity |
| Requires | stored_sigma, center_line | stored_sigma, center_line | ucl, lcl |
| Complexity | Medium | High | Low |
