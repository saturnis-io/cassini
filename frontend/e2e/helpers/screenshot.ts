import type { Page, TestInfo } from '@playwright/test'
import path from 'path'
import fs from 'fs'

const SCREENSHOTS_DIR = path.resolve(process.cwd(), '../docs/screenshots')

type ScreenshotCategory = 'core' | 'commercial' | 'settings' | 'connectivity' | 'display' | 'features'

/**
 * Take a documentation screenshot and save to the screenshots directory.
 * Also attaches it to the Playwright HTML report.
 *
 * @param page Playwright page
 * @param category Subdirectory (core, commercial, settings, connectivity, display)
 * @param name Filename without extension (e.g., 'dashboard-control-chart')
 * @param testInfo Playwright test info for attaching to report
 */
export async function docScreenshot(
  page: Page,
  category: ScreenshotCategory,
  name: string,
  testInfo: TestInfo,
) {
  const dir = path.join(SCREENSHOTS_DIR, category)
  fs.mkdirSync(dir, { recursive: true })

  const filePath = path.join(dir, `${name}.png`)

  // Wait for animations to settle
  await page.waitForTimeout(500)

  const buffer = await page.screenshot({ type: 'png' })
  fs.writeFileSync(filePath, buffer)

  // Also attach to Playwright HTML report
  await testInfo.attach(`screenshot-${category}-${name}`, {
    body: buffer,
    contentType: 'image/png',
  })
}
