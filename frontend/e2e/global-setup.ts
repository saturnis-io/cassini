import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import type { FullConfig } from '@playwright/test'

const BACKEND_DIR = path.resolve(process.cwd(), '../backend')
const TEST_DB = path.join(BACKEND_DIR, 'test-e2e.db')
const MANIFEST = path.join(BACKEND_DIR, 'e2e-manifest.json')

type DbDialect = 'postgresql' | 'mysql' | 'mssql'

/** Async driver URLs for the Cassini backend (SQLAlchemy async). */
const BACKEND_URL_MAP: Record<DbDialect, string> = {
  postgresql: 'postgresql+asyncpg://cassini:cassini@localhost:5432/cassini_test',
  mysql: 'mysql+aiomysql://cassini:cassini@localhost:3306/cassini_test',
  mssql: 'mssql+aioodbc://sa:CassiniTest1!@localhost:1433/cassini_test',
}

/** Sync driver URLs for Alembic migrations. */
const ALEMBIC_URL_MAP: Record<DbDialect, string> = {
  postgresql: 'postgresql://cassini:cassini@localhost:5432/cassini_test',
  mysql: 'mysql://cassini:cassini@localhost:3306/cassini_test',
  mssql: 'mssql+pyodbc://sa:CassiniTest1!@localhost:1433/cassini_test?driver=ODBC+Driver+18+for+SQL+Server&TrustServerCertificate=yes',
}

/** Python one-liner connectivity checks per dialect. */
const CONNECTIVITY_CHECK: Record<DbDialect, string> = {
  postgresql: `python -c "import psycopg2; psycopg2.connect('host=localhost port=5432 dbname=cassini_test user=cassini password=cassini').close(); print('OK')"`,
  mysql: `python -c "import pymysql; pymysql.connect(host='localhost', port=3306, user='cassini', password='cassini', database='cassini_test').close(); print('OK')"`,
  mssql: `python -c "import pyodbc; pyodbc.connect('DRIVER={ODBC Driver 18 for SQL Server};SERVER=localhost,1433;DATABASE=cassini_test;UID=sa;PWD=CassiniTest1!;TrustServerCertificate=yes').close(); print('OK')"`,
}

function setupSQLite() {
  // Reset test DB so we start fresh
  if (fs.existsSync(TEST_DB)) {
    try {
      fs.unlinkSync(TEST_DB)
      console.log('[global-setup] Deleted existing test-e2e.db')
    } catch {
      // File locked by a running server (reuseExistingServer) — drop all tables in-place
      console.log('[global-setup] DB locked by running server, resetting in-place...')
      execSync(`python scripts/reset_e2e_db.py "${TEST_DB}"`, { cwd: BACKEND_DIR, stdio: 'pipe' })
      console.log('[global-setup] Tables dropped in-place')
    }
  }

  // Run alembic migrations to create a fresh schema
  console.log(`[global-setup] Running alembic upgrade head...`)
  try {
    execSync('python -m alembic upgrade head', {
      cwd: BACKEND_DIR,
      env: {
        ...process.env,
        CASSINI_DATABASE_URL: 'sqlite+aiosqlite:///./test-e2e.db',
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

function setupExternalDb(dialect: DbDialect) {
  const backendUrl = BACKEND_URL_MAP[dialect]
  const alembicUrl = ALEMBIC_URL_MAP[dialect]

  console.log(`[global-setup] Multi-DB mode: ${dialect}`)
  console.log(`[global-setup] Backend URL: ${backendUrl}`)

  // Step 1: Verify connectivity
  console.log(`[global-setup] Checking ${dialect} connectivity...`)
  try {
    execSync(CONNECTIVITY_CHECK[dialect], {
      cwd: BACKEND_DIR,
      stdio: 'pipe',
      timeout: 15000,
    })
    console.log(`[global-setup] ${dialect} connectivity OK`)
  } catch (err: unknown) {
    const error = err as { stderr?: Buffer; stdout?: Buffer }
    const stderr = error.stderr?.toString() ?? ''
    throw new Error(
      `[global-setup] Cannot connect to ${dialect} test database.\n` +
        `Is docker-compose running?\n` +
        `Connection error: ${stderr}`,
    )
  }

  // Step 2: Run Alembic migrations with the sync driver URL
  console.log(`[global-setup] Running alembic upgrade head against ${dialect}...`)
  try {
    execSync('python -m alembic upgrade head', {
      cwd: BACKEND_DIR,
      env: {
        ...process.env,
        CASSINI_DATABASE_URL: alembicUrl,
      },
      stdio: 'pipe',
      timeout: 120000,
    })
    console.log(`[global-setup] Migrations complete against ${dialect}`)
  } catch (err: unknown) {
    const error = err as { stderr?: Buffer; stdout?: Buffer }
    console.error(`[global-setup] Migration FAILED against ${dialect}!`)
    console.error(`stderr: ${error.stderr?.toString()}`)
    console.error(`stdout: ${error.stdout?.toString()}`)
    throw err
  }

  // Step 3: Seeding — skip for external DBs (seed_e2e.py only supports SQLite)
  console.warn(
    `[global-setup] WARNING: Skipping seed for ${dialect} — ` +
      `seed_e2e.py only supports direct SQLite insertion. ` +
      `API-based seeding for external DBs will be added later.`,
  )

  console.log(`[global-setup] Setup complete for ${dialect}`)
}

export default function globalSetup(config: FullConfig) {
  // Determine if any active project specifies a dbDialect
  const activeProject = config.projects.find((p) => p.metadata?.dbDialect)
  const dialect = activeProject?.metadata?.dbDialect as DbDialect | undefined

  if (dialect && BACKEND_URL_MAP[dialect]) {
    setupExternalDb(dialect)
  } else {
    setupSQLite()
  }
}
