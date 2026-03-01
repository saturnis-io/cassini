import { type APIRequestContext, type Page, expect } from '@playwright/test'
import { API_BASE, getAuthToken, apiPost, apiGet } from './api'

/**
 * Create a plant via the backend API. Idempotent — returns existing plant on 409.
 */
export async function createPlant(
  request: APIRequestContext,
  token: string,
  name: string,
  code?: string,
) {
  const plantCode = code ?? name.replace(/\s+/g, '').toUpperCase().slice(0, 10)
  const res = await request.post(`${API_BASE}/plants/`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: { name, code: plantCode, description: `Test plant: ${name}` },
  })
  if (res.ok()) return res.json()
  if (res.status() === 409) {
    const plants = await apiGet(request, '/plants/', token)
    const existing = plants.find(
      (p: { name: string; code: string }) => p.name === name || p.code === plantCode,
    )
    if (existing) return existing
    throw new Error(`Plant '${name}' reported 409 but not found in list`)
  }
  throw new Error(`POST /plants/ failed: ${res.status()} ${await res.text()}`)
}

/**
 * Create a hierarchy node. Idempotent — returns existing node on 409.
 */
export async function createHierarchyNode(
  request: APIRequestContext,
  token: string,
  plantId: number,
  name: string,
  type: 'Folder' | 'Enterprise' | 'Site' | 'Area' | 'Line' | 'Cell' | 'Equipment' | 'Tag',
  parentId: number | null = null,
) {
  // Check for existing node first (no unique constraint in DB, so API won't return 409)
  // Tree API doesn't include parent_id on nodes — use tree nesting to determine parentage
  const tree = await apiGet(request, `/plants/${plantId}/hierarchies/`, token)
  type TreeNode = { id: number; name: string; children?: TreeNode[] }
  function findNode(
    nodes: TreeNode[],
    targetName: string,
    targetParentId: number | null,
    currentParentId: number | null,
  ): TreeNode | null {
    for (const node of nodes) {
      if (node.name === targetName && currentParentId === targetParentId) {
        return node
      }
      if (node.children && Array.isArray(node.children)) {
        const found = findNode(node.children, targetName, targetParentId, node.id)
        if (found) return found
      }
    }
    return null
  }
  const existing = findNode(tree, name, parentId, null)
  if (existing) return existing

  const res = await request.post(`${API_BASE}/plants/${plantId}/hierarchies/`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: { name, type, parent_id: parentId },
  })
  if (res.ok()) return res.json()
  if (res.status() === 409 || res.status() === 422) {
    // Race condition or constraint violation — re-fetch and find
    const refreshed = await apiGet(request, `/plants/${plantId}/hierarchies/`, token)
    const found = findNode(refreshed, name, parentId, null)
    if (found) return found
    throw new Error(`Hierarchy '${name}' reported ${res.status()} but not found`)
  }
  throw new Error(
    `POST /plants/${plantId}/hierarchies/ failed: ${res.status()} ${await res.text()}`,
  )
}

/**
 * Create a characteristic under a hierarchy node. Idempotent — returns existing on 409.
 */
export async function createCharacteristic(
  request: APIRequestContext,
  token: string,
  hierarchyId: number,
  name: string,
  opts?: {
    subgroup_size?: number
    target_value?: number
    usl?: number
    lsl?: number
  },
) {
  // Check for existing first (no unique constraint on hierarchy_id+name)
  const existingChars = await apiGet(request, `/hierarchy/${hierarchyId}/characteristics`, token)
  const existing = existingChars.find((c: { name: string }) => c.name === name)
  if (existing) return existing

  const res = await request.post(`${API_BASE}/characteristics/`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: {
      hierarchy_id: hierarchyId,
      name,
      subgroup_size: opts?.subgroup_size ?? 1,
      target_value: opts?.target_value,
      usl: opts?.usl,
      lsl: opts?.lsl,
    },
  })
  if (res.ok()) return res.json()
  if (res.status() === 409 || res.status() === 422) {
    const chars = await apiGet(request, `/hierarchy/${hierarchyId}/characteristics`, token)
    const found = chars.find((c: { name: string }) => c.name === name)
    if (found) return found
    throw new Error(`Characteristic '${name}' reported ${res.status()} but not found`)
  }
  throw new Error(`POST /characteristics/ failed: ${res.status()} ${await res.text()}`)
}

/**
 * Set manual control limits on a characteristic.
 * Required before submitting samples so the SPC engine can classify zones.
 */
export async function setControlLimits(
  request: APIRequestContext,
  token: string,
  characteristicId: number,
  opts: { center_line: number; ucl: number; lcl: number; sigma: number },
) {
  return apiPost(request, `/characteristics/${characteristicId}/set-limits`, token, opts)
}

/**
 * Submit a sample (measurements) for a characteristic.
 * Returns a normalized object with `id` field (mapped from backend's `sample_id`).
 */
export async function enterSample(
  request: APIRequestContext,
  token: string,
  characteristicId: number,
  measurements: number[],
) {
  const result = await apiPost(request, '/samples/', token, {
    characteristic_id: characteristicId,
    measurements,
  })
  // Backend returns SampleProcessingResult with sample_id field
  // Normalize to { id, ... } for consistency with other helpers
  return { ...result, id: result.sample_id }
}

/**
 * Seed a complete hierarchy structure with a plant, department, line, station, and characteristic.
 * Sets control limits so samples can be processed immediately.
 * Idempotent — safe to call on retries.
 */
export async function seedFullHierarchy(
  request: APIRequestContext,
  token: string,
  plantName = 'Test Plant',
) {
  const plant = await createPlant(request, token, plantName)
  const dept = await createHierarchyNode(request, token, plant.id, 'Test Dept', 'Area')
  const line = await createHierarchyNode(request, token, plant.id, 'Test Line', 'Line', dept.id)
  const station = await createHierarchyNode(request, token, plant.id, 'Test Station', 'Cell', line.id)
  const characteristic = await createCharacteristic(request, token, station.id, 'Test Char', {
    subgroup_size: 1,
    target_value: 10.0,
    usl: 12.0,
    lsl: 8.0,
  })

  // Set control limits so the SPC engine can process samples without error
  await setControlLimits(request, token, characteristic.id, {
    center_line: 10.0,
    ucl: 11.5,
    lcl: 8.5,
    sigma: 0.5,
  })

  return { plant, dept, line, station, characteristic }
}

/**
 * Enter multiple samples for a characteristic to build up chart data.
 */
export async function seedSamples(
  request: APIRequestContext,
  token: string,
  characteristicId: number,
  values: number[],
) {
  const results = []
  for (const val of values) {
    const result = await enterSample(request, token, characteristicId, [val])
    results.push(result)
  }
  return results
}

/**
 * Create a user via the backend API. Idempotent — returns existing user on 409.
 */
export async function createUser(
  request: APIRequestContext,
  token: string,
  username: string,
  password: string,
) {
  const res = await request.post(`${API_BASE}/users/`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: { username, password },
  })
  if (res.ok()) return res.json()
  if (res.status() === 409) {
    const users = await apiGet(request, '/users/', token)
    const existing = users.find((u: { username: string }) => u.username === username)
    if (existing) return existing
    throw new Error(`User '${username}' reported 409 but not found in list`)
  }
  throw new Error(`POST /users/ failed: ${res.status()} ${await res.text()}`)
}

/**
 * Assign a plant role to a user. Idempotent — ignores errors if role already exists.
 */
export async function assignRole(
  request: APIRequestContext,
  token: string,
  userId: number,
  plantId: number,
  role: 'operator' | 'supervisor' | 'engineer' | 'admin',
) {
  const res = await request.post(`${API_BASE}/users/${userId}/roles`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: { plant_id: plantId, role },
  })
  if (res.ok()) return res.json()
  // Role already assigned or other conflict — ignore
  if (res.status() === 409 || res.status() === 400) return
  throw new Error(`POST /users/${userId}/roles failed: ${res.status()} ${await res.text()}`)
}

/**
 * Get a JWT access token for a specific user.
 */
export async function getAuthTokenForUser(
  request: APIRequestContext,
  username: string,
  password: string,
): Promise<string> {
  const res = await request.post(`${API_BASE}/auth/login`, {
    data: { username, password, remember_me: false },
  })
  if (!res.ok()) {
    throw new Error(`Login as '${username}' failed: ${res.status()} ${await res.text()}`)
  }
  const body = await res.json()
  return body.access_token
}

/**
 * Create an annotation on a characteristic. Idempotent for point annotations on the same sample.
 */
export async function createAnnotation(
  request: APIRequestContext,
  token: string,
  charId: number,
  data: {
    annotation_type: 'point' | 'period'
    text: string
    sample_id?: number
    start_time?: string
    end_time?: string
    color?: string
  },
) {
  return apiPost(request, `/characteristics/${charId}/annotations`, token, data)
}

/**
 * Create an API key. Returns the key object including the secret (only available on creation).
 */
export async function createApiKey(
  request: APIRequestContext,
  token: string,
  name: string,
) {
  return apiPost(request, '/api-keys/', token, { name })
}

/**
 * Acknowledge a single violation. Idempotent — handles 409 if already acknowledged.
 */
export async function acknowledgeViolation(
  request: APIRequestContext,
  token: string,
  violationId: number,
  reason: string,
) {
  const res = await request.post(`${API_BASE}/violations/${violationId}/acknowledge`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: { user: 'e2e-test', reason },
  })
  if (res.ok()) return res.json()
  if (res.status() === 409) return // Already acknowledged
  throw new Error(`POST /violations/${violationId}/acknowledge failed: ${res.status()} ${await res.text()}`)
}

/**
 * Switch to a specific plant using the plant selector dropdown.
 * Extracted from the repeated pattern across spec files.
 */
export async function switchToPlant(page: Page, plantName: string) {
  const plantSelector = page.locator('button[aria-haspopup="listbox"]')
  await expect(plantSelector).toBeVisible({ timeout: 10000 })
  await plantSelector.click()
  const listbox = page.locator('[role="listbox"]')
  await expect(listbox).toBeVisible({ timeout: 3000 })
  const targetOption = listbox.locator('[role="option"]').filter({ hasText: plantName })
  if (await targetOption.isVisible({ timeout: 2000 })) {
    await targetOption.click()
  } else {
    await page.keyboard.press('Escape')
  }
}

/**
 * Collapse the sidebar Navigation section to give the Characteristics tree more room.
 * On /dashboard, /data-entry, /reports the sidebar has two collapsible sections:
 * Navigation (expanded by default, takes most space) and Characteristics (tree).
 * When Navigation is expanded, tree nodes are pushed off-screen.
 */
export async function collapseNavSection(page: Page) {
  const navToggle = page.getByRole('button', { name: 'Navigation', exact: true })
  try {
    if (await navToggle.isVisible({ timeout: 2000 })) {
      // Only collapse if currently expanded — check if a nav link is visible
      const navLink = page.locator('aside a[href="/data-entry"]').first()
      if (await navLink.isVisible().catch(() => false)) {
        await navToggle.click()
        await page.waitForTimeout(300)
      }
    }
  } catch {
    // Navigation toggle not present (e.g., configuration page) — skip
  }
}

/**
 * Expand the hierarchy tree on the dashboard to reveal "Test Char".
 * The tree is collapsed by default and loads asynchronously after plant switch.
 * Waits for loading to finish, then clicks through:
 * Test Dept → Test Line → Test Station → (Test Char becomes visible)
 */
export async function expandHierarchyToChar(page: Page) {
  // Collapse Navigation section to reveal the Characteristics tree
  await collapseNavSection(page)

  // Wait for hierarchy data to load — the first node may take time after plant switch
  // Use .first() because multiple plants may share identical node names
  const firstNode = page.getByText('Test Dept', { exact: true }).first()
  await expect(firstNode).toBeVisible({ timeout: 15000 })

  // Expand each tree level by clicking on it
  // Use force:true because the sidebar footer can overlap tree nodes at the bottom
  for (const nodeName of ['Test Dept', 'Test Line', 'Test Station']) {
    const node = page.getByText(nodeName, { exact: true }).first()
    await node.scrollIntoViewIfNeeded()
    await node.click({ force: true })
    await page.waitForTimeout(800)
  }
  // Wait for characteristic to appear
  await expect(page.getByText('Test Char').first()).toBeVisible({ timeout: 10000 })
}

/**
 * Expand the HierarchyCharacteristicSelector tree (used in Sample History and Reports).
 * Similar to expandHierarchyToChar but works within the characteristic selector component.
 */
export async function expandSelectorToChar(page: Page) {
  // Wait for hierarchy selector to load
  // Use .first() because multiple plants may share identical node names
  const firstNode = page.getByText('Test Dept', { exact: true }).first()
  await expect(firstNode).toBeVisible({ timeout: 15000 })

  // Click each tree node to expand it
  // Use force:true because the sidebar footer can overlap tree nodes at the bottom
  for (const nodeName of ['Test Dept', 'Test Line', 'Test Station']) {
    const node = page.getByText(nodeName, { exact: true }).first()
    await node.scrollIntoViewIfNeeded()
    await node.click({ force: true })
    await page.waitForTimeout(800)
  }
  // Click the characteristic to select it
  await expect(page.getByText('Test Char').first()).toBeVisible({ timeout: 10000 })
  await page.getByText('Test Char').first().click({ force: true })
  await page.waitForTimeout(1000)
}

/**
 * Create an attribute characteristic. Idempotent — returns existing on 409.
 */
export async function createAttributeCharacteristic(
  request: APIRequestContext,
  token: string,
  hierarchyId: number,
  name: string,
  opts: {
    attribute_chart_type: 'p' | 'np' | 'c' | 'u'
    default_sample_size?: number
  },
) {
  // Check for existing first (no unique constraint on hierarchy_id+name)
  const existingChars = await apiGet(request, `/hierarchy/${hierarchyId}/characteristics`, token)
  const existing = existingChars.find((c: { name: string }) => c.name === name)
  if (existing) return existing

  const res = await request.post(`${API_BASE}/characteristics/`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: {
      hierarchy_id: hierarchyId,
      name,
      data_type: 'attribute',
      attribute_chart_type: opts.attribute_chart_type,
      default_sample_size: opts.default_sample_size ?? 100,
      subgroup_size: 1,
    },
  })
  if (res.ok()) return res.json()
  if (res.status() === 409 || res.status() === 422) {
    const chars = await apiGet(request, `/hierarchy/${hierarchyId}/characteristics`, token)
    const found = chars.find((c: { name: string }) => c.name === name)
    if (found) return found
    throw new Error(`Attribute Characteristic '${name}' reported ${res.status()} but not found`)
  }
  throw new Error(`POST /characteristics/ failed: ${res.status()} ${await res.text()}`)
}

/**
 * Create a CUSUM characteristic. Idempotent — returns existing on 409.
 */
export async function createCUSUMCharacteristic(
  request: APIRequestContext,
  token: string,
  hierarchyId: number,
  name: string,
  opts?: {
    cusum_target?: number
    cusum_k?: number
    cusum_h?: number
  },
) {
  // Check for existing first (no unique constraint on hierarchy_id+name)
  const existingChars = await apiGet(request, `/hierarchy/${hierarchyId}/characteristics`, token)
  const existing = existingChars.find((c: { name: string }) => c.name === name)
  if (existing) return existing

  const res = await request.post(`${API_BASE}/characteristics/`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: {
      hierarchy_id: hierarchyId,
      name,
      data_type: 'variable',
      chart_type: 'cusum',
      subgroup_size: 1,
      cusum_target: opts?.cusum_target ?? 10.0,
      cusum_k: opts?.cusum_k ?? 0.5,
      cusum_h: opts?.cusum_h ?? 5.0,
    },
  })
  if (res.ok()) return res.json()
  if (res.status() === 409 || res.status() === 422) {
    const chars = await apiGet(request, `/hierarchy/${hierarchyId}/characteristics`, token)
    const found = chars.find((c: { name: string }) => c.name === name)
    if (found) return found
    throw new Error(`CUSUM Characteristic '${name}' reported ${res.status()} but not found`)
  }
  throw new Error(`POST /characteristics/ failed: ${res.status()} ${await res.text()}`)
}

/**
 * Create an EWMA characteristic. Idempotent — returns existing on 409.
 */
export async function createEWMACharacteristic(
  request: APIRequestContext,
  token: string,
  hierarchyId: number,
  name: string,
  opts?: {
    ewma_lambda?: number
    ewma_l?: number
    target_value?: number
  },
) {
  // Check for existing first (no unique constraint on hierarchy_id+name)
  const existingChars = await apiGet(request, `/hierarchy/${hierarchyId}/characteristics`, token)
  const existing = existingChars.find((c: { name: string }) => c.name === name)
  if (existing) return existing

  const res = await request.post(`${API_BASE}/characteristics/`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: {
      hierarchy_id: hierarchyId,
      name,
      data_type: 'variable',
      chart_type: 'ewma',
      subgroup_size: 1,
      ewma_lambda: opts?.ewma_lambda ?? 0.2,
      ewma_l: opts?.ewma_l ?? 2.7,
      target_value: opts?.target_value ?? 10.0,
    },
  })
  if (res.ok()) return res.json()
  if (res.status() === 409 || res.status() === 422) {
    const chars = await apiGet(request, `/hierarchy/${hierarchyId}/characteristics`, token)
    const found = chars.find((c: { name: string }) => c.name === name)
    if (found) return found
    throw new Error(`EWMA Characteristic '${name}' reported ${res.status()} but not found`)
  }
  throw new Error(`POST /characteristics/ failed: ${res.status()} ${await res.text()}`)
}

/**
 * Enter an attribute sample (defect/defective count).
 * Retries on 500 errors (transient SQLite locking under rapid sequential writes).
 */
export async function enterAttributeSample(
  request: APIRequestContext,
  token: string,
  characteristicId: number,
  defectCount: number,
  sampleSize?: number,
  unitsInspected?: number,
) {
  const body = {
    characteristic_id: characteristicId,
    defect_count: defectCount,
    sample_size: sampleSize,
    ...(unitsInspected != null && { units_inspected: unitsInspected }),
  }
  const maxRetries = 3
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const res = await request.post(`${API_BASE}/data-entry/submit-attribute`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: body,
    })
    if (res.ok()) return res.json()
    if (res.status() === 500 && attempt < maxRetries - 1) {
      // Transient DB lock — wait and retry
      await new Promise((r) => setTimeout(r, 200 * (attempt + 1)))
      continue
    }
    throw new Error(
      `POST /data-entry/submit-attribute failed: ${res.status()} ${await res.text()}`,
    )
  }
}

/**
 * Navigate to the connectivity sidebar tab using the nav aria-label.
 * Uses exact text matching to avoid collisions with button text like "Add Server".
 */
export async function clickConnectivityTab(page: Page, tabName: string) {
  const nav = page.locator('nav[aria-label="Connectivity navigation"]')
  await expect(nav).toBeVisible({ timeout: 5000 })
  const tab = nav.getByRole('link', { name: tabName, exact: true })
  await expect(tab).toBeVisible({ timeout: 5000 })
  await tab.click()
  await page.waitForTimeout(1000)
}
