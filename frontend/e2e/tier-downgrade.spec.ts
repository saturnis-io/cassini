/**
 * — Tier downgrade live check.
 *
 * The dev backend runs at CASSINI_DEV_TIER=enterprise. To verify community
 * tier behaviour without restarting the server, we intercept
 * /api/v1/license/status to return community defaults. The frontend
 * `useLicense()` hook reads from this endpoint, so the entire UI tree
 * sees community.
 *
 * Asserts:
 *  - Sidebar hides Pro/Enterprise nav items (Lakehouse, CEP Rules, FAI, Analytics).
 *  - Direct-URL nav to /lakehouse and /cep-rules surfaces the upgrade
 *    prompt — NOT a blank screen, NOT a raw 403.
 */
import { test, expect } from './fixtures'
import { loginAsAdmin } from './helpers/auth'

const COMMUNITY_PAYLOAD = {
  edition: 'community',
  tier: 'community',
  licensed_tier: null,
  max_plants: 1,
  expires_at: null,
  days_until_expiry: null,
  is_expired: null,
  instance_id: null,
  features: [],
}

test.describe('Tier Downgrade', () => {
  test.beforeEach(async ({ page }) => {
    // Stub license status to community for every request before any page
    // load. The hook calls /api/v1/license/status on first mount.
    await page.route('**/api/v1/license/status', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(COMMUNITY_PAYLOAD),
      }),
    )
  })

  test('sidebar hides Pro/Enterprise nav items in community mode', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    const sidebar = page.locator('aside').first()
    await expect(sidebar).toBeVisible({ timeout: 10000 })

    // Community-tier items should still appear.
    await expect(sidebar.getByRole('link', { name: /^Dashboard$/i })).toBeVisible()
    await expect(sidebar.getByRole('link', { name: /^Data Entry$/i })).toBeVisible()
    await expect(sidebar.getByRole('link', { name: /^Violations/i })).toBeVisible()

    // Pro/Enterprise items must NOT appear in community mode.
    await expect(sidebar.getByRole('link', { name: /^Lakehouse$/i })).toHaveCount(0)
    await expect(sidebar.getByRole('link', { name: /^CEP Rules$/i })).toHaveCount(0)
    await expect(sidebar.getByRole('link', { name: /^FAI$/i })).toHaveCount(0)
    await expect(sidebar.getByRole('link', { name: /^Analytics$/i })).toHaveCount(0)
  })

  test('direct nav to /lakehouse shows upgrade prompt', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/lakehouse')
    await page.waitForLoadState('networkidle')

    // RequiresTier with fallback={<UpgradePage />} should render.
    await expect(page.getByRole('heading', { name: /Commercial Feature/i })).toBeVisible({
      timeout: 10000,
    })
    // The lakehouse page itself must NOT have rendered.
    await expect(page.locator('[data-ui="lakehouse-page"]')).toHaveCount(0)
  })

  test('direct nav to /cep-rules shows upgrade prompt', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/cep-rules')
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('heading', { name: /Commercial Feature/i })).toBeVisible({
      timeout: 10000,
    })
    await expect(
      page.getByRole('heading', { name: /Streaming CEP Rules/i }),
    ).toHaveCount(0)
  })
})
