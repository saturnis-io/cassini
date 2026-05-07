/**
 * Standalone browser smoke for SOP-grounded RAG.
 *
 * Drives a real Chromium against an already-running Vite dev (5174) +
 * backend (8001). Exits 0 on success, non-zero on any check failure.
 *
 * Pre-reqs:
 *  - Backend on :8001 (CASSINI_DEV_TIER=enterprise + ANTHROPIC_API_KEY)
 *  - Vite dev on :5174 with VITE_BACKEND_PORT=8001
 *  - Admin user "admin/admin" seeded
 *  - At least one plant with admin role on it
 */
import { chromium } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const BASE = 'http://127.0.0.1:5174'
const SOP_TXT_PATH = path.join(tmpdir(), 'sop-rag-smoke-bolt.txt')

const SOP_CONTENT = `# Bolt torque procedure

[page 1]
Tighten the M6 bolt to 12 Nm using the calibrated torque wrench. Apply Loctite 243 to the threads before assembly. Verify torque after 24 hours of cure time.

[page 2]
After the cure period the operator must sign the inspection sheet in section 3-B. Operator ID is logged with timestamp.

[page 3]
Loctite 243 has a shelf life of 24 months from the manufacture date. Refrigerated storage extends this to 30 months.
`

function logStep(label) {
  console.log(`\n=== ${label} ===`)
}

function check(condition, msg) {
  if (!condition) {
    console.error(`FAIL: ${msg}`)
    process.exit(1)
  }
  console.log(`OK: ${msg}`)
}

async function main() {
  writeFileSync(SOP_TXT_PATH, SOP_CONTENT, 'utf-8')

  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({
    baseURL: BASE,
    viewport: { width: 1400, height: 900 },
  })
  const page = await ctx.newPage()

  // Capture console errors so we can surface them on failure.
  const consoleErrors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  page.on('pageerror', (err) => consoleErrors.push(`PAGE ERROR: ${err.message}`))

  try {
    logStep('Login as admin/admin')
    await page.goto('/login', { waitUntil: 'networkidle' })
    await page.locator('#username').fill('admin')
    await page.locator('#password').fill('admin')
    await page.getByRole('button', { name: 'Log In', exact: true }).click()
    await page.waitForURL('**/dashboard', { timeout: 20000 })
    check(page.url().includes('/dashboard'), 'redirected to /dashboard')

    logStep('Pick first plant via API → set in localStorage → reload')
    const plantId = await page.evaluate(async () => {
      const r = await fetch('/api/v1/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      })
      const { access_token } = await r.json()
      const pr = await fetch('/api/v1/plants/', {
        headers: { Authorization: `Bearer ${access_token}` },
      })
      const plants = await pr.json()
      return plants[0]?.id
    })
    check(typeof plantId === 'number', `resolved plant_id=${plantId}`)
    await page.evaluate((id) => {
      const raw = localStorage.getItem('cassini-ui')
      const store = raw ? JSON.parse(raw) : { state: {}, version: 0 }
      store.state = store.state || {}
      store.state.selectedPlantId = id
      localStorage.setItem('cassini-ui', JSON.stringify(store))
    }, plantId)
    await page.reload({ waitUntil: 'networkidle' })

    logStep('Navigate to /sop-rag')
    await page.goto('/sop-rag', { waitUntil: 'networkidle' })
    // Page must render Enterprise gate as PASS — no upgrade prompt.
    const upgradeVisible = await page
      .getByText(/upgrade to enterprise/i)
      .isVisible()
      .catch(() => false)
    check(!upgradeVisible, 'Enterprise gate passed (no upgrade prompt)')

    // Title + corpus pane visible.
    await page.getByText('SOP corpus', { exact: true }).waitFor({ timeout: 15000 })
    await page.getByText('Ask the SOP corpus', { exact: true }).waitFor({ timeout: 5000 })
    check(true, 'page rendered with corpus + ask panes')

    logStep('Upload TXT SOP via hidden file input')
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(SOP_TXT_PATH)

    // Wait for the doc to appear in the list with status ready (or failed).
    const docTitle = 'sop-rag-smoke-bolt' // filename minus extension
    const docRow = page.getByText(docTitle, { exact: true }).first()
    await docRow.waitFor({ timeout: 15000 })
    check(true, 'doc row appeared in corpus list')

    // Poll for "ready" badge — indexer runs in background.
    const ready = page.getByText('ready', { exact: true }).first()
    await ready.waitFor({ timeout: 30000 })
    check(true, 'doc reached status=ready (background indexer succeeded)')

    logStep('Submit query')
    const askInput = page.getByPlaceholder(/torque spec/i)
    await askInput.fill('What is the M6 bolt torque spec?')
    await page.getByRole('button', { name: 'Ask', exact: true }).click()

    // Wait for either an answer or refusal panel.
    const result = await Promise.race([
      page
        .locator('span[title*="Bolt torque"]')
        .first()
        .waitFor({ timeout: 60000 })
        .then(() => 'answer'),
      page
        .getByText('Citation lock refused')
        .waitFor({ timeout: 60000 })
        .then(() => 'refusal'),
    ])
    if (result === 'refusal') {
      const refusalText = await page
        .locator('text=Reason:')
        .locator('..')
        .innerText()
        .catch(() => 'unknown')
      check(false, `query was REFUSED — ${refusalText}`)
    }
    check(result === 'answer', 'cited answer rendered with at least one citation pill')

    logStep('Verify budget card updated')
    const budgetSection = page.getByText('Budget (this month)').first()
    await budgetSection.waitFor({ timeout: 5000 })
    const queryCountText = await page
      .locator('text=/\\d+ queries/')
      .first()
      .innerText()
    check(/[1-9]\d*\s+queries/.test(queryCountText), `budget shows queries: ${queryCountText}`)

    logStep('All smoke checks passed')
    if (consoleErrors.length > 0) {
      console.log('\nConsole errors observed (non-fatal):')
      consoleErrors.forEach((e) => console.log(`  - ${e}`))
    }
  } catch (err) {
    console.error('\nFAIL:', err.message)
    if (consoleErrors.length > 0) {
      console.log('\nConsole errors:')
      consoleErrors.forEach((e) => console.log(`  - ${e}`))
    }
    // Capture screenshot for debugging.
    const shotPath = path.join(tmpdir(), 'sop-rag-smoke-fail.png')
    await page.screenshot({ path: shotPath, fullPage: true }).catch(() => {})
    console.log(`Screenshot: ${shotPath}`)
    process.exit(1)
  } finally {
    await browser.close()
  }
}

main()
