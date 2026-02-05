---
phase: enterprise-ui-overhaul
plan: 7
type: execute
wave: 4
depends_on: [3]
files_modified:
  - frontend/src/providers/ThemeProvider.tsx
  - frontend/src/components/ThemeCustomizer.tsx
  - frontend/src/pages/SettingsView.tsx
autonomous: true
must_haves:
  truths:
    - "Admin can customize brand colors in Settings"
    - "Brand colors apply throughout the application"
    - "Custom logo and app name can be configured"
  artifacts:
    - "frontend/src/providers/ThemeProvider.tsx extended for brand colors"
    - "frontend/src/components/ThemeCustomizer.tsx provides admin UI"
    - "SettingsView includes theme customizer section"
  key_links:
    - "ThemeProvider manages CSS variables for brand colors"
    - "ThemeCustomizer updates ThemeProvider context"
    - "Brand config persists in localStorage"
---

# Phase Enterprise UI Overhaul - Plan 7: Enterprise Brand Theming

## Objective
Add brand customization capabilities for primary/accent colors, logo, and app name.

## Tasks

<task type="auto">
  <name>Task 1: Extend Theme Provider for Brand Colors</name>
  <files>frontend/src/providers/ThemeProvider.tsx</files>
  <action>
    Add brand customization to ThemeProvider:
    1. Define BrandConfig interface
    2. Add brand state to context
    3. Apply brand colors via CSS custom properties
    4. Persist brand config to localStorage

    Extended interface:
    ```typescript
    interface BrandConfig {
      primaryColor: string      // hex color
      accentColor: string       // hex color
      logoUrl: string | null    // URL or data URI
      appName: string           // Override "OpenSPC"
    }

    interface ThemeContextValue {
      // Existing
      theme: Theme
      setTheme: (theme: Theme) => void
      resolvedTheme: 'light' | 'dark'

      // New
      brandConfig: BrandConfig
      setBrandConfig: (config: Partial<BrandConfig>) => void
      resetBrandConfig: () => void
    }
    ```

    Default brand config:
    ```typescript
    {
      primaryColor: '#3b82f6',  // blue-500
      accentColor: '#8b5cf6',   // violet-500
      logoUrl: null,
      appName: 'OpenSPC'
    }
    ```

    CSS variable updates:
    - --primary: from primaryColor
    - --accent: from accentColor (new variable)

    Constraints:
    - Validate hex color format
    - Use separate storage key: 'openspc-brand'
    - Apply colors on mount and on change
    - Generate HSL values from hex for Tailwind compatibility
  </action>
  <verify>
    ```bash
    # Brand config in interface
    grep -q "brandConfig" frontend/src/providers/ThemeProvider.tsx

    # Storage key for brand
    grep -q "openspc-brand" frontend/src/providers/ThemeProvider.tsx

    # TypeScript compiles
    cd frontend && npx tsc --noEmit
    ```
  </verify>
  <done>
    - ThemeProvider extended with brand config
    - CSS variables updated dynamically
    - Brand config persists in localStorage
    - resetBrandConfig restores defaults
  </done>
</task>

<task type="auto">
  <name>Task 2: Create Theme Customizer Component</name>
  <files>frontend/src/components/ThemeCustomizer.tsx</files>
  <action>
    Create admin UI for brand customization:
    1. Color pickers for primary and accent colors
    2. Text input for app name
    3. File upload or URL input for logo
    4. Preview panel showing changes
    5. Save and Reset buttons

    Props interface:
    ```typescript
    interface ThemeCustomizerProps {
      className?: string
    }
    ```

    Layout:
    ```
    ┌─────────────────────────────────────────────┐
    │ Brand Customization                         │
    ├─────────────────────────────────────────────┤
    │ App Name:    [OpenSPC____________]          │
    │                                             │
    │ Primary Color:  [■ #3b82f6] [picker]        │
    │ Accent Color:   [■ #8b5cf6] [picker]        │
    │                                             │
    │ Logo:  [Choose File] or [URL input]         │
    │        [Preview: logo image]                │
    │                                             │
    ├─────────────────────────────────────────────┤
    │ Preview                                     │
    │ ┌─────────────────────────────────────────┐ │
    │ │ [logo] AppName    [Button] [Link]       │ │
    │ └─────────────────────────────────────────┘ │
    ├─────────────────────────────────────────────┤
    │                    [Reset to Default] [Save]│
    └─────────────────────────────────────────────┘
    ```

    Constraints:
    - Use native color input (type="color")
    - Validate logo URL before applying
    - Show real-time preview as colors change
    - Require admin role to access (check useAuth)
    - Max logo size: 200KB for data URI
  </action>
  <verify>
    ```bash
    # File exists with expected exports
    grep -q "export function ThemeCustomizer" frontend/src/components/ThemeCustomizer.tsx

    # Uses theme context
    grep -q "useTheme" frontend/src/components/ThemeCustomizer.tsx

    # TypeScript compiles
    cd frontend && npx tsc --noEmit
    ```
  </verify>
  <done>
    - ThemeCustomizer component created
    - Color pickers for brand colors
    - App name input
    - Logo upload/URL input
    - Live preview
    - Save and reset functionality
  </done>
</task>

<task type="auto">
  <name>Task 3: Add Theme Customizer to Settings</name>
  <files>frontend/src/pages/SettingsView.tsx</files>
  <action>
    Integrate ThemeCustomizer into SettingsView:
    1. Import ThemeCustomizer component
    2. Add "Branding" section to settings
    3. Only show to admin role
    4. Position after Appearance section

    Updated SettingsView sections:
    ```
    - Appearance (theme toggle) - all users
    - Notifications - all users
    - Database - engineer+
    - API Keys - engineer+
    - Branding - admin only (NEW)
    ```

    Constraints:
    - Use useAuth to check role
    - Show role-required message for non-admins
    - Keep existing settings functionality
  </action>
  <verify>
    ```bash
    # ThemeCustomizer import
    grep -q "import.*ThemeCustomizer" frontend/src/pages/SettingsView.tsx

    # TypeScript compiles
    cd frontend && npx tsc --noEmit
    ```
  </verify>
  <done>
    - ThemeCustomizer added to SettingsView
    - Only visible to admin role
    - Positioned in correct section
    - Existing settings preserved
  </done>
</task>

## Completion Criteria

Plan is complete when:
- [ ] All tasks marked done
- [ ] All verify commands pass
- [ ] Atomic commit created
- [ ] Admin can access brand customization
- [ ] Color changes apply throughout app
- [ ] Custom app name shows in header
- [ ] Brand config persists on refresh
