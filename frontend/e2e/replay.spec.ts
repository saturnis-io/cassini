import { test, expect } from './fixtures'
import { loginAsAdmin } from './helpers/auth'

/**
 * Time-travel SPC replay E2E.
 *
 * The seed bootstrap creates at least one characteristic on a Pro-tier
 * dev license, so the scrubber renders on /dashboard. We don't assert
 * the snapshot's numeric content here — the backend integration suite
 * covers that. The frontend E2E verifies render, fetch wiring, banner
 * visibility, and the timestamp displayed in the banner reflects the
 * picked datetime.
 */
test.describe('Time-Travel SPC Replay', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('scrubber renders on chart detail page', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'networkidle' })

    // Pick the first characteristic in the sidebar so the chart panel mounts.
    // The scrubber is gated behind selectedId so we need a chart to be open.
    const charLink = page.locator('[data-ui="characteristic-list"] a').first()
    if (await charLink.count()) {
      await charLink.click()
    }
    await page.waitForTimeout(1000)

    const scrubber = page.locator('[data-ui="replay-scrubber"]')
    await expect(scrubber).toBeVisible({ timeout: 10000 })

    // The slider and datetime input both live inside the scrubber.
    await expect(scrubber.locator('[data-ui="replay-scrubber-slider"]')).toBeVisible()
    await expect(scrubber.locator('[data-ui="replay-scrubber-datetime"]')).toBeVisible()
  })

  test('datetime change triggers a fetch and shows banner', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'networkidle' })

    const charLink = page.locator('[data-ui="characteristic-list"] a').first()
    if (await charLink.count()) {
      await charLink.click()
    }
    await page.waitForTimeout(1000)

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
      (resp) => resp.url().includes('/api/v1/replay/characteristic/'),
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
    await page.goto('/dashboard', { waitUntil: 'networkidle' })

    const charLink = page.locator('[data-ui="characteristic-list"] a').first()
    if (await charLink.count()) {
      await charLink.click()
    }
    await page.waitForTimeout(1000)

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
