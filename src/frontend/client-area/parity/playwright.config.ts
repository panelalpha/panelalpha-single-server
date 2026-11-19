import { defineConfig, devices } from '@playwright/test'

// Overridable so two worktrees can run the harness at once (apps.ts reads the same variable).
const NEXT_PORT = Number(process.env.PARITY_NEXT_PORT ?? 4174)

function variant (name: string, theme: 'light' | 'dark', width: number, height: number, testMatch?: string) {
  return {
    name,
    metadata: { theme },
    // Specs that run in one extra variant only are kept out of the standard ones (and the other way round, via `testMatch`).
    ...(testMatch === undefined ? { testIgnore: ['**/hosting-narrow.parity.ts'] } : { testMatch }),
    use: { ...devices['Desktop Chrome'], viewport: { width, height }, isMobile: false, hasTouch: false },
  }
}

export default defineConfig({
  testDir: './states',
  // One worker: pixel ratios differ by a few pixels between runs when two Chromium instances compete for CPU.
  workers: 1,
  testMatch: '**/*.parity.ts',
  outputDir: '../test-results/parity',
  globalSetup: './report/global-setup.ts',
  globalTeardown: './report/write-report.ts',
  timeout: 120_000,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${NEXT_PORT}`,
    ignoreHTTPSErrors: true,
    // PARITY_LEGACY_VIA_REQUEST=1 (driver/apps.ts `fetchLegacyFromNode`): the Node-side fetch needs the proxy explicitly.
    ...(process.env.PARITY_LEGACY_VIA_REQUEST === '1' && process.env.HTTPS_PROXY !== undefined
      ? { proxy: { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } }
      : {}),
  },
  // Theme and viewport are covered pairwise: no dark-mobile, it never found a delta that dark-desktop or light-mobile missed (roadmap F-01).
  // Exception for the signed-in shell (user decisions 2026-10-05, signed-in-shell research Follow-up 4-5), only for `shell.parity.ts`:
  // - dark-mobile: the shell has mobile-only chrome (FAB, second tab row, 100 px app bar, 40 px avatar) whose dark colours only this variant sees;
  // - light-tablet (960 px): the app bar has a third height, 64 px, between the 100 px and 88 px bands, and no other variant lands in it.
  // login-* and register-* keep their three variants; write-report.ts mirrors this split (SHELL_ONLY_VARIANTS).
  projects: [
    variant('light-desktop', 'light', 1440, 900),
    variant('light-mobile', 'light', 375, 812),
    variant('dark-desktop', 'dark', 1440, 900),
    variant('dark-mobile', 'dark', 375, 812, '**/shell.parity.ts'),
    variant('light-tablet', 'light', 960, 900, '**/shell.parity.ts'),
    // S-30 band 1200-1399 (sidebar max-width 163px, plan tiles in a column): one state, `hosting-narrow.parity.ts`.
    variant('light-narrow-desktop', 'light', 1300, 900, '**/hosting-narrow.parity.ts'),
  ],
  webServer: {
    command: `npm run build-only && npx vite preview --port ${NEXT_PORT} --strictPort`,
    env: { VITE_API_URL: '/api' },
    url: `http://localhost:${NEXT_PORT}`,
    // PARITY_REUSE_SERVER=1 uses a server already on the port (`npm run parity:serve`) and skips the build.
    // That server serves the build it was started with: restart it after a change to src/.
    reuseExistingServer: process.env.PARITY_REUSE_SERVER === '1',
    cwd: '..',
    timeout: 180_000,
  },
})
