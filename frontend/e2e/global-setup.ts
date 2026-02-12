import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

const BACKEND_DIR = path.resolve(process.cwd(), '../backend')
const TEST_DB = path.join(BACKEND_DIR, 'test-e2e.db')

export default function globalSetup() {
  // Delete test DB if it exists so we start fresh
  if (fs.existsSync(TEST_DB)) {
    fs.unlinkSync(TEST_DB)
    console.log('[global-setup] Deleted existing test-e2e.db')
  }

  // Run alembic migrations to create a fresh schema
  console.log(`[global-setup] Running alembic upgrade head in ${BACKEND_DIR}...`)
  try {
    const output = execSync('python -m alembic upgrade head', {
      cwd: BACKEND_DIR,
      env: {
        ...process.env,
        OPENSPC_DATABASE_URL: 'sqlite+aiosqlite:///./test-e2e.db',
      },
      stdio: 'pipe',
    })
    console.log(`[global-setup] Migrations output: ${output.toString()}`)
  } catch (err: unknown) {
    const error = err as { stderr?: Buffer; stdout?: Buffer }
    console.error(`[global-setup] Migration FAILED!`)
    console.error(`[global-setup] stderr: ${error.stderr?.toString()}`)
    console.error(`[global-setup] stdout: ${error.stdout?.toString()}`)
    throw err
  }

  // Verify DB was created
  if (fs.existsSync(TEST_DB)) {
    console.log(`[global-setup] test-e2e.db created successfully (${fs.statSync(TEST_DB).size} bytes)`)
  } else {
    throw new Error('[global-setup] test-e2e.db was NOT created after migrations!')
  }

  console.log('[global-setup] Migrations complete')
}
