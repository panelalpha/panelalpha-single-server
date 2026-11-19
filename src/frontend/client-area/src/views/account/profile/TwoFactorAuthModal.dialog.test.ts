import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchTwoFactorRecoveryCodes } from '@/shared/session/session.api'
import { mountKit } from '@/test/mount-kit'
import { activateTwoFactor } from './two-factor-flow'
import TwoFactorAuthModal from './TwoFactorAuthModal.vue'

vi.mock('./two-factor-flow', () => ({ activateTwoFactor: vi.fn() }))
vi.mock('@/shared/session/session.api', () => ({ fetchTwoFactorRecoveryCodes: vi.fn() }))

// The two steps of the 2FA card before and after it moves to `BasicModal`.
async function mountModal () {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = await mountKit(TwoFactorAuthModal, {
    props: { codeQr: '<svg></svg>', secretKey: 'SECRET' },
    global: { plugins: [pinia] },
  })
  await flushPromises()
  return wrapper
}

describe('TwoFactorAuthModal card', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('shows step 1 with the title and the secret, and enables Confirm at 6 characters', async () => {
    const wrapper = await mountModal()

    expect(wrapper.get('[data-testid="account-2fa-title"]').text()).toContain('heading.accountPage.modal.2fa.firstStep.title')
    expect(wrapper.get('[data-testid="account-2fa-secret"]').text()).toBe('SECRET')
    expect(wrapper.get('[data-testid="account-2fa-confirm"]').attributes('disabled')).toBeDefined()
    await wrapper.get('[data-testid="account-2fa-code"] input').setValue('123456')
    expect(wrapper.get('[data-testid="account-2fa-confirm"]').attributes('disabled')).toBeUndefined()
    wrapper.unmount()
  })

  it('emits modal-close from Back and from the X', async () => {
    const wrapper = await mountModal()

    await wrapper.get('[data-testid="account-2fa-back"]').trigger('click')
    await wrapper.get('.v-card-title button').trigger('click')

    expect(wrapper.emitted('modal-close')).toHaveLength(2)
    wrapper.unmount()
  })

  it('confirms the code with Enter in the field', async () => {
    vi.mocked(activateTwoFactor).mockResolvedValue({ confirmed: false, codes: null })
    const wrapper = await mountModal()

    const input = wrapper.get('[data-testid="account-2fa-code"] input')
    await input.setValue('123456')
    await input.trigger('keydown', { key: 'Enter' })
    await flushPromises()

    expect(activateTwoFactor).toHaveBeenCalledWith('123456', expect.anything(), expect.any(Function))
    wrapper.unmount()
  })

  it('moves to step 2 after Confirm and closes from Done once the checkbox is ticked', async () => {
    vi.mocked(activateTwoFactor).mockResolvedValue({ confirmed: true, codes: ['RC-1'] })
    const wrapper = await mountModal()

    await wrapper.get('[data-testid="account-2fa-code"] input').setValue('123456')
    await wrapper.get('[data-testid="account-2fa-confirm"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="account-2fa-recovery"]').text()).toContain('RC-1')
    expect(wrapper.get('[data-testid="account-2fa-done"]').attributes('disabled')).toBeDefined()
    await wrapper.get('[data-testid="account-2fa-checkbox"] input').setValue(true)
    await flushPromises()
    expect(wrapper.get('[data-testid="account-2fa-done"]').attributes('disabled')).toBeUndefined()
    await wrapper.get('[data-testid="account-2fa-done"]').trigger('click')

    expect(wrapper.emitted('modal-close')).toHaveLength(1)
    wrapper.unmount()
  })

  it.each([
    ['no code at all', { confirmed: true, codes: [] }],
    ['a failed load', { confirmed: true, codes: null }],
  ])('stays on step 1 and says how to get the codes after %s', async (_case, activation) => {
    vi.mocked(activateTwoFactor).mockResolvedValue(activation)
    const wrapper = await mountModal()

    await wrapper.get('[data-testid="account-2fa-code"] input').setValue('123456')
    await wrapper.get('[data-testid="account-2fa-confirm"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="account-2fa-recovery"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="account-2fa-done"]').exists()).toBe(false)
    const error = wrapper.get('[data-testid="account-2fa-recovery-error"]')
    expect(error.attributes('role')).toBe('alert')
    expect(error.text()).toContain('message.account.2fa.recoveryCodesFailed')
    expect(wrapper.text()).not.toContain('werwersdf')
    wrapper.unmount()
  })

  it('lets the user retry the load and then shows every code of the real answer', async () => {
    vi.mocked(activateTwoFactor).mockResolvedValue({ confirmed: true, codes: null })
    vi.mocked(fetchTwoFactorRecoveryCodes).mockResolvedValue(['RC-1', 'RC-2'])
    const wrapper = await mountModal()

    await wrapper.get('[data-testid="account-2fa-code"] input').setValue('123456')
    await wrapper.get('[data-testid="account-2fa-confirm"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="account-2fa-recovery-retry"]').trigger('click')
    await flushPromises()

    expect(fetchTwoFactorRecoveryCodes).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-testid="account-2fa-recovery-error"]').exists()).toBe(false)
    const box = wrapper.get('[data-testid="account-2fa-recovery"]')
    expect(box.text()).toContain('RC-1')
    expect(box.text()).toContain('RC-2')
    wrapper.unmount()
  })

  it('keeps the error when the retry answers no code', async () => {
    vi.mocked(activateTwoFactor).mockResolvedValue({ confirmed: true, codes: [] })
    vi.mocked(fetchTwoFactorRecoveryCodes).mockResolvedValue([])
    const wrapper = await mountModal()

    await wrapper.get('[data-testid="account-2fa-code"] input').setValue('123456')
    await wrapper.get('[data-testid="account-2fa-confirm"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="account-2fa-recovery-retry"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="account-2fa-recovery-error"]').text()).toContain('message.account.2fa.recoveryCodesFailed')
    expect(wrapper.find('[data-testid="account-2fa-recovery"]').exists()).toBe(false)
    wrapper.unmount()
  })
})

describe('TwoFactorAuthModal recovery block (kit-auth-card)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('step 2: every code with its own Copy button, a warning without role, the confirm heading and the checkbox in its label', async () => {
    const codes = ['RC-1', 'RC-2', 'RC-3', 'RC-4', 'RC-5', 'RC-6', 'RC-7', 'RC-8']
    vi.mocked(activateTwoFactor).mockResolvedValue({ confirmed: true, codes })
    const wrapper = await mountModal()

    await wrapper.get('[data-testid="account-2fa-code"] input').setValue('123456')
    await wrapper.get('[data-testid="account-2fa-confirm"]').trigger('click')
    await flushPromises()

    const box = wrapper.get('[data-testid="account-2fa-recovery"]')
    expect(box.text()).toContain('RC-1')
    expect(codes.every(code => box.text().includes(code))).toBe(true)
    expect(box.findAll('button')).toHaveLength(codes.length)
    const alert = wrapper.get('[data-testid="account-2fa-alert"]')
    expect(alert.attributes('role')).toBeUndefined()
    expect(alert.text()).toContain('heading.accountPage.modal.2fa.secondStep.alert')
    expect(wrapper.findAll('h4').map(h => h.text())).toContain('message.confirmAction')
    const label = wrapper.get('[data-testid="account-2fa-checkbox-label"]')
    expect(label.find('[data-testid="account-2fa-checkbox"]').exists()).toBe(true)
    expect(label.text()).toContain('heading.accountPage.modal.2fa.secondStep.confirmationCheckbox')
    wrapper.unmount()
  })
})
