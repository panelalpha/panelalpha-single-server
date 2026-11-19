import i18next from 'i18next'
import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { expectLegacyClasses } from '@/test/legacy-classes'
import { mountKit } from '@/test/mount-kit'
import PendingSslTooltip from './PendingSslTooltip.vue'

describe('PendingSslTooltip', () => {
  afterEach(() => {
    // Back to the empty bundle mountKit starts with (t(key) === key).
    i18next.removeResourceBundle('en', 'translation')
    i18next.addResourceBundle('en', 'translation', {})
  })

  it('renders the failed alert without a list', async () => {
    const wrapper = await mountKit(PendingSslTooltip, { props: { domain: { domain: 'a.com', ssl_order_status: 'failed' } } })
    expectLegacyClasses(wrapper.get('div').element, ['px-6', 'py-6'])
    expectLegacyClasses(wrapper.get('.app-message').element, ['app-message', 'app-message--error'])
    expectLegacyClasses(wrapper.get('.app-message__icon').element, ['text-error'])
    expect(wrapper.find('.app-message__text > span').exists()).toBe(true)
    expect(wrapper.text()).toContain('tooltip.hosting.dns.status.failed')
    expect(wrapper.find('ul').exists()).toBe(false)
    wrapper.unmount()
  })

  it('renders the awaiting alert and the list with a bold second item (app-lite)', async () => {
    const wrapper = await mountKit(PendingSslTooltip, { props: { domain: { domain: 'a.com', ssl_order_status: 'awaiting_dns_propagation' } } })
    const alert = wrapper.get('.app-message')
    expectLegacyClasses(alert.element, ['app-message', 'app-message--warning'])
    expect(alert.classes()).not.toContain('mb-0')
    expectLegacyClasses(alert.get('.v-icon').element, ['text-warning'])
    expect(wrapper.text()).toContain('tooltip.hosting.dns.status.awaiting')
    const items = wrapper.findAll('ul.mt-4 li.p-3')
    expect(items).toHaveLength(3)
    expect(items.map(item => item.find('b').exists())).toEqual([false, true, false])
    expect(items[1]!.text()).toBe('tooltip.hosting.dns.status.pending.list.second')
    wrapper.unmount()
  })

  it('renders the pending alert and the list with a bold second item (app-lite)', async () => {
    for (const status of ['pending', 'in_progress']) {
      const wrapper = await mountKit(PendingSslTooltip, { props: { domain: { domain: 'a.com', ssl_order_status: status } } })
      expect(wrapper.text()).toContain('tooltip.hosting.dns.status.pending.alert')
      const items = wrapper.findAll('ul li')
      expect(items).toHaveLength(3)
      expect(items.map(item => item.find('b').exists())).toEqual([false, true, false])
      wrapper.unmount()
    }
  })

  it('puts the domain into the i18next slot in <b>', async () => {
    const wrapper = await mountKit(PendingSslTooltip, { props: { domain: { domain: 'a.com', ssl_order_status: 'failed' } } })
    i18next.addResource('en', 'translation', 'tooltip.hosting.dns.status.failed', 'Failed for {domain} now')
    await nextTick()
    await nextTick()
    expect(wrapper.get('.app-message__text > span').text()).toBe('Failed for a.com now')
    expect(wrapper.get('.app-message b').text()).toBe('a.com')
    wrapper.unmount()
  })
})
