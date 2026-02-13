import { type Page, expect } from '@playwright/test'

/**
 * Log in as the bootstrap admin user (admin/admin).
 * Waits for the dashboard to load before returning.
 */
export async function loginAsAdmin(page: Page) {
  await page.goto('/login')
  await page.locator('#username').fill('admin')
  await page.locator('#password').fill('admin')
  await page.getByRole('button', { name: 'Sign In' }).click()
  await page.waitForURL('**/dashboard', { timeout: 15000 })
  await expect(page.locator('body')).toBeVisible()
}

/**
 * Log in as a specific user with given credentials.
 * Waits for the dashboard to load before returning.
 */
export async function loginAsUser(page: Page, username: string, password: string) {
  await page.goto('/login')
  await page.locator('#username').fill(username)
  await page.locator('#password').fill(password)
  await page.getByRole('button', { name: 'Sign In' }).click()
  await page.waitForURL('**/dashboard', { timeout: 15000 })
  await expect(page.locator('body')).toBeVisible()
}
