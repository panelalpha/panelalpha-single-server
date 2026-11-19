import type { VueWrapper } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { h } from 'vue'
import OnboardingStepFooter from '@/views/onboarding/ui/OnboardingStepFooter.vue'
import StepIndicator from '@/shared/ui/step-indicator/StepIndicator.vue'
import { mountKit } from '@/test/mount-kit'

const base = { step: 2, maxSteps: 4, backLabel: 'button.cancel', nextLabel: 'button.continue' }

function buttons (wrapper: VueWrapper): HTMLButtonElement[] {
  return [...(wrapper.element as HTMLElement).querySelectorAll<HTMLButtonElement>('button')]
}

describe('OnboardingStepFooter', () => {
  it('shows the step dots, the grey back button and the next button with its arrow', async () => {
    const wrapper = await mountKit(OnboardingStepFooter, { props: base })
    expect(wrapper.classes()).toEqual(expect.arrayContaining(['v-card-actions', 'onboarding-step-footer', 'pt-8']))
    expect(wrapper.findComponent(StepIndicator).props()).toMatchObject({ currentStep: 2, maxSteps: 4 })

    const [back, next] = buttons(wrapper)
    expect(back!.textContent).toContain('button.cancel')
    expect(back!.querySelector('.text-gray-darken-1')).not.toBeNull()
    expect(next!.textContent).toContain('button.continue')
    expect(next!.querySelector('.v-icon')).not.toBeNull()
    wrapper.unmount()
  })

  it('emits back and next', async () => {
    const wrapper = await mountKit(OnboardingStepFooter, { props: base })
    const [back, next] = buttons(wrapper)
    back!.click()
    next!.click()
    expect(wrapper.emitted('back')).toHaveLength(1)
    expect(wrapper.emitted('next')).toHaveLength(1)
    wrapper.unmount()
  })

  it('passes loading and the disabled states to the buttons', async () => {
    const wrapper = await mountKit(OnboardingStepFooter, { props: { ...base, loading: true, backDisabled: true } })
    expect(buttons(wrapper)[0]!.disabled).toBe(true)
    expect(buttons(wrapper)[1]!.classList.contains('v-btn--loading')).toBe(true)

    await wrapper.setProps({ loading: false, backDisabled: false, nextDisabled: true })
    expect(buttons(wrapper)[0]!.disabled).toBe(false)
    expect(buttons(wrapper)[1]!.disabled).toBe(true)
    wrapper.unmount()
  })

  it('drops the arrow on request and lets the slot replace the next content', async () => {
    const plain = await mountKit(OnboardingStepFooter, { props: { ...base, nextArrow: false } })
    expect(buttons(plain)[1]!.querySelector('.v-icon')).toBeNull()
    plain.unmount()

    const slotted = await mountKit(OnboardingStepFooter, {
      props: { step: 1, maxSteps: 3, backLabel: 'button.back' },
      slots: { next: () => h('span', { 'data-testid': 'custom' }, 'custom') },
    })
    expect(buttons(slotted)[1]!.querySelector('[data-testid="custom"]')).not.toBeNull()
    slotted.unmount()
  })
})
