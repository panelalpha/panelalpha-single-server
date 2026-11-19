import { describe, expect, it } from 'vitest'
import { expectLegacyClasses } from '@/test/legacy-classes'
import { mountKit } from '@/test/mount-kit'
import LabelChip from './LabelChip.vue'

describe('LabelChip', () => {
  it('renders legacy classes and emits toggle-filter / unassign-label', async () => {
    const item = { title: 'Bug', color: 'error' }
    const wrapper = await mountKit(LabelChip, {
      props: { item, small: true, removable: true, clickable: true },
    })
    // V2 `mb-0` and `pr-0` (utilities with `!important`) became `label-chip` rules and `label-chip--removable`; the computed style is unchanged.
    expectLegacyClasses(wrapper.element, ['text-white', 'p-4', 'label-chip', 'label-chip--small', 'label-chip--removable'])
    await wrapper.trigger('click')
    expect(wrapper.emitted('toggle-filter')?.[0]).toEqual([{ title: 'Bug', color: 'error' }])
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('unassign-label')?.[0]).toEqual([item])
    wrapper.unmount()
  })
})
