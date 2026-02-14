import { test, expect } from './fixtures'
import { loginAsAdmin } from './helpers/auth'
import { getAuthToken, apiGet, apiDelete } from './helpers/api'
import { createPlant, switchToPlant } from './helpers/seed'

test.describe.serial('Scheduled Reports', () => {
  let token: string
  let plantId: number

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request)
    const plant = await createPlant(request, token, 'Reports Plant', 'RPTPLNT')
    plantId = plant.id

    // Cleanup any leftover E2E schedules from previous runs
    try {
      const schedules = await apiGet(
        request,
        `/reports/schedules?plant_id=${plantId}`,
        token,
      )
      for (const s of (schedules as { id: number; name: string }[])) {
        if (s.name.startsWith('E2E ')) {
          await apiDelete(request, `/reports/schedules/${s.id}`, token)
        }
      }
    } catch {
      // Schedule list may fail if plant has no schedules or endpoint returns empty — safe to ignore
    }
  })

  test.afterAll(async ({ request }) => {
    // Best-effort cleanup of any E2E schedules created during this run
    try {
      const tok = await getAuthToken(request)
      const schedules = await apiGet(
        request,
        `/reports/schedules?plant_id=${plantId}`,
        tok,
      )
      for (const s of (schedules as { id: number; name: string }[])) {
        if (s.name.startsWith('E2E ')) {
          await apiDelete(request, `/reports/schedules/${s.id}`, tok)
        }
      }
    } catch {
      // Best-effort — ignore errors
    }
  })

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await switchToPlant(page, 'Reports Plant')
  })

  test('reports settings page renders', async ({ page }) => {
    await page.goto('/settings/reports')
    await page.waitForTimeout(2000)

    await expect(
      page.getByRole('heading', { name: 'Scheduled Reports' }),
    ).toBeVisible({ timeout: 10000 })

    await test.info().attach('scheduled-reports-page', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('new schedule button visible', async ({ page }) => {
    await page.goto('/settings/reports')
    await page.waitForTimeout(2000)

    const newBtn = page.getByRole('button', { name: 'New Schedule' })
    await expect(newBtn).toBeVisible({ timeout: 5000 })

    await test.info().attach('new-schedule-button', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('open create dialog', async ({ page }) => {
    await page.goto('/settings/reports')
    await page.waitForTimeout(2000)

    await page.getByRole('button', { name: 'New Schedule' }).click()
    await page.waitForTimeout(1000)

    // Dialog overlay should appear with title (no role="dialog", uses fixed overlay)
    const dialog = page.locator('.fixed.inset-0').last()
    await expect(dialog).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('New Report Schedule').first()).toBeVisible({ timeout: 3000 })

    await test.info().attach('create-dialog-opened', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('schedule form has all fields', async ({ page }) => {
    await page.goto('/settings/reports')
    await page.waitForTimeout(2000)

    await page.getByRole('button', { name: 'New Schedule' }).click()
    await page.waitForTimeout(1000)

    // Name input
    await expect(page.getByPlaceholder('Weekly SPC Summary')).toBeVisible({ timeout: 5000 })

    // Frequency label — use .first() since text may appear in both label and dropdown value
    await expect(page.getByText('Frequency').first()).toBeVisible({ timeout: 3000 })

    // Recipients email input
    await expect(page.getByPlaceholder('email@example.com')).toBeVisible({ timeout: 3000 })

    // Add button for recipients
    await expect(page.getByRole('button', { name: 'Add' })).toBeVisible({ timeout: 3000 })

    // Schedule is active checkbox
    await expect(page.getByText('Schedule is active').first()).toBeVisible({ timeout: 3000 })

    // Create Schedule button (disabled until recipients added)
    await expect(page.getByRole('button', { name: 'Create Schedule' })).toBeVisible({ timeout: 3000 })

    await test.info().attach('schedule-form-fields', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('create a daily schedule', async ({ page }) => {
    await page.goto('/settings/reports')
    await page.waitForTimeout(2000)

    await page.getByRole('button', { name: 'New Schedule' }).click()
    await page.waitForTimeout(1000)

    // Fill name
    await page.getByPlaceholder('Weekly SPC Summary').fill('E2E Daily Report')

    // Add a recipient (required before Create Schedule becomes enabled)
    await page.getByPlaceholder('email@example.com').fill('test@openspc.local')
    await page.getByRole('button', { name: 'Add' }).click()
    await page.waitForTimeout(500)

    // Verify recipient chip appears
    await expect(page.getByText('test@openspc.local').first()).toBeVisible({ timeout: 3000 })

    await test.info().attach('schedule-form-filled', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })

    // Click Create Schedule (now enabled with recipient added)
    await page.getByRole('button', { name: 'Create Schedule' }).click()
    await page.waitForTimeout(3000)

    // Verify schedule appears in list
    await expect(page.getByText('E2E Daily Report').first()).toBeVisible({ timeout: 10000 })

    await test.info().attach('schedule-created', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('schedule shows Active badge', async ({ page }) => {
    await page.goto('/settings/reports')
    await page.waitForTimeout(2000)

    await expect(page.getByText('E2E Daily Report').first()).toBeVisible({ timeout: 10000 })
    // "Active" badge text — use .first() to avoid matching both the badge and checkbox label
    await expect(page.getByText('Active').first()).toBeVisible({ timeout: 5000 })

    await test.info().attach('schedule-active-badge', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('run now button triggers report', async ({ page }) => {
    await page.goto('/settings/reports')
    await page.waitForTimeout(2000)

    await expect(page.getByText('E2E Daily Report').first()).toBeVisible({ timeout: 10000 })

    // Click the play/run now button
    const runBtn = page.getByTitle('Run now').first()
    await expect(runBtn).toBeVisible({ timeout: 5000 })
    await runBtn.click()
    await page.waitForTimeout(3000)

    await test.info().attach('schedule-run-triggered', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('edit schedule updates name', async ({ page }) => {
    await page.goto('/settings/reports')
    await page.waitForTimeout(2000)

    await expect(page.getByText('E2E Daily Report').first()).toBeVisible({ timeout: 10000 })

    // Click edit button
    const editBtn = page.getByTitle('Edit').first()
    await expect(editBtn).toBeVisible({ timeout: 5000 })
    await editBtn.click()
    await page.waitForTimeout(1000)

    // Dialog should show "Edit Schedule"
    await expect(page.getByText('Edit Schedule').first()).toBeVisible({ timeout: 5000 })

    // Update the name
    const nameInput = page.getByPlaceholder('Weekly SPC Summary')
    await nameInput.clear()
    await nameInput.fill('E2E Updated Report')

    await test.info().attach('schedule-edit-dialog', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })

    // Save changes
    await page.getByRole('button', { name: 'Save Changes' }).click()
    await page.waitForTimeout(3000)

    // Verify updated name appears
    await expect(page.getByText('E2E Updated Report').first()).toBeVisible({ timeout: 10000 })

    await test.info().attach('schedule-updated', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('delete schedule removes from list', async ({ page }) => {
    await page.goto('/settings/reports')
    await page.waitForTimeout(2000)

    await expect(page.getByText('E2E Updated Report').first()).toBeVisible({ timeout: 10000 })

    // Click delete button
    const deleteBtn = page.getByTitle('Delete').first()
    await expect(deleteBtn).toBeVisible({ timeout: 5000 })
    await deleteBtn.click()
    await page.waitForTimeout(1000)

    // Confirmation dialog
    await expect(page.getByText('Delete Schedule').first()).toBeVisible({ timeout: 5000 })

    await test.info().attach('schedule-delete-confirm', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })

    // Confirm deletion — use .last() to hit the red Delete button (not the title text)
    await page.getByRole('button', { name: 'Delete' }).last().click()
    await page.waitForTimeout(3000)

    // Verify removed
    await expect(page.getByText('E2E Updated Report')).not.toBeVisible({ timeout: 5000 })

    await test.info().attach('schedule-deleted', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('cancel create closes dialog', async ({ page }) => {
    await page.goto('/settings/reports')
    await page.waitForTimeout(2000)

    await page.getByRole('button', { name: 'New Schedule' }).click()
    await page.waitForTimeout(1000)

    // Dialog overlay (no role="dialog", uses fixed overlay)
    const dialog = page.locator('.fixed.inset-0').last()
    await expect(dialog).toBeVisible({ timeout: 5000 })

    await page.getByRole('button', { name: 'Cancel' }).click()
    await page.waitForTimeout(500)

    await expect(dialog).not.toBeVisible({ timeout: 5000 })

    await test.info().attach('schedule-cancel-dialog', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })
})
