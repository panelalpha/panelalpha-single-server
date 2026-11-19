import type * as SessionApi from '@/shared/session/session.api'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { fetchHome } from '@/shared/session/session.api'
import { controlAfterLabel } from '@/test/field-shape'
import { mountKit } from '@/test/mount-kit'
import MyAccountView from './MyAccountView.vue'

vi.mock('@/shared/session/session.api', async importOriginal => ({
  ...await importOriginal<typeof SessionApi>(),
  fetchHome: vi.fn(),
}))

const Page = defineComponent({ render: () => h('div') })

async function mountView () {
  vi.mocked(fetchHome).mockResolvedValue({
    app: {},
    user: {
      first_name: 'Ada',
      last_name: 'Lovelace',
      company_name: 'ACME',
      email: 'ada@example.com',
      language: 'en',
      new_device_detection: 'email',
      two_factor_auth_enabled: false,
    },
  } as never)
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/account', component: Page }] })
  await router.push('/account')
  await router.isReady()
  const wrapper = await mountKit(MyAccountView, { global: { plugins: [pinia, router], stubs: { DevicesTable: true } } })
  await flushPromises()
  return wrapper
}

describe('MyAccountView fields (kit-form-fields)', () => {
  it('shows each label right above its control', async () => {
    const wrapper = await mountView()
    const root = wrapper.element.parentElement ?? wrapper.element
    const pairs: Array<[string, string, string]> = [
      ['account-label-first_name', 'form.label.firstName', '[data-testid="account-field-first_name"]'],
      ['account-label-last_name', 'form.label.lastName', '[data-testid="account-field-last_name"]'],
      ['account-label-company_name', 'form.label.companyName', '[data-testid="account-field-company_name"]'],
      ['account-label-language', 'form.label.language', '[data-testid="account-field-language"]'],
      ['account-label-email', 'form.label.emailAddress', '[data-testid="account-field-email"]'],
      ['account-label-two-factor', 'form.label.twoFactorAuth', '[data-testid="account-two-factor-switch"]'],
      ['account-label-new-device-detection', 'form.label.deviceDetection', '[data-testid="account-field-new-device-detection"]'],
    ]
    for (const [testid, text, selector] of pairs) {
      const label = wrapper.get(`[data-testid="${testid}"]`)
      expect(label.element.tagName).toBe('LABEL')
      expect(label.text()).toBe(text)
      expect(controlAfterLabel(root, label.element, selector)).not.toBeNull()
    }
    wrapper.unmount()
  })

  it('fills the fields from GET /home and keeps the email readonly', async () => {
    const wrapper = await mountView()

    expect((wrapper.get('[data-testid="account-field-first_name"] input').element as HTMLInputElement).value).toBe('Ada')
    const email = wrapper.get('[data-testid="account-field-email"] input')
    expect((email.element as HTMLInputElement).value).toBe('ada@example.com')
    expect(email.attributes('readonly')).toBeDefined()
    wrapper.unmount()
  })
})
