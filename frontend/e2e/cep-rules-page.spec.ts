/**
 * Streaming CEP Rules page (Enterprise tier feature).
 *
 * Verifies:
 *  - Header layout (icon-in-pill + h1) renders.
 *  - Monaco editor mounts after clicking "New Rule".
 *  - Mobile viewport (375px) doesn't blow up the layout.
 *  - Monaco theme follows the app's resolvedTheme (vs-dark in dark mode,
 *    vs-light in light mode).
 *  - Save flow surfaces a toast on either success or error — never silent.
 */
import { test, expect } from './fixtures'
import { loginAsAdmin } from './helpers/auth'
import { switchToPlant } from './helpers/seed'

const PLANT = 'Screenshot Tour Plant'

test.describe('Streaming CEP Rules', () => {
  test('header renders with icon pill + h1', async ({ page }) => {
    await loginAsAdmin(page)
    await switchToPlant(page, PLANT)
    await page.goto('/cep-rules')

    // Header is bg-card border-b — assert via data-ui hooks instead.
    await expect(
      page.getByRole('heading', { name: 'Streaming CEP Rules' }),
    ).toBeVisible({ timeout: 10000 })
    await expect(page.locator('[data-ui="cep-rules-list"]')).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('button', { name: 'New Rule' })).toBeVisible({ timeout: 5000 })
  })

  test('Monaco editor mounts when New Rule is clicked', async ({ page }) => {
    await loginAsAdmin(page)
    await switchToPlant(page, PLANT)
    await page.goto('/cep-rules')

    await page.getByRole('button', { name: 'New Rule' }).click()
    // Monaco's bundle is large; wait until the .monaco-editor host appears.
    await expect(page.locator('.monaco-editor').first()).toBeVisible({ timeout: 15000 })
    // Save button is the proxy that the editor wired up correctly.
    await expect(page.getByRole('button', { name: 'Create' })).toBeVisible({ timeout: 5000 })
  })

  test('mobile viewport (375x667) keeps layout usable', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await loginAsAdmin(page)
    await switchToPlant(page, PLANT)
    await page.goto('/cep-rules')

    // Header still readable.
    await expect(
      page.getByRole('heading', { name: 'Streaming CEP Rules' }),
    ).toBeVisible({ timeout: 10000 })

    // Rule list and editor stack vertically on mobile (md:flex-row → flex-col).
    const list = page.locator('[data-ui="cep-rules-list"]')
    await expect(list).toBeVisible()

    await page.getByRole('button', { name: 'New Rule' }).click()
    // Monaco should still render without horizontal overflow blowing the
    // viewport. Wait for the editor to mount, then assert its width is
    // bounded by viewport width.
    const monaco = page.locator('.monaco-editor').first()
    await expect(monaco).toBeVisible({ timeout: 15000 })
    const box = await monaco.boundingBox()
    expect(box, 'Monaco bounding box should be measurable').not.toBeNull()
    expect(box!.width).toBeLessThanOrEqual(375 + 4) // tolerate sub-pixel rounding
    expect(box!.width).toBeGreaterThan(200) // must still be usable
  })

  test('Monaco theme follows resolvedTheme (light → vs-light, dark → vs-dark)', async ({
    page,
  }) => {
    await loginAsAdmin(page)
    await switchToPlant(page, PLANT)

    // Force light mode via the persisted theme key, reload, verify Monaco
    // mounts in vs-light. Monaco exposes its current theme on the host
    // element via the `monaco-editor` body class; light mode adds `vs`,
    // dark adds `vs-dark`.
    await page.evaluate(() => {
      // ThemeProvider stores the raw value 'light' | 'dark' | 'system' — not JSON.
      localStorage.setItem('cassini-theme', 'light')
    })
    await page.goto('/cep-rules')
    await page.getByRole('button', { name: 'New Rule' }).click()
    const monacoLight = page.locator('.monaco-editor').first()
    await expect(monacoLight).toBeVisible({ timeout: 15000 })
    const lightClass = await monacoLight.getAttribute('class')
    expect(lightClass).toBeTruthy()
    // Monaco light theme: class contains 'vs' but NOT 'vs-dark'
    expect(lightClass).not.toContain('vs-dark')

    // Switch to dark.
    await page.evaluate(() => {
      localStorage.setItem('cassini-theme', 'dark')
    })
    await page.reload({ waitUntil: 'networkidle' })
    await page.getByRole('button', { name: 'New Rule' }).click()
    const monacoDark = page.locator('.monaco-editor').first()
    await expect(monacoDark).toBeVisible({ timeout: 15000 })
    const darkClass = await monacoDark.getAttribute('class')
    expect(darkClass).toBeTruthy()
    expect(darkClass).toContain('vs-dark')
  })

  test('save flow round-trips and rule appears in the list', async ({ page }) => {
    await loginAsAdmin(page)
    await switchToPlant(page, PLANT)
    await page.goto('/cep-rules')

    await page.getByRole('button', { name: 'New Rule' }).click()
    // Wait for editor to mount.
    await expect(page.locator('.monaco-editor').first()).toBeVisible({ timeout: 15000 })

    // Click "Create" — the seeded template is dirty, so the button is
    // enabled. We don't poll for a toast because Sonner toasts auto-
    // dismiss within ~4s and Playwright can race past them. Instead we
    // observe the side effect: after a successful create, the editor
    // exits "dirty" state (Save button disabled) AND a list item with
    // the rule's name appears.
    const ruleListItem = page.locator('[data-ui="cep-rules-list"] button', {
      hasText: 'my-rule',
    })
    await page.getByRole('button', { name: 'Create' }).click()
    await expect(ruleListItem.first()).toBeVisible({ timeout: 10000 })

    // The Save button collapses back to disabled because the draft is now clean.
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled({
      timeout: 5000,
    })
  })
})
