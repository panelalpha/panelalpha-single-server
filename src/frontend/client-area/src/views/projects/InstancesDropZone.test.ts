import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { useSessionStore } from '@/shared/session/session.store'
import { mountKit } from '@/test/mount-kit'
import InstancesDropZone from './InstancesDropZone.vue'

function dropEvent (type: string, files: File[], types: string[] = ['Files']) {
  const event = new Event(type, { bubbles: true, cancelable: true }) as Event & { dataTransfer?: unknown }
  event.dataTransfer = { types, files, items: [] }
  return event
}

async function mountZone (props: Record<string, unknown> = {}) {
  return mountKit(InstancesDropZone, { props, slots: { default: '<p class="slot-content">list</p>' } })
}

describe('InstancesDropZone', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders only its content when disabled (multi server)', async () => {
    const wrapper = await mountZone({ disabled: true })
    expect(wrapper.find('.instances-drop-zone').exists()).toBe(false)
    expect(wrapper.find('.slot-content').exists()).toBe(true)
    wrapper.unmount()
  })

  it('shows the overlay while files are dragged over, and hides it on leave', async () => {
    const wrapper = await mountZone()
    expect(wrapper.find('.instances-drop-overlay').exists()).toBe(false)
    wrapper.element.dispatchEvent(dropEvent('dragenter', []))
    await nextTick()
    expect(wrapper.get('[data-testid="instances-drop-overlay-title"]').text()).toBe('heading.instance.dropOverlay.title')
    wrapper.element.dispatchEvent(dropEvent('dragleave', []))
    await nextTick()
    expect(wrapper.find('.instances-drop-overlay').exists()).toBe(false)
    wrapper.unmount()
  })

  it('ignores a drag that carries no files (text, links)', async () => {
    const wrapper = await mountZone()
    wrapper.element.dispatchEvent(dropEvent('dragenter', [], ['text/plain']))
    await nextTick()
    expect(wrapper.find('.instances-drop-overlay').exists()).toBe(false)
    wrapper.unmount()
  })

  it('hides the overlay on Escape', async () => {
    const wrapper = await mountZone()
    wrapper.element.dispatchEvent(dropEvent('dragover', []))
    await nextTick()
    expect(wrapper.find('.instances-drop-overlay').exists()).toBe(true)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    expect(wrapper.find('.instances-drop-overlay').exists()).toBe(false)
    wrapper.unmount()
  })

  it('emits valid-drop with the files of a valid drop', async () => {
    const wrapper = await mountZone()
    const zip = new File(['x'], 'site.zip')
    wrapper.element.dispatchEvent(dropEvent('drop', [zip]))
    await vi.waitFor(() => expect(wrapper.emitted('valid-drop')).toHaveLength(1))
    expect(wrapper.emitted('valid-drop')![0]).toEqual([{ uploadItems: [zip] }])
    expect(wrapper.emitted('invalid-drop')).toBeUndefined()
    wrapper.unmount()
  })

  it('refuses an archive over the panel upload limit with the limit in the message', async () => {
    useSessionStore().home = { app: { upload_max_bytes: 5_242_880 } } as never
    const wrapper = await mountZone()
    const big = new File(['x'], 'big.zip')
    Object.defineProperty(big, 'size', { value: 5_242_881 })
    wrapper.element.dispatchEvent(dropEvent('drop', [big]))
    await vi.waitFor(() => expect(wrapper.emitted('invalid-drop')).toHaveLength(1))
    expect(wrapper.emitted('invalid-drop')![0]).toEqual([
      'heading.onboarding.zipDeploy.file.tooLarge',
      { size: '5 MB' },
    ])
    expect(wrapper.emitted('valid-drop')).toBeUndefined()
    wrapper.unmount()
  })

  it('emits invalid-drop with the legacy key for a disallowed type, too many items and an empty drop', async () => {
    const wrapper = await mountZone()
    wrapper.element.dispatchEvent(dropEvent('drop', [new File(['x'], 'notes.txt')]))
    await vi.waitFor(() => expect(wrapper.emitted('invalid-drop')).toHaveLength(1))
    expect(wrapper.emitted('invalid-drop')![0]).toEqual(['heading.onboarding.zipDeploy.file.invalidType'])

    wrapper.element.dispatchEvent(dropEvent('drop', Array.from({ length: 6 }, (_, i) => new File(['x'], `f${i}.zip`))))
    await vi.waitFor(() => expect(wrapper.emitted('invalid-drop')).toHaveLength(2))
    expect(wrapper.emitted('invalid-drop')![1]).toEqual(['heading.onboarding.zipDeploy.file.maxSelections'])

    wrapper.element.dispatchEvent(dropEvent('drop', []))
    await vi.waitFor(() => expect(wrapper.emitted('invalid-drop')).toHaveLength(3))
    expect(wrapper.emitted('invalid-drop')![2]).toEqual(['heading.onboarding.zipDeploy.file.empty'])
    wrapper.unmount()
  })
})
