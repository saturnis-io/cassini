# OpenSPC UI Wireframes

## Document Information
- **Project:** OpenSPC - Event-Driven Statistical Process Control System
- **Author:** UI/UX Designer, Virtual Engineering Co.
- **Date:** 2026-02-02
- **Status:** Design Specification

---

## 1. Operator Dashboard (Primary View)

The main working interface for operators to enter measurements and monitor process health.

### 1.1 Full Dashboard Layout

```
+-----------------------------------------------------------------------------------+
|  [Logo] OpenSPC                    Plant: Acme East    [User: J.Smith v]  [Help]  |
+-----------------------------------------------------------------------------------+
|                                                                                   |
|  +-----------------------------+  +---------------------------------------------+ |
|  |      TO-DO LIST            |  |              VISUALIZATION                   | |
|  |  (Scrollable Card List)    |  |                                             | |
|  |                            |  |  +---------------------------------------+  | |
|  |  +------------------------+|  |  |          X-BAR CONTROL CHART          |  | |
|  |  | [!] Shaft Diameter     ||  |  |                                       |  | |
|  |  |     Machine: CNC-01    ||  |  |  UCL -------- 25.15 ---------------  |  | |
|  |  |     Due: OVERDUE       ||  |  |       ======== +3s (Red Zone) ====  |  | |
|  |  |     Last: 2h ago       ||  |  |       -------- +2s (Yellow) ------  |  | |
|  |  +------------------------+|  |  |       ........ +1s (Green) .......  |  | |
|  |   [RED CARD - OOC]         |  |  |  CL  -------- 25.00 --------------- |  | |
|  |                            |  |  |       ........ -1s (Green) .......  |  | |
|  |  +------------------------+|  |  |       -------- -2s (Yellow) ------  |  | |
|  |  | [ ] Surface Finish     ||  |  |       ======== -3s (Red Zone) ====  |  | |
|  |  |     Machine: CNC-02    ||  |  |  LCL -------- 24.85 ---------------  |  | |
|  |  |     Due: NOW           ||  |  |                                       |  | |
|  |  |     Last: 30m ago      ||  |  |   o--o     o                          |  | |
|  |  +------------------------+|  |  |      \   /|\                          |  | |
|  |   [YELLOW CARD - DUE]      |  |  |       o-o o--[*]<-- Click for details |  | |
|  |                            |  |  |                                       |  | |
|  |  +------------------------+|  |  |  Sample: 24  25  26  27  28  29  30   |  | |
|  |  | [ ] Bore Roundness     ||  |  +---------------------------------------+  | |
|  |  |     Machine: CNC-01    ||  |                                             | |
|  |  |     Due: 45min         ||  |  +---------------------------------------+  | |
|  |  |     Last: 15m ago      ||  |  |          DISTRIBUTION HISTOGRAM       |  | |
|  |  +------------------------+|  |  |                                       |  | |
|  |   [GREY CARD - OK]         |  |  |      LSL              USL             |  | |
|  |                            |  |  |       |    _____      |               |  | |
|  |  +------------------------+|  |  |       |   /     \     |               |  | |
|  |  | [ ] Thread Pitch       ||  |  |       |  /       \    |               |  | |
|  |  |     Machine: CNC-03    ||  |  |       | /         \   |               |  | |
|  |  |     Due: 1h 20min      ||  |  |       |/           \  |               |  | |
|  |  |     Last: 40m ago      ||  |  |  _____|             \_|____           |  | |
|  |  +------------------------+|  |  |                                       |  | |
|  |   [GREY CARD - OK]         |  |  |  Cp: 1.45  Cpk: 1.32  n: 100          |  | |
|  |                            |  |  +---------------------------------------+  | |
|  +-----------------------------+  +---------------------------------------------+ |
|                                                                                   |
+-----------------------------------------------------------------------------------+
|  Status: Connected   |   Active Characteristics: 12   |   Pending Alerts: 3      |
+-----------------------------------------------------------------------------------+
```

### 1.2 To-Do Card States

```
GREY CARD (No Sample Due)              YELLOW CARD (Sample Due)
+---------------------------+          +---------------------------+
| [ ] Characteristic Name   |          | [!] Characteristic Name   |
|     Machine: [Name]       |          |     Machine: [Name]       |
|     Due: [Time until]     |          |     Due: NOW / OVERDUE    |
|     Last: [Time since]    |          |     Last: [Time since]    |
|                           |          |                           |
| [light border, muted]     |          | [amber border, highlight] |
+---------------------------+          +---------------------------+

RED CARD (Last OOC / Alert)
+---------------------------+
| [!!] Characteristic Name  |
|      Machine: [Name]      |
|      VIOLATION: Rule 1    |
|      Last: [Time since]   |
|                           |
| [red border, pulsing dot] |
+---------------------------+
```

### 1.3 Input Modal (Measurement Entry)

```
+------------------------------------------------------------------+
|                    ENTER MEASUREMENT                         [X]  |
+------------------------------------------------------------------+
|                                                                   |
|  Characteristic: Shaft Diameter                                   |
|  Machine: CNC-01                                                  |
|  Specification: 25.00 +/- 0.15 mm                                 |
|                                                                   |
|  +-------------------------------------------------------------+ |
|  |                                                             | |
|  |                         [ 25.08 ]                           | |
|  |                                                             | |
|  |              (Large numeric input with auto-focus)          | |
|  +-------------------------------------------------------------+ |
|                                                                   |
|  Visual Feedback:                                                 |
|  +-------------------------------------------------------------+ |
|  |  LSL        |===========|Target|===========|        USL     | |
|  |  24.85              ^                               25.15   | |
|  |                     |                                       | |
|  |              Current Value: 25.08                           | |
|  +-------------------------------------------------------------+ |
|                                                                   |
|  +-------------------------------------------------------------+ |
|  |  Add Comment (optional)                                     | |
|  |  [                                                        ] | |
|  +-------------------------------------------------------------+ |
|                                                                   |
|  Batch Number: [AUTO-FILLED    ]    Operator: J. Smith           |
|                                                                   |
|  +----------------------------+  +-----------------------------+ |
|  |        [ Cancel ]         |  |       [ Submit ]            | |
|  +----------------------------+  +-----------------------------+ |
|                                                                   |
+------------------------------------------------------------------+
```

### 1.4 Input Modal - Validation States

```
VALID STATE (Within Spec)              OUT-OF-SPEC STATE
+---------------------------+          +---------------------------+
|      [ 25.08 ]            |          |      [ 25.22 ]            |
|  [green border]           |          |  [red border, shaking]    |
|                           |          |                           |
|  [green check icon]       |          |  [red warning icon]       |
|  "Within specification"   |          |  "EXCEEDS USL (25.15)"    |
+---------------------------+          +---------------------------+

NEAR-LIMIT STATE (Warning)
+---------------------------+
|      [ 25.12 ]            |
|  [amber border]           |
|                           |
|  [amber warning icon]     |
|  "Approaching USL"        |
+---------------------------+
```

---

## 2. Control Chart Visualization

### 2.1 X-Bar Chart with Zone Bands

```
+------------------------------------------------------------------------+
|  X-Bar Chart: Shaft Diameter                      [I-MR v] [Export]    |
+------------------------------------------------------------------------+
|                                                                        |
|  USL   25.15 |--------------------------------------------------------|
|              |========= SPEC VIOLATION ZONE (Red Background) =========|
|  UCL   25.12 |--------------------------------------------------------|
|              |######### +3s CONTROL ZONE (Red Hatched) ###############|
|  +2s   25.08 |--------------------------------------------------------|
|              |========= +2s WARNING ZONE (Yellow) ====================|
|  +1s   25.04 |--------------------------------------------------------|
|              |~~~~~~~~~ +1s NORMAL ZONE (Light Green) ~~~~~~~~~~~~~~~~|
|  CL    25.00 |------------------------ CENTER LINE -------------------|
|              |~~~~~~~~~ -1s NORMAL ZONE (Light Green) ~~~~~~~~~~~~~~~~|
|  -1s   24.96 |--------------------------------------------------------|
|              |========= -2s WARNING ZONE (Yellow) ====================|
|  -2s   24.92 |--------------------------------------------------------|
|              |######### -3s CONTROL ZONE (Red Hatched) ###############|
|  LCL   24.88 |--------------------------------------------------------|
|              |========= SPEC VIOLATION ZONE (Red Background) =========|
|  LSL   24.85 |--------------------------------------------------------|
|                                                                        |
|         o     o                                                        |
|          \   / \   o     o                                             |
|           o-o   o-/ \   /                                              |
|                      o-o   o--o                                        |
|                               \ /o                                     |
|                                o   \o--[*] <-- Violation (pulsing)     |
|                                                                        |
|  +-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----+  |
|    20    21    22    23    24    25    26    27    28    29    30     |
|                           Sample Number                               |
+------------------------------------------------------------------------+
|  Selected: Sample #30  |  Value: 24.76  |  Rule 1 Violation  |  [Ack] |
+------------------------------------------------------------------------+
```

### 2.2 Point Click/Hover Detail Tooltip

```
                    +-------------------------------+
                    |  Sample #30                   |
        [*]-------->|  Timestamp: 14:32:15          |
                    |  Value: 24.76 mm              |
                    |  Subgroup Mean: 24.78         |
                    |                               |
                    |  VIOLATION: Rule 1            |
                    |  Point beyond 3-sigma         |
                    |                               |
                    |  Status: Unacknowledged       |
                    |  [Acknowledge Violation]      |
                    +-------------------------------+
```

### 2.3 I-MR Chart Layout (for subgroup_size = 1)

```
+------------------------------------------------------------------------+
|  I-MR Chart: Surface Roughness                                         |
+------------------------------------------------------------------------+
|  INDIVIDUALS CHART                                                     |
|  UCL   3.8  |--------------------------------------------------------|
|             |  o                                                       |
|  CL    2.5  |----o--o--o--o--o--o--o--o--o--o--o--o--o--o--o----------|
|             |                                                          |
|  LCL   1.2  |--------------------------------------------------------|
|                                                                        |
+------------------------------------------------------------------------+
|  MOVING RANGE CHART                                                    |
|  UCL   1.6  |--------------------------------------------------------|
|             |                                                          |
|  CL    0.5  |--o--o--o--o--o--o--o--o--o--o--o--o--o--o--o-----------|
|             |                                                          |
|  LCL   0.0  |--------------------------------------------------------|
+------------------------------------------------------------------------+
```

---

## 3. Configuration View (Engineer Interface)

### 3.1 Tree + Detail Layout

```
+-----------------------------------------------------------------------------------+
|  [Logo] OpenSPC                    Configuration Mode    [User: Engineer v]       |
+-----------------------------------------------------------------------------------+
|                                                                                   |
|  +---------------------------+  +-----------------------------------------------+ |
|  |    ISA-95 HIERARCHY      |  |          CHARACTERISTIC CONFIGURATION         | |
|  |                          |  |                                               | |
|  |  v [Site] Acme Factory   |  |  Name: Shaft Diameter                         | |
|  |    v [Area] Building A   |  |  Description: OD measurement at position A    | |
|  |      v [Line] Line 1     |  |                                               | |
|  |        v [Cell] CNC-01   |  |  +-------------------------------------------+ | |
|  |          > Shaft Dia [*] |  |  |  DATA PROVIDER                            | | |
|  |          > Bore Round    |  |  |                                           | | |
|  |          > Thread Pitch  |  |  |  ( ) Manual Entry                         | | |
|  |        > [Cell] CNC-02   |  |  |  (*) Tag (Automated)                       | | |
|  |      > [Line] Line 2     |  |  |                                           | | |
|  |    > [Area] Building B   |  |  |  MQTT Topic: [Browse...]                  | | |
|  |  > [Site] Acme West      |  |  |  spBv1.0/Factory/NDATA/Line1/CNC01/Shaft  | | |
|  |                          |  |  |                                           | | |
|  |  [+ Add Node]            |  |  |  Trigger: [On Change v]                   | | |
|  +---------------------------+  |  |  Deadband: [0.01    ]                     | | |
|                                 |  +-------------------------------------------+ | |
|                                 |                                               | |
|  +---------------------------+  |  +-------------------------------------------+ | |
|  |    QUICK ACTIONS         |  |  |  SPECIFICATION LIMITS                     | | |
|  |                          |  |  |                                           | | |
|  |  [+ New Characteristic]  |  |  |  Target:  [25.00   ] mm                   | | |
|  |  [  Bulk Import...]      |  |  |  USL:     [25.15   ] mm                   | | |
|  |  [  Export Config...]    |  |  |  LSL:     [24.85   ] mm                   | | |
|  |                          |  |  |                                           | | |
|  +---------------------------+  |  +-------------------------------------------+ | |
|                                 |                                               | |
|                                 |  +-------------------------------------------+ | |
|                                 |  |  CONTROL LIMITS                           | | |
|                                 |  |                                           | | |
|                                 |  |  UCL:     [25.12   ] mm  (calculated)    | | |
|                                 |  |  CL:      [25.02   ] mm  (calculated)    | | |
|                                 |  |  LCL:     [24.92   ] mm  (calculated)    | | |
|                                 |  |                                           | | |
|                                 |  |  [Recalculate from Last 25 Samples]      | | |
|                                 |  +-------------------------------------------+ | |
|                                 |                                               | |
|                                 |  +-------------------------------------------+ | |
|                                 |  |  NELSON RULES                             | | |
|                                 |  |                                           | | |
|                                 |  |  [x] Rule 1: Point beyond 3s              | | |
|                                 |  |  [x] Rule 2: 9 points same side           | | |
|                                 |  |  [x] Rule 3: 6 points trending            | | |
|                                 |  |  [x] Rule 4: 14 points alternating        | | |
|                                 |  |  [ ] Rule 5: 2/3 points beyond 2s         | | |
|                                 |  |  [ ] Rule 6: 4/5 points beyond 1s         | | |
|                                 |  |  [ ] Rule 7: 15 points within 1s          | | |
|                                 |  |  [ ] Rule 8: 8 points beyond 1s both      | | |
|                                 |  |                                           | | |
|                                 |  |  [Enable All] [Disable All] [Reset]       | | |
|                                 |  +-------------------------------------------+ | |
|                                 |                                               | |
|                                 |  +-------------------------------------------+ | |
|                                 |  |  SAMPLING CONFIGURATION                   | | |
|                                 |  |                                           | | |
|                                 |  |  Subgroup Size:    [5       ]             | | |
|                                 |  |  Sample Interval:  [60      ] minutes     | | |
|                                 |  |  Window Size:      [25      ] samples     | | |
|                                 |  +-------------------------------------------+ | |
|                                 |                                               | |
|                                 |     [Delete]              [Save Changes]      | |
|                                 +-----------------------------------------------+ |
|                                                                                   |
+-----------------------------------------------------------------------------------+
```

### 3.2 Tag Browser Modal (MQTT Topic Selection)

```
+------------------------------------------------------------------+
|                    SELECT MQTT TAG                           [X]  |
+------------------------------------------------------------------+
|                                                                   |
|  Search: [                                      ] [Search]        |
|                                                                   |
|  +-------------------------------------------------------------+ |
|  |  SPARKPLUG B NAMESPACE                                      | |
|  |                                                             | |
|  |  v spBv1.0                                                  | |
|  |    v Factory                                                | |
|  |      v NDATA                                                | |
|  |        v Line1                                              | |
|  |          v CNC01                                            | |
|  |            > ShaftDiameter    [DOUBLE]  Last: 25.03         | |
|  |            > BoreRoundness    [DOUBLE]  Last: 0.002         | |
|  |            > SpindleSpeed     [INT32]   Last: 12000         | |
|  |            > CoolantTemp      [DOUBLE]  Last: 22.5          | |
|  |          v CNC02                                            | |
|  |            > ...                                            | |
|  |        v Line2                                              | |
|  |          > ...                                              | |
|  +-------------------------------------------------------------+ |
|                                                                   |
|  Selected Topic:                                                  |
|  spBv1.0/Factory/NDATA/Line1/CNC01/ShaftDiameter                 |
|                                                                   |
|  Data Type: DOUBLE    Last Value: 25.03    Updated: 2s ago       |
|                                                                   |
|  +----------------------------+  +-----------------------------+ |
|  |        [ Cancel ]         |  |        [ Select ]           | |
|  +----------------------------+  +-----------------------------+ |
|                                                                   |
+------------------------------------------------------------------+
```

---

## 4. Alert Management

### 4.1 Violation Toast Notification

```
                                    +------------------------------------------+
                                    |  [!] NELSON RULE VIOLATION               |
                                    |                                          |
                                    |  Characteristic: Shaft Diameter          |
                                    |  Machine: CNC-01                         |
                                    |  Rule: 1 - Point beyond 3-sigma          |
                                    |  Value: 24.76 (LCL: 24.88)               |
                                    |                                          |
                                    |  [View Chart]  [Acknowledge]  [Dismiss]  |
                                    +------------------------------------------+
```

### 4.2 Acknowledgment Dialog

```
+------------------------------------------------------------------+
|                  ACKNOWLEDGE VIOLATION                       [X]  |
+------------------------------------------------------------------+
|                                                                   |
|  Characteristic: Shaft Diameter                                   |
|  Sample #30 at 2026-02-02 14:32:15                                |
|                                                                   |
|  VIOLATION DETAILS                                                |
|  +-------------------------------------------------------------+ |
|  |  Rule 1: Point beyond 3-sigma                               | |
|  |  Value: 24.76 mm                                            | |
|  |  Lower Control Limit: 24.88 mm                              | |
|  |  Deviation: -0.12 mm (1.4 sigma below LCL)                  | |
|  +-------------------------------------------------------------+ |
|                                                                   |
|  REASON CODE *                                                    |
|  +-------------------------------------------------------------+ |
|  |  [Select a reason...]                                    v  | |
|  +-------------------------------------------------------------+ |
|  |  - Tool wear                                                | |
|  |  - Material variation                                       | |
|  |  - Operator adjustment                                      | |
|  |  - Machine calibration                                      | |
|  |  - Environmental factors                                    | |
|  |  - Measurement error                                        | |
|  |  - Process change (expected)                                | |
|  |  - Unknown / Under investigation                            | |
|  +-------------------------------------------------------------+ |
|                                                                   |
|  CORRECTIVE ACTION                                                |
|  +-------------------------------------------------------------+ |
|  |  [                                                        ] | |
|  |  [                                                        ] | |
|  |  [                                                        ] | |
|  +-------------------------------------------------------------+ |
|                                                                   |
|  [ ] Exclude this sample from control limit calculations          |
|                                                                   |
|  +----------------------------+  +-----------------------------+ |
|  |        [ Cancel ]         |  |      [ Acknowledge ]        | |
|  +----------------------------+  +-----------------------------+ |
|                                                                   |
+------------------------------------------------------------------+
```

### 4.3 Alert History Panel (Optional Drawer)

```
+------------------------------------------------------------------+
|  ALERT HISTORY                                         [Filter v] |
+------------------------------------------------------------------+
|                                                                   |
|  TODAY                                                            |
|  +-------------------------------------------------------------+ |
|  |  [*] 14:32  Shaft Diameter    Rule 1    UNACKNOWLEDGED      | |
|  |  [*] 13:45  Bore Roundness    Rule 2    UNACKNOWLEDGED      | |
|  |  [o] 11:20  Surface Finish    Rule 1    Ack: J.Smith        | |
|  +-------------------------------------------------------------+ |
|                                                                   |
|  YESTERDAY                                                        |
|  +-------------------------------------------------------------+ |
|  |  [o] 16:30  Shaft Diameter    Rule 3    Ack: M.Johnson      | |
|  |  [o] 09:15  Thread Pitch      Rule 1    Ack: J.Smith        | |
|  +-------------------------------------------------------------+ |
|                                                                   |
|  [Load More...]                                                   |
+------------------------------------------------------------------+
```

---

## 5. Distribution Histogram

### 5.1 Bell Curve with Specification Overlay

```
+------------------------------------------------------------------------+
|  Distribution: Shaft Diameter (Last 100 samples)              [Export] |
+------------------------------------------------------------------------+
|                                                                        |
|       |                                                                |
|       |                                                                |
|   F   |                      _____                                     |
|   r   |                    /       \                                   |
|   e   |                   /         \                                  |
|   q   |                  /           \                                 |
|   u   |                 /             \                                |
|   e   |               /                 \                              |
|   n   |              /                   \                             |
|   c   |            /                       \                           |
|   y   |          /                           \                         |
|       |        /                               \                       |
|       |  ____/                                   \____                 |
|       |                                                                |
|       +----------------------------------------------------------------+
|       |        |        |        |        |        |        |         |
|     24.7     24.8     24.9     25.0     25.1     25.2     25.3        |
|              LSL              Target              USL                  |
|             24.85             25.00             25.15                  |
|                                                                        |
|       [Red]   [Red]   [Grn]   [Grn]   [Grn]   [Red]   [Red]           |
|       Zone    Zone    Zone    Zone    Zone    Zone    Zone            |
+------------------------------------------------------------------------+
|  Statistics:  Mean: 25.02  |  Std: 0.045  |  Cp: 1.48  |  Cpk: 1.33   |
+------------------------------------------------------------------------+
```

---

## 6. Navigation and Layout Structure

### 6.1 Top Navigation Bar

```
+-----------------------------------------------------------------------------------+
|  [Logo]  OpenSPC                                                                  |
|                                                                                   |
|  [Dashboard]  [Configuration]  [Alerts (3)]  [Reports]                           |
|                                                                                   |
|  Plant: [Acme East v]                          [J.Smith v]  [?]  [Settings]      |
+-----------------------------------------------------------------------------------+
```

### 6.2 Mobile/Tablet Navigation (Collapsed)

```
+------------------------------------------+
|  [=]  OpenSPC          [3]  [J.Smith v]  |
+------------------------------------------+
```

Hamburger menu expands to:
```
+------------------------------------------+
|  [X] MENU                                |
|                                          |
|  [Dashboard]                             |
|  [Configuration]                         |
|  [Alerts (3)]                            |
|  [Reports]                               |
|                                          |
|  ---                                     |
|  Plant: [Acme East v]                    |
|  Settings                                |
|  Help                                    |
+------------------------------------------+
```

---

## 7. Empty States

### 7.1 No Characteristics Configured

```
+------------------------------------------------------------------+
|                                                                   |
|                    [illustration: chart icon]                     |
|                                                                   |
|                 No characteristics configured                     |
|                                                                   |
|     Add your first characteristic to start monitoring             |
|     process quality.                                              |
|                                                                   |
|                 [+ Add Characteristic]                            |
|                                                                   |
+------------------------------------------------------------------+
```

### 7.2 No Data Yet

```
+------------------------------------------------------------------+
|                                                                   |
|                    [illustration: waiting]                        |
|                                                                   |
|                   Waiting for measurements                        |
|                                                                   |
|     This characteristic is configured but no samples              |
|     have been recorded yet.                                       |
|                                                                   |
|     [Enter Manual Sample]  or  [Check Tag Connection]             |
|                                                                   |
+------------------------------------------------------------------+
```

---

## 8. Loading States

### 8.1 Chart Loading

```
+------------------------------------------------------------------+
|  X-Bar Chart: Shaft Diameter                                      |
+------------------------------------------------------------------+
|                                                                   |
|                                                                   |
|                    [Skeleton pulse animation]                     |
|                    ========================                       |
|                    ========================                       |
|                    ========================                       |
|                                                                   |
|                    Loading chart data...                          |
|                                                                   |
+------------------------------------------------------------------+
```

### 8.2 Inline Loading

```
+---------------------------+
|  [ ] Shaft Diameter       |
|      Loading...           |
|      [====    ] spinner   |
+---------------------------+
```

---

*End of Wireframes Document*
