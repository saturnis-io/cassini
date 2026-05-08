#!/usr/bin/env node
/**
 * Prepare the feature-tour test database BEFORE Playwright's webServer
 * starts. Avoids the race where uvicorn opens an empty DB and crashes.
 *
 * Sequence:
 *  1. Delete any existing test-feature-tour.db
 *  2. Run alembic upgrade head against test-feature-tour.db
 *  3. Run seed_e2e_unified.py --profile feature-tour
 *  4. Verify feature-tour-manifest.json exists
 *
 * Called by `pnpm test:feature-tour` before `playwright test`.
 */
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BACKEND_DIR = path.resolve(__dirname, '../../../backend')
const TEST_DB = path.join(BACKEND_DIR, 'test-feature-tour.db')
const MANIFEST = path.join(BACKEND_DIR, 'feature-tour-manifest.json')

function log(msg) {
  console.log(`[prepare-db] ${msg}`)
}

function run(cmd, env = {}) {
  return execSync(cmd, {
    cwd: BACKEND_DIR,
    env: { ...process.env, ...env },
    stdio: 'inherit',
    timeout: 240000,
  })
}

async function main() {
  log(`Backend: ${BACKEND_DIR}`)
  log(`Target DB: ${TEST_DB}`)

  if (fs.existsSync(TEST_DB)) {
    try {
      fs.unlinkSync(TEST_DB)
      log('Deleted existing test-feature-tour.db')
    } catch {
      log('DB locked, resetting in-place...')
      run(`python scripts/reset_e2e_db.py "${TEST_DB}"`)
    }
  }
  if (fs.existsSync(MANIFEST)) {
    fs.unlinkSync(MANIFEST)
  }

  log('Running alembic upgrade head...')
  run('python -m alembic upgrade head', {
    CASSINI_DATABASE_URL: 'sqlite+aiosqlite:///./test-feature-tour.db',
  })

  if (!fs.existsSync(TEST_DB)) {
    throw new Error(`test-feature-tour.db NOT created after migrations`)
  }
  log(`Migrations done (${fs.statSync(TEST_DB).size} bytes)`)

  log('Seeding feature-tour profile...')
  const sqliteUrl = `sqlite+aiosqlite:///${TEST_DB.replace(/\\/g, '/')}`
  run(
    `python scripts/seed_e2e_unified.py --db-url "${sqliteUrl}" --manifest "${MANIFEST}" --profile feature-tour`,
  )

  if (!fs.existsSync(MANIFEST)) {
    throw new Error('feature-tour-manifest.json NOT created after seed')
  }

  // Cassini's signature engine refuses to start if signatures exist but
  // no .signature_key file is present (21 CFR Part 11 §11.10(e)
  // compliance). Generate a deterministic test key so uvicorn boots.
  // The cassini package may be installed in editable mode from outside
  // the worktree, so the runtime data dir is computed from __file__ of
  // the installed package (not the worktree's backend dir). Resolve it
  // by introspecting the python package and write the key there.
  const { randomBytes } = await import('node:crypto')
  const key = randomBytes(32).toString('base64')

  // Ask Python where the package thinks the data dir is.
  let runtimeDataDir
  try {
    runtimeDataDir = execSync(
      'python -c "from cassini.core.config import get_data_dir; print(get_data_dir())"',
      { cwd: BACKEND_DIR, encoding: 'utf8' },
    ).trim()
  } catch (err) {
    log(`WARN: could not resolve runtime data dir: ${err.message}`)
    runtimeDataDir = path.join(BACKEND_DIR, 'data')
  }
  log(`Runtime data dir: ${runtimeDataDir}`)
  if (!fs.existsSync(runtimeDataDir)) {
    fs.mkdirSync(runtimeDataDir, { recursive: true })
  }
  const runtimeKeyPath = path.join(runtimeDataDir, '.signature_key')
  if (!fs.existsSync(runtimeKeyPath)) {
    fs.writeFileSync(runtimeKeyPath, key, { mode: 0o600 })
    log(`Generated .signature_key at ${runtimeKeyPath}`)
  }
  // Also drop one in the worktree's data dir for tests that check there.
  const worktreeDataDir = path.join(BACKEND_DIR, 'data')
  if (!fs.existsSync(worktreeDataDir)) {
    fs.mkdirSync(worktreeDataDir, { recursive: true })
  }
  const worktreeKeyPath = path.join(worktreeDataDir, '.signature_key')
  if (!fs.existsSync(worktreeKeyPath)) {
    fs.writeFileSync(worktreeKeyPath, key, { mode: 0o600 })
  }

  log('Setup complete')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
