---
phase: 2-medium-priority
plan: 2
type: execute
wave: 1
depends_on: []
files_modified:
  - frontend/src/index.css
  - frontend/src/providers/ThemeProvider.tsx
  - frontend/src/components/Layout.tsx
  - frontend/src/App.tsx
autonomous: true
must_haves:
  truths:
    - "User can toggle between light and dark themes via header button"
    - "System preference is auto-detected when theme is set to 'system'"
    - "Theme preference persists across page reloads via localStorage"
    - "Dark mode displays Sepasoft-compatible dark color palette"
  artifacts:
    - "frontend/src/providers/ThemeProvider.tsx exists with ThemeProvider and useTheme exports"
    - "frontend/src/index.css contains .dark class with dark theme variables"
    - "frontend/src/components/Layout.tsx contains theme toggle button"
    - "TypeScript compiles without errors"
  key_links:
    - "ThemeProvider wraps app in App.tsx"
    - "Layout.tsx consumes useTheme hook"
    - "CSS variables override in .dark class"
---

# Phase 2 Medium Priority - Plan 2: Dark Mode Infrastructure

## Objective
Implement dark mode theming with ThemeProvider context, CSS variable overrides, header toggle, and system preference detection.

## Tasks

<task type="auto">
  <name>Task 1: Add Dark Theme CSS Variables</name>
  <files>frontend/src/index.css</files>
  <action>
    Add dark theme CSS variables to index.css. Place after the @theme block and base styles.

    Add the following dark theme definition (after the body styles, before .bg-card):
    ```css
    /* Dark theme overrides */
    .dark {
      /* Base - Dark background with light text */
      --color-background: hsl(220 15% 10%);
      --color-foreground: hsl(0 0% 95%);

      /* Card surfaces - Elevated dark */
      --color-card: hsl(220 15% 13%);
      --color-card-foreground: hsl(0 0% 95%);
      --color-popover: hsl(220 15% 15%);
      --color-popover-foreground: hsl(0 0% 95%);

      /* Primary - Brightened Sepasoft Blue */
      --color-primary: hsl(212 100% 50%);
      --color-primary-foreground: hsl(0 0% 100%);

      /* Secondary - Dark elevated */
      --color-secondary: hsl(220 10% 18%);
      --color-secondary-foreground: hsl(0 0% 90%);

      /* Muted - Subtle dark */
      --color-muted: hsl(220 10% 20%);
      --color-muted-foreground: hsl(220 5% 60%);

      /* Accent - Brightened Sepasoft Teal */
      --color-accent: hsl(179 55% 65%);
      --color-accent-foreground: hsl(220 15% 10%);

      /* Semantic colors - Brightened for dark mode */
      --color-destructive: hsl(357 85% 60%);
      --color-destructive-foreground: hsl(0 0% 100%);
      --color-warning: hsl(32 70% 55%);
      --color-success: hsl(104 60% 50%);

      /* Borders and inputs */
      --color-border: hsl(220 10% 20%);
      --color-input: hsl(220 10% 18%);
      --color-ring: hsl(212 100% 50% / 0.4);

      /* SPC Zone colors - Brightened for dark mode */
      --color-zone-c: hsl(104 60% 50%);
      --color-zone-b: hsl(48 100% 55%);
      --color-zone-a: hsl(32 70% 55%);
      --color-violation: hsl(357 85% 60%);

      /* Chart colors - Brightened */
      --color-chart-primary: hsl(212 100% 55%);
      --color-chart-secondary: hsl(179 55% 65%);
      --color-chart-tertiary: hsl(248 40% 70%);
      --color-chart-quaternary: hsl(32 70% 55%);
    }

    /* Dark mode body background */
    .dark body {
      background: linear-gradient(145deg, hsl(220 15% 8%) 0%, hsl(220 18% 10%) 50%, hsl(220 15% 9%) 100%);
    }

    /* Dark mode card styling */
    .dark .bg-card {
      background: hsl(220 15% 13%);
      border-color: hsl(220 10% 18%);
    }

    /* Dark mode popover styling */
    .dark .bg-popover {
      background: hsl(220 15% 15%);
      border-color: hsl(220 10% 20%);
    }

    /* Dark mode input styling */
    .dark input, .dark select, .dark textarea {
      background: hsl(220 10% 15%);
      border-color: hsl(220 10% 22%);
    }

    .dark input:hover, .dark select:hover, .dark textarea:hover {
      border-color: hsl(220 10% 30%);
    }

    .dark input:focus, .dark select:focus, .dark textarea:focus {
      background: hsl(220 10% 17%);
      border-color: hsl(212 100% 50%);
      box-shadow: 0 0 0 3px hsl(212 100% 50% / 0.2);
    }

    /* Dark mode scrollbar */
    .dark ::-webkit-scrollbar-thumb {
      background: hsl(220 10% 35% / 0.5);
    }

    .dark ::-webkit-scrollbar-thumb:hover {
      background: hsl(220 10% 45% / 0.6);
    }

    /* Theme transition */
    html {
      transition: background-color 200ms ease, color 200ms ease;
    }
    ```

    Constraints:
    - Place dark theme overrides after @theme block
    - Maintain all Sepasoft brand alignment
    - Ensure sufficient contrast ratios
  </action>
  <verify>
    ```powershell
    # Check dark class exists
    Select-String -Path "frontend/src/index.css" -Pattern "^\.dark \{"
    # Check dark background variable
    Select-String -Path "frontend/src/index.css" -Pattern "--color-background: hsl\(220"
    ```
  </verify>
  <done>
    - .dark class with all color variable overrides added
    - Dark mode body background gradient defined
    - Dark mode input/card/popover styles defined
    - Theme transition added
  </done>
</task>

<task type="auto">
  <name>Task 2: Create ThemeProvider Component</name>
  <files>frontend/src/providers/ThemeProvider.tsx</files>
  <action>
    Create a new ThemeProvider component at frontend/src/providers/ThemeProvider.tsx:

    ```tsx
    import { createContext, useContext, useEffect, useState, ReactNode } from 'react'

    type Theme = 'light' | 'dark' | 'system'

    interface ThemeContextValue {
      theme: Theme
      setTheme: (theme: Theme) => void
      resolvedTheme: 'light' | 'dark'
    }

    const ThemeContext = createContext<ThemeContextValue | null>(null)

    const STORAGE_KEY = 'openspc-theme'

    function getStoredTheme(): Theme {
      if (typeof window === 'undefined') return 'system'
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        return stored
      }
      return 'system'
    }

    function getSystemTheme(): 'light' | 'dark' {
      if (typeof window === 'undefined') return 'light'
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    }

    interface ThemeProviderProps {
      children: ReactNode
    }

    export function ThemeProvider({ children }: ThemeProviderProps) {
      const [theme, setThemeState] = useState<Theme>(getStoredTheme)
      const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(
        theme === 'system' ? getSystemTheme() : theme
      )

      const setTheme = (newTheme: Theme) => {
        setThemeState(newTheme)
        localStorage.setItem(STORAGE_KEY, newTheme)
      }

      // Apply theme to document
      useEffect(() => {
        const root = document.documentElement
        const resolved = theme === 'system' ? getSystemTheme() : theme
        setResolvedTheme(resolved)

        if (resolved === 'dark') {
          root.classList.add('dark')
        } else {
          root.classList.remove('dark')
        }
      }, [theme])

      // Listen for system theme changes when in 'system' mode
      useEffect(() => {
        if (theme !== 'system') return

        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

        const handleChange = (e: MediaQueryListEvent) => {
          const newResolved = e.matches ? 'dark' : 'light'
          setResolvedTheme(newResolved)
          document.documentElement.classList.toggle('dark', e.matches)
        }

        mediaQuery.addEventListener('change', handleChange)
        return () => mediaQuery.removeEventListener('change', handleChange)
      }, [theme])

      return (
        <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>
          {children}
        </ThemeContext.Provider>
      )
    }

    export function useTheme() {
      const context = useContext(ThemeContext)
      if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider')
      }
      return context
    }
    ```

    Constraints:
    - Export both ThemeProvider and useTheme
    - Handle SSR-safe checks (typeof window)
    - Persist to localStorage with key 'openspc-theme'
    - Support system preference detection
  </action>
  <verify>
    ```powershell
    # Check file exists and has exports
    Test-Path "C:/Users/djbra/Projects/SPC-client/frontend/src/providers/ThemeProvider.tsx"
    Select-String -Path "frontend/src/providers/ThemeProvider.tsx" -Pattern "export function ThemeProvider"
    Select-String -Path "frontend/src/providers/ThemeProvider.tsx" -Pattern "export function useTheme"
    # TypeScript check
    cd C:/Users/djbra/Projects/SPC-client/frontend && npx tsc --noEmit
    ```
  </verify>
  <done>
    - ThemeProvider component created
    - useTheme hook exported
    - localStorage persistence implemented
    - System preference detection working
    - TypeScript compiles successfully
  </done>
</task>

<task type="auto">
  <name>Task 3: Add Theme Toggle and Integrate Provider</name>
  <files>frontend/src/components/Layout.tsx, frontend/src/App.tsx</files>
  <action>
    1. Update Layout.tsx to add theme toggle button in the header:

    Add import at top:
    ```tsx
    import { Sun, Moon, Monitor } from 'lucide-react'
    import { useTheme } from '@/providers/ThemeProvider'
    ```

    Add inside the Layout component, before the return:
    ```tsx
    const { theme, setTheme, resolvedTheme } = useTheme()

    const cycleTheme = () => {
      const themes: Array<'light' | 'dark' | 'system'> = ['light', 'dark', 'system']
      const currentIndex = themes.indexOf(theme)
      const nextIndex = (currentIndex + 1) % themes.length
      setTheme(themes[nextIndex])
    }

    const getThemeIcon = () => {
      if (theme === 'system') return <Monitor className="h-4 w-4" />
      if (theme === 'dark') return <Moon className="h-4 w-4" />
      return <Sun className="h-4 w-4" />
    }

    const getThemeLabel = () => {
      if (theme === 'system') return 'System'
      if (theme === 'dark') return 'Dark'
      return 'Light'
    }
    ```

    Add the toggle button in the header, before the "Plant: Demo Plant" span, inside the right-side flex container:
    ```tsx
    <button
      onClick={cycleTheme}
      className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      title={`Theme: ${getThemeLabel()}`}
    >
      {getThemeIcon()}
      <span className="hidden sm:inline">{getThemeLabel()}</span>
    </button>
    ```

    2. Update App.tsx to wrap with ThemeProvider:

    Add import:
    ```tsx
    import { ThemeProvider } from '@/providers/ThemeProvider'
    ```

    Wrap the entire app with ThemeProvider (outside QueryClientProvider):
    ```tsx
    function App() {
      return (
        <ThemeProvider>
          <QueryClientProvider client={queryClient}>
            ...
          </QueryClientProvider>
        </ThemeProvider>
      )
    }
    ```

    Constraints:
    - ThemeProvider should be outermost wrapper
    - Toggle button should be visually consistent with nav links
    - Show icon always, label only on sm+ screens
  </action>
  <verify>
    ```powershell
    # Check Layout has theme imports
    Select-String -Path "frontend/src/components/Layout.tsx" -Pattern "import.*useTheme"
    Select-String -Path "frontend/src/components/Layout.tsx" -Pattern "cycleTheme"
    # Check App has ThemeProvider
    Select-String -Path "frontend/src/App.tsx" -Pattern "import.*ThemeProvider"
    Select-String -Path "frontend/src/App.tsx" -Pattern "<ThemeProvider>"
    # TypeScript check
    cd C:/Users/djbra/Projects/SPC-client/frontend && npx tsc --noEmit
    ```
  </verify>
  <done>
    - Theme toggle button added to Layout header
    - Cycles through light -> dark -> system
    - ThemeProvider wraps App
    - TypeScript compiles successfully
  </done>
</task>

## Completion Criteria

Plan is complete when:
- [ ] All tasks marked done
- [ ] All verify commands pass
- [ ] Theme toggle visible in header
- [ ] Dark mode applies correct color palette
- [ ] System preference detection works
- [ ] Preference persists across reloads
- [ ] Atomic commit created
- [ ] SUMMARY.md updated
