import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import { deactivateTwoFactor } from './two-factor-flow'
import TwoFactorAuthDisableConfirmation from './TwoFactorAuthDisableConfirmation.vue'

vi.mock('./two-factor-flow', () => ({ deactivateTwoFactor: vi.fn() }))

// The card that disables 2FA before and after it moves to `BasicModal`.
async function mountModal () {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = await mountKit(TwoFactorAuthDisableConfirmation, { global: { plugins: [pinia] } })
  await flushPromises()
  return wrapper
}

describe('TwoFactorAuthDisableConfirmation', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('shows the title and the info, and emits disabled after a successful Confirm', async () => {
    vi.mocked(deactivateTwoFactor).mockResolvedValue(true)
    const wrapper = await mountModal()

    expect(wrapper.get('[data-testid="account-2fa-disable-title"]').text()).toContain('heading.accountPage.modal.disable2fa.title')
    expect(wrapper.get('[data-testid="account-2fa-disable-info"]').text()).toContain('heading.accountPage.modal.disable2fa.info')
    await wrapper.get('[data-testid="account-2fa-disable-confirm"]').trigger('click')
    await flushPromises()

    expect(deactivateTwoFactor).toHaveBeenCalledTimes(1)
    expect(wrapper.emitted('disabled')).toHaveLength(1)
    wrapper.unmount()
  })

  it('does not emit disabled when the request fails', async () => {
    vi.mocked(deactivateTwoFactor).mockResolvedValue(false)
    const wrapper = await mountModal()

    await wrapper.get('[data-testid="account-2fa-disable-confirm"]').trigger('click')
    await flushPromises()

    expect(wrapper.emitted('disabled')).toBeUndefined()
    wrapper.unmount()
  })

  it('emits modal-close from Back', async () => {
    const wrapper = await mountModal()

    await wrapper.get('[data-testid="account-2fa-disable-back"]').trigger('click')

    expect(wrapper.emitted('modal-close')).toHaveLength(1)
    wrapper.unmount()
  })

  it('emits modal-close from the X of the kit card (kit-dialog-account-reseller)', async () => {
    const wrapper = await mountModal()

    await wrapper.get('.modal-close-button').trigger('click')

    expect(wrapper.emitted('modal-close')).toHaveLength(1)
    wrapper.unmount()
  })
})
