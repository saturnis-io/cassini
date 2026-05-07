/**
 * Capture README screenshots from the live app.
 *
 * Pre-reqs: backend on :8001 with CASSINI_DEV_TIER=enterprise + ANTHROPIC_API_KEY,
 * Vite dev on :5174, admin/admin seeded.
 *
 * Output: apps/cassini/docs/screenshots/{section}/{name}.png
 */
import { chromium } from '@playwright/test'
import { writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const BASE = 'http://127.0.0.1:5174'
const OUT = path.resolve('../docs/screenshots')

function out(section, name) {
  const dir = path.join(OUT, section)
  mkdirSync(dir, { recursive: true })
  return path.join(dir, `${name}.png`)
}

async function loginAndPickPlant(page) {
  await page.goto('/login', { waitUntil: 'networkidle' })
  await page.locator('#username').fill('admin')
  await page.locator('#password').fill('admin')
  await page.getByRole('button', { name: 'Log In', exact: true }).click()
  await page.waitForURL('**/dashboard', { timeout: 20000 })

  const plantId = await page.evaluate(async () => {
    const r = await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' })
    const { access_token } = await r.json()
    const pr = await fetch('/api/v1/plants/', {
      headers: { Authorization: `Bearer ${access_token}` },
    })
    const plants = await pr.json()
    // Prefer "Showcase" or "Dashboard Plant" if present, else first.
    return (
      plants.find((p) => /showcase/i.test(p.name))?.id ||
      plants.find((p) => /dashboard/i.test(p.name))?.id ||
      plants[0]?.id
    )
  })
  await page.evaluate((id) => {
    const raw = localStorage.getItem('cassini-ui')
    const store = raw ? JSON.parse(raw) : { state: {}, version: 0 }
    store.state = store.state || {}
    store.state.selectedPlantId = id
    localStorage.setItem('cassini-ui', JSON.stringify(store))
  }, plantId)
  await page.reload({ waitUntil: 'networkidle' })
}

async function shoot(page, file, opts = {}) {
  await page.waitForTimeout(opts.wait ?? 600)
  await page.screenshot({ path: file, fullPage: opts.fullPage ?? false })
  console.log(`shot ${file}`)
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({
    baseURL: BASE,
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 1.5, // retina-style for crisp screenshots
  })
  const page = await ctx.newPage()

  page.on('pageerror', (err) => console.error('PAGE ERROR:', err.message))

  // 1. Login page (clean, before auth)
  await page.goto('/login', { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  await shoot(page, out('core', 'login'), { wait: 800 })

  // 2-N. Authenticate, pick plant, then visit pages
  await loginAndPickPlant(page)

  // Dashboard — hero shot
  await page.goto('/dashboard', { waitUntil: 'networkidle' })
  await page.waitForTimeout(2500) // chart render
  await shoot(page, out('core', 'dashboard'), { wait: 1500 })
  await shoot(page, out('core', 'hero'), { wait: 200, fullPage: false })

  // Violations
  await page.goto('/violations', { waitUntil: 'networkidle' })
  await shoot(page, out('core', 'violations'), { wait: 1200 })

  // Data entry
  await page.goto('/data-entry', { waitUntil: 'networkidle' })
  await shoot(page, out('core', 'data-entry'), { wait: 1200 })

  // Reports
  await page.goto('/reports', { waitUntil: 'networkidle' })
  await shoot(page, out('core', 'reports'), { wait: 1200 })

  // Connectivity
  await page.goto('/connectivity', { waitUntil: 'networkidle' })
  await shoot(page, out('connectivity', 'connectivity'), { wait: 1200 })

  // Configuration / hierarchy
  await page.goto('/configuration', { waitUntil: 'networkidle' })
  await shoot(page, out('core', 'configuration'), { wait: 1200 })

  // Lakehouse (Pro)
  await page.goto('/lakehouse', { waitUntil: 'networkidle' })
  await shoot(page, out('features', 'lakehouse'), { wait: 1500 })

  // CEP Rules (Enterprise)
  await page.goto('/cep-rules', { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  // Click "New Rule" so the Monaco editor mounts and the layout is shown
  try {
    await page.getByRole('button', { name: 'New Rule', exact: true }).click({ timeout: 3000 })
    await page.waitForSelector('.monaco-editor', { timeout: 10000 })
    await page.waitForTimeout(1500)
  } catch {
    // No "New Rule" button — fall through with whatever rendered
  }
  await shoot(page, out('features', 'cep-rules'), { wait: 1200 })

  // SOP-RAG (Enterprise)
  await page.goto('/sop-rag', { waitUntil: 'networkidle' })
  await shoot(page, out('features', 'sop-rag'), { wait: 1500 })

  // Galaxy / multi-plant compare (if present)
  try {
    await page.goto('/compare-plants', { waitUntil: 'networkidle', timeout: 10000 })
    await shoot(page, out('commercial', 'compare-plants'), { wait: 1500 })
  } catch {
    console.log('compare-plants page not available, skipping')
  }

  // MSA
  try {
    await page.goto('/msa', { waitUntil: 'networkidle', timeout: 10000 })
    await shoot(page, out('commercial', 'msa-overview'), { wait: 1500 })
  } catch {
    console.log('msa page not available, skipping')
  }

  // DOE
  try {
    await page.goto('/doe', { waitUntil: 'networkidle', timeout: 10000 })
    await shoot(page, out('commercial', 'doe-overview'), { wait: 1500 })
  } catch {
    console.log('doe page not available, skipping')
  }

  // FAI
  try {
    await page.goto('/fai', { waitUntil: 'networkidle', timeout: 10000 })
    await shoot(page, out('commercial', 'fai-overview'), { wait: 1500 })
  } catch {
    console.log('fai page not available, skipping')
  }

  // Settings — signatures sub-page (Enterprise)
  try {
    await page.goto('/settings', { waitUntil: 'networkidle', timeout: 10000 })
    await shoot(page, out('settings', 'settings-overview'), { wait: 1500 })
  } catch {
    console.log('settings page not available, skipping')
  }

  // Analytics
  try {
    await page.goto('/analytics', { waitUntil: 'networkidle', timeout: 10000 })
    await shoot(page, out('commercial', 'analytics-overview'), { wait: 1500 })
  } catch {
    console.log('analytics page not available, skipping')
  }

  console.log('\n=== Screenshot capture complete ===')

  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
