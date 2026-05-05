import { test, expect } from './fixtures'
import { loginAsAdmin } from './helpers/auth'
import { getManifest } from './helpers/manifest'

/**
 * Time-travel SPC replay E2E.
 *
 * The seed bootstrap creates at least one characteristic on a Pro-tier
 * dev license, so the scrubber renders on /dashboard. We don't assert
 * the snapshot's numeric content here — the backend integration suite
 * covers that. The frontend E2E verifies render, fetch wiring, banner
 * visibility, and the timestamp displayed in the banner reflects the
 * picked datetime.
 *
 * Pre-seeds the Zustand persisted dashboard store with a known
 * characteristic ID instead of clicking through the hierarchy tree —
 * the tree is collapsed by default and clicking the first list item is
 * racy across Windows + headless Chromium.
 */
test.describe('Time-Travel SPC Replay', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('scrubber renders on chart detail page', async ({ page }) => {
    const manifest = getManifest()
    const plantId = manifest.dashboard.plant_id
    const charId = manifest.dashboard.char_id

    await page.goto('/dashboard', { waitUntil: 'networkidle' })

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

    // The slider and datetime input both live inside the scrubber.
    await expect(scrubber.locator('[data-ui="replay-scrubber-slider"]')).toBeVisible()
    await expect(scrubber.locator('[data-ui="replay-scrubber-datetime"]')).toBeVisible()
  })

  test('datetime change triggers a fetch and shows banner', async ({ page }) => {
    const manifest = getManifest()
    const plantId = manifest.dashboard.plant_id
    const charId = manifest.dashboard.char_id

    await page.goto('/dashboard', { waitUntil: 'networkidle' })

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

    const datetimeInput = page.locator('[data-ui="replay-scrubber-datetime"]')
    await expect(datetimeInput).toBeVisible({ timeout: 10000 })

    // Wait for the replay endpoint hit when we set a value. Use a value
    // shaped per <input type="datetime-local">.
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
    await replayResponse

    // Banner appears with the same wall-clock minute we asked for.
    const banner = page.locator('[data-ui="replay-banner"]')
    await expect(banner).toBeVisible({ timeout: 10000 })

    const bannerTimestamp = page.locator('[data-ui="replay-banner-timestamp"]')
    const text = (await bannerTimestamp.textContent()) ?? ''
    // Default datetime format is YYYY-MM-DD HH:mm:ss in the user's locale,
    // so we sanity-check that the year and minute we picked are present.
    expect(text).toContain(`${now.getFullYear()}`)
    expect(text).toContain(pad(now.getMinutes()))
  })

  test('exit button clears replay mode', async ({ page }) => {
    const manifest = getManifest()
    const plantId = manifest.dashboard.plant_id
    const charId = manifest.dashboard.char_id

    await page.goto('/dashboard', { waitUntil: 'networkidle' })

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

    const datetimeInput = page.locator('[data-ui="replay-scrubber-datetime"]')
    await expect(datetimeInput).toBeVisible({ timeout: 10000 })

    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const target =
      `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
      `T${pad(now.getHours())}:${pad(now.getMinutes())}`
    await datetimeInput.fill(target)
    await datetimeInput.blur()

    const banner = page.locator('[data-ui="replay-banner"]')
    await expect(banner).toBeVisible({ timeout: 10000 })

    await page.locator('[data-ui="replay-banner-exit"]').click()
    await expect(banner).toBeHidden({ timeout: 5000 })
  })
})
