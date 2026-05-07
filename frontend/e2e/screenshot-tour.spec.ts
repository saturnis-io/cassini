import { test, expect } from './fixtures'
import { loginAsAdmin } from './helpers/auth'
import {
  switchToPlant,
  expandHierarchyToChar,
  expandSelectorToChar,
  collapseNavSection,
} from './helpers/seed'
import { getManifest } from './helpers/manifest'
import { docScreenshot } from './helpers/screenshot'

test.describe('Screenshot Tour', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await switchToPlant(page, 'Screenshot Tour Plant')
  })

  // ---------------------------------------------------------------------------
  // CORE (11 tests)
  // ---------------------------------------------------------------------------

  test('login page', async ({ page, context }, testInfo) => {
    await context.clearCookies()
    await page.goto('/login')
    await page.waitForTimeout(1000)
    await docScreenshot(page, 'core', 'login', testInfo)
  })

  test('dashboard control chart', async ({ page }, testInfo) => {
    await page.goto('/dashboard')
    await page.waitForTimeout(2000)
    await expandHierarchyToChar(page)
    await page.getByText('Test Char').first().click()
    await page.waitForTimeout(2000)
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 10000 })
    await docScreenshot(page, 'core', 'dashboard-control-chart', testInfo)
  })

  // --- NEW: README hero + dashboard alias screenshots ---
  // The README references `core/hero.png` (top hero shot) and
  // `core/dashboard.png` (I-MR chart with control limits). Both are
  // taken from the same loaded dashboard view so they stay in sync
  // with the chart-control-chart test.
  test('hero', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1600, height: 1000 })
    await page.goto('/dashboard')
    await page.waitForTimeout(2000)
    await expandHierarchyToChar(page)
    await page.getByText('Test Char').first().click()
    await page.waitForTimeout(2500)
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 10000 })
    await docScreenshot(page, 'core', 'hero', testInfo)
  })

  test('dashboard', async ({ page }, testInfo) => {
    await page.goto('/dashboard')
    await page.waitForTimeout(2000)
    await expandHierarchyToChar(page)
    await page.getByText('Test Char').first().click()
    await page.waitForTimeout(2000)
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 10000 })
    await docScreenshot(page, 'core', 'dashboard', testInfo)
  })

  // --- NEW: annotations screenshot ---
  test('annotations', async ({ page }, testInfo) => {
    await page.goto('/dashboard')
    await page.waitForTimeout(2000)
    await expandHierarchyToChar(page)
    await page.getByText('Test Char').first().click()
    await page.waitForTimeout(2000)
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 10000 })
    // Look for annotation indicators or an annotations panel on the chart
    const annotationsTab = page.getByRole('tab', { name: /annotation/i })
    if (await annotationsTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await annotationsTab.click()
      await page.waitForTimeout(1500)
    }
    // Try the annotations toggle/button if present
    const annotationsBtn = page.getByRole('button', { name: /annotation/i })
    if (await annotationsBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await annotationsBtn.click()
      await page.waitForTimeout(1500)
    }
    await docScreenshot(page, 'core', 'annotations', testInfo)
  })

  test('data entry', async ({ page }, testInfo) => {
    await page.goto('/data-entry')
    await page.waitForTimeout(2000)
    await collapseNavSection(page)
    await expandHierarchyToChar(page)
    await page.getByText('Test Char').first().click()
    await page.waitForTimeout(1500)

    // Fill in a measurement value
    const input = page.locator('input[type="number"]').first()
    if (await input.isVisible({ timeout: 3000 }).catch(() => false)) {
      await input.fill('10.05')
    }
    await docScreenshot(page, 'core', 'data-entry', testInfo)
  })

  test('violations', async ({ page }, testInfo) => {
    await page.goto('/violations')
    await page.waitForTimeout(2000)
    await expect(page.locator('table, [role="table"]').first()).toBeVisible({ timeout: 10000 })
    await docScreenshot(page, 'core', 'violations', testInfo)
  })

  test('reports', async ({ page }, testInfo) => {
    await page.goto('/reports')
    await page.waitForTimeout(2000)

    // The sidebar's Characteristics panel is collapsed by default — open it
    // via the persisted Zustand store so the hierarchy tree mounts. We can't
    // rely on UI clicks because the chevron may be off-screen on small
    // viewports.
    await page.evaluate(() => {
      const raw = localStorage.getItem('cassini-ui')
      const store = raw ? JSON.parse(raw) : { state: {}, version: 0 }
      store.state = store.state || {}
      store.state.characteristicsPanelOpen = true
      store.state.navSectionCollapsed = true
      localStorage.setItem('cassini-ui', JSON.stringify(store))
    })
    await page.reload({ waitUntil: 'networkidle' })

    // Pick a characteristic from the hierarchy selector so the report
    // preview has data to render — otherwise the page shows only an
    // empty state.
    await expandSelectorToChar(page)

    // Pick the "Characteristic Summary" template so the preview shows
    // the control chart, statistics, and recent violations sections.
    const templateSelect = page.getByRole('combobox', { name: 'Report template' })
    await expect(templateSelect).toBeVisible({ timeout: 10000 })
    await templateSelect.selectOption('characteristic-summary')

    // Wait for the rendered report content to appear (chart canvas + sections).
    const reportContent = page.locator('[data-ui="reports-content"]')
    await expect(reportContent).toBeVisible({ timeout: 15000 })
    await expect(reportContent.locator('canvas').first()).toBeVisible({ timeout: 15000 })

    await docScreenshot(page, 'core', 'reports', testInfo)
  })

  test('configuration', async ({ page }, testInfo) => {
    await page.goto('/configuration')
    await page.waitForTimeout(2000)
    await expect(page.locator('body')).toBeVisible()
    await docScreenshot(page, 'core', 'configuration', testInfo)
  })

  // --- NEW: time-travel replay (Pro+) — ReplayScrubber on dashboard ---
  test('time travel replay', async ({ page }, testInfo) => {
    // Larger viewport so the chart + ReplayScrubber + ReplayBanner all fit
    // in one frame for the marketing screenshot.
    await page.setViewportSize({ width: 1600, height: 1100 })
    await page.goto('/dashboard')
    await page.waitForTimeout(2000)
    await expandHierarchyToChar(page)
    await page.getByText('Test Char').first().click()
    await page.waitForTimeout(2000)
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 10000 })

    // ReplayScrubber renders below the chart for Pro+. Scroll it into
    // view, then set a timestamp ~30 minutes in the past via the
    // datetime-local input — that triggers the snapshot fetch and the
    // ReplayBanner.
    const scrubber = page.locator('[data-ui="replay-scrubber"]')
    await expect(scrubber).toBeVisible({ timeout: 10000 })
    await scrubber.scrollIntoViewIfNeeded()

    // Pick a recent past timestamp the seed data contains. The Screenshot
    // Tour Plant has 50 samples spanning the last few weeks; ~1 hour ago
    // is reliably within the data window.
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
    const pad = (n: number) => String(n).padStart(2, '0')
    const localDt =
      `${oneHourAgo.getFullYear()}-${pad(oneHourAgo.getMonth() + 1)}` +
      `-${pad(oneHourAgo.getDate())}T${pad(oneHourAgo.getHours())}:${pad(oneHourAgo.getMinutes())}`

    const dtInput = page.locator('[data-ui="replay-scrubber-datetime"]')
    await dtInput.fill(localDt)
    await dtInput.blur()

    // Wait for the ReplayBanner ("Viewing snapshot at ...") to mount and
    // for the snapshot fetch to settle.
    await page.waitForTimeout(2500)

    await docScreenshot(page, 'features', 'time-travel-replay', testInfo)
  })

  // --- NEW: capability analysis screenshot ---
  test('capability analysis', async ({ page }, testInfo) => {
    await expandHierarchyToChar(page)
    await page.getByText('Test Char').first().click()
    await page.waitForTimeout(1500)
    // Navigate to capability tab/section if separate
    const capTab = page.getByRole('tab', { name: /capability/i })
    if (await capTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await capTab.click()
      await page.waitForTimeout(2000)
    }
    await docScreenshot(page, 'core', 'capability', testInfo)
  })

  // --- NEW: import wizard screenshot ---
  test('import wizard', async ({ page }, testInfo) => {
    await page.goto('/import')
    await page.waitForTimeout(2000)
    await docScreenshot(page, 'core', 'import-wizard', testInfo)
  })

  // --- NEW: hierarchy tree screenshot ---
  test('hierarchy tree', async ({ page }, testInfo) => {
    await page.goto('/configuration')
    await page.waitForTimeout(2000)
    await expandHierarchyToChar(page)
    await docScreenshot(page, 'core', 'hierarchy', testInfo)
  })

  // --- NEW: show your work screenshot ---
  test('show your work', async ({ page }, testInfo) => {
    await page.goto('/dashboard')
    await page.waitForTimeout(2000)
    await expandHierarchyToChar(page)
    await page.getByText('Test Char').first().click()
    await page.waitForTimeout(2000)
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 10000 })

    // Enable Show Your Work mode — header button toggles state. The
    // title attribute switches between "Show Your Work: ON/OFF" so we
    // match by title to avoid clicking another control with similar text.
    const sywToggle = page.locator('button[title*="Show Your Work"]')
    await expect(sywToggle).toBeVisible({ timeout: 5000 })
    await sywToggle.click()

    // After toggle, capability values (Cpk, Ppk) are wrapped in
    // <Explainable> which adds the `explainable-value` class with a
    // dotted underline. Click the first one to open ExplanationPanel.
    const firstExplainable = page.locator('.explainable-value').first()
    await expect(firstExplainable).toBeVisible({ timeout: 5000 })
    await firstExplainable.click()

    // Wait for the slide-out panel to render the explanation content.
    const panel = page.locator('[data-ui="explanation-panel"]')
    await expect(panel).toBeVisible({ timeout: 10000 })
    await expect(panel.locator('[data-ui="explanation-content"]')).toBeVisible({
      timeout: 10000,
    })
    // Wait for the loaded data — the metric heading / value renders only
    // after the explanation API resolves; KaTeX rendering settles ~500ms.
    await page.waitForTimeout(1500)

    await docScreenshot(page, 'core', 'show-your-work', testInfo)
  })

  // ---------------------------------------------------------------------------
  // COMMERCIAL (8 tests)
  // ---------------------------------------------------------------------------

  test('msa study', async ({ page }, testInfo) => {
    const m = getManifest().screenshot_tour
    await page.goto(`/msa/${m.msa_study_id}`)
    await page.waitForTimeout(3000)
    await docScreenshot(page, 'commercial', 'msa-study', testInfo)
  })

  // --- NEW: MSA overview — completed Gage R&R study with results ---
  // Goes straight to the seeded study so the screenshot shows the
  // ANOVA table + verdict, not an empty list.
  test('msa overview', async ({ page }, testInfo) => {
    const m = getManifest().screenshot_tour
    await page.goto(`/msa/${m.msa_study_id}`)
    await page.waitForTimeout(4000)
    await docScreenshot(page, 'commercial', 'msa-overview', testInfo)
  })

  test('fai report', async ({ page }, testInfo) => {
    const m = getManifest().screenshot_tour
    await page.goto(`/fai/${m.fai_report_id}`)
    await page.waitForTimeout(3000)
    await docScreenshot(page, 'commercial', 'fai-report', testInfo)
  })

  test('doe study', async ({ page }, testInfo) => {
    const m = getManifest().screenshot_tour
    await page.goto(`/doe/${m.doe_study_id}`)
    await page.waitForTimeout(3000)
    await docScreenshot(page, 'commercial', 'doe-study', testInfo)
  })

  // --- NEW: DOE overview — completed study with main effects + interactions ---
  test('doe overview', async ({ page }, testInfo) => {
    const m = getManifest().screenshot_tour
    await page.goto(`/doe/${m.doe_study_id}`)
    await page.waitForTimeout(4000)
    await docScreenshot(page, 'commercial', 'doe-overview', testInfo)
  })

  test('analytics', async ({ page }, testInfo) => {
    await page.goto('/analytics')
    await page.waitForTimeout(3000)
    await docScreenshot(page, 'commercial', 'analytics', testInfo)
  })

  // --- NEW: Analytics overview — multivariate tab with charts ---
  test('analytics overview', async ({ page }, testInfo) => {
    await page.goto('/analytics?tab=multivariate')
    await page.waitForTimeout(4000)
    await docScreenshot(page, 'commercial', 'analytics-overview', testInfo)
  })

  test('galaxy', async ({ page }, testInfo) => {
    await page.goto('/galaxy')
    await page.waitForTimeout(5000)
    await docScreenshot(page, 'commercial', 'galaxy', testInfo)
  })

  // ---------------------------------------------------------------------------
  // SETTINGS (16 tests)
  // ---------------------------------------------------------------------------

  test('settings — account', async ({ page }, testInfo) => {
    await page.goto('/settings/account')
    await page.waitForTimeout(1500)
    await docScreenshot(page, 'settings', 'account', testInfo)
  })

  test('settings — appearance', async ({ page }, testInfo) => {
    await page.goto('/settings/appearance')
    await page.waitForTimeout(1500)
    await docScreenshot(page, 'settings', 'appearance', testInfo)
  })

  test('settings — sites', async ({ page }, testInfo) => {
    await page.goto('/settings/sites')
    await page.waitForTimeout(1500)
    await docScreenshot(page, 'settings', 'sites', testInfo)
  })

  test('settings — license', async ({ page }, testInfo) => {
    await page.goto('/settings/license')
    await page.waitForTimeout(1500)
    await docScreenshot(page, 'settings', 'license', testInfo)
  })

  test('settings — users', async ({ page }, testInfo) => {
    await page.goto('/admin/users')
    await page.waitForTimeout(1500)
    await docScreenshot(page, 'settings', 'users', testInfo)
  })

  test('settings — audit log', async ({ page }, testInfo) => {
    await page.goto('/settings/audit-log')
    await page.waitForTimeout(1500)
    await docScreenshot(page, 'settings', 'audit-log', testInfo)
  })

  test('settings — sso', async ({ page }, testInfo) => {
    await page.goto('/settings/sso')
    await page.waitForTimeout(1500)
    await docScreenshot(page, 'settings', 'sso', testInfo)
  })

  test('settings — signatures', async ({ page }, testInfo) => {
    await page.goto('/settings/signatures')
    await page.waitForTimeout(1500)
    await docScreenshot(page, 'settings', 'signatures', testInfo)
  })

  test('settings — api keys', async ({ page }, testInfo) => {
    await page.goto('/settings/api-keys')
    await page.waitForTimeout(1500)
    await docScreenshot(page, 'settings', 'api-keys', testInfo)
  })

  test('settings — database', async ({ page }, testInfo) => {
    await page.goto('/settings/database')
    await page.waitForTimeout(1500)
    await docScreenshot(page, 'settings', 'database', testInfo)
  })

  test('settings — branding', async ({ page }, testInfo) => {
    await page.goto('/settings/branding')
    await page.waitForTimeout(1500)
    await docScreenshot(page, 'settings', 'branding', testInfo)
  })

  test('settings — retention', async ({ page }, testInfo) => {
    await page.goto('/settings/retention')
    await page.waitForTimeout(1500)
    await docScreenshot(page, 'settings', 'retention', testInfo)
  })

  test('settings — notifications', async ({ page }, testInfo) => {
    await page.goto('/settings/notifications')
    await page.waitForTimeout(1500)
    await docScreenshot(page, 'settings', 'notifications', testInfo)
  })

  test('settings — localization', async ({ page }, testInfo) => {
    await page.goto('/settings/localization')
    await page.waitForTimeout(1500)
    await docScreenshot(page, 'settings', 'localization', testInfo)
  })

  test('settings — scheduled reports', async ({ page }, testInfo) => {
    await page.goto('/settings/reports')
    await page.waitForTimeout(1500)
    await docScreenshot(page, 'settings', 'scheduled-reports', testInfo)
  })

  test('settings — ai', async ({ page }, testInfo) => {
    await page.goto('/settings/ai')
    await page.waitForTimeout(1500)
    await docScreenshot(page, 'settings', 'ai', testInfo)
  })

  // ---------------------------------------------------------------------------
  // CONNECTIVITY (4 tests)
  // ---------------------------------------------------------------------------

  test('connectivity monitor', async ({ page }, testInfo) => {
    await page.goto('/connectivity')
    await page.waitForTimeout(2000)
    await docScreenshot(page, 'connectivity', 'monitor', testInfo)
  })

  // --- NEW: connectivity hub overview (README hero shot) ---
  // Same view as monitor — README references `connectivity.png` showing
  // the seeded "Shop Floor Broker" with live tag preview.
  test('connectivity hub', async ({ page }, testInfo) => {
    await page.goto('/connectivity')
    await page.waitForTimeout(2500)
    await docScreenshot(page, 'connectivity', 'connectivity', testInfo)
  })

  test('connectivity servers', async ({ page }, testInfo) => {
    await page.goto('/connectivity')
    await page.waitForTimeout(2000)
    const nav = page.locator('nav[aria-label="Connectivity navigation"]')
    if (await nav.isVisible({ timeout: 3000 }).catch(() => false)) {
      await nav.getByRole('link', { name: 'Servers', exact: true }).click()
      await page.waitForTimeout(1500)
    }
    await docScreenshot(page, 'connectivity', 'servers', testInfo)
  })

  test('connectivity mapping', async ({ page }, testInfo) => {
    await page.goto('/connectivity')
    await page.waitForTimeout(2000)
    const nav = page.locator('nav[aria-label="Connectivity navigation"]')
    if (await nav.isVisible({ timeout: 3000 }).catch(() => false)) {
      await nav.getByRole('link', { name: 'Mapping', exact: true }).click()
      await page.waitForTimeout(1500)
    }
    await docScreenshot(page, 'connectivity', 'mapping', testInfo)
  })

  // ---------------------------------------------------------------------------
  // FEATURES (3 tests)
  // ---------------------------------------------------------------------------

  // --- NEW: streaming CEP rules — Monaco editor with a meaningful YAML rule ---
  test('cep rules', async ({ page }, testInfo) => {
    // Larger viewport so Monaco's font reads clearly in the README screenshot.
    await page.setViewportSize({ width: 1600, height: 1000 })
    await page.goto('/cep-rules')
    await page.waitForTimeout(1500)

    // Click "New Rule" so Monaco mounts with the DEFAULT_CEP_RULE_TEMPLATE
    // — a meaningful sample rule with comments, conditions, and action.
    await page.getByRole('button', { name: 'New Rule' }).click()

    // Wait for Monaco to fully mount AND start painting. The skeleton
    // loader is shown until Monaco's bundle loads. The view-lines element
    // is the rendering surface — wait for visible content.
    await expect(page.locator('.monaco-editor').first()).toBeVisible({ timeout: 15000 })
    await expect(page.locator('[data-ui="cep-editor-skeleton"]')).toBeHidden({
      timeout: 15000,
    })
    const viewLines = page.locator('.monaco-editor .view-lines').first()
    await expect(viewLines).toBeVisible({ timeout: 10000 })
    // First visible line of DEFAULT_CEP_RULE_TEMPLATE is a comment.
    await expect(viewLines).toContainText('CEP rule', { timeout: 10000 })

    // Force Monaco to layout + reveal line 1 so the screenshot shows the
    // top of the template, not a scrolled mid-section.
    await page.evaluate(() => {
      const m = (window as unknown as {
        monaco?: {
          editor: { getEditors(): { revealLine(n: number): void; layout(): void }[] }
        }
      }).monaco
      m?.editor.getEditors()[0]?.revealLine(1)
      m?.editor.getEditors()[0]?.layout()
    })

    // Final settle for syntax highlighting paint.
    await page.waitForTimeout(2000)

    await docScreenshot(page, 'features', 'cep-rules', testInfo)
  })

  // --- NEW: SOP-grounded RAG with mocked answer (real seed corpus) ---
  // Seeds a real SopDoc + chunks in the unified seed script, then mocks
  // the /sop-rag/query endpoint so the screenshot shows a populated
  // answer pane with citation pills — no ANTHROPIC_API_KEY required.
  test('sop rag', async ({ page }, testInfo) => {
    // Mock the SOP-RAG query so we get a deterministic, populated answer
    // without hitting Anthropic's API. The seeded corpus has chunk IDs
    // that we cite back here — the citation pill renders the chunk_id.
    await page.route('**/api/v1/sop-rag/query**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          refused: false,
          answer:
            'Tighten the M6 bolt to 12 Nm using a calibrated torque ' +
            'wrench [citation:1]. The operator must sign the inspection ' +
            'sheet in section 3-B after the 24-hour cure period [citation:2].',
          answer_stripped:
            'Tighten the M6 bolt to 12 Nm using a calibrated torque wrench. ' +
            'The operator must sign the inspection sheet in section 3-B ' +
            'after the 24-hour cure period.',
          citations: [
            {
              chunk_id: 1,
              doc_id: 1,
              doc_title: 'M6 Bolt Assembly Procedure',
              chunk_index: 0,
              paragraph_label: 'section 1 / page 1',
              text:
                'Tighten the M6 bolt to 12 Nm using the calibrated torque ' +
                'wrench. Apply Loctite 243 to the threads before assembly.',
              score: 0.92,
            },
            {
              chunk_id: 2,
              doc_id: 1,
              doc_title: 'M6 Bolt Assembly Procedure',
              chunk_index: 1,
              paragraph_label: 'section 3-B / page 2',
              text:
                'After the cure period the operator must sign the ' +
                'inspection sheet in section 3-B. Operator ID is logged ' +
                'with timestamp.',
              score: 0.84,
            },
          ],
          sentences: [
            {
              text: 'Tighten the M6 bolt to 12 Nm using a calibrated torque wrench.',
              chunk_ids: [1],
            },
            {
              text:
                'The operator must sign the inspection sheet in section 3-B ' +
                'after the 24-hour cure period.',
              chunk_ids: [2],
            },
          ],
          candidate_chunk_ids: [1, 2, 3],
          cost_usd: 0.0021,
          input_tokens: 412,
          output_tokens: 78,
          model: 'claude-sonnet-4-6',
        }),
      })
    })

    await page.goto('/sop-rag')
    await page.waitForTimeout(1500)

    // The seeded corpus list should populate — wait for the doc row.
    await expect(page.locator('[data-ui="sop-doc-row"]').first()).toBeVisible({
      timeout: 10000,
    })

    // Type a question and click Ask.
    const input = page.getByLabel('SOP question')
    await expect(input).toBeVisible({ timeout: 5000 })
    await input.fill(
      'What is the M6 bolt torque spec and when do I sign off?',
    )
    await page.getByRole('button', { name: /^Ask$/ }).click()

    // Wait for the mocked answer + citation pills to render.
    await expect(page.locator('[data-ui="citation-pill"]').first()).toBeVisible({
      timeout: 10000,
    })
    await page.waitForTimeout(800)

    await docScreenshot(page, 'features', 'sop-rag', testInfo)
  })

  // --- NEW: Lakehouse data product page with table picker + snippet ---
  test('lakehouse', async ({ page }, testInfo) => {
    await page.goto('/lakehouse')
    await page.waitForTimeout(1500)

    // The page renders a `data-ui="lakehouse-page"` wrapper once the
    // license check resolves; the catalog query then populates the
    // table picker and snippet preview.
    await expect(page.locator('[data-ui="lakehouse-page"]')).toBeVisible({
      timeout: 10000,
    })

    // Wait for the curl + python snippets to render — the catalog query
    // populates them once it resolves.
    await expect(page.locator('pre').first()).toBeVisible({ timeout: 10000 })
    await page.waitForTimeout(500)

    await docScreenshot(page, 'features', 'lakehouse', testInfo)
  })

  // ---------------------------------------------------------------------------
  // DISPLAY (2 tests)
  // ---------------------------------------------------------------------------

  test('kiosk', async ({ page }, testInfo) => {
    await page.goto('/kiosk')
    await page.waitForTimeout(3000)
    await docScreenshot(page, 'display', 'kiosk', testInfo)
  })

  test('wall dashboard', async ({ page }, testInfo) => {
    await page.goto('/wall-dashboard')
    await page.waitForTimeout(3000)
    await docScreenshot(page, 'display', 'wall-dashboard', testInfo)
  })
})
