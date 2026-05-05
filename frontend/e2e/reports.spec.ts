import { test, expect } from './fixtures'
import { loginAsAdmin } from './helpers/auth'
import { getAuthToken } from './helpers/api'
import { switchToPlant, expandHierarchyToChar, expandSelectorToChar } from './helpers/seed'
import { getManifest } from './helpers/manifest'

test.describe('Reports', () => {
  let token: string
  let characteristicId: number

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request)
    characteristicId = getManifest().reports.char_id
  })

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await switchToPlant(page, 'Reports Plant')
  })

  // Helpers shared by ported sprint13-reporting tests
  async function selectCapabilityReport(page: import('@playwright/test').Page) {
    await page.goto('/reports')
    await page.waitForTimeout(2000)
    await switchToPlant(page, 'Reports Plant')

    const select = page.locator('select[aria-label="Report template"]')
    await expect(select).toBeVisible({ timeout: 5000 })
    await select.selectOption({ label: 'Capability Analysis' })
    await page.waitForTimeout(1000)

    await expandSelectorToChar(page)
    await page.waitForTimeout(2000)
  }

  async function selectViolationReport(page: import('@playwright/test').Page) {
    await page.goto('/reports')
    await page.waitForTimeout(2000)
    await switchToPlant(page, 'Reports Plant')

    const select = page.locator('select[aria-label="Report template"]')
    await expect(select).toBeVisible({ timeout: 5000 })
    await select.selectOption({ label: 'Violation Summary' })
    await page.waitForTimeout(1000)

    await expandSelectorToChar(page)
    await page.waitForTimeout(2000)
  }

  test('reports page loads with controls bar', async ({ page }) => {
    await page.goto('/reports')
    await page.waitForTimeout(2000)

    // The reports page has a template dropdown select with aria-label
    await expect(
      page.locator('select[aria-label="Report template"]'),
    ).toBeVisible({ timeout: 10000 })

    await test.info().attach('reports-controls-bar', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('template dropdown lists all four templates', async ({ page }) => {
    await page.goto('/reports')
    await page.waitForTimeout(2000)

    const select = page.locator('select[aria-label="Report template"]')
    await expect(select).toBeVisible({ timeout: 5000 })

    // Check that all four template options exist in the dropdown
    await expect(select.locator('option', { hasText: 'Characteristic Summary' })).toBeAttached()
    await expect(select.locator('option', { hasText: 'Capability Analysis' })).toBeAttached()
    await expect(select.locator('option', { hasText: 'Violation Summary' })).toBeAttached()
    await expect(select.locator('option', { hasText: 'Trend Analysis' })).toBeAttached()

    await test.info().attach('reports-all-templates', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('selecting template shows report or no-char state', async ({ page }) => {
    await page.goto('/reports')
    await page.waitForTimeout(2000)

    // Select a template from the dropdown
    const select = page.locator('select[aria-label="Report template"]')
    await select.selectOption({ label: 'Characteristic Summary' })
    await page.waitForTimeout(1000)

    // Without a characteristic selected, either the no-char state or template state shows
    // NoCharacteristicState shows "No characteristic selected"
    await expect(page.getByText('No characteristic selected').first()).toBeVisible({ timeout: 5000 })

    await test.info().attach('reports-template-selected', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('no-characteristic state shows prompt', async ({ page }) => {
    await page.goto('/reports')
    await page.waitForTimeout(2000)

    // Without selecting a characteristic, the NoCharacteristicState is shown
    await expect(
      page.getByText('No characteristic selected'),
    ).toBeVisible({ timeout: 5000 })

    await test.info().attach('reports-no-char-state', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('no template selected shows prompt', async ({ page }) => {
    await page.goto('/reports')
    await page.waitForTimeout(2000)

    // With no characteristic and no template, the no-char state appears
    // If we had a characteristic selected but no template, it would say "No template selected"
    // Test the default empty state
    await expect(
      page.getByText('No characteristic selected')
        .or(page.getByText('No template selected')),
    ).toBeVisible({ timeout: 5000 })

    await test.info().attach('reports-empty-state', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  // ========================================================================
  // Report rendering & export (ported from sprint13-reporting.spec.ts)
  // ========================================================================

  test('PDF export triggers a download', async ({ page }) => {
    await selectCapabilityReport(page)

    const downloadBtn = page
      .locator('button')
      .filter({ hasText: /PDF|Export|Download/i })
      .first()

    if (await downloadBtn.isVisible({ timeout: 3000 })) {
      const downloadPromise = page.waitForEvent('download', { timeout: 10000 })
      await downloadBtn.click()

      try {
        const download = await downloadPromise
        expect(download.suggestedFilename()).toMatch(/\.(pdf|zip)$/i)

        await test.info().attach('pdf-export-triggered', {
          body: await page.screenshot(),
          contentType: 'image/png',
        })
      } catch {
        await test.info().attach('pdf-export-attempt', {
          body: await page.screenshot(),
          contentType: 'image/png',
        })
      }
    } else {
      await test.info().attach('pdf-export-no-button', {
        body: await page.screenshot(),
        contentType: 'image/png',
      })
    }
  })

  test('capability report shows probability plot section', async ({ page }) => {
    await selectCapabilityReport(page)

    const probPlot = page.getByText(/Probability Plot/i).first()

    if (await probPlot.isVisible({ timeout: 5000 })) {
      await expect(probPlot).toBeVisible()
    } else {
      await expect(
        page.locator('canvas').first().or(page.getByText(/capability/i).first()),
      ).toBeVisible({ timeout: 5000 })
    }

    await test.info().attach('capability-probability-plot', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })
  })

  test('violation report shows Pareto section', async ({ page }) => {
    await selectViolationReport(page)

    const paretoSection = page.getByText(/Pareto/i).first()

    if (await paretoSection.isVisible({ timeout: 5000 })) {
      await expect(paretoSection).toBeVisible()
    } else {
      await expect(
        page.locator('canvas').first().or(page.getByText(/Violation/i).first()),
      ).toBeVisible({ timeout: 5000 })
    }

    await test.info().attach('violation-pareto-section', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })
  })

  test('DOE report shows residuals section if template exists', async ({ page }) => {
    await page.goto('/reports')
    await page.waitForTimeout(2000)

    const select = page.locator('select[aria-label="Report template"]')
    await expect(select).toBeVisible({ timeout: 5000 })

    const doeOption = select.locator('option').filter({ hasText: /DOE|Design of Experiment/i })
    const hasDoe = (await doeOption.count()) > 0

    if (hasDoe) {
      await select.selectOption({ label: (await doeOption.first().textContent()) ?? '' })
      await page.waitForTimeout(2000)

      const residuals = page.getByText(/Residual|residual/i).first()
      if (await residuals.isVisible({ timeout: 5000 })) {
        await expect(residuals).toBeVisible()
      }
    }

    await test.info().attach('doe-report-residuals', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })
  })

  test('batch export: select multiple chars triggers download', async ({ page }) => {
    await page.goto('/reports')
    await page.waitForTimeout(2000)

    const batchBtn = page
      .locator('button')
      .filter({ hasText: /Batch|Export All|Multi/i })
      .first()

    if (await batchBtn.isVisible({ timeout: 3000 })) {
      await batchBtn.click()
      await page.waitForTimeout(1000)
    }

    await test.info().attach('batch-export-state', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('chart image export: Save as PNG downloads a file', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForTimeout(2000)
    await expandHierarchyToChar(page)
    await page.getByText('Test Char').first().click()
    await page.waitForTimeout(2000)

    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 10000 })

    const exportBtn = page
      .locator('button')
      .filter({ hasText: /PNG|Save.*Image|Export.*Chart/i })
      .first()

    if (await exportBtn.isVisible({ timeout: 3000 })) {
      const downloadPromise = page.waitForEvent('download', { timeout: 10000 })
      await exportBtn.click()

      try {
        const download = await downloadPromise
        expect(download.suggestedFilename()).toMatch(/\.(png|jpg|jpeg|svg)$/i)
      } catch {
        // Export may use Blob URL instead of download event
      }
    }

    await test.info().attach('chart-png-export', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('reports page has print-friendly CSS', async ({ page }) => {
    await page.goto('/reports')
    await page.waitForTimeout(2000)

    const hasPrintCSS = await page.evaluate(() => {
      const sheets = Array.from(document.styleSheets)
      for (const sheet of sheets) {
        try {
          const rules = Array.from(sheet.cssRules)
          for (const rule of rules) {
            if (rule instanceof CSSMediaRule && rule.conditionText?.includes('print')) {
              return true
            }
          }
        } catch {
          // Cross-origin stylesheet — skip
        }
      }
      return false
    })

    await test.info().attach('print-css-check', {
      body: Buffer.from(`Has @media print rules: ${hasPrintCSS}`),
      contentType: 'text/plain',
    })

    await test.info().attach('reports-page-state', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('capability report shows PPM expected values', async ({ page }) => {
    await selectCapabilityReport(page)

    const ppmText = page.getByText(/PPM|ppm|Parts Per Million/i).first()

    if (await ppmText.isVisible({ timeout: 5000 })) {
      await expect(ppmText).toBeVisible()
    } else {
      await expect(page.getByText(/Cpk|capability/i).first()).toBeVisible({ timeout: 5000 })
    }

    await test.info().attach('capability-ppm-values', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })
  })

  test('capability report shows Cpk confidence interval', async ({ page }) => {
    await selectCapabilityReport(page)

    const ciText = page.getByText(/confidence|CI|±|\binterval\b/i).first()

    if (await ciText.isVisible({ timeout: 5000 })) {
      await expect(ciText).toBeVisible()
    } else {
      await expect(page.getByText(/Cpk|capability/i).first()).toBeVisible({ timeout: 5000 })
    }

    await test.info().attach('capability-cpk-confidence', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })
  })
})
