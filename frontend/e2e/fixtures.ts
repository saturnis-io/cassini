import { test as base, expect } from '@playwright/test'

/**
 * Extended Playwright test fixture that automatically captures browser
 * console errors and uncaught page exceptions during every test.
 *
 * Tests will fail if any `console.error()` calls or uncaught exceptions
 * are detected, unless the message matches an entry in `IGNORED_PATTERNS`.
 */

// Patterns to ignore (noisy browser internals, expected dev warnings, etc.)
const IGNORED_PATTERNS = [
  /Download the React DevTools/,
  /React does not recognize the .* prop/,
  /Failed to load resource.*favicon/,
  /WebSocket connection.*failed/,   // WS disconnects during page teardown
  /net::ERR_CONNECTION_REFUSED/,    // backend not yet ready during first load
  /ResizeObserver loop/,            // benign browser layout warning
]

function shouldIgnore(text: string): boolean {
  return IGNORED_PATTERNS.some((pattern) => pattern.test(text))
}

type ConsoleEntry = { type: string; text: string }

export const test = base.extend<{
  consoleErrors: ConsoleEntry[]
}>({
  consoleErrors: async ({ page }, use) => {
    const errors: ConsoleEntry[] = []

    // Capture console.error() calls
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text()
        if (!shouldIgnore(text)) {
          errors.push({ type: 'console.error', text })
        }
      }
    })

    // Capture uncaught exceptions (thrown errors, unhandled promise rejections)
    page.on('pageerror', (error) => {
      const text = error.message
      if (!shouldIgnore(text)) {
        errors.push({ type: 'uncaught exception', text })
      }
    })

    // Hand control to the test
    await use(errors)

    // After the test completes, attach any errors to the report and fail
    if (errors.length > 0) {
      const summary = errors
        .map((e, i) => `  ${i + 1}. [${e.type}] ${e.text}`)
        .join('\n')

      // Attach to HTML report for visibility
      await base.info().attach('browser-console-errors', {
        body: Buffer.from(summary),
        contentType: 'text/plain',
      })

      expect.soft(errors, `Browser console errors detected:\n${summary}`).toHaveLength(0)
    }
  },
})

export { expect }
