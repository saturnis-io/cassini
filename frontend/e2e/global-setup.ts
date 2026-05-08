import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import type { FullConfig } from '@playwright/test'
import featureTourSetup from './feature-highlight/feature-tour-setup'

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

/** Alembic migration URLs (async drivers — env.py uses async_engine_from_config). */
const ALEMBIC_URL_MAP: Record<DbDialect, string> = {
  postgresql:
    'postgresql+asyncpg://cassini:cassini@localhost:5432/cassini_test',
  mysql: 'mysql+aiomysql://cassini:cassini@localhost:3306/cassini_test',
  mssql: 'mssql+aioodbc://sa:CassiniTest1!@localhost:1433/cassini_test?driver=ODBC+Driver+18+for+SQL+Server&TrustServerCertificate=yes',
}

/** URLs passed to the unified seed script. The seed script accepts any
 *  SQLAlchemy URL (sync or async driver) and converts internally. We use
 *  the same async URLs as the backend to avoid divergence. */
const SEED_URL_MAP: Record<DbDialect, string> = {
  postgresql: 'postgresql+asyncpg://cassini:cassini@localhost:5432/cassini_test',
  mysql: 'mysql+aiomysql://cassini:cassini@localhost:3306/cassini_test',
  mssql: 'mssql+aioodbc://sa:CassiniTest1!@localhost:1433/cassini_test?driver=ODBC+Driver+18+for+SQL+Server&TrustServerCertificate=yes',
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

  // Seed test data via the dialect-agnostic unified seed script.
  console.log('[global-setup] Seeding test data via unified seed...')
  const sqliteUrl = `sqlite+aiosqlite:///${TEST_DB.replace(/\\/g, '/')}`
  try {
    const output = execSync(
      `python scripts/seed_e2e_unified.py --db-url "${sqliteUrl}" --manifest "${MANIFEST}"`,
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

  // If a manifest already exists, the database was pre-populated externally.
  // Skip migration and seeding to avoid duplicate-key errors.
  if (fs.existsSync(MANIFEST)) {
    console.log(
      `[global-setup] Manifest already exists — skipping migration & seed for ${dialect}`,
    )
    console.log(`[global-setup] Setup complete for ${dialect} (pre-populated)`)
    return
  }

  // Step 2: Run Alembic migrations with the async driver URL
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

  // Step 3: Seed test data via the dialect-agnostic unified seed script.
  const seedUrl = SEED_URL_MAP[dialect]
  console.log(`[global-setup] Seeding ${dialect} via seed_e2e_unified.py...`)
  try {
    const output = execSync(
      `python scripts/seed_e2e_unified.py --db-url "${seedUrl}" --manifest "${MANIFEST}"`,
      {
        cwd: BACKEND_DIR,
        env: { ...process.env },
        stdio: 'pipe',
        timeout: 120000,
      },
    )
    console.log(`[global-setup] ${output.toString().trim()}`)
  } catch (err: unknown) {
    const error = err as { stderr?: Buffer; stdout?: Buffer }
    console.error(`[global-setup] ${dialect} seed FAILED!`)
    console.error(`stderr: ${error.stderr?.toString()}`)
    console.error(`stdout: ${error.stdout?.toString()}`)
    throw err
  }

  console.log(`[global-setup] Setup complete for ${dialect}`)
}

export default function globalSetup(config: FullConfig) {
  // Playwright passes ALL projects to globalSetup, not just the active one.
  // Use the E2E_DB_DIALECT env var to select multi-DB mode explicitly.
  // Set it when running: E2E_DB_DIALECT=postgresql npx playwright test --project=multi-db-pg
  const dialect = process.env.E2E_DB_DIALECT as DbDialect | undefined

  // Feature-highlight project uses its own seed profile — detect via the
  // PLAYWRIGHT_PROFILE env var or `--project=feature-highlight` in argv,
  // and delegate to the dedicated setup that runs
  // `seed_e2e_unified.py --profile feature-tour`.
  const isFeatureHighlight =
    process.env.PLAYWRIGHT_PROFILE === 'feature-tour' ||
    process.argv.some((a) => a.includes('feature-highlight'))

  if (isFeatureHighlight) {
    console.log('[global-setup] Detected feature-highlight project — using feature-tour setup')
    featureTourSetup(config)
    return
  }
  console.log('[global-setup] Default setup path')

  if (dialect && BACKEND_URL_MAP[dialect]) {
    setupExternalDb(dialect)
  } else {
    setupSQLite()
  }
}
