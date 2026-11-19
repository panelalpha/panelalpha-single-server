import { describe, expect, it } from 'vitest'
import { expectLegacyClasses } from '@/test/legacy-classes'
import { mountKit } from '@/test/mount-kit'
import LabelSimple from './LabelSimple.vue'

describe('LabelSimple', () => {
  it('renders the title with the legacy classes and the item colour', async () => {
    const wrapper = await mountKit(LabelSimple, {
      props: { item: { title: 'live', classColor: 'text-success', color: 'rgb(1, 2, 3)' }, small: true },
    })
    expectLegacyClasses(wrapper.element, ['label-simple', 'label-simple--small', 'text-success'])
    expect(wrapper.text()).toBe('live')
    expect((wrapper.element as HTMLElement).style.color).toBe('rgb(1, 2, 3)')
    expect(wrapper.find('.custom-dot').exists()).toBe(false)
    wrapper.unmount()
  })

  it('hides the title for a dot and shows the default slot as a custom dot', async () => {
    const wrapper = await mountKit(LabelSimple, {
      props: { item: { title: 'staging' }, dot: true },
      slots: { default: '<i class="slot-content" />' },
    })
    expectLegacyClasses(wrapper.element, ['label-simple--dot', 'label-simple--custom-dot'])
    expect(wrapper.text()).toBe('')
    expect(wrapper.find('.custom-dot .slot-content').exists()).toBe(true)
    wrapper.unmount()
  })
})
