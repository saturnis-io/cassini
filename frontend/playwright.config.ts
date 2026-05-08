import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const isCI = !!process.env.CI
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const backendDir = path.resolve(__dirname, '..', 'backend')

const dbDialect = process.env.E2E_DB_DIALECT
const dbUrlMap: Record<string, string> = {
  postgresql: 'postgresql+asyncpg://cassini:cassini@localhost:5432/cassini_test',
  mysql: 'mysql+aiomysql://cassini:cassini@localhost:3306/cassini_test',
  mssql: 'mssql+aioodbc://sa:CassiniTest1!@localhost:1433/cassini_test',
}
// When the feature-highlight project is active, point uvicorn at the
// feature-tour SQLite database so the seeded plants/chars are visible.
// Detection: PLAYWRIGHT_PROFILE=feature-tour env var (set by the npm
// script `test:feature-tour`) OR `--project=feature-highlight` in argv
// (covers manual invocations).
const isFeatureHighlight =
  process.env.PLAYWRIGHT_PROFILE === 'feature-tour' ||
  process.argv.some((arg) => arg.includes('feature-highlight'))
const cassiniDbUrl =
  dbDialect && dbUrlMap[dbDialect]
    ? dbUrlMap[dbDialect]
    : isFeatureHighlight
      ? 'sqlite+aiosqlite:///./test-feature-tour.db'
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
    {
      // The feature-highlight project walks CATALOG.md against the
      // feature-tour seed, capturing every P0 (and stubbing P1/P2)
      // UI state described in apps/cassini/docs/feature-audit/.
      // Uses its own globalSetup that runs the feature-tour seed
      // profile — does NOT share state with the screenshot-tour
      // / functional projects.
      name: 'feature-highlight',
      testDir: './e2e/feature-highlight',
      testMatch: '*.spec.ts',
      // Override the top-level globalSetup so this project seeds the
      // feature-tour profile rather than the default e2e fixtures.
      // Playwright's CLI uses the top-level globalSetup; per-project
      // globalSetup is honored when the project is run alone via
      // `--project=feature-highlight`.
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
      },
      metadata: { profile: 'feature-tour' },
    },
  ],

  webServer: [
    {
      command: 'python -m uvicorn cassini.main:app --port 8001',
      cwd: backendDir,
      env: {
        CASSINI_DATABASE_URL: cassiniDbUrl,
        CASSINI_ENVIRONMENT: 'development',
        CASSINI_ENABLE_DEV_TIER_OVERRIDE: '1',
        CASSINI_DEV_MODE: 'true',
        CASSINI_DEV_TIER: 'enterprise',
        CASSINI_SANDBOX: 'true',
        CASSINI_ADMIN_PASSWORD: 'admin',
      },
      port: 8001,
      timeout: 60000,
      reuseExistingServer: !isCI,
    },
    {
      command: 'npx vite --port 5174',
      env: {
        VITE_BACKEND_PORT: '8001',
      },
      port: 5174,
      timeout: 15000,
      reuseExistingServer: !isCI,
    },
  ],
})
