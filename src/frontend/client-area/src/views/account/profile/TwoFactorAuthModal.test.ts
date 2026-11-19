import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import { controlAfterLabel } from '@/test/field-shape'
import { mountKit } from '@/test/mount-kit'
import { activateTwoFactor } from './two-factor-flow'
import TwoFactorAuthModal from './TwoFactorAuthModal.vue'

vi.mock('./two-factor-flow', () => ({ activateTwoFactor: vi.fn() }))

async function mountModal () {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = await mountKit(TwoFactorAuthModal, { global: { plugins: [pinia] }, props: { codeQr: '', secretKey: 'SECRET' } })
  await flushPromises()
  return wrapper
}

describe('TwoFactorAuthModal code field (kit-form-fields)', () => {
  it('labels the code field with a help icon right above it', async () => {
    const wrapper = await mountModal()
    const root = wrapper.element.parentElement ?? wrapper.element
    const label = wrapper.get('[data-testid="account-2fa-code-label"]')

    expect(label.element.tagName).toBe('LABEL')
    expect(label.text()).toContain('form.label.code')
    expect(label.find('.v-icon').exists()).toBe(true)
    expect(controlAfterLabel(root, label.element, '[data-testid="account-2fa-code"]')).not.toBeNull()
    expect(wrapper.get('[data-testid="account-2fa-code"] input').attributes('placeholder')).toBe('form.placeholder.code')
    wrapper.unmount()
  })

  it('activates with the typed code on Enter', async () => {
    vi.mocked(activateTwoFactor).mockResolvedValue({ confirmed: false, codes: null })
    const wrapper = await mountModal()
    const input = wrapper.get('[data-testid="account-2fa-code"] input')

    await input.setValue('123456')
    await input.trigger('keydown.enter')
    await flushPromises()

    expect(activateTwoFactor).toHaveBeenCalledTimes(1)
    expect(vi.mocked(activateTwoFactor).mock.calls[0]![0]).toBe('123456')
    wrapper.unmount()
  })
})
