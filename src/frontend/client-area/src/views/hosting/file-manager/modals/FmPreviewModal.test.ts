import type { FmFile } from '@/views/hosting/file-manager/file-manager.types'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadPreview } from '@/views/hosting/file-manager/fm-open'
import { mountKit } from '@/test/mount-kit'
import FmCropModule from './FmCropModule.vue'
import FmPreviewModal from './FmPreviewModal.vue'

vi.mock('@/views/hosting/file-manager/fm-open', () => ({
  loadPreview: vi.fn(),
}))

// cropperjs is replaced by the stub elements (jsdom never loads the image).
vi.mock('cropperjs', async () => {
  const { defineCropperStub } = await import('@/test/cropperjs-stub')
  defineCropperStub()
  return {}
})

const IMAGE = 'data:image/png;base64,AAAA'

function file (name: string, extension: string): FmFile {
  return { type: 'file', path: `docs/${name}`, basename: name, dirname: 'docs', filename: name, extension, size: 1, timestamp: 0 }
}

/** The modal's footer buttons (the crop button is the only one). */
function footerButtons (): HTMLButtonElement[] {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('.basic-modal .v-btn'))
}

function cropButton (): HTMLButtonElement | undefined {
  return footerButtons().find(button => button.textContent?.includes('heading.hosting.fileManager.cropper.title'))
}

describe('FmPreviewModal', () => {
  let pinia: ReturnType<typeof createPinia>

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.mocked(loadPreview).mockReset()
    vi.mocked(loadPreview).mockResolvedValue(IMAGE)
  })

  it('loads the preview of the file for the account', async () => {
    const wrapper = await mountKit(FmPreviewModal, {
      props: { accountId: 7, file: file('photo.png', 'png') },
      global: { plugins: [pinia] },
    })
    await flushPromises()

    expect(loadPreview).toHaveBeenCalledWith(7, 'docs/photo.png')
    expect(document.querySelector<HTMLImageElement>('[data-testid="fm-preview"] img')?.src).toContain('data:image/png')
    wrapper.unmount()
  })

  it('shows the crop button for a croppable image once the preview is loaded', async () => {
    const wrapper = await mountKit(FmPreviewModal, {
      props: { accountId: 7, file: file('photo.jpg', 'JPG') },
      global: { plugins: [pinia] },
    })
    await flushPromises()

    expect(cropButton()).toBeDefined()
    wrapper.unmount()
  })

  it('hides the crop button for a GIF, which is not croppable', async () => {
    const wrapper = await mountKit(FmPreviewModal, {
      props: { accountId: 7, file: file('anim.gif', 'gif') },
      global: { plugins: [pinia] },
    })
    await flushPromises()

    expect(document.querySelector('[data-testid="fm-preview"] img')).not.toBeNull()
    expect(cropButton()).toBeUndefined()
    wrapper.unmount()
  })

  it('hides the crop button while the preview is still loading', async () => {
    vi.mocked(loadPreview).mockReturnValue(new Promise(() => {}))
    const wrapper = await mountKit(FmPreviewModal, {
      props: { accountId: 7, file: file('photo.png', 'png') },
      global: { plugins: [pinia] },
    })
    await flushPromises()

    expect(cropButton()).toBeUndefined()
    wrapper.unmount()
  })

  it('opens the cropper panel from the crop button and returns to the preview with Back', async () => {
    const wrapper = await mountKit(FmPreviewModal, {
      props: { accountId: 7, file: file('photo.png', 'png') },
      global: { plugins: [pinia] },
    })
    await flushPromises()

    cropButton()!.click()
    await flushPromises()
    const crop = wrapper.findComponent(FmCropModule)
    expect(crop.exists()).toBe(true)
    expect(crop.props('image')).toBe(IMAGE)
    expect(cropButton()).toBeUndefined()

    crop.vm.$emit('close')
    await flushPromises()

    expect(wrapper.findComponent(FmCropModule).exists()).toBe(false)
    expect(cropButton()).toBeDefined()
    wrapper.unmount()
  })

  it('reloads the preview after a saved crop', async () => {
    const wrapper = await mountKit(FmPreviewModal, {
      props: { accountId: 7, file: file('photo.png', 'png') },
      global: { plugins: [pinia] },
    })
    await flushPromises()
    cropButton()!.click()
    await flushPromises()

    wrapper.findComponent(FmCropModule).vm.$emit('saved')
    await flushPromises()

    expect(loadPreview).toHaveBeenCalledTimes(2)
    expect(loadPreview).toHaveBeenLastCalledWith(7, 'docs/photo.png')
    wrapper.unmount()
  })

  it('leaves the cropper when another file is shown', async () => {
    const wrapper = await mountKit(FmPreviewModal, {
      props: { accountId: 7, file: file('photo.png', 'png') },
      global: { plugins: [pinia] },
    })
    await flushPromises()
    cropButton()!.click()
    await flushPromises()

    await wrapper.setProps({ file: file('other.png', 'png') })
    await flushPromises()

    expect(wrapper.findComponent(FmCropModule).exists()).toBe(false)
    expect(cropButton()).toBeDefined()
    wrapper.unmount()
  })
})
