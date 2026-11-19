import { expect, test } from './support/fixtures'

// Seed for `/10x-e2e`: the pattern generated tests copy. Risk `fm-home-listing` (provisional, no test-plan.md in this repo):
// the File Manager page opens on the home directory the API returns. The backend is fake and in memory, created per test,
// so the seed creates no data and has nothing to clean up.

test('file manager lists the home directory returned by the API', async ({ page }) => {
  await page.goto('/hosting/file-manager')

  await expect(page.getByRole('heading', { name: 'File Manager' })).toBeVisible()
  // The folder also sits in the tree, so the assertion targets the table cell, not the text.
  await expect(page.getByRole('cell', { name: 'public_html', exact: true })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'readme.txt', exact: true })).toBeVisible()
})
