import { test, expect } from './fixtures'
import { loginAsAdmin } from './helpers/auth'
import { switchToPlant } from './helpers/seed'

test.describe('Electronic Signatures', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await switchToPlant(page, 'Screenshot Tour Plant')
  })

  test('signatures settings page loads', async ({ page }) => {
    await page.goto('/settings/signatures')
    await page.waitForTimeout(2000)

    // Page header
    await expect(
      page.getByRole('heading', { name: 'Electronic Signatures' }),
    ).toBeVisible({ timeout: 10000 })

    // Compliance subtitle
    await expect(page.getByText('21 CFR Part 11')).toBeVisible({
      timeout: 5000,
    })

    // Tab bar should show Workflows tab
    const tabBar = page.locator('[data-ui="signature-settings-tabs"]')
    await expect(tabBar).toBeVisible({ timeout: 5000 })
    await expect(tabBar.getByText('Workflows')).toBeVisible({ timeout: 5000 })

    await test.info().attach('signatures-page-loaded', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('seeded workflow visible', async ({ page }) => {
    await page.goto('/settings/signatures')
    await page.waitForTimeout(3000)

    // The seed script creates a "Sample Approval Workflow" workflow
    // Look for it in the workflow list
    await expect(page.getByText('Sample Approval Workflow').first()).toBeVisible({
      timeout: 10000,
    })

    // Workflow should show Active badge
    await expect(page.getByText('Active').first()).toBeVisible({
      timeout: 5000,
    })

    await test.info().attach('signatures-workflow-visible', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('workflow steps visible', async ({ page }) => {
    await page.goto('/settings/signatures')
    await page.waitForTimeout(3000)

    // Find the Sample Approval Workflow and expand it
    const faiWorkflow = page.getByText('Sample Approval Workflow').first()
    await expect(faiWorkflow).toBeVisible({ timeout: 10000 })

    // Click the expand chevron — it's the first button in the workflow row header.
    // WorkflowItem DOM: div.border > div.flex.items-center.gap-3.p-3 > button(chevron), div(content), div(actions)
    // The workflow name is inside: div.flex.items-center.gap-3.p-3 > div.min-w-0 > div > span
    // Navigate up to the row header (div.flex.items-center.gap-3.p-3) and find the first button
    const workflowCard = faiWorkflow.locator('xpath=ancestor::div[contains(@class, "rounded-lg")]').first()
    const expandButton = workflowCard.locator('button').first()
    await expandButton.click()
    await page.waitForTimeout(2000)

    // The seed creates 2 steps: Engineering Review, Quality Approval
    // Check if step content is visible after expansion
    const pageContent = page.locator('[data-ui="signature-settings"]')
    const hasEngineeringReview = await pageContent
      .getByText('Engineering Review')
      .isVisible()
      .catch(() => false)
    const hasQualityApproval = await pageContent
      .getByText('Quality Approval')
      .isVisible()
      .catch(() => false)

    // At least one step should be visible (steps exist in seeded data)
    expect(hasEngineeringReview || hasQualityApproval).toBeTruthy()

    await test.info().attach('signatures-workflow-steps', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('signature meanings visible', async ({ page }) => {
    await page.goto('/settings/signatures')
    await page.waitForTimeout(2000)

    // Click the Signature Meanings tab
    const meaningsTab = page
      .locator('[data-ui="signature-settings-tabs"]')
      .getByText('Signature Meanings')
    await expect(meaningsTab).toBeVisible({ timeout: 5000 })
    await meaningsTab.click()
    await page.waitForTimeout(2000)

    // Should show the Signature Meanings content area (not the tab button)
    const content = page.locator('[data-ui="signature-settings"]')
    await expect(
      content.getByText('Signature Meanings').first(),
    ).toBeVisible({ timeout: 5000 })

    // The seed creates default meanings: reviewed, approved, rejected
    // Check for at least one of these
    const hasReviewed = await page
      .getByText('reviewed', { exact: false })
      .first()
      .isVisible()
      .catch(() => false)
    const hasApproved = await page
      .getByText('approved', { exact: false })
      .first()
      .isVisible()
      .catch(() => false)
    const hasRejected = await page
      .getByText('rejected', { exact: false })
      .first()
      .isVisible()
      .catch(() => false)

    expect(hasReviewed || hasApproved || hasRejected).toBeTruthy()

    await test.info().attach('signatures-meanings', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('screenshot', async ({ page }) => {
    await page.goto('/settings/signatures')
    await page.waitForTimeout(3000)

    await expect(
      page.locator('[data-ui="signature-settings"]'),
    ).toBeVisible({ timeout: 10000 })

    await test.info().attach('e-signatures-full', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })
  })
})
