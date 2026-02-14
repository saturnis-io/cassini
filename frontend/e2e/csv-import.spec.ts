import path from 'path'
import { fileURLToPath } from 'url'
import { test, expect } from './fixtures'
import { loginAsAdmin } from './helpers/auth'
import { getAuthToken, apiGet } from './helpers/api'
import { switchToPlant } from './helpers/seed'
import { getManifest } from './helpers/manifest'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const CSV_FILE_PATH = path.resolve(__dirname, 'fixtures/test-data.csv')

test.describe('CSV Import Wizard', () => {
  let token: string
  let plantId: number
  let characteristicId: number

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request)
    const m = getManifest().csv_import
    plantId = m.plant_id
    characteristicId = m.char_id
  })

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await switchToPlant(page, 'CSV Import Plant')
  })

  test('import CSV button visible on data entry page', async ({ page }) => {
    await page.goto('/data-entry')
    await expect(page.getByRole('heading', { name: 'Data Entry' })).toBeVisible({ timeout: 10000 })

    const importButton = page.getByRole('button', { name: 'Import CSV/Excel' })
    await expect(importButton).toBeVisible({ timeout: 5000 })

    await test.info().attach('data-entry-import-button', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('import wizard opens', async ({ page }) => {
    await page.goto('/data-entry')
    await expect(page.getByRole('heading', { name: 'Data Entry' })).toBeVisible({ timeout: 10000 })

    await page.getByRole('button', { name: 'Import CSV/Excel' }).click()
    await page.waitForTimeout(500)

    // Verify the wizard modal appears with the correct heading
    const modal = page.locator('.fixed.inset-0.z-50')
    await expect(modal).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('heading', { name: 'Import CSV/Excel' })).toBeVisible({ timeout: 3000 })

    await test.info().attach('import-wizard-opened', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('upload step shows drop zone', async ({ page }) => {
    await page.goto('/data-entry')
    await expect(page.getByRole('heading', { name: 'Data Entry' })).toBeVisible({ timeout: 10000 })

    await page.getByRole('button', { name: 'Import CSV/Excel' }).click()
    await page.waitForTimeout(500)

    // Verify drop zone text
    await expect(page.getByText('Drag & drop a CSV or Excel file here')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('or click to browse')).toBeVisible({ timeout: 3000 })

    // Verify hidden file input exists with correct accept attribute
    const fileInput = page.locator('input[type="file"][accept=".csv,.xlsx,.xls"]')
    await expect(fileInput).toBeAttached()

    await test.info().attach('upload-step-drop-zone', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('upload a CSV file', async ({ page }) => {
    await page.goto('/data-entry')
    await expect(page.getByRole('heading', { name: 'Data Entry' })).toBeVisible({ timeout: 10000 })

    await page.getByRole('button', { name: 'Import CSV/Excel' }).click()
    await page.waitForTimeout(500)

    // Upload the CSV fixture file via the hidden file input
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(CSV_FILE_PATH)
    await page.waitForTimeout(2000)

    // File name should appear
    await expect(page.getByText('test-data.csv')).toBeVisible({ timeout: 5000 })

    // Row count and column count should be shown
    await expect(page.getByText('10 rows')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('4 columns')).toBeVisible({ timeout: 5000 })

    // Preview table should render with headers from the CSV
    await expect(page.getByText('timestamp').first()).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('value').first()).toBeVisible({ timeout: 3000 })
    await expect(page.getByText('batch_number').first()).toBeVisible({ timeout: 3000 })
    await expect(page.getByText('operator_id').first()).toBeVisible({ timeout: 3000 })

    // "Next" button should become enabled
    const nextButton = page.getByRole('button', { name: 'Next' })
    await expect(nextButton).toBeVisible({ timeout: 3000 })
    await expect(nextButton).toBeEnabled()

    await test.info().attach('csv-uploaded', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('map columns step', async ({ page }) => {
    await page.goto('/data-entry')
    await expect(page.getByRole('heading', { name: 'Data Entry' })).toBeVisible({ timeout: 10000 })

    await page.getByRole('button', { name: 'Import CSV/Excel' }).click()
    await page.waitForTimeout(500)

    // Upload the file
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(CSV_FILE_PATH)
    await page.waitForTimeout(2000)

    // Advance to map step
    await page.getByRole('button', { name: 'Next' }).click()
    await page.waitForTimeout(1000)

    // "Target Characteristic" dropdown should be visible
    await expect(page.getByText('Target Characteristic')).toBeVisible({ timeout: 5000 })
    const charSelect = page.locator('select').first()
    await expect(charSelect).toBeVisible({ timeout: 3000 })

    // Select the seeded characteristic (may be auto-selected if only one exists)
    const options = charSelect.locator('option')
    const optionCount = await options.count()
    for (let i = 0; i < optionCount; i++) {
      const text = await options.nth(i).textContent()
      if (text && text.includes('Test Char')) {
        const value = await options.nth(i).getAttribute('value')
        if (value) {
          await charSelect.selectOption(value)
          break
        }
      }
    }
    await page.waitForTimeout(500)

    // Column mapping table should be visible with headers
    await expect(page.getByText('Target Field')).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('columnheader', { name: 'File Column' })).toBeVisible({ timeout: 3000 })

    // Auto-suggested mappings: the target field labels should be listed in the mapping table
    await expect(page.getByRole('cell', { name: 'Timestamp' }).first()).toBeVisible({ timeout: 3000 })
    await expect(page.getByRole('cell', { name: 'Value' }).first()).toBeVisible({ timeout: 3000 })
    await expect(page.getByRole('cell', { name: 'Batch' }).first()).toBeVisible({ timeout: 3000 })
    await expect(page.getByRole('cell', { name: 'Operator' }).first()).toBeVisible({ timeout: 3000 })

    // Validate button should be enabled after characteristic is selected
    const validateButton = page.getByRole('button', { name: /Validate/ })
    await expect(validateButton).toBeEnabled({ timeout: 5000 })

    await test.info().attach('map-columns-step', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('validate and preview', async ({ page }) => {
    await page.goto('/data-entry')
    await expect(page.getByRole('heading', { name: 'Data Entry' })).toBeVisible({ timeout: 10000 })

    await page.getByRole('button', { name: 'Import CSV/Excel' }).click()
    await page.waitForTimeout(500)

    // Upload the file
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(CSV_FILE_PATH)
    await page.waitForTimeout(2000)

    // Advance to map step
    await page.getByRole('button', { name: 'Next' }).click()
    await page.waitForTimeout(1000)

    // Ensure the characteristic is selected (may be auto-selected)
    const charSelect = page.locator('select').first()
    const options = charSelect.locator('option')
    const optionCount = await options.count()
    for (let i = 0; i < optionCount; i++) {
      const text = await options.nth(i).textContent()
      if (text && text.includes('Test Char')) {
        const value = await options.nth(i).getAttribute('value')
        if (value) {
          await charSelect.selectOption(value)
          break
        }
      }
    }

    // Click Validate to advance to preview step
    const validateButton = page.getByRole('button', { name: /Validate/ })
    await expect(validateButton).toBeEnabled({ timeout: 5000 })
    await validateButton.click()
    await page.waitForTimeout(3000)

    // "Valid Rows" count should be visible (use exact: true to avoid matching "valid rows" in preview heading)
    await expect(page.getByText('Valid Rows', { exact: true })).toBeVisible({ timeout: 10000 })

    // "Total Rows" count should be visible
    await expect(page.getByText('Total Rows', { exact: true })).toBeVisible({ timeout: 5000 })

    // Import button should be visible with sample count
    const importButton = page.getByRole('button', { name: /Import \d+ Samples/ })
    await expect(importButton).toBeVisible({ timeout: 5000 })

    await test.info().attach('validate-preview-step', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('confirm import', async ({ page }) => {
    await page.goto('/data-entry')
    await expect(page.getByRole('heading', { name: 'Data Entry' })).toBeVisible({ timeout: 10000 })

    await page.getByRole('button', { name: 'Import CSV/Excel' }).click()
    await page.waitForTimeout(500)

    // Upload the file
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(CSV_FILE_PATH)
    await page.waitForTimeout(2000)

    // Advance to map step
    await page.getByRole('button', { name: 'Next' }).click()
    await page.waitForTimeout(1000)

    // Ensure the characteristic is selected (may be auto-selected)
    const charSelect = page.locator('select').first()
    const options = charSelect.locator('option')
    const optCount = await options.count()
    for (let i = 0; i < optCount; i++) {
      const text = await options.nth(i).textContent()
      if (text && text.includes('Test Char')) {
        const value = await options.nth(i).getAttribute('value')
        if (value) {
          await charSelect.selectOption(value)
          break
        }
      }
    }

    // Click Validate
    const validateButton = page.getByRole('button', { name: /Validate/ })
    await expect(validateButton).toBeEnabled({ timeout: 5000 })
    await validateButton.click()
    await page.waitForTimeout(3000)

    // Wait for preview to load, then click Import
    const importButton = page.getByRole('button', { name: /Import \d+ Samples/ })
    await expect(importButton).toBeVisible({ timeout: 10000 })
    await importButton.click()
    await page.waitForTimeout(3000)

    // "Import Complete" heading should appear
    await expect(page.getByText('Import Complete')).toBeVisible({ timeout: 10000 })

    // Success text with count
    await expect(page.getByText(/\d+ of \d+ samples imported successfully/)).toBeVisible({ timeout: 5000 })

    // "Close" button should be visible (use exact to avoid matching toast's "Close toast" button)
    await expect(page.getByRole('button', { name: 'Close', exact: true })).toBeVisible({ timeout: 3000 })

    await test.info().attach('import-complete', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('cancel closes wizard', async ({ page }) => {
    await page.goto('/data-entry')
    await expect(page.getByRole('heading', { name: 'Data Entry' })).toBeVisible({ timeout: 10000 })

    // Open the wizard
    await page.getByRole('button', { name: 'Import CSV/Excel' }).click()
    await page.waitForTimeout(500)

    // Verify modal is open
    const modal = page.locator('.fixed.inset-0.z-50')
    await expect(modal).toBeVisible({ timeout: 5000 })

    // Click Cancel
    await page.getByRole('button', { name: 'Cancel' }).click()
    await page.waitForTimeout(500)

    // Modal should disappear
    await expect(modal).not.toBeVisible({ timeout: 5000 })

    await test.info().attach('wizard-cancelled', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('step indicator shows progress', async ({ page }) => {
    await page.goto('/data-entry')
    await expect(page.getByRole('heading', { name: 'Data Entry' })).toBeVisible({ timeout: 10000 })

    await page.getByRole('button', { name: 'Import CSV/Excel' }).click()
    await page.waitForTimeout(500)

    // All four step labels should be visible in the step indicator
    await expect(page.getByText('Upload')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Map Columns')).toBeVisible({ timeout: 3000 })
    await expect(page.getByText('Preview')).toBeVisible({ timeout: 3000 })
    await expect(page.getByText('Result')).toBeVisible({ timeout: 3000 })

    await test.info().attach('step-indicator', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })
})
