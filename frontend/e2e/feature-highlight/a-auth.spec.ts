/**
 * Group A — Authentication and Onboarding (CATALOG.md A1-A4).
 *
 * P0 states implemented:
 *   A1.01 Login default
 *   A1.03 Submitting (button disabled / spinner)
 *   A2.01 Change Password default
 *   A2.03 Change Password success → dashboard
 *   A4.01 Plant switcher single-plant
 *
 * Other states (A1.02 SSO buttons, A1.04 invalid creds, A2.02 validation
 * error, A3.* forgot/reset, A4.02-03) are P1/P2 and stubbed below.
 */
import { test, expect } from '../fixtures'
import { captureScreenshot } from './helpers'
import { loginAsAdmin } from '../helpers/auth'

const GROUP = 'A'

test.describe('Group A — Authentication & Onboarding', () => {
  // -- A1. Login Page ---------------------------------------------------
  test.describe('A1 — Login Page', () => {
    const FEATURE = 'A1-login-page'

    test('A1.01 — default', async ({ page, context }, testInfo) => {
      await context.clearCookies()
      await page.goto('/login', { waitUntil: 'networkidle' })
      // Wait for username input to be visible — Three.js scene loads in
      // background with React.lazy, so we time out the login form rather
      // than the canvas.
      await expect(page.locator('#username')).toBeVisible({ timeout: 10000 })
      await page.waitForTimeout(1500)
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '01',
        stateName: 'default',
      })
    })

    test('A1.03 — submitting', async ({ page, context }, testInfo) => {
      await context.clearCookies()
      await page.goto('/login', { waitUntil: 'networkidle' })
      await expect(page.locator('#username')).toBeVisible({ timeout: 10000 })
      await page.locator('#username').fill('admin')
      await page.locator('#password').fill('admin')
      // Click without awaiting completion so we can capture the in-flight
      // submitting state. Wait briefly for the button to disable.
      const button = page.getByRole('button', { name: 'Log In', exact: true })
      const submission = button.click()
      await page.waitForTimeout(150)
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '03',
        stateName: 'submitting',
      })
      await submission
    })

    test.skip('A1.02 — SSO providers visible', () => {
      // P1 — requires OIDC provider config
    })
    test.skip('A1.04 — invalid credentials', () => {
      // P1 — pending
    })
    test.skip('A1.05 — OIDC callback processing', () => {
      // P2 — requires real OIDC redirect
    })
  })

  // -- A2. Change Password ----------------------------------------------
  test.describe('A2 — Change Password Page', () => {
    const FEATURE = 'A2-change-password'

    test('A2.01 — default', async ({ page, context }, testInfo) => {
      // Use the dedicated `change.me.user` (must_change_password=true)
      // so admin's normal-login flow is not affected. Logging in as this
      // user triggers a redirect to /change-password.
      await context.clearCookies()
      await page.goto('/login', { waitUntil: 'networkidle' })
      await expect(page.locator('#username')).toBeVisible({ timeout: 10000 })
      await page.locator('#username').fill('change.me.user')
      await page.locator('#password').fill('seed-pass-1')
      await page.getByRole('button', { name: 'Log In', exact: true }).click()
      await page.waitForURL('**/change-password', { timeout: 10000 })
      await page.waitForTimeout(1000)
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '01',
        stateName: 'default',
      })
    })

    test('A2.03 — success-to-dashboard', async ({ page }, testInfo) => {
      // Captures the dashboard immediately after a successful login.
      // Admin has must_change_password=false in this seed, so a normal
      // admin login lands directly on /dashboard.
      await loginAsAdmin(page)
      await expect(page).toHaveURL(/\/dashboard/)
      await page.waitForTimeout(1500)
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '03',
        stateName: 'success-redirect',
      })
    })

    test.skip('A2.02 — validation error', () => {
      // P1 — pending
    })
  })

  // -- A3. Forgot / Reset Password ---------------------------------------
  test.describe('A3 — Forgot / Reset Password', () => {
    test.skip('A3.01-04 — all states are P1', () => {
      // P1 — pending
    })
  })

  // -- A4. Plant Switcher ------------------------------------------------
  test.describe('A4 — Plant Switcher', () => {
    const FEATURE = 'A4-plant-switcher'

    test('A4.01 — single-plant or default', async ({ page }, testInfo) => {
      await loginAsAdmin(page)
      await page.waitForTimeout(1500)
      // The plant selector lives in the top header. With seed_feature_tour
      // there are 3 plants — admin sees the dropdown. Capture in default
      // (closed) state so the screenshot shows the selector chip.
      const selector = page.locator('[data-ui="plant-selector"]')
      await expect(selector).toBeVisible({ timeout: 10000 })
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '01',
        stateName: 'default',
      })
    })

    test.skip('A4.02 — multi-plant dropdown open', () => {
      // P1 — pending
    })
    test.skip('A4.03 — plant selected', () => {
      // P1 — pending
    })
  })
})
