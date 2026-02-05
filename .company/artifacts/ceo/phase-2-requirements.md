# Phase 2 Requirements - CEO Directives

**Date**: 2026-02-04
**Status**: Approved for design and implementation

---

## 1. Data Collection Configuration

### Overview
Configure data collection from industrial data sources for automated SPC data ingestion.

### Supported Protocols
- **MQTT** - Standard MQTT messaging protocol
- **SparkplugB** - Industrial MQTT specification for SCADA/IIoT
- **OPC-UA** - Open Platform Communications Unified Architecture

### Requirements
- Configuration UI for defining data sources
- Connection management (connect/disconnect/test)
- Mapping from source data to characteristics
- Connection status monitoring
- Error handling and reconnection logic

---

## 2. API Endpoint for Data Entry

### Overview
RESTful API endpoint for programmatic data submission.

### Requirements
- POST endpoint for sample data submission
- Support for batch data entry
- Authentication/authorization
- Input validation
- Response with created sample details
- API documentation

---

## 3. Nelson Rules Configuration

### Overview
Per-characteristic selection of which Nelson rules to apply, with alarm/notification capabilities.

### Requirements
- UI to select which Nelson rules apply to each characteristic
- Support for all 8 Nelson rules (minimum)
- Alarm/notification system when rules are violated
- Notification methods (email, webhook, in-app)
- Configurable severity levels per rule
- Notification history/audit log

### Nelson Rules (Standard 8)
1. One point beyond 3σ
2. Nine points in a row on same side of center
3. Six points in a row steadily increasing or decreasing
4. Fourteen points in a row alternating up and down
5. Two out of three points beyond 2σ
6. Four out of five points beyond 1σ
7. Fifteen points in a row within 1σ
8. Eight points in a row beyond 1σ

---

## 4. X-bar Chart Styling

### Overview
Improve visual interest of X-bar charts to reduce monotone appearance.

### Requirements
- Zone shading (A, B, C zones)
- Gradient fills or subtle backgrounds
- Enhanced data point styling
- Specification limit visualization
- Color coding by status/zone
- Maintain Sepasoft brand colors

---

## 5. Dark Mode

### Overview
Dark mode option that works with Sepasoft styling.

### Requirements
- Toggle between light and dark modes
- Persist user preference
- All charts render correctly in dark mode
- Sepasoft brand colors adapted for dark backgrounds
- Proper contrast ratios for accessibility
- System preference detection (prefers-color-scheme)

---

## 6. Help Information Framework

### Overview
Contextual help system with "?" icons providing tooltips.

### Requirements
- Reusable HelpTooltip component
- Small "?" icon (unobtrusive)
- Rich tooltip content on hover/click
- Support for markdown/formatted content
- Help content for:
  - Nelson rules explanations
  - When/why to recalculate UCL/LCL
  - Chart type selection guidance
  - Statistical values interpretation
  - Control vs specification limits
  - SPC terminology glossary

### UI/UX
- Icon appears near relevant elements
- Hover triggers tooltip (with delay)
- Click opens expanded panel (optional)
- Mobile-friendly touch interactions
- Consistent styling across application

---

## Priority Order (Suggested)

1. **Help Information Framework** - Low effort, high UX value
2. **X-bar Chart Styling** - Visual polish
3. **Dark Mode** - User preference feature
4. **Nelson Rules Configuration** - Core SPC functionality
5. **API Endpoint for Data Entry** - Integration capability
6. **Data Collection Configuration** - Advanced integration

---

## Notes

- All features must maintain Sepasoft brand consistency
- Consider mobile/responsive design
- Document new features for users
- Ensure accessibility compliance (WCAG 2.1 AA)
