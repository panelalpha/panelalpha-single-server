import type { FmFile } from '@/views/hosting/file-manager/file-manager.types'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fmApi from '@/views/hosting/file-manager/file-manager.api'
import { useFileManagerStore } from '@/views/hosting/file-manager/file-manager.store'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { mountKit } from '@/test/mount-kit'
import FmAudioPlayerModal from './FmAudioPlayerModal.vue'

// The Video.js modules register custom elements; the tests only need the dialog's own logic, so they are empty here.
vi.mock('@videojs/html/audio/player', () => ({}))
vi.mock('@videojs/html/audio/skin', () => ({}))

vi.mock('@/views/hosting/file-manager/file-manager.api', () => ({
  initialize: vi.fn(),
  content: vi.fn(),
  downloadText: vi.fn(),
  updateFile: vi.fn(),
  streamSource: vi.fn(),
}))

function track (name: string, extension = 'mp3'): FmFile {
  return { type: 'file', path: `music/${name}`, basename: name, dirname: 'music', filename: name, extension, size: 1, timestamp: 0 }
}

/** Each source is a stream URL of its file; `release` is kept per file to check the cleanup. */
const releases = new Map<string, ReturnType<typeof vi.fn>>()

function mediaElement (): HTMLAudioElement {
  const media = document.querySelector<HTMLAudioElement>('[data-testid="fm-audio-media"]')
  if (!media) {
    throw new Error('no audio element')
  }
  return media
}

function trackButtons (): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-testid="fm-audio-track"]'))
}

/** Waits until the player is ready and the first track is loaded into the media element. */
async function mountPlayer (items: FmFile[]) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useFileManagerStore()
  store.accountId = 7
  const wrapper = await mountKit(FmAudioPlayerModal, { props: { items }, global: { plugins: [pinia] } })
  await vi.waitFor(() => {
    expect(document.querySelector('[data-testid="fm-audio-media"] source')).not.toBeNull()
  })
  return wrapper
}

describe('FmAudioPlayerModal', () => {
  let play: ReturnType<typeof vi.spyOn>
  let pause: ReturnType<typeof vi.spyOn>
  let load: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.mocked(fmApi.streamSource).mockReset()
    vi.mocked(fmApi.streamSource).mockImplementation(async (_accountId, file) => {
      const release = vi.fn()
      releases.set(file.basename, release)
      return { ok: true, url: `https://api.test/stream/${file.basename}`, release }
    })
    play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
  })

  afterEach(() => {
    releases.clear()
    vi.restoreAllMocks()
  })

  it('loads the first track of the list from the stream source, with its own type and without crossorigin', async () => {
    const wrapper = await mountPlayer([track('one.mp3'), track('two.ogg', 'ogg')])

    expect(fmApi.streamSource).toHaveBeenCalledWith(7, track('one.mp3'))
    const source = document.querySelector<HTMLSourceElement>('[data-testid="fm-audio-media"] source')
    expect(source?.getAttribute('src')).toBe('https://api.test/stream/one.mp3')
    expect(source?.getAttribute('type')).toBe('audio/mpeg')
    expect(mediaElement().hasAttribute('crossorigin')).toBe(false)
    expect(load).toHaveBeenCalled()
    expect(play).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('plays the next track when the current one ends', async () => {
    const wrapper = await mountPlayer([track('one.mp3'), track('two.ogg', 'ogg')])

    mediaElement().dispatchEvent(new Event('ended'))
    await vi.waitFor(() => {
      expect(play).toHaveBeenCalledTimes(1)
    })

    expect(fmApi.streamSource).toHaveBeenLastCalledWith(7, track('two.ogg', 'ogg'))
    expect(document.querySelector('[data-testid="fm-audio-media"] source')?.getAttribute('src')).toBe('https://api.test/stream/two.ogg')
    wrapper.unmount()
  })

  it('stops at the last track: the list does not wrap around', async () => {
    const wrapper = await mountPlayer([track('one.mp3'), track('two.ogg', 'ogg')])
    trackButtons()[1]!.click()
    await vi.waitFor(() => {
      expect(fmApi.streamSource).toHaveBeenCalledTimes(2)
    })

    mediaElement().dispatchEvent(new Event('ended'))
    await flushPromises()

    expect(fmApi.streamSource).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('plays the track picked in the list and marks it as active', async () => {
    const wrapper = await mountPlayer([track('one.mp3'), track('two.ogg', 'ogg')])

    trackButtons()[1]!.click()
    await vi.waitFor(() => {
      expect(play).toHaveBeenCalledTimes(1)
    })

    expect(fmApi.streamSource).toHaveBeenLastCalledWith(7, track('two.ogg', 'ogg'))
    expect(trackButtons()[1]!.classList.contains('v-list-item--active')).toBe(true)
    expect(trackButtons()[0]!.classList.contains('v-list-item--active')).toBe(false)
    wrapper.unmount()
  })

  it('sets the playback speed from the speed buttons: 0.5, 1 and 1.5', async () => {
    const wrapper = await mountPlayer([track('one.mp3')])

    document.querySelector<HTMLElement>('[data-testid="fm-audio-speed-1.5"]')!.click()
    await flushPromises()
    expect(mediaElement().playbackRate).toBe(1.5)

    document.querySelector<HTMLElement>('[data-testid="fm-audio-speed-0.5"]')!.click()
    await flushPromises()
    expect(mediaElement().playbackRate).toBe(0.5)
    wrapper.unmount()
  })

  it('stops the media and frees the source when it is closed', async () => {
    const wrapper = await mountPlayer([track('one.mp3')])

    wrapper.unmount()

    expect(pause).toHaveBeenCalled()
    expect(releases.get('one.mp3')).toHaveBeenCalledTimes(1)
  })

  it('shows a playback alert when the media fails, once for the track', async () => {
    const wrapper = await mountPlayer([track('one.mp3')])

    const source = document.querySelector<HTMLSourceElement>('[data-testid="fm-audio-media"] source')!
    source.dispatchEvent(new Event('error'))
    mediaElement().dispatchEvent(new Event('error'))
    await flushPromises()

    expect(useAlertsStore().activeAlerts).toHaveLength(1)
    expect(useAlertsStore().activeAlerts.at(-1)).toMatchObject({ success: false, errorMessage: 'message.fileManager.error.playback' })
    wrapper.unmount()
  })

  it('shows a playback alert when the stream source cannot be made', async () => {
    vi.mocked(fmApi.streamSource).mockResolvedValueOnce({ ok: false })
    const pinia = createPinia()
    setActivePinia(pinia)
    useFileManagerStore().accountId = 7
    const wrapper = await mountKit(FmAudioPlayerModal, { props: { items: [track('one.mp3')] }, global: { plugins: [pinia] } })
    await vi.waitFor(() => {
      expect(useAlertsStore().activeAlerts.at(-1)).toMatchObject({ success: false, errorMessage: 'message.fileManager.error.playback' })
    })
    wrapper.unmount()
  })
})
