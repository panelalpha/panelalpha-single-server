import type { Page } from '@playwright/test'
import { hostingService, serverAccount } from '../parity/states/hosting'
import { expect, test } from './support/fixtures'

// Browser-level flows of the native File Manager (`/hosting/file-manager`), one risk per test. Every test gets its own fake
// backend (`backend` fixture, see `support/fake-file-manager-api.ts`), so tests stay independent and run in any order. Names
// carry a timestamp suffix, so a re-run never collides with a file a previous run left behind (the fake is in memory anyway).
// Locators follow the translations in `parity/fixtures/translation.en.json`.

const FM_PATH = '/hosting/file-manager'

/** A name unique to this test run. */
const unique = (prefix: string): string => `${prefix}-${Date.now()}`

async function openFileManager (page: Page): Promise<void> {
  await page.goto(FM_PATH)
  await expect(page.getByRole('heading', { name: 'File Manager' })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'readme.txt', exact: true })).toBeVisible()
}

/** Replaces the services of the fake (the first one is the one the page shows). */
function setServices (backend: { services: unknown[] }, services: unknown[]): void {
  backend.services.splice(0, backend.services.length, ...services)
}

test.describe('navigation', () => {
  test('double-click opens a folder, Up goes up, Back and Forward walk the history', async ({ page, backend }) => {
    const folder = unique('nav-folder')
    backend.addDirectory(folder)
    backend.addFile(`${folder}/inside.txt`)
    await openFileManager(page)

    await page.getByRole('cell', { name: folder, exact: true }).dblclick()
    await expect(page.getByRole('cell', { name: 'inside.txt', exact: true })).toBeVisible()
    await expect(page.getByRole('cell', { name: 'readme.txt', exact: true })).toHaveCount(0)

    await page.getByRole('button', { name: 'Up', exact: true }).click()
    await expect(page.getByRole('cell', { name: 'readme.txt', exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Back', exact: true }).click()
    await expect(page.getByRole('cell', { name: 'inside.txt', exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Forward', exact: true }).click()
    await expect(page.getByRole('cell', { name: folder, exact: true })).toBeVisible()
  })

  test('the folder tree and the breadcrumb open the same folder', async ({ page, backend }) => {
    backend.addFile('logs/app.log')
    await openFileManager(page)

    await page.getByRole('treeitem', { name: 'logs', exact: true }).click()
    await expect(page.getByRole('cell', { name: 'app.log', exact: true })).toBeVisible()

    await page.getByLabel('breadcrumb').getByRole('button', { name: 'File Manager', exact: true }).click()
    await expect(page.getByRole('cell', { name: 'readme.txt', exact: true })).toBeVisible()
    await expect(page.getByRole('cell', { name: 'app.log', exact: true })).toHaveCount(0)
  })
})

test.describe('search', () => {
  test('a phrase narrows the list, Clear Filter brings it back, a folder change clears the field', async ({ page, backend }) => {
    const folder = unique('search-folder')
    backend.addDirectory(folder)
    backend.addFile(`${folder}/inside.txt`)
    await openFileManager(page)
    const search = page.getByLabel('Enter search term')

    await search.fill('READ')
    await expect(page.getByRole('cell', { name: 'readme.txt', exact: true })).toBeVisible()
    await expect(page.getByRole('cell', { name: folder, exact: true })).toHaveCount(0)

    await search.fill('no-such-name')
    await expect(page.getByTestId('fm-no-results')).toBeVisible()
    await page.getByRole('button', { name: 'Clear Filter' }).click()
    await expect(search).toHaveValue('')
    await expect(page.getByRole('cell', { name: folder, exact: true })).toBeVisible()

    await search.fill(folder)
    await page.getByRole('cell', { name: folder, exact: true }).dblclick()
    await expect(page.getByRole('cell', { name: 'inside.txt', exact: true })).toBeVisible()
    await expect(search).toHaveValue('')
  })
})

test('a new folder appears in the list and in the tree', async ({ page }) => {
  const name = unique('new-folder')
  await openFileManager(page)

  await page.getByRole('button', { name: 'New folder', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Folder name').fill(name)
  await dialog.getByRole('button', { name: 'Submit', exact: true }).click()

  await expect(page.getByRole('cell', { name, exact: true })).toBeVisible()
  await expect(page.getByRole('treeitem', { name, exact: true })).toBeVisible()
})

test.describe('upload', () => {
  test('an uploaded file appears in the folder', async ({ page }) => {
    const name = `${unique('upload')}.txt`
    await openFileManager(page)

    await page.getByRole('button', { name: 'Upload', exact: true }).click()
    const dialog = page.getByRole('dialog')
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      dialog.getByRole('button', { name: 'Select files', exact: true }).click(),
    ])
    await chooser.setFiles({ name, mimeType: 'text/plain', buffer: Buffer.from('hello') })
    await expect(dialog.getByText(name, { exact: true })).toBeVisible()
    await dialog.getByRole('button', { name: 'Submit', exact: true }).click()

    await expect(page.getByRole('cell', { name, exact: true })).toBeVisible()
  })

  test('the upload limit counts the whole selection and blocks Submit', async ({ page, backend }) => {
    backend.uploadMaxFilesize = 100
    await openFileManager(page)

    await page.getByRole('button', { name: 'Upload', exact: true }).click()
    const dialog = page.getByRole('dialog')
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      dialog.getByRole('button', { name: 'Select files', exact: true }).click(),
    ])
    // Each file is under the limit (60 < 100); together they are 120 bytes, over it.
    await chooser.setFiles([
      { name: 'first.bin', mimeType: 'application/octet-stream', buffer: Buffer.alloc(60) },
      { name: 'second.bin', mimeType: 'application/octet-stream', buffer: Buffer.alloc(60) },
    ])

    await expect(dialog.getByText('File size limit exceeded!', { exact: true })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Submit', exact: true })).toBeDisabled()
  })
})

test('rename changes the name in the list', async ({ page, backend }) => {
  const oldName = `${unique('old')}.txt`
  const newName = `${unique('new')}.txt`
  backend.addFile(oldName)
  await openFileManager(page)

  await page.getByRole('cell', { name: oldName, exact: true }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Rename', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Enter new name').fill(newName)
  await dialog.getByRole('button', { name: 'Submit', exact: true }).click()

  await expect(page.getByRole('cell', { name: newName, exact: true })).toBeVisible()
  await expect(page.getByRole('cell', { name: oldName, exact: true })).toHaveCount(0)
})

test('ctrl+click selects several items, and Delete removes only them', async ({ page, backend }) => {
  const stamp = unique('batch')
  const first = `${stamp}-a.txt`
  const second = `${stamp}-b.txt`
  const kept = `${stamp}-keep.txt`
  backend.addFile(first)
  backend.addFile(second)
  backend.addFile(kept)
  await openFileManager(page)

  await page.getByRole('cell', { name: first, exact: true }).click()
  await page.getByRole('cell', { name: second, exact: true }).click({ modifiers: ['Control'] })
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click()

  await expect(page.getByRole('cell', { name: first, exact: true })).toHaveCount(0)
  await expect(page.getByRole('cell', { name: second, exact: true })).toHaveCount(0)
  await expect(page.getByRole('cell', { name: kept, exact: true })).toBeVisible()
})

test('copy and paste put a copy into another folder and keep the source', async ({ page, backend }) => {
  const stamp = unique('copy')
  const file = `${stamp}.txt`
  const target = `${stamp}-target`
  backend.addFile(file)
  backend.addDirectory(target)
  await openFileManager(page)

  await page.getByRole('cell', { name: file, exact: true }).click()
  await page.getByRole('button', { name: 'Copy', exact: true }).click()
  await expect(page.getByText('Copied to clipboard!', { exact: true })).toBeVisible()

  await page.getByRole('cell', { name: target, exact: true }).dblclick()
  await page.getByRole('button', { name: 'Paste', exact: true }).click()
  await expect(page.getByRole('cell', { name: file, exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Up', exact: true }).click()
  await expect(page.getByRole('cell', { name: file, exact: true })).toBeVisible()
})

test('zip creates an archive on a cPanel account', async ({ page, backend }) => {
  const stamp = unique('zip')
  const file = `${stamp}.txt`
  const archive = `${stamp}-archive`
  backend.addFile(file)
  await openFileManager(page)

  await page.getByRole('cell', { name: file, exact: true }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Zip', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Archive name').fill(archive)
  await dialog.getByRole('button', { name: 'Submit', exact: true }).click()

  await expect(page.getByRole('cell', { name: `${archive}.zip`, exact: true })).toBeVisible()
})

test('a wp-cloud account has no Zip in the context menu', async ({ page, backend }) => {
  const file = unique('wp-file') + '.txt'
  setServices(backend, [hostingService({ hosting_server_type: 'wp-cloud' })])
  backend.addFile(file)
  await openFileManager(page)

  await expect(page.getByText('Due to server restrictions', { exact: false })).toBeVisible()
  await page.getByRole('cell', { name: file, exact: true }).click({ button: 'right' })
  // The menu is open when Rename shows; only then is the absence of Zip meaningful.
  await expect(page.getByRole('menuitem', { name: 'Rename', exact: true })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Zip', exact: true })).toHaveCount(0)
})

test('a diagnostic account shows an alert and no File Manager card', async ({ page, backend }) => {
  setServices(backend, [hostingService({ server_accounts: [serverAccount({ diagnostic_mode: true })] })])
  await page.goto(FM_PATH)

  await expect(page.getByText('Managing the hosting is currently not possible (Diagnostic Mode)', { exact: false })).toBeVisible()
  await expect(page.getByTestId('file-manager')).toHaveCount(0)
})

test('switching the account in the selector lists the other account', async ({ page, backend }) => {
  const first = unique('first-account')
  const second = unique('second-account')
  setServices(backend, [
    hostingService({
      server_accounts: [serverAccount(), serverAccount({ id: 12, domain: 'second.example.com', username: 'second' })],
    }),
  ])
  backend.addDirectory(first, 11)
  backend.addDirectory(second, 12)
  await openFileManager(page)

  await expect(page.getByRole('cell', { name: first, exact: true })).toBeVisible()
  await expect(page.getByRole('cell', { name: second, exact: true })).toHaveCount(0)

  // The selector shows the domain of the open account; it is the only combobox that shows `example.com` in the test data.
  await page.getByTestId('file-manager-account-selector').getByRole('combobox').filter({ hasText: 'example.com' }).click()
  await page.getByRole('option', { name: 'second.example.com', exact: true }).click()

  await expect(page.getByRole('cell', { name: second, exact: true })).toBeVisible()
  await expect(page.getByRole('cell', { name: first, exact: true })).toHaveCount(0)
})

test('a folder changed while the page was elsewhere is listed fresh on the next visit', async ({ page, backend }) => {
  const folder = unique('fresh')
  const late = `${unique('late')}.txt`
  backend.addDirectory(folder)
  await openFileManager(page)

  await page.getByRole('cell', { name: folder, exact: true }).dblclick()
  await expect(page.getByRole('button', { name: 'Up', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Up', exact: true }).click()
  await expect(page.getByRole('cell', { name: folder, exact: true })).toBeVisible()

  // Someone else adds a file to the folder after the first visit.
  backend.addFile(`${folder}/${late}`)

  await page.getByRole('cell', { name: folder, exact: true }).dblclick()
  await expect(page.getByRole('cell', { name: late, exact: true })).toBeVisible()
})
