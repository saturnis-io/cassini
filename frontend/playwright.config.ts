import { defineConfig, devices } from '@playwright/test'

const isCI = !!process.env.CI

// Resolve database URL based on E2E_DB_DIALECT env var
const dbDialect = process.env.E2E_DB_DIALECT
const dbUrlMap: Record<string, string> = {
  postgresql: 'postgresql+asyncpg://cassini:cassini@localhost:5432/cassini_test',
  mysql: 'mysql+aiomysql://cassini:cassini@localhost:3306/cassini_test',
  mssql: 'mssql+aioodbc://sa:CassiniTest1!@localhost:1433/cassini_test',
}
const cassiniDbUrl =
  dbDialect && dbUrlMap[dbDialect]
    ? dbUrlMap[dbDialect]
    : 'sqlite+aiosqlite:///./test-e2e.db'

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  forbidOnly: isCI,
  retries: 1,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: 'http://localhost:5174',
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
      command: `cmd /c "cd /d C:\\Users\\djbra\\Projects\\saturnis\\apps\\cassini\\backend && set CASSINI_DATABASE_URL=${cassiniDbUrl}&& set CASSINI_DEV_MODE=true&& set CASSINI_DEV_COMMERCIAL=true&& set CASSINI_SANDBOX=true&& set CASSINI_ADMIN_PASSWORD=admin&& python -m uvicorn cassini.main:app --port 8001"`,
      port: 8001,
      timeout: 60000,
      reuseExistingServer: !isCI,
    },
    {
      command: 'cmd /c "set VITE_BACKEND_PORT=8001&& npx vite --port 5174"',
      port: 5174,
      timeout: 15000,
      reuseExistingServer: !isCI,
    },
  ],
})
