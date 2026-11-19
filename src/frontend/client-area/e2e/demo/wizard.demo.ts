import { test } from '@playwright/test'
import { installFakeWizardBackend } from '../support/fake-wizard-api'

// Manual demo of the first-run wizard on the fake API (no real backend, no login). Not a test: it opens a headed browser on /wizard and
// stays open until you close the window. Run: `npm run demo:wizard` (config: `playwright.demo.config.ts`).
// The fake keeps state per run: `POST /community/setup` signs the "admin" in, so you can click through to Summary. Restart the script to reset.

test('wizard demo', async ({ page }) => {
  test.setTimeout(0)
  await installFakeWizardBackend(page)
  await page.goto('/wizard')
  await page.waitForEvent('close', { timeout: 0 })
})
