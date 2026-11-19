import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { mountKit } from '@/test/mount-kit'
import ResellerSidebar from './ResellerSidebar.vue'

const Page = defineComponent({ render: () => h('div') })
const keys = ['users', 'branding', 'email-settings', 'logs', 'api']

const width = window.innerWidth

async function mountSidebar (path: string, innerWidth: number) {
  window.innerWidth = innerWidth
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/reseller-area/:page', component: Page }],
  })
  await router.push(path)
  await router.isReady()
  const wrapper = await mountKit(ResellerSidebar, {
    global: { plugins: [router] },
  })
  await flushPromises()
  return wrapper
}

describe('ResellerSidebar', () => {
  beforeEach(() => {
    window.innerWidth = width
  })

  afterEach(() => {
    window.innerWidth = width
  })

  it('lista od 1200 px: pozycje z linkami, aktywna z trasy', async () => {
    const wrapper = await mountSidebar('/reseller-area/branding', 1500)

    expect(wrapper.findAll('.v-list-item').map(item => item.attributes('data-testid')))
      .toEqual(keys.map(key => `reseller-sidebar-${key}`))
    for (const key of keys) {
      expect(wrapper.get(`[data-testid="reseller-sidebar-${key}"]`).attributes('href')).toBe(`/reseller-area/${key}`)
    }
    expect(wrapper.get('[data-testid="reseller-sidebar-branding"]').classes()).toContain('v-list-item--active')
    expect(wrapper.get('[data-testid="reseller-sidebar-users"]').classes()).not.toContain('v-list-item--active')
    wrapper.unmount()
  })

  it('zakładki poniżej 1200 px: pozycje po kolei, zaznaczenie z trasy', async () => {
    const wrapper = await mountSidebar('/reseller-area/branding', 500)

    expect(wrapper.get('[data-testid="reseller-tabs"]').exists()).toBe(true)
    expect(wrapper.findAll('.v-tab').map(tab => tab.attributes('data-testid')))
      .toEqual(keys.map(key => `reseller-tab-${key}`))
    expect(wrapper.get('[data-testid="reseller-tab-branding"]').classes()).toContain('v-tab--selected')
    wrapper.unmount()
  })
})
