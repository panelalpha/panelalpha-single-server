import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { VTooltip } from 'vuetify/components'
import { expectLegacyClasses } from '@/test/legacy-classes'
import { mountKit } from '@/test/mount-kit'
import SslIndicator from './SslIndicator.vue'

const ok = { certificate_installed: true, certificate: { self_signed: false, name_match: true, issuer_name: 'Let\'s Encrypt' } }
const selfSigned = { certificate_installed: true, certificate: { self_signed: true, name_match: true, issuer_name: 'x' } }
const none = { certificate_installed: false, certificate: null }

describe('SslIndicator', () => {
  let host: HTMLDivElement | undefined

  afterEach(() => {
    host?.remove()
    host = undefined
    for (const node of document.body.querySelectorAll('.v-overlay-container')) {
      node.remove()
    }
  })

  it('renders the root and a 16px loader while fetching', async () => {
    const wrapper = await mountKit(SslIndicator, { props: { fetching: true, ssl: ok } })
    expectLegacyClasses(wrapper.get('div').element, ['ssl-indicator', 'd-flex', 'align-start'])
    const loader = wrapper.get('.loader')
    expect(loader.find('.my-4').exists()).toBe(false)
    expect(loader.get('.v-progress-circular').attributes('style')).toContain('16px')
    expect(wrapper.find('.v-icon').exists()).toBe(false)
    wrapper.unmount()
  })

  it('paints the icon mode green, red and unlocked', async () => {
    const good = await mountKit(SslIndicator, { props: { ssl: ok } })
    expectLegacyClasses(good.get('.v-icon').element, ['text-success'])
    expect(good.get('.v-icon').attributes('style')).toContain('16px')
    good.unmount()
    const self = await mountKit(SslIndicator, { props: { ssl: selfSigned, small: true } })
    expectLegacyClasses(self.get('.v-icon').element, ['text-error'])
    expect(self.get('.v-icon').attributes('style')).toContain('12px')
    self.unmount()
    const off = await mountKit(SslIndicator, { props: { ssl: none } })
    expectLegacyClasses(off.get('.v-icon').element, ['text-error'])
    off.unmount()
  })

  it('renders the text next to the icon with textClass', async () => {
    const wrapper = await mountKit(SslIndicator, { props: { ssl: ok, text: 'example.com', textClass: 'my-text' } })
    const span = wrapper.get('span.my-text')
    expect(span.text()).toBe('example.com')
    wrapper.unmount()
  })

  it('shows the secured tooltip on hover', async () => {
    // open-delay 150, nudge-bottom 12px, custom-tooltip
    host = document.createElement('div')
    document.body.append(host)
    const wrapper = await mountKit(SslIndicator, { props: { ssl: ok }, attachTo: host })
    expect(wrapper.findComponent(VTooltip).props('offset')).toBe(12)
    await wrapper.get('.v-icon').trigger('mouseenter')
    await new Promise(resolve => setTimeout(resolve, 250))
    await nextTick()
    expect(document.body.querySelector('.v-tooltip .v-overlay__content')?.textContent).toContain('tooltip.dnsIndicator.secure')
    wrapper.unmount()
  })

  it('renders the text mode with the issuer name', async () => {
    const wrapper = await mountKit(SslIndicator, { props: { ssl: ok, isIcon: false } })
    const row = wrapper.get('span.d-flex')
    expectLegacyClasses(row.element, ['p-5', 'font-weight-600', 'line-16', 'd-flex', 'align-center'])
    expectLegacyClasses(wrapper.get('.v-icon').element, ['text-success'])
    const label = row.get('span.heading--text')
    expectLegacyClasses(label.element, ['p-3', 'ml-2', 'line-16'])
    expect(label.text()).toBe('Let\'s Encrypt')
    wrapper.unmount()
  })

  it('renders the self-signed and disabled text modes', async () => {
    const self = await mountKit(SslIndicator, { props: { ssl: selfSigned, isIcon: false } })
    expect(self.get('span.heading--text').text()).toBe('general.sslProvider.selfSigned')
    expectLegacyClasses(self.get('.v-icon').element, ['text-error'])
    self.unmount()
    const off = await mountKit(SslIndicator, { props: { ssl: none, isIcon: false } })
    expectLegacyClasses(off.get('span.d-flex').element, ['text-error', 'font-weight-bold', 'd-flex', 'align-center'])
    expect(off.text()).toBe('message.status.disabled')
    off.unmount()
  })

  it('paints the icon mode warning when the domain points elsewhere', async () => {
    const ssl = { certificate_installed: true, certificate: { status: 'trusted', self_signed: false, name_match: true, issuer_name: 'Let\'s Encrypt', points_here: false } }
    const wrapper = await mountKit(SslIndicator, { props: { ssl } })
    expectLegacyClasses(wrapper.get('.v-icon').element, ['text-warning'])
    wrapper.unmount()
  })

  it('renders Wrong DNS in text mode and no issuer name when the domain points elsewhere', async () => {
    const ssl = { certificate_installed: true, certificate: { status: 'trusted', self_signed: false, name_match: true, issuer_name: 'Let\'s Encrypt', points_here: false } }
    const wrapper = await mountKit(SslIndicator, { props: { ssl, isIcon: false } })
    expect(wrapper.get('span.heading--text').text()).toBe('message.status.wrongDns')
    expect(wrapper.text()).not.toContain('Let\'s Encrypt')
    expectLegacyClasses(wrapper.get('.v-icon').element, ['text-warning'])
    wrapper.unmount()
  })
})
