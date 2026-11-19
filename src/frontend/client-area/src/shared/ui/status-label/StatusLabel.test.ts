import { describe, expect, it } from 'vitest'
import { expectLegacyClasses } from '@/test/legacy-classes'
import { mountKit } from '@/test/mount-kit'
import { STATUS_LABEL_STATUSES } from './status-label'
import StatusLabel from './StatusLabel.vue'

describe('StatusLabel', () => {
  it('maps the status to its colour class, with one size for every chip', async () => {
    // Before the kit chip: V2 colour utilities and the `small` / `xsmall` sizes (`chipTable`, `v-chip--xs`).
    const wrapper = await mountKit(StatusLabel, {
      props: { value: 'Active', status: 'success', small: true, xsmall: true },
    })
    expectLegacyClasses(wrapper.element, ['v-chip', 'v-chip--label', 'status-label', 'status-label--success'])
    expect(wrapper.classes()).not.toContain('chipTable')
    expect(wrapper.classes()).not.toContain('v-chip--xs')
    expect(wrapper.text()).toContain('Active')
    wrapper.unmount()
  })

  it('maps gray and primary status classes', async () => {
    const gray = await mountKit(StatusLabel, { props: { value: 'G', status: 'gray' } })
    expectLegacyClasses(gray.element, ['status-label--gray'])
    gray.unmount()

    const primary = await mountKit(StatusLabel, { props: { value: 'P', status: 'primary' } })
    expectLegacyClasses(primary.element, ['status-label--primary'])
    primary.unmount()
  })

  it('has a colour class for every status and defaults to gray', async () => {
    for (const status of STATUS_LABEL_STATUSES) {
      const wrapper = await mountKit(StatusLabel, { props: { value: status, status } })
      expect(wrapper.classes()).toContain(`status-label--${status}`)
      wrapper.unmount()
    }
    const fallback = await mountKit(StatusLabel, { props: { value: 'X' } })
    expect(fallback.classes()).toContain('status-label--gray')
    fallback.unmount()
  })

  it('renders the prepend slot before the value', async () => {
    const wrapper = await mountKit(StatusLabel, {
      props: { value: 'Active', status: 'success' },
      slots: { prepend: '<i class="pre">*</i>' },
    })
    const text = wrapper.text()
    expect(wrapper.find('.pre').exists()).toBe(true)
    expect(text.indexOf('*')).toBeLessThan(text.indexOf('Active'))
    wrapper.unmount()
  })

  it('renders the icon before the text, and the default slot instead of the value', async () => {
    const wrapper = await mountKit(StatusLabel, {
      props: { value: 'ignored', status: 'sand', icon: '$suspended' },
      slots: { default: 'Suspended' },
    })
    expect(wrapper.find('.status-label__icon').exists()).toBe(true)
    expect(wrapper.get('.status-label__text').text()).toBe('Suspended')
    const html = wrapper.html()
    expect(html.indexOf('status-label__icon')).toBeLessThan(html.indexOf('status-label__text'))
    wrapper.unmount()
  })

  it('shows a number value and no text without a value', async () => {
    const count = await mountKit(StatusLabel, { props: { value: 3, status: 'error', icon: '$alertwarning' } })
    expect(count.get('.status-label__text').text()).toBe('3')
    count.unmount()

    const empty = await mountKit(StatusLabel, { props: { status: 'error', icon: '$alertwarning' } })
    expect(empty.find('.status-label__text').exists()).toBe(false)
    empty.unmount()
  })

  it('passes class, data-testid, tabindex and click to the chip root', async () => {
    let clicks = 0
    const wrapper = await mountKit(StatusLabel, {
      props: { value: 'Failed', status: 'error' },
      attrs: { 'class': 'task-status-label', 'data-testid': 'chip', 'tabindex': 0, 'onClick': () => {
        clicks++
      } },
    })
    expect(wrapper.attributes('data-testid')).toBe('chip')
    expect(wrapper.attributes('tabindex')).toBe('0')
    expect(wrapper.classes()).toContain('task-status-label')
    await wrapper.trigger('click')
    expect(clicks).toBe(1)
    wrapper.unmount()
  })
})
