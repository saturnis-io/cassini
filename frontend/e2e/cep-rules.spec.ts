import { test, expect } from './fixtures'
import { loginAsAdmin } from './helpers/auth'
import { switchToPlant } from './helpers/seed'

test.describe('CEP Rules', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await switchToPlant(page, 'Screenshot Tour Plant')
  })

  test('rule list page loads', async ({ page }) => {
    await page.goto('/cep-rules')
    await page.waitForTimeout(2000)

    // Page header should be visible
    await expect(
      page.getByRole('heading', { name: 'Streaming CEP Rules' }),
    ).toBeVisible({ timeout: 10000 })

    // The rules list pane is rendered (empty or populated)
    await expect(page.locator('[data-ui="cep-rules-list"]')).toBeVisible({
      timeout: 5000,
    })

    // The "New Rule" button anchors the create flow
    await expect(page.getByRole('button', { name: 'New Rule' })).toBeVisible({
      timeout: 5000,
    })
  })

  test('opens editor when New Rule is clicked', async ({ page }) => {
    await page.goto('/cep-rules')
    await page.waitForTimeout(2000)

    await page.getByRole('button', { name: 'New Rule' }).click()
    await page.waitForTimeout(1000)

    // Save button appears once a draft is open. The Monaco editor takes
    // a moment to mount — so we check the Save button as the proxy for
    // editor presence to keep the test deterministic.
    await expect(
      page.getByRole('button', { name: 'Create' }),
    ).toBeVisible({ timeout: 10000 })

    // Cancel button should also appear and be enabled (draft is dirty
    // because we seeded the template).
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible({
      timeout: 5000,
    })
  })

  test('shows validation errors for malformed YAML', async ({ page }) => {
    // Stub the validate endpoint so the test doesn't require a live
    // backend — we're proving the editor wiring, not the server logic.
    await page.route('**/api/v1/cep_rules/validate', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          valid: false,
          errors: [
            {
              line: 2,
              column: 1,
              message: 'window: Field required',
              location: 'window',
            },
          ],
          parsed: null,
        }),
      }),
    )

    await page.goto('/cep-rules')
    await page.waitForTimeout(2000)
    await page.getByRole('button', { name: 'New Rule' }).click()
    await page.waitForTimeout(1500)

    // The error pane should surface the marker text once the debounced
    // validate fires.
    const errorPane = page.locator('[data-ui="cep-editor-errors"]')
    await expect(errorPane).toContainText('Field required', { timeout: 5000 })
  })

  test('save submits create payload', async ({ page }) => {
    let captured: string | null = null
    await page.route('**/api/v1/cep_rules/validate', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ valid: true, errors: [], parsed: null }),
      }),
    )
    await page.route('**/api/v1/cep_rules', async (route) => {
      if (route.request().method() === 'POST') {
        captured = await route.request().postData()
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 1,
            plant_id: 1,
            name: 'my-rule',
            description: null,
            yaml_text: 'name: my-rule',
            enabled: true,
            parsed: {
              name: 'my-rule',
              description: null,
              window: '30s',
              conditions: [],
              action: { violation: 'X', severity: 'low', message: null },
              enabled: true,
            },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }),
        })
        return
      }
      await route.fallback()
    })

    await page.goto('/cep-rules')
    await page.waitForTimeout(2000)
    await page.getByRole('button', { name: 'New Rule' }).click()
    await page.waitForTimeout(1500)

    await page.getByRole('button', { name: 'Create' }).click()
    await page.waitForTimeout(1000)

    expect(captured).toBeTruthy()
    expect(captured!).toContain('yaml_text')
  })
})
