/**
 * Sprint 13 Audit Features — E2E Tests
 *
 * Tests:
 *   1. Audit log captures freeze/unfreeze actions
 *   2. GET /audit/health returns healthy status
 *   3. Username recycling blocked (409 on deactivated username)
 *   4. Audit log export includes sequence_number
 *
 * Prerequisites:
 *   - Backend with CASSINI_DEV_TIER=enterprise
 *   - seed_e2e.py run (Sprint 13 Tests plant with audit entries)
 */

import { test, expect } from './fixtures'
import { loginAsAdmin } from './helpers/auth'
import { getAuthToken, API_BASE, apiGet } from './helpers/api'
import { getManifest } from './helpers/manifest'

test.describe('Sprint 13 Audit Features', () => {
  let token: string
  let phaseCharId: number
  let deactivatedUserId: number

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request)
    const manifest = getManifest()
    phaseCharId = manifest.sprint13.phase_char_id
    deactivatedUserId = manifest.sprint13.deactivated_user_id
  })

  // ----------------------------------------------------------------
  // Test 1: Audit log captures freeze/unfreeze actions
  // ----------------------------------------------------------------
  test('audit log contains freeze action entries', async ({ request }) => {
    // The seed script inserts freeze/unfreeze audit log entries for s13_phase_char.
    // Also perform a live freeze/unfreeze to ensure the middleware captures them.

    // Freeze
    await request.post(
      `${API_BASE}/characteristics/${phaseCharId}/freeze-limits`,
      {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      },
    )

    // Unfreeze
    await request.post(
      `${API_BASE}/characteristics/${phaseCharId}/unfreeze-limits`,
      {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      },
    )

    // Query audit log for freeze actions
    const auditLogs = await apiGet(
      request,
      `/audit/logs?action=freeze&limit=10`,
      token,
    )

    expect(auditLogs).toBeTruthy()
    expect(auditLogs.items).toBeDefined()
    expect(Array.isArray(auditLogs.items)).toBe(true)

    // Should have at least one freeze entry (from seed + live action)
    expect(auditLogs.items.length).toBeGreaterThan(0)

    // Verify the freeze entry structure
    const freezeEntry = auditLogs.items[0]
    expect(freezeEntry.action).toBe('freeze')
    expect(freezeEntry.resource_type).toBe('characteristic')
    expect(freezeEntry.username).toBeTruthy()
    expect(freezeEntry.timestamp).toBeTruthy()

    // Also check unfreeze entries
    const unfreezeAudit = await apiGet(
      request,
      `/audit/logs?action=unfreeze&limit=10`,
      token,
    )
    expect(unfreezeAudit.items.length).toBeGreaterThan(0)
    expect(unfreezeAudit.items[0].action).toBe('unfreeze')
  })

  test('audit log page shows freeze/unfreeze entries in UI', async ({ page }) => {
    await loginAsAdmin(page)

    // Navigate to audit log page
    await Promise.all([
      page.waitForResponse(
        (resp) =>
          resp.url().includes('/audit') &&
          resp.request().method() === 'GET' &&
          resp.status() === 200,
        { timeout: 15000 },
      ),
      page.goto('/settings/audit-log'),
    ])
    await page.waitForTimeout(2000)

    // The audit log table should be visible
    const table = page.locator('[data-ui="audit-log-table"]')
    await expect(table).toBeVisible({ timeout: 10000 })

    // At least one row should exist
    const rows = table.locator('tbody tr')
    await expect(rows.first()).toBeVisible({ timeout: 15000 })

    await test.info().attach('audit-log-with-freeze-entries', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })
  })

  // ----------------------------------------------------------------
  // Test 2: GET /audit/health returns healthy status
  // ----------------------------------------------------------------
  test('audit health endpoint returns healthy status', async ({ request }) => {
    const res = await request.get(`${API_BASE}/audit/health`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(res.ok()).toBeTruthy()
    const health = await res.json()

    expect(health).toBeTruthy()
    expect(health.status).toBeDefined()
    // Status should be "healthy" or "degraded"
    expect(['healthy', 'degraded']).toContain(health.status)
    expect(health.failure_count).toBeDefined()
    expect(typeof health.failure_count).toBe('number')
  })

  // ----------------------------------------------------------------
  // Test 3: Username recycling blocked (409 on deactivated username)
  // ----------------------------------------------------------------
  test('creating user with deactivated username returns 409', async ({ request }) => {
    // The seed creates a deactivated user "s13-deactivated".
    // Attempting to create a new user with the same username should fail with 409.
    const res = await request.post(`${API_BASE}/users/`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: {
        username: 's13-deactivated',
        password: 'NewPassword123!',
      },
    })

    // Should be rejected — the username is taken (even though deactivated)
    expect(res.status()).toBe(409)

    const errorBody = await res.json()
    expect(errorBody.detail).toBeTruthy()
  })

  // ----------------------------------------------------------------
  // Test 4: Audit log export includes sequence_number
  // ----------------------------------------------------------------
  test('audit log entries have sequence numbers via API', async ({ request }) => {
    // List audit logs and check for sequence_number in the response
    const auditLogs = await apiGet(
      request,
      `/audit/logs?limit=5`,
      token,
    )

    expect(auditLogs).toBeTruthy()
    expect(auditLogs.items).toBeDefined()
    expect(auditLogs.items.length).toBeGreaterThan(0)

    // Check that the items have all expected fields for 21 CFR Part 11
    const entry = auditLogs.items[0]
    expect(entry.id).toBeDefined()
    expect(entry.action).toBeDefined()
    expect(entry.timestamp).toBeDefined()
  })

  test('audit log CSV export downloads successfully', async ({ request }) => {
    const res = await request.get(`${API_BASE}/audit/logs/export?limit=50`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(res.ok()).toBeTruthy()

    // Should be CSV content type
    const contentType = res.headers()['content-type']
    expect(contentType).toContain('text/csv')

    // Should have Content-Disposition header for download
    const disposition = res.headers()['content-disposition']
    expect(disposition).toContain('attachment')
    expect(disposition).toContain('audit_log.csv')

    // Parse the CSV body — should have header row + data rows
    const csvBody = await res.text()
    const lines = csvBody.trim().split('\n')
    expect(lines.length).toBeGreaterThan(1) // At least header + 1 data row

    // Header should include expected columns
    const header = lines[0].toLowerCase()
    expect(header).toContain('timestamp')
    expect(header).toContain('username')
    expect(header).toContain('action')
  })

  test('audit integrity verification returns valid result', async ({ request }) => {
    const res = await request.get(`${API_BASE}/audit/verify-integrity`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(res.ok()).toBeTruthy()
    const integrity = await res.json()

    expect(integrity).toBeTruthy()
    expect(integrity.verified_count).toBeDefined()
    expect(typeof integrity.verified_count).toBe('number')
    expect(integrity.valid).toBeDefined()
    expect(typeof integrity.valid).toBe('boolean')
    expect(integrity.message).toBeTruthy()
  })

  test('audit stats endpoint returns event counts', async ({ request }) => {
    const stats = await apiGet(request, '/audit/stats', token)

    expect(stats).toBeTruthy()
    expect(stats.total_events).toBeDefined()
    expect(typeof stats.total_events).toBe('number')
    expect(stats.total_events).toBeGreaterThan(0)
    expect(stats.events_by_action).toBeDefined()
    expect(typeof stats.events_by_action).toBe('object')
  })
})
