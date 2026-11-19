import i18next from 'i18next'
import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { VMenu } from 'vuetify/components'
import { expectLegacyClasses } from '@/test/legacy-classes'
import { mountKit } from '@/test/mount-kit'
import PendingSslIndicator from './PendingSslIndicator.vue'

const domain = (status: string) => ({ domain: 'a.com', ssl_order_status: status })

describe('PendingSslIndicator', () => {
  let host: HTMLDivElement | undefined

  afterEach(() => {
    host?.remove()
    host = undefined
    // Back to the empty bundle mountKit starts with (t(key) === key).
    i18next.removeResourceBundle('en', 'translation')
    i18next.addResourceBundle('en', 'translation', {})
    for (const node of document.body.querySelectorAll('.v-overlay-container')) {
      node.remove()
    }
  })

  it('defaults to the compact appearance', async () => {
    const wrapper = await mountKit(PendingSslIndicator, { props: { domain: domain('pending') } })
    expect(wrapper.findComponent(VMenu).exists()).toBe(false)
    expectLegacyClasses(wrapper.get('span > span').element, ['d-flex', 'align-center', 'p-5', 'font-weight-600', 'line-16'])
    wrapper.unmount()
  })

  describe('legacy appearance', () => {
    it('renders the warning row with a progress button for a pending order', async () => {
      const wrapper = await mountKit(PendingSslIndicator, { props: { domain: domain('pending'), appearance: 'legacy' } })
      expectLegacyClasses(wrapper.get('span > span').element, ['d-flex', 'align-center', 'text-warning'])
      expect(wrapper.get('span > span').text()).toContain('message.status.inProgress')
      const button = wrapper.get('button')
      expectLegacyClasses(button.element, ['v-btn--icon', 'v-btn--size-x-small', 'text-warning'])
      expect(button.find('.v-progress-circular').attributes('style')).toContain('20px')
      wrapper.unmount()
    })

    it('renders the error row with the warning icon for a failed order', async () => {
      const wrapper = await mountKit(PendingSslIndicator, { props: { domain: domain('failed'), appearance: 'legacy' } })
      expectLegacyClasses(wrapper.get('span > span').element, ['d-flex', 'align-center', 'text-error'])
      expect(wrapper.text()).toContain('message.status.failed')
      expectLegacyClasses(wrapper.get('button').element, ['text-error'])
      expectLegacyClasses(wrapper.get('button .v-icon').element, ['text-error'])
      wrapper.unmount()
    })

    it('labels an awaiting order with the DNS propagation text', async () => {
      const wrapper = await mountKit(PendingSslIndicator, { props: { domain: domain('awaiting_dns_propagation'), appearance: 'legacy' } })
      expect(wrapper.text()).toContain('message.status.dns.awaitingDnsPropagation')
      wrapper.unmount()
    })

    it('opens the 785px hover menu with the tooltip content', async () => {
      // v-tooltip content class, open-delay 150, 785px
      host = document.createElement('div')
      document.body.append(host)
      const wrapper = await mountKit(PendingSslIndicator, {
        props: { domain: domain('awaiting_dns_propagation'), appearance: 'legacy' },
        attachTo: host,
      })
      const menu = wrapper.findComponent(VMenu)
      expect(menu.props('minWidth')).toBe(785)
      expect(menu.props('maxWidth')).toBe(785)
      expect(menu.props('openDelay')).toBe(150)
      expect(menu.props('closeOnContentClick')).toBe(false)
      expect(menu.props('offset')).toEqual([-24, 350])
      await wrapper.get('button').trigger('mouseenter')
      await new Promise(resolve => setTimeout(resolve, 250))
      await nextTick()
      const content = document.body.querySelector<HTMLElement>('.v-overlay__content')
      expectLegacyClasses(content!, ['v-tooltip'])
      expectLegacyClasses(content!.querySelector('div')!, ['px-6', 'py-6'])
      expect(content!.textContent).toContain('tooltip.hosting.dns.status.awaiting')
      wrapper.unmount()
    })

    it('mirrors the horizontal offset when the locale switches to RTL', async () => {
      // `$vuetify.rtl ? '-350px' : '350px'`
      const wrapper = await mountKit(PendingSslIndicator, { props: { domain: domain('pending'), appearance: 'legacy' } })
      expect(wrapper.findComponent(VMenu).props('offset')).toEqual([-24, 350])
      // Same switch as app/i18n.ts setDirection: flag the current Vuetify locale as RTL.
      const locale = (wrapper.vm as unknown as {
        $vuetify: { locale: { current: string, rtl: Record<string, boolean> } }
      }).$vuetify.locale
      locale.rtl[locale.current] = true
      await nextTick()
      expect(wrapper.findComponent(VMenu).props('offset')).toEqual([-24, -350])
      wrapper.unmount()
    })
  })

  describe('compact appearance', () => {
    it('renders the bold pending row with a 16px progress spinner', async () => {
      const wrapper = await mountKit(PendingSslIndicator, { props: { domain: domain('awaiting_dns_propagation'), appearance: 'compact' } })
      const row = wrapper.get('span > span')
      expectLegacyClasses(row.element, ['d-flex', 'align-center', 'p-5', 'font-weight-600', 'line-16'])
      const label = row.get('span')
      expectLegacyClasses(label.element, ['heading--text', 'p-3', 'ml-0', 'line-16'])
      // awaiting reads "in progress" in the compact appearance
      expect(label.text()).toBe('message.status.inProgress')
      const spinner = row.get('.v-progress-circular')
      expectLegacyClasses(spinner.element, ['ml-2', 'text-primary'])
      expect(spinner.attributes('style')).toContain('16px')
      wrapper.unmount()
    })

    it('renders the failed row with the error icon', async () => {
      const wrapper = await mountKit(PendingSslIndicator, { props: { domain: domain('failed') } })
      const row = wrapper.get('span > span')
      expectLegacyClasses(row.element, ['d-flex', 'align-center', 'text-error', 'font-weight-bold'])
      expectLegacyClasses(row.get('span').element, ['p-3', 'ml-0', 'line-16'])
      const icon = row.get('.v-icon')
      expectLegacyClasses(icon.element, ['ml-2', 'text-error'])
      expect(icon.attributes('style')).toContain('16px')
      wrapper.unmount()
    })

    it('shows the single-line tooltip with the domain on hover', async () => {
      // open-delay 150, max-width 370, {domain} replaced
      host = document.createElement('div')
      document.body.append(host)
      const wrapper = await mountKit(PendingSslIndicator, { props: { domain: domain('failed') }, attachTo: host })
      i18next.addResource('en', 'translation', 'tooltip.hosting.dns.status.failed', 'Failed for {domain} now')
      await wrapper.get('.v-icon').trigger('mouseenter')
      await new Promise(resolve => setTimeout(resolve, 250))
      await nextTick()
      expect(document.body.querySelector('.v-tooltip .v-overlay__content')?.textContent?.trim()).toBe('Failed for a.com now')
      wrapper.unmount()
    })
  })
})
