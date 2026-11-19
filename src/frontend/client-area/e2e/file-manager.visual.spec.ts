import type { Page } from '@playwright/test'
import { FTP_PROJECT_HOME } from '../parity/states/ftp'
import { ADVANCED_PROJECT_ID, advancedFrameHandlers } from '../parity/states/instance-advanced-frame'
import { expect, test } from './support/fixtures'
import {
  disableTransitions,
  expectHoverShot,
  FM_PATH,
  holdRoute,
  openFileManager,
  SNAPSHOT,
  useTheme,
  waitUntilStill,
} from './support/visual'

// Visual gate of the native File Manager content (`/hosting/file-manager`): AGENTS.md rule 1 takes the content from no legacy page,
// so parity does not measure it and `toHaveScreenshot` does. The baselines are next-only: they guard against regressions of the
// content and make no comparison with the legacy `/fm/` app. Every view runs in light and in dark (app tokens, see
// `src/app/styles/themes-variables.scss`). Run it on its own port (the parity harness owns 4174):
//   E2E_PORT=4186 npx playwright test -c playwright.config.ts e2e/file-manager.visual.spec.ts [--update-snapshots]
// Baselines live in `file-manager.visual.spec.ts-snapshots/`. A change of a baseline without an intended visual change is a bug.
// The helpers are in `e2e/support/visual.ts`, shared with the media gate (`e2e/file-manager-media.visual.spec.ts`).

for (const theme of ['light', 'dark'] as const) {
  test.describe(theme, () => {
    test.use({ viewport: { width: 1440, height: 900 }, timezoneId: 'UTC', locale: 'en-US' })

    useTheme(theme)

    test('table view of the home directory', async ({ page }) => {
      await openFileManager(page, theme)
      await page.mouse.move(0, 0)

      await expect(page.getByTestId('file-manager')).toHaveScreenshot(`fm-table-${theme}.png`, SNAPSHOT)
    })

    test('grid view of the home directory', async ({ page }) => {
      await openFileManager(page, theme)
      await page.getByRole('button', { name: 'Grid', exact: true }).click()
      await expect(page.getByRole('cell', { name: 'readme.txt', exact: true })).toHaveCount(0)
      await expect(page.getByText('readme.txt', { exact: true }).first()).toBeVisible()
      await page.mouse.move(0, 0)

      await expect(page.getByTestId('file-manager')).toHaveScreenshot(`fm-grid-${theme}.png`, SNAPSHOT)
    })

    test('hover on a table row', async ({ page }) => {
      await openFileManager(page, theme)
      await disableTransitions(page)
      await page.getByRole('cell', { name: 'readme.txt', exact: true }).hover()

      await expectHoverShot(page, page.getByTestId('file-manager'), `fm-row-hover-${theme}.png`)
    })

    test('hover on the Name column header', async ({ page }) => {
      await openFileManager(page, theme)
      await disableTransitions(page)
      await page.getByRole('columnheader', { name: 'Name', exact: true }).hover()

      await expectHoverShot(page, page.getByTestId('file-manager'), `fm-head-hover-${theme}.png`)
    })

    test('a selected row with the selection count in the footer', async ({ page }) => {
      await openFileManager(page, theme)
      await page.getByRole('cell', { name: 'readme.txt', exact: true }).click()
      await page.mouse.move(0, 0)

      await expect(page.getByTestId('fm-info').locator('.fm-info__value').first()).toHaveText('1')
      await expect(page.getByTestId('file-manager')).toHaveScreenshot(`fm-row-selected-${theme}.png`, SNAPSHOT)
    })

    test('a selected tile of the grid view', async ({ page }) => {
      await openFileManager(page, theme)
      await page.getByRole('button', { name: 'Grid', exact: true }).click()
      await page.getByText('readme.txt', { exact: true }).first().click()
      await expect(page.locator('.fm-grid-item.active')).toHaveCount(1)
      await page.mouse.move(0, 0)

      await expect(page.getByTestId('file-manager')).toHaveScreenshot(`fm-grid-selected-${theme}.png`, SNAPSHOT)
    })

    test('keyboard focus on the first navbar button', async ({ page }) => {
      await openFileManager(page, theme)
      await page.mouse.move(0, 0)
      await page.keyboard.press('Shift')
      // The first navbar button is Back, disabled in the home folder (a disabled button takes no focus); Refresh is the first enabled one.
      const first = page.getByTestId('fm-navbar').locator('button:not([disabled])').first()
      await first.focus()
      await expect(first).toBeFocused()
      expect(await first.evaluate(element => element.matches(':focus-visible')), 'keyboard focus').toBe(true)

      await expect(page.getByTestId('fm-navbar')).toHaveScreenshot(`fm-focus-visible-${theme}.png`, SNAPSHOT)
    })

    test('navbar buttons disabled in the home folder without a selection', async ({ page }) => {
      await openFileManager(page, theme)
      await page.mouse.move(0, 0)

      await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeDisabled()
      await expect(page.getByRole('button', { name: 'Copy', exact: true })).toBeDisabled()
      await expect(page.getByTestId('fm-navbar')).toHaveScreenshot(`fm-disabled-${theme}.png`, SNAPSHOT)
    })

    test('context menu of a file', async ({ page }) => {
      await openFileManager(page, theme)
      await page.getByRole('cell', { name: 'readme.txt', exact: true }).click({ button: 'right' })
      const menu = page.getByTestId('fm-context-menu')
      await expect(menu).toBeVisible()
      await page.mouse.move(0, 0)
      await waitUntilStill(menu)

      await expect(page.getByTestId('file-manager')).toHaveScreenshot(`fm-context-menu-${theme}.png`, SNAPSHOT)
    })

    test('keyboard focus on the first context menu item', async ({ page }) => {
      await openFileManager(page, theme)
      await page.getByRole('cell', { name: 'readme.txt', exact: true }).click({ button: 'right' })
      const menu = page.getByTestId('fm-context-menu')
      await expect(menu).toBeVisible()
      await page.mouse.move(0, 0)
      await waitUntilStill(menu)
      await page.keyboard.press('Shift')
      const first = page.locator('[data-testid^="fm-context-menu-"]').first()
      await first.focus()
      await expect(first).toBeFocused()
      expect(await first.evaluate(element => element.matches(':focus-visible')), 'keyboard focus').toBe(true)

      await expect(menu).toHaveScreenshot(`fm-context-menu-focus-${theme}.png`, SNAPSHOT)
    })

    test('an empty folder', async ({ page }) => {
      // `logs` is an empty folder of the default tree (the fake answers it with no items).
      await openFileManager(page, theme)
      await page.getByRole('cell', { name: 'logs', exact: true }).dblclick()
      await expect(page.getByRole('button', { name: 'Up', exact: true })).toBeEnabled()
      await expect(page.getByTestId('fm-empty')).toBeVisible()
      await expect(page.getByRole('cell', { name: 'readme.txt', exact: true })).toHaveCount(0)
      await page.mouse.move(0, 0)

      await expect(page.getByTestId('file-manager')).toHaveScreenshot(`fm-empty-${theme}.png`, SNAPSHOT)
    })

    test('search with matches', async ({ page }) => {
      await openFileManager(page, theme)
      await page.getByLabel('Enter search term').fill('READ')
      await expect(page.getByRole('cell', { name: 'readme.txt', exact: true })).toBeVisible()
      await expect(page.getByRole('cell', { name: 'logs', exact: true })).toHaveCount(0)
      await page.mouse.move(0, 0)

      await expect(page.getByTestId('file-manager')).toHaveScreenshot(`fm-search-${theme}.png`, SNAPSHOT)
    })

    test('search with no results', async ({ page }) => {
      await openFileManager(page, theme)
      await page.getByLabel('Enter search term').fill('no-such-name')
      await expect(page.getByTestId('fm-no-results')).toBeVisible()
      await page.mouse.move(0, 0)

      await expect(page.getByTestId('file-manager')).toHaveScreenshot(`fm-no-results-${theme}.png`, SNAPSHOT)
    })

    test('a failed content request: the alert and the card', async ({ page }) => {
      // Registered before the navigation, so it answers the folder request ahead of the fake backend.
      await page.route('**/api/file-manager/content/**', route => route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Server Error' }),
      }))
      await page.goto(FM_PATH)
      await expect(page.getByRole('heading', { name: 'File Manager' })).toBeVisible()
      await expect(page.locator(`.v-theme--${theme}`).first()).toBeVisible()
      const alert = page.getByTestId('shell-alert-manager')
      await expect(alert).toContainText('Server Error')
      await page.mouse.move(0, 0)

      await expect(alert).toHaveScreenshot(`fm-error-toast-${theme}.png`, SNAPSHOT)
      await expect(page.getByTestId('file-manager')).toHaveScreenshot(`fm-error-${theme}.png`, SNAPSHOT)
    })

    test('the card while the folder request is held', async ({ page }) => {
      // The folder requests wait for `release`; then they go on to the fake backend (`route.fallback`).
      const release = await holdRoute(page, '**/api/file-manager/content/**')
      await page.goto(FM_PATH)
      await expect(page.getByRole('heading', { name: 'File Manager' })).toBeVisible()
      await expect(page.locator('.fm-info__icons .v-progress-circular').first()).toBeVisible()
      await page.mouse.move(0, 0)

      await expect(page.getByTestId('file-manager')).toHaveScreenshot(`fm-loading-${theme}.png`, SNAPSHOT)

      release()
      await expect(page.getByRole('cell', { name: 'readme.txt', exact: true })).toBeVisible()
    })

    test('the new folder modal', async ({ page }) => {
      await openFileManager(page, theme)
      // A DOM click on the navbar button, as the visual gate of the modal is taken after it opens.
      await page.getByRole('button', { name: 'New folder', exact: true }).evaluate(element => (element as HTMLElement).click())
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()

      await expect(dialog).toHaveScreenshot(`fm-new-folder-modal-${theme}.png`, SNAPSHOT)
    })
  })
}

// The list on a phone (375 px): the folder tree is behind the "Folders" toggle, closed by default.
test.describe('mobile', () => {
  test.use({ viewport: { width: 375, height: 812 }, timezoneId: 'UTC', locale: 'en-US' })

  // The floating "Add" button of the shell sits over the card footer on a phone; it is not part of the File Manager.
  const hideShellFab = (page: Page) => page.addStyleTag({ content: '[data-testid="shell-fab"] { display: none !important; }' })

  test('list with the folder tree closed', async ({ page }) => {
    await openFileManager(page)
    await hideShellFab(page)
    await expect(page.getByTestId('fm-tree-toggle')).toHaveAttribute('aria-expanded', 'false')
    await page.mouse.move(0, 0)

    await expect(page.getByTestId('file-manager')).toHaveScreenshot('fm-mobile-tree-closed-light.png', SNAPSHOT)
  })

  test('list with the folder tree open', async ({ page }) => {
    await openFileManager(page)
    await hideShellFab(page)
    await page.getByTestId('fm-tree-toggle').click()
    await expect(page.getByTestId('fm-tree-toggle')).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByRole('treeitem', { name: 'logs', exact: true })).toBeVisible()
    await page.mouse.move(0, 0)

    await expect(page.getByTestId('file-manager')).toHaveScreenshot('fm-mobile-tree-open-light.png', SNAPSHOT)
  })
})

// The File Manager in the Advanced tab of a project (`/projects/:id/advanced/file-manager`): the same card inside the project frame.
test.describe('project mounting', () => {
  test.use({ viewport: { width: 1440, height: 900 }, timezoneId: 'UTC', locale: 'en-US' })

  test('the card in the project frame', async ({ page, backend }) => {
    backend.home = FTP_PROJECT_HOME
    backend.frameHandlers = advancedFrameHandlers()
    await page.goto(`/projects/${ADVANCED_PROJECT_ID}/advanced/file-manager`)
    await expect(page.getByTestId('advanced-sidebar')).toBeVisible()
    await expect(page.getByRole('cell', { name: 'readme.txt', exact: true })).toBeVisible()
    await page.mouse.move(0, 0)

    await expect(page).toHaveScreenshot('fm-project-light.png', SNAPSHOT)
  })
})
