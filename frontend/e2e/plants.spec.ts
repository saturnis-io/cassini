import { test, expect } from './fixtures'
import { loginAsAdmin } from './helpers/auth'
import { getAuthToken, apiGet } from './helpers/api'

test.describe('Plant Management', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('create a new plant via UI', async ({ page, request }) => {
    await page.goto('/settings/sites')
    await page.waitForTimeout(2000)

    await test.info().attach('sites-page-before-create', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })

    // Scroll the create form into view
    const nameInput = page.getByPlaceholder('e.g., Chicago Factory')
    await nameInput.scrollIntoViewIfNeeded()

    // Fill name field
    await nameInput.click()
    await nameInput.fill('E2E Test Plant')
    await page.waitForTimeout(300)

    // Fill code field — use focus() + keyboard.type() to reliably trigger React onChange
    const codeInput = page.locator('input[placeholder="e.g., CHI"]')
    await codeInput.scrollIntoViewIfNeeded()
    await codeInput.focus()
    await page.waitForTimeout(200)
    await page.keyboard.type('E2ETEST')
    await page.waitForTimeout(300)

    await test.info().attach('create-form-filled', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })

    // Click the Add Site button
    const addButton = page.getByRole('button', { name: 'Add Site' })
    await addButton.scrollIntoViewIfNeeded()
    await expect(addButton).toBeEnabled({ timeout: 3000 })
    await addButton.click()
    await page.waitForTimeout(3000)

    // Verify the plant appears in the list
    await expect(page.getByText('E2E Test Plant').first()).toBeVisible({ timeout: 10000 })

    await test.info().attach('plant-created-in-list', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })

    // Backend verification
    const token = await getAuthToken(request)
    const plants = await apiGet(request, '/plants/', token)
    const found = plants.find((p: { name: string }) => p.name === 'E2E Test Plant')
    expect(found).toBeTruthy()
  })

  test('switch active plant via plant selector', async ({ page, request }) => {
    // Ensure we have at least 2 plants
    const token = await getAuthToken(request)
    const existingPlants = await apiGet(request, '/plants/', token)
    if (existingPlants.length < 2) {
      await (await request.post('http://localhost:8000/api/v1/plants/', {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        data: { name: 'Switch Target', code: 'SWITCH' },
      })).json()
    }

    await page.goto('/dashboard')
    await page.waitForTimeout(2000)

    // Open plant selector dropdown
    const plantSelector = page.locator('button[aria-haspopup="listbox"]')
    await expect(plantSelector).toBeVisible({ timeout: 5000 })
    await plantSelector.click()

    const listbox = page.locator('[role="listbox"]')
    await expect(listbox).toBeVisible({ timeout: 3000 })

    await test.info().attach('plant-selector-dropdown', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })

    // Click the second option
    const options = listbox.locator('[role="option"]')
    const count = await options.count()
    if (count >= 2) {
      const secondOption = options.nth(1)
      const secondPlantName = await secondOption.locator('span').first().textContent()
      await secondOption.click()
      await expect(plantSelector).toContainText(secondPlantName || '')

      await test.info().attach('plant-switched', {
        body: await page.screenshot(),
        contentType: 'image/png',
      })
    }
  })

  test('edit plant name persists after refresh', async ({ page, request }) => {
    // Create a plant to edit (may already exist from prior run, possibly renamed)
    const token = await getAuthToken(request)
    const res = await request.post('http://localhost:8000/api/v1/plants/', {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { name: 'Edit Test', code: 'EDITTEST' },
    })
    if (res.status() === 409) {
      // Plant already exists — it may have been renamed. Find it by code and rename back.
      const plants = await apiGet(request, '/plants/', token)
      const existing = plants.find((p: { code: string }) => p.code === 'EDITTEST')
      if (existing && existing.name !== 'Edit Test') {
        await request.put(`http://localhost:8000/api/v1/plants/${existing.id}`, {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          data: { name: 'Edit Test', code: 'EDITTEST' },
        })
      }
    }

    await page.goto('/settings/sites')
    await page.waitForTimeout(2000)

    // Find the plant row by code "EDITTEST" (name may have been changed)
    const row = page.locator('.divide-y > div').filter({ hasText: 'EDITTEST' })
    await row.locator('button[title="Edit site"]').click()
    await page.waitForTimeout(500)

    // Edit the name in the modal
    const editModal = page.locator('.fixed.inset-0')
    await expect(editModal).toBeVisible({ timeout: 3000 })

    const nameInput = editModal.locator('input').first()
    await nameInput.clear()
    await nameInput.fill('Renamed Plant')

    await test.info().attach('edit-modal-with-new-name', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })

    await editModal.getByRole('button', { name: 'Save Changes' }).click()
    await page.waitForTimeout(1000)

    // Refresh and verify
    await page.reload()
    await page.waitForTimeout(2000)
    await expect(page.getByText('Renamed Plant').first()).toBeVisible({ timeout: 5000 })

    await test.info().attach('plant-renamed-after-refresh', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('delete plant removes it from the list', async ({ page, request }) => {
    // Create a plant to delete (may already exist from prior run)
    const token = await getAuthToken(request)
    await (await request.post('http://localhost:8000/api/v1/plants/', {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { name: 'Delete Me', code: 'DELME' },
    })).json()

    await page.goto('/settings/sites')
    await page.waitForTimeout(2000)

    // Verify the plant is visible
    await expect(page.getByText('Delete Me').first()).toBeVisible({ timeout: 5000 })

    // Find the plant row — it may already be inactive from a prior run
    const row = page.locator('.divide-y > div').filter({ hasText: 'Delete Me' })
    const deactivateButton = row.locator('button[title="Deactivate site"]')

    // Only deactivate if the button exists (plant is currently active)
    if (await deactivateButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      await deactivateButton.click()
      await page.waitForTimeout(1500)
    }

    // Now click the delete button (appears for inactive plants)
    const deleteRow = page.locator('.divide-y > div').filter({ hasText: 'Delete Me' })
    await deleteRow.locator('button[title="Delete site"]').click()
    await page.waitForTimeout(500)

    // Confirm deletion in the dialog — scope to the modal overlay to avoid matching the row button
    const dialog = page.locator('[role="dialog"], .fixed.inset-0').last()

    await test.info().attach('delete-confirmation-dialog', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })

    await dialog.getByRole('button', { name: 'Delete Site' }).click()
    await page.waitForTimeout(2000)

    // Verify plant is removed
    await expect(page.getByText('Delete Me')).not.toBeVisible({ timeout: 5000 })

    await test.info().attach('plant-deleted-from-list', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })

    // Backend verification
    const plants = await apiGet(request, '/plants/', token)
    const found = plants.find((p: { name: string }) => p.name === 'Delete Me')
    expect(found).toBeFalsy()
  })
})
