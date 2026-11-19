import { defineConfig, devices } from '@playwright/test'

// E2E runs against a production-like build of next on its own port and output folder, so it never shares `dist/` or the
// port with the parity harness (`parity/playwright.config.ts`, port 4174). The backend is a fake in `e2e/support/`: no login.
const PORT = Number(process.env.E2E_PORT ?? 4175)
// `e2e/support/fake-backups-api.ts` imports `parity/states/instance-backups.parity.ts`, which registers parity tests unless this is set (workers inherit it).
process.env.E2E_IMPORTS_PARITY_STATES = '1'

const baseURL = `http://localhost:${PORT}`
const OUT_DIR = 'dist-e2e'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `vite build --outDir ${OUT_DIR} && vite preview --outDir ${OUT_DIR} --port ${PORT} --strictPort`,
    env: { VITE_API_URL: '/api' },
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
