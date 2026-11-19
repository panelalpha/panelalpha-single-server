// Frame of My Account: the title, the page tab strip and the tab switch. Written on the hand-made frame,
// kept green on `PageFrame` (tabs).
import type * as SessionApi from '@/shared/session/session.api'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { fetchHome } from '@/shared/session/session.api'
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

describe('MyAccountView frame (kit-page-frame)', () => {
  it('renders the title, the page tab strip and opens on the user tab', async () => {
    const wrapper = await mountView()

    expect(wrapper.get('[data-testid="account-title"]').text()).toBe('heading.accountPage.title')
    expect(wrapper.find('.v-tabs--page').exists()).toBe(true)
    expect(wrapper.get('[data-testid="account-tab-user"]').text()).toBe('heading.accountPage.tab.user.title')
    expect(wrapper.get('[data-testid="account-tab-devices"]').text()).toBe('heading.accountPage.tab.device.title')
    expect(wrapper.get('.v-tab--selected').text()).toBe('heading.accountPage.tab.user.title')
    expect(wrapper.get('[data-testid="account-section-title"]').text()).toBe('heading.accountPage.tab.user.title')
    expect(wrapper.find('[data-testid="account-card"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('switches to the devices tab with its search', async () => {
    const wrapper = await mountView()

    await wrapper.get('[data-testid="account-tab-devices"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('.v-tab--selected').text()).toBe('heading.accountPage.tab.device.title')
    expect(wrapper.get('[data-testid="account-section-title-devices"]').text()).toBe('heading.accountPage.tab.device.title')
    expect(wrapper.find('[data-testid="account-search"]').exists()).toBe(true)
    wrapper.unmount()
  })
})
