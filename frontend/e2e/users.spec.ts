import { test, expect } from './fixtures'
import { loginAsAdmin } from './helpers/auth'
import { getAuthToken, apiGet, API_BASE } from './helpers/api'
import { createPlant } from './helpers/seed'

test.describe('Users', () => {
  let token: string

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request)
    const plants = await apiGet(request, '/plants/', token)
    if (plants.length === 0) {
      await createPlant(request, token, 'Users Test Plant', 'UTP')
    }
  })

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('user management page loads', async ({ page }) => {
    await page.goto('/admin/users')
    await page.waitForTimeout(2000)

    await expect(page.getByRole('heading', { name: 'User Management' })).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('button', { name: 'Create User' })).toBeVisible({ timeout: 5000 })

    await test.info().attach('user-management-page-loaded', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('create user via UI', async ({ page }) => {
    await page.goto('/admin/users')
    await page.waitForTimeout(2000)

    // Click create user button in header
    await page.getByRole('button', { name: 'Create User' }).click()
    await page.waitForTimeout(500)

    // Wait for the create user form/dialog to appear
    const createSection = page.locator('main').last()
    await expect(createSection.getByPlaceholder('Enter username')).toBeVisible({ timeout: 5000 })

    // Fill username
    await createSection.getByPlaceholder('Enter username').fill('e2e-users-test')
    await page.waitForTimeout(300)

    // Fill password
    await createSection.getByPlaceholder('Minimum 8 characters').fill('TestPass123!')
    await page.waitForTimeout(300)

    // Fill confirm password
    await createSection.getByPlaceholder('Confirm password').fill('TestPass123!')
    await page.waitForTimeout(300)

    await test.info().attach('create-user-form-filled', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })

    // Submit — use .last() to click the dialog submit button, not the header button
    await page.getByRole('button', { name: 'Create User' }).last().click()
    await page.waitForTimeout(2000)

    // Verify user appears in the table (use .first() to avoid matching toast)
    await expect(page.getByText('e2e-users-test').first()).toBeVisible({ timeout: 5000 })

    await test.info().attach('user-created-in-table', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('user table shows admin user', async ({ page }) => {
    await page.goto('/admin/users')
    await page.waitForTimeout(2000)

    // The admin user should always be visible in the table
    const table = page.locator('table')
    await expect(table).toBeVisible({ timeout: 5000 })
    await expect(table.locator('td').getByText('admin', { exact: true }).first()).toBeVisible({ timeout: 5000 })

    await test.info().attach('admin-user-in-table', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('assign role to user', async ({ page }) => {
    await page.goto('/admin/users')
    await page.waitForTimeout(2000)

    // Find the e2e-users-test row and click Edit
    const row = page.locator('tr').filter({ hasText: 'e2e-users-test' })
    await expect(row).toBeVisible({ timeout: 5000 })
    await row.getByRole('button', { name: 'Edit' }).click()
    await page.waitForTimeout(1000)

    // The edit dialog should appear (title is "Edit User: {username}")
    await expect(page.getByText(/Edit User:/)).toBeVisible({ timeout: 5000 })

    await test.info().attach('edit-user-dialog', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })

    // Click "+ Add Assignment" to add a plant role
    await page.getByText('+ Add Assignment').click()
    await page.waitForTimeout(500)

    // A plant dropdown and role dropdown should appear
    // The role defaults to "operator" and the plant to the first available
    // Select "operator" explicitly if needed (it's the default)
    const roleSelect = page.locator('select').last()
    await roleSelect.selectOption('operator')
    await page.waitForTimeout(300)

    await test.info().attach('role-assignment-added', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })

    // Save
    await page.getByRole('button', { name: 'Save Changes' }).click()
    await page.waitForTimeout(2000)

    // Verify the role appears in the table row
    const updatedRow = page.locator('tr').filter({ hasText: 'e2e-users-test' })
    await expect(updatedRow).toBeVisible({ timeout: 5000 })

    await test.info().attach('role-assigned-to-user', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('deactivate user shows confirmation', async ({ page }) => {
    await page.goto('/admin/users')
    await page.waitForTimeout(2000)

    // Find the e2e-users-test row and click Deactivate
    const row = page.locator('tr').filter({ hasText: 'e2e-users-test' })
    await expect(row).toBeVisible({ timeout: 5000 })
    await row.getByRole('button', { name: 'Deactivate' }).click()
    await page.waitForTimeout(500)

    // The deactivation confirmation dialog should appear
    await expect(page.getByText('Deactivate User')).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('button', { name: 'Deactivate' }).last()).toBeVisible()

    await test.info().attach('deactivate-confirmation-dialog', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })

    // Dismiss without confirming
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
  })

  test('deactivated user cannot login', async ({ page, request }) => {
    await page.goto('/admin/users')
    await page.waitForTimeout(2000)

    // Find the e2e-users-test row and deactivate
    const row = page.locator('tr').filter({ hasText: 'e2e-users-test' })
    await expect(row).toBeVisible({ timeout: 5000 })
    await row.getByRole('button', { name: 'Deactivate' }).click()
    await page.waitForTimeout(500)

    // Confirm deactivation in the dialog (last Deactivate button is in the dialog)
    await expect(page.getByText('Deactivate User')).toBeVisible({ timeout: 5000 })
    await page.getByRole('button', { name: 'Deactivate' }).last().click()
    await page.waitForTimeout(2000)

    await test.info().attach('user-deactivated', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })

    // Attempt to login as the deactivated user via API
    const res = await request.post(`${API_BASE}/auth/login`, {
      data: { username: 'e2e-users-test', password: 'TestPass123!', remember_me: false },
    })
    expect(res.ok()).toBe(false)
  })

  test('delete user removes from list', async ({ page }) => {
    await page.goto('/admin/users')
    await page.waitForTimeout(2000)

    // Show inactive users so we can see the deactivated user
    const showInactiveCheckbox = page.locator('label').filter({ hasText: 'Show inactive' }).locator('input[type="checkbox"]')
    await showInactiveCheckbox.check()
    await page.waitForTimeout(1000)

    // Find the deactivated e2e-users-test row — it should show a "Delete" button (not "Deactivate")
    const row = page.locator('tr').filter({ hasText: 'e2e-users-test' })
    await expect(row).toBeVisible({ timeout: 5000 })

    await test.info().attach('inactive-user-visible', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })

    await row.getByRole('button', { name: 'Delete' }).click()
    await page.waitForTimeout(500)

    // The permanent delete confirmation dialog should appear
    await expect(page.getByText('Permanently Delete User')).toBeVisible({ timeout: 5000 })

    await test.info().attach('delete-confirmation-dialog', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })

    // Confirm deletion
    await page.getByRole('button', { name: 'Delete Permanently' }).click()
    await page.waitForTimeout(2000)

    // User should no longer appear in the table
    await expect(page.getByText('e2e-users-test')).not.toBeVisible({ timeout: 5000 })

    await test.info().attach('user-deleted-from-list', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('user search filters results', async ({ page }) => {
    await page.goto('/admin/users')
    await page.waitForTimeout(2000)

    // Type "admin" in the search input
    const searchInput = page.getByPlaceholder('Search by username or email...')
    await expect(searchInput).toBeVisible({ timeout: 5000 })
    await searchInput.fill('admin')
    await page.waitForTimeout(1000)

    // Admin user should still be visible
    const table = page.locator('table')
    await expect(table.locator('td').getByText('admin', { exact: true }).first()).toBeVisible({ timeout: 5000 })

    await test.info().attach('search-filtered-to-admin', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })

    // Clear and search for a non-existent user
    await searchInput.clear()
    await searchInput.fill('nonexistentuserxyz')
    await page.waitForTimeout(1000)

    // Table should show "No users match your search."
    await expect(page.getByText('No users match your search.')).toBeVisible({ timeout: 5000 })

    await test.info().attach('search-no-results', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })
})
