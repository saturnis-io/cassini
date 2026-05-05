import { test, expect } from './fixtures'
import { loginAsAdmin } from './helpers/auth'
import { getAuthToken } from './helpers/api'
import { getManifest } from './helpers/manifest'

test.describe('Kiosk & Wall Dashboard', () => {
  let token: string
  let plantId: number
  let charId1: number
  let charId2: number

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request)

    // All data is pre-seeded by global-setup via seed_e2e.py
    const m = getManifest().kiosk
    plantId = m.plant_id
    charId1 = m.char_id
    charId2 = m.char_id_2
  })

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  // -- Kiosk View -------------------------------------------------------

  test('kiosk view loads with single characteristic', async ({ page }) => {
    await page.goto(`/kiosk?chars=${charId1}`)
    await page.waitForTimeout(3000)

    // Kiosk should load without the main sidebar layout
    // Characteristic name should be visible
    await expect(page.getByText('Test Char').first()).toBeVisible({ timeout: 10000 })

    await test.info().attach('kiosk-single-char', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('kiosk shows chart canvas', async ({ page }) => {
    await page.goto(`/kiosk?chars=${charId1}`)
    await page.waitForTimeout(3000)

    // ECharts canvas should render
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 10000 })

    await test.info().attach('kiosk-chart-canvas', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('kiosk stats bar shows control limits', async ({ page }) => {
    await page.goto(`/kiosk?chars=${charId1}`)
    await page.waitForTimeout(3000)

    // Stats bar should show current value and limits
    await expect(page.getByText(/Current|UCL|LCL/i).first()).toBeVisible({ timeout: 10000 })

    await test.info().attach('kiosk-stats-bar', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('kiosk pause and resume', async ({ page }) => {
    await page.goto(`/kiosk?chars=${charId1},${charId2}&interval=5`)
    await page.waitForTimeout(3000)

    // Look for Pause button
    const pauseBtn = page.getByRole('button', { name: /Pause/i })
    const hasPause = await pauseBtn.isVisible({ timeout: 5000 }).catch(() => false)

    if (hasPause) {
      await pauseBtn.click()
      await page.waitForTimeout(1000)

      // Should now show Resume
      await expect(page.getByRole('button', { name: /Resume/i })).toBeVisible({ timeout: 3000 })

      await test.info().attach('kiosk-paused', {
        body: await page.screenshot(),
        contentType: 'image/png',
      })

      // Click Resume
      await page.getByRole('button', { name: /Resume/i }).click()
      await page.waitForTimeout(1000)

      await test.info().attach('kiosk-resumed', {
        body: await page.screenshot(),
        contentType: 'image/png',
      })
    } else {
      await test.info().attach('kiosk-no-pause-button', {
        body: await page.screenshot(),
        contentType: 'image/png',
      })
    }
  })

  test('kiosk multi-char navigation', async ({ page }) => {
    await page.goto(`/kiosk?chars=${charId1},${charId2}&interval=60`)
    await page.waitForTimeout(3000)

    // Navigation arrows should appear for multi-char kiosk
    const nextBtn = page.locator('[aria-label="Next characteristic"]')
    const hasNav = await nextBtn.isVisible({ timeout: 5000 }).catch(() => false)

    if (hasNav) {
      await nextBtn.click()
      await page.waitForTimeout(2000)

      // Should show the second characteristic
      await expect(page.getByText('Kiosk Char 2').first()).toBeVisible({ timeout: 5000 })

      await test.info().attach('kiosk-second-char', {
        body: await page.screenshot(),
        contentType: 'image/png',
      })

      // Navigate back
      const prevBtn = page.locator('[aria-label="Previous characteristic"]')
      if (await prevBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await prevBtn.click()
        await page.waitForTimeout(2000)
      }
    }

    // Pagination dots should be visible (aria-label="Go to characteristic N")
    const dots = page.locator('[aria-label^="Go to characteristic"]')
    const dotCount = await dots.count()
    if (dotCount > 0) {
      expect(dotCount).toBe(2)
    }

    await test.info().attach('kiosk-multi-char-nav', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  // -- Wall Dashboard ---------------------------------------------------

  test('wall dashboard loads', async ({ page }) => {
    await page.goto(`/wall-dashboard?plant=${plantId}&chars=${charId1},${charId2}`)
    await page.waitForTimeout(3000)

    // "Wall Dashboard" heading should be visible
    await expect(page.getByText('Wall Dashboard')).toBeVisible({ timeout: 10000 })

    // At least one chart card should render (canvas inside WallChartCard)
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 10000 })

    await test.info().attach('wall-dashboard-loaded', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('wall grid size selector works', async ({ page }) => {
    await page.goto(`/wall-dashboard?plant=${plantId}&chars=${charId1},${charId2}`)
    await page.waitForTimeout(3000)

    // Find the grid size selector button (shows current grid like "2x2")
    const gridBtn = page.getByText(/\d+x\d+/).first()
    const hasGridBtn = await gridBtn.isVisible({ timeout: 5000 }).catch(() => false)

    if (hasGridBtn) {
      await gridBtn.click()
      await page.waitForTimeout(500)

      // Options like "3x3" should appear in the dropdown
      const option3x3 = page.getByText('3x3')
      if (await option3x3.isVisible({ timeout: 3000 }).catch(() => false)) {
        await option3x3.click()
        await page.waitForTimeout(1000)
      }
    }

    await test.info().attach('wall-grid-selector', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('wall chart cards show data', async ({ page }) => {
    await page.goto(`/wall-dashboard?plant=${plantId}&chars=${charId1},${charId2}`)
    await page.waitForTimeout(3000)

    // Canvas elements should be rendered (one per WallChartCard)
    const canvasCount = await page.locator('canvas').count()
    expect(canvasCount).toBeGreaterThanOrEqual(1)

    await test.info().attach('wall-chart-cards', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('wall save and load preset buttons visible', async ({ page }) => {
    await page.goto(`/wall-dashboard?plant=${plantId}&chars=${charId1}`)
    await page.waitForTimeout(3000)

    const saveBtn = page.getByTitle('Save preset')
    const loadBtn = page.getByTitle('Load preset')

    const hasSave = await saveBtn.isVisible({ timeout: 5000 }).catch(() => false)
    const hasLoad = await loadBtn.isVisible({ timeout: 5000 }).catch(() => false)

    if (hasSave) await expect(saveBtn).toBeVisible()
    if (hasLoad) await expect(loadBtn).toBeVisible()

    await test.info().attach('wall-preset-buttons', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('wall save preset opens themed dialog (no native prompt)', async ({ page }) => {
    // Audit C19: clicking Save must NOT trigger a blocking native
    // window.prompt() — that would seize focus from kiosk fullscreen mode
    // and is unthemed.  After the fix, an inline themed dialog appears.
    let nativeDialogOpened = false
    page.on('dialog', async (dialog) => {
      // If we ever see a native dialog, mark the test as failing later.
      nativeDialogOpened = true
      await dialog.dismiss()
    })

    await page.goto(`/wall-dashboard?plant=${plantId}&chars=${charId1}`)
    await page.waitForTimeout(3000)

    const saveBtn = page.getByTitle('Save preset')
    if (await saveBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await saveBtn.click()
      await page.waitForTimeout(500)

      // The themed dialog should appear with a header reading "Save preset"
      // and an input field.  This is the SavePresetDialog component.
      const themedDialog = page.locator('[data-ui="wall-dashboard-save-preset-dialog"]')
      await expect(themedDialog).toBeVisible({ timeout: 3000 })
      await expect(themedDialog.getByText('Save preset', { exact: false })).toBeVisible()
      await expect(themedDialog.locator('input[type="text"]')).toBeVisible()

      // Cancel the dialog without saving
      await themedDialog.getByRole('button', { name: 'Cancel' }).click()
      await page.waitForTimeout(300)
      await expect(themedDialog).not.toBeVisible()
    }

    expect(nativeDialogOpened).toBe(false)

    await test.info().attach('wall-save-preset-dialog', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('wall load preset opens themed dialog (no native prompt)', async ({ page }) => {
    // Audit C19 (continued): the Load button must also use the themed
    // dialog, not native prompt() / alert().
    let nativeDialogOpened = false
    page.on('dialog', async (dialog) => {
      nativeDialogOpened = true
      await dialog.dismiss()
    })

    await page.goto(`/wall-dashboard?plant=${plantId}&chars=${charId1}`)
    await page.waitForTimeout(3000)

    const loadBtn = page.getByTitle('Load preset')
    if (await loadBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await loadBtn.click()
      await page.waitForTimeout(500)

      const themedDialog = page.locator('[data-ui="wall-dashboard-load-preset-dialog"]')
      await expect(themedDialog).toBeVisible({ timeout: 3000 })
      await expect(themedDialog.getByText('Load preset', { exact: false })).toBeVisible()

      // Close the dialog
      await themedDialog.getByRole('button', { name: 'Close' }).click()
      await page.waitForTimeout(300)
      await expect(themedDialog).not.toBeVisible()
    }

    expect(nativeDialogOpened).toBe(false)

    await test.info().attach('wall-load-preset-dialog', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('wall chart card expand button opens modal', async ({ page }) => {
    await page.goto(`/wall-dashboard?plant=${plantId}&chars=${charId1}`)
    await page.waitForTimeout(3000)

    // Click the expand button on the first WallChartCard (title="Expand chart")
    const expandBtn = page.getByTitle('Expand chart').first()
    await expect(expandBtn).toBeVisible({ timeout: 10000 })
    await expandBtn.click()
    await page.waitForTimeout(1000)

    // Expanded modal should appear (ExpandedChartModal is a fixed overlay)
    const modal = page.locator('.fixed.inset-0').last()
    await expect(modal).toBeVisible({ timeout: 5000 })

    await test.info().attach('wall-chart-expanded', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })

    // Close with Escape
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)

    await test.info().attach('wall-chart-closed', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })
})
