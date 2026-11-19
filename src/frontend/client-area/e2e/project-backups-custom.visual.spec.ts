import type { Theme } from './support/visual'
import type { Page } from '@playwright/test'
import { expect, test } from './support/fixtures'
import { SNAPSHOT } from './support/visual'

// Visual gate of the Backups page of a `custom` project (`toHaveScreenshot`, baselines of next; no legacy to compare with).
// Run: `E2E_PORT=4187 npx playwright test e2e/project-backups-custom.visual.spec.ts [--update-snapshots]`.
// Baselines live in `project-backups-custom.visual.spec.ts-snapshots/`.

test.use({ viewport: { width: 1440, height: 900 }, timezoneId: 'UTC', locale: 'en-US', colorScheme: 'light' })

/** Opens the page and waits for the rows and the fonts, so the text is the same on every run. */
async function openBackups (page: Page, theme: Theme): Promise<void> {
  await page.goto('/projects/1/backups')
  await expect(page.getByTestId('backups-table').getByText('Code', { exact: true })).toBeVisible()
  await expect(page.getByTestId('backups-table').getByText('Data', { exact: true })).toBeVisible()
  await expect(page.locator(`.v-theme--${theme}`).first()).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  await page.mouse.move(0, 0)
}

/** An action button of the first row (full backup): 0 Download, 1 Restore, 2 Delete. The icon buttons have a tooltip but no accessible name, so the row scopes them. */
function rowButton (page: Page, index: number) {
  return page.getByRole('row').filter({ hasText: '2026-10-24' }).getByRole('button').nth(index)
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`custom backups ${theme}`, () => {
    test.beforeEach(async ({ page, backups }) => {
      if (theme === 'dark') {
        backups.darkMode = true
        await page.addInitScript(() => {
          localStorage.setItem('isDarkMode', 'true')
        })
      }
    })

    test(`custom-backups-table-${theme}: columns Code and Data, the tooltip of the Data check names the parts`, async ({ page }) => {
      await openBackups(page, theme)
      await page.getByRole('img', { name: /uploads/ }).hover()
      await expect(page.getByRole('tooltip').filter({ hasText: 'uploads' })).toBeVisible()
      await expect(page).toHaveScreenshot(`custom-backups-table-${theme}.png`, SNAPSHOT)
    })

    test(`custom-backups-create-${theme}: the create dialog speaks of code and data`, async ({ page }) => {
      await openBackups(page, theme)
      await page.getByTestId('backups-add-new').click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await page.mouse.move(0, 0)
      await expect(page).toHaveScreenshot(`custom-backups-create-${theme}.png`, SNAPSHOT)
    })

    test(`custom-backups-restore-${theme}: restore code and data with the warning`, async ({ page }) => {
      await openBackups(page, theme)
      await rowButton(page, 1).click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await expect(page.getByLabel('Restore code')).toBeVisible()
      await page.mouse.move(0, 0)
      await expect(page).toHaveScreenshot(`custom-backups-restore-${theme}.png`, SNAPSHOT)
    })

    test(`custom-backups-download-${theme}: the select lists code, volumes and the database by name`, async ({ page }) => {
      await openBackups(page, theme)
      await rowButton(page, 0).click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await page.getByRole('dialog').getByRole('combobox').first().click()
      await expect(page.getByRole('option').first()).toBeVisible()
      await page.mouse.move(0, 0)
      await expect(page).toHaveScreenshot(`custom-backups-download-${theme}.png`, SNAPSHOT)
    })
  })
}
