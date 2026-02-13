import { test, expect } from './fixtures'
import { loginAsUser } from './helpers/auth'
import { getAuthToken, apiPost } from './helpers/api'
import { seedFullHierarchy, enterSample, createUser, assignRole, createPlant, switchToPlant } from './helpers/seed'

test.describe('RBAC', () => {
  let token: string
  let plantId: number

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request)

    // Create test plant
    const plant = await createPlant(request, token, 'RBAC Plant')
    plantId = plant.id

    // Seed hierarchy with manual control limits (CL=10, UCL=11.5, LCL=8.5)
    const seeded = await seedFullHierarchy(request, token, 'RBAC Plant')
    // Enter OOC value above UCL to trigger violations using manual limits
    await enterSample(request, token, seeded.characteristic.id, [15.0])
    await enterSample(request, token, seeded.characteristic.id, [16.0])

    // Create 4 test users with different roles
    const operator = await createUser(request, token, 'rbac-operator', 'RbacOper123!')
    await assignRole(request, token, operator.id, plantId, 'operator')

    const supervisor = await createUser(request, token, 'rbac-supervisor', 'RbacSuper123!')
    await assignRole(request, token, supervisor.id, plantId, 'supervisor')

    const engineer = await createUser(request, token, 'rbac-engineer', 'RbacEng123!')
    await assignRole(request, token, engineer.id, plantId, 'engineer')

    const admin2 = await createUser(request, token, 'rbac-admin2', 'RbacAdmin123!')
    await assignRole(request, token, admin2.id, plantId, 'admin')
  })

  // --- Operator tests ---

  test('operator can access dashboard', async ({ page }) => {
    await loginAsUser(page, 'rbac-operator', 'RbacOper123!')
    await switchToPlant(page, 'RBAC Plant')

    await page.goto('/dashboard')
    await page.waitForTimeout(2000)
    await expect(page.locator('body')).toBeVisible()

    await test.info().attach('operator-dashboard', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('operator can access data entry', async ({ page }) => {
    await loginAsUser(page, 'rbac-operator', 'RbacOper123!')
    await switchToPlant(page, 'RBAC Plant')

    await page.goto('/data-entry')
    await expect(page.getByRole('heading', { name: 'Data Entry' })).toBeVisible({ timeout: 10000 })

    await test.info().attach('operator-data-entry', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('operator cannot access configuration', async ({ page }) => {
    await loginAsUser(page, 'rbac-operator', 'RbacOper123!')
    await switchToPlant(page, 'RBAC Plant')

    await page.goto('/configuration')
    await page.waitForURL('**/dashboard', { timeout: 5000 })
    await expect(page).toHaveURL(/\/dashboard/)

    await test.info().attach('operator-config-redirect', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('operator cannot access admin users', async ({ page }) => {
    await loginAsUser(page, 'rbac-operator', 'RbacOper123!')
    await switchToPlant(page, 'RBAC Plant')

    await page.goto('/admin/users')
    await page.waitForURL('**/dashboard', { timeout: 5000 })
    await expect(page).toHaveURL(/\/dashboard/)

    await test.info().attach('operator-admin-redirect', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('operator sidebar hides engineer+ items', async ({ page }) => {
    await loginAsUser(page, 'rbac-operator', 'RbacOper123!')
    await switchToPlant(page, 'RBAC Plant')

    await page.goto('/dashboard')
    await page.waitForTimeout(2000)

    await expect(page.getByRole('link', { name: 'Configuration' })).not.toBeVisible()
    await expect(page.getByRole('link', { name: 'Connectivity' })).not.toBeVisible()

    await test.info().attach('operator-sidebar', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  // --- Supervisor tests ---

  test('supervisor can access reports', async ({ page }) => {
    await loginAsUser(page, 'rbac-supervisor', 'RbacSuper123!')
    await switchToPlant(page, 'RBAC Plant')

    await page.goto('/reports')
    await page.waitForTimeout(2000)
    await expect(page.locator('body')).toBeVisible()

    await test.info().attach('supervisor-reports', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('supervisor can see acknowledge button', async ({ page }) => {
    await loginAsUser(page, 'rbac-supervisor', 'RbacSuper123!')
    await switchToPlant(page, 'RBAC Plant')

    await page.goto('/violations')
    await page.waitForTimeout(3000)

    // Switch to "All" filter to see all violations
    const allButton = page.getByRole('button', { name: 'All', exact: true })
    if (await allButton.isVisible({ timeout: 3000 })) {
      await allButton.click()
      await page.waitForTimeout(1000)
    }

    // Wait for table to render
    const table = page.locator('table')
    await expect(table).toBeVisible({ timeout: 5000 })

    const ackButton = page.getByRole('button', { name: 'Acknowledge', exact: true }).first()
    await expect(ackButton).toBeVisible({ timeout: 5000 })

    await test.info().attach('supervisor-violations-ack', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  // --- Engineer tests ---

  test('engineer can access connectivity', async ({ page }) => {
    await loginAsUser(page, 'rbac-engineer', 'RbacEng123!')
    await switchToPlant(page, 'RBAC Plant')

    await page.goto('/connectivity')
    await page.waitForTimeout(2000)
    await expect(page.locator('body')).toBeVisible()

    await test.info().attach('engineer-connectivity', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('engineer can access configuration', async ({ page }) => {
    await loginAsUser(page, 'rbac-engineer', 'RbacEng123!')
    await switchToPlant(page, 'RBAC Plant')

    await page.goto('/configuration')
    await page.waitForTimeout(2000)
    await expect(page.locator('body')).toBeVisible()

    await test.info().attach('engineer-configuration', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('engineer sees API Keys and Retention tabs', async ({ page }) => {
    await loginAsUser(page, 'rbac-engineer', 'RbacEng123!')
    await switchToPlant(page, 'RBAC Plant')

    await page.goto('/settings')
    await page.waitForTimeout(2000)

    await expect(page.getByText('API Keys')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Retention')).toBeVisible({ timeout: 5000 })

    await test.info().attach('engineer-settings-tabs', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('engineer cannot access admin users', async ({ page }) => {
    await loginAsUser(page, 'rbac-engineer', 'RbacEng123!')
    await switchToPlant(page, 'RBAC Plant')

    await page.goto('/admin/users')
    await page.waitForURL('**/dashboard', { timeout: 5000 })
    await expect(page).toHaveURL(/\/dashboard/)

    await test.info().attach('engineer-admin-redirect', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  // --- Admin tests ---

  test('admin can access all pages', async ({ page }) => {
    await loginAsUser(page, 'rbac-admin2', 'RbacAdmin123!')
    await switchToPlant(page, 'RBAC Plant')

    // Admin users page
    await page.goto('/admin/users')
    await expect(page.getByRole('heading', { name: 'User Management' })).toBeVisible({ timeout: 10000 })

    await test.info().attach('admin-users-page', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })

    // Settings page
    await page.goto('/settings')
    await page.waitForTimeout(2000)
    await expect(page.locator('body')).toBeVisible()

    // Connectivity page
    await page.goto('/connectivity')
    await page.waitForTimeout(2000)
    await expect(page.locator('body')).toBeVisible()

    // Configuration page
    await page.goto('/configuration')
    await page.waitForTimeout(2000)
    await expect(page.locator('body')).toBeVisible()

    await test.info().attach('admin-configuration-page', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })
})
