import { describe, expect, it } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import RecoveryCodeBox from './RecoveryCodeBox.vue'

const BASE = { codes: ['ABCD-1234'], alert: 'Save it', confirmLabel: 'I saved it' }

describe('RecoveryCodeBox', () => {
  it('renders the code with one Copy button, the error warning without role and the confirm checkbox in its label', async () => {
    const wrapper = await mountKit(RecoveryCodeBox, { props: BASE })

    const box = wrapper.get('.recovery-code-box')
    expect(box.text()).toContain('ABCD-1234')
    expect(box.findAll('button')).toHaveLength(1)
    const alert = wrapper.get('.recovery-alert')
    expect(alert.text()).toContain('Save it')
    expect(alert.attributes('role')).toBeUndefined()
    expect(wrapper.get('h4').text()).toBe('message.confirmAction')
    const label = wrapper.get('label.checkbox-label')
    expect(label.find('input[type="checkbox"]').exists()).toBe(true)
    expect(label.text()).toContain('I saved it')
    wrapper.unmount()
  })

  it('lists every code of the set with its own Copy button', async () => {
    const codes = ['heJ5lsHLa8-2EiOgqxV33', 'UuKiYx6qhZ-u0cWHdT0gT', 'pKwBRTd7JB-XANu7AzIMI']
    const wrapper = await mountKit(RecoveryCodeBox, { props: { ...BASE, codes, testids: { copy: 't-copy' } } })

    const box = wrapper.get('.recovery-code-box')
    expect(box.findAll('.recovery-code-row').map(row => row.text())).toEqual(codes)
    expect(box.findAll('button')).toHaveLength(codes.length)
    expect(wrapper.findAll('[data-testid="t-copy"]')).toHaveLength(codes.length)
    wrapper.unmount()
  })

  it('puts the test ids on the parts and the status role on the warning', async () => {
    const wrapper = await mountKit(RecoveryCodeBox, {
      props: {
        ...BASE,
        alertRole: 'status',
        testids: { code: 't-code', copy: 't-copy', alert: 't-alert', confirm: 't-confirm', confirmLabel: 't-label' },
      },
    })

    expect(wrapper.get('[data-testid="t-code"]').text()).toContain('ABCD-1234')
    expect(wrapper.get('[data-testid="t-code"] [data-testid="t-copy"]').element.tagName).toBe('BUTTON')
    expect(wrapper.get('[data-testid="t-alert"]').attributes('role')).toBe('status')
    expect(wrapper.get('[data-testid="t-label"] [data-testid="t-confirm"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('v-model: ticking the checkbox emits true', async () => {
    const wrapper = await mountKit(RecoveryCodeBox, { props: BASE })

    await wrapper.get('input[type="checkbox"]').setValue(true)
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([true])
    wrapper.unmount()
  })
})
