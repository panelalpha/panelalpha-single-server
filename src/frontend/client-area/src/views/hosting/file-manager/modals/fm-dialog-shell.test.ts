import type { FmFile } from '@/views/hosting/file-manager/file-manager.types'
import type * as Vuetify from 'vuetify'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { VDialog } from 'vuetify/components'
import * as fmApi from '@/views/hosting/file-manager/file-manager.api'
import { useFileManagerStore } from '@/views/hosting/file-manager/file-manager.store'
import { loadPreview } from '@/views/hosting/file-manager/fm-open'
import { mountKit } from '@/test/mount-kit'
import FmAudioPlayerModal from './FmAudioPlayerModal.vue'
import FmClipboardModal from './FmClipboardModal.vue'
import FmCropModule from './FmCropModule.vue'
import FmDeleteModal from './FmDeleteModal.vue'
import FmEditorModal from './FmEditorModal.vue'
import FmNewFileModal from './FmNewFileModal.vue'
import FmNewFolderModal from './FmNewFolderModal.vue'
import FmPreviewModal from './FmPreviewModal.vue'
import FmPropertiesModal from './FmPropertiesModal.vue'
import FmRenameModal from './FmRenameModal.vue'
import FmStatusModal from './FmStatusModal.vue'
import FmUnzipModal from './FmUnzipModal.vue'
import FmUploadModal from './FmUploadModal.vue'
import FmVideoPlayerModal from './FmVideoPlayerModal.vue'
import FmZipModal from './FmZipModal.vue'

// Characterization of the dialog shell shared by the 14 file manager modals: the card behind a `div.card-overlay`, the
// custom transition, no `persistent`, a click on the overlay or the dialog's own close ends in the `close` emit, and the legacy mobile
// scroll lock on `<html>`. The assertions carry no scope ids, so they hold when the shell moves into the kit dialog.

const smAndDown = ref(false)
vi.mock('vuetify', async importOriginal => ({ ...(await importOriginal<typeof Vuetify>()), useDisplay: () => ({ smAndDown }) }))

vi.mock('@/views/hosting/file-manager/fm-open', () => ({
  loadPreview: vi.fn(),
}))

vi.mock('cropperjs', async () => {
  const { defineCropperStub } = await import('@/test/cropperjs-stub')
  defineCropperStub()
  return {}
})

vi.mock('@videojs/html/audio/player', () => ({}))
vi.mock('@videojs/html/audio/skin', () => ({}))
vi.mock('@videojs/html/video/player', () => ({}))
vi.mock('@videojs/html/video/skin', () => ({}))

vi.mock('@/views/hosting/file-manager/file-manager.api', () => ({
  initialize: vi.fn(),
  content: vi.fn(),
  downloadText: vi.fn(),
  updateFile: vi.fn(),
  streamSource: vi.fn(),
}))

const html = document.documentElement

function file (name: string, extension: string): FmFile {
  return { type: 'file', path: `docs/${name}`, basename: name, dirname: 'docs', filename: name, extension, size: 1, timestamp: 0 }
}

interface ShellCase {
  name: string
  testid: string
  mount: (pinia: ReturnType<typeof createPinia>) => ReturnType<typeof mountKit>
}

const cases: ShellCase[] = [
  { name: 'FmNewFolderModal', testid: 'fm-new-folder', mount: pinia => mountKit(FmNewFolderModal, { global: { plugins: [pinia] } }) },
  { name: 'FmNewFileModal', testid: 'fm-new-file', mount: pinia => mountKit(FmNewFileModal, { global: { plugins: [pinia] } }) },
  { name: 'FmUploadModal', testid: 'fm-upload', mount: pinia => mountKit(FmUploadModal, { global: { plugins: [pinia] }, attachTo: document.body }) },
  { name: 'FmDeleteModal', testid: 'fm-delete', mount: pinia => mountKit(FmDeleteModal, { global: { plugins: [pinia] } }) },
  { name: 'FmRenameModal', testid: 'fm-rename', mount: pinia => mountKit(FmRenameModal, { global: { plugins: [pinia] } }) },
  { name: 'FmZipModal', testid: 'fm-zip', mount: pinia => mountKit(FmZipModal, { global: { plugins: [pinia] } }) },
  { name: 'FmUnzipModal', testid: 'fm-unzip', mount: pinia => mountKit(FmUnzipModal, { global: { plugins: [pinia] } }) },
  { name: 'FmEditorModal', testid: 'fm-editor', mount: pinia => mountKit(FmEditorModal, { global: { plugins: [pinia] } }) },
  { name: 'FmClipboardModal', testid: 'fm-clipboard', mount: pinia => mountKit(FmClipboardModal, { props: { open: true }, global: { plugins: [pinia] } }) },
  { name: 'FmStatusModal', testid: 'fm-status', mount: pinia => mountKit(FmStatusModal, { global: { plugins: [pinia] } }) },
  {
    name: 'FmPreviewModal',
    testid: 'fm-preview',
    mount: pinia => mountKit(FmPreviewModal, { props: { accountId: 7, file: file('photo.png', 'png') }, global: { plugins: [pinia] } }),
  },
  { name: 'FmPropertiesModal', testid: 'fm-properties', mount: () => mountKit(FmPropertiesModal, { props: { item: file('notes.txt', 'txt') } }) },
  {
    name: 'FmAudioPlayerModal',
    testid: 'fm-audio-player',
    mount: pinia => mountKit(FmAudioPlayerModal, { props: { items: [file('one.mp3', 'mp3')] }, global: { plugins: [pinia] } }),
  },
  {
    name: 'FmVideoPlayerModal',
    testid: 'fm-video-player',
    mount: pinia => mountKit(FmVideoPlayerModal, { props: { file: file('movie.mp4', 'mp4') }, global: { plugins: [pinia] } }),
  },
]

function overlayContent (): HTMLElement {
  const content = document.body.querySelector<HTMLElement>('.v-overlay__content')
  if (!content) {
    throw new Error('no dialog content')
  }
  return content
}

describe('file manager modal shell', () => {
  let pinia: ReturnType<typeof createPinia>

  beforeEach(() => {
    smAndDown.value = false
    pinia = createPinia()
    setActivePinia(pinia)
    const store = useFileManagerStore()
    store.accountId = 7
    store.path = 'docs'
    store.config = { uploadMaxFilesize: 100, unsupportedActions: [] }
    store.files = [file('notes.txt', 'txt'), file('a.zip', 'zip')]
    store.select(file('notes.txt', 'txt'))
    vi.mocked(fmApi.downloadText).mockResolvedValue({ ok: true, text: 'hello' })
    vi.mocked(fmApi.streamSource).mockResolvedValue({ ok: true, url: 'https://api.test/stream/x', release: vi.fn() })
    vi.mocked(loadPreview).mockResolvedValue('data:image/png;base64,AAAA')
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    html.classList.remove('overflow-y-hidden')
  })

  describe.each(cases)('$name', ({ testid, mount }) => {
    it('puts the card behind a card-overlay in a non-persistent dialog with the custom transition', async () => {
      const wrapper = await mount(pinia)
      await flushPromises()

      const content = overlayContent()
      expect(content.firstElementChild?.classList.contains('card-overlay')).toBe(true)
      expect(content.querySelector<HTMLElement>(':scope > .card-overlay + *')?.dataset.testid).toBe(testid)

      const dialog = wrapper.findComponent(VDialog)
      expect(dialog.props('transition')).toBe('custom-dialog-transition')
      expect(dialog.props('persistent')).toBe(false)
      wrapper.unmount()
    })

    it('emits close for a click on the overlay and for the dialog asking to close', async () => {
      const wrapper = await mount(pinia)
      await flushPromises()

      document.body.querySelector<HTMLElement>('.card-overlay')?.click()
      await flushPromises()
      expect(wrapper.emitted('close')).toHaveLength(1)

      wrapper.findComponent(VDialog).vm.$emit('update:modelValue', false)
      await flushPromises()
      expect(wrapper.emitted('close')).toHaveLength(2)
      wrapper.unmount()
    })

    it('holds overflow-y-hidden on <html> under 768px only while the modal is mounted', async () => {
      const wide = await mount(pinia)
      await flushPromises()
      expect(html.classList.contains('overflow-y-hidden')).toBe(false)
      wide.unmount()

      smAndDown.value = true
      const wrapper = await mount(pinia)
      await flushPromises()
      expect(html.classList.contains('overflow-y-hidden')).toBe(true)
      wrapper.unmount()
      expect(html.classList.contains('overflow-y-hidden')).toBe(false)
    })
  })

  it('ignores the overlay and the dialog close while a form modal submits, then closes after success', async () => {
    const store = useFileManagerStore()
    let finish!: (value: boolean) => void
    vi.spyOn(store, 'renameItem').mockReturnValue(new Promise<boolean>(done => {
      finish = done
    }))
    const wrapper = await mountKit(FmRenameModal, { global: { plugins: [pinia] } })
    await flushPromises()

    const input = document.querySelector<HTMLInputElement>('[data-testid="fm-rename-name"] input')
    input!.value = 'plan.txt'
    input!.dispatchEvent(new Event('input'))
    await flushPromises()
    Array.from(document.querySelectorAll<HTMLButtonElement>('.basic-modal .v-btn')).find(button => button.textContent?.includes('button.submit'))?.click()
    await flushPromises()

    document.body.querySelector<HTMLElement>('.card-overlay')?.click()
    wrapper.findComponent(VDialog).vm.$emit('update:modelValue', false)
    await flushPromises()
    expect(wrapper.emitted('close')).toBeUndefined()

    finish(true)
    await flushPromises()
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })

  it('ignores the overlay and the dialog close of the preview while a crop is saving, then closes', async () => {
    const wrapper = await mountKit(FmPreviewModal, { props: { accountId: 7, file: file('photo.png', 'png') }, global: { plugins: [pinia] } })
    await flushPromises()

    Array.from(document.querySelectorAll<HTMLButtonElement>('.basic-modal .v-btn'))
      .find(button => button.textContent?.includes('heading.hosting.fileManager.cropper.title'))
      ?.click()
    await flushPromises()
    const crop = wrapper.findComponent(FmCropModule)
    expect(crop.exists()).toBe(true)

    crop.vm.$emit('saving', true)
    await flushPromises()
    document.body.querySelector<HTMLElement>('.card-overlay')?.click()
    wrapper.findComponent(VDialog).vm.$emit('update:modelValue', false)
    await flushPromises()
    expect(wrapper.emitted('close')).toBeUndefined()

    crop.vm.$emit('saving', false)
    await flushPromises()
    document.body.querySelector<HTMLElement>('.card-overlay')?.click()
    await flushPromises()
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })
})
