import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import { confirmPassword, revealProjectSecret } from './secret.api'
import SecretValue from './SecretValue.vue'

vi.mock('./secret.api', () => ({
  revealProjectSecret: vi.fn(),
  confirmPassword: vi.fn(),
  apiErrorStatus: (error: unknown) => (error as { response?: { status?: number } })?.response?.status,
}))

const reveal = vi.mocked(revealProjectSecret)
const confirm = vi.mocked(confirmPassword)

async function mountSecret (secret = 'DB_PASSWORD') {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = await mountKit(SecretValue, { props: { instanceId: 7, secret }, global: { plugins: [pinia] } })
  await flushPromises()
  return wrapper
}

/** A 423 of the password confirmation as the axios interceptor hands it over. */
function confirmationRequired (): unknown {
  return { response: { status: 423 } }
}

describe('SecretValue', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('shows the mask only and asks the backend nothing on the first load', async () => {
    const wrapper = await mountSecret()

    expect(wrapper.get('[data-testid="secret-DB_PASSWORD"] .secret-value__text').text()).toBe('********')
    expect(wrapper.get('[data-testid="secret-DB_PASSWORD-toggle"]').text()).toBe('button.secret.show')
    expect(reveal).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('reveals the value on Show and masks it again on Hide', async () => {
    reveal.mockResolvedValue({ secret: 'DB_PASSWORD', value: 'db-secret-1' })
    const wrapper = await mountSecret()

    await wrapper.get('[data-testid="secret-DB_PASSWORD-toggle"]').trigger('click')
    await flushPromises()

    expect(reveal).toHaveBeenCalledWith(7, 'DB_PASSWORD')
    expect(wrapper.get('[data-testid="secret-DB_PASSWORD"] .secret-value__text').text()).toBe('db-secret-1')
    expect(wrapper.get('[data-testid="secret-DB_PASSWORD-toggle"]').text()).toBe('button.secret.hide')

    await wrapper.get('[data-testid="secret-DB_PASSWORD-toggle"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="secret-DB_PASSWORD"] .secret-value__text').text()).toBe('********')
    expect(reveal).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('asks for the password after a 423, then reveals the value', async () => {
    reveal.mockRejectedValueOnce(confirmationRequired()).mockResolvedValueOnce({ secret: 'AUTH_KEY', value: 'auth-secret-2' })
    confirm.mockResolvedValue()
    const wrapper = await mountSecret('AUTH_KEY')

    await wrapper.get('[data-testid="secret-AUTH_KEY-toggle"]').trigger('click')
    await flushPromises()

    // The window has passed: the value stays masked and the confirmation opens.
    expect(wrapper.get('[data-testid="secret-AUTH_KEY"] .secret-value__text').text()).toBe('********')
    const modal = wrapper.get('[data-testid="secret-password-modal"]')
    expect(modal.text()).toContain('heading.secret.confirm.title')

    await wrapper.get('[data-testid="secret-password-modal"] input').setValue('Secret-Password1!')
    await wrapper.get('[data-testid="secret-password-confirm"]').trigger('click')
    await flushPromises()

    expect(confirm).toHaveBeenCalledWith('Secret-Password1!')
    expect(reveal).toHaveBeenCalledTimes(2)
    expect(wrapper.get('[data-testid="secret-AUTH_KEY"] .secret-value__text').text()).toBe('auth-secret-2')
    wrapper.unmount()
  })
})
