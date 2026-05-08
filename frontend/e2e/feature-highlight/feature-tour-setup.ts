/**
 * Global setup for the feature-highlight Playwright project.
 *
 * Creates a clean SQLite database (or external DB if E2E_DB_DIALECT is
 * set) and seeds it with the feature-tour profile defined in
 * apps/cassini/backend/scripts/seed_feature_tour.py. The dataset
 * implements every "Seed needs" line in CATALOG.md.
 *
 * The feature-tour profile produces a much richer manifest than the
 * default profile — multi-plant, full RBAC, MSA/DOE/FAI fixtures, CEP
 * rules, SOP-RAG corpus, etc. Tests resolve fixture IDs from
 * `feature-tour-manifest.json` instead of `e2e-manifest.json` so the
 * feature-highlight project doesn't collide with screenshot-tour.
 */
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import type { FullConfig } from '@playwright/test'

const BACKEND_DIR = path.resolve(process.cwd(), '../backend')
const TEST_DB = path.join(BACKEND_DIR, 'test-feature-tour.db')
const MANIFEST = path.join(BACKEND_DIR, 'feature-tour-manifest.json')

type DbDialect = 'postgresql' | 'mysql' | 'mssql'

const BACKEND_URL_MAP: Record<DbDialect, string> = {
  postgresql: 'postgresql+asyncpg://cassini:cassini@localhost:5432/cassini_feature_tour',
  mysql: 'mysql+aiomysql://cassini:cassini@localhost:3306/cassini_feature_tour',
  mssql: 'mssql+aioodbc://sa:CassiniTest1!@localhost:1433/cassini_feature_tour',
}

function setupSQLite() {
  if (fs.existsSync(TEST_DB)) {
    try {
      fs.unlinkSync(TEST_DB)
      console.log('[feature-tour-setup] Deleted existing test-feature-tour.db')
    } catch {
      console.log('[feature-tour-setup] DB locked, resetting in-place...')
      execSync(`python scripts/reset_e2e_db.py "${TEST_DB}"`, {
        cwd: BACKEND_DIR,
        stdio: 'pipe',
      })
    }
  }
  if (fs.existsSync(MANIFEST)) {
    fs.unlinkSync(MANIFEST)
  }

  console.log('[feature-tour-setup] Running alembic upgrade head...')
  try {
    execSync('python -m alembic upgrade head', {
      cwd: BACKEND_DIR,
      env: {
        ...process.env,
        CASSINI_DATABASE_URL: `sqlite+aiosqlite:///./test-feature-tour.db`,
      },
      stdio: 'pipe',
    })
  } catch (err: unknown) {
    const error = err as { stderr?: Buffer; stdout?: Buffer }
    console.error('[feature-tour-setup] Migration FAILED!')
    console.error(`stderr: ${error.stderr?.toString()}`)
    console.error(`stdout: ${error.stdout?.toString()}`)
    throw err
  }

  if (!fs.existsSync(TEST_DB)) {
    throw new Error('[feature-tour-setup] test-feature-tour.db was NOT created!')
  }
  console.log(
    `[feature-tour-setup] Migrations complete (${fs.statSync(TEST_DB).size} bytes)`,
  )

  console.log('[feature-tour-setup] Seeding feature-tour profile...')
  const sqliteUrl = `sqlite+aiosqlite:///${TEST_DB.replace(/\\/g, '/')}`
  try {
    const output = execSync(
      `python scripts/seed_e2e_unified.py --db-url "${sqliteUrl}" --manifest "${MANIFEST}" --profile feature-tour`,
      {
        cwd: BACKEND_DIR,
        env: { ...process.env },
        stdio: 'pipe',
        timeout: 240000,
      },
    )
    console.log(`[feature-tour-setup] ${output.toString().trim()}`)
  } catch (err: unknown) {
    const error = err as { stderr?: Buffer; stdout?: Buffer }
    console.error('[feature-tour-setup] Seed FAILED!')
    console.error(`stderr: ${error.stderr?.toString()}`)
    console.error(`stdout: ${error.stdout?.toString()}`)
    throw err
  }

  if (!fs.existsSync(MANIFEST)) {
    throw new Error('[feature-tour-setup] feature-tour-manifest.json NOT created!')
  }
  console.log('[feature-tour-setup] Setup complete')
}

function setupExternalDb(dialect: DbDialect) {
  const backendUrl = BACKEND_URL_MAP[dialect]
  console.log(`[feature-tour-setup] External DB mode: ${dialect}`)
  console.log(`[feature-tour-setup] Backend URL: ${backendUrl}`)

  if (fs.existsSync(MANIFEST)) {
    console.log(
      `[feature-tour-setup] Manifest already exists — skipping migration & seed for ${dialect}`,
    )
    return
  }

  console.log(`[feature-tour-setup] Running alembic upgrade head against ${dialect}...`)
  execSync('python -m alembic upgrade head', {
    cwd: BACKEND_DIR,
    env: { ...process.env, CASSINI_DATABASE_URL: backendUrl },
    stdio: 'pipe',
    timeout: 120000,
  })

  console.log(`[feature-tour-setup] Seeding feature-tour against ${dialect}...`)
  execSync(
    `python scripts/seed_e2e_unified.py --db-url "${backendUrl}" --manifest "${MANIFEST}" --profile feature-tour`,
    {
      cwd: BACKEND_DIR,
      env: { ...process.env },
      stdio: 'pipe',
      timeout: 240000,
    },
  )
}

export default function featureTourSetup(_config: FullConfig) {
  const dialect = process.env.E2E_DB_DIALECT as DbDialect | undefined
  // If the DB and manifest already exist (prepare-db.mjs ran), skip
  // re-creation. This is the normal path — `pnpm test:feature-tour`
  // runs prepare-db first, then Playwright. globalSetup just verifies.
  if (fs.existsSync(MANIFEST) && fs.existsSync(TEST_DB)) {
    console.log(
      `[feature-tour-setup] DB + manifest already exist — skipping re-seed`,
    )
    return
  }
  if (dialect && BACKEND_URL_MAP[dialect]) {
    setupExternalDb(dialect)
  } else {
    setupSQLite()
  }
}
