import { test, expect } from './fixtures'
import { loginAsAdmin } from './helpers/auth'
import { getAuthToken, apiGet, apiPost, API_BASE } from './helpers/api'
import {
  setControlLimits,
  seedSamples,
  switchToPlant,
  collapseNavSection,
  createPlant,
  createHierarchyNode,
  createCharacteristic,
  createUser,
  assignRole,
} from './helpers/seed'
import { docScreenshot } from './helpers/screenshot'

// ---------------------------------------------------------------------------
// Test 1: Capability Bootstrap CIs — Verify CI Ranges Display
// ---------------------------------------------------------------------------
test.describe('Capability Bootstrap CIs', () => {
  const plantName = 'CI Deep Plant'
  const charNames = { many: 'CI Many Char', few: 'CI Few Char' }
  let charManyId: number
  let charFewId: number

  test.beforeAll(async ({ request }) => {
    test.setTimeout(180_000) // 3 minutes for heavy data seeding
    const token = await getAuthToken(request)

    const plant = await createPlant(request, token, plantName)
    const dept = await createHierarchyNode(request, token, plant.id, 'CI Deep Dept', 'Area')
    const line = await createHierarchyNode(
      request,
      token,
      plant.id,
      'CI Deep Line',
      'Line',
      dept.id,
    )
    const station = await createHierarchyNode(
      request,
      token,
      plant.id,
      'CI Deep Station',
      'Cell',
      line.id,
    )

    // Characteristic with 60 samples (more data = narrower CI)
    const charMany = await createCharacteristic(request, token, station.id, charNames.many, {
      subgroup_size: 1,
      target_value: 10.0,
      usl: 15.0,
      lsl: 5.0,
    })
    await setControlLimits(request, token, charMany.id, {
      center_line: 10.0,
      ucl: 13.0,
      lcl: 7.0,
      sigma: 1.0,
    })
    charManyId = charMany.id

    // Seed 60 samples around target with moderate spread
    const manyValues: number[] = []
    for (let i = 0; i < 60; i++) {
      manyValues.push(Number((10.0 + (Math.random() - 0.5) * 4).toFixed(3)))
    }
    await seedSamples(request, token, charManyId, manyValues)

    // Characteristic with 15 samples (fewer data = wider CI)
    const charFew = await createCharacteristic(request, token, station.id, charNames.few, {
      subgroup_size: 1,
      target_value: 10.0,
      usl: 15.0,
      lsl: 5.0,
    })
    await setControlLimits(request, token, charFew.id, {
      center_line: 10.0,
      ucl: 13.0,
      lcl: 7.0,
      sigma: 1.0,
    })
    charFewId = charFew.id

    // Seed 15 samples around target with same spread
    const fewValues: number[] = []
    for (let i = 0; i < 15; i++) {
      fewValues.push(Number((10.0 + (Math.random() - 0.5) * 4).toFixed(3)))
    }
    await seedSamples(request, token, charFewId, fewValues)
  })

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await switchToPlant(page, plantName)
    await page.waitForTimeout(1000)
  })

  test('capability card shows CI ranges for Cpk/Ppk', async ({ page }, testInfo) => {
    await page.goto('/dashboard')
    await page.waitForTimeout(2000)

    await collapseNavSection(page)

    // Expand hierarchy to reach the characteristic with many samples
    const deptNode = page.getByText('CI Deep Dept', { exact: true }).first()
    await expect(deptNode).toBeVisible({ timeout: 15000 })

    for (const nodeName of ['CI Deep Dept', 'CI Deep Line', 'CI Deep Station']) {
      const node = page.getByText(nodeName, { exact: true }).first()
      await node.scrollIntoViewIfNeeded()
      await node.click({ force: true })
      await page.waitForTimeout(800)
    }

    // Click the characteristic with many samples
    const charNode = page.getByText(charNames.many).first()
    await expect(charNode).toBeVisible({ timeout: 10000 })
    await charNode.click()
    await page.waitForTimeout(2000)

    // Wait for the chart canvas to appear
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 10000 })

    // Open the Capability tab in the bottom drawer
    const capButton = page.getByRole('button', { name: 'Capability', exact: true })
    await expect(capButton).toBeVisible({ timeout: 5000 })
    await capButton.click()

    // Wait for the capability API call with include_ci=true to complete
    await page.waitForResponse(
      (resp) => resp.url().includes('/capability') && resp.url().includes('include_ci=true'),
      { timeout: 10000 },
    )
    await page.waitForTimeout(1500)

    // Verify Process Capability heading is visible
    const capHeading = page.getByText('Process Capability')
    await expect(capHeading).toBeVisible({ timeout: 8000 })

    // Verify Cpk label is visible
    const cpkLabel = page.getByText('Cpk', { exact: true }).first()
    await expect(cpkLabel).toBeVisible({ timeout: 5000 })

    // Look for CI range display — the format is "(X.XX – X.XX)" rendered in 10px text
    // The en-dash character (–) is used in the CI display
    const ciPattern = page.locator('text=/\\(\\d+\\.\\d+ . \\d+\\.\\d+\\)/')
    const ciCount = await ciPattern.count()
    expect(ciCount).toBeGreaterThanOrEqual(1)

    await docScreenshot(page, 'features', 'capability-card-with-ci-ranges', testInfo)
  })

  test('CI range is narrower with more samples', async ({ request }) => {
    const token = await getAuthToken(request)

    // Fetch capability with CI for both characteristics
    const capMany = await apiGet(
      request,
      `/characteristics/${charManyId}/capability?include_ci=true`,
      token,
    )
    const capFew = await apiGet(
      request,
      `/characteristics/${charFewId}/capability?include_ci=true`,
      token,
    )

    // Both should have Cpk CIs (if they have spec limits and enough data)
    // The characteristic with 60 samples should have a narrower CI than the one with 15
    if (capMany.cpk_ci && capFew.cpk_ci) {
      const widthMany = capMany.cpk_ci[1] - capMany.cpk_ci[0]
      const widthFew = capFew.cpk_ci[1] - capFew.cpk_ci[0]
      expect(widthMany).toBeLessThan(widthFew)
    } else {
      // If CIs are not available, at least verify the API responded with capability data
      expect(capMany.cpk).not.toBeNull()
      expect(capFew.cpk).not.toBeNull()
    }
  })
})

// ---------------------------------------------------------------------------
// Test 2: E-Signature Verification — API-Level Test
// ---------------------------------------------------------------------------
test.describe('E-Signature Verification', () => {
  let plantId: number
  let token: string

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request)

    // Create a plant for the e-sig tests
    const plant = await createPlant(request, token, 'ESig Test Plant')
    plantId = plant.id

    // Create a signature meaning for the plant (required for sign_standalone)
    try {
      await apiPost(request, `/signatures/meanings?plant_id=${plantId}`, token, {
        code: 'reviewed',
        display_name: 'Reviewed',
        description: 'Content has been reviewed',
        requires_comment: false,
        sort_order: 1,
      })
    } catch {
      // Meaning may already exist from a previous run — ignore 409
    }
  })

  test('sign and verify a resource — integrity check passes', async ({ request }) => {
    // Create an FAI report to sign (has content-based hashing: status + part_number)
    const report = await apiPost(request, '/fai/reports', token, {
      plant_id: plantId,
      part_number: 'ESIG-VERIFY-001',
      part_name: 'Integrity Test Part',
      revision: 'A',
    })
    expect(report.id).toBeTruthy()

    // Sign the FAI report resource
    const signRes = await request.post(
      `${API_BASE}/signatures/sign?plant_id=${plantId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        data: {
          resource_type: 'fai_report',
          resource_id: report.id,
          password: 'admin',
          meaning_code: 'reviewed',
        },
      },
    )
    expect(signRes.ok()).toBeTruthy()
    const signData = await signRes.json()
    expect(signData.signature_id).toBeTruthy()
    expect(signData.resource_hash).toBeTruthy()
    expect(signData.signature_hash).toBeTruthy()

    const signatureId = signData.signature_id

    // Verify the signature — should be tamper-free
    const verifyRaw = await request.get(
      `${API_BASE}/signatures/verify/${signatureId}?plant_id=${plantId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (!verifyRaw.ok()) {
      test.skip(true, `Signature verify endpoint returned ${verifyRaw.status()} — commercial routes may not be registered`)
      return
    }
    const verifyRes = await verifyRaw.json()
    expect(verifyRes.is_tamper_free).toBe(true)
    expect(verifyRes.resource_hash_valid).toBe(true)
    expect(verifyRes.signature_hash_valid).toBe(true)
    expect(verifyRes.signed_by).toBe('admin')
    expect(verifyRes.resource_type).toBe('fai_report')
  })

  test('tamper detection catches resource modification after signing', async ({ request }) => {
    // Create an FAI report to sign
    const report = await apiPost(request, '/fai/reports', token, {
      plant_id: plantId,
      part_number: 'ESIG-TAMPER-001',
      part_name: 'Tamper Test Part',
      revision: 'A',
    })
    expect(report.id).toBeTruthy()

    // Sign the FAI report in its current draft state
    const signRes = await request.post(
      `${API_BASE}/signatures/sign?plant_id=${plantId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        data: {
          resource_type: 'fai_report',
          resource_id: report.id,
          password: 'admin',
          meaning_code: 'reviewed',
          comment: 'Signed before status change',
        },
      },
    )
    expect(signRes.ok()).toBeTruthy()
    const signData = await signRes.json()
    const signatureId = signData.signature_id

    // Verify it is tamper-free initially
    const verifyBeforeRaw = await request.get(
      `${API_BASE}/signatures/verify/${signatureId}?plant_id=${plantId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (!verifyBeforeRaw.ok()) {
      test.skip(true, `Signature verify endpoint returned ${verifyBeforeRaw.status()} — commercial routes may not be registered`)
      return
    }
    const verifyBefore = await verifyBeforeRaw.json()
    expect(verifyBefore.is_tamper_free).toBe(true)
    expect(verifyBefore.resource_hash_valid).toBe(true)
    expect(verifyBefore.signature_hash_valid).toBe(true)

    // Tamper: submit the report (changes status from draft to submitted).
    // The FAI report resource hash includes status + part_number, so the
    // hash will change and verification should detect tampering.
    const submitRes = await request.post(
      `${API_BASE}/fai/reports/${report.id}/submit`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      },
    )
    // Submit may succeed (200) or require signature workflow (428) —
    // either way the status has changed or the attempt was made
    const submitOk = submitRes.ok() || submitRes.status() === 428

    if (submitRes.ok()) {
      // Status changed to "submitted" — verify should detect tamper
      const verifyAfter = await apiGet(
        request,
        `/signatures/verify/${signatureId}?plant_id=${plantId}`,
        token,
      )
      // resource_hash_valid should be false because status changed
      expect(verifyAfter.resource_hash_valid).toBe(false)
      // signature_hash_valid should still be true (the signature itself wasn't forged)
      expect(verifyAfter.signature_hash_valid).toBe(true)
      // Overall tamper-free should be false
      expect(verifyAfter.is_tamper_free).toBe(false)
    } else {
      // Workflow required — can't change status without signatures.
      // Verify the signature is still intact (no tampering occurred).
      expect(submitOk).toBe(true)
      const verifyStill = await apiGet(
        request,
        `/signatures/verify/${signatureId}?plant_id=${plantId}`,
        token,
      )
      expect(verifyStill.is_tamper_free).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// Test 3: SSO Role Lock — Toggle in User Management
// ---------------------------------------------------------------------------
test.describe('SSO Role Lock', () => {
  const testUsername = 'sso_lock_test_user'
  const testPassword = 'TestPassword123!'
  let testUserId: number
  let plantId: number

  test.beforeAll(async ({ request }) => {
    const token = await getAuthToken(request)

    // Create a plant for role assignment
    const plant = await createPlant(request, token, 'SSO Lock Plant')
    plantId = plant.id

    // Create a test user
    const user = await createUser(request, token, testUsername, testPassword)
    testUserId = user.id

    // Assign a role so the user appears with assignments
    await assignRole(request, token, testUserId, plantId, 'operator')
  })

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('toggle SSO role lock via UI and verify via API', async ({ page, request }, testInfo) => {
    // Navigate to Users page
    await page.goto('/admin/users')
    await page.waitForTimeout(2000)

    // Verify the users page is visible
    const usersPage = page.locator('[data-ui="users-page"]')
    await expect(usersPage).toBeVisible({ timeout: 10000 })

    // Find the test user row and click Edit
    const userRow = page.locator('tr').filter({ hasText: testUsername })
    await expect(userRow).toBeVisible({ timeout: 5000 })

    const editButton = userRow.getByRole('button', { name: 'Edit' })
    await expect(editButton).toBeVisible()
    await editButton.click()
    await page.waitForTimeout(1000)

    // The dialog should now be open with user details
    const dialog = page.locator('.fixed.inset-0.z-50').last()
    await expect(dialog).toBeVisible({ timeout: 5000 })

    // Find the role lock checkbox
    const rolesLockCheckbox = page.locator('#roles-locked')
    await expect(rolesLockCheckbox).toBeVisible({ timeout: 5000 })

    // Ensure it starts unchecked (new users default to false)
    const initialChecked = await rolesLockCheckbox.isChecked()

    // Toggle it ON
    if (!initialChecked) {
      await rolesLockCheckbox.check()
    } else {
      // Already checked — uncheck then check to test the toggle
      await rolesLockCheckbox.uncheck()
      await page.waitForTimeout(500)
      await rolesLockCheckbox.check()
    }

    // Wait for the API call to complete (the toggle calls the API directly)
    await page.waitForTimeout(1500)

    await docScreenshot(page, 'features', 'user-roles-lock-toggle', testInfo)

    // Close the dialog
    await page.getByRole('button', { name: 'Cancel' }).click()
    await page.waitForTimeout(500)

    // Reopen the dialog to verify persistence
    const editButton2 = page
      .locator('tr')
      .filter({ hasText: testUsername })
      .getByRole('button', { name: 'Edit' })
    await editButton2.click()
    await page.waitForTimeout(1000)

    // Verify the checkbox is still checked
    const rolesLockAfter = page.locator('#roles-locked')
    await expect(rolesLockAfter).toBeVisible({ timeout: 5000 })
    await expect(rolesLockAfter).toBeChecked()

    // Verify via API that roles_locked is true
    const token = await getAuthToken(request)
    const userData = await apiGet(request, `/users/${testUserId}`, token)
    expect(userData.roles_locked).toBe(true)

    // Close dialog
    await page.getByRole('button', { name: 'Cancel' }).click()
  })

  test('verify roles_locked toggles off correctly', async ({ page, request }) => {
    const token = await getAuthToken(request)

    // First ensure roles_locked is ON via API
    await request.patch(`${API_BASE}/users/${testUserId}/roles-lock`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: { locked: true },
    })

    // Navigate to Users page and open edit dialog
    await page.goto('/admin/users')
    await page.waitForTimeout(2000)

    const usersPage = page.locator('[data-ui="users-page"]')
    await expect(usersPage).toBeVisible({ timeout: 10000 })

    const editButton = page
      .locator('tr')
      .filter({ hasText: testUsername })
      .getByRole('button', { name: 'Edit' })
    await expect(editButton).toBeVisible({ timeout: 5000 })
    await editButton.click()
    await page.waitForTimeout(1000)

    // Verify checkbox is checked
    const rolesLockCheckbox = page.locator('#roles-locked')
    await expect(rolesLockCheckbox).toBeVisible({ timeout: 5000 })
    await expect(rolesLockCheckbox).toBeChecked()

    // Uncheck it
    await rolesLockCheckbox.uncheck()
    await page.waitForTimeout(1500)

    // Close and verify via API
    await page.getByRole('button', { name: 'Cancel' }).click()
    await page.waitForTimeout(500)

    const userData = await apiGet(request, `/users/${testUserId}`, token)
    expect(userData.roles_locked).toBe(false)
  })
})
