# Phase 2: Data Integration, Notifications & UX Enhancements

## CEO Requirements (Captured 2026-02-04)

---

## Feature 1: Data Collection Configuration

### Description
Configure data collection from industrial protocols: MQTT, SparkplugB, or OPC-UA.

### Requirements
- UI to configure connection settings for each protocol type
- Map incoming tags/nodes to characteristics
- Support automatic data ingestion from configured sources
- Connection status monitoring

### Protocols
1. **MQTT** - Standard MQTT broker connection
2. **SparkplugB** - MQTT with SparkplugB namespace (UNS pattern)
3. **OPC-UA** - OPC Unified Architecture server connection

---

## Feature 2: API Data Entry Endpoint

### Description
REST API endpoint for programmatic data submission (external systems, scripts).

### Requirements
- POST endpoint for submitting measurements
- Batch submission support
- Authentication/authorization
- Validation and error responses

---

## Feature 3: Nelson Rules Configuration

### Description
UI to select which Nelson rules apply to specific characteristics and notification mechanisms.

### Requirements
- Per-characteristic rule selection (enable/disable individual rules)
- Already have `rules` relationship on Characteristic model
- Need UI to configure rules
- Need alarm/notification system when rules are violated

### Notification Methods
- In-app alerts/notifications
- Email (optional/future)
- Webhook callbacks
- WebSocket real-time push (already have infrastructure)

---

## Feature 4: Chart Styling Improvements

### Description
Make X-bar charts more visually appealing (currently monotone).

### Requirements
- Better color differentiation for data series
- Gradient fills or visual enhancements
- Improved point markers
- Better visual hierarchy
- Maintain Sepasoft brand colors

---

## Feature 5: Dark Mode

### Description
Theme toggle with Sepasoft-compatible dark palette.

### Requirements
- Toggle between light/dark mode
- Persist preference
- Dark palette that works with Sepasoft brand colors
- CSS variables for easy theming

---

## Feature 6: Help Tooltip Framework

### Description
Contextual help system with "?" icons providing rich tooltips.

### Requirements
- Reusable React component
- "?" icon that shows tooltip on hover/click
- Support for rich content (formatted text, links)
- Use cases:
  - Nelson rules explanations
  - When/why to recalculate UCL/LCL
  - Mode explanations (A/B/C)
  - Statistical terms and values

---

## Priority Grouping (Suggested)

### High Priority (Core Functionality)
1. API Data Entry Endpoint - enables external integration
2. Nelson Rules Configuration UI - core SPC functionality
3. Help Tooltip Framework - improves usability

### Medium Priority (UX)
4. Chart Styling Improvements
5. Dark Mode

### Lower Priority (Complex Integration)
6. Data Collection Configuration (MQTT/SparkplugB/OPC-UA)
   - This is more complex and may require separate infrastructure

---

## Questions for CEO (if needed)

1. **API Auth**: What authentication method preferred? (API key, JWT, OAuth2)
2. **Notifications**: Which notification methods are priority? (in-app, email, webhook)
3. **Data Sources**: Which protocol is highest priority? (MQTT, SparkplugB, OPC-UA)
4. **Dark Mode**: Should it auto-detect system preference?
