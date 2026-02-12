import { test, expect } from './fixtures'
import { loginAsAdmin } from './helpers/auth'

test.describe('Authentication', () => {
  test('login with valid credentials redirects to dashboard', async ({ page }) => {
    await page.goto('/login')

    await test.info().attach('login-page', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })

    await page.locator('#username').fill('admin')
    await page.locator('#password').fill('admin')
    await page.getByRole('button', { name: 'Sign In' }).click()
    await page.waitForURL('**/dashboard', { timeout: 15000 })
    await expect(page).toHaveURL(/\/dashboard/)

    await test.info().attach('dashboard-after-login', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('login with invalid credentials shows error', async ({ page }) => {
    await page.goto('/login')
    await page.locator('#username').fill('admin')
    await page.locator('#password').fill('wrongpassword')
    await page.getByRole('button', { name: 'Sign In' }).click()

    // Error message should appear
    await expect(page.locator('.bg-destructive\\/10')).toBeVisible({ timeout: 5000 })

    await test.info().attach('login-error-message', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('logout redirects to login page', async ({ page }) => {
    await loginAsAdmin(page)

    // Open user menu and click Sign Out
    await page.getByTitle('User menu').click()
    await page.getByText('Sign Out').click()
    await page.waitForURL('**/login', { timeout: 10000 })
    await expect(page).toHaveURL(/\/login/)

    await test.info().attach('login-page-after-logout', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('unauthenticated access to /dashboard redirects to /login', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForURL('**/login', { timeout: 10000 })
    await expect(page).toHaveURL(/\/login/)
  })
})
