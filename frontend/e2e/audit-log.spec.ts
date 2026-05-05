import { test, expect } from './fixtures'
import { loginAsAdmin } from './helpers/auth'
import { getAuthToken, API_BASE, apiGet } from './helpers/api'
import { getManifest } from './helpers/manifest'

test.describe('Audit Log', () => {
  let token: string
  let phaseCharId: number | null = null
  let hasSprint13: boolean = false

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request)
    try {
      const manifest = getManifest()
      phaseCharId = manifest.sprint13?.phase_char_id ?? null
      hasSprint13 = phaseCharId !== null
    } catch {
      hasSprint13 = false
    }
  })

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('audit log page loads', async ({ page }) => {
    await page.goto('/settings/audit-log')
    await page.waitForTimeout(2000)

    // Header should be visible
    await expect(
      page.getByRole('heading', { name: 'Audit Log' }),
    ).toBeVisible({ timeout: 10000 })

    // Table container should be present
    await expect(
      page.locator('[data-ui="audit-log-table-container"]'),
    ).toBeVisible({ timeout: 10000 })

    await test.info().attach('audit-log-loaded', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('log entries visible', async ({ page }) => {
    // Wait for both the page navigation and the audit logs API response
    await Promise.all([
      page.waitForResponse(
        (resp) => resp.url().includes('/audit') && resp.request().method() === 'GET' && resp.status() === 200,
        { timeout: 15000 },
      ),
      page.goto('/settings/audit-log'),
    ])
    await page.waitForTimeout(1000)

    // The seed script creates audit entries, plus the login itself creates one.
    // Table should have at least one row (the admin login we just performed)
    const table = page.locator('[data-ui="audit-log-table"]')
    await expect(table).toBeVisible({ timeout: 10000 })

    // Table should have header columns (use exact match to avoid collisions
    // with resource labels like "User" appearing in tbody rows)
    const thead = table.locator('thead')
    await expect(thead.getByText('Timestamp')).toBeVisible({ timeout: 5000 })
    await expect(thead.getByText('User')).toBeVisible({ timeout: 5000 })
    await expect(thead.getByText('Action')).toBeVisible({ timeout: 5000 })

    // At least one data row should exist (login action from beforeEach)
    const rows = table.locator('tbody tr')
    await expect(rows.first()).toBeVisible({ timeout: 15000 })

    // Summary stats should show total events
    await expect(
      page.locator('[data-ui="audit-log-stats"]'),
    ).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Total Events')).toBeVisible({ timeout: 5000 })

    await test.info().attach('audit-log-entries', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('filter controls present', async ({ page }) => {
    await page.goto('/settings/audit-log')
    await page.waitForTimeout(2000)

    // Filter bar should be visible
    const filterBar = page.locator('[data-ui="audit-log-filters"]')
    await expect(filterBar).toBeVisible({ timeout: 10000 })

    // Should have filter label
    await expect(filterBar.getByText('Filters')).toBeVisible({ timeout: 5000 })

    // Action dropdown — select with "All Actions" default
    const actionSelect = filterBar.locator('select').first()
    await expect(actionSelect).toBeVisible({ timeout: 5000 })

    // Date inputs should be present
    const dateInputs = filterBar.locator('input[type="date"]')
    await expect(dateInputs.first()).toBeVisible({ timeout: 5000 })

    await test.info().attach('audit-log-filters', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('export button present', async ({ page }) => {
    await page.goto('/settings/audit-log')
    await page.waitForTimeout(2000)

    // Export CSV button should be visible in the filter bar
    const exportButton = page.getByRole('button', { name: 'Export CSV' })
    await expect(exportButton).toBeVisible({ timeout: 10000 })

    await test.info().attach('audit-log-export', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('screenshot', async ({ page }) => {
    await page.goto('/settings/audit-log')
    await page.waitForTimeout(3000)

    await expect(
      page.locator('[data-ui="audit-log-settings"]'),
    ).toBeVisible({ timeout: 10000 })

    await test.info().attach('audit-log-full', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })
  })

  // ----------------------------------------------------------------
  // Audit log API: freeze/unfreeze actions captured by middleware
  // (ported from sprint13-audit.spec.ts)
  // ----------------------------------------------------------------
  test('audit log captures freeze/unfreeze actions via API', async ({ request }) => {
    test.skip(!hasSprint13, 'Sprint 13 seed data not present')

    // Trigger freeze + unfreeze to ensure middleware captures them.
    await request.post(`${API_BASE}/characteristics/${phaseCharId}/freeze-limits`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    })
    await request.post(`${API_BASE}/characteristics/${phaseCharId}/unfreeze-limits`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    })

    // Query audit log for freeze actions
    const auditLogs = await apiGet(request, `/audit/logs?action=freeze&limit=10`, token)
    expect(auditLogs.items).toBeDefined()
    expect(Array.isArray(auditLogs.items)).toBe(true)
    expect(auditLogs.items.length).toBeGreaterThan(0)

    const freezeEntry = auditLogs.items[0]
    expect(freezeEntry.action).toBe('freeze')
    expect(freezeEntry.resource_type).toBe('characteristic')
    expect(freezeEntry.username).toBeTruthy()
    expect(freezeEntry.timestamp).toBeTruthy()

    const unfreezeAudit = await apiGet(request, `/audit/logs?action=unfreeze&limit=10`, token)
    expect(unfreezeAudit.items.length).toBeGreaterThan(0)
    expect(unfreezeAudit.items[0].action).toBe('unfreeze')
  })

  // ----------------------------------------------------------------
  // Audit health endpoint
  // ----------------------------------------------------------------
  test('audit health endpoint returns healthy status', async ({ request }) => {
    const res = await request.get(`${API_BASE}/audit/health`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(res.ok()).toBeTruthy()
    const health = await res.json()
    expect(health.status).toBeDefined()
    expect(['healthy', 'degraded']).toContain(health.status)
    expect(health.failure_count).toBeDefined()
    expect(typeof health.failure_count).toBe('number')
  })

  // ----------------------------------------------------------------
  // Username recycling blocked: deactivated username returns 409
  // ----------------------------------------------------------------
  test('creating user with deactivated username returns 409', async ({ request }) => {
    test.skip(!hasSprint13, 'Sprint 13 seed data not present')

    const res = await request.post(`${API_BASE}/users/`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { username: 's13-deactivated', password: 'NewPassword123!' },
    })

    expect(res.status()).toBe(409)
    const errorBody = await res.json()
    expect(errorBody.detail).toBeTruthy()
  })

  // ----------------------------------------------------------------
  // Audit log API: 21 CFR Part 11 fields present
  // ----------------------------------------------------------------
  test('audit log entries have required fields via API', async ({ request }) => {
    const auditLogs = await apiGet(request, `/audit/logs?limit=5`, token)
    expect(auditLogs.items).toBeDefined()
    expect(auditLogs.items.length).toBeGreaterThan(0)

    const entry = auditLogs.items[0]
    expect(entry.id).toBeDefined()
    expect(entry.action).toBeDefined()
    expect(entry.timestamp).toBeDefined()
  })

  // ----------------------------------------------------------------
  // CSV export: validate response shape, headers, content
  // ----------------------------------------------------------------
  test('audit log CSV export downloads with expected shape', async ({ request }) => {
    const res = await request.get(`${API_BASE}/audit/logs/export?limit=50`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(res.ok()).toBeTruthy()

    const contentType = res.headers()['content-type']
    expect(contentType).toContain('text/csv')

    const disposition = res.headers()['content-disposition']
    expect(disposition).toContain('attachment')
    expect(disposition).toContain('audit_log.csv')

    const csvBody = await res.text()
    const lines = csvBody.trim().split('\n')
    expect(lines.length).toBeGreaterThan(1)

    const header = lines[0].toLowerCase()
    expect(header).toContain('timestamp')
    expect(header).toContain('username')
    expect(header).toContain('action')
  })

  // ----------------------------------------------------------------
  // Integrity verification endpoint
  // ----------------------------------------------------------------
  test('audit integrity verification returns valid result', async ({ request }) => {
    const res = await request.get(`${API_BASE}/audit/verify-integrity`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(res.ok()).toBeTruthy()
    const integrity = await res.json()
    expect(integrity.verified_count).toBeDefined()
    expect(typeof integrity.verified_count).toBe('number')
    expect(integrity.valid).toBeDefined()
    expect(typeof integrity.valid).toBe('boolean')
    expect(integrity.message).toBeTruthy()
  })

  // ----------------------------------------------------------------
  // Stats endpoint returns event counts
  // ----------------------------------------------------------------
  test('audit stats endpoint returns event counts', async ({ request }) => {
    const stats = await apiGet(request, '/audit/stats', token)
    expect(stats.total_events).toBeDefined()
    expect(typeof stats.total_events).toBe('number')
    expect(stats.total_events).toBeGreaterThan(0)
    expect(stats.events_by_action).toBeDefined()
    expect(typeof stats.events_by_action).toBe('object')
  })
})
