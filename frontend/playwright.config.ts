import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
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
      command: 'cmd /c "cd /d C:\\Users\\djbra\\Projects\\SPC-client\\backend && set OPENSPC_DATABASE_URL=sqlite+aiosqlite:///./test-e2e.db&& set OPENSPC_DEV_MODE=true&& set OPENSPC_SANDBOX=true&& set OPENSPC_ADMIN_PASSWORD=admin&& python -m alembic upgrade head && python -m uvicorn openspc.main:app --port 8000"',
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
