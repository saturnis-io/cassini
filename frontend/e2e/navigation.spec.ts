import { test, expect } from './fixtures'
import { loginAsAdmin } from './helpers/auth'
import { getAuthToken } from './helpers/api'
import { createPlant } from './helpers/seed'

test.describe('Navigation', () => {
  test.beforeAll(async ({ request }) => {
    // Ensure at least one plant exists
    const token = await getAuthToken(request)
    try {
      await createPlant(request, token, 'Nav Test Plant', 'NAV')
    } catch {
      // Plant may already exist
    }
  })

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('sidebar Dashboard link navigates correctly', async ({ page }) => {
    await page.goto('/data-entry')
    await page.waitForTimeout(1000)

    await page.getByRole('link', { name: 'Dashboard' }).click()
    await page.waitForURL('**/dashboard', { timeout: 5000 })
    await expect(page).toHaveURL(/\/dashboard/)

    await test.info().attach('dashboard-page', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('sidebar Data Entry link navigates correctly', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForTimeout(1000)

    await page.getByRole('link', { name: 'Data Entry' }).click()
    await page.waitForURL('**/data-entry', { timeout: 5000 })
    await expect(page).toHaveURL(/\/data-entry/)
  })

  test('sidebar Violations link navigates correctly', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForTimeout(1000)

    await page.getByRole('link', { name: 'Violations' }).click()
    await page.waitForURL('**/violations', { timeout: 5000 })
    await expect(page).toHaveURL(/\/violations/)
  })

  test('sidebar Reports link navigates correctly', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForTimeout(1000)

    await page.getByRole('link', { name: 'Reports' }).click()
    await page.waitForURL('**/reports', { timeout: 5000 })
    await expect(page).toHaveURL(/\/reports/)

    await test.info().attach('reports-page', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('sidebar Configuration link navigates correctly', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForTimeout(1000)

    await page.getByRole('link', { name: 'Configuration' }).click()
    await page.waitForURL('**/configuration', { timeout: 5000 })
    await expect(page).toHaveURL(/\/configuration/)

    await test.info().attach('configuration-page', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('sidebar Settings link navigates correctly', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForTimeout(1000)

    await page.getByRole('link', { name: 'Settings' }).click()
    await page.waitForURL('**/settings', { timeout: 5000 })
    await expect(page).toHaveURL(/\/settings/)
  })

  test('sidebar Connectivity link navigates correctly', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForTimeout(1000)

    await page.getByRole('link', { name: 'Connectivity' }).click()
    await page.waitForURL('**/connectivity', { timeout: 5000 })
    await expect(page).toHaveURL(/\/connectivity/)

    await test.info().attach('connectivity-page', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('sidebar Users link navigates correctly', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForTimeout(1000)

    await page.getByRole('link', { name: 'Users' }).click()
    await page.waitForURL('**/admin/users', { timeout: 5000 })
    await expect(page).toHaveURL(/\/admin\/users/)
  })

  test('plant selector dropdown opens and shows options', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForTimeout(2000)

    const plantSelector = page.locator('button[aria-haspopup="listbox"]')
    await expect(plantSelector).toBeVisible({ timeout: 5000 })
    await plantSelector.click()

    const listbox = page.locator('[role="listbox"]')
    await expect(listbox).toBeVisible({ timeout: 3000 })

    const options = listbox.locator('[role="option"]')
    const count = await options.count()
    expect(count).toBeGreaterThan(0)

    await test.info().attach('plant-selector-open', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })

    // Close dropdown
    await page.keyboard.press('Escape')
  })

  test('root path redirects to dashboard', async ({ page }) => {
    await page.goto('/')
    await page.waitForURL('**/dashboard', { timeout: 10000 })
    await expect(page).toHaveURL(/\/dashboard/)
  })
})
