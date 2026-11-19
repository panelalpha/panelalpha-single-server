import type { Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { expect, test } from './support/fixtures'

// Browser-level flows of the File Manager media and text dialogs (`/hosting/file-manager`): the text editor, the image cropper (the image
// pipeline, which jsdom does not run) and the audio and video players on real media. Each test gets its own fake backend (`backend`
// fixture) and unique names with a timestamp suffix, so tests stay independent. Locators follow `parity/fixtures/translation.en.json`.
// The media fixtures are small files in `e2e/fixtures/` (webm video, wav audio; ogg is not generated, see the report).

const FM_PATH = '/hosting/file-manager'
const FIXTURES = new URL('fixtures/', import.meta.url)

/** A name unique to this test run. */
const unique = (prefix: string): string => `${prefix}-${Date.now()}`

const fixture = (name: string): Buffer => readFileSync(new URL(name, FIXTURES))

/** The width and the height of a PNG, read from its IHDR chunk (big-endian, after the 8-byte signature and the chunk header). */
const pngSize = (png: Buffer): { width: number, height: number } => ({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) })

async function openFileManager (page: Page): Promise<void> {
  await page.goto(FM_PATH)
  await expect(page.getByRole('heading', { name: 'File Manager' })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'readme.txt', exact: true })).toBeVisible()
}

test.describe('text editor', () => {
  test('an edited file is saved, and opening it again shows the new text', async ({ page }) => {
    const marker = unique('edited')
    await openFileManager(page)

    await page.getByRole('cell', { name: 'readme.txt', exact: true }).dblclick()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('Editor', { exact: true })).toBeVisible()
    await expect(dialog.getByRole('textbox')).toContainText('Hello from readme')

    await dialog.getByRole('textbox').click()
    await page.keyboard.press('Control+End')
    await page.keyboard.press('Enter')
    await page.keyboard.type(marker)
    await dialog.getByRole('button', { name: 'Submit', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    await page.getByRole('cell', { name: 'readme.txt', exact: true }).dblclick()
    await expect(page.getByRole('dialog').getByRole('textbox')).toContainText(marker)
  })

  test('Submit stays disabled until the text differs from the loaded one', async ({ page }) => {
    await openFileManager(page)

    await page.getByRole('cell', { name: 'readme.txt', exact: true }).dblclick()
    const dialog = page.getByRole('dialog')
    const submit = dialog.getByRole('button', { name: 'Submit', exact: true })
    await expect(dialog.getByRole('textbox')).toContainText('Hello from readme')
    await expect(submit).toBeDisabled()

    await dialog.getByRole('textbox').click()
    await page.keyboard.press('Control+End')
    await page.keyboard.type('!')
    await expect(submit).toBeEnabled()

    await page.keyboard.press('Backspace')
    await expect(submit).toBeDisabled()
  })
})

test('a cropped image is saved at the cropped size, and the preview shows the new image', async ({ page, backend }) => {
  const name = `${unique('photo')}.png`
  backend.addFileContent(name, readFileSync(new URL('../../parity/fixtures/screenshot.png', FIXTURES)))
  await openFileManager(page)

  await page.getByRole('cell', { name, exact: true }).dblclick()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('img', { name, exact: true })).toBeVisible()

  await dialog.getByRole('button', { name: 'Cropping', exact: true }).click()
  await expect(dialog.getByLabel('Width', { exact: true })).not.toHaveValue('')

  await dialog.getByLabel('X', { exact: true }).fill('0')
  await dialog.getByLabel('Y', { exact: true }).fill('0')
  await dialog.getByLabel('Width', { exact: true }).fill('200')
  await dialog.getByLabel('Height', { exact: true }).fill('100')
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(dialog.getByLabel('Width', { exact: true })).toHaveValue('200')
  // The cropper rounds the box to its own canvas scale (legacy `Math.round`), so the height can read 100 or a pixel off.
  const height = Number(await dialog.getByLabel('Height', { exact: true }).inputValue())
  expect(Math.abs(height - 100)).toBeLessThanOrEqual(1)

  // Save writes the crop, then the preview loads the image again: the request of the new preview is the one after the save.
  const reloaded = page.waitForResponse(response => response.url().includes('/file-manager/preview/'))
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  await reloaded
  await expect(dialog.getByRole('img', { name, exact: true })).toBeVisible()

  const saved = pngSize(backend.fileContent(name)!)
  expect(saved.width).toBe(200)
  expect(Math.abs(saved.height - height)).toBeLessThanOrEqual(1)
})

test.describe('media players', () => {
  test('double-click on a webm file opens the video player and streams the file', async ({ page, backend }) => {
    const name = `${unique('clip')}.webm`
    backend.addFileContent(name, fixture('clip.webm'))
    await openFileManager(page)

    const stream = page.waitForResponse(response => response.url().includes('/file-manager/stream-file/'))
    await page.getByRole('cell', { name, exact: true }).dblclick()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('Video player', { exact: true })).toBeVisible()
    await expect(dialog.getByText(name, { exact: true })).toBeVisible()

    const response = await stream
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toBe('video/webm')
    await expect(dialog.getByText('Could not play the file.', { exact: true })).toHaveCount(0)
  })

  test('the audio player plays the selected audio files as a playlist, and the next track starts when one ends', async ({ page, backend }) => {
    const stamp = unique('track')
    const first = `${stamp}-a.wav`
    const second = `${stamp}-b.wav`
    backend.addFileContent(first, fixture('tone-a.wav'))
    backend.addFileContent(second, fixture('tone-b.wav'))
    await openFileManager(page)

    // Play is offered only when every selected item is audio (legacy `audioPlayRule`), so the selection holds only the two tracks.
    await page.getByRole('cell', { name: first, exact: true }).click()
    await page.getByRole('cell', { name: second, exact: true }).click({ modifiers: ['Control'] })
    await page.getByRole('cell', { name: second, exact: true }).click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Play', exact: true }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('Audio player', { exact: true })).toBeVisible()
    await expect(dialog.getByTestId('fm-audio-track').filter({ hasText: first })).toBeVisible()
    await expect(dialog.getByTestId('fm-audio-track').filter({ hasText: second })).toBeVisible()

    // Track rows carry the legacy `N.` number in the title (parity phase), so rows are found by test id and file name.
    // Picking the first track plays it; it ends after 0.4 s and the second one is requested next.
    const secondStream = page.waitForResponse(response => response.url().includes('/file-manager/stream-file/') && response.url().includes(second))
    await dialog.getByTestId('fm-audio-track').filter({ hasText: first }).click()
    const response = await secondStream
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toBe('audio/wav')
  })
})
