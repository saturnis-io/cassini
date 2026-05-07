/**
 * Capture an SOP-RAG screenshot with a real cited answer rendered.
 * Reuses the existing test corpus from the smoke run; if absent, uploads.
 */
import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const BASE = 'http://127.0.0.1:5174'
const OUT = path.resolve('../docs/screenshots/features')
const TXT_PATH = path.join(tmpdir(), 'sop-screenshot-bolt.txt')
mkdirSync(OUT, { recursive: true })

writeFileSync(
  TXT_PATH,
  `# Bolt torque procedure

[page 1]
Tighten the M6 bolt to 12 Nm using the calibrated torque wrench. Apply Loctite 243 to the threads before assembly. Verify torque after 24 hours of cure time.

[page 2]
After the cure period the operator must sign the inspection sheet in section 3-B. Operator ID is logged with timestamp.
`,
  'utf-8',
)

async function login(page) {
  await page.goto('/login', { waitUntil: 'networkidle' })
  await page.locator('#username').fill('admin')
  await page.locator('#password').fill('admin')
  await page.getByRole('button', { name: 'Log In', exact: true }).click()
  await page.waitForURL('**/dashboard', { timeout: 20000 })
}

async function pickFirstPlant(page) {
  const plantId = await page.evaluate(async () => {
    const r = await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' })
    const { access_token } = await r.json()
    const pr = await fetch('/api/v1/plants/', {
      headers: { Authorization: `Bearer ${access_token}` },
    })
    const plants = await pr.json()
    return plants[0]?.id
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

async function main() {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({
    baseURL: BASE,
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 1.5,
  })
  const page = await ctx.newPage()

  await login(page)
  await pickFirstPlant(page)
  await page.goto('/sop-rag', { waitUntil: 'networkidle' })

  // Upload a doc if the corpus is empty.
  const empty = await page
    .getByText('No documents yet', { exact: false })
    .isVisible()
    .catch(() => false)
  if (empty) {
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(TXT_PATH)
    // Wait for status to reach "ready"
    await page.getByText('ready', { exact: true }).first().waitFor({ timeout: 30000 })
  }

  // Type a question and submit.
  const askInput = page.getByPlaceholder(/torque spec/i)
  await askInput.fill('What is the M6 bolt torque spec and when do I sign off?')
  await page.getByRole('button', { name: 'Ask', exact: true }).click()

  // Wait for citation pills to render.
  await page.locator('[data-ui="citation-pill"]').first().waitFor({ timeout: 60000 })
  await page.waitForTimeout(800) // settle

  await page.screenshot({ path: path.join(OUT, 'sop-rag.png'), fullPage: false })
  console.log('shot sop-rag with cited answer')

  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
