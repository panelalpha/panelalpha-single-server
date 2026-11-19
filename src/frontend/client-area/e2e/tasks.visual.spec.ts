import type { Theme } from './support/visual'
import type { Page } from '@playwright/test'
import { FIXED } from './support/fake-tasks-api'
import { expect, test } from './support/fixtures'
import { disableTransitions, expectHoverShot, SNAPSHOT } from './support/visual'

// Visual gate of the Tasks screen (`/tasks`, `toHaveScreenshot`, baselines of next; no legacy to compare with since task-ui).
// Run: `E2E_PORT=4187 npx playwright test e2e/tasks.visual.spec.ts [--update-snapshots]`.
// Baselines live in `tasks.visual.spec.ts-snapshots/`.
//
// The clock: `page.clock.install({ time: FIXED })` before `goto` (time runs from FIXED, so the Vue handlers work; `setFixedTime` before `goto`
// would make Vue 3 skip them), the dates of the fake are counted from FIXED, and after the first render `pauseAt` stops the timers. The pause
// jumps the clock one minute ahead and fires the 5 s poll of the queued / running tasks on the way; its answer is stamped with the paused
// clock, so every relative time ("5m 0s", "10 minutes ago") is the same on every run. Elements mounted after the pause take no click.

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 375, height: 812 },
} as const

/** How far the pause moves the clock past FIXED. */
const PAUSE_AFTER_MS = 60_000

test.use({ timezoneId: 'UTC', locale: 'en-US', colorScheme: 'light' })

/** Opens the screen, waits for the rows and the fonts, then pauses the clock after the poll has refreshed the times. */
async function openTasks (page: Page, theme: Theme, tasks: { taskQueries: URLSearchParams[] }, { polls = true } = {}): Promise<void> {
  await page.clock.install({ time: FIXED })
  await page.goto('/tasks')
  await expect(page.locator(`.v-theme--${theme}`).first()).toBeVisible()
  if (polls) {
    await expect(page.getByTestId('tasks-row').first()).toBeVisible()
    const before = tasks.taskQueries.length
    await page.clock.pauseAt(FIXED + PAUSE_AFTER_MS)
    // The poll fired by the pause asks again; its answer carries the paused `now`.
    await expect.poll(() => tasks.taskQueries.length).toBeGreaterThan(before)
  } else {
    await expect(page.getByText('No tasks', { exact: true })).toBeVisible()
    await page.clock.pauseAt(FIXED + PAUSE_AFTER_MS)
  }
  await page.evaluate(() => document.fonts.ready)
  await page.mouse.move(0, 0)
}

for (const [device, viewport] of Object.entries(VIEWPORTS)) {
  for (const theme of ['light', 'dark'] as const) {
    test.describe(`tasks ${device} ${theme}`, () => {
      test.use({ viewport })

      test.beforeEach(async ({ page, tasks }) => {
        // The avatar of the user menu comes from gravatar (outside `/api`): blocked, so the shot does not depend on the network.
        await page.route('**/www.gravatar.com/**', route => route.abort())
        if (theme === 'dark') {
          tasks.darkMode = true
          await page.addInitScript(() => {
            localStorage.setItem('isDarkMode', 'true')
          })
        }
      })

      test(`tasks-list-${device}-${theme}: the tasks grouped by day`, async ({ page, tasks }) => {
        await openTasks(page, theme, tasks)
        await expect(page.getByTestId('tasks-row')).toHaveCount(8)
        await expect(page).toHaveScreenshot(`tasks-list-${device}-${theme}.png`, SNAPSHOT)
      })

      test(`tasks-expanded-${device}-${theme}: a failed task opened with the keyboard`, async ({ page, tasks }) => {
        await openTasks(page, theme, tasks)
        const failed = page.getByTestId('tasks-row').nth(3)
        await failed.focus()
        await page.keyboard.press('Enter')
        await expect(failed).toHaveAttribute('aria-expanded', 'true')
        // The details have no role or name of their own (a table row), so the container stays a test id; the error is found by its text.
        const details = page.getByTestId('tasks-details')
        await expect(details).toBeVisible()
        await expect(details.getByText(/Could not resolve host/)).toBeVisible()
        // Scroll the opened details to the bottom edge of the viewport (mobile: they open below the fold).
        await page.getByTestId('tasks-details').evaluate(element => element.scrollIntoView({ block: 'end' }))
        await page.mouse.move(0, 0)
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
        await expect(page).toHaveScreenshot(`tasks-expanded-${device}-${theme}.png`, SNAPSHOT)
      })

      test(`tasks-empty-${device}-${theme}: no tasks`, async ({ page, tasks }) => {
        tasks.rows = []
        await openTasks(page, theme, tasks, { polls: false })
        await expect(page).toHaveScreenshot(`tasks-empty-${device}-${theme}.png`, SNAPSHOT)
      })
    })
  }
}

test.describe('tasks desktop light hover', () => {
  test.use({ viewport: VIEWPORTS.desktop })

  test('tasks-row-hover-desktop-light: the pointer over a row', async ({ page, tasks }) => {
    await page.route('**/www.gravatar.com/**', route => route.abort())
    await openTasks(page, 'light', tasks)
    await disableTransitions(page)
    const row = page.getByTestId('tasks-row').nth(2)
    await row.hover({ position: { x: 400, y: 20 } })
    await expectHoverShot(page, row, 'tasks-row-hover-desktop-light.png')
  })

  test('tasks-row-focus-desktop-light: the keyboard focus ring of a row', async ({ page, tasks }) => {
    await page.route('**/www.gravatar.com/**', route => route.abort())
    await openTasks(page, 'light', tasks)
    await disableTransitions(page)
    const row = page.getByTestId('tasks-row').nth(2)
    // A key press first: Chromium then gives the programmatic focus `:focus-visible`, as a Tab would.
    await page.keyboard.press('Shift')
    await row.focus()
    await expect.poll(() => row.evaluate(element => element.matches(':focus-visible'))).toBe(true)
    await expectHoverShot(page, row, 'tasks-row-focus-desktop-light.png')
  })
})
