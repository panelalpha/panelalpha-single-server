import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import * as resellerApi from '@/views/reseller/reseller.api'
import { useSessionStore } from '@/shared/session/session.store'
import { mountKit } from '@/test/mount-kit'
import LogsView from './logs/LogsView.vue'
import ResellerAreaView from './ResellerAreaView.vue'

vi.mock('@/views/reseller/reseller.api', () => ({
  listResellerInstancesLogs: vi.fn(),
}))

const Child = defineComponent({ render: () => h('div', { 'data-testid': 'child-page' }) })
const Root = defineComponent({ render: () => h(RouterView) })

async function mountFrame (path: string, home?: Record<string, unknown>) {
  const pinia = createPinia()
  setActivePinia(pinia)
  if (home) {
    useSessionStore().hydrateHome(home as never)
  }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/reseller-area/',
        component: ResellerAreaView,
        redirect: '/reseller-area/users',
        children: [
          { path: '/reseller-area/users', component: Child },
          { path: '/reseller-area/logs', component: LogsView },
        ],
      },
    ],
  })
  await router.push(path)
  await router.isReady()
  const wrapper = await mountKit(Root, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return { wrapper, router }
}

describe('ResellerAreaView', () => {
  it('redirects the frame path to the users page', async () => {
    const { wrapper, router } = await mountFrame('/reseller-area/')

    expect(router.currentRoute.value.path).toBe('/reseller-area/users')
    wrapper.unmount()
  })

  it('renders the title, the five sidebar items (tabs below the lg breakpoint, the jsdom width) with links and the routed page', async () => {
    const { wrapper } = await mountFrame('/reseller-area/users')

    expect(wrapper.get('[data-testid="reseller-title"]').text()).toBe('heading.navbar.tab.resellerArea')
    expect(wrapper.find('[data-testid="reseller-sidebar"]').exists()).toBe(true)
    const keys = ['users', 'branding', 'email-settings', 'logs', 'api']
    for (const key of keys) {
      const item = wrapper.get(`[data-testid="reseller-tab-${key}"]`)
      expect(item.attributes('href')).toBe(`/reseller-area/${key}`)
    }
    expect(wrapper.find('[data-testid="child-page"]').exists()).toBe(true)
    wrapper.unmount()
  })

  // Legacy has no guard here: the frame renders for a user without `reseller_settings` (the navbar hides the entry, the URL still works). A future guard must change this test on purpose.
  it('renders the frame for a user without reseller_settings (no guard, as legacy)', async () => {
    const { wrapper } = await mountFrame('/reseller-area/users', { user: { reseller_settings: null } })

    expect(wrapper.get('[data-testid="reseller-title"]').text()).toBe('heading.navbar.tab.resellerArea')
    expect(wrapper.find('[data-testid="reseller-sidebar"]').exists()).toBe(true)
    wrapper.unmount()
  })

  // Legacy has no guard on the logs page either: a user without `reseller_settings` gets the frame, the Logs tab and the page with its API call.
  it('renders the logs page for a user without reseller_settings (no guard, as legacy)', async () => {
    vi.mocked(resellerApi.listResellerInstancesLogs).mockResolvedValue({ items: [], total: 0 })

    const { wrapper } = await mountFrame('/reseller-area/logs', { user: { reseller_settings: null } })

    expect(wrapper.get('[data-testid="reseller-title"]').text()).toBe('heading.navbar.tab.resellerArea')
    expect(wrapper.find('[data-testid="reseller-sidebar"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="reseller-tab-logs"]').attributes('href')).toBe('/reseller-area/logs')
    expect(wrapper.get('[data-testid="reseller-logs-title"]').text()).toBe('heading.reseller.page.logs')
    expect(resellerApi.listResellerInstancesLogs).toHaveBeenCalledTimes(1)
    expect(resellerApi.listResellerInstancesLogs).toHaveBeenCalledWith({
      page: 1,
      perPage: 50,
      sortBy: 'date',
      sortDir: 'desc',
      searchTerm: '',
    })
    wrapper.unmount()
  })
})
