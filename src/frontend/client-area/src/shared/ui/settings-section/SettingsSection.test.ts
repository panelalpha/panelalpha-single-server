import { describe, expect, it } from 'vitest'
import { expectLegacyClasses } from '@/test/legacy-classes'
import { mountKit } from '@/test/mount-kit'
import SettingsSection from './SettingsSection.vue'

describe('SettingsSection', () => {
  it('renders the title column, the slot column and a divider by default', async () => {
    // Working copy of the app-lite section
    const wrapper = await mountKit(SettingsSection, {
      props: { title: 'General' },
      slots: { default: '<span class="slot-content">Body</span>' },
    })
    expectLegacyClasses(wrapper.element, ['settings-section'])
    expectLegacyClasses(wrapper.get('p').element, ['p-1', 'mb-0', 'font-weight-600', 'heading--text'])
    expect(wrapper.get('p').text()).toBe('General')
    expect(wrapper.get('.slot-content').text()).toBe('Body')
    const cols = wrapper.findAll('.v-col')
    expectLegacyClasses(cols[0].element, ['pa-4'])
    expectLegacyClasses(cols[1].element, ['pt-0', 'pt-md-6', 'pb-6'])
    expectLegacyClasses(wrapper.get('.v-divider').element, ['settings-section__divider', 'mx-n6'])
    wrapper.unmount()
  })

  it('omits the divider when divider is false', async () => {
    const wrapper = await mountKit(SettingsSection, { props: { title: 'General', divider: false } })
    expect(wrapper.find('.v-divider').exists()).toBe(false)
    wrapper.unmount()
  })
})
