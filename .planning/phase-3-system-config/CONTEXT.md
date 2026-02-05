# Phase 3.2: System Configuration Hub

## Overview
Create a comprehensive system configuration page with theme/appearance customization and complete the Settings tabs.

## CEO Decisions
- Theme customization: Intermediate with option for advanced override
- Chart color customization: Full palette control

## Tasks

### 3.2.1 Theme & Appearance Settings Tab
- Theme mode selector (Light/Dark/System) - already exists in header, add to settings
- Chart color palette configuration:
  - Data line colors (gradient start/end)
  - Control limit line colors (UCL, LCL, center)
  - Zone fill colors (A, B, C zones)
  - Violation indicator colors
- Preset themes (Classic, High Contrast, Colorblind-safe)
- Preview panel showing chart with current settings
- Advanced mode: raw CSS variable editor

### 3.2.2 Complete API Keys Tab
- List existing API keys (masked)
- Create new API key
- Revoke API key
- Copy key to clipboard

### 3.2.3 Complete Notifications Tab
- Webhook URL configuration
- Test webhook button
- Notification preferences (which events trigger notifications)

### 3.2.4 Complete Database Tab
- Database statistics (tables, row counts)
- Export data (JSON/CSV)
- Clear data options (with confirmation)

## Files to Create/Modify

### Frontend
- `frontend/src/pages/SettingsView.tsx` - Add tab content
- `frontend/src/components/AppearanceSettings.tsx` - New component
- `frontend/src/components/ApiKeysSettings.tsx` - New component
- `frontend/src/components/NotificationsSettings.tsx` - New component
- `frontend/src/components/DatabaseSettings.tsx` - New component
- `frontend/src/lib/theme-presets.ts` - Theme preset definitions
- `frontend/src/stores/themeStore.ts` - Theme customization state

### Backend
- API endpoints for API key management (if not complete)
- Webhook test endpoint
- Database stats endpoint

## Acceptance Criteria
- [ ] Theme customization with live preview
- [ ] Chart colors configurable with presets
- [ ] API keys manageable from UI
- [ ] Webhook configuration working
- [ ] Database stats visible
