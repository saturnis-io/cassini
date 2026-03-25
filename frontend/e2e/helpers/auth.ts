import { type Page, expect } from '@playwright/test'

/**
 * Log in as the bootstrap admin user (admin/admin).
 * Waits for the dashboard to load before returning.
 * Uses explicit wait for the login page to settle — after long-running tests
 * the previous page may still be tearing down when the next test starts.
 */
export async function loginAsAdmin(page: Page) {
  await page.goto('/login', { waitUntil: 'networkidle' })
  await expect(page.locator('#username')).toBeVisible({ timeout: 10000 })
  await page.locator('#username').fill('admin')
  await page.locator('#password').fill('admin')
  await page.getByRole('button', { name: 'Log In', exact: true }).click()
  await page.waitForURL('**/dashboard', { timeout: 20000 })
  await expect(page.locator('body')).toBeVisible()
}

/**
 * Log in as a specific user with given credentials.
 * Waits for the dashboard to load before returning.
 */
export async function loginAsUser(page: Page, username: string, password: string) {
  await page.goto('/login', { waitUntil: 'networkidle' })
  await expect(page.locator('#username')).toBeVisible({ timeout: 10000 })
  await page.locator('#username').fill(username)
  await page.locator('#password').fill(password)
  await page.getByRole('button', { name: 'Log In', exact: true }).click()
  await page.waitForURL('**/dashboard', { timeout: 20000 })
  await expect(page.locator('body')).toBeVisible()
}
