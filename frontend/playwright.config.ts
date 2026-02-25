import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
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
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: [
    {
      command:
        'cmd /c "cd /d C:\\Users\\djbra\\Projects\\SPC-client\\backend && set CASSINI_DATABASE_URL=sqlite+aiosqlite:///./test-e2e.db&& set CASSINI_DEV_MODE=true&& set CASSINI_SANDBOX=true&& set CASSINI_ADMIN_PASSWORD=admin&& python -m uvicorn cassini.main:app --port 8000"',
      port: 8000,
      timeout: 60000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run dev',
      port: 5173,
      timeout: 15000,
      reuseExistingServer: !process.env.CI,
    },
  ],
})
