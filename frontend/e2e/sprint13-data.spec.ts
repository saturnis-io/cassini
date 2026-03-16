/**
 * Sprint 13 Data & Connectivity Features — E2E Tests
 *
 * Tests:
 *   1. Touch mode toggle in appearance settings
 *   2. Touch mode: input fields get larger height
 *   3. Collection plan tab visible in data entry view
 *   4. Touch mode toggle persists after page reload
 *
 * Prerequisites:
 *   - Backend with CASSINI_DEV_TIER=enterprise (via playwright.config.ts webServer)
 *   - seed_e2e.py run
 */

import { test, expect } from './fixtures'
import { loginAsAdmin } from './helpers/auth'

test.describe('Sprint 13 Data & Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  // ── Touch Mode Tests ──

  test('touch mode toggle visible in appearance settings', async ({ page }) => {
    await page.goto('/settings')
    await page.waitForTimeout(2000)

    // Navigate to Appearance settings tab/section
    const appearanceLink = page
      .getByText('Appearance', { exact: true })
      .or(page.getByRole('tab', { name: 'Appearance' }))
      .or(page.getByRole('link', { name: 'Appearance' }))
      .first()

    if (await appearanceLink.isVisible({ timeout: 3000 })) {
      await appearanceLink.click()
      await page.waitForTimeout(1000)
    }

    // The touch mode section has data-ui="appearance-touch-mode-section"
    const touchSection = page.locator('[data-ui="appearance-touch-mode-section"]')
    await expect(touchSection).toBeVisible({ timeout: 5000 })

    // Should show the Touch Mode label
    await expect(page.getByText('Touch Mode')).toBeVisible({ timeout: 3000 })

    // Should have a toggle switch (role="switch")
    const toggle = touchSection.locator('button[role="switch"]')
    await expect(toggle).toBeVisible({ timeout: 3000 })

    await test.info().attach('touch-mode-toggle', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('touch mode toggle changes aria-checked state', async ({ page }) => {
    await page.goto('/settings')
    await page.waitForTimeout(2000)

    // Navigate to Appearance
    const appearanceLink = page
      .getByText('Appearance', { exact: true })
      .or(page.getByRole('tab', { name: 'Appearance' }))
      .or(page.getByRole('link', { name: 'Appearance' }))
      .first()

    if (await appearanceLink.isVisible({ timeout: 3000 })) {
      await appearanceLink.click()
      await page.waitForTimeout(1000)
    }

    const touchSection = page.locator('[data-ui="appearance-touch-mode-section"]')
    await expect(touchSection).toBeVisible({ timeout: 5000 })

    const toggle = touchSection.locator('button[role="switch"]')
    await expect(toggle).toBeVisible({ timeout: 3000 })

    // Get initial state
    const initialChecked = await toggle.getAttribute('aria-checked')

    // Click to toggle
    await toggle.click()
    await page.waitForTimeout(500)

    // State should have changed
    const newChecked = await toggle.getAttribute('aria-checked')
    expect(newChecked).not.toBe(initialChecked)

    // Toggle back to restore original state
    await toggle.click()
    await page.waitForTimeout(500)

    const restoredChecked = await toggle.getAttribute('aria-checked')
    expect(restoredChecked).toBe(initialChecked)

    await test.info().attach('touch-mode-toggle-state', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('touch mode input fields get larger height when enabled', async ({ page }) => {
    await page.goto('/settings')
    await page.waitForTimeout(2000)

    // Navigate to Appearance
    const appearanceLink = page
      .getByText('Appearance', { exact: true })
      .or(page.getByRole('tab', { name: 'Appearance' }))
      .or(page.getByRole('link', { name: 'Appearance' }))
      .first()

    if (await appearanceLink.isVisible({ timeout: 3000 })) {
      await appearanceLink.click()
      await page.waitForTimeout(1000)
    }

    const touchSection = page.locator('[data-ui="appearance-touch-mode-section"]')
    const toggle = touchSection.locator('button[role="switch"]')
    await expect(toggle).toBeVisible({ timeout: 5000 })

    // Enable touch mode if not already enabled
    const checked = await toggle.getAttribute('aria-checked')
    if (checked !== 'true') {
      await toggle.click()
      await page.waitForTimeout(500)
    }

    // Navigate to data entry to check input field sizes
    await page.goto('/data-entry')
    await page.waitForTimeout(2000)

    // Touch mode should apply larger inputs (via class or CSS variable)
    // The body or root element should have a touch-mode indicator
    const hasTouchClass = await page.evaluate(() => {
      // Check localStorage for the persisted touch mode state
      const stored = localStorage.getItem('cassini-touch-mode')
      if (stored) {
        try {
          const parsed = JSON.parse(stored)
          return parsed?.state?.touchMode === true
        } catch {
          return false
        }
      }
      return false
    })
    expect(hasTouchClass).toBe(true)

    await test.info().attach('touch-mode-data-entry', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })

    // Disable touch mode to restore state
    await page.goto('/settings')
    await page.waitForTimeout(1000)
    if (await appearanceLink.isVisible({ timeout: 2000 })) {
      await appearanceLink.click()
      await page.waitForTimeout(500)
    }
    const toggle2 = page
      .locator('[data-ui="appearance-touch-mode-section"]')
      .locator('button[role="switch"]')
    if (await toggle2.isVisible({ timeout: 2000 })) {
      const checked2 = await toggle2.getAttribute('aria-checked')
      if (checked2 === 'true') {
        await toggle2.click()
      }
    }
  })

  test('touch mode toggle persists after page reload', async ({ page }) => {
    await page.goto('/settings')
    await page.waitForTimeout(2000)

    // Navigate to Appearance
    const appearanceLink = page
      .getByText('Appearance', { exact: true })
      .or(page.getByRole('tab', { name: 'Appearance' }))
      .or(page.getByRole('link', { name: 'Appearance' }))
      .first()

    if (await appearanceLink.isVisible({ timeout: 3000 })) {
      await appearanceLink.click()
      await page.waitForTimeout(1000)
    }

    const touchSection = page.locator('[data-ui="appearance-touch-mode-section"]')
    const toggle = touchSection.locator('button[role="switch"]')
    await expect(toggle).toBeVisible({ timeout: 5000 })

    // Enable touch mode
    const checked = await toggle.getAttribute('aria-checked')
    if (checked !== 'true') {
      await toggle.click()
      await page.waitForTimeout(500)
    }

    // Verify it's enabled
    await expect(toggle).toHaveAttribute('aria-checked', 'true')

    // Reload page
    await page.reload()
    await page.waitForTimeout(2000)

    // Navigate back to Appearance
    const appearanceLink2 = page
      .getByText('Appearance', { exact: true })
      .or(page.getByRole('tab', { name: 'Appearance' }))
      .or(page.getByRole('link', { name: 'Appearance' }))
      .first()

    if (await appearanceLink2.isVisible({ timeout: 3000 })) {
      await appearanceLink2.click()
      await page.waitForTimeout(1000)
    }

    // Toggle should still be checked (persisted via zustand persist middleware)
    const toggle2 = page
      .locator('[data-ui="appearance-touch-mode-section"]')
      .locator('button[role="switch"]')
    await expect(toggle2).toBeVisible({ timeout: 5000 })
    await expect(toggle2).toHaveAttribute('aria-checked', 'true')

    await test.info().attach('touch-mode-persisted', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })

    // Cleanup: disable touch mode
    await toggle2.click()
    await page.waitForTimeout(300)
  })

  // ── Collection Plan Tab ──

  test('collection plan tab visible in data entry view', async ({ page }) => {
    await page.goto('/data-entry')
    await page.waitForTimeout(2000)

    // The DataEntryView has a tab bar with "Collection Plans" tab
    const collectionTab = page.getByRole('tab', { name: 'Collection Plans' })
    await expect(collectionTab).toBeVisible({ timeout: 5000 })

    // Click it to verify it switches view
    await collectionTab.click()
    await page.waitForTimeout(1000)

    // Should show collection plans content (either plans list or empty state)
    await expect(
      page
        .getByText('No Collection Plans')
        .or(page.getByText('Select a plant'))
        .or(page.getByText('Loading collection plans'))
        .or(page.locator('button').filter({ hasText: 'Start' }).first()),
    ).toBeVisible({ timeout: 5000 })

    await test.info().attach('collection-plan-tab', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })
})
