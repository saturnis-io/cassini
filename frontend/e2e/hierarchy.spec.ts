import { test, expect } from './fixtures'
import { loginAsAdmin } from './helpers/auth'
import { getAuthToken, apiGet } from './helpers/api'
import { createPlant, createHierarchyNode } from './helpers/seed'

test.describe('Hierarchy Management', () => {
  let token: string
  let plantId: number

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request)
    // Idempotent — handles 409 on retry
    const plant = await createPlant(request, token, 'Hierarchy Test Plant', 'HTP')
    plantId = plant.id
  })

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)

    // Switch to our test plant via the plant selector
    const plantSelector = page.locator('button[aria-haspopup="listbox"]')
    await expect(plantSelector).toBeVisible({ timeout: 10000 })
    await plantSelector.click()
    const listbox = page.locator('[role="listbox"]')
    await expect(listbox).toBeVisible({ timeout: 3000 })
    const targetOption = listbox.locator('[role="option"]').filter({ hasText: 'Hierarchy Test Plant' })
    if (await targetOption.isVisible({ timeout: 2000 })) {
      await targetOption.click()
    } else {
      await page.keyboard.press('Escape')
    }
  })

  test('create department node in hierarchy', async ({ page }) => {
    await page.goto('/configuration')
    await page.waitForTimeout(2000)

    // Click the "Add hierarchy node" button (specific title selector)
    const addButton = page.locator('button[title="Add hierarchy node"]')
    await expect(addButton).toBeVisible({ timeout: 5000 })
    await addButton.click()
    await page.waitForTimeout(500)

    // Fill in the node name using the exact placeholder
    const nameInput = page.getByPlaceholder('Enter node name')
    await expect(nameInput).toBeVisible({ timeout: 3000 })
    await nameInput.fill('Quality Department')

    // Select node type if a type selector exists
    const typeSelect = page.locator('select')
    if (await typeSelect.count() > 0) {
      await typeSelect.first().selectOption('Area')
    }

    // Submit via "Create Node" button
    await page.getByRole('button', { name: 'Create Node' }).click()
    await page.waitForTimeout(1000)

    // Verify the node appears in the tree (use .first() to avoid matching toast text)
    await expect(page.getByText('Quality Department').first()).toBeVisible({ timeout: 5000 })

    await test.info().attach('hierarchy-node-created', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('create nested hierarchy via API and verify in UI', async ({ page, request }) => {
    // Create hierarchy nodes via API (idempotent)
    const dept = await createHierarchyNode(request, token, plantId, 'API Department', 'Area')

    await createHierarchyNode(request, token, plantId, 'API Line', 'Line', dept.id)
    await createHierarchyNode(request, token, plantId, 'API Station', 'Cell', dept.id)

    // Navigate to configuration and verify
    await page.goto('/configuration')
    await page.waitForTimeout(2000)

    await expect(page.getByText('API Department').first()).toBeVisible({ timeout: 5000 })

    await test.info().attach('nested-hierarchy-tree', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })

    // Backend verification
    const tree = await apiGet(request, `/plants/${plantId}/hierarchies/`, token)
    expect(tree.length).toBeGreaterThan(0)
    const apiDept = tree.find((n: { name: string }) => n.name === 'API Department')
    expect(apiDept).toBeTruthy()
  })

  test('create characteristic under hierarchy node', async ({ page, request }) => {
    // Create hierarchy via API (idempotent)
    const dept = await createHierarchyNode(request, token, plantId, 'Char Test Dept', 'Area')
    const station = await createHierarchyNode(request, token, plantId, 'Char Test Station', 'Cell', dept.id)

    // Create a characteristic via API
    const res = await request.post('http://localhost:8000/api/v1/characteristics/', {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: {
        hierarchy_id: station.id,
        name: 'Diameter',
        subgroup_size: 1,
        target_value: 10.0,
        usl: 12.0,
        lsl: 8.0,
      },
    })
    // Accept both 200/201 and 409 (already exists from previous run)
    expect([200, 201, 409]).toContain(res.status())

    // Navigate to configuration and verify
    await page.goto('/configuration')
    await page.waitForTimeout(2000)

    // Expand the tree to find the characteristic
    await expect(page.getByText('Char Test Dept').first()).toBeVisible({ timeout: 5000 })

    await test.info().attach('characteristic-in-hierarchy', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })

    // Backend verification
    const chars = await apiGet(request, `/hierarchy/${station.id}/characteristics`, token)
    expect(chars.length).toBe(1)
    expect(chars[0].name).toBe('Diameter')
  })

  test('delete hierarchy node removes it', async ({ page, request }) => {
    // Create a node to delete (idempotent)
    const node = await createHierarchyNode(request, token, plantId, 'Delete Me Node', 'Folder')

    await page.goto('/configuration')
    await page.waitForTimeout(2000)

    await expect(page.getByText('Delete Me Node').first()).toBeVisible({ timeout: 5000 })

    await test.info().attach('hierarchy-before-delete', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })

    // Delete via API (UI delete is complex with tree interaction)
    await request.delete(`http://localhost:8000/api/v1/hierarchy/${node.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    // Refresh and verify removal
    await page.reload()
    await page.waitForTimeout(2000)
    await expect(page.getByText('Delete Me Node')).not.toBeVisible({ timeout: 5000 })

    await test.info().attach('hierarchy-after-delete', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })
})
