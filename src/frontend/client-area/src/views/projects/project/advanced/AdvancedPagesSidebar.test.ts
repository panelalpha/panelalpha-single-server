import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createInstancePrivilegeMethods } from '@/entities/privileges/instance-privilege-methods'
import { mountKit } from '@/test/mount-kit'
import AdvancedPagesSidebar from './AdvancedPagesSidebar.vue'

const Page = defineComponent({ render: () => h('div') })

// The list is shown from 1200 px (`!lgAndDown`), the tabs below it: 1500 and 500 px pick the two layouts.
const width = window.innerWidth

function instance () {
  return {
    id: 7,
    type: 'wordpress',
    plan_settings: {},
    cdn_enabled: false,
    service_has_dns_cloudflare: false,
    domain_has_dns_zone: false,
    hasWpCloudServer: () => false,
    isContainer: false,
    ...createInstancePrivilegeMethods('wordpress'),
    privileges: [],
  } as never
}

async function mountSidebar (path: string, innerWidth: number) {
  window.innerWidth = innerWidth
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/projects/7/advanced/:page', component: Page },
      { path: '/instances/7/advanced/:page', component: Page },
    ],
  })
  await router.push(path)
  await router.isReady()
  const wrapper = await mountKit(AdvancedPagesSidebar, {
    props: { instance: instance() },
    global: { plugins: [pinia, router] },
  })
  await flushPromises()
  return wrapper
}

describe('AdvancedPagesSidebar', () => {
  beforeEach(() => {
    window.innerWidth = width
  })

  afterEach(() => {
    window.innerWidth = width
  })

  it('lista od 1200 px: pozycje z linkami, aktywna z trasy', async () => {
    const wrapper = await mountSidebar('/projects/7/advanced/security', 1500)

    expect(wrapper.get('[data-testid="advanced-sidebar"]').exists()).toBe(true)
    expect(wrapper.findAll('.v-list-item').map(item => item.attributes('data-testid')))
      .toEqual(['advanced-sidebar-details', 'advanced-sidebar-security'])
    expect(wrapper.get('[data-testid="advanced-sidebar-details"]').attributes('href')).toBe('/projects/7/advanced/details')
    expect(wrapper.get('[data-testid="advanced-sidebar-details"]').text()).toBe('heading.instance.advanced.siteDetails.title')
    expect(wrapper.get('[data-testid="advanced-sidebar-security"]').classes()).toContain('v-list-item--active')
    expect(wrapper.get('[data-testid="advanced-sidebar-details"]').classes()).not.toContain('v-list-item--active')
    expect(wrapper.findAll('.v-tab')).toHaveLength(0)
    wrapper.unmount()
  })

  it('zakładki poniżej 1200 px: linki i zaznaczenie z trasy', async () => {
    const wrapper = await mountSidebar('/instances/7/advanced/details', 500)

    expect(wrapper.findAll('.v-tab').map(tab => tab.attributes('data-testid')))
      .toEqual(['advanced-tab-details', 'advanced-tab-security'])
    expect(wrapper.get('[data-testid="advanced-tab-details"]').attributes('href')).toBe('/instances/7/advanced/details')
    expect(wrapper.get('[data-testid="advanced-tab-details"]').classes()).toContain('v-tab--selected')
    expect(wrapper.get('[data-testid="advanced-tab-security"]').classes()).not.toContain('v-tab--selected')
    expect(wrapper.findAll('.v-list-item')).toHaveLength(0)
    wrapper.unmount()
  })
})
