import type { HostingService } from './hosting.types'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { useSessionStore } from '@/shared/session/session.store'
import { mountKit } from '@/test/mount-kit'
import { makeService } from './hosting.fixtures'
import { useHostingStore } from './hosting.store'
import HostingPagesSidebar from './HostingPagesSidebar.vue'

const Page = defineComponent({ render: () => h('div') })

// Mobile viewport: the tabs variant of the sidebar renders below the `lg` breakpoint (976 px).
const width = window.innerWidth

async function mountTabs (path: string, singleServer: boolean) {
  const pinia = createPinia()
  setActivePinia(pinia)
  useSessionStore().hydrateHome({ app: singleServer ? { single_server: { active: true } } : {} } as never)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/hosting/summary', component: Page },
      { path: '/hosting/usage', component: Page },
      { path: '/hosting/ftp', component: Page },
    ],
  })
  await router.push(path)
  await router.isReady()
  const service = makeService({ id: 1, privileges: ['hosting.manage_ftp'] })
  const wrapper = await mountKit(HostingPagesSidebar, {
    props: { services: [service], activeService: service },
    global: { plugins: [pinia, router] },
  })
  await flushPromises()
  return wrapper
}

describe('HostingPagesSidebar tabs', () => {
  beforeEach(() => {
    window.innerWidth = 500
  })

  afterEach(() => {
    window.innerWidth = width
  })

  it('selects the tab of the current route', async () => {
    const wrapper = await mountTabs('/hosting/summary', false)

    expect(wrapper.get('[data-testid="hosting-tab-summary"]').classes()).toContain('v-tab--selected')
    wrapper.unmount()
  })

  it('selects no tab on a route without its own tab (single-server FTP)', async () => {
    const wrapper = await mountTabs('/hosting/ftp', true)

    expect(wrapper.findAll('.v-tab--selected')).toHaveLength(0)
    wrapper.unmount()
  })
})

interface SidebarOptions {
  innerWidth: number
  singleServer?: boolean
  service?: HostingService
  dot?: boolean
}

async function mountSidebar (path: string, options: SidebarOptions) {
  window.innerWidth = options.innerWidth
  const pinia = createPinia()
  setActivePinia(pinia)
  useSessionStore().hydrateHome({ app: options.singleServer ? { single_server: { active: true } } : {} } as never)
  if (options.dot) {
    const hosting = useHostingStore()
    hosting.showEmailRecordConfiguration = true
    hosting.isEmailRecordsConfigured = false
  }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/hosting/:page', component: Page }],
  })
  await router.push(path)
  await router.isReady()
  const service = options.service ?? { ...makeService({ id: 1, privileges: ['hosting.manage_ftp', 'hosting.manage_email'] }), email_server_enabled: true } as HostingService
  // The plan selector shows from two services, so the default case has a second one.
  const others = options.service === undefined ? [makeService({ id: 2, domain: 'second.example.com' })] : []
  const wrapper = await mountKit(HostingPagesSidebar, {
    props: { services: [service, ...others], activeService: service },
    global: { plugins: [pinia, router] },
  })
  await flushPromises()
  return wrapper
}

describe('HostingPagesSidebar list and tabs (kit-pages-sidebar-advanced)', () => {
  beforeEach(() => {
    window.innerWidth = width
  })

  afterEach(() => {
    window.innerWidth = width
  })

  it('lista: selektor planu, grupy Manage i Email, kropka, aktywna z trasy', async () => {
    const wrapper = await mountSidebar('/hosting/summary', { innerWidth: 1500, dot: true })

    expect(wrapper.get('[data-testid="hosting-plan-selector"]').exists()).toBe(true)
    expect(wrapper.findAll('.v-list-subheader').map(item => item.text()))
      .toEqual(['heading.hosting.sidebar.manage.title', 'heading.hosting.sidebar.email.title'])
    expect(wrapper.findAll('.v-list-item').map(item => item.attributes('data-testid')))
      .toEqual(['hosting-sidebar-summary', 'hosting-sidebar-ftp', 'hosting-sidebar-email-addresses', 'hosting-sidebar-email-forwarders'])
    expect(wrapper.get('[data-testid="hosting-sidebar-email-addresses"]').find('[data-testid="hosting-sidebar-email-dot"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="hosting-sidebar-summary"]').classes()).toContain('v-list-item--active')
    expect(wrapper.get('[data-testid="hosting-sidebar-ftp"]').attributes('href')).toBe('/hosting/ftp')
    wrapper.unmount()
  })

  it('lista bez pozycji e-mail nie ma grupy Email', async () => {
    const wrapper = await mountSidebar('/hosting/summary', {
      innerWidth: 1500,
      service: makeService({ id: 1, privileges: ['hosting.manage_ftp'] }),
    })

    expect(wrapper.findAll('.v-list-subheader').map(item => item.text()))
      .toEqual(['heading.hosting.sidebar.manage.title'])
    expect(wrapper.find('[data-testid="hosting-sidebar-email-dot"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('zakładki: pozycje po kolei, kropka, selektor nad paskiem', async () => {
    const wrapper = await mountSidebar('/hosting/summary', { innerWidth: 500, dot: true })

    expect(wrapper.get('[data-testid="hosting-tabs"]').exists()).toBe(true)
    expect(wrapper.findAll('.v-tab').map(tab => tab.attributes('data-testid')))
      .toEqual(['hosting-tab-summary', 'hosting-tab-ftp', 'hosting-tab-email-addresses', 'hosting-tab-email-forwarders'])
    expect(wrapper.find('[data-testid="hosting-tab-email-dot"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="hosting-plan-selector"]').exists()).toBe(true)
    wrapper.unmount()
  })
})
