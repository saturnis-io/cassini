/**
 * Sprint 15 — Lakehouse data product page (Pro+ tier feature).
 *
 * Verifies that the read-only export UI renders, that format selection
 * updates the curl/python snippets in real time, and that clicking
 * Download fires the correct request.
 *
 * The dev backend runs with CASSINI_DEV_TIER=enterprise so the page is
 * fully accessible — no upgrade prompt expected.
 */
import { test, expect } from './fixtures'
import { loginAsAdmin } from './helpers/auth'
import { switchToPlant } from './helpers/seed'

test.describe('Sprint 15 Lakehouse', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await switchToPlant(page, 'Screenshot Tour Plant')
  })

  test('lakehouse page renders catalog + format toggles', async ({ page }) => {
    await page.goto('/lakehouse')

    // Page wrapper renders without an upgrade prompt.
    const pageRoot = page.locator('[data-ui="lakehouse-page"]')
    await expect(pageRoot).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('heading', { name: /Cassini Lakehouse/i })).toBeVisible()

    // Table picker has the seeded tables (samples, measurements, violations,
    // characteristics, plants — exact list depends on lakehouse_service.list_tables()).
    const tableSelect = pageRoot.locator('select').first()
    await expect(tableSelect).toBeVisible({ timeout: 10000 })
    await expect
      .poll(async () => (await tableSelect.locator('option').count()) > 0, {
        timeout: 10000,
      })
      .toBe(true)
    const optionTexts = await tableSelect.locator('option').allTextContents()
    expect(optionTexts).toContain('samples')
    expect(optionTexts.length).toBeGreaterThanOrEqual(3)
  })

  test('format toggles update aria-checked and snippet text', async ({ page }) => {
    await page.goto('/lakehouse')
    await expect(page.locator('[data-ui="lakehouse-page"]')).toBeVisible({ timeout: 10000 })

    // The format buttons live in a radiogroup. The Lakehouse page uses
    // role=radio + aria-checked rather than aria-pressed — so verify
    // aria-checked toggles correctly.
    const radioGroup = page.getByRole('radiogroup', { name: /format/i })
    const arrowBtn = radioGroup.getByRole('radio', { name: /Arrow IPC format/i })
    const csvBtn = radioGroup.getByRole('radio', { name: /CSV format/i })
    const jsonBtn = radioGroup.getByRole('radio', { name: /JSON format/i })

    // Default selection on mount is parquet (per LakehousePage.tsx).
    await expect(arrowBtn).toHaveAttribute('aria-checked', 'false')

    // Switch to CSV — capture the curl snippet before/after to confirm it
    // changes when format changes.
    const curlPre = page.locator('pre').first()
    const beforeCurl = await curlPre.textContent()
    await csvBtn.click()
    await expect(csvBtn).toHaveAttribute('aria-checked', 'true')
    await expect(arrowBtn).toHaveAttribute('aria-checked', 'false')
    const afterCurl = await curlPre.textContent()
    expect(afterCurl).not.toEqual(beforeCurl)
    expect(afterCurl).toContain('format=csv')

    // Switching to Arrow updates the snippet again.
    await arrowBtn.click()
    await expect(arrowBtn).toHaveAttribute('aria-checked', 'true')
    const arrowCurl = await curlPre.textContent()
    expect(arrowCurl).toContain('format=arrow')

    // And to JSON.
    await jsonBtn.click()
    await expect(jsonBtn).toHaveAttribute('aria-checked', 'true')
    const jsonCurl = await curlPre.textContent()
    expect(jsonCurl).toContain('format=json')
  })

  test('clicking Download fires the export request', async ({ page }) => {
    await page.goto('/lakehouse')
    await expect(page.locator('[data-ui="lakehouse-page"]')).toBeVisible({ timeout: 10000 })

    // Default is parquet — switch to JSON so we can stub a small response
    // without needing pyarrow at runtime.
    const jsonBtn = page.getByRole('radiogroup', { name: /format/i }).getByRole('radio', {
      name: /JSON format/i,
    })
    await jsonBtn.click()
    await expect(jsonBtn).toHaveAttribute('aria-checked', 'true')

    // Intercept the export request — we do NOT modify the response payload,
    // we just observe that the URL has the expected shape.
    const exportRequest = page.waitForRequest(
      (req) => req.url().includes('/api/v1/lakehouse/') && req.url().includes('format=json'),
      { timeout: 15000 },
    )

    await page.getByRole('button', { name: /Download/i }).click()
    const req = await exportRequest
    expect(req.url()).toContain('/api/v1/lakehouse/samples')
    expect(req.url()).toContain('format=json')
    expect(req.url()).toContain('plant_id=')
  })
})
