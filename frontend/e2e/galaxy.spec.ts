import { test, expect } from './fixtures'
import { loginAsAdmin } from './helpers/auth'
import { switchToPlant } from './helpers/seed'

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
})
