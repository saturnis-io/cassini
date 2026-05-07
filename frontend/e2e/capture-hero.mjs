/**
 * Capture a high-impact dashboard hero with a real control chart visible.
 *
 * The seed_e2e fixture creates "Test Dept > Test Line > Test Station > Test Char"
 * inside Dashboard Plant with samples and limits set. We expand the tree, click
 * the characteristic, wait for the ECharts canvas to render, and shoot.
 */
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

const BASE = 'http://127.0.0.1:5174'
const OUT = path.resolve('../docs/screenshots')

function out(section, name) {
  const dir = path.join(OUT, section)
  mkdirSync(dir, { recursive: true })
  return path.join(dir, `${name}.png`)
}

async function login(page) {
  await page.goto('/login', { waitUntil: 'networkidle' })
  await page.locator('#username').fill('admin')
  await page.locator('#password').fill('admin')
  await page.getByRole('button', { name: 'Log In', exact: true }).click()
  await page.waitForURL('**/dashboard', { timeout: 20000 })
}

async function pickPlant(page, plantName) {
  const plantId = await page.evaluate(async (name) => {
    const r = await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' })
    const { access_token } = await r.json()
    const pr = await fetch('/api/v1/plants/', {
      headers: { Authorization: `Bearer ${access_token}` },
    })
    const plants = await pr.json()
    return plants.find((p) => p.name === name)?.id ?? plants[0]?.id
  }, plantName)
  await page.evaluate((id) => {
    const raw = localStorage.getItem('cassini-ui')
    const store = raw ? JSON.parse(raw) : { state: {}, version: 0 }
    store.state = store.state || {}
    store.state.selectedPlantId = id
    localStorage.setItem('cassini-ui', JSON.stringify(store))
  }, plantId)
  await page.reload({ waitUntil: 'networkidle' })
}

async function expandToTestChar(page) {
  // The sidebar tree shows the hierarchy with Test Dept at the root level.
  // Each parent node must be clicked to expand. After expansion, click the
  // leaf "Test Char" to load it into the chart panel.
  for (const name of ['Test Dept', 'Test Line', 'Test Station']) {
    const node = page.getByText(name, { exact: true }).first()
    await node.scrollIntoViewIfNeeded()
    await node.click({ force: true })
    await page.waitForTimeout(500)
  }
  const leaf = page.getByText('Test Char', { exact: true }).first()
  await leaf.scrollIntoViewIfNeeded()
  await leaf.click({ force: true })
  // Wait for the ECharts canvas to render at least one element.
  await page.waitForSelector('canvas', { timeout: 15000 })
  await page.waitForTimeout(2000) // chart settle
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
  await pickPlant(page, 'Dashboard Plant')

  await page.goto('/dashboard', { waitUntil: 'networkidle' })
  // Collapse the navigation section so the hierarchy tree is more visible.
  try {
    await page.getByRole('button', { name: 'Navigation', exact: true }).click({ timeout: 3000 })
    await page.waitForTimeout(300)
  } catch {
    // Navigation toggle not present — skip
  }
  await expandToTestChar(page)

  await page.screenshot({ path: out('core', 'dashboard'), fullPage: false })
  await page.screenshot({ path: out('core', 'hero'), fullPage: false })
  console.log('shot dashboard + hero with live chart')

  // Now Show Your Work — toggle and capture
  try {
    const showWork = page.getByRole('button', { name: /show work/i }).first()
    await showWork.click({ timeout: 3000 })
    await page.waitForTimeout(800)
    await page.screenshot({ path: out('core', 'show-your-work'), fullPage: false })
    console.log('shot show-your-work')
  } catch {
    console.log('show-your-work toggle not visible, skipped')
  }

  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
