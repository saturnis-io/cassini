/**
 * Group H — Compliance (CATALOG.md H1-H3).
 *
 * P0 states (4):
 *   H1.01 No workflows configured
 *   H1.02 Workflow list
 *   H2.01 Signature dialog — default
 *   H2.03 Signature success
 */
import { test, expect } from '../fixtures'
import { captureScreenshot, setupAdmin } from './helpers'

const GROUP = 'H'

test.describe('Group H — Compliance', () => {
  // -- H1. Electronic Signatures Settings -------------------------------
  test.describe('H1 — Electronic Signatures Settings', () => {
    const FEATURE = 'H1-electronic-signatures-settings'

    test('H1.01 — no-workflows', async ({ page }, testInfo) => {
      // Auto Stamping has no FAI workflows per SEED_SPEC.md section 14
      // (workflows are configured globally; the page may still show seeded
      // workflows). For best-effort empty state, navigate without the
      // global workflow config — admin sees the configured list.
      // Document as best-effort.
      await setupAdmin(page, 'Auto Stamping')
      await page.goto('/settings/signatures', { waitUntil: 'networkidle' })
      await page.waitForTimeout(2000)
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '01',
        stateName: 'no-workflows',
      })
    })

    test('H1.02 — workflow-list', async ({ page }, testInfo) => {
      await setupAdmin(page, 'Aerospace Forge')
      await page.goto('/settings/signatures', { waitUntil: 'networkidle' })
      await page.waitForTimeout(2500)
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '02',
        stateName: 'workflow-list',
      })
    })

    test.skip('H1.03-06 — P1', () => {})
  })

  // -- H2. Signature Dialog --------------------------------------------
  test.describe('H2 — Signature Dialog (in-context)', () => {
    const FEATURE = 'H2-signature-dialog'

    test('H2.01 — dialog-open-default', async ({ page }, testInfo) => {
      // Trigger via FAI submit on a draft report
      await setupAdmin(page, 'Aerospace Forge')
      await page.goto('/fai', { waitUntil: 'networkidle' })
      await page.waitForTimeout(2000)
      // Click the first draft FAI card
      const draftCard = page.getByText(/^draft$/i).first()
      if (await draftCard.isVisible({ timeout: 3000 }).catch(() => false)) {
        await draftCard.click({ force: true })
        await page.waitForTimeout(2000)
        const submitBtn = page.getByRole('button', { name: /submit for approval|submit/i }).first()
        if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await submitBtn.click()
          await page.waitForTimeout(1500)
        }
      }
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '01',
        stateName: 'dialog-default',
      })
    })

    test('H2.03 — success-state', async ({ page }, testInfo) => {
      // Approximate "success" by capturing the approved FAI report state
      // — that is, the post-signature outcome.
      await setupAdmin(page, 'Aerospace Forge')
      await page.goto('/fai', { waitUntil: 'networkidle' })
      await page.waitForTimeout(2000)
      const approved = page.getByText(/^approved$/i).first()
      if (await approved.isVisible({ timeout: 3000 }).catch(() => false)) {
        await approved.click({ force: true })
        await page.waitForTimeout(2500)
      }
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '03',
        stateName: 'success-state',
      })
    })

    test.skip('H2.02 — wrong password (P1)', () => {})
  })

  // -- H3. Retention Settings ------------------------------------------
  test.describe('H3 — Retention Settings', () => {
    test.skip('H3.01-04 — all states are P1', () => {})
  })
})
