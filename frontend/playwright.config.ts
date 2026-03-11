import { defineConfig, devices } from '@playwright/test'

const isCI = !!process.env.CI

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  forbidOnly: isCI,
  retries: 1,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: 'http://localhost:5173',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'screenshot-tour',
      testMatch: 'screenshot-tour.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: 'functional',
      testIgnore: [
        'screenshot-tour.spec.ts',
        'license-flow.spec.ts',
      ],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'multi-db-pg',
      testIgnore: [
        'screenshot-tour.spec.ts',
        'license-flow.spec.ts',
      ],
      use: { ...devices['Desktop Chrome'] },
      metadata: { dbDialect: 'postgresql' },
    },
    {
      name: 'multi-db-mysql',
      testIgnore: [
        'screenshot-tour.spec.ts',
        'license-flow.spec.ts',
      ],
      use: { ...devices['Desktop Chrome'] },
      metadata: { dbDialect: 'mysql' },
    },
    {
      name: 'multi-db-mssql',
      testIgnore: [
        'screenshot-tour.spec.ts',
        'license-flow.spec.ts',
      ],
      use: { ...devices['Desktop Chrome'] },
      metadata: { dbDialect: 'mssql' },
    },
    {
      name: 'license-flow',
      testMatch: 'license-flow.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: [
    {
      command:
        'cmd /c "cd /d C:\\Users\\djbra\\Projects\\saturnis\\apps\\cassini\\backend && set CASSINI_DATABASE_URL=sqlite+aiosqlite:///./test-e2e.db&& set CASSINI_DEV_MODE=true&& set CASSINI_DEV_COMMERCIAL=true&& set CASSINI_SANDBOX=true&& set CASSINI_ADMIN_PASSWORD=admin&& python -m uvicorn cassini.main:app --port 8000"',
      port: 8000,
      timeout: 60000,
      reuseExistingServer: !isCI,
    },
    {
      command: 'npm run dev',
      port: 5173,
      timeout: 15000,
      reuseExistingServer: !isCI,
    },
  ],
})
