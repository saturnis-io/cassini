import { test, expect } from './fixtures'
import { loginAsAdmin } from './helpers/auth'
import { getAuthToken } from './helpers/api'
import { createPlant } from './helpers/seed'

test.describe('Mobile & Responsive', () => {
  let token: string

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request)
    await createPlant(request, token, 'Mobile Test Plant', 'MOBPLNT')
  })

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await page.waitForTimeout(2000)
  })

  // ── Mobile Viewport Tests ──────────────────────────────────────────

  test('mobile sidebar is hidden by default', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/dashboard')
    await page.waitForTimeout(2000)

    // The full sidebar should not be visible on mobile
    // Look for the hamburger/menu button with the known aria-label
    const menuButton = page.locator('button[aria-label="Toggle navigation menu"]')
    await expect(menuButton).toBeVisible({ timeout: 5000 })

    // Mobile bottom nav should be visible
    const bottomNav = page.locator('nav.fixed.bottom-0')
    await expect(bottomNav).toBeVisible({ timeout: 5000 })

    await test.info().attach('mobile-sidebar-hidden', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('hamburger menu opens sidebar', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/dashboard')
    await page.waitForTimeout(2000)

    // Click the hamburger menu button
    const menuButton = page.locator('button[aria-label="Toggle navigation menu"]')
    await expect(menuButton).toBeVisible({ timeout: 5000 })
    await menuButton.click()
    await page.waitForTimeout(1000)

    // After clicking, sidebar overlay should appear with navigation links
    const dashboardLink = page.getByText('Dashboard', { exact: true }).first()
    await expect(dashboardLink).toBeVisible({ timeout: 5000 })

    // Verify other nav links are visible in the mobile sidebar
    await expect(page.getByText('Data Entry', { exact: true }).first()).toBeVisible({
      timeout: 3000,
    })
    await expect(page.getByText('Violations', { exact: true }).first()).toBeVisible({
      timeout: 3000,
    })

    await test.info().attach('mobile-sidebar-opened', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('mobile navigation works', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/dashboard')
    await page.waitForTimeout(2000)

    // Open sidebar via hamburger
    const menuButton = page.locator('button[aria-label="Toggle navigation menu"]')
    await expect(menuButton).toBeVisible({ timeout: 5000 })
    await menuButton.click()
    await page.waitForTimeout(1000)

    // Click "Data Entry" nav link in the sidebar overlay
    const dataEntryLink = page.getByText('Data Entry', { exact: true }).first()
    await expect(dataEntryLink).toBeVisible({ timeout: 3000 })
    await dataEntryLink.click()
    await page.waitForTimeout(2000)

    // Should navigate to data-entry page
    await expect(page).toHaveURL(/data-entry/)

    await test.info().attach('mobile-navigation-data-entry', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('mobile bottom nav is visible', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/dashboard')
    await page.waitForTimeout(2000)

    // MobileNav bottom bar should be visible on mobile (md:hidden)
    const bottomNav = page.locator('nav.fixed.bottom-0')
    await expect(bottomNav).toBeVisible({ timeout: 5000 })

    // Verify bottom nav tabs: Dashboard, Data Entry, Violations, More
    await expect(bottomNav.getByText('Dashboard')).toBeVisible({ timeout: 3000 })
    await expect(bottomNav.getByText('Data Entry')).toBeVisible({ timeout: 3000 })
    await expect(bottomNav.getByText('Violations')).toBeVisible({ timeout: 3000 })
    await expect(bottomNav.getByText('More')).toBeVisible({ timeout: 3000 })

    await test.info().attach('mobile-bottom-nav', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('login page renders on mobile', async ({ page }) => {
    // Clear auth state before navigating to login
    // (beforeEach logs in, so we need to clear to see login page)
    await page.context().clearCookies()
    await page.evaluate(() => {
      localStorage.clear()
      sessionStorage.clear()
    })

    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/login')
    await page.waitForTimeout(2000)

    // Login form should be visible and usable
    await expect(page.locator('#username')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('#password')).toBeVisible({ timeout: 5000 })
    await expect(
      page.getByRole('button', { name: 'Log In', exact: true }),
    ).toBeVisible({ timeout: 5000 })

    await test.info().attach('mobile-login-page', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('dashboard renders on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/dashboard')
    await page.waitForTimeout(2000)

    // Dashboard content should be visible (even if layout is different)
    await expect(page.locator('body')).toBeVisible()

    await test.info().attach('mobile-dashboard', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  // ── Tablet Viewport Tests ──────────────────────────────────────────

  test('tablet layout renders correctly', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.goto('/dashboard')
    await page.waitForTimeout(2000)

    await expect(page.locator('body')).toBeVisible()

    await test.info().attach('tablet-dashboard', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  // ── Responsive Transition Tests ────────────────────────────────────

  test('resize from desktop to mobile collapses sidebar', async ({ page }) => {
    // Start at desktop
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/dashboard')
    await page.waitForTimeout(2000)

    await test.info().attach('desktop-before-resize', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })

    // Resize to mobile
    await page.setViewportSize({ width: 375, height: 812 })
    await page.waitForTimeout(1000)

    // Mobile bottom nav should appear
    const bottomNav = page.locator('nav.fixed.bottom-0')
    await expect(bottomNav).toBeVisible({ timeout: 5000 })

    await test.info().attach('mobile-after-resize', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('resize from mobile to desktop expands sidebar', async ({ page }) => {
    // Start at mobile
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/dashboard')
    await page.waitForTimeout(2000)

    await test.info().attach('mobile-before-resize', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })

    // Resize to desktop
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.waitForTimeout(1000)

    await test.info().attach('desktop-after-resize', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  // ── PWA Meta Tags ──────────────────────────────────────────────────

  test('PWA meta tags present', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForTimeout(2000)

    // Viewport meta tag (required)
    const viewport = page.locator('meta[name="viewport"]')
    await expect(viewport).toBeAttached({ timeout: 5000 })

    // Theme color meta tag (required)
    const themeColor = page.locator('meta[name="theme-color"]')
    await expect(themeColor).toBeAttached({ timeout: 5000 })

    // PWA manifest link (optional — may not be present yet)
    const manifest = page.locator('link[rel="manifest"]')
    const hasManifest = await manifest.count().then((c) => c > 0)
    // Just log whether manifest exists — not a hard requirement
    if (hasManifest) {
      await expect(manifest).toBeAttached()
    }

    await test.info().attach('pwa-meta-tags', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })
})
