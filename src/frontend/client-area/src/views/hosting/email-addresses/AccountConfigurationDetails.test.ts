import type { EmailAccountDetails } from './email-addresses.api'
import { flushPromises } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import AccountConfigurationDetails from './AccountConfigurationDetails.vue'

const details: EmailAccountDetails = {
  smtp_username: 'info@example.com',
  inbox_host: 'mail.example.com',
  imap_port: 993,
  imap_insecure_port: 143,
  pop3_port: 995,
  pop3_insecure_port: 110,
  smtp_host: 'mail.example.com',
  smtp_port: 465,
  smtp_insecure_port: 587,
}

async function mountDetails () {
  const wrapper = await mountKit(AccountConfigurationDetails, { props: { details } })
  await flushPromises()
  return wrapper
}

/** The `label: value` pairs of the open tab, as text (the tab that is leaving may still be in the DOM, so only the active window item counts). */
function pairs (wrapper: Awaited<ReturnType<typeof mountDetails>>): string[] {
  return wrapper.findAll('.v-window-item--active .details-list li').map(item => item.text().replace(/\s+/g, ' '))
}

describe('AccountConfigurationDetails', () => {
  it('shows the SSL settings on the first tab: seven label and value pairs, with the secure ports', async () => {
    const wrapper = await mountDetails()

    // The tab colour is the scoped rule, so the tabs take the primary colour as the slider only (no `text-primary` on a tab).
    expect(wrapper.findComponent({ name: 'VTabs' }).props('sliderColor')).toBe('primary')
    expect(wrapper.findAll('.v-tab').every(tab => !tab.classes().includes('text-primary'))).toBe(true)

    expect(pairs(wrapper)).toEqual([
      'heading.hosting.emailAddress.modal.show.username: info@example.com',
      'heading.hosting.emailAddress.modal.show.password.key: heading.hosting.emailAddress.modal.show.password.value',
      'heading.hosting.emailAddress.modal.show.incomingServer: mail.example.com',
      'heading.hosting.emailAddress.modal.show.imap: 993',
      'heading.hosting.emailAddress.modal.show.pop: 995',
      'heading.hosting.emailAddress.modal.show.smtpHost: mail.example.com',
      'heading.hosting.emailAddress.modal.show.smtpPort: 465',
    ])
    wrapper.unmount()
  })

  it('shows the non-SSL settings on the second tab, with the insecure ports', async () => {
    const wrapper = await mountDetails()

    const tabs = wrapper.findAll('.v-tab')
    expect(tabs).toHaveLength(2)
    await tabs[1]!.trigger('click')
    await flushPromises()

    expect(pairs(wrapper)).toEqual([
      'heading.hosting.emailAddress.modal.show.username: info@example.com',
      'heading.hosting.emailAddress.modal.show.password.key: heading.hosting.emailAddress.modal.show.password.value',
      'heading.hosting.emailAddress.modal.show.incomingServer: mail.example.com',
      'heading.hosting.emailAddress.modal.show.imap: 143',
      'heading.hosting.emailAddress.modal.show.pop: 110',
      'heading.hosting.emailAddress.modal.show.smtpHost: mail.example.com',
      'heading.hosting.emailAddress.modal.show.smtpPort: 587',
    ])
    wrapper.unmount()
  })

  it('emits modal-close from the close button', async () => {
    const wrapper = await mountDetails()

    await wrapper.find('.v-card-title .v-btn').trigger('click')

    expect(wrapper.emitted('modal-close')).toHaveLength(1)
    wrapper.unmount()
  })
})
