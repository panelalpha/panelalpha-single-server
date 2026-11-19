import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { VSelect } from 'vuetify/components'
import { expectLegacyClasses } from '@/test/legacy-classes'
import { mountKit } from '@/test/mount-kit'
import ActiveServerAccountSelector from './ActiveServerAccountSelector.vue'

const items = [
  { id: 1, domain: 'one.example.com' },
  { id: 2, domain: 'two.example.com' },
]

describe('ActiveServerAccountSelector', () => {
  let host: HTMLDivElement | undefined

  afterEach(() => {
    host?.remove()
    host = undefined
    for (const node of document.body.querySelectorAll('.v-overlay-container')) {
      node.remove()
    }
  })

  it('renders the group, label and help icon', async () => {
    const wrapper = await mountKit(ActiveServerAccountSelector, { props: { items, modelValue: items[0] } })
    expectLegacyClasses(wrapper.get('div').element, ['acc-select-group'])
    const label = wrapper.get('.acc-select-label')
    expect(label.text()).toContain('heading.hosting.summary.hostingAccount')
    const icon = label.get('.v-icon')
    expect(icon.attributes('style')).toContain('16px')
    expect(icon.find('svg').exists()).toBe(true)
    wrapper.unmount()
  })

  it('shows the help tooltip on hover', async () => {
    // Open delay 150, bottom, custom tooltip.
    host = document.createElement('div')
    document.body.append(host)
    const wrapper = await mountKit(ActiveServerAccountSelector, { props: { items, modelValue: items[0] }, attachTo: host })
    await wrapper.get('.acc-select-label .v-icon').trigger('mouseenter')
    await new Promise(resolve => setTimeout(resolve, 250))
    await nextTick()
    const content = document.body.querySelector('.v-tooltip .v-overlay__content')
    expect(content?.textContent).toContain('tooltip.hosting.summary.hostingAccount.tooltip')
    expectLegacyClasses(content!.querySelector('p')!, ['p-3', 'mb-0'])
    wrapper.unmount()
  })

  it('renders an outlined dns-zone select with the selected domain', async () => {
    // Class dns-zone, outlined, hide-details, return-object.
    const wrapper = await mountKit(ActiveServerAccountSelector, { props: { items, modelValue: items[1] } })
    const select = wrapper.get('.v-select')
    expectLegacyClasses(select.element, ['dns-zone'])
    expect(select.find('.v-input__details').exists()).toBe(false)
    expectLegacyClasses(wrapper.get('.v-field').element, ['v-field--variant-outlined'])
    const selected = wrapper.get('.selected-item')
    expect(selected.text()).toBe('two.example.com')
    const vselect = wrapper.findComponent(VSelect)
    expect(vselect.props('itemTitle')).toBe('domain')
    expect(vselect.props('itemValue')).toBe('id')
    expect(vselect.props('returnObject')).toBe(true)
    expect(vselect.props('menuProps')).toEqual({ offset: 8, contentClass: 'acc-select-menu' })
    wrapper.unmount()
  })

  it('emits the selected account object through v-model', async () => {
    // `update:value` with the object.
    host = document.createElement('div')
    document.body.append(host)
    const wrapper = await mountKit(ActiveServerAccountSelector, {
      props: { items, modelValue: items[0] },
      attachTo: host,
    })
    await wrapper.get('.v-field').trigger('mousedown')
    await new Promise(resolve => setTimeout(resolve, 100))
    await nextTick()
    const options = document.body.querySelectorAll<HTMLElement>('.v-overlay__content .v-list-item')
    expect(options).toHaveLength(2)
    options[1]!.click()
    await nextTick()
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([items[1]])
    wrapper.unmount()
  })
})
