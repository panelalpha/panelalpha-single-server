import type { InstanceResource } from '@/entities/project/instance-resource'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { useInstanceStore } from '@/views/projects/project/instance.store'
import { on, resetAppEvents } from '@/shared/events/app-events'
import { mountKit } from '@/test/mount-kit'
import TopBarEditableTitle from './TopBarEditableTitle.vue'

const titleUpdate = vi.fn()

function fakeInstance (): InstanceResource {
  return {
    id: 1,
    title: 'Blog',
    hasUpdateSiteNamePrivilege: () => true,
  } as unknown as InstanceResource
}

/** Mounts the title with the store of the same Pinia, so the test can drive the shared flag. */
async function mountTitle () {
  const pinia = createPinia()
  setActivePinia(pinia)
  const frame = useInstanceStore()
  const wrapper = await mountKit(TopBarEditableTitle, {
    props: { instance: fakeInstance() },
    global: { plugins: [pinia] },
  })
  return { wrapper, frame }
}

/** Flips the shared flag the way a real save does: on at the start, off after the answer. */
async function settleSave (frame: ReturnType<typeof useInstanceStore>, result: boolean) {
  frame.savingName = true
  await nextTick()
  frame.savingName = false
  await flushPromises()
  return result
}

describe('TopBarEditableTitle', () => {
  beforeEach(() => {
    resetAppEvents()
    titleUpdate.mockClear()
    on('document-title-update', titleUpdate)
  })

  it('saves through the store and closes the editor after success', async () => {
    const { wrapper, frame } = await mountTitle()
    vi.spyOn(frame, 'updateSiteName').mockImplementation(async () => settleSave(frame, true))

    await wrapper.get('[data-testid="instance-title-edit"]').trigger('click')
    await wrapper.get('[data-testid="instance-title-save"]').trigger('click')
    await flushPromises()

    expect(frame.updateSiteName).toHaveBeenCalledWith('Blog')
    expect(wrapper.find('[data-testid="instance-title-input"]').exists()).toBe(false)
    expect(titleUpdate).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('closes an open editor when a save from the Site details card ends', async () => {
    const { wrapper, frame } = await mountTitle()

    await wrapper.get('[data-testid="instance-title-edit"]').trigger('click')
    expect(wrapper.find('[data-testid="instance-title-input"]').exists()).toBe(true)

    await settleSave(frame, true)

    expect(wrapper.find('[data-testid="instance-title-input"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('closes the editor after a failed save and leaves the document title alone', async () => {
    const { wrapper, frame } = await mountTitle()
    vi.spyOn(frame, 'updateSiteName').mockImplementation(async () => settleSave(frame, false))

    await wrapper.get('[data-testid="instance-title-edit"]').trigger('click')
    await wrapper.get('[data-testid="instance-title-save"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="instance-title-input"]').exists()).toBe(false)
    expect(titleUpdate).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
