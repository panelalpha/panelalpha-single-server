import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/shared/session/session.store'
import { expectLegacyClasses } from '@/test/legacy-classes'
import { mountKit } from '@/test/mount-kit'
import UploadArchiveWidget from './UploadArchiveWidget.vue'

function dropOn (wrapper: Awaited<ReturnType<typeof mountKit>>, file: File) {
  return wrapper.get('.drop-zone').trigger('drop', { dataTransfer: { files: [file] } })
}

describe('UploadArchiveWidget', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders the empty drop zone', async () => {
    const wrapper = await mountKit(UploadArchiveWidget)
    const input = wrapper.get('input[type=file]')
    expect(input.attributes('accept')).toBe('.zip,.tar.gz')
    expectLegacyClasses(input.element, ['d-none'])
    expect(wrapper.get('.drop-zone').classes()).toEqual(['drop-zone'])
    expectLegacyClasses(wrapper.get('.drop-zone__title').element, ['p-2', 'font-weight-medium', 'mb-1'])
    expect(wrapper.get('.drop-zone__title').text()).toBe('heading.instance.statusIndicator.dropZone.title')
    expect(wrapper.text()).toContain('heading.instance.statusIndicator.dropZone.hint')
    wrapper.unmount()
  })

  it('marks the zone active while dragging over', async () => {
    const wrapper = await mountKit(UploadArchiveWidget)
    await wrapper.get('.drop-zone').trigger('dragenter')
    expectLegacyClasses(wrapper.get('.drop-zone').element, ['drop-zone', 'drop-zone--active'])
    await wrapper.get('.drop-zone').trigger('dragleave')
    expect(wrapper.get('.drop-zone').classes()).not.toContain('drop-zone--active')
    wrapper.unmount()
  })

  it('accepts a .zip and a .tar.gz and renders the filled zone', async () => {
    const wrapper = await mountKit(UploadArchiveWidget)
    const zip = new File(['x'], 'site.ZIP')
    await dropOn(wrapper, zip)
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([zip])
    expect(wrapper.emitted('complete')?.[0]).toEqual([true])
    await wrapper.setProps({ modelValue: zip })
    expectLegacyClasses(wrapper.get('.drop-zone').element, ['drop-zone', 'drop-zone--filled'])
    expectLegacyClasses(wrapper.get('.drop-zone__file').element, ['d-flex', 'align-center'])
    expect(wrapper.get('.drop-zone__file span').text()).toBe('site.ZIP')
    const tar = new File(['x'], 'site.tar.gz')
    await dropOn(wrapper, tar)
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([tar])
    wrapper.unmount()
  })

  it('clears the file', async () => {
    const wrapper = await mountKit(UploadArchiveWidget, { props: { modelValue: new File(['x'], 'a.zip') } })
    await wrapper.get('.drop-zone__file button').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([null])
    expect(wrapper.emitted('complete')?.at(-1)).toEqual([false])
    wrapper.unmount()
  })

  it('emits error(key) for an invalid type instead of addAlert', async () => {
    const wrapper = await mountKit(UploadArchiveWidget)
    await dropOn(wrapper, new File(['x'], 'notes.txt'))
    expect(wrapper.emitted('error')?.[0]).toEqual(['heading.instance.siteDetails.uploadVersion.invalidType'])
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    wrapper.unmount()
  })

  it('emits error(key) for a file over the panel upload limit and takes one at it', async () => {
    useSessionStore().home = { app: { upload_max_bytes: 5_242_880 } } as never
    const wrapper = await mountKit(UploadArchiveWidget)
    const big = new File(['x'], 'big.zip')
    Object.defineProperty(big, 'size', { value: 5_242_881 })
    await dropOn(wrapper, big)
    expect(wrapper.emitted('error')?.[0]).toEqual(['heading.instance.statusIndicator.dropZone.tooLarge'])
    const exact = new File(['x'], 'exact.zip')
    Object.defineProperty(exact, 'size', { value: 5_242_880 })
    await dropOn(wrapper, exact)
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([exact])
    wrapper.unmount()
  })

  it('takes a picked archive and clears the native input', async () => {
    // Behaviour on master: the picker goes through the same rules, then the input is emptied.
    const wrapper = await mountKit(UploadArchiveWidget)
    const input = wrapper.get('input[type=file]').element as HTMLInputElement
    const zip = new File(['x'], 'site.zip')
    const setValue = vi.fn()
    Object.defineProperty(input, 'files', { value: [zip], configurable: true })
    Object.defineProperty(input, 'value', { configurable: true, get: () => '', set: setValue })
    await wrapper.get('input[type=file]').trigger('change')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([zip])
    expect(wrapper.emitted('complete')?.[0]).toEqual([true])
    expect(setValue).toHaveBeenCalledWith('')
    wrapper.unmount()
  })

  it('opens the picker on a click of the zone, not of the file row', async () => {
    const wrapper = await mountKit(UploadArchiveWidget)
    const input = wrapper.get('input[type=file]').element as HTMLInputElement
    const click = vi.spyOn(input, 'click').mockReturnValue(undefined)
    await wrapper.get('.drop-zone').trigger('click')
    expect(click).toHaveBeenCalledTimes(1)
    await wrapper.setProps({ modelValue: new File(['x'], 'a.zip') })
    await wrapper.get('.drop-zone__file').trigger('click')
    expect(click).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('keeps the highlight while the pointer crosses child nodes and clears it on drop', async () => {
    const wrapper = await mountKit(UploadArchiveWidget)
    const zone = wrapper.get('.drop-zone')
    await zone.trigger('dragenter')
    await zone.trigger('dragenter')
    await zone.trigger('dragleave')
    expect(zone.classes()).toContain('drop-zone--active')
    await zone.trigger('dragover')
    await zone.trigger('drop', { dataTransfer: { files: [] } })
    expect(zone.classes()).not.toContain('drop-zone--active')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    wrapper.unmount()
  })
})
