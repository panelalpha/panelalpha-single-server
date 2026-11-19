import type { FmDirectory, FmFile } from './file-manager.types'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import * as fmApi from './file-manager.api'
import { loadPreview, openActionFor, openPdf } from './fm-open'

vi.mock('./file-manager.api', () => ({
  downloadBlob: vi.fn(),
  preview: vi.fn(),
  FmDownloadError: class extends Error {},
}))

function file (name: string): FmFile {
  const dot = name.lastIndexOf('.')
  return {
    type: 'file',
    path: `docs/${name}`,
    basename: name,
    dirname: 'docs',
    filename: dot > 0 ? name.slice(0, dot) : name,
    extension: dot > 0 ? name.slice(dot + 1) : '',
    size: 1,
    timestamp: 0,
  }
}

const folder: FmDirectory = { type: 'dir', path: 'docs/a', basename: 'a', dirname: 'docs', timestamp: 0 }

describe('openActionFor (double click, legacy selectAction)', () => {
  it('opens a folder', () => {
    expect(openActionFor(folder)).toBe('open')
  })

  it('shows the preview of an image, whatever the case of the extension', () => {
    expect(openActionFor(file('photo.png'))).toBe('preview')
    expect(openActionFor(file('PHOTO.JPG'))).toBe('preview')
    expect(openActionFor(file('shot.webp'))).toBe('preview')
  })

  it('opens a PDF in a new window', () => {
    expect(openActionFor(file('manual.pdf'))).toBe('pdf')
  })

  it('opens a text file in the editor, whatever the case of the extension', () => {
    expect(openActionFor(file('index.php'))).toBe('edit')
    expect(openActionFor(file('CONFIG.JSON'))).toBe('edit')
    expect(openActionFor(file('access.htaccess'))).toBe('edit')
  })

  it('opens the player for audio and video, whatever the case of the extension', () => {
    expect(openActionFor(file('song.mp3'))).toBe('audio')
    expect(openActionFor(file('track.OGG'))).toBe('audio')
    expect(openActionFor(file('clip.mp4'))).toBe('video')
    expect(openActionFor(file('CLIP.WEBM'))).toBe('video')
  })

  it('checks the text editor before the players, and the players before the PDF', () => {
    expect(openActionFor(file('index.php'))).toBe('edit')
    expect(openActionFor(file('manual.pdf'))).toBe('pdf')
  })

  it('does nothing for other files and files without an extension', () => {
    expect(openActionFor(file('data.bin'))).toBe('none')
    expect(openActionFor(file('LICENSE'))).toBe('none')
  })
})

describe('loadPreview', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(fmApi.preview).mockReset()
  })

  it('returns the data URI of the image', async () => {
    vi.mocked(fmApi.preview).mockResolvedValue({ result: { status: 'success', messageKey: null, message: null }, data: { image: 'data:image/png;base64,AA' } })

    await expect(loadPreview(7, 'docs/photo.png')).resolves.toBe('data:image/png;base64,AA')
    expect(fmApi.preview).toHaveBeenCalledWith(7, 'docs/photo.png')
  })

  it('returns null when the request failed', async () => {
    vi.mocked(fmApi.preview).mockResolvedValue({ result: { status: 'error', messageKey: null, message: 'no' }, data: null })

    await expect(loadPreview(7, 'docs/photo.png')).resolves.toBeNull()
    expect(useAlertsStore().activeAlerts.at(-1)).toMatchObject({ success: false, errorMessage: 'no' })
  })

  it('returns null for an image that is not a data URI', async () => {
    vi.mocked(fmApi.preview).mockResolvedValue({ result: { status: 'success', messageKey: null, message: null }, data: { image: 'javascript:alert(1)' } })

    await expect(loadPreview(7, 'docs/photo.png')).resolves.toBeNull()
  })
})

describe('openPdf (legacy openPDF)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(fmApi.downloadBlob).mockReset()
    URL.createObjectURL = vi.fn(() => 'blob:pdf')
  })

  it('opens the window first and points it at the downloaded PDF', async () => {
    const win = { location: { href: '' }, close: vi.fn() }
    vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window)
    vi.mocked(fmApi.downloadBlob).mockResolvedValue(new Blob(['%PDF'], { type: 'application/pdf' }))

    await openPdf(7, 'docs/manual.pdf')

    expect(window.open).toHaveBeenCalledBefore(fmApi.downloadBlob as never)
    expect(fmApi.downloadBlob).toHaveBeenCalledWith(7, 'docs/manual.pdf')
    expect(win.location.href).toBe('blob:pdf')
    expect(win.close).not.toHaveBeenCalled()
    expect(win.opener).toBeNull()
    vi.restoreAllMocks()
  })

  it('releases the blob URL after a while', async () => {
    vi.useFakeTimers()
    URL.revokeObjectURL = vi.fn()
    const win = { location: { href: '' }, close: vi.fn() }
    vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window)
    vi.mocked(fmApi.downloadBlob).mockResolvedValue(new Blob(['%PDF'], { type: 'application/pdf' }))

    await openPdf(7, 'docs/manual.pdf')
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()
    vi.advanceTimersByTime(60_000)

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:pdf')
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('alerts and does not download when the browser blocks the window', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null)

    await openPdf(7, 'docs/manual.pdf')

    expect(fmApi.downloadBlob).not.toHaveBeenCalled()
    expect(useAlertsStore().activeAlerts.at(-1)).toMatchObject({ success: false })
    vi.restoreAllMocks()
  })

  it('closes the window when the download fails', async () => {
    const win = { location: { href: '' }, close: vi.fn() }
    vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window)
    vi.mocked(fmApi.downloadBlob).mockRejectedValue(new Error('network'))

    await openPdf(7, 'docs/manual.pdf')

    expect(win.close).toHaveBeenCalled()
    expect(win.location.href).toBe('')
    expect(useAlertsStore().activeAlerts.at(-1)).toMatchObject({ success: false })
    vi.restoreAllMocks()
  })
})
