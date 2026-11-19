import type { DomainRecordsState, EmailDomainOption } from './hosting.types'
import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { VSelect } from 'vuetify/components'
import { mountKit } from '@/test/mount-kit'
import EmailDomainSelector from './EmailDomainSelector.vue'

const domains: EmailDomainOption[] = [
  { id: 1, domain: 'example.com' },
  { id: 2, domain: 'shop.example.com' },
]

const configured: DomainRecordsState = {
  spf: { configured: true, loading: false },
  dkim: { configured: true, loading: false },
}

const failed: DomainRecordsState = {
  spf: { configured: false, loading: false },
  dkim: { configured: true, loading: false },
}

const loading: DomainRecordsState = {
  spf: { configured: false, loading: true },
  dkim: { configured: false, loading: true },
}

describe('EmailDomainSelector', () => {
  let host: HTMLDivElement | undefined

  afterEach(() => {
    host?.remove()
    host = undefined
    for (const node of document.body.querySelectorAll('.v-overlay-container')) {
      node.remove()
    }
  })

  it('renders the group, the label with its help icon, and an outlined dns-zone select', async () => {
    const wrapper = await mountKit(EmailDomainSelector, { props: { domains, modelValue: domains[0] } })
    expect(wrapper.get('.acc-select-group').classes()).toContain('acc-select-group')
    expect(wrapper.get('.acc-select-label').text()).toContain('heading.hosting.emailAddress.emailDomain')
    expect(wrapper.get('.acc-select-label .v-icon').attributes('style')).toContain('16px')
    expect(wrapper.get('.v-select').classes()).toContain('dns-zone')
    expect(wrapper.get('.v-field').classes()).toContain('v-field--variant-outlined')
    expect(wrapper.find('.v-input__details').exists()).toBe(false)
    wrapper.unmount()
  })

  it('passes the screen attributes (such as data-testid) to the select', async () => {
    const wrapper = await mountKit(EmailDomainSelector, {
      props: { domains, modelValue: domains[0] },
      attrs: { 'data-testid': 'email-addresses-domain' },
    })
    expect(wrapper.findComponent(VSelect).attributes('data-testid')).toBe('email-addresses-domain')
    wrapper.unmount()
  })

  it('hides the records chip without showRecords, and without domains', async () => {
    const hidden = await mountKit(EmailDomainSelector, { props: { domains, modelValue: domains[0], records: { 1: configured } } })
    expect(hidden.find('.record-configuration').exists()).toBe(false)
    hidden.unmount()

    const empty = await mountKit(EmailDomainSelector, { props: { domains: [], showRecords: true, modelValue: null } })
    expect(empty.find('.record-configuration').exists()).toBe(false)
    empty.unmount()
  })

  it('shows the skeleton in the chip with no selected domain or while the checks load', async () => {
    const noSelection = await mountKit(EmailDomainSelector, { props: { domains, showRecords: true, modelValue: null } })
    expect(noSelection.find('.record-configuration').exists()).toBe(true)
    expect(noSelection.findAll('.record-skeleton')).toHaveLength(2)
    noSelection.unmount()

    const checking = await mountKit(EmailDomainSelector, {
      props: { domains, showRecords: true, modelValue: domains[0], records: { 1: loading } },
    })
    expect(checking.findAll('.record-skeleton')).toHaveLength(2)
    checking.unmount()
  })

  it('shows configured in green and failed in red for each record type', async () => {
    const wrapper = await mountKit(EmailDomainSelector, {
      props: { domains, showRecords: true, modelValue: domains[0], records: { 1: failed } },
    })
    const spf = wrapper.get('.record-spf .record-label')
    const dkim = wrapper.get('.record-dkim .record-label')
    expect(spf.classes()).toContain('failed')
    expect(spf.text()).toContain('heading.hosting.emailAddress.emailDomain.record.failed')
    expect(dkim.classes()).toContain('configured')
    expect(dkim.text()).toContain('heading.hosting.emailAddress.emailDomain.record.configured')
    wrapper.unmount()
  })

  it('draws the record icon in the static grey from the style, not as a stroke literal', async () => {
    const wrapper = await mountKit(EmailDomainSelector, {
      props: { domains, showRecords: true, modelValue: domains[0], records: { 1: configured } },
    })
    const paths = wrapper.findAll('.record-icon path')
    expect(paths.length).toBeGreaterThan(0)
    for (const path of paths) {
      expect(path.attributes('stroke')).toBeUndefined()
    }
    expect(wrapper.get('.record-icon').html()).not.toContain('#797997')
    wrapper.unmount()
  })

  it('marks the selected domain with a dot when its records are not fully configured', async () => {
    const wrapper = await mountKit(EmailDomainSelector, {
      props: { domains, showRecords: true, modelValue: domains[0], records: { 1: failed, 2: configured } },
    })
    expect(wrapper.get('.v-field .select-main-item .select-dot').exists()).toBe(true)
    wrapper.unmount()

    const fine = await mountKit(EmailDomainSelector, {
      props: { domains, showRecords: true, modelValue: domains[1], records: { 1: failed, 2: configured } },
    })
    expect(fine.find('.select-dot').exists()).toBe(false)
    fine.unmount()
  })

  it('shows no dot without showRecords', async () => {
    const wrapper = await mountKit(EmailDomainSelector, {
      props: { domains, showRecords: false, modelValue: domains[0], records: { 1: failed } },
    })
    expect(wrapper.find('.select-dot').exists()).toBe(false)
    wrapper.unmount()
  })

  it('marks a menu item with a dot and keeps a loading item without one', async () => {
    host = document.createElement('div')
    document.body.append(host)
    const wrapper = await mountKit(EmailDomainSelector, {
      props: { domains, showRecords: true, modelValue: domains[1], records: { 1: loading, 2: failed } },
      attachTo: host,
    })
    await wrapper.get('.v-field').trigger('mousedown')
    await nextTick()
    await new Promise(resolve => setTimeout(resolve, 50))
    await nextTick()

    const items = [...document.body.querySelectorAll('.select-sub-item')]
    expect(items).toHaveLength(2)
    expect(items[0]!.querySelector('.select-dot')).toBeNull()
    expect(items[1]!.querySelector('.select-dot')).not.toBeNull()
    wrapper.unmount()
  })

  it('emits update:modelValue when a domain is picked', async () => {
    const wrapper = await mountKit(EmailDomainSelector, { props: { domains, modelValue: domains[0] } })
    wrapper.findComponent(VSelect).vm.$emit('update:modelValue', domains[1])
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([domains[1]])
    wrapper.unmount()
  })

  it('emits open-records when the chip is clicked', async () => {
    const wrapper = await mountKit(EmailDomainSelector, {
      props: { domains, showRecords: true, modelValue: domains[0], records: { 1: failed } },
    })
    await wrapper.get('.record-configuration').trigger('click')
    expect(wrapper.emitted('open-records')).toHaveLength(1)
    wrapper.unmount()
  })
})
