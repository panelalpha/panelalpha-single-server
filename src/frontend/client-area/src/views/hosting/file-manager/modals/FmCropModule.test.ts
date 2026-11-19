import type { FmFile } from '@/views/hosting/file-manager/file-manager.types'
import type { VueWrapper } from '@vue/test-utils'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
import { useFileManagerStore } from '@/views/hosting/file-manager/file-manager.store'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { mountKit } from '@/test/mount-kit'
import FmCropModule from './FmCropModule.vue'

// cropperjs is replaced by the stub elements (jsdom never loads the image). The stub's `$ready` reports a 400 x 200 image.
vi.mock('cropperjs', async () => {
  const { defineCropperStub } = await import('@/test/cropperjs-stub')
  defineCropperStub()
  return {}
})

function file (name: string, extension: string): FmFile {
  return { type: 'file', path: `docs/${name}`, basename: name, dirname: 'docs', filename: name, extension, size: 1, timestamp: 0 }
}

/** The stub element of a cropper tag: its methods are spies, its box is plain properties. */
function stub (wrapper: VueWrapper, tag: string): Record<string, Mock> & { x: number } {
  return wrapper.element.querySelector(tag) as unknown as Record<string, Mock> & { x: number }
}

function fieldInput (wrapper: VueWrapper, name: string): HTMLInputElement {
  return wrapper.get(`[data-testid="fm-crop-${name}"] input`).element as HTMLInputElement
}

describe('FmCropModule', () => {
  let pinia: ReturnType<typeof createPinia>

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
  })

  async function setup (name = 'photo.png', extension = 'png'): Promise<VueWrapper> {
    const wrapper = await mountKit(FmCropModule, {
      props: { image: 'data:image/png;base64,AAAA', file: file(name, extension) },
      global: { plugins: [pinia] },
    })
    await vi.waitFor(() => {
      expect(fieldInput(wrapper, 'x').value).toBe('50')
    })
    return wrapper
  }

  it('loads the cropper and fills the seven fields from the selection', async () => {
    const wrapper = await setup()

    expect(stub(wrapper, 'cropper-image').$ready).toHaveBeenCalled()
    expect(fieldInput(wrapper, 'x').value).toBe('50')
    expect(fieldInput(wrapper, 'y').value).toBe('25')
    expect(fieldInput(wrapper, 'width').value).toBe('100')
    expect(fieldInput(wrapper, 'height').value).toBe('50')
    expect(fieldInput(wrapper, 'rotate').value).toBe('0')
    expect(fieldInput(wrapper, 'scaleX').value).toBe('1')
    expect(fieldInput(wrapper, 'scaleY').value).toBe('1')
    wrapper.unmount()
  })

  it('Apply sends the typed fields to the selection and the image transform', async () => {
    const wrapper = await setup()
    await wrapper.get('[data-testid="fm-crop-x"] input').setValue('20')

    await wrapper.get('[data-testid="fm-crop-apply"]').trigger('click')
    await flushPromises()

    expect(stub(wrapper, 'cropper-selection').$change).toHaveBeenCalledWith(20, 25, 100, 50)
    const matrix = stub(wrapper, 'cropper-image').$setTransform.mock.calls[0]![0] as number[]
    expect(matrix[0]).toBeCloseTo(1)
    expect(matrix[3]).toBeCloseTo(1)
    expect(matrix[4]).toBeCloseTo(0)
    expect(matrix[5]).toBeCloseTo(0)
    wrapper.unmount()
  })

  it('keeps Apply disabled while a field is not a number', async () => {
    const wrapper = await setup()
    await wrapper.get('[data-testid="fm-crop-width"] input').setValue('')

    expect(wrapper.get('[data-testid="fm-crop-apply"]').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('moves the image by 10 px with the arrow buttons', async () => {
    const wrapper = await setup()

    await wrapper.get('[data-testid="fm-crop-move-left"]').trigger('click')
    await wrapper.get('[data-testid="fm-crop-move-up"]').trigger('click')

    expect(stub(wrapper, 'cropper-image').$move).toHaveBeenNthCalledWith(1, -10, 0)
    expect(stub(wrapper, 'cropper-image').$move).toHaveBeenNthCalledWith(2, 0, -10)
    wrapper.unmount()
  })

  it('flips around the centre of the image', async () => {
    const wrapper = await setup()

    await wrapper.get('[data-testid="fm-crop-flip-x"]').trigger('click')
    await wrapper.get('[data-testid="fm-crop-flip-y"]').trigger('click')

    expect(stub(wrapper, 'cropper-image').$transform).toHaveBeenNthCalledWith(1, -1, 0, 0, 1, 400, 0)
    expect(stub(wrapper, 'cropper-image').$transform).toHaveBeenNthCalledWith(2, 1, 0, 0, -1, 0, 200)
    wrapper.unmount()
  })

  it('rotates by 45 degrees in either direction', async () => {
    const wrapper = await setup()

    await wrapper.get('[data-testid="fm-crop-rotate-left"]').trigger('click')
    await wrapper.get('[data-testid="fm-crop-rotate-right"]').trigger('click')

    expect(stub(wrapper, 'cropper-image').$rotate).toHaveBeenNthCalledWith(1, '-45deg', 0, 0)
    expect(stub(wrapper, 'cropper-image').$rotate).toHaveBeenNthCalledWith(2, '45deg', 0, 0)
    wrapper.unmount()
  })

  it('zooms by 0.1 in and out', async () => {
    const wrapper = await setup()

    await wrapper.get('[data-testid="fm-crop-zoom-in"]').trigger('click')
    await wrapper.get('[data-testid="fm-crop-zoom-out"]').trigger('click')

    expect(stub(wrapper, 'cropper-image').$zoom).toHaveBeenNthCalledWith(1, 0.1, 0, 0)
    expect(stub(wrapper, 'cropper-image').$zoom).toHaveBeenNthCalledWith(2, -0.1, 0, 0)
    wrapper.unmount()
  })

  it('Reset puts the image back to fit and clears the selection', async () => {
    const wrapper = await setup()

    await wrapper.get('[data-testid="fm-crop-reset"]').trigger('click')

    expect(stub(wrapper, 'cropper-image').$resetTransform).toHaveBeenCalledTimes(1)
    expect(stub(wrapper, 'cropper-image').$center).toHaveBeenCalledWith('contain')
    expect(stub(wrapper, 'cropper-selection').$reset).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('Save exports the selection at its native width and saves it as the file', async () => {
    const wrapper = await setup()
    const saveFile = vi.spyOn(useFileManagerStore(), 'saveFile').mockResolvedValue(true)

    await wrapper.get('[data-testid="fm-crop-save"]').trigger('click')
    await flushPromises()

    // The selection is 100 px wide at the identity display scale, so the native width is 100.
    expect(stub(wrapper, 'cropper-selection').$toCanvas).toHaveBeenCalledWith({ width: 100 })
    expect(saveFile).toHaveBeenCalledTimes(1)
    const [name, blob] = saveFile.mock.calls[0]!
    expect(name).toBe('photo.png')
    expect(blob).toBeInstanceOf(Blob)
    expect(wrapper.emitted('saved')).toHaveLength(1)
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })

  it('shows an error and writes nothing when the canvas gives no blob', async () => {
    const wrapper = await setup()
    const saveFile = vi.spyOn(useFileManagerStore(), 'saveFile').mockResolvedValue(true)
    stub(wrapper, 'cropper-selection').$toCanvas.mockResolvedValueOnce({ toBlob: (callback: BlobCallback) => callback(null) })

    await wrapper.get('[data-testid="fm-crop-save"]').trigger('click')
    await flushPromises()

    expect(saveFile).not.toHaveBeenCalled()
    expect(useAlertsStore().activeAlerts.at(-1)).toMatchObject({ success: false, errorMessage: 'message.fileManager.error.saveImage' })
    expect(wrapper.emitted('saved')).toBeUndefined()
    wrapper.unmount()
  })

  it('writes once when Save is clicked twice', async () => {
    const wrapper = await setup()
    const saveFile = vi.spyOn(useFileManagerStore(), 'saveFile').mockResolvedValue(true)
    const save = wrapper.get('[data-testid="fm-crop-save"]').element as HTMLElement

    save.click()
    save.click()
    await flushPromises()

    expect(stub(wrapper, 'cropper-selection').$toCanvas).toHaveBeenCalledTimes(1)
    expect(saveFile).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('keeps the panel open when the write fails', async () => {
    const wrapper = await setup()
    vi.spyOn(useFileManagerStore(), 'saveFile').mockResolvedValue(false)

    await wrapper.get('[data-testid="fm-crop-save"]').trigger('click')
    await flushPromises()

    expect(wrapper.emitted('saved')).toBeUndefined()
    expect(wrapper.emitted('close')).toBeUndefined()
    wrapper.unmount()
  })

  it('Back closes the panel without writing', async () => {
    const wrapper = await setup()
    const saveFile = vi.spyOn(useFileManagerStore(), 'saveFile')

    await wrapper.get('[data-testid="fm-crop-back"]').trigger('click')

    expect(wrapper.emitted('close')).toHaveLength(1)
    expect(saveFile).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('refreshes the fields when the cropper reports a changed selection', async () => {
    const wrapper = await setup()
    stub(wrapper, 'cropper-selection').x = 60
    wrapper.element.querySelector('cropper-selection')?.dispatchEvent(new Event('change'))
    await flushPromises()

    expect(fieldInput(wrapper, 'x').value).toBe('60')
    wrapper.unmount()
  })
})
