import { defineConfig, devices } from '@playwright/test'
import base from './playwright.config'

// Demo runner: headed browser, free window size, no snapshots. Reuses the build and preview server of the e2e config.
export default defineConfig({
  ...base,
  testDir: './e2e/demo',
  testMatch: '**/*.demo.ts',
  fullyParallel: false,
  reporter: 'list',
  timeout: 0,
  use: {
    ...base.use,
    ...devices['Desktop Chrome'],
    deviceScaleFactor: undefined,
    headless: false,
    viewport: null,
    launchOptions: { args: ['--window-size=1440,900'] },
  },
  projects: [{ name: 'demo' }],
})
