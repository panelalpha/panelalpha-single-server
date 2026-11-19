import { describe, expect, it } from 'vitest'
import { h } from 'vue'
import OnboardingCard from '@/shared/ui/modal/OnboardingCard.vue'
import { mountKit } from '@/test/mount-kit'

const content = () => h('div', { 'data-testid': 'content' }, 'content')

function closeOf (root: Element): HTMLButtonElement {
  const close = root.querySelector<HTMLButtonElement>('button.close-model')
  expect(close).not.toBeNull()
  return close!
}

describe('OnboardingCard', () => {
  it('renders the 560px onboarding card with the X above the content', async () => {
    const wrapper = await mountKit(OnboardingCard, { slots: { default: content as never } })
    const root = wrapper.element as HTMLElement
    expect(root.classList.contains('v-card')).toBe(true)
    expect(root.classList.contains('onboarding-modal')).toBe(true)
    expect(root.classList.contains('card-width-560')).toBe(true)

    const close = closeOf(root)
    expect(close.getAttribute('aria-label')).toBe('button.close')
    expect(close.classList.contains('ml-auto')).toBe(false)
    const body = root.querySelector('[data-testid="content"]')!
    expect(close.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    wrapper.unmount()
  })

  it('takes the width of the wider steps', async () => {
    const wrapper = await mountKit(OnboardingCard, { props: { width: 724 } })
    expect(wrapper.classes()).toContain('card-width-724')
    expect(wrapper.classes()).not.toContain('card-width-560')
    wrapper.unmount()
  })

  it('emits close from the X, and the X waits while closeDisabled', async () => {
    const wrapper = await mountKit(OnboardingCard, {})
    closeOf(wrapper.element as HTMLElement).click()
    expect(wrapper.emitted('close')).toHaveLength(1)

    await wrapper.setProps({ closeDisabled: true })
    const close = closeOf(wrapper.element as HTMLElement)
    expect(close.disabled).toBe(true)
    close.click()
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })
})
