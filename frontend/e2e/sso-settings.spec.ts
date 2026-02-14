import { test, expect } from './fixtures'
import { loginAsAdmin } from './helpers/auth'
import { getAuthToken, apiGet, apiDelete } from './helpers/api'

test.describe.serial('SSO Settings', () => {
  let token: string

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request)

    // Clean up any leftover test OIDC providers from prior runs
    try {
      const configs = await apiGet(request, '/auth/oidc/config', token)
      for (const config of configs as { id: number; name: string }[]) {
        if (config.name.startsWith('E2E ')) {
          await apiDelete(request, `/auth/oidc/config/${config.id}`, token)
        }
      }
    } catch {
      // Cleanup is best-effort
    }
  })

  test.afterAll(async ({ request }) => {
    // Clean up any OIDC providers created during tests
    try {
      const t = await getAuthToken(request)
      const configs = await apiGet(request, '/auth/oidc/config', t)
      for (const config of configs as { id: number; name: string }[]) {
        if (config.name.startsWith('E2E ')) {
          await apiDelete(request, `/auth/oidc/config/${config.id}`, t)
        }
      }
    } catch {
      // Cleanup is best-effort
    }
  })

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/settings/sso')
    await page.waitForTimeout(2000)
  })

  test('SSO settings page renders', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: 'Single Sign-On' }),
    ).toBeVisible({ timeout: 10000 })

    await test.info().attach('sso-page-renders', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('add provider button visible', async ({ page }) => {
    const addBtn = page.getByRole('button', { name: 'Add Provider' })
    await expect(addBtn).toBeVisible({ timeout: 5000 })

    await test.info().attach('sso-add-provider-button', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('open create provider dialog', async ({ page }) => {
    await page.getByRole('button', { name: 'Add Provider' }).click()
    await page.waitForTimeout(1000)

    await expect(page.getByText('Add SSO Provider')).toBeVisible({ timeout: 5000 })

    await test.info().attach('sso-create-dialog', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('create form has all fields', async ({ page }) => {
    await page.getByRole('button', { name: 'Add Provider' }).click()
    await page.waitForTimeout(1000)

    // Display Name
    await expect(
      page.getByPlaceholder('e.g. Azure AD, Okta, Keycloak'),
    ).toBeVisible({ timeout: 5000 })

    // Issuer URL
    await expect(
      page.getByPlaceholder('https://login.microsoftonline.com/tenant-id/v2.0'),
    ).toBeVisible({ timeout: 3000 })

    // Client ID
    await expect(page.getByText('Client ID').first()).toBeVisible({ timeout: 3000 })

    // Client Secret (password field)
    const secretInput = page.locator('input[type="password"]').first()
    await expect(secretInput).toBeVisible({ timeout: 3000 })

    // Auto-provision checkbox
    await expect(
      page.getByText('Auto-provision new users on first SSO login'),
    ).toBeVisible({ timeout: 3000 })

    // Create Provider button
    await expect(
      page.getByRole('button', { name: 'Create Provider' }),
    ).toBeVisible({ timeout: 3000 })

    await test.info().attach('sso-form-fields', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('create an OIDC provider', async ({ page }) => {
    await page.getByRole('button', { name: 'Add Provider' }).click()
    await page.waitForTimeout(1000)

    // Fill Display Name
    await page.getByPlaceholder('e.g. Azure AD, Okta, Keycloak').fill('E2E Test IdP')

    // Fill Issuer URL
    await page
      .getByPlaceholder('https://login.microsoftonline.com/tenant-id/v2.0')
      .fill('https://idp.test.local/.well-known/openid-configuration')

    // Fill Client ID — find by label text, then navigate to sibling input
    const clientIdLabel = page.getByText('Client ID', { exact: true })
    await expect(clientIdLabel).toBeVisible({ timeout: 3000 })
    const clientIdField = clientIdLabel.locator('..').locator('input').first()
    await expect(clientIdField).toBeVisible({ timeout: 2000 })
    await clientIdField.fill('test-client-id')

    // Fill Client Secret
    const secretInput = page.locator('input[type="password"]').first()
    await secretInput.fill('test-secret-123')

    // Auto-provision checkbox (checked by default, verify it)
    const autoProvision = page.locator('#auto-provision')
    await expect(autoProvision).toBeVisible({ timeout: 2000 })
    if (!(await autoProvision.isChecked())) {
      await autoProvision.check()
    }

    await test.info().attach('sso-form-filled', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })

    // Click Create Provider
    await page.getByRole('button', { name: 'Create Provider' }).click()
    await page.waitForTimeout(3000)

    // Verify provider appears in table
    await expect(page.getByText('E2E Test IdP').first()).toBeVisible({ timeout: 10000 })

    await test.info().attach('sso-provider-created', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('provider table shows correct data', async ({ page }) => {
    await expect(page.getByText('E2E Test IdP')).toBeVisible({ timeout: 10000 })

    // Status badge should show Active
    await expect(page.getByText('Active').first()).toBeVisible({ timeout: 5000 })

    // Table should have column headers
    await expect(page.getByText('Name').first()).toBeVisible({ timeout: 3000 })
    await expect(page.getByText('Issuer').first()).toBeVisible({ timeout: 3000 })
    await expect(page.getByText('Status').first()).toBeVisible({ timeout: 3000 })

    await test.info().attach('sso-provider-table', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('edit provider updates name', async ({ page }) => {
    await expect(page.getByText('E2E Test IdP')).toBeVisible({ timeout: 10000 })

    // Click edit button
    const editBtn = page.getByTitle('Edit provider').first()
    await expect(editBtn).toBeVisible({ timeout: 5000 })
    await editBtn.click()
    await page.waitForTimeout(1000)

    // Dialog should show "Edit SSO Provider"
    await expect(page.getByText('Edit SSO Provider')).toBeVisible({ timeout: 5000 })

    // Password placeholder should show masked value (****) in edit mode
    const secretInput = page.locator('input[type="password"]').first()
    const placeholder = await secretInput.getAttribute('placeholder')
    expect(placeholder).toBe('****')

    // Update name
    const nameInput = page.getByPlaceholder('e.g. Azure AD, Okta, Keycloak')
    await nameInput.clear()
    await nameInput.fill('E2E Updated IdP')

    await test.info().attach('sso-edit-dialog', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })

    // Save
    await page.getByRole('button', { name: 'Save Changes' }).click()
    await page.waitForTimeout(3000)

    // Verify updated name
    await expect(page.getByText('E2E Updated IdP')).toBeVisible({ timeout: 10000 })

    await test.info().attach('sso-provider-updated', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('delete provider removes from table', async ({ page }) => {
    await expect(page.getByText('E2E Updated IdP')).toBeVisible({ timeout: 10000 })

    // Click delete button
    const deleteBtn = page.getByTitle('Delete provider').first()
    await expect(deleteBtn).toBeVisible({ timeout: 5000 })
    await deleteBtn.click()
    await page.waitForTimeout(1000)

    // Confirm deletion (inline confirm button)
    const confirmBtn = page.getByRole('button', { name: 'Confirm' })
    await expect(confirmBtn).toBeVisible({ timeout: 3000 })
    await confirmBtn.click()
    await page.waitForTimeout(2000)

    // Verify removed
    await expect(page.getByText('E2E Updated IdP')).not.toBeVisible({ timeout: 5000 })

    await test.info().attach('sso-provider-deleted', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('cancel create closes dialog', async ({ page }) => {
    await page.getByRole('button', { name: 'Add Provider' }).click()
    await page.waitForTimeout(1000)

    await expect(page.getByText('Add SSO Provider')).toBeVisible({ timeout: 5000 })

    await page.getByRole('button', { name: 'Cancel' }).click()
    await page.waitForTimeout(500)

    await expect(page.getByText('Add SSO Provider')).not.toBeVisible({ timeout: 5000 })

    await test.info().attach('sso-cancel-dialog', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })
})
