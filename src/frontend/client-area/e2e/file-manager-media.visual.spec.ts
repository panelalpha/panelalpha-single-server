import type { Locator, Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { expect, test } from './support/fixtures'
import { disableTransitions, expectHoverShot, holdRoute, openFileManager, SNAPSHOT, useTheme, waitUntilStill } from './support/visual'

const FIXTURES = new URL('fixtures/', import.meta.url)

// Video.js 10 controls that move with the playback: the times (`media-time`: current and duration) and the progress bar
// (`media-time-slider`), in the default skins of video and audio. They are masked; the skin is an open shadow DOM, which CSS locators pierce.
const PLAYBACK_CONTROLS = 'media-time, media-time-slider'

// Visual gate of the File Manager media dialogs (`/hosting/file-manager`): the text editor, the image preview and cropper, and the video
// and audio players. The content is native (AGENTS.md rule 1), so no legacy page takes it: the gate is
// `toHaveScreenshot` in `e2e/`, next-only (the baselines guard against regressions and make no comparison with the legacy `/fm/` app).
// Every view runs in light and in dark. Run it on its own port (the parity harness owns 4174; E2E always on 4186, never in parallel with parity):
//   E2E_PORT=4186 npx playwright test -c playwright.config.ts e2e/file-manager-media.visual.spec.ts [--update-snapshots]
// A baseline is updated only with an intended visual change; a baseline change without one is a bug.
// This file holds the readiness helpers of the dialogs. The `default` views (phase 5) are the first baselines; the states come later.

/**
 * Opens the text editor of a file by double-click. Ready when CodeMirror (a lazy import) is mounted and shows the text of the file.
 * Returns the dialog.
 */
export async function openEditor (page: Page, name: string, text: string): Promise<Locator> {
  await page.getByRole('cell', { name, exact: true }).dblclick()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Editor', { exact: true })).toBeVisible()
  await expect(dialog.locator('.cm-editor')).toBeVisible()
  await expect(dialog.locator('.cm-content')).toContainText(text)
  return dialog
}

/** Opens the preview of an image by double-click. Ready when the image is decoded (`complete` with a natural width). Returns the dialog. */
export async function openPreview (page: Page, name: string): Promise<Locator> {
  await page.getByRole('cell', { name, exact: true }).dblclick()
  const dialog = page.getByRole('dialog')
  const image = dialog.getByRole('img', { name, exact: true })
  await expect(image).toBeVisible()
  await expect.poll(() => image.evaluate(element => (element as HTMLImageElement).complete && (element as HTMLImageElement).naturalWidth > 0)).toBe(true)
  return dialog
}

/**
 * Opens the cropper from the preview (the `Cropping` button). Ready when the fields hold the box and the cropper web component has
 * resolved `$ready()` (cropperjs 2), and the dialog has stopped moving. Returns the dialog.
 */
export async function openCropper (page: Page): Promise<Locator> {
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Cropping', exact: true }).click()
  await expect(dialog.getByLabel('Width', { exact: true })).not.toHaveValue('')
  await expect(dialog.getByLabel('Height', { exact: true })).not.toHaveValue('')
  // The preview of the cropper (`cropper-viewer`) holds a second `cropper-image`: the canvas one is the one that is ready.
  await dialog.getByTestId('fm-crop-canvas').locator('cropper-image').evaluate(async element => {
    await (element as unknown as { $ready: () => Promise<unknown> }).$ready()
  })
  await waitUntilStill(dialog)
  return dialog
}

/**
 * Brings a media element to a still frame: paused at 0, with data of at least `minReady` (`HTMLMediaElement.readyState`: 2 is a frame,
 * 1 is the metadata). Video needs a frame; audio is ready with its metadata.
 */
export async function settleMedia (media: Locator, minReady = 2): Promise<void> {
  await media.evaluate(element => {
    const player = element as HTMLMediaElement
    player.pause()
    player.currentTime = 0
  })
  await expect.poll(() => media.evaluate((element, min) => {
    const player = element as HTMLMediaElement
    return player.readyState >= min && !player.seeking
  }, minReady)).toBe(true)
}

/** Opens the video player of a webm file by double-click. Ready when the video element has its frame. Returns the dialog. */
export async function openVideo (page: Page, name: string): Promise<Locator> {
  await page.getByRole('cell', { name, exact: true }).dblclick()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Video player', { exact: true })).toBeVisible()
  await settleMedia(dialog.locator('video'))
  return dialog
}

/**
 * Opens the audio player on the selected audio files: the first one is selected, the others are added with Control, and Play is
 * taken from the menu of the last one. Ready when the player is open and its element has the metadata. Returns the dialog.
 */
export async function openAudio (page: Page, names: string[]): Promise<Locator> {
  for (const [index, name] of names.entries()) {
    await page.getByRole('cell', { name, exact: true }).click(index === 0 ? undefined : { modifiers: ['Control'] })
  }
  await page.getByRole('cell', { name: names.at(-1)!, exact: true }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Play', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Audio player', { exact: true })).toBeVisible()
  await settleMedia(dialog.locator('audio, video').first(), 1)
  return dialog
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(theme, () => {
    test.use({ viewport: { width: 1440, height: 900 }, timezoneId: 'UTC', locale: 'en-US' })

    useTheme(theme)

    test('editor default: readme.txt with Submit disabled', async ({ page }) => {
      await openFileManager(page, theme)

      const dialog = await openEditor(page, 'readme.txt', 'Hello from readme')
      await expectUnderTheme(dialog, theme)
      // The file is unchanged, so Submit is disabled (the same state as the flow test of the editor).
      await expect(dialog.getByRole('button', { name: 'Submit', exact: true })).toBeDisabled()
      // The CodeMirror surface is the legacy CM5 `default` theme in both themes (tokens `--v-fm-editor-*`, phase 2).
      await expect(dialog.locator('.cm-editor')).toHaveCSS('background-color', 'rgb(255, 255, 255)')

      await page.mouse.move(0, 0)
      // The CodeMirror cursor blinks and is not a native caret, so `caret: 'hide'` does not cover it.
      await expect(dialog).toHaveScreenshot(`fm-editor-default-${theme}.png`, { ...SNAPSHOT, mask: [dialog.locator('.cm-cursorLayer')] })
    })

    test('preview default: the image with its file name and the Cropping button', async ({ page, backend }) => {
      const name = 'photo.png'
      backend.addFileContent(name, readFileSync(new URL('../../parity/fixtures/screenshot.png', FIXTURES)))
      await openFileManager(page, theme)

      const dialog = await openPreview(page, name)
      await expectUnderTheme(dialog, theme)
      await expect(dialog.getByRole('button', { name: 'Cropping', exact: true })).toBeVisible()

      await page.mouse.move(0, 0)
      await expect(dialog).toHaveScreenshot(`fm-preview-default-${theme}.png`, SNAPSHOT)
    })

    test('crop default: the cropper with the seven fields, the toolbar and the footer', async ({ page, backend }) => {
      const name = 'photo.png'
      backend.addFileContent(name, readFileSync(new URL('../../parity/fixtures/screenshot.png', FIXTURES)))
      await openFileManager(page, theme)
      await openPreview(page, name)

      const dialog = await openCropper(page)
      await expectUnderTheme(dialog, theme)

      await page.mouse.move(0, 0)
      await expect(dialog).toHaveScreenshot(`fm-crop-default-${theme}.png`, SNAPSHOT)
    })

    test('video default: the clip paused at its first frame, with the Video.js controls', async ({ page, backend }) => {
      const name = 'clip.webm'
      backend.addFileContent(name, readFileSync(new URL('clip.webm', FIXTURES)))
      await openFileManager(page, theme)

      const dialog = await openVideo(page, name)
      await expectUnderTheme(dialog, theme)

      await page.mouse.move(0, 0)
      await expect(dialog).toHaveScreenshot(`fm-video-default-${theme}.png`, { ...SNAPSHOT, mask: [dialog.locator(PLAYBACK_CONTROLS)] })
    })

    test('audio default: the playlist of two tracks, the first one active, speed 1x', async ({ page, backend }) => {
      const names = ['track-a.wav', 'track-b.wav']
      backend.addFileContent(names[0]!, readFileSync(new URL('tone-a.wav', FIXTURES)))
      backend.addFileContent(names[1]!, readFileSync(new URL('tone-b.wav', FIXTURES)))
      await openFileManager(page, theme)

      const dialog = await openAudio(page, names)
      await expectUnderTheme(dialog, theme)

      await page.mouse.move(0, 0)
      await expect(dialog).toHaveScreenshot(`fm-audio-default-${theme}.png`, { ...SNAPSHOT, mask: [dialog.locator(PLAYBACK_CONTROLS)] })
    })

    // The hover of the main action: Submit of the editor, enabled after a change of the text.
    test('editor submit hover: Submit enabled after a change of the text', async ({ page }) => {
      await openFileManager(page, theme)
      const dialog = await openEditor(page, 'readme.txt', 'Hello from readme')
      await expectUnderTheme(dialog, theme)

      await dialog.locator('.cm-content').click()
      await page.keyboard.press('Control+End')
      await page.keyboard.type('!')
      const submit = dialog.getByRole('button', { name: 'Submit', exact: true })
      await expect(submit).toBeEnabled()

      await disableTransitions(page)
      await submit.hover()
      await expectHoverShot(page, dialog, `fm-editor-submit-hover-${theme}.png`)
    })

    // The hover of the first button of the cropper toolbar (`fm-crop-move-left`).
    test('crop tool hover: the first button of the cropper toolbar', async ({ page, backend }) => {
      const name = 'photo.png'
      backend.addFileContent(name, readFileSync(new URL('../../parity/fixtures/screenshot.png', FIXTURES)))
      await openFileManager(page, theme)
      await openPreview(page, name)

      const dialog = await openCropper(page)
      await expectUnderTheme(dialog, theme)

      await disableTransitions(page)
      await dialog.getByTestId('fm-crop-move-left').hover()
      await expectHoverShot(page, dialog, `fm-crop-tool-hover-${theme}.png`)
    })

    // The keyboard focus of the editor: Cancel, the first control a keyboard reaches (Submit is disabled and takes no focus).
    // Keyboard focus as `buttonFocusState` in `parity/states/auth.ts`: a key that moves no focus, then `focus()`; no Tab.
    test('editor focus: Cancel with keyboard focus', async ({ page }) => {
      await openFileManager(page, theme)
      const dialog = await openEditor(page, 'readme.txt', 'Hello from readme')
      await expectUnderTheme(dialog, theme)

      const cancel = dialog.getByRole('button', { name: 'Cancel', exact: true })
      await page.mouse.move(0, 0)
      await page.keyboard.press('Shift')
      await cancel.focus()
      await expect(cancel).toBeFocused()
      expect(await cancel.evaluate(element => element.matches(':focus-visible')), 'keyboard focus').toBe(true)
      await expect(dialog).toHaveScreenshot(`fm-editor-focus-${theme}.png`, { ...SNAPSHOT, mask: [dialog.locator('.cm-cursorLayer')] })
    })

    // The keyboard focus of the first button of the cropper toolbar (`fm-crop-move-left`), as in the hover test above.
    test('crop tool focus: the first button of the cropper toolbar', async ({ page, backend }) => {
      const name = 'photo.png'
      backend.addFileContent(name, readFileSync(new URL('../../parity/fixtures/screenshot.png', FIXTURES)))
      await openFileManager(page, theme)
      await openPreview(page, name)

      const dialog = await openCropper(page)
      await expectUnderTheme(dialog, theme)

      const move = dialog.getByTestId('fm-crop-move-left')
      await page.mouse.move(0, 0)
      await page.keyboard.press('Shift')
      await move.focus()
      await expect(move).toBeFocused()
      expect(await move.evaluate(element => element.matches(':focus-visible')), 'keyboard focus').toBe(true)
      await expect(dialog).toHaveScreenshot(`fm-crop-tool-focus-${theme}.png`, SNAPSHOT)
    })

    // The read-only editor: bytes that are not UTF-8 decode to U+FFFD, so the modal shows `message.fileManager.error.read` and Submit stays
    // disabled (`FmEditorModal.vue`, `readOnly`).
    test('editor readonly: a file that is not UTF-8 opens read-only with Submit disabled', async ({ page, backend }) => {
      backend.addFileContent('binary.txt', Buffer.from([0x41, 0xff, 0xfe, 0x00, 0x41]))
      await openFileManager(page, theme)

      await page.getByRole('cell', { name: 'binary.txt', exact: true }).dblclick()
      const dialog = page.getByRole('dialog')
      await expect(dialog.getByText('Editor', { exact: true })).toBeVisible()
      await expect(dialog.locator('.cm-editor')).toBeVisible()
      await expect(dialog.getByText('Could not read the file.', { exact: true })).toBeVisible()
      await expectUnderTheme(dialog, theme)
      await expect(dialog.getByRole('button', { name: 'Submit', exact: true })).toBeDisabled()

      await page.mouse.move(0, 0)
      await expect(dialog).toHaveScreenshot(`fm-editor-readonly-${theme}.png`, { ...SNAPSHOT, mask: [dialog.locator('.cm-cursorLayer')] })
    })

    // The cropper with an empty Width field: the field is not a number, so Apply is disabled (`FmCropModule.vue`, `canApply`).
    test('crop apply disabled: an empty Width field disables Apply', async ({ page, backend }) => {
      const name = 'photo.png'
      backend.addFileContent(name, readFileSync(new URL('../../parity/fixtures/screenshot.png', FIXTURES)))
      await openFileManager(page, theme)
      await openPreview(page, name)

      const dialog = await openCropper(page)
      await expectUnderTheme(dialog, theme)
      await dialog.getByLabel('Width', { exact: true }).fill('')
      await expect(dialog.getByTestId('fm-crop-apply')).toBeDisabled()

      await page.mouse.move(0, 0)
      await expect(dialog).toHaveScreenshot(`fm-crop-apply-disabled-${theme}.png`, SNAPSHOT)
    })

    // The save error: the server refuses `update-file`, so the modal stays open with the alert and Submit stays enabled (the text is
    // still changed). The toast is shot right after its text appears, before it leaves (5 s).
    test('editor save error: the refused save keeps the modal open with the alert', async ({ page, backend }) => {
      backend.failOperation('update-file')
      await openFileManager(page, theme)
      const dialog = await openEditor(page, 'readme.txt', 'Hello from readme')
      await expectUnderTheme(dialog, theme)

      await dialog.locator('.cm-content').click()
      await page.keyboard.press('Control+End')
      await page.keyboard.type('!')
      await dialog.getByRole('button', { name: 'Submit', exact: true }).click()

      const alert = page.getByTestId('shell-alert-manager')
      await expect(alert).toContainText('Server Error')
      await page.mouse.move(0, 0)
      await expect(alert).toHaveScreenshot(`fm-editor-save-error-toast-${theme}.png`, SNAPSHOT)

      await expect(dialog.getByText('Editor', { exact: true })).toBeVisible()
      await expect(dialog.getByRole('button', { name: 'Submit', exact: true })).toBeEnabled()
      await expect(dialog).toHaveScreenshot(`fm-editor-save-error-${theme}.png`, { ...SNAPSHOT, mask: [dialog.locator('.cm-cursorLayer')] })
    })

    // The playback error: the stream of the video is refused (HTTP 500), so the element fails and the alert names the playback.
    // The player never gets its frame, so the usual `openVideo` readiness does not apply: the alert is the readiness.
    test('video playback error: the refused stream shows the alert and keeps the player', async ({ page, backend }) => {
      const name = 'clip.webm'
      backend.addFileContent(name, readFileSync(new URL('clip.webm', FIXTURES)))
      backend.failOperation('stream-file', { status: 500 })
      await openFileManager(page, theme)

      await page.getByRole('cell', { name, exact: true }).dblclick()
      const dialog = page.getByRole('dialog')
      await expect(dialog.getByText('Video player', { exact: true })).toBeVisible()
      const alert = page.getByTestId('shell-alert-manager')
      await expect(alert).toContainText('Could not play the file.')
      await expectUnderTheme(dialog, theme)

      await page.mouse.move(0, 0)
      await expect(alert).toHaveScreenshot(`fm-video-playback-error-toast-${theme}.png`, SNAPSHOT)
      await expect(dialog).toHaveScreenshot(`fm-video-playback-error-${theme}.png`, { ...SNAPSHOT, mask: [dialog.locator(PLAYBACK_CONTROLS)] })
    })

    // The empty file: a zero-byte file opens as one empty line, with nothing changed, so Submit is disabled (`FmEditorModal.vue`).
    test('editor empty: a zero-byte file opens as one empty line with Submit disabled', async ({ page, backend }) => {
      backend.addFileContent('empty.txt', Buffer.alloc(0))
      await openFileManager(page, theme)

      await page.getByRole('cell', { name: 'empty.txt', exact: true }).dblclick()
      const dialog = page.getByRole('dialog')
      await expect(dialog.getByText('Editor', { exact: true })).toBeVisible()
      await expect(dialog.locator('.cm-editor')).toBeVisible()
      await expect(dialog.locator('.cm-line')).toHaveCount(1)
      await expectUnderTheme(dialog, theme)
      await expect(dialog.getByRole('button', { name: 'Submit', exact: true })).toBeDisabled()

      await page.mouse.move(0, 0)
      await expect(dialog).toHaveScreenshot(`fm-editor-empty-${theme}.png`, { ...SNAPSHOT, mask: [dialog.locator('.cm-cursorLayer')] })
    })

    // The loading of the preview: the image request is held, so the spinner of the body shows and no image is there yet (`FmPreviewModal.vue`).
    test('preview loading: the spinner while the image request is held', async ({ page, backend }) => {
      const name = 'photo.png'
      backend.addFileContent(name, readFileSync(new URL('../../parity/fixtures/screenshot.png', FIXTURES)))
      await openFileManager(page, theme)
      const release = await holdRoute(page, '**/api/file-manager/preview/**')

      await page.getByRole('cell', { name, exact: true }).dblclick()
      const dialog = page.getByRole('dialog')
      await expect(dialog.locator('.fm-preview__body .v-progress-circular')).toBeVisible()
      await expect(dialog.getByRole('img', { name, exact: true })).toHaveCount(0)
      await expectUnderTheme(dialog, theme)

      await page.mouse.move(0, 0)
      await expect(dialog).toHaveScreenshot(`fm-preview-loading-${theme}.png`, SNAPSHOT)

      release()
      await expect(dialog.getByRole('img', { name, exact: true })).toBeVisible()
    })

    // The loading of the editor: the download request is held, so the modal shows the message loader and no editor yet (`FmEditorModal.vue`).
    test('editor loading: the message loader while the download request is held', async ({ page }) => {
      const release = await holdRoute(page, '**/api/file-manager/download/**')
      await openFileManager(page, theme)

      await page.getByRole('cell', { name: 'readme.txt', exact: true }).dblclick()
      const dialog = page.getByRole('dialog')
      await expect(dialog.getByText('Editor', { exact: true })).toBeVisible()
      await expect(dialog.locator('.loader .v-progress-circular')).toBeVisible()
      await expect(dialog.locator('.cm-editor')).toHaveCount(0)
      await expectUnderTheme(dialog, theme)

      await page.mouse.move(0, 0)
      await expect(dialog).toHaveScreenshot(`fm-editor-loading-${theme}.png`, SNAPSHOT)

      release()
      await expect(dialog.locator('.cm-content')).toContainText('Hello from readme')
    })
  })
}

// The cropper on a phone: the fields and the preview stack in one column (`@media (max-width: 767px)` in `FmCropModule.vue`).
test.describe('light-mobile', () => {
  test.use({ viewport: { width: 375, height: 812 }, timezoneId: 'UTC', locale: 'en-US' })

  test('crop default: the cropper stacked in one column', async ({ page, backend }) => {
    const name = 'photo.png'
    backend.addFileContent(name, readFileSync(new URL('../../parity/fixtures/screenshot.png', FIXTURES)))
    await openFileManager(page, 'light')
    await openPreview(page, name)

    const dialog = await openCropper(page)
    await expectUnderTheme(dialog, 'light')

    await page.mouse.move(0, 0)
    await expect(dialog).toHaveScreenshot('fm-crop-default-mobile-light.png', SNAPSHOT)
  })
})

/**
 * The dialog is rendered under the theme of the test: a theme class on an ancestor of the dialog (the overlay or a wrapper). The
 * pixels are the real check of the theme; this only makes sure the test did not start in the other theme.
 */
async function expectUnderTheme (dialog: Locator, theme: 'light' | 'dark'): Promise<void> {
  await expect(dialog.locator(`xpath=ancestor-or-self::*[contains(@class,"v-theme--${theme}")]`)).not.toHaveCount(0)
}
