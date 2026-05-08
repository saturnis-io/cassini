/**
 * Group M — Enterprise Features (CATALOG.md M1-M4).
 *
 * P0 states (16):
 *   M1.01 CEP no plant
 *   M1.02 CEP empty list
 *   M1.03 CEP rule list
 *   M1.04 CEP rule selected
 *   M1.05 CEP new rule draft
 *   M2.01 SOP-RAG no plant
 *   M2.02 SOP-RAG empty corpus
 *   M2.03 SOP-RAG corpus populated
 *   M2.08 SOP-RAG ask question
 *   M2.10 SOP-RAG answer with citations
 *   M2.11 SOP-RAG refusal view
 *   M3.02 Lakehouse table selector
 *   M3.03 Lakehouse format Arrow IPC
 *   M3.08 Lakehouse columns metadata
 *   M3.09 Lakehouse export URL
 *   M3.10 Lakehouse curl snippet
 *   M3.11 Lakehouse Python snippet
 */
import { test, expect } from '../fixtures'
import { captureScreenshot, setupAdmin, waitForMonaco } from './helpers'

const GROUP = 'M'

test.describe('Group M — Enterprise Features', () => {
  // -- M1. CEP Rules Page ----------------------------------------------
  test.describe('M1 — CEP Rules', () => {
    const FEATURE = 'M1-cep-rules'

    test('M1.01 — no-plant', async ({ page }, testInfo) => {
      await setupAdmin(page)
      await page.evaluate(() => {
        const raw = localStorage.getItem('cassini-ui')
        const store = raw ? JSON.parse(raw) : { state: {}, version: 0 }
        store.state = store.state || {}
        store.state.selectedPlantId = null
        localStorage.setItem('cassini-ui', JSON.stringify(store))
      })
      await page.goto('/cep-rules', { waitUntil: 'networkidle' })
      await page.waitForTimeout(1500)
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '01',
        stateName: 'no-plant',
      })
    })

    test('M1.02 — empty-list', async ({ page }, testInfo) => {
      // Pharma has no CEP rules per SEED_SPEC.md (only Aerospace seeded)
      await setupAdmin(page, 'Pharma Fill')
      await page.goto('/cep-rules', { waitUntil: 'networkidle' })
      await page.waitForTimeout(2000)
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '02',
        stateName: 'empty-list',
        viewport: 'wide',
      })
    })

    test('M1.03 — rule-list', async ({ page }, testInfo) => {
      await setupAdmin(page, 'Aerospace Forge')
      await page.goto('/cep-rules', { waitUntil: 'networkidle' })
      await page.waitForTimeout(2500)
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '03',
        stateName: 'rule-list',
        viewport: 'wide',
      })
    })

    test('M1.04 — rule-selected', async ({ page }, testInfo) => {
      await setupAdmin(page, 'Aerospace Forge')
      await page.goto('/cep-rules', { waitUntil: 'networkidle' })
      await page.waitForTimeout(2500)
      // Click the first rule in the left pane to load Monaco editor
      const ruleItem = page.locator('[data-ui="cep-rules-list"] button, [data-ui="cep-rules-list"] li').first()
      if (await ruleItem.isVisible({ timeout: 3000 }).catch(() => false)) {
        await ruleItem.click()
      } else {
        const firstRow = page.getByText(/cross-station-drift|coolant-and-shaft/i).first()
        if (await firstRow.isVisible({ timeout: 3000 }).catch(() => false)) {
          await firstRow.click()
        }
      }
      await waitForMonaco(page).catch(() => {
        // Monaco may not load if rule list doesn't render — fallback wait
      })
      await page.waitForTimeout(1500)
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '04',
        stateName: 'rule-selected',
        viewport: 'wide',
      })
    })

    test('M1.05 — new-rule-draft', async ({ page }, testInfo) => {
      await setupAdmin(page, 'Aerospace Forge')
      await page.goto('/cep-rules', { waitUntil: 'networkidle' })
      await page.waitForTimeout(2000)
      const newBtn = page.getByRole('button', { name: /^new rule$|^create rule$/i }).first()
      if (await newBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await newBtn.click()
      }
      await waitForMonaco(page, 'CEP rule').catch(() => {
        // ignore — Monaco may not finish in some envs
      })
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '05',
        stateName: 'new-rule-draft',
        viewport: 'wide',
      })
    })

    test.skip('M1.06-09 — P1', () => {})
  })

  // -- M2. SOP-Grounded RAG --------------------------------------------
  test.describe('M2 — SOP-RAG', () => {
    const FEATURE = 'M2-sop-rag'

    test('M2.01 — no-plant', async ({ page }, testInfo) => {
      await setupAdmin(page)
      await page.evaluate(() => {
        const raw = localStorage.getItem('cassini-ui')
        const store = raw ? JSON.parse(raw) : { state: {}, version: 0 }
        store.state = store.state || {}
        store.state.selectedPlantId = null
        localStorage.setItem('cassini-ui', JSON.stringify(store))
      })
      await page.goto('/sop-rag', { waitUntil: 'networkidle' })
      await page.waitForTimeout(1500)
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '01',
        stateName: 'no-plant',
      })
    })

    test('M2.02 — empty-corpus', async ({ page }, testInfo) => {
      // Auto Stamping has no SOP docs per SEED_SPEC.md (only Aerospace)
      await setupAdmin(page, 'Auto Stamping')
      await page.goto('/sop-rag', { waitUntil: 'networkidle' })
      await page.waitForTimeout(2500)
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '02',
        stateName: 'empty-corpus',
      })
    })

    test('M2.03 — corpus-populated', async ({ page }, testInfo) => {
      await setupAdmin(page, 'Aerospace Forge')
      await page.goto('/sop-rag', { waitUntil: 'networkidle' })
      await page.waitForTimeout(2500)
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '03',
        stateName: 'corpus-populated',
        viewport: 'wide',
      })
    })

    test('M2.08 — ask-question-typing', async ({ page }, testInfo) => {
      await setupAdmin(page, 'Aerospace Forge')
      await page.goto('/sop-rag', { waitUntil: 'networkidle' })
      await page.waitForTimeout(2000)
      const input = page
        .locator('input[type="text"], textarea')
        .filter({ hasText: '' })
        .first()
      const askInput = page.locator('input, textarea').last()
      if (await askInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await askInput.fill('What is the bolt torque for the M6 fastener?')
        await page.waitForTimeout(800)
      }
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '08',
        stateName: 'ask-typing',
      })
    })

    test('M2.10 — answer-with-citations', async ({ page }, testInfo) => {
      // Mock the RAG endpoint deterministically (per screenshot-tour
      // pattern) so we don't need ANTHROPIC_API_KEY.
      await page.route('**/api/v1/sop-rag/query**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            refused: false,
            answer:
              'For the M6 turbine housing fastener, torque to 12 Nm using a calibrated wrench [citation:1]. Sign the inspection sheet in section 3-B [citation:2].',
            answer_stripped:
              'For the M6 turbine housing fastener, torque to 12 Nm using a calibrated wrench. Sign the inspection sheet in section 3-B.',
            citations: [
              {
                chunk_id: 1,
                doc_id: 1,
                doc_title: 'Press Line A — Operating Procedures',
                chunk_index: 0,
                paragraph_label: 'section 3 / page 4',
                text: 'Tighten the M6 fastener to 12 Nm.',
              },
              {
                chunk_id: 2,
                doc_id: 1,
                doc_title: 'Press Line A — Operating Procedures',
                chunk_index: 1,
                paragraph_label: 'section 3-B / page 5',
                text: 'Operator signs the inspection sheet at the cure period.',
              },
            ],
            metrics: { tokens_used: 245, latency_ms: 1300, cost_usd: 0.0042 },
          }),
        })
      })
      await setupAdmin(page, 'Aerospace Forge')
      await page.goto('/sop-rag', { waitUntil: 'networkidle' })
      await page.waitForTimeout(2000)
      const askInput = page.locator('input, textarea').last()
      if (await askInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await askInput.fill('What is the bolt torque?')
        const askBtn = page.getByRole('button', { name: /^ask$|^submit$/i }).first()
        if (await askBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await askBtn.click()
          await page.waitForTimeout(2500)
        }
      }
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '10',
        stateName: 'answer-citations',
        viewport: 'wide',
      })
    })

    test('M2.11 — refusal-view', async ({ page }, testInfo) => {
      await page.route('**/api/v1/sop-rag/query**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            refused: true,
            reason: 'no_citation_match',
            failed_sentence: 'The bolt should be torqued to 50 Nm.',
            answer: '',
            citations: [],
          }),
        })
      })
      await setupAdmin(page, 'Aerospace Forge')
      await page.goto('/sop-rag', { waitUntil: 'networkidle' })
      await page.waitForTimeout(2000)
      const askInput = page.locator('input, textarea').last()
      if (await askInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await askInput.fill('What is the temperature?')
        const askBtn = page.getByRole('button', { name: /^ask$|^submit$/i }).first()
        if (await askBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await askBtn.click()
          await page.waitForTimeout(2500)
        }
      }
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '11',
        stateName: 'refusal',
      })
    })

    test.skip('M2.04-07, 09, 12-15 — P1', () => {})
  })

  // -- M3. Cassini Lakehouse -------------------------------------------
  test.describe('M3 — Lakehouse', () => {
    const FEATURE = 'M3-lakehouse'

    test.beforeEach(async ({ page }) => {
      await setupAdmin(page, 'Aerospace Forge')
      await page.goto('/lakehouse', { waitUntil: 'networkidle' })
      await page.waitForTimeout(3000)
    })

    test('M3.02 — table-selector', async ({ page }, testInfo) => {
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '02',
        stateName: 'table-selector',
      })
    })

    test('M3.03 — format-arrow-ipc', async ({ page }, testInfo) => {
      const arrowBtn = page.getByRole('button', { name: /arrow ipc|arrow/i }).first()
      if (await arrowBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await arrowBtn.click()
        await page.waitForTimeout(800)
      }
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '03',
        stateName: 'arrow-format',
      })
    })

    test('M3.08 — columns-metadata', async ({ page }, testInfo) => {
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '08',
        stateName: 'columns-metadata',
      })
    })

    test('M3.09 — export-url', async ({ page }, testInfo) => {
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '09',
        stateName: 'export-url',
      })
    })

    test('M3.10 — curl-snippet', async ({ page }, testInfo) => {
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '10',
        stateName: 'curl-snippet',
      })
    })

    test('M3.11 — python-snippet', async ({ page }, testInfo) => {
      await captureScreenshot(page, testInfo, {
        group: GROUP,
        feature: FEATURE,
        stateNumber: '11',
        stateName: 'python-snippet',
      })
    })

    test.skip('M3.01, 04-07, 12-15 — P1', () => {})
  })

  // -- M4. Cluster Status (single-node seed gap) -----------------------
  test.describe('M4 — Cluster Status', () => {
    test.skip('M4.01-03 — gap: cluster status route requires multi-node setup not seeded', () => {})
  })
})
