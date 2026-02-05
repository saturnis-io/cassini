# Phase 2 Implementation Decisions

**Captured:** 2026-02-04

## CEO Decisions

| Question | Decision |
|----------|----------|
| API Authentication | API Key (in `X-API-Key` header) |
| Notification Channels | In-app (WebSocket) + Webhook |
| Data Source Priority | MQTT first, then SparkplugB |
| Dark Mode Behavior | Auto-detect system preference |

## Implementation Order

### Gate 1: High Priority
1. Help Tooltip Framework
2. Nelson Rules Configuration UI
3. API Data Entry Endpoint

### Gate 2: Medium Priority (after CEO review)
4. Chart Styling Improvements
5. Dark Mode

### Gate 3: Low Priority (after CEO review)
6. Data Collection Configuration (MQTT → SparkplugB)
