import i18next from 'i18next'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { defineComponent } from 'vue'
import { mountKit } from '@/test/mount-kit'
import TransferDomainSteps from './TransferDomainSteps.vue'

const record = { type: 'TXT', name: '_pa.example.org', content: 'verify-me' }

function mountSteps (props: Record<string, unknown> = {}, attrs: Record<string, unknown> = {}) {
  return mountKit(TransferDomainSteps, { props: { domain: 'example.org', record, transferEnabled: true, ...props }, attrs })
}

describe('TransferDomainSteps', () => {
  beforeAll(async () => {
    // mountKit initialises i18next once; resources added after that stay (as in PendingSslIndicator.test.ts).
    const init = await mountKit(defineComponent({ render: () => null }))
    init.unmount()
    i18next.addResource('en', 'translation', 'heading.onboarding.transferDomain.subtitle', 'Transfer {domain} here')
    i18next.addResource('en', 'translation', 'heading.onboarding.transferDomain.message.possible.step2WithHost', 'Add {recordType} {recordHost} {domain}')
  })

  afterAll(() => {
    // Back to the empty bundle mountKit starts with (t(key) === key).
    i18next.removeResourceBundle('en', 'translation')
    i18next.addResourceBundle('en', 'translation', {})
  })

  it('renders one card text root with the look of the pattern', async () => {
    const wrapper = await mountSteps()
    expect(wrapper.classes()).toEqual(expect.arrayContaining(['v-card-text', 'px-10', 'pt-8']))
    expect(wrapper.get('h6').classes()).toEqual(['p-2', 'font-weight-light'])
    expect(wrapper.get('div.p-2.mt-2').classes()).toEqual(['p-2', 'mt-2', 'text-justify', 'text-darken-1'])
    expect(wrapper.findAll('p')[1]?.classes()).toEqual(['mb-3', 'text-darken-1'])
  })

  it('fills the domain and the record into the copy slots', async () => {
    const wrapper = await mountSteps()
    expect(wrapper.get('h6').text()).toBe('Transfer example.org here')
    expect(wrapper.findAll('ol > li')).toHaveLength(4)
    expect(wrapper.findAll('ol > li')[1]?.text()).toBe('Add TXT @ _pa.example.org')
    expect(wrapper.get('.value').text()).toBe('verify-me')
  })

  it('shows no record box without record content', async () => {
    const wrapper = await mountSteps({ record: { type: 'TXT', name: '_pa.example.org' } })
    expect(wrapper.find('[data-testid="long-value-box"]').exists()).toBe(false)
    expect(wrapper.find('ol').exists()).toBe(true)
  })

  it('shows the impossible copy without steps when transfer is off', async () => {
    const wrapper = await mountSteps({ transferEnabled: false })
    expect(wrapper.find('ol').exists()).toBe(false)
    expect(wrapper.find('[data-testid="long-value-box"]').exists()).toBe(false)
    expect(wrapper.get('h6').text()).toBe('Transfer example.org here')
    expect(wrapper.get('p.p-3.mt-2').text()).toBe('heading.onboarding.transferDomain.message.impossible')
  })

  it('shows the error above the content in both branches', async () => {
    for (const transferEnabled of [true, false]) {
      const wrapper = await mountSteps({ transferEnabled, errorMessage: 'Boom' })
      expect(wrapper.get('[data-testid="transfer-error"]').text()).toBe('Boom')
      wrapper.unmount()
    }
    const quiet = await mountSteps({ errorMessage: '' })
    expect(quiet.find('[data-testid="transfer-error"]').exists()).toBe(false)
  })

  it('passes the consumer attributes to the root', async () => {
    const wrapper = await mountSteps({}, { 'data-testid': 'set-domain-transfer' })
    expect(wrapper.attributes('data-testid')).toBe('set-domain-transfer')
  })
})
