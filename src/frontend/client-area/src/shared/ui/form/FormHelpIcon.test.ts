import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { expectLegacyClasses } from '@/test/legacy-classes'
import { mountKit } from '@/test/mount-kit'
import FormHelpIcon from './FormHelpIcon.vue'

describe('FormHelpIcon', () => {
  let host: HTMLDivElement | undefined

  afterEach(() => {
    host?.remove()
    host = undefined
    for (const node of document.body.querySelectorAll('.v-overlay-container')) {
      node.remove()
    }
  })

  it('renders the 16px help icon with the default gray class', async () => {
    // V2 `gray--text text--darken-1` becomes `text-gray-darken-1`
    const wrapper = await mountKit(FormHelpIcon, { props: { text: 'Help' } })
    const icon = wrapper.get('.v-icon')
    expectLegacyClasses(icon.element, ['text-gray-darken-1'])
    expect(icon.attributes('style')).toContain('16px')
    expect(icon.find('svg').exists()).toBe(true)
    wrapper.unmount()
  })

  it('uses the color prop as the icon class', async () => {
    const wrapper = await mountKit(FormHelpIcon, { props: { text: 'Help', color: 'text-error' } })
    expectLegacyClasses(wrapper.get('.v-icon').element, ['text-error'])
    wrapper.unmount()
  })

  it('shows the text in a custom-tooltip overlay on hover', async () => {
    // Tooltip props: open-delay 150, bottom, custom-tooltip
    host = document.createElement('div')
    document.body.append(host)
    const wrapper = await mountKit(FormHelpIcon, { props: { text: 'Help text' }, attachTo: host })
    await wrapper.get('.v-icon').trigger('mouseenter')
    await new Promise(resolve => setTimeout(resolve, 250))
    await nextTick()
    const content = document.body.querySelector('.v-tooltip .v-overlay__content')
    expect(content?.textContent).toContain('Help text')
    expectLegacyClasses(content!.querySelector('p')!, ['p-3', 'mb-0'])
    wrapper.unmount()
  })

  it('never opens when text is empty', async () => {
    host = document.createElement('div')
    document.body.append(host)
    const wrapper = await mountKit(FormHelpIcon, { attachTo: host })
    await wrapper.get('.v-icon').trigger('mouseenter')
    await new Promise(resolve => setTimeout(resolve, 250))
    expect(document.body.querySelector('.v-tooltip.v-overlay--active')).toBeNull()
    wrapper.unmount()
  })
})
