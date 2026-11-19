// Buttons of the wizard footer: written on the raw `v-btn`, kept green on `AppButton`. Previous and next,
// the form submit instead of `next`, disabled, loading and the hidden buttons.
import { describe, expect, it } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import WizardFooter from './WizardFooter.vue'

describe('WizardFooter', () => {
  it('emits previous and next from the two buttons with the default labels', async () => {
    const wrapper = await mountKit(WizardFooter)
    const next = wrapper.get('[data-testid="wizard-next"]')
    expect(wrapper.get('[data-testid="wizard-previous"]').text()).toBe('Previous Step')
    expect(next.text()).toBe('Continue')
    expect(next.attributes('type')).toBe('button')
    await wrapper.get('[data-testid="wizard-previous"]').trigger('click')
    await next.trigger('click')
    expect(wrapper.emitted('previous')).toHaveLength(1)
    expect(wrapper.emitted('next')).toHaveLength(1)
  })

  it('submits the form of the step instead of emitting next', async () => {
    const wrapper = await mountKit(WizardFooter, { props: { form: 'step-form', nextLabel: 'Save', previousLabel: 'Back' } })
    const next = wrapper.get('[data-testid="wizard-next"]')
    expect(next.attributes('type')).toBe('submit')
    expect(next.attributes('form')).toBe('step-form')
    expect(next.text()).toBe('Save')
    expect(wrapper.get('[data-testid="wizard-previous"]').text()).toBe('Back')
    await next.trigger('click')
    expect(wrapper.emitted('next')).toBeUndefined()
  })

  it('disables the main button and shows its loader', async () => {
    const disabled = await mountKit(WizardFooter, { props: { disabled: true } })
    expect(disabled.get('[data-testid="wizard-next"]').attributes('disabled')).toBeDefined()
    expect(disabled.get('[data-testid="wizard-previous"]').attributes('disabled')).toBeUndefined()
    const loading = await mountKit(WizardFooter, { props: { loading: true } })
    expect(loading.get('[data-testid="wizard-next"]').classes()).toContain('v-btn--loading')
  })

  it('leaves out the buttons on request', async () => {
    const wrapper = await mountKit(WizardFooter, { props: { hidePrevious: true, hideNext: true } })
    expect(wrapper.find('[data-testid="wizard-previous"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="wizard-next"]').exists()).toBe(false)
  })
})
