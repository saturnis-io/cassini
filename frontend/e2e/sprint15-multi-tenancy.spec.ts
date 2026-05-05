/**
 * Sprint 15 — Multi-tenancy IDOR verification (Wave A.1).
 *
 * Sets up two plants with operators each, then proves cross-plant reads
 * return 404 (not 403, because revealing existence is itself a leak).
 * Also asserts audit-log scoping: an admin at Plant B never sees
 * Plant A entries.
 *
 * The Python integration tests (`tests/integration/test_multi_tenancy_isolation.py`)
 * cover the unit-level fixtures; this spec covers the live HTTP path
 * end-to-end.
 */
import { test, expect } from './fixtures'
import { API_BASE, getAuthToken, apiGet } from './helpers/api'
import {
  createPlant,
  createUser,
  assignRole,
  createHierarchyNode,
  createCharacteristic,
  setControlLimits,
  enterSample,
  getAuthTokenForUser,
} from './helpers/seed'

const RUN = Date.now().toString(36)
const PLANT_A = `Tenancy A ${RUN}`
const PLANT_B = `Tenancy B ${RUN}`
const OPERATOR_A_USER = `op_a_${RUN}`
const OPERATOR_B_USER = `op_b_${RUN}`
const ADMIN_B_USER = `adm_b_${RUN}`
const PASSWORD = 'StrongPass!123'

interface TenancyContext {
  adminToken: string
  plantA: { id: number }
  plantB: { id: number }
  charA: { id: number }
  charB: { id: number }
  sampleA: { id: number }
  sampleB: { id: number }
  operatorBToken: string
  adminBToken: string
}

let ctx: TenancyContext

test.describe('Sprint 15 Multi-Tenancy IDOR', () => {
  test.beforeAll(async ({ request }) => {
    const adminToken = await getAuthToken(request)

    const plantA = await createPlant(request, adminToken, PLANT_A)
    const plantB = await createPlant(request, adminToken, PLANT_B)

    // Operator A → Plant A only. Operator B → Plant B only. Admin B → Plant B admin.
    const opA = await createUser(request, adminToken, OPERATOR_A_USER, PASSWORD)
    const opB = await createUser(request, adminToken, OPERATOR_B_USER, PASSWORD)
    const admB = await createUser(request, adminToken, ADMIN_B_USER, PASSWORD)
    await assignRole(request, adminToken, opA.id, plantA.id, 'operator')
    await assignRole(request, adminToken, opB.id, plantB.id, 'operator')
    await assignRole(request, adminToken, admB.id, plantB.id, 'admin')

    // Hierarchy + characteristic per plant.
    const siteA = await createHierarchyNode(request, adminToken, plantA.id, `SiteA-${RUN}`, 'Site')
    const charA = await createCharacteristic(request, adminToken, siteA.id, `CharA-${RUN}`, {
      target_value: 100,
      usl: 110,
      lsl: 90,
    })
    await setControlLimits(request, adminToken, charA.id, {
      center_line: 100,
      ucl: 110,
      lcl: 90,
      sigma: 3,
    })
    const siteB = await createHierarchyNode(request, adminToken, plantB.id, `SiteB-${RUN}`, 'Site')
    const charB = await createCharacteristic(request, adminToken, siteB.id, `CharB-${RUN}`, {
      target_value: 50,
      usl: 60,
      lsl: 40,
    })
    await setControlLimits(request, adminToken, charB.id, {
      center_line: 50,
      ucl: 60,
      lcl: 40,
      sigma: 3,
    })

    // Operator A (via admin token) submits a sample at Plant A. Operator B submits at Plant B.
    // Reuse adminToken for the inserts because the helper assumes admin
    // privileges — what we verify below is operator B's READ, not WRITE.
    const sampleA = await enterSample(request, adminToken, charA.id, [100])
    const sampleB = await enterSample(request, adminToken, charB.id, [50])

    const operatorBToken = await getAuthTokenForUser(request, OPERATOR_B_USER, PASSWORD)
    const adminBToken = await getAuthTokenForUser(request, ADMIN_B_USER, PASSWORD)

    ctx = {
      adminToken,
      plantA,
      plantB,
      charA,
      charB,
      sampleA,
      sampleB,
      operatorBToken,
      adminBToken,
    }
  })

  test('cross-plant sample GET returns 404 (not 403)', async ({ request }) => {
    const res = await request.get(`${API_BASE}/samples/${ctx.sampleA.id}`, {
      headers: { Authorization: `Bearer ${ctx.operatorBToken}` },
    })
    expect(
      res.status(),
      `Operator B reading Plant A sample must be 404, got ${res.status()}: ${await res.text()}`,
    ).toBe(404)
  })

  test('cross-plant characteristic GET returns 404', async ({ request }) => {
    const res = await request.get(`${API_BASE}/characteristics/${ctx.charA.id}`, {
      headers: { Authorization: `Bearer ${ctx.operatorBToken}` },
    })
    expect(
      res.status(),
      `Operator B reading Plant A characteristic must be 404, got ${res.status()}: ${await res.text()}`,
    ).toBe(404)
  })

  test('cross-plant violation lookup never returns Plant A rows', async ({ request }) => {
    // Lookup all violations from operator B's perspective. Plant A
    // violations (if any exist for sampleA) MUST be filtered out.
    const all = await apiGet(request, '/violations/', ctx.operatorBToken)
    type V = { id: number; sample_id: number }
    const items: V[] = all.items ?? []
    const leakedSampleA = items.some((v) => v.sample_id === ctx.sampleA.id)
    expect(leakedSampleA, 'Operator B must not see Plant A violations').toBe(false)
  })

  test('cross-plant sample list is filtered to plant memberships', async ({ request }) => {
    const all = await apiGet(request, '/samples/', ctx.operatorBToken)
    type S = { id: number }
    const items: S[] = all.items ?? []
    expect(items.some((s) => s.id === ctx.sampleA.id)).toBe(false)
  })

  test('Plant B admin audit-log search excludes Plant A entries', async ({ request }) => {
    // Hit the audit log scoped query. Admin B should only see Plant B rows
    // (plus null-plant-id rows like login events).
    const res = await request.get(`${API_BASE}/audit/logs?limit=200`, {
      headers: { Authorization: `Bearer ${ctx.adminBToken}` },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    type Row = { plant_id?: number | null; resource_type?: string; resource_id?: number | null }
    const items: Row[] = body.items ?? []
    const leakedPlantA = items.some((row) => row.plant_id === ctx.plantA.id)
    expect(leakedPlantA, 'Plant B admin must not see Plant A audit entries').toBe(false)
  })
})
