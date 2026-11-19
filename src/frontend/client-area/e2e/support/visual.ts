import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures'

// Shared helpers of the visual gate of the native File Manager content (`toHaveScreenshot` in `e2e/`, next-only). The specs import
// them instead of keeping local copies. Snapshot names are resolved from the spec that calls them, so the baselines stay where they are.

export type Theme = 'light' | 'dark'

export const FM_PATH = '/hosting/file-manager'
export const SNAPSHOT = { animations: 'disabled', caret: 'hide', maxDiffPixelRatio: 0.01 } as const

/** Opens the File Manager at home; with a `theme`, waits until the page is under that theme. */
export async function openFileManager (page: Page, theme?: Theme): Promise<void> {
  await page.goto(FM_PATH)
  await expect(page.getByRole('heading', { name: 'File Manager' })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'readme.txt', exact: true })).toBeVisible()
  if (theme !== undefined) {
    await expect(page.locator(`.v-theme--${theme}`).first()).toBeVisible()
  }
}

/**
 * Sets the theme of the app for the tests of the current `describe`: dark sets `style.darkMode` of `/home` (the fake answers it) and
 * the flag a returning dark-mode user has. Call it inside a `test.describe`.
 */
export function useTheme (theme: Theme): void {
  test.beforeEach(async ({ page, backend }) => {
    if (theme === 'dark') {
      backend.darkMode = true
      await page.addInitScript(() => {
        localStorage.setItem('isDarkMode', 'true')
      })
    }
  })
}

/**
 * The hover states. `toHaveScreenshot` clears the pointer hover before it captures (a probe saw `:hover` false after it, while
 * `locator.screenshot` kept it), so the hovered pixels are taken with a clip of the page and compared with `toMatchSnapshot`
 * at the same ratio. `clip` is the area of the page to take (the card, a navbar...).
 */
export async function expectHoverShot (page: Page, clip: Locator, name: string): Promise<void> {
  // A clip of the page, not an element screenshot: the element capture re-lays the page and the pointer hover is lost there.
  const box = await clip.boundingBox()
  expect(box, 'the clipped area is on the page').not.toBeNull()
  const shot = await page.screenshot({ animations: 'disabled', caret: 'hide', clip: box! })
  expect(shot).toMatchSnapshot(name, { maxDiffPixelRatio: SNAPSHOT.maxDiffPixelRatio })
}

/** The row background transitions in over time; without this the hover is caught mid-transition. The final colour is unchanged. */
export async function disableTransitions (page: Page): Promise<void> {
  await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; }' })
}

/** The context menu opens with a JS transition that moves it for a while; the snapshot waits until its box stops moving. */
export async function waitUntilStill (locator: Locator): Promise<void> {
  let previous = ''
  await expect.poll(async () => {
    const current = JSON.stringify(await locator.boundingBox())
    const still = current === previous
    previous = current
    return still
  }, { timeout: 5000 }).toBe(true)
}

/**
 * Holds the requests matching `pattern` until the returned `release` is called; then they go on to the next handler (`route.fallback`,
 * the fake backend). Register it before the navigation that sends the requests.
 */
export async function holdRoute (page: Page, pattern: string | RegExp): Promise<() => void> {
  let release: () => void = () => {}
  const gate = new Promise<void>(resolve => {
    release = resolve
  })
  await page.route(pattern, async route => {
    await gate
    await route.fallback()
  })
  return release
}
