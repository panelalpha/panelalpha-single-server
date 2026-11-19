import type { FmFile } from '@/views/hosting/file-manager/file-manager.types'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fmApi from '@/views/hosting/file-manager/file-manager.api'
import { useFileManagerStore } from '@/views/hosting/file-manager/file-manager.store'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { mountKit } from '@/test/mount-kit'
import FmVideoPlayerModal from './FmVideoPlayerModal.vue'

// The Video.js modules register custom elements; the tests only need the dialog's own logic, so they are empty here.
vi.mock('@videojs/html/video/player', () => ({}))
vi.mock('@videojs/html/video/skin', () => ({}))

vi.mock('@/views/hosting/file-manager/file-manager.api', () => ({
  initialize: vi.fn(),
  content: vi.fn(),
  downloadText: vi.fn(),
  updateFile: vi.fn(),
  streamSource: vi.fn(),
}))

function file (name: string, extension: string): FmFile {
  return { type: 'file', path: `clips/${name}`, basename: name, dirname: 'clips', filename: name, extension, size: 1, timestamp: 0 }
}

describe('FmVideoPlayerModal', () => {
  let release: ReturnType<typeof vi.fn>
  let pause: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    release = vi.fn()
    vi.mocked(fmApi.streamSource).mockReset()
    vi.mocked(fmApi.streamSource).mockResolvedValue({ ok: true, url: 'https://api.test/stream/movie.mp4', release })
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  async function mountPlayer (item: FmFile) {
    const pinia = createPinia()
    setActivePinia(pinia)
    useFileManagerStore().accountId = 7
    const wrapper = await mountKit(FmVideoPlayerModal, { props: { file: item }, global: { plugins: [pinia] } })
    await vi.waitFor(() => {
      expect(document.querySelector('[data-testid="fm-video-media"] source')).not.toBeNull()
    })
    return wrapper
  }

  function mediaElement (): HTMLVideoElement {
    const media = document.querySelector<HTMLVideoElement>('[data-testid="fm-video-media"]')
    if (!media) {
      throw new Error('no video element')
    }
    return media
  }

  it('loads the file from the stream source, typed by its extension, without crossorigin', async () => {
    const wrapper = await mountPlayer(file('movie.mp4', 'mp4'))

    expect(fmApi.streamSource).toHaveBeenCalledWith(7, file('movie.mp4', 'mp4'))
    const source = document.querySelector<HTMLSourceElement>('[data-testid="fm-video-media"] source')
    expect(source?.getAttribute('src')).toBe('https://api.test/stream/movie.mp4')
    expect(source?.getAttribute('type')).toBe('video/mp4')
    expect(mediaElement().hasAttribute('crossorigin')).toBe(false)
    expect(document.querySelector('[data-testid="fm-video-player-name"]')?.textContent).toContain('movie.mp4')
    wrapper.unmount()
  })

  it('types a webm file as video/webm, not as audio', async () => {
    const wrapper = await mountPlayer(file('clip.webm', 'webm'))

    expect(document.querySelector('[data-testid="fm-video-media"] source')?.getAttribute('type')).toBe('video/webm')
    wrapper.unmount()
  })

  it('stops the media and frees the source when it is closed', async () => {
    const wrapper = await mountPlayer(file('movie.mp4', 'mp4'))

    wrapper.unmount()

    expect(pause).toHaveBeenCalled()
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('shows a playback alert when the media fails', async () => {
    const wrapper = await mountPlayer(file('movie.mp4', 'mp4'))

    document.querySelector<HTMLSourceElement>('[data-testid="fm-video-media"] source')!.dispatchEvent(new Event('error'))
    await flushPromises()

    expect(useAlertsStore().activeAlerts.at(-1)).toMatchObject({ success: false, errorMessage: 'message.fileManager.error.playback' })
    wrapper.unmount()
  })

  it('emits close when the dialog is closed from the header', async () => {
    const wrapper = await mountPlayer(file('movie.mp4', 'mp4'))

    document.querySelector<HTMLButtonElement>('.basic-modal > .v-card-title .v-btn')!.click()
    await flushPromises()

    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })
})
