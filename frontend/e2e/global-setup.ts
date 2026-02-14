import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

const BACKEND_DIR = path.resolve(process.cwd(), '../backend')
const TEST_DB = path.join(BACKEND_DIR, 'test-e2e.db')
const MANIFEST = path.join(BACKEND_DIR, 'e2e-manifest.json')

export default function globalSetup() {
  // Delete test DB if it exists so we start fresh
  if (fs.existsSync(TEST_DB)) {
    fs.unlinkSync(TEST_DB)
    console.log('[global-setup] Deleted existing test-e2e.db')
  }

  // Run alembic migrations to create a fresh schema
  console.log(`[global-setup] Running alembic upgrade head...`)
  try {
    execSync('python -m alembic upgrade head', {
      cwd: BACKEND_DIR,
      env: {
        ...process.env,
        OPENSPC_DATABASE_URL: 'sqlite+aiosqlite:///./test-e2e.db',
      },
      stdio: 'pipe',
    })
  } catch (err: unknown) {
    const error = err as { stderr?: Buffer; stdout?: Buffer }
    console.error(`[global-setup] Migration FAILED!`)
    console.error(`stderr: ${error.stderr?.toString()}`)
    console.error(`stdout: ${error.stdout?.toString()}`)
    throw err
  }

  // Verify DB was created
  if (!fs.existsSync(TEST_DB)) {
    throw new Error('[global-setup] test-e2e.db was NOT created after migrations!')
  }
  console.log(`[global-setup] Migrations complete (${fs.statSync(TEST_DB).size} bytes)`)

  // Seed test data directly into SQLite (no API calls, no throttling)
  console.log('[global-setup] Seeding test data...')
  try {
    const output = execSync(
      `python scripts/seed_e2e.py --db "${TEST_DB}" --manifest "${MANIFEST}"`,
      {
        cwd: BACKEND_DIR,
        env: { ...process.env },
        stdio: 'pipe',
      },
    )
    console.log(`[global-setup] ${output.toString().trim()}`)
  } catch (err: unknown) {
    const error = err as { stderr?: Buffer; stdout?: Buffer }
    console.error(`[global-setup] Seed FAILED!`)
    console.error(`stderr: ${error.stderr?.toString()}`)
    console.error(`stdout: ${error.stdout?.toString()}`)
    throw err
  }

  // Verify manifest was created
  if (!fs.existsSync(MANIFEST)) {
    throw new Error('[global-setup] e2e-manifest.json was NOT created after seeding!')
  }
  console.log('[global-setup] Setup complete')
}
