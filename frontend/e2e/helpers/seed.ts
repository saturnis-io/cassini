import { type APIRequestContext } from '@playwright/test'
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
  const res = await request.post(`${API_BASE}/plants/${plantId}/hierarchies/`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: { name, type, parent_id: parentId },
  })
  if (res.ok()) return res.json()
  if (res.status() === 409) {
    const nodes = await apiGet(request, `/plants/${plantId}/hierarchies/`, token)
    const existing = nodes.find((n: { name: string }) => n.name === name)
    if (existing) return existing
    throw new Error(`Hierarchy '${name}' reported 409 but not found`)
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
  if (res.status() === 409) {
    const chars = await apiGet(request, `/hierarchy/${hierarchyId}/characteristics`, token)
    const existing = chars.find((c: { name: string }) => c.name === name)
    if (existing) return existing
    throw new Error(`Characteristic '${name}' reported 409 but not found`)
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
 */
export async function enterSample(
  request: APIRequestContext,
  token: string,
  characteristicId: number,
  measurements: number[],
) {
  return apiPost(request, '/samples/', token, {
    characteristic_id: characteristicId,
    measurements,
  })
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
