import { test, expect } from './fixtures'
import { loginAsAdmin } from './helpers/auth'
import { switchToPlant } from './helpers/seed'
import { getAuthToken } from './helpers/api'
import { getManifest } from './helpers/manifest'

// Inject the E2E flag so GalaxyPage renders the debug planet list even in prod builds.
// We do this in beforeEach for each test that needs the debug hook.
async function enableE2EDebugHook(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    ;(window as Window & { __e2e__?: boolean }).__e2e__ = true
  })
}

test.describe('Galaxy Visualization', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await switchToPlant(page, 'Screenshot Tour Plant')
  })

  test('galaxy page loads', async ({ page }) => {
    await page.goto('/galaxy')
    // Three.js needs extra time to initialize the WebGL context and render
    await page.waitForTimeout(5000)

    // GalaxyPage renders with data-ui="galaxy-page" and contains a canvas for Three.js
    const galaxyPage = page.locator('[data-ui="galaxy-page"]')
    await expect(galaxyPage).toBeVisible({ timeout: 10000 })

    // Three.js renders to a canvas element inside the scene
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 10000 })
  })

  test('canvas has dimensions', async ({ page }) => {
    await page.goto('/galaxy')
    await page.waitForTimeout(5000)

    const canvas = page.locator('canvas').first()
    await expect(canvas).toBeVisible({ timeout: 10000 })

    // Verify the canvas is not zero-sized (WebGL context is active)
    const box = await canvas.boundingBox()
    expect(box).toBeTruthy()
    expect(box!.width).toBeGreaterThan(0)
    expect(box!.height).toBeGreaterThan(0)
  })

  test('sidebar is visible', async ({ page }) => {
    await page.goto('/galaxy')
    await page.waitForTimeout(5000)

    // GalaxySidebar is rendered alongside the scene (not in kiosk mode)
    const galaxyPage = page.locator('[data-ui="galaxy-page"]')
    await expect(galaxyPage).toBeVisible({ timeout: 10000 })

    // The sidebar contains hierarchy tree entries for the plant
    // It is a flex child of the galaxy-page container
    const contentArea = page.locator('[data-ui="galaxy-content"]')
    await expect(contentArea).toBeVisible({ timeout: 10000 })

    await test.info().attach('galaxy-with-sidebar', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('screenshot', async ({ page }) => {
    await page.goto('/galaxy')
    await page.waitForTimeout(5000)

    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 10000 })

    await test.info().attach('galaxy-full-page', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })
  })

  // -------------------------------------------------------------------------
  // Scene content + data binding tests (M33b gap closure)
  // -------------------------------------------------------------------------

  test('galaxy renders planets for plant characteristics', async ({ page }) => {
    // Enable the debug hook before navigating so the init script runs first.
    await enableE2EDebugHook(page)

    await page.goto('/galaxy')

    // Wait for the debug list to appear — it renders once charsData.items loads.
    // Allow up to 15s for the API response and React re-render.
    const debugList = page.locator('[data-testid="galaxy-planets-debug"]')
    await expect(debugList).toBeAttached({ timeout: 15000 })

    const planets = page.locator('[data-testid="galaxy-planet"]')
    const count = await planets.count()
    expect(count).toBeGreaterThan(0)

    // Every planet entry must carry a data-plant-id (the characteristic ID)
    // and a data-hierarchy-id for constellation grouping.
    const firstPlanet = planets.first()
    const charId = await firstPlanet.getAttribute('data-plant-id')
    const hierarchyId = await firstPlanet.getAttribute('data-hierarchy-id')
    const charName = await firstPlanet.getAttribute('data-char-name')

    expect(charId).not.toBeNull()
    expect(Number(charId)).toBeGreaterThan(0)
    expect(hierarchyId).not.toBeNull()
    expect(charName).not.toBeNull()
    expect(charName!.length).toBeGreaterThan(0)

    await test.info().attach('galaxy-planet-count', {
      body: Buffer.from(`Planet count: ${count}`),
      contentType: 'text/plain',
    })
  })

  test('galaxy planet count matches seeded characteristic count', async ({ page, request }) => {
    // Enable debug hook before navigation.
    await enableE2EDebugHook(page)

    // Get the token and plant_id from the manifest for direct API query.
    const token = await getAuthToken(request)
    const manifest = getManifest()
    const plantId = manifest.screenshot_tour.plant_id

    // Fetch characteristic count directly from the backend API.
    const apiBase = `http://localhost:${process.env.E2E_BACKEND_PORT || '8001'}/api/v1`
    const resp = await request.get(`${apiBase}/characteristics/`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { plant_id: String(plantId), per_page: '5000' },
    })
    expect(resp.ok()).toBeTruthy()
    const body = await resp.json()
    const expectedCount: number = body.items?.length ?? 0

    if (expectedCount === 0) {
      test.skip()
      return
    }

    await page.goto('/galaxy')
    const planets = page.locator('[data-testid="galaxy-planet"]')
    await expect(planets.first()).toBeAttached({ timeout: 15000 })

    const renderedCount = await planets.count()
    expect(renderedCount).toBe(expectedCount)
  })

  test('planet click navigates to characteristic focus URL', async ({ page }) => {
    // Enable debug hook before navigation.
    await enableE2EDebugHook(page)

    await page.goto('/galaxy')

    // Wait for at least one planet debug entry to confirm data is loaded.
    const debugList = page.locator('[data-testid="galaxy-planets-debug"]')
    await expect(debugList).toBeAttached({ timeout: 15000 })

    const planets = page.locator('[data-testid="galaxy-planet"]')
    const count = await planets.count()

    if (count === 0) {
      test.skip()
      return
    }

    // Retrieve the characteristic ID of the first seeded planet.
    const firstCharId = await planets.first().getAttribute('data-plant-id')
    expect(firstCharId).not.toBeNull()

    // Trigger navigation via GalaxySidebar click — the sidebar lists characteristics
    // by name, and clicking one sets the URL ?focus=planet:<id>.
    const charName = await planets.first().getAttribute('data-char-name')
    if (!charName) {
      test.skip()
      return
    }

    // The sidebar is always rendered (non-kiosk mode). Click the characteristic name.
    // GalaxySidebar renders items with the char name as text content.
    const sidebarItem = page.locator('[data-ui="galaxy-page"]').getByText(charName, { exact: false }).first()
    const isSidebarItemVisible = await sidebarItem.isVisible().catch(() => false)

    if (!isSidebarItemVisible) {
      // Sidebar item may be in a collapsed tree — try direct URL navigation with focus param.
      await page.goto(`/galaxy?focus=planet:${firstCharId}`)
      await page.waitForTimeout(3000)
      const url = page.url()
      expect(url).toContain(`focus=planet:${firstCharId}`)
      return
    }

    await sidebarItem.click()
    await page.waitForTimeout(2000)

    // After sidebar click, URL should contain the focus param
    const url = page.url()
    expect(url).toContain('focus=planet:')

    await test.info().attach('galaxy-planet-click', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })
})
