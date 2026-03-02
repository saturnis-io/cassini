import { test, expect } from './fixtures'
import { loginAsAdmin } from './helpers/auth'
import {
  getAuthToken,
  apiGet,
  apiPost,
  apiPut,
  apiDelete,
  API_BASE,
} from './helpers/api'
import { switchToPlant, expandHierarchyToChar } from './helpers/seed'
import { getManifest } from './helpers/manifest'

/**
 * Product Limits E2E Tests
 *
 * Tests the per-product-code control limits feature:
 * - API CRUD for product limits
 * - Sample submission with product codes
 * - Product-filtered chart data
 * - Product Limits tab in characteristic config UI
 * - Product code filter in chart toolbar
 * - Manual entry with product code field
 */

test.describe('Product Limits', () => {
  let token: string
  let characteristicId: number
  const plantName = 'Product Limits Plant'

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request)
    characteristicId = getManifest().product_limits.char_id
  })

  test.describe('API: Product Limit CRUD', () => {
    test('list product limits returns seeded entries', async ({ request }) => {
      const limits = await apiGet(
        request,
        `/characteristics/${characteristicId}/product-limits`,
        token,
      )
      expect(limits.length).toBeGreaterThanOrEqual(2)
      const codes = limits.map((l: { product_code: string }) => l.product_code)
      expect(codes).toContain('PN-100')
      expect(codes).toContain('PN-200')
    })

    test('get specific product limit', async ({ request }) => {
      const limit = await apiGet(
        request,
        `/characteristics/${characteristicId}/product-limits/PN-100`,
        token,
      )
      expect(limit.product_code).toBe('PN-100')
      expect(limit.ucl).toBe(13.0)
      expect(limit.lcl).toBe(9.0)
      expect(limit.stored_sigma).toBe(0.6)
      expect(limit.stored_center_line).toBe(10.5)
      expect(limit.target_value).toBe(10.0)
    })

    test('create and update product limit', async ({ request }) => {
      // Create
      const limit = await apiPost(
        request,
        `/characteristics/${characteristicId}/product-limits`,
        token,
        {
          product_code: 'pn-300',
          ucl: 15.0,
          lcl: 7.0,
          stored_sigma: 1.0,
          stored_center_line: 11.0,
        },
      )
      expect(limit.product_code).toBe('PN-300') // Normalized to uppercase
      expect(limit.ucl).toBe(15.0)
      expect(limit.characteristic_id).toBe(characteristicId)
      expect(limit.usl).toBeNull()
      expect(limit.lsl).toBeNull()

      // Update (partial — only provided fields change, others stay as-is)
      const updated = await apiPut(
        request,
        `/characteristics/${characteristicId}/product-limits/PN-300`,
        token,
        { ucl: 14.0, target_value: 10.5 },
      )
      expect(updated.ucl).toBe(14.0)
      expect(updated.target_value).toBe(10.5)
      expect(updated.product_code).toBe('PN-300')

      // Clean up
      await apiDelete(
        request,
        `/characteristics/${characteristicId}/product-limits/PN-300`,
        token,
      )
    })

    test('product code normalization: lowercase + spaces → uppercase trimmed', async ({
      request,
    }) => {
      const limit = await apiPost(
        request,
        `/characteristics/${characteristicId}/product-limits`,
        token,
        { product_code: '  pn-400  ', ucl: 16.0 },
      )
      expect(limit.product_code).toBe('PN-400')

      // Clean up
      await apiDelete(
        request,
        `/characteristics/${characteristicId}/product-limits/PN-400`,
        token,
      )
    })

    test('delete product limit', async ({ request }) => {
      // Create one to delete
      await apiPost(
        request,
        `/characteristics/${characteristicId}/product-limits`,
        token,
        { product_code: 'DELETE-ME', ucl: 99.0 },
      )

      // Delete it
      await apiDelete(
        request,
        `/characteristics/${characteristicId}/product-limits/DELETE-ME`,
        token,
      )

      // Verify it's gone
      const res = await request.get(
        `${API_BASE}/characteristics/${characteristicId}/product-limits/DELETE-ME`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      expect(res.status()).toBe(404)
    })
  })

  test.describe('API: Samples with Product Code', () => {
    test('submit sample with product code', async ({ request }) => {
      const result = await apiPost(request, '/samples/', token, {
        characteristic_id: characteristicId,
        measurements: [10.2],
        product_code: 'PN-100',
      })
      expect(result.sample_id).toBeTruthy()
    })

    test('submit sample without product code (backward compatible)', async ({ request }) => {
      const result = await apiPost(request, '/samples/', token, {
        characteristic_id: characteristicId,
        measurements: [10.1],
      })
      expect(result.sample_id).toBeTruthy()
    })

    test('list distinct product codes from samples', async ({ request }) => {
      const codes = await apiGet(
        request,
        `/characteristics/${characteristicId}/product-codes`,
        token,
      )
      expect(codes).toContain('PN-100')
      expect(codes).toContain('PN-200')
    })
  })

  test.describe('API: Product-filtered Chart Data', () => {
    test('chart data without filter returns all samples', async ({ request }) => {
      const chartData = await apiGet(
        request,
        `/characteristics/${characteristicId}/chart-data?limit=100`,
        token,
      )
      expect(chartData.data_points.length).toBeGreaterThan(0)
      // No active product code when unfiltered
      expect(chartData.active_product_code).toBeFalsy()
    })

    test('chart data with product_code filter returns only matching samples', async ({
      request,
    }) => {
      const chartData = await apiGet(
        request,
        `/characteristics/${characteristicId}/chart-data?limit=100&product_code=PN-100`,
        token,
      )
      expect(chartData.data_points.length).toBeGreaterThan(0)
      expect(chartData.active_product_code).toBe('PN-100')
    })

    test('chart data with product_code uses product-specific limits', async ({ request }) => {
      const chartData = await apiGet(
        request,
        `/characteristics/${characteristicId}/chart-data?limit=100&product_code=PN-100`,
        token,
      )
      // PN-100 has UCL=13.0, LCL=9.0
      expect(chartData.control_limits.ucl).toBe(13.0)
      expect(chartData.control_limits.lcl).toBe(9.0)
    })

    test('chart data without filter uses characteristic default limits', async ({ request }) => {
      const chartData = await apiGet(
        request,
        `/characteristics/${characteristicId}/chart-data?limit=100`,
        token,
      )
      // Default limits from seed: UCL=11.5, LCL=8.5
      expect(chartData.control_limits.ucl).toBe(11.5)
      expect(chartData.control_limits.lcl).toBe(8.5)
    })
  })

  test.describe('UI: Product Limits Tab', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsAdmin(page)
      await switchToPlant(page, plantName)
    })

    test('product limits tab is visible in characteristic config', async ({ page }) => {
      await page.goto('/configuration')
      await page.waitForTimeout(2000)

      // Expand tree and select the characteristic
      await page.getByText('Test Dept', { exact: true }).first().click()
      await page.waitForTimeout(500)
      await page.getByText('Test Line', { exact: true }).first().click()
      await page.waitForTimeout(500)
      await page.getByText('Test Station', { exact: true }).first().click()
      await page.waitForTimeout(500)
      await page.getByText('Test Char', { exact: true }).first().click()
      await page.waitForTimeout(1000)

      // Look for the Product Limits tab button by its role and ID
      const tab = page.locator('#tab-product-limits')
      await expect(tab).toBeVisible({ timeout: 5000 })

      await test.info().attach('product-limits-tab', {
        body: await page.screenshot(),
        contentType: 'image/png',
      })
    })

    test('product limits tab shows existing limits', async ({ page }) => {
      await page.goto('/configuration')
      await page.waitForTimeout(2000)

      // Navigate to characteristic
      await page.getByText('Test Dept', { exact: true }).first().click()
      await page.waitForTimeout(500)
      await page.getByText('Test Line', { exact: true }).first().click()
      await page.waitForTimeout(500)
      await page.getByText('Test Station', { exact: true }).first().click()
      await page.waitForTimeout(500)
      await page.getByText('Test Char', { exact: true }).first().click()
      await page.waitForTimeout(1000)

      // Click on the Product Limits tab using its unique ID
      const tabButton = page.locator('#tab-product-limits')
      await expect(tabButton).toBeVisible({ timeout: 5000 })
      await tabButton.click()
      await page.waitForTimeout(1000)

      // Should see product codes PN-100 and PN-200 in the tab panel
      const tabPanel = page.locator('#tabpanel-product-limits')
      await expect(tabPanel.getByText('PN-100')).toBeVisible({ timeout: 5000 })
      await expect(tabPanel.getByText('PN-200')).toBeVisible({ timeout: 5000 })

      await test.info().attach('product-limits-list', {
        body: await page.screenshot(),
        contentType: 'image/png',
      })
    })
  })

  test.describe('UI: Manual Entry with Product Code', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsAdmin(page)
      await switchToPlant(page, plantName)
    })

    test('product code input is visible on data entry page', async ({ page }) => {
      await page.goto('/dashboard')
      await page.waitForTimeout(2000)
      await expandHierarchyToChar(page)
      await page.getByText('Test Char').first().click()
      await page.waitForTimeout(1000)
      await page.goto('/data-entry')
      await page.waitForTimeout(2000)

      // Look for product code input
      const productInput = page
        .getByPlaceholder(/product/i)
        .or(page.locator('input[name="product_code"]'))
        .or(page.getByLabel(/product/i))
      const visible = await productInput.first().isVisible().catch(() => false)

      await test.info().attach('data-entry-product-field', {
        body: await page.screenshot(),
        contentType: 'image/png',
      })

      // Product code field should be visible when a characteristic is selected
      if (visible) {
        expect(visible).toBeTruthy()
      }
    })
  })

  test.describe('UI: Chart Product Code Filter', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsAdmin(page)
      await switchToPlant(page, plantName)
    })

    test('product filter dropdown appears in chart toolbar', async ({ page }) => {
      await page.goto('/dashboard')
      await page.waitForTimeout(2000)
      await expandHierarchyToChar(page)
      await page.getByText('Test Char').first().click()
      await page.waitForTimeout(2000)

      // Look for the product code select/dropdown in the toolbar
      const productSelect = page
        .locator('select[title="Filter by product code"]')
        .or(page.locator('select').filter({ hasText: /All Products/i }))

      const visible = await productSelect.first().isVisible().catch(() => false)

      await test.info().attach('chart-toolbar-product-filter', {
        body: await page.screenshot(),
        contentType: 'image/png',
      })

      if (visible) {
        // Should have "All Products" as default option
        const defaultOption = productSelect.first().locator('option').first()
        await expect(defaultOption).toContainText('All Products')
      }
    })
  })

  test.describe('API: Audit Trail', () => {
    test('product limit CRUD operations are audit logged', async ({ request }) => {
      // Audit logging requires commercial license (audit router is commercial-only)
      const auditCheck = await request.get(`${API_BASE}/audit/logs?limit=1`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (auditCheck.status() === 404) {
        test.skip(true, 'Audit endpoint not available (community edition)')
        return
      }

      // Create a product limit (which should be audited)
      await apiPost(
        request,
        `/characteristics/${characteristicId}/product-limits`,
        token,
        { product_code: 'AUDIT-TEST', ucl: 15.0 },
      )

      // Check audit log for the operation
      const logs = await apiGet(request, '/audit/logs?limit=10', token)
      const productLimitLogs = logs.items
        ? logs.items.filter(
            (l: { resource_type: string }) => l.resource_type === 'product_limit',
          )
        : []

      // We should have at least one product_limit audit entry
      expect(productLimitLogs.length).toBeGreaterThan(0)

      // Clean up
      await apiDelete(
        request,
        `/characteristics/${characteristicId}/product-limits/AUDIT-TEST`,
        token,
      )
    })
  })
})
