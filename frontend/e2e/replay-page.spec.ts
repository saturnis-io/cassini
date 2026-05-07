/**
 * — Time-travel replay scrubber (Pro+ tier feature).
 *
 * The original `replay.spec.ts` covers the slider drag and exit flow.
 * This spec is the additional acceptance: the scrubber lives on
 * the chart detail page, fires a replay-snapshot fetch when the user
 * scrubs, and the banner toggles cleanly.
 *
 * Backend dev tier is enterprise so the page is fully reachable.
 */
import { test, expect } from './fixtures'
import { loginAsAdmin } from './helpers/auth'
import { getManifest } from './helpers/manifest'

test.describe('Replay Scrubber', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('scrubber renders + slider triggers fetch + banner toggles', async ({ page }) => {
    // Use the seed manifest to pre-select a characteristic that has samples.
    // The `dashboard` plant in seed_e2e_unified has at least one characteristic
    // with samples; selectedCharacteristicId is persisted to `cassini-dashboard`.
    const manifest = getManifest()
    const plantId = manifest.dashboard.plant_id
    const charId = manifest.dashboard.char_id

    await page.goto('/dashboard', { waitUntil: 'networkidle' })

    // Pre-seed the Zustand persisted plant selector + dashboard store.
    await page.evaluate(
      ([pId, cId]: [number, number]) => {
        const uiRaw = localStorage.getItem('cassini-ui')
        const ui = uiRaw ? JSON.parse(uiRaw) : { state: {}, version: 0 }
        ui.state = ui.state || {}
        ui.state.selectedPlantId = pId
        localStorage.setItem('cassini-ui', JSON.stringify(ui))

        const dashRaw = localStorage.getItem('cassini-dashboard')
        const dash = dashRaw ? JSON.parse(dashRaw) : { state: {}, version: 0 }
        dash.state = dash.state || {}
        dash.state.selectedCharacteristicId = cId
        localStorage.setItem('cassini-dashboard', JSON.stringify(dash))
      },
      [plantId, charId] as const,
    )
    await page.reload({ waitUntil: 'networkidle' })

    const scrubber = page.locator('[data-ui="replay-scrubber"]')
    await expect(scrubber).toBeVisible({ timeout: 10000 })

    const slider = scrubber.locator('[data-ui="replay-scrubber-slider"]')
    const datetimeInput = scrubber.locator('[data-ui="replay-scrubber-datetime"]')
    await expect(slider).toBeVisible()
    await expect(datetimeInput).toBeVisible()

    // Fill the datetime input directly — slider drag is racy on Windows
    // CI. The component reacts on change either way.
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const target =
      `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
      `T${pad(now.getHours())}:${pad(now.getMinutes())}`

    const replayResponse = page.waitForResponse(
      (resp) => resp.url().includes('/api/v1/replay/'),
      { timeout: 15000 },
    )
    await datetimeInput.fill(target)
    await datetimeInput.blur()
    const resp = await replayResponse
    expect(resp.url()).toMatch(/\/api\/v1\/replay\/(characteristic|sample|violation)\//)

    // Banner shows up.
    const banner = page.locator('[data-ui="replay-banner"]')
    await expect(banner).toBeVisible({ timeout: 10000 })

    // Exit → banner disappears.
    await page.locator('[data-ui="replay-banner-exit"]').click()
    await expect(banner).toBeHidden({ timeout: 5000 })
  })
})
